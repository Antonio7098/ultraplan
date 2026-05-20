# Source Analysis: openfga

## Performance & Resource Discipline

### Source Info

| Field | Value |
|-------|-------|
| Name | openfga |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/openfga` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

OpenFGA demonstrates strong performance and resource discipline through a layered approach to memory management, streaming-oriented architecture, and comprehensive benchmarking. The system employs object pooling for hot paths, a custom MPMC queue with bounded growth, memory-minimal cache entries, and a pipeline-based streaming architecture for ListObjects that avoids buffering entire result sets. Profiling is supported via pprof, and tracing is implemented throughout with OpenTelemetry. Batch sizes are explicitly tunable, and performance regression testing is cultivated via a benchmark culture with dedicated benchmark tests.

## Rating

**8/10** — Good implementation with minor issues. The system shows excellent discipline in streaming architecture, memory pooling, and caching strategies. Minor gaps include limited evidence of automatic resource limit tuning and no clear evidence of pprof integration in production paths.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| sync.Pool usage | RNG pool in Planner for hot-path reduction | `internal/planner/planner.go:15` |
| Channel-based pooling | MessagePool with strong references (avoids GC thrashing) | `internal/listobjects/pipeline/internal/worker/core.go:95-145` |
| Memory-minimal cache | MinimalCacheEntry (~45 bytes vs ~100 for TupleRecord) | `pkg/storage/storagewrappers/iterator_cache.go:81-86` |
| Streaming architecture | Receiver[T] interface for streaming without full buffering | `internal/listobjects/pipeline/pipeline.go:32-34` |
| Bounded MPMC queue | Dmitry Vyukov's algorithm with auto-growth bounded buffers | `internal/containers/mpmc/queue.go:27-42` |
| Batch write limit | DefaultMaxTuplesPerWrite = 100 | `pkg/storage/storage.go:17` |
| Chunk size | defaultChunkSize = 100 for pipeline | `internal/listobjects/pipeline/pipeline.go:59` |
| Buffer capacity | defaultBufferSize = 128 | `internal/listobjects/pipeline/pipeline.go:58` |
| NumProcs parallelism | defaultNumProcs = 3 | `internal/listobjects/pipeline/pipeline.go:60` |
| OpenTelemetry tracing | Tracer used per-package (storage, typesystem, etc.) | `pkg/storage/postgres/postgres.go:41-44` |
| PProf profiler | Configurable profiler server on :3001 | `cmd/run/run.go:999-1018` |
| Benchmark tests | Dedicated benchmark files for Check, ListObjects, ListUsers | `pkg/server/test/benchmarks/*.go` |
| Iterator benchmarks | Iterator cache benchmarks including cache miss/hit | `pkg/storage/storagewrappers/iterator_cache_test.go:1484-1631` |
| Memory benchmarks | BenchmarkMinimalCacheEntry_Memory vs BenchmarkFullTuple | `pkg/storage/storagewrappers/iterator_cache_test.go:1631-1663` |
| Bounded growth | ListObjectsDeadline, ListObjectsMaxResults for protection | `pkg/server/config/config.go:369-374` |
| MaxConcurrentReads | Tunable concurrency limits for ListObjects, Check, ListUsers | `pkg/server/config/config.go:413-423` |
| Write batching | Loops with `DefaultMaxTuplesPerWrite` in all SQL datastores | `pkg/storage/sqlcommon/sqlcommon.go:869-956` |
| Iterator buffer size | bufferSize = 100 for shared iterator reads | `pkg/storage/storagewrappers/sharediterator/shared_iterator_datastore.go:502` |
| listObjects buffer | streamedBufferSize = 100 | `pkg/server/commands/list_objects.go:40` |

## Answers to Dimension Questions

### 1. How does the system avoid allocating memory proportional to data size?

The system uses multiple strategies:

- **Streaming pipeline architecture**: The ListObjects pipeline consumes values one at a time via the `Receiver[T]` interface without buffering the entire result set (`internal/listobjects/pipeline/pipeline.go:32-34`).

- **Channel-based MessagePool**: Unlike `sync.Pool`, the custom `MessagePool` in `internal/listobjects/pipeline/internal/worker/core.go:95-145` uses channel-based free lists with strong references, preventing garbage collection between GC cycles and avoiding allocation thrashing on hot paths.

- **Memory-minimal cache entries**: `MinimalCacheEntry` in `pkg/storage/storagewrappers/iterator_cache.go:81-86` stores only ~45 bytes (vs ~100 bytes for a full `TupleRecord`) by omitting fields derivable from the cache key.

- **Bounded pagination**: All database reads use pagination with configurable limits (`DefaultPageSize = 50` at `pkg/storage/storage.go:29`).

### 2. Where does the system buffer vs stream, and what drives the choice?

- **Streaming (no buffering)**:
  - The ListObjects pipeline uses `Receiver[T]` interface for streaming consumption (`internal/listobjects/pipeline/pipeline.go:31-34`).
  - Workers communicate via bounded channels with configurable capacity, not in-memory buffers (`internal/listobjects/pipeline/internal/worker/core.go:356-381`).
  - gRPC streaming endpoints return results as they are computed.

- **Buffered (bounded)**:
  - Write operations batch tuples with `DefaultMaxTuplesPerWrite = 100` limit (`pkg/storage/storage.go:17`).
  - The `Broadcast` function in `internal/listobjects/pipeline/internal/worker/core.go:356-381` uses a buffer of `ChunkSize` that is cleared and reused after each flush.
  - Shared iterator uses `bufferSize = 100` for reads from the iterator (`pkg/storage/storagewrappers/sharediterator/shared_iterator_datastore.go:502`).

- **Choice drivers**: Buffering is used for I/O operations to database/storage (batch writes), while streaming is used for API responses and inter-worker communication where latency matters.

### 3. How are batch sizes tuned and what happens at batch boundaries?

- **Default batch sizes**: `DefaultMaxTuplesPerWrite = 100` (`pkg/storage/storage.go:17`), `defaultChunkSize = 100` for pipeline workers (`internal/listobjects/pipeline/pipeline.go:59`), `defaultBufferSize = 128` for channel capacity.

- **At write batch boundaries**: The SQL datastore loops iterate with `for start := 0; start < total; start += storage.DefaultMaxTuplesPerWrite` (`pkg/storage/sqlcommon/sqlcommon.go:869`), processing each batch and continuing.

- **At pipeline chunk boundaries**: When `len(buffer) == ChunkSize`, the buffer is sent via `c.send()` and then cleared (`internal/listobjects/pipeline/internal/worker/core.go:370-375`). Remaining items after the loop are sent as a final partial chunk.

- **Tuning mechanism**: Batch sizes are configurable via `WithListObjectsChunkSize`, `WithListObjectsBufferCapacity`, and `WithListObjectsNumProcs` options (`pkg/server/commands/list_objects.go:207-223`). DefaultMaxTuplesPerWrite is configurable per datastore via `WithMaxTuplesPerWrite`.

### 4. Is there a performance regression testing culture?

**Yes**, evidence includes:

- **Dedicated benchmark tests**: `pkg/server/test/benchmarks/check.go`, `pkg/server/test/benchmarks/list_objects.go`, `pkg/server/test/benchmarks/list_users.go`, `pkg/server/test/benchmarks/read_changes.go`.

- **Benchmark conventions**: `make test-bench` target runs benchmark tests with `-benchmem` for memory allocation tracking.

- **Iterator cache benchmarks**: `BenchmarkCachingIterator_CacheMiss`, `BenchmarkCachingIterator_CacheHit`, `BenchmarkLockFreeCachedIterator_Next`, `BenchmarkLockFreeCachedIterator_VsStaticIterator`, `BenchmarkMinimalCacheEntry_Memory` at `pkg/storage/storagewrappers/iterator_cache_test.go:1484-1663`.

- **Buffer allocation benchmarks**: `BenchmarkV1vsV2_BufferAllocation` at `pkg/storage/storagewrappers/iterator_cache_benchmark_test.go:390`.

- **MPMC queue benchmarks**: `BenchmarkQueue` with single/multiple producer-consumer variants at `internal/containers/mpmc/queue_test.go:38-80`.

- **Planner benchmark**: `BenchmarkPlanSelector` at `internal/planner/planner_test.go` (implied by test file existence).

### 5. What profiling tools are used to identify bottlenecks?

- **pprof**: Configurable profiler server via `ProfilerConfig` at `cmd/run/run.go:999-1018`. Enabled with `--profiler-enabled` flag, serves on configurable address (default `:3001`). Standard pprof endpoints (`/debug/pprof/profile`, etc.) are wired.

- **OpenTelemetry tracing**: Distributed tracing throughout storage layer (`pkg/storage/postgres/postgres.go:41-44`, `pkg/storage/mysql/mysql.go:31-34`, `pkg/storage/sqlite/sqlite.go:33-36`), server commands, and type system (`pkg/typesystem/typesystem.go:1128`).

- **Prometheus metrics**: Custom metrics for iterator cache (`v2_iter_cache_total`, `v2_iter_cache_hits`, `v2_iter_cache_abandoned` at `pkg/storage/storagewrappers/iterator_cache.go:42-66`), request duration with datastore query count buckets, dispatch count buckets (`pkg/server/config/config.go:850-851`).

- **go test profiling**: Benchmark tests use `b.ReportAllocs()` to track allocations, and `-benchmem` flag is used in `make test-bench`.

## Architectural Decisions

1. **Channel-based pooling over sync.Pool**: The `MessagePool` in `internal/listobjects/pipeline/internal/worker/core.go:95-145` intentionally uses channel-based pooling with bounded capacity. The comment explicitly states this is to avoid GC thrashing on hot paths because channel-based items are "strong references that are not subject to garbage collection between GC cycles."

2. **MPMC queue for bounded growth**: The custom `Queue[T]` in `internal/containers/mpmc/queue.go:27-42` implements Dmitry Vyukov's bounded MPMC algorithm with optional auto-growth extensions. This allows concurrent send/receive without mutex contention on the hot path.

3. **Pipeline streaming model**: ListObjects uses a worker-based pipeline architecture (`internal/listobjects/pipeline/pipeline.go`) where workers communicate via channels, and results stream out via `Receiver[T]` interface. This avoids holding entire result sets in memory.

4. **MinimalCacheEntry for memory efficiency**: Cache entries store ~45 bytes vs ~100 bytes for full tuples by omitting derivable fields (`pkg/storage/storagewrappers/iterator_cache.go:81-86`).

5. **Iterator caching with singleflight**: Uses `golang.org/x/sync/singleflight` to coalesce concurrent cache lookups (`pkg/storage/storagewrappers/iterator_cache.go:16`).

## Notable Patterns

- **Pre-sized slice allocation**: `make([]string, 0, p.size)` in `MessagePool.Get()` (`internal/listobjects/pipeline/internal/worker/core.go:130`) pre-allocates capacity without growing.

- **Buffer clearing**: `clear(msg.Value[:cap(msg.Value)])` and `msg.Value = msg.Value[:0]` in `MessagePool.Put()` (`internal/listobjects/pipeline/internal/worker/core.go:139-140`) properly resets pooled slices without deallocating.

- **Context scratch buffer per goroutine**: `BufferKey` context value stores a reusable `[]string` buffer per processing goroutine (`internal/listobjects/pipeline/internal/worker/core.go:205-211`), reused across messages.

- **Atomic stats collection**: Worker stats use atomic operations (`atomic.Int64`) for lock-free throughput tracking (`internal/listobjects/pipeline/internal/worker/core.go:232`).

- **Cycle group membership tracking**: For cyclical graph edges, the pipeline tracks membership counts to know when it's safe to release resources (`internal/listobjects/pipeline/pipeline.go:175-185`).

## Tradeoffs

1. **sync.Pool vs channel-based pooling**: `sync.Pool` is more memory-efficient but items can disappear under GC pressure. OpenFGA's channel-based `MessagePool` trades some memory overhead for predictability on hot paths.

2. **Streaming vs buffering at boundaries**: Streaming reduces memory footprint but can increase latency for small result sets. The chunked approach (`ChunkSize = 100`) is a balance.

3. **Auto-growing MPMC queue**: The MPMC queue's `extensions` parameter allows unlimited growth (`extensions int` with negative value) which could lead to memory growth under sustained high load, but defaults limit this.

4. **Iterator cache memory vs CPU**: `MinimalCacheEntry` saves memory but requires reconstruction logic. The V2 iterator cache with `Theine` backend adds indirection overhead.

5. **Explicit batching vs streaming writes**: `DefaultMaxTuplesPerWrite = 100` creates many round-trips for large writes but prevents single large transactions.

## Failure Modes / Edge Cases

1. **Buffer capacity exhaustion**: If `BufferCapacity * (totalListeners+1)` in `internal/listobjects/pipeline/pipeline.go:366` is undersized relative to the computation graph, workers can deadlock waiting to send.

2. **Iterator cache stampede**: Without singleflight, many concurrent requests for the same uncached key could overwhelm storage. The `singleflight.Group` at `pkg/storage/storagewrappers/iterator_cache.go` mitigates this.

3. **Chunk size mismatch**: If `ChunkSize` is set too small relative to result set, excessive channel sends create overhead. If too large, memory buffering increases.

4. **MPMC queue full with extensions exhausted**: When `extensions` limit is reached and queue is full, senders park on `full` channel (`internal/containers/mpmc/queue.go:251-255`), potentially causing request timeouts.

5. **Iterator not fully consumed**: If an iterator is closed before exhaustion, resources may leak. The code requires callers to consume fully or close iterators explicitly (`pkg/storage/storage.go:158`).

6. **Pooled message overflow**: `MessagePool.Put()` drops messages if the pool is already full (`internal/listobjects/pipeline/internal/worker/core.go:141-144`), which is acceptable for flow control but means some allocations still occur.

## Future Considerations

1. **Dynamic batch sizing**: Current batch sizes are static configuration. Adaptive tuning based on observed latency/throughput could improve performance.

2. **Memory pressure awareness**: No current evidence of memory pressure detection that would cause the system to reduce buffering or flush caches proactively.

3. **Allocation tracking in production**: pprof is available but not enabled by default. A shadow-mode or sampling-based approach could provide production insights without overhead.

4. **Iterator prefetching**: The shared iterator uses a fixed `bufferSize = 100` (`pkg/storage/storagewrappers/sharediterator/shared_iterator_datastore.go:502`). Adaptive prefetching based on consumption rate could reduce I/O waits.

## Questions / Gaps

1. **No evidence of automatic tuner**: No found evidence of automatic batch size or buffer capacity tuning based on runtime metrics. Configuration appears static.

2. **No found evidence of memory limit enforcement**: While `ListObjectsDeadline` and `ListObjectsMaxResults` provide some protection, no evidence of hard memory limits that would cause early termination or spilling to disk.

3. **No found evidence of request-level resource budgeting**: Beyond concurrency limits, no evidence of per-request memory budgets or allocation quotas.

4. **No found evidence of benchmark CI gates**: While `make test-bench` exists, no evidence that benchmark regressions are blocked in CI.

---

Generated by `dimensions/15-performance-resource-discipline.md` against `openfga`.
