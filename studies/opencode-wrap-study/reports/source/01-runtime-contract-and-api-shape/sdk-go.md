# Repo Analysis: sdk-go

## Runtime Contract and API Shape

### Repo Info

| Field | Value |
|-------|-------|
| Name | sdk-go |
| Path | `/home/antonioborgerees/coding/opencode-wrap-study/repos/sdk-go` |
| Group | `sdk-go` |
| Language / Stack | Go |
| Analyzed | 2026-05-17 |

## Summary

The sdk-go repo is the **Temporal Go SDK**, not an OpenCode wrapper SDK. It is a production-grade SDK for authoring workflows and activities that execute against the Temporal service. The public API surfaces a `client.Client` interface, a `worker.Worker` interface, and a `workflow` package with context-based session semantics. The SDK does not wrap OpenCode — it wraps Temporal Server via gRPC, using protobuf-generated clients and a custom data converter pipeline. No evidence of OpenCode, Codex, Claude Code, or ACP was found in this repository.

## Rating

**3/10** — The API is concrete and well-structured for its runtime (Temporal), but it is tightly coupled to Temporal-specific concepts: task queues, workflow tasks, activity heartbeats, `WorkflowRun`, `SessionInfo`, deployments, and versioning schemes. There is no abstraction layer that could support a second runtime without a full redesign. The SDK is not a general-purpose agent runtime wrapper — it is a Temporal-specific implementation.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Public Client interface | `Client` interface with `ExecuteWorkflow`, `SignalWorkflow`, `QueryWorkflow`, `UpdateWorkflow` | `client/client.go:995-1535` |
| WorkflowRun abstraction | `WorkflowRun` type with `Get`, `GetRunID`, `GetWorkflowID` methods | `client/client.go:255-256` |
| Worker interface | `Worker` interface with `Start`, `Run`, `Stop` | `worker/worker.go:26-52` |
| Workflow context | `workflow.Context`, `workflow.ExecuteActivity`, `workflow.ExecuteChildWorkflow` | `workflow/workflow.go:259-335` |
| Session abstraction | `SessionInfo`, `CreateSession`, `CompleteSession` | `workflow/session.go:7-144` |
| Data converter | `converter.DataConverter` interface with `ToPayloads`, `FromPayloads` | `converter/data_converter.go:1-50` |
| Activity options | `ExecuteActivityOptions` struct with timeouts, retry policy, task queue | `internal/internal_activity.go:40-58` |
| Start workflow options | `StartWorkflowOptions` with ID, TaskQueue, timeouts | `client/client.go:231` |
| Workflow execution result | `WorkflowExecutionDescription` with run metadata | `client/client.go:268` |
| Event history | `HistoryEventIterator` for polling workflow history | `client/client.go:1117` |
| Update handle | `WorkflowUpdateHandle` with `Get` for polling update outcomes | `client/client.go:653-655` |
| Activity handle | `ActivityHandle` for standalone activity control | `client/client.go:963` |
| Nexus client | `NexusClient` interface for external operation execution | `workflow/workflow.go:188-208` |

## Answers to Protocol Questions

### 1. What is the core abstraction: runtime, provider, session, turn, workflow, task, or something else?

**Workflow and Activity** are the core abstractions. The SDK distinguishes between:

- **Workflow**: A Go function that executes with a `workflow.Context`, receiving history events and emitting commands. Entities: `WorkflowRun`, `WorkflowExecution`, `WorkflowInfo`, `ContinueAsNewError`.
- **Activity**: A `context.Context`-aware function with timeouts and heartbeats. Entities: `ActivityHandle`, `ActivityInfo`, `ExecuteActivityOptions`.
- **Session**: A correlated set of activity executions on the same worker, created via `CreateSession` and scoped to a task queue (`workflow/session.go:104-135`).

The "runtime" is implicitly the Temporal server. There is no `Runtime` interface — instead, `client.Client` connects to the server and `worker.Worker` registers handlers.

### 2. What is the minimal caller-facing API needed to start, send, stream, stop, and inspect a run?

**Start**: `client.Client.ExecuteWorkflow(ctx, options, workflowFunc, args...)` → `WorkflowRun` (`client/client.go:1025`)

**Send** (signals): `client.Client.SignalWorkflow(ctx, workflowID, runID, signalName, arg)` (`client/client.go:1054`)

**Stream** (history events): `client.Client.GetWorkflowHistory(ctx, workflowID, runID, isLongPoll, filterType)` → `HistoryEventIterator` (`client/client.go:1117`)

**Stop** (cancel/terminate): `client.Client.CancelWorkflow(ctx, workflowID, runID)` and `TerminateWorkflow` (`client/client.go:1085-1097`)

**Inspect**: `client.Client.DescribeWorkflow(ctx, workflowID, runID)` → `WorkflowExecutionDescription` (`client/client.go:1362`); also `QueryWorkflow` for custom query handlers.

The pattern is: Client → WorkflowRun → block on `Get()`.

### 3. Which runtime-specific concepts leak through the public API, and are they acceptable?

**Heavily Temporal-specific leaks:**

- `TaskQueue` — task routing is a Temporal primitive (`workflow/workflow.go:583`, `internal/internal_activity.go:43`)
- `WorkflowTask`, `WorkflowTaskStarted`, `WorkflowTaskCompleted` — internal event types surface in replay and metrics (`internal/internal_event_handlers.go:1243-1268`)
- `ActivityID`, `ScheduleID`, `HeartbeatTimeout` — activity lifecycle tied to Temporal task tokens (`internal/internal_activity.go:30-58`)
- `Deployment`, `BuildID`, `WorkerDeploymentVersion` — Temporal's versioning model leaks into client (`client/client.go:524-528`)
- `SessionInfo` with `SessionID`, `HostName`, `SessionState` — session affinity is Temporal-specific (`workflow/session.go:10-21`)
- `StartWorkflowOptions.ID`, `WorkflowIDReusePolicy` — Temporal execution identity (`client/client.go:231`)
- `WorkflowUpdateStage` (Admitted, Accepted, Completed) — update state machine exposed (`client/client.go:182-193`)
- `RetryPolicy`, `CronSchedule`, `ParentClosePolicy` — Temporal-specific execution policies

These are **not acceptable** for a general-purpose OpenCode wrapper SDK — they would need to be abstracted.

### 4. How are structured events and final outputs represented?

**Events**: `historypb.HistoryEvent` from `go.temporal.io/api` — raw protobuf (`internal/internal_event_handlers.go:1209`). The SDK processes these in a large `switch` statement (lines 1233-1415) mapping event types to handler methods.

**Final output**: Workflow results are `commonpb.Payloads` (byte-serialized), retrieved via `WorkflowRun.Get(ctx, &result)` (`client/client.go:1013-1015`). Activities return the same `Payloads` type.

**Structured streaming**: The SDK does not expose a streaming API. `GetWorkflowHistory` returns an `HistoryEventIterator` that can long-poll for new events. There is no `EventHandler` callback pattern for incremental output — results are only available when the workflow completes.

**Updates**: `WorkflowUpdateHandle` provides `Get(ctx)` to retrieve update outcome (`client/client.go:653-655`), but this is a poll, not a stream.

### 5. How are metadata fields represented for provider, model, token usage, cost, timings, and source runtime?

**Provider/Model**: No generic metadata fields. Temporal does not model LLM providers — the SDK is workflow-centric. `WorkflowType`, `ActivityType` names are strings.

**Token usage / Cost**: No built-in metering. `WorkflowExecutionMetadata` exists (`client/client.go:271`) but contains Temporal-specific fields (namespace, run ID, parent info), not token/cost tracking.

**Timings**: `ScheduledTime`, `StartedTime`, `Deadline` on `ActivityInfo` (`internal/internal_activity.go:123-126`). `WorkflowInfo.Attempt` tracks retry count. No cumulative token metrics.

**Source runtime**: Hardcoded to `"go.temporal.io/sdk"` via `sdkName` in `workflowEnvironmentImpl` (`internal/internal_event_handlers.go:167`). The SDK does not support runtime interchange.

### 6. How does the design leave room for OpenCode, Codex, Claude Code, ACP, and direct LLM providers?

**No evidence of such support.** The SDK is tightly bound to Temporal's execution model. Key barriers:

- `WorkflowRun.Get()` blocks until completion — no streaming token events
- `TaskQueue` and `WorkflowTask` are Temporal primitives, not generalizable
- No `Runtime` interface or adapter boundary exists
- `DataConverter` is for serialization, not model interaction
- `worker.Worker` polls a Temporal server via gRPC — no pluggable executor
- Activity/Workflow determinism requirements are Temporal-specific (`workflow/workflow.go:691-707`)

A wrapper SDK for OpenCode would need a **完全不同** architecture. This SDK cannot be adapted for that purpose without a complete rewrite.

## Architectural Decisions

| Decision | Location | Rationale |
|----------|----------|-----------|
| Type alias forwarding from `internal` | `client/client.go:215-579` | Public API is a thin wrapper over internal implementation to reduce package coupling |
| `WorkflowRun` as opaque handle | `client/client.go:255` | Caller cannot inspect internals; only `Get`, `GetRunID`, `GetWorkflowID` |
| Protobuf for all wire formats | `go.mod:15` | Uses `go.temporal.io/api v1.62.11` for generated protobuf types |
| Deterministic workflow replay | `internal/internal_event_handlers.go:921-960` | `GetVersion` records markers in history; replay uses recorded values |
| Context-aware data converters | `internal/internal_event_handlers.go:227-232` | `WorkflowSerializationContext` encodes namespace/workflow ID into converter for proper codec routing |
| Eager activity execution | `internal/internal_activity.go:779` | `RequestEagerExecution` flag allows activities to start without server scheduling |
| Session affinity via `SessionInfo` | `workflow/session.go:10-21` | Sessions bind to specific worker hosts via `HostName` field |
| Nexus client abstraction | `workflow/workflow.go:188-208` | `NexusClient` interface allows external operation execution from workflows |

## Notable Patterns

- **Command pattern**: Workflows emit commands (schedule activity, start timer, signal) via `workflowEnvironmentImpl`; commands are buffered and sent as a batch to the server (`internal/internal_event_handlers.go:116-117 outbox`)
- **Interceptor pattern**: `ActivityInboundInterceptor`, `ActivityOutboundInterceptor` in `internal/internal_activity.go:322-440` allow middleware-style hooks
- **Context propagation**: `workflow.Context` carries options (timeouts, task queue, retry) via `WithValue` — no mutable struct injection
- **Replay safety**: `IsReplaying()` check guards non-deterministic operations (`workflow/workflow.go:705`)
- **Protocol messages**: `protocolpb.Message` used for protocol-level communication (update handlers, nexus) via `outbox` in `workflowEnvironmentImpl`

## Tradeoffs

- **Strong typing over flexibility**: Go generics and reflection-based registration provide compile-time safety for workflow/activity functions at the cost of dynamic runtime loading
- **Temporal coupling over portability**: Deep integration with Temporal's task queue, history, and versioning model enables powerful features (sticky queues, deterministic replay, worker deployment versioning) but prevents use with other runtimes
- **Blocking `Get()` over async streams**: Simpler programming model but no support for streaming intermediate results from long-running workflows
- **Generated protobuf clients**: Type safety and backward compatibility via `go.temporal.io/api`, but upgrades require SDK updates (noted in README.md lines 56-106 about proto JSON format migration)

## Failure Modes / Edge Cases

- **Replay non-determinism**: If workflow code changes without proper `GetVersion` calls, replay fails with `ErrUnknownHistoryEvent` (`internal/internal_event_handlers.go:1209`)
- **Sticky queue cache exhaustion**: Sticky workflows cache by workflow ID; if cache is full, new workflows replay from beginning (`worker/worker.go:288-295`)
- **Activity heartbeat timeout**: If heartbeat is missed, `ErrActivityPaused` or `ErrActivityReset` returned on next heartbeat call (`internal/internal_activity.go:401-413`)
- **Session worker failure**: If session host dies, `ErrSessionFailed` returned immediately on activity execution (`workflow/session.go:38-49`)
- **Eager activity race**: If worker is overloaded, eager execution falls back to server-scheduled tasks (`internal/internal_activity.go:779`)
- **Update handler race**: Updates buffered before handler registration are queued and rejected if handler never registers (`internal/internal_event_handlers.go:168-171`)

## Future Considerations

- **No OpenCode alignment**: This SDK has no architecture for LLM agent runtimes. For OpenCode wrapping, a new SDK contract would be needed with: (a) runtime abstraction layer, (b) streaming event model, (c) token usage tracking, (d) model/provider metadata fields, (e) non-deterministic execution support
- **Nexus integration**: `NexusClient` in workflow package (`workflow/workflow.go:188-208`) shows a path for external operation integration, but it is still Temporal-scheduled and bound to task queues
- **Worker deployment versioning**: The `WorkerDeploymentVersionDrainageStatus` experimental API (`client/client.go:59-86`) shows evolution toward more fine-grained deployment control, but this is Temporal-specific

## Questions / Gaps

1. **No streaming API**: The SDK has no way to stream incremental workflow results — `WorkflowRun.Get` blocks until completion. OpenCode tooling would need real-time token streaming.
2. **No runtime abstraction**: There is no `Runtime` interface, `Provider` interface, or adapter pattern. Every public type is tied to Temporal's execution model.
3. **No token/cost metering**: No fields for tracking input/output tokens, model name, cost, or latency at the SDK level.
4. **No async task abstraction**: Tasks are either workflows (deterministic, replayable) or activities (context-based, heartbeatable). No third category for LLM agent turns.
5. **No direct LLM integration**: The SDK does not model chat completions, function calling, or model providers. It is purely workflow orchestration.
6. **Protobuf coupling**: Upgrade path for proto format changes requires coordinated SDK + server upgrades (documented in README.md lines 56-106).

---

Generated by `study-areas/01-runtime-contract-and-api-shape.md` against `sdk-go`.