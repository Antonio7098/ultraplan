# Source Analysis: victoriametrics

## Workflow / Agent Orchestration

### Source Info

| Field | Value |
|-------|-------|
| Name | victoriametrics |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/victoriametrics` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

VictoriaMetrics is a time-series database (Prometheus/InfluxDB alternative) primarily focused on metrics storage and querying. The study examined vmalert (alerting component) and related packages for workflow/orchestration patterns. The system does NOT implement general-purpose workflow orchestration. Instead, it provides a periodic rule evaluation model with limited state management suitable for alerting and recording rules, but lacking the graph execution, DAG-based routing, checkpointing, or compensation mechanisms that characterize true workflow orchestration systems.

## Rating

**2/10** — Poor implementation for workflow/orchestration use cases. The system lacks DAG execution, step-level retry, checkpointing for mid-step interruption, parallel branch coordination, and compensation/rollback logic. It is a simple periodic evaluation system, not a workflow engine.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Workflow Definition | YAML-based config with Groups and Rules (alerting/recording) | `app/vmalert/config/config.go:25-55` |
| Execution Model | Ticker-based periodic evaluation via `time.NewTicker(g.Interval)` | `app/vmalert/rule/group.go:425-426` |
| No DAG Execution | Simple `execConcurrently` loops through rules sequentially | `app/vmalert/rule/group.go:731-757` |
| Alert State | In-memory `alerts map[uint64]*notifier.Alert` | `app/vmalert/rule/alerting.go:47` |
| State Restore | Query `ALERTS_FOR_STATE` series to restore alert state | `app/vmalert/rule/alerting.go:820-821` |
| Concurrency Control | Semaphore pattern via `sem := make(chan struct{}, concurrency)` | `app/vmalert/rule/group.go:742` |
| Cancellation | Context-based via `evalCancel context.CancelFunc` | `app/vmalert/rule/group.go:418` |
| Replay Mode | Batch replay of historical data with retry attempts | `app/vmalert/replay.go:17-33` |
| Config Reload | SIGHUP handler for hot config reload | `app/vmalert/main.go:173` |
| No Compensation | No rollback or compensation logic found | N/A |

## Answers to Dimension Questions

### 1. How are multi-step workflows defined, stored, and executed?

**Definition**: YAML-based configuration with `Group` and `Rule` structures (`app/vmalert/config/config.go:25-55`). A `Group` contains multiple `Rule` entities with an evaluation interval. Each `Rule` is either an alerting rule or a recording rule.

**Storage**: Configuration is parsed from YAML files via `config.Parse()` (`app/vmalert/config/config.go:252-265`). Groups are stored in-memory in the `manager.groups` map (`app/vmalert/manager.go:29`).

**Execution**: Groups are started via `Group.Start()` (`app/vmalert/rule/group.go:344-489`) which creates a ticker-based loop. At each interval, `eval()` is called which invokes `e.execConcurrently()` to evaluate rules. The execution model is a **simple loop over rules**, not a DAG. Rules are evaluated via querier queries and results are pushed to remote write or sent to notifiers.

### 2. What happens when a workflow is interrupted mid-step — can it resume?

**No true resumability for mid-step interruption.** If a group is interrupted via `g.doneCh` or context cancellation (`app/vmalert/rule/group.go:441-446`), the evaluation loop terminates. The `evalCancel()` function (`app/vmalert/rule/group.go:418`) can interrupt in-flight rule evaluations via context cancellation (`app/vmalert/rule/group.go:301-308`).

**Limited alert state restoration exists**: Alerting rules with `for > 0` can restore their state by querying previously written `ALERTS_FOR_STATE` time series (`app/vmalert/rule/alerting.go:795-857`). This restores *alert state* but NOT mid-evaluation execution state. The restore happens only once at startup after the first evaluation (`app/vmalert/rule/group.go:432-437`).

### 3. How are parallel workflow branches coordinated and joined?

**No parallel branch/join model exists.** The system does not implement DAG-based execution with branching and joining. What exists is **simple concurrency** within a group via a semaphore pattern:

```go
// app/vmalert/rule/group.go:742-756
sem := make(chan struct{}, concurrency)
wg := sync.WaitGroup{}
for i := range rules {
    rule := rules[i]
    sem <- struct{}{}
    wg.Go(func() {
        res <- e.exec(ctx, rule, ts, resolveDuration, limit)
        <-sem
    })
}
wg.Wait()
```

All rules in a group execute independently with no data dependencies or fan-out/fan-in patterns. There is no concept of parallel branches that must be joined.

### 4. How does the system handle workflow-level timeouts and cancellations?

**Cancellation**: Context-based cancellation is used. The `evalCancel` function (`app/vmalert/rule/group.go:418`) cancels the evaluation context on group update or close. In `exec()`, errors due to `context.Canceled` are explicitly handled and treated as non-errors (`app/vmalert/rule/alerting.go:460-461`).

**Timeouts**: No explicit timeout per rule execution was found. There is no `context.WithTimeout` for individual rule evaluations. If a query hangs, it runs until the context is cancelled.

**Group-level timeout**: Not implemented.

### 5. Is there compensation logic for partial workflow failures?

**No compensation or rollback logic exists.** If a workflow fails mid-execution:
- The error is logged (`app/vmalert/rule/group.go:406`)
- The group continues to the next evaluation cycle
- No compensating transactions or Saga patterns are implemented
- Failed rule executions do not trigger any rollback of previously completed rules

In the `exec()` method, errors are collected but do not affect subsequent rule executions within the same evaluation cycle (`app/vmalert/rule/group.go:780-793`).

## Architectural Decisions

1. **Ticker-based periodic evaluation**: Groups use `time.NewTicker(g.Interval)` (`app/vmalert/rule/group.go:425`) for simple, predictable evaluation cadence. This is appropriate for monitoring workloads but not for event-driven workflows.

2. **In-memory state with optional time-series persistence**: Alert state is kept in-memory (`alerts map`) and optionally written to time-series (`ALERTS_FOR_STATE`). This trades off durability for simplicity and performance.

3. **YAML-based configuration DSL**: Rules are defined in YAML files parsed by `config.Parse()`. This provides a familiar, declarative interface for Prometheus-style alerting rules.

4. **Concurrency via semaphore**: Groups limit concurrent rule evaluations with a simple buffered channel semaphore (`app/vmalert/rule/group.go:742`). This prevents overload while allowing parallelism.

5. **Hot config reload via SIGHUP**: Configuration can be reloaded without restart (`app/vmalert/main.go:173`). Groups are gracefully updated via `updateCh` channel with `InterruptEval()` to cancel in-flight evaluations.

## Notable Patterns

- **Rule interface pattern**: `Rule` interface (`app/vmalert/rule/rule.go:20-38`) defines `exec()`, `execRange()`, `updateWith()` for polymorphism between AlertingRule and RecordingRule.

- **State entry pattern**: `ruleState` struct (`app/vmalert/rule/rule.go:42-119`) maintains a circular buffer of execution history (`StateEntry`) for debugging and health monitoring.

- **Hot update pattern**: Groups support non-disruptive updates via `updateCh` channel (`app/vmalert/rule/group.go:447-467`). Old group evaluation is interrupted before applying new configuration.

- **Alert lifecycle pattern**: Alerts transition through states (Inactive -> Pending -> Firing) tracked in `ar.alerts` map with `For` duration gate (`app/vmalert/rule/alerting.go:582-590`).

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| In-memory alert state | Fast access but lost on restart; mitigated by ALERTS_FOR_STATE persistence |
| Simple ticker-based execution | Predictable but no event-driven triggers; cannot react to data changes mid-interval |
| No DAG model | Simplicity but cannot express dependent multi-step workflows |
| No step-level retry | Simplicity but vulnerable to transient datasource failures |
| No compensation/Saga | Simplicity but cannot rollback partial workflow completions |
| Hot config reload | Complexity but zero-downtime updates |

## Failure Modes / Edge Cases

1. **Datasource query timeout/failure**: Rule evaluation fails, error is logged, group continues to next evaluation cycle. No retry within the same cycle.

2. **Remote write failure**: Errors are collected in `errG` (`app/vmalert/rule/alerting.go:780-793`) but execution continues. Data may be lost if remote write fails persistently.

3. **Context cancellation during evaluation**: `context.Canceled` errors are silently ignored (`app/vmalert/rule/alerting.go:460-461`), treating them as expected during shutdown.

4. **Memory pressure from alert accumulation**: Alerts are only cleaned up on evaluation cycles (`app/vmalert/rule/alerting.go:504-509`). If evaluation stops, alerts accumulate indefinitely.

5. **Stale alert state**: If `ALERTS_FOR_STATE` series are compacted or deleted, alert state cannot be restored on restart.

6. **Concurrent group updates**: If `updateCh` receives multiple updates before evaluation loop processes them, updates are serialized (`app/vmalert/rule/group.go:364-372`).

## Future Considerations

1. **Add DAG-based execution**: If complex multi-step workflows are needed, a proper DAG execution engine (like Temporal, Airflow, or Cadence) would be required.

2. **Implement step-level retry with backoff**: Current retry only exists in replay mode. Production evaluation could benefit from configurable retry with exponential backoff.

3. **Add checkpointing for mid-step resumption**: Store execution progress to enable resumption after interruption at the step level.

4. **Implement Saga pattern for compensation**: Add compensating transactions for workflows that span multiple external systems.

5. **Add parallel branch/join support**: Fan-out/fan-in patterns for dependent rule evaluation.

## Questions / Gaps

| Question | Answer |
|----------|--------|
| Is there a graph/DAG execution engine? | **No**. Simple linear rule execution within groups. |
| Does the system support step-level retry? | **No** in normal mode; only in replay mode (`replayRuleRetryAttempts: 5`). |
| Is there checkpointing for resumption after interruption? | **Partial**. Alert state can be restored from `ALERTS_FOR_STATE` series, but not mid-evaluation state. |
| Are parallel branches with joins supported? | **No**. Only simple concurrency (semaphore pattern). |
| Is there compensation/rollback for partial failures? | **No**. |
| What is the workflow definition model? | YAML-based Prometheus-style rule configuration, not a general workflow DSL. |

---

Generated by `dimensions/12-workflow-agent-orchestration.md` against `victoriametrics`.
