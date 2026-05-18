# Repo Analysis: chezmoi

## Logging & Observability

### Repo Info

| Field | Value |
|-------|-------|
| Name | chezmoi |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/chezmoi` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Chezmoi uses Go's standard `log/slog` for structured logging. Debug mode is toggled via `--debug` flag which writes logs to stderr. The codebase maintains clear separation between user output (`stdout`) and diagnostic logs (`stderr`). However, there are no log levels beyond debug on/off, and no observability hooks like OpenTelemetry tracing or metrics.

## Rating

**6/10** — Basic structured logging with debug support. Operators can enable debug output via `--debug` flag and get structured logs to stderr. Score 4-6 in rubric.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Logging library | Uses Go standard `log/slog` | `internal/chezmoilog/chezmoilog.go:8` |
| Structured logging | `slog.String`, `slog.Int`, `slog.Any`, `slog.Duration` attributes used throughout | `internal/chezmoilog/chezmoilog.go:126-134`, `internal/cmd/statuscmd.go:55-59` |
| Debug flag | `--debug` flag enables `slog.NewTextHandler(c.stderr, nil)` | `internal/cmd/config.go:2295-2296` |
| Debug off | When debug=false, uses `chezmoilog.NullHandler{}` which drops all logs | `internal/cmd/config.go:2298` |
| Output separation | User output to `c.stdout`, logs to `c.stderr` | `internal/cmd/config.go:280-281` |
| Log components | Component key `"component"` used to categorize logs (encryption, persistentState, sourceState, system) | `internal/cmd/config.go:63-67` |
| LogCmd wrappers | `LogCmdOutput`, `LogCmdRun`, `LogCmdStart`, `LogCmdWait`, `LogCmdCombinedOutput` for command execution logging | `internal/chezmoilog/chezmoilog.go:141-209` |
| HTTP logging | `LogHTTPRequest` logs HTTP requests with duration, method, URL, status | `internal/chezmoilog/chezmoilog.go:122-139` |
| Verbose flag | `--verbose`/`-v` flag exists but only controls diff output | `internal/cmd/config.go:1911` |
| DebugSystem | `DebugSystem` wraps System interface to log operations | `internal/cmd/config.go:2315-2316` |
| DebugPersistentState | `DebugPersistentState` logs all persistent state operations | `internal/chezmoi/debugpersistentstate.go:17-102` |

## Answers to Protocol Questions

### 1. Is logging structured?

**Yes.** Chezmoi uses Go's `log/slog` with structured attributes. Every log entry includes named fields:

```go
c.logger.Info("persistentPreRunRootE",
    slog.Any("version", c.versionInfo),
    slog.Any("args", os.Args),
    slog.String("goVersion", runtime.Version()),
)
```

The `chezmoilog` package (`internal/chezmoilog/chezmoilog.go:1-245`) provides helpers like `Stringer`, `Bytes`, `InfoOrError` for consistent structured attribute creation.

### 2. Are debug modes supported?

**Yes, via `--debug` flag.** When `--debug` is enabled, logs are written to stderr using `slog.NewTextHandler`. When disabled, `chezmoilog.NullHandler{}` silently drops all log output.

The `--verbose` flag (`-v`) exists but only controls verbosity of diff output, not logging verbosity (`internal/cmd/config.go:1911`).

### 3. Are logs separated from user output?

**Yes.** The configuration holds separate `stdout` and `stderr` fields (`internal/cmd/config.go:280-281`), initialized from `os.Stdout` and `os.Stderr`. User-facing output writes to `c.stdout`, logs write to `c.stderr`.

The `errorf` function explicitly writes to stderr:
```go
func (c *Config) errorf(format string, args ...any) {
    fmt.Fprintf(c.stderr, "chezmoi: "+format, args...)
}
```
(`internal/cmd/config.go:1386-1388`)

### 4. What observability hooks exist?

**Limited.** No OpenTelemetry tracing or metrics integration found. Only logging via `slog`.

Observability is limited to:
- Structured logging via `slog`
- Debug logging of system calls (via `DebugSystem` at `internal/cmd/config.go:2315-2316`)
- Debug logging of persistent state operations (via `DebugPersistentState` at `internal/chezmoi/debugpersistentstate.go:17`)
- The `doctor` command (`internal/cmd/doctorcmd.go`) performs health checks but does not emit telemetry

## Architectural Decisions

### Debug as a binary switch, not levels

Chezmoi does not implement log levels (Debug, Info, Warn, Error). Instead, debug logging is either **on** or **off**:
- `c.debug = true` → `slog.NewTextHandler(c.stderr, nil)` writes all logs to stderr
- `c.debug = false` → `chezmoilog.NullHandler{}` drops all logs

This is simpler than level-based logging but less flexible for operators who want to filter at runtime.

### Component-based log categorization

Logs are tagged with a `component` attribute to aid filtering:
- `"encryption"` — encryption operations (`internal/cmd/config.go:2881`)
- `"persistentState"` — database operations (`internal/cmd/config.go:2376`)
- `"sourceState"` — source state parsing (`internal/cmd/config.go:2060`)
- `"system"` — filesystem operations (`internal/cmd/config.go:2315`)

### Loggable command wrappers

The `chezmoilog` package provides wrappers for `exec.Cmd` operations that automatically capture:
- Command path, args, dir, env
- Duration
- Output size (truncated to 64 bytes)
- Exit code and process info

This ensures external command executions are always observable.

## Notable Patterns

1. **LogValue interface for complex types**: Custom types like `OSExecCmdLogValuer`, `OSExecExitLogValuerError`, and `OSProcessStateLogValuer` implement `slog.LogValuer` to control what gets logged for exec operations (`internal/chezmoilog/chezmoilog.go:36-84`).

2. **InfoOrError helper**: All log calls use `chezmoilog.InfoOrError` which automatically elevates to Error level when err is non-nil (`internal/chezmoilog/chezmoilog.go:211-231`).

3. **Lazy pager startup with logging**: When using a diff pager, the command startup is wrapped with `chezmoilog.LogCmdStart` so pager execution is observable (`internal/cmd/config.go:2407`).

## Tradeoffs

1. **No log levels**: Only debug on/off. Operators cannot set log level to Info to see operational events without full debug noise.

2. **No trace propagation**: External command wrappers log but don't propagate trace context. Correlating logs across subprocess calls is manual.

3. **No metrics**: No counters, gauges, or histograms for operational visibility. Only event-style logging.

4. **Debug logging is silent by default**: With `NullHandler`, debug logs are completely dropped. This can make debugging production issues difficult if the user didn't anticipate needing logs.

## Failure Modes / Edge Cases

1. **Debug mode required for any logging**: Without `--debug`, all structured logs are silently dropped. If a user reports an issue without debug mode enabled, there is no log evidence.

2. **64-byte output truncation**: Command output logs are truncated to 64 bytes (`few` constant at `internal/chezmoilog/chezmoilog.go:16`). Full output is not available even in debug mode.

3. **Stderr used for logs**: If a terminal misidentifies stderr as user output, debug logs may appear interleaved with user-facing output.

4. **No buffer overflow protection**: The `firstFewBytesHelper` function truncates but the truncation limit (`few = 64`) is arbitrary and may not be enough for debugging.

## Future Considerations

1. **Log levels**: Implement Info/Warn/Error levels so operators can get operational logs without full debug verbosity.

2. **OpenTelemetry integration**: Add trace context propagation to command wrappers and HTTP requests for distributed tracing support.

3. **Metrics**: Add counters for file operations, template executions, and encryption operations to give operators quantitative insight.

4. **Log sampling**: For high-volume operations, consider probabilistic sampling to reduce log volume while maintaining observability.

## Questions / Gaps

1. **Why is there no log level filtering?** The codebase uses `slog.LevelInfo` in `InfoOrErrorContext` but the `NullHandler` drops everything when debug is off. There is no way to get Info-level logs without enabling debug.

2. **Why is the output truncation limit 64 bytes?** This seems low for debugging command output. What is the rationale?

3. **No evidence of structured logging for config parsing** — Are configuration file parsing errors logged with context?

4. **OpenTelemetry dependencies in go.mod** — The `go.mod` includes `opentelemetry.io` packages as indirect dependencies, but they are not used in the codebase. Are there plans to integrate them?

---

Generated by `study-areas/10-logging-observability.md` against `chezmoi`.