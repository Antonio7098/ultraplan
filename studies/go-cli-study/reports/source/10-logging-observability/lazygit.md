# Repo Analysis: lazygit

## Logging & Observability

### Repo Info

| Field | Value |
|-------|-------|
| Name | lazygit |
| Path | `repos/lazygit` |
| Group | `10-logging-observability` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

lazygit uses logrus for structured logging with JSON output. Debug mode is toggled via `--debug` flag or `DEBUG` env var, writing to a file configured by `LAZYGIT_LOG_PATH`. Production mode discards all logs; development mode writes JSON to a file with configurable level via `LOG_LEVEL`. The app separates user-facing TUI output (stdout/stderr via gocui) from debug logs (file-based), but the logging package intentionally avoids dependencies to prevent circular imports.

## Rating

**6/10** — Basic structured logging (JSON), debug mode support via flag/env, log level configuration via env. No telemetry/tracing hooks, no operator-accessible real-time log tailing in prod. Score reflects: logrus JSON logging with level control, file-based debug logging, but no observability hooks (tracing, metrics), no real separation between user output and logs in the TUI context, and no structured field standardization across calls.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Logging library | Uses `github.com/sirupsen/logrus` v1.9.4 | `pkg/logs/logs.go:8` |
| Structured format | JSON formatter configured via `&logrus.JSONFormatter{}` | `pkg/logs/logs.go:52` |
| Production logger | Output discarded, level set to Error | `pkg/logs/logs.go:32-33` |
| Development logger | Output to file path from `LAZYGIT_LOG_PATH`, level from `LOG_LEVEL` env | `pkg/logs/logs.go:37-46` |
| Default log level | DebugLevel when `LOG_LEVEL` not set | `pkg/logs/logs.go:61` |
| Debug flag | `--debug` long flag (`debug bool`) with `DEBUG` env fallback | `pkg/config/app_config.go:24` |
| Debug path resolution | `LogPath()` returns `LAZYGIT_LOG_PATH` or `state.yml` dir + `development.log` | `pkg/config/app_config.go:731-737` |
| Logger construction | `newLogger()` checks `cfg.GetDebug()` to choose dev vs prod logger | `pkg/app/app.go:82-92` |
| Global logger | `logs.Global` initialized only when `LAZYGIT_LOG_PATH` is set | `pkg/logs/logs.go:20-27` |
| Common struct | `Common.Log *logrus.Entry` field injected into app components | `pkg/common/common.go:14` |
| Tail logs command | `TailLogs` function to tail and pretty-print development logs | `pkg/logs/tail/tail.go:13-27` |
| Log tail dependency | Uses `github.com/aybabtme/humanlog` for human-readable JSON log tailing | `pkg/logs/tail/tail.go:8` |
| Error handling | Stack traces printed via `go-errors/errors` package on fatal errors | `pkg/app/app.go:55-59` |
| Fake logger for tests | `FakeFieldLogger` implements logrus.FieldLogger for test assertions | `pkg/fakes/log.go:11-40` |

## Answers to Protocol Questions

1. **Is logging structured?**
   Yes — logs are JSON-formatted via `logrus.JSONFormatter` (`pkg/logs/logs.go:52`). Every log entry is machine-parseable with fields. The comment at line 50 suggests piping to `humanlog` for human-readable output.

2. **Are debug modes supported?**
   Yes — toggled via `--debug` flag (maps to `DEBUG` env var) (`pkg/config/app_config.go:24`). When enabled, logs write to `LAZYGIT_LOG_PATH` (or `development.log` in state dir) at `LOG_LEVEL`-controlled verbosity (`pkg/logs/logs.go:37-46`). When disabled, logs are discarded (io.Discard) at Error level (`pkg/logs/logs.go:31-34`).

3. **Are logs separated from user output?**
   Partial — lazygit is a TUI application (gocui-based) so user output is rendered on screen, not stdout/stderr. Logs are written to a file when debug mode is enabled. The logging package intentionally has no external dependencies to avoid circular imports (`pkg/logs/logs.go:11-13`). There is no mechanism for real-time log streaming via stderr. The `--logs` flag triggers a separate tail process (`pkg/logs/tail/tail.go:13`), not a built-in streaming handler.

4. **What observability hooks exist?**
   No evidence of tracing (OpenTelemetry, trace), metrics (Prometheus, statsd), or telemetry integration. The codebase has no references to `tracing`, `otel`, `metrics`, or similar packages outside the vendor directory. Observability is limited to file-based debug logging with JSON output. Operators can debug via log file inspection and the `humanlog`-compatible output format.

## Architectural Decisions

- **Circular dependency avoidance**: The `logs` package intentionally depends on nothing else (`pkg/logs/logs.go:11-13`), allowing it to be imported from anywhere including initialization code.
- **Debug-gated logging**: Debug logging is opt-in via flag/env, not a persistent background feature. Production builds discard all log output.
- **Logger passed via struct injection**: The `Common` struct holds a `*logrus.Entry` (`pkg/common/common.go:14`) which gets passed through the app rather than using a global. However `logs.Global` exists for truly global use cases (initialized lazily from `LAZYGIT_LOG_PATH` env var at `pkg/logs/logs.go:24-27`).
- **Two-tier log lifecycle**: Production logger is always a no-op discarding output; development logger is created only when env vars are set, meaning logs are not available by default even in dev builds without explicit env configuration.

## Notable Patterns

- Logger initialized early in `NewCommon` via `newLogger(config)` (`pkg/app/app.go:66`), before GUI or other subsystems.
- Error-level panics formatted with stack traces via `go-errors/errors` (`pkg/app/app.go:55-59`), written to both the log file and stderr via `log.Fatalf`.
- Structured fields added via `log.WithFields(logrus.Fields{})` (`pkg/logs/logs.go:54`), returning an `*logrus.Entry` used as the logger.
- Fake logger for tests (`pkg/fakes/log.go:14-40`) tracks `Error` and `Errorf` calls for assertion in test suites.
- Log tail utility (`pkg/logs/tail/tail.go:13-27`) opens a separate process to tail and colorize the log file, suggesting the app doesn't embed a log viewer.

## Tradeoffs

- **No telemetry vs. lightweight**: Skips OpenTelemetry/tracing entirely, keeping the binary lean for a TUI app where operators run interactively, but loses deep observability in automated contexts.
- **File-based vs. stream-based**: Logs go to a file (good for post-mortem) but there's no real-time stderr streaming in non-debug mode. Operators can't easily pipe debug output to external observability tools.
- **Global logger opt-in**: `logs.Global` only available when `LAZYGIT_LOG_PATH` is set — avoids globals by default but requires explicit env configuration for global-style access.
- **JSON-only format**: Machine-friendly but not human-friendly without `humanlog`. The comment at `pkg/logs/logs.go:50` explicitly recommends piping through `humanlog`.

## Failure Modes / Edge Cases

- If `LAZYGIT_LOG_PATH` is set but the directory is not writable, `os.OpenFile` fails and calls `log.Fatalf` (`pkg/logs/logs.go:42-43`), which prints to stderr — but the app crashes before any UI appears.
- If `LOG_LEVEL` is set to an invalid value, `logrus.ParseLevel` returns an error but it is ignored and DebugLevel is used as fallback (`pkg/logs/logs.go:60-62`).
- When debug mode is off (production), `logs.NewProductionLogger()` sets output to `io.Discard` — all log calls become no-ops with zero overhead, but operators cannot enable logging post-hoc without restarting the app with `--debug`.
- The `Global` logger is initialized in `init()` (`pkg/logs/logs.go:23-28`) before the app is fully configured, so early boot errors (before `Common.Log` is set) may not have a logger available.

## Future Considerations

- Add OpenTelemetry tracing for git operations and key UI events to enable distributed tracing in CI/automation contexts.
- Consider structured field conventions so that log analysis tools can consistently parse things like operation names, timings, and repo context.
- Real-time log streaming via stderr when `--debug` is set would allow operators to pipe output to external observability tools without requiring a file write.

## Questions / Gaps

- No evidence of structured field conventions across the codebase — are there naming standards for fields across log calls?
- No evidence of log sampling or rate limiting for high-frequency operations (e.g., key press events in the TUI).
- No evidence of log rotation or size limits on the development log file — does `development.log` grow unbounded?
- Is there any mechanism for operators to correlate log entries with specific UI state without embedding context in every log call?

---

Generated by `study-areas/10-logging-observability.md` against `lazygit`.