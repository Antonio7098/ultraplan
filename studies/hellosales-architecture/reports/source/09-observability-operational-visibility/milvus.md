# Source Analysis: milvus

## Observability & Operational Visibility

### Source Info

| Field | Value |
|-------|-------|
| Name | milvus |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/milvus` |
| Language / Stack | Go (with C++ core / Rust tantivy) |
| Analyzed | 2026-05-20 |

## Summary

Milvus has a comprehensive observability infrastructure with structured logging (Zap), distributed tracing (OpenTelemetry), and Prometheus metrics. The system supports trace context propagation across gRPC and message streams, provides health/readiness HTTP endpoints, and includes a full WebUI for cluster monitoring. Default configuration disables tracing (exporter: "noop", sampleFraction: 0), which is a notable gap for production deployments.

## Rating

**8/10** — Good implementation with minor issues. Comprehensive metrics across all components, well-structured logging with async capabilities, and OpenTelemetry tracing with multiple exporter options. Health endpoints are properly implemented. Minor扣分: default tracing is disabled, and some async boundary propagation relies on message property injection rather than native context propagation.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Logging - Framework | Uber's Zap (`go.uber.org/zap`) with InitLogger, Lumberjack rotation | `pkg/log/log.go:69-104` |
| Logging - Config | Structured config: level, format (json/text/console), file, async, development mode | `pkg/log/config.go:42-98` |
| Logging - Async | AsyncTextIOCore with configurable buffer, flush interval, dropped timeout | `pkg/log/config.go:75-97` |
| Logging - Rate Limiting | Jaeger `ReconfigurableRateLimiter` for log sampling | `pkg/log/log.go:65-66` |
| Logging - Global Accessors | `L()`, `S()`, `Ctx()` for context-aware logging with trace ID attachment | `pkg/log/global.go:172-183` |
| Tracing - Framework | OpenTelemetry (`go.opentelemetry.io/otel`) with SDK | `pkg/tracer/tracer.go:41-156` |
| Tracing - Exporters | Jaeger, OTLP (gRPC/HTTP), stdout, noop — configured in milvus.yaml:1271-1286 | `pkg/tracer/tracer.go:114-155` |
| Tracing - Propagators | `TraceContext` and `Baggage` propagation via `otel.SetTextMapPropagator()` | `pkg/tracer/tracer.go:51` |
| Tracing - gRPC Interceptor | `UnaryTraceLoggerInterceptor` / `StreamTraceLoggerInterceptor` extract/inject trace ID | `pkg/util/logutil/grpc_interceptor.go:26-97` |
| Tracing - Message Streams | `ExtractCtx` / `InjectCtx` propagate trace context through message properties | `pkg/mq/msgstream/trace.go:32-84` |
| Tracing - Intent Context | `NewIntentContext()` creates span and attaches trace ID to context logger | `pkg/log/global.go:164-172` |
| Metrics - Framework | Prometheus (`github.com/prometheus/client_golang`) with custom registry | `pkg/metrics/metrics.go:153-209` |
| Metrics - Registration | `MustRegister` pattern for centralized metric registration | `pkg/metrics/metrics.go:202-208` |
| Metrics - Buckets | Exponential buckets for latency histograms (`subMsBuckets`, `longTaskBuckets`) | `pkg/metrics/metrics.go:153-167` |
| Metrics - Component Metrics | Proxy, QueryNode, RootCoord, DataCoord metrics with labels | `pkg/metrics/proxy_metrics.go`, `pkg/metrics/querynode_metrics.go` |
| Correlation - Trace ID Key | `TraceIDKey = "uber-trace-id"` constant for header extraction | `pkg/common/common.go:347` |
| Correlation - gRPC Metadata | Client request ID, log level, timestamp extracted from gRPC metadata | `pkg/util/logutil/grpc_interceptor.go:18-23` |
| Correlation - Context Logger | `WithTraceID()` attaches trace ID to context for log correlation | `pkg/log/global.go:133-136` |
| Health - Healthz Handler | Aggregates component health states, returns 200/500 with detail | `internal/http/healthz/healthz_handler.go:89-131` |
| Health - Liveness Handler | Non-blocking lightweight liveness probe for Kubernetes | `internal/http/healthz/livez_handler.go:32-38` |
| Health - HTTP Routes | `/healthz`, `/livez`, `/metrics` registered on port 9091 | `internal/http/router.go:19-43` |
| Health - HTTP Server | Metrics server with pprof, webui, eventlog handlers | `internal/http/server.go:287-304` |

## Answers to Dimension Questions

### 1. Can an operator reconstruct a single request's full path through the system?

**Yes, with OpenTelemetry tracing.** The system uses W3C TraceContext propagation via OpenTelemetry's `TextMapPropagator` (`pkg/tracer/tracer.go:51`). gRPC interceptors extract trace IDs from incoming metadata (`pkg/util/logutil/grpc_interceptor.go:40-97`) and inject them into outgoing contexts. For message streams (Pulsar), trace context is extracted from/injected into message properties (`pkg/mq/msgstream/trace.go:32-52`). However, the **default tracing configuration is disabled** (`configs/milvus.yaml:1274` — `exporter: noop`, `sampleFraction: 0`), so operators must explicitly configure a tracing exporter (Jaeger or OTLP) to enable this capability.

### 2. How are structured logs routed, stored, and queried in production?

**Structured logs via Zap with file rotation.** Zap encodes logs as JSON or text based on `format` config (`pkg/log/config.go:48`). Logs can be written to stdout and/or file with Lumberjack rotation (`pkg/log/log.go:142-162`) — configured via `FileLogConfig` (`rootpath`, `filename`, `max-size`, `max-days`, `max-backups`). Async writing is supported via `AsyncWriteEnable` (`pkg/log/config.go:76`). Rate limiting is available via Jaeger's `ReconfigurableRateLimiter` (`pkg/log/log.go:65`). **No built-in log aggregation or querying** — logs are written to files that would typically be collected by a sidecar or node-level agent (e.g., Filebeat, Fluentd). The system does not include a log backend.

### 3. What metrics indicate system health vs performance degradation?

**Prometheus metrics with component-specific indicators.** Health metrics include:
- `milvus_num_node` gauge — number of active nodes per role (`pkg/metrics/metrics.go:169-174`)
- `milvus_lock_time_cost` gauge — lock contention monitoring (`pkg/metrics/metrics.go:176-186`)
- Component states via `/healthz` endpoint aggregating `GetComponentStates()` calls

Performance degradation indicators:
- Latency histograms: `ProxySQLatency`, `QueryNodeSQReqLatency` with exponential buckets (`pkg/metrics/metrics.go:156-161`)
- Queue metrics: `pending`, `executing`, `done` task states
- Segment counts and states (growing, sealed, flushing)
- Cache hit/miss ratios

**No built-in alerting** — Prometheus alerts would be external.

### 4. How does observability cross async boundaries (queues, workflows)?

**Trace context injection into message properties.** For message streams (Pulsar), `ExtractCtx()` extracts trace span from `msg.Properties` using `MapCarrier` propagation (`pkg/mq/msgstream/trace.go:37`). `InjectCtx()` injects the current trace context into message properties before publishing (`pkg/mq/msgstream/trace.go:47-51`). This allows trace context to flow through the message queue. Note: `TimeTick` and `LoadIndex` message types are excluded from tracing (`pkg/mq/msgstream/trace.go:73-83`).

**gRPC stream context propagation** is handled via `StreamTraceLoggerInterceptor` which wraps the server stream with a modified context (`pkg/util/logutil/grpc_interceptor.go:32-38`).

### 5. What debugging tooling exists for production issues?

**Comprehensive tooling:**
- **pprof integration**: Mutex and block profiles enabled on non-ARM64 builds (`internal/http/server.go:294-297`), exposed via `/pprof/` endpoints when `EnablePprof` is true
- **WebUI**: Embedded web UI at `/webui/` with cluster info, configs, client telemetry, slow queries (`internal/http/server.go:145-205`)
- **WebUI Telemetry**: Telemetry management UI at `/telemetry` (`internal/http/server.go:200-205`)
- **Runtime log level adjustment**: `/log/level` endpoint allows runtime log level changes (`internal/http/server.go:79-85`)
- **Event log endpoint**: `/eventlog` for event stream access (`internal/http/server.go:95-97`)
- **Expression evaluator**: `/expr` endpoint for debugging search expressions with auth (`internal/http/server.go:100-139`)

## Architectural Decisions

1. **Tracing opt-out by default**: Default config uses `noop` exporter and `sampleFraction: 0` — tracing must be explicitly enabled. This avoids overhead cost but means traces are not available for historical debugging of issues that occurred before configuration change.

2. **TextMapPropagator for context propagation**: The system uses OpenTelemetry's standard `TextMapPropagator` with `TraceContext` and `Baggage` propagation, allowing vendor-neutral trace context that can flow through HTTP/gRPC headers and message properties.

3. **Prometheus metrics over statsd**: Chose Prometheus client library for metrics, providing a pull-based model with a well-defined `/metrics` endpoint. The `GetRegisterer()` pattern allows custom registries (`pkg/metrics/metrics.go:193-198`).

4. **Context-aware logging via `Ctx()`**: The `MLogger` type wraps `zap.Logger` and is stored in `context.Context` using a private key, enabling structured logging with trace ID correlation without global state pollution (`pkg/log/global.go:174-183`).

5. **Component health aggregation**: Healthz handler uses a registration pattern where components self-register as `Indicator` implementations (`internal/http/healthz/healthz_handler.go:67-69`), enabling decentralized health checking.

6. **Async log writing with graceful degradation**: Async writer has configurable buffer size, flush interval, dropped timeout, and non-droppable level (`pkg/log/config.go:75-97`), preventing log flooding from overwhelming disk I/O.

7. **HTTP server on dedicated port**: Metrics and health endpoints use port `9091` (configurable via `METRICS_PORT` env var) separate from gRPC port, enabling sidecar access without interfering with main service (`internal/http/server.go:307-315`).

## Notable Patterns

- **Intent-based spans**: `NewIntentContext()` creates named spans with role and intent attached to log context (`pkg/log/global.go:164-172`)
- **Log level override via gRPC metadata**: Clients can set `log-level` header to override server log level per-request (`pkg/util/logutil/grpc_interceptor.go:44-68`)
- **Client trace ID passthrough**: If `client-request-id` is a valid W3C trace ID hex, it's used directly; otherwise stored as a custom field (`pkg/util/logutil/grpc_interceptor.go:70-80`)
- **Rate-limited logging**: `RatedDebug`, `RatedInfo`, `RatedWarn` use Jaeger rate limiter to prevent log flooding (`pkg/log/global.go:76-110`)
- **Metric label constants**: Centralized label constants in `metrics.go` ensure consistency across all metric definitions (`pkg/metrics/metrics.go:26-151`)

## Tradeoffs

- **Tracing disabled by default**: While configurable, the default `noop` exporter means production issues cannot be traced retroactively. Enabling tracing has a performance cost (sampling overhead, exporter I/O).

- **No built-in log aggregation**: Logs are written to files or stdout — collection and querying requires external infrastructure (ELK, Loki, etc.). This is a common tradeoff for services that prioritize performance over self-contained observability.

- **Message property injection for async tracing**: Trace context crossing message queues relies on injecting properties into messages rather than native context propagation. This is less robust than native async context propagation and requires message consumers to explicitly call `ExtractCtx()`.

- **Prometheus pull model limitations**: The pull-based Prometheus model requires network access from scraping nodes. For highly distributed or firewalled deployments, this may require additional configuration (e.g., Prometheus Agent mode, push gateway for batch jobs).

- **WebUI embedded in binary**: The WebUI is embedded at compile time (`//go:embed webui`), which simplifies deployment but means UI updates require binary rebuilds.

## Failure Modes / Edge Cases

- **Trace ID not propagated to async workers**: If async code paths (goroutines, thread pools) do not pass the instrumented context, trace spans will be orphaned. The `allowTrace()` check in `msgstream/trace.go` excludes certain message types (`TimeTick`, `LoadIndex`), potentially creating gaps in trace coverage.

- **Health check blocking**: The `/healthz` handler calls `GetComponentStates()` on all registered components (`internal/http/healthz/healthz_handler.go:96-103`). If any component is unresponsive, the health check will block or timeout, potentially causing kubernetes to remove the pod from service.

- **Async log drop on buffer full**: When async write buffer is full (`AsyncWritePendingLength` exceeded), log operations are dropped (`pkg/log/config.go:91`). Critical error logs could be lost if they occur during buffer overflow.

- **Metric cardinality explosion**: With labels like `collection_id`, `field_id`, `msg_type`, high-cardinality metrics could impact Prometheus performance. No explicit cardinality limits are enforced.

- **pprof profiles on ARM64**: Mutex and block profiling is disabled on ARM64 (`internal/http/server.go:294`), reducing debugging capability on ARM-based deployments.

## Future Considerations

1. **Enable tracing by default**: Consider enabling at least a small sampling fraction (e.g., 0.01) by default to ensure trace data is available for debugging production issues without operator intervention.

2. **OpenTelemetry Collector integration**: Native OTLP export is supported, but adding a built-in OTLP Collector receiver could simplify the deployment topology for organizations already using OTel Collector.

3. **Structured log querying**: Consider adding a log aggregation API (e.g., Loki query API proxy) or integrating with existing log infrastructure to enable log search without external tooling.

4. **Async context propagation**: Evaluate native context propagation for async code paths rather than message property injection, potentially using Go context channels or structured concurrency patterns.

5. **Alerting integration**: Build native alerting rules or integration with Alertmanager for metric-based alerting rather than requiring external Prometheus rule management.

## Questions / Gaps

- **No evidence of trace backends in config defaults**: Default config uses `noop` — how do operators discover required configuration? Is there documentation for Jaeger/OTLP setup?

- **No evidence of log sampling strategy**: While rate limiting exists, is there a documented strategy for log sampling at high throughput? How are critical logs protected from sampling?

- **No evidence of distributed tracing across datacoord/querycoord**: The trace context propagates through gRPC and message streams, but are there any gaps in cross-component tracing (e.g., datacoord → etcd → querycoord)?

- **No evidence of crash reporting**: If the process crashes, is there any mechanism to capture the state (goroutine dumps, heap profiles) for post-mortem analysis?

- **No evidence of metric retention policies**: Prometheus metrics have no retention configuration — relies entirely on Prometheus server configuration. Are there any metrics that could cause storage issues?

---

Generated by `dimensions/09-observability-operational-visibility.md` against `milvus`.