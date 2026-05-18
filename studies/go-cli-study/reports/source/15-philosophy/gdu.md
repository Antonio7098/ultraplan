# Repo Analysis: gdu

## Engineering Philosophy & Tradeoffs

### Repo Info

| Field | Value |
|-------|-------|
| Name | gdu |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` |
| Group | `gdu` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Gdu is a disk usage analyzer optimized for performance on SSDs through aggressive parallel processing, while still maintaining functionality for HDDs via a sequential mode. The project prioritizes raw scanning speed as its core value, with interactive TUI and scripting-friendly non-interactive modes. It demonstrates a clear "performance first" philosophy with deliberate acceptance of complexity (parallel analyzers, multiple storage backends, archive browsing) and conscious rejection of unnecessary abstraction (single binary, no external runtime deps).

## Rating

**8/10** — Strong coherent engineering style with disciplined tradeoffs. The code consistently prioritizes performance while providing necessary flexibility. Some inconsistency between the stated philosophy ("pretty fast") and actual implementation (benchmarks show competitive but not always fastest) prevents a higher score.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Performance philosophy | Concurrency limit channel: `2*runtime.GOMAXPROCS(0)` | `pkg/analyze/parallel.go:13` |
| SSD-first design | Parallel processing for SSD, sequential mode for HDD | `cmd/gdu/main.go:54` |
| Memory efficiency | TopDirAnalyzer only builds top-level structure | `pkg/analyze/parallel_top_dir.go:18-21` |
| Multiple analyzers | `CreateAnalyzer()`, `CreateTopDirAnalyzer()`, `CreateSeqAnalyzer()`, `CreateStableOrderAnalyzer()` | `pkg/analyze/parallel.go:22`, `pkg/analyze/parallel_top_dir.go:28`, `pkg/analyze/sequential.go:*` |
| Storage backends | SQLite and BadgerDB for persistent analysis | `pkg/analyze/sqlite.go:*`, `pkg/analyze/stored.go:*` |
| Benchmarking culture | Comprehensive benchmarks with hyperfine, cold/warm cache testing | `Makefile:122-167` |
| Config file defaults | Default ignore dirs: `[/proc,/dev,/sys,/run]` | `cmd/gdu/main.go:59` |
| Platform-specific code | BSD, Linux, Windows, Plan9 conditional paths | `pkg/device/dev_*.go`, `pkg/analyze/dir_*.go` |
| TUI framework | tview-based interactive interface | `tui/tui.go:*` |

## Answers to Protocol Questions

### 1. What philosophy does this repo optimize for?

**Performance through parallelism** — Gdu's primary optimization target is raw scanning speed on modern hardware, particularly SSDs where parallel I/O yields gains. Evidence:

- `cmd/gdu/main.go:53` — `max-cores` flag defaults to `runtime.NumCPU()`, allowing full CPU utilization
- `pkg/analyze/parallel.go:13` — `concurrencyLimit = make(chan struct{}, 2*runtime.GOMAXPROCS(0))` caps concurrency at 2x CPU count
- `README.md:12-13` — "Gdu is intended primarily for SSD disks where it can fully utilize parallel processing"
- Benchmarks in `README.md:262-294` compare against 10 alternatives, demonstrating competitive positioning

The project optimizes for the **common case** (interactive SSD usage) while providing a safety valve for the **edge case** (rotating HDDs via `--sequential` flag at `cmd/gdu/main.go:54`).

### 2. What complexity is intentionally accepted?

Gdu accepts significant implementation complexity to deliver performance:

1. **Multiple analyzer strategies** — The codebase maintains 4+ distinct analyzers:
   - `ParallelAnalyzer` (`pkg/analyze/parallel.go`) — standard parallel
   - `ParallelStableOrderAnalyzer` (`pkg/analyze/parallel_stable.go`) — maintains file order
   - `TopDirAnalyzer` (`pkg/analyze/parallel_top_dir.go`) — memory-efficient for non-interactive
   - `SequentialAnalyzer` (`pkg/analyze/sequential.go`) — for HDDs

2. **Storage backends** — SQLite and BadgerDB (`pkg/analyze/sqlite.go`, `pkg/analyze/stored.go`) for persistent analysis, adding ~27% overhead in cold-cache scenarios per benchmarks

3. **Archive browsing** — Zip and tar archive inspection (`pkg/analyze/zipdir.go`, `pkg/analyze/tardir.go`)

4. **Platform-specific code** — Separate implementations for Linux, BSD, Windows, Plan9 in `pkg/device/dev_*.go` and `pkg/analyze/dir_*.go`

5. **Time-based filtering** — `pkg/timefilter/timefilter.go` for `--since`, `--until`, `--max-age`, `--min-age` flags

6. **Extensive flag surface** — 50+ command-line flags in `cmd/gdu/main.go:46-111` with YAML config equivalents in `configuration.md`

### 3. What complexity is intentionally avoided?

1. **No external runtime dependencies** — CGO_ENABLED=0 in `Makefile:35`, static binaries
2. **No plugin/extension system** — The binary is self-contained; features are built-in
3. **No distributed processing** — No cluster/multi-machine support; single-node only
4. **No GUI** — Terminal-only with tview; no web UI or desktop integration
5. **No caching daemon** — Analysis runs fresh each time (except with explicit `--db` flag)
6. **Simple dependency tree** — `go.mod` shows minimal dependencies: tcell/tview for TUI, sirupsen/logrus for logging, spf13/cobra for CLI, yaml for config

### 4. What does the code reveal that docs don't?

- **Conservative default for cross-FS traversal** — `NoCross` disabled by default (`cmd/gdu/main.go:74`), unlike `ncdu` which crosses by default; shows safety-over-convenience bias
- **Graceful degradation in TopDirAnalyzer** — Uses stack-based traversal with `sync.Map` for linked item tracking (`pkg/analyze/parallel_top_dir.go:24`), not building full tree
- **Hard link tracking complexity** — `HardLinkedItems` map in `pkg/fs/file.go:59` handles inode-based deduplication explicitly
- **Global mutable state in analyzer** — `concurrencyLimit` channel is package-level global (`pkg/analyze/parallel.go:13`), not instance-specific
- **Signal handling** — `common.SignalGroup` for goroutine coordination shows non-trivial async design

## Architectural Decisions

| Decision | Rationale | Evidence |
|----------|-----------|----------|
| Parallel scanning as default | SSDs benefit most; HDDs can use `--sequential` | `cmd/gdu/main.go:54`, `README.md:12-13` |
| TopDirAnalyzer for non-interactive | Memory efficiency: constant regardless of tree size | `pkg/analyze/parallel_top_dir.go:19-21` |
| Three UI modes (TUI, stdout, export) | Different use cases need different presentations | `cmd/gdu/app/app.go:360-431` |
| YAML config + flags | User convenience; config file writable via `--write-config` | `cmd/gdu/main.go:104-198` |
| PGO profiling | Evidence-based optimization via `default.pgo` | `Makefile:109-112`, `default.pgo` |

## Notable Patterns

1. **Strategy pattern for analyzers** — `common.Analyzer` interface (`internal/common/analyze.go:25-35`) with multiple implementations
2. **Channel-based concurrency limiting** — `concurrencyLimit` semaphore pattern at `pkg/analyze/parallel.go:13`
3. **Platform-specific file splitting** — `dir_linux.go`, `dir_other.go`, `dev_linux.go`, `dev_bsd.go`
4. **Functional options for UI config** — `tui.Option` func closures in `cmd/gdu/app/app.go:434-560`
5. **Benchmark-driven development** — `Makefile:122-167` with cold/warm cache differentiation

## Tradeoffs

| Tradeoff | Accepted Because |
|----------|------------------|
| 4+ analyzer implementations | Different hardware needs different strategies |
| Storage backend overhead | Persistence valuable for large filesystems |
| ~50 flags | Flexibility for diverse use cases |
| tview dependency | Rich TUI justified for interactive use |
| Global concurrency limit | Simpler than per-instance configuration |

## Failure Modes / Edge Cases

1. **Memory pressure on huge trees** — Full parallel analyzer builds entire tree in memory (`pkg/analyze/parallel.go:48-191`); use `--top` or `--depth` to limit
2. **Sequential mode still parallelizes** — Even `--sequential` doesn't fully disable goroutines in subdirs (`pkg/analyze/sequential.go`)
3. **Database lock contention** — SQLite backend shows 10x cold-cache overhead (`README.md:274`) due to write locking
4. **Hard link double-counting risk** — `TopDirAnalyzer.linkedItems` (`pkg/analyze/parallel_top_dir.go:24`) uses `sync.Map` for tracking; potential race if not properly synchronized
5. **Archive browsing re-parses on each access** — No caching of zip/tar contents (`pkg/analyze/zipdir.go`)

## Future Considerations

1. **Incremental scanning** — Only re-scan changed portions (noted in issues but not implemented)
2. **Streaming JSON export** — Current implementation buffers in memory (`report/export.go`)
3. **WebAssembly port** — Could enable browser-based disk analysis
4. **Better HDD heuristics** — Auto-detect storage type and choose analyzer automatically

## Questions / Gaps

1. **No explicit design document** — Philosophy is implicit in code; no `ARCHITECTURE.md` or `PHILOSOPHY.md`
2. **Why two stable-order analyzers?** — `ParallelStableOrderAnalyzer` vs `TopDirAnalyzer` both maintain order but different memory models — unclear if both are necessary
3. **PGO profiling opaqueness** — `default.pgo` is a binary artifact; no documentation of what workload generated it
4. **No community guidelines** — Missing `CONTRIBUTING.md`, unclear how decisions are made

---

Generated by `study-areas/15-philosophy.md` against `gdu`.