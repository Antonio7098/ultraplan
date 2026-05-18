# Repo Analysis: helm

## Logging & Observability

### Repo Info

| Field | Value |
|-------|-------|
| Name | helm |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/helm` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Helm uses Go's standard `log/slog` for structured logging with a custom debug-checking wrapper. The `--debug` flag dynamically controls debug-level log emission at log time rather than logger initialization. Logs are written to `os.Stderr` via a text handler, while user-facing output uses `os.Stdout`. No telemetry or tracing hooks were found.

## Rating

**8/10** — Structured logging with slog, dynamic debug mode, clear output separation. Deducted points for lack of observability hooks (no tracing, metrics, or telemetry integration).

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Logging library | Uses `log/slog` (Go standard library) | `internal/logging/logging.go:21` |
| Custom logger | `DebugCheckHandler` wraps slog for dynamic debug control | `internal/logging/logging.go:31-66` |
| Logger creation | `NewLogger(debugEnabled DebugEnabledFunc)` | `internal/logging/logging.go:69-91` |
| Debug flag | `--debug` CLI flag + `HELM_DEBUG` env var | `pkg/cli/environment.go:163`, `pkg/cli/environment.go:119` |
| SetupLogging | `SetupLogging(debug bool)` wires flag to logger | `pkg/cmd/root.go:131-134` |
| Output target | Logs written to `os.Stderr` via text handler | `internal/logging/logging.go:71` |
| User output | CLI commands receive `os.Stdout` writer | `cmd/helm/helm.go:38` |
| Storage logging | Storage uses `s.Logger().Debug(...)` for operations | `pkg/storage/storage.go:57`, `pkg/storage/storage.go:69` |
| SQL driver logging | Debug logging throughout SQL operations | `pkg/storage/driver/sql.go:115-687` |
| ConfigMap driver | Debug logging on get/list/create operations | `pkg/storage/driver/cfgmaps.go:78-219` |
| Secrets driver | Debug logging on list/get operations | `pkg/storage/driver/secrets.go:106-151` |
| LogHolder interface | `LogHolder` embeds logger in Configuration and Storage | `pkg/action/action.go:145`, `pkg/storage/storage.go:50` |
| Configuration logger | `ConfigurationSetLogger(h slog.Handler)` option | `pkg/action/action.go:152-156` |
| Hook output | Hooks use `log.Writer()` (stderr) | `pkg/cmd/root.go:354` |
| Registry debug | Registry client accepts `ClientOptDebug` option | `pkg/registry/client.go:150-152` |
| DebugCheckHandler test | Comprehensive tests for debug behavior | `internal/logging/logging_test.go:119-373` |

## Answers to Protocol Questions

### 1. Is logging structured?
**Yes.** Helm uses Go's `log/slog` with `slog.NewTextHandler` writing key-value pairs (`pkg/storage/storage.go:57`: `s.Logger().Debug("getting release", "key", makeKey(name, version))`). All log calls use structured attributes.

### 2. Are debug modes supported?
**Yes.** Debug mode is controlled via:
- CLI flag: `--debug` (`pkg/cli/environment.go:163`)
- Environment variable: `HELM_DEBUG` (`pkg/cli/environment.go:119`)
- The `DebugCheckHandler` checks `debugEnabled()` dynamically at log-time (`internal/logging/logging.go:37-45`), not at logger creation, allowing debug output to be toggled mid-execution.

### 3. Are logs separated from user output?
**Yes.** 
- Logs write to `os.Stderr` via `slog.NewTextHandler(os.Stderr, ...)` (`internal/logging/logging.go:71`)
- User-facing output is passed as `os.Stdout` to command builders (`cmd/helm/helm.go:38`)
- Registry client writer is set to `os.Stderr` (`pkg/cmd/root.go:426`, `pkg/cmd/root.go:459`)

### 4. What observability hooks exist?
**None found.** No evidence of OpenTelemetry, Prometheus metrics, Jaeger tracing, or similar integrations. The `DebugCheckHandler` enables debug-level logging dynamically, but no hooks for exporting traces or metrics. HTTP transport has debug logging (`pkg/registry/transport.go:48-61`) but no structured tracing.

## Architectural Decisions

1. **Custom debug-checking wrapper**: `DebugCheckHandler` wraps any `slog.Handler` and dynamically checks `debugEnabled()` at each `Enabled()` call, rather than rebuilding the logger when the debug state changes (`internal/logging/logging.go:31-66`).

2. **LogHolder embedding**: Both `Configuration` (`pkg/action/action.go:145`) and `Storage` (`pkg/storage/storage.go:50`) embed `logging.LogHolder`, providing a consistent logger interface across core components.

3. **Handler injection**: The `ConfigurationSetLogger` option (`pkg/action/action.go:152-156`) allows external applications to inject custom slog handlers, enabling integration with external logging systems.

4. **Timestamp removal**: The logger's `ReplaceAttr` function removes timestamps from log output (`internal/logging/logging.go:75-80`), producing cleaner log lines.

## Notable Patterns

- **Dynamic debug checking**: `DebugEnabledFunc` is called at log time, not logger creation time, allowing runtime toggle of debug output.
- **Storage driver logger propagation**: Storage drivers receive their logger via `SetLogger()` at initialization, and storage layer syncs logger from `slog.Default()` (`pkg/storage/storage.go:342-350`).
- **Hook output via log.Writer()**: Hook output is directed to `log.Writer()` (`pkg/cmd/root.go:354`), which defaults to the standard logger's writer (stderr).

## Tradeoffs

- **No log levels beyond Debug**: Only Debug is conditionally enabled; Info/Warn/Error always emit. This simplifies the model but doesn't allow fine-grained control over Info vs Warn verbosity.
- **No external observability**: No OTEL, Prometheus, or tracing hooks. Operators cannot integrate Helm logs into centralized observability platforms without custom handlers.
- **Text format only**: Uses `slog.NewTextHandler`; no JSON handler option for machine parsing in production environments.

## Failure Modes / Edge Cases

- **Debug flag late evaluation**: Since debug state is checked at log time, if the flag is parsed after logger initialization, debug logging may not respect early flag values (mitigated by evaluating at log time).
- **Discard handler fallback**: If no logger is set, `LogHolder.Logger()` returns a `slog.DiscardHandler` (`internal/logging/logging.go:112`), silently dropping logs.
- **Plugin debug passthrough**: The `--debug` flag is passed to plugins (`pkg/cmd/load_plugins.go:192`), which could produce unexpected behavior if plugins handle debug differently.

## Future Considerations

- Add JSON handler option for structured log ingestion in production.
- Consider OpenTelemetry integration for distributed tracing.
- Add configurable log level thresholds (Info, Warn, Error) for production verbosity control.

## Questions / Gaps

- **No metrics/instrumentation**: No evidence of Prometheus metrics or similar for monitoring Helm operations.
- **No trace propagation**: No evidence of trace context propagation to hooks or post-renderers.
- **No log sampling**: No evidence of log sampling for high-volume operations.

---

Generated by `study-areas/10-logging-observability.md` against `helm`.