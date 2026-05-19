# Source Analysis: nats-server

## HTTP/API Surface Design

### Source Info

| Field | Value |
|-------|-------|
| Name | nats-server |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/nats-server` |
| Language / Stack | Go (net/http standard library) |
| Analyzed | 2026-05-19 |

## Summary

nats-server is a high-performance message broker that primarily uses its own text-based NATS protocol over TCP for client-server communication. HTTP is used only for monitoring endpoints and WebSocket upgrades. The JetStream API uses subject-based routing via NATS protocol, not HTTP REST endpoints. The HTTP monitoring API is simple, functional, and intended for trusted networks without built-in authentication.

## Rating

**4/10** — Basic implementation with significant gaps

The HTTP API surface is functional but limited. Monitoring endpoints exist with reasonable organization, but lacks: middleware layering, authentication on monitoring endpoints, pagination at scale, API versioning strategy, and consistent error contracts across different error types (Go errors vs JetStream ApiError).

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| HTTP Framework | Uses `net/http` with `http.NewServeMux()` | `server/server.go:3110` |
| Route Registration | Constants define paths, registered via `mux.HandleFunc()` | `server/server.go:3112-3143` |
| Path Constants | `RootPath="/", VarzPath="/varz", ConnzPath="/connz"` | `server/server.go:3009-3023` |
| HTTP Server Config | `http.Server` with `ReadHeaderTimeout`, `MaxHeaderBytes` | `server/server.go:3148-3154` |
| Handler Pattern | Methods on `*Server` (e.g., `s.HandleVarz(w, r)`) | `server/monitor.go:1498` |
| JetStream API | Subject-based routing (`$JS.API.STREAM.CREATE.*`) | `server/jetstream_api.go:52` |
| ApiResponse Type | `Type string`, `Error *ApiError` | `server/jetstream_api.go:372-375` |
| ApiError Structure | `Code int`, `ErrCode uint16`, `Description string` | `server/jetstream_errors.go:57-61` |
| Error Identifiers | Auto-generated from `errors.json` | `server/jetstream_errors_generated.go:7-9` |
| Pagination | `ApiPaged` struct with `Total`, `Offset`, `Limit` | `server/jetstream_api.go:397-402` |
| Default Pagination Limits | `JSApiNamesLimit=1024`, `JSApiListLimit=256` | `server/jetstream_api.go:453-454` |
| Response Handler | JSON with optional JSONP callback | `server/monitor.go:2576-2591` |
| WebSocket HTTP Server | Separate `http.Server` with `mux.HandleFunc("/")` | `server/websocket.go:1319-1348` |
| Request Parameter Parsing | `decodeInt()`, `decodeBool()`, `decodeUint64()` | `server/monitor.go:660-700` |
| Connection Filtering | `ConnzOptions` struct with offset, limit, sort | `server/monitor.go:58-99` |
| HTTP Request Stats | `httpReqStats map[string]uint64` tracking | `server/server.go:217` |
| Base Path Support | `normalizeBasePath()` for `HTTPBasePath` prefix | `server/server.go:719` |
| JSONP Support | `callback` query param triggers JSONP response | `server/monitor.go:2578-2583` |
| CORS Headers | `Access-Control-Allow-Origin: *` set | `server/monitor.go:2587` |

## Answers to Dimension Questions

### 1. How are routes organised and registered — by resource, version, or domain?

Routes are organized by functional domain (monitoring category) and registered as flat paths using Go's `http.NewServeMux()`. Each path is defined as a string constant (`VarzPath`, `ConnzPath`, etc.) in `server/server.go:3009-3023` and registered via `mux.HandleFunc(s.basePath(RootPath), s.HandleRoot)` in `server/server.go:3112-3143`.

No versioning, no resource grouping, no subdomain-based routing. The base path can be configured via `opts.HTTPBasePath` (`server/server.go:719`).

**Evidence:** `server/server.go:3110-3143` shows flat registration pattern.

### 2. Is there a consistent error contract clients can depend on?

**No.** There are two distinct error systems:

1. **JetStream API errors**: Uses structured `ApiError` with `Code`, `ErrCode`, and `Description` fields (`server/jetstream_errors.go:57-61`). Error identifiers like `JSAccountResourcesExceededErr = 10002` are auto-generated from `errors.json` (`server/jetstream_errors_generated.go:7-9`).

2. **General server errors**: Uses simple Go `errors.New()` in `server/errors.go:21-100+`.

The monitoring HTTP endpoints do not use the JetStream `ApiError` type—they return plain text error messages via `w.Write([]byte(...))` (e.g., `server/monitor.go:668`).

**Evidence:** `server/monitor.go:660-700` shows inline error message writing vs `server/jetstream_errors.go:57-61` structured errors.

### 3. How does the API handle pagination at scale without performance cliffs?

Pagination is offset-based with two hardcoded limits:
- `JSApiNamesLimit = 1024` for stream/consumer name lists (`server/jetstream_api.go:453`)
- `JSApiListLimit = 256` for detailed list responses (`server/jetstream_api.go:454`)

The `ApiPaged` struct contains `Total`, `Offset`, and `Limit` fields (`server/jetstream_api.go:397-402`). The `ApiPagedRequest` allows clients to specify offset (`server/jetstream_api.go:405-407`).

**No cursor-based pagination.** The offset approach can have performance issues at scale (skip-then-limit pattern). No streaming/chunked response support observed in HTTP monitoring endpoints.

**Evidence:** `server/jetstream_api.go:451-454` shows hardcoded limits.

### 4. What middleware is global vs per-route, and how is layering managed?

**No middleware pattern exists.** The HTTP monitoring endpoints have:
- No authentication middleware
- No rate-limiting
- No request validation middleware
- No recovery middleware
- No logging middleware (beyond `ErrorLog` on `http.Server`)

Each handler directly implements its logic. The `captureHTTPServerLog` wrapper (`server/server.go:3152`) captures errors to the server logger but is not middleware in the traditional sense.

**Evidence:** `server/server.go:3148-3154` shows bare `http.Server` with no middleware chain.

### 5. How is API versioning handled without duplicating handlers?

**No API versioning strategy exists.** The NATS protocol and JetStream subject-based API use the subject namespace for organization (e.g., `$JS.API.STREAM.CREATE.*`), but there is no version component in paths or subjects.

The comment at `server/jetstream_api.go:109` mentions "once 2.9 is released" suggesting version-in-subject rather than REST-like versioning.

**Evidence:** `server/jetstream_api.go:37-44` shows `JSApiPrefix = "$JS.API"` with no version component.

## Architectural Decisions

1. **Dual Protocol Design**: NATS uses its own text-based protocol over TCP as the primary client-server communication channel, NOT HTTP. HTTP is auxiliary—only for monitoring and WebSocket.

2. **Subject-Based JetStream API**: Instead of REST/HTTP, JetStream management uses NATS subjects like `$JS.API.STREAM.CREATE.{streamName}`. This is message-based, not resource-based.

3. **Standard Library HTTP**: Uses only `net/http` with `http.NewServeMux()`—no third-party router frameworks (chi, gorilla/mux, fiber, etc.).

4. **Monitoring for Trusted Networks**: HTTP monitoring endpoints have no built-in authentication. The documentation recommends not exposing them publicly.

5. **Flat Route Organization**: All monitoring endpoints are at the root level (`/varz`, `/connz`, `/jsz`) with optional base path prefix.

## Notable Patterns

1. **Handler as Server Method**: Each HTTP handler is a method on `*Server` (e.g., `func (s *Server) HandleVarz(w http.ResponseWriter, r *http.Request)`).

2. **Parameter Decoding Functions**: Custom `decodeBool`, `decodeInt`, `decodeUint64` functions with inline error writing (`server/monitor.go:660-700`).

3. **JSONP Callback Support**: Monitoring responses support JSONP via `callback` query parameter (`server/monitor.go:2578-2583`).

4. **Request Statistics Tracking**: `httpReqStats map[string]uint64` counts requests per endpoint (`server/server.go:217`).

5. **Structured Error Generation**: JetStream errors are generated from `errors.json` with numeric codes (`server/jetstream_errors_generated.go`).

## Tradeoffs

1. **Simplicity vs Feature-Richness**: Using `http.NewServeMux()` is simple but lacks advanced routing (path parameters, middleware, group prefixes). No built-in auth means monitoring must be protected at network level.

2. **Subject-Based API vs REST**: JetStream's NATS subject-based API (`$JS.API.STREAM.CREATE.*`) is consistent with NATS design philosophy but differs from REST conventions. Clients need NATS client libraries, not generic HTTP tools.

3. **Offset Pagination vs Cursor**: Offset-based pagination (`ApiPaged`) is simpler to implement but can degrade at scale. No cursor-based alternative.

4. **Two Error Systems**: The split between Go errors and `ApiError` creates inconsistency—JetStream API has structured errors, but monitoring HTTP endpoints return plain text.

## Failure Modes / Edge Cases

1. **No Health Check Timeout Visibility**: `/healthz` may hang if underlying checks block (`server/monitor.go:3520+`).

2. **Pagination Race Conditions**: With offset pagination, data changes between requests can cause inconsistent results (missing or duplicate items).

3. **Hardcoded Pagination Limits**: `JSApiNamesLimit=1024` and `JSApiListLimit=256` cannot be configured—large deployments must page through results.

4. **JSONP Security**: The `callback` parameter support could be exploited for XSS if monitoring data contains user-controlled content (mitigated by `Access-Control-Allow-Origin: *`).

5. **No Request Timeouts**: HTTP server has `ReadHeaderTimeout` but no request execution timeout—long-running handlers can block indefinitely.

## Future Considerations

1. **Add Authentication Middleware**: Monitoring endpoints should support optional authentication (token, Basic Auth, or mTLS) for exposed deployments.

2. **Cursor-Based Pagination**: Replace or supplement offset pagination with cursor-based pagination for better scalability.

3. **Configurable Pagination Limits**: Allow operators to tune `JSApiNamesLimit` and `JSApiListLimit` based on deployment capacity.

4. **Unified Error Contract**: Consolidate Go errors and JetStream `ApiError` into a single error response format for HTTP endpoints.

5. **Request Timeouts**: Add configurable per-request timeouts to prevent handler blocking.

6. **API Versioning Path**: Consider `/v1/`, `/v2/` prefix paths for future API evolution without breaking existing clients.

## Questions / Gaps

1. **No evidence found** for rate limiting on HTTP endpoints.
2. **No evidence found** for request validation middleware on HTTP handlers.
3. **No evidence found** for response compression (gzip) on HTTP monitoring endpoints.
4. **No evidence found** for OpenAPI/Swagger documentation for HTTP endpoints.
5. **No evidence found** for health check timeout configuration.

---

Generated by `dimensions/04-http-api-surface.md` against `nats-server`.
