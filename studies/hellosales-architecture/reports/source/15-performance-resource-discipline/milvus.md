# Source Analysis: milvus

## Performance & Resource Discipline

### Source Info

| Field | Value |
|-------|-------|
| Name | milvus |
| Path | `sources/milvus` |
| Language / Stack | Go + C++ (internal/core/) + Rust (tantivy) |
| Analyzed | 2026-05-20 |

## Summary

Milvus demonstrates strong performance and resource discipline across multiple dimensions: object pooling for memory allocation reduction, configurable batch processing throughout the data pipeline, streaming I/O with configurable buffer sizes, extensive benchmarking infrastructure, and pprof integration for profiling. The system uses jemalloc for memory management in the C++ core, sync.Pool for Go object reuse, and implements sophisticated write buffering strategies with flush thresholds. However, memory allocation proportional to data size remains a concern in some import paths, and the CGO boundary introduces overhead.

## Rating

**7/10** — Good implementation with minor issues. The system shows sophisticated resource management with pooling, batching, and profiling, but has some areas where allocation could be avoided (bulk imports, certain query paths).

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| sync.Pool (lexer/parser) | Lexer and parser objects pooled via sync.Pool to avoid repeated allocation | `internal/parser/planparserv2/pool.go:12-22` |
| sync.Pool (Allocation) | Allocation struct pool for segment allocation reuse | `internal/datacoord/segment_manager.go:47-51` |
| sync.Pool (logging) | Text encoder pool in zap logging | `pkg/log/zap_text_encoder.go:71` |
| CGO future manager | Active future manager with select-based multiplexing, defaultRegisterBuf=256 chosen from benchmark A/B runs | `internal/util/cgo/manager_active.go:17,52-64` |
| Jemalloc integration | Comprehensive jemalloc stats (allocated, active, resident, mapped, fragmentation, overhead) | `internal/util/segcore/jemalloc_stats.go:26-49` |
| Jemalloc metrics | Jemalloc metrics cached with 10s TTL to avoid frequent C calls | `internal/util/metrics/c_registry.go:124,182-187` |
| Batch size config | ExprEvalBatchSize and DeleteDumpBatchSize configurable with runtime callbacks | `internal/util/initcore/init_core.go:626-640` |
| Buffer size constants | 32MB default read/write buffer, 10MB multipart upload, 1KB column group threshold | `internal/storagev2/packed/constant.go:19-25` |
| Pprof integration | pprof endpoints exposed via HTTP server with mutex/block profiling enabled | `internal/http/server.go:294-297` |
| Benchmark tests | Extensive benchmark suite: 138 benchmark functions across storage, query, parser, and chain modules | `internal/parser/planparserv2/benchmark_optimization_test.go:82` |
| Write buffer | InsertBuffer with sizeLimit threshold for flush decisions | `internal/flushcommon/writebuffer/insert_buffer.go:92` |
| Streaming WAL | Write-ahead buffer with configurable size metrics | `internal/streamingnode/server/wal/metricsutil/wab.go:25` |
| Import batching | EstimateReadCountPerBatch calculates batch count from buffer size and schema | `internal/util/importutilv2/common/util.go:45-56` |
| Segment seal threshold | Segments sealed when total size exceeds threshold | `internal/streamingnode/server/wal/interceptors/shard/stats/stats_seal_worker.go:48` |
| Shallow copy benchmark | Benchmark comparing proto.Clone vs shallow copy for request performance | `internal/querynodev2/delegator/shallow_copy_benchmark_test.go:179-194` |

## Answers to Dimension Questions

### 1. How does the system avoid allocating memory proportional to data size?

The system uses several strategies:
- **Object pooling**: `sync.Pool` for lexers/parsers (`internal/parser/planparserv2/pool.go:12-22`), Allocation objects (`internal/datacoord/segment_manager.go:47-51`), and zap text encoding (`pkg/log/zap_text_encoder.go:71`)
- **Shallow copying**: Query requests use shallow copy instead of proto.Clone where safe, with benchmarks showing significant improvement (`internal/querynodev2/delegator/shallow_copy_benchmark_test.go:179-194`)
- **Buffer reuse**: Import readers calculate batch counts based on buffer size and schema, reusing buffer allocations (`internal/util/importutilv2/common/util.go:45-56`)
- **Jemalloc**: C++ core uses jemalloc which reduces fragmentation and improves allocation patterns

However, bulk import paths (`internal/util/importutilv2/parquet/reader.go:39`) allocate `totalReadBufferSize = 64MB` and divide it per-column, which could be proportional to data width.

### 2. Where does the system buffer vs stream, and what drives the choice?

**Buffered (bounded buffer with flush threshold)**:
- Write buffers in `flushcommon/writebuffer/insert_buffer.go:92` use `FlushInsertBufferSize` as sizeLimit for triggering flushes
- Delete buffers in `querynodev2/delegator/delegator.go:1382` use `sizePerBlock` for list delete buffer
- Parquet import uses `totalReadBufferSize = 64MB` divided by column count (`internal/util/importutilv2/parquet/reader.go:39-71`)

**Streaming (continuous flow)**:
- WAL (Write-Ahead Log) in streamingnode streams data with configurable buffer metrics
- Packed storage v2 uses 32MB default buffer sizes for both read/write (`internal/storagev2/packed/constant.go:21-23`)
- IDF oracle uses `bufio.NewReaderSize` with configurable buffer size (`internal/querynodev2/delegator/idf_oracle.go:413`)

**Choice drivers**: Buffer thresholds are driven by memory limits (e.g., `FlushInsertBufferSize`), while streaming is used for sequential I/O where backpressure prevents unbounded growth.

### 3. How are batch sizes tuned and what happens at batch boundaries?

**Configuration**:
- `ExprEvalBatchSize`: Controls expression evaluation batch size, passed to C++ core (`internal/util/initcore/init_core.go:130-131`)
- `DeleteDumpBatchSize`: Controls delete dump batch size (`internal/util/initcore/init_core.go:133-134`)
- `IndexSliceSize`: Controls chunk size for index building, with runtime callback to update C++ (`internal/util/initcore/init_core.go:509-515`)
- `FlushInsertBufferSize`: Triggers segment flush at threshold (`internal/flushcommon/writebuffer/insert_buffer.go:92`)
- `batchAllocateSize = 1000` for TSO allocator (`internal/util/idalloc/allocator.go:30-31`)

**At batch boundaries**: When buffers reach size limits, segments are sealed/flushed, and new batches begin. Import tasks use `EstimateReadCountPerBatch` to determine row counts per batch based on buffer size and schema (`internal/util/importutilv2/common/util.go:45-56`).

### 4. Is there a performance regression testing culture?

**Yes, evidenced by**:
- Extensive benchmark suite with 138 benchmark functions across the codebase
- `BenchmarkPoolOverhead` specifically measures sync.Pool get/put overhead (`internal/parser/planparserv2/optimization_comparison_test.go:226-227`)
- `BenchmarkCacheEffect` compares cached vs uncached performance (`internal/parser/planparserv2/optimization_comparison_test.go:250-251`)
- `BenchmarkParserOverall` tests overall parser performance (`internal/parser/planparserv2/benchmark_optimization_test.go:82`)
- Benchmark tests in storage serde (`internal/storage/serde_test.go:180`, `internal/storage/serde_events_test.go:468`)
- Shallow copy benchmarks comparing old vs new implementations (`internal/querynodev2/delegator/shallow_copy_benchmark_test.go`)
- `defaultRegisterBuf = 256` chosen from "benchmark A/B runs" (`internal/util/cgo/manager_active.go:17`)

### 5. What profiling tools are used to identify bottlenecks?

- **pprof**: HTTP endpoints exposed at `/debug/pprof/*` with heap, cmdline, profile, symbol, trace, mutex, block profiles (`internal/http/server.go:158-178`)
- **Mutex/Block profiling**: Enabled with 10% sampling rate on non-arm64 architectures (`internal/http/server.go:294-297`)
- **Jemalloc stats**: Comprehensive memory profiling via `C.GetJemallocStats()` exposing allocated, active, resident, mapped, retained, fragmentation, overhead metrics (`internal/util/segcore/jemalloc_stats.go:26-49`)
- **Jemalloc metrics cache**: 10-second TTL cache to reduce C call frequency (`internal/util/metrics/c_registry.go:124`)
- **Active future metrics**: `metrics.ActiveFutureTotal` tracks active CGO futures per node (`internal/util/cgo/manager_active.go:108-119`)

## Architectural Decisions

1. **Hybrid memory management**: Go's sync.Pool for short-lived Go objects, jemalloc for C++ core memory. This acknowledges the CGO boundary overhead but creates fragmentation at the interface.

2. **Write buffer flush thresholds**: Configurable per-buffer limits drive segment sealing, preventing unbounded memory growth at the cost of fragmentation into multiple segment files.

3. **CGO future multiplexing**: Uses `reflect.Select` to multiplex thousands of CGO futures on a single goroutine, avoiding goroutine-per-call overhead but adding complexity (`internal/util/cgo/manager_active.go:100`).

4. **Shallow copy for query requests**: Where safe, requests use shallow copy instead of proto.Clone to avoid allocation, benchmarked against the alternative (`internal/querynodev2/delegator/shallow_copy_benchmark_test.go`).

5. **Batch allocation for timestamps/IDs**: TSO and ID allocators batch-request from coordinators (batch size 1000) to reduce round-trips (`internal/util/idalloc/allocator.go:30-31`).

## Notable Patterns

1. **Object pool pattern with reset**: Pools provide Get/put functions that reset object state before reuse (`internal/parser/planparserv2/pool.go:45-55`)

2. **Config-driven buffer sizing**: Buffer sizes are parametric via `paramtable`, allowing deployment-specific tuning without code changes

3. **Memory usage tracking**: `GetMemoryUsageInBytes()` methods on event/data structures for accurate memory accounting (`internal/storage/event_writer.go:70`)

4. **Dynamic thread pool sizing**: Knowhere thread pool size scales with CPU count via factor configuration (`internal/util/initcore/init_core.go:518-531`)

5. **Pool-based resource management with metrics**: Active futures tracked via `ActiveFutureTotal` metric, providing observability into CGO concurrency

## Tradeoffs

1. **CGO overhead vs. performance**: The segcore C++ engine provides performance but forces CGO with its pointer-passing constraints, requiring careful memory management at the boundary (`internal/util/segcore/segment.go:1595-1599`)

2. **Memory fragmentation vs. latency**: Small flush buffers reduce memory footprint but create more segment files, increasing metadata overhead and potential compaction needs

3. **Buffer cache TTL vs. accuracy**: 10-second jemalloc metrics cache reduces C calls but may miss short-lived memory spikes

4. **Shallow copy vs. safety**: Shallow copy saves allocation but risks aliasing bugs if caller mutates shared state — only used where contract guarantees immutability

5. **Batch size tuning**: Large batches improve throughput but increase memory pressure; the 1000-row TSO batch may be suboptimal for high-throughput scenarios

## Failure Modes / Edge Cases

1. **Pool exhaustion under burst**: If requests arrive faster than pool recycling, sync.Pool will create new objects, potentially causing memory spikes

2. **Segment size threshold races**: Concurrent appends may exceed size threshold before flush completes, requiring anti-entropy mechanisms

3. **CGO future leak**: If `activeFutureManager.doSelect()` crashes, futures may never be cancelled; the single-goroutine design means one panic affects all concurrent CGO calls (`internal/util/cgo/manager_active.go:78-84`)

4. **Buffer size misconfiguration**: Setting `FlushInsertBufferSize` too high can cause OOM on memory-constrained nodes; too low causes excessive small segments

5. **jemalloc unavailable**: On macOS or when jemalloc is disabled, all jemalloc stats return 0 with `Success=false`; monitoring gaps may go unnoticed (`internal/util/segcore/jemalloc_stats.go:47`)

## Future Considerations

1. **Zero-copy reads**: Current parquet reader divides a fixed buffer; true streaming (reading one record at a time) could reduce peak memory further

2. **Generic object pool**: A centralized pool registry with automatic sizing based on memory pressure could replace ad-hoc sync.Pool usage

3. **Profile-guided optimization**: pprof integration exists but could be automated in CI to detect regressions before merge

4. **Memory limits per collection**: Currently global `FlushInsertBufferSize`; per-collection limits could prevent noisy neighbor issues in multi-tenant deployments

5. **jemalloc background threads**: Jemalloc's background thread for memory reclamation could be tuned to balance memory returns to OS vs. reallocation cost

## Questions / Gaps

1. **No evidence found**: Streaming readers in the C++ core for search results — query paths appear to allocate full result sets in memory before returning

2. **Import memory bounds**: The 64MB total read buffer for parquet divided by column count could still be large for wide schemas; no evidence of per-batch memory limiting

3. **No evidence found**: Proactive memory defragmentation or compaction scheduling based on jemalloc fragmentation metrics

4. **Growth factor unknown**: No evidence of what expansionFactor is used for segment loading memcpy buffers (`internal/querynodev2/segments/segment_loader.go:2184` mentions it but doesn't specify value)

5. **CGO goroutinePerCall cost**: The `defaultRegisterBuf=256` was chosen from A/B benchmarks but no data on how this scales beyond typical deployments
