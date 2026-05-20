# Source Analysis: victoriametrics

## Performance & Resource Discipline

### Source Info

| Field | Value |
|-------|-------|
| Name | victoriametrics |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/victoriametrics` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

VictoriaMetrics demonstrates exceptional resource discipline across its codebase. It employs extensive `sync.Pool` usage for memory reuse, level-based buffer pools to avoid allocating memory proportional to data size, streaming parsers for data ingestion, and a sophisticated batching/flush strategy for ingested data. The project embeds pprof handlers for profiling and maintains 474 benchmark tests across the codebase.

## Rating

**9/10** — Excellent, exemplar implementation. The system shows deep commitment to resource discipline with comprehensive pooling strategies, streaming I/O, configurable batch boundaries, and embedded profiling support. Minor gaps exist in allocation-reducing slice reuse patterns.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| sync.Pool usage | timerPool for Timer reuse | `lib/timerpool/timerpool.go:30` |
| sync.Pool usage | leveled byte buffer pools (10 tiers) | `lib/leveledbytebufferpool/pool.go:20` |
| sync.Pool usage | bufio.Reader pool for file reads | `lib/filestream/filestream.go:185` |
| sync.Pool usage | bufio.Writer pool for file writes | `lib/filestream/filestream.go:346` |
| sync.Pool usage | compressed/decompressed buffer pools | `lib/protoparser/protoparserutil/compress_reader.go:137-139` |
| sync.Pool usage | 50+ sync.Pool usages across lib/ | `lib/*pool*.go` (multiple files) |
| Streaming | bufio.Reader-based stream parser | `lib/protoparser/prometheus/stream/streamparser.go:80` |
| Streaming | Stream context pooling | `lib/protoparser/prometheus/stream/streamparser.go:135` |
| Streaming | Concurrent unmarshal work scheduling | `lib/protoparser/prometheus/stream/streamparser.go:54` |
| Batching | pendingRowsFlushInterval=2s | `lib/storage/partition.go:49` |
| Batching | dataFlushInterval=5s (configurable) | `lib/storage/partition.go:52` |
| Batching | maxRawRowsPerShard=8MB limit | `lib/storage/partition.go:72` |
| Batching | rawRowsShardsPerPartition=CPU-count | `lib/storage/partition.go:46` |
| Buffer sizing | Dynamic read buffer based on memory | `lib/filestream/filestream.go:38-44` |
| Buffer sizing | Dynamic write buffer based on memory | `lib/filestream/filestream.go:51-57` |
| Buffer sizing | 64KB default bufio sizes | `lib/filestream/filestream.go:126`, `lib/bufferedwriter/bufferedwriter.go:22` |
| Profiling | pprof endpoints exposed via httpserver | `lib/httpserver/httpserver.go:447-552` |
| Profiling | Auth-key protected pprof access | `lib/httpserver/httpserver.go:57` |
| Profiling | 474 benchmark tests across codebase | `lib/*_timing_test.go` (multiple files) |
| Profiling | BenchmarkOptimizedReMatchCost with documented cost table | `lib/storage/tag_filters.go:634` |
| Zero-allocation reuse | ByteBufferPool for []byte reuse | `lib/bytesutil/bytebuffer.go:128-143` |
| Zero-allocation reuse | Raw rows marshaler pool | `lib/storage/raw_row.go:138-146` |
| Zero-allocation reuse | Decompressed buffer pool with size-gating | `lib/protoparser/protoparserutil/compress_reader.go:79-84` |
| Chunked reading | ChunkedBuffer for slow readers | `lib/protoparser/protoparserutil/compress_reader.go:104-106` |
| Compression pools | zstd, gzip, zlib, snappy reader pools | `lib/protoparser/protoparserutil/compress_reader.go:205-305` |

## Answers to Dimension Questions

### 1. How does the system avoid allocating memory proportional to data size?

VictoriaMetrics uses multiple strategies to avoid O(data size) memory allocation:

**Leveled buffer pools** (`lib/leveledbytebufferpool/pool.go:20`): Instead of allocating buffers sized to input data, the system maintains 10 pools for byte slices of specific capacity ranges (0-256, 257-512, 513-1024, etc.). When a buffer of a given size is needed, it retrieves from the appropriate pool and is returned there after use.

**sync.Pool for short-lived objects** (`lib/timerpool/timerpool.go:30`, `lib/filestream/filestream.go:185`): Timers, bufio Readers/Writers, compression readers, and parse work structs are all pooled via sync.Pool and reused across operations.

**Dynamic buffer sizing** (`lib/filestream/filestream.go:38-57`): Read/write buffer sizes are computed as `memory.Allowed()/1024/64` (read) or `/8` (write), clamped between 4KB and 64KB/128KB. This prevents small machines from over-allocating buffers.

**maxRawRowsPerShard cap** (`lib/storage/partition.go:72`): The maximum raw rows per shard is fixed at 8MB divided by sizeof(rawRow{}), preventing unbounded memory growth during ingestion spikes.

### 2. Where does the system buffer vs stream, and what drives the choice?

**Streaming (bufio.Reader/Writer pools)**:
- File I/O: `lib/filestream/filestream.go:67-68` — bufio.Reader and Writer wrap file operations with pooling
- Data ingestion parsers: `lib/protoparser/prometheus/stream/streamparser.go:80` — Prometheus exposition format parsed via streaming bufio.Reader

**Buffered (chunked with size limits)**:
- Compression decompression: `lib/protoparser/protoparserutil/compress_reader.go:100-133` — Uses ChunkedBuffer for reading from potentially slow readers, then copies to a pooled ByteBuffer for CPU-bound processing
- HTTP responses: `lib/bufferedwriter/bufferedwriter.go:22` — 64KB buffers for moderately big HTTP responses

**Choice rationale**:
- Streaming preferred for I/O operations where the cost is syscall overhead vs. memory for buffering
- Buffering used when: (a) data needs to be decompressed/transformed as a whole, (b) the consumer is CPU-bound and needs contiguous memory, or (c) network performance benefits from larger writes
- Comment at `lib/protoparser/protoparserutil/compress_reader.go:104-105`: "Use chunkedbuffer for reading the data from potentially slow lr. This should reduce memory fragmentation and memory usage when reading large amounts of data from slow lr."

### 3. How are batch sizes tuned and what happens at batch boundaries?

**Ingestion batching** (`lib/storage/partition.go`):
- `pendingRowsFlushInterval = 2s` (`partition.go:49`): Raw rows are flushed to in-memory parts after this interval or when the shard is full (8MB)
- `dataFlushInterval = 5s` (default, configurable via `SetDataFlushInterval`) (`partition.go:52`): Guaranteed flush from memory to disk
- `maxRawRowsPerShard = 8MB / sizeof(rawRow{})` (`partition.go:72`): Size-based trigger for flush

**Partition sharding** (`lib/storage/partition.go:46`): `rawRowsShardsPerPartition = cgroup.AvailableCPUs()` — batching is parallelized across CPU cores to reduce contention

**Batch boundaries**: When rawRowsPerShard fills up, `rawRowsShard.addRows` returns rowsToFlush (`lib/storage/partition.go:573`). The flush is performed by `flushRowssToInmemoryParts` which converts batches to immutable in-memory parts.

**Insert batching** (`lib/storage/storage.go:1662`): `maxMetricRowsPerBlock` pre-allocated array size for marshaling rows

### 4. Is there a performance regression testing culture?

**Yes.** Evidence includes:
- **474 benchmark tests** across the codebase (`lib/*_timing_test.go` files)
- **Documented performance-characterized regex costs**: `lib/storage/tag_filters.go:634` shows "These values are obtained from BenchmarkOptimizedReMatchCost benchmark"
- **Explicit benchmark regression checks**: `lib/uint64set/uint64set_timing_test.go:267` has `BenchmarkSetAddWithAllocs` vs `BenchmarkMapAddNoAllocs` comparing allocation behavior
- **memprofile comments in tests**: `lib/protoparser/opentelemetry/stream/streamparser_timing_test.go:98` shows how to run memory profiling on benchmarks
- **pprof integration** for runtime profiling: `lib/httpserver/httpserver.go:447-552` exposes `/debug/pprof/*` endpoints

### 5. What profiling tools are used to identify bottlenecks?

**Built-in pprof endpoints** (`lib/httpserver/httpserver.go:447-552`):
- `/debug/pprof/profile` — CPU profiling
- `/debug/pprof/heap` — Memory allocation profiling
- `/debug/pprof/mutex` — Mutex contention profiling
- `/debug/pprof/trace` — Execution trace
- `/debug/pprof/cmdline`, `/debug/pprof/symbol` — Process info
- Auth-key protected (`-pprofAuthKey` flag) to prevent unauthorized access

**Benchmark tests** with `-benchmem` flags for allocation tracking

**Internal metrics** for runtime behavior (`vm_filestream_read_duration_seconds_total`, `vm_protoparser_read_calls_total`, etc.) at `lib/filestream/filestream.go:133-140`

## Architectural Decisions

1. **LeveledByteBufferPool over simple sync.Pool**: VictoriaMetrics uses 10 sized pools instead of one generic pool. This prevents wasting memory when small buffers are returned to a pool that would give them back at a larger size. (`lib/leveledbytebufferpool/pool.go:20`)

2. **Raw row sharding by CPU count**: `rawRowsShardsPerPartition = cgroup.AvailableCPUs()` (`lib/storage/partition.go:46`) allows lock-free writes per shard, reducing CPU contention on multi-core ingest.

3. **Streaming parsers with work scheduling**: The Prometheus parser (`lib/protoparser/prometheus/stream/streamparser.go`) reads lines into a buffer and schedules unmarshal work concurrently via `protoparserutil.ScheduleUnmarshalWork`, avoiding parsing bottlenecks.

4. **Pooled compression readers with size eviction**: Decompression reader pools (`lib/protoparser/protoparserutil/compress_reader.go`) include a check at return time: if `cap > 1MB && cap > 4*len`, the buffer is discarded rather than returned to the pool to reduce memory waste.

5. **Two-stage flush for ingestion durability**: `pendingRowsFlushInterval=2s` for visibility, `dataFlushInterval=5s` for crash survival (`lib/storage/partition.go:49,52`), allowing tuning for different durability requirements.

## Notable Patterns

1. **Lazy reset + pool return**: Objects are reset before being returned to pools (e.g., `lib/protoparser/prometheus/stream/streamparser.go:130-132`), preventing stale data from leaking.

2. **Concurrency-limiting reader wrapper**: `writeconcurrencylimiter.GetReader/PutReader` (`lib/writeconcurrencylimiter/concurrencylimiter.go`) wraps readers to bound concurrent operations, preventing resource exhaustion.

3. **First-byte-reader for connection gate**: `ioutil.GetFirstByteReader` (`lib/ioutil/first_byte_reader.go`) waits for the first byte before acquiring concurrency tokens, preventing allocation for connections without data.

4. **Block-based persistent queue**: `lib/persistentqueue/persistentqueue.go` uses chunk files of `MaxBlockSize + 8 * 16` bytes, enabling O(1) queue operations and efficient disk usage.

5. **Memory-based dynamic buffer sizing**: `filestream.getReadBufferSize()` and `getWriteBufferSize()` scale buffers with available memory, using `sync.Once` for one-time computation.

## Tradeoffs

1. **Pool eviction policy**: VictoriaMetrics' approach of discarding oversized buffers (`cap > 1MB && cap > 4*len` at `lib/protoparser/protoparserutil/compress_reader.go:79`) is simple but may cause allocation churn during periods of variable-sized data.

2. **Sharded vs. simple ring buffer**: Using CPU-count shards (`rawRowsShardsPerPartition`) increases memory usage on high-core-count systems but reduces contention. No automatic fallback to a single shard under memory pressure.

3. **Sync.Pool GC behavior**: sync.Pool contents are garbage-collected when GC runs, which can cause latency spikes. The codebase mitigates this through large pool sizes and judicious use, but it remains an inherent tradeoff.

4. **Fixed flush intervals**: While `dataFlushInterval` is configurable, the fixed 2s internal flush interval (`pendingRowsFlushInterval`) cannot be lowered below a minimum, potentially causing latency spikes for low-throughput/high-resolution use cases.

## Failure Modes / Edge Cases

1. **OOM under memory pressure**: The leveled byte buffer pools don't have hard limits — if many differently-sized buffers are retained, total memory usage can grow beyond `memory.Allowed()`. No mechanism to force-evict from pools under pressure.

2. **bufio.Reader pool starvation**: If `getBufioReader` (`lib/filestream/filestream.go:170`) obtains a reader from the pool but an error occurs before `putBufioReader`, the reader may be leaked until GC reclaims it.

3. **Concurrent compression reader reset**: gzip/zlib readers in `lib/protoparser/protoparserutil/compress_reader.go` are reset via `Reader.Reset()` — if multiple goroutines misuse the same pooled reader, race conditions could occur (mitigated by pool-per-call pattern, not pool-per-thread).

4. **Flush deadline jitter avoidance**: Comment at `lib/storage/partition.go:1111` notes "Do not add jitter to d in order to guarantee the flush interval" — but if many partitions flush simultaneously (common at startup), disk I/O can become a bottleneck.

5. **Snappy block mode requirement**: Snappy reader (`lib/protoparser/protoparserutil/compress_reader.go:252-254`) reads all data before decompressing because "streaming snappy encoding is incompatible with block snappy encoding" — this buffers the entire compressed block in memory.

## Future Considerations

1. **Memory-bounded pool limits**: Implement hard limits on total pooled bytes per pool, with LRU eviction when limits are exceeded.

2. **Metrics for pool health**: Expose metrics for pool hit/miss rates, bytes retained, and objects in flight to aid capacity planning.

3. **Automatic buffer size tuning**: Use recent pprof data to adjust buffer sizes automatically rather than static `memory.Allowed()/N` calculations.

4. **Streaming decompression**: Investigate streaming decompression for snappy to remove the need to buffer entire compressed blocks.

5. **Jittered flush with bounded coalescing**: Add small random jitter to flush deadlines across partitions to spread I/O load, while guaranteeing maximum flush delay.

## Questions / Gaps

1. **No evidence found** for a formal performance regression CI pipeline that runs benchmarks on every PR and fails on regressions. The benchmarks exist but their execution in CI is not verified in this study.

2. **No evidence found** for a memory allocation budget (e.g., ``-memlimit`` for the entire process combined with per-component budgets). The `memory.Allowed()` is used for buffer sizing but there's no enforcement mechanism.

3. **No evidence found** for per-request memory limits in the ingestion path — while `maxSnappyBlockSize` limits compressed data to 56MB (`lib/protoparser/protoparserutil/compress_reader.go:27`), the decompressed size limit (`maxDataSize`) is checked after decompression, meaning a malicious client could cause temporary memory spikes.

4. **Limited evidence** for zero-copy slice reuse in hot paths. While `bytesutil.ToUnsafeString` suggests awareness of zero-copy, the `rawRowsMarshaler` at `lib/storage/raw_row.go` marshals into a fresh buffer rather than reusing from a pool.

---

Generated by `dimensions/15-performance-resource-discipline.md` against `victoriametrics`.