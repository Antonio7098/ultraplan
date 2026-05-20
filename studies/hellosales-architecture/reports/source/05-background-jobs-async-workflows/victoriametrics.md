# Source Analysis: victoriametrics

## Background Jobs & Async Workflows

### Source Info

| Field | Value |
|-------|-------|
| Name | victoriametrics |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/victoriametrics` |
| Language / Stack | Go |
| Analyzed | 2026-05-19 |

## Summary

VictoriaMetrics is a time-series database optimized for monitoring and alerting workloads. Its approach to "background jobs" is fundamentally different from dedicated job processing systems — it's oriented around data ingestion pipelines, not arbitrary job execution. The system provides persistent queuing via `FastQueue` for retrying failed remote writes, exponential backoff with jitter for transient failures, and concurrency limiting for write operations. However, it lacks true job tracking (beyond queue depth metrics), dead-letter queue handling for exhausted retries, workflow orchestration, or scheduled job execution beyond periodic alert evaluation in vmalert.

## Rating

**5/10** — Basic implementation with notable gaps. VictoriaMetrics excels at buffered, durable data ingestion with its `FastQueue` implementation and provides solid retry semantics for remote write failures. However, it is not a background job processing system — it has no concept of named jobs, job completion tracking, dead-letter queues for failed jobs, or workflow orchestration. vmalert provides the closest approximation with periodic rule evaluation, but this is evaluation-timer based, not a job queue.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Persistent Queue (FastQueue) | `FastQueue` struct with in-memory channel + file-based fallback | `lib/persistentqueue/fastqueue.go:18-40` |
| Queue Write | `TryWriteBlock` attempts in-memory first, falls back to file | `lib/persistentqueue/fastqueue.go:186-229` |
| Queue Read | `MustReadBlock` reads in-memory first, then file-based queue | `lib/persistentqueue/fastqueue.go:232-260` |
| File-based Queue | `queue` struct with reader/writer offsets, chunk files | `lib/persistentqueue/persistentqueue.go:30-64` |
| Queue Drop on Size | `maxPendingBytes` triggers oldest blockdropping | `lib/persistentqueue/persistentqueue.go:355-382` |
| Backoff Timer | `BackoffTimer` with exponential backoff and jitter | `lib/timeutil/backoff_timer.go:9-47` |
| Remote Write Retry | `sendBlockHTTP` uses BackoffTimer for retries | `app/vmagent/remotewrite/client.go:416-515` |
| Retry Min/Max Intervals | `-remoteWrite.retryMinInterval`, `-remoteWrite.retryMaxInterval` flags | `app/vmagent/remotewrite/client.go:41-44` |
| Concurrent Insert Limiter | `IncConcurrency/DecConcurrency` with channel-based semaphores | `lib/writeconcurrencylimiter/concurrencylimiter.go:103-136` |
| Max Queue Duration | `-insert.maxQueueDuration` flag (1 min default) | `lib/writeconcurrencylimiter/concurrencylimiter.go:23-24` |
| Worker Pool (Unmarshal) | `StartUnmarshalWorkers` creates CPU-count workers | `lib/protoparser/protoparserutil/unmarshal_work.go:24-37` |
| Ingestion Rate Limiter | `ratelimiter.RateLimiter` for max samples/sec | `app/vmagent/remotewrite/remotewrite.go:95-96` |
| Queue-blocked Metric | `vmagent_remotewrite_queue_blocked` gauge | `app/vmagent/remotewrite/remotewrite.go:932-937` |
| vmalert Group Executor | `execConcurrently` with semaphore for rule concurrency | `app/vmalert/rule/group.go:731-757` |
| vmalert Interval Ticker | `time.NewTicker(g.Interval)` for periodic evaluation | `app/vmalert/rule/group.go:425-426` |
| vmalert Random Start Delay | `delayBeforeStart` spreads group evaluation over maxStartDelay | `app/vmalert/rule/group.go:502-531` |
| Block Drop on HTTP 409 | Blocks dropped on 409 without retry | `app/vmagent/remotewrite/client.go:447-455` |

## Answers to Dimension Questions

### 1. How are background jobs submitted, tracked, and completed?

VictoriaMetrics does not have a background job system in the traditional sense. Data flows through the system via:

**Submission**: Data is submitted via HTTP APIs (Prometheus remote write, InfluxDB line protocol, etc.) and placed into `FastQueue` buffers. The `TryPush` method in `app/vmagent/remotewrite/remotewrite.go:393-511` handles write requests.

**Tracking**: Queue depth is tracked via `vmagent_remotewrite_pending_data_bytes` and `vmagent_remotewrite_pending_inmemory_blocks` metrics (`lib/persistentqueue/fastqueue.go:60-65`). There is no per-job tracking — only aggregate queue depth.

**Completion**: Data is "completed" when successfully sent to the remote storage endpoint. The `runWorker` in `app/vmagent/remotewrite/client.go:305-354` reads from the queue and sends, returning only on success or queue closure.

Evidence: `app/vmagent/remotewrite/remotewrite.go:854-858` (remoteWriteCtx with FastQueue), `app/vmagent/remotewrite/client.go:305-354` (worker loop).

### 2. What happens when a job fails — retry, dead-letter, or compensate?

**Retry**: Remote writes use exponential backoff with jitter via `BackoffTimer` (`lib/timeutil/backoff_timer.go:32-47`). The `sendBlockHTTP` method (`app/vmagent/remotewrite/client.go:416-515`) loops indefinitely on error until success or stop signal.

**Dead-Letter**: There is **no dead-letter queue**. Failed blocks are either:
- Retried indefinitely until successful
- Dropped on specific HTTP status codes (409 Conflict, 400 Bad Request, 415 Unsupported Media Type) per `app/vmagent/remotewrite/client.go:447-490`
- Dropped when `forceDropSamplesOnFailure=true` is set

**Compensate**: There is no compensation mechanism. Data loss is accepted for certain failure modes.

Evidence: `app/vmagent/remotewrite/client.go:447-455` (409 drop), `app/vmagent/remotewrite/client.go:484-490` (400/415 drop).

### 3. How does the system handle job duration limits and cancellation?

**Duration Limits**: The `maxQueueDuration` flag (`lib/writeconcurrencylimiter/concurrencylimiter.go:23`) limits how long a goroutine waits for a concurrency token. The `sendTimeout` flag (`app/vmagent/remotewrite/client.go:40`) limits individual request duration.

**Cancellation**: The `stopCh` channel signals workers to terminate gracefully. On shutdown, `runWorker` waits up to 5 seconds for in-flight requests and drains the in-memory queue before exiting (`app/vmagent/remotewrite/client.go:334-351`). The `UnblockAllReaders` method (`lib/persistentqueue/fastqueue.go:104-113`) wakes blocked readers with a 5-second deadline for stale marker flushing.

Evidence: `app/vmagent/remotewrite/client.go:333-351` (graceful stop), `lib/persistentqueue/fastqueue.go:104-113` (UnblockAllReaders).

### 4. Are workflows composed of multiple steps with state management?

**No.** VictoriaMetrics does not have workflow orchestration. The `vmalert` component performs periodic rule evaluation (alerting and recording), which involves multiple steps:
1. Query datasource
2. Compare results to thresholds
3. Update alert state
4. Send notifications

However, this is evaluation-timer driven, not a job queue with state persistence across steps. There is no DAG execution, saga pattern, or multi-step workflow state machine.

Evidence: `app/vmalert/rule/group.go:385-488` (group evaluation loop with ticker), `app/vmalert/rule/group.go:387-414` (eval function).

### 5. How is backpressure applied when the system is overloaded?

**Multiple backpressure mechanisms exist**:

1. **Concurrency limiting**: `writeconcurrencylimiter` uses a bounded channel (`lib/writeconcurrencylimiter/concurrencylimiter.go:95`) as a semaphore. Goroutines block when capacity is reached.

2. **Ingestion rate limiting**: `maxIngestionRate` flag limits samples per second (`app/vmagent/remotewrite/remotewrite.go:95-96`).

3. **Queue size limits**: `maxPendingBytesPerURL` limits disk queue size with oldest-block dropping (`lib/persistentqueue/persistentqueue.go:355-382`).

4. **Memory-based block limits**: `maxInmemoryBlocks` is calculated based on available memory (`app/vmagent/remotewrite/remotewrite.go:915-924`).

5. **Queue blocked metric**: `IsWriteBlocked()` returns true when in-memory queue is full and persistent queue is disabled (`lib/persistentqueue/fastqueue.go:94-101`).

Evidence: `lib/writeconcurrencylimiter/concurrencylimiter.go:19-24` (flags), `app/vmagent/remotewrite/remotewrite.go:402-409` (queue blockage check).

## Architectural Decisions

1. **FastQueue hybrid design**: In-memory channel queue for low latency, file-based fallback for durability. This prioritizes performance while preventing data loss during remote storage unavailability.

2. **Infinite retry with exponential backoff**: Remote write failures trigger indefinite retries rather than moving to a dead-letter queue, assuming temporary remote storage issues. This is appropriate for a metrics sink but would be inappropriate for job systems requiring completion.

3. **No job persistence beyond queue**: There is no named job concept. Work is tracked only as queue depth, not as discrete job objects with state.

4. **vmalert uses evaluation timers, not job queue**: Alert groups use `time.Ticker` for periodic evaluation, not a job queue. This is simpler but lacks job-level observability, deduplication, or failure isolation between evaluation cycles.

## Notable Patterns

1. **Chunked file persistent queue**: Queue data is stored in 500MB+ chunk files with JSON metainfo tracking read/write offsets (`lib/persistentqueue/persistentqueue.go:148-313`). This enables crash recovery without losing data.

2. **Protocol downgrade**: VictoriaMetrics automatically downgrades from ZSTD to Snappy compression on 400/415 responses from remote storage (`app/vmagent/remotewrite/client.go:460-476`).

3. **Concurrent queue workers**: `queues` flag controls concurrent HTTP clients per remote URL, with default of `2 * availableCPUs` (`app/vmagent/remotewrite/remotewrite.go:66-68`).

4. **Group evaluation concurrency**: vmalert rules within a group execute concurrently up to `Concurrency` limit via semaphore (`app/vmalert/rule/group.go:742`).

## Tradeoffs

1. **Infinite retry vs. dead-letter**: Indefinite retry works for metrics ingestion (eventual delivery is acceptable) but would be problematic for jobs requiring bounded completion time.

2. **No per-job visibility**: Queue depth metrics don't show individual item state. Users cannot query "how many attempts did this specific write request have?"

3. **Blocking vs. dropping**: When `disableOnDiskQueue=true`, writes block when the in-memory queue is full. This backpressure propagates to clients via HTTP 429, but doesn't provide sophisticated flow control.

4. **No workflow isolation**: A failed vmalert rule evaluation doesn't create an isolated failure domain — it affects the entire group evaluation cycle.

## Failure Modes / Edge Cases

1. **Queue overflow**: When `maxPendingBytesPerURL` is exceeded, oldest blocks are silently dropped (`lib/persistentqueue/persistentqueue.go:374-376`). No DLQ, no alert.

2. **Remote storage 409/400/415**: Data is dropped without notification beyond rate-limited logs (`app/vmagent/remotewrite/client.go:450-455`).

3. **In-memory queue full + disk disabled**: `IsWriteBlocked()` returns true, causing `tryPush` to return false, triggering HTTP 429 to clients (`app/vmagent/remotewrite/remotewrite.go:402-409`).

4. **Unclean shutdown**: On `kill -9`, the queue file may contain unprocessed data that is recovered on restart via metainfo offset tracking (`lib/persistentqueue/persistentqueue.go:183-204`).

5. **Retry storm**: If remote storage is unavailable, exponential backoff caps at `retryMaxInterval` (default 1 minute), but with many vmagent instances, this could still generate significant retry traffic.

## Future Considerations

1. **Dead-letter queue**: A DLQ for exhausted remote write retries would provide visibility and data recovery options for operators.

2. **Per-request retry metadata**: Tracking attempt counts per block would help debugging and provide richer observability.

3. **Job scheduling in vmalert**: vmalert's current timer-based evaluation lacks the sophistication of a proper job scheduler (no cron expressions, no catchup window handling, no schedule overlap policies).

## Questions / Gaps

1. **No evidence found** for a dead-letter queue mechanism. All failed blocks are either retried indefinitely or silently dropped.

2. **No evidence found** for workflow orchestration or DAG-based multi-step processing.

3. **No evidence found** for job cancellation with graceful timeout — cancellation via `stopCh` is immediate (with 5s grace for in-flight).

4. **No evidence found** for job priority or preemption — all queued data is treated equally (FIFO).

5. **Partial evidence** for retry budgets — the `retryMaxInterval` caps backoff but doesn't enforce a maximum retry count.

---

Generated by `dimensions/05-background-jobs-async-workflows.md` against `victoriametrics`.