# Source Analysis: grafana

## Observability & Operational Visibility

### Source Info

| Field | Value |
|-------|-------|
| Name | grafana |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/grafana` |
| Language / Stack | Go (backend), TypeScript/React (frontend) |
| Analyzed | 2026-05-20 |

## Summary

Grafana implements a comprehensive observability infrastructure with structured logging via go-kit, full OpenTelemetry tracing with Jaeger and OTLP exporters, Prometheus-based metrics with native histogram support and trace ID exemplars, and multi-layer health checks. The implementation shows strong cross-cutting concerns with correlation IDs propagated through logs, metrics, and HTTP headers. The system supports per-logger filtering, multiple output formats (console/text/JSON), and provides both liveness and readiness probes.

## Rating

**8/10** — Excellent implementation with minor gaps. The observability stack is well-integrated with OpenTelemetry for tracing, Prometheus for metrics, and go-kit for logging. Correlation ID propagation works through logs, metrics exemplars, and HTTP headers. Gaps include: no evident distributed tracing across async boundaries (queues/workflows), and limited visibility into frontend observability.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Logging Framework | Uses `go-kit/log` with `level` package for filtering; `logManager` manages multiple loggers with per-logger filtering | `pkg/infra/log/log.go:70` |
| Log Levels | trace, debug, info, warn, error, critical | `pkg/infra/log/log.go:313-320` |
| Log Formats | console (TTY), text, JSON via `getLogFormat()` | `pkg/infra/log/log.go:384` |
| Contextual Logging | `RegisterContextualLogProvider()` extracts context attributes; `WithContextualAttributes()` adds contextual attributes | `pkg/infra/log/log.go:297`, `pkg/infra/log/log.go:305` |
| Request Logging Middleware | HTTP request logging with method, path, status, duration, size | `pkg/middleware/loggermw/logger.go:1-60` |
| Tracing Service | `TracingService` implementing OpenTelemetry with Jaeger and OTLP exporters | `pkg/infra/tracing/tracing.go:52-60` |
| Propagators | W3C tracecontext and Jaeger propagation formats | `pkg/infra/tracing/tracing.go:284-291` |
| HTTP Request Tracing | Extracts parent span, creates server span, injects server-timing header | `pkg/middleware/request_tracing.go:102-120` |
| Trace ID Extraction | `TraceIDFromContext()` extracts trace ID from OpenTelemetry span context | `pkg/infra/tracing/tracing.go:396` |
| HTTP Client Tracing | Middleware for outgoing HTTP requests with trace context injection | `pkg/infra/httpclient/httpclientprovider/tracing_middleware.go:28-37` |
| Plugin Tracing | Middleware for `QueryData`, `CallResource`, `CheckHealth` plugin operations | `pkg/services/pluginsintegration/clientmiddleware/tracing_middleware.go:1-50` |
| gRPC Tracing | `TracingStreamInterceptor()` for streaming gRPC calls | `pkg/services/grpcserver/interceptors/tracing.go:1-30` |
| Metrics Namespace | `grafana` as Prometheus namespace | `pkg/infra/metrics/metrics.go:14` |
| Request Metrics | `grafana_http_request_duration_seconds` histogram with labels: handler, status_code, method, status_source, slo_group | `pkg/middleware/request_metrics.go:43-48` |
| In-Flight Gauge | `grafana_http_request_in_flight` gauge for concurrent requests | `pkg/middleware/request_metrics.go:29-35` |
| Native Histogram Support | 1.1 bucket factor, max 160 buckets, 1-hour min reset | `pkg/middleware/request_metrics.go:62-68` |
| Trace ID Exemplars | Uses `ObserveWithExemplar()` to link metrics to traces via traceID | `pkg/middleware/request_metrics.go:131-144` |
| Plugin Metrics | `grafana_plugin_request_total` counter with plugin_id, endpoint, status labels | `pkg/services/pluginsintegration/clientmiddleware/metrics_middleware.go:1-40` |
| Health Endpoints | `/livez` (always 200), `/readyz` (503 when not ready) | `pkg/server/health.go:38-56` |
| gRPC Health Service | `HealthService` implementing `grpc_health_v1.HealthServer` | `pkg/services/grpcserver/health.go:1-60` |
| Database Health Check | `databaseHealthy()` runs `SELECT 1` query with 5-second cache | `pkg/api/health.go:10` |
| API Server Trace Logging | `WithTracingHTTPLoggingAttributes()` adds traceID and spanID to HTTP logs | `pkg/apiserver/endpoints/filters/tracing_log.go:14-50` |
| Configuration | `[log.console]`, `[log.file]`, `[log.syslog]`, `[tracing.jaeger]`, `[tracing.opentelemetry]` sections | `conf/defaults.ini:1205-1262` |

## Answers to Dimension Questions

### 1. Can an operator reconstruct a single request's full path through the system?

**Yes, with OpenTelemetry tracing.** The `RequestTracing` middleware (`pkg/middleware/request_tracing.go:94-144`) extracts parent span context from incoming request headers (line 103), creates a server span with HTTP method and URL attributes (lines 108-111), and injects `server-timing` header with traceparent for client-side correlation (lines 117-120). The span name is updated after routing to `HTTP {method} {route}` (lines 132-134).

Trace IDs are propagated to logs via `RegisterContextualLogProvider` (`pkg/infra/tracing/tracing.go:88-94`) which extracts traceID from context when available. Metrics are linked via exemplars (`pkg/middleware/request_metrics.go:131-144`) using `ObserveWithExemplar()` with traceID labels.

### 2. How are structured logs routed, stored, and queried in production?

**Structured logs via go-kit with multiple output formats.** The logging system (`pkg/infra/log/log.go`) supports console (TTY output via `term.NewTerminalLogger()`), text (via `text.NewTextLogger()`), and JSON (via `gokitlog.NewJSONLogger()`) formats.

Configuration is read via `ReadLoggingConfig()` (line 440) from `[log.console]`, `[log.file]`, `[log.syslog]` sections (`conf/defaults.ini:1205-1262`). File rotation is supported with daily or max_lines/max_size_shift rotation.

Per-logger filtering is available via `filters` option with format `logger:level`. The `logManager` (line 70) manages multiple named loggers with per-logger level filtering via `logWithFilters` structure.

**No evidence found** for log routing to external services (e.g., Loki, Elasticsearch) in the core codebase; this would typically be handled via stdout/stderr redirection in production deployments.

### 3. What metrics indicate system health vs performance degradation?

**Health indicators:**
- `grafana_http_request_in_flight` gauge (concurrent requests being served) at `pkg/middleware/request_metrics.go:29-35`
- `/readyz` endpoint (`pkg/server/health.go:47-56`) returns 503 when not ready
- Database health via `databaseHealthy()` (`pkg/api/health.go:10`) running `SELECT 1`

**Performance degradation indicators:**
- `grafana_http_request_duration_seconds` histogram (`pkg/middleware/request_metrics.go:43-48`) with labels for handler, status_code, method, slo_group
- `grafana_http_response_size_bytes` histogram (`pkg/middleware/request_metrics.go:50-55`)
- Native histogram support with 1.1 bucket factor for better granularity (`pkg/middleware/request_metrics.go:62-68`)
- Plugin metrics: `grafana_plugin_request_duration_milliseconds` and `grafana_plugin_request_connection_unavailable_total` (`pkg/services/pluginsintegration/clientmiddleware/metrics_middleware.go:1-40`)

**Alerting state metrics:** `MAlertingResultState` counter (`pkg/infra/metrics/metrics.go:69`) for alert execution results.

### 4. How does observability cross async boundaries (queues, workflows)?

**Limited evidence found for async observability.** The tracing infrastructure supports W3C tracecontext and Jaeger propagation formats (`pkg/infra/tracing/tracing.go:284-291`) which can propagate through message queues if headers are preserved.

Plugin operations (QueryData, CallResource, CheckHealth) have tracing middleware (`pkg/services/pluginsintegration/clientmiddleware/tracing_middleware.go`) that creates spans with attributes: plugin_id, org_id, datasource_name, user, panel_id, query_group_id, dashboard_uid.

**No evidence found** for:
- Direct instrumentation of background job systems (queues, workers)
- Correlation ID propagation through async workflow boundaries
- OpenTelemetry SDK integration for background tasks

### 5. What debugging tooling exists for production issues?

**Comprehensive debugging tooling:**
- `server-timing` header injected with traceparent (`pkg/middleware/request_tracing.go:117-120`) for client-side correlation
- pprof endpoints bundled under `/debug/pprof-handlers` (`pkg/middleware/request_tracing.go:57-58`)
- `WithTracingHTTPLoggingAttributes()` (`pkg/apiserver/endpoints/filters/tracing_log.go:14-50`) adds traceID and spanID to HTTP request logs
- Fallback trace context extraction from `Grafana-Upstream-Traceparent` header (`pkg/apiserver/endpoints/filters/tracing_log.go:47`)
- `ServerTimingForSpan()` (`pkg/infra/tracing/tracing.go:405`) generates W3C traceparent header value
- Prometheus metrics endpoint at `/metrics` with extensive labels for debugging

## Architectural Decisions

1. **go-kit for logging**: Chose go-kit's structured logging over standard library `log/slog` for richer contextual attribute support and per-logger filtering capabilities.

2. **OpenTelemetry for tracing**: Unified tracing implementation supporting Jaeger and OTLP exporters with W3C tracecontext and Jaeger propagation formats. Samplers include const, probabilistic, rateLimiting, and remote (via jaegerremote).

3. **Prometheus for metrics**: Uses Prometheus client_golang with native histogram support for better granularity. Exemplars link metrics to traces via traceID.

4. **Contextual log providers**: Allows extracting context (e.g., traceID) at log time rather than at log creation time, enabling loose coupling between tracing and logging systems.

5. **Middleware-based instrumentation**: HTTP request/response metrics and tracing implemented as middleware, enabling consistent cross-cutting behavior without modifying individual handlers.

## Notable Patterns

- **Middleware chaining**: Request tracing and metrics use standard HTTP middleware pattern with `web.Middleware` interface for composition
- **Contextual attribute providers**: `RegisterContextualLogProvider` pattern allows multiple providers to contribute attributes to log entries
- **Exemplar-based correlation**: Links Prometheus metrics to distributed traces via `ObserveWithExemplar` with traceID labels
- **Service health aggregation**: `HealthNotifier` with atomic.Bool for thread-safe readiness signaling
- **Per-service tracing**: gRPC server interceptor creates spans for streaming calls with full method name

## Tradeoffs

1. **JSON vs console logging**: JSON structured logs are better for machine consumption but less human-readable in development; Grafana supports format switching based on TTY detection.

2. **Native histogram cardinality**: Native histograms with high bucket counts increase cardinality; the 1-hour min reset duration and 160 max bucket limit mitigate this.

3. **Trace context propagation**: W3C tracecontext is the default propagator; however, legacy Jaeger propagation is still supported for backward compatibility.

4. **Tracing overhead**: Every HTTP request creates a span; the `ShouldTraceWithExceptions()` function excludes low-value paths like `/public/`, `/robots.txt` to reduce overhead.

## Failure Modes / Edge Cases

1. **No-op tracer initialization**: If tracing configuration fails, `NewNoopTracerService()` (`pkg/infra/tracing/tracing.go:108-116`) provides a fallback that doesn't crash the application.

2. **Missing trace ID**: When traceID is not available in context, metrics fall back to `Observe()` without exemplar (`pkg/middleware/request_metrics.go:142-143`).

3. **Health check cache**: Database health check caches result for 5 seconds (`pkg/api/health.go:10`) which could mask brief connectivity issues.

4. **Handler registration race**: The health notifier uses atomic operations but could briefly show not-ready if checked before initialization completes.

5. **Metric registration conflicts**: `MustRegister` (`pkg/middleware/request_metrics.go:88`) will panic on duplicate metric registration, requiring careful singleton pattern implementation.

## Future Considerations

1. **Frontend observability**: No evidence of OpenTelemetry integration in the TypeScript/React frontend; adding browser tracing would complete the request path visibility.

2. **Async job observability**: Background jobs, queued tasks, and workflow state transitions lack trace context propagation; integrating with Temporal or similar would provide visibility.

3. **Log aggregation integration**: Native support for Loki or other log aggregation systems would improve log routing beyond file/stdout.

4. **SLO monitoring**: The `slo_group` label in metrics suggests SLO tracking is planned but not fully implemented in observed code.

## Questions / Gaps

1. **How are background job spans correlated with parent requests?** — No evidence of job queue instrumentation with trace context propagation found.

2. **What's the strategy for log retention and storage?** — No evidence of built-in log aggregation; external integration required.

3. **How does tracing handle plugin sandbox isolation?** — Plugin tracing middleware creates spans but correlation across plugin boundaries not fully evidenced.

4. **Is there sampling strategy documentation?** — Samplers (const, probabilistic, rateLimiting, remote) are configured but sampling rate policies not analyzed.

---

*Generated by `dimensions/09-observability-operational-visibility.md` against `grafana`.*