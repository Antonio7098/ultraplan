# Observability & Operational Visibility - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Dimension | `09-observability-operational-visibility.md` |
| Sources | cli, grafana, kubernetes, milvus, nats-server, openfga, pocketbase, temporal, victoriametrics |
| Date | 2026-05-20 |

## Sources Studied

| # | Source | Path |
|---|--------|------|
| 1 | cli | `sources/cli` |
| 2 | grafana | `sources/grafana` |
| 3 | kubernetes | `sources/kubernetes` |
| 4 | milvus | `sources/milvus` |
| 5 | nats-server | `sources/nats-server` |
| 6 | openfga | `sources/openfga` |
| 7 | pocketbase | `sources/pocketbase` |
| 8 | temporal | `sources/temporal` |
| 9 | victoriametrics | `sources/victoriametrics` |

## Executive Summary

Observability infrastructure varies widely across the nine studied sources, ranging from comprehensive OpenTelemetry-based stacks (grafana, kubernetes, milvus, temporal, openfga) to minimal telemetry-first designs (cli) and custom structured approaches (nats-server, pocketbase, victoriametrics). The primary convergence is around OpenTelemetry as the emerging standard for distributed tracing, with W3C TraceContext as the dominant propagation format. Metrics collection via Prometheus is the second most common pattern. The primary divergence is in logging strategy — ranging from third-party structured loggers (zap, go-kit/log) to custom implementations. Health check infrastructure is universally present but varies in depth.

## Core Thesis

Observability infrastructure in production systems clusters into three distinct architectural models: **OTel-native systems** (grafana, kubernetes, milvus, temporal, openfga) that use OpenTelemetry SDK for tracing and Prometheus for metrics; **telemetry-first systems** (cli, pocketbase) that prioritize usage telemetry over system health monitoring; and **metrics-primary systems** (nats-server, victoriametrics) that treat Prometheus-format metrics as the primary observability signal with logging as secondary. The choice of model correlates strongly with operational context — long-running services invest in comprehensive tracing while CLI tools and embedded databases optimize for simplicity and self-containment.

## Rating Summary

| Source | Score | Approach | Main Strength | Main Concern |
|--------|-------|----------|---------------|--------------|
| grafana | 8/10 | OTel-native + Prometheus + go-kit/log | Comprehensive trace/metric correlation with exemplars | No async job observability |
| kubernetes | 8/10 | OTel + klog + Prometheus | Dual-span tracing enabling migration path | No external correlation ID header |
| milvus | 8/10 | OTel + Zap + Prometheus | Trace context propagation via message properties | Tracing disabled by default |
| temporal | 8/10 | OTel-first + zap + multi-exporter metrics | Full gRPC tracing with queue executable spans | No baggage propagation |
| openfga | 7/10 | OTel + Zap + Prometheus | Request ID = trace ID when enabled | Context propagation to datastore opt-in |
| victoriametrics | 7/10 | Custom logger + Prometheus | Self-scraping model and log rate limiting | No OTel in application code |
| nats-server | 6/10 | Custom logging + NATS-native msg tracing | Message-level hop tracking | No Prometheus, no correlation IDs |
| pocketbase | 5/10 | Go slog + SQLite storage | BatchHandler with BeforeAddFunc | No tracing, no metrics, no correlation |
| cli | 4/10 | Telemetry-first (ghtelemetry) + OpenTracing (codespaces only) | Event recording with sampling | No structured logging, no distributed tracing |

## Approach Models

### 1. OTel-Native Services (grafana, kubernetes, milvus, temporal, openfga)

All five systems implement OpenTelemetry tracing with OTLP or Jaeger exporters. Common characteristics:
- `otel.Tracer` initialized per package with namespaced tracer names (`openfga/pkg/server/server.go:58`, `milvus/pkg/tracer/tracer.go:41`)
- W3C `TraceContext` propagator as default (`kubernetes/staging/src/k8s.io/apiserver/pkg/endpoints/filters/traces.go:284-291`, `temporal/temporal/fx.go:1057`)
- gRPC instrumentation via `otelgrpc.NewServerHandler` and `otelgrpc.NewClientHandler` (`temporal/common/telemetry/grpc.go:52-55`, `openfga/cmd/run/run.go:625`)
- Prometheus metrics with `prometheus/client_golang` and `promauto` for auto-registration

**Differences:**
- grafana uses go-kit/log with `RegisterContextualLogProvider` for traceID extraction at log time (`pkg/infra/log/log.go:297`)
- kubernetes maintains a dual-span approach (OTel + `k8s.io/utils/trace`) for gradual migration (`staging/src/k8s.io/component-base/tracing/tracing.go:33-44`)
- milvus propagates trace context through message queue properties (`pkg/mq/msgstream/trace.go:32-84`)
- temporal uses a tag-based structured logging system with typed `tag.Tag` types

### 2. Telemetry-First Systems (cli, pocketbase)

These systems prioritize usage telemetry over system health metrics:
- cli uses `ghtelemetry` package with `EventRecorder` interface and detached subprocess delivery (`internal/gh/ghtelemetry/telemetry.go:17-20`)
- pocketbase stores logs in embedded SQLite via `BatchHandler` with 3s/200-log flush policy (`core/base.go:1410-1474`)

**Weaknesses shared:** No distributed tracing, no Prometheus metrics, no correlation ID propagation across request paths.

### 3. Metrics-Primary Systems (nats-server, victoriametrics)

These systems treat Prometheus metrics as the primary observability primitive:
- nats-server exposes JSON monitoring endpoints (`/varz`, `/connz`) instead of Prometheus format (`server/monitor.go:1223-1301`)
- victoriametrics implements self-scraping — can ingest own `/metrics` into storage (`app/victoria-metrics/self_scraper.go:42-123`)
- Both use custom logging frameworks rather than third-party structured loggers

## Pattern Catalog

### Pattern 1: Contextual Log Providers

**What it solves:** Allows trace ID to be extracted from OpenTelemetry span context at log write time rather than log creation time, enabling loose coupling between tracing and logging systems.

**Sources:** grafana (`RegisterContextualLogProvider` at `pkg/infra/log/log.go:297`), kubernetes (via klog contextual helpers)

**Why it works:** Instead of passing trace ID explicitly through all log calls, a provider function is registered that extracts context when the log is actually written. This means existing log calls don't need to change when tracing is added.

**When to copy:** When using OpenTelemetry with a logging library that doesn't natively support OTel context.

**When overkill:** When trace ID is already passed explicitly through all log calls, or when logging is decoupled from tracing entirely.

### Pattern 2: Middleware-Based Instrumentation

**What it solves:** Consistent cross-cutting behavior (request logging, metrics, tracing) without modifying individual handlers.

**Sources:** grafana (`pkg/middleware/loggermw/logger.go`, `pkg/middleware/request_tracing.go`), openfga (gRPC interceptor chain at `cmd/run/run.go:563-584`)

**Why it works:** HTTP middleware and gRPC interceptors apply to all requests uniformly. The middleware chain pattern allows orthogonal concerns to be composed in any order.

**When to copy:** For any HTTP or gRPC service that needs request-scoped observability.

**When risky:** When middleware order matters and isn't enforced by the framework, leading to subtle bugs where logging happens before or after expected points.

### Pattern 3: Health Check Aggregation

**What it solves:** Providing a single `/healthz` or `/readyz` endpoint that aggregates the health of all dependent subsystems.

**Sources:** milvus (`healthz_handler.go:89-131` registers `Indicator` implementations), kubernetes (`healthCheckRegistry` struct at `staging/src/k8s.io/apiserver/pkg/server/healthz.go:34-40`), temporal (moving window health aggregation at `common/rpc/interceptor/health_check.go:32-226`)

**Why it works:** Decentralized health checking where each component reports its own health, aggregated at the edge. This avoids a single centralized health checker from needing to know about all internal components.

**When to copy:** For services with multiple internal components or dependencies.

**When overkill:** For simple single-component services where a direct dependency check suffices.

### Pattern 4: Message Property Trace Injection

**What it solves:** Propagating trace context across async boundaries via message queue systems.

**Sources:** milvus (`ExtractCtx`/`InjectCtx` at `pkg/mq/msgstream/trace.go:32-84`), nats-server (`Nats-Trace-Dest`, `Nats-Trace-Hop` headers at `server/msgtrace.go:27-40`)

**Why it works:** Rather than relying on native context propagation (which message queues don't support), trace context is serialized into message properties. Consumers extract and continue the trace.

**When to copy:** When building systems that communicate via message queues and need distributed tracing across queue boundaries.

**When risky:** If messages are transformed by intermediate systems, the trace context may be lost. Also requires explicit extraction by consumers — if a consumer forgets to call `ExtractCtx`, traces have gaps.

### Pattern 5: Native Histogram Support

**What it solves:** Efficient percentile calculation with lower cardinality than traditional histograms.

**Sources:** grafana (`NativeHistogramBucketFactor: 1.1` at `pkg/middleware/request_metrics.go:62-68`), temporal (custom histogram boundaries at `common/metrics/opentelemetry_provider.go`), openfga (native histograms at `pkg/server/server.go:135-138`)

**Why it works:** Prometheus native histograms use exponential bucket schemas that approximate arbitrary bucket distributions with fewer buckets. This reduces metric cardinality while maintaining precision for SLO calculation.

**When to copy:** When defining latency histograms for SLO-tracked endpoints.

**When overkill:** When simple counter buckets are sufficient and the operational complexity of native histogram configuration isn't justified.

### Pattern 6: Detached Telemetry Delivery

**What it solves:** Ensuring telemetry collection doesn't block user-facing command execution.

**Sources:** cli (`gh send-telemetry` subprocess spawned with `cmd.Process.Release()` at `internal/telemetry/telemetry.go:414`)

**Why it works:** Spawning a detached subprocess means the parent process doesn't wait for telemetry delivery. The child process inherits the parent's environment but runs independently.

**When to copy:** For CLI tools or any application where user-perceived latency matters more than guaranteed telemetry delivery.

**When risky:** Telemetry can be lost if the subprocess fails or the pipe buffer fills. No retry mechanism.

### Pattern 7: BatchHandler with BeforeAddFunc

**What it solves:** Conditional log persistence — e.g., skip writing to storage in dev mode while still printing to stderr.

**Sources:** pocketbase (`BatchHandler` with `BeforeAddFunc` at `tools/logger/batch_handler.go:25`)

**Why it works:** The callback runs before each log is added, allowing conditional filtering without implementing a custom Handler interface from scratch.

**When to copy:** When you need environment-specific log routing (prod writes to storage, dev prints to stderr).

**When overkill:** When a simple log level filter suffices.

## Key Differences

### Correlation ID Strategy

| Source | Correlation Mechanism | Propagation |
|--------|----------------------|-------------|
| grafana | Trace ID in contextual log provider | Logs, metrics exemplars, HTTP headers |
| kubernetes | Audit-ID (not X-Request-ID) | HTTP headers, context, storage calls |
| milvus | `uber-trace-id` header | gRPC metadata, message properties |
| temporal | W3C traceparent via gRPC | gRPC context propagation |
| openfga | Request ID = trace ID when enabled | gRPC metadata |
| nats-server | NATS-specific headers | Message hops only |
| pocketbase | None | N/A |
| cli | invocation_id (internal only) | Telemetry events |
| victoriametrics | None | N/A |

**Key insight:** OTel-native systems converge on W3C TraceContext propagators. Systems without OTel (nats-server, pocketbase, victoriametrics) either use custom correlation mechanisms or none at all.

### Logging Framework Choices

| Framework | Sources |
|-----------|---------|
| zap (uber-go/zap) | milvus, openfga, temporal |
| go-kit/log | grafana |
| klog/v2 | kubernetes |
| Custom stdlib wrapper | nats-server, victoriametrics |
| Go slog | pocketbase |
| ghtelemetry (custom) | cli |

**Trend:** zap dominates among OTel-native services. Custom logging is more common in systems that prioritize metrics over tracing or that have strong self-containment requirements.

### Metrics Exposition Model

| Model | Sources |
|-------|---------|
| Prometheus `/metrics` endpoint | grafana, kubernetes, milvus, openfga, temporal, victoriametrics |
| JSON monitoring endpoints | nats-server |
| No metrics | cli, pocketbase |

**Insight:** Prometheus has become the de facto standard for metrics exposition in Go services. Systems without Prometheus typically have architectural reasons (embedded database, NATS-native design).

## Tradeoffs

### Structured Logging vs. Custom Logging

**Benefit of structured (zap, go-kit):** Rich key-value pair support, performance-optimized encoders, contextual fields.

**Cost:** External dependency, additional configuration.

**Best-fit:** Services that need machine-parseable logs for production debugging.

**Failure mode:** Over-structuring logs — adding too many fields makes logs hard to read in development.

**Alternative:** Custom logging (nats-server, victoriametrics) — lower fidelity but zero dependencies.

### OTel Tracing vs. NATS-Native Tracing

**Benefit of OTel:** Vendor-neutral, standard propagation formats, rich ecosystem of collectors and backends.

**Cost:** SDK complexity, startup overhead, potential memory leaks if not properly managed (`otel.SetMeterProvider(noop.NewMeterProvider())` at `kubernetes/staging/src/k8s.io/apiserver/pkg/server/options/tracing.go:55`).

**Best-fit:** Services that need distributed tracing across multiple backends or that integrate with external observability pipelines.

**Failure mode:** OTel SDK panics on exporter connection failure (openfga at `internal/telemetry/tracing.go:138`) — graceful degradation requires additional error handling.

**Alternative:** NATS-native tracing (nats-server) — simpler but limits interoperability.

### Default Tracing Enabled vs. Disabled

**Benefit of enabled:** Traces available retroactively for incident investigation.

**Cost:** Performance overhead, storage costs, potential for trace volume explosion.

**Best-fit:** Production systems where debugging capability is worth the overhead.

**Failure mode:** Operators may not realize tracing is disabled until an incident occurs.

**Alternative:** Disabled by default (milvus, openfga) — zero overhead until explicitly configured. Appropriate for development environments or when sampling is not desired.

### Async Log Writing vs. Synchronous

**Benefit of async:** Prevents log I/O from blocking request processing.

**Cost:** Logs can be lost on crash, harder to debug log-related issues.

**Best-fit:** High-throughput services where latency is critical.

**Failure mode:** If buffer fills, critical logs may be dropped silently (milvus at `pkg/log/config.go:91`).

**Alternative:** Synchronous logging — simpler, no log loss, but higher latency.

## Decision Guide

**Q: Should I use OpenTelemetry or a custom tracing solution?**
- If you need distributed tracing across multiple services → Use OpenTelemetry with W3C TraceContext propagation
- If you're building a single-service system with no external integration → NATS-native tracing (nats-server) or custom message tracking may suffice
- If you're building an embedded database or library → Consider no tracing or opt-in only

**Q: What logging framework should I use?**
- For OTel-native services → zap (milvus, openfga, temporal) or go-kit/log (grafana)
- For metrics-primary services with self-containment requirements → Custom stdlib wrapper (nats-server, victoriametrics)
- For embedded databases → Go slog (pocketbase) or custom BatchHandler

**Q: How should I implement health checks?**
- For services with multiple internal components → Aggregator pattern (milvus, kubernetes)
- For simple services → Direct endpoint checking
- Always include `/livez` (liveness) and `/readyz` (readiness) separately

**Q: Should tracing be enabled by default?**
- For production services that require incident debugging capability → Yes, with configurable sampling
- For development or resource-constrained environments → Disabled by default is acceptable
- For embedded systems → Consider opt-in only

**Q: How should logs be routed in production?**
- For containerized deployments → stdout/stderr with container logging sidecar
- For metal deployments → File rotation with external log aggregation (Loki, ELK)
- For embedded databases → SQLite storage (pocketbase) or stdout-only

## Practical Tips

1. **Use W3C TraceContext propagator** — All OTel-native systems converge on this. It enables trace context to flow through HTTP headers, gRPC metadata, and message properties.

2. **Propagate trace context to datastore queries** — openfga's opt-in `ContextPropagationToDatastore` is a reasonable default but trace context in storage spans is invaluable for debugging.

3. **Implement exemplar support in Prometheus metrics** — grafana's `ObserveWithExemplar()` linking metrics to trace IDs enables correlation between metric anomalies and specific traces.

4. **Use middleware for cross-cutting instrumentation** — grafana's HTTP middleware chain and openfga's gRPC interceptor chain provide consistent observability without handler modifications.

5. **Configure health checks with startup grace periods** — kubernetes' `addDelayedHealthChecks()` prevents premature load balancer removal during startup.

6. **Implement log rate limiting** — victoriametrics and milvus both use rate limiting to prevent log flooding during errors. Without it, the very system you're debugging can be silenced by its own logs.

7. **Use structured log formats (JSON) in production** — openfga's config explicitly recommends JSON for production despite defaulting to text.

8. **Expose pprof endpoints in non-production** — grafana, milvus, openfga, temporal, and victoriametrics all expose pprof. Even if not used actively, they provide crucial debugging capability during incidents.

9. **Use request ID = trace ID when tracing is enabled** — openfga's approach (`pkg/middleware/requestid/requestid.go:27-34`) enables direct correlation between logs and traces without additional mapping.

10. **Hot-reloadable log levels** — kubernetes and pocketbase both support runtime log level changes without restart, valuable for incident response.

## Anti-Patterns / Caution Signs

1. **Tracing disabled by default with no discoverability** — milvus's default `exporter: "noop"` means operators may not realize traces are unavailable until an incident. If disabled by default, document the configuration clearly.

2. **No correlation ID for request path reconstruction** — pocketbase's activity logs have no request ID, making it impossible to reconstruct a single request's path through the system. Any non-trivial service should have request correlation.

3. **OTel SDK panic on startup** — openfga's `MustNewTracerProvider` panics if it cannot connect to the OTLP exporter. This is a startup failure rather than graceful degradation.

4. **High-cardinality metric labels** — kubernetes's 22-label `requestLatencies` histogram and potential unbounded `datastore_query_count` labels (openfga) can cause Prometheus cardinality explosions.

5. **Async log drop without alerting** — pocketbase's `MaxDays == 0` silently discards logs; milvus's async buffer overflow drops logs without alerting. Critical logs should never be silently dropped.

6. **No health check depth** — pocketbase's `/api/health` returns static 200 OK with optional `canBackup`. A production health check should verify critical dependencies.

7. **Debug mode span annotation in production** — temporal's debug-mode payload annotation (`common/telemetry/grpc.go:130-157`) can generate significant trace volume if left enabled in production.

8. **Metric registration conflicts** — grafana's `MustRegister` panics on duplicate registration, requiring careful singleton pattern implementation.

9. **Log health check blocked** — kubernetes's `LogHealthz` reports unhealthy if logging blocks, meaning the monitoring system loses visibility when logging itself is impaired.

10. **Missing trace context in logs without tracing enabled** — openfga's `spanCtx.HasTraceID()` returns false without tracing, and only error logs include request context fields.

## Notable Absences

1. **No OTel Logs integration** — All nine sources route logs to stdout/file/stdout without OpenTelemetry Log SDK integration. Logs are not correlated with traces via OTel.

2. **No built-in log aggregation** — Every source delegates log aggregation to external tooling (Fluentd, Loki, ELK) or doesn't provide it (pocketbase uses SQLite, nats-server uses file/syslog only).

3. **No explicit SLO instrumentation** — Only grafana's `slo_group` label hints at SLO tracking, but no source defines explicit SLO configurations in code.

4. **No tail-based sampling** — While exporters are configurable, sampling strategy (head-based vs tail-based) is not addressed in any source's instrumented code.

5. **No frontend/browser tracing** — grafana (TypeScript/React frontend) and temporal (Nexus HTTP traces) have limited frontend observability, but no source implements full browser-side distributed tracing.

6. **No alerting rules in code** — Alerting is delegated to external Prometheus Alertmanager configurations or cloud-native solutions.

7. **No cross-cluster trace correlation** — temporal's multi-cluster deployment doesn't address trace context propagation between clusters.

8. **No crash reporting** — No source implements crash reporting mechanism (unlike Sentry-style error tracking).

## Per-Source Notes

### cli
The telemetry-first approach is appropriate for a CLI tool where user behavior analysis matters more than system health. However, the absence of structured logging and correlation IDs limits production debugging capability. The detached subprocess delivery pattern is worth copying for any telemetry collection that shouldn't block user-facing operations.

### grafana
The contextual log provider pattern (`RegisterContextualLogProvider`) is the most sophisticated log-trace correlation in the study. Exemplar support linking metrics to traces is also noteworthy. The gap is async job observability — background tasks lack trace context propagation.

### kubernetes
The dual-span approach (OTel + `k8s.io/utils/trace`) is a pragmatic migration strategy. The Audit-ID as correlation ID works for internal auditing but lacks the external request correlation of standard X-Request-ID headers. The health check delegation to components via shared interface is well-designed.

### milvus
Message property trace injection is the most complete async boundary propagation found. The default tracing disabled configuration is the most significant operational gap — traces should be available for production debugging. The WebUI telemetry management is a useful UX pattern.

### nats-server
NATS-native message tracing with hop tracking is appropriate for a message broker, but the lack of Prometheus metrics and W3C traceparent propagation limits interoperability. The custom Logger interface with syslog support is functional but dated.

### openfga
Request ID = trace ID is elegant when tracing is enabled. The middleware chain ordering (recovery → ctxtags → requestid → storeid → logging → validation → auth → tracing) shows careful thinking about interceptor composition. Context propagation to datastore being opt-in is a reasonable tradeoff for connection pool management.

### pocketbase
The SQLite log storage with BatchHandler is unique among the study — no other source persists logs to an embedded database. This works for single-node deployments but doesn't scale. The absence of correlation IDs is a significant gap for any production debugging scenario.

### temporal
The tag-based structured logging system (`tag.String()`, `tag.Int64()`) enforces consistency across logs. Multi-exporter metrics (Prometheus, StatsD, Tally fallback) provide deployment flexibility. The debug-mode span annotation with request/response payloads is powerful but risky if left enabled in production.

### victoriametrics
Self-scraping is an innovative pattern — the system can monitor itself without external Prometheus. The custom logger with per-level rate limiting is well-designed. The query tracer for internal debugging is useful but internal-only. The gap is OTel usage in application code — OTel is present in vendor but not in application paths.

## Open Questions

1. **How do operators discover tracing is disabled?** — milvus and openfga both default to disabled tracing with no visible indicator in the system that traces are not being collected.

2. **What sampling strategy should be used for high-throughput services?** — No source addresses head-based vs tail-based sampling in instrumented code.

3. **How should async context propagation work for goroutines?** — pocketbase uses `context.Background()` for background tasks; openfga uses `storagewrappers.ContextWrapper`. There's no consensus on best practice.

4. **How should log aggregation be integrated?** — Every source delegates to external tooling with no native support. Is there a threshold where built-in log aggregation becomes worthwhile?

5. **What's the operational impact of OTel SDK failures?** — openfga panics on exporter connection failure; others silently degrade. What's the right failure mode for observability infrastructure?

## Evidence Index

### cli
- `internal/gh/ghtelemetry/telemetry.go:17-20` — EventRecorder interface
- `internal/gh/ghtelemetry/telemetry.go:172-199` — LogFlusher for JSON payloads
- `internal/gh/ghtelemetry/telemetry.go:201-210` — GitHubFlusher subprocess
- `internal/ghcmd/cmd.go:130` — defer telemetryService.Flush()
- `internal/codespaces/api/api.go:1184` — OpenTracing span in codespaces
- `internal/codespaces/api/api.go:1184-1186` — span.Finish() defer
- `api/http_client.go:160-169` — telemetryDisablerTransport

### grafana
- `pkg/infra/log/log.go:70` — logManager with per-logger filtering
- `pkg/infra/log/log.go:297` — RegisterContextualLogProvider
- `pkg/middleware/request_tracing.go:94-144` — RequestTracing middleware
- `pkg/middleware/request_metrics.go:43-48` — request duration histogram
- `pkg/middleware/request_metrics.go:131-144` — ObserveWithExemplar
- `pkg/server/health.go:38-56` — /livez and /readyz endpoints

### kubernetes
- `staging/src/k8s.io/component-base/tracing/tracing.go:33-44` — dual-span approach
- `staging/src/k8s.io/apiserver/pkg/endpoints/filters/traces.go:33-66` — OTel HTTP handler
- `staging/src/k8s.io/apiserver/pkg/endpoints/metrics/metrics.go:76-93` — request metrics
- `staging/src/k8s.io/apiserver/pkg/server/healthz/healthz.go:40-44` — HealthChecker interface
- `staging/src/k8s.io/apiserver/pkg/audit/context.go:393-396` — AuditIDFrom function

### milvus
- `pkg/log/log.go:69-104` — Zap logger initialization
- `pkg/tracer/tracer.go:51` — TextMapPropagator configuration
- `pkg/mq/msgstream/trace.go:32-84` — ExtractCtx/InjectCtx for message properties
- `internal/http/healthz/healthz_handler.go:89-131` — healthz aggregation
- `pkg/util/logutil/grpc_interceptor.go:26-97` — gRPC trace interceptors

### nats-server
- `server/log.go:26` — custom Logger interface
- `server/msgtrace.go:27-40` — message tracing headers
- `server/monitor.go:1223-1301` — Varz metrics struct
- `server/monitor.go:3520-3576` — healthz handler
- `server/events.go:41-97` — $SYS.* system events

### openfga
- `pkg/logger/logger.go:40-212` — ZapLogger implementation
- `internal/telemetry/tracing.go:93-152` — TracerProvider setup
- `pkg/middleware/logging/logging.go:144-147` — trace context in logs
- `pkg/middleware/requestid/requestid.go:27-34` — request ID = trace ID
- `pkg/server/server.go:58` — per-package tracer

### pocketbase
- `tools/logger/batch_handler.go:14` — BatchHandler
- `core/base.go:1410-1474` — BatchHandler initialization
- `core/log_model.go:11-18` — Log struct
- `apis/middlewares.go:347-372` — activityLogger middleware
- `apis/health.go:18-53` — health endpoint

### temporal
- `common/log/zap_logger.go:31-44` — DefaultZapEncoderConfig
- `common/telemetry/grpc.go:52-55` — otelgrpc handlers
- `temporal/fx.go:1057` — W3C TraceContext propagator
- `common/rpc/interceptor/health_check.go:32-226` — moving window health
- `service/history/queues/executable.go:260-282` — queue task spans

### victoriametrics
- `lib/logger/logger.go:21-32` — custom logger with levels
- `lib/appmetrics/appmetrics.go:30-47` — WritePrometheusMetrics
- `app/victoria-metrics/self_scraper.go:42-123` — self-scraping
- `lib/querytracer/tracer.go:25-45` — internal query tracing
- `lib/httpserver/httpserver.go:391-440` — health endpoints

---

Generated by dimension `09-observability-operational-visibility.md`.