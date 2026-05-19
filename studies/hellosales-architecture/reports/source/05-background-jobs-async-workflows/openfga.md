# Source Analysis: openfga

## Background Jobs & Async Workflows

### Source Info

| Field | Value |
|-------|-------|
| Name | openfga |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/openfga` |
| Language / Stack | Go |
| Analyzed | 2026-05-19 |

## Summary

OpenFGA implements a pipeline-based worker system for authorization queries (ListObjects), using in-process goroutine workers connected via bounded MPMC queues. The system focuses on high-throughput, low-latency authorization checks rather than traditional background job processing. It uses concurrency pools for parallel dispatch, throttlers for rate limiting, and background goroutines for cache invalidation and iterator draining. No external queue infrastructure (Redis, Kafka, NATS, Temporal) is used.

## Rating

**5/10** — Well-engineered pipeline architecture for authorization queries, but lacks formal background job semantics: no job retry with backoff, no dead-letter handling, no workflow orchestration beyond dataflow pipelines.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Pipeline Builder | `Builder` struct, `Pipeline` struct with workers map | `internal/listobjects/pipeline/pipeline.go:98` |
| Pipeline Worker Start | `Build()` starts workers in goroutines, `wg.Add(1)` per worker | `internal/listobjects/pipeline/pipeline.go:399-410` |
| MPMC Queue | `Queue[T]` bounded ring buffer, `Send()` blocks when full | `internal/containers/mpmc/queue.go:42` |
| MPMC Backpressure | `Send()` parks on `full` channel when buffer exhausted | `internal/containers/mpmc/queue.go:251-256` |
| MPMC Buffer Extension | `Send()` doubles buffer if extensions remain | `internal/containers/mpmc/queue.go:241-248` |
| MPSC Accumulator | `Accumulator[T]` lock-free MPSC queue | `internal/containers/mpsc/accumulator.go:42` |
| Job Queue | `jobQueue` wraps `arrayqueue` with mutex, `enqueue/dequeue` | `pkg/server/commands/reverseexpand/reverse_expand_weighted.go:78` |
| Concurrency Pool | `concurrency.Pool = pool.ContextPool`, `NewPool()` | `internal/concurrency/concurrency.go:10` |
| Pool Config | `pool.New().WithContext(ctx).WithCancelOnError().WithFirstError().WithMaxGoroutines(maxGoroutines)` | `internal/concurrency/concurrency.go:16-21` |
| Throttler Interface | `Throttler` interface with `Throttle(context.Context)` | `internal/throttler/throttler.go:26` |
| Constant Rate Throttler | `constantRateThrottler` with `time.Ticker`, `throttlingQueue` channel | `internal/throttler/throttler.go:45` |
| Throttler Blocking | `Throttle()` blocks on `<-r.throttlingQueue` | `internal/throttler/throttler.go:99-104` |
| Dispatch Throttling | `DispatchThrottlingCheckResolver` uses threshold check | `internal/graph/dispatch_throttling_check_resolver.go:95` |
| Cycle Group | `CycleGroup` struct with `Membership` ring for quiescence | `internal/listobjects/pipeline/internal/worker/cycle.go:99` |
| Cycle Detection | `Membership.Inc()/Dec()` for in-flight message counting | `internal/listobjects/pipeline/internal/worker/cycle.go:78-86` |
| Planner Cleanup | `Planner.startCleanupRoutine()` with `time.Ticker` | `internal/planner/planner.go:74` |
| Planner Eviction | `evictStaleKeys()` Range over keys, delete if unused > threshold | `internal/planner/planner.go:93-107` |
| Cache Controller | `InMemoryCacheController.InvalidateIfNeeded()` spawns goroutine | `internal/cachecontroller/cache_controller.go:206` |
| Iterator Background Drain | `CachingIterator.Stop()` spawns `drainInBackground()` goroutine | `pkg/storage/storagewrappers/iterator_cache.go:254-257` |
| Drain Timeout | Background drain uses `context.WithTimeout(context.Background(), drainTimeout)` | `pkg/storage/storagewrappers/iterator_cache.go:318` |
| Singleflight Deduplication | `c.sf.Do(c.cacheKey, ...)` prevents concurrent drains | `pkg/storage/storagewrappers/iterator_cache.go:333` |
| Query Job | `queryJob` struct with `foundObject` and `ReverseExpandRequest` | `pkg/server/commands/reverseexpand/reverse_expand_weighted.go:69` |
| Query Dispatch | `loopOverEdges()` creates pool with `resolveNodeBreadthLimit` | `pkg/server/commands/reverseexpand/reverse_expand_weighted.go:146` |
| Worker Core | `Core` struct with `MessagePool`, `ProcessSender()`, `Broadcast()` | `internal/listobjects/pipeline/internal/worker/core.go:149` |
| Buffer Defaults | `defaultBufferSize=128`, `defaultChunkSize=100`, `defaultNumProcs=3` | `internal/listobjects/pipeline/pipeline.go:57-60` |
| Worker Sender | `worker.Sender` interface, `Recv()` streaming result interface | `internal/listobjects/pipeline/pipeline.go:31-34` |

## Answers to Dimension Questions

### 1. How are background jobs submitted, tracked, and completed?

**Submission:**
- Authorization queries (ListObjects) are submitted via `Builder.Build(ctx, graph, spec)` which creates a `Pipeline` and starts all workers in goroutines (`pipeline.go:399-410`).
- Reverse expansion uses `jobQueue` (array-backed) populated in `queryForTuples()` (`reverse_expand_weighted.go:338-345`), with jobs dispatched to a concurrency pool.
- Context deadline controls overall execution time.

**Tracking:**
- Pipeline has `workers map[string]worker.Worker`, `output worker.Sender`, `errs *mpsc.Accumulator[error]`, `wg *sync.WaitGroup` (`pipeline.go:120-131`).
- Workers use `MessagePool` for buffer reuse and track in-flight messages via `Membership.Inc()/Dec()`.
- Cycle groups coordinate via `track.StatusPool` for quiescence detection.

**Completion:**
- `Pipeline.Recv()` drains results from output channel, stores first error (`pipeline.go:422-470`).
- `Pipeline.Close()` cancels context, drains output, waits for workers (`pipeline.go:479-515`).
- Iterator caching spawns background goroutine to finish draining after `Stop()` (`iterator_cache.go:254-257`).

### 2. What happens when a job fails — retry, dead-letter, or compensate?

**Retry:**
- **No formal retry mechanism.** The concurrency pool uses `WithCancelOnError()` — first error cancels all goroutines (`concurrency.go:19`).
- No exponential backoff, no max attempt configuration, no dead-letter queue.
- Failed dispatches simply return errors to the caller.

**Dead-letter:**
- **No dead-letter queue.** Failed authorization queries return error responses directly.
- Iterator cache may abandon incomplete results if drain times out (`iterator_cache.go:336-341`).

**Compensate:**
- No saga pattern or compensating transactions.
- Cycle groups handle graceful teardown via ordered `Sleep()/Wake()` cascade (`cycle.go:61-76`).

### 3. How does the system handle job duration limits and cancellation?

**Duration Limits:**
- Context deadline propagated through all operations — checked in `Build()` (`pipeline.go:242`), in `Send()/Recv()` on MPMC queue (`queue.go:207`), and in throttler (`throttler.go:102`).
- Iterator drain uses separate `drainTimeout` (e.g., `CheckIteratorDrainTimeout`) with `context.WithTimeout(context.Background(), drainTimeout)` (`iterator_cache.go:318`).

**Cancellation:**
- `Pipeline.Close()` calls `cancel()` and waits on `wg` (`pipeline.go:479-515`).
- MPMC queue's `Close()` wakes blocked senders/receivers (`queue.go:328-336`).
- Throttler `Close()` stops ticker and closes channels (`throttler.go:89-94`).
- Context cancellation checked at each retry loop in `Send()` (`queue.go:207`), `Recv()` (`queue.go:306`).

### 4. Are workflows composed of multiple steps with state management?

**Pipeline-based workflow:**
- `Pipeline` orchestrates multiple workers (Basic, Terminal, Wildcard, Intersection, Difference) connected via typed channels.
- Each node type has a dedicated worker implementing the `Worker` interface with `Execute()` method.
- Edges connect nodes; cyclic edges use `QueueMedium` or `AccumulatorMedium`, non-cyclic use `ChannelMedium` (`medium.go:108-282`).

**No persistent workflow state:**
- No workflow engine, no saga pattern, no durable execution.
- State is in-memory during query; context deadline controls lifetime.
- `Planner` manages in-memory plan selection with TTL-based eviction.

**Cycle coordination:**
- `CycleGroup` coordinates quiescence detection and ordered teardown for cyclic graph edges (`cycle.go:88-151`).
- Workers signal readiness via `Membership.SignalReady()`, wait via `Membership.WaitForAllReady()`.

### 5. How is backpressure applied when the system is overloaded?

**MPMC bounded queue backpressure:**
- `Send()` blocks when buffer full — parks on `full` channel until `Recv()` frees a slot (`queue.go:251-256`).
- If extensions remain, `Send()` doubles the buffer under write lock (`queue.go:241-248`).
- "Natural backpressure prevents memory exhaustion" (`pipeline/doc.go:32`).

**Dispatch throttling:**
- `DispatchThrottlingCheckResolver` checks `threshold.ShouldThrottle()` based on dispatch count (`dispatch_throttling_check_resolver.go:95`).
- When throttled, sets `DispatchThrottled` flag and calls `r.throttler.Throttle(ctx)` which blocks on throttling queue (`dispatch_throttling_check_resolver.go:107-108`).
- `constantRateThrottler` releases one goroutine per ticker tick (`throttler.go:78-87`).

**Rate limiting:**
- No external rate limiter; throttling is internal based on dispatch count.
- MPMC queue has bounded capacity; senders block when full.

**No circuit breaker:**
- No explicit circuit breaker pattern; backpressure is implicit via queue limits and dispatch throttling.

## Architectural Decisions

1. **In-process pipeline, not external queue.** Workers are goroutines communicating via typed channels. No Redis/Kafka/NATS for job queuing. Appropriate for low-latency authorization but limits horizontal scaling of workers.

2. **Pipeline pattern for authorization resolution.** Authorization graph traversed via workers connected by edges. Natural backpressure through channel buffering. Cycle detection via `CycleGroup` with quiescence counting.

3. **MPMC bounded queue with extension.** Queue uses Dmitry Vyukov's algorithm with CAS coordination. Supports buffer extension on `Send()` when full, up to configured limit. Natural backpressure when exhausted.

4. **Constant-rate throttler for dispatch control.** Throttler uses `time.Ticker` to release goroutines at configured frequency. Blocks callers via channel receive. Appropriate for limiting recursive dispatch depth.

5. **Concurrency pool with cancel-on-error.** Pool cancels all goroutines on first error via `WithCancelOnError()`. No per-task retry, no dead-letter. Simple failure model suitable for read-heavy authorization queries.

6. **Background drain for iterator caching.** `CachingIterator.Stop()` spawns goroutine to finish draining after query completes. Uses singleflight to deduplicate concurrent drains. Timeout prevents indefinite blocking.

## Notable Patterns

- **Message pool for buffer reuse:** `MessagePool` in `worker/core.go:95-145` maintains a free list of message buffers to reduce GC pressure.
- **Cycle ring with ordered teardown:** `CycleGroup` links workers in a ring, leader initiates `Sleep()/Wake()` cascade after quiescence.
- **Quiescence via in-flight counting:** `Membership.Inc()/Dec()` track in-flight messages; `StatusPool.Wait()` blocks until count reaches zero.
- **Singleflight for deduplication:** Iterator drain uses `singleflight.Do()` to prevent redundant caching work.
- **Background goroutine for cache invalidation:** `CacheController.InvalidateIfNeeded()` spawns async goroutine with `LoadOrStore` deduplication.

## Tradeoffs

| Decision | Benefit | Cost |
|----------|---------|------|
| In-process pipelines | Low latency, no network hops | No durability, tasks lost on crash |
| Goroutine-based workers | Familiar Go pattern, easy composition | Hard to limit/cancel across process boundaries |
| No retry mechanism | Simple, fail-fast | Failed queries return error immediately |
| No dead-letter queue | Simpler code | No visibility into failed queries |
| MPMC bounded queue | Natural backpressure | Senders block when full |
| Constant-rate throttler | Predictable dispatch limiting | Throughput limited by ticker frequency |
| Context-based cancellation | Standard Go pattern | Cancellation is best-effort |
| Background iterator drain | Non-blocking Stop() | Potential for orphaned goroutines if timeout misconfigured |

## Failure Modes / Edge Cases

1. **Task loss on crash:** In-memory pipelines lose all pending/running work on node crash. No external persistence.
2. **Blocking on full queue:** Senders park indefinitely if receivers don't keep up and extensions are exhausted.
3. **Throttle cascade:** If throttler frequency is too low, requests queue up behind throttle gate.
4. **Iterator drain timeout:** If `drainTimeout` is too short, incomplete results are abandoned and not cached.
5. **Cycle group deadlock:** If workers don't properly signal `SignalReady()`, `WaitForAllReady()` blocks forever.
6. **Context cancellation during pipeline build:** `Build()` checks `ctx.Err()` early but workers may still be started before context is checked.
7. **Singleflight collision:** If many queries target same cache key, drains are serialized by singleflight, potentially timeout.

## Future Considerations

1. **External job queue:** Integrate with Redis or similar for durable job persistence across crashes.
2. **Retry with backoff:** Add retry mechanism for transient failures in authorization queries.
3. **Dead-letter queue:** Implement DLQ with visibility API for failed queries.
4. **Circuit breaker:** Add per-node/per-query circuit breaker to fast-fail when system is degraded.
5. **Workflow engine:** Consider Temporal or similar for multi-step authorization workflows.
6. **Job timeout:** Add per-job hard timeout config beyond context-based cancellation.
7. **Worker autoscaling:** Allow horizontal scaling of worker goroutines based on queue depth.

## Questions / Gaps

1. **What happens when a pipeline worker panics?** No evidence of panic recovery or goroutine restart mechanism.
2. **Is there a maximum dispatch count per request?** Yes, `threshold.ShouldThrottle()` uses `DefaultThreshold` and `MaxThreshold` but no evidence of hard limit.
3. **How are slow workers detected?** No evidence of slow-worker detection or remediation.
4. **What's the behavior when MPMC extensions are exhausted?** Senders park until receiver makes space — potential indefinite block.
5. **Is there backpressure from slow storage?** No evidence of storage-layer backpressure propagation.

---

Generated by `dimensions/05-background-jobs-async-workflows.md` against `openfga`.