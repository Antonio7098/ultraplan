# Repo Analysis: yq

## Logging & Observability

### Repo Info

| Field | Value |
|-------|-------|
| Name | yq |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/yq` |
| Group | `10-logging-observability` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

yq uses structured logging via Go's standard `log/slog` library with a custom `Logger` wrapper. The logging system provides configurable log levels (Warn by default, Debug when verbose), writes to stderr, and supports replacing the underlying slog.Logger. Debug output is extensive throughout the codebase but is guarded by level checks. User output is cleanly separated from logs.

## Rating

**7/10** — Structured logging with slog, debug mode via `-v` flag, logs to stderr only, extensive debug output guarded by level checks. Deductions: no built-in tracing/telemetry hooks, structured fields are limited.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Logging library | Uses `log/slog` with custom `Logger` wrapper | `pkg/yqlib/logger.go:5` |
| Logger initialization | `newLogger()` creates slog text handler on stderr | `pkg/yqlib/logger.go:15-21` |
| Default log level | Default level is `slog.LevelWarn` | `pkg/yqlib/logger.go:17` |
| Log level configuration | `SetLevel()` method for programmatic level control | `pkg/yqlib/logger.go:24-26` |
| Verbose/debug flag | `-v` flag sets level to `LevelDebug` | `cmd/root.go:76-79` |
| Verbose flag definition | `verbose` bool variable | `cmd/constant.go:21` |
| Logger access | `GetLogger()` singleton pattern | `pkg/yqlib/lib.go:26-28` |
| Logger instance | Package-level `log` variable | `pkg/yqlib/lib.go:21` |
| Output separation | Handler uses `os.Stderr` | `pkg/yqlib/logger.go:18` |
| Debug logging | 414 debug log calls throughout codebase | `pkg/yqlib/*.go` |
| Debug guard | `IsEnabledFor()` check before expensive `NodeToString()` calls | `pkg/yqlib/lib.go:276-278,288-290` |
| Slogger replacement | `SetSlogger()` allows replacing the underlying logger | `pkg/yqlib/logger.go:38-41` |
| Source location in debug | `AddSource: verbose` adds file:line to debug logs | `cmd/root.go:82` |
| Format detection logging | Debug logs for auto-detecting file formats | `pkg/yqlib/format.go:127-136` |
| User output | `cmd.SetOut(cmd.OutOrStdout())` — stdout for user data | `cmd/root.go:70` |

## Answers to Protocol Questions

### 1. Is logging structured?
**Yes.** yq uses `log/slog` which produces structured text output by default. The `Logger` wrapper provides `Debugf/Infof/Warningf/Errorf` printf-style methods that format messages before passing to slog. Logs are machine-parseable text with level, time, and message fields. The `SetSlogger()` method allows swapping to a JSON handler for fully structured output.

### 2. Are debug modes supported?
**Yes.** The `-v/--verbose` flag (`cmd/constant.go:21`, `cmd/root.go:92`) sets the log level to `slog.LevelDebug` (`cmd/root.go:78`). When verbose is enabled, `AddSource: verbose` is set to include source location in debug logs (`cmd/root.go:82`). Debug logs are extensive throughout the codebase (414 calls), covering expression evaluation, parsing, printing, and operator execution.

### 3. Are logs separated from user output?
**Yes.** The logger writes to `os.Stderr` via `slog.NewTextHandler(os.Stderr, ...)` (`pkg/yqlib/logger.go:18`). User-facing output is directed to `cmd.OutOrStdout()` via `cmd.SetOut()` (`cmd/root.go:70`). The two streams are completely separate.

### 4. What observability hooks exist?
**Limited.** There is no built-in tracing, metrics, or telemetry integration. The observability surface consists of:
- Structured slog logs (text format, can be swapped to JSON)
- Debug flag (`-v`) for verbosity control
- `SetSlogger()` hook to replace the underlying slog logger with a custom-configured one
- `SetLevel()` and `GetLevel()` for runtime level control
- `debug-node-info` flag (`cmd/root.go:93`) for node-level debugging

No OpenTelemetry, Prometheus metrics, or distributed tracing hooks were found.

## Architectural Decisions

1. **Singleton logger via package-level variable** (`pkg/yqlib/lib.go:21`): `var log = newLogger()` is instantiated at package init, accessed via `GetLogger()`. This is simple but prevents multiple logger instances for different subsystems.

2. **Logger wrapper over slog** (`pkg/yqlib/logger.go:10-77`): The custom `Logger` type wraps slog to provide printf-style methods (`Debugf`, `Infof`, etc.) and a level variable. This adds convenience but the underlying slog is accessible via `SetSlogger()`.

3. **Default warn level** (`pkg/yqlib/logger.go:17`): Only warnings and errors print by default, keeping output clean for normal usage.

4. **Guarded expensive debug operations** (`pkg/yqlib/lib.go:276-278,288-290`): `NodeToString()` and `NodesToString()` check `IsEnabledFor(LevelDebug)` before formatting, preventing expensive string construction in non-debug mode.

## Notable Patterns

1. **Debug log guards**: Most debug calls are inside `if log.IsEnabledFor(slog.LevelDebug)` blocks, preventing string interpolation overhead when debug is disabled.

2. **Verbose flag affects both log level and source info** (`cmd/root.go:76-82`): Enabling verbose sets the log level AND enables `AddSource` for source file:line in logs.

3. **Log methods on Logger struct** (`pkg/yqlib/logger.go:43-77`): Each log level has both `Method(msg string)` and `Methodf(format string, args ...interface{})` variants.

4. **Format auto-detection logging** (`pkg/yqlib/format.go:127-136`): Debug logs describe which format was detected and fallback behavior.

## Tradeoffs

1. **No JSON logging built-in**: Default text slog handler is not machine-parseable without code changes. Users must call `SetSlogger()` with a JSON handler to get JSON output.

2. **No structured fields by default**: Debug logs are printf-style messages rather than key-value fields. Structured field logging would require more refactoring.

3. **Singleton limits testability**: The package-level `log` variable is a global singleton, making it harder to substitute in tests without `GetLogger().SetLevel()` gymnastics.

4. **No metrics/traces**: Pure logging approach with no telemetry means operators must correlate logs manually for performance debugging.

## Failure Modes / Edge Cases

1. **Debug output to stderr can confuse pipes**: When `-v` is used, debug output mixes with stderr while user output goes to stdout, but this can still be confusing if stderr is not separate from stdout in the calling environment.

2. **Verbose flag is boolean only**: There is no log level granularity (e.g., debug vs trace), just a binary on/off.

3. **Debug logging has performance impact even when disabled**: While guards prevent string construction, level checks still occur on every call site.

## Future Considerations

1. **Add OpenTelemetry tracing**: Integrate otel for distributed tracing across expression evaluation stages.

2. **JSON log option**: Add a `--log-format=json` flag to enable JSON slog handler without requiring code changes.

3. **Structured fields**: Refactor debug logs to use key-value pairs via `slog.Log()` and `slog.Group()` for better machine parsing.

4. **Metrics endpoint**: Expose Prometheus metrics for expression evaluation counts, latencies, and error rates.

## Questions / Gaps

1. **No evidence of log sampling or rotation**: No log rotation, size limits, or sampling observed in the codebase.

2. **No structured context propagation**: Debug logs lack consistent fields (e.g., expression ID, file name) that would help correlate logs across operations.

3. **No error categorization**: Errors are logged but not tagged with error codes or categories for easy filtering.

---

Generated by `study-areas/10-logging-observability.md` against `yq`.