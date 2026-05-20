# Source Analysis: openfga

## Observability & Operational Visibility

### Source Info

| Field | Value |
|-------|-------|
| Name | openfga |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/openfga` |
| Language / Stack | Go (gRPC/HTTP server) |
| Analyzed | 2026-05-20 |

## Summary

OpenFGA implements a comprehensive observability stack with OpenTelemetry tracing, Prometheus metrics, structured Zap logging, and gRPC health checks. The system uses the standard OpenTelemetry SDK with OTLP exporters, propagates trace context through all async paths, and exposes a standard gRPC health service. However, logging does not use structured context propagation (context fields are dropped on non-error logs), and there is no explicit async boundary handling for queues/workflows since OpenFGA is not a workflow engine.

## Rating

**7/10** — Good implementation with minor issues. Tracing and metrics are well-instrumented, but context propagation in logging is incomplete (only `ErrorWithContext` extracts grpc-ctxtags), and there is no built-in distributed tracing correlation across async boundaries because OpenFGA processes requests synchronously without background queues.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Logging framework | Zap-based `ZapLogger` with configurable format (text/json), level, timestamp | `pkg/logger/logger.go:40-212` |
| Structured logging | Zap `Field` types used throughout; `zap.String`, `zap.Int32`, `zap.Error` etc. | `pkg/logger/logger.go:14-31` |
| Log format config | `LogConfig.Format` supports 'text' or 'json' | `pkg/server/config/config.go:237-246` |
| Log level config | Levels: 'none', 'debug', 'info', 'warn', 'error', 'panic', 'fatal' | `pkg/server/config/config.go:576-586` |
| Trace instrumentation | OpenTelemetry with OTLP exporter, `otel.Tracer` initialized per package | `internal/telemetry/tracing.go:93-152` |
| Tracer providers | `MustNewTracerProvider` builds OTLP gRPC exporter with sampling | `internal/telemetry/tracing.go:93-152` |
| Span propagation | `otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(...))` | `internal/telemetry/tracing.go:147` |
| Trace context in middleware | `trace.SpanContextFromContext(ctx)` extracted and added to log fields | `pkg/middleware/logging/logging.go:144-147` |
| Request ID generation | UUID generated if no trace ID; trace ID used when available | `pkg/middleware/requestid/requestid.go:27-34` |
| Request ID header | `X-Request-Id` header set in gRPC metadata | `pkg/middleware/requestid/requestid.go:21,54` |
| grpc-ctxtags usage | Tags stored for `request_id`, `store_id`, `authorization_model_id`, dispatch/query counts | `pkg/middleware/requestid/requestid.go:52`, `pkg/server/server.go:1094` |
| Context tags extraction | `ctxzap.TagsToFields(ctx)` used only in `ErrorWithContext` | `pkg/logger/logger.go:92` |
| Prometheus metrics | `prometheus/client_golang` with `promauto` for auto-registration | `pkg/server/server.go:14-163` |
| Request duration histogram | `requestDurationHistogram` labeled by grpc_service, method, datastore_query_count, dispatch_count, consistency | `pkg/server/server.go:97-107` |
| Check result counter | `checkResultCounter` labeled by `allowed` (true/false) | `pkg/server/server.go:124-128` |
| Datastore metrics | Per-datastore metrics registered (Postgres, MySQL, SQLite) with db stats collectors | `pkg/storage/postgres/postgres.go:246-314` |
| Iterator cache metrics | `v2IterCacheTotal`, `v2IterCacheHits`, `v2IterCacheAbandoned`, `v2IterCacheSize` | `pkg/storage/storagewrappers/iterator_cache.go:43-61` |
| Cache metrics | `cacheItemCount`, `cacheItemRemovedCount` for generic cache | `pkg/storage/cache.go:29-35` |
| Shared iterator metrics | `sharedIteratorQueryHistogram`, `sharedIteratorBypassed`, `sharedIteratorCount`, `sharedIteratorCloneCount` | `pkg/storage/storagewrappers/sharediterator/shared_iterator_datastore.go:26-48` |
| Metrics endpoint config | Metrics addr `0.0.0.0:2112` enabled by default | `pkg/server/config/config.go:909-913` |
| Health check | gRPC `grpc_health_v1` service with `IsReady` checking datastore readiness | `pkg/server/health/health.go:31-43` |
| HTTP health endpoint | `/healthz` HTTP endpoint checked in tests | `pkg/testutils/testutils.go:248` |
| Trace config | `TraceConfig.Enabled`, OTLP endpoint, sample ratio, service name | `pkg/server/config/config.go:248-254` |
| Default trace sample rate | 0.2 (20%) sampling | `pkg/server/config/config.go:897` |
| Trace otelgrpc handler | `otelgrpc.NewServerHandler()` added as gRPC stats handler | `cmd/run/run.go:625` |
| Tracing in storage | `tracer.Start` spans in sqlite, cached_datastore, bounded_datastore, cached_reader | `pkg/storage/sqlite/sqlite.go:35-36`, `pkg/storage/storagewrappers/cached_datastore.go:156-233` |
| Tracing in typesystem | `tracer.Start(ctx, "typesystem.NewAndValidate")` | `pkg/typesystem/typesystem.go:1128` |
| Bounded tuple reader | `concurrentReadDelayMsHistogram`, `throttledReadDelayMsHistogram` | `pkg/storage/storagewrappers/bounded_datastore.go:52-62` |
| Dispatch throttling metrics | `throttledRequestCounter` labeled by service, method, throttling_type | `pkg/server/server.go:117-121` |
| Request ID = Trace ID | When tracing enabled, request ID equals trace ID | `pkg/middleware/requestid/requestid.go:27-34` |

## Answers to Dimension Questions

### 1. Can an operator reconstruct a single request's full path through the system?

**Yes, with OpenTelemetry tracing enabled.** When tracing is enabled (`trace.enabled=true`), the `request_id` is set to the `trace_id` (`pkg/middleware/requestid/requestid.go:27-34`), and spans are created throughout the call chain including storage layer (`pkg/storage/sqlite/sqlite.go:35-36`), typesystem resolution (`pkg/typesystem/typesystem.go:1128`), and server handlers (`pkg/server/server.go:58`). The `otelgrpc.NewServerHandler()` is registered as a gRPC stats handler (`cmd/run/run.go:625`), ensuring span context is propagated.

However, **without tracing enabled**, request IDs are still generated as UUIDs (`pkg/middleware/requestid/requestid.go:32`), but there is no automatic span creation for the full request path. Logs include `request_id` in their fields (`pkg/middleware/logging/logging.go:146`), but only when tracing is active.

### 2. How are structured logs routed, stored, and queried in production?

**Routing:** Logs are written to `stdout` by default, configurable via `log.format` ('text' or 'json') and `log.outputPaths` (`pkg/logger/logger.go:155`, `pkg/server/config/config.go:237-246`). The production config defaults to 'text' format, but 'json' is recommended for production (`pkg/server/config/config.go:236`).

**Format:** JSON format includes `build.version` and `build.commit` fields (`pkg/logger/logger.go:195-197`). Zap's JSON encoder is used with `EpochTimeEncoder` by default for json format (with ISO8601 override option).

**Storage/Querying:** OpenFGA itself does not provide a log storage backend. The `telemetry/otel-collector-config.yaml` shows OTLP exporter configured for Jaeger (traces), and a separate Prometheus exporter for metrics. The OpenTelemetry Collector configuration only handles traces and metrics, not logs. The logging is output to stdout, relying on external log aggregation (e.g., Fluentd, Logstash, cloud logging).

### 3. What metrics indicate system health vs performance degradation?

**Health indicators:**
- `grpc_health_v1` health check returns `SERVING` when datastore `IsReady` succeeds (`pkg/server/health/health.go:31-43`)
- `datastore_is_ready` status in Postgres (`pkg/storage/postgres/postgres.go:1353`)

**Performance degradation indicators:**
- `request_duration_ms` histogram — high latency buckets indicate slow queries
- `datastore_query_count` — unusually high query counts suggest performance issues
- `dispatch_count` — high dispatch counts in Check resolution indicate complex models
- `throttled_requests_count` — indicates request throttling is active (`pkg/server/server.go:117-121`)
- `tuples_cache_hit_counter` / `tuples_cache_total_counter` — cache miss rate
- `v2IterCacheAbandoned` — indicates iterator cache abandonment
- `concurrentReadDelayMsHistogram` / `throttledReadDelayMsHistogram` — datastore throttling delay

### 4. How does observability cross async boundaries (queues, workflows)?

**Not applicable in the traditional sense.** OpenFGA is a synchronous request-response engine — it does not use message queues or background workflows. Requests are processed in-memory with goroutines for concurrent operations, but there are no async boundaries like dedicated worker queues.

However, OpenFGA does propagate context through:
- **Goroutine contexts:** `storagewrappers.ContextWrapper` can propagate context to datastore (`pkg/server/server.go:988-992`)
- **Concurrent dispatch resolution:** The graph resolver runs concurrent checks, all sharing the parent span context
- **Context propagation to datastore:** Configurable via `ContextPropagationToDatastore` (`pkg/server/server.go:633-642`)

The `WithContextPropagationToDatastore` option when enabled passes the request context to datastore queries, allowing cancellation signals and trace context to flow into database operations (`pkg/server/server.go:988-992`).

### 5. What debugging tooling exists for production issues?

- **Trace exploration:** OTLP exporter to Jaeger (configured in `telemetry/otel-collector-config.yaml`)
- **Metrics dashboards:** Grafana provisioning in `telemetry/grafana/` with Prometheus metrics
- **Request tracing:** `X-Request-Id` HTTP header returned on every response (`pkg/middleware/requestid/requestid.go:21`)
- **gRPC health endpoint:** Standard `grpc.health.v1.Health` service for liveness/readiness checks
- **HTTP healthz:** `/healthz` endpoint for HTTP health checks (`pkg/testutils/testutils.go:248`)
- **pprof profiler:** Built-in profiling server on `:3001` (`pkg/server/config/config.go:906-908`)
- **Datastore metrics:** Per-datastore metrics including connection pool stats
- **Error logging:** Internal errors are logged with full context via `ErrorWithContext` which extracts grpc-ctxtags (`pkg/logger/logger.go:92`)

## Architectural Decisions

1. **Zap over stdlib logging:** OpenFGA uses `go.uber.org/zap` for structured logging with performance-optimized encoding. The `ZapLogger` wraps zap.Logger and adds context-aware methods.

2. **OpenTelemetry SDK for tracing:** Tracing is implemented via the full OpenTelemetry SDK (`go.opentelemetry.io/otel/*`) with an OTLP gRPC exporter, rather than a lighterweight solution. This indicates a commitment to standards-based observability.

3. **Prometheus for metrics:** Metrics use the `prometheus/client_golang` library directly with `promauto` for automatic registration. No custom metrics framework.

4. **Request ID = Trace ID when tracing enabled:** The `InitRequestID` function returns the trace ID when available, ensuring request logs and traces can be correlated (`pkg/middleware/requestid/requestid.go:27-34`).

5. **Context propagation to datastore is opt-in:** `ContextPropagationToDatastore` defaults to `false` to avoid "unnecessary database connection churn" (`pkg/server/server.go:633-642`). This means trace context may not flow into datastore queries by default.

6. **Logs don't include context fields except on errors:** `ErrorWithContext` is the only logger method that extracts grpc-ctxtags and includes them in log output (`pkg/logger/logger.go:79-102`). Info/debug logs omit request context.

7. **No built-in log aggregation:** OpenFGA outputs logs to stdout and does not include a built-in solution for log aggregation, shipping, or storage. This is delegated to infrastructure-level solutions (Docker, Kubernetes, cloud logging).

## Notable Patterns

1. **Tracer per package:** Each package creates its own tracer via `otel.Tracer("openfga/pkg/...")` (e.g., `pkg/server/server.go:58`, `pkg/storage/sqlite/sqlite.go:33`), allowing fine-grained trace filtering.

2. **Span attributes for metadata:** Spans include semantic attributes like `cached`, `cache_key`, `authorization_model_id`, etc., making it easy to filter traces by these values.

3. **Native histogram buckets:** Server metrics use Prometheus native histograms (`NativeHistogramBucketFactor: 1.1`) for efficient percentile calculation with custom bucket counts.

4. **Middleware chain ordering:** gRPC interceptors are carefully ordered: recovery → ctxtags → requestid → storeid → logging → validation → auth → tracing (`cmd/run/run.go:563-584`).

5. **Metrics as first-class config:** Metrics configuration includes `Enabled`, `Addr` (default `0.0.0.0:2112`), and `EnableRPCHistograms` options.

## Tradeoffs

1. **Tracing is opt-in and sampled (20%):** Default configuration has `trace.enabled=false` with `sampleRatio=0.2`. Production deployments must explicitly enable tracing.

2. **Log context incomplete:** Only error logs include grpc-ctxtags context fields. Info-level request completion logs may not include request_id in non-error paths (though it is included via `ctxzap.TagsToFields`).

3. **No default TLS for OTLP exporter:** Tracing exports to `0.0.0.0:4317` with insecure TLS by default (`pkg/server/config/config.go:891-895`).

4. **Context propagation disabled by default:** Datastore queries don't receive request context by default, meaning cancellation doesn't propagate and trace context may be lost in storage layer.

5. **No built-in log storage/aggregation:** stdout-only logging requires external infrastructure for log persistence and querying.

6. **Single metrics endpoint without authentication:** The `/metrics` endpoint (`0.0.0.0:2112`) has no authentication by default.

## Failure Modes / Edge Cases

1. **OTLP exporter panic on connection failure:** `MustNewTracerProvider` panics if it cannot establish a connection with the OTLP exporter (`internal/telemetry/tracing.go:138`). This is a startup failure, not graceful degradation.

2. **No span context in logs without tracing:** Without tracing enabled, `spanCtx.HasTraceID()` returns false and trace_id is not added to log fields (`pkg/middleware/logging/logging.go:145`).

3. **Health check bypasses auth:** `AuthFuncOverride` returns `ctx, nil` unconditionally for health check methods (`pkg/server/health/health.go:27-29`), but this is standard gRPC health protocol.

4. **Prometheus default gatherer conflict:** Multiple metrics registrations for the same metric name could cause panic if `prometheus.Register()` is called twice for the same collector. Uses `promauto` for auto-namespace to avoid some conflicts.

5. **High cardinality metrics potential:** The `requestDurationHistogram` includes `datastore_query_count` and `dispatch_count` as label values with bucketed ranges, but unbounded counts could lead to high cardinality if not properly bucketized.

6. **JSON log format warning:** The config explicitly warns that 'json' format is recommended for production (`pkg/server/config/config.go:236`), but defaults to 'text'.

## Future Considerations

1. **OpenTelemetry Logs:** Currently logs are pure Zap JSON/text to stdout. A future enhancement could route logs through the OpenTelemetry SDK for correlation with traces.

2. **Context propagation to datastore enabled by default:** Given the observability value of trace context in datastore queries, this could be enabled by default with proper connection pool management.

3. **Metrics authentication:** Adding authentication to the `/metrics` endpoint for production security.

4. **Structured error logging for all levels:** Extending `ErrorWithContext` pattern to `InfoWithContext` and `WarnWithContext` to include request context in all log levels.

5. **Alerting rules:** The repository includes Grafana dashboards and Prometheus config but no explicit alerting rules. Future work could add Prometheus alerting rules for SLOs.

## Questions / Gaps

1. **No evidence of log retention/aggregation:** No configuration or code for log shipping to external services (ELK, cloud logging). The assertion is based on code inspection of logger and telemetry configuration.

2. **No evidence of distributed tracing across OpenFGA instances:** OpenFGA instances do not communicate with each other — each instance is independent. Distributed tracing would only matter if OpenFGA had a cluster coordination mechanism, which it does not.

3. **No evidence of tracing propagation in HTTP gateway:** The HTTP-to-gRPC gateway (if used) would need to extract trace context from HTTP headers and inject into gRPC metadata. This was not found in the codebase, suggesting the gateway may not propagate trace context.

4. **No evidence of explicit error categorization in metrics:** Metrics track `allowed=true/false` for check results, but don't distinguish between "system error" and "authorization denied" in a way that would alert on internal failures.

5. **No evidence of SLO/SLA instrumentation:** Beyond latency histograms and error counters, there is no explicit SLO configuration (e.g., request success rate thresholds, availability targets).

---

Generated by `dimensions/09-observability-operational-visibility.md` against `openfga`.