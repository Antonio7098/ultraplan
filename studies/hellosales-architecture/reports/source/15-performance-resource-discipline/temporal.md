# Source Analysis: temporal

## Performance & Resource Discipline

### Source Info

| Field | Value |
|-------|-------|
| Name | temporal |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/temporal` |
| Language / Stack | Go 1.26.2 |
| Analyzed | 2026-05-20 |

## Summary

Temporal implements a distributed workflow engine with several performance-conscious patterns. The system uses LRU caching with TTL support, a generic stream batcher for batching I/O operations, slice reuse patterns to reduce allocations, and lock-free atomic operations throughout. Profiling is enabled via pprof with a dedicated metrics reporter for runtime statistics. Batching is configurable via dynamic configuration, and the codebase includes benchmark tests for key hot paths. However, sync.Pool is not used for object pooling, and there is no CI-based performance regression detection.

## Rating

**6/10** — Basic implementation with gaps. Temporal demonstrates solid foundational patterns (LRU cache, stream batcher, slice reuse, atomic operations) but lacks explicit object pooling with sync.Pool and lacks a systematic performance regression testing culture.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| LRU Cache | Concurrent fixed-size LRU with TTL, background eviction, and pinning support | `common/cache/lru.go:30-47` |
| Stream Batcher | Generic batch processor with MaxItems, MinDelay, MaxDelay, IdleTime controls | `common/stream_batcher/batcher.go:31-43` |
| Slice Reuse | `clear(items)` and slice reset pattern to reuse memory | `common/stream_batcher/batcher.go:111-113` |
| Slice Reuse | `tasks = tasks[:0]` to avoid allocation in task reader | `service/matching/fair_task_reader.go:431` |
| Atomic Operations | `atomic.Pointer[chan struct{}]` for lock-free goroutine state | `common/stream_batcher/batcher.go:23` |
| Atomic Counters | `atomic.Int64` used extensively for concurrent counters (e.g., `total atomic.Int64`) | `service/matching/workers/registry_impl.go:58` |
| pprof Integration | HTTP pprof server initialized via atomic once pattern | `common/pprof/pprof.go:56-64` |
| Runtime Metrics | RuntimeMetricsReporter emits MemStats: Alloc, HeapAlloc, NumGC, PauseNs | `common/metrics/runtime.go:64-96` |
| Benchmark Tests | Multiple benchmark tests (RateLimiter, Mutex, Scheduler, etc.) | `common/quotas/bench_test.go:18-25` |
| Task Buffer | Buffered channel for task dispatch (size `GetTasksBatchSize()-1`) | `service/matching/task_reader.go:46` |
| Batch Config | `GetTasksBatchSize`, `MaxTaskDeleteBatchSize` via dynamic config | `service/matching/config.go:49,106` |
| Range Size | Task queue range size = 100000 for efficient batch retrieval | `service/matching/config.go:282` |
| Stream Batcher Config | User data batcher: MaxItems=100, MinDelay=100ms, MaxDelay=500ms | `service/matching/matching_engine.go:242-247` |

## Answers to Dimension Questions

### 1. How does the system avoid allocating memory proportional to data size?

Temporal uses several strategies to avoid linear memory allocation:

- **LRU cache with eviction** (`common/cache/lru.go:393-414`): The `tryEvictUntilEnoughSpaceWithSkipEntry` function evicts old entries when capacity is reached, preventing unbounded growth.

- **Slice reuse** in batch processing: The stream_batcher clears and reuses slices (`common/stream_batcher/batcher.go:111-113`):
  ```go
  clear(items)
  clear(resps)
  items, resps = items[:0], resps[:0]
  ```
  This avoids allocating new slices for each batch.

- **Task buffer with fixed capacity** (`service/matching/task_reader.go:46`): The task buffer is sized at `GetTasksBatchSize()-1`, not unbounded.

- **Bounded task queue ranges**: RangeSize of 100000 (`service/matching/config.go:282`) limits how many tasks are loaded at once.

**No evidence found** for sync.Pool usage for object pooling. The system relies on slice reuse and GC rather than explicit object pooling.

### 2. Where does the system buffer vs stream, and what drives the choice?

**Buffered patterns:**
- Task reader buffer channel (`service/matching/task_reader.go:46`): `taskBuffer: make(chan *persistencespb.AllocatedTaskInfo, backlogMgr.config.GetTasksBatchSize()-1)` — sized for batch processing
- User data batching in matching engine (`service/matching/matching_engine.go:242-247`): Uses stream_batcher with timing-based flush (MinDelay=100ms, MaxDelay=500ms)

**Streaming patterns:**
- Stream batcher (`common/stream_batcher/batcher.go`): Processes items in batches with time-based boundaries rather than accumulating unbounded data
- Task GC with batch deletion (`service/matching/task_gc.go:64-73`): Deletes tasks in bounded batches of `MaxTaskDeleteBatchSize`

**Choice drivers:**
- Time-based flushing: MinDelay, MaxDelay provide trade-off between latency and throughput
- Size-based limits: MaxItems cap prevents memory bloat
- Idle timeout: IdleTime of 1 minute causes goroutine exit for dormant batchers (`common/stream_batcher/batcher.go:42`)

### 3. How are batch sizes tuned and what happens at batch boundaries?

Batch sizes are configurable via dynamic configuration:

| Batch Type | Config Key | Default | File:Line |
|-----------|------------|---------|-----------|
| Task fetch | `MatchingGetTasksBatchSize` | 100 (inferred) | `service/matching/config.go:287` |
| Task deletion | `MatchingMaxTaskDeleteBatchSize` | (inferred from grep) | `service/matching/config.go:296` |
| Range size | `RangeSize` | 100000 | `service/matching/config.go:282` |
| User data batch | `MaxItems` | 100 | `service/matching/matching_engine.go:243` |

**Batch boundary behavior:**
- Stream batcher (`common/stream_batcher/batcher.go:129-143`): Triggers flush when MaxItems reached, MinDelay elapses, or MaxDelay expires
- Task reader (`service/matching/task_reader.go:169-174`): When batch is empty, updates ack level and signals for more
- Task GC (`service/matching/task_gc.go:79-87`): When `n < batchSize`, assumes completion and stops deleting

**No evidence found** for adaptive batch tuning based on latency/throughput feedback.

### 4. Is there a performance regression testing culture?

**Evidence of benchmarks:**
- Multiple benchmark tests exist across the codebase:
  - `common/tasks/benchmark_test.go:33-59` — InterleavedWeightedRoundRobinScheduler benchmarks
  - `common/quotas/bench_test.go:18-25` — RateLimiter benchmarks
  - `common/locks/id_mutex_test.go:26-71` — Mutex benchmarks
  - `common/future/future_test.go:24-52` — Future benchmarks
  - `service/matching/ack_manager_test.go:179-215` — AckManager benchmarks

**No evidence found** for:
- CI-based performance regression detection
- Performance benchmarks in test suite that fail on regression
- Dedicated performance testing infrastructure (e.g., benchstat, performance dashboard)

Benchmarks exist but appear to be for developer optimization rather than automated regression detection.

### 5. What profiling tools are used to identify bottlenecks?

**pprof integration** (`common/pprof/pprof.go:40-65`):
- HTTP server on configurable host:port
- Atomic once initialization pattern prevents duplicate startup
- Standard `net/http/pprof` import

**Runtime metrics reporter** (`common/metrics/runtime.go:64-96`):
- Periodic emission of runtime.MemStats
- Metrics emitted: Alloc, HeapAlloc, HeapObjects, HeapIdle, HeapInuse, HeapReleased, StackInuse, Mallocs, Frees
- GC metrics: NumGC, PauseNs (with per-GC pause histogram for last 256 GCs)
- Go routine count, GOMAXPROCS

**Deadlock detector** (`common/deadlock/deadlock.go`):
- Uses pprof.Lookup("goroutine") to detect potential deadlocks

**No evidence found** for:
- Distributed tracing (OpenTelemetry integration exists but not studied here)
- Continuous profiling in production
- Heap profiling for allocation analysis

## Architectural Decisions

1. **Generic stream_batcher over specialized pools**: Temporal chose a generic batcher with timing controls rather than sync.Pool for object reuse. This simplifies code but may allocate more garbage.

2. **Dynamic configuration for batch sizes**: Batch sizes are configurable at runtime via dynamicconfig, allowing tuning without restarts (`service/matching/config.go:49,106,282`).

3. **LRU cache with background eviction**: Cache (`common/cache/lru.go:177-179`) runs background eviction loop to keep memory bounded, with `MaxEntryPerCall` limiting lock hold time (`common/cache/lru.go:472-496`).

4. **Lock-free atomic operations over mutexes**: Heavy use of `atomic.Int64`, `atomic.Value`, and `atomic.Pointer` for concurrent access, particularly in hot paths like task readers and rate limiters.

5. **Buffered channels for task dispatch**: Task buffer uses buffered channels instead of explicit streaming, trading memory for latency reduction (`service/matching/task_reader.go:46`).

## Notable Patterns

1. **Slice reuse to reduce allocations** (`common/stream_batcher/batcher.go:111-113`):
   ```go
   clear(items)
   clear(resps)
   items, resps = items[:0], resps[:0]
   ```

2. **Time-bounded batch flushing** (`common/stream_batcher/batcher.go:31-43`):
   - MaxItems prevents unbounded accumulation
   - MinDelay ensures low latency for sparse traffic
   - MaxDelay ensures throughput for busy periods
   - IdleTime releases resources for dormant streams

3. **Atomic goroutine lifecycle** (`common/stream_batcher/batcher.go:65-76`):
   - Uses atomic.Pointer to track running state
   - CompareAndSwap to ensure only one goroutine starts
   - Channel close to signal exit

4. **Background eviction with bounded work** (`common/cache/lru.go:472-496`):
   - Limits entries processed per call with MaxEntryPerCall
   - Prevents holding cache lock for extended periods

## Tradeoffs

1. **Slice reuse vs explicit pooling**: Temporal uses slice reset (`items[:0]`) rather than sync.Pool. This generates more garbage but simplifies code and avoids pool fragmentation issues.

2. **Buffered channels vs pure streaming**: Task buffer uses fixed-size channels, which bounds memory but can throttle when full. Pure streaming might handle burst better at the cost of more complex flow control.

3. **Time-based batching tradeoffs**: MinDelay=100ms adds latency for sparse traffic; MaxDelay=500ms bounds memory for busy traffic. No adaptive tuning based on load.

4. **Periodic runtime metrics vs continuous profiling**: RuntimeMetricsReporter samples every `reportInterval`, catching trends but missing transient spikes. Full pprof available on demand but not continuously collected.

## Failure Modes / Edge Cases

1. **Batch boundary race** (`service/matching/task_gc.go:82`): When `n < batchSize`, assumes queue is complete. If persistence layer returns incorrect row count, could leave tasks unacknowledged.

2. **Idle goroutine exit** (`common/stream_batcher/batcher.go:116-123`): If no items arrive within IdleTime, batcher goroutine exits. Next Add must restart it, adding latency for occasional traffic.

3. **Cache memory pressure** (`common/cache/lru.go:349-355`): If pinned entries consume entire cache, `ErrCacheFull` returned for new puts. No eviction of pinned entries.

4. **Background eviction starvation** (`common/cache/lru.go:495-496`): If many expired entries but MaxEntryPerCall is small, eviction may not keep up with growth during idle periods.

## Future Considerations

1. **Consider sync.Pool for hot objects**: If profiling shows allocation pressure in hot paths (e.g., task processing), introducing sync.Pool for frequently allocated structs could reduce GC pressure.

2. **Adaptive batch sizing**: Current batch sizes are static. Adaptive tuning based on latency/throughput feedback could improve resource utilization.

3. **Continuous profiling**: Currently pprof is on-demand. Adding continuous profiling with sampling could catch regressions before users notice.

4. **Performance regression CI**: Benchmark tests exist but aren't run in CI for regression detection. Integrating with benchstat could provide this.

## Questions / Gaps

1. **No sync.Pool usage found**: Is there a conscious decision to avoid object pooling, or is it an oversight? What profiling led to this choice?

2. **No evidence of memory allocation tracking**: Are there any heap profiles or allocation traces used during development?

3. **Batch size tuning methodology**: How were default batch sizes (100, 100000) determined? Is there empirical data?

4. **No evidence of profiling in production**: Is pprof enabled in production deployments, or is it development-only?

---

Generated by `dimensions/15-performance-resource-discipline.md` against `temporal`.