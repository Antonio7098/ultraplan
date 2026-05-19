# Source Analysis: temporal

## HTTP/API Surface Design

### Source Info

| Field | Value |
|-------|-------|
| Name | temporal |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/temporal` |
| Language / Stack | Go / gRPC-first with HTTP via grpc-gateway |
| Analyzed | 2026-05-19 |

## Summary

Temporal uses a **gRPC-first architecture** where HTTP is a thin wrapper around gRPC services via `grpc-ecosystem/grpc-gateway/v2`. The primary API surface is Protobuf-based gRPC, with HTTP serving as a convenience layer. Routes are organized by Protobuf service names, not REST resource patterns. The error contract is consistent through `serviceerror.ToStatus()` converting all errors to gRPC status codes. Pagination uses offset-based tokens with configurable max page sizes. No native HTTP streaming is supported—only gRPC streaming.

## Rating

**7/10** — Good implementation with minor issues. The gRPC-first design is coherent and scalable, but HTTP API is a secondary concern with limitations: no streaming over HTTP, no API versioning in URLs, and limited pagination patterns.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| HTTP Framework | `gorilla/mux` for prefix routing, `grpc-gateway/v2` runtime.ServeMux for gRPC-HTTP bridging | `service/frontend/http_api_server.go:15-16` |
| Route Registration | `MuxRouterProvider()` returns `mux.NewRouter().UseEncodedPath()` | `service/frontend/fx.go:961-963` |
| Route Registration | Handler routes registered via `fx.Invoke(RegisterNexusOperationHTTPHandler)` | `service/frontend/fx.go:119-121` |
| Type-safe Routes | Generic `routing.Route[T]` for path variable handling | `common/routing/route.go` |
| Nexus Route Def | `RouteDispatchNexusTaskByNamespaceAndTaskQueue` builder pattern | `common/nexus/routes.go:10-16` |
| Error Contract | `serviceerror.ToStatus()` converts all errors to gRPC status | `service/frontend/http_api_server.go:303` |
| Error Handler | Custom `errorHandler` method for HTTP error responses | `service/frontend/http_api_server.go:287-318` |
| Error Types | Package-level `serviceerror.NewInvalidArgument()` vars | `service/frontend/errors.go:8-60` |
| Pagination Config | `HistoryMaxPageSize` and `VisibilityMaxPageSize` dynamic config | `service/frontend/service.go:43,52` |
| Page Size Enforcement | Request page size clamped to `primitives.GetHistoryMaxPageSize` | `service/frontend/workflow_handler.go:952-969` |
| Middleware Chain | 20+ ordered gRPC UnaryServerInterceptors | `service/frontend/fx.go:270-299` |
| Stream Interceptors | `authInterceptor.InterceptStream` and `telemetryInterceptor.StreamIntercept` | `service/frontend/fx.go:307-309` |
| Rate Limiting | `NamespaceRateLimitInterceptor` and `RateLimitInterceptor` | `common/rpc/interceptor/namespace_rate_limit.go` |
| Auth Interceptor | `AuthorizationInterceptor` for TLS/JWT | `common/authorization/interceptor.go` |
| HTTP Streaming | Explicit error: `errHTTPGRPCStreamNotSupported = errors.New("stream not supported")` | `service/frontend/http_api_server.go:63` |
| Custom Marshaler | `newTemporalProtoMarshaler()` for payload shorthand notation | `service/frontend/protojson_marshaler.go` |
| Host Validation | `allowedHostsMiddleware` for host header validation | `service/frontend/http_api_server.go:274-285` |

## Answers to Dimension Questions

### 1. How are routes organised and registered — by resource, version, or domain?

Routes are organized by **Protobuf service names** (not REST resources). The grpc-gateway auto-generates HTTP routes from Protobuf definitions via `runtime.ServeMux` (`service/frontend/http_api_server.go:45,119-127`). Nexus HTTP handlers use a type-safe `routing.Route[T]` builder pattern (`common/nexus/routes.go:10-16`) with path variables like `namespace` and `task_queue`. There is no URL-based versioning—APIs are versioned via Protobuf package evolution.

### 2. Is there a consistent error contract clients can depend on?

**Yes.** All errors funnel through `serviceerror.ToStatus()` (`service/frontend/http_api_server.go:303`) which converts to gRPC status codes. The custom `errorHandler` (`service/frontend/http_api_server.go:287-318`) returns JSON errors with `code` and `message` fields matching the gRPC status proto. Predefined error constructors (`serviceerror.NewInvalidArgument()`, `serviceerror.NewPermissionDenied()`, etc.) in `service/frontend/errors.go:8-60` ensure consistent error creation across the codebase. HTTP status codes are derived from gRPC codes via `runtime.HTTPStatusFromCode()` (`service/frontend/http_api_server.go:316`).

### 3. How does the API handle pagination at scale without performance cliffs?

Pagination uses **opaque page tokens** (base64-encoded byte arrays) with configurable max page sizes. The `HistoryMaxPageSize` and `VisibilityMaxPageSize` dynamic config settings enforce limits (`service/frontend/service.go:43,52`). Page sizes are clamped to `primitives.GetHistoryMaxPageSize` if requested larger (`service/frontend/workflow_handler.go:952-969`). This prevents performance cliffs by enforcing server-defined limits rather than client-specified ones. However, the pagination strategy is offset-based (not cursor-based), which can have performance implications at extreme scales.

### 4. What middleware is global vs per-route, and how is layering managed?

**Global middleware only.** gRPC interceptors are chained in a fixed order via `grpc.ChainUnaryInterceptor()` (`service/frontend/fx.go:319`). The interceptor chain order is documented with comments explaining dependencies (e.g., "Telemetry interceptor must be after redirection" at line 288). Key interceptors include:

- **Outer (error masking):** `maskInternalErrorDetailsInterceptor`, `serviceErrorInterceptor`
- **Auth/Namespace:** `authInterceptor`, `namespaceValidatorInterceptor`, `namespaceHandoverInterceptor`
- **Rate limiting:** `namespaceCountLimiterInterceptor`, `namespaceRateLimiterInterceptor`, `rateLimitInterceptor`
- **Inner (retry):** `retryableInterceptor` (most inner, at line 305)

There is no per-route middleware granularity—interceptors apply globally to all requests.

### 5. How is API versioning handled without duplicating handlers?

**No URL-based versioning.** Temporal uses Protobuf package evolution for API versioning. The gRPC service name `temporal.api.workflowservice.v1.WorkflowService` embeds the version (`v1`) in the proto package name (`service/frontend/http_api_server.go:148`). Clients specify the version by importing the corresponding Protobuf package. This avoids handler duplication but means HTTP clients cannot version via URL paths—only by selecting the appropriate Protobuf-generated client.

## Architectural Decisions

1. **gRPC-first, HTTP-as-wrapper**: HTTP endpoints are auto-generated from Protobuf via grpc-gateway, not hand-crafted. This ensures protocol parity but introduces HTTP limitations (no streaming).

2. **Interceptor chain as middleware**: All auth, rate-limiting, and telemetry is implemented as gRPC interceptors, not HTTP middleware. This creates a unified pipeline but means HTTP-specific middleware (like CORS) must be added to the grpc-gateway middleware options (`service/frontend/http_api_server.go:142`).

3. **20+ interceptor order dependency**: The carefully ordered interceptor chain (documented in `fx.go:270-299`) reflects tight coupling between concerns (e.g., `namespaceHandoverInterceptor` must be above `redirectionInterceptor`).

4. **No streaming over HTTP**: Streaming is only supported via gRPC (`errHTTPGRPCStreamNotSupported` at `http_api_server.go:63`). Clients needing real-time events must use gRPC streams.

## Notable Patterns

- **Type-safe route builders**: `routing.NewBuilder[T]()` with `StringVariable()` and `Constant()` methods for compile-time path parameter typing (`common/routing/route.go`)
- **Error package-level vars**: Pre-constructed errors as package vars for allocation-free reuse (`service/frontend/errors.go:8`)
- **Payload shorthand marshaler**: Custom ProtoJSON marshaler with `pretty` and `noPayloadShorthand` query parameters for human-readable output (`service/frontend/protojson_marshaler.go`)
- **Host validation middleware**: `allowedHostsMiddleware` as a grpc-gateway middleware for host header validation (`http_api_server.go:274-285`)

## Tradeoffs

- **HTTP ergonomics vs. protocol power**: By making gRPC the primary protocol, Temporal gains strong typing, streaming, and binary serialization. HTTP clients get a usable but limited interface.
- **Interceptor ordering as brittle coupling**: The 20+ interceptor chain with documented ordering constraints makes adding or reordering interceptors risky.
- **No cursor pagination**: Offset-based pagination can cause performance degradation at high scan positions, unlike cursor-based pagination which maintains consistent performance.
- **Versioning via Protobuf packages**: Clean for generated clients, opaque for HTTP-only clients who cannot inspect or select versions via URL paths.

## Failure Modes / Edge Cases

- **Streaming over HTTP fails silently**: Any attempt to create an HTTP stream returns `errHTTPGRPCStreamNotSupported` (`http_api_server.go:63`), which may not be clearly communicated to HTTP-only clients.
- **Large page size requests are silently clamped**: If a client requests `MaximumPageSize > primitives.GetHistoryMaxPageSize`, the server silently reduces it without returning the actual page size used, potentially confusing clients about result sizes.
- **Host header validation**: Requests with non-matching `Host` headers are rejected with HTTP 403 before reaching any handler (`http_api_server.go:281-284`).
- **Error marshal failures**: If error marshaling fails, a hardcoded `{"code": 13, "message": "failed to marshal error message"}` JSON is returned, leaking the marshal failure itself (`http_api_server.go:312`).

## Future Considerations

- **Cursor-based pagination**: Would improve pagination performance at scale by avoiding OFFSET scan costs.
- **Per-route interceptors**: Currently all interceptors are global; adding per-route interceptor configuration would improve granularity.
- **HTTP streaming support**: SSE or chunked transfer for real-time events over HTTP would improve browser/edge client compatibility.
- **API versioning in URLs**: URL-based versioning (e.g., `/v1/namespaces`) would improve HTTP client ergonomics and API discoverability.

## Questions / Gaps

- **No clear evidence of rate-limit response headers**: While `rateLimitInterceptor` exists, the actual rate limit headers (e.g., `X-RateLimit-Remaining`) returned to clients were not identified in the analysis.
- **No evidence of CORS configuration**: HTTP CORS headers and configuration were not found in the grpc-gateway setup.
- **No evidence of request batching**: While gRPC supports batched requests, HTTP API batch endpoint patterns were not identified.
- **Streaming interceptors limited**: Only 2 stream interceptors are defined vs 20+ unary interceptors, suggesting streaming is a secondary concern.

---

Generated by `dimensions/04-http-api-surface.md` against `temporal`.