# Repo Analysis: gh-cli

## Logging & Observability

### Repo Info

| Field | Value |
|-------|-------|
| Name | gh-cli |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/gh-cli` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

gh (GitHub CLI) uses a combination of standard library `log` package and `fmt.Fprint` to stderr for debug logging. It does not use a structured logging library like slog, zap, or logrus. Debug mode is enabled via `GH_DEBUG` environment variable (with legacy `DEBUG` support). Output separation is partially implemented: user-facing output goes to stdout via `IOStreams.Out`, debug/log messages go to stderr via `IOStreams.ErrOut`, but not all debug logging consistently uses the IOStreams abstraction. Telemetry has a "log" mode that writes payloads to stderr.

## Rating

**5/10** — Basic logging with debug mode support and partial output separation.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Logging library | Standard `log` package used throughout; no third-party structured logging library | `pkg/cmd/codespace/common.go:40` |
| Debug mode | `IsDebugEnabled()` checks `GH_DEBUG` env var (truthy/falsey values) and legacy `DEBUG` env var | `utils/utils.go:10-29` |
| Debug mode | Help text documents `GH_DEBUG` with `api` value for HTTP traffic logging | `pkg/cmd/root/help_topic.go:65-68` |
| Output separation | `IOStreams` struct has distinct `Out` (stdout) and `ErrOut` (stderr) fields | `pkg/iostreams/iostreams.go:52-54` |
| Log levels | No formal log levels; debug output controlled via `IsDebugEnabled()` guard | `utils/utils.go:10-29` |
| Debug file | `gh extension browse --debug` writes logs to temp file via `log.New(f, "", log.Lshortfile)` | `pkg/cmd/extension/browse/browse.go:381-390` |
| Structured logs | No structured logging; plain text output via `fmt.Fprintf(io.ErrOut, ...)` | `pkg/cmd/codespace/ssh.go:140` |
| Telemetry log mode | `GH_TELEMETRY=log` writes telemetry payloads to stderr via `LogFlusher` | `internal/telemetry/telemetry.go:170-199` |
| Telemetry debug | Telemetry `Logged` state writes colored JSON payload to log writer | `internal/telemetry/telemetry.go:172-198` |

## Answers to Protocol Questions

**1. Is logging structured?**

No. gh does not use structured logging libraries. Debug output is plain text via `fmt.Fprintf` to `io.ErrOut` or `log.Logger`. Telemetry payloads are JSON but this is for telemetry, not application logging.

**2. Are debug modes supported?**

Yes. Debug mode is controlled via `GH_DEBUG` environment variable (`utils/utils.go:10-29`). The `api` debug value enables HTTP traffic logging (`pkg/cmd/root/help_topic.go:65-66`). Legacy `DEBUG` env var is also supported.

**3. Are logs separated from user output?**

Partially. The `IOStreams` abstraction (`pkg/iostreams/iostreams.go`) provides distinct `Out` and `ErrOut` streams. However, many commands directly write debug output via `fmt.Fprintf(os.Stderr, ...)` or `log.Logger` without routing through IOStreams. The codespace command creates its own `errLogger` writing to `io.ErrOut` (`pkg/cmd/codespace/common.go:40`).

**4. What observability hooks exist?**

- **Telemetry service** with `GH_TELEMETRY` env var support (`internal/telemetry/telemetry.go:106-145`)
- **Log mode for telemetry**: `GH_TELEMETRY=log` writes telemetry payload to stderr (`internal/telemetry/telemetry.go:170-199`)
- **Debug file output**: `gh extension browse --debug` writes debug logs to a temp file (`pkg/cmd/extension/browse/browse.go:381-390`)
- **Debug flag on rerun**: `--debug` flag on `gh run rerun` enables server-side debug logging (`pkg/cmd/run/rerun/rerun.go:29,90`)

## Architectural Decisions

1. **No structured logging library**: gh uses the standard library `log` package and `fmt.Fprint` family rather than third-party structured loggers. Debug output is ad-hoc and inconsistent.

2. **IOStreams abstraction for output separation**: The `IOStreams` struct (`pkg/iostreams/iostreams.go:49-87`) is the intended mechanism for separating user output (stdout) from diagnostic output (stderr), but not all code paths follow this convention.

3. **Environment-variable-based debug configuration**: Debug mode is driven entirely by environment variables (`GH_DEBUG`, `DEBUG`) rather than command-line flags (except where explicitly provided like `gh run rerun --debug`).

4. **Telemetry as observability mechanism**: Rather than verbose application logging, gh invests in a telemetry system (`internal/telemetry/telemetry.go`) that records events and can operate in "log" mode for debugging.

## Notable Patterns

- Commands that need debug logging create a `*log.Logger` with output destination:
  - Codespace: `log.New(io.ErrOut, "", 0)` (`pkg/cmd/codespace/common.go:40`)
  - Extension browse: `log.New(f, "", log.Lshortfile)` or `log.New(io.Discard, "", 0)` (`pkg/cmd/extension/browse/browse.go:388-390`)

- Many commands write pager errors to `opts.IO.ErrOut` using `fmt.Fprintf(opts.IO.ErrOut, "failed to start pager: %v\n", err)` pattern.

- The `IsDebugEnabled()` function (`utils/utils.go:10-29`) returns both a boolean and the raw value (useful for checking if value is "api").

## Tradeoffs

1. **Inconsistent debug output routing**: Some debug output goes through IOStreams.ErrOut, some goes directly to os.Stderr, and extension browse writes to a temp file. Operators cannot capture all debug output uniformly.

2. **No log levels**: Without structured logging or log levels, operators cannot incrementally increase verbosity. The `GH_DEBUG=api` pattern provides one coarse debug tier for HTTP traffic.

3. **No centralized logger**: Each command or package that needs logging creates its own `log.Logger`. There is no central configuration or sampling policy.

4. **Telemetry is opt-in for observability**: The most sophisticated observability (telemetry with log mode) only works when `GH_TELEMETRY=log` is set and records events rather than general application logs.

## Failure Modes / Edge Cases

1. **Debug output lost to temp file**: When `gh extension browse --debug` is used, logs go to a temp file (`os.CreateTemp("", "extBrowse-*.txt")`) that is deleted after the command completes (`defer os.Remove(f.Name())`). This makes debugging extension browse issues difficult.

2. **Silent failure in telemetry subprocess**: `SpawnSendTelemetry` silently ignores all errors (`internal/telemetry/telemetry.go:362`) since telemetry is "best-effort" — operators cannot diagnose telemetry failures.

3. **Debug mode leaks into output**: In non-TTY contexts, debug messages via `fmt.Fprintf(opts.IO.ErrOut, ...)` are mixed with data output since there is no automatic separation.

4. **Codespace error logger writes to ErrOut**: The codespace `errLogger` writes errors to `io.ErrOut` which may be stderr, but the same stream is used for user-facing warnings in other contexts.

## Future Considerations

1. **Adopt structured logging**: Consider migrating to `log/slog` (Go 1.21+) for structured, level-based logging that can be configured centrally and output in JSON for machine parsing.

2. **Unified debug output routing**: All debug output should route through IOStreams.ErrOut with a consistent format, enabling operators to capture all diagnostic output by redirecting stderr.

3. **Structured telemetry as debug log**: The telemetry system's JSON payload format and `GH_TELEMETRY=log` mode could be extended to serve as a structured application log for operators.

4. **Debug flag standardization**: Commands that support debug mode (like `gh run rerun --debug`, `gh extension browse --debug`, `gh codespace ssh --debug`) could follow a common pattern for consistency.

## Questions / Gaps

1. **No evidence found** for log sampling or log rotation. Debug output could be high-volume with `GH_DEBUG=api` but there is no sampling or size limiting mechanism.

2. **No evidence found** for distributed tracing integration (OpenTelemetry or similar). The telemetry system is internal and does not export trace context.

3. **No evidence found** for structured error reporting with error codes or structured error payloads. Errors are plain text written to stderr.

4. **GH_DEBUG=api behavior is server-assisted**: The API debug logging requires GitHub Actions API server support (`pkg/cmd/run/rerun/rerun.go:232`), meaning debug capability depends on server-side features.

---

Generated by `study-areas/10-logging-observability.md` against `gh-cli`.