# Repo Analysis: sdk-go

## Process and Session Lifecycle

### Repo Info

| Field | Value |
|-------|-------|
| Name | sdk-go |
| Path | `/home/antonioborgerees/coding/opencode-wrap-study/repos/sdk-go` |
| Group | `{{repo_group}}` |
| Language / Stack | Go |
| Analyzed | 2026-05-17 |

## Summary

sdk-go is the Temporal Go SDK, a workflow orchestration library rather than a raw subprocess manager. It executes workflow and activity code in response to tasks dispatched by a Temporal server. Lifecycle management centers on: (1) workflow task processing with deterministic coroutine dispatching, (2) activity execution via Go context.Context with heartbeating, (3) session management for pinning activities to specific workers, and (4) worker process lifecycle with graceful shutdown. The SDK does not spawn external processes itself—it runs user code inside the SDK's own goroutines under the Temporal server's task scheduling.

## Rating

**7/10** — Clear lifecycle modeling for workflows, activities, and sessions with structured state machines, cancellation propagation, and cleanup paths. However, the protocol is server-driven (long-poll RPC), not client-driven process spawning with structured output flags. Session recreation is limited to same-worker resume. Score would be higher if raw subprocess management with reconnect/resume were part of the scope.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Workflow lifecycle states | commandState enum with 12 states (Created, CommandSent, Initiated, Started, Canceled*, etc) | `internal/internal_command_state_machine.go:184-196` |
| Command state machine interface | `commandStateMachine` interface with cancel(), handleStartedEvent(), handleCanceledEvent(), etc | `internal/internal_command_state_machine.go:28-46` |
| Activity lifecycle | scheduledEventIDToActivityID map tracks pending activities; close/delete on completion | `internal/internal_command_state_machine.go:1140-1144` |
| Session creation | CreateSession → execute internal session creation activity → signal workflow with response | `internal/session.go:174-368` |
| Session cancellation | sessionCancelFunc stored in SessionInfo; called on CompleteSession or worker death | `internal/session.go:30,218,350` |
| Context cancellation propagation | propagateCancel() walks parent chain, registers child in parent's children map | `internal/context.go:210-230` |
| Cancel func implementation | cancelCtx.cancel() closes done channel, iterates children map, calls child.cancel(false, err) | `internal/context.go:297-325` |
| Worker stop | close(stopC), worker.Stop(), close(localActivityStopC) | `internal/internal_worker.go:469-475` |
| Session token bucket | concurrent session limit via sync.Cond.Wait() / addToken() / getToken() | `internal/session.go:491-521` |
| Session recreation token | mustSerializeRecreateToken uses json.Marshal; deserializeRecreateToken uses json.Unmarshal | `internal/session.go:477-489` |
| Activity timeout/deadline | activityEnvironment.deadline set; used in context.WithDeadline | `internal/internal_activity.go:124` |
| Heartbeat cancellation | heartbeatCancel stored in internal_worker_heartbeat.go:121 | `internal/internal_worker_heartbeat.go:121` |
| Local activity cancel | localActivityTask.cancelFunc() called on cancel | `internal/internal_event_handlers.go:307-311` |
| Nexus operation cancellation | nexusOperationStateMachine.cancel() creates requestCancelNexusOperationStateMachine | `internal/internal_command_state_machine.go:957-974` |
| Worker StopChannel | WorkerStopChannel <-chan struct{} exposed in workerExecutionParameters | `internal/internal_worker.go:185` |
| WorkerStopTimeout | Time delay before hard terminate; passed to baseWorker as stopTimeout | `internal/internal_worker.go:182,378-395` |
| Cancellation on workflow ctx | WithCancel returns (ctx Context, cancel CancelFunc) | `internal/context.go:179` |
| NewDisconnectedContext | Returns ctx that won't propagate parent's cancellation | `internal/context.go:197-200` |
| ExecuteActivity timeout | ExecuteActivityOptions includes ScheduleToStartTimeout, StartToCloseTimeout, HeartbeatTimeout | `internal/internal_activity.go:40-58` |
| Session state enum | SessionStateOpen (0), SessionStateFailed (1), SessionStateClosed (2) | `internal/session.go:86-96` |

## Answers to Protocol Questions

### 1. What lifecycle states are modeled before, during, and after a run?

**Workflow tasks**: The command state machine models 12 distinct states: `commandStateCreated → commandStateCommandSent → commandStateInitiated → commandStateStarted → commandStateCompleted`. Cancellation paths include `commandStateCanceledBeforeSent`, `commandStateCanceledBeforeInitiated`, `commandStateCanceledAfterInitiated`, `commandStateCanceledAfterStarted`, `commandStateCancellationCommandSent`, `commandStateCancellationCommandAccepted`, and `commandStateCompletedAfterCancellationCommandSent`.

State transitions are driven by history events from the Temporal server. The `commandsHelper` struct tracks `nextCommandEventID`, `orderedCommands` list, and maps for correlating scheduled event IDs to command IDs (`internal/internal_command_state_machine.go:151-169`).

**Activities**: Lifecycle is implicit—activities are scheduled via `ScheduleActivityTask` command, then tracked via `scheduledEventIDToActivityID` map. On completion/failure/cancel/timeout, the corresponding handler removes the entry from the map (`internal/internal_command_state_machine.go:1140-1144`). No explicit state enum like workflows.

**Sessions**: Three states: `SessionStateOpen`, `SessionStateFailed`, `SessionStateClosed` (`internal/session.go:86-96`). Session context is canceled when session fails or CompleteSession() is called.

**Workers**: `AggregatedWorker` uses `started atomic.Bool` and `shuttingDown atomic.Bool` flags. The `stopC chan struct{}` gates Start/Stop race detection.

### 2. How are prompts or commands sent to the runtime?

The SDK does not send prompts to an external runtime. Workflow code generates **commands** (ScheduleActivity, StartTimer, StartChildWorkflow, etc.) which are serialized into a workflow task completion and sent to the Temporal server via `RespondWorkflowTaskCompleted` RPC. The server then schedules the actual work (activity tasks, timer tasks) and dispatches them back to the worker via long-poll RPC (`PollActivityTaskQueue`, `PollWorkflowTaskQueue`).

Commands are created via `commandsHelper.addCommand()` which inserts into `orderedCommands` list and assigns a deterministic event ID (`internal/internal_command_state_machine.go:1080-1091`). The command protobuf is built on demand via `getCommand()` method when the workflow task response is assembled.

**Not applicable**: This is not a `--format json` subprocess wrapper. Commands are internal SDK data structures sent as protobuf payloads to a Temporal server.

### 3. How are JSON events, stderr diagnostics, protocol messages, and final outputs decoded?

**Protobuf**: All wire protocol uses protobuf (gRPC). `WorkflowServiceClient` is the generated protobuf client. Payloads (`commonpb.Payloads`) are used for data serialization.

**Payload conversion**: `converter.DataConverter` encodes/decodes typed values to/from payloads. Multiple converters can be composed (`compositeDataConverter`). JSON fallback is available via `json_payload_converter.go`.

**Session recreation token**: Uses JSON marshal/unmarshal (`internal/session.go:477-489`).

**Workflow output**: Return values from workflow functions are serialized via `encodeArg(dataConverter, result)` and included in the `WorkflowExecutionResult` of the workflow task completion response.

**Diagnostics**: The SDK does not capture stderr from worker processes. Logs are collected via `log.Logger` interface which can be customized by the user. Internal logs use `ilog.NewDefaultLogger()`. No structured JSON event streaming from the runtime—events are historical records from the Temporal server.

**No evidence found**: Structured JSON event streams like `stdout json` mode, streaming HTTP/WebSocket responses, or stdio capture. The protocol is request/response over gRPC long-poll.

### 4. How does cancellation propagate to subprocesses, servers, sessions, and child work?

**Context cancellation (Go context.Context)**: Activities receive a `context.Context` which is canceled when the activity task is cancelled by the server or times out. Inside activities, `ctx.Err()` returns `context.Canceled` or `context.DeadlineExceeded`.

**Workflow context cancellation**: `workflow.Context` wraps Go context with a custom `Done() Channel` (not native Go channel). `WithCancel(parent Context)` returns a `CancelFunc` that calls `cancelCtx.cancel(true, ErrCanceled)` which closes the done channel and propagates to registered children (`internal/context.go:297-325`).

**Session cancellation**: `SessionInfo.sessionCancelFunc` is called in two scenarios:
- When `CompleteSession()` is called, it cancels both the creation activity and all user activities (`internal/session.go:218`)
- When the creation activity fails (non-cancel error), `sessionCancelFunc()` is called and `SessionState` set to `Failed` (`internal/session.go:362`)

**Child workflow cancellation**: `childWorkflowCommandStateMachine.cancel()` sends a `RequestCancelExternalWorkflowExecution` command to the server. The server then delivers the cancellation to the child workflow (`internal/internal_command_state_machine.go:770-784`).

**Activity cancellation**: `RequestCancelActivity` command is sent; the server cancels the activity task. If `WaitForCancellation` is false, the SDK returns `ActivityTaskCanceledError` immediately.

**Worker shutdown**: Closing `stopC` triggers `shutdownWorker()` RPC and stops all pollers. Long-standing pollers may complete a poll before seeing the noRepoll flag.

**Nexus cancellation**: `nexusOperationStateMachine.cancel()` creates a `requestCancelNexusOperationStateMachine` and sends a `RequestCancelNexusOperation` command. States track cancel request delivery via `handleNexusOperationCancelRequested` and `handleNexusOperationCancelRequestDelivered`.

### 5. What prevents leaked processes, goroutines, file handles, sockets, and sessions?

**Coroutine cleanup**: `dispatcherImpl.Close()` destroys all coroutines without waiting for completion. Coroutines track state via `coroutineState.closed atomic.Bool`. The `dispatcher.Close()` is called when the workflow task completes or is cancelled (`internal/internal_workflow.go:90`).

**Context cancellation**: `cancelCtx.cancel()` iterates all registered children and calls their cancel. This cascades through the workflow context tree.

**Session token bucket**: When a session completes, `sessionEnv.AddSessionToken()` is called to release the token back to the bucket, allowing new session creation (`internal/session.go:546-548`). The `sessionTokenBucket` uses `sync.Cond` for signaling.

**Session completion activity**: `CompleteSession()` runs `internalSessionCompletionActivity` on a disconnected context (not cancelled) to signal session done to the server. If this activity fails, a warning is logged but no leak occurs because the session state is already set to `Closed` (`internal/session.go:235-237`).

**Worker resources**: `AggregatedWorker.Stop()`:
1. Sets `noRepoll.Store(true)` on all workers to prevent re-polling
2. Closes `stopC`
3. Calls `shutdownWorker()` RPC to notify server
4. Iterates plugins in reverse order calling `StopWorker`
5. Calls `Stop()` on workflow, activity, session, and nexus workers

**Channel cleanup**: `channelImpl` tracks `closed bool` and uses buffered sends/receives. When closed, blocked sends/receives are notified.

**No evidence found**: Raw socket or file handle cleanup beyond what the Go runtime manages. gRPC connections are managed by the gRPC library; no explicit connection pooling or cleanup beyond the `WorkflowClient`'s lifecycle.

### 6. Is there a strategy for reconnecting to or resuming an existing session?

**Session recreation**: `RecreateSession(ctx, recreateToken, sessionOptions)` allows recreating a session on the **same worker** (same `SessionResourceID`). The recreate token contains the `taskqueue` but not the host/worker identity. The server-side session must still be active (`internal/session.go:193-199`).

**Limitation**: Per the comments in `workflow/session.go:102-103` and `internal/session.go:191-192`:
> "NOTE: Session recreation via RecreateSession may not work properly across worker fail/crash before Temporal server version v1.15.1."

**No cross-worker reconnect**: There is no mechanism to resume a session on a different worker. Sessions are tied to a specific `SessionResourceID` + hostname combination. If the worker dies, the session is lost.

**Sticky workflow cache**: The SDK does support sticky workflow execution (caching workflow state for fast replay), but this is replay of the same workflow ID on the same worker, not a session concept.

**No process-level resume**: This is not a subprocess wrapper where you can reconnect to a running process. The Temporal server owns the execution state; the SDK only holds in-memory workflow state for the duration of a worker's task assignment.

## Architectural Decisions

| Decision | Rationale | Tradeoff |
|----------|-----------|----------|
| Server-driven task scheduling via long-poll RPC | Decouples workflow code from specific server地址; enables server-side load balancing and HA | Higher latency for task delivery vs event-driven webhooks; requires persistent connections |
| Deterministic coroutine dispatcher | Enables workflow replay from history; guarantees same command sequence on re-execution | Workflow code must use workflow.Channel/Selector instead of native Go concurrency; limits library compatibility |
| Session affinity via resource-specific task queue | Guarantees activities run on same worker without distributed locking | Worker death kills session; no automatic failover |
| Token bucket for concurrent session limit | Prevents unbounded resource consumption across workers | Token release depends on completion activity succeeding; if that activity fails, token may be leaked until heartbeat timeout |
| Command state machine per workflow command type | Clear states enable correct replay and cancellation handling | Many state combinations to test; state machine logic spreads across file |
| Context hierarchy for cancellation | Follows Go conventions; enables compositional cancellation | cancelCtx.children map access requires locking; potential for orphaned children if removeChild not called |

## Notable Patterns

- **Workflow-as-function**: User-defined workflow functions are wrapped in `workflowExecutor` and called via reflection. The SDK uses a deterministic scheduler to execute coroutines one at a time until blocked.
- **Activity heartbeat batching**: Activity heartbeats are batched internally in `serviceInvoker`; the session creation activity does explicit heartbeating with `Heartbeat(ctx, nil, true)` to bypass batching.
- **Replay determinism**: `SideEffect`, `MutableSideEffect`, `GetVersion` all record markers in history to ensure same result on replay. The dispatcher is read-only during replay.
- **Sticky workflow cache**: Workflow executions are cached by workflow ID + binary checksum; cache eviction is LRU.
- **Eager activity execution**: Activities can be scheduled eagerly on the same worker without a server round-trip when certain conditions are met.

## Tradeoffs

- **Session is not a general-purpose process/session**: The session model is tied to Temporal's activity scheduling, not a generic runtime process. You cannot use it to manage arbitrary subprocess lifecycles.
- **Cancellation is cooperative**: Context cancellation requires the activity or workflow code to check `ctx.Done()` or use `Selector`/`Channel` receive operations. Blocking operations without checking may not respond to cancellation promptly.
- **Session recreation is limited**: Works only for continuing the same logical workflow on the same worker, not for disaster recovery or migrating sessions to different workers.
- **No subprocess spawn with structured output**: This SDK does not spawn external processes. It registers Go functions and methods that are executed when the Temporal server dispatches tasks. There is no `--format json` flag equivalent for an external CLI.
- **Heartbeat timeout coupling**: Session heartbeat timeout (default 20s) must be less than half the activity timeout for accurate state reporting on failure.

## Failure Modes / Edge Cases

1. **Session worker dies**: Session context is cancelled via heartbeat timeout detection. `sessionInfo.SessionState` set to `Failed`. `sessionCancelFunc()` cancels the session context. Any in-flight activities receive `ErrSessionFailed`.

2. **Activity times out**: `ActivityTaskTimeoutError` returned to workflow. Activity state machine transitions to completion. Workflow can retry via `ExecuteActivity` with `RetryPolicy`.

3. **Workflow panic**: `WorkflowPanicPolicy` controls behavior—`BlockWorkflow` (default) retries forever, `FailWorkflow` fails the workflow immediately. Panic includes stack trace for debugging.

4. **Cancel racing with command completion**: If cancel is initiated but the command completes before cancel command is sent, the cancel command is a no-op (checked in `removeCancelOfResolvedCommand`).

5. **Session creation timeout**: RetryPolicy for session creation activity disables retry for `StartToClose` and `Heartbeat` timeout errors (intentionally non-retryable per comments in `internal/session.go:292-298`).

6. **Heartbeat failure during session creation**: If heartbeat fails and context is cancelled, returns `NewApplicationErrorWithOptions(...NonRetryable: true, Cause: ctx.Err())` to surface the cancel as a session failure.

7. **Sticky workflow cache eviction**: If a cached workflow is evicted while a task is pending, the next task for that workflow must replay from server history, losing any in-memory state.

8. **Nexus operation synchronous completion**: If a Nexus operation completes synchronously (inline), the state machine never transitions to `Started`—goes straight from `Initiated` to `Completed`.

## Future Considerations

1. **Cross-worker session resume**: Session recreation could be enhanced to allow resuming on a different worker by transferring session state, which would require server-side support for session migration.

2. **Structured output for external runtimes**: The SDK's architecture does not support spawning arbitrary external processes. If OpenCode wrappers need to call `opencode run --format json`, that would be a separate wrapper process management layer, not part of this SDK.

3. **Webhook/event-driven delivery**: Currently relies entirely on long-poll RPC. An alternative event delivery mechanism (webhooks, WebSocket) would require significant rearchitecture.

4. **Session heartbeating optimization**: Current heartbeat interval is fixed at 1/3 of heartbeat timeout, which could be aggressive for sessions with large heartbeat payloads.

## Questions / Gaps

1. **No evidence of reconnect to existing session across worker restart**: Session recreation token contains only taskqueue, not worker identity. If the worker process crashes, the session cannot be recovered on a new worker. The comment in the code acknowledges this limitation pre-v1.15.1.

2. **No evidence of cancellation propagation from activity to workflow context**: Activity cancellation is delivered to the activity Go context, but there is no automatic propagation back to the workflow context that scheduled the activity. The workflow must handle the error returned by `Future.Get()`.

3. **No evidence of structured JSON event streaming**: The SDK receives completed activity results as protobuf payloads, not as a streaming JSON event log. Diagnostic information is limited to workflow task completion events from the server.

4. **No evidence of graceful shutdown timeout enforcement**: While `WorkerStopTimeout` is passed to `baseWorkerOptions`, the actual enforcement of this timeout during shutdown is not clearly evidenced in the code path.

---

Generated by `study-areas/02-process-session-lifecycle.md` against `sdk-go`.