# Concurrency & Async Patterns - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Protocol | `study-areas/08-concurrency.md` |
| Groups | 08-concurrency, gh-cli, go-task, mitchellh-cli, urfave-cli, go-cli-study |
| Date | 2026-05-15 |

## Repositories Studied

| # | Repo | Path | Group |
|---|------|------|-------|
| 1 | age | `/home/antonioborgerees/coding/go-cli-study/repos/age` | 08-concurrency |
| 2 | chezmoi | `/home/antonioborgerees/coding/go-cli-study/repos/chezmoi` | 08-concurrency |
| 3 | dive | `/home/antonioborgerees/coding/go-cli-study/repos/dive` | 08-concurrency |
| 4 | fzf | `/home/antonioborgerees/coding/go-cli-study/repos/fzf` | 08-concurrency |
| 5 | gdu | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` | 08-concurrency |
| 6 | gh-cli | `/home/antonioborgerees/coding/go-cli-study/repos/gh-cli` | gh-cli |
| 7 | go-task | `/home/antonioborgerees/coding/go-cli-study/repos/go-task` | go-task |
| 8 | helm | `/home/antonioborgerees/coding/go-cli-study/repos/helm` | 08-concurrency |
| 9 | k9s | `/home/antonioborgerees/coding/go-cli-study/repos/k9s` | 08-concurrency |
| 10 | lazygit | `/home/antonioborgerees/coding/go-cli-study/repos/lazygit` | 08-concurrency |
| 11 | mitchellh-cli | `/home/antonioborgerees/coding/go-cli-study/repos/mitchellh-cli` | mitchellh-cli |
| 12 | opencode | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` | go-cli-study |
| 13 | rclone | `/home/antonioborgerees/coding/go-cli-study/repos/rclone` | 08-concurrency |
| 14 | restic | `/home/antonioborgerees/coding/go-cli-study/repos/restic` | 08-concurrency |
| 15 | urfave-cli | `/home/antonioborgerees/coding/go-cli-study/repos/urfave-cli` | urfave-cli |
| 16 | yq | `/home/antonioborgerees/coding/go-cli-study/repos/yq` | 08-concurrency |

## Executive Summary

Concurrency approaches across elite Go CLI projects fall into three broad clusters:

1. **Structured concurrency (7–8/10)**: Projects like fzf, gdu, lazygit, go-task, restic, and opencode use `errgroup.Group`, `sync.WaitGroup`, channels, and mutexes to coordinate goroutines with clear lifecycle boundaries.

2. **Functional but scattered (5–6/10)**: Projects like age, chezmoi, dive, helm, k9s, rclone, mitchellh-cli use concurrency but without consistent patterns — goroutines launch ad-hoc, cleanup is implicit, and coordination is manual.

3. **No concurrency (3/10)**: Projects like yq and urfave-cli are intentionally single-threaded by design, processing data sequentially without goroutines.

The main finding: most Go CLI projects that do concurrency use `sync.WaitGroup` as their primary coordination primitive. `golang.org/x/sync/errgroup` is used by about half of them (lazygit, restic, go-task, rclone, gh-cli) but not uniformly. Context cancellation is the dominant cleanup mechanism; explicit wait-with-timeout patterns are rare but appear in higher-rated projects.

## Core Thesis

Go CLI projects tend toward "just enough concurrency" — they use concurrency where I/O patterns demand it (parallel API calls, filesystem walking, background tasks) but avoid general-purpose parallel processing. Projects with high ratings share common traits: localized goroutine launch sites, structured coordination primitives (errgroup or WaitGroup), mutex protection for shared state, and context-driven cleanup. Projects with low ratings either lack concurrency entirely or use it inconsistently without clear lifecycle management.

## Rating Summary

| Repo | Score | Approach | Main Strength | Main Concern |
|------|-------|----------|---------------|--------------|
| urfave-cli | 10 | Single-threaded | Zero concurrency complexity | Cannot parallelize |
| fzf | 8 | Event-driven loop | Central EventBox, structured shutdown | Terminal loop complexity |
| gdu | 8 | Semaphore + WaitGroup | Custom WaitGroup, bounded parallelism | Global semaphore, complex mutex |
| lazygit | 8 | errgroup + stop channels | Structured patterns, panic recovery | ViewBufferManager complexity |
| restic | 8 | errgroup + worker pools | Consistent patterns, clean shutdown | Nested errgroup error attribution |
| go-task | 8 | errgroup + semaphore | Failfast context, deduplication | Watch mode goroutine lifecycle |
| opencode | 8 | WaitGroup + context | Explicit cleanup with timeout | No errgroup, ad-hoc error collection |
| gh-cli | 7 | errgroup + WaitGroup | Parallel API fan-out | Scattered goroutine launching |
| helm | 7 | WaitGroup + channels | Localized patterns | No errgroup, manual cleanup |
| k9s | 7 | WorkerPool + channels | Semaphore limiting | No errgroup, mutex-heavy |
| rclone | 7 | errgroup + WaitGroup | Multiple patterns | Scattered goroutine spawning |
| chezmoi | 6 | errgroup + mutex | Structured dir walking | Watch goroutine lacks shutdown |
| dive | 6 | Channel generators | Clean channel pattern | No errgroup, fire-and-forget |
| mitchellh-cli | 6 | Single goroutine | Clean select pattern | No parallel execution |
| age | 3 | Sequential + atomic cache | Plugin subprocess isolation | No concurrency design |
| yq | 3 | Sequential loop | Simple, no races | No parallelism |

## Approach Models

### Model 1: Structured Fan-out with errgroup

Used by: lazygit, restic, go-task, rclone, gh-cli

This model uses `golang.org/x/sync/errgroup.Group` with `errgroup.WithContext(ctx)` to launch parallel operations. Error collection and cancellation propagation are automatic. Goroutines are typically spawned at a single coordination point (e.g., `errgroup.Go(func() error {...})`), and `g.Wait()` blocks until all complete.

Key pattern:
```go
g, ctx := errgroup.WithContext(ctx)
for _, item := range items {
    g.Go(func() error {
        return process(item)
    })
}
return g.Wait()
```

Evidence: `lazygit/pkg/gui/controllers/helpers/fixup_helper.go:267`, `restic/internal/repository/repository.go:567`, `go-task/task.go:87`

### Model 2: WaitGroup + Semaphore

Used by: gdu, k9s, helm

This model uses `sync.WaitGroup` for lifecycle tracking combined with a semaphore channel (buffered `chan struct{}`) to limit concurrent goroutines. Clean for bounded parallelism but manual error handling.

Key pattern:
```go
sem := make(chan struct{}, maxConcurrency)
var wg sync.WaitGroup
for _, item := range items {
    sem <- struct{}{}  // acquire
    wg.Add(1)
    go func() {
        defer wg.Done()
        defer func() { <-sem }()  // release
        process(item)
    }()
}
wg.Wait()
```

Evidence: `gdu/pkg/analyze/parallel.go:13`, `k9s/internal/pool.go:30`

### Model 3: EventBox / Channel-based Coordination

Used by: fzf, opencode

This model uses a central event dispatcher (typically `sync.Cond`-based EventBox in fzf, channels in opencode) to coordinate between subsystems. Goroutines communicate via message passing rather than shared memory.

Key pattern (fzf):
```go
type EventBox struct {
    cond sync.Cond
    mut sync.Mutex
    events map[EventType][]EventHandler
}
```

Evidence: `fzf/src/util/eventbox.go:27`, `opencode/internal/pubsub/broker.go:10`

### Model 4: Single Goroutine / Sequential

Used by: mitchellh-cli, urfave-cli

Minimal concurrency: one goroutine for input handling (mitchellh-cli) or none at all (urfave-cli). All work is sequential. No coordination primitives needed.

Evidence: `mitchellh-cli/ui.go:76`, `urfave-cli/command_run.go:92`

### Model 5: No Concurrency

Used by: yq, age

Sequential file processing with no parallelism. age uses a single atomic cache; yq uses simple for-loops.

Evidence: `yq/pkg/yqlib/stream_evaluator.go:52`, `age/internal/stream/stream.go:354`

## Pattern Catalog

### Pattern: errgroup.WithContext for Parallel Fan-out

**What**: Launch N goroutines via `errgroup.Group.Go()`, collect errors, propagate cancellation.

**Repos**: lazygit (`fixup_helper.go:267`), restic (`repository.go:567`), go-task (`task.go:87`), rclone (`operations.go:76`)

**Why it works**: Automatic error collection and context cancellation when any goroutine fails. Clean `g.Wait()` interface.

**When to copy**: When launching parallel I/O operations (API calls, file processing) that need to fail fast on error.

**When overkill**: For simple fire-and-forget operations where errors don't need to be collected.

### Pattern: Semaphore via Buffered Channel

**What**: `make(chan struct{}, N)` to limit concurrent goroutines.

**Repos**: gdu (`parallel.go:13`), k9s (`pool.go:30`), go-task (`concurrency.go:3-22`)

**Why it works**: Simple, idiomatic Go pattern. Acquire before work, release after.

**When to copy**: When you need bounded parallelism without the overhead of a worker pool.

**When risky**: If acquire/release isn't strictly matched (e.g., early return without release), goroutines leak.

### Pattern: Stop Channel for Graceful Shutdown

**What**: `<-stopChan struct{}` in select statements to signal goroutine exit.

**Repos**: lazygit (`gui.go:89`), opencode (`broker.go:67`), dive (`resolver.go:53`)

**Why it works**: Channels close cleanly, range over closed channel yields zero value.

**When to copy**: For long-lived goroutines that need to respond to shutdown signals.

**When overkill**: For short-lived goroutines that exit via other mechanisms.

### Pattern: Custom WaitGroup

**What**: A WaitGroup where `Add()` can be called after goroutine spawn.

**Repos**: gdu (`wait.go:7-11`)

**Why it works**: Allows dynamic work discovery — goroutines can add more work mid-execution.

**When to copy**: When work items are discovered recursively (e.g., directory traversal).

**When risky**: More complex than stdlib WaitGroup; subtle locking behavior.

### Pattern: EventBox (sync.Cond-based)

**What**: Central event dispatcher using `sync.Cond` for blocking wait on events.

**Repos**: fzf (`eventbox.go:27-39`)

**Why it works**: Allows many goroutines to wait on events without busy-waiting.

**When to copy**: For UI frameworks with multiple concurrent event sources.

**When overkill**: For simple fan-out patterns, `errgroup` is simpler.

### Pattern: Deferred Cancel + Explicit Wait with Timeout

**What**: `defer cancel()` paired with `waitGroup.Wait()` with a timeout.

**Repos**: opencode (`root.go:261-279`), rclone (`server.go:581-598`)

**Why it works**: Prevents indefinite blocking while ensuring cleanup completes.

**When to copy**: For CLI shutdown sequences where goroutines may hang.

### Pattern: sync.Once for One-time Cleanup

**What**: `sync.Once` ensures cleanup callbacks run exactly once.

**Repos**: lazygit (`tasks.go:122`), rclone (`batcher.go:50`), opencode (`shell.go:44`)

**Why it works**: Thread-safe, no double-cleanup concerns.

**When to copy**: For shutdown hooks, lazy initializers.

### Pattern: Atomic Cache (Lock-free)

**What**: `atomic.Pointer[T]` for shared cache without mutex overhead.

**Repos**: age (`stream.go:354`), fzf (`atomicbool.go:16`)

**Why it works**: Lock-free reads for read-heavy data structures.

**When to copy**: For simple state that doesn't need full mutex protection.

**When risky**: Only one value at a time; not suitable for complex state.

## Key Differences

### errgroup vs WaitGroup

**errgroup** (lazygit, restic, go-task, rclone, gh-cli): Automatic error propagation and context cancellation. Cleaner for operations where any failure should cancel siblings.

**WaitGroup** (gdu, helm, k9s, opencode): Manual, no error propagation. Better when operations are independent and errors don't require cancellation.

**No structured coordination** (age, dive, yq): Goroutines fire-and-forget or use raw channels.

The difference is not quality — it's fit. `errgroup` shines for fan-out API calls; `WaitGroup` shines for independent parallel tasks.

### Centralized vs Scattered Goroutine Launch

**Localized** (fzf, gdu, restic, lazygit): Goroutines spawned from clear coordination points (`core.go`, `app.go`). Easier to audit.

**Scattered** (gh-cli, helm, rclone): Goroutines launched from many command files. Harder to reason about global lifecycle.

### Cleanup Models

**Context cancellation** (fzf, restic, opencode): `defer cancel()`, goroutines listen on `ctx.Done()`. Clean for hierarchical cancellation.

**Explicit channels** (lazygit, k9s): `stopChan` closed on shutdown. More explicit but requires channel ownership discipline.

**Defer + Wait** (helm, gdu): `defer wg.Wait()` blocks until all goroutines complete. Simple but no timeout.

**Implicit** (dive, age): No explicit cleanup — relies on goroutines completing or process exit. Risk of leaks.

### Race Prevention

**Mutex-heavy** (gdu, k9s, helm): `sync.Mutex` or `sync.RWMutex` protecting shared state.

**Atomic-first** (fzf, age): Use `atomic` operations for simple state; mutex only for complex state.

**Deadlock-detecting mutex** (lazygit): Uses `go-deadlock` package in debug mode to detect circular lock waits.

## Tradeoffs

### Simplicity vs Throughput

Projects like yq and urfave-cli choose sequential processing — no concurrency complexity, no races, no leaks. But they can't utilize multiple CPU cores. Projects like gdu and fzf choose parallel processing — higher throughput, more complexity.

**Rule**: If your CLI is I/O-bound (network, filesystem), concurrency helps. If it's CPU-bound, you need parallelization. If it's simple (parse → process → output), sequential may be fine.

### errgroup vs WaitGroup + Semaphore

`errgroup` provides automatic error propagation and cancellation propagation — valuable when operations should fail fast. But it doesn't limit concurrency by default (use `SetLimit()`).

`WaitGroup + semaphore` is more manual but gives explicit control over concurrency limits. Better for bounded parallelism where you don't want unlimited goroutines.

**Rule**: Use `errgroup` when operations are homogeneous and should fail fast. Use `WaitGroup + semaphore` when you need explicit concurrency control.

### Global State vs Dependency Injection

Some projects use global variables for coordination (dive's bus singleton, gdu's global `concurrencyLimit`). This is simple but makes testing harder.

Others use dependency injection (lazygit's `BackgroundRoutineMgr`, opencode's `Broker[T]`).

**Rule**: Global state is fine for CLIs where you have one instance. Dependency injection is better for testable code.

### Channel-based vs Mutex-based

Channels excel at communication (signals, results, stop requests). Mutexes excel at protecting shared state.

Most high-rated projects use both: channels for coordination, mutexes for state protection.

**Rule**: Use channels for ownership transfer and signals; use mutexes for protecting data.

## Decision Guide

**Q: Should I use concurrency at all?**

A: If your CLI needs to: run multiple commands in parallel, watch files, stream output, process large files with parallel I/O — yes. If it's a simple filter (read stdin, process, write stdout), sequential is fine.

**Q: errgroup or WaitGroup?**

A: Use `errgroup.WithContext(ctx)` when you need cancellation propagation and error collection across parallel operations. Use `WaitGroup` when operations are independent and you just need to wait for completion.

**Q: How do I limit concurrency?**

A: Semaphore pattern: `make(chan struct{}, N)`. Acquire before work, release after. Or `errgroup.SetLimit(N)`.

**Q: How should goroutines signal shutdown?**

A: `context.Context` with `defer cancel()` is the most idiomatic. Stop channels also work but require explicit close.

**Q: What about cleanup on exit?**

A: Pair `defer cancel()` with `waitGroup.Wait()` and add a timeout: `select { case <-waitGroup.Done(): ... case <-time.After(5 * time.Second): ... }`.

**Q: How do I prevent races?**

A: Protect shared state with `sync.Mutex` or `sync.RWMutex`. Use `sync/atomic` for simple counters and booleans. Use `sync.Once` for one-time initialization.

## Practical Tips

1. **Localize goroutine launch sites**: Create dedicated methods/functions for spawning goroutines rather than scattering `go func()` throughout. This makes lifecycle auditable.

2. **Use errgroup for fan-out I/O**: When fetching multiple resources in parallel (API calls, file reads), `errgroup.WithContext` provides clean error collection and cancellation.

3. **Use semaphore for bounded parallelism**: A buffered channel of struct{} is the idiomatic way to limit concurrent goroutines without a worker pool abstraction.

4. **Always pair defer cancel with context**: Every goroutine that receives a context should have `defer cancel()` to ensure cleanup on both success and failure paths.

5. **Use sync.Once for one-time initialization**: Avoids initialization races without explicit mutex locking on the init path.

6. **Use atomic for simple state**: `atomic.Int32`, `atomic.Pointer[T]` for lock-free reads/writes of simple state.

7. **Document lock ordering**: If you use multiple mutexes, document the lock ordering contract (e.g., "uiMutex must be locked before mutex").

8. **Add panic recovery wrappers**: Wrap goroutines that could panic with `defer func() { if r := recover(); r != nil { log.Error(r) } }()` to prevent crashes.

9. **Use timeout on wait operations**: Don't `waitGroup.Wait()` without a timeout — use `select` with a timeout to prevent indefinite hangs.

10. **Consider stop channels over context for lifecycle**: For graceful shutdown signaling, a `stop chan struct{}` that gets closed is sometimes clearer than context cancellation, especially when the same signal needs to reach many goroutines.

## Anti-Patterns / Caution Signs

1. **Fire-and-forget goroutines with no cleanup mechanism**: The notification goroutine in `dive/resolver.go:70` fires and is never waited on. If it runs after the function returns, it may log after the work is done.

2. **Global mutex contention**: gdu's package-level `concurrencyLimit` (`parallel.go:13`) means all ParallelAnalyzers share the same semaphore. One analyzer can starve others.

3. **No context cancellation for HTTP reads**: chezmoi's HTTP reader goroutine (`readhttpresponse.go:172`) has no way to abort a slow read — only checks `Canceled()` after `program.Run()` returns.

4. **Global bus singleton**: dive's partybus publisher is a global variable set at startup (`bus.go:5`). Common in CLIs but makes testing harder and introduces global mutable state.

5. **Unbounded goroutine spawning**: Some patterns launch a goroutine per item (e.g., `gh-cli/manager.go:198-203` launches one per extension). Doesn't scale to large lists.

6. **No timeout on WaitGroup.Wait()**: If a goroutine hangs, operations like `gh-cli/manager.go:205` hang indefinitely.

7. **Channel without buffer causing deadlock**: rclone's `batchPerform` error channel is unbuffered (`client.go:981`). If caller stops reading early, goroutines block on send.

8. **Race between GetFiles and AddFile**: gdu's `GetFiles` (non-locked) at `file.go:168-181` doesn't hold mutex, but `GetFilesLocked` does. Code calling `GetFiles` while another goroutine calls `AddFile` could race.

9. **Watch goroutine with no shutdown**: chezmoi's watch goroutine (`editcmd.go:232`) has no mechanism to terminate cleanly — only exits when `watcher.Close()` is called by defer.

10. **No errgroup means no automatic cancellation**: helm's `batchPerform` runs all goroutines to completion regardless of errors. No sibling cancellation.

## Notable Absences

- **No `golang.org/x/sync/errgroup`** in: age, chezmoi, dive, gdu, helm, k9s, mitchellh-cli, opencode, yq, urfave-cli
- **No `sync.WaitGroup`** in: age, yq, urfave-cli, mitchellh-cli (only single goroutine)
- **No `sync.Mutex`** in: yq, urfave-cli (single-threaded)
- **No `sync.Cond`** in most projects (only fzf's EventBox)
- **No `sync.Map`** found in most projects (only opencode, rclone, gdu's parallel_top_dir)
- **No `-race` in CI/testing**: No evidence of `go test -race` in most repos

## Per-Repo Notes

| Repo | Notable Observation |
|------|---------------------|
| age | Sequential encryption pipeline with atomic chunk cache. Single WaitTimer goroutine for plugin callbacks. No parallelization in main data path. |
| chezmoi | errgroup for directory walking, fsnotify watch goroutine, tea.Model for async UI. Watch goroutine lacks explicit shutdown mechanism. |
| dive | Channel generators for filetree indexing, fire-and-forget notification goroutine, gocui owns main loop. No structured coordination. |
| fzf | Central EventBox with sync.Cond, dual event loops (terminal + matcher), atomic booleans, explicit lock ordering contract. Most sophisticated concurrency in the set. |
| gdu | Custom WaitGroup enabling dynamic work discovery, semaphore-based parallelism limiting, RWMutex on Dir for read-heavy access. Global semaphore is a concern. |
| gh-cli | errgroup for fan-out API calls (10 workers), scattered goroutine launching across many commands. No universal shutdown framework. |
| go-task | errgroup with failfast context, semaphore for concurrency limiting, execution deduplication via hash map. Watch mode goroutines lack cleanup. |
| helm | WaitGroup for batch operations, channels for signals/results, global createMutex. No errgroup, no automatic cancellation propagation. |
| k9s | WorkerPool with semaphore, context cancellation, mutex-heavy design. BOZO comment in forwarder cleanup indicates uncertainty. |
| lazygit | errgroup for parallel git ops, deadlock-detecting mutex, BackgroundRoutineMgr, ViewBufferManager with 5 concurrent goroutines. Most structured patterns. |
| mitchellh-cli | Single goroutine for input, select-based rendezvous with signal handling. No parallel command execution. |
| opencode | WaitGroup for shutdown tracking, sync.Map for request cancellation, explicit cleanup with 5s timeout. No errgroup. |
| rclone | errgroup + WaitGroup + semaphore + sync.Cond for VFS cache. Multiple patterns, scattered spawning. |
| restic | Consistent errgroup usage, worker pools (TreeSaver, PackerUploader), future/promise pattern, semaphore for backend limiting. Cleanest pattern consistency. |
| urfave-cli | Purely sequential, no goroutines. Context for cancellation propagation only. Elegant simplicity. |
| yq | Sequential for-loop, no concurrency primitives. No context support. |

## Open Questions

1. **Why don't more projects use errgroup?** It's the standard structured concurrency primitive, but half the projects that do concurrency still use raw WaitGroup. Is it unfamiliarity, or a deliberate choice?

2. **When is a global semaphore a problem?** gdu's package-level `concurrencyLimit` is shared across all analyzers. In practice, how often do multiple analyzers run concurrently in a single CLI invocation?

3. **Is the deadlock-detecting mutex worth the overhead?** lazygit uses `go-deadlock` in debug mode. Does it catch real issues, or is it noise?

4. **Should CLI frameworks provide concurrency primitives?** urfave-cli is intentionally single-threaded. But users who need concurrency must manage it outside the framework. Should frameworks offer opt-in parallelism?

5. **How do projects handle goroutine leak detection?** rclone mentions visible goroutine leak fixes in changelog. Is there a systematic approach to detecting leaks, or only post-hoc bug reports?

## Evidence Index

Every evidence reference from per-repo reports, consolidated:

- `age/plugin/client.go:394` — WaitTimer goroutine via time.AfterFunc
- `age/internal/stream/stream.go:354` — atomic.Pointer for chunk cache
- `chezmoi/internal/chezmoi/system.go:286` — errgroup for directory walking
- `chezmoi/internal/cmd/editcmd.go:232` — fsnotify watch goroutine
- `dive/dive/filetree/comparer.go:89,121` — channel generators
- `dive/cmd/dive/cli/internal/command/adapter/resolver.go:70` — fire-and-forget notification
- `fzf/src/util/eventbox.go:27` — sync.Cond-based EventBox
- `fzf/src/matcher.go:179-206` — WaitGroup for parallel scanning
- `fzf/src/terminal.go:5837,5842,5859,5896,5910` — terminal goroutines
- `gdu/pkg/analyze/parallel.go:13,36` — semaphore + goroutine launch
- `gdu/pkg/analyze/wait.go:7-11` — custom WaitGroup
- `gdu/pkg/analyze/file.go:159,185-200` — RWMutex on Dir
- `gh-cli/pkg/cmd/status/status.go:278` — errgroup for parallel fetch
- `gh-cli/pkg/cmd/extension/manager.go:196-206` — WaitGroup for extension version check
- `go-task/task.go:87,197` — errgroup + atomic counter
- `go-task/executor.go:78,80` — semaphore + mutex map
- `helm/pkg/kube/client.go:996` — WaitGroup for batch perform
- `helm/pkg/action/install.go:486` — goroutine for install
- `k9s/internal/pool.go:21,30,37` — WorkerPool with semaphore
- `k9s/internal/watch/factory.go:52` — stop channels
- `lazygit/pkg/gui/background.go:35,46,123` — BackgroundRoutineMgr
- `lazygit/pkg/gui/gui.go:89,955-982` — stop channel + cleanup
- `lazygit/pkg/tasks/tasks.go:338-357` — ViewBufferManager.Close with timeout
- `mitchellh-cli/ui.go:76` — single input goroutine
- `mitchellh-cli/ui_concurrent.go:11` — ConcurrentUi mutex wrapper
- `opencode/cmd/root.go:130,252` — WaitGroup for subscriptions
- `opencode/internal/pubsub/broker.go:67-82` — subscription cleanup goroutine
- `opencode/internal/llm/agent/agent.go:70` — sync.Map for request cancellation
- `rclone/fs/march/march.go:84,203-246` — semaphore + WaitGroup
- `rclone/lib/batcher/batcher.go:50,112` — sync.Once + commitLoop goroutine
- `rclone/vfs/vfscache/item.go:59-60` — mutex + sync.Cond
- `restic/internal/repository/repository.go:567` — errgroup for blob uploader
- `restic/internal/archiver/tree_saver.go:33` — tree worker goroutines
- `restic/internal/ui/termstatus/status.go:76` — terminal status worker
- `urfave-cli/command_run.go:92` — sequential Run (no concurrency)
- `yq/pkg/yqlib/stream_evaluator.go:52` — sequential for-loop

---

Generated by protocol `study-areas/08-concurrency.md`.