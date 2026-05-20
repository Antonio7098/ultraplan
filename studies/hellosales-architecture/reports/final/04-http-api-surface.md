# HTTP/API Surface Design - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Dimension | `04-http-api-surface` |
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

Nine production systems were analyzed across a wide spectrum of HTTP API design philosophies. The most critical finding: **there is no consensus on versioning, pagination strategy, or middleware architecture** — and that divergence is largely correct. Each design choice reflects the product's maturity, audience, and operational constraints. Systems with public or multi-client APIs (Kubernetes, OpenFGA) invest heavily in consistent error contracts and cursor-based pagination; internal or single-tenant systems (PocketBase, nats-server) accept simpler tradeoffs. The gRPC-first trend (OpenFGA, Temporal, Milvus) is real but does not eliminate the need for well-designed HTTP error and pagination contracts, which remain inconsistent even in gRPC-gateway deployments.

## Core Thesis

HTTP API surface design sits at the intersection of protocol choice, organizational patterns, and operational maturity. The sources studied reveal three distinct strata: (1) **gRPC-first systems** that treat HTTP as a legacy wrapper, (2) **HTTP-native systems** with rich routing and middleware, and (3) **minimal HTTP systems** that treat HTTP as infrastructure rather than a primary interface. Each stratum makes different tradeoffs around routing flexibility, error consistency, and versioning. No source demonstrates all best practices simultaneously — even high-scoring systems (Kubernetes, Grafana, OpenFGA) have notable gaps in streaming support, rate limiting, or API versioning.

## Rating Summary

| Source | Score | Approach | Main Strength | Main Concern |
|--------|-------|----------|---------------|--------------|
| cli | 5/10 | Client-only API consumer | Feature detection over versioning; pagination readers | No server surface; inconsistent error contract; no streaming |
| grafana | 8/10 | Custom web framework + RouteRegister | Structured errutil errors; SLO-aware middleware; group routing | No URL versioning; offset pagination; no streaming |
| kubernetes | 8/10 | go-restful + internal version conversion | StatusError contract; Continue token pagination; Watch streaming | No built-in rate limiting; deprecation handling gaps |
| milvus | 6/10 | gRPC-first + Gin HTTP wrapper | merr structured errors; hard pagination bounds | Inconsistent HTTP error responses; no HTTP streaming; dual HTTP server patterns |
| nats-server | 4/10 | net/http flat mux | Simplicity; path constants | No middleware; no auth; two error systems; no pagination at scale |
| openfga | 8/10 | gRPC + grpc-gateway v2 | Consistent error codes; cursor pagination; interceptor chain | No URL versioning; no per-route middleware; HTTP streaming via gRPC only |
| pocketbase | 7/10 | Custom Router on http.ServeMux | ApiError contract; priority middleware chain; SSE realtime | No API versioning; offset pagination; in-memory rate limiter |
| temporal | 7/10 | gRPC-first + grpc-gateway | serviceerror contract; interceptor chain; type-safe routes | No HTTP streaming; no URL versioning; offset-based pagination tokens |
| victoriametrics | 8/10 | net/http domain-divided routing | ErrorWithStatusCode; chunked streaming export; multi-protocol | No cursor pagination; implicit middleware layering; no formal versioning |

## Approach Models

### 1. gRPC-First with HTTP Gateway (OpenFGA, Temporal, Milvus)

These systems treat gRPC as the primary protocol and generate HTTP/JSON from protobuf definitions via grpc-gateway. Routes are auto-generated, not manually registered. Middleware is implemented as gRPC interceptors in a fixed chain. Error contracts are derived from gRPC status codes mapped to custom error code enums.

**Characteristic evidence:**
- OpenFGA: `openfgav1.RegisterOpenFGAServiceHandler` auto-generates HTTP routes from proto (`cmd/run/run.go:768-773`)
- Temporal: `runtime.ServeMux` bridges HTTP to gRPC (`service/frontend/http_api_server.go:45`)
- OpenFGA interceptor chain: `grpc.ChainUnaryInterceptor(recovery, logging, requestid, storeid, validator, prometheus)` (`cmd/run/run.go:563-641`)
- Temporal 20+ interceptors in documented dependency order (`service/frontend/fx.go:270-299`)

### 2. HTTP-Native with Rich Routing (Grafana, PocketBase)

These systems build custom routing layers on top of Go's standard library or gorilla/mux, with declarative route registration, group-based middleware inheritance, and structured error contracts.

**Characteristic evidence:**
- Grafana `RouteRegister` interface with `Get/Post/Put/Delete/Patch/Any/Group` (`pkg/api/routing/route_register.go:18-50`)
- PocketBase `Router[T]` wrapper with `Group()` and method chaining (`tools/router/group.go:33-173`)
- Grafana hierarchical route groups: `r.Group("/api", func(apiRoute) {...}, reqSignedIn)` (`pkg/api/api.go:288`)
- PocketBase global middleware bound by priority: `rateLimit=-1000, activityLogger=-1040` (`apis/middlewares.go:31-49`)

### 3. Domain-Divided Single Dispatcher (VictoriaMetrics, Kubernetes)

A single request handler dispatches to domain-specific sub-handlers based on path, with global middleware applied at the entry point.

**Characteristic evidence:**
- VictoriaMetrics `requestHandler` dispatches via `vminsert.RequestHandler()`, `vmselect.RequestHandler()` (`app/victoria-metrics/main.go:130-167`)
- Kubernetes `APIInstaller.Install()` maps HTTP verbs to `rest.Storage` methods (`staging/src/k8s.io/apiserver/pkg/endpoints/installer.go:196`)
- VictoriaMetrics `handlerWrapper` applies panic recovery, security headers, CORS, then dispatches (`lib/httpserver/httpserver.go:307-376`)
- Kubernetes filter chain: Authentication → Authorization → Audit → Deadline (`pkg/controlplane/apiserver/config.go:200-230`)

### 4. Minimal HTTP Infrastructure (nats-server, CLI client)

HTTP is either absent as a primary protocol (nats-server uses NATS protocol; CLI is a client-only) or treated as a thin wrapper with flat route registration.

**Characteristic evidence:**
- nats-server flat `mux.HandleFunc()` with path constants (`server/server.go:3110-3143`)
- CLI delegates all HTTP to `go-gh` library (`go.mod:21`)
- nats-server monitoring has no auth, no middleware, plain-text errors (`server/monitor.go:668`)

## Pattern Catalog

### Pattern 1: Structured Error Contract via Dedicated Error Type

**Problem:** Clients need predictable error shapes to handle failures programmatically.

**Sources demonstrating it:** Kubernetes (`StatusError` + `metav1.Status`), Grafana (`errutil.Error` + `PublicError`), OpenFGA (gRPC `status.Error` + `openfgav1.ErrorCode`), PocketBase (`ApiError` + `safeErrorsData`), VictoriaMetrics (`ErrorWithStatusCode`).

**Mechanism:** A single error struct or family of factory functions covers all error cases, with fields for machine-readable code, human-readable message, HTTP status, and structured details (e.g., field validation causes).

**Why it works:** Clients can switch on error codes rather than parsing string messages. The error hierarchy lives in one place, making enforcement consistent.

**When to copy:** Any API that will be consumed by more than one client or that needs to communicate failure details programmatically.

**When overkill:** Internal-only services behind a trusted network where callers have direct access to the service's error types.

**Evidence:**
- Kubernetes: `NewNotFound()`, `NewForbidden()`, `NewConflict()` factories produce `StatusError` (`staging/src/k8s.io/apimachinery/pkg/api/errors/errors.go:145-387`)
- Grafana: `errutil.Error` with `Reason`, `MessageID`, `PublicMessage`, `PublicPayload` (`pkg/apimachinery/errutil/errors.go:316-370`)
- VictoriaMetrics: `ErrorWithStatusCode` embeds `error` and `StatusCode int` (`lib/httpserver/httpserver.go:712-727`)

### Pattern 2: Cursor-Based Pagination with Opaque Tokens

**Problem:** Offset-based pagination degrades at scale because the database must scan and discard rows.

**Sources demonstrating it:** Kubernetes (Continue token), OpenFGA (ContinuationTokenSerializer), CLI (Link header parsing).

**Mechanism:** The server returns an opaque continuation token with each response. The client sends that token back on the next request. The token encodes position in a stable sort order, typically using `resourceVersion` or a database offset encoded and signed/encrypted.

**Why it works:** The server can resume from the exact next item without scanning preceding rows, maintaining consistent performance regardless of page depth.

**When to copy:** Any list endpoint that can return more than ~1000 items or that operates on data with natural cursor points (insertion order, timestamp, sequential ID).

**When overkill:** Small, static datasets where offset pagination completes in <50ms at maximum page depth.

**Evidence:**
- Kubernetes `Continue` token on `ListMeta` with `RemainingItemCount` (`staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go:82,94`)
- OpenFGA `PaginationOptions` with `PageSize` and `ContinuationToken` (`pkg/storage/storage.go:1-19`)
- Kubernetes `serveWatchHandler` with WebSocket support (`staging/src/k8s.io/apiserver/pkg/endpoints/handlers/watch.go:72-188`)

### Pattern 3: Global Interceptor/Filter Chain with Fixed Order

**Problem:** Cross-cutting concerns (auth, logging, metrics, recovery) must be applied consistently to every request without per-route boilerplate.

**Sources demonstrating it:** Kubernetes (filters chain), OpenFGA (gRPC interceptors), Temporal (20+ interceptors), VictoriaMetrics (`handlerWrapper`).

**Mechanism:** A single chain of handlers is composed at startup. Every request passes through every handler in order. Long-running requests (watch, exec) are exempted by a `BasicLongRunningRequestCheck`.

**Why it works:** No chance of a handler slipping through without auth or recovery. Order is predictable and testable. Adding a new cross-cutting concern means adding one line to the chain.

**When to copy:** Any service where security and observability are non-negotiable, and where the set of cross-cutting concerns is stable.

**When overkill:** Simple services with few endpoints where per-route middleware is clearer and the operational overhead of maintaining a global chain is not justified.

**Caution:** Fixed order creates隐性 coupling. Temporal's comment "Telemetry interceptor must be after redirection" (`service/frontend/fx.go:288`) illustrates how order dependencies become API contracts that are hard to change.

**Evidence:**
- Kubernetes: Authentication → Authorization → Audit → Deadline filters (`pkg/controlplane/apiserver/config.go:200-230`)
- VictoriaMetrics `handlerWrapper`: panic recovery → security headers → CORS → dispatch (`lib/httpserver/httpserver.go:307-376`)
- OpenFGA: `grpc.ChainUnaryInterceptor` with 7 interceptors (`cmd/run/run.go:563-641`)

### Pattern 4: Route Grouping with Middleware Inheritance

**Problem:** Related routes share auth, prefix, and middleware requirements. Duplicating these per route is error-prone and verbose.

**Sources demonstrating it:** Grafana (RouteRegister.Group), PocketBase (Router.Group with priority hooks).

**Mechanism:** Routes are registered in nested groups. Each group has an optional prefix and optional middleware. Child routes inherit parent middleware and prefix. Routes can opt out of inherited middleware via an exclusion mechanism.

**Why it works:** The route hierarchy mirrors the resource hierarchy. Adding a resource automatically gets the correct auth and prefix. Middleware exclusion provides fine-grained control without abandoning inheritance.

**When to copy:** Any API with more than ~20 endpoints where routes naturally cluster by domain (e.g., `/api/users`, `/api/orders`, `/api/products`).

**Evidence:**
- Grafana: `r.Group("/api", func(apiRoute) {...}, reqSignedIn)` — group-level auth applied to all child routes (`pkg/api/api.go:288`)
- PocketBase: `Route.Unbind(middlewareId)` for exclusion (`tools/router/route.go:45-73`)

### Pattern 5: SSE Realtime over WebSocket

**Problem:** Browser clients need real-time updates but WebSocket support requires more infrastructure (proxy configuration, TLS ALPN, etc.).

**Sources demonstrating it:** PocketBase (realtime SSE endpoint), Kubernetes (chunked Watch), VictoriaMetrics (chunked `/api/v1/export`), OpenFGA (gRPC streaming), Temporal (gRPC streaming only).

**Mechanism:** Server-Sent Events deliver server-to-client push over HTTP/1.1. The server sends `text/event-stream` content type with `Flush()` for chunked delivery. Connections are long-lived with idle timeouts and cancellable contexts.

**Why it works:** SSE works through most HTTP proxies without special configuration. It uses standard HTTP, making it simpler to serve from existing HTTP servers.

**When to copy:** When the primary clients are browsers or when proxy compatibility is a concern. When you need server-to-client streaming without the complexity of WebSocket upgrades.

**When to prefer WebSocket:** When you need bidirectional communication, when clients are not browsers, when you need sub-100ms latency, when you need binary data.

**Evidence:**
- PocketBase: `text/event-stream` with `Flush()` (`apis/realtime.go:58-91`)
- VictoriaMetrics `scalableWriter` flushes >=1MB chunks (`app/vmselect/prometheus.go:1265-1301`)

### Pattern 6: API Versioning via Internal Type Conversion

**Problem:** Supporting multiple API versions without duplicating handler logic.

**Sources demonstrating it:** Kubernetes (internal version conversion), Temporal (protobuf package versioning).

**Mechanism:** Storage and business logic operate on internal types. The API boundary converts between internal and versioned types. Multiple API versions can be served simultaneously from the same storage. The path encodes version (`/apis/batch/v1`) but the handler is shared.

**Why it works:** Handlers are not duplicated because the versioned path is mapped to a shared storage backend with conversion functions. Breaking changes in a new version get new conversion functions, not new handlers.

**When to copy:** When you need to support multiple API versions simultaneously and when storage is the bottleneck rather than handler logic.

**Evidence:**
- Kubernetes `APIGroupVersion` with `Storage` map shared across versions (`staging/src/k8s.io/apiserver/pkg/endpoints/groupversion.go:50`)
- Temporal protobuf package `temporal.api.workflowservice.v1` embeds version in proto package name (`service/frontend/http_api_server.go:148`)

### Pattern 7: Priority-Based Hook/Middleware Chain

**Problem:** Middleware execution order matters and must be explicit. Fixed chain order is too rigid; per-route registration is too verbose.

**Sources demonstrating it:** PocketBase.

**Mechanism:** Each middleware has a numeric priority. Lower (more negative) executes first. Middlewares are `hook.Handler[T]` instances with an `Id`, `Priority`, and `Func`. The router sorts by priority and executes in order. Routes can bind or unbind specific middleware IDs.

**Why it works:** Adding a new middleware doesn't require renumbering others. The priority system is more flexible than a fixed list while being more explicit than inheritance-based grouping.

**Evidence:**
- PocketBase priority constants: `rateLimit=-1000, activityLogger=-1040, panicRecover=-1030` (`apis/middlewares.go:31-49`)

## Key Differences

### Why gRPC-First Systems Handle HTTP Differently

OpenFGA, Temporal, and Milvus all use grpc-gateway to expose HTTP/JSON. This produces fundamentally different route registration: routes are auto-generated from `.proto` files rather than manually registered. The benefit is protocol-level type safety and automatic documentation from proto definitions. The cost is limited routing flexibility — custom HTTP routes are hard to add, per-route middleware doesn't exist, and streaming over plain HTTP is not supported.

This is a **valid constraint**, not a quality gap. These systems optimized for machine-to-machine communication with strong contracts. HTTP is a convenience layer, not the primary surface.

### Why Pagination Strategies Diverge

Three distinct pagination models emerged:

1. **Cursor-based** (Kubernetes, OpenFGA, CLI): Opaque tokens encoding stable sort position. Best for large, dynamic datasets.
2. **Offset-based** (Grafana, PocketBase, Milvus, Temporal): `page` and `limit` parameters. Simpler for clients but degrades at depth.
3. **Time-range-based** (VictoriaMetrics): `start`/`end` parameters with `limit`. Natural for time-series data but not general-purpose.

Kubernetes' `Continue` token and OpenFGA's continuation serializer are the most scalable approaches, but they require more server-side state management. Offset pagination is a reasonable default for APIs with moderate data sizes. Time-range pagination is the right model for VictoriaMetrics' workload and aligns with Prometheus conventions.

### Why Middleware Architecture Varies

No single middleware model dominates. The variation reflects operational maturity and threat surface:

- **gRPC interceptor chains** (OpenFGA, Temporal): Fixed order, no per-route configuration. Simple and fast. Cannot express "this endpoint needs different auth."
- **RouteRegister groups** (Grafana): Hierarchical with optional group middleware. Supports inheritance but requires careful design to avoid unintended propagation.
- **Priority hooks** (PocketBase): Most flexible — any middleware can be bound or unbound per-route. Most complex to reason about.
- **Handler guards** (VictoriaMetrics): Auth is an explicit function call within handlers that need it, not a declarative middleware. Hardest to audit but clearest at the call site.
- **No middleware** (nats-server, CLI): Appropriate when HTTP is not a trust boundary.

### Why API Versioning Is Mostly Absent

Seven of nine sources do not use URL-based API versioning (`/api/v1/`). The reasons vary:

- **gRPC-first systems** (OpenFGA, Temporal, Milvus): Version is embedded in protobuf package names, not URLs. HTTP clients must track versions differently.
- **Single-tenant frameworks** (PocketBase): Versioning is an accepted tradeoff for simplicity. Breaking changes affect a known client set.
- **Internal systems** (nats-server, VictoriaMetrics): HTTP is auxiliary; the primary protocol (NATS, Prometheus) handles compatibility differently.
- **Kubernetes**: Uses internal version conversion — technically versioning but not URL-based.

Only Kubernetes demonstrates a versioning strategy (internal conversion) that avoids handler duplication. The others effectively punt on versioning or treat it as a future concern.

## Tradeoffs

| Design Choice | Benefit | Cost | Best-Fit Context | Failure Mode |
|---------------|---------|------|-------------------|--------------|
| Custom router wrapper (Grafana, PocketBase) | Deep control over routing, grouping, middleware inheritance | Maintenance burden; contributors must learn non-standard patterns | Medium-to-large APIs with many teams contributing routes | Router becomes a dependency that must be kept compatible |
| go-restful (Kubernetes) | Well-understood framework; good ecosystem | Implicit route ordering; registration-order-dependent matching | Kubernetes-scale API servers | Route shadowing if sorting logic has bugs |
| gRPC-first + grpc-gateway (OpenFGA, Temporal) | Type safety; automatic route generation; strong contracts | No per-route middleware; limited HTTP routing flexibility; no HTTP streaming | Machine-to-machine APIs; services with strong typed contracts | HTTP-only clients hit hard limitations; gateway becomes a bottleneck |
| Cursor-based pagination (Kubernetes, OpenFGA) | Consistent performance at any page depth | More complex server state; token expiration edge cases | High-scale list endpoints; dynamic datasets | Expired tokens return 410; clients must restart from beginning |
| Offset pagination (Grafana, PocketBase) | Simple mental model; easy to implement and debug | Performance degrades at high offsets | Small-to-medium datasets (<100k items); stable datasets |
| SSE realtime (PocketBase) | Works through standard proxies; simple HTTP-based push | Unidirectional only; no binary data; less efficient than WebSocket | Browser clients; server-to-client event streams | Long-lived connections consume server resources |
| Global error contract (Kubernetes, Grafana, OpenFGA) | Predictable client error handling; machine-readable codes | More upfront design; verbose for simple errors | Multi-client or public APIs | Error code proliferation if not governed |
| No API versioning (most sources) | Simplicity; no handler duplication | Breaking changes affect all clients simultaneously | Internal APIs; single-tenant deployments | Cannot evolve API without coordination |

## Decision Guide

**Should you use URL-based versioning?**
- Use it if you have public or multi-client APIs where clients cannot coordinate upgrades (Kubernetes approach via `/apis/<group>/<version>/`).
- Avoid it if you control both server and client, or if versioning would create duplicate handler maintenance without proportional benefit.
- Consider protobuf package versioning if you are already gRPC-first and your clients are generated.

**Should you use cursor or offset pagination?**
- Use cursor-based if list results can exceed ~1000 items, if the dataset changes between requests, or if you need consistent latency at any page depth.
- Use offset-based if datasets are small (<10k items), relatively static, and simplicity matters more than peak performance.
- Use time-range pagination if your data is time-series and natural pagination is by timestamp.

**Should you use a custom router or a standard library?**
- Use a custom router if you need middleware grouping with inheritance, declarative route organization that mirrors your domain, or you are building a framework (Grafana, PocketBase).
- Use gorilla/mux, chi, or go-restful if you need idiomatic Go routing without the maintenance burden of a custom layer.
- Use net/http directly if simplicity is paramount and your routing needs are flat (nats-server, VictoriaMetrics domain dispatch).

**Should you invest in structured error contracts?**
- Yes, if the API is public, multi-tenant, or consumed by more than one team.
- The minimum viable version: one error struct with `StatusCode`, `Message`, and `Code` fields, plus factory constructors for common cases.
- No, if the API is purely internal and callers have direct access to service types.

**Should you use gRPC or HTTP/JSON?**
- Use gRPC if you need streaming, type-safe client generation, or if most clients can use generated code.
- Use HTTP/JSON if your clients are browsers, heterogeneous, or cannot adopt gRPC.
- Consider grpc-gateway if you want both but can accept the limitations (no per-route middleware, no HTTP streaming).

## Practical Tips

1. **Define error factory functions, not raw error construction.** Kubernetes' `NewNotFound(resource, name)` and Grafana's `errutil.NewNotFound()` create consistent errors without requiring callers to know HTTP status codes. `pkg/api/errors/errors.go:145-387`

2. **Use `limit` enforcement with hard caps, not just defaults.** VictoriaMetrics' `maxSeriesLimit` and Kubernetes' `MaxRequestBodyBytes` prevent client-specified values from causing server resource exhaustion. `app/vmselect/prometheus.go:59`

3. **Make long-running request detection explicit.** Kubernetes' `BasicLongRunningRequestCheck` excludes watch/proxy from timeout enforcement. Without this, long-running requests get killed by deadline middleware. `staging/src/k8s.io/apiserver/pkg/endpoints/filters/request_deadline.go:49-50`

4. **Apply auth at the outermost appropriate layer.** OpenFGA's `storeid.NewUnaryInterceptor()` extracts store ID before auth runs. Temporal's `authInterceptor` runs early in the chain. This prevents unauthenticated requests from consuming resources. `cmd/run/run.go:563-641`

5. **Return `RemainingItemCount` or total count metadata in paginated responses.** Kubernetes' `RemainingItemCount` lets clients estimate progress without fetching all pages. `staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go:94`

6. **Support `skipTotal` for paginated list endpoints.** PocketBase's `skipTotal` option avoids expensive `COUNT(*)` queries when clients don't need an exact total. `tools/search/provider.go:51`

7. **Use priority constants for middleware order, not line-number ordering.** PocketBase's priority system (`rateLimit=-1000`) is more maintainable than a comment saying "this must come after that." `apis/middlewares.go:31-49`

8. **Expose graceful shutdown state via `/health`.** VictoriaMetrics' `/health` returns 503 during shutdown delay, signaling load balancers to drain traffic. `lib/httpserver/httpserver.go:391-404`

9. **Mask sensitive values in HTTP responses.** Milvus' `hideSensitive()` redacts passwords and API keys from config endpoints before returning via HTTP. `internal/proxy/http_req_impl.go:61-75`

10. **Validate page size bounds server-side.** Milvus enforces `offset + limit <= 16384` to prevent unbounded query execution. `internal/proxy/util.go:181-195`

## Anti-Patterns / Caution Signs

1. **Two incompatible error systems in the same HTTP API.** nats-server has `ApiError` for JetStream and plain Go errors for monitoring HTTP — clients cannot use a single error-handling strategy. `server/monitor.go:668` vs `server/jetstream_errors.go:57-61`

2. **No auth on any HTTP endpoints when some handle sensitive data.** Milvus has no global HTTP auth — only `/_telemetry/*` is protected. `internal/proxy/telemetry_http_handler.go:39-100`

3. **Middleware order documented only in comments, not enforced structurally.** Temporal's 20+ interceptor chain has documented dependencies (`fx.go:288`: "Telemetry interceptor must be after redirection") that are not checked at compile time. `service/frontend/fx.go:270-299`

4. **Offset pagination with no maximum limit.** If `MaxPerPage` is absent, clients can request millions of rows and cause OOM or database overload. All offset-based systems should enforce caps.

5. **ResponseWriter abort on hard error.** VictoriaMetrics' `responseWriterWithAbort.abort()` writes incorrect HTTP chunks to signal connection abortion. This leaves clients in undefined state. `lib/httpserver/httpserver.go:643-670`

6. **Global rate limiter without per-tenant isolation.** PocketBase's in-memory rate limiter doesn't work across multiple server instances. `tools/store/store.go`

7. **Hardcoded pagination limits.** nats-server's `JSApiNamesLimit=1024` and `JSApiListLimit=256` cannot be configured for large deployments. `server/jetstream_api.go:453-454`

8. **Handler that calls `os.Exit(1)` on panic.** VictoriaMetrics' `handlerWrapper` exits the process on panic rather than recovering and returning 500. `lib/httpserver/httpserver.go:313-320`

## Notable Absences

**Rate limiting in core HTTP servers.** Kubernetes, OpenFGA, Temporal, and nats-server have no built-in HTTP-level rate limiting. Rate limiting exists in specialized layers (kube-apiserver uses API priority/fairness in a separate layer; Temporal has namespace rate limit interceptors) but not as a general HTTP middleware. VictoriaMetrics' rate limiting is in a separate `vmauth` component.

**WebSocket support.** Only Kubernetes (via `golang.org/x/net/websocket` in `serveWatchHandler`) and PocketBase (SSE, not WebSocket) have any streaming beyond chunked transfer. OpenFGA, Temporal, and Milvus only support streaming via gRPC protocols.

**OpenAPI/Swagger documentation.** Only Grafana has visible swagger annotations (`pkg/api/swagger.go`). OpenFGA's proto definitions could generate OpenAPI but it was not noted as implemented.

**Per-route middleware in gRPC-first systems.** OpenFGA and Temporal apply all middleware globally via interceptor chains. There is no mechanism to say "this endpoint needs additional validation" or "that endpoint should skip auth" without modifying the global chain.

**Formal API deprecation handling.** Most sources do not show evidence of a structured deprecation process. Kubernetes has `staging/src/k8s.io/apiserver/pkg/endpoints/deprecation/` but its visibility was limited in the analysis.

## Per-Source Notes

**cli (5/10):** Not an API server — evaluated as an API client. Feature detection over versioning is a pragmatic pattern. The generic `gh api` command is a standout power-user feature. Error contract is delegated to `go-gh` and varies by endpoint.

**grafana (8/10):** The `errutil` error system and `RouteRegister` interface are the strongest patterns. SLO-aware middleware classification (`SetSLOGroup`) is unusual and operationally valuable. Offset pagination with 5000 max limit is the main scalability concern.

**kubernetes (8/10):** The gold standard for API surface design in this study. `StatusError`, Continue token pagination, Watch streaming, and internal version conversion are all patterns worth studying carefully. No built-in rate limiting is the main gap.

**milvus (6/10):** The `merr` error package is well-designed but inconsistently applied at the HTTP layer. The dual HTTP server pattern (Gin + standard library) is technical debt. gRPC is the primary API; HTTP is secondary.

**nats-server (4/10):** The lowest-scoring system in this dimension. HTTP is purely monitoring-oriented, not a primary API surface. No middleware, no auth, two error systems. Appropriate given NATS protocol primacy but limiting for HTTP-focused users.

**openfga (8/10):** gRPC-first done right. The interceptor chain is clean and well-documented. Cursor-based pagination with SQL continuation token serialization is a strong pattern. No URL versioning is a limitation for REST-oriented clients.

**pocketbase (7/10):** Priority-based middleware hooks and middleware exclusion (`Unbind`) are sophisticated patterns for a BaaS framework. SSE realtime is well-implemented. Offset pagination and lack of versioning are accepted tradeoffs.

**temporal (7/10):** The 20+ interceptor chain demonstrates sophisticated cross-cutting concern composition. Type-safe route builders (`routing.Route[T]`) are a strong pattern. No HTTP streaming and no URL versioning are notable limitations for HTTP-native clients.

**victoriametrics (8/10):** The domain-divided `requestHandler` dispatch and chunked streaming export are well-designed. Prometheus-compatible error format is a deliberate and well-executed bet. Implicit middleware layering and lack of cursor pagination are the main gaps.

## Open Questions

1. **How do Kubernetes production deployments handle API server rate limiting?** The analysis found no built-in rate limiter in kube-apiserver itself. Is API priority and fairness (APF) the standard approach, and does it satisfy all rate-limiting needs?

2. **Why do Milvus and Temporal maintain dual HTTP server patterns?** Milvus has Gin-based REST and standard library management routes. Temporal uses grpc-gateway for generated routes but has separate Nexus HTTP handlers. Is convergence planned?

3. **How does OpenFGA's continuation token handle storage migration?** If the SQL schema changes, can existing continuation tokens be migrated, or do clients receive 410 errors?

4. **What is VictoriaMetrics' strategy for cursor-based pagination?** The `/api/v1/export` endpoint streams large datasets via chunked transfer, but clients needing pagination across many distinct queries have no cursor mechanism. Is this by design or a planned feature?

5. **How do gRPC-first systems intend to evolve their HTTP APIs without URL versioning?** OpenFGA and Temporal have protobuf package versioning but no URL path versioning. If an HTTP-only client needs to pin an API version, what is the mechanism?

## Evidence Index

Every evidence reference uses the format `source/path/to/file:NN` consistent with per-source reports.

### cli
- `go.mod:21` — go-gh dependency
- `pkg/cmd/root/root.go:82-95` — PersistentPreRunE auth check
- `pkg/cmdutil/errors.go:12-70` — error sentinel types
- `api/client.go:46-53` — HTTPError wrapper
- `pkg/cmd/api/pagination.go:17-24` — Link header parsing
- `pkg/cmd/api/pagination.go:94-110` — per_page=100 default
- `api/client.go:19` — X-GitHub-Api-Version header

### grafana
- `pkg/api/api.go:64` — registerRoutes()
- `pkg/api/api.go:288` — Group() with reqSignedIn
- `pkg/api/routing/route_register.go:18-50` — RouteRegister interface
- `pkg/apimachinery/errutil/errors.go:316-370` — errutil.Error
- `pkg/apimachinery/errutil/errors.go:450-478` — PublicError
- `pkg/api/http_server.go:678-743` — addMiddlewaresAndStaticRoutes()
- `pkg/api/search.go:32-44` — pagination with max 5000
- `pkg/middleware/requestmeta/request_metadata.go:31-50` — SLOGroupHighFast etc.

### kubernetes
- `staging/src/k8s.io/apiserver/pkg/endpoints/installer.go:196` — APIInstaller.Install()
- `staging/src/k8s.io/apimachinery/pkg/api/errors/errors.go:35` — StatusError
- `staging/src/k8s.io/apimachinery/pkg/api/errors/errors.go:145-387` — error factory functions
- `staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go:82,94` — Continue token, RemainingItemCount
- `staging/src/k8s.io/apiserver/pkg/endpoints/handlers/watch.go:72-188` — serveWatchHandler
- `pkg/controlplane/apiserver/config.go:200-230` — filter chain
- `staging/src/k8s.io/apiserver/pkg/endpoints/filters/authentication.go:46-89` — WithAuthentication
- `staging/src/k8s.io/apiserver/pkg/endpoints/groupversion.go:50` — APIGroupVersion Storage map

### milvus
- `internal/proxy/impl.go:6894-6948` — RegisterRestRouter
- `internal/proxy/http_req_impl.go:24` — Gin import
- `pkg/util/merr/errors.go:49-259` — error code ranges
- `pkg/util/merr/errors.go:275-295` — milvusError struct
- `internal/proxy/task_query.go:328` — parseQueryParams
- `internal/proxy/util.go:181-195` — validateMaxQueryResultWindow
- `internal/proxy/telemetry_http_handler.go:39-100` — TelemetryAuthMiddleware

### nats-server
- `server/server.go:3110` — http.NewServeMux()
- `server/server.go:3009-3023` — path constants
- `server/server.go:3148-3154` — http.Server config
- `server/jetstream_api.go:397-402` — ApiPaged struct
- `server/jetstream_api.go:453-454` — JSApiNamesLimit, JSApiListLimit
- `server/jetstream_errors.go:57-61` — ApiError structure
- `server/monitor.go:660-700` — inline error writing

### openfga
- `cmd/run/run.go:766` — grpc_runtime.NewServeMux
- `cmd/run/run.go:768-773` — RegisterOpenFGAServiceHandler
- `cmd/run/run.go:563-641` — grpc.ChainUnaryInterceptor
- `pkg/server/errors/errors.go:20-38` — error definitions
- `pkg/middleware/http/handler.go:66-118` — CustomHTTPErrorHandler
- `pkg/storage/storage.go:1-19` — PaginationOptions
- `pkg/server/config/config.go:34` — default page size 100
- `pkg/server/list_objects.go:194-328` — StreamedListObjects

### pocketbase
- `tools/router/router.go:44` — Custom Router[T] wrapper
- `tools/router/group.go:33-173` — Group() + method helpers
- `apis/base.go:30-36` — 7 global middlewares
- `tools/router/error.go:36-42` — ApiError struct
- `tools/search/provider.go:17-18,47-48` — Page/PerPage, defaults
- `tools/search/provider.go:331` — Offset calculation
- `apis/realtime.go:58-91` — SSE implementation
- `apis/middlewares.go:31-49` — priority constants

### temporal
- `service/frontend/http_api_server.go:15-16` — gorilla/mux + grpc-gateway
- `service/frontend/fx.go:270-299` — 20+ interceptor chain
- `service/frontend/http_api_server.go:303` — serviceerror.ToStatus()
- `service/frontend/http_api_server.go:287-318` — errorHandler
- `service/frontend/workflow_handler.go:952-969` — page size clamping
- `service/frontend/http_api_server.go:63` — errHTTPGRPCStreamNotSupported
- `common/nexus/routes.go:10-16` — type-safe Route[T] builder

### victoriametrics
- `app/victoria-metrics/main.go:130-167` — requestHandler dispatch
- `lib/httpserver/httpserver.go:307-376` — handlerWrapper
- `lib/httpserver/httpserver.go:712-727` — ErrorWithStatusCode
- `lib/httpserver/prometheus_error_response.qtpl:4-10` — PrometheusErrorResponse
- `app/vmselect/prometheus.go:334` — application/stream+json
- `app/vmselect/prometheus.go:1265-1301` — scalableWriter
- `lib/httpserver/httpserver.go:463-470` — isProtectedByAuthFlag
- `app/vmselect/main.go:69-81` — concurrency semaphore

---

Generated by dimension `04-http-api-surface.md`.
