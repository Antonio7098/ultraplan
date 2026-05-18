# Repo Analysis: k9s

## Performance & Resource Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | k9s |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/k9s` |
| Group | `14-performance` |
| Language / Stack | Go + Kubernetes client-go + tview UI |
| Analyzed | 2026-05-15 |

## Summary

k9s is a Kubernetes CLI UI tool with significant initialization costs. It uses lazy initialization for most components, but the mandatory Kubernetes client initialization blocks startup. Memory is controlled through informer caching with per-namespace factories, though image scanning runs lazily in a separate goroutine. No explicit profiling hooks or benchmark flags are exposed to users. The CLI buffers log lines before rendering rather than streaming directly.

## Rating

**6/10** — Acceptable performance with notable startup delays due to mandatory Kubernetes connectivity and configuration loading. The UI framework and informer-based watching introduce overhead that would be noticeable at scale.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Initialization timing | `run()` in `cmd/root.go:76-128` loads config, establishes K8s connection, creates App, initializes factory | `cmd/root.go:130-169` |
| Lazy initialization | Image scanner initialized only if enabled in config | `internal/view/app.go:138-140` |
| Lazy initialization | Command aliases loaded on demand via `a.command.Init()` | `internal/view/app.go:130-132` |
| Worker pool | `WorkerPool` with configurable semaphore-based concurrency | `internal/pool.go:11-79` |
| Buffer handling | LogItems uses `bytes.Buffer` with pre-allocated capacity | `internal/dao/log_items.go:129` |
| Buffer handling | Benchmark results buffered before saving to disk | `internal/perf/benchmark.go:114` |
| Memory discipline | `Table.Peek()` clones data on every read (`model/table.go:196-201`) | `internal/model/table.go:200` |
| Memory discipline | Informer factories per-namespace to limit cache scope | `internal/watch/factory.go:265-287` |
| Streaming | Log viewer uses sliding window (`LogItems.Shift()`) not full buffering | `internal/dao/log_items.go:72-77` |
| Incremental operations | Cluster refresh uses backoff retry with configurable intervals | `internal/view/app.go:372-392` |
| Profiling hooks | No `pprof` endpoints or profiling flags found | — |
| Benchmark support | Built-in benchmark tool for services (`internal/perf/benchmark.go`) | `internal/perf/benchmark.go:33-157` |
| GC management | No explicit GC tuning or memory profiling | — |

## Answers to Protocol Questions

### 1. Is startup fast?

**No.** Startup is blocked by mandatory Kubernetes connectivity checks (`cmd/root.go:137-161`). The `loadConfiguration()` function attempts to connect to the API server and validate the current context before the UI can render. While some components like image scanning are deferred, the connection validation is synchronous and cannot be skipped.

Evidence: `cmd/root.go:137-161` shows `client.InitConnection()` being called and blocking until connectivity is verified.

### 2. Is memory usage controlled?

**Partially.** The informer-based architecture caches Kubernetes resources, which is necessary for UI responsiveness but can grow unbounded. Per-namespace factory splitting (`internal/watch/factory.go:265-287`) limits scope, but no cache size limits or eviction policies were found. The `Table.Peek()` method clones data on every read (`internal/model/table.go:200`), doubling memory pressure during refresh cycles.

Evidence: `internal/model/table.go:196-201` shows `data.Clone()` in `Peek()`. `internal/watch/factory.go:265-287` shows per-namespace factory creation without size limits.

### 3. Is streaming used instead of buffering?

**Partial.** Log viewing uses a sliding window approach with `LogItems.Shift()` (`internal/dao/log_items.go:72-77`) which avoids loading all logs into memory. However, the standard table viewer fetches and renders full lists synchronously, and benchmark results are fully buffered before being written to disk (`internal/perf/benchmark.go:114`).

Evidence: `internal/dao/log_items.go:72-77` shows shift-based log scrolling. Benchmark buffering at `internal/perf/benchmark.go:114-123`.

### 4. Are large operations incremental?

**Yes.** The `WorkerPool` (`internal/pool.go:15-79`) provides semaphore-based concurrency control for parallel operations. The cluster model updater uses exponential backoff (`internal/view/app.go:372`) for retry cycles. The table model refresh uses `atomic.CompareAndSwapInt32` to drop concurrent updates rather than queuing them (`internal/model/table.go:230-233`).

Evidence: `internal/pool.go:26-48` shows pool creation with configurable size. `internal/view/app.go:372-392` shows backoff-based refresh.

## Architectural Decisions

1. **Informer-based caching**: k9s relies on Kubernetes informer factories for all resource watching. This provides reactivity but requires caching all watched resources in memory. Each namespace gets its own factory (`internal/watch/factory.go:265-287`).

2. **Blocking startup validation**: Connection to Kubernetes API is validated synchronously at startup (`cmd/root.go:137-161`). No headless or read-only mode that skips connectivity.

3. **UI framework overhead**: Uses `tview` and `tcell` for terminal UI. The multi-page architecture and constant table refresh cycles introduce overhead even when idle.

4. **Lazy component initialization**: Image scanner (`internal/view/app.go:138-140`), command alias loading (`internal/view/app.go:130-132`), and custom views watcher (`internal/view/app.go:349-357`) are all deferred.

## Notable Patterns

- **Semaphore-based worker pool**: `internal/pool.go:26-48` uses a channel-based semaphore pattern to limit concurrent work.
- **Exponential backoff on failures**: `internal/view/app.go:372-392` uses `cenkalti/backoff` for cluster refresh retries.
- **Atomic update dropping**: `internal/model/table.go:230-233` drops refresh cycles if previous cycle not complete, avoiding queue buildup.
- **Per-namespace informer factories**: `internal/watch/factory.go:265-287` creates separate factories per namespace to scope cache growth.
- **Log sliding window**: `internal/dao/log_items.go:72-77` shifts log items rather than appending, keeping memory bounded during log scrolling.

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| Informer caching | Fast UI updates vs. unbounded memory growth |
| Synchronous K8s connection | Guaranteed connectivity at startup vs. slow startup time |
| Table data cloning on peek | Thread-safe reads vs. doubled memory during refresh |
| Backoff on cluster refresh | Graceful degradation vs. delayed failure detection |
| Sliding log window | Bounded memory vs. can't go back to older logs without reload |

## Failure Modes / Edge Cases

1. **K8s connectivity loss**: If connection drops during operation, the cluster updater retries with backoff and eventually calls `BailOut(1)` (`internal/view/app.go:423`). The UI freezes until reconnection or exit.

2. **Namespace explosion**: Watching all namespaces creates informer factories per namespace (`internal/watch/factory.go:265-287`). With many namespaces, this can exhaust memory.

3. **Large log files**: While log viewing uses a sliding window (`internal/dao/log_items.go:72-77`), loading a large historical log still requires reading entire file into `bytes.Buffer` before rendering (`internal/perf/benchmark.go:114`).

4. **Benchmark file accumulation**: Benchmark results are saved to disk (`internal/perf/benchmark.go:127-156`) but no cleanup mechanism found — files accumulate indefinitely.

## Future Considerations

1. Add `pprof` endpoints for runtime profiling in headless mode.
2. Implement cache size limits with LRU eviction for informer factories.
3. Make Kubernetes connectivity check optional for read-only headless operation.
4. Add benchmark result retention policy with automatic cleanup.

## Questions / Gaps

1. **No profiling hooks found**: No evidence of `net/http/pprof` handlers or `-bench` flag integration for external profiling. Benchmark functionality exists but is internal to the UI, not a CLI flag.

2. **Cache growth unbounded**: No evidence of cache size limits or memory pressure handling in informer factories.

3. **No incremental load for large tables**: `Table.refresh()` loads all resources then renders (`internal/model/table.go:229-291`). No pagination or virtualized scrolling for large result sets.

---

Generated by `study-areas/14-performance.md` against `k9s`.