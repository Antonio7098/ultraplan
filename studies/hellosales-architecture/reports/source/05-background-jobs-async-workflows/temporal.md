# Source Analysis: temporal

## Background Jobs & Async Workflows

### Source Info

| Field | Value |
|-------|-------|
| Name | temporal |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/temporal` |
| Language / Stack | Go |
| Analyzed | 2026-05-19 |

## Summary

Temporal is a durable execution platform that provides fault-tolerant, scalable background job processing through a sophisticated multi-service architecture. It implements workflow-as-code where workflows are Go code that execute reliably despite failures. The system uses task queues for work distribution, persistent workflow state in PostgreSQL/Cassandra/MySQL stores, and provides built-in retry policies, dead-letter queue handling, scheduled workflows, and comprehensive activity/workflow timeouts. The architecture separates concerns across Frontend, History, Matching, and Worker services with persistent state and deterministic workflow replay at its core.

## Rating

**9/10** — Exemplar implementation. Temporal is the industry-standard durable execution platform that defines the benchmark for background jobs and async workflows. It provides comprehensive retry semantics with jitter, exponential backoff, and expiration intervals; built-in dead-letter queue management with merge/delete workflows; sophisticated scheduling with cron-like semantics and overlap policies; workflow-level cancellation with proper event recording; and backpressure via rate limiting. The only minor gaps are around dynamic backpressure signals to clients and multi-tenant isolation at the scheduler level.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Retry Policy (Exponential) | `ExponentialRetryPolicy` with `initialInterval`, `backoffCoefficient`, `maximumInterval`, `expirationInterval`, `maximumAttempts` fields | `common/backoff/retrypolicy.go:49-55` |
| Retry Policy (ErrorDependent) | `ErrorDependentRetryPolicy` computes delay based on error type | `common/backoff/retrypolicy.go:57-63` |
| Retry Jitter | Jitter added via `addJitter()` with 20% randomization to avoid sync | `common/backoff/retrypolicy.go:178-187` |
| DLQ Workflow | `WorkflowName = "temporal-sys-dlq-workflow"` with delete and merge types | `service/worker/dlq/workflow.go:139-146` |
| DLQ Retry Policy | `deleteActivityRetryPolicy` with 100ms initial, 2.0 coefficient, 10 max attempts | `service/worker/dlq/workflow.go:179-183` |
| DLQ Merge Retry | `mergeActivityRetryPolicy` with 100ms initial, 1.2 coefficient, 10 max attempts | `service/worker/dlq/workflow.go:187-191` |
| Task Queue Backlog | `backlogManager` interface with `SpoolTask`, `BacklogCountHint`, `BacklogStatus` | `service/matching/backlog_manager.go:39-56` |
| Backlog Tracker | `backlogAgeTracker` using treemap for age-based prioritization | `service/matching/backlog_age_tracker.go:15-17` |
| Persistence Retry | `persistenceOperationRetryPolicy` (50ms initial, 1s max, 30s expiration) for matching ops | `service/matching/backlog_manager.go:27-29` |
| Forever Retry | `foreverRetryPolicy` (1s initial, 10s max, no expiration) for metadata load | `service/matching/backlog_manager.go:32-35` |
| Scheduler Workflow | `SchedulerWorkflow` with `WorkflowIDPrefix = "temporal-sys-scheduler:"` | `service/worker/scheduler/workflow.go:71-72` |
| Schedule Buffer | `MaxBufferSize = 1000` limits buffered starts | `service/worker/scheduler/workflow.go:207` |
| TweakablePolicies | `CurrentTweakablePolicies` with catchup window (365 days default), retention (7 days), jitter config | `service/worker/scheduler/workflow.go:195-214` |
| Workflow Cancellation | `RequestCancelWorkflowExecution` in history service | `service/history/history_engine.go:635-636` |
| Batch Retry Policy | `batchActivityRetryPolicy` with 10s initial, 1.7 coefficient, 5min max | `service/worker/batcher/workflow.go:101-105` |
| Rate Limiter | `quotas.NewDefaultOutgoingRateLimiter` with RPS config | `service/worker/scanner/history/scavenger.go:105-107` |
| Activity Timeout | `StartToCloseTimeout: infiniteDuration` (20 years) for batch activities | `service/worker/batcher/workflow.go:109` |
| Worker Component | `workerComponent` implementing `WorkerComponent` interface for DLQ | `service/worker/dlq/workflow.go:130-134` |
| Task Writer | `taskWriter.appendTask` spools tasks to persistence | `service/matching/backlog_manager.go:166` |
| Task Completion | `ackManager` tracks ackLevel for delivered messages | `service/matching/backlog_manager.go:65` |
| Retry Thorttle | `backoff.ThrottleRetryContext` with `IsRetryable` and `RetryPolicy` | `docs/architecture/retry.md:5-10` |

## Answers to Dimension Questions

### 1. How are background jobs submitted, tracked, and completed?

**Submission**: Workflows are started via `StartWorkflowExecution` → Frontend → History service, which creates the workflow execution record and schedules the initial workflow task. Activities are scheduled via `ScheduleActivityTask` command from workers.

**Tracking**: Workflow state is persisted durably in the persistence layer (PostgreSQL/Cassandra/MySQL) as workflow "history" events. The Matching service maintains task queues with in-memory backlogs backed by persistence. The `backlogManager` tracks task spools via `taskWriter` and `taskReader` components (`service/matching/backlog_manager.go:62-64`).

**Completion**: Tasks are completed via `ackManager` which tracks `ackLevel` for delivered messages. The `completeTask` method marks tasks processed, deletes from database on success, or rewrites with higher taskID on failure (`service/matching/backlog_manager.go:231-272`).

Evidence: `service/matching/backlog_manager.go:165-172` (SpoolTask), `service/matching/backlog_manager.go:227-272` (completeTask), `docs/architecture/workflow-lifecycle.md` (full lifecycle diagram).

### 2. What happens when a job fails — retry, dead-letter, or compensate?

**Retry**: Activities use configurable `temporal.RetryPolicy` with `InitialInterval`, `BackoffCoefficient`, `MaximumInterval`, `MaximumAttempts`. The retry policy is passed via `workflow.ActivityOptions` (`service/worker/dlq/workflow.go:179-191`). For matching persistence operations, `persistenceOperationRetryPolicy` retries with 50ms initial, 1s max, 30s expiration (`service/matching/backlog_manager.go:27-29`).

**Dead-Letter**: Tasks that fail all retries are sent to the DLQ. The `temporal-sys-dlq-workflow` handles both delete (`WorkflowTypeDelete`) and merge (`WorkflowTypeMerge`) operations with configurable batch sizes up to 1000 (`service/worker/dlq/workflow.go:139-150`). The DLQ workflow can re-enqueue tasks via `AddTasks` RPC.

**Compensate**: Workflows can implement compensation logic using signals (e.g., `SignalNameUpdate`, `SignalNamePatch`) or child workflows. The scheduler workflow supports `PauseOnFailure` policy that automatically pauses a schedule after workflow failure (`service/worker/scheduler/workflow.go:887-898`).

Evidence: `service/worker/dlq/workflow.go` (DLQ workflow), `common/backoff/retrypolicy.go` (retry policies).

### 3. How does the system handle job duration limits and cancellation?

**Duration Limits**: Activities have `StartToCloseTimeout` enforced by the SDK and server. Workflows have `WorkflowExecutionTimeout`. The batch activity uses `infiniteDuration = 20 * 365 * 24 * time.Hour` (`service/worker/batcher/workflow.go:22`). For matching operations, context deadline exceeded errors are treated as non-retryable (`service/matching/backlog_manager.go:287`).

**Cancellation**: Cancellation is requested via `RequestCancelWorkflowExecution` API, recorded as `WorkflowExecutionCancelRequested` event, and propagated to the workflow. Activities support `Activity Cancellation` via `TryActivityCancellationFromWorkflow` test (`tests/activity_test.go:910`). The scheduler workflow handles cancellation of scheduled workflow runs via the `CancelWorkflow` activity (`service/worker/scheduler/activities.go:221-241`).

Evidence: `service/history/history_engine.go:635` (RequestCancelWorkflowExecution), `service/worker/scheduler/workflow.go:883-898` (pause-on-failure handling).

### 4. Are workflows composed of multiple steps with state management?

**Yes**. Temporal workflows are composed of multiple steps with full state management via:

- **Workflow as code**: Workflows are Go code that executes deterministically, with state captured in workflow context (`workflow.Context`).
- **Event sourcing**: All state changes are recorded as history events that can be replayed.
- **Signals**: Workflows receive asynchronous signals for updates, patches, and refreshes (`SignalNameUpdate`, `SignalNamePatch`, `SignalNameRefresh`) (`service/worker/scheduler/workflow.go:738-755`).
- **Queries**: Workflows expose query handlers for synchronous state inspection (`QueryNameDescribe`, `QueryNameListMatchingTimes`) (`service/worker/scheduler/workflow.go:251-256`).
- **Buffered Starts**: Scheduler workflow buffers up to 1000 starts with `BufferedStarts` state to handle overlap policy (`service/worker/scheduler/workflow.go:1309-1318`).
- **Side Effect/Cache**: Scheduler uses `SideEffect` for deterministic computation and caches next action times in `nextTimeCacheV1`/`nextTimeCacheV2` (`service/worker/scheduler/workflow.go:517-635`).

Evidence: `service/worker/scheduler/workflow.go` (full scheduler workflow implementation).

### 5. How is backpressure applied when the system is overloaded?

**Rate Limiting**: The scavenger uses `quotas.NewDefaultOutgoingRateLimiter` with configurable RPS (`service/worker/scanner/history/scavenger.go:105-107`). Rate limiting is checked before each page fetch via `rateLimiter.Wait(ctx)` (`service/worker/scanner/history/scavenger.go:144`).

**Task Queue Backlog Hints**: `BacklogCountHint()` returns the number of backlogged tasks, which the SDK uses to influence polling behavior (sticky vs normal) (`service/matching/backlog_manager.go:46`). This is exposed via `taskqueuepb.TaskQueueStatus` to SDK clients.

**Backlog Age Tracking**: `backlogAgeTracker` tracks task creation times using a treemap, enabling age-based prioritization (`service/matching/backlog_age_tracker.go`). `ApproximateBacklogAge` is reported in task queue stats.

**Priority-Based Rate Limiting**: The `priority_rate_limiter_impl.go` provides multi-priority rate limiting for different request types.

**Context Throttling**: `backoff.ThrottleRetryContext` respects context cancellation and deadline exceeded errors to prevent indefinite blocking (`service/matching/backlog_manager.go:286-295`).

Evidence: `common/quotas/priority_rate_limiter_impl.go`, `service/matching/backlog_age_tracker.go`, `service/matching/backlog_manager.go:182-184`.

## Architectural Decisions

1. **Event Sourcing**: All workflow state is stored as an immutable sequence of history events. This enables deterministic replay, fan-out queries, and cross-namespace replication.

2. **Service Separation**: Frontend (API), History (execution state), Matching (task distribution), Worker (system workflows) are separate services that communicate via gRPC, enabling independent scaling.

3. **Workflow-as-Code**: Workflows are written in Go using the Temporal SDK, making them testable, version-controllable, and expressive without external DSLs.

4. **Task Queue as Core Abstraction**: Task queues decouple producers from consumers, enabling polymorphic workers, sticky execution for cache locality, and elastic scaling.

5. **Tweakable Policies**: `CurrentTweakablePolicies` uses `MutableSideEffect` to allow policy changes without breaking in-flight workflow executions (`service/worker/scheduler/workflow.go:1266-1278`).

6. **Built-in Scheduler**: Temporal includes a production-ready scheduled workflow system (`temporal-sys-scheduler` workflow) with calendar specs, jitter, overlap policies, and catchup windows.

## Notable Patterns

1. **Workflow Versioning**: `SchedulerWorkflowVersion` constants (e.g., `InitialVersion`, `BatchAndCacheTimeQueries`, `NewCacheAndJitter`) enable non-breaking upgrades to workflow logic without replay (`service/worker/scheduler/workflow.go:35-68`).

2. **DLQ Fan-Out**: The DLQ workflow groups tasks by shard ID before re-enqueueing to respect sharding constraints (`service/worker/dlq/workflow.go:384-410`).

3. **Activity Heartbeating**: Long-running activities can heartbeat progress, enabling partial failure recovery and cancellation responsiveness (`service/worker/batcher/workflow.go:24`).

4. **Remote Timer Gates**: The `RemoteGate` allows workflow timers to fire based on server-side time, avoiding clock skew issues (`common/timer/remote_gate.go`).

5. **Continue-As-New**: Long-running workflows can "continue as new" to keep history size bounded, with the scheduler workflow using `IterationsBeforeContinueAsNew` to control iteration count (`service/worker/scheduler/workflow.go:380-381`).

## Tradeoffs

1. **Storage Overhead**: Event sourcing means every state change is written to history. High-frequency activities generate large histories, requiring archival strategies.

2. **Replay Cost**: Workflows must be fully deterministic for replay. Non-determinism from concurrent operations or external time/date calls requires careful coding practices.

3. **Latency vs Durability**: Task queue operations use write-ahead persistence. The `skipFinalUpdate` flag trades some consistency for availability during graceful shutdown (`service/matching/backlog_manager.go:72-74`).

4. **DLQ Merge Ordering**: DLQ merge processes tasks in batches but doesn't guarantee ordering within a batch, requiring consumers to handle out-of-order delivery.

5. **Scheduler Precision**: The scheduler workflow processes time ranges in iterations with `SleepWhilePaused` optimization. Very high fan-out schedules may experience slight jitter in action timing.

## Failure Modes / Edge Cases

1. **Persistence Failure**: If `appendTask` fails after all retries, the entire task queue is unloaded and ownership is lost. Next owner will reload from persistence (`service/matching/backlog_manager.go:250-259`).

2. **ConditionFailedError**: On persistence `ConditionFailedError` (e.g., range ID conflict), the backlog manager signals unload and skips final update (`service/matching/backlog_manager.go:114-126`).

3. **Workflow Task Timeout**: If a worker fails to respond to a workflow task within `WorkflowTaskTimeout`, the task is re-queued to another worker (`docs/architecture/workflow-lifecycle.md`).

4. **Activity Timeout**: Activities that exceed `ScheduleToCloseTimeout` are retried per policy or moved to DLQ if all retries exhausted.

5. **Sticky Worker Unavailable**: When a sticky worker with cached workflow state becomes unavailable, execution falls back to a normal worker with full history replay (higher latency but correctness).

6. **Schedule Conflict**: Concurrent schedule updates use `ConflictToken` to detect conflicts and reject with `errUpdateConflict` (`service/worker/scheduler/workflow.go:951-954`, `service/worker/scheduler/workflow.go:1259-1264`).

7. **Buffer Overflow**: If buffered starts exceeds `MaxBufferSize` (1000), new starts are dropped with metric increment (`service/worker/scheduler/workflow.go:1303-1308`).

8. **Catchup Window Missed**: If a scheduled action's nominal time exceeds the catchup window (365 days default), it's skipped with metric increment (`service/worker/scheduler/workflow.go:692-697`).

## Future Considerations

1. **CHASM Migration**: The scheduler workflow is being migrated to CHASM (Coordinated Heterogeneous Application State Machines), a new execution model in `/chasm/` directory.

2. **Dynamic Backpressure**: Currently, backpressure is implicit via polling frequency and rate limiting. Explicit backpressure signals to SDK clients about queue depth could improve overload handling.

3. **Cross-Cluster DLQ**: The DLQ workflow operates on single-cluster tasks. Cross-cluster task replication would enhance DLQ for geo-distributed deployments.

4. **Workflow Priority**: The current scheduler has priority support via `LimitedActions`, but no per-workflow priority for tenant isolation in multi-tenant deployments.

## Questions / Gaps

1. **No evidence found** for distributed tracing integration within the core server (traces would be in SDK client instrumentation).

2. **No evidence found** for automatic workflow memory management or goroutine leak detection within long-running workflow executions (delegated to SDK and user code).

3. **No evidence found** for deadline propagation from parent to child workflows (children have independent timeout configuration).

4. **Partial evidence** for batch operation progress tracking—heartbeat details are stored but progress queries require explicit implementation per workflow type.

---

Generated by `dimensions/05-background-jobs-async-workflows.md` against `temporal`.