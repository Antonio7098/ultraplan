# Repo Analysis: dive

## Logging & Observability

### Repo Info

| Field | Value |
|-------|-------|
| Name | dive |
| Path | `repos/dive` |
| Group | `logging-observability` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Dive uses the `github.com/anchore/go-logger` library for logging, which is a structured logging facade that supports multiple backends. The default logger is a discard logger (`discard.New()`) at `internal/log/log.go:9`, but is replaced with a real logger via `clio` state during CLI initialization at `cmd/dive/cli/cli.go:31`. Log levels (error, warn, info, debug, trace) are supported via the go-logger interface. Debug mode is effectively controlled through verbosity flags and quiet mode in the UI layer. Output separation exists: stdout is used for primary reports, stderr is used for UI status messages, and the logger is set to discard when UI is active to avoid interference (`cmd/dive/cli/internal/ui/v1.go:145-146`).

## Rating

**7/10** — Structured logging via go-logger facade with log level support, debug/trace methods, and output separation between user-facing stdout and stderr UI messages. The logging system is well-integrated with nested loggers for component tagging but lacks direct operator-facing debug flags beyond clio's -v/-q flags.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Logging library | `github.com/anchore/go-logger` facade with discard adapter | `internal/log/log.go:4-5` |
| Default discard logger | `var log = discard.New()` singleton | `internal/log/log.go:9` |
| Logger initialization | `log.Set(state.Logger)` from clio state | `cmd/dive/cli/cli.go:31` |
| Log level methods | Errorf, Error, Warnf, Warn, Infof, Info, Debugf, Debug, Tracef, Trace | `internal/log/log.go:22-69` |
| Structured fields | `WithFields()` and `Nested()` helpers | `internal/log/log.go:71-78` |
| Nested logger usage | UI components use `log.Nested("ui", "component")` | `cmd/dive/cli/internal/ui/v1/view/status.go:38` |
| Verbosity handling | `verbosity int` field in V1UI | `cmd/dive/cli/internal/ui/v1.go:30` |
| Quiet mode | `quiet bool` field suppresses status output | `cmd/dive/cli/internal/ui/v1.go:29` |
| Logger suppression | `log.Set(discard.New())` when verbosity==0 or quiet | `cmd/dive/cli/internal/ui/v1.go:56-60` |
| UI/logger separation | Logger set to discard during ExploreAnalysis to not interfere with UI | `cmd/dive/cli/internal/ui/v1.go:145-146` |
| Stdout/stderr separation | V1UI has `out io.Writer` and `err io.Writer` fields | `cmd/dive/cli/internal/ui/v1.go:25-26` |
| Status to stderr | `writeToStderr()` for title/notification messages | `cmd/dive/cli/internal/ui/v1.go:165-172` |
| Report to stdout | `writeToStdout()` for primary report output | `cmd/dive/cli/internal/ui/v1.go:161-163` |
| Verbosity affects stderr | `if n.quiet || n.verbosity > 0` gates stderr output | `cmd/dive/cli/internal/ui/v1.go:166` |
| Event bus logging | Parsing errors logged with `log.WithFields()` | `cmd/dive/cli/internal/ui/v1.go:101,124,134,142` |
| V1Preferences plumbing | UI preferences passed from Application options | `cmd/dive/cli/internal/options/application.go:23-31` |
| Debug constant | `const debug = false` in app.go (compile-time flag) | `cmd/dive/cli/internal/ui/v1/app/app.go:14` |
| OpenTelemetry present | otel/trace imported as indirect dependency | `go.mod:108,111` |

## Answers to Protocol Questions

1. **Is logging structured?**
   Yes. The go-logger library supports structured fields via `WithFields()` at `internal/log/log.go:71-73`. The UI components use nested loggers (e.g., `log.Nested("ui", "status")` at `cmd/dive/cli/internal/ui/v1/view/status.go:38`) which attach hard-coded key-value pairs to every log message, enabling machine-parseable structured output when a structured backend is configured.

2. **Are debug modes supported?**
   Yes, debug-level logging is supported (`log.Debug()`, `log.Debugf()` at `internal/log/log.go:56-58`). At runtime, verbosity is controlled via clio's global flags (-v for verbose, -q for quiet) and the `verbosity` field in V1UI (`cmd/dive/cli/internal/ui/v1.go:30`). There is also a compile-time debug constant (`debug = false` at `cmd/dive/cli/internal/ui/v1/app/app.go:14`) that is unused in current code.

3. **Are logs separated from user output?**
   Yes. The V1UI maintains separate `out` (stdout) and `err` (stderr) writers at `cmd/dive/cli/internal/ui/v1.go:25-26`. Primary report content goes to stdout via `writeToStdout()` while title/notification/status messages go to stderr via `writeToStderr()`. The logger itself is set to discard when the UI is active to prevent interference (`cmd/dive/cli/internal/ui/v1.go:145-146`). However, logs are not directly written to stderr but rather flow through the configured go-logger backend (typically connected to clio's logging system).

4. **What observability hooks exist?**
   OpenTelemetry trace packages are present as indirect dependencies (`go.mod:108,111`), but no active trace instrumentation was found in the codebase. The primary observability mechanism is the structured logger with nested context. Event bus messages are logged with field context when parsing fails (`cmd/dive/cli/internal/ui/v1.go:101`). No metrics or histogram hooks observed. Score: 7 — Structured logs and debug support.

## Architectural Decisions

- **Logger facade pattern**: The `internal/log/log.go` singleton wraps `github.com/anchore/go-logger` rather than using it directly, allowing runtime logger replacement and testability.
- **Discard-by-default**: The global logger defaults to a no-op discard logger (`discard.New()` at `internal/log/log.go:9`), requiring explicit logger initialization via `log.Set()`.
- **Nested loggers for component tagging**: UI components create child loggers with fixed context fields (e.g., "ui", "status") rather than passing logger references explicitly, making log traces traceable to specific UI components.
- **Logger/UI mutual exclusion**: When the TUI is running (`ExploreAnalysis` event), the logger is explicitly set to discard (`cmd/dive/cli/internal/ui/v1.go:145-146`) to prevent log output from corrupting the terminal UI.
- **Event-driven logging**: Parsing errors for bus events are logged through the structured logger with full event context attached via `WithFields()`.

## Notable Patterns

- **Logger singleton with package-level helpers**: All log calls go through package-level functions (`log.Info()`, `log.Debug()`, etc.) rather than through an injected logger instance, simplifying call sites.
- **Nested logger for UI isolation**: UI views use `log.Nested("ui", componentName)` to create component-specific loggers that share the parent logger's backend but include identifying context.
- **Conditional stderr gating**: The V1UI's `writeToStderr()` respects both `quiet` mode and `verbosity > 0` to suppress status messages while still allowing the UI to function.
- **Logger replacement at Setup()**: The V1UI's `Setup()` method may replace the global logger with discard if verbosity is zero or quiet mode is set, effectively turning off logging when not needed.

## Tradeoffs

- **No direct operator debug flag**: Debug verbosity is controlled indirectly through clio's -v flag rather than a dive-specific flag. If the clio integration is removed or bypassed, there is no direct debug control.
- **Logger suppression is global**: Setting the logger to discard in V1UI affects the entire process, not just the UI component. All logging is suppressed, not just UI-related logs.
- **No structured output format control**: The go-logger facade abstracts the backend; the actual output format depends on the configured backend (not visible in source what the actual output format is).
- **Compile-time debug constant unused**: A `debug = false` constant exists in `app.go:14` but is never used, suggesting abandoned debug instrumentation.

## Failure Modes / Edge Cases

- **Logger not set before use**: If `log.Set()` is not called before any log function is invoked, the default discard logger silently drops all logs, which could mask operational issues.
- **Event parsing failure hides real errors**: When event parsing fails, the error is logged but the event is still dispatched with nil values, potentially causing downstream nil pointer dereferences in handlers that don't check for nil.
- **Stdout/stderr separation not universal**: Not all output respects the stdout/stderr split. Some operations may write directly to stdout or stderr without using the V1UI's writer abstraction.

## Future Considerations

- **Add OpenTelemetry instrumentation**: The otel dependencies are present but unused. Adding trace spans around key operations (image fetching, analysis, file tree construction) would improve observability.
- **Structured log format configuration**: Currently the log format is backend-dependent. Exposing configuration for JSON vs text output would improve operator debuggability.
- **Debug-specific output channel**: Consider routing debug/trace logs to a dedicated file or fd separate from stderr to allow operators to capture diagnostic output without polluting console output.
- **Logger level configuration**: Currently verbosity is the only runtime control. Adding explicit log level configuration (ERROR, WARN, INFO, DEBUG, TRACE) would give operators finer control.

## Questions / Gaps

- **No evidence found** for direct operator-accessible debug mode beyond clio's -v flag. The clio integration means the -v flag is available but not dive-specific.
- **No evidence found** for log rotation or file-based log output. All logs go to whatever backend clio configures.
- **No evidence found** for structured field schemas or documented log formats.
- **No evidence found** for telemetry export or trace propagation.

---

Generated by `study-areas/10-logging-observability.md` against `dive`.