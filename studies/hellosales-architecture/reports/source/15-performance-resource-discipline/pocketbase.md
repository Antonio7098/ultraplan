# Source Analysis: pocketbase

## Performance & Resource Discipline

### Source Info

| Field | Value |
|-------|-------|
| Name | pocketbase |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/pocketbase` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

PocketBase demonstrates moderate resource discipline with several intentional patterns for memory management and batching. Key areas include: sync.Pool usage in gzip compression for buffer reuse, hybrid memory-to-disk buffering in `bufferWithFile` for request bodies, batch processing for both logs (100 items) and API requests (configurable), and chunked client processing for realtime subscriptions (150 per chunk). However, profiling infrastructure is minimal (pprof is an indirect dependency only), benchmarking culture is present but dormant (infrastructure exists without active benchmarks), and no distributed tracing is implemented.

## Rating

**6/10** — Basic implementation with notable gaps. The system shows deliberate design choices around batching and pooling, but lacks active performance regression testing, comprehensive profiling hooks, and memory allocation optimization for data-heavy paths.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| sync.Pool (gzip) | `pool := sync.Pool{New: func() interface{} { w, _ := gzip.NewWriterLevel(io.Discard, config.Level); return w }}` | `apis/middlewares_gzip.go:70-78` |
| sync.Pool (buffer) | `bpool := sync.Pool{New: func() interface{} { b := &bytes.Buffer{}; return b }}` | `apis/middlewares_gzip.go:80-85` |
| Hybrid memory/disk buffer | `bufferWithFile` struct with `buf *bytes.Buffer` and `file *os.File`, memoryLimit threshold | `tools/router/buffer_with_file.go:28-33` |
| Memory limit constant | `DefaultMaxMemory = 16 << 20 // 16mb` | `tools/router/event.go:325` |
| Batch log handler | `BatchSize int` with default 100, `WriteAll` flushes at threshold | `tools/logger/batch_handler.go:32-34, 185-189` |
| Batch API processing | `maxRequests` and `maxBodySize` configurable, timeout enforcement | `apis/batch.go:95-108` |
| Chunked client processing | `const clientsChunkSize = 150` for realtime subscription broadcasting | `apis/realtime.go:26` |
| Benchmark infrastructure | `func (scenario *ApiScenario) Benchmark(b *testing.B)` method exists | `tests/api.go:151` |
| pprof dependency | `github.com/google/pprof v0.0.0-20260402051712-545e8a4df936 // indirect` | `go.mod:34` |
| JSVM pool | Custom `vmsPool` with pre-warmed VMs, mutex-based busy tracking | `plugins/jsvm/pool.go:15-33` |
| io.Copy usage | `io.Copy(part, fr)` for file streaming in multipart | `apis/batch.go:441` |
| bufio.Reader | `Tokenizer` uses `bufio.NewReader` for streaming tokenization | `tools/tokenizer/tokenizer.go:38` |

## Answers to Dimension Questions

### 1. How does the system avoid allocating memory proportional to data size?

The system uses several strategies:

- **`bufferWithFile`** (`tools/router/buffer_with_file.go:26-100`): Hybrid buffer that stores in memory up to `memoryLimit` (default 16MB via `DefaultMaxMemory`), then spills to disk via temp file. Prevents unbounded memory allocation for large request bodies.

- **Gzip sync.Pool** (`apis/middlewares_gzip.go:70-85`): Reuses `gzip.Writer` and `bytes.Buffer` instances via `sync.Pool`, avoiding per-request allocation of these objects.

- **Chunked realtime broadcasting** (`apis/realtime.go:26, 571`): Processes subscription clients in chunks of 150 to avoid processing all subscribers in a single pass.

However, evidence of zero-allocation paths is limited. The tokenizer uses `bufio.Reader` but still allocates `bytes.Buffer` per token read (`tools/tokenizer/tokenizer.go:127`).

### 2. Where does the system buffer vs stream, and what drives the choice?

**Buffering:**
- **Gzip middleware** (`apis/middlewares_gzip.go:103`): Buffers response until `MinLength` threshold (default 0) is exceeded before gzip compression begins. Comment notes: "Compressing a short response might increase the transmitted data because of the gzip format overhead."
- **Request body parsing** (`tools/router/event.go:103, 377`): Uses `ParseMultipartForm(DefaultMaxMemory)` which buffers entirely in memory (or temp files for large multipart).
- **Batch API** (`apis/batch.go:390-391`): Builds entire multipart request in `bytes.Buffer` before sending.

**Streaming:**
- **Tokenizer** (`tools/tokenizer/tokenizer.go:38`): Uses `bufio.NewReader` to stream tokens from underlying `io.Reader`.
- **Multipart file copy** (`apis/batch.go:441`): Uses `io.Copy(part, fr)` to stream files directly to multipart writer without full buffer.
- **Realtime SSE** (`apis/realtime.go:58`): Sets `Content-Type: text/event-stream` with `X-Accel-Buffering: no` to disable proxy buffering.

**Choice drivers:**
- Data size thresholds (e.g., `MinLength` for gzip, `memoryLimit` for bufferWithFile)
- Use case requirements (SSE needs streaming, batch needs atomicity)
- Memory pressure mitigation (bufferWithFile)

### 3. How are batch sizes tuned and what happens at batch boundaries?

**Log batching** (`tools/logger/batch_handler.go:32-34, 185-189`):
- Default batch size: 100 logs
- At threshold: `WriteAll(ctx)` is called, which copies the logs slice, resets the queue, and invokes `WriteFunc`
- Pre-boundary: mutex lock ensures thread-safe append

**Batch API** (`apis/batch.go:95-108`):
- `maxRequests`: Maximum number of sub-requests (configured in settings, no hard default visible)
- `maxBodySize`: Maximum body size per batch (default 128MB: `128 << 20`)
- `txTimeout`: Transaction timeout (default 3 seconds)
- At timeout: Returns error "batch transaction timeout"
- All sub-requests execute in a single DB transaction

**Realtime chunking** (`apis/realtime.go:26, 229`):
- Fixed chunk size: 150 clients
- Uses `errgroup` for concurrent chunk processing

**No evidence found** of dynamic batch size tuning or auto-tuning based on load/memory pressure.

### 4. Is there a performance regression testing culture?

**Infrastructure exists but is dormant:**

- Benchmark method exists in test framework (`tests/api.go:151`): `func (scenario *ApiScenario) Benchmark(b *testing.B)` - allows converting any `ApiScenario` test to a benchmark by calling `scenario.Benchmark(b)`
- Example comment shows how to write benchmarks (`tests/api.go:127-149`)
- **No active benchmarks found** in the codebase (grep for `Benchmark` only returned the infrastructure definition, not actual benchmark functions)

**Missing:**
- No `benchmarks` directory or dedicated benchmark tests
- No CI/CD performance regression gates
- No profiling in CI (pprof is only an indirect dependency)
- No documented performance budgets or regression thresholds

### 5. What profiling tools are used to identify bottlenecks?

**Minimal profiling infrastructure:**

- `pprof` is listed as indirect dependency in `go.mod:34` — imported transitively, not explicitly used in core code
- **No evidence of explicit pprof endpoint or profiling middleware** in the codebase
- **No distributed tracing** (searched for `tracing`, `trace`, `otel` — found only CSS class names and stack trace comments)
- **No metrics instrumentation** visible (no evidence of Prometheus, StatsD, or similar)

**Available but not comprehensive:**
- `slog` structured logging with debug levels for runtime observation
- `routine.FireAndForget` has a 2KB stack trace limit (`tools/routine/routine.go` mentioned in CHANGELOG)
- Realtime connections have idle timeout and debug logging for connection lifecycle

**Conclusion:** Profiling is an afterthought. The codebase relies on runtime logging and manual debugging rather than systematic performance instrumentation.

## Architectural Decisions

1. **Hybrid memory/disk buffering** for request bodies: `bufferWithFile` at `tools/router/buffer_with_file.go:26` provides a smart default (16MB in-memory, then disk) to handle both small and large uploads without OOM.

2. **sync.Pool for gzip compression**: At `apis/middlewares_gzip.go:70-85`, reuse of `gzip.Writer` and `bytes.Buffer` minimizes allocation pressure for compressed responses.

3. **Batch API with transaction scope**: At `apis/batch.go:94-167`, batch requests execute within a single DB transaction, providing atomicity but potentially holding DB locks for the duration.

4. **Chunked subscription broadcasting**: At `apis/realtime.go:26, 571`, realtime broadcasts process 150 clients per chunk using `errgroup` for concurrent delivery, preventing thread exhaustion.

5. **JSVM pool**: At `plugins/jsvm/pool.go:22-33`, JavaScript VM instances are pre-warmed and pooled with mutex-based busy tracking, though it falls back to creating new VMs if all are busy.

## Notable Patterns

- **Deferred buffer return**: Gzip middleware uses `defer` to return buffers to pool (`apis/middlewares_gzip.go:104-132`)
- **Slice pre-allocation**: `make([]*Log, 0, h.options.BatchSize)` in `tools/logger/batch_handler.go:71`
- **Rereadable request body**: `router.RereadableReadCloser` enables multiple reads of request body (`tools/router/rereadable_read_closer.go`)
- **Fire-and-forget for non-critical work**: `routine.FireAndForget` for realtime message delivery (`apis/realtime.go:717`)

## Tradeoffs

1. **Batch transaction atomicity vs. performance**: All-or-nothing batch semantics are safe but a single slow request can block the entire batch.

2. **Buffer reuse vs. memory growth**: sync.Pool helps but objects returned to pool still accumulate until GC reclaims them.

3. **Chunked processing vs. latency**: Breaking realtime broadcasts into chunks of 150 prevents thread exhaustion but increases end-to-end broadcast latency for large subscriber sets.

4. **Buffer-then-stream for gzip**: Waiting until `MinLength` threshold is met before compressing ensures efficiency for large responses but delays small responses.

5. **JSVM pool mutex contention**: `plugins/jsvm/pool.go:44-52` uses coarse-grained mutex locking on each pool item, which could become a bottleneck under high concurrency.

## Failure Modes / Edge Cases

1. **Batch timeout leaves partial state**: If batch transaction times out, some operations may have executed while others didn't, creating inconsistent state within the failed transaction scope.

2. **Pool VM exhaustion**: If all JSVM pool items are busy and new VMs are created, temporary VM explosion could occur under load (`plugins/jsvm/pool.go:61-62`).

3. **bufferWithFile temp file leaks**: If `Close()` is not called properly on `bufferWithFile`, temp files in `/tmp/pb_buffer_file_*` may not be cleaned up.

4. **Gzip pool under pressure**: Under extreme load, sync.Pool may not return objects fast enough, leading to increased allocation.

5. **Realtime dry cache memory growth**: `client.Set(dryCacheKey, messages)` in realtime broadcast can accumulate messages for disconnected clients (`apis/realtime.go:708-715`).

## Future Considerations

1. **Add active benchmarks**: Create dedicated benchmark tests for critical paths (DB queries, realtime broadcasts, batch processing) and integrate into CI.

2. **Profile-guided optimization**: Expose pprof endpoints (currently indirect dependency only) to allow production profiling.

3. **Dynamic batch tuning**: Monitor queue depth and adjust batch sizes dynamically based on load.

4. **Streaming JSON parsing**: Replace `io.ReadAll` paths with streaming JSON parsers for large API responses.

5. **Connection pool metrics**: Instrument the JSVM pool and DB connection pools with observability.

## Questions / Gaps

1. **No evidence of memory allocation benchmarks**: No benchmarks measure allocation rates or GC pressure.

2. **No evidence of DB query profiling**: While PocketBase uses `dbx`, no query logging or profiling infrastructure was found for slow query detection.

3. **No evidence of request body streaming**: Despite `bufferWithFile`, evidence suggests multipart forms are fully buffered before processing.

4. **No evidence of backpressure mechanisms**: Realtime broadcasting has no throttling when clients are slow, relying only on idle timeouts.

5. **No evidence of resource limits for JSVM**: No memory or CPU limits defined for JavaScript VM execution contexts.

---

Generated by `dimensions/15-performance-resource-discipline.md` against `pocketbase`.