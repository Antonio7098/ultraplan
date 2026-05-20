# Source Analysis: nats-server

## Observability & Operational Visibility

### Source Info

| Field | Value |
|-------|-------|
| Name | nats-server |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/nats-server` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

nats-server provides a NATS-native observability stack centered on message tracing, structured logging, and HTTP-based monitoring endpoints. The infrastructure is self-contained without external dependencies like OpenTelemetry or Prometheus. Message tracing uses NATS-specific headers (`Nats-Trace-Dest`, `Nats-Trace-Hop`, `traceparent`) to track messages across hops. Logging supports file rotation, syslog, and remote syslog. Metrics are exposed via JSON endpoints (`/varz`, `/connz`, `/subsz`) and the standard library `expvar` package. Health checks at `/healthz` validate JetStream and server readiness. No correlation ID framework exists beyond NATS-specific trace headers.

## Rating

**6/10** — Basic implementation with notable gaps. Core observability primitives exist (logging, health checks, message tracing, metrics endpoints) but lack modern standards like OpenTelemetry, Prometheus exposition, and unified correlation IDs across the NATS ecosystem.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Logging Framework | Custom `Logger` interface in `server/log.go:26-46` | `server/log.go:26` |
| Std Logger | `NewStdLogger()` with time, debug, trace, colors, pid options | `logger/log.go:74-95` |
| File Logger | `NewFileLogger()` with rotation support | `logger/log.go:97-124` |
| Syslog Logger | `NewSysLogger()` for Unix, `NewRemoteSysLogger()` for network | `logger/syslog.go:53-80` |
| Log Labels | `[INF]`, `[DBG]`, `[WRN]`, `[ERR]`, `[FTL]`, `[TRC]` formats | `logger/log.go:354-371` |
| Log Options | `Trace`, `Debug`, `TraceVerbose`, `TraceHeaders` flags | `server/opts.go:404-409` |
| Message Tracing | NATS-native message tracing with hop tracking | `server/msgtrace.go:27-40` |
| Trace Headers | `Nats-Trace-Dest`, `Nats-Trace-Hop`, `traceparent` (W3C) | `server/msgtrace.go:27-40` |
| Trace Event Types | Ingress, SubjectMapping, StreamExport, ServiceImport, JetStream, Egress | `server/msgtrace.go:50-61` |
| Monitoring Endpoint Paths | `/varz`, `/connz`, `/routez`, `/gatewayz`, `/leafz`, `/subsz`, `/accountz`, `/jsz`, `/healthz`, `/raftz` | `server/server.go:3010-3023` |
| Varz Metrics Struct | Server statistics including connections, msgs, bytes, memory, CPU | `server/monitor.go:1223-1301` |
| JetStream Metrics | `JetStreamVarz` containing config, stats, meta, limits | `server/monitor.go:1303-1309` |
| Health Check Handler | `HandleHealthz()` at `/healthz` | `server/monitor.go:3520-3576` |
| Health Check Logic | `healthz()` function validating connections and JetStream state | `server/monitor.go:3579-3719` |
| System Events | `$SYS.ACCOUNT.%s.CONNECT`, `$SYS.ACCOUNT.%s.DISCONNECT`, `$SYS.SERVER.%s.STATSZ` | `server/events.go:49-72` |
| Remote Latency Tracking | `remoteLatencyEventSubj = "$SYS.LATENCY.M2.%s"` | `server/events.go:72` |
| Rate Counter | `rateCounter` struct for internal rate limiting metrics | `server/rate_counter.go:21-56` |
| HTTP req stats | `HTTPReqStats` map tracking per-endpoint request counts | `server/monitor.go:1286` |
| Trace context support | `traceparent` (W3C) header case-insensitivity handling | `server/msgtrace.go:34-39` |
| Uber Trace ID | `trcUber = textproto.CanonicalMIMEHeaderKey("Uber-Trace-Id")` | `server/accounts.go:2240` |

## Answers to Dimension Questions

### 1. Can an operator reconstruct a single request's full path through the system?

**Partial.** Message tracing (`server/msgtrace.go`) allows tracking a message's path through the NATS system using `Nats-Trace-Dest` and `Nats-Trace-Hop` headers. The `MsgTraceEvent` structure captures ingress, subject mapping, stream export, service import, JetStream processing, and egress events. However, this is limited to message-level tracing within NATS and does not provide end-to-end request correlation across external services. No OpenTelemetry span propagation exists.

### 2. How are structured logs routed, stored, and queried in production?

**Basic routing only.** Logs can be directed to stderr (default), file with rotation (`logger/log.go:97-124`), local syslog (`logger/syslog.go:53-65`), or remote syslog (`logger/syslog.go:67-80`). Configuration options include `Trace`, `Debug`, `TraceVerbose` (`server/opts.go:404-409`), logtime and UTC timestamps. There is no structured logging format (JSON), no centralized log aggregation, and no built-in query capability. Production log analysis requires external tools parsing plain text logs.

### 3. What metrics indicate system health vs performance degradation?

**Health:** `/healthz` endpoint (`server/monitor.go:3520`) returns status for connections readiness (`readyForConnections`), JetStream state (`isEnabled()`, stream/consumer validation). Status codes: 200 OK, 503 Service Unavailable, 400 Bad Request.

**Performance:** Varz (`server/monitor.go:1223-1301`) exposes:
- `Connections`, `TotalConnections` — connection counts
- `InMsgs`, `OutMsgs`, `InBytes`, `OutBytes` — throughput
- `SlowConsumers` — consumer backlog issues
- `StaleConnections` — client health
- `Subscriptions` — subscription count
- `Mem`, `CPU`, `Cores`, `MaxProcs`, `MemLimit` — resource usage

No Prometheus client library; metrics require polling JSON endpoints or `expvar` at `/debug/vars`.

### 4. How does observability cross async boundaries (queues, workflows)?

**Limited.** The `$SYS.LATENCY.M2.%s` subject (`server/events.go:72`) enables remote latency tracking. Message tracing spans async boundaries within JetStream via `MsgTraceJetStream` events (`server/msgtrace.go`). System events like `$SYS.ACCOUNT.%s.CONNECT` and `$SYS.ACCOUNT.%s.DISCONNECT` propagate connection state. However, no native correlation ID framework exists to link a request across multiple services or async workflows. External systems must implement their own correlation when integrating with NATS.

### 5. What debugging tooling exists for production issues?

**Minimal.** Debugging tools include:
- Log levels (trace, debug) via configuration
- `/healthz` for server and JetStream health
- `/varz`, `/connz`, `/subsz` for runtime state
- Message tracing for hop-by-hop message tracking
- No built-in profiler, flame graphs, or tracing UI
- No interactive debugging console

## Architectural Decisions

1. **Custom logging over stdlib**: NATS implements its own `Logger` interface (`server/log.go:26-46`) with colored/plain formatting, rotation, and syslog support rather than relying on a standard logging library.

2. **NATS-native tracing over OpenTelemetry**: Message tracing uses proprietary headers (`Nats-Trace-Dest`, `Nats-Trace-Hop`) rather than W3C Trace Context or OpenTelemetry, limiting cross-platform interoperability.

3. **JSON monitoring endpoints over Prometheus**: Server statistics are exposed as JSON (`Varz` struct at `server/monitor.go:1223`) rather than Prometheus exposition format, requiring custom scrapers.

4. **expvar for runtime variables**: Standard library `expvar` package is used (`server/monitor.go:24`) for `/debug/vars` endpoint in addition to custom JSON endpoints.

5. **W3C traceparent header support added in 2.14**: `server/msgtrace.go:34-39` shows `traceparent` header is recognized but not actively propagated.

## Notable Patterns

- **Atomic log level toggling**: `server/reload.go:121-173` shows trace/debug levels can be hot-reloaded without restart.
- **Health check with detail levels**: `server/monitor.go:3545-3559` supports `?details` query param for granular error reporting.
- **Rate counters for internal metrics**: `server/rate_counter.go:21-56` provides non-blocking rate limiting.
- **System account events**: Internal `$SYS.*` subjects (`server/events.go:41-97`) distribute connect/disconnect/stats events across the cluster.

## Tradeoffs

1. **No OpenTelemetry**: While W3C traceparent header is recognized, nats-server does not generate or propagate spans, limiting integration with distributed tracing systems.

2. **No Prometheus metrics**: Requires custom monitoring solutions to scrape JSON endpoints; no nativePrometheus exposition format.

3. **Text-based logging**: Plain text logs with level prefixes lack structure for automated parsing; no JSON logging option.

4. **Limited correlation**: No built-in request ID or correlation ID framework; operators must implement their own.

5. **No built-in log aggregation**: File and syslog outputs require external tooling for centralized log management.

## Failure Modes / Edge Cases

- Message tracing silently degrades when remote servers do not support it (`server/msgtrace.go:293-298`).
- Health checks may return false positives if JetStream is enabled but not fully initialized (`server/monitor.go:3660-3675`).
- Syslog on Windows requires event log fallback (`server/log.go:62-66`).
- Remote syslog connection failures are non-blocking but logged to stderr only.

## Future Considerations

1. **OpenTelemetry integration**: Adding OTLP exporter and span propagation would significantly improve distributed tracing interoperability.
2. **Prometheus metrics endpoint**: Converting Varz to Prometheus format would enable standard alerting and dashboards.
3. **Structured JSON logging**: Adding JSON log format would improve automated log parsing and analysis.
4. **Correlation ID framework**: Native correlation ID support across services would improve end-to-end request tracing.
5. **Distributed tracing UI**: A built-in or optional trace visualization would aid debugging.

## Questions / Gaps

- No evidence of histogram/timing distribution metrics for latency tracking (only counters and gauges).
- No evidence of sampling strategies for trace data under high load.
- No evidence of alerting rules or threshold-based notifications.
- No evidence of log archival or retention policies.
- No evidence of tracingContext propagation through JetStream streams beyond single-message tracking.