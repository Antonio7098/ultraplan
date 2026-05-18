# Repo Analysis: rclone

## State & Context Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | rclone |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/rclone` |
| Group | `rclone` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Rclone demonstrates mature state and context management with layered patterns: global singleton state accessed via `context.Context` values, dedicated contexts for operation control, and explicit session/job tracking for async work. Context propagation is consistent throughout the codebase with 3,685+ `context.Context` usages. Cancellation is handled through `context.WithCancel` and `context.WithDeadline` patterns, with signal handling wired through `lib/atexit`. Application state is split between a global `ConfigInfo` and per-operation contexts holding mutable copies.

## Rating

**8/10** — Clean propagation and cancellation. Context flows through all layers, cancellation is wired to signals, and long operations are interruptible. The main limitation is that global singletons (e.g., `fs.globalConfig`, `filter.globalConfig`, `accounting.GlobalStats()`) are accessed without explicit context in many places, relying on fallback to global defaults when context has no override.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Context propagation | `GetConfig(ctx)` retrieves config from context or falls back to global | `fs/config.go:793-802` |
| Context propagation | `GetConfig(ctx)` uses `ctx.Value(configContextKey)` to look up per-context config | `fs/config.go:797` |
| Context creation | `Run()` in cmd creates `context.Background()` for top-level command context | `cmd/cmd.go:241` |
| Context creation | `newSyncCopyMove()` wraps parent ctx with `context.WithCancel` or `context.WithDeadline` for sync operation | `fs/sync/sync.go:204-218` |
| Context creation | VFS creates own context in `New()` from provided context | `vfs/vfs.go:205-211` |
| Cancellation | `syncCopyMove` struct holds `ctx` and `cancel` for aborting sync | `fs/sync/sync.go:47-50` |
| Cancellation | `processError()` handles `context.DeadlineExceeded` and `context.Canceled` | `fs/sync/sync.go:323-334` |
| Cancellation | `aborting()` checks `s.ctx.Err() != nil` to detect cancellation | `fs/sync/sync.go:296-298` |
| Cancellation | `WriteBack.upload()` creates child context with `context.WithCancel` | `vfs/vfscache/writeback/writeback.go:448` |
| Cancellation | Downloaders create child context with cancel in `New()` | `vfs/vfscache/downloaders/downloaders.go:109` |
| WithTimeout usage | `context.WithTimeout` used in icloudphotos, seafile, union upstream for backend ops | `backend/iclouddrive/icloudphotos.go:600`, `backend/seafile/seafile.go:378` |
| Global state | `globalConfig = new(ConfigInfo)` is a package-level singleton | `fs/config.go:17` |
| Global state | `filter.globalConfig = mustNewFilter(nil)` for filter singleton | `fs/filter/filter.go:25` |
| Global state | `accounting.GlobalStats()` returns a global stats group via `context.Background()` | `fs/accounting/stats_groups.go:298-301` |
| Session/Job | `Job` struct in `fs/rc/jobs/job.go` tracks async operations with StartTime, EndTime, Stop func | `fs/rc/jobs/job.go:34-52` |
| Session/Job | Jobs stored in `Jobs.jobs map[int64]*Job` with group isolation | `fs/rc/jobs/job.go:119-124` |
| Session/Job | `jobID atomic.Int64` provides unique job IDs | `fs/rc/jobs/job.go:128` |
| Application state | `ConfigInfo` struct holds all global config (transfers, checkers, timeouts, etc.) | `fs/config.go:572-683` |
| Application state | `StatsInfo` holds per-group accounting state (bytes, errors, transfers) | `fs/accounting/stats.go:34-71` |
| Application state | `syncCopyMove` struct holds all sync operation state including channels, waitgroups, maps | `fs/sync/sync.go:35-100` |
| Signal handling | `atexit.Register()` hooks signals (SIGINT, SIGTERM, etc.) to call cleanup | `lib/atexit/atexit.go:32-59` |
| Signal handling | `signal.Notify(exitChan, exitSignals...)` registers for exit signals | `lib/atexit/atexit.go:43` |
| RC server | `rcserver.Start()` creates server with context for config access | `fs/rc/rcserver/rcserver.go:36-46` |
| RC jobs | `job.run()` executes async work via `fn(ctx, in)` passing context to job function | `fs/rc/jobs/job.go:109-116` |
| Stats groups | `statsGroups` map supports multiple named stat groups beyond global | `fs/accounting/stats_groups.go:313-317` |
| Config in context | `AddConfig()` creates shallow copy and wraps in new context | `fs/config.go:820-826` |
| Filter in context | `filter.AddConfig()` similarly creates mutable filter copy in context | `fs/filter/filter.go:704-712` |
| Context for VFS | VFS holds `ctx context.Context` for its lifetime | `vfs/vfs.go:180` |
| Context for File | File holds `ctx context.Context` for VFS operations | `vfs/file.go:45` |
| Context for cache | Cache holds `ctx context.Context` for cache lifetime | `vfs/vfscache/cache.go:44` |
| Context for DirCache | DirCache methods accept ctx for directory operations | `lib/dircache/dircache.go:39-40` |
| OAuth context | `oauthutil.Context()` wraps ctx with OAuth2 HTTP client | `lib/oauthutil/oauthutil.go:431-432` |
| HTTP context | `CtxGetAuth`, `CtxGetUser`, `CtxSetUser` for request-scoped auth | `lib/http/context.go:46-58` |
| Stats context | `Stats(ctx)` function retrieves StatsInfo from context or global | `fs/accounting/stats_groups.go:290-296` |

## Answers to Protocol Questions

### 1. How is `context.Context` propagated?

Context is propagated explicitly through function parameters throughout the codebase. Every public API function that performs I/O or long-running work accepts `ctx context.Context` as its first argument. Examples:
- `fs/sync/sync.go:1352` `runSyncCopyMove(ctx, fdst, fsrc, ...)` passes ctx to all sub-operations
- `vfs/vfs.go:205` `New(ctx, f, opt)` stores ctx in VFS struct for lifetime operations
- `fs/operations/operations.go` passes ctx through Copy, Move, Delete operations

The pattern is consistent: parent operations create derived contexts using `context.WithCancel` or `context.WithDeadline`, then pass them to child operations. For top-level commands, `cmd/cmd.go:241` creates `context.Background()` and wraps it with config via `fs.GetConfig(ctx)`.

A fallback mechanism exists: `fs.GetConfig(ctx)` returns `globalConfig` if ctx has no config override (`fs/config.go:793-802`). This means many internal functions can be called without explicit context and still get the global config.

### 2. How is cancellation handled?

Cancellation is handled through two mechanisms:

**a) Context-based cancellation**: Operations check `ctx.Err()` to detect cancellation. The `syncCopyMove` struct holds cancel functions that propagate to all child goroutines. When `max_duration` is set with `CutoffModeHard`, a deadline is added to the main context (`fs/sync/sync.go:204`). For `CutoffModeSoft` or `CutoffModeCautious`, only the input pipeline is cancelled, allowing transfers to finish.

**b) Signal-based interruption**: `lib/atexit` registers handlers for SIGINT, SIGTERM, and other exit signals (`lib/atexit/atexit.go:43`). When caught, `atexit.Run()` is called to clean up, then `os.Exit()` follows (`lib/atexit/atexit.go:52-54`). The `OnError` pattern (`lib/atexit/atexit.go:120-132`) allows deferring a cancel function to be called on error or exit.

`processError()` in `fs/sync/sync.go:319-349` converts `context.DeadlineExceeded` to `NoRetryError` and distinguishes between fatal errors (which call `s.cancel()`) and retryable errors.

### 3. Is application state centralized or per-command?

Application state is split:

**Global singletons** (fallback when no context override):
- `fs.globalConfig` — `*ConfigInfo` with all CLI flags and defaults (`fs/config.go:17`)
- `filter.globalConfig` — `*Filter` for file filtering rules (`fs/filter/filter.go:25`)
- `accounting.GlobalStats()` — returns `*StatsInfo` for global stats group (`fs/accounting/stats_groups.go:299`)

**Context-scoped state** (per-command, via `context.WithValue`):
- `fs.GetConfig(ctx)` / `fs.AddConfig(ctx)` — per-command config copy
- `filter.GetConfig(ctx)` / `filter.AddConfig(ctx)` — per-command filter copy
- `StatsGroup(ctx, group)` — per-group stats, allowing isolated stat tracking

**Operation-scoped state** (encapsulated in structs):
- `syncCopyMove` struct holds all state for a sync/copy/move operation (`fs/sync/sync.go:35-100`)
- `VFS` struct holds VFS-level state including cache (`vfs/vfs.go:180-185`)
- `StatsInfo` per-group state with mutex-protected fields (`fs/accounting/stats.go:34-71`)

The pattern is: global defaults + context overrides + operation-local state.

### 4. How are sessions modeled?

Sessions are modeled in multiple ways:

**Job-based sessions** (`fs/rc/jobs/job.go:34-52`):
- `Job` struct with unique `ID`, `ExecuteID` (UUID per rclone invocation), `StartTime`, `EndTime`, `Stop func()`
- Jobs are stored in `Jobs.jobs map[int64]*Job` and can be queried via rc interface
- `job.Stop` is a cancel function set when the job is created

**Stats group sessions** (`fs/accounting/stats_groups.go`):
- Multiple named `StatsInfo` groups can coexist, isolated from each other
- `GlobalStats()` returns the global group (uses `context.Background()` which is not ideal for isolation)
- Groups can be created via `NewStatsGroup(ctx, group)` with automatic cleanup when `MaxStatsGroups` limit is reached

**Sync operation sessions** (`fs/sync/sync.go`):
- `syncCopyMove` struct models a sync session with its own context, channels, and waitgroups
- Supports `max_duration` deadline with different cutoff modes (hard stops all, soft/graceful stops pipeline only)

**RC server sessions** (`fs/rc/rcserver/rcserver.go`):
- `Server` struct holds context for config access
- Jobs started via rc have their own Job context separate from the rc server context

## Architectural Decisions

1. **Context as config carrier**: Rclone uses `context.WithValue` to carry config overrides, allowing per-command configuration without modifying function signatures. `fs.GetConfig(ctx)` acts as a accessor that falls back to global defaults.

2. **Dual context for sync**: The `syncCopyMove` uses two contexts — `ctx` for controlling goroutine lifecycle (hard cancel) and `inCtx` for controlling the input/pipeline (graceful stop). This allows different cutoff modes to work correctly.

3. **Global stats with context fallback**: `accounting.GlobalStats()` intentionally uses `context.Background()` to return a singleton. This is a pragmatic choice but means the global stats are not truly tied to a specific command context.

4. **Signal handling at exit**: Signal handlers are registered once via `sync.Once` in `atexit.Register()`. All cleanup happens through the atexit mechanism rather than trying to cancel in-flight operations from signal handlers.

5. **Job isolation via group**: Jobs and stats use named groups to provide isolation. Groups are automatically cleaned up when `MaxStatsGroups` limit is reached.

## Notable Patterns

- **Context parameter convention**: Nearly all public API functions accept `ctx context.Context` as first parameter
- **Shallow copy for config**: `AddConfig()` creates a shallow copy of config, modifies it, and wraps the result in a new context
- **Cancel funnel**: Multiple cancel sources (deadline, manual, error) funnel into single `cancel()` call
- **Error classification**: `fserrors` package distinguishes fatal, no-retry, and retryable errors for appropriate handling
- **RC bridge**: The rc server provides a way to interact with running jobs, using the job's stored context

## Tradeoffs

1. **Global fallback convenience vs strict isolation**: `fs.GetConfig(ctx)` returning global config when no override exists is convenient but makes it easy to accidentally use global state instead of command-local state.

2. **Context.Background() for global stats**: Using `context.Background()` in `GlobalStats()` means the global stats are not tied to any command context, which could lead to stat leakage between commands in long-running processes.

3. **Signal vs context cancellation**: Signal handling in `atexit` calls `os.Exit()` directly rather than propagating cancellation through contexts. This means in-flight operations don't get a chance to clean up gracefully (though `atexit.Run()` does run registered handlers).

4. **Job stop function vs context cancellation**: Jobs store a `Stop func()` rather than a context. This is less idiomatic than passing a cancellable context, but gives more control over what happens when stopping.

## Failure Modes / Edge Cases

- **Context cancellation not checked in all paths**: Some internal operations may not check `ctx.Err()` before proceeding, potentially doing work after cancellation is requested. The sync pipeline does check (`aborting()` at `fs/sync/sync.go:296`), but not all backend operations do.

- **Global config race**: If multiple commands run concurrently and one calls `fs.GetConfig(ctx)` before the other has finished initialization, the global config may be in an inconsistent state. The init order in `fs/config.go:685-694` sets defaults before other initialization.

- **Stats group leaks**: If many unique group names are used via rc, stats groups will accumulate until `MaxStatsGroups` limit is hit. Old groups are deleted but any in-progress operations on them would lose stats.

- **Job stop without context cancellation**: When `job.Stop()` is called, it may just set a flag rather than cancelling a context. Long-running jobs may not respond to stop requests promptly if they don't check a stop channel.

- **SIGINFO handler**: The SIGINFO handler in `cmd/siginfo_bsd.go` accesses `accounting.GlobalStats()` which uses `context.Background()`. This is safe but means stats printed may not reflect a specific command context.

## Future Considerations

1. **Standardize on context for all state**: Migrate from `GlobalStats()` using `context.Background()` to passing context explicitly to all stats operations.

2. **Replace job.Stop() with context**: Change `Job.Stop` to be a cancellable context, making it consistent with the rest of the codebase's cancellation pattern.

3. **Add ctx checks to all loops**: Ensure all long-running loops check `ctx.Err()` or use `select` on `ctx.Done()` to be responsive to cancellation.

4. **Consider structured logging with context**: Instead of passing ctx to many functions just for config access, consider whether a logger interface that carries config implicitly would simplify APIs.

## Questions / Gaps

- **No clear evidence found**: The OAuth flow's context handling in `lib/oauthutil/oauthutil.go` could be examined more thoroughly to verify that token refresh respects cancellation.

- **Cache context lifetime**: The `Cache` struct in `vfs/vfscache/cache.go:44` holds a context but it's unclear what happens when that context is cancelled — does the cache release resources promptly?

- **Backend-specific context handling**: Each backend (drive, s3, etc.) may have its own context handling patterns that were not examined in detail. A deeper dive into 2-3 backends would confirm consistency.

---

Generated by `07-state-context.md` against `rclone`.