# Source Analysis: grafana

## Performance & Resource Discipline

### Source Info

| Field | Value |
|-------|-------|
| Name | grafana |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/grafana` |
| Language / Stack | Go (backend), TypeScript/React (frontend) |
| Analyzed | 2026-05-20 |

## Summary

Grafana demonstrates a mixed approach to performance and resource discipline. While there is evidence of memory pooling through `sync.Pool` usage in specific paths (Azure Log Analytics gzip encoding, terminal logger string escaping), the overall pattern is inconsistent. The system uses a mix of buffered and streaming approaches in data processing (InfluxDB shows explicit buffered vs streaming mode testing), employs batching strategies in query execution (CloudWatch query batching, sequence generator batch allocation), and has OpenTelemetry tracing integrated throughout. However, profiling culture appears limited to pprof import (without explicit instrumentation) and some benchmark tests. Many data paths still allocate memory proportional to data size rather than employing zero-alloc patterns.

## Rating

**6/10** — Basic implementation with gaps. Grafana shows good patterns in specific hot paths (gzip writer pooling, sequence batch allocation, pre-allocated buffers for frame names) but lacks consistent resource discipline across the codebase. Memory allocation patterns are frequently data-size dependent rather than bounded.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| sync.Pool usage | `gzipWriterPool = sync.Pool{New: func() any { return gzip.NewWriter(io.Discard) }}` | `pkg/tsdb/azuremonitor/loganalytics/azure-log-analytics-datasource.go:889` |
| sync.Pool usage | `stringBufPool = sync.Pool{New: func() interface{} { return new(bytes.Buffer) }}` | `pkg/infra/log/term/terminal_logger.go:239` |
| Buffer reuse | Pre-allocated `frameName := make([]byte, 0, 128)` with comment "frameName is pre-allocated. So we can reuse it, saving memory." | `pkg/tsdb/influxdb/influxql/converter/converter.go:118` |
| Buffer reuse | Pre-allocated `frameName := make([]byte, 0, 128)` in buffered parser | `pkg/tsdb/influxdb/influxql/buffered/response_parser.go:255` |
| Sequence batching | `batchSize: 100` with `allocateNewBatch` for database sequence allocation | `pkg/util/xorm/sequence.go:30` |
| Query batching | `BatchDataQueriesByTimeRange` groups queries by time range | `pkg/tsdb/cloudwatch/utils/metrics.go:21-34` |
| CloudWatch batch queries | `getMetricQueryBatches` with `FlagCloudWatchBatchQueries` feature toggle | `pkg/tsdb/cloudwatch/time_series_query.go:59-69` |
| Streaming support | `io.Pipe()` used for response streaming | `pkg/apiserver/endpoints/responsewriter/responsewriter.go:137` |
| io.Copy usage | `io.Copy(tw, bytes.NewReader(data))` for tar writing | `pkg/services/supportbundles/supportbundlesimpl/service_bundle.go:173` |
| Benchmark tests | `BenchmarkParseJson` with `TEST_MODE` env var for buffered/stream comparison | `pkg/tsdb/influxdb/influxql/parser_bench_test.go:26` |
| Benchmark tests | `BenchmarkMatrixJson` with pprof instructions in comments | `pkg/tsdb/loki/loki_bench_test.go:14-17` |
| Storage benchmarks | `BenchmarkOptions` with configurable `NumResources`, `Concurrency`, `NumHistoryVersions` | `pkg/storage/unified/testing/benchmark.go:22-31` |
| pprof import | `_ "net/http/pprof"` imported in main server command | `pkg/cmd/grafana-server/commands/cli.go:6` |
| OpenTelemetry tracing | `tracing.DefaultTracer().Start(ctx, ...)` used extensively across datasources | `pkg/tsdb/tempo/search_stream.go:33` |
| OpenTelemetry tracing | `go.opentelemetry.io/otel` imports throughout datasource code | `pkg/tsdb/parca/query.go:18-22` |
| LimitedWriter | `LimitedWriter` with `N` budget tracking writes within limit | `pkg/storage/unified/resource/limited_writer_test.go:14` |
| runtime metrics | `runtime.ReadMemStats` used in performance tests | `pkg/storage/unified/search/bleve_performance_test.go:42-63` |

## Answers to Dimension Questions

### 1. How does the system avoid allocating memory proportional to data size?

Grafana has **limited success** avoiding proportional allocation. Evidence:

- **sync.Pool for gzip writers**: `azure-log-analytics-datasource.go:889-897` pools `gzip.Writer` instances to avoid per-request allocation, but this is localized to a single data source.
- **Pre-allocated buffer reuse**: InfluxDB parser pre-allocates `frameName` buffer of 128 bytes (`converter/converter.go:118`) and reuses it across iterations rather than allocating per-frame.
- **Sequence batch allocation**: Database sequence IDs are allocated in batches of 100 (`sequence.go:30`), amortizing database round-trips.

**However**, many paths still allocate based on data size:
- `bytes.Buffer` is created fresh in 185+ locations throughout the codebase
- Data frames and result sets are accumulated in memory rather than streamed
- No evidence of object pooling for common data structures beyond the two identified sync.Pool instances

### 2. Where does the system buffer vs stream, and what drives the choice?

**Buffering**:
- InfluxDB `buffered` mode loads entire JSON response before parsing (`influxql/parser_bench_test.go:51`)
- Storage backend writes use buffered `io.Copy` with in-memory buffers (`service_bundle.go:173`)
- HTTP response handling uses `io.Pipe()` for streaming but the choice appears feature-driven rather than data-size driven

**Streaming**:
- InfluxDB `stream` mode uses `io.NopCloser(strings.NewReader(...))` for incremental parsing (`parser_bench_test.go:47`)
- Tempo streaming queries use gRPC streaming with `processStream` receiving incrementally (`tempo/search_stream.go:77-129`)
- Plugin file copying uses `io.Copy(buf, src)` for chunked copying (`plugins/storage/fs.go:148`)

**What drives the choice**: The InfluxDB benchmark test shows explicit `TEST_MODE` environment variable controls buffered vs streaming (`parser_bench_test.go:33-54`), suggesting this is a user-configurable option rather than automatic based on data size. The CloudWatch datasource uses feature flag `FlagCloudWatchBatchQueries` to enable batch query optimization (`time_series_query.go:59`).

### 3. How are batch sizes tuned and what happens at batch boundaries?

**Sequence batching** (`sequence.go:76-145`):
- Default batch size: 100 (`sequence.go:30`)
- When `nextValue > lastValueInBatch`, triggers `allocateNewBatch` database transaction
- Transaction uses `sql.LevelSerializable` isolation (`sequence.go:79`)
- Updates sequence table with `nextBatchStart = batchEnd + 1`

**CloudWatch query batching** (`cloudwatch/utils/metrics.go:21-34`):
- Groups queries by `backend.TimeRange` — each unique time range becomes a batch
- No explicit batch size limit; grouping is by time alignment, not count

**Storage benchmark** (`benchmark.go:59-68`):
- `US_BACKEND_BENCH_*` environment variables allow configurable batch sizes
- `Concurrency: envOrDefault("CONCURRENCY", 50)` controls parallel workers
- `IndexMinUpdateInterval: 100*time.Millisecond` controls index refresh rate

### 4. Is there a performance regression testing culture?

**Limited evidence** of performance regression testing:

- **Benchmark tests exist** but are not integrated into CI: `BenchmarkScheduler_*` (`scheduler_bench_test.go:76-120`), `BenchmarkAdaptiveChan*` (`adaptive_chan_bench_test.go:8-57`), storage benchmarks with `RunStorageBackendBenchmark` (`benchmark.go:339`)
- **pprof integration** is imported (`cli.go:6`) but not explicitly instrumented in the codebase
- **No evidence** of performance gates in CI pipelines (no `benchcmp` or regression detection)
- The influxdb benchmark includes commands like `benchstat buffered.txt stream.txt` in comments (`parser_bench_test.go:24`), but these appear to be manual testing instructions, not automated

**Conclusion**: Performance testing is ad-hoc rather than systematic. Benchmark tests exist but are not run as part of standard CI/CD.

### 5. What profiling tools are used to identify bottlenecks?

- **pprof**: Imported via `_ "net/http/pprof"` in `cli.go:6`, enabling `/debug/pprof/` endpoints when server runs
- **OpenTelemetry tracing**: Extensive `tracing.DefaultTracer().Start()` spans across datasources for distributed tracing (`tempo/search_stream.go:33`, `parca/query.go:41`, `loki/api.go:315`)
- **runtime.ReadMemStats**: Used in `bleve_performance_test.go:42-63` for memory profiling during tests
- **Go benchcmp**: Referenced in benchmark test comments for comparing results (`parser_bench_test.go:24`)

**Gap**: No evidence of continuous profiling (e.g., Pyroscope integration within Grafana itself), though Grafana can query Pyroscope for profiling data as a datasource.

## Architectural Decisions

1. **sync.Pool is underutilized**: Only 2 explicit sync.Pool usages found (gzip writer, string buffer). Most hot paths allocate fresh objects.

2. **Pre-allocated buffers preferred over pooling for frame names**: The InfluxDB converter pre-allocates a 128-byte buffer and reuses it by resetting (`converter.go:118`), which is a valid zero-allocation strategy but relies on callers not holding references across iterations.

3. **Sequence batching for database ID allocation**: Uses optimistic locking with serializable transactions to batch-sequence ID generation, avoiding per-insert database round-trips.

4. **Time-range-based query batching for CloudWatch**: Groups queries by time range to co-locate requests, reducing API calls.

5. **Buffered vs streaming as user option**: InfluxDB exposes buffering as a configurable mode rather than automatic based on data size or memory pressure.

## Notable Patterns

- **Pool reset pattern**: Both sync.Pool usages (`azure-log-analytics-datasource.go:896`, `terminal_logger.go:257`) call `.Reset()` on objects returned from the pool before use, ensuring clean state.

- **Batch boundary handling**: Sequence generator uses double-checked locking (`sequence.go:44-68`) with per-key mutex after global map access, balancing contention vs correctness.

- **Feature-gated batching**: CloudWatch batch queries are gated behind `FlagCloudWatchBatchQueries` feature toggle (`time_series_query.go:59`), allowing gradual rollout.

- **Explicit pre-allocation with size hints**: `make([]byte, 0, 128)` pattern used to pre-allocate with expected capacity, avoiding slice growth during iteration.

## Tradeoffs

1. **Memory vs CPU for gzip pooling**: Pooling gzip writers avoids allocation but keeps gzip state in memory longer; trade-off is memory vs GC pressure.

2. **Batch size tuning**: Sequence batch size of 100 is fixed; too small and database contention increases, too large and memory waste occurs for rarely-used sequences.

3. **Serializable transactions for batching**: Using `sql.LevelSerializable` for sequence batch allocation (`sequence.go:79`) prevents conflicts but increases database overhead compared to optimistic approaches.

4. **Buffered vs streaming choice**: Putting this behind `TEST_MODE` env var means it's not dynamically tuned based on payload size or memory pressure.

## Failure Modes / Edge Cases

1. **Pool exhaustion**: sync.Pool can grow unbounded if New function produces objects that aren't returned; no evidence of pool size limits in Grafana's usage.

2. **Batch transaction conflicts**: Serializable isolation for sequence batching can cause transaction retries under high contention; no evidence of retry logic in `allocateNewBatch`.

3. **Buffer reference retention**: Pre-allocated `frameName` buffer reuse (`converter.go:118`) would corrupt data if any caller stored a reference to the slice beyond the current iteration.

4. **Memory pressure under large queries**: No evidence of query result size limits or backpressure mechanisms; large time series results could exhaust memory.

5. **LimitedWriter write exhaustion**: `LimitedWriter` returns `ErrWriteLimitExceeded` on budget exhaustion but doesn't gracefully handle partial writes (`limited_writer_test.go:37-41`).

## Future Considerations

1. **Expand sync.Pool usage**: Apply the gzip writer pooling pattern to other hot paths (JSON encoding, HTTP response buffering) to reduce GC pressure.

2. **Dynamic batch sizing**: Sequence batch sizes and query batch sizes are static; could be dynamically tuned based on load and data characteristics.

3. **Memory pressure detection**: Implement runtime memory monitoring with automatic fallback to streaming mode when heap exceeds thresholds.

4. **Continuous profiling integration**: Integrate Pyroscope for always-on profiling in production deployments, not just on-demand pprof.

5. **Performance regression CI**: Add benchmark comparisons to CI using `benchstat` or similar to catch regressions before merge.

## Questions / Gaps

1. **No evidence of memory-limited queues**: Despite 2728+ "batch" mentions, no bounded queue implementation found with explicit memory controls.

2. **No evidence of arena allocation**: Large data processing paths (InfluxDB parsing, Loki response handling) don't use arena/zone allocation patterns that could reduce GC pressure.

3. **No evidence of response size limits**: HTTP API endpoints don't appear to enforce maximum response sizes for query results.

4. **Unclear if pprof is actually enabled**: While `net/http/pprof` is imported, there's no evidence that the server actually mounts `/debug/pprof/` endpoints or that they're documented for users.

5. **No evidence of memory profiling in production**: `runtime.ReadMemStats` only appears in test code; no production path for memory profiling.

---

Generated by `dimensions/15-performance-resource-discipline.md` against `grafana`.