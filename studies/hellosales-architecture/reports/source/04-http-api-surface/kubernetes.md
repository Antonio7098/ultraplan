# Source Analysis: kubernetes

## HTTP/API Surface Design

### Source Info

| Field | Value |
|-------|-------|
| Name | kubernetes |
| Path | `sources/kubernetes` |
| Language / Stack | Go |
| Analyzed | 2026-05-19 |

## Summary

Kubernetes exposes its control plane via a RESTful HTTP API served by `kube-apiserver`. Routes are organized by API group and version, registered through go-restful with deterministic sorting. The error contract is a single `StatusError` type wrapping `metav1.Status`, providing consistent structure across all failures. Pagination uses a `Continue` token with `RemainingItemCount` for scale. Watch streaming is supported via chunked transfer encoding and WebSocket. Middleware layering is explicit: authentication → authorization → audit → deadline handling, applied per-request via `WithAuthentication` and `WithAuthorization` filters from `staging/src/k8s.io/apiserver/pkg/endpoints/filters/`.

## Rating

**8/10** — Excellent implementation with minor issues. The API surface is mature, well-structured, and handles pagination and streaming at scale. Versioning avoids handler duplication via internal version conversion. Gaps: no built-in rate limiting in the API server itself; deprecation handling could be more explicit in route registration.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| HTTP Framework | go-restful v3 used for route registration via `APIGroupVersion.InstallREST()` | `staging/src/k8s.io/apiserver/pkg/endpoints/groupversion.go:106` |
| Route Registration | `APIInstaller.Install()` iterates over storage handlers and registers restful routes with verb-specific handlers | `staging/src/k8s.io/apiserver/pkg/endpoints/installer.go:196` |
| Route Verbs | GET, LIST, PUT, PATCH, POST, DELETE, DELETECollection, WATCH, WATCHLIST, CONNECT all mapped | `staging/src/k8s.io/apiserver/pkg/endpoints/installer.go:800-1087` |
| Error Type | `StatusError` struct wraps `metav1.Status` for all REST API errors | `staging/src/k8s.io/apimachinery/pkg/api/errors/errors.go:35` |
| Error Factory Functions | `NewNotFound()`, `NewAlreadyExists()`, `NewForbidden()`, `NewConflict()`, `NewUnauthorized()`, `NewInvalid()`, `NewInternalError()` | `staging/src/k8s.io/apimachinery/pkg/api/errors/errors.go:145-387` |
| Error-to-Status Conversion | `ErrorToAPIStatus()` converts errors to `metav1.Status` with correct HTTP codes | `staging/src/k8s.io/apiserver/pkg/endpoints/handlers/responsewriters/status.go:34` |
| Status Structure | `metav1.Status` with `Status`, `Message`, `Reason`, `Details`, `Code` fields | `staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go:813` |
| Pagination Token | `Continue` string + `RemainingItemCount` *int64 on `ListMeta` | `staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go:82,94` |
| List Options Parsing | `listOpts()` parses `limit`, `fieldSelector`, `labelSelector`, `resourceVersion`, `timeoutSeconds` | `staging/src/k8s.io/apiserver/pkg/endpoints/handlers/get.go:202` |
| Watch Streaming | `serveWatchHandler()` returns `http.HandlerFunc` with WebSocket support via `golang.org/x/net/websocket` | `staging/src/k8s.io/apiserver/pkg/endpoints/handlers/watch.go:72-188` |
| Watch Server | `WatchServer` struct holds encoder, framer, timeout factory for streaming events | `staging/src/k8s.io/apiserver/pkg/endpoints/handlers/watch.go:190-212` |
| Authentication Filter | `WithAuthentication()` wraps handler, authenticates via `auth.AuthenticateRequest()`, strips `Authorization` header on success | `staging/src/k8s.io/apiserver/pkg/endpoints/filters/authentication.go:46-89` |
| Authorization Filter | `WithAuthorization()` checks RBAC via `a.Authorize()`, sets audit annotations | `staging/src/k8s.io/apiserver/pkg/endpoints/filters/authorization.go:51-95` |
| Audit Filter | `WithAudit()` intercepts response writer, records latency >500ms, handles panic recovery | `staging/src/k8s.io/apiserver/pkg/endpoints/filters/audit.go:42-90` |
| Middleware Chain Order | Config built in sequence: Authentication (line 207) → Authorization (line 212) → Audit (line 227) | `pkg/controlplane/apiserver/config.go:200-230` |
| API Group Versioning | `APIGroupVersion` struct with `GroupVersion`, `Root`, `Storage` map | `staging/src/k8s.io/apiserver/pkg/endpoints/groupversion.go:50` |
| Version Path Pattern | Paths follow `/apis/{group}/{version}` format | `staging/src/k8s.io/apiserver/pkg/endpoints/groupversion.go:107` |
| Long-Running Check | `BasicLongRunningRequestCheck` excludes watch/proxy from timeout enforcement | `staging/src/k8s.io/apiserver/pkg/endpoints/filters/request_deadline.go:49-50` |
| WatchList Support | `isListWatchRequest()` checks `SendInitialEvents` + `AllowWatchBookmarks` flags | `staging/src/k8s.io/apiserver/pkg/endpoints/handlers/get.go:328` |

## Answers to Dimension Questions

### 1. How are routes organised and registered — by resource, version, or domain?

Routes are organized by **API group and version** (domain-driven grouping). The `APIGroupVersion` struct (`staging/src/k8s.io/apiserver/pkg/endpoints/groupversion.go:50`) holds a `Storage` map of resource names to `rest.Storage` implementations. The `APIInstaller.Install()` method (`installer.go:196`) iterates over storage keys, calling `registerResourceHandlers()` (`installer.go:288`) which builds restful routes with deterministic sorting for swagger consistency. Paths follow `/apis/{group}/{version}` pattern (`groupversion.go:107`). Resources are not duplicated across versions; internal version conversion handles cross-version requests.

### 2. Is there a consistent error contract clients can depend on?

Yes. All REST errors are wrapped in `StatusError` (`staging/src/k8s.io/apimachinery/pkg/api/errors/errors.go:35`), which contains a `metav1.Status` object (`staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go:813`). The `Status` struct provides: `Status` (Success/Failure), `Message` (human-readable), `Reason` (machine-readable `StatusReason`), `Details` (含 `Causes` array for field validation), and `Code` (HTTP status). Factory constructors ensure consistent error construction: `NewNotFound()` → 404, `NewForbidden()` → 403, `NewConflict()` → 409, `NewInvalid()` → 422 with field causes. `ErrorToAPIStatus()` (`responsewriters/status.go:34`) converts any error to this contract, defaulting HTTP codes when not set.

### 3. How does the API handle pagination at scale without performance cliffs?

Pagination is cursor-based via `Continue` token (`staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go:82`) with optional `RemainingItemCount` (`types.go:94`) for client progress estimation. The `listOpts()` function (`staging/src/k8s.io/apiserver/pkg/endpoints/handlers/get.go:202`) parses `limit`, `fieldSelector`, `labelSelector`, and `resourceVersion` parameters. Default limits are set via `metainternalversion.SetListOptionsDefaults()` (`get.go:216`). Field selectors are transformed via `ConvertFieldLabel()` (`get.go:226`). The `Continue` token encodes the position in the result set and is opaque to clients. For watch scenarios, `SendInitialEvents` (`get.go:329`) allows resuming without replaying all events if the client supports it. Sharded list support exists via `ShardInfo` (`types.go:105`) for distributed scenarios.

### 4. What middleware is global vs per-route, and how is layering managed?

Middleware is **global** and applied as an ordered chain in `pkg/controlplane/apiserver/config.go`:
1. Authentication (`WithAuthentication` at `filters/authentication.go:46`) — authenticates request, stores user in context, strips `Authorization` header
2. Authorization (`WithAuthorization` at `filters/authorization.go:51`) — RBAC check, audit annotations for decision/reason
3. Audit (`WithAudit` at `filters/audit.go:42`) — response interception, latency logging >500ms, panic recovery
4. Request deadline (`WithRequestDeadline` at `filters/request_deadline.go:49`) — timeout enforcement for non-long-running requests
5. Impersonation handling (`filters/impersonation/impersonation.go`) — user impersonation with caching
6. Metrics (`filters/metrics.go`) — in-flight request tracking
7. Tracing (`filters/traces.go`) — OpenTelemetry spans

Per-route middleware is not typical; the filter chain is request-scoped and inserted by `genericapiserver.Config` at startup. Long-running requests (watch, proxy, exec, portforward, attach, log) are exempted from deadline enforcement via `BasicLongRunningRequestCheck` (`config.go:180` and `filters/request_deadline.go:50`).

### 5. How is API versioning handled without duplicating handlers?

Versioning is handled through **internal version conversion** rather than duplicating handlers. The `APIGroupVersion` holds a single `Storage` map for all versions of a resource group. When a request arrives at version `v1`, the `Decoder` uses `Convert()` to transform to the internal version for storage, and the `Encoder` converts back to the requested version for response. The `ConvertabilityChecker` interface (`staging/src/k8s.io/apiserver/pkg/endpoints/groupversion.go:39`) determines which versions can convert to which others. Multiple versions of the same resource can be served simultaneously; the path `/apis/batch/v1` and `/apis/batch/v1beta1` share the same storage backend. `AllServedVersionsByResource` (`groupversion.go:61`) tracks which versions are available per resource. This avoids the need for version-specific handler copies.

## Architectural Decisions

1. **Single error type hierarchy**: All REST errors funnel through `StatusError` → `metav1.Status`, providing clients a predictable structure regardless of the error source. This simplifies client error handling at the cost of some flexibility.

2. **go-restful for route registration**: Using go-restful (`staging/src/k8s.io/apiserver/pkg/endpoints/installer.go:28`) provides a well-understood routing framework with good ecosystem support. Routes are deterministic-sorted for consistent API documentation output.

3. **Internal version conversion for versioning**: Instead of per-version handler copies, storage operates on internal types and conversion happens at the serialization boundary. This is a well-known Kubernetes pattern that keeps storage simple while supporting multiple API versions.

4. **Chunked watch streaming**: Watch endpoints (`staging/src/k8s.io/apiserver/pkg/endpoints/handlers/watch.go:72`) use a `WatchServer` struct with framer and encoder to stream events as they occur. This avoids buffering large result sets and enables real-time updates.

5. **Middleware-as-filter chain**: Authentication, authorization, audit are composed as `http.Handler` wrappers, not as middleware injected per-route. This simplifies reasoning about order but means all requests go through all filters (though some like deadline have long-running exemptions).

## Notable Patterns

- **`rest.Storage` interface**: All API endpoints implement `rest.Storage` (`staging/src/k8s.io/apiserver/pkg/registry/rest/rest.go`), which provides `Getter`, `Lister`, `Updater`, etc. The installer maps HTTP verbs to storage methods dynamically (`installer.go:800-1087`).

- **Request scope**: `RequestScope` (`staging/src/k8s.io/apiserver/pkg/endpoints/handlers/request.go`) carries context including serializer, namer,Convertor across handler chain.

- **Negotiated content type**: `NegotiateOutputMediaType()` (`staging/src/k8s.io/apiserver/pkg/endpoints/handlers/negotiation/negotiation.go`) handles Accept headers and supports JSON, CBOR, protobuf.

- **Table response format**: `asTable()` (`staging/src/k8s.io/apiserver/pkg/endpoints/handlers/response.go:367`) converts list results to `metav1.Table` for generic display, supporting `PartialObjectMetadata` for efficient metadata-only retrieval.

- **Impersonation caching**: `impersonation/cache.go` caches impersonated users to reduce RBAC evaluation overhead.

## Tradeoffs

1. **No built-in rate limiting**: The API server does not include request rate limiting; this must be handled by an external layer (e.g., API gateway, kubelet-side quota). This keeps the core simple but shifts responsibility.

2. **go-restful implicit ordering**: go-restful routes are matched in registration order (`installer.go:209` sorts them), which is deterministic but relies on the sorting logic being correct. A mistake in ordering could cause routes to shadow others unexpectedly.

3. **Status object for all errors**: Using `metav1.Status` for all errors (including validation failures with field-level causes) is comprehensive but verbose. Clients parsing 422 responses must handle the `Details.Causes` array for field-level errors.

4. **Authentication header stripping**: After successful authentication, the `Authorization` header is deleted (`filters/authentication.go:89`) to prevent it from being forwarded in impersonation or proxy scenarios. This is correct but means downstream handlers cannot re-authenticate.

5. **Continue token opacity**: The `Continue` token is opaque, meaning clients cannot construct resume tokens manually. If the token expires (due to `resourceVersion` being too old), the server returns `410 Gone` with `StatusReasonExpired`.

## Failure Modes / Edge Cases

1. **Expired continue token**: When a `Continue` token is no longer valid (resourceVersion too old), `NewResourceExpired()` (`staging/src/k8s.io/apimachinery/pkg/api/errors/errors.go:274`) returns HTTP 410 with reason `StatusReasonExpired`. Clients must restart the list from the beginning.

2. **Watch timeout**: Watches have a configurable timeout (`get.go:276`). If no events occur within the window, the connection is closed. Clients must handle re-establishing watches.

3. **Storage conflicts**: etcd conflict errors (optimistic locking failures) are converted to HTTP 409 via `storage.IsConflict()` (`responsewriters/status.go:64`) and returned as `NewConflict()`. Clients must retry with fresh `resourceVersion`.

4. **Request body size limits**: `MaxRequestBodyBytes` on `APIGroupVersion` (`groupversion.go:100`) enforces a limit on request body size. Exceeding it returns 413.

5. **Field selector conversion errors**: If a client sends a field selector with fields that cannot be converted for the target version, `ConvertFieldLabel()` (`get.go:226`) returns an error and the list fails with 400 Bad Request.

6. **Anonymous user DoS mitigation**: Authentication filter (`authentication.go:116-121`) implements HTTP/2 DoS mitigation for anonymous users, rejecting requests that appear to be rapidly re-authenticating.

7. **Impersonation constraints**: Constrained impersonation (`impersonation/constrained_impersonation.go`) enforces that users can only impersonate certain groups or users, preventing privilege escalation via `Impersonate-*` headers.

## Future Considerations

1. **Sharded list GA**: `ShardInfo` (`staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/types.go:97`) is alpha and requires `ShardedListAndWatch` feature gate. Full GA would enable more efficient large-scale list operations across cluster shards.

2. **WatchList improvements**: The `SendInitialEvents` + `AllowWatchBookmarks` pattern (`get.go:328`) is evolving to reduce re-list overhead on watch resume. Further optimization of the continue token encoding could improve large cluster watch resume times.

3. **CBOR serving**: Feature gate `CBORServingAndStorage` (`features.CBORServingAndStorage`) enables CBOR-encoded responses, which could reduce bandwidth for large watch streams. This is currently behind a feature gate.

4. **Per-resource OpenAPI bundling**: Currently OpenAPI specs are served per-group/version. Aggregating them efficiently for large clusters with many CRDs remains a challenge.

## Questions / Gaps

1. **Rate limiting strategy**: No evidence of built-in rate limiting in the API server. How do production deployments handle this? Is there a standard configuration approach for kube-apiserver?

2. **API deprecation visibility**: While `staging/src/k8s.io/apiserver/pkg/endpoints/deprecation/` exists, how are deprecated API versions announced to clients? Are there integration tests for deprecation path behavior?

3. **Version skew handling for aggregated APIs**: The `UnknownVersionInteroperabilityProxy` feature (`config.go:311`) handles peer API server version skew. How is this tested in integration?

4. **Streaming compression**: Watch endpoints use chunked transfer encoding but gzip compression is mentioned in `SerializeObject()` (`responsewriters/errors.go:92`). How is compression negotiated and is it used for watch streams?

5. **Request deadline fairness**: The deadline filter (`request_deadline.go`) sets context deadlines per-request. With many long-running watches, how does the scheduler prevent starvation of short requests?

---

Generated by `dimensions/04-http-api-surface.md` against `kubernetes`.