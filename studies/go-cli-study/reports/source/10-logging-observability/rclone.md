# Repo Analysis: rclone

## Logging & Observability

### Repo Info

| Field | Value |
|-------|-------|
| Name | rclone |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/rclone` |
| Group | `rclone` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

rclone implements a comprehensive structured logging system based on Go's `log/slog` package with extensive configuration options. It provides multiple output destinations (stderr, file with rotation, syslog, systemd, Windows Event Log), rich log format customization (text/JSON, timestamps, levels, caller info), a debug trace facility, and Prometheus metrics integration via the RC server.

## Rating

**8/10** — rclone provides excellent observability with structured logging, multiple output sinks, debug trace hooks, and Prometheus metrics. The main limitation is the absence of distributed tracing hooks, but this is reasonable for a CLI tool. Operators can debug issues efficiently through configurable log levels (-v/-vv/-q), file rotation, and structured JSON output.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Logging library | Uses Go standard `log/slog` as core, wrapped with custom `OutputHandler` | `fs/log/slog.go:21` |
| Logger initialization | `InitLogging()` sets up handlers, redirects default slog, configures output | `fs/log/log.go:210-299` |
| Log levels | 9 levels: EMERGENCY→ALERT→CRITICAL→ERROR→WARNING→NOTICE→INFO→DEBUG→OFF | `fs/log.go:34-42` |
| Extended slog levels | Custom levels: SlogLevelNotice(2), SlogLevelCritical(12), SlogLevelAlert(16), SlogLevelEmergency(20), SlogLevelOff(24) | `fs/log.go:69-78` |
| Level mapping | Maps rclone LogLevel to slog.Level for integration | `fs/log.go:82-91`, `fs/log.go:133-141` |
| Log level flag handling | `-v` → INFO, `-vv` → DEBUG; `-q` → ERROR; `--log-level` available | `fs/config/configflags/configflags.go:76-89` |
| Debug mode | `log.Trace()` function for function entry/exit debugging, controlled by LogLevelDebug | `fs/log/log.go:144-172` |
| Output separation | Logs go to stderr by default; file/syslog override available | `fs/log/slog.go:43` |
| Log file rotation | Uses `lumberjack.Logger` for rotation with max size, backups, age, compression | `fs/log/log.go:247-254` |
| Syslog support | Unix syslog with configurable facility mapping | `fs/log/syslog_unix.go:16-38`, `fs/log/syslog.go` |
| Systemd integration | Auto-detects journal stream, supports systemd journal logging | `fs/log/log.go:279-290`, `fs/log/systemd_unix.go` |
| Windows Event Log | Separate Windows event log with configurable level | `fs/log/event_log_windows.go`, `fs/log/log.go:66-76` |
| JSON logging | `--use-json-log` flag enables JSON output format | `fs/log/log.go:260-263` |
| Log format options | Bits-based format: date, time, microseconds, UTC, longfile, shortfile, pid, nolevel, json | `fs/log/log.go:102-112` |
| Structured fields | `LogValue()` and `LogValueHide()` helpers for key-value pairs in logs | `fs/log.go:94-131` |
| Prometheus metrics | RC server exposes `/metrics` endpoint with HTTP transport and transfer stats | `fs/rc/rcserver/metrics.go:9-28`, `fs/accounting/prometheus.go:6-108` |
| RC metrics configuration | `rc_enable_metrics` and `metrics_addr` options for Prometheus endpoint | `fs/rc/rc.go:72-118` |
| Stdout synchronization | `StdoutMutex` protects concurrent stdout writes for user output | `fs/operations/operations.go:775-788` |

## Answers to Protocol Questions

### 1. Is logging structured?

**Yes.** rclone uses Go's `log/slog` as the underlying engine, which produces structured key-value logs. The `OutputHandler` (`fs/log/slog.go:120-134`) implements `slog.Handler` and can output in both text (backwards-compatible format) and JSON (`fs/log/slog.go:324-340`). Structured fields are added via `fs.LogValue(key, value)` (`fs/log.go:105`) which augments log calls with key-value pairs that appear in JSON output. The handler supports adding attributes via `WithAttrs()` (`fs/log/slog.go:415-417`).

### 2. Are debug modes supported?

**Yes.** Debug modes are well-implemented:

- `-v` sets log level to INFO (`fs/config/configflags/configflags.go:80`)
- `-vv` sets log level to DEBUG (`fs/config/configflags/configflags.go:78`)
- `-q` suppresses normal output (sets ERROR level) (`fs/config/configflags/configflags.go:88`)
- `--log-level` flag for explicit level control (`fs/config/configflags/configflags.go:92-100`)
- `log.Trace()` function for function entry/exit logging with pointer dereferencing for exit parameters (`fs/log/log.go:150-172`)
- `log.Stack()` for stack trace logging (`fs/log/log.go:174-184`)
- Debug output is gated by `LogLevel >= LogLevelDebug` check (`fs/log/log.go:151`, `fs/log/log.go:176`)

### 3. Are logs separated from user output?

**Yes.** rclone maintains clear separation:

- Logs write to `os.Stderr` by default (`fs/log/slog.go:43`)
- User-facing output (transfer stats, sync progress) uses `SyncPrintf`/`SyncFprint` which write to `os.Stdout` with mutex protection (`fs/operations/operations.go:775-803`)
- When `--log-file` is set, stderr is redirected to the log file (and logs go there instead) (`fs/log/log.go:225-257`)
- `--syslog` redirects all logs to syslog, incompatible with `--log-file` (`fs/log/log.go:272-276`)
- Systemd journal integration auto-detected when output goes to journal (`fs/log/log.go:279-290`)
- Password prompt errors go to stderr (`fs/config/crypt.go:265`)

### 4. What observability hooks exist?

**Prometheus metrics integration:**

- HTTP transport metrics via `fs/fshttp/prometheus.go:12-35`
- Transfer accounting metrics via `fs/accounting/prometheus.go:14-108`
- RC server `/metrics` endpoint exposed when `rc_enable_metrics` is set (`fs/rc/rc.go:115`)
- `RcloneCollector` implements prometheus `Collector` interface (`fs/accounting/prometheus.go:78-108`)

**No distributed tracing found** — rclone does not integrate OpenTelemetry or similar tracing frameworks.

**No metric hooks for logging** — stats log level separate from main log level (`fs/config.go:710`).

## Architectural Decisions

1. **Slog-based core with custom handler**: rclone wraps Go's standard `log/slog` with a custom `OutputHandler` to maintain backwards-compatible text format while gaining structured JSON capability (`fs/log/slog.go:120-426`).

2. **Log level enum extends syslog**: rclone defines its own `LogLevel` enum that maps to both syslog levels and slog levels, with additional custom levels (Notice, Critical, Alert, Emergency) that fit into slog's scale (`fs/log.go:34-92`).

3. **Init-time handler setup**: `InitLogging()` is called explicitly at startup (not from package init) so that importing rclone as a library has no side effects on the process-wide default slog logger (`fs/log/log.go:206-209`).

4. **Multi-output handler pattern**: The `OutputHandler` supports multiple output destinations via `SetOutput`/`AddOutput`/`ResetOutput` for temporarily overriding or augmenting log destinations (`fs/log/slog.go:184-210`).

5. **Log reload on config change**: When config is reloaded (e.g., via RC), the log handler level is updated via callback registered in `logReload()` (`fs/log/log.go:186-202`).

6. **Format bitset for composition**: Log format options use a `logFormat` bitset allowing flexible composition of date/time/microseconds/UTC/longfile/shortfile/pid/nolevel/json (`fs/log/log.go:100-128`).

## Notable Patterns

- **Deferred trace pattern**: `defer log.Trace(o, "format", args...)("exit format", exitArgs...)` used extensively in VFS code for function entry/exit logging (e.g., `vfs/vfs.go:435`, `vfs/read_write.go:44`).

- **LogValue for structured fields**: `fs.LogValue("key", value)` helper used throughout to add structured context to logs (e.g., `fs/operations/operations.go:2625`).

- **Password prompt separate from logs**: Password prompts go directly to stderr, bypassing the logging system (`fs/config/crypt.go:265`).

- **JSON log as escape hatch**: When `--use-json-log` is set, it forces the JSON format bit, overriding text output (`fs/log/log.go:260-263`).

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| Slog as core | Modern standard library integration, but requires Go 1.21+; rclone's custom handler adds complexity but preserves backwards compatibility |
| Lumberjack for rotation | Reliable log rotation with compression, but adds `gopkg.in/natefinch/lumberjack.v2` dependency |
| Syslog/systemd/journal integration | Excellent for server deployments, but platform-specific code paths (syslog_unix.go, systemd_unix.go) increase maintenance |
| Windows Event Log | First-class Windows support, but code is Windows-only via build tags (`fs/log/event_log_windows.go:5`) |
| Prometheus metrics via RC | Metrics require RC server to be running; no standalone HTTP server for metrics |

## Failure Modes / Edge Cases

- **Incompatible flags**: `--syslog` and `--log-file` cannot be used together — `fs/log/log.go:273-275`
- **Windows log level constraint**: `--windows-event-log-level` must be >= `--log-level` — `fs/log/log.go:193-195`
- **Conflict between -v/-q and --log-level**: Cannot use -v/-q with explicit --log-level — `fs/config/configflags/configflags.go:94-99`
- **Stderr redirect on Windows**: Redirecting stderr to file fails on Windows if stdin is inherited from console — `fs/log/redirect_stderr_windows.go:38`
- **RC job fatal errors**: Fatal errors from RC jobs become panics caught by the job handler to prevent crashes — `fs/log.go:207-233`
- **Uninitialized logger**: If `InitLogging()` not called, default handler logs to stderr at INFO level — `fs/log/slog.go:36-48`

## Future Considerations

- **OpenTelemetry tracing**: Could add trace propagation for distributed debugging across backend operations
- **Structured error handling**: Could leverage `LogValue` more consistently across error paths
- **Metrics without RC**: Could expose Prometheus metrics endpoint independently of RC server

## Questions / Gaps

- **No distributed tracing**: No evidence of OpenTelemetry or similar tracing integration found in the codebase
- **Stats log level coupling**: `StatsLogLevel` is derived from `LogLevel` at startup (`fs/config.go:710`) — could be independently configurable for more granular control
- **JSON log performance**: JSON encoding is done on every log call — no mention of performance impact in production use
- **Log sampling**: No evidence of log sampling for high-volume operations (e.g., large sync batches)

---

Generated by `study-areas/10-logging-observability.md` against `rclone`.