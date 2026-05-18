# Repo Analysis: gdu

## Concurrency & Async Patterns

### Repo Info

| Field | Value |
|-------|-------|
| Name | gdu |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` |
| Group | `08-concurrency` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

gdu is a disk usage analyzer with a TUI and non-interactive output modes. It uses structured concurrent directory scanning with semaphore-based goroutine limiting, custom wait groups, and mutex-protected shared state. The codebase shows clear separation between analysis strategies (parallel, sequential, stable-order) with coordinated shutdown.

## Rating

**8/10** — Structured concurrency with clear launch boundaries and coordinated cleanup. The custom WaitGroup and semaphore pattern are idiomatic. Minor扣分 for complex mutex usage in File/Dir types that could benefit from simpler primitives.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Goroutine launch | `go a.UpdateProgress()` in AnalyzeDir | `pkg/analyze/parallel.go:36` |
| Goroutine launch | Subdirectory goroutines in processDir | `pkg/analyze/parallel.go:84-91` |
| Goroutine launch | Background collector goroutine | `pkg/analyze/parallel.go:176-185` |
| Goroutine launch | UpdateProgress in SequentialAnalyzer | `pkg/analyze/sequential.go:31` |
| Goroutine launch | TopDirAnalyzer subdir processing | `pkg/analyze/parallel_top_dir.go:81-84` |
| Goroutine launch | Nested subdir goroutines | `pkg/analyze/parallel_top_dir.go:185-189` |
| Goroutine launch | deleteWorker goroutines | `tui/tui.go:388-390` |
| Goroutine launch | Signal handler goroutine | `tui/tui.go:316-335` |
| Semaphore limit | `concurrencyLimit` channel | `pkg/analyze/parallel.go:13` |
| Semaphore limit | Same in parallel_top_dir | `pkg/analyze/parallel_top_dir.go:183` |
| Custom WaitGroup | WaitGroup struct with mutexes | `pkg/analyze/wait.go:7-11` |
| Custom WaitGroup | Init, Add, Done, Wait methods | `pkg/analyze/wait.go:14-49` |
| Mutex protection | Dir.m sync.RWMutex | `pkg/analyze/file.go:159` |
| Mutex protection | GetFilesLocked RLock pattern | `pkg/analyze/file.go:185-200` |
| Mutex protection | GetItemCount RLock | `pkg/analyze/file.go:210-212` |
| Mutex protection | workersMut for activeWorkers | `tui/tui.go:81` |
| Atomic usage | progressItemCount atomic.Int64 | `pkg/analyze/analyzer.go:14` |
| Atomic usage | progressTotalUsage atomic.Int64 | `pkg/analyze/analyzer.go:15` |
| Atomic usage | progressCurrentItemName atomic.Value | `pkg/analyze/analyzer.go:16` |
| Channel pattern | subDirChan for collecting results | `pkg/analyze/parallel.go:54` |
| Channel pattern | deleteQueue channel | `tui/tui.go:56` |
| Sync map | linkedItems sync.Map | `pkg/analyze/parallel_top_dir.go:24` |

## Answers to Protocol Questions

### 1. Where are goroutines launched?

**Analysis Entry Points:**
- `pkg/analyze/parallel.go:36` — `go a.UpdateProgress()` launches progress ticker goroutine
- `pkg/analyze/parallel.go:84-91` — Subdirectory goroutines spawned via `go func(entryPath string)` for each directory
- `pkg/analyze/parallel.go:176-185` — Background collector goroutine for subdirectory results
- `pkg/analyze/parallel_stable.go:90-97` — Same pattern with indexedItem channel
- `pkg/analyze/parallel_top_dir.go:81-84` — TopDirAnalyzer entry-level subdir goroutines
- `pkg/analyze/parallel_top_dir.go:185-189` — Recursive nested subdir goroutines with semaphore fallback
- `pkg/analyze/sequential.go:31` — Only UpdateProgress goroutine (sequential scan)

**Deletion/UI:**
- `pkg/remove/parallel.go:28-41` — Parallel file deletion goroutines
- `tui/background.go:9-13` — `queueForDeletion` goroutine
- `tui/tui.go:388-390` — `deleteWorker` pool (3 * GOMAXPROCS workers)
- `tui/tui.go:316-335` — Signal handler goroutine
- `cmd/gdu/app/app.go:578-585` — pprof HTTP server goroutine

### 2. How are they coordinated?

**Semaphore-based Concurrency Limiting:**
- `pkg/analyze/parallel.go:13` — `var concurrencyLimit = make(chan struct{}, 2*runtime.GOMAXPROCS(0))`
- Goroutines acquire before processing: `<-concurrencyLimit` before `a.processDir(entryPath)`
- Release after completion: `<-concurrencyLimit` after subdir processing

**Custom WaitGroup:**
- `pkg/analyze/wait.go:7-11` — Custom WaitGroup with two mutexes (wait and access)
- `pkg/analyze/parallel.go:58` — `a.wait.Add(1)` before processing
- `pkg/analyze/parallel.go:184` — `a.wait.Done()` when subdirectory complete
- `pkg/analyze/parallel.go:40` — `a.wait.Wait()` blocks until all done

**Channel-based Result Collection:**
- `pkg/analyze/parallel.go:54` — `subDirChan = make(chan *Dir)` collects subdirectory results
- `pkg/analyze/parallel.go:176-185` — Background goroutine reads and aggregates
- `pkg/analyze/parallel_stable.go:76` — Buffered `itemChan` with indices for stable ordering

**Atomic Progress Updates:**
- `pkg/analyze/analyzer.go:14-16` — atomic.Int64 and atomic.Value for progress counters
- `pkg/analyze/parallel.go:187-189` — Updates via `progressCurrentItemName.Store`, `progressItemCount.Add`, `progressTotalUsage.Add`

**TUI Worker Coordination:**
- `tui/tui.go:157` — `deleteQueue` channel (buffered 1000) for delete requests
- `tui/tui.go:80-81` — Mutexes `statusMut` and `workersMut` protect shared state
- `tui/tui.go:89-93` — `increaseActiveWorkers/decreaseActiveWorkers` with mutex

### 3. How is cleanup handled?

**Graceful Shutdown in Analyzers:**
- `pkg/analyze/parallel.go:42` — `a.progressDoneChan <- struct{}{}` signals UpdateProgress to exit
- `pkg/analyze/parallel.go:43` — `a.doneChan.Broadcast()` signals completion
- `pkg/analyze/analyzer.go:84-98` — UpdateProgress exits via `case <-a.progressDoneChan: return`
- `pkg/analyze/parallel.go:40` — `a.wait.Wait()` ensures all subdir goroutines complete before return

**TopDirAnalyzer Cleanup:**
- `pkg/analyze/parallel_top_dir.go:133-135` — `<-subDirChan` waits for all subdir goroutines
- `pkg/analyze/parallel_top_dir.go:137` — `a.wait.Wait()` blocks on custom WaitGroup

**TUI Delete Worker Cleanup:**
- `tui/background.go:19-24` — `deleteWorker` has recover() panic handler that stops app
- `tui/background.go:26-28` — Range over `deleteQueue` channel blocks until closed
- `tui/tui.go:331-334` — Signal handler calls `ui.app.Stop()`

**Progress Ticker Cleanup:**
- `pkg/analyze/analyzer.go:86` — `defer ticker.Stop()` in UpdateProgress

### 4. Are race conditions considered?

**Mutex Protection for Shared Data:**
- `pkg/analyze/file.go:159` — `Dir` struct embeds `sync.RWMutex` as `m`
- `pkg/analyze/file.go:185-200` — `GetFilesLocked` uses `f.m.RLock()` / `defer f.m.RUnlock()`
- `pkg/analyze/file.go:210-212` — `GetItemCount` uses RLock pattern
- `tui/tui.go:81` — `workersMut sync.Mutex` for `activeWorkers` counter
- `tui/tui.go:89-93` — Protected access via `increaseActiveWorkers/decreaseActiveWorkers`
- `tui/tui.go:90-91` — Lock/defer Unlock pattern

**Atomic Operations for Counters:**
- `pkg/analyze/analyzer.go:14` — `progressItemCount atomic.Int64` (safe for concurrent inc)
- `pkg/analyze/analyzer.go:15` — `progressTotalUsage atomic.Int64`
- `pkg/analyze/analyzer.go:16` — `progressCurrentItemName atomic.Value`
- `pkg/analyze/parallel.go:187-189` — Direct Add/Store calls (atomic)

**Sync Map for Concurrent Maps:**
- `pkg/analyze/parallel_top_dir.go:24` — `linkedItems sync.Map` for hard-link tracking
- `pkg/analyze/parallel_top_dir.go:228-230` — `LoadOrStore` for concurrent access

**Channel-based Isolation:**
- `tui/tui.go:56` — `deleteQueue chan deleteQueueItem` isolates delete operations
- `tui/background.go:11` — Channel send for work distribution

## Architectural Decisions

1. **Custom WaitGroup over stdlib** — `pkg/analyze/wait.go:7-11` implements a WaitGroup where Add can be called from goroutines (unlike sync.WaitGroup which requires Add before goroutine spawn). This enables dynamic work discovery.

2. **Semaphore Channel for Concurrency Limiting** — Using a buffered channel as semaphore (`pkg/analyze/parallel.go:13`) instead of counting semaphore or worker pool. Simple and idiomatic Go pattern.

3. **Parallel vs Sequential Analyzers** — Separate `ParallelAnalyzer`, `SequentialAnalyzer`, `ParallelStableOrderAnalyzer`, `TopDirAnalyzer` structs. User can choose via flags (`--sequential-scanning`).

4. **Progress Updates via Atomic + Channel** — `BaseAnalyzer` uses atomic.Int64 for counters but signals via `progressOutChan` to avoid channel flooding (`pkg/analyze/analyzer.go:92-95` has default case).

5. **TUI Delete Worker Pool** — Fixed pool size of `3 * runtime.GOMAXPROCS(0)` (`tui/tui.go:158`) for parallel deletes.

## Notable Patterns

1. **Semaphore-gated recursion** — `processDir` acquires semaphore token before recursing into subdirectories. This is a clean pattern for bounded parallelism.

2. **Background result collector** — The pattern of spawning a goroutine to collect subdirectory results from a channel while parent continues is elegant (`pkg/analyze/parallel.go:176-185`).

3. **Stable ordering via indexed channel** — `ParallelStableOrderAnalyzer` sends indexed items through a channel (`pkg/analyze/parallel_stable.go:76`), then sorts in collector goroutine (`pkg/analyze/parallel_stable.go:144-156`).

4. **Mutex + iterator pattern** — `GetFilesLocked` at `pkg/analyze/file.go:185-200` returns an iterator function that holds RLock for the duration of iteration, preventing modification during iteration.

5. **Adaptive parallelism in TopDirAnalyzer** — `parallel_top_dir.go:182-192` uses `select` with default to fall back to synchronous processing when semaphore is full, preventing unbounded goroutine growth.

## Tradeoffs

1. **Custom WaitGroup complexity** — The custom WaitGroup (`pkg/analyze/wait.go`) is more complex than sync.WaitGroup and has subtle locking behavior. Could be harder to reason about.

2. **Global concurrency limit** — `concurrencyLimit` is a package-level variable (`pkg/analyze/parallel.go:13`), meaning all ParallelAnalyzers share the same semaphore. This could cause unexpected throttling if multiple analyzers run concurrently.

3. **RWMutex in Dir vs sync.Mutex** — `sync.RWMutex` is appropriate for Dir because read-heavy workloads (iterating files) benefit from concurrent readers. However, AddFile at `pkg/analyze/file.go:163-164` is unprotected—only GetFilesLocked is protected, not AddFile.

4. **Delete worker panic recovery** — `tui/background.go:19-24` catches panics in delete workers and calls `ui.app.Stop()`. This is blanket recovery that could mask other bugs.

## Failure Modes / Edge Cases

1. **Goroutine leak potential** — If `AnalyzeDir` returns early due to error before `a.wait.Wait()`, goroutines may not complete. The code at `pkg/analyze/parallel.go:30-46` appears safe, but edge cases around initial `os.ReadDir` errors could cause issues.

2. **Channel blocking** — The `subDirChan` in `processDir` is unbuffered. If the collector goroutine panics before reading all subdirectories, the producer goroutines will deadlock. No defensive close mechanism.

3. **Global semaphore starvation** — Package-level `concurrencyLimit` means one analyzer can starve others. If many parallel analyses are queued, some may wait indefinitely.

4. **Race between GetFiles and AddFile** — `GetFiles` (non-locked) at `pkg/analyze/file.go:168-181` does not hold the mutex, only `GetFilesLocked` does. Code calling `GetFiles` while another goroutine calls `AddFile` could race.

5. **Delete queue overflow** — `deleteQueue` channel has capacity 1000 (`tui/tui.go:157`). If queue fills up, `queueForDeletion` goroutine at `tui/background.go:9-13` will block, potentially causing UI freeze during bulk delete operations.

## Future Considerations

1. **Context propagation** — No use of `context.Context` for cancellation. Adding context would enable proper cancellation of long-running scans.

2. **errgroup consideration** — The project doesn't use `golang.org/x/sync/errgroup`. Could simplify error handling across goroutine trees.

3. **Worker pool tuning** — Delete worker count `3 * GOMAXPROCS` is hardcoded. This could be made configurable via flag.

4. **Structured shutdown** — A more robust shutdown mechanism using `context.WithCancel` or `errgroup` with graceful goroutine termination could replace the current custom signaling.

## Questions / Gaps

1. **Why custom WaitGroup?** — The reason for custom WaitGroup over sync.WaitGroup is that Add can be called after goroutine spawn. However, sync.WaitGroup can do this too if you call Add(1) before the go statement. Is there a specific reason for the custom implementation? No evidence found of documented rationale.

2. **Is the global concurrency limit intentional?** — `concurrencyLimit` at package scope is shared across all analyzers. Is this the intended behavior or a bug? Could cause cross-analyzer interference.

3. **No test coverage for race conditions** — Running `go test -race` on the analyze package would reveal race conditions. No evidence of `-race` in test scripts or CI configuration.

4. **Missing evidence of stress testing** — No evidence of concurrent edge case tests (many subdirs, deep nesting, rapid AddFile/GetFiles).

---

Generated by `study-areas/08-concurrency.md` against `gdu`.