# Source Analysis: cli

## Performance & Resource Discipline

### Source Info

| Field | Value |
|-------|-------|
| Name | cli |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/cli` |
| Language / Stack | Go (github.com/cli/cli/v2) |
| Analyzed | 2026-05-20 |

## Summary

The cli source (GitHub CLI) demonstrates moderate resource discipline with appropriate use of streaming I/O via `io.Copy`, consistent API pagination with `per_page=100`, and retry backoff via `cenkalti/backoff`. However, there is no object pooling (`sync.Pool`), minimal benchmarking culture (only 2 benchmark tests), and no pprof integration. Memory allocation patterns are adequate but not optimised for high-throughput scenarios.

## Rating

5/10 — Basic implementation with gaps

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Streaming I/O | `io.Copy` used for artifact download to temp file | `pkg/cmd/run/download/http.go:57` |
| Streaming I/O | `io.Copy` used for run watch output | `pkg/cmd/run/watch/watch.go:178,194` |
| Buffer size | Fixed 4069-byte buffer in `ReadFrom` loop | `pkg/cmd/api/pagination.go:171` |
| JSON streaming | `paginatedArrayReader` with single-byte cache for pagination | `pkg/cmd/api/pagination.go:114-150` |
| JSON streaming | `jsonArrayWriter` implements `io.ReaderFrom` with chunked writes | `pkg/cmd/api/pagination.go:167-191` |
| API batching | `per_page=100` used across most list endpoints | `pkg/cmd/run/shared/artifacts.go:28`, `pkg/cmd/secret/list/list.go:293` |
| API batching | `per_page` capped at 100 maximum | `pkg/cmd/repo/list/http.go:38-39` |
| Backoff retry | Exponential backoff for codespace state polling | `internal/codespaces/codespaces.go:18-22` |
| Backoff retry | Constant 2-3s backoff for fork/create/PR operations | `pkg/cmd/repo/fork/fork.go:346`, `pkg/cmd/repo/create/create.go:712` |
| OpenTracing | `opentracing.StartSpanFromContext` in codespaces API | `internal/codespaces/api/api.go:1184` |
| Benchmark tests | `BenchmarkGenMarkdownToFile` | `internal/docs/markdown_test.go:119` |
| Benchmark tests | `BenchmarkGenManToFile` | `internal/docs/man_test.go:305` |
| Slice reuse | `skills[:0]` to reuse backing array in filter | `pkg/cmd/skills/search/search.go:659` |

## Answers to Dimension Questions

### 1. How does the system avoid allocating memory proportional to data size?

No systematic avoidance. File downloads stream to temp files via `io.Copy` (`pkg/cmd/run/download/http.go:57`), avoiding full in-memory buffering of large artifacts. However, there is no `sync.Pool` or object pooling mechanism. Some slice backing array reuse exists (`pkg/cmd/skills/search/search.go:659`), but this is incidental rather than a systematic strategy. JSON array pagination uses a `paginatedArrayReader` that caches only a single byte at boundaries (`pkg/cmd/api/pagination.go:120`), which is a small fixed overhead regardless of data size.

**No evidence found** for: zero-alloc patterns, buffer pooling, or explicit memory management policies.

### 2. Where does the system buffer vs stream, and what drives the choice?

**Streaming locations:**
- File downloads: `io.Copy(tmpfile, resp.Body)` writes directly to disk (`pkg/cmd/run/download/http.go:57`)
- Run watch output: `ioCopy(opts.IO.Out, out)` writes to terminal in chunks (`pkg/cmd/run/watch/watch.go:178`)
- API pagination: `jsonArrayWriter.ReadFrom` reads in 4069-byte chunks (`pkg/cmd/api/pagination.go:171`)

**Buffering locations:**
- Test output: `bytes.Buffer` used extensively in test helper `iostreams.Test()` (`pkg/iostreams/iostreams.go:551-554`)
- Response copying: `bodyCopy = &bytes.Buffer{}` for GraphQL paginate (`pkg/cmd/api/api.go:492`)
- Temporary output buffers: `out := &bytes.Buffer{}` in watch loop (`pkg/cmd/run/watch/watch.go:159`)

The choice appears driven by context: streaming for large data (file downloads, API responses), buffering for display/interactive output where TTY detection matters.

### 3. How are batch sizes tuned and what happens at batch boundaries?

API pagination uses `per_page=100` as the standard batch size, capped at 100 maximum (`pkg/cmd/repo/list/http.go:38-39`). The `paginatedArrayReader` handles JSON array pagination by manipulating opening/closing brackets to stitch multiple pages together (`pkg/cmd/api/pagination.go:134-146`). At batch boundaries, the reader:
- Caches the opening `[` byte on first page if not first page (replaces with `,`)
- Caches the closing `]` byte if not last page (to continue appending)

No evidence found of configurable batch sizes or tuning based on response size.

### 4. Is there a performance regression testing culture?

**No.** Only 2 benchmark tests exist in the entire codebase:
- `BenchmarkGenMarkdownToFile` in `internal/docs/markdown_test.go:119`
- `BenchmarkGenManToFile` in `internal/docs/man_test.go:305`

These benchmark documentation generation, not core data paths. No CI-based performance regression detection, no pprof integration in production paths, no memory allocation profiling in tests.

### 5. What profiling tools are used to identify bottlenecks?

**OpenTracing** is used in `internal/codespaces/api/api.go:1184` via `opentracing.StartSpanFromContext`. No pprof, no continuous profiling, no benchmark-based performance tracking in CI.

## Architectural Decisions

1. **io.Copy over manual buffering**: The codebase consistently uses `io.Copy` for data transfer, which is idiomatic Go but does not allow fine-grained control over buffer sizes or zero-alloc operation.

2. **cenkalti/backoff for retries**: Standardised retry library with exponential backoff for long-running operations (codespaces) and constant backoff for quick operations (fork, create). This is a solid pattern but the backoff parameters appear hardcoded.

3. **API pagination via Link headers**: Uses standard HTTP Link header pagination for REST and GraphQL cursor-based pagination. The `per_page=100` convention is consistent.

4. **JSON array streaming**: The `paginatedArrayReader` and `jsonArrayWriter` types implement streaming JSON array concatenation to support multi-page API responses without buffering entire arrays in memory.

## Notable Patterns

- **Exponential backoff**: `codespaceStatePollingBackoff` uses exponential backoff with 1s initial interval, 1.02 multiplier, 10s max interval, 5min max elapsed time (`internal/codespaces/codespaces.go:18-22`)
- **Retry with max attempts**: Most operations use `backoff.WithMaxRetries(bo, 3)` to cap retry attempts
- **Paginated array reader**: Single-byte lookahead/lookbehind caching to stitch JSON array pages (`pkg/cmd/api/pagination.go:123-150`)
- **io.ReaderFrom implementation**: `jsonArrayWriter.ReadFrom` uses explicit chunked reads rather than relying on `io.Copy`

## Tradeoffs

- **Simplicity over optimisation**: Using `io.Copy` and `bytes.Buffer` is idiomatic and readable, but lacks the zero-allocation or pooling optimisations needed for high-throughput scenarios
- **No object pooling**: Every operation allocates buffers fresh; no reuse mechanism exists for high-frequency operations
- **Limited benchmarking**: Only documentation generation is benchmarked; core I/O and API handling paths have no benchmark coverage
- **Hardcoded batch sizes**: `per_page=100` is hardcoded across the codebase with no dynamic tuning based on response size or server load

## Failure Modes / Edge Cases

- Large artifact downloads could fail if temp disk space is exhausted (no streaming to final destination)
- JSON pagination edge case: empty arrays on non-first pages handled by replacing `[` with space (`pkg/cmd/api/pagination.go:135-137`)
- `io.Copy` short writes could cause issues in `jsonArrayWriter.ReadFrom` if Write returns partial success (`pkg/cmd/api/pagination.go:175`)
- Backoff retry loops have fixed max attempts; transient failures after 3 retries are surfaced as permanent errors

## Future Considerations

- Consider adding `sync.Pool` for frequently allocated/deallocated objects (buffers, readers)
- Add pprof profiling endpoints or profiling markers in hot paths
- Expand benchmark coverage to include API pagination, JSON rendering, and table printing
- Consider buffer size as a configurable parameter in streaming operations
- Add memory allocation profiling to existing benchmarks (`testing.B.ReportMetric`)

## Questions / Gaps

- No evidence of memory profiling in production or tests
- No evidence of buffer size tuning based on data volume
- No evidence of streaming compression/decompression (e.g., gzip for API responses)
- No evidence of connection pooling for HTTP clients beyond what go-gh provides
- No evidence of intentional zero-alloc paths in hot code

---

Generated by `dimensions/15-performance-resource-discipline.md` against `cli`.