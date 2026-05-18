# Repo Analysis: sdk-go

## Workflow Composition and Observability

### Repo Info

| Field | Value |
|-------|-------|
| Name | sdk-go |
| Path | `/home/antonioborgerees/coding/opencode-wrap-study/repos/sdk-go` |
| Group | `go` |
| Language / Stack | Go |
| Analyzed | 2026-05-17 |

## Summary

The sdk-go is the official Temporal Go SDK. It provides a comprehensive workflow runtime with strong separation between workflow code and the underlying Temporal server infrastructure. The SDK implements workflow primitives via a coroutine-based dispatcher model, with structured command-based scheduling for activities, child workflows, timers, and signals. Observability is achieved through an external metrics handler interface, replay-aware logging, and a query system for workflow metadata.

## Rating

**8/10** — Clear workflow primitives with useful state and progress events. The SDK provides strong observability primitives including a metrics handler interface, structured logging, and queryable workflow metadata. The command-based execution model creates a natural audit trail. Activity and workflow execution metadata is well-captured. However, the SDK does not itself generate user-facing dashboards or reports — that responsibility is deferred to external tools like the Temporal UI.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Workflow primitives | `ExecuteActivity`, `ExecuteLocalActivity`, `ExecuteChildWorkflow` functions with context-based options | `workflow/workflow.go:259-335` |
| Coroutine dispatcher | `dispatcherImpl` with `ExecuteUntilAllBlocked`, `NewCoroutine`, `IsDone` | `internal/internal_workflow.go:163-179, 1264-1321` |
| WorkflowOptions | Contains task queue, timeouts, retry policy, search attributes, memo, parent close policy | `internal/internal_workflow.go:184-219` |
| WorkflowInfo | Contains namespace, workflowID, runID, workflow type, attempt, task queue, search attributes, memo | `internal/internal_public.go:40-68` |
| Commands helper | `commandsHelper` tracks scheduled activities, timers, child workflows, signals | `internal/internal_event_handlers.go:104-174` |
| Metrics handler interface | `Handler` interface with `Counter`, `Gauge`, `Timer` and `WithTags` | `internal/common/metrics/handler.go:12-26` |
| Replay-aware metrics | `replayAwareHandler` suppresses metrics during replay | `internal/common/metrics/handler.go:77-121` |
| Metric constants | `WorkflowCompletedCounter`, `WorkflowEndToEndLatency`, `ActivityExecutionLatency` | `internal/common/metrics/constants.go:7-67` |
| Logger interface | `Logger` interface with `Debug`, `Info`, `Warn`, `Error` | `log/logger.go:5-10` |
| Replay logger | `ReplayLogger` wraps user logger and respects `isReplay` flag | `internal/log/replay_logger.go` |
| Workflow metadata query | `getWorkflowMetadata` returns query definitions, signal definitions, update definitions | `internal/internal_workflow.go:1657-1706` |
| Update protocol | `updateProtocol` with Accept/Reject/Complete callbacks and state machine | `internal/internal_update.go:79-200` |
| Local activity task | `localActivityTask` with attempt, retry policy, scheduled time, expire time | `internal/internal_event_handlers.go:176-192` |
| Session info | `SessionInfo` with SessionID, HostName, SessionState | `workflow/session.go:7-35` |
| Activity options | `ActivityOptions` with timeouts, retry policy, heartbeat timeout, priority | `workflow/activity_options.go:10-110` |
| Child workflow options | `ChildWorkflowOptions` with execution timeout, task timeout, parent close policy | `internal/internal_workflow.go:137` |
| Workflow task handler | `workflowTaskHandlerImpl` processes workflow tasks with sticky cache | `internal/internal_task_handlers.go:124-144, 800-863` |
| History iterator | `historyEventIteratorImpl` pages through workflow history events | `internal/internal_workflow_client.go:193-245` |
| Context propagators | `ContextPropagator` interface for propagating context across workflow boundary | `internal/internal_workflow.go:1583` |
| Search attributes | `SearchAttributes` type with typed key support | `temporal/search_attributes.go` |
| Retry policy | `RetryPolicy` with backoff, max attempts, retryable error types | `temporal/retry_policy.go` |

## Answers to Protocol Questions

### 1. What workflow primitive is used, and how much does it know about the runtime?

The SDK uses a **coroutine-based dispatcher** (`dispatcherImpl` at `internal/internal_workflow.go:163-179`) as its core workflow primitive. Workflow code runs inside coroutines (green threads) managed by this dispatcher, which executes them deterministically until all are blocked.

The dispatcher (`ExecuteUntilAllBlocked` at lines 1264-1321) runs in a single thread, processing events from workflow history in order. Each coroutine has its own `Context` which carries deadline, cancellation, and workflow-specific values.

The workflow primitive knows:
- The `WorkflowInfo` containing namespace, workflowID, runID, workflowType, attempt, taskQueueName, searchAttributes, memo, and current task build ID (`internal/internal_public.go:40-68`)
- The `WorkflowOptions` with execution parameters (timeouts, retry policy, search attributes, memo, parent close policy) (`internal/internal_workflow.go:184-219`)
- The `WorkflowEnvironment` providing access to activity scheduling, timer creation, signal handling, query handling, and update handling

The dispatcher coordinates execution but does not know about the underlying Temporal server infrastructure beyond what is passed through the WorkflowInfo and WorkflowEnvironment interfaces.

### 2. How are steps scheduled, parallelized, retried, and summarized?

**Scheduling**: Activities, child workflows, timers, signals, and nexus operations are scheduled via the `commandsHelper` in `workflowEnvironmentImpl` (`internal/internal_event_handlers.go:104-174`). Each scheduled item is assigned a sequence number and has a `handled` flag. The workflow code receives a `Future` for each scheduled operation, allowing non-blocking coordination.

**Parallelization**: The `Selector` pattern (`selectorImpl` at `internal/internal_workflow.go:140-1556`) allows waiting on multiple channels or futures concurrently. The dispatcher processes coroutines in deterministic order, yielding when blocked and unblocking when conditions are met.

**Retry**: Activities support `RetryPolicy` with backoff calculation (`internal/internal_retry.go`). The retry state is tracked in `scheduledActivity` which records the attempt number and retry policy. Local activities retry via the `laRetryCh` channel in the workflow task processing loop (`internal/internal_task_handlers.go:1000-1016`).

**Summarization**: When a workflow task completes, the command state machine processes all commands and records their results in history. The SDK records `WorkflowTaskCompleted` events with binary checksum and SDK metadata including lang used flags. Activity and local activity completion events include attempt numbers and execution latency.

### 3. How are structured runtime events projected into user-facing progress?

The SDK does **not** directly project events into user-facing dashboards. Instead, it provides observability primitives that external tools consume:

- **Metrics**: The `metrics.Handler` interface (`internal/common/metrics/handler.go:12-26`) emits counters, gauges, and timers for workflow/activity completion, latency, task scheduling, and errors. The `replayAwareHandler` (`internal/common/metrics/handler.go:77-121`) suppresses metrics during replay to avoid double-counting.

- **Logging**: The `log.Logger` interface (`log/logger.go:5-10`) supports Debug/Info/Warn/Error with structured keyvals. A `ReplayLogger` (`internal/log/replay_logger.go`) respects the `isReplay` flag to suppress logs during replay. The SDK logs activity execution (`internal/internal_event_handlers.go:807-809`), timer creation (`internal/internal_event_handlers.go:889-891`), child workflow execution (`internal/internal_event_handlers.go:634-636`), and cancellation requests.

- **Queries**: The `__temporal_workflow_metadata` query (`internal/internal_workflow.go:601-612`) returns workflow definition metadata including query/signal/update definitions. The `__temporal_stack_trace` query returns the workflow's current stack trace. Custom queries can be registered via `SetQueryHandler` (`workflow/workflow.go:604-614`).

- **Workflow metadata**: `getWorkflowMetadata` (`internal/internal_workflow.go:1657-1706`) returns a structured `WorkflowMetadata` message containing workflow type, all registered queries/signals/updates with descriptions.

The Temporal server records all history events, and the Temporal UI consumes these to present progress to users. The SDK's role is limited to emitting structured data (metrics, logs, queryable state) that the server stores.

### 4. What metadata is captured for every run, step, provider, model, and artifact?

**Run-level metadata** (`WorkflowInfo` at `internal/internal_public.go:40-68`):
- Namespace, WorkflowID, RunID, WorkflowType.Name, Attempt, TaskQueue
- SearchAttributes (custom indexed fields), Memo (unindexed), ParentWorkflowID, RootWorkflowID
- FirstExecutionRunID, ContinuedExecutionRunID, cron string
- `WorkflowExecutionTimeout`, `WorkflowRunTimeout`, `WorkflowTaskTimeout`
- `currentTaskBuildID` (set during task processing)

**Step-level metadata**:
- For activities: `ActivityType.Name`, `ActivityID`, attempt number, retry policy, scheduled time, start-to-close timeout, heartbeat timeout, priority
- For child workflows: `WorkflowType.Name`, `WorkflowID`, parent close policy, `WaitForCancellation`, attempt
- For timers: `TimerID`, start-to-fire timeout
- For signals: signal name, target workflowID/runID
- For updates: update name, update ID, validation function result

**Provider/model**: The SDK captures `WorkerBuildID` or `WorkerDeploymentVersion` in task completion events (`internal/internal_task_handlers.go:296-299`). The `binaryChecksum` records the workflow code version.

**Artifacts**: Side effects and mutable side effects are recorded with sequence IDs and their payloads stored in history. Activity results and child workflow results are stored as payloads in history events.

### 5. How are logs and durable state organized so tools can inspect active and historical runs?

**Durable state** is stored in Temporal server's history. Each workflow execution produces a sequence of history events:
- `WorkflowExecutionStarted` with input, search attributes, memo
- `WorkflowTaskScheduled`, `WorkflowTaskStarted`, `WorkflowTaskCompleted`
- `ActivityTaskScheduled`, `ActivityTaskStarted`, `ActivityTaskCompleted` (or failed/timed out/canceled)
- `TimerStarted`, `TimerFired`
- `ChildWorkflowExecutionStarted`, `ChildWorkflowExecutionCompleted`
- `SignalReceived`
- `WorkflowExecutionCompleted` with result

The history is **append-only** and fully durable. Replay reconstructs workflow state by re-processing events in order.

**Logging** is not persisted in Temporal's durable store. Logs are emitted to the `log.Logger` interface, which the user configures. The SDK includes contextual fields:
- `tagWorkflowType`, `tagWorkflowID`, `tagRunID`, `tagAttempt` in `internal/log/default_logger.go`
- The `ReplayLogger` (`internal/log/replay_logger.go`) adds a `isReplay` flag to suppress duplicate logs during replay

**Query interface**: The `__temporal_stack_trace` query allows inspecting active coroutine stack traces. The `__temporal_workflow_metadata` query returns registered handlers. Custom queries can be registered to return arbitrary workflow state.

**Metrics**: The `metrics.Handler` interface emits time-series data to external systems (e.g., Prometheus, Grafana). The SDK does not store metrics durably itself.

### 6. What should remain in the runtime wrapper versus UltraPlan-specific orchestration?

**Runtime wrapper (sdk-go)**:
- Coroutine dispatcher and deterministic execution
- Workflow code execution (activity/child workflow/timer/signal scheduling)
- Replay logic and determinism verification
- `WorkflowInfo` and `WorkflowOptions` management
- Activity/child workflow retry handling
- Context propagation across workflow boundaries
- Update protocol handling with Accept/Reject/Complete state machine
- Session management (creation, completion, heartbeat tracking)
- Metrics emission (counters, timers, gauges)
- Logging with replay awareness
- Query handling (stack trace, metadata, custom queries)
- Local activity execution within workflow task

**UltraPlan-specific (deferred to external tooling)**:
- User-facing dashboards and run progress visualization
- Workflow execution chain visualization (ContinuedAsNew, cron, retried runs)
- Cost/token accounting (requires external integration with LLM providers)
- Report generation and synthesis combining multiple runs
- Agent-specific metadata (model, provider, temperature, prompts)
- Multi-step study/sprint plan orchestration across multiple workflows
- Alerting and notification based on workflow state

## Architectural Decisions

1. **Dispatcher-as-primitive**: The SDK uses a custom coroutine dispatcher rather than native Go goroutines. This enables deterministic replay since the dispatcher controls scheduling order and can re-run the exact same schedule sequence during replay (`internal/internal_workflow.go:1264-1321`).

2. **Command-based execution**: All external operations (activity, timer, signal, child workflow) are recorded as commands in history. This creates a complete audit trail and enables Temporal server to handle failures and retries transparently (`internal/internal_event_handlers.go:104-174`).

3. **Context-based configuration**: Workflow options are passed via Go SDK's `Context` mechanism using `WithActivityOptions`, `WithChildOptions`, etc. This allows per-invocation configuration without changing the workflow function signature (`workflow/activity_options.go:21-23`).

4. **External metrics handler**: The SDK defines a minimal `metrics.Handler` interface and does not implement internal metrics storage. This allows users to integrate with any metrics system (Prometheus, StatsD, etc.) via the contrib package (`internal/common/metrics/handler.go:12-26`).

5. **Replay-aware logging**: The `ReplayLogger` wraps user loggers and consults an `isReplay` boolean pointer to suppress logs during replay, avoiding duplicate entries (`internal/log/replay_logger.go`).

6. **Update protocol as first-class primitive**: Workflow updates are implemented as a state machine (`updateProtocol` at `internal/internal_update.go:79-108`) with formal stages (New → RequestInitiated → Accepted → Completed), allowing Temporal server to sequence and deliver update outcomes reliably.

## Notable Patterns

**Coroutine-based concurrency**: Workflow code runs in "coroutines" (green threads) managed by `dispatcherImpl`. Each coroutine has a `coroutineState` with `aboutToBlock` and `unblock` channels for cooperative multitasking. This enables deterministic replay.

**Future/Channel pattern**: All async operations return `Future` handles. Operations like `ExecuteActivity` return a `Future` that becomes ready when the activity completes. The `Selector` pattern allows waiting on multiple futures/channels.

**Deterministic map iteration**: `DeterministicKeys` and `DeterministicKeysFunc` in `workflow/workflow.go:868-878` sort map keys before iteration to ensure deterministic behavior across replays.

**Context-aware data conversion**: The `DataConverter` can implement `ContextAware` interface to receive `WorkflowSerializationContext` for namespace/workflowID-specific encoding (`workflow/context.go:15-22`).

**Versioning via GetVersion**: The `GetVersion` function (`workflow/workflow.go:559-561`) records version markers in history, enabling the SDK to handle backwards-incompatible workflow changes via replay.

## Tradeoffs

1. **No native multi-step orchestration**: The SDK provides low-level primitives (activities, child workflows, timers, signals, updates). UltraPlan must build higher-level orchestration logic on top. There is no built-in DAG orchestration or step dependency management.

2. **Activity retry vs. workflow retry separation**: Activities retry independently via `RetryPolicy`, but workflow failures trigger workflow-level retry (replaying from the beginning). This can cause confusion when an activity fails but the workflow retries the entire history.

3. **Eager activity execution**: The SDK supports eager activity execution where activities start on the same worker before being scheduled by Temporal server (`internal/internal_eager_activity.go`). This improves latency but adds complexity to the execution model.

4. **No built-in cost accounting**: The SDK does not track LLM tokens, costs, or provider information. UltraPlan must implement this via custom activity context propagation or side effects.

5. **Sticky cache tradeoff**: The sticky cache (`workflowExecutionContextImpl` at `internal/internal_task_handlers.go:100-121`) speeds up subsequent workflow tasks by caching workflow state. However, this creates a dependency on a specific worker, which can cause issues during worker restarts.

6. **Coroutine vs. goroutine**: Using coroutines instead of native goroutines enables deterministic replay but introduces a custom scheduling mechanism. Workflow code cannot use native Go concurrency patterns (channels, select, goroutines) — they must use the SDK's `workflow.Channel`, `workflow.Selector`, and `workflow.Go`.

## Failure Modes / Edge Cases

1. **Non-deterministic workflow code**: If workflow code uses native Go map iteration or time.Now(), the dispatcher may replay differently. The SDK provides `DeterministicKeys` and `GetTime` to mitigate, but user errors can cause non-determinism panics.

2. **Deadlock detection timeout**: By default, if a workflow task runs longer than 1 second without yielding, the dispatcher treats it as a potential deadlock (`internal/internal_workflow.go:1153-1168`). This can trigger false positives for long-running activities.

3. **Workflow task timeout**: If a workflow task takes longer than `WorkflowTaskTimeout`, Temporal server fails the task and may dispatch it to a different worker, losing the sticky cache benefits.

4. **Activity heartbeat during cancellation**: The SDK only delivers cancellation to an activity when it heartbeats (`internal/internal_activity.go`). If an activity does not heartbeat, cancellation may be delayed up to the heartbeat timeout or never delivered.

5. **Child workflow orphan on parent exit**: If a parent workflow exits while a child is running, the `ParentClosePolicy` determines behavior. The SDK respects this policy but the actual handling depends on Temporal server.

6. **Update handler interruption**: When a workflow exits while update handlers are running, the SDK logs a warning (TMPRL1102) and can either abandon or warn-and-abandon the handlers (`internal/internal_workflow.go:716-721`).

7. **Replay of code with changes**: If workflow code has changed since a run started, replay may fail with a "binary checksum" mismatch. The SDK records the binary checksum during `WorkflowTaskCompleted` and compares on replay.

## Future Considerations

1. **Enhanced observability primitives**: The SDK could provide richer built-in support for operation-level metadata (LLM provider, model, tokens, cost) via activity/child workflow context rather than requiring UltraPlan to implement custom solutions.

2. **Built-in step orchestration**: Adding a `workflow.Step` primitive with built-in DAG support would reduce the implementation burden for UltraPlan-style tools.

3. **Structured metadata propagation**: The current context propagators mechanism (`ContextPropagator` interface) is flexible but low-level. Higher-level support for structured metadata (study ID, experiment ID, agent ID) would help UltraPlan correlate runs.

4. **Async completion for long-running activities**: The current activity heartbeat mechanism is the only way to handle long-running activities. Adding native async completion support would improve the model for LLM interactions.

5. **Query performance**: The current query mechanism requires replay to the current state. For large histories, this could be slow. Cached query handlers or snapshot-based queries could improve performance.

## Questions / Gaps

1. **No built-in token/cost tracking**: The SDK provides no primitives for capturing LLM tokens, cost, or provider information. UltraPlan must implement this via custom activity context propagation.

2. **No structured report generation**: The SDK does not generate synthesized reports from workflow runs. UltraPlan must build this on top using history queries and custom activities.

3. **No multi-workflow orchestration primitives**: There is no built-in support for orchestrating across multiple workflows (study plans, sprint plans). UltraPlan must implement this logic itself.

4. **Limited visibility into internal state**: While `WorkflowInfo` exposes some runtime state, the internal `workflowEnvironmentImpl` state (commands helper, side effects, mutable side effects) is not queryable from outside the workflow.

5. **No built-in evidence linking**: The SDK records activity results and child workflow results as payloads, but does not provide a mechanism for linking evidence (e.g., which LLM call produced which output) across workflow runs.

---

Generated by `04-workflow-composition-and-observability.md` against `sdk-go`.