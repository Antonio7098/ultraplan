# Source Analysis: temporal

## Observability & Operational Visibility

### Source Info

| Field | Value |
|-------|-------|
| Name | temporal |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/temporal` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

Temporal implements a comprehensive observability infrastructure built on OpenTelemetry (OTel) for tracing and metrics, uber-go/zap for structured logging, and gRPC interceptors for request lifecycle management. The system provides correlation ID propagation via gRPC metadata, multi-exporter metrics (Prometheus, StatsD, Tally fallback), and layered health checks across frontend, history, and worker services. The architecture demonstrates strong operational visibility with structured JSON logging, distributed tracing spans through sync and async boundaries, and rich per-service metric definitions.

## Rating

**8/10** — Excellent implementation with minor issues. The observability stack is well-instrumented with OpenTelemetry, supports multiple metric exporters, and includes comprehensive health checks. However, trace context propagation across async boundaries (queues, workflows) is less explicitly documented, and the debug-mode payload annotation could have operational overhead implications.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Zap Logger Config | `DefaultZapEncoderConfig` with ISO8601 timestamps, lowercase levels, seconds duration encoding | `common/log/zap_logger.go:31-44` |
| Structured Logging | Tag-based field injection via `zapLogger.buildFieldsWithCallAt`, tags prepended via `log.With()` | `common/log/zap_logger.go:105-121`, `common/log/with_logger.go` |
| Log Tag System | `tag.String()`, `tag.Int64()`, `tag.Bool()`, `tag.Duration()` typed tags | `common/log/tag/tags.go`, `common/log/tag/zap_tag.go` |
| slog Compatibility | `slogLogger` wrapper wrapping zap for `log/slog` compatibility | `common/log/slog.go:46-68` |
| gRPC Tracing | `otelgrpc.NewServerHandler` and `otelgrpc.NewClientHandler` wrapping gRPC stats handlers | `common/telemetry/grpc.go:52-55`, `common/telemetry/grpc.go:71-74` |
| TracerProvider Setup | OTel TracerProvider with resource attributes (service name, version, instance ID) | `temporal/fx.go:1007-1055` |
| Span Exporters | Configurable exporters from config, env vars, or custom code; lifecycle-managed | `temporal/fx.go:931-973` |
| Trace Propagator | W3C `propagation.TraceContext{}` as default propagator | `temporal/fx.go:1057` |
| Debug Mode Tracing | Request/response payload, headers, deadline annotation on spans when debug enabled | `common/telemetry/grpc.go:94-158` |
| OTel Metrics Handler | Adapter around `metric.Meter` implementing `Handler` interface | `common/metrics/otel_metrics_handler.go:48-75` |
| Prometheus Exporter | `prometheus/client_golang` with `/metrics` endpoint; custom histogram boundaries | `common/metrics/opentelemetry_provider.go:56-84`, `common/metrics/opentelemetry_provider.go:124-160` |
| StatsD Exporter | `go-statsd-client` with DogStatsD/InfluxDB tag protocol support | `common/metrics/statsd_exporter.go:30-110` |
| Tally Fallback | `uber-go/tally/v4` as fallback metrics handler | `common/metrics/tally_metrics_handler.go:29-105` |
| Metric Definitions | 1545-line `metric_defs.go` with per-service scopes: Frontend, History, Matching, Worker | `common/metrics/metric_defs.go:1-1545` |
| Header Propagation | `Propagate()` copies headers from incoming to outgoing gRPC context | `common/headers/headers.go:62-78` |
| Propagated Headers | Client name/version, caller info, principal identity, supported features | `common/headers/headers.go:32-42` |
| Health Interceptor | `HealthInterceptor` rejects requests when service is unhealthy | `common/rpc/interceptor/health.go:13-47` |
| Health Check Aggregator | Moving window average latency/error ratio signals; excludes long-polling | `common/rpc/interceptor/health_check.go:32-226` |
| Deep Health Check | gRPC health, RPC latency/error, persistence latency/error checks | `service/history/deep_health_check.go:31-110` |
| Frontend Health | Membership-based host failure percentage and declined serving proportion | `service/frontend/health_check.go:62-168` |
| Slow Request Logger | Warning logs for requests exceeding threshold | `common/rpc/interceptor/slow_request_logger.go:33-66` |
| Nexus HTTP Trace | `httptrace.ClientTrace` for HTTP lifecycle hooks with debug config | `common/nexus/trace.go:70-180` |
| Network Dial Tracer | TCP connection establishment tracing with `connectDuration`, `connectAddr` | `common/rpc/dial_tracer.go:1-91` |
| Queue Task Spans | `trace.SpanKindConsumer` spans for queue executables with payload attributes | `service/history/queues/executable.go:260-282` |

## Answers to Dimension Questions

### 1. Can an operator reconstruct a single request's full path through the system?

**Yes.** The gRPC tracing interceptor (`common/telemetry/grpc.go:88-159`) creates spans for every request using `otelgrpc.NewServerHandler`. Spans include workflow ID and run ID as attributes (`common/telemetry/grpc.go:171-183`). Header propagation (`common/headers/headers.go:62-78`) ensures client name/version, caller info, and principal identity flow from frontend to backend services. The default `propagation.TraceContext{}` propagator (`temporal/fx.go:1057`) uses W3C traceparent/tracestate headers. Queue executable spans (`service/history/queues/executable.go:260-282`) mark `SpanKindConsumer` for async task processing.

### 2. How are structured logs routed, stored, and queried in production?

**Primarily to stdout/stderr or file.** The zap logger (`common/log/zap_logger.go:236-266`) routes to `stdout`, `stderr`, or a configured output file. Default encoder produces JSON (`common/log/zap_logger.go:250`). The `BuildZapLogger` function (`common/log/zap_logger.go:93-95`) accepts a `Config` struct with `Level`, `Format` (console/json), `OutputFile`, and `Stdout` options. The system does not include built-in log aggregation; external tooling (Fluentd, Loki, ELK) would be required for centralized querying.

### 3. What metrics indicate system health vs performance degradation?

**Health:** `HealthCheckInterceptor` (`common/rpc/interceptor/health_check.go`) tracks latency and error ratios via moving window averages. `DeepHealthCheck` (`service/history/deep_health_check.go:31-110`) monitors gRPC health, RPC latency, persistence latency/error. `FrontendHealthChecker` (`service/frontend/health_check.go`) calculates host failure percentage and declined serving proportion.

**Performance:** `metric_defs.go` defines per-service metrics: Frontend, History, Matching, Worker scopes with `operation`, `namespace`, `task_type`, `error_type` tags. Memory/GC metrics (`common/metrics/metric_defs.go:1525-1544`) track resource usage. No explicit performance degradation alerting rules were found in the codebase—these would be defined at the deployment/alerting layer.

### 4. How does observability cross async boundaries (queues, workflows)?

**Queue executables create spans.** `service/history/queues/executable.go:260-282` creates `SpanKindConsumer` spans for queue tasks. The `TraceExportModule` (`temporal/fx.go:930-974`) manages span exporters with lifecycle hooks. Header propagation (`common/headers/headers.go:62-78`) flows client/caller info through gRPC contexts but no explicit trace context continuation across queue/task boundaries was found. Workflow state transitions are logged via the tag system (`tag.WorkflowIDKey`, `tag.WorkflowRunIDKey`) and attached to spans via `annotateTags()` (`common/telemetry/grpc.go:161-184`).

### 5. What debugging tooling exists for production issues?

- **Debug-mode span annotation** (`common/telemetry/grpc.go:94-158`): When `DebugMode()` is enabled, spans include request/response payloads, gRPC headers, and deadlines.
- **Slow request logger** (`common/rpc/interceptor/slow_request_logger.go`): Logs warnings for requests exceeding configurable thresholds.
- **Request error handler** (`common/rpc/interceptor/request_error_handler.go`): Categorizes and tags errors appropriately.
- **Test logging environment variables** (`common/log/zap_logger.go:22-28`): `TEMPORAL_TEST_LOG_FORMAT`, `TEMPORAL_TEST_LOG_LEVEL`, `TEMPORAL_TEST_LOG_FILE` for local debugging.
- **Nexus HTTP trace** (`common/nexus/trace.go`): HTTP client lifecycle tracing with `httptrace.ClientTrace`.
- **dial_tracer** (`common/rpc/dial_tracer.go`): TCP connection timing traces.

No built-in live debugging shell or interactive profiler was found.

## Architectural Decisions

1. **OTel-first for tracing and metrics**: The system uses OpenTelemetry as the primary observability backbone, with OTel `TracerProvider` and `metric.Meter` as the core abstractions. This allows vendor-neutral trace/metric collection with pluggable exporters.

2. **Multi-exporter metrics support**: Prometheus (for `/metrics` scraping), StatsD (DogStatsD/InfluxDB protocols), and Tally (fallback) are all supported via `opentelemetry_provider.go`. This provides deployment flexibility.

3. **Tag-based structured logging**: Instead of unstructured string interpolation, Temporal uses a typed `tag.Tag` system that is prepended to every log entry. This enforces consistency and enables programmatic log analysis.

4. **gRPC interceptor-based instrumentation**: All tracing hooks are implemented as gRPC stats handlers (`otelgrpc.NewServerHandler`, `otelgrpc.NewClientHandler`) rather than middleware wrappers, keeping instrumentation at the transport layer.

5. **Configurable span exporters**: Exporters can be configured via config file, environment variables, or custom code injection, supporting development, testing, and production scenarios (`temporal/fx.go:939-960`).

6. **Lazy gauge workaround**: OTel synchronous gauges are not directly supported, so a `sync.Map` callback workaround stores gauge values for async observation (`common/metrics/otel_metrics_handler.go:23-46`).

## Notable Patterns

- **Service tracing module separation**: `TraceExportModule` (process-global exporters) vs `ServiceTracingModule` (per-service TracerProvider and propagators) allows clean separation of concerns in the fx dependency graph (`temporal/fx.go:925-1061`).
- **Level-check before logging**: All `zapLogger` methods (`Debug`, `Info`, `Warn`, etc.) check `l.zl.Core().Enabled(zap.XxxLevel)` before building fields, avoiding allocation overhead for filtered logs (`common/log/zap_logger.go:130-184`).
- **Moving window health aggregation**: `healthSignalAggregatorImpl` uses a moving window to track RPC error ratios, excluding long-polling and system APIs (`common/rpc/interceptor/health_check.go:65-110`).
- **Header stripping for security**: `StripPrincipal()` removes principal headers from incoming metadata to prevent spoofing (`common/headers/headers.go:127-135`).

## Tradeoffs

1. **No built-in log aggregation**: Logs route to stdout/file only; centralized logging requires external tooling. This is a common tradeoff for self-hosted infrastructure.

2. **Debug mode overhead**: Spans annotated with full request/response payloads (`common/telemetry/grpc.go:130-157`) can generate significant trace volume and storage costs in production if left enabled.

3. **Baggage propagation not implemented**: Comment at `temporal/fx.go:1056` notes "Haven't had use for baggage propagation yet" — cross-cutting concerns like tenant ID or request origin must be passed explicitly via headers.

4. **Gauge callback pattern complexity**: The OTel gauge limitation (`common/metrics/otel_metrics_handler.go:27-31`) requires a `sync.Map` and callback pattern that adds complexity to the metrics handler.

5. **Tracing on shutdown may drop spans**: `temporal/fx.go:1046-1051` silently ignores `context.DeadlineExceeded` on shutdown, potentially dropping in-flight spans when the collector is slow or unreachable.

## Failure Modes / Edge Cases

1. **Span exporter failure during startup**: The `OnStart` hook (`temporal/fx.go:964-969`) returns errors from `startAll()` if any exporter fails to start, preventing the service from starting if an exporter is misconfigured.

2. **Silent span dropping on shutdown**: Shutdown timeouts (`temporal/fx.go:1083-1092`) silently drop spans if the deadline is exceeded — acceptable for Temporal's "it's okay to drop traces on shutdown" philosophy but potentially problematic for compliance scenarios.

3. **Gauge value staleness**: The gauge adapter (`common/metrics/otel_metrics_handler.go:137-144`) stores values in a map and observes them on callback. If the gauge is never read, stale values may persist indefinitely.

4. **Health check exclusion edge cases**: Long-polling and system APIs are excluded from health signal aggregation via proto options (`common/rpc/interceptor/health_check.go:65-110`). If new APIs are added without proper options, they could skew health calculations.

5. **Header propagation only on match**: `Propagate()` only copies headers if they exist in incoming context and *don't* exist in outgoing context (`common/headers/headers.go:66`). This prevents override but could mask upstream bugs where headers should have been set.

6. **Debug trace annotation without payload validation**: The `annotateTags()` function (`common/telemetry/grpc.go:161-184`) extracts workflow tags from any payload without verifying the type implements `proto.Message` in debug mode, potentially causing panics for non-proto payloads.

## Future Considerations

1. **Baggage propagation**: Once cross-cutting concerns like multi-tenancy or request origin tracing are needed, implementing OTel baggage propagation would eliminate the need to pass such values through all workflow/activity signatures.

2. **Structured log querying integration**: Integrating with OpenTelemetry Collector + Loki or similar would provide the query capabilities currently missing from the self-hosted log routing model.

3. **Live debugging tooling**: Adding a mechanism for on-demand span inspection or workflow state dumps (without full trace replay) would improve 3am debugging ergonomics.

4. **Alerting rules in code**: Defining alerting thresholds as code (e.g., SLO definitions) rather than external configuration would make the alerting contract explicit and version-controlled.

## Questions / Gaps

1. **No evidence found** for metrics-based auto-scaling rules or SLO budget tracking — these would be external to the codebase but are critical for operational visibility.

2. **No evidence found** for trace sampling strategies — while exporters are configurable, the sampling rate (e.g., head-based vs tail-based sampling) is not addressed in the instrumented code.

3. **No evidence found** for histogram cardinality management — histograms with high-cardinality labels (e.g., per-namespace operation counts) could cause metric cardinality explosions.

4. **No evidence found** for log retention policies or rotation — the file output configuration (`common/log/zap_logger.go:243-249`) does not include log rotation settings.

5. **No evidence found** for cross-cluster trace correlation — if Temporal runs as a multi-cluster deployment, trace context propagation between clusters is not addressed in this codebase.

---

Generated by `dimensions/09-observability-operational-visibility.md` against `temporal`.