# Source Analysis: victoriametrics

## HTTP/API Surface Design

### Source Info

| Field | Value |
|-------|-------|
| Name | victoriametrics |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/victoriametrics` |
| Language / Stack | Go (golang) |
| Analyzed | 2026-05-19 |

## Summary

VictoriaMetrics exposes a multi-protocol HTTP API surface via a central `httpserver` package (`lib/httpserver/httpserver.go`). Routes are organized by function (vminsert for write, vmselect for query, vmstorage for admin) and dispatched from a single `requestHandler` in `app/victoria-metrics/main.go:130`. The API follows Prometheus-compatible conventions with JSON responses and a consistent error contract via `ErrorWithStatusCode` and `SendPrometheusError`. Pagination at scale is handled via query semantics (time range, limit parameters) rather than offset/cursor pagination. Streaming is supported via chunked transfer encoding on export endpoints. Middleware layering uses the `handlerWrapper` function which applies panic recovery, security headers (HSTS, CSP, Frame-Options), CORS, and auth checks before delegating to route handlers.

## Rating

**8/10** — Good implementation with minor issues

VictoriaMetrics demonstrates a well-structured HTTP API with consistent error handling, multiple protocol support (Prometheus, InfluxDB, DataDog, OpenTSDB, etc.), and robust operational features (timeouts, graceful shutdown, concurrency limits). The main gaps are: (1) no formal API versioning strategy, relying instead on path prefixes; (2) pagination relies on `limit` query parameters and time ranges rather than cursor-based pagination, which can have performance implications at extreme scale; (3) middleware is implicitly layered in `handlerWrapper` rather than using a composable middleware chain pattern.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| HTTP Framework | Standard library `net/http` with custom wrappers | `lib/httpserver/httpserver.go:1` |
| Route Registration | Single `requestHandler` function dispatches to vminsert, vmselect, vmstorage | `app/victoria-metrics/main.go:130-167` |
| Route Organization | Path-based switch statements in each module's `RequestHandler` | `app/vminsert/main.go:131-389` |
| Error Contract | `ErrorWithStatusCode` struct with `StatusCode` field | `lib/httpserver/httpserver.go:712-727` |
| Error Response | `PrometheusErrorResponse` format `{"status":"error","errorType":"%d","error":"%q"}` | `lib/httpserver/prometheus_error_response.qtpl:4-10` |
| Error Sending | `SendPrometheusError` function for Prometheus API errors | `lib/httpserver/prometheus.go:11-28` |
| Pagination | `limit` query parameter on `/api/v1/series`, `/api/v1/labels` | `app/vmselect/prometheus.go:722-728` |
| Streaming Export | `application/stream+json` content type on `/api/v1/export` | `app/vmselect/prometheus.go:334` |
| Chunked Export | `scalableWriter` flushes to `bufferedwriter.Writer` | `app/vmselect/prometheus.go:1265-1301` |
| Concurrency Limit | Semaphore channel `concurrencyLimitCh` for query concurrency | `app/vmselect/main.go:69-81` |
| Connection Timeout | `connTimeout` with jitter to prevent thundering herd | `lib/httpserver/httpserver.go:64,174-181` |
| Graceful Shutdown | `shutdownDelay` with `/health` returning 503 during grace period | `lib/httpserver/httpserver.go:62,393-404` |
| Panic Recovery | Deferred recover in `handlerWrapper` that calls `os.Exit(1)` | `lib/httpserver/httpserver.go:313-320` |
| Security Headers | HSTS, CSP, X-Frame-Options added in `handlerWrapper` | `lib/httpserver/httpserver.go:323-331` |
| CORS | `EnableCORS` sets `Access-Control-Allow-Origin: *` | `lib/httpserver/httpserver.go:515-523` |
| Auth - Basic | `CheckBasicAuth` validates `httpAuth.*` flags | `lib/httpserver/httpserver.go:495-511` |
| Auth - Key | `CheckAuthFlag` validates `authKey` query arg | `lib/httpserver/httpserver.go:475-491` |
| Multi-protocol | Route definitions for Prometheus, InfluxDB, DataDog, OpenTSDB, OpenTelemetry, Zabbix, New Relic | `app/vminsert/main.go:167-388` |
| Metrics Endpoint | `/metrics` serves Prometheus metrics with auth check | `lib/httpserver/httpserver.go:414-423` |
| Health Endpoint | `/health` returns OK or 503 during shutdown delay | `lib/httpserver/httpserver.go:391-404` |
| Request URI Logging | `GetRequestURI` masks `authKey` in query params | `lib/httpserver/httpserver.go:757-790` |
| Response Compression | `gzipHandlerWrapper` using `gzhttp` package | `lib/httpserver/httpserver.go:276-289` |

## Answers to Dimension Questions

### 1. How are routes organised and registered — by resource, version, or domain?

Routes are organized **by function/domain** (vminsert for writes, vmselect for reads, vmstorage for admin) with path-based dispatch. The central `requestHandler` in `app/victoria-metrics/main.go:130-167` dispatches to module-specific handlers via `if vminsert.RequestHandler(w, r) { return true }` patterns. Within each module, routes use **path-based switch statements** (e.g., `app/vminsert/main.go:167-388`). There is **no formal versioning** — instead, multiple API paths are supported for protocol compatibility (e.g., `/prometheus/api/v1/write` and `/api/v1/write` both point to the same handler). The `lib/httpserver/path.go` appears to handle path prefix stripping.

### 2. Is there a consistent error contract clients can depend on?

**Yes, with caveats.** Two error formats are used:
- **Prometheus API format**: `{"status":"error","errorType":"<statusCode>","error":"<message>"}` via `StreamPrometheusErrorResponse` in `lib/httpserver/prometheus_error_response.qtpl:23-34`
- **Generic HTTP error format**: `http.Error(w, errStr, statusCode)` via `lib/httpserver/httpserver.go:698`

Prometheus API endpoints (`/api/v1/query`, `/api/v1/series`, etc.) consistently use `SendPrometheusError` (`lib/httpserver/prometheus.go:11-28`) which extracts the status code from `ErrorWithStatusCode` if present. Non-Prometheus endpoints may return plain `http.Error` responses. The `ErrorWithStatusCode` type (`lib/httpserver/httpserver.go:712-727`) allows handlers to specify HTTP status codes with errors. **No unified error response schema** exists across all endpoints — some use JSON `{"error":"..."}` format (e.g., zabbixconnector at `app/vminsert/main.go:241`), others use plain text.

### 3. How does the API handle pagination at scale without performance cliffs?

VictoriaMetrics **does not use traditional offset or cursor-based pagination**. Instead, it relies on:
- **`limit` query parameter** on series/label APIs (e.g., `/api/v1/series?limit=30000` at `app/vmselect/prometheus.go:722`)
- **Time range filtering** (`start`, `end` parameters) which is the natural pagination mechanism for time-series data
- **Query concurrency limits** via semaphore (`concurrencyLimitCh` at `app/vmselect/main.go:69-81`), causing `429 Too Many Requests` when exceeded (`app/vmselect/main.go:155-160`)
- **Deadline-based timeout** per query via `searchutil.GetDeadlineForQuery` (`app/vmselect/prometheus.go:754`)
- **Resource-based limits** on unique time series (`-search.maxUniqueTimeseries`), export series (`-search.maxExportSeries`), TSDB status series (`-search.maxTSDBStatusSeries`) — all configurable via flags

For the `/api/v1/export*` endpoints, data is streamed in chunks via `scalableWriter` (`app/vmselect/prometheus.go:1265-1301`) which flushes buffers >= 1MB. This allows exporting large datasets without loading them entirely into memory. **No cursor-based pagination exists**, so deep pagination with high `limit` values could result in large memory usage, though `maxSeriesLimit` (`app/vmselect/prometheus.go:59`) provides a safeguard.

### 4. What middleware is global vs per-route, and how is layering managed?

**Global middleware** is applied in `handlerWrapper` (`lib/httpserver/httpserver.go:307-376`):
1. **Panic recovery** (deferred recover calling `os.Exit(1)`) — line 313-320
2. **Security headers** (HSTS, CSP, X-Frame-Options) — line 323-331
3. **X-Server-Hostname** header — line 332
4. **Connection timeout check** (`whetherToCloseConn`) — line 334-337
5. **Path prefix trimming** (`-http.pathPrefix`) — line 340-359
6. **CORS preflight** (OPTIONS requests) — line 361-365
7. **ResponseWriter wrapper** with abort capability — line 367-369
8. **RequestHandler dispatch** — line 370-372
9. **Unsupported path error** — line 374-375

**Auth enforcement** is **per-route** via explicit `CheckAuthFlag` or `CheckBasicAuth` calls within route handlers. Protected paths include `/config`, `/reload`, `/delSeries`, `/force_merge`, `/snapshot`, etc. (`lib/httpserver/httpserver.go:463-470`). Auth is NOT applied globally in `handlerWrapper`; instead, routes that need auth explicitly call the check functions.

**No composable middleware chain** (like chain-of-responsibility or functional middleware) exists. Layering is implicit in `handlerWrapper` order, and each module's `RequestHandler` acts as both route and middleware for its domain.

### 5. How is API versioning handled without duplicating handlers?

**VictoriaMetrics does NOT use traditional API versioning** (no `/v1/`, `/v2/` prefixes). Instead:
- **Path aliasing**: The same handler serves multiple paths (e.g., `/prometheus/api/v1/write`, `/api/v1/write`, `/api/v1/push`, `/prometheus/api/v1/push` all map to the same `promremotewrite.InsertHandler` at `app/vminsert/main.go:168-179`)
- **Prefix stripping**: `/prometheus/` and `/graphite/` prefixes are stripped in `vmselect.RequestHandler` at `app/vmselect/main.go:111-115`, allowing clients to use either prefixed or non-prefixed paths
- **Protocol compatibility**: Multiple protocol-specific paths are mapped to the same handler (InfluxDB `/influx/write` and `/write`, DataDog `/datadog/api/v1/series` and `/datadog/api/v2/series`, etc.)
- **No version negotiation**: There is no version selection mechanism; clients must use the correct path for their protocol version

This approach avoids handler duplication but relies on documentation rather than versioning to communicate API changes.

## Architectural Decisions

1. **Single HTTP server with domain-divided routing**: One `httpserver.Serve` call with a `RequestHandler` that delegates to vminsert, vmselect, or vmstorage based on path. This avoids multiple HTTP servers but creates a large switch-like dispatcher.

2. **Panic recovery as architectural choice**: The `handlerWrapper` explicitly calls `os.Exit(1)` on panics rather than letting `net/http` recover them (`lib/httpserver/httpserver.go:313-320`). This is a deliberate decision to maintain state consistency at the cost of process restarts.

3. **Prometheus-compatible API as primary interface**: The API surface is designed around Prometheus remote read/write APIs with JSON responses following Prometheus format (`{"status":"error","errorType":...}`). This is a deliberate compatibility bet.

4. **Time-range-based pagination as primary model**: Since this is a time-series database, pagination is naturally expressed via time ranges (`start`, `end`) and `limit` on result sets rather than offset/cursor pagination. This aligns with Prometheus query semantics.

5. **Auth as per-route guards, not middleware**: Rather than declarative middleware, auth is called explicitly within handlers that need it. This is visible in `isProtectedByAuthFlag` (`lib/httpserver/httpserver.go:463-470`) which enumerates protected paths.

6. **ResponseWriter wrapper for connection abort**: The `responseWriterWithAbort` type (`lib/httpserver/httpserver.go:587-670`) wraps `http.ResponseWriter` to allow handlers to abort client connections by writing an incorrect HTTP chunk. This is used for hard errors.

## Notable Patterns

- **`scalableWriter`** (`app/vmselect/prometheus.go:1265-1301`): A `sync.Map` of per-worker `ByteBuffer` instances that are flushed when they exceed 1MB. Enables parallel buffering during streaming exports without mutex contention on the response writer.

- **`ErrorWithStatusCode`** (`lib/httpserver/httpserver.go:712-727`): An error wrapper struct embedding `error` and `StatusCode int`. Allows handlers to return errors that also specify HTTP status codes, extracted by `Errorf`.

- **Auth flag enumeration** (`lib/httpserver/httpserver.go:463-470`): `isProtectedByAuthFlag` uses path suffix matching (`strings.HasSuffix`) rather than a declarative attribute system to determine which routes need explicit auth checks.

- **Concurrency semaphore with timeout** (`app/vmselect/main.go:127-162`): Requests acquire a channel slot in a select statement with three cases: slot acquired, timeout exceeded (429), or context cancelled.

- **`limit_offset` transform function** (`app/vmselect/promql/transform.go:2280-2298`): Provides in-query paging via `limit_offset(limit, offset, q)` for time series, allowing clients to page through results within a query rather than via API pagination.

## Tradeoffs

1. **No cursor-based pagination**: While time-range pagination is natural for time-series data, clients needing deep pagination across many series must use multiple queries with `limit` and `offset` parameters. This can be slower than cursor-based approaches at extreme scale.

2. **Implicit versioning via path aliasing**: Supporting multiple equivalent paths (`/api/v1/write` AND `/prometheus/api/v1/write`) for compatibility increases route table complexity and makes it harder to deprecate old paths.

3. **No composable middleware**: Auth and other concerns are hardcoded in handler logic rather than declaratively composed. Adding new middleware requires modifying `handlerWrapper` or adding explicit calls in each handler.

4. **Prometheus error format for all API errors**: Using `{"status":"error",...}` JSON format on Prometheus endpoints is consistent, but non-Prometheus endpoints use plain `http.Error` text responses, creating an inconsistent client experience.

5. **Panic as fatal error**: Calling `os.Exit(1)` on panic maintains state consistency but causes process restarts that could disrupt other requests or affect availability.

6. **No rate limiting in httpserver**: Rate limiting is implemented in `vmauth` (a separate component) but not in the core `httpserver`. The core server relies on connection timeouts and per-query concurrency limits only.

## Failure Modes / Edge Cases

1. **Connection timeout with jitter**: The `connTimeout` is enforced via context with jitter (`lib/httpserver/httpserver.go:174-181`) to prevent thundering herd, but if jitter calculation produces an edge case near `math.MaxUint64`, timestamp arithmetic could overflow.

2. **Shutdown delay race**: During `shutdownDelay`, `/health` returns 503 to signal load balancers. If the delay is too short, some in-flight requests may be rejected before the server stops accepting connections (`lib/httpserver/httpserver.go:256-265`).

3. **ResponseWriter abort on premature headers**: `responseWriterWithAbort.abort()` writes an incorrect HTTP chunk to signal connection abortion (`lib/httpserver/httpserver.go:643-670`). If called after headers are sent, it may leave clients in an undefined state.

4. **Auth key masking in logs**: `GetRequestURI` masks `authKey` (`lib/httpserver/httpserver.go:771-774`) but only for POST form data. GET query parameters with `authKey` may still appear in request URIs logged elsewhere.

5. **Large export without `reduce_mem_usage`**: The `/api/v1/export` endpoint without `reduce_mem_usage` pre-fetches all results into memory before writing (`app/vmselect/prometheus.go:406-409`). For large result sets, this can cause OOM.

6. **CORS allowed for all origins**: `EnableCORS` sets `Access-Control-Allow-Origin: *` by default (`lib/httpserver/httpserver.go:520`). This cannot be narrowed to specific origins without code changes.

## Future Considerations

1. **Formal API versioning strategy**: If VictoriaMetrics needs to evolve the API without breaking existing clients, a formal versioning approach (e.g., `/api/v1/` prefix with transition periods) would provide clearer contracts than path aliasing.

2. **Cursor-based pagination**: For clients iterating over large series result sets, cursor-based pagination via `search_after` or opaque cursors could reduce query load compared to repeated `limit`/`offset` queries.

3. **Composable middleware framework**: Adopting a middleware chain pattern (similar to Go's `chi` or standard library's `Middleware` type) would make it easier to add cross-cutting concerns without modifying core `httpserver` code.

4. **Per-route rate limiting**: Currently rate limiting exists only in `vmauth`. Adding per-route or per-client-rate limiting in the core `httpserver` could prevent abusive clients from affecting other traffic.

5. **Structured error response schema**: A unified error schema across all endpoints (not just Prometheus API) would improve client developer experience and enable automated error handling.

6. **Origin-specific CORS**: The current `*` wildcard for CORS could be made configurable to allow specific origin allowlists for tighter security.

## Questions / Gaps

1. **No evidence found** for WebSocket support — VictoriaMetrics does not appear to support WebSocket connections based on code review.
2. **No evidence found** for SSE (Server-Sent Events) — streaming is achieved via chunked transfer encoding, not SSE.
3. **No evidence found** for request/response body size limits enforced at the httpserver level — limits like `maxRequestBodySizeToRetry` exist in `vmauth` (`app/vmauth/main.go:53`) but not in core `httpserver`.
4. **No evidence found** for a formal request validation framework — input validation is done ad-hoc within handlers rather than via a declarative validation middleware.
5. **Boundary of analysis**: This analysis focused on the single-node VictoriaMetrics server. The cluster version (`victoriametrics-cluster`) may have additional routing and API considerations not present in the single-node codebase.

---

Generated by `dimensions/04-http-api-surface.md` against `victoriametrics`.