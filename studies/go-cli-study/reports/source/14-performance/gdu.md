# Repo Analysis: gdu

## Performance & Resource Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | gdu |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` |
| Group | `gdu` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Gdu is a disk usage analyzer with deliberate performance architecture: lazy analyzer creation, configurable concurrency via `GOMAXPROCS`, multiple specialized analyzers (parallel, sequential, stored), streaming progress updates via channels, and efficient memory management through object reuse and buffered I/O. The default.pgo file indicates Profile-Guided Optimization is used for production builds.

## Rating

**8/10** — Efficient and scalable. Parallel directory traversal with bounded concurrency prevents resource exhaustion while maximizing SSD throughput. Multiple analyzers allow users to trade features for resource usage. Streaming progress avoids buffering full output.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Initialization timing | `CreateTopDirAnalyzer()` uses no-lock defaults for ignore/time filters, avoiding allocation | `pkg/analyze/parallel_top_dir.go:28-37` |
| Concurrency limit | `concurrencyLimit = make(chan struct{}, 2*runtime.GOMAXPROCS(0))` — bounded goroutine pool | `pkg/analyze/parallel.go:13` |
| Lazy analyzer creation | Analyzers created on-demand in `createUI()` based on flags | `cmd/gdu/app/app.go:360-430` |
| Streaming progress | `progressOutChan chan common.CurrentProgress` with non-blocking send (select with default) | `pkg/analyze/analyzer.go:30,84-98` |
| Memory reuse | `Dir.Files` uses `make(fs.Files, 0, len(files))` pre-allocated slice | `pkg/analyze/parallel.go:71` |
| PGO build | `default.pgo` file present — Profile-Guided Optimization used | `gdu/default.pgo` |
| Profiling hooks | `af.Profiling` flag starts pprof HTTP server on localhost:6060 | `cmd/gdu/app/app.go:75,577-586` |
| Storage cleanup | BadgerDB reopens every 10,000 items to avoid memory pressure | `pkg/analyze/storage.go:139-149` |
| Incremental scanning | `--read-from-storage` flag reuses stored analysis instead of rescanning | `cmd/gdu/main.go:78` |
| TopDirAnalyzer stack usage | Comment states "It tries to use only stack for storing state and results" — lightweight for non-interactive | `pkg/analyze/parallel_top_dir.go:19-21` |

## Answers to Protocol Questions

**1. Is startup fast?**

Yes. Key optimizations:
- `TopDirAnalyzer` (used by default in stdout UI) avoids building full directory tree (`pkg/analyze/parallel_top_dir.go:19-21`)
- Analyzers are created lazily — only when needed, not at startup (`cmd/gdu/app/app.go:82-84`)
- `CreateTopDirAnalyzer()` uses lock-free default filter functions avoiding mutex contention (`pkg/analyze/parallel_top_dir.go:31-32`)
- No heavy initialization in `init()` — `http.DefaultServeMux` reset only (`cmd/gdu/app/app.go:194-196`)
- PGO build (`default.pgo`) provides compiler-optimized hot paths

**2. Is memory usage controlled?**

Yes. Evidence:
- `concurrencyLimit` channel bounds parallel goroutines to `2*GOMAXPROCS(0)` (`pkg/analyze/parallel.go:13`)
- `Dir.Files` pre-allocated with capacity `len(files)` to avoid slice reallocation (`pkg/analyze/parallel.go:71`)
- `TopDirAnalyzer` designed for stack-only state — lightweight for non-interactive use (`pkg/analyze/parallel_top_dir.go:19-21`)
- BadgerDB storage reopens every 10,000 items to prevent memory accumulation (`pkg/analyze/storage.go:143-149`)
- Iterator pattern (`iter.Seq`) for file iteration avoids loading all items into memory at once (`pkg/analyze/file.go:168-180`)
- `GetFiles()` copies sorted slice rather than sorting in-place to preserve original order with minimal allocation (`pkg/analyze/file.go:171-172`)

**3. Is streaming used instead of buffering?**

Partial. Evidence:
- Progress updates stream via `progressOutChan` with non-blocking send (`pkg/analyze/analyzer.go:84-98`)
- `updateProgress()` in stdout UI uses 100ms ticker to incrementally display results (`stdout/stdout.go:498-534`)
- However, `UpdateStats()` on `Dir` recursively processes all items — not truly streaming (`pkg/analyze/file.go:238-262`)
- `ReadAnalysis()` reads entire JSON file before processing, then calls `runtime.GC()` (`stdout/stdout.go:434,441`) — buffered
- `TopDirAnalyzer.processSubDir()` uses bounded goroutine pool but collects all subdir results before emitting (`pkg/analyze/parallel_top_dir.go:133-148`)

**4. Are large operations incremental?**

Yes. Evidence:
- `concurrencyLimit` bounds concurrent subdirectory processing — prevents overwhelming filesystem
- `TopDirAnalyzer` only collects top-level directory sizes, not full tree (`pkg/analyze/parallel_top_dir.go:40-157`)
- `--top X` flag limits output to X largest files without scanning all (`stdout/stdout.go:229-230`)
- `--depth N` flag limits directory traversal depth (`stdout/stdout.go:231-232`)
- `--read-from-storage` enables reusing cached results instead of rescanning
- `--since`, `--until`, `--max-age`, `--min-age` filters skip files during traversal rather than post-filtering (`pkg/analyze/analyzer.go:51-52`)
- `processDir()` in parallel analyzer uses goroutine-per-subdir with channel-based result collection — results flow incrementally (`pkg/analyze/parallel.go:48-191`)

## Architectural Decisions

1. **Analyzer strategy pattern**: Three distinct analyzers (ParallelAnalyzer, SequentialAnalyzer, StoredAnalyzer) allow users to trade parallelism for resource constraints. Default ParallelAnalyzer maximizes SSD throughput.

2. **Concurrency bound via semaphore channel**: `concurrencyLimit` channel at `2*GOMAXPROCS(0)` prevents goroutine explosion on deep directory trees while keeping cores saturated.

3. **Progress via ticker-based channel**: `UpdateProgress()` runs in separate goroutine, ticking every 50ms, sending progress non-blocking (default case). Consumer reads at 100ms intervals. Decoupled from analysis.

4. **Lazy UI/analyzer creation**: `createUI()` decides which analyzer/UI to create based on flags at runtime, not at startup. `TopDirAnalyzer` used by default in non-interactive mode.

5. **Storage-based caching with eviction**: BadgerDB-based StoredAnalyzer with periodic `db.Close()/Open()` cycle every 10,000 items — implicit memory pressure relief.

## Notable Patterns

- **Filter functions as closure state**: `ignoreDir`, `ignoreFileType`, `matchesTimeFilterFn` stored in `BaseAnalyzer` as function fields, avoiding interface dispatch overhead.
- **atomic.Value for lock-free progress**: `progressCurrentItemName atomic.Value` avoids mutex contention on hot path (`pkg/analyze/analyzer.go:16`).
- **sync.Map for deduplication**: `TopDirAnalyzer.linkedItems sync.Map` used for hardlink deduplication without mutex (`pkg/analyze/parallel_top_dir.go:24`).
- **Deferred close with sleep hack**: Storage close deferred with 1s sleep "to close after all goroutines are done" — acknowledges goroutine lifecycle uncertainty (`pkg/analyze/stored.go:41-47`).
- **Iterator pattern for file traversal**: Go 1.25 `iter.Seq` used for `GetFiles()` — memory-efficient lazy iteration vs slice return.

## Tradeoffs

1. **Parallel by default vs. HDD performance**: ParallelAnalyzer works well on SSD but `--sequential` flag exists for rotational media. SequentialAnalyzer processes one subdir at a time, no goroutine overhead.

2. **Concurrency vs. determinism**: `ParallelAnalyzer` uses concurrent goroutines but order of subdir processing is non-deterministic. `ParallelStableOrderAnalyzer` preserves order via indexed channel but adds allocation overhead (`pkg/analyze/parallel_stable.go:76`).

3. **Progress granularity vs. overhead**: 50ms progress ticker is aggressive — generates contention on `progressItemCount` atomic operations. For very fast scans, overhead may exceed benefit.

4. **Memory vs. correctness in storage**: BadgerDB reopens every 10k items — may cause brief I/O blocking but prevents unbounded memory growth.

5. **Streaming output vs. post-processing**: stdout UI streams results as directories are scanned, but `UpdateStats()` runs after full scan, requiring complete tree in memory before output.

## Failure Modes / Edge Cases

1. **Goroutine leak on error**: If `AnalyzeDir()` returns early due to error, `a.wait.Wait()` may hang if goroutines don't call `a.wait.Done()` in error paths (`pkg/analyze/parallel.go:60-63`).

2. **SubDirChan deadlock**: `ParallelAnalyzer.processDir()` creates unbuffered `subDirChan` and spawns goroutines. If parent directory has no subdirs to process, the `go func()` that sends to `subDirChan` may block indefinitely if the reading goroutine exits early (`pkg/analyze/parallel.go:54,176-185`).

3. **Archive processing on large files**: `processZipFile()` and `processTarFile()` called in hot path — decompression could be memory-intensive for large archives without streaming.

4. **32-bit memory overflow**: `storage.go:62-66` handles 32-bit systems with `ValueLogFileSize` halving — workaround for address space limits, not full solution.

5. **Deferred storage close timing**: The 1-second sleep in `StoredAnalyzer` before closing storage is a heuristic — may be insufficient for large scans or may waste time for quick scans (`pkg/analyze/stored.go:45`).

## Future Considerations

1. **Chunked progress updates**: Instead of every 50ms ticker, consider batching updates to reduce atomic contention on high-count scans.

2. **Streaming archive processing**: Archive browsing (`isZipFile`, `isTarFile`) processes content in memory — could use streaming decompression for large archives.

3. **Context cancellation**: No evidence of `context.Context` propagation for cancellation — long-running scans cannot be interrupted gracefully.

4. **Allocation-free hot paths**: `GetFiles()` always copies slice for sorting (`pkg/analyze/file.go:172`). Could use in-place sort with mutex protection if callers tolerate ordering side effects.

## Questions / Gaps

1. **No evidence of `runtime.MemStats` profiling** — only `net/http/pprof` hooks. Internal memory profiling not observed.

2. **No evidence of GC tuning** — no `debug.SetGCPercent()`, `GOGC` environment handling, or manual `runtime.FreeOSMemory()` calls.

3. **No evidence of connection pooling** — all I/O appears to be direct, no connection reuse observed for remote filesystems.

4. **Concurrent scanner GC pressure** — `ParallelAnalyzer` creates goroutines for each subdir. On very deep trees, this could create GC pressure even with bounded concurrency. No evidence of `runtime.GC` calls or `sync.Pool` reuse.

5. **No benchmark suite observed** — while PGO build exists, no `*_test.go` files with `Benchmark` functions found in initial scan. Performance regression detection mechanism unclear.

---

Generated by `study-areas/14-performance.md` against `gdu`.