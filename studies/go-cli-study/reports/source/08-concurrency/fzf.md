# Repo Analysis: fzf

## Concurrency & Async Patterns

### Repo Info

| Field | Value |
|-------|-------|
| Name | fzf |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/fzf` |
| Group | `08-concurrency` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

fzf is a mature Go CLI fuzzy finder with well-structured concurrency. Goroutines are launched in discrete, identifiable locations for reader I/O, matcher scanning, terminal I/O, preview subprocesses, and signal handling. Coordination relies on `sync.Cond`-based `EventBox` for the main event loop, `sync.WaitGroup` for parallel scanning, and `sync.Mutex`/`atomic` operations for shared state. Cleanup is handled via deferred functions, context cancellation, and explicit goroutine termination via channels. Race prevention uses a combination of mutexes, atomic operations, and a dedicated `AtomicBool` type.

## Rating

**8/10 — Structured concurrency with clear boundaries and thoughtful design.**

fzf demonstrates structured concurrency with well-localized goroutine spawning, clear coordination patterns, and proper cleanup mechanisms. The code is generally easy to reason about, though the complexity of the terminal and preview subsystems makes it non-trivial to modify with complete confidence.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| goroutine launch (reader) | `reader.ReadSource` launches event poller goroutine via `startEventPoller` | `src/reader.go:52` |
| goroutine launch (reader) | `reader.restart` launches `readFromCommand` | `src/reader.go:104` |
| goroutine launch (core) | Reader source launched with `go reader.ReadSource` | `src/core.go:209` |
| goroutine launch (matcher) | Scanner workers launched with `go func(idx int, slab *util.Slab)` | `src/matcher.go:186` |
| goroutine launch (matcher) | Matcher runs `Loop()` in goroutine | `src/core.go:357` |
| goroutine launch (terminal) | Terminal runs `Loop()` in goroutine | `src/core.go:368` |
| goroutine launch (terminal) | Signal handler goroutine | `src/terminal.go:5842` |
| goroutine launch (terminal) | Resize notifier goroutine | `src/terminal.go:5859` |
| goroutine launch (terminal) | Spinner goroutine | `src/terminal.go:5896` |
| goroutine launch (terminal) | Previewer goroutine with 3 sub-goroutines | `src/terminal.go:5910`, `5962`, `5975`, `6019` |
| goroutine launch (terminal) | Render loop goroutine | `src/terminal.go:6081` |
| goroutine launch (terminal) | Input barrier goroutine | `src/terminal.go:6303` |
| goroutine launch (server) | HTTP server goroutine | `src/server.go:125` |
| goroutine launch (proxy) | Proxy output/input FIFOs | `src/proxy.go:70`, `99` |
| coordination (EventBox) | `sync.Cond`-based event box with `Wait`, `Set`, `Broadcast` | `src/util/eventbox.go:27`, `39` |
| coordination (WaitGroup) | `sync.WaitGroup` for matcher scan workers | `src/matcher.go:179`, `182` |
| coordination (channels) | `readyChan chan bool` for startup synchronization | `src/core.go:208` |
| coordination (mutex) | `sync.Mutex` in Terminal for state protection | `src/terminal.go:424` |
| race prevention (atomic) | `AtomicBool` for running/executing state | `src/util/atomicbool.go:16` |
| race prevention (atomic) | `atomic.Int32` for reader event state | `src/reader.go:26` |
| race prevention (mutex) | `denyMutex` protecting denylist map | `src/core.go:234` |
| race prevention (RWMutex) | `RWMutex` in ConcurrentSet | `src/util/concurrent_set.go:7` |
| cleanup (defer) | `defer util.RunAtExitFuncs()` | `src/core.go:72` |
| cleanup (context) | `context.WithCancel` for goroutine termination | `src/terminal.go:5837` |
| cleanup (defer cancel) | `defer cancel()` for context cleanup | `src/terminal.go:6297` |
| cleanup (channel) | `killChan`, `killedChan` for preview cancellation | `src/terminal.go:430` |
| cleanup (terminate) | `reader.terminate()` method | `src/reader.go:91` |
| cleanup (Stop) | `matcher.Stop()` sends `reqQuit` | `src/matcher.go:269` |

## Answers to Protocol Questions

### 1. Where are goroutines launched?

**Reader** — `src/reader.go:52` launches an event poller via `startEventPoller()` in a goroutine. The reader is launched from `core.go:209` via `go reader.ReadSource(...)` with a `readyChan` for startup synchronization. Restart also launches a goroutine at `reader.go:104`.

**Matcher** — `core.go:357` launches `go matcher.Loop()`. Within `scan()` at `matcher.go:186`, worker goroutines are spawned for parallel chunk processing using `sync.WaitGroup`.

**Terminal** — `core.go:368` launches `go terminal.Loop()`. Inside `terminal.Loop()` (`terminal.go:5811`), several goroutines are launched:
- Signal handler at `terminal.go:5842`
- Resize notifier at `terminal.go:5859`
- Spinner at `terminal.go:5896`
- Previewer at `terminal.go:5910` (with 3 sub-goroutines for reading, rendering, and cancelling preview commands)
- Render loop at `terminal.go:6081`
- Input barrier at `terminal.go:6303`

**Server** — `server.go:125` launches an HTTP server goroutine to accept connections.

**Proxy** — `proxy.go:70` and `proxy.go:99` launch goroutines for FIFO output/input piping.

### 2. How are they coordinated?

**EventBox** (`src/util/eventbox.go`) — A `sync.Cond`-based central event coordination system. The `Wait` method blocks until events are set via `Set`/`Broadcast`. Used extensively in `core.go`, `terminal.go`, and `matcher.go` for coordinating between the reader, matcher, and terminal loops.

**Channels** — `readyChan chan bool` (`core.go:208`) synchronizes startup. `killChan`/`killedChan` (`terminal.go:430`) handle preview cancellation. `finishChan` and `reapChan` coordinate preview subprocess cleanup at `terminal.go:5956-6059`.

**sync.WaitGroup** — `matcher.go:179-206` uses `WaitGroup` to coordinate parallel chunk scanning workers. The main scan loop waits on the waitgroup before proceeding.

**Mutexes** — `sync.Mutex` (`terminal.go:424`) protects Terminal state. `denyMutex` (`core.go:234`) protects the pattern denylist. `RWMutex` in `ConcurrentSet` (`concurrent_set.go:7`) protects the set operations.

**reqBox** — A secondary `EventBox` (`matcher.go:71`) specifically for matcher requests (`reqRetry`, `reqReset`, `reqQuit`), providing a private communication channel between the terminal loop and the matcher loop.

### 3. How is cleanup handled?

**Context cancellation** — `terminal.go:5837` creates a `context.WithCancel(context.Background())`. The context is passed to all long-running operations (signal handler, resize notifier, preview goroutines). When `cancel()` is called at `terminal.go:6297`, all listening goroutines terminate cleanly via their `select` on `ctx.Done()`.

**Deferred cleanup** — `core.go:72` has `defer util.RunAtExitFuncs()` to run exit functions. The `reader.restart` at `reader.go:108` calls `removeFiles(command.tempFiles)` after `readFromCommand` completes. Proxy at `proxy.go:67` defers `os.Remove(output)`.

**Explicit termination channels** — `killChan` (`terminal.go:430`) is used to signal preview command cancellation. `killedChan` signals back when killed.

**Reader termination** — `reader.terminate()` (`reader.go:91`) sets `r.killed = true` and calls `r.termFunc()` to close the stdin pipe or kill the subprocess. Called from `core.go:435` and `core.go:550`.

**Matcher Stop** — `matcher.Stop()` at `matcher.go:269` sends `reqQuit` to the matcher's `reqBox`, causing `Loop()` at `matcher.go:103` to break out.

**Render loop exit** — At `terminal.go:6231-6238`, `reqClose` triggers `exit()` which sets `running = false`, closes the listener, kills running commands via `runningCmds.ForEach`, and eventually triggers `t.running.Set(false)`.

### 4. Are race conditions considered?

**Yes, systematically.** fzf uses multiple strategies:

**Atomic operations** — `AtomicBool` (`src/util/atomicbool.go`) wraps `atomic.LoadInt32`/`StoreInt32` for lock-free boolean state. Used for `running`, `executing`, and `cancelScan` flags. `reader.go:26` uses `atomic.Int32` for the event state (`EvtReady`, `EvtReadNew`, `EvtReadFin`).

**Mutex protection** — The `Terminal` struct embeds a `mutex` (`sync.Mutex`) and `uiMutex` to order access to shared state like `reading`, `cy`, `offset`, etc. (`terminal.go:424`). The code comment at `terminal.go:6118` explicitly describes the lock ordering to avoid deadlock: "t.uiMutex must be locked first to avoid deadlock."

**RWMutex in ConcurrentSet** — `src/util/concurrent_set.go` uses `sync.RWMutex` so multiple readers can proceed concurrently while writers get exclusive access.

**Atomic CAS** — `reader.go:56` uses `atomic.CompareAndSwapInt32` for transitioning event state.

**Deny mutex** — `core.go:234` uses `sync.Mutex` around the `denylist` map access.

**scanMutex** — `matcher.go:49` uses `sync.Mutex` to serialize scan operations and implement `CancelScan`/`ResumeScan` locking.

**Potential concern** — The `restart` function at `core.go:400-413` calls `go reader.restart` then receives from `readyChan`, but the reader's `restart` method at `reader.go:101-109` does `success := r.readFromCommand(...)` synchronously before calling `r.fin()`. The caller blocks on `<-readyChan` while the actual goroutine has already completed `readFromCommand`. This is intentional (the readyChan signals when the reader is ready to accept new input), but the concurrent access to `r.command` at `reader.go:82` is protected by `r.mutex`.

## Architectural Decisions

1. **Central EventBox** — Rather than ad-hoc channels, fzf uses a central `EventBox` (`sync.Cond`) for all event coordination. This simplifies the architecture but requires discipline (documented at `core.go:15-21` with the event flow diagram).

2. **Dual event loops** — Terminal (`terminal.Loop()`) and Matcher (`matcher.Loop()`) each run their own event loops, communicating via `eventBox` and `reqBox`. This allows the matcher to run searches asynchronously without blocking terminal rendering.

3. **Lock ordering contract** — `terminal.go:6118-6133` codifies that `uiMutex` must be locked before `mutex` to avoid deadlocks. This is a documented invariant.

4. **Preview subprocess management** — Preview commands are managed by 3 coordinated goroutines (reading output, periodic rendering, cancellation timer) with explicit channels (`finishChan`, `reapChan`) for cleanup at `terminal.go:5956-6059`.

5. **CancelScan/Rewrite pattern** — The matcher implements `CancelScan`/`ResumeScan` at `matcher.go:255-267` which uses a mutex to provide a critical section for safely mutating shared items during with-nth changes.

## Notable Patterns

- **Event-driven architecture**: `EventBox` as central pub/sub mechanism
- **Worker pool for scanning**: Parallel chunk processing at `matcher.go:175-206` using `WaitGroup` and atomic chunk index
- **Atomic booleans**: Custom `AtomicBool` type for lock-free state flags
- **Context cancellation**: All long-lived goroutines listen on `ctx.Done()`
- **Explicit channel-based shutdown**: `killChan`/`killedChan` for preview cancellation, `reqQuit` for matcher termination
- **Mutex ordering**: Documented lock ordering contract to prevent deadlocks
- **FIFO proxy pattern**: Named pipes for proxy subprocess I/O

## Tradeoffs

- **Complexity of Terminal.Loop** — The terminal goroutine at `terminal.go:5811-6299` is massive (~500 lines) with deeply nested event handling. This makes reasoning about concurrency in the UI subsystem difficult.
- **Multiple event boxes** — Having both `eventBox` (main) and `reqBox` (matcher requests) adds indirection. Understanding control flow requires tracking both.
- **No errgroup** — fzf uses `sync.WaitGroup` manually rather than `golang.org/x/sync/errgroup`, which would provide automatic error propagation and cancellation.

## Failure Modes / Edge Cases

- **Goroutine leaks** — The preview goroutines at `terminal.go:5910` coordinate via `eofChan` and `finishChan`, but if the command fails to start (`err != nil` at `terminal.go:5958`), only `reapChan` is sent once, potentially leaving the other goroutines hanging. However, the goroutines check `ctx.Done()` and will exit when the parent context is cancelled.

- **Blocked reader restart** — If `reader.restart` is called while a read is in progress, `terminate()` closes the pipe and the next `readFromCommand` proceeds. This is racy but bounded by the pipe semantics.

- **Preview command orphaning** — If fzf crashes while a preview command is running, `KillCommand` may not be called. This is mitigated by the process group isolation (`exec.SysProcAttr.SetPGid`).

- **SIGINT during execution** — The signal handler at `terminal.go:5848` explicitly ignores SIGINT while `t.executing.Get()` is true, delegating the signal to the subprocess. This is correct but could delay fzf shutdown if the subprocess ignores SIGINT.

## Future Considerations

- Consider migrating to `golang.org/x/sync/errgroup` for better error propagation and structured cancellation in the matcher scan workers.
- The terminal event loop could be decomposed into smaller functions to reduce cognitive load.
- Consider adding concurrency documentation (comments with lock ordering invariants).

## Questions / Gaps

- No evidence of structured logging for goroutine lifecycle events (startup, shutdown, panic).
- No explicit timeout on `reader.ReadSource` for command execution — if the command hangs, fzf relies on the user sending SIGINT.
- The `previewBox` event box is only created if preview is enabled (`terminal.go:963`), but the preview goroutine still runs conditionally. This is correct but relies on the `hasPreviewer()` check.

---

Generated by `study-areas/08-concurrency.md` against `fzf`.