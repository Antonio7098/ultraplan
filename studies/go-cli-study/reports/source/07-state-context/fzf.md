# Repo Analysis: fzf

## State & Context Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | fzf |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/fzf` |
| Group | `07-state-context` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

fzf is a mature Go CLI for fuzzy-finding with an interactive terminal interface. It manages complex state through a central event box pattern, with limited `context.Context` usage confined to signal handling and preview command timeouts. Application state is primarily held in large struct types passed through function calls, with no deep context propagation across layers.

## Rating

**6/10** — Basic context handling

The codebase uses `context.Context` in only two narrow scenarios: preview command timeout cancellation and terminal signal-handling goroutines. Most of the application relies on a custom `EventBox` for state coordination, which is effective but bypasses standard Go context patterns. Cancellation is handled via custom mechanisms (atomic booleans, signal channels) rather than context propagation.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Signal handling context | `ctx, cancel := context.WithCancel(context.Background())` for signal goroutine | `src/terminal.go:5837` |
| Preview command timeout | `ctx, cancel := context.WithCancel(context.Background())` with `time.After(blockDuration)` | `src/terminal.go:5455` |
| Custom event coordination | `util.EventBox` using `sync.Cond` for event distribution | `src/util/eventbox.go:12-24` |
| Scan cancellation | `util.AtomicBool` (`cancelScan`) for matcher interrupt | `src/matcher.go:50` |
| Signal registration | `signal.Notify(intChan, os.Interrupt, syscall.SIGTERM, syscall.SIGHUP)` | `src/terminal.go:5841` |
| Reader termination | `reader.terminate()` using mutex and `termFunc` closure | `src/reader.go:91-99` |
| Terminal state struct | 200+ field `Terminal` struct holding all UI state | `src/terminal.go:249-459` |
| Options as global config | `*Options` struct passed through `Run()` and constructed upfront | `src/options.go:1` |

## Answers to Protocol Questions

### 1. How is `context.Context` propagated?

**It is not propagated through the application.** `context.Context` appears in only two isolated locations:

- **`src/terminal.go:5455`**: A short-lived context for preview command timeout (1 second `blockDuration`). After the timeout, `cancel()` is called to unblock the goroutine.

- **`src/terminal.go:5837`**: A long-lived context for the signal handling goroutine, cancelled during terminal cleanup at `src/terminal.go:5874` and `src/terminal.go:6297`.

There is no context parameter in major function signatures like `Run()` (`src/core.go:54`), `NewTerminal()` (`src/terminal.go:700+`), `NewMatcher()` (`src/matcher.go:59`), or `NewReader()` (`src/reader.go:36`). Context does not flow through the search/matching pipeline.

### 2. How is cancellation handled?

Cancellation is handled through custom mechanisms rather than `context.Context`:

- **Signal handling** (`src/terminal.go:5841-5854`): A goroutine listens for `os.Interrupt`, `syscall.SIGTERM`, and `syscall.SIGHUP`. On signal, it posts `reqQuit` to the terminal's `reqBox`. SIGINT is ignored while a command is executing (to let the subprocess handle it).

- **Scan cancellation** (`src/matcher.go:258-262`): `CancelScan()` sets an `AtomicBool` and acquires a mutex. `ResumeScan()` releases it. The scan loop checks `cancelScan.Get()` at `src/matcher.go:196` and `src/matcher.go:224` to abort early.

- **Reader termination** (`src/reader.go:91-99`): A mutex-protected `killed` flag and `termFunc` closure (typically `os.Stdin.Close()`) allow the reader to be stopped mid-read.

- **Matcher quit** (`src/matcher.go:270`): `Stop()` posts `reqQuit` to matcher's `reqBox`, causing its loop to exit.

### 3. Is application state centralized or per-command?

State is **centralized in large struct instances** rather than passed via context:

- `Terminal` struct (`src/terminal.go:249-459`): ~200 fields holding all UI state including query, selection, mergers, preview state, window handles, and event boxes.

- `Options` struct (`src/options.go`): Built once at startup via `ParseOptions()` and passed to `Run()`.

- `Matcher` struct (`src/matcher.go:37-51`): Holds cache, pattern builder, revision, and scan state.

- `ChunkList` and `ChunkCache`: In-memory search state created in `core.go:116-117`.

There is no attempt to thread state through `context.WithValue`. State is accessed directly by reference through the call stack.

### 4. How are sessions modeled?

**There is no explicit session concept.** The closest analogs are:

- **Revision tracking** (`core.go:23-39`): A `revision` struct with major/minor versioning tracks invalidation of pattern cache and mergers. When input changes, `inputRevision.bumpMajor()` is called; minor changes (e.g., filtering same input) call `bumpMinor()`.

- **Snapshot mechanism** (`core.go:294`): `chunkList.Snapshot()` creates a point-in-time view of the current item list for search.

- **History** (`src/history.go`): Persistent command history is stored separately and managed through a `History` struct referenced by `Terminal` (`src/terminal.go:333`).

The "session" is implicitly the lifetime of the `Terminal` instance. There is no detached or resumable session state.

## Architectural Decisions

1. **Custom EventBox over context for coordination**: fzf uses `util.EventBox` (a `sync.Cond`-based pub/sub system) for all inter-goroutine communication. This pre-dates widespread `context.Context` adoption and works well but bypasses standard cancellation propagation.

2. **Flat Options struct**: All configuration is parsed into a flat `Options` struct at startup. There is no hierarchical or layered configuration system.

3. **Global terminal state**: The `Terminal` struct is effectively a God object containing all UI and input state. This makes sense for an interactive CLI but creates tight coupling.

4. **Signal forwarding to subprocess**: During preview/execute, SIGINT is caught but not forwarded to fzf itself—only to the running subprocess (`src/terminal.go:5848`). This allows Ctrl+C to cancel a long-running command without exiting fzf.

## Notable Patterns

- **Atomic boolean for scan cancellation** (`src/util/atomicbool.go`): Custom atomic bool wrapper used for `cancelScan`, `executing`, `paused` flags without needing mutex overhead on hot paths.

- **EventBox coordination** (`src/util/eventbox.go`): Central event bus using `sync.Cond` with `Watch`/`Unwatch` for selective event ignoring. Powers the Reader → Matcher → Terminal event chain documented in `src/core.go:15-21`.

- **Late initialization in Terminal.Loop()** (`src/terminal.go:5839-5879`): Signal handlers and resize handlers are started inside `Terminal.Loop()` after the TUI is initialized, not in the constructor.

- **Deferred cleanup via cancel()**: The main terminal context's `cancel()` is called in multiple exit paths (`src/terminal.go:5874`, `src/terminal.go:6297`) to cleanly terminate the signal goroutines.

## Tradeoffs

- **Pro**: Custom EventBox is efficient for high-frequency events (key presses, search progress) without context switch overhead.

- **Con**: `context.Context` cancellation cannot propagate through the app, so each subsystem needs its own cancellation logic (reader.terminate, matcher.CancelScan, terminal reqQuit).

- **Pro**: Atomic booleans avoid mutex contention on hot paths (matching loop checking `cancelScan`).

- **Con**: The massive `Terminal` struct is mutated from multiple goroutines (terminal loop, matcher callbacks, reader callbacks) requiring careful use of `mutex` and `uiMutex`.

## Failure Modes / Edge Cases

1. **Reader stdin leak**: If `reader.terminate()` is called with `termFunc` nil (e.g., if stdin was already closed), the terminate call is a no-op. The reader goroutine may continue until the fd is fully consumed.

2. **Matcher cache invalidation race**: `mergerCache` in matcher (`src/matcher.go:144`) is accessed without a lock, only under `scanMutex`. If a second scan starts before the first completes, the cache lookup may race with cache invalidation.

3. **Preview command not killed on fzf exit**: If fzf crashes or is killed, preview commands started with `ctx.WithCancel` may continue running until the timeout fires. There is no explicit cleanup of running preview processes.

4. **AtomicBool busy-wait**: `AtomicBool` uses a spin loop internally. Under heavy contention, this could cause CPU spikes.

## Future Considerations

1. **Context propagation**: Modernizing key functions to accept `context.Context` would allow standard cancellation propagation and integrate better with Go's standard library.

2. **Structured state**: Breaking the `Terminal` struct into subsystems (e.g., `InputState`, `SelectionState`, `PreviewState`) would improve testability and reduce lock contention.

3. **Graceful shutdown**: Adding a `context.Context` to `Run()` would enable proper graceful shutdown of all goroutines, including preview processes.

## Questions / Gaps

1. **No evidence found** for `context.WithValue` usage. State is not stored in context.

2. **No evidence found** for `context.WithTimeout` with meaningful propagation. Timeouts exist only for preview command blocking (1 second), not for search operations.

3. **No evidence found** for session persistence or resumption. The history file is the only persistent state, and it is not recoverable into an active session.

4. **No evidence found** for distributed or multi-process session state. All state is in-memory in a single process.

---

Generated by `study-areas/07-state-context.md` against `fzf`.