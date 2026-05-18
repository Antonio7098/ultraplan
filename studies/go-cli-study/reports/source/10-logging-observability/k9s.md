# Repo Analysis: k9s

## Logging & Observability

### Repo Info

| Field | Value |
|-------|-------|
| Name | k9s |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/k9s` |
| Group | `10-logging-observability` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

k9s uses Go's standard `log/slog` library with structured logging via a custom `slogs` package. Log output is directed to a configurable log file with colorized console output via `tint`. Debug modes are fully supported through log levels. The project integrates Kubernetes metrics for observability but lacks OpenTelemetry SDK integration despite having the dependencies available.

## Rating

**8/10** — Structured logs and debug support. Excellent log level configuration. Some observability hooks via metrics, but no tracing/telemetry SDK integration.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Logging library | Uses `log/slog` with `tint` colorized handler | `cmd/root.go:103` |
| Structured keys | Custom `slogs` package with 50+ structured keys | `internal/slogs/keys.go:6-231` |
| Log levels | `parseLevel()` converts string to `slog.Level` (debug/warn/error/info) | `cmd/root.go:171-182` |
| Log level flag | `--logLevel` / `-l` flag configurable | `cmd/root.go:192-197` |
| Debug logs | 363+ `slog.Debug` calls across codebase | throughout |
| Log file output | Logs written to file via `--logFile` flag | `cmd/root.go:80-86` |
| User output | Uses `colorable.NewColorableStdout()` for TUI output | `cmd/root.go:48` |
| K8s klog quiet | klog initialized but silenced via `-v=-10`, `logtostderr=false` | `main.go:16-41` |
| Metrics integration | `HasMetrics()` on connection for pod/node metrics | `internal/view/pulse.go:137,313` |
| Log defaults | Default log level is `info` | `internal/config/logging.go` (implied) |

## Answers to Protocol Questions

### 1. Is logging structured?

**Yes.** k9s uses `log/slog` with structured key-value pairs via a custom `slogs` package containing 50+ predefined constant keys (`internal/slogs/keys.go:6-231`). Examples:
- `slog.Debug("Factory started", slogs.Namespace, ns)` (`internal/watch/factory.go:51`)
- `slog.Error("No informer found", slogs.GVR, gvr, slogs.Namespace, ns)` (`internal/watch/factory.go:251`)
- `slog.Info("🐶 K9s starting up...", slogs.Version, version)` (`cmd/root.go:131`)

### 2. Are debug modes supported?

**Yes.** Full debug support via `--logLevel debug` flag (`cmd/root.go:192-197`). The `parseLevel()` function maps "debug" to `slog.LevelDebug` (`cmd/root.go:171-182`). Debug logs are extensively used (363+ matches) for development and diagnostics.

### 3. Are logs separated from user output?

**Partially.** Logs are written to a dedicated log file (`--logFile` flag) while user-facing TUI output uses `colorable.NewColorableStdout()`. However, since k9s is a terminal UI application, the separation is less critical than in batch CLIs. The `klog` library (used by k8s client) is explicitly silenced (`--v=-10`, `logtostderr=false`) to avoid polluting output.

### 4. What observability hooks exist?

- **Metrics**: `k8s.io/metrics` integration for pod/node metrics via `HasMetrics()` and `PodWithMetrics` types (`internal/render/pod.go:296-312`)
- **No OpenTelemetry SDK**: While `opentelemetry.io/otel/exporters/stdout/*` appear in `go.sum` as indirect dependencies, no actual SDK integration was found in the source code
- **Plugin-based tracing**: External tools like `trace-dns.yaml` and `crossplane-trace.yaml` provide tracing capabilities but are external tool integrations, not internal observability

## Architectural Decisions

1. **Standard library slog**: Choosing Go's standard `log/slog` over third-party libraries (zap, logrus) for minimal dependencies and stdlib integration.

2. **tint for colored output**: Uses `github.com/lmittmann/tint@v1.1.3` to colorize log output when writing to the log file (`cmd/root.go:103`), providing human-readable timestamps in RFC3339 format.

3. **Custom slogs package**: Maintains a dedicated package of 50+ structured logging keys (`internal/slogs/keys.go`) to ensure consistent field naming across the codebase.

4. **Dual logging for k8s client**: The k8s client-go uses `klog/v2` which is initialized in `main.go:16` but explicitly configured to write nowhere (`logtostderr=false`, `stderrthreshold=fatal`, `v=-10`).

## Notable Patterns

- **Structured child loggers**: `slogs.CLog(subsys string)` creates subsystem-specific loggers with pre-attached `subsys` key (`internal/slogs/child.go:9-11`)
- **Deferred debug logging**: Many debug logs use `defer slog.Debug("...")` pattern for exit diagnostics (`internal/view/exec.go:188`, `internal/ui/flash.go:58`)
- **Panic recovery with stack trace**: Global panic handler logs stack trace via `slog.Error("Boom!! k9s init failed", slogs.Error, err)` and `slog.Error("", slogs.Stack, string(debug.Stack()))` (`cmd/root.go:94-100`)

## Tradeoffs

- **No tracing SDK**: While OpenTelemetry dependencies exist in `go.sum`, no SDK integration was implemented, limiting distributed tracing capabilities
- **File-based logs only**: No syslog, journald, or cloud logging integrations; logs are only accessible via local file
- **TUI-centric design**: As a terminal UI application, the concept of "stdout for user, stderr for logs" doesn't fully apply; the TUI IS the output

## Failure Modes / Edge Cases

- **klog initialization failure**: If `klog.InitFlags(nil)` or flag setting fails in `main.go:16-41`, the application panics
- **Log file permission errors**: If log file cannot be opened, `run()` returns an error (`cmd/root.go:85-86`)
- **Log file rotation**: No built-in log rotation; log files can grow unbounded
- **TUI rendering failures**: If terminal does not support required capabilities, log output continues but user experience degrades

## Future Considerations

- Add OpenTelemetry SDK integration for distributed tracing
- Implement log rotation for unbounded log file growth
- Consider structured log export formats (JSON) for production deployments
- Add metrics export via OpenTelemetry metrics protocol

## Questions / Gaps

- **No evidence of log sampling or rate limiting**: Debug-heavy applications may generate large log volumes
- **No structured error codes**: Errors logged with `slogs.Error` but no specific error code taxonomy
- **No log aggregation integration**: No direct integration with Loki, ELK, or cloud logging services

---

Generated by `study-areas/10-logging-observability.md` against `k9s`.