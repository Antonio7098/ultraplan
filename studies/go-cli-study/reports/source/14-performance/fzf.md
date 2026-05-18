# Repo Analysis: fzf

## Performance & Resource Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | fzf |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/fzf` |
| Group | `fzf` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

fzf is a mature, highly-optimized Go CLI fuzzy finder. It demonstrates careful attention to startup performance, memory management, and incremental processing. Key optimizations include lazy initialization of heavy components, object pooling via slab allocators, chunked data structures to bound memory growth, and optional SIMD-accelerated pattern matching.

## Rating

**8/10** — Efficient and scalable. Would still feel good at 100x scale.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Slab allocator (object pooling) | `slab16Size = 100 * 1024` (200KB), `slab32Size = 2048` (8KB) pre-allocated per worker | `src/constants.go:44-45` |
| Reader buffering | `readerBufferSize = 64 * 1024` bytes, `readerSlabSize = 128 * 1024` bytes | `src/constants.go:16-17` |
| Chunk capacity | `chunkSize = 1024` items per chunk | `src/constants.go:40` |
| Query cache limit | `queryCacheMax = chunkSize / 2` (512) — low-selectivity queries not cached | `src/constants.go:48` |
| Merger cache limit | `mergerCacheMax = 100000` — large result sets not cached | `src/constants.go:51` |
| Profiling hooks | `CPUProfile`, `MEMProfile`, `BlockProfile`, `MutexProfile` options | `src/options.go:688-691` |
| Profiling implementation | `pprof.StartCPUProfile`, `runtime.GC`, `runtime.SetBlockProfileRate`, `runtime.SetMutexProfileFraction` | `src/options_pprof.go:15-73` |
| Thread partitioning | `runtime.NumCPU()` used to determine worker count, overridable via `--threads` | `src/matcher.go:61-64` |
| Streaming filter mode | `streamingFilter := opts.Filter != nil && !sort && !opts.Tac && !opts.Sync` | `src/core.go:199` |
| EventBox coordination | Non-blocking event coordination between reader, matcher, terminal | `src/util/eventbox.go` |
| AtExit cleanup | `util.AtExit()` for profiling cleanup, runs in reverse registration order | `src/util/atexit.go:10-27` |
| Reader feed loop | Reads in 100-iteration batches with 64KB buffer, yields on each line | `src/reader.go:179-186` |
| Coordinator delay | Bounded sleep between event cycles: `coordinatorDelayMax = 100ms`, step `10ms` | `src/constants.go:12-13` |
| Adaptive height | Deferred terminal start until content fills screen | `src/core.go:363-394` |
| SIMD-accelerated search | Assembly implementations for `indexByte` on amd64 and arm64 | `src/algo/indexbyte2_amd64.s`, `src/algo/indexbyte2_arm64.s` |
| Pattern cache | `patternCache map[string]*Pattern` to avoid rebuilding patterns | `src/core.go:233` |
| ChunkCache bitmap | Per-chunk query result caching with bitmap representation | `src/cache.go:6-15` |
| Denylist for invalidation | `denylist map[int32]struct{}` for cache invalidation without full clear | `src/core.go:235-243` |
| Atomic item index | `itemIndex int32` incremented atomically during ingestion | `src/core.go:118` |
| Tail limiting | `--tail=N` option to bound items kept in memory | `src/options.go:50` |

## Answers to Protocol Questions

### 1. Is startup fast?

**Yes.** fzf defers expensive initialization:

- Heavy components (Terminal, Reader, Matcher) are created but not started immediately (`main.go:52-103`)
- Terminal start is deferred via `startChan` until content is ready or height is determined (`core.go:369-372`)
- When `--height=~` (adaptive height) is used, startup is further deferred until enough items are read (`core.go:363-394`)
- Shell integration scripts are embedded via `//go:embed` and printed on demand, not parsed on startup (`main.go:17-36`)

### 2. Is memory usage controlled?

**Yes.** fzf employs multiple memory discipline strategies:

1. **Slab allocation**: Pre-allocated `[]int16` and `[]int32` slabs per worker thread reused across scans (`src/constants.go:44-45`, `src/matcher.go:183-185`)
2. **Chunked storage**: Items stored in 1024-item chunks with bitmap caching, preventing per-item heap fragmentation (`src/chunklist.go:6-9`)
3. **Query cache limits**: Only low-selectivity (high-match-count) queries are cached; results for common queries are intentionally not cached (`src/constants.go:48`, `src/cache.go:38-40`)
4. **Merger cache limits**: Large result sets (>100k items) bypass merger caching (`src/constants.go:51`, `src/merger.go:151-153`)
5. **Tail limiting**: `--tail=N` discards older items beyond a threshold (`src/core.go:294`, `src/chunklist.go:118-169`)
6. **Chunk retirement**: Old chunks are retired and dereferenced, allowing GC (`src/chunklist.go:134`, `src/cache.go:28-34`)

### 3. Is streaming used instead of buffering?

**Partial.** fzf supports a streaming filter mode but defaults to buffered for interactive use.

- **Filter mode streaming** (`--filter` / `-f`): When used without `--sort`, `--tac`, or `--sync`, items are processed one-by-one as they're read (`src/core.go:199`, `src/core.go:268-286`)
- **Interactive mode buffering**: Full input is buffered into chunks for pattern matching across the corpus
- Reader uses a 64KB buffer with residual handling for partial lines (`src/reader.go:176-224`)
- The `feed()` method reads up to 100 lines per poll cycle before yielding (`src/reader.go:182-187`)
- Snapshot mechanism provides immutable views of the chunk list without full copy (`src/chunklist.go:117-169`)

### 4. Are large operations incremental?

**Yes.** fzf breaks work into incremental units:

1. **Chunk-based processing**: Matchers process chunks independently in parallel workers; partial results stream via `countChan` (`src/matcher.go:194-205`)
2. **Progressive results**: `EvtSearchProgress` emitted after `progressMinDuration` (200ms) to update UI without waiting for full scan (`src/matcher.go:228-230`)
3. **Scan cancellation**: `CancelScan()` / `ResumeScan()` allow interrupting scans for safe mutation (`src/matcher.go:255-267`)
4. **Adaptive delay**: Coordinator uses `coordinatorDelayStep` (10ms) with max 100ms between cycles, batching UI updates (`src/constants.go:12-13`, `src/core.go:633-637`)
5. **Adaptive height**: Terminal start deferred until `maxFit` items are available, avoiding premature rendering (`src/core.go:363-394`)

## Architectural Decisions

1. **Event-driven coordination via EventBox**: Three-way coordination between Reader, Matcher, and Terminal without blocking waits (`src/core.go:15-21`)
2. **Parallel chunk scanning**: Workers process chunks independently; results merged via k-way merge in Merger (`src/matcher.go:175-206`, `src/merger.go:155-183`)
3. **Separation of filtering vs. interactive modes**: Filter mode uses streaming; interactive mode uses chunked snapshots (`src/core.go:199`, `src/core.go:257-348`)
4. **Slab reuse across scans**: Pattern match slabs are reused across search iterations, avoiding per-scan allocation (`src/matcher.go:183-185`)
5. **Revision-based cache invalidation**: Pattern cache and merger cache use revision numbers for safe invalidation without locks (`src/core.go:231-243`)

## Notable Patterns

1. **Go-style reader pattern with pusher callback**: Reader pushes data via callback, enabling both file walking and command execution through the same interface (`src/reader.go:36-49`)
2. **Build-tagged profiling**: Profiling code compiled only with `pprof` build tag (`src/options_pprof.go:1-2`)
3. **Adaptive polling**: Reader poll interval starts at 10ms and backs off to 50ms to reduce CPU usage during slow input (`src/reader.go:54-68`)
4. **Lock-free atomic operations**: Item index uses `int32` atomic increment (`src/core.go:118`); event flags use `atomic.CompareAndSwapInt32` (`src/reader.go:56`)

## Tradeoffs

1. **Memory vs. speed in caching**: Large query caches are intentionally avoided to prevent memory bloat, but this means repeated queries against large inputs re-scan every time
2. **Chunk size trade-off**: 1024 items per chunk is a balance between memory fragmentation (too small) and allocation waste (too large)
3. **SIMD only for indexByte**: The SIMD optimization is limited to byte finding; the core fuzzy match algorithm (`FuzzyMatchV2`) does not use SIMD acceleration
4. **No mmap**: fzf reads files through standard IO rather than memory-mapping, which is slower for very large files but avoids OS-level resource limits
5. **Deferred rendering trades latency for efficiency**: Adaptive height delays display until content fills screen, which feels slow on small inputs

## Failure Modes / Edge Cases

1. **Symlink loops**: Walk function detects symlink loops via `filepath.EvalSymlinks` and skips ancestor symlinks (`src/reader.go:278-293`), but this check only runs when `follow` is enabled
2. **Straddling lines**: When a line spans multiple slab buffers, it's carried over via `leftover` slice, with a note that further optimization is possible but not worth complexity (`src/reader.go:216-223`)
3. **Query cache poisoning**: Low-selectivity queries are not cached, but repeated queries with minor variations can still cause redundant scanning
4. **Merger cache invalidation on resize**: Merger cache is cleared whenever item count changes (`src/matcher.go:130-132`), which is correct but means any input change purges the cache

## Future Considerations

1. **Streaming merge**: Current merger builds full result list before returning; a true streaming merge could reduce peak memory further
2. **SIMD for fuzzy matching**: The `FuzzyMatchV2` algorithm could benefit from SIMD acceleration similar to `indexByte`
3. **Memory-mapped input**: For very large files, mmap-based reading could reduce copying overhead
4. **Configurable slab sizes**: Exposing `SLAB_KB` and `BUF_KB` environment variables (currently commented out in `src/reader.go:154-166`) would allow tuning for specific workloads

## Questions / Gaps

1. **No evidence found** for explicit GC hints or `runtime.GC()` calls in the hot path. The profiler integration calls `runtime.GC()` before heap dumps (`src/options_pprof.go:49`) but not during normal operation.
2. **No evidence found** for `sync.Pool` usage; slabs are manually allocated and reused, which is more explicit but requires care during long-running sessions.
3. **No evidence found** for transparent huge page configuration or NUMA awareness, which could affect performance on very large inputs.

---

Generated by `study-areas/14-performance.md` against `fzf`.