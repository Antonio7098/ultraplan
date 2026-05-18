# Repo Analysis: k9s

## Error Handling Philosophy

### Repo Info

| Field | Value |
|-------|-------|
| Name | k9s |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/k9s` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

k9s employs a multi-tier error handling strategy with consistent `%w` wrapping, sentinel error types in `internal/client/errors.go`, and a `Flash` notification system for user-facing errors. Operational errors are logged via `slog` while user-facing messages route through the `Flash` model. The project uses `errors.Is` and `errors.As` for error introspection but relies primarily on stringly-typed sentinel errors rather than rich structured error types.

## Rating

**7/10** — Consistent contextual error wrapping with clear user/operational separation. The `Flash` system effectively distinguishes UI feedback from logging. However, the sentinel error type (`type Error string`) lacks structured data for programmatic error handling, and there is no `errors.Join` usage for multi-error scenarios at the application level (though `errors.Join` is used in `internal/config/config.go:271,276` for config loading).

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Error wrapping | `fmt.Errorf("failed to analyze image packages: %w", err)` | `internal/vul/scanner.go:183` |
| Error wrapping | `fmt.Errorf("plugin validation failed for %s: %w", path, err)` | `internal/config/plugin.go:164` |
| Error wrapping | `fmt.Errorf("shell exec failed: %w", err)` | `internal/view/exec.go:375` |
| Sentinel errors | `type Error string` with `Error() string` method | `internal/client/errors.go:9-14` |
| Sentinel constants | `noMetricServerErr = Error("No metrics-server detected")` | `internal/client/errors.go:17` |
| Sentinel constants | `metricsUnsupportedErr = Error("No metrics api group...")` | `internal/client/errors.go:18` |
| errors.Is usage | `if !errors.Is(err, noMetricServerErr) && !errors.Is(err, metricsUnsupportedErr)` | `internal/client/client.go:76` |
| errors.Is usage | `if errors.Is(err, fs.ErrNotExist)` | `internal/config/config.go:260,294` |
| errors.Is usage | `errors.Is(err, io.EOF)` | `internal/dao/pod.go:501` |
| errors.As usage | `errors.As(err, &ex)` where `var ex *exec.ExitError` | `internal/view/exec.go:581` |
| User-facing errors | `f.Flash().Err(err)` routes to UI flash | `internal/view/pod.go:154` |
| User-facing errors | `f.Flash().Warnf(...)` for warnings | `internal/view/svc.go:68` |
| User-facing errors | `f.Flash().Infof(...)` for info | `internal/view/table.go:212` |
| Operational errors | `slog.Error("Flash error", slogs.Error, err)` | `internal/model/flash.go:101` |
| Operational errors | `slog.Error("RestConfig load failed", slogs.Error, err)` | `internal/client/client.go:311` |
| Fatal handling | Panic recovery with `defer recover()` at startup | `cmd/root.go:94-101` |
| errors.Join | `errs = errors.Join(errs, fmt.Errorf(...))` for multi-error config | `internal/config/config.go:271,276` |

## Answers to Protocol Questions

### 1. Are errors wrapped with context?

**Yes.** k9s consistently wraps errors using `fmt.Errorf` with `%w`. Examples:
- `internal/vul/scanner.go:183`: `fmt.Errorf("failed to analyze image packages: %w", err)`
- `internal/config/plugin.go:164`: `fmt.Errorf("plugin validation failed for %s: %w", path, err)`
- `internal/config/config.go:103`: `fmt.Errorf("k8sflags. unable to activate context %q: %w", *flags.Context, err)`

The wrapping includes operation context (e.g., "failed to analyze", "plugin validation failed") and relevant identifiers (paths, context names).

### 2. Which errors are user-facing vs operational?

**User-facing**: Errors routed through `Flash.Err()`, `Flash.Warnf()`, `Flash.Infof()` in view layer (`internal/view/`). These display in the TUI flash notification system.

**Operational**: Errors logged via `slog.Error`, `slog.Warn` throughout. Examples:
- `internal/model/flash.go:101`: `slog.Error("Flash error", slogs.Error, err)` — operational copy of user-facing error
- `internal/dao/pod.go:475-478`: `slog.Error("Failed to close stream", ...)` — stream failures logged but not shown to user
- `internal/client/client.go:311`: `slog.Error("RestConfig load failed", slogs.Error, err)`

The code explicitly separates operational logging from user notifications: `internal/dao/pod.go:516-518` comments state "Don't send stream errors to user - they will be retried".

### 3. How are fatal vs recoverable failures handled?

**Fatal**: Panics caught at startup in `cmd/root.go:94-101`:
```go
defer func() {
    if err := recover(); err != nil {
        slog.Error("Boom!! k9s init failed", slogs.Error, err)
        slog.Error("", slogs.Stack, string(debug.Stack()))
        printLogo(color.Red)
        fmt.Printf("%s", color.Colorize("Boom!! ", color.Red))
        fmt.Printf("%v.\n", err)
    }
}()
```

**Recoverable**: Connection failures set `connOK = false` but do not halt execution (`internal/client/client.go:77`). Metrics failures are non-fatal (`internal/client/client.go:74-79`). Log stream errors are retried silently (`internal/dao/pod.go:512-518`).

### 4. Are sentinel errors used for programmatic checking?

**Partially.** k9s defines stringly-typed sentinels in `internal/client/errors.go:16-18`:
```go
const (
    noMetricServerErr     = Error("No metrics-server detected")
    metricsUnsupportedErr = Error("No metrics api group " + metricsapi.GroupName + " found on cluster")
)
```

Checking is done via `errors.Is` (e.g., `internal/client/client.go:76`). However, these are simple string-based errors without structured data. The codebase does not define richer error types with fields for programmatic inspection beyond `exec.ExitError` handling in `internal/view/exec.go:581`.

## Architectural Decisions

1. **Flash model separates UI from logging**: The `Flash` struct (`internal/model/flash.go:58-63`) routes messages to TUI notifications AND logs them operationally. Methods like `Flash.Err()` (`internal/model/flash.go:100-103`) call both `slog.Error` and `f.SetMessage(FlashErr, err.Error())`.

2. **Stringly-typed sentinel errors**: Using `type Error string` instead of custom structs limits programmatic error inspection but simplifies error comparison.

3. **Graceful degradation for optional features**: Metrics server absence (`internal/client/client.go:74-79`) is non-fatal; the UI continues with limited functionality.

4. **Retry-aware error handling**: Log streaming (`internal/dao/pod.go:512-518`) treats transient errors as retry opportunities rather than failures.

## Notable Patterns

- **Error wrapping with operation context**: `fmt.Errorf("verb failed: %w", err)` pattern throughout `internal/config/`, `internal/vul/scanner.go`, `internal/view/exec.go`
- **Sentinel error checking**: `errors.Is(err, fs.ErrNotExist)` used for file existence checks across `internal/config/` directory
- **Flash triple-tier**: `FlashInfo`, `FlashWarn`, `FlashErr` levels with auto-clear delay (`internal/model/flash.go:15-25`)
- **Connection state tracking**: `connOK` boolean set on errors but does not immediately terminate (`internal/client/client.go:77`)

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| Stringly-typed sentinels | Simple comparison vs no structured data for inspection |
| Flash logs operational errors | Double logging (UI + slog) for every error |
| Non-fatal metrics failures | Resilient UI but can mask cluster configuration issues |
| Panic recovery at startup | Safety vs potential for undefined state continuation |

## Failure Modes / Edge Cases

- **Metrics server absent**: `internal/client/client.go:74-79` catches error but only warns; UI shows "No metrics-server detected" but functions without metrics
- **Log stream EOF**: `internal/dao/pod.go:501-508` handles EOF gracefully, emits partial line before exiting loop
- **Config file missing**: `internal/config/config.go:260` creates default config file rather than failing
- **Context switch failure**: `internal/client/client.go:571-577` logs warning but retains previous context state

## Future Considerations

- Rich error types with fields (e.g., `ResourceKind`, `Namespace`, `Verb`) could enable more programmatic error handling
- Structured logging with consistent error codes could improve production debugging
- Error aggregation at application level (beyond config loading) could provide better multi-error reporting

## Questions / Gaps

- No evidence of error retry budgets or circuit breakers for transient failures
- No structured error codes for categorization beyond `FlashLevel` enum
- Error documentation is minimal; error strings serve as both user messages and developer documentation

---

Generated by `study-areas/05-error-handling.md` against `k9s`.