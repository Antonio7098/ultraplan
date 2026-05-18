# Repo Analysis: restic

## State & Context Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | restic |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/restic` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

restic demonstrates strong context and state management discipline. Context propagates through all layers—from CLI entry point through repository operations to backend drivers. Cancellation is handled via `context.Context` with proper signal handling at the top level. Lock management is sophisticated with background refresh goroutines. Application state is centralized in `global.Options` passed via pointer, not global variables. Sessions are modeled through the explicit `Lock` type rather than ad-hoc mechanisms.

## Rating

**8/10** — Clean propagation and cancellation with minor gaps. Context passes through most operations, but some internal loops use `context.TODO()` rather than inherited context. Cancellation behavior is predictable and well-tested. The lock refresh mechanism is particularly robust.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Global context creation | `createGlobalContext()` creates cancellable context from `context.Background()` | `cmd/restic/cleanup.go:14-22` |
| Signal handling | `cleanupHandler` intercepts SIGINT/SIGTERM and calls cancel | `cmd/restic/cleanup.go:24-38` |
| Context passed to commands | `newRootCommand().ExecuteContext(ctx)` passes global context | `cmd/restic/main.go:188-189` |
| Context propagation in backup | `runBackup(cmd.Context(), ...)` receives context from Cobra | `cmd/restic/cmd_backup.go:76` |
| errgroup with context | `errgroup.WithContext(ctx)` for parallel operations | `cmd/restic/cmd_backup.go:627` |
| Lock creation with context | `NewLock(ctx, repo, exclusive)` accepts context | `internal/restic/lock.go:105` |
| Lock refresh with context | `lock.Refresh(context.TODO())` refresh uses TODO context | `internal/repository/lock.go:168` |
| Lock unlock with delayed cancel | `delayedCancelContext()` allows cleanup after cancellation | `internal/restic/lock.go:290-305` |
| Context in archiver | `arch.Snapshot(ctx, targets, opts)` accepts and propagates context | `internal/archiver/archiver.go:864` |
| Context in repository | `repo.LoadIndex(ctx, printer)` passes context to index loading | `internal/repository/repository.go:565` |
| Context in restic.ParallelList | `ParallelList(ctx, repo, t, n, fn)` passes context to all workers | `internal/restic/parallel.go:11` |
| WithTimeout usage | `context.WithTimeout(ctx, githubAPITimeout)` for GitHub API calls | `internal/selfupdate/github.go:69` |
| WithCancel usage | `context.WithCancel(context.Background())` for terminal status | `internal/ui/termstatus/status.go:72` |
| Cancellation check in loops | `if ctx.Err() != nil` checked in archiver tree traversal | `internal/archiver/archiver.go:325, 685` |
| Application state location | `global.Options` struct holds all CLI-global state | `internal/global/global.go:46-89` |
| Options passed by pointer | `globalOptions *global.Options` passed by reference | `cmd/restic/main.go:37` |
| Repository struct | `Repository` struct holds backend, key, index, cache | `internal/repository/repository.go:34-56` |
| Terminal interface | `ui.Terminal` interface abstracts terminal I/O | `internal/ui/terminal.go:25` |

## Answers to Protocol Questions

### 1. How is `context.Context` propagated?

Context is created at the top level in `cmd/restic/cleanup.go:14-22` via `createGlobalContext()` which wraps `context.Background()` with a cancel function triggered by SIGINT/SIGTERM signals. This context is passed to Cobra's `ExecuteContext()` at `cmd/restic/main.go:189`, which makes it available via `cmd.Context()` in each command's `RunE` function.

From there, context flows through:
- `runBackup(cmd.Context(), ...)` at `cmd/restic/cmd_backup.go:76`
- `openWithAppendLock(ctx, ...)` at `cmd/restic/cmd_backup.go:530`
- `repo.LoadIndex(ctx, ...)` at `cmd/restic/cmd_backup.go:566`
- `arch.Snapshot(ctx, ...)` at `cmd/restic/cmd_backup.go:686`
- `errgroup.WithContext(ctx)` at `cmd/restic/cmd_backup.go:627` for parallel scanning/archiving

The archiver's `Snapshot()` method at `internal/archiver/archiver.go:864` accepts context and passes it to worker goroutines via `wgCtx`. Tree traversal loops check `ctx.Err()` explicitly at lines 325 and 685.

All backend operations accept context: `backend.Backend` interface methods include context parameters, seen in `internal/restic/repository.go:25-65`.

### 2. How is cancellation handled?

Cancellation is well-structured:

**Signal-based cancellation**: `cleanupHandler()` in `cmd/restic/cleanup.go:24-38` intercepts SIGINT/SIGTERM and calls the global cancel function. This cancels the context passed to Cobra, which propagates to all running commands.

**Lock release with delay**: `delayedCancelContext()` at `internal/restic/lock.go:290-305` creates a child context that cancels either when the parent cancels OR after a fixed delay. This allows lock cleanup operations to complete even if the original context is already cancelled. The delay is `UnlockCancelDelay = 1 * time.Minute`.

**Explicit cancellation checks**: The archiver checks `ctx.Err()` in tree traversal loops (`internal/archiver/archiver.go:325, 685`) and returns early if cancelled. The `futureNode.take()` method at `internal/archiver/archiver.go:413-431` also checks context before blocking on channel receive.

**Exit code handling**: `context.Canceled` error maps to exit code 130 (`cmd/restic/main.go:236`), enabling scripts to distinguish cancelled operations.

**Minor gap**: Lock refresh uses `context.TODO()` at `internal/repository/lock.go:168` rather than a properly propagated context, though this is a background goroutine so the impact is limited.

### 3. Is application state centralized or per-command?

**Centralized via `global.Options`**: The `global.Options` struct at `internal/global/global.go:46-89` holds all application-wide state:
- Repository location, password, key hint
- Verbosity, quiet mode, JSON output flag
- Cache directory, compression mode, pack size
- Rate limits, TLS options
- Password string (sensitive)
- Terminal interface `ui.Terminal`
- Backend registry and test hooks

This is passed **by pointer** (`*global.Options`) to all command constructors (`cmd/restic/main.go:37`), allowing `PersistentPreRunE` to modify options before commands execute. This is not a global variable—it flows through the call chain.

**Per-command state**: Each command has its own `Options` struct (e.g., `BackupOptions` at `cmd/restic/cmd_backup.go:85-115`) that is local to that command and not shared.

**Repository instance**: `repository.Repository` at `internal/repository/repository.go:34-56` holds backend, encryption key, index, and cache. This is created per-command via `OpenRepository()` and passed to the operations that need it.

**No singleton global state**: The codebase avoids package-level global variables for application state. The `signals` package at `internal/ui/signals/signals.go:19-24` does have a global channel variable, but this is for internal signal handling, not application state.

### 4. How are sessions modeled?

**Explicit Lock type**: Sessions are modeled via the `Lock` type at `internal/restic/lock.go:23-43`. A lock contains:
- Timestamp, exclusive flag
- Hostname, username, PID, UID, GID
- Repository reference and lock ID

**Two lock types**: Exclusive (single writer) and non-exclusive (multiple readers). `NewLock()` at `internal/restic/lock.go:105` enforces that only one exclusive lock can exist.

**Lock lifecycle**: Created via `NewLock()`, refreshed automatically every 5 minutes by background goroutines in `lock.go:119-181`, and released via `Unlock()`. The `lockContext` at `internal/repository/lock.go:16-20` pairs the lock with its cancel function and refresh wait group.

**Retry mechanism**: `locker.Lock()` at `internal/repository/lock.go:46-106` implements retry with exponential backoff when repository is already locked, controlled by `--retry-lock` flag.

**Stale lock detection**: `Lock.Stale()` at `internal/restic/lock.go:257-288` checks timestamp age (30 minutes) and process existence.

**No explicit session concept**: Beyond locks, restic does not have an explicit "session" abstraction. The lock effectively serves as the session model for coordinated multi-process access.

## Architectural Decisions

1. **Context as first-class parameter**: All public APIs accept `context.Context` as the first parameter, following Go best practices. This enables cancellation propagation and timeout control.

2. **Global state via dependency injection**: Rather than global variables, `global.Options` is passed through constructors, making the code testable and explicit about dependencies.

3. **Lock refresh as background goroutines**: Lock freshness is maintained by dedicated goroutines with ticker-based refresh, not by explicit user code. This is robust but adds complexity.

4. **Delayed context cancellation for cleanup**: The `delayedCancelContext()` pattern ensures cleanup operations can complete even after main context cancellation, preventing premature termination of cleanup routines.

5. **Signal handling at top level only**: Signal handling is centralized in `main()` via `createGlobalContext()`, not scattered across commands. This ensures consistent behavior.

## Notable Patterns

- **errgroup.WithContext**: Used extensively for fan-out parallelism (e.g., `cmd/restic/cmd_backup.go:627`) with automatic cancellation on error.

- **Context channel select pattern**: `futureNode.take()` at `internal/archiver/archiver.go:413-431` selects on both channel receive and context cancellation, allowing clean abort.

- **delayedCancelContext**: Creates a context that outlives its parent for cleanup operations (`internal/restic/lock.go:290-305`).

- **Lock refresh monitoring**: Two goroutine design—one refreshes locks on ticker, another monitors staleness and triggers forced refresh (`internal/repository/lock.go:119-243`).

- **Backend wrapper chain**: Backends are wrapped with logging, retry, and semaphore limiting (`internal/global/global.go:592-627`).

## Tradeoffs

- **Lock refresh uses `context.TODO()`**: At `internal/repository/lock.go:168`, the refresh operation uses `context.TODO()` instead of a properly propagated context. While this is safe (it's a periodic background operation), it breaks the context chain.

- **Complex lock lifecycle**: The `lockContext` struct with its two goroutines and wait group adds complexity. A simpler design might be possible but the current implementation is robust against edge cases like host standby.

- **Global signal handler**: The `signals` package at `internal/ui/signals/signals.go:19-24` uses a global variable for the signal channel, meaning only one listener can receive signals. This is noted in a comment ("XXX") as a known limitation.

- **Terminal interface needed for password**: Password reading requires a `ui.Terminal` interface, which is injected via `global.Options.Term`. This adds a layer of indirection but enables testing and different terminal implementations.

## Failure Modes / Edge Cases

1. **Signal during password prompt**: If signal is received while reading password, the goroutine "leaks" according to comments at `internal/global/global.go:226` and `internal/global/global.go:253`. The password reading is not cancellation-safe.

2. **Lock held during crash**: If a process crashes while holding a lock, the lock becomes stale after 30 minutes (`StaleLockTimeout` at `internal/restic/lock.go:252`). Stale locks can be detected and removed with `unlock --remove-all`.

3. **Network timeout during lock refresh**: If lock refresh fails repeatedly, the monitor goroutine logs a fatal error but doesn't forcibly terminate the process. The lock will become stale and other processes can detect this.

4. **Context cancellation during tree save**: If context is cancelled during `saveTree()` at `internal/archiver/archiver.go:685-687`, partial results may have been saved to the repository. However, no snapshot is committed without explicit success.

5. **Race between lock refresh and expiry**: The lock refresh timeout (`refreshabilityTimeout`) is set slightly shorter than `StaleLockTimeout` to avoid races, but this depends on time synchronization between clients.

## Future Considerations

- Replace remaining `context.TODO()` usages with properly propagated context, particularly in lock refresh.
- Make password reading cancellation-safe by passing context to the terminal read operation.
- Consider adding session context to `global.Options` for explicit session lifecycle management.
- The global signal variable limitation could be addressed if multi-command signal handling is needed.

## Questions / Gaps

1. **No evidence found** for explicit session timeout configuration beyond lock staleness detection. Session length is implicitly bounded by lock timeout.

2. **No evidence found** for distributed session coordination. All session coordination is via repository locks, not external coordination service.

3. **No evidence found** for graceful upgrade support. The lock mechanism doesn't have provisions for coordinated rolling updates.

4. **No evidence found** for context propagation in the `selfupdate` package's `DownloadLatestStableRelease()` beyond the initial timeout at `internal/selfupdate/github.go:69`.

---

Generated by `study-areas/07-state-context.md` against `restic`.