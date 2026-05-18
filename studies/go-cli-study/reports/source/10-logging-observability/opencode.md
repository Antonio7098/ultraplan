# Repo Analysis: opencode

## Logging & Observability

### Repo Info

| Field | Value |
|-------|-------|
| Name | opencode |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` |
| Group | `opencode` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Opencode uses Go's `log/slog` for structured logging with a custom wrapper in `internal/logging/`. The logging system has multiple output modes: text handler with custom writer for TUI consumption, and file-based logging for dev debug sessions. Log levels are configurable via `cfg.Debug` or `OPENCODE_DEV_DEBUG` environment variable. Logs are partially separated from user output — the spinner program explicitly uses `os.Stderr` (`internal/format/spinner.go:72`), but there's no systematic stdout/stderr separation for all log categories. Session-based message logging to files is implemented for debugging/replay. No observability hooks (traces, metrics) are present.

## Rating

**7/10** — Structured logs and debug support present. Deducted points for lack of observability hooks (tracing, telemetry) and incomplete stdout/stderr separation.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Logging library | Uses `log/slog` with custom wrapper functions (Info, Debug, Warn, Error) | `internal/logging/logger.go:25-62` |
| Structured logging | slog handles structured key-value pairs; custom writer parses logfmt | `internal/logging/logger.go:27`, `internal/logging/writer.go:47-88` |
| Log levels | Level controlled by `slog.Level` — Debug when `cfg.Debug` true | `internal/config/config.go:159-161` |
| Debug mode | `OPENCODE_DEV_DEBUG` env var triggers file-based logging + message persistence | `internal/config/config.go:163-182` |
| Output separation | Spinner uses `tea.WithOutput(os.Stderr)` explicitly; LSP stderr piped to os.Stderr | `internal/format/spinner.go:72`, `internal/lsp/client.go:99` |
| Session logging | Writes request/response messages to JSON files per session | `internal/logging/logger.go:141-206` |
| Log message type | `LogMessage` struct with ID, Time, Level, Message, Attributes | `internal/logging/message.go:7-16` |
| Panic handling | `RecoverPanic` writes stack trace to timestamped file | `internal/logging/logger.go:67-95` |
| Config struct | Debug and debugLSP flags in Config | `internal/config/config.go:91-92` |

## Answers to Protocol Questions

1. **Is logging structured?**
   Yes. Uses `log/slog` which produces structured key-value log entries. The custom `writer.go` parses logfmt format and extracts time, level, msg, and additional attributes into a `LogMessage` struct (`internal/logging/message.go:7-16`). Each log call passes key-value args (e.g., `logging.Info("message", "key", "value")`).

2. **Are debug modes supported?**
   Yes. Two debug modes exist: (1) `-d` flag sets `cfg.Debug` true → `slog.LevelDebug` (`internal/config/config.go:159-161`), (2) `OPENCODE_DEV_DEBUG=true` enables file-based debug logging with message persistence to `messages/` directory (`internal/config/config.go:163-182`). The `logger.go:30-33` shows `Debug` function that calls `slog.Debug`.

3. **Are logs separated from user output?**
   Partially. The TUI spinner program explicitly uses `tea.WithOutput(os.Stderr)` (`internal/format/spinner.go:72`). LSP server stderr is piped and written to `os.Stderr` (`internal/lsp/client.go:99`). However, general `slog` output goes to the default handler, and in non-interactive mode the AI response is printed to stdout (`internal/app/app.go:156`). No systematic env stdout/stderr separation for all log categories.

4. **What observability hooks exist?**
   None found. No tracing (OpenTelemetry, opentracing), no metrics, no telemetry. The `internal/llm/prompt/coder.go:35` mentions "Log telemetry" in a comment but no actual telemetry implementation exists. Only local file-based session logging (`logging/logger.go:141-206`) and panic logging to files.

## Architectural Decisions

1. **Centralized logging package** — All logging goes through `internal/logging/` wrapper functions (Info, Debug, Warn, Error, *Persist variants). This decouples from raw slog usage and allows adding session-specific behavior (persist flags).

2. **Dual output modes** — When `OPENCODE_DEV_DEBUG=true`, logs go to a file at `~/.opencode/debug.log` with a separate message directory for session replay. Otherwise, logs go through `logging.NewWriter()` which feeds the TUI's log display system via a pubsub broker.

3. **Log persistence flags** — `*Persist` variants (e.g., `InfoPersist`) append a special `$_persist` key that signals the TUI to show the message in the status bar (`internal/logging/writer.go:67-68`). This allows critical messages to surface in the UI.

4. **Custom logfmt decoder** — The writer uses `github.com/go-logfmt/logfmt` to parse structured log entries and emit them as `LogMessage` events through a pubsub broker for real-time TUI consumption.

## Notable Patterns

- **Caller tracking**: `getCaller()` in `logger.go:15-24` uses `runtime.Caller(2)` to inject source location (file:line) into every log entry as the `source` attribute.

- **Pubsub-based log distribution**: `LogData` embeds a `Broker[LogMessage]` and publishes every log entry. The TUI subscribes via `logging.Subscribe(ctx)` to display logs in real-time (`cmd/root.go:255`).

- **Session-scoped message logging**: Request/response messages are written to `{session_prefix}/{request_seq_id}_request.json` etc. when `OPENCODE_DEV_DEBUG=true` and `logging.MessageDir` is set (`logger.go:141-206`).

- **Panic recovery with file stack trace**: `RecoverPanic` writes panic details + `debug.Stack()` to a timestamped file (`opencode-panic-{name}-{timestamp}.log`) in the current directory.

## Tradeoffs

1. **No trace-level observability** — No OpenTelemetry, Zipkin, or similar distributed tracing. Operators cannot correlate log entries across services or request chains. Debugging requires reading raw log files or session replay files.

2. **Incomplete stdout/stderr separation** — User-facing output (AI responses) goes to stdout, spinner goes to stderr, but general logs default to wherever slog writes. This makes it hard to programmatically separate user output from diagnostic logs without controlling the entire output pipeline.

3. **Dev-only message persistence** — Message session logging only activates when `OPENCODE_DEV_DEBUG=true`. Production debugging relies on operators reproducing issues with debug mode enabled.

4. **No structured field schema enforcement** — Logs are unstructured text with key-value pairs, but there's no schema or documentation for what fields are expected. Operators must infer from code.

## Failure Modes / Edge Cases

- **Missing MessageDir causes silent drop**: `AppendToSessionLogFile` returns early with empty string if `MessageDir == ""` or `sessionId == ""` (`logger.go:107-109`). No warning logged.

- **Session log directory race**: `AppendToSessionLogFile` creates directory with `MkdirAll` but does not handle concurrent creation gracefully (though `os.MkdirAll` is idempotent, the double-check pattern could race).

- **Log file descriptor leak in dev mode**: The file writer opened at `config.go:184` is assigned to a local variable and passed to `slog.SetDefault`. There's no explicit close mechanism documented.

- **Debug flag per-session**: The `debug` config is global, not per-session. Running multiple sessions interactively cannot have one in debug mode and another not.

## Future Considerations

1. **Add OpenTelemetry tracing** — Instrument agent loop and LLM calls with trace spans. This would allow operators to see request flow and timing breakdowns.

2. **Structured field schema** — Document expected log fields. Consider JSON Schema for log entries to enable parsing validation.

3. **stdout/stderr policy** — Define clearly: logs → stderr, user output → stdout. Use `slog.NewJSONHandler(os.Stderr, ...)` in production for easy `grep` filtering.

4. **Production session logging** — Make message persistence controllable via config flag, not just env var. Consider sampling for production use.

5. **Metrics hooks** — Add basic counters/gauges for token usage, tool invocations, error rates. Expose via `/metrics` endpoint for Prometheus scraping.

## Questions / Gaps

- **No evidence found** for metrics collection (Prometheus, StatsD). No `/metrics` endpoint or equivalent.
- **No evidence found** for distributed tracing (OpenTelemetry, Jaeger, Zipkin). No trace context propagation.
- **No evidence found** for structured log schema documentation. What fields should operators expect?
- **No evidence found** for log rotation on the debug.log file. Could grow unbounded.
- Unclear if `slog.SetDefault` logger in dev mode is ever closed or flushed on shutdown.

---

Generated by `study-areas/10-logging-observability.md` against `opencode`.