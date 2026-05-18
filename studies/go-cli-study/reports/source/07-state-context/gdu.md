# Repo Analysis: gdu

## State & Context Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | gdu |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` |
| Group | `gdu` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

gdu (Go Disk Usage) is a CLI tool for analyzing disk usage. The codebase does **not use `context.Context`** at all. Instead, it implements a custom signal-based cancellation mechanism via `common.SignalGroup`. Application state is centralized in the `App` struct and propagated through method receivers, with session-like concepts absent. The project relies on direct goroutine management and channel-based coordination rather than standard context propagation.

## Rating

**3/10** — Basic context handling (with significant caveats)

The project has no `context.Context` usage. It uses a custom `SignalGroup` channel type for termination signaling, which is a manual alternative to context cancellation. Application state is carried via struct fields rather than context values. The cancellation quality is adequate for CLI shutdown but lacks the composability and timeout propagation that `context.Context` provides.

Fast heuristic: "Would cancellation/shutdown behave predictably?" — Mostly yes, but without the structured lifecycle management that context offers.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Context imports | Zero occurrences of `context` import across entire codebase | N/A |
| SignalGroup type | Custom `SignalGroup` channel type for termination | `internal/common/signal.go:5` |
| Signal handling | `StartUILoop` sets up signal notification for SIGHUP, SIGINT, SIGQUIT, SIGILL, SIGTRAP, SIGABRT, SIGPIPE, SIGTERM | `tui/tui.go:317-328` |
| Signal broadcast | `doneChan.Broadcast()` called after analysis completes | `pkg/analyze/parallel.go:43` |
| Done channel | `doneChan` (SignalGroup) stored in BaseAnalyzer | `pkg/analyze/analyzer.go:17` |
| Progress done channel | Separate `progressDoneChan` for progress ticker termination | `pkg/analyze/analyzer.go:13` |
| App struct | Central application state holder with Flags, Args, Istty, TermApp, Screen, Writer | `cmd/gdu/app/app.go:182-192` |
| UI struct | TUI state embedded in `common.UI` with Analyzer, ignore patterns, display flags | `tui/tui.go:26-100` |
| Global mutable state | Global `af` pointer and `configErr` in main.go | `cmd/gdu/main.go:27-30` |
| Concurrency limit | Global channel-based semaphore for parallel processing | `pkg/analyze/parallel.go:13` |
| Delete queue | Channel-based work queue for async deletions | `tui/tui.go:56` |
| WaitGroup | Custom WaitGroup for tracking goroutine completion | `pkg/analyze/waitgroup.go` |

## Answers to Protocol Questions

### 1. How is `context.Context` propagated?

**It is not used at all.** The codebase contains zero imports of the `context` package and zero usages of `context.Context`, `context.WithCancel`, `context.WithTimeout`, or `context.WithValue`.

Instead, a custom `SignalGroup` type (a `chan struct{}`) is used:
```go
// internal/common/signal.go:5
type SignalGroup chan struct{}
```

Propagation happens via:
- Direct struct field assignment (e.g., `BaseAnalyzer.doneChan`)
- Method receivers passing analyzer instances to UI layers
- Channel-based signaling (`doneChan.Broadcast()`, `<-doneChan`)

### 2. How is cancellation handled?

Cancellation is handled via **signal notification** in `StartUILoop` (`tui/tui.go:315-338`):

```go
c := make(chan os.Signal, 1)
signal.Notify(c,
    syscall.SIGHUP, syscall.SIGINT, syscall.SIGQUIT, syscall.SIGILL,
    syscall.SIGTRAP, syscall.SIGABRT, syscall.SIGPIPE, syscall.SIGTERM,
)
s := <-c
ui.app.QueueUpdateDraw(func() {
    ui.printMarkedPaths()
    ui.app.Stop()
})
```

The analyzer uses a two-channel system:
- `progressDoneChan` — signals the progress ticker to stop (`pkg/analyze/parallel.go:42`)
- `doneChan.Broadcast()` — signals analysis completion (`pkg/analyze/parallel.go:43`)

However, these are **broadcast signals only** (fire-and-forget). There is no mechanism to interrupt ongoing file system operations mid-scan. The scan will complete even after a signal is received; the signal only affects the UI loop shutdown.

### 3. Is application state centralized or per-command?

**Centralized with some per-command aspects:**

- `App` struct (`cmd/gdu/app/app.go:182-192`) is the top-level state container: Flags, Args, Istty, TermApp, Screen, Writer, Getter, PathChecker
- `Flags` struct (`cmd/gdu/app/app.go:52-106`) holds all configuration, passed by pointer
- `UI` struct (`internal/common/ui.go:11-23`) holds UI-specific state: Analyzer, ignore patterns, display preferences
- `tui.UI` struct (`tui/tui.go:26-100`) embeds `common.UI` and adds TTY-specific state

Global mutable state exists in `main.go:27-30`:
```go
var (
    af        *app.Flags
    configErr error
)
```

These are module-level package vars, not passed as parameters.

### 4. How are sessions modeled?

**No explicit session concept exists.** There is no session ID, session storage, or session lifecycle management.

What might resemble sessions:
- Database-backed analysis via `--db` flag stores/retrieves scanned state (`cmd/gdu/app/app.go:232-249`)
- The analyzer's `doneChan` could be viewed as a completion signal, but it's not exposed as a session handle
- Input/Output file processing (`--input-file`, `--output-file`) provides analysis import/export

## Architectural Decisions

1. **No `context.Context` usage** — The project uses a custom `SignalGroup` type instead. This is a deliberate choice that trades standard library compatibility for simplicity in a single-threaded-of-control CLI tool.

2. **Custom WaitGroup** — `pkg/analyze/waitgroup.go` implements a simple wait group rather than using `sync.WaitGroup`, likely for custom initialization semantics.

3. **Channel-based progress and done signaling** — Separate channels for progress updates vs. completion signals, rather than embedding everything in a context.

4. **Global concurrency limiter** — A package-level channel `concurrencyLimit` (`pkg/analyze/parallel.go:13`) controls parallel directory processing, rather than passing a semaphore through context.

5. **UI abstraction** — `UI` interface (`cmd/gdu/app/app.go:30-49`) abstracts between TUI, stdout, and export UIs, allowing different output modes while sharing analysis logic.

## Notable Patterns

- **SignalGroup as completion token**: `SignalGroup` (a channel) used as a fire-and-forget broadcast mechanism rather than a typed context
- **Embedded structs for composition**: `tui.UI` embeds `common.UI` which embeds the analyzer
- **Option functional opts**: `tui.Option` func(`*UI`) pattern for configuring UI after construction (`tui/tui.go:114`)
- **Work queue channel**: `deleteQueue chan deleteQueueItem` for background deletion tasks

## Tradeoffs

| Pattern | Tradeoff |
|---------|----------|
| No context.Context | Cannot use `WithCancel`, `WithTimeout`, `WithDeadline` composition; no parent-child cancellation hierarchy | Cannot pass request-scoped values through context | Standard library tooling (e.g., `http.Request.WithContext`) cannot be used directly |
| SignalGroup vs context | Simpler mental model for CLI; less composable | Cannot cancel blocking filesystem operations mid-read |
| Global concurrencyLimit channel | Simple, no need to propagate through call chain | Not thread-safe to modify; global mutable state |
| Module-level `af` and `configErr` | Convenient access in `init()` and command callbacks | Package-level mutable state; harder to test in parallel |

## Failure Modes / Edge Cases

1. **Uninterruptible filesystem scans** — `os.ReadDir` (`pkg/analyze/parallel.go:60`) and `f.Info()` (`pkg/analyze/parallel.go:98`) are blocking calls. If a filesystem is unresponsive (NFS, FUSE), the scan cannot be cancelled until the call returns. There is no way to interrupt these operations.

2. **Goroutine leaks in error paths** — If `AnalyzeDir` returns early due to error, the progress goroutine started at `pkg/analyze/parallel.go:36` may not be properly cleaned up if `progressDoneChan` is not sent on.

3. **No timeout on I/O operations** — No `context.WithTimeout` equivalents; long I/O waits are unbounded.

4. **Race on global `af` and `configErr`** — Multiple concurrent invocations of the CLI could race on the module-level vars in `cmd/gdu/main.go:27-30`.

5. **Signal during initialization** — If a signal arrives before `StartUILoop` is called, it goes unhandled.

## Future Considerations

1. Adopt `context.Context` for standard library compatibility and composable cancellation (e.g., `WithCancel`, `WithTimeout`)
2. Add `context.Context` propagation through `AnalyzeDir` and `processDir` to enable interruptible filesystem operations
3. Consider replacing module-level vars `af` and `configErr` with explicit construction in `Run()`
4. Add structured shutdown with graceful goroutine drain timeout

## Questions / Gaps

- **No evidence found** for `context.Context` usage — confirmed by grep across all `.go` files
- **No evidence found** for `context.WithCancel`, `context.WithTimeout`, or `context.WithValue` usage
- **No evidence found** for session or session-like patterns (session IDs, session storage, session lifecycle)
- **Partial evidence** for cancellation: signal handling exists but cannot interrupt blocking I/O

---

Generated by `study-areas/07-state-context.md` against `gdu`.