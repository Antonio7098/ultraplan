# Source Analysis: milvus

## Background Jobs & Async Workflows

### Source Info

| Field | Value |
|-------|-------|
| Name | milvus |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/milvus` |
| Language / Stack | Go (coordinator/node architecture), C++ (internal/core), Rust (tantivy) |
| Analyzed | 2026-05-19 |

## Summary

Milvus implements a multi-layered task scheduling architecture across its coordinator and node components. The system uses in-process priority queues with goroutine-based workers rather than an external message queue. Tasks flow through schedulers that manage two-phase queues (pending/running), with configurable concurrency pools and exponential backoff retry policies. Backpressure is implemented through rate limiting and adaptive throttling mechanisms, particularly in the streaming subsystem. No external queue infrastructure (Redis, Kafka, NATS, Temporal) is used — scheduling is entirely in-process with coordination via etcd for cluster state.

## Rating

**6/10** — Good foundational implementation with clear architectural layering, but significant gaps: no durable external queue, limited dead-letter handling, no formal workflow/orchestration engine, and retry policies are distributed rather than centralized.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Task Scheduler Interface | `Scheduler` interface defines `Add`, `Dispatch`, `RemoveByNode` | `internal/querycoordv2/task/scheduler.go:382` |
| Task Struct | `Task` interface with `Cancel`, `Fail`, `Wait`, `Status` | `internal/querycoordv2/task/task.go:73` |
| Task Status | `TaskStatusCreated`, `Started`, `Succeeded`, `Canceled`, `Failed` | `internal/querycoordv2/task/task.go:44` |
| GlobalTaskScheduler | `globalTaskScheduler` with `pendingTasks PriorityQueue`, `runningTasks` | `internal/datacoord/task/global_scheduler.go:48` |
| Proxy Task Scheduler | `taskScheduler` with 4 queues (dd/dm/dq/dc), 4 processing loops | `internal/proxy/task_scheduler.go:443` |
| Job Scheduler | `Scheduler` for collection-level job queuing with waitQueue | `internal/querycoordv2/job/scheduler.go:39` |
| Retry Package | `retry.Do()`, `retry.Handle()` with configurable attempts/sleep/maxSleep | `pkg/util/retry/retry.go:39` |
| Retry Options | `Attempts`, `Sleep`, `MaxSleepTime`, `RetryErr` options | `pkg/util/retry/options.go:46` |
| Backoff Exponential | Exponential backoff doubling sleep each retry (line 112, 196) | `pkg/util/retry/retry.go:112` |
| Unrecoverable Errors | `Unrecoverable(err)`, `IsRecoverable(err)` for fast-fail | `pkg/util/retry/retry.go:218` |
| Task Enqueue | Fast-fail on queue full, TSO allocation, add to unissued list | `internal/proxy/task_scheduler.go:176` |
| Failed Load Cache | `meta.GlobalFailedLoadCache.Put()` for failed segment loads | `internal/querycoordv2/task/scheduler.go:1084` |
| Rate Limit States | `adaptiveRateLimitModeNormal/Slowdown/Reject/Recovery` | `pkg/streaming/util/ratelimit/adaptive_rate_limit_controller.go:34` |
| Rate Limit Controller | `AdaptiveRateLimitController` with mode transitions | `pkg/streaming/util/ratelimit/adaptive_rate_limit_controller.go:83` |
| Concurrency Pool | `conc.Pool[T]` for parallel task execution in schedulers | `internal/datacoord/task/global_scheduler.go:56` |
| Node Task Queue | `nodeTaskQueue` with per-node task buckets | `internal/querycoordv2/task/scheduler.go:159` |
| Task Priority | `Priority` type with `Normal`, `High` levels | `internal/querycoordv2/task/task.go:52` |
| Worker Pool Config | `ClusteringCompactionWorkerPoolSize` param | `pkg/util/paramtable/component_param.go:6612` |
| Session Retry | `backoff.NewExponentialBackOff()` for etcd session keepalive | `internal/util/sessionutil/session_util.go:585` |
| LazyGRPC Retry | `backoff.Retry()` with 100ms initial, 10s max interval | `internal/util/streamingutil/service/lazygrpc/conn.go:54` |

## Answers to Dimension Questions

### 1. How are background jobs submitted, tracked, and completed?

**Submission:**
- Via `Scheduler.Add(task)` in querycoordv2 (`scheduler.go:503`), `GlobalScheduler.Enqueue(task)` in datacoord (`global_scheduler.go:61`), or `taskScheduler.Enqueue()` in proxy (`task_scheduler.go:176`).
- Proxy path: fast-fail queue-full check → TSO timestamp allocation → add to unissued list → signal utBufChan.

**Tracking:**
- `ConcurrentMap[UniqueID, struct{}]` in `taskScheduler.tasks` (`scheduler.go:412`) for querycoordv2.
- `PriorityQueue` for pending, `ConcurrentMap[int64, Task]` for running in datacoord (`global_scheduler.go:54-55`).
- Proxy uses `baseTaskQueue` with separate unissued (list) and active (map) task tracking (`task_scheduler.go:59-72`).
- Task lifecycle: `Init` → `InProgress`/`Retry` → `Finished`/`Failed`.

**Completion:**
- Task's `Wait()` method blocks until `doneCh` is closed (`task.go:169-178`).
- On completion, `remove(task)` cleans up from queues (`scheduler.go:1087`).
- `process()` method in each scheduler calls task's action chain and sets final status.

### 2. What happens when a job fails — retry, dead-letter, or compensate?

**Retry:**
- `retry.Do()` in `pkg/util/retry/retry.go:39` provides exponential backoff (default 10 attempts, 200ms initial, 3s max).
- Task's `Fail(err)` sets error and records to `GlobalFailedLoadCache` for segment tasks (`scheduler.go:1084`).
- State transitions to `Retry` for recoverable errors, `Failed` for permanent errors.
- Index scheduler maps specific errors to `JobStateRetry` or `JobStateFailed` (`datanode/index/scheduler.go:251-255`).

**Dead-letter:**
- **No explicit dead-letter queue.** Failed tasks are logged and tracked in-memory via `failedCache` or `taskStats` LRU.
- `AbortAndRemoveTask()` in datacoord drops task on worker but does not route to separate DLQ (`global_scheduler.go:79-89`).
- Querycoord records certain failures to `GlobalFailedLoadCache` (`scheduler.go:1084`) but no DLQ processing.

**Compensate:**
- `task.Cancel(err)` for tasks that are no longer needed (`task.go:92`).
- `DropTaskOnWorker(cluster)` called on abort (`global_scheduler.go:83`).
- Error propagation via `task.Err()` to callers.

### 3. How does the system handle job duration limits and cancellation?

**Duration Limits:**
- Context deadlines checked in retry loop (`retry.go:84-97`) — returns lastErr if deadline approaching.
- Session keepalive has `MaxElapsedTime = 0` (infinite) but `RequestTimeout` limits etcd operations (`session_util.go:588`).
- No per-task hard timeout — relies on context cancellation propagated through action chain.

**Cancellation:**
- `baseTask` holds `context.CancelFunc` created via `context.WithCancel(ctx)` (`task.go:142`).
- `task.Cancel(err)` calls cancel func and sets `canceled` flag (`task.go:92`).
- Scheduler's `Stop()` calls `executor.Stop()` and removes all tasks (`scheduler.go:463-477`).
- Context propagated to all action executions — checked at each step.

### 4. Are workflows composed of multiple steps with state management?

**No formal workflow/orchestration engine.** Tasks have multi-step `Action` chains but no explicit workflow definition:

- `Task.Actions() []Action` returns ordered action list (`task.go:97`).
- `Executor.execute()` iterates actions, calling `task.PreExecute()` → action → `task.PostExecute()` (`task.go:240`).
- `Step()` / `StepUp()` track progress through actions (`task.go:98-99`).
- `IsFinished()` checks distribution state (`task.go:100`).

**Job-level sequencing:**
- `JobScheduler` for querycoordv2 runs jobs sequentially within a collection (`job/scheduler.go:31`).
- `globalTaskScheduler` for datacoord uses priority queue with slot-based node assignment (`global_scheduler.go:140-160`).
- No saga pattern, no compensating transactions, no persistent workflow state.

### 5. How is backpressure applied when the system is overloaded?

**Queue-level backpressure:**
- `baseTaskQueue.utFull()` returns true if `unissuedTasks.Len() >= maxTaskNum` (`task_scheduler.go:85`).
- `addUnissuedTask()` returns `ErrTooManyRequests` when full (`task_scheduler.go:93`).
- Proxy `Enqueue()` checks `utFull()` before TSO allocation (`task_scheduler.go:187-191`).

**Rate limiting:**
- gRPC `RateLimiter` middleware rejects with `ErrServiceRateLimit` (`ratelimitutil/limiter.go`).
- `AdaptiveRateLimitController` for streaming with 4 modes: Normal → Slowdown → Reject → Recovery (`adaptive_rate_limit_controller.go:34`).
- Slowdown decreases rate by `SlowdownDecreaseRatio` every `SlowdownDecreaseInterval` until Low Watermark.
- Recovery increases by `RecoveryIncremental` until High Watermark.

**Node capacity:**
- `WorkerPoolingSize` limits concurrent workers per node (`component_param.go:3572`).
- `ClusteringCompactionWorkerPoolSize` limits compaction parallelism (`component_param.go:6612`).
- `GetChannelTaskDelta()` / `GetSegmentTaskDelta()` used for load balancing decisions (`scheduler.go:394-395`).

**No explicit circuit breaker** — backpressure is implicit via queue limits and rate limiting.

## Architectural Decisions

1. **In-process scheduling, not external queue.** All task scheduling is in-process with goroutines. Coordination uses etcd for cluster topology, not a message queue. This avoids external dependencies but means tasks are lost on node crash.

2. **Per-component schedulers.** QueryCoordV2, DataCoord, Proxy, RootCoord each have their own scheduler. No unified job interface across the system — different components reinvent similar patterns.

3. **Two-phase queue (pending/running).** Most schedulers maintain separate pending and running task collections, promoting tasks when resources are available.

4. **Exponential backoff with jitter-free doubling.** Retry uses pure exponential doubling (sleep *= 2) without jitter, which can cause thundering herd on recovery.

5. **No durable task persistence.** Tasks are in-memory only. Checkpointing via etcd session for leader election, but not for task state. Node failure loses in-progress tasks.

6. **Rate limiting at streaming layer.** Adaptive rate limit controller handles backpressure for the write path with multi-state machine (Normal/Slowdown/Reject/Recovery).

## Notable Patterns

- **Goroutine-per-task loops:** Proxy has 4 dedicated goroutine loops (definition/control/manipulation/query), each consuming from a typed queue.
- **Action chain execution:** Tasks execute via `PreExecute` → `Action.Execute()` → `PostExecute` pipeline.
- **Priority-based scheduling:** Tasks have `Priority` field (Normal/High) affecting dispatch order.
- **Collection-key locking:** `collKeyLock *lock.KeyLock[int64]` guards task addition per collection to prevent duplicates.
- **TSO-based ID allocation:** Proxy tasks get timestamp-based IDs from a Timestamp Oracle allocator.
- **Slot-based node assignment:** DataCoord global scheduler computes available "slots" per node and assigns tasks accordingly.

## Tradeoffs

| Decision | Benefit | Cost |
|----------|---------|------|
| In-process scheduling | No external deps, low latency | Task loss on crash, no horizontal scaling of workers |
| Goroutine-based workers | Simple, familiar Go pattern | Hard to limit/cancel across process boundaries |
| No DLQ | Simpler code | Failed tasks invisible, no retry visibility |
| Exponential backoff (no jitter) | Predictable | Thundering herd when many tasks retry simultaneously |
| Per-component schedulers | Optimized per use case | Duplicated code, inconsistent behavior |
| Context cancellation for timeout | Standard Go pattern | Cancellation propagation is best-effort |

## Failure Modes / Edge Cases

1. **Task loss on crash:** In-memory tasks not persisted. Node crash loses all pending/running tasks for that node.
2. **Unrecoverable task state:** If `Fail()` is called but task is in a retry loop, may never reach terminal state.
3. **Orphaned tasks:** If node is isolated but not marked down, tasks may be stuck in `processQueue` forever.
4. **Priority inversion:** High-priority task may wait behind normal tasks on same collection if lock is held.
5. **Retry storm:** Exponential backoff without jitter means all failed tasks retry at same intervals.
6. **DLQ absence:** No visibility into failed tasks — only logged, not surfaced to operators.
7. **Context leak:** `baseTask.cancel` is stored but only called via `task.Cancel()`, not automatically on scheduler Stop for in-progress tasks.

## Future Considerations

1. **Durable task queue:** Integrate with etcd or external queue (Kafka/RabbitMQ) for task persistence across crashes.
2. **Dead-letter queue:** Implement DLQ with retry counter, TTL, and visibility API for failed tasks.
3. **Jitter in backoff:** Add randomization to retry intervals to prevent thundering herd.
4. **Circuit breaker:** Add per-node/per-collection circuit breaker to fast-fail when a node is degraded.
5. **Workflow engine:** Consider Temporal or similar for multi-step workflows with saga/compensation.
6. **Task timeout:** Add per-task hard timeout config, not just context-based cancellation.
7. **Unified job interface:** Consolidate per-component schedulers into a common framework.

## Questions / Gaps

1. **What happens to in-flight tasks when a querycoord node crashes?** No evidence of task replication or recovery mechanism.
2. **Is there a maximum retry count per task type?** No centralized retry policy — each usage of `retry.Do()` configures separately.
3. **How are slow tasks detected and handled?** `TaskSlowThreshold` exists in datacoord (`global_scheduler.go:257`) but no clear remediation.
4. **What's the behavior when `GlobalFailedLoadCache` is full?** LRU eviction may cause previously failed collections to be retried unexpectedly.
5. **Is there backpressure from datanode to proxy?** No evidence found of pushback when datanode is overwhelmed.

---

Generated by `dimensions/05-background-jobs-async-workflows.md` against `milvus`.