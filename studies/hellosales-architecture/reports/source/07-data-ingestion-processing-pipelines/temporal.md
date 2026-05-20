# Source Analysis: temporal

## Data Ingestion & Processing Pipelines

### Source Info

| Field | Value |
|-------|-------|
| Name | temporal |
| Path | `sources/temporal` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

Temporal is a distributed workflow engine where data ingestion and processing pipelines manifest as a task queue system. Workflow state transitions generate tasks that flow through categorized queues (transfer, timer, replication, visibility, archival) with rigorous validation, batching, backpressure, and DLQ handling. Raw data becomes trustworthy through a multi-stage pipeline: validation at command attribution, task creation, queue scheduling, executor execution, and optional DLQ routing on failure.

## Rating

**8/10** — Excellent implementation with minor issues. The task queue pipeline is well-architected with proper batching, backpressure, and DLQ support. Validation is comprehensive. Gaps exist in independent stage deployment/scaling (stages are coupled in same process) and OOM prevention for very large batches.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Ingestion entry | History engine `StartWorkflowExecution`, `ExecuteMultiOperation` | `service/history/history_engine.go:1` |
| Task categories | 7 categories defined (Transfer, Timer, Replication, Visibility, Archival, MemoryTimer, Outbound) | `service/history/tasks/category.go:20-27` |
| Stream batcher | Generic batching with MaxItems, MinDelay, MaxDelay, IdleTime options | `common/stream_batcher/batcher.go:31-43` |
| Command validation | `ValidateActivityScheduleAttributes`, `ValidateTimerCommandAttributes` | `service/history/api/command_attr_validator.go:75` |
| Search attribute validation | `Validate()` with number/size limits | `common/searchattribute/validator.go:60` |
| Executable error handling | `HandleErr()` classifies errors into invalid, safe-to-drop, retryable, terminal | `service/history/queues/executable.go:503-584` |
| DLQ writer | Per-queue mutex-protected writes with metrics | `service/history/queues/dlq_writer.go:64-143` |
| DLQ workflow | Delete/Merge workflows with batch processing (max 1000, default 100) | `service/worker/dlq/workflow.go:66-67` |
| Replication task processor | Multi-rate limiter, retry policy, DLQ routing | `service/history/replication/task_processor.go:92-144` |
| Sequential batch queue | Attempts to batch consecutive tasks by queue ID | `service/history/replication/sequential_batch_queue.go:54-67` |
| Reader rate limiting | Reader has `ratelimiter` field for backpressure | `service/history/queues/reader.go:66` |
| Rescheduler | Buffers failed tasks for resubmission with backoff | `service/history/queues/rescheduler.go:33-46` |
| Task priority | Priority levels: Immediate, High, Normal, Low, Background | `service/history/queues/executable.go:129` |
| DLQ metrics | `DLQWrites`, `TaskTerminalFailures`, `TaskDLQFailures` | `service/history/queues/dlq_writer.go:125-133` |

## Answers to Dimension Questions

### 1. How does raw data become trustworthy structured data?

Workflow commands enter via `StartWorkflowExecution` or `ExecuteMultiOperation` in `service/history/history_engine.go`. The `CommandAttrValidator` (`service/history/api/command_attr_validator.go:75`) validates activity, timer, signal, and update attributes before acceptance. Search attributes are validated via `searchattribute.Validator.Validate()` (`common/searchattribute/validator.go:60`) checking key count limits, value size limits, total size limits, and system attribute suppression. Tasks are created with type-safe category enums (`service/history/tasks/category.go:20-27`) and routed through queue processors with executor validation hooks.

### 2. What happens when a pipeline stage fails mid-batch?

When a task fails, `executableImpl.HandleErr()` (`service/history/queues/executable.go:503-584`) classifies the error:
- **Invalid task errors** (stale reference, not found) → task dropped if first attempt
- **Safe-to-drop errors** (`ErrTaskDiscarded`) → task dropped
- **Expected retryable errors** (resource exhausted, dependency not complete) → retry with backoff
- **Unexpected non-retryable errors** (data corruption) → terminal failure → DLQ or drop

The `matchDLQErrorPattern()` (`service/history/queues/executable.go:586-607`) allows dynamic configuration of error patterns that trigger DLQ routing via `HistoryTaskDLQErrorPattern`.

The replication pipeline (`service/history/replication/task_processor.go:257-281`) converts failed tasks to DLQ via `convertTaskToDLQTask()` and routes to `handleReplicationDLQTask()` with dedicated retry policy.

For batched tasks in `SequentialBatchableTaskQueue` (`service/history/replication/sequential_batch_queue.go:54-67`), failed tasks are added back to the individual task handler for reprocessing.

### 3. How is data quality validated at each pipeline stage?

- **At command submission**: `CommandAttrValidator` validates activity timers, workflow timeouts, search attributes, ID length limits (`service/history/api/command_attr_validator.go`)
- **At task execution**: Executable `Execute()` runs with panic recovery (`log.CapturePanic` at `service/history/replication/task_processor.go:329`)
- **At replication**: `historyEventBatch` validated for empty events (`ErrCorruptedHistoryEventBatch` at `service/history/replication/task_processor.go:45`)
- **At DLQ merge**: Tasks are filtered by `MaxMessageID` before re-enqueue (`service/worker/dlq/workflow.go:307-311`)
- **At persistence**: Task writes are protected by per-queue mutex (`service/history/queues/dlq_writer.go:89-91`)

### 4. How does the pipeline scale with data volume without OOM?

The `stream_batcher` (`common/stream_batcher/batcher.go:31-43`) provides explicit controls:
- `MaxItems`: maximum batch size (no evidence of hard limit enforcement in code)
- `MaxDelay`: maximum wait after first item before flush
- `IdleTime`: goroutine exit timeout to avoid resource waste

Reader options (`service/history/queues/reader.go:43-48`) include `MaxPendingTasksCount` for backpressure. The rescheduler (`service/history/queues/rescheduler.go`) buffers tasks in priority queues but has no visible memory limit. No evidence of circuit breakers at the batching layer.

**Gap**: No hard OOM prevention visible. Large batches could cause memory pressure since `Batcher` accumulates items until `MaxItems` is reached, but `MaxItems` default is not set in examined code.

### 5. Can pipeline stages be independently deployed or scaled?

**No evidence found.** Task categories are processed by queue processors within the same history service process. The `queueProcessorFactories` loop (`service/history/history_engine.go`) creates all queue processors for a shard in the same binary. There is no evidence of task category isolation into separate deployment units. The DLQ workflow runs as a Temporal workflow itself (`service/worker/dlq/workflow.go`), but this is for DLQ management, not pipeline stage isolation.

## Architectural Decisions

- **Task category separation**: 7 distinct categories (`service/history/tasks/category.go`) allow isolated processing paths
- **DLQ per queue key**: `QueueKey{QueueType, Category, SourceCluster, TargetCluster}` enables granular DLQ isolation (`service/history/queues/dlq_writer.go:71-76`)
- **Executable abstraction**: `Executable` interface (`service/history/queues/executable.go:42-52`) decouples task logic from queue processing
- **Sequential batching**: `SequentialBatchableTaskQueue` attempts to combine consecutive tasks sharing queue ID for efficiency (`service/history/replication/sequential_batch_queue.go`)
- **Panic recovery**: All task execution wrapped in `log.CapturePanic` (`service/history/replication/task_processor.go:329`) to prevent single task crash

## Notable Patterns

- **Multi-rate limiter** for replication: combines shard QPS limiter with fetcher rate limiter (`service/history/replication/task_processor.go:130-135`)
- **Backoff throttle retry**: `backoff.ThrottleRetry(operation, p.taskRetryPolicy, p.isRetryableError)` (`service/history/replication/task_processor.go:331`)
- **Priority-aware rescheduling**: Different `reschedulePolicy` variants for different error types (`service/history/queues/executable.go:84-88`)
- **Dynamic config for DLQ patterns**: Error pattern matching via `HistoryTaskDLQErrorPattern` allows runtime DLQ routing configuration (`service/history/queues/executable.go:586-607`)
- **Per-queue mutex for DLQ writes**: Process-level lock prevents CAS conflicts in persistence (`service/history/queues/dlq_writer.go:89-91`)
- **DLQ metrics emitted from shard 1 only**: `dlq_message_count` gauge emitted every 3 hours from shard 1 owner only (`common/persistence/dlq_metrics_emitter.go`)

## Tradeoffs

- **Simultaneous delete+merge in DLQ workflow**: Uses single workflow to prevent concurrent deletion and re-enqueueing of same task (`service/worker/dlq/workflow.go:1-2`)
- **Batching efficiency vs. latency**: `SequentialBatchableTaskQueue` may delay individual task processing when waiting to batch with last task (`service/history/replication/sequential_batch_queue.go:54-67`)
- **Rescheduler memory growth**: No visible upper bound on rescheduler queue size; could grow unbounded under sustained failure
- **Synchronous DLQ write**: `WriteTaskToDLQ` acquires per-queue mutex and performs synchronous persistence call (`service/history/queues/dlq_writer.go:86-100`); under high DLQ write load, could block other queue writes
- **Reader throttle backoff**: Fixed `throttleRetryDelay = 3 * time.Second` (`service/history/queues/reader.go:22`) may be aggressive or conservative depending on workload

## Failure Modes / Edge Cases

- **DLQ full**: No evidence of DLQ size limits or overflow handling; DLQ could grow unbounded
- **Task version mismatch**: Stale reference tasks detected and dropped on first attempt only (`service/history/queues/executable.go:524-527`)
- **Terminal error loop**: If `maxUnexpectedErrorAttempts` exceeded and DLQ disabled, task is silently dropped (`service/history/queues/executable.go:574`)
- **DLQ write failure**: `WriteTaskToDLQ` returns compound error wrapping `ErrSendTaskToDLQ` or `ErrCreateDLQ` (`service/history/queues/dlq_writer.go:42-43`); retry path unclear if DLQ write itself fails
- **Shard ownership lost**: Detected via `IsShardOwnershipLostError` and skips DLQ routing to prevent cross-shard contamination (`service/history/replication/task_processor.go:266`)
- **Context cancellation during batch processing**: `Add()` may still process item even if context cancelled (`common/stream_batcher/batcher.go:57-59`)
- **Idle goroutine exit**: Batcher goroutine exits after `IdleTime` with no pending items (`common/stream_batcher/batcher.go:121-122`)

## Future Considerations

- **Independent pipeline scaling**: Task categories could be extracted into independently deployed workers for independent scale
- **Memory-bounded rescheduler**: Add max capacity to rescheduler to prevent unbounded memory growth
- **DLQ size limits and alerts**: Implement DLQ depth monitoring and alerting thresholds
- **Async DLQ writes**: DLQ writes could be made async to reduce blocking under high load
- **Batch size limits enforcement**: `stream_batcher.MaxItems` should be enforced with explicit limits to prevent OOM

## Questions / Gaps

- **No evidence found** for pipeline observability beyond metrics (no distributed tracing of batch flow)
- **No evidence found** for cross-namespace task isolation mechanisms beyond namespace registry lookup
- **No evidence found** for pipeline replay/retry semantics at workflow level (only task-level retry)
- **No evidence found** for pipeline configuration via dynamic config at runtime for batch sizes