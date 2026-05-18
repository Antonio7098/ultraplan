# Repo Analysis: restic

## Performance & Resource Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | restic |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/restic` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Restic demonstrates sophisticated performance engineering across initialization, memory management, buffering, and profiling. It uses lazy initialization with nil-checks and `sync.Once`, buffer pooling via a custom `bufferPool` wrapper around `sync.Pool`, streaming I/O via `bufio` wrappers, and explicit GC tuning. The presence of 96 benchmark tests and full pprof integration confirms performance is a first-class concern.

## Rating

**8/10** — Efficient and scalable. Would remain performant at 100x scale.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Lazy init | `UseCache` nil-check, `sync.Once` for encoder/decoder | `internal/repository/repository.go:52-53,166-168` |
| Lazy init | `open *sync.Once` for single file open | `internal/fs/fs_reader.go:34` |
| Lazy init | `outputWriterOnce sync.Once` for terminal output | `internal/ui/termstatus/status.go:35` |
| Buffer pool | `pool sync.Pool` with `Get()`/`Release()` pattern | `internal/archiver/buffer.go:24,44-46` |
| Buffer pool | Per-saver pool `saveFilePool *bufferPool` | `internal/archiver/file_saver.go:20,40` |
| Buffer reuse | `ReadFull()` reuses buffer if capacity allows | `internal/repository/check.go:207-217` |
| Streaming | `Walk()` loads tree on-demand via iterator | `internal/walker/walker.go:37-49` |
| Streaming | `bufio.Writer` wrapping temp files | `internal/repository/packer_manager.go:28,209` |
| Memory control | `runtime.GC()` before prune/index operations | `cmd/restic/cmd_prune.go:233`, `internal/repository/index/master_index.go:399-402` |
| GC tuning | GOGC lowered from 100 to 50 | `cmd/restic/main.go:128-133` |
| Bounded history | `rateEstimator` trims old buckets via `container/list` | `internal/ui/backup/rate_estimator.go:36-64` |
| Profiling | pprof with `--listen-profile`, `--mem-profile`, `--cpu-profile` flags | `internal/global/global_debug.go:19-40,58-64` |
| Benchmarks | 96 benchmark functions (e.g., `BenchmarkMasterIndexAlloc`) | `internal/repository/index/master_index_test.go:297-400` |
| Temp files | Temp file + buffered writer for pack data | `internal/repository/packer_manager.go:202-218` |
| Worker pools | Channel-based backpressure with bounded `ch chan<- saveFileJob` | `internal/archiver/file_saver.go:25,56-58` |

## Answers to Protocol Questions

### 1. Is startup fast?

**Yes.** The main initialization in `cmd/restic/main.go:27-30` sets `maxprocs` eagerly but otherwise defers expensive initialization. Backend configs register via `init()` functions, which is standard. The `sync.Once` pattern (`allocEnc sync.Once`, `allocDec sync.Once` in `repository.go:52-53`) means encoders/decoders are only allocated when first needed. Nil-checks throughout (`repository.go:166-168,637-640,841`) avoid initializing unused components.

### 2. Is memory usage controlled?

**Yes.** Restic uses multiple strategies:
- **Buffer pooling**: `bufferPool` in `internal/archiver/buffer.go:24-46` reuses byte buffers, with oversized buffers excluded from pooling to prevent bloat (`buffer_test.go:33-57`)
- **Bounded history**: `rateEstimator` (`rate_estimator.go:36-64`) trims old data using `container/list`
- **Explicit GC**: `runtime.GC()` called before memory-intensive operations (`cmd_prune.go:233`, `master_index.go:399-402`)
- **GC tuning**: GOGC reduced from 100 to 50 (`main.go:128-133`)
- **Slice pre-allocation**: `make([]restic.PackedBlob, 0, len(blobs)/2)` in `repository.go:228`
- **Buffer reuse in I/O**: `ReadFull()` reuses existing buffer if capacity allows (`check.go:207-217`)

### 3. Is streaming used instead of buffering?

**Yes, for tree traversal and pack operations.** The `walker.Walk()` function (`walker.go:37-49`) uses an iterator pattern loading subtrees on-demand. `bufio.Writer` wraps temp files (`packer_manager.go:28,209`) and explicit `Flush()` calls (`packer_manager.go:92`) ensure data is streamed to disk rather than held in memory. However, some operations do buffer — e.g., the rate estimator keeps a bounded history rather than unbounded streaming, which is a conscious trade-off for memory-bounded progress tracking.

### 4. Are large operations incremental?

**Yes.** Large operations are chunked via:
- **Worker pools**: `fileSaver` uses configurable `fileWorkers` with channel-based dispatch (`file_saver.go:34-55`)
- **Parallel helpers**: `ParallelList()` and `ParallelRemove()` in `internal/restic/parallel.go:11-83` with `errgroup` and bounded concurrency via `wg.SetLimit()`
- **Incremental index updates**: `master_index.go` rebuilds indexes incrementally, calling `runtime.GC()` after clearing state (`master_index.go:399-402`)
- **Temp file per pack**: Each packer writes to its own temp file (`packer_manager.go:202-218`), flushed incrementally

## Architectural Decisions

1. **Buffer pooling via custom wrapper**: Rather than using `sync.Pool` directly, restic wraps it in `bufferPool` (`archiver/buffer.go:24-46`) with `Get()`/`Release()` semantics and size limits, giving control over max buffer sizes.

2. **On-demand tree loading via walker**: The `walker.Walk()` function (`walker.go:37-49`) uses an iterator pattern to traverse trees incrementally rather than loading entire snapshots into memory.

3. **Bounded progress tracking**: The `rateEstimator` (`rate_estimator.go:36-64`) maintains bounded history using `container/list`, trading some memory for accurate rate calculation without unbounded growth.

4. **Profile-gated profiling code**: pprof integration is guarded by build tags `//go:build debug || profile` (`global_debug.go:1-2`), ensuring zero cost in release builds.

5. **GC tuning as configuration**: GOGC is lowered to 50 by default (`main.go:128-133`) but respects user overrides, a conscious default that favors memory over CPU.

## Notable Patterns

- **`sync.Once` for one-time initialization**: Used for encoders/decoders (`repository.go:52-53`), terminal output (`termstatus/status.go:35`), file opening (`fs_reader.go:34`)
- **Nil-check before use pattern**: `if r.blobSaver == nil` checks throughout repository operations
- **Channel-based backpressure**: Bounded channels (`ch chan<- saveFileJob`) signal shutdown by closing
- **Deferred unlock with mutexes**: `defer idx.m.RUnlock()` pattern throughout index code
- **Temp file per operation**: Each packer gets its own temp file with buffered writing

## Tradeoffs

1. **Memory vs accuracy in rate estimation**: Bounded history in `rateEstimator` prevents unbounded memory growth but discards old measurements, potentially making long-running operations show inaccurate rates.

2. **Build tag profiling separation**: pprof code behind `debug || profile` build tags means profiling can't be enabled in production without rebuild — a conscious choice favoring binary size.

3. **sync.Pool GC unpredictability**: While `sync.Pool` is efficient, its garbage collection is not under restic's control, meaning buffers may be reclaimed at unexpected times. The custom `bufferPool` wrapper mitigates this by excluding oversized buffers.

## Failure Modes / Edge Cases

- **Oversized buffers excluded from pool**: If a file larger than `bufferPool`'s max size is processed, that buffer is not returned to the pool (`buffer_test.go:33-57`), potentially causing memory pressure with many large files.
- **Temp file accumulation**: If `Flush()` is not called (e.g., crash), temp files may accumulate in the temp directory. The code creates them with `fs.TempFile` but relies on OS cleanup for orphaned files.
- **Bounded channel deadlock**: If worker pools receive more work than bounded channel capacity and don't properly signal shutdown, goroutines can deadlock. The `TriggerShutdown()` pattern (`file_saver.go:56-58`) mitigates this.

## Future Considerations

- **Memory-mapped I/O**: For very large files, memory-mapped I/O could reduce copy overhead, but Go's `mmap` support is limited and platform-dependent.
- **Streaming JSON parsing**: Current JSON progress output buffers in memory; a streaming JSON parser could reduce memory for very long operations.
- **Allocator introspection**: The `sync.Pool` allocations are opaque; exposing pool statistics via a debug endpoint could help tune buffer sizes.

## Questions / Gaps

- **No evidence found** for `runtime.ReadMemStats` usage or memory allocation profiling built into the binary. The pprof integration requires explicit flag activation.
- No evidence found for lazy loading of the command structure itself (Cobra subcommands are all registered eagerly at `init()` time in `cmd/restic/main.go`).

---

Generated by `study-areas/14-performance.md` against `restic`.