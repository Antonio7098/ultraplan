# Source Analysis: pocketbase

## HTTP/API Surface Design

### Source Info

| Field | Value |
|-------|-------|
| Name | pocketbase |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/pocketbase` |
| Language / Stack | Go (golang) |
| Analyzed | 2026-05-19 |

## Summary

PocketBase implements a well-structured REST API using a custom router layered on top of Go's standard `http.ServeMux`. Routes are organized by resource domain under a single `/api` prefix group, with consistent error contracts via a centralized `ApiError` struct, priority-based middleware chaining, and page-based pagination with reasonable defaults. Realtime support is provided via SSE. The design is coherent and pragmatic for a BaaS framework.

## Rating

**7/10** — Good implementation with minor issues. The core routing and error handling are solid. Missing explicit API versioning is an accepted trade-off for simplicity, but the absence means no graceful handler duplication for major version transitions. Pagination is offset-based (not cursor-based), which can have performance cliffs at deep offsets.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| HTTP Framework | Custom `Router[T]` wrapper around Go's `http.ServeMux` | `tools/router/router.go:44` |
| Route Registration | `NewRouter()` + `Group()` + HTTP method helpers (GET, POST, etc.) | `tools/router/group.go:33-173` |
| Route Registration | API group initialization in `NewRouter()` | `apis/base.go:39-50` |
| Error Contract | `ApiError` struct with `Data`, `Message`, `Status` fields | `tools/router/error.go:36-42` |
| Error Helpers | Event error helpers (`BadRequestError`, `NotFoundError`, etc.) | `tools/router/event.go:294-320` |
| Pagination | `search.Provider` with `Page`/`PerPage` params, `DefaultPerPage=30`, `MaxPerPage=1000` | `tools/search/provider.go:17-18,47-48,54-61` |
| Pagination Query Params | `PageQueryParam="page"`, `PerPageQueryParam="perPage"` constants | `tools/search/provider.go:47-48` |
| Pagination Limits | Offset calculation: `Offset(int64(perPage * (page - 1)))` | `tools/search/provider.go:331` |
| Streaming SSE | Realtime endpoint using `text/event-stream`, `Flush()` for chunked delivery | `apis/realtime.go:58-91` |
| Global Middlewares | 7 global middlewares bound in `NewRouter()`: activityLogger, panicRecover, rateLimit, loadAuthToken, superuserIPsWhitelist, securityHeaders, BodyLimit | `apis/base.go:30-36` |
| Middleware Priority | Priority constants defined for ordering (rateLimit=-1000, activityLogger=-1040, etc.) | `apis/middlewares.go:31-49` |
| Auth Token Loading | `loadAuthToken()` middleware extracts `Authorization` header, supports "Bearer " prefix | `apis/middlewares.go:174-209,211-221` |
| CORS Middleware | `CORS()` middleware with configurable origins, methods, headers | `apis/middlewares_cors.go` |
| Rate Limiting | Global `rateLimit()` middleware + per-collection `collectionPathRateLimit()` | `apis/middlewares_rate_limit.go:28-51,54-75` |
| Route Group Prefix | All API routes under `/api` group prefix | `apis/base.go:39` |
| Request Binding | `BindBody()` supports JSON, XML, form content types | `tools/router/event.go:354-398` |
| Body Limit | `BodyLimit()` middleware with `DefaultMaxBodySize` | `apis/middlewares_body_limit.go` |
| Health Endpoint | `GET /api/health` returns server health status | `apis/health.go:12-14` |
| Panic Recovery | `panicRecover()` middleware captures panics and returns 500 | `apis/middlewares.go:252-283` |
| WWW Redirect | `wwwRedirect()` middleware for www->non-www redirects | `apis/middlewares.go:223-250` |

## Answers to Dimension Questions

### 1. How are routes organised and registered — by resource, version, or domain?

Routes are organized **by resource/domain** using a custom router system. The `NewRouter()` function in `apis/base.go:19-56` creates a router and registers all API routes under the `/api` group prefix (line 39). Each resource domain (collections, records, auth, files, etc.) gets its own sub-group bound via dedicated `bindXxxApi()` functions:

- `bindSettingsApi()` → `/api/settings`
- `bindCollectionApi()` → `/api/collections`
- `bindRecordCrudApi()` → `/api/collections/{collection}/records`
- `bindRecordAuthApi()` → `/api/collections/{collection}` (auth endpoints)
- `bindLogsApi()` → `/api/logs`
- `bindBackupApi()` → `/api/backups`
- `bindFileApi()` → `/api/files`
- `bindRealtimeApi()` → `/api/realtime`
- `bindHealthApi()` → `/api/health`
- `bindBatchApi()` → `/api/batch`

Route registration uses method-chaining helpers (`GET()`, `POST()`, `PATCH()`, `DELETE()`, etc.) defined in `tools/router/group.go:136-173`. The underlying Go `http.ServeMux` is built via `Router.BuildMux()` at `tools/router/router.go:61-80`.

**No explicit API versioning** — the API is versionless, relying on a single `/api` prefix. This is a pragmatic choice for a framework but means major version changes require new route prefixes or handler duplication.

### 2. Is there a consistent error contract clients can depend on?

**Yes.** All API errors use the `ApiError` struct defined at `tools/router/error.go:36-42`:

```go
type ApiError struct {
    rawData any
    Data    map[string]any `json:"data"`
    Message string         `json:"message"`
    Status  int            `json:"status"`
}
```

The `ToApiError()` function at `tools/router/error.go:134-147` wraps any error into an `ApiError`, converting `sql.ErrNoRows` and `fs.ErrNotExist` to 404, and everything else to 400 by default. Error helpers are provided on the `Event` struct at `tools/router/event.go:294-320` (`BadRequestError`, `NotFoundError`, `ForbiddenError`, `UnauthorizedError`, `TooManyRequestsError`, `InternalServerError`).

The `safeErrorsData()` function at `tools/router/error.go:151-174` normalizes various error types (validation.Errors, map[string]error, etc.) into a consistent `{"field": {"code": "...", "message": "..."}}` structure for client consumption.

The error handler at `tools/router/router.go:160-183` writes errors as JSON with `Content-Type: application/json` header.

### 3. How does the API handle pagination at scale without performance cliffs?

PocketBase uses **offset-based pagination** via the `search.Provider` struct in `tools/search/provider.go`. Query parameters are `page` and `perPage` (constants at lines 47-48). Default `perPage` is **30**, maximum allowed is **1000** (line 27). The query offset is calculated at line 331:

```go
modelsQuery.Offset(int64(s.perPage * (s.page - 1)))
```

**Performance consideration:** Offset pagination degrades at deep offsets because the database must scan and discard many rows. For large datasets, cursor-based pagination would perform better, but this is a recognized tradeoff in the current design.

**Protections in place:**
- `MaxPerPage` cap prevents unbounded result sets (`tools/search/provider.go:27`)
- `DefaultPerPage=30` provides safe defaults (`tools/search/provider.go:18`)
- Rate limiting on list endpoints with randomized throttle for timing attack mitigation (`apis/record_crud.go:115-142`)
- `skipTotal` query param allows skipping expensive `COUNT(*)` queries (`tools/search/provider.go:51`)

Results are returned as a `Result` struct with `items`, `page`, `perPage`, `totalItems`, `totalPages` fields (lines 55-61).

### 4. What middleware is global vs per-route, and how is layering managed?

**Global middlewares** (bound in `apis/base.go:30-36` in the order they execute):

| Middleware | ID | Priority | Purpose |
|-----------|----|----------|---------|
| `activityLogger()` | `pbActivityLogger` | -1040 | Request logging to DB |
| `panicRecover()` | `pbPanicRecover` | -1030 | Panic recovery |
| `rateLimit()` | `pbRateLimit` | **-1000** | Global rate limiting |
| `loadAuthToken()` | `pbLoadAuthToken` | -1020 | Auth token loading |
| `superuserIPsWhitelist()` | `pbSuperuserIPsWhitelist` | -1015 | Superuser IP whitelist |
| `securityHeaders()` | `pbSecurityHeaders` | -1010 | X-XSS-Protection, X-Frame-Options, etc. |
| `BodyLimit()` | `pbBodyLimit` | varies | Request body size limit |

**Middleware layering** is managed via a **priority-based hook chain** from the `tools/hook` package. Lower priority values execute first (more negative = earlier). The priority system allows fine-grained control: for example, rate limiting at -1000 runs before activity logging at -1040.

**Per-route middleware** is attached via `Route.Bind()` or `Route.BindFunc()` methods (`tools/router/route.go:14-43`). Middlewares can be **excluded** from routes via `Route.Unbind(middlewareId)` (`tools/router/route.go:45-73`).

**Per-group middleware** applies to all routes in a group and is inherited by child groups, with the ability to exclude specific middlewares per-route via the exclusion map mechanism at `tools/router/router.go:99-108`.

**Auth middleware examples:**
- `RequireAuth()` — requires valid record auth token
- `RequireSuperuserAuth()` — requires superuser auth
- `RequireSameCollectionContextAuth()` — requires auth record from specific collection

### 5. How is API versioning handled without duplicating handlers?

**It is not explicitly handled** — PocketBase does not implement API versioning in the traditional sense (no `/api/v1/`, `/api/v2/` prefixes or version headers). The API evolves in place, with breaking changes documented in changelogs.

This is an **accepted tradeoff** for simplicity in a framework targeting single-tenant deployments. The implications are:
- **No graceful handler duplication** — major breaking changes require manual migration or new route prefixes
- **Single endpoint surface** — clients must adapt to changes as they occur
- **No deprecation window** — unless explicitly managed via feature flags

For most BaaS use cases this is reasonable since the API surface is relatively stable and the framework is designed for internal use rather than public API distribution.

## Architectural Decisions

1. **Custom Router over framework** — PocketBase builds its own router (`Router[T]`) as a thin wrapper around Go's `http.ServeMux`, adding group prefixes, middleware chaining, and event factories. This avoids external dependencies while providing ergonomic route registration.

2. **Generic Event System** — The router uses Go generics (`Router[T hook.Resolver]`) to create typed event wrappers, with `core.RequestEvent` as the concrete type for PocketBase's HTTP handling.

3. **Single-group API prefix** — All API routes live under `/api` without version segmentation. This simplifies routing but requires careful management of breaking changes.

4. **Hook-based Middleware** — Middlewares are `hook.Handler[T]` instances with `Id`, `Priority`, and `Func`, allowing fine-grained control over execution order and composability.

5. **Offset Pagination** — Chosen over cursor-based pagination for simplicity. The tradeoff is performance at deep page offsets, but the `MaxPerPage` cap and rate limiting mitigate abuse.

6. **Centralized Error Normalization** — The `ApiError` type and `ToApiError()` function provide a single error transformation path, ensuring all errors (DB errors, file errors, validation errors) serialize consistently.

7. **SSE for Realtime** — Server-Sent Events are used for the realtime endpoint rather than WebSocket, simplifying proxy handling and server implementation.

## Notable Patterns

1. **Method Chaining Registration** — Routes are registered via fluent chain: `rg.Group("/collections").GET("", handler).Bind(middleware)` — found in `tools/router/group.go:130-173`.

2. **Middleware Exclusion** — Routes can opt out of group middlewares via `Unbind(middlewareId)` — critical for granular control (e.g., `record_crud.go:28` disables rate limiting inline).

3. **Dynamic Body Limits** — File upload routes get dynamic body limits via `dynamicCollectionBodyLimit("")` at `apis/record_crud.go:31-32`.

4. **Request Event Caching** — `RequestInfo()` caches parsing results but refreshes auth state on each call (`core/event_request.go:86-107`).

5. **Response Writer Wrapping** — `ResponseWriter` wrapper tracks write state and status for logging and error handling (`tools/router/router.go:211-306`).

6. **Fields Picker** — JSON responses support a `?fields=a,b` query param to pick specific fields, implemented in `tools/router/event.go:182-205`.

## Tradeoffs

| Tradeoff | Impact | Mitigation |
|----------|--------|------------|
| No API versioning | Breaking changes affect all clients simultaneously | Single-tenant use case limits scope |
| Offset pagination | Deep offsets cause DB performance issues | `MaxPerPage` cap, rate limiting, `skipTotal` option |
| No WebSocket (SSE only) | Lower latency bidirectional communication not supported | SSE sufficient for most realtime BaaS use cases |
| Global rate limiter | May not suit multi-tenant scenarios | Per-collection rate limits via `collectionPathRateLimit()` |
| Single `/api` prefix | Cannot serve multiple API versions simultaneously | Framework design; clients adapt to changes |

## Failure Modes / Edge Cases

1. **Large file uploads** — `WriteTimeout` and `ReadTimeout` set to 5 minutes (`apis/serve.go:152-153`) to accommodate large file transfers, but this can hold connections open for extended periods.

2. **SSE connection management** — Realtime connections use cancellable contexts (`apis/realtime.go:54-56`) with 5-minute idle timeout. Connections must be properly managed to avoid resource leaks.

3. **Rate limit race conditions** — The in-memory rate limiter store (`tools/store/store.go`) may not be consistent across multiple server instances in horizontal deployment.

4. **Timing attack mitigation** — Randomized throttle on empty filter results (`apis/record_crud.go:115-142`) provides probabilistic rather than deterministic protection.

5. **Request body re-reading** — `RereadableReadCloser` wraps request bodies to allow multiple reads (`tools/router/router.go:135`), critical for middleware that needs to read body after handler.

6. **Trusted proxy IP extraction** — `RealIP()` relies on configured `TrustedProxy` headers. Misconfiguration can lead to IP spoofing (`core/event_request.go:31-75`).

## Future Considerations

1. **Cursor-based pagination** — For large datasets, implementing cursor pagination (via opaque tokens) would improve query performance at deep offsets.

2. **API versioning mechanism** — A formal versioning strategy (e.g., `/api/v1/` prefix with handler duplication or abstraction) would enable graceful API evolution.

3. **Distributed rate limiting** — The current in-memory rate limiter would need a shared store (Redis, etc.) for multi-instance deployments.

4. **WebSocket support** — If bidirectional communication is needed, WebSocket upgrade could be added alongside SSE.

5. **OpenAPI documentation** — Auto-generated OpenAPI specs from route definitions would improve client developer experience.

## Questions / Gaps

1. **No evidence found** of distributed tracing or request ID propagation across middleware for debugging.
2. **No evidence found** of automatic API deprecation headers or sunset policies for aging endpoints.
3. **No evidence found** of per-client rate limiting (only per-collection and global).
4. **No evidence found** of structured logging with correlation IDs for request tracing.
5. **Unclear** how the framework handles API evolution when breaking changes are necessary — relies on changelog and manual migration.

---

Generated by `dimensions/04-http-api-surface.md` against `pocketbase`.