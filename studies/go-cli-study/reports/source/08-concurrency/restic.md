# Repo Analysis: restic

## Concurrency & Async Patterns

### Repo Info

| Field | Value |
|-------|-------|
| Name | restic |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/restic` |
| Group | `08-concurrency` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

restic demonstrates structured concurrency throughout its codebase. Goroutine spawning is localized to well-defined worker pools. Coordination is primarily done via `errgroup.Group` with context propagation. Cleanup is handled through explicit shutdown channels and context cancellation. Race prevention uses a mix of `sync.Mutex` and `sync.RWMutex` protecting shared state, with atomic operations for counters.

## Rating

**8/10** — Structured concurrency with clear patterns. The codebase uses `errgroup` consistently for task coordination, but some complex flows (e.g., delayed cancel context in lock.go:290) show patterns that require careful reasoning. Goroutine launching is well-localized in constructors like `newTreeSaver`, `newPackerUploader`, and `Setup`.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Goroutine launch | `go func()` in `status.go:76` for terminal status worker | `internal/ui/termstatus/status.go:76` |
| Goroutine launch | `go cleanupHandler(ch, cancel, stderr)` in `cleanup.go:18` | `cmd/restic/cleanup.go:18` |
| Goroutine launch | `go func()` in `lock.go:293` for delayed cancel | `internal/restic/lock.go:293` |
| Goroutine launch | `go func()` in `lock.go:415` for signal handling | `internal/restic/lock.go:415` |
| Goroutine launch | `wg.Go(func() error` in `repository.go:608` for pack uploader | `internal/repository/repository.go:608` |
| Goroutine launch | `wg.Go(func() error` in `tree_saver.go:33` for tree workers | `internal/archiver/tree_saver.go:33` |
| Goroutine launch | `g.Go(func() error` in `restorer.go:643` for tree traversal | `internal/restorer/restorer.go:643` |
| errgroup usage | `errgroup.WithContext(ctx)` in `repository.go:567` | `internal/repository/repository.go:567` |
| errgroup usage | `errgroup.WithContext(ctx)` in `restorer.go:640` | `internal/restorer/restorer.go:640` |
| errgroup usage | `errgroup.WithContext(ctx)` in `checker.go:214` | `internal/checker/checker.go:214` |
| errgroup usage | `wg, ctx := errgroup.WithContext(ctx)` in `parallel.go:19` | `internal/restic/parallel.go:19` |
| WaitGroup | `var wg sync.WaitGroup` in `status.go:70` | `internal/ui/termstatus/status.go:70` |
| WaitGroup | `r.blobSaver = &sync.WaitGroup{}` in `repository.go:573` | `internal/repository/repository.go:573` |
| WaitGroup | `var rewriteWg sync.WaitGroup` in `master_index.go:425` | `internal/repository/index/master_index.go:425` |
| Channel pattern | `ch := make(chan uploadTask)` in `packer_uploader.go:26` | `internal/repository/packer_uploader.go:26` |
| Channel pattern | `ch := make(chan saveTreeJob)` in `tree_saver.go:24` | `internal/archiver/tree_saver.go:24` |
| Channel pattern | `work = make(chan mustCheck, 2*nVerifyWorkers)` in `restorer.go:632` | `internal/restorer/restorer.go:632` |
| Mutex | `m sync.Mutex` in `pack/pack.go:26` | `internal/repository/pack/pack.go:26` |
| Mutex | `lock sync.Mutex` in `lock.go:32` | `internal/restic/lock.go:32` |
| RWMutex | `idxMutex sync.RWMutex` in `master_index.go:20` | `internal/repository/index/master_index.go:20` |
| Atomic | `atomic.AddUint64(&nchecked, 1)` in `restorer.go:675` | `internal/restorer/restorer.go:675` |
| Semaphore | `ch: make(chan struct{}, n)` in `semaphore.go:20` | `internal/backend/sema/semaphore.go:20` |
| Shutdown signal | `make(chan struct{})` closed in `tree_saver.go:42` | `internal/archiver/tree_saver.go:42` |
| Shutdown signal | `make(chan struct{})` closed in `packer_uploader.go:62` | `internal/repository/packer_uploader.go:62` |
| Context cancel | `defer cancel()` in `repository.go:566` | `internal/repository/repository.go:566` |
| Context cancel | `defer cancel()` in `status.go:87` | `internal/ui/termstatus/status.go:87` |
| Signal handling | `signal.Notify(ch, syscall.SIGINT, syscall.SIGTERM)` in `cleanup.go:19` | `cmd/restic/cleanup.go:19` |
| Future/promise | `ch := make(chan futureNodeResult, 1)` in `archiver.go:403` | `internal/archiver/archiver.go:403` |
| Future/promise | `futureNode.take()` method in `archiver.go:413` | `internal/archiver/archiver.go:413` |

## Answers to Protocol Questions

### 1. Where are goroutines launched?

Goroutines are launched in several localized locations:

- **Worker pool constructors**: `newTreeSaver` (`internal/archiver/tree_saver.go:32-35`) launches N tree worker goroutines. `newPackerUploader` (`internal/repository/packer_uploader.go:29-45`) launches connection-count goroutines.

- **Repository initialization**: `WithBlobUploader` (`internal/repository/repository.go:567-594`) spawns a pack uploader via `startPackUploader` which uses `innerWg, ctx := errgroup.WithContext(ctx)` at line 602 and `wg.Go(func() error` at line 608.

- **Terminal status**: `Setup` (`internal/ui/termstatus/status.go:76`) launches a single goroutine running `term.Run(cancelCtx)`.

- **Cleanup handler**: `createGlobalContext` (`cmd/restic/cleanup.go:18`) launches `cleanupHandler` goroutine.

- **Lock refresh**: `delayedCancelContext` (`internal/restic/lock.go:293`) launches a goroutine to sleep then cancel.

- **Find command**: `find.go:54` launches a goroutine to send snapshot results.

- **Mount command**: `cmd_mount.go:208` launches a goroutine for mount cleanup.

- **Check command**: `cmd_check.go:335` launches a goroutine for background check.

### 2. How are they coordinated?

Coordination is primarily via `errgroup.Group`:

- **`golang.org/x/sync/errgroup`** is used throughout with `errgroup.WithContext(ctx)` to propagate cancellation and collect errors. Key usages:
  - `repository.go:567` — blob uploader context and wait
  - `repository.go:602` — inner errgroup for pack uploaders
  - `restorer.go:640` — file verification workers
  - `checker.go:214` — checking workers
  - `parallel.go:19` — parallel list workers

- **Channels** for work distribution:
  - `saveTreeJob` channel in `tree_saver.go:24`
  - `uploadTask` channel in `packer_uploader.go:26`
  - `mustCheck` channel in `restorer.go:632`
  - `status`/`msg`/`closed` channels in `termstatus/status.go:104-106`

- **Semaphore** (`internal/backend/sema/semaphore.go`) for backend concurrency limiting via channel-based token bucket.

- **`sync.WaitGroup`** for fire-and-forget background tasks like `status.go:70` and `master_index.go:425`.

### 3. How is cleanup handled?

Cleanup is well-structured through multiple mechanisms:

- **Context cancellation**: Primary mechanism. `defer cancel()` at `repository.go:566`, `status.go:87`, `checker.go:277-278`. All errgroup contexts are derived from a cancellable parent.

- **Explicit shutdown channels**: `TriggerShutdown()` methods close channels (`tree_saver.go:42`, `packer_uploader.go:62`) that workers listen on via `case job, ok = <-jobs` with `if !ok { return nil }`.

- **Signal handling**: `cleanup.go:18-19` sets up signal handler that calls `cancel()` on SIGINT/SIGTERM.

- **WaitGroup waiting**: `wg.Wait()` blocks until all goroutines complete (`status.go:88`, `repository.go:594`).

- **Worker exit patterns**: Workers exit via `return nil` when channels close or context is cancelled (`tree_saver.go:172-177`, `packer_uploader.go:41-43`).

- **defer usage in blob saver**: `repository.go:578-582` uses defer within goroutine to handle `runtime.Goexit` from `t.Fatal`.

### 4. Are race conditions considered?

Yes, but with some areas of concern:

- **Mutex protection**: `sync.Mutex` protects mutable state in `pack/pack.go:26` (pack mutex), `lock.go:32` (lock mutex), `filerestorer.go:25`. `sync.RWMutex` protects index access in `master_index.go:20` and `index.go:50`.

- **Atomic counters**: `atomic.AddUint64` used in `restorer.go:675` for lock-free counter updates.

- **sync.Once**: Used for one-time initialization in `status.go:35` (`outputWriterOnce`), `lock.go:411` (`ignoreSIGHUP`), `lock.go:441`.

- **sync.Map**: Used for concurrent caches in `node.go:25` (`eaSupportedVolumesMap`), `checker.go:334`.

- **Potential issues**: `lock.go:290-305` uses `time.Sleep` in a goroutine with no cleanup synchronization — the goroutine runs until delay completes or parent context cancels, but there's no explicit wait for it during lock refresh.

## Architectural Decisions

1. **Worker pool pattern**: Goroutines are spawned in constructors (`newTreeSaver`, `newPackerUploader`, `newSemaphore`) with fixed or configurable counts, rather than ad-hoc `go func()`.

2. **errgroup as primary coordination**: Most concurrent operations use `errgroup.WithContext` which provides cancellation propagation and error collection. This is a strong convention.

3. **Buffered channels for backpressure**: Channels like `uploadTask` and `saveTreeJob` are unbuffered (or minimally buffered), relying on the errgroup semaphore or explicit limits to prevent unbounded growth.

4. **Shutdown via channel close**: Workers terminate by checking channel closed state (`if !ok { return nil }`) rather than polling context — cleaner and avoids context overhead.

5. **Context hierarchy**: Repository operations create child contexts with `errgroup.WithContext`, inheriting cancellation but providing isolated error collection per operation.

## Notable Patterns

- **`futureNode`** (`internal/archiver/archiver.go:390-431`): A promise-like pattern using buffered channel of size 1. Allows asynchronous tree saving with result retrieval via `take()` method that handles both immediate results and channel receive with context cancellation.

- **`errgroup.WithContext` + `wg.SetLimit`**: At `repository.go:569`, `wg.SetLimit(2 + runtime.GOMAXPROCS(0))` combines context-based cancellation with semaphore-style parallelism control.

- **Delayed context cancellation**: `delayedCancelContext` (`lock.go:290`) spawns a goroutine to cancel after a delay, used in lock refresh to give the repository time to remove old lock files.

- **Structured index rebuilding**: `master_index.go:410-463` uses a multi-stage pipeline: index IDs → loader workers → rewrite workers → saver, all coordinated via errgroup with explicit WaitGroup for loader coordination.

- **Async blob callbacks**: `saveBlobAsync` (`repository.go:621-623`) uses callback pattern with channel-based completion (`ch <- struct{}{}` at `tree_saver.go:146`).

## Tradeoffs

1. **Goroutine count management**: The `connections` parameter controls parallelism in many places, but there's no centralized limit — different subsystems (pack uploader, tree saver, backend semaphores) each have their own concurrency limits.

2. **Error propagation in nested errgroups**: `repository.go:608` nests `innerWg` within the main `wg`. If `innerWg.Wait()` returns an error at line 609, it propagates through the parent `wg`, but the nesting makes error attribution complex.

3. **Context cancellation vs explicit shutdown**: Most code prefers context cancellation, but `TriggerShutdown()` uses channel close. Both patterns coexist — no single convention.

4. **Lock refresh goroutine leak risk**: `lock.go:293-304` creates a goroutine that runs `time.Sleep(delay)` then calls `cancel()`. If the lock is refreshed frequently, many such goroutines could accumulate if not properly reaped by context cancellation.

## Failure Modes / Edge Cases

1. **Context cancellation during tree save**: `tree_saver.go:94-95` checks `fnr.err == context.Canceled` and returns early, but other errors are processed through `s.errFn` callback which may retry or ignore.

2. **Blob saver goroutine exit**: `repository.go:578-582` catches `runtime.Goexit` (from `t.Fatal` in tests) via a flag `inCallback`. This special case is not obvious and could surprise maintenance developers.

3. **Pack uploader queue堵塞**: If `repo.savePacker` blocks (e.g., network backend), the upload queue can accumulate work. No bounds on queue size are visible in `packer_uploader.go`.

4. **Index rebuilding partial failure**: In `master_index.go`, if `DecodeIndex` fails at line 437, the loader returns an error which cancels the errgroup context, but already-loaded indexes in `rewriteCh` are abandoned.

5. **Semaphore token leak**: `ReleaseToken` (`semaphore.go:31`) must be called exactly once per `GetToken`. If a goroutine panics between acquire and release, tokens leak. No recover mechanism visible.

## Future Considerations

1. **Standardize shutdown**: Adopt a consistent shutdown pattern — either all channel-close or all context-cancel — across all subsystems.

2. **Add goroutine leak detection**: Consider adding `golang.org/x/debug` tooling or explicit `sync.WaitGroup` tracking with monitoring to detect goroutine leaks in production.

3. **Context timeout for lock refresh**: The `delayedCancelContext` sleep duration could be made configurable or derived from context deadline.

4. **Queue bounds**: Consider adding bounded channels or semaphore-based backpressure for the upload queue and work channels to prevent memory exhaustion under load.

## Questions / Gaps

1. **No evidence found** for bounded queue implementations in the upload path. The `packer_uploader.uploadQueue` is unbuffered and relies on the caller to not overwhelm it.

2. **No evidence found** of `context.WithTimeout` usage in the repository layer for I/O operations — long-running I/O depends on the parent context's cancellation, which may not have a deadline.

3. **No evidence found** of structured logging with correlation IDs across goroutines — errors from concurrent operations may be hard to trace to a specific work item.

4. **No evidence found** of integration tests that verify goroutine cleanup under stress or under cancellation scenarios.

---

Generated by `study-areas/08-concurrency.md` against `restic`.