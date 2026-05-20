# Source Analysis: kubernetes

## Observability & Operational Visibility

### Source Info

| Field | Value |
|-------|-------|
| Name | kubernetes |
| Path | `sources/kubernetes` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

Kubernetes implements a comprehensive observability infrastructure centered on **klog** for logging, **OpenTelemetry** for distributed tracing, **Prometheus** for metrics, and a well-designed health check system (`/healthz`, `/livez`, `/readyz`). The correlation ID is the **Audit-ID**, propagated through HTTP headers and context. The architecture uses dual-span approach (OTel + k8s.io/utils/trace) for tracing, enabling gradual OTel migration.

## Rating

**8/10** — Kubernetes demonstrates strong observability practices with structured logging, comprehensive metrics, and tracing. Minor gaps: no native correlation ID header for external request correlation; async boundary observability relies on etcd transaction spans rather than queue-level instrumentation.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Logging Framework | `klog/v2` used as primary logger | `staging/src/k8s.io/klog/v2/klog.go:29-36` |
| Structured Logging Init | `klogflags.Init()` in logs.go | `staging/src/k8s.io/component-base/logs/logs.go:47` |
| Log Level Config | `-v` and `-vmodule` flags via `klogflags.go:31` | `staging/src/k8s.io/component-base/logs/klogflags/klogflags.go:25-41` |
| Structured Log Helpers | `klog.InfoS()`, `klog.ErrorS()` with key-value pairs | `staging/src/k8s.io/component-base/logs/example/example.go:39` |
| KObj Helpers | `klog.KObj()` for Kubernetes object references in logs | `staging/src/k8s.io/component-base/logs/json/klog_test.go:151,158-159` |
| OpenTelemetry Tracing | OTel integration via `otelhttp.NewHandler` | `staging/src/k8s.io/apiserver/pkg/endpoints/filters/traces.go:33-66` |
| Tracing Config | `TracingOptions` with OTLP exporter | `staging/src/k8s.io/apiserver/pkg/server/options/tracing.go:26-30,100-131` |
| Dual-span Approach | Combined OTel + utils/trace span wrapper | `staging/src/k8s.io/component-base/tracing/tracing.go:33-44,46-53` |
| etcd Tracing | `otelgrpc.NewClientHandler` for gRPC + etcd span creation | `staging/src/k8s.io/apiserver/pkg/storage/storagebackend/factory/etcd3.go:322-330` |
| Storage Tracing | `tracing.Start()` at `staging/src/k8s.io/apiserver/pkg/storage/etcd3/store.go:274-280` | `staging/src/k8s.io/apiserver/pkg/storage/etcd3/store.go:274` |
| Request Metrics | `requestCounter`, `requestLatencies`, `longRunningRequestsGauge` | `staging/src/k8s.io/apiserver/pkg/endpoints/metrics/metrics.go:76-93` |
| Metrics Registration | `legacyregistry.MustRegister(metric)` at `metrics.go:423` | `staging/src/k8s.io/apiserver/pkg/endpoints/metrics/metrics.go:419-426` |
| Audit-ID Header | `HeaderAuditID = "Audit-ID"` constant | `staging/src/k8s.io/apiserver/pkg/apis/audit/types.go:38` |
| Audit-ID Propagation | `audit.GetAuditIDTruncated(ctx)` used in tracing/storage | `staging/src/k8s.io/apiserver/pkg/endpoints/filters/traces.go:59-60` |
| Audit Context | `AuditIDFrom(ctx)` function | `staging/src/k8s.io/apiserver/pkg/audit/context.go:393-396` |
| Health Check Interface | `HealthChecker` interface with `Name()` and `Check()` | `staging/src/k8s.io/apiserver/pkg/server/healthz/healthz.go:40-44` |
| Health Endpoints | `/healthz`, `/livez`, `/readyz` registration | `staging/src/k8s.io/apiserver/pkg/server/healthz/healthz.go:171-225` |
| Default Health Checks | `PingHealthz`, `LogHealthz` as defaults | `staging/src/k8s.io/apiserver/pkg/server/healthz/healthz.go:51-52,66-67` |
| Health Registry | `healthCheckRegistry` struct on `GenericAPIServer` | `staging/src/k8s.io/apiserver/pkg/server/healthz.go:34-40` |
| Filter Latency Tracing | `filterlatency.TrackStarted()` creates spans | `staging/src/k8s.io/apiserver/pkg/endpoints/filterlatency/filterlatency.go:59-61` |

## Answers to Dimension Questions

### 1. Can an operator reconstruct a single request's full path through the system?

**Yes**, via the **Audit-ID** correlation mechanism. The flow is:

1. Incoming request → `audit_init.go` sets `Audit-ID` header (`staging/src/k8s.io/apiserver/pkg/endpoints/filters/audit_init.go:39-61`)
2. Audit-ID echoed in response header (`staging/src/k8s.io/apiserver/pkg/endpoints/filters/audit_init.go:59-60`)
3. Audit-ID attached to OTel span as `audit-id` attribute (`staging/src/k8s.io/apiserver/pkg/endpoints/filters/traces.go:59-60`)
4. Audit-ID passed to etcd storage calls (`staging/src/k8s.io/apiserver/pkg/storage/etcd3/store.go:275`)
5. Audit logs written with full request context keyed by Audit-ID

However, **X-Request-ID** header handling for _external_ request correlation was **not found**. The primary correlation ID is internal to Kubernetes (Audit-ID), not a general-purpose correlation ID for multi-system request tracing.

### 2. How are structured logs routed, stored, and queried in production?

**Routing**: Logs are written to stdout/stderr via klog, which uses a structured text format. The format includes:
- Timestamp
- Log level (I, W, E, F)
- Thread/operation info
- Key-value pairs via `klog.InfoS("msg", "key", "value")`

**Format**: Structured text by default, JSON available via `k8s.io/component-base/logs/json`. The text format includes `klog.KObj()` helpers that produce consistent object references.

**Configuration**: Log level controlled via `-v` flag (verbosity 0-10) and `-vmodule` for per-package control (`staging/src/k8s.io/component-base/logs/klogflags/klogflags.go:25-41`). Log flush frequency configured via `--log-flush-frequency`.

**No built-in log aggregation**: Kubernetes delegates log routing to the deployment environment (e.g., node-level logging, fluentd, cloud logging integrations). There is no in-process log pipeline or dedicated query interface.

### 3. What metrics indicate system health vs performance degradation?

**Health indicators**:
- `/healthz`, `/livez`, `/readyz` health check endpoints with pluggable checkers (`staging/src/k8s.io/apiserver/pkg/server/healthz/healthz.go:40-44`)
- `longRunningRequestsGauge` — active long-running requests (`staging/src/k8s.io/apiserver/pkg/endpoints/metrics/metrics.go:85-93`)
- etcd connectivity checks via `etcd` and `etcd-readiness` health checks (`staging/src/k8s.io/apiserver/pkg/server/options/etcd.go:426,434`)

**Performance degradation indicators**:
- `requestLatencies` histogram — response latency distribution (`staging/src/k8s.io/apiserver/pkg/endpoints/metrics/metrics.go:94-107`)
- `request_slo_duration_seconds` histogram — SLO-measured latency excluding webhooks (`staging/src/k8s.io/apiserver/pkg/endpoints/metrics/metrics.go:108-122`)
- `TLSHandshakeErrors` counter — TLS handshake failures (`staging/src/k8s.io/apiserver/pkg/endpoints/metrics/metrics.go:161-169`)

**Resource/scale indicators**:
- `deprecatedRequestGauge` — deprecated API usage tracking (`staging/src/k8s.io/apiserver/pkg/endpoints/metrics/metrics.go:64-72`)
- No evident memory/CPU metrics in apiserver core (delegated to kubelet cAdvisor)

### 4. How does observability cross async boundaries (queues, workflows)?

**Weaknesses identified**:

- **No dedicated work queue instrumentation**: Kubernetes uses etcd transactions as the primary async boundary. Storage operations get traced (`staging/src/k8s.io/apiserver/pkg/storage/etcd3/store.go:274-280`) but general work queue operations do not have per-item tracing.

- **Controller reconciliation**: Informers synchronize cached state, but there is no per-reconciliation span automatically created. Controller loops rely on `klog.V(4).Infof` for debug logging, with `InformerSyncHealthz` as a proxy for sync status (`staging/src/k8s.io/apiserver/pkg/server/healthz/healthz.go:104-113`).

- **Event recording**: `k8s.io/client-go/tools/record.Event` records events but these are not correlated to the originating request's Audit-ID by default.

- **Watch streams**: Watch events are tracked via `WatchEvents` and `WatchEventsSizes` metrics (`staging/src/k8s.io/apiserver/pkg/endpoints/metrics/metrics.go:170-179`), but the stream lifecycle is not traced end-to-end.

- **Filterlatency tracing**: HTTP filter chain latency is traced (`staging/src/k8s.io/apiserver/pkg/endpoints/filterlatency/filterlatency.go:59-61`), but this only covers the API server's own filter stack, not downstream async processing.

### 5. What debugging tooling exists for production issues?

**In-process tooling**:
- Verbose logging via `-v` and `-vmodule` flags at runtime (`staging/src/k8s.io/component-base/logs/klogflags/klogflags.go:25-41`)
- Health check endpoints (`/healthz?verbose`) for subsystem status
- `/metrics` endpoint for Prometheus-compatible metrics scrape
- `/configz`, `/flagz`, `/statusz` diagnostic endpoints (scheduler, apiserver)
- `klog.KObj()` helpers produce stable object references for log grepping

**Missing tooling**:
- No built-in request replay or shadow traffic capability
- No in-process distributed log aggregation (delegated to external tools)
- No interactive debugger; production debugging relies on logs + metrics + health checks

**Tracing**: OTLP exporter configurable via `--tracing-config-file` (`staging/src/k8s.io/apiserver/pkg/server/options/tracing.go:80-81`). Egress selector support for secure trace export.

## Architectural Decisions

1. **klog as canonical logger**: Kubernetes uses `klog/v2` as the standard logger across all components, not a third-party structured logger. This enforces consistency but limits advanced structured logging features (no native JSON output in core klog).

2. **Audit-ID as correlation ID**: Rather than using a generic `X-Request-ID`, Kubernetes adopted the Audit-ID (derived from audit policy) as the primary correlation mechanism. This works well for auditability but less intuitive for general debugging across services.

3. **Dual-span tracing**: `staging/src/k8s.io/component-base/tracing/tracing.go:33-44` creates both an OpenTelemetry span and a `k8s.io/utils/trace` span simultaneously. This enables OTel adoption without breaking components that haven't migrated yet.

4. **Health check delegation**: Each component (apiserver, scheduler, kubelet) implements its own health checks via a shared interface. No centralized health check aggregation beyond per-process `/healthz` endpoints.

5. **Metrics stability policy**: Kubernetes maintains a metric stability framework (`StabilityLevel` — STABLE/BETA/ALPHA) in `staging/src/k8s.io/apiserver/pkg/endpoints/metrics/metrics.go:63-318`, ensuring metrics follow semantic versioning.

## Notable Patterns

- **Contextual logging**: `klog.LoggerWithValues()` and `klog.LoggerWithName()` allow attaching persistent k-v pairs to a logger instance for the scope of an operation.
- **Filter chain tracing**: API server uses HTTP filter middleware (`staging/src/k8s.io/apiserver/pkg/endpoints/filters/traces.go`) to add OTel spans around each request.
- **Graceful livez handling**: `addDelayedHealthChecks()` (`staging/src/k8s.io/apiserver/pkg/server/healthz.go:46-63`) adds a startup grace period before livez checks report unhealthy, preventing premature load balancer removal.
- **Panic recovery**: `apiserver panic'd` logging at `staging/src/k8s.io/apiserver/pkg/server/filters/wrap.go:57` ensures panics in handlers are caught and logged rather than crashing the process.

## Tradeoffs

- **No native correlation ID header**: External systems cannot easily correlate requests into Kubernetes without implementing audit policy. The Audit-ID is not set on every request by external clients unless they explicitly set the `Audit-ID` header.

- **Log storage externalized**: Kubernetes outputs logs to stdout and relies on external collectors (e.g., cloud logging, EFK stack). This keeps the core simple but shifts operational burden to deployers.

- **Tracing opt-in**: OpenTelemetry tracing is configured via file (`--tracing-config-file`) and disabled by default. Operators must explicitly enable it, meaning tracing data may not be available during incident investigation if not pre-configured.

- **Metrics cardinality risk**: Per-resource, per-verb, per-scope metrics (22 labels on `requestLatencies`) can produce high cardinality in Prometheus. The SLO-latency metrics (`request_slo_duration_seconds`) address this by excluding webhook variability.

## Failure Modes / Edge Cases

- **Logging blocked**: `LogHealthz` (`staging/src/k8s.io/apiserver/pkg/server/healthz/healthz.go:66-92`) detects when klog flush is blocked and reports unhealthy. If logging blocks, operators lose visibility into the very system detecting the problem.

- **Audit ID truncation**: `GetAuditIDTruncated()` (`staging/src/k8s.io/apiserver/pkg/audit/context.go:407-421`) truncates Audit-ID to 64 characters. Very long Audit-IDs lose trailing characters used for correlation.

- **No-op TracerProvider**: When OTel is not configured, `WithTracing()` still handles context propagation via passthrough (`staging/src/k8s.io/apiserver/pkg/endpoints/filters/traces.go:63-65`). This prevents breakage but yields no useful trace data.

- **OTel memory leak prevention**: `otel.SetMeterProvider(noop.NewMeterProvider())` (`staging/src/k8s.io/apiserver/pkg/server/options/tracing.go:55`) prevents memory leaks from OTel metrics since Kubernetes doesn't use OTel metrics.

## Future Considerations

- **OpenTelemetry full adoption**: The dual-span approach is transitional. As OTel matures, `utiltrace` may be deprecated in favor of pure OTel spans. The `Span.End()` pattern in `tracing.go:64-69` already logs spans above threshold duration.

- **Work queue observability**: Adding per-item tracing for controller work queues would improve async boundary visibility. Currently, etcd transaction tracing is the closest approximation.

- **Structured JSON logging**: While JSON logging support exists in `k8s.io/component-base/logs/json`, it is not the default. Cloud-native deployments may benefit from standardizing JSON output for log aggregation tooling.

## Questions / Gaps

1. **No request-level tracing for aggregated API servers**: The audit-ID propagation to proxied requests (`staging/src/k8s.io/apiserver/pkg/util/proxy/proxy.go:182-183`) is good, but aggregated servers' own tracing spans are not correlated back to the root request without shared trace context.

2. **Controller reconciliation spans**: No evidence found of automatic per-reconciliation tracing spans in the controller manager. This is a significant gap for distributed system observability.

3. **Work queue depth metrics**: No evidence found of Prometheus metrics for work queue depth or age. Controller health is inferred via `InformerSyncHealthz` rather than queue depth.

4. **No built-in log query interface**: Logs are stdout-only. Operators must configure external log aggregation (Loki, ELK, cloud logging) for querying.

---

Generated by `dimensions/09-observability-operational-visibility.md` against `kubernetes`.