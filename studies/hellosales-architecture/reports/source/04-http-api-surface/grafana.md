# Source Analysis: grafana

## HTTP/API Surface Design

### Source Info

| Field | Value |
|-------|-------|
| Name | grafana |
| Path | `sources/grafana` |
| Language / Stack | Go (custom `web` package built on Macaron patterns + gorilla/mux) |
| Analyzed | 2026-05-19 |

## Summary

Grafana implements a rich HTTP API surface using a custom routing layer (`pkg/web/`) built on patterns inspired by Macaron, with route registration through a `RouteRegister` interface. Routes are organized by resource domain under `/api` prefix without URL-based versioning. Error handling uses a structured `errutil.Error` system with both internal and public-facing error types. Pagination is query-parameter-based with `limit` and `page` (1-indexed), enforcing max limits (e.g., 5000 for search). Middleware layering is well-defined with global middlewares applied in a fixed order (request metadata, tracing, metrics, logging, gzip, recovery, CSRF, context, org redirect), and group-level middleware for route clusters. New plugin-style APIs use Kubernetes-style API groups (`/apis/<group>/<version>/...`) rather than URL versioning. The design is production-grade with OpenTelemetry tracing, Prometheus metrics, and SLO group classification per route.

## Rating

**8/10 — Good implementation with minor issues**

Grafana's HTTP API surface demonstrates strong architectural decisions: clean route registration with grouping and middleware inheritance, structured error contracts via `errutil`, well-defined middleware ordering, and SLO-aware route classification. The main weaknesses are the lack of URL-based API versioning (relied upon for core APIs), inconsistent pagination parameter naming (some use `limit`, others `page_size`), and the absence of streaming endpoints (SSE/WebSocket) for real-time use cases. The custom web framework is well-integrated but adds learning curve vs. standard libraries.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| HTTP framework | Custom `web` package wrapping Macaron-style routing; uses `github.com/gorilla/mux v1.8.1` | `pkg/web/router.go:74-83`, `go.mod:92` |
| Route registration | `registerRoutes()` in `api.go:64`, uses `RouteRegister` interface with Get/Post/Put/Delete/Patch/Any/Group | `pkg/api/api.go:64-118`, `pkg/api/routing/route_register.go:18-50` |
| Route grouping | Hierarchical `r.Group("/api", func(apiRoute routing.RouteRegister){...})` pattern | `pkg/api/api.go:288-545` |
| Group middleware | Middleware applied to entire route group (e.g., `reqSignedIn` for `/api` group) | `pkg/api/api.go:288` |
| Error types | `errutil.Error` struct with Reason, MessageID, LogMessage, PublicMessage, PublicPayload | `pkg/apimachinery/errutil/errors.go:316-370` |
| Public errors | `PublicError` struct with StatusCode, MessageID, Message, Extra | `pkg/apimachinery/errutil/errors.go:450-478` |
| Status codes | `Status` constants mapped to HTTP codes (StatusNotFound→404, StatusBadRequest→400) | `pkg/apimachinery/errutil/status.go:9-82` |
| Error response helpers | `response.Error()`, `response.Err()`, `response.ErrOrFallback()` | `pkg/api/response/response.go:240-299` |
| Pagination pattern | `limit` and `page` query params, 1-indexed pages, max limits enforced | `pkg/api/search.go:32-44`, `pkg/api/search.go:187-191` |
| Pagination params | `SearchParams` struct with swagger docs for `limit` (max 5000) and `page` (1-indexed) | `pkg/api/search.go:187-191` |
| Global middleware | requestmeta→tracing→metrics→logging→gzip→recovery→CSRF→context→org redirect | `pkg/api/http_server.go:678-743` |
| Auth middleware | `ReqGrafanaAdmin`, `ReqSignedIn`, `ReqNoAnonymous`, `ReqEditorRole`, `ReqOrgAdmin` | `pkg/middleware/auth.go:15-30` |
| SLO groups | `SLOGroupHighFast`, `SLOGroupHighMedium`, `SLOGroupHighSlow`, `SLOGroupLow`, `SLOGroupNone` | `pkg/middleware/requestmeta/request_metadata.go:31-50` |
| Request metadata | `SetOwner()` and `SetSLOGroup()` middleware for team/SLO classification | `pkg/middleware/requestmeta/request_metadata.go:91-134` |
| Response types | `NormalResponse`, `StreamingResponse`, `RedirectResponse` | `pkg/api/response/response.go:42-190` |
| Swagger support | Inline swagger annotations in handler comments | `pkg/api/swagger.go` |
| K8s-style API groups | `/apis/folder.grafana.app/v1/...`, `/apis/prometheus.datasource.grafana.app/v0alpha1/...` | `pkg/api/datasources_k8s_test.go:322-375` |
| Quota middleware | `quota` middleware applied per-route | `pkg/middleware/quota.go` |
| Named middleware | `RegisterNamedMiddleware` for pattern-based middleware injection | `pkg/api/routing/route_register.go:52,120-125` |
| HTTP server init | `registerRoutes()` called at line 412, routes applied to web mux at line 673 | `pkg/api/http_server.go:412,673` |
| Route apply order | Middlewares/static routes → API routes → 404 handler | `pkg/api/http_server.go:669-676` |
| Context handler | `ContextHandler.Middleware` injects signed-in user context | `pkg/api/http_server.go:724` |
| Rate limiting | Quota middleware enforces limits; no global rate-limit middleware found | `pkg/middleware/quota.go` |

## Answers to Dimension Questions

### 1. How are routes organised and registered — by resource, version, or domain?

Routes are organized **by resource domain** using hierarchical grouping. The primary registration happens in `pkg/api/api.go:64` via `registerRoutes()`, which groups routes under `/api` prefix (`pkg/api/api.go:288`) and then subgroups by domain: `/api/user`, `/api/users`, `/api/org`, `/api/dashboards`, `/api/folders`, `/api/search`, etc. (`pkg/api/api.go:288-545`).

The `RouteRegister` interface (`pkg/api/routing/route_register.go:18-50`) provides methods for each HTTP verb (`Get()`, `Post()`, `Put()`, `Delete()`, `Patch()`, `Any()`) plus `Group()` for nested routing with shared prefixes and middleware. The `Group()` method (`pkg/api/routing/route_register.go:108-118`) inherits the parent prefix and allows optional middleware to be applied to all routes in the group.

**API versioning**: Grafana does NOT use URL-based versioning (`/api/v1/...`). Core APIs use `/api/...` without version segments. New plugin-style APIs use Kubernetes-style API groups: `/apis/<group>.grafana.app/<version>/namespaces/<ns>/<resource>` (e.g., `/apis/folder.grafana.app/v1/namespaces/default/folders`). This is evident from the prometheus datasource proxy at `pkg/api/datasources_k8s_test.go:322-375` which maps `/api/datasources/uid/:uid/resources/api/v1/*` → `/apis/prometheus.datasource.grafana.app/v0alpha1/...`.

### 2. Is there a consistent error contract clients can depend on?

**Yes.** Grafana implements a structured error contract via the `errutil` package.

- **`errutil.Error`** (`pkg/apimachinery/errutil/errors.go:316-370`) is the internal error representation with fields: `Reason` (machine-readable key), `MessageID` (unique identifier for docs/linking), `LogMessage` (internal log message), `Underlying` (wrapped error), `PublicMessage` (client-facing message), `PublicPayload` (structured extra data), `LogLevel`, `Source`.

- **`PublicError`** (`pkg/apimachinery/errutil/errors.go:450-478`) is the client-facing struct with `StatusCode`, `MessageID`, `Message`, `Extra`.

- **Status mapping** via `HTTPStatus()` method (`pkg/apimachinery/errutil/status.go:102-133`) converts `errutil.Status` constants to HTTP codes.

- **Response helpers** at `pkg/api/response/response.go:240-277` (`Error()`, `Err()`, `ErrOrFallback()`) convert errors to HTTP responses in a consistent format.

The error contract is consistent within the Grafana codebase itself. However, legacy APIs may still use direct `response.Error()` calls with string messages, and not all endpoints may use `errutil.Error`. The `swagger.go` file (`pkg/api/swagger.go`) documents response types inline.

### 3. How does the API handle pagination at scale without performance cliffs?

Grafana uses **query-parameter-based pagination** with `limit` (page size) and `page` (1-indexed) parameters. Key evidence:

- **Search API** (`pkg/api/search.go:32-44`): `limit` defaults to unspecified (uses DB default), `page` parameter for pagination. Max limit of 5000 enforced at line 40-44:
  ```go
  if limit > 5000 {
      return response.Error(http.StatusUnprocessableEntity, "Limit is above maximum allowed (5000), use page parameter to access hits beyond limit", nil)
  }
  ```

- **`SearchParams` struct** (`pkg/api/search.go:187-191`): Documents `limit` (max 5000) and `page` (1-indexed) in swagger annotations.

- **Folder children** (`pkg/api/folder.go:76-83`): `Limit` and `Page` query params passed to `folder.GetChildrenQuery`.

- **Dashboard versions** (`pkg/api/dashboard.go:829-830`): `Limit` query param.

- **Annotations** (`pkg/api/annotations.go:664-698`): `Limit int64` field with max limit documentation.

- **Org users** (`pkg/api/org_users.go:122,151`): `Limit` query param.

The pattern is `limit` as page size and `page` as 1-indexed page number. However, some inconsistency exists: search uses `limit` with max 5000, while other endpoints may have different defaults or limits. **No cursor-based pagination** was found in the core API; pagination is offset-based using page numbers.

**Performance consideration**: The max limit enforcement (5000 for search) prevents accidental large scans. The "use page parameter to access hits beyond limit" message suggests cursor-less pagination could cause performance cliffs for deep page traversal (OFFSET pagination degrades with high page numbers).

### 4. What middleware is global vs per-route, and how is layering managed?

Grafana has a well-defined middleware layering order in `pkg/api/http_server.go:678-743` (`addMiddlewaresAndStaticRoutes()`):

**Global middleware (in order):**
1. `requestmeta.SetupRequestMetadata()` — line 681: Request metadata injection
2. `middleware.RequestTracing(...)` — line 682: OpenTelemetry tracing
3. `middleware.RequestMetrics(...)` — line 683: Prometheus metrics
4. `hs.LoggerMiddleware.Middleware()` — line 685: Structured logging
5. `middleware.Gziper()` — line 688: Gzip compression (conditional on `EnableGzip`)
6. `middleware.Recovery(...)` — line 691: Panic recovery
7. `hs.Csrf.Middleware()` — line 692: CSRF protection
8. Static routes
9. `hs.ContextHandler.Middleware` — line 724: Auth context injection
10. `middleware.OrgRedirect(...)` — line 725: Org ID redirection

**Route-level middleware** is applied via `RouteRegister.Group()` optional middleware parameter:
- `r.Group("/api", func(apiRoute routing.RouteRegister) {...}, reqSignedIn)` — line 288: requires signed-in user for all `/api` routes
- Individual routes can specify middleware: `r.Post("/login", requestmeta.SetOwner(...), quota(...), routing.Wrap(hs.LoginPost))` — line 84

**Auth middleware shortcuts** (`pkg/middleware/auth.go:15-23`):
- `ReqGrafanaAdmin` — requires Grafana admin
- `ReqSignedIn` — requires authenticated user
- `ReqSignedInNoAnonymous` — no anonymous access
- `ReqEditorRole` — editor or higher
- `ReqOrgAdmin` — org admin or higher

**SLO classification middleware** (`pkg/middleware/requestmeta/request_metadata.go:91-134`):
- `SetOwner(team)` — sets team ownership for the request
- `SetSLOGroup(group)` — classifies request into SLO group (HighFast, HighMedium, HighSlow, Low, None)

**Layering management**: Middleware is applied in a fixed global order, then per-group middleware is inherited by child routes. Named middleware registration (`pkg/api/routing/route_register.go:52,120-125`) allows pattern-based injection for automatic route operation naming.

**Gap**: No evidence of per-route rate limiting middleware; quota is applied per-route but not as a global band.

### 5. How is API versioning handled without duplicating handlers?

Grafana avoids URL-based versioning for core APIs — all core endpoints use `/api/...` without version segments (`pkg/api/api.go:7` shows `BasePath: /api` in swagger meta). Instead:

1. **Kubernetes-style API groups** for plugin/resources: `/apis/<group>.grafana.app/<version>/namespaces/<ns>/<resource>`. This is visible in datasource proxying at `pkg/api/datasources_k8s_test.go:322-375`.

2. **No handler duplication**: Since there's no URL versioning, there's no duplicate handler maintenance for different versions. Breaking changes likely require migration paths or deprecation notices.

3. **Feature detection** at runtime (not found in this analysis but common in large APIs).

4. **API groups vs versions**: New APIs use proper Kubernetes-style API groups with versions (`v1`, `v0alpha1`), while legacy APIs remain unversioned under `/api`.

**Trade-off**: The lack of URL versioning for core APIs means clients cannot pin to a specific API version. Clients must adapt to any breaking changes. This is a common trade-off for internal APIs where server and client versions are tightly coupled.

## Architectural Decisions

1. **Custom web framework (`pkg/web/`)** built on Macaron patterns: Grafana implements its own routing layer rather than using a standard library directly. This provides deep control over middleware ordering, route grouping, and pattern matching, but adds complexity and learning curve. The `Router` struct at `pkg/web/router.go:74-83` wraps a `*Tree` for pattern matching.

2. **RouteRegister interface for declarative routing**: Routes are registered via an interface (`pkg/api/routing/route_register.go:18-50`) that supports HTTP verbs, grouping with prefix inheritance, and optional group middleware. This enables hierarchical organization and avoids hardcoding route paths.

3. **errutil-based error system**: Internal errors use `errutil.Error` with structured fields for machine-readable reason codes, message IDs, and public/private message separation. This enables consistent API error responses and structured logging without duplicating error construction logic.

4. **SLO-aware routing**: Routes are classified into SLO groups (`pkg/middleware/requestmeta/request_metadata.go:31-50`) and team ownership is set via middleware. This enables operational awareness at the routing level, supporting cost allocation and reliability planning.

5. **Middleware ordering as architectural constraint**: The global middleware order (metadata → tracing → metrics → logging → gzip → recovery → CSRF → context → redirect) is fixed in `http_server.go:678-743`. This ensures consistent cross-cutting concern application but limits flexibility for routes that need different middleware stacks.

6. **Group-level middleware inheritance**: Middleware applied to a route group (e.g., `reqSignedIn` on `/api`) propagates to all child routes. This reduces per-route middleware boilerplate but requires careful design to avoid unintended auth requirements.

7. **No URL versioning for core APIs**: Core Grafana APIs use `/api/...` without versioning. New plugin-style APIs use Kubernetes-style `/apis/<group>/<version>/...` paths. This avoids handler duplication but requires careful deprecation management for breaking changes.

## Notable Patterns

- **Hierarchical route registration with prefix inheritance**: Routes are organized in nested groups, each inheriting the parent's path prefix. This makes route organization mirror resource hierarchy (e.g., `/api/orgs/:orgid/users/:userid`).

- **Middleware shortcut functions**: Pre-configured auth middleware (`ReqSignedIn`, `ReqGrafanaAdmin`, etc.) at `pkg/middleware/auth.go:15-23` provide one-liner auth requirements per route.

- **SLO group classification**: `SetSLOGroup()` middleware at `pkg/middleware/requestmeta/request_metadata.go:129-134` allows per-route SLO classification for operational awareness.

- **Owner team metadata**: `SetOwner()` middleware at `pkg/middleware/requestmeta/request_metadata.go:91-96` sets team ownership per route for cost attribution and responsibility tracking.

- **Response type spectrum**: `NormalResponse` (structured JSON), `StreamingResponse` (chunked JSON), `RedirectResponse` (HTTP redirect) at `pkg/api/response/response.go:42-190` provide clear response type semantics.

- **Error conversion helpers**: `response.Err()` at `pkg/api/response/response.go:266-277` converts `errutil.Error` to HTTP responses with proper status codes and public payloads.

- **Quota middleware**: Per-route quota enforcement at `pkg/middleware/quota.go` allows resource consumption limits without global rate limiting.

- **Swagger inline annotations**: API handlers use inline swagger route annotations (e.g., `// swagger:route GET /search search search`) documented at `pkg/api/swagger.go`.

## Tradeoffs

- **Custom web framework vs standard library**: The custom `pkg/web/` provides deep control but adds maintenance burden and requires contributors to learn non-standard patterns. Using `gorilla/mux` directly (available in `go.mod:92`) would be more familiar to Go developers.

- **No URL versioning vs explicit versioning**: Avoiding `/api/v1/` style versioning prevents handler duplication but makes it harder for clients to pin versions. Clients cannot rely on API stability between releases.

- **Offset pagination vs cursor pagination**: Page-based pagination with `page` numbers is simple but degrades for deep pagination (high OFFSET values cause sequential scan overhead). Cursor-based pagination would be more scalable but is not used in the analyzed code.

- **Group-level middleware inheritance vs per-route explicitness**: Middleware inheritance reduces boilerplate but can cause unexpected auth requirements on nested routes. Explicit per-route middleware is more verbose but clearer.

- **Global middleware order fixing**: The fixed global middleware order (`http_server.go:678-743`) ensures consistency but prevents routes from opting out of certain cross-cutting concerns (e.g., gzip, CSRF) when inappropriate.

- **No streaming endpoints**: Grafana's HTTP API has no SSE, WebSocket, or chunked streaming responses. Real-time features likely use polling or dedicated WebSocket servers. This limits real-time interactivity.

## Failure Modes / Edge Cases

- **Offset pagination performance cliff**: Deep pagination (high `page` values) with `limit` will degrade as databases must scan OFFSET rows. The search API's 5000 limit message explicitly warns about this.

- **Middleware ordering assumptions**: Routes relying on context (`SignedInUser`) being set by `ContextHandler.Middleware` at line 724 will fail if middleware order changes. The ordering is not enforced structurally.

- **Group middleware unintended propagation**: Routes added to a group inherit group middleware. If a route needs different auth requirements (e.g., public endpoint under `/api`), it must explicitly handle or override.

- **No rate limit on unauthenticated endpoints**: While quota middleware exists per-route, there is no global rate limiting for unauthenticated requests. This could allow DoS on public endpoints.

- **CSRF middleware on API routes**: The CSRF middleware at line 692 may interfere with API clients that don't send `X-CSRFToken` header. Not all `/api` routes may need CSRF protection (e.g., machine-to-machine).

- **Legacy error handling inconsistency**: Not all endpoints use `errutil.Error`; some use direct `response.Error()` with string messages. This creates inconsistent client-facing error formats across the API.

- **Prometheus metrics cardinality risk**: `RequestMetrics` middleware at line 683 could generate high cardinality metrics if route labels include high-cardinality values (e.g., resource IDs).

## Future Considerations

1. **Cursor-based pagination**: For large result sets, implementing cursor-based pagination (using `after`/`before` cursors) would prevent performance cliffs from offset pagination. This would be particularly valuable for search and list endpoints.

2. **Streaming endpoints**: Adding SSE or chunked streaming support would enable real-time dashboards and notifications without polling. This would require new response types beyond `NormalResponse`.

3. **Per-route middleware configuration**: Allowing routes to specify which global middlewares to skip (e.g., opt-out of gzip for already-compressed responses) would improve flexibility.

4. **API versioning strategy**: Formalizing the versioning approach — perhaps introducing `/api/v1/` for new major API versions — would give clients stability guarantees and enable backward-compatible evolution.

5. **Global rate limiting**: Adding a global rate-limit middleware with configurable limits per client/IP would prevent abuse on public endpoints more effectively than per-route quota.

6. **OpenAPI spec generation**: While swagger annotations exist inline, automated OpenAPI spec generation (via `make swagger-gen`) could produce consumable specs for external API consumers.

7. **Error contract formalization**: Enforcing `errutil.Error` usage across all API endpoints would create a fully predictable client-facing error contract with machine-readable error codes.

## Questions / Gaps

- **No evidence of WebSocket support**: No WebSocket route registration or handler found. Real-time features in Grafana likely use separate channels.

- **No evidence of SSE**: No Server-Sent Events endpoints found in the analyzed routes.

- **Rate limiting coverage unclear**: The quota middleware is applied per-route but no global rate-limit middleware found. How unauthenticated/public endpoints are protected from abuse is not fully clear from the analyzed code.

- **Retry policies unspecified**: No evidence of automatic retry logic for transient failures in the HTTP layer.

- **Circuit breaker patterns absent**: No bulkhead or circuit-breaker patterns found in HTTP handling.

- **Request validation schema**: While `errutil.Error` handles error responses, the request validation layer (e.g., JSON schema validation, required field checks) is not clearly centralized.

- **API changelog/deprecation policy**: No evidence of formal API deprecation notices or changelog for breaking changes.

- **Telemetry sampling strategy**: The `RequestTracing` middleware is present but the sampling strategy (trace percentage) is not visible in the analyzed code.

---

Generated by `dimensions/04-http-api-surface.md` against `grafana`.