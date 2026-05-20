# Source Analysis: victoriametrics

## Observability & Operational Visibility

### Source Info

| Field | Value |
|-------|-------|
| Name | victoriametrics |
| Path | `sources/victoriametrics` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

VictoriaMetrics provides a well-structured observability stack built around a custom structured logging framework, Prometheus-compatible metrics exposition, and an internal query tracing mechanism. The implementation is cohesive across the codebase, with logging and metrics initialization in the main entry points. Distributed tracing via OpenTelemetry is present in vendor dependencies but is not directly integrated into the application's request handling path.

## Rating

**7/10** — Good implementation with minor issues. Structured logging with JSON support and rate limiting is solid. Metrics are comprehensively exposed via the `/metrics` endpoint with self-scraping capability. Query tracing exists for internal debugging. However, OpenTelemetry trace propagation is not actively used in the application code, correlation IDs are not propagated across async boundaries, and request tracing does not flow through the system in a way that enables full request reconstruction.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Logging framework | Custom logger in `lib/logger/logger.go` with level control (`INFO`, `WARN`, `ERROR`, `FATAL`, `PANIC`) | `lib/logger/logger.go:21-32` |
| Structured logging | JSON format support via `-loggerFormat=json` with configurable field names via `-loggerJSONFields` | `lib/logger/logger.go:22`, `lib/logger/json_fields.go:9-46` |
| Log output routing | Configurable output via `-loggerOutput=stderr|stdout` | `lib/logger/logger.go:23`, `lib/logger/logger.go:73-82` |
| Log rate limiting | Per-level rate limiting via `-loggerErrorsPerSecondLimit` and `-loggerWarnsPerSecondLimit` | `lib/logger/logger.go:30-31`, `lib/logger/logger.go:217-255` |
| Log message counting | Counter metric `vm_log_messages_total` exported per level/location | `lib/logger/logger.go:166-169` |
| Metrics exposition | `WritePrometheusMetrics()` writes Prometheus format to `/metrics` endpoint | `lib/appmetrics/appmetrics.go:30-47` |
| Metrics push | Push metrics to remote URL via `-pushmetrics.url` with interval and extra labels | `lib/pushmetrics/pushmetrics.go:16-24`, `lib/pushmetrics/pushmetrics.go:38-50` |
| Self-scraping | Self-scraper that ingests own `/metrics` into storage for internal monitoring | `app/victoria-metrics/self_scraper.go:42-123` |
| Health endpoints | `/health`, `/ping`, `/-/healthy`, `/-/ready` with proper status codes and graceful shutdown support | `lib/httpserver/httpserver.go:391-440` |
| Query tracing | Internal `querytracer.Tracer` for tracing query execution with tree-structured spans | `lib/querytracer/tracer.go:25-45` |
| Pprof support | pprof endpoints exposed at `/debug/pprof/` with auth key protection | `lib/httpserver/httpserver.go:447-454` |
| Request/response logging | HTTP error responses logged with remote addr and request URI | `lib/httpserver/httpserver.go:702-707` |
| Hostname header | `X-Server-Hostname` header added to responses | `lib/httpserver/httpserver.go:332` |
| OpenTelemetry | Vendored OTel SDK present but not actively used in application code | `vendor/go.opentelemetry.io/otel/trace/trace.go` (OTel in vendor only) |

## Answers to Dimension Questions

### 1. Can an operator reconstruct a single request's full path through the system?

**Partially.** VictoriaMetrics does not implement distributed tracing with correlation IDs that flow through the request lifecycle. HTTP errors are logged with remote address and request URI (`lib/httpserver/httpserver.go:702-707`), which helps in diagnosing individual requests. The `querytracer` (`lib/querytracer/tracer.go`) enables query-level tracing internally, but this is opt-in and not propagated to clients. There is no mechanism to tag a request with a correlation ID that persists across components (vminsert, vmselect, vmstorage).

### 2. How are structured logs routed, stored, and queried in production?

**Routing only to stderr/stdout.** The `-loggerOutput` flag supports `stderr` or `stdout` (`lib/logger/logger.go:73-82`). There is no built-in log forwarding to external aggregation systems (e.g., Fluentd, Loki, Elasticsearch). Logs are emitted as text or JSON to stdout/stderr, intended to be collected by the container runtime or a sidecar. The `-loggerJSONFields` flag (`lib/logger/json_fields.go:9-11`) allows renaming fields for compatibility with log aggregation pipelines.

### 3. What metrics indicate system health vs performance degradation?

**Health:** `/health` returns `OK` when the server is ready (`lib/httpserver/httpserver.go:391-404`). The `/-/healthy` and `/-/ready` endpoints provide Prometheus-compatible health signals.

**Performance:** Key metrics include:
- `vm_http_request_duration_seconds` histogram at `/metrics` (`lib/httpserver/httpserver.go:292`)
- `vm_http_conn_timeout_closed_conns_total` for connection timeouts (`lib/httpserver/httpserver.go:293`)
- `vmagent_remotewrite_duration_seconds` histograms for remote write latency (`app/vmagent/remotewrite/client.go:201`)
- Per-component metrics for ingestion rate, query latency, storage performance exposed at `/metrics`
- Self-scraping metrics can be stored andAlerting can be configured via vmalert for anomaly detection

Dashboards in `dashboards/` (e.g., `victoriametrics.json`) provide visualization for these metrics.

### 4. How does observability cross async boundaries (queues, workflows)?

**Limited evidence.** The `querytracer` (`lib/querytracer/tracer.go`) supports tree-structured spans that can be passed across goroutines, which is the primary mechanism for internal async observability. However, there is no correlation ID propagation across component boundaries (e.g., between vmagent's scrape cycle and vminsert's write path). The push metrics system (`lib/pushmetrics/pushmetrics.go`) allows exporting metrics to remote systems, but this is metric-level only, not trace-level.

### 5. What debugging tooling exists for production issues?

- **pprof endpoints** at `/debug/pprof/` (cmdline, profile, symbol, trace, mutex) with optional auth key protection (`lib/httpserver/httpserver.go:447-454`, `lib/httpserver/httpserver.go:525-554`)
- **Query tracing** via `querytracer` with JSON/plaintext output, enabled via request headers (`lib/querytracer/tracer.go:16`)
- **Self-scraping** for internal metric monitoring (`app/victoria-metrics/self_scraper.go`)
- **Health/readiness endpoints** for liveness and readiness probes
- **Log throttling** to prevent log flooding during errors (`lib/logger/logger.go:229-255`)
- **Flag exposure** at `/flags` endpoint showing all command-line flags (`lib/httpserver/httpserver.go:424-430`)

## Architectural Decisions

1. **Custom logger over standard library** — VictoriaMetrics implements its own logger (`lib/logger/logger.go`) rather than using a third-party logging library. This provides tight control over output format (text vs JSON), log level filtering, rate limiting, and metric integration (`vm_log_messages_total`).

2. **Metrics as the primary observability signal** — The system treats Prometheus metrics as the primary observability primitive, not logs or traces. Logs are concise and primarily for error diagnosis. The `/metrics` endpoint is the main interface for operational monitoring.

3. **Self-scraping model** — VictoriaMetrics can scrape its own `/metrics` endpoint and ingest the results into its own storage (`app/victoria-metrics/self_scraper.go:42-123`), enabling internal metric history without external Prometheus.

4. **Query tracer is internal-only** — The `querytracer` package (`lib/querytracer/tracer.go`) provides internal query performance debugging but does not expose trace context to clients and is not integrated with OpenTelemetry.

5. **Push metrics for clustered deployments** — The `pushmetrics` package (`lib/pushmetrics/pushmetrics.go`) enables pushing metrics to remote destinations rather than requiring Prometheus to pull, useful in clustered or firewall-restricted environments.

## Notable Patterns

- **Log level filtering at call site** — The `shouldSkipLog()` function (`lib/logger/logger.go:339-367`) performs fast-path level checks before any string formatting or output, preventing log generation overhead for suppressed levels.
- **Location tracking with truncation** — `getLogLocation()` (`lib/logger/logger.go:172-183`) captures file:line and strips the `/VictoriaMetrics/` prefix for cleaner output.
- **Graceful shutdown signaling via health endpoint** — The `/health` endpoint returns non-OK during shutdown delay (`lib/httpserver/httpserver.go:393-404`), allowing load balancers to drain traffic before process exit.
- **Arg length protection** — `formatLogMessage()` (`lib/logger/logger.go:185-200`) limits string arguments to `loggerMaxArgLen` chars to prevent log flooding from large values.

## Tradeoffs

1. **No OpenTelemetry integration in application code** — While the vendor directory contains OpenTelemetry SDKs (used transitively by gRPC), VictoriaMetrics does not implement trace propagation or span creation for its own request handling. This limits cross-service tracing in clustered deployments.

2. **Logs to stdout/stderr only** — There is no built-in log forwarding to external aggregation systems. Operators must rely on container logging sidecars or log rotation. This works in containerized environments but requires extra tooling for centralized log aggregation.

3. **No correlation ID propagation** — Requests are not tagged with correlation IDs. Diagnosing a request that spans multiple components (e.g., a write from vmagent → vminsert → vmstorage) requires manual correlation via timestamps or other contextual data.

4. **Query tracer is opt-in and internal** — The `querytracer` is not automatically enabled and is intended for development/debugging rather than production diagnostics. It does not integrate with external tracing systems.

## Failure Modes / Edge Cases

- **Log throttling may hide root causes** — If ERROR messages are throttled via `-loggerErrorsPerSecondLimit`, critical errors may be suppressed, making diagnosis difficult during incidents.
- **JSON logger suppresses stack traces on panic** — When `loggerFormat=json`, the `PANIC` level calls `os.Exit(-1)` rather than panicking, suppressing the stack trace that would normally accompany a panic (`lib/logger/logger.go:324-329`).
- **Self-scraper double-counting** — If self-scraping is enabled with the same labels as the primary metrics, metric values may be double-counted in internal monitoring.
- **pprof with auth key only in default mode** — pprof endpoints are only protected by auth key when using the default `DisableBuiltinRoutes=false`. If `DisableBuiltinRoutes=true`, pprof is exposed without auth (`lib/httpserver/httpserver.go:148-149`).
- **Metrics endpoint caching** — `WritePrometheusMetrics()` caches metrics output for 1 second (`lib/appmetrics/appmetrics.go:36-42`). During rapid metric registration/deregistration, some metric state changes may not be immediately visible.

## Future Considerations

1. **OpenTelemetry trace integration** — Adding OTLP export for traces would enable correlation of requests across clustered VictoriaMetrics components. This would be a significant addition given the current architecture.
2. **Correlation ID propagation** — Implementing X-Request-ID header propagation through all components (vminsert, vmselect, vmstorage) would enable request-level tracing across the write and query path.
3. **Structured log forwarding** — Built-in support for forwarding JSON logs to Loki, Elasticsearch, or similar would reduce operational complexity in larger deployments.
4. **Exemplars in Prometheus metrics** — Linking trace IDs to metric exemplars would enable correlating metric spikes with specific traces in Grafana.
5. **Alerting on log rate limiting** — Currently there is no metric tracking how often rate limiting kicks in, which could be a leading indicator of systemic issues.

## Questions / Gaps

- **No evidence of trace ID propagation** through request handling — grep for `traceID`, `trace-id`, `correlation` across the application source (excluding vendor) returns only the `querytracer` and the OpenTelemetry Firehose connector, which is specific to AWS Firehose. No general correlation ID handling found.
- **No evidence of metrics for log throttling** — The rate limiter (`lib/logger/logger.go:217-255`) tracks suppressed counts but does not expose a metric for how many log messages were suppressed.
- **No evidence of distributed tracing in cluster mode** — The cluster version (`app/vmselect`, `app/vminsert`, `app/vmstorage`) does not appear to propagate trace context between components based on code inspection.
- **No evidence of OpenTelemetry SDK usage in application code** — The OTel packages are present in vendor (transitive dependency via gRPC stats handler), but there are no imports or usage of `go.opentelemetry.io/otel` in the application packages themselves.
- **Query tracer output format** — The query tracer outputs tree-structured spans in JSON (`lib/querytracer/tracer.go:219-229`), but there is no standard API endpoint exposing this — it appears to be intended for internal debugging.

---

Generated by `dimensions/09-observability-operational-visibility.md` against `victoriametrics`.