# Source Analysis: openfga

## HTTP/API Surface Design

### Source Info

| Field | Value |
|-------|-------|
| Name | openfga |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/openfga` |
| Language / Stack | Go (gRPC + grpc-gateway v2) |
| Analyzed | 2026-05-19 |

## Summary

OpenFGA exposes its API primarily through **gRPC** with an **HTTP/JSON gateway** (grpc-gateway v2) that proxies HTTP/JSON requests to gRPC. Routes are auto-generated from protobuf service definitions rather than manually registered. The design prioritizes gRPC-first transport with HTTP as a secondary convenience layer, using protobuf-generated code for type safety and validation. Middleware is organized as gRPC interceptors in a chain, with a separate HTTP-specific error handler layer. Pagination uses cursor-based continuation tokens, and streaming is supported via gRPC server-side streaming.

## Rating

**8/10** — Strong implementation with clear architectural choices. The grpc-gateway pattern is well-executed with consistent error contracts and organized middleware. Minor gaps include no URL-based API versioning (package-based only) and HTTP streaming limited to gRPC protocols.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| HTTP Framework | Uses `grpc-gateway/v2` (`grpc_runtime.NewServeMux`) to serve HTTP/JSON | `cmd/run/run.go:766` |
| Route Registration | Routes auto-generated from protobuf via `openfgav1.RegisterOpenFGAServiceHandler` | `cmd/run/run.go:768-773` |
| Server Implementation | `Server` struct implements `openfgav1.OpenFGAServiceServer` | `pkg/server/server.go:167-259` |
| Error Definitions | Custom error types using gRPC `status.Error` with `openfgav1.ErrorCode` | `pkg/server/errors/errors.go:20-38` |
| HTTP Error Handler | Custom `CustomHTTPErrorHandler` converts encoded errors to HTTP JSON | `pkg/middleware/http/handler.go:66-118` |
| Middleware Chain | gRPC `ChainUnaryInterceptor` with recovery, logging, validation, auth | `cmd/run/run.go:563-641` |
| Logging Interceptor | Request/response logging with structured logs | `pkg/middleware/logging/logging.go:43-50` |
| Recovery Middleware | Panic recovery for HTTP (line 22) and gRPC (line 53) | `pkg/middleware/recovery/recovery.go:22-62` |
| Store ID Middleware | Extracts store_id from request into context | `pkg/middleware/storeid/storeid.go:63-65` |
| Request ID Middleware | UUID/trace ID request ID generation | `pkg/middleware/requestid/requestid.go:38-45` |
| Timeout Middleware | Request timeout enforcement | `pkg/middleware/timeout.go:31-37` |
| Validator Middleware | Protobuf validation on requests | `pkg/middleware/validator/validator.go:29-36` |
| CORS Configuration | CORS middleware with configurable allowed origins | `cmd/run/run.go:782-790` |
| Pagination | Cursor-based continuation tokens via `PaginationOptions` | `pkg/storage/storage.go:1-19` |
| Default Page Size | 100 as default page size | `pkg/server/config/config.go:34` |
| Streaming Support | `StreamedListObjects` via gRPC server-side streaming | `pkg/server/list_objects.go:194-328` |
| API Versioning | Package-based (protobuf import alias `openfgav1`), not URL path | `.golangci.yaml` import alias rules |
| gRPC Server Setup | `grpc.NewServer` with interceptor chain, service registration | `cmd/run/run.go:1123-1128` |
| Health Check | `healthv1pb.RegisterHealthServer` for health endpoints | `cmd/run/run.go:1125` |
| Config Schema | JSON schema for server configuration validation | `.config-schema.json:1-1200` |

## Answers to Dimension Questions

### 1. How are routes organised and registered — by resource, version, or domain?

Routes are **NOT manually registered**. They are auto-generated from protobuf service definitions in `openfga/api` repository. The two services registered are:
- `openfgav1.RegisterOpenFGAServiceHandler` — Main OpenFGA API
- `authzenv1.RegisterAuthZenServiceHandler` — AuthZEN endpoint

Service handlers are registered via `grpc_runtime.NewServeMux()` with custom options for error handling and response modification (`cmd/run/run.go:766-774`). Each handler file in `pkg/server/` corresponds to an RPC method:
- `check.go` — Check handler
- `list_objects.go` — ListObjects and StreamedListObjects
- `stores.go` — Store CRUD operations
- `write.go` — Write handler
- `read.go` — Read handler

### 2. Is there a consistent error contract clients can depend on?

**Yes**. OpenFGA uses a consistent error contract via gRPC status codes mapped to `openfgav1.ErrorCode` enums. Key error types defined in `pkg/server/errors/errors.go:20-38`:

```go
var (
    ErrAuthorizationModelResolutionTooComplex = status.Error(codes.Code(openfgav1.ErrorCode_authorization_model_resolution_too_complex), "...")
    ErrInvalidWriteInput                      = status.Error(codes.Code(openfgav1.ErrorCode_invalid_write_input), "...")
    ErrInvalidContinuationToken               = status.Error(codes.Code(openfgav1.ErrorCode_invalid_continuation_token), "...")
    ErrStoreIDNotFound                        = status.Error(codes.Code(openfgav1.NotFoundErrorCode_store_id_not_found), "...")
    // ...
)
```

HTTP conversion happens via `serverErrors.ConvertToEncodedErrorCode()` in `cmd/run/run.go:748`. The custom `CustomHTTPErrorHandler` (`pkg/middleware/http/handler.go:66-118`) converts gRPC errors to JSON with consistent structure. An `InternalError` wrapper (`pkg/server/errors/errors.go:40-78`) separates public vs internal error messages.

### 3. How does the API handle pagination at scale without performance cliffs?

Pagination uses **cursor-based continuation tokens** via the `ContinuationTokenSerializer` interface (`pkg/encoder/token_serializer.go`). Default implementation uses SQL-based serialization with `sqlcommon.NewSQLContinuationTokenSerializer()`.

Storage interface (`pkg/storage/storage.go:1-19`):
```go
type PaginationOptions struct {
    PageSize          int
    ContinuationToken string
}
```

**ReadChanges** enforces page size limits (`pkg/server/read_changes.go:32-41`) — values must be between 1 and `readChangesMaxPageSize`. Default page size is 100 (`pkg/server/config/config.go:34`).

**StreamedListObjects** (`pkg/server/list_objects.go:194-328`) uses gRPC server-side streaming for incremental results, avoiding large response payloads.

### 4. What middleware is global vs per-route, and how is layering managed?

**Global middleware via gRPC interceptor chain** in `cmd/run/run.go:563-641`:

```go
grpc.ChainUnaryInterceptor(
    grpc_recovery.UnaryServerInterceptor(),    // 1. Panic recovery (FIRST)
    grpc_ctxtags.UnaryServerInterceptor(),     // 2. Context tags
    requestid.NewUnaryInterceptor(),           // 3. Request ID
    // ... timeout if configured ...
    storeid.NewUnaryInterceptor(),             // 4. Store ID extraction
    logging.NewLoggingInterceptor(s.Logger),   // 5. Request logging
    validator.UnaryServerInterceptor(),         // 6. Validation
    // auth ...
    prometheusMetrics.UnaryServerInterceptor(), // 7. Metrics
)
```

**HTTP-specific** middleware (CORS) is applied via `cors.New()` in `cmd/run/run.go:782-790`.

**No per-route middleware** — all middleware is global. The middleware chain order is fixed at server startup, not configurable per-route.

Middleware files:
- `pkg/middleware/recovery/recovery.go:22-62` — HTTP and gRPC recovery
- `pkg/middleware/logging/logging.go:43-161` — Request/response logging
- `pkg/middleware/storeid/storeid.go:63-105` — Store ID context injection
- `pkg/middleware/requestid/requestid.go:38-59` — Request ID generation
- `pkg/middleware/timeout.go:31-54` — Timeout enforcement
- `pkg/middleware/validator/validator.go:29-51` — Protobuf validation

### 5. How is API versioning handled without duplicating handlers?

**Package-based versioning** — API definitions live in separate repo `github.com/openfga/api/proto/openfga/v1`. All imports use `openfgav1` alias (enforced in `.golangci.yaml`).

**No URL path versioning** (e.g., `/v1/...` paths). The version is determined by the protobuf package import, not the URL. Handlers are not duplicated — the protobuf-generated code provides a single implementation.

This approach avoids handler duplication but means clients must know the API version from the package, not from the URL path.

## Architectural Decisions

1. **gRPC-first with HTTP gateway**: Primary transport is gRPC; HTTP/JSON is a convenience layer via grpc-gateway. This prioritizes performance and type safety over HTTP simplicity.

2. **Protobuf-generated routes**: Routes are not manually registered; they come from `.proto` definitions. This ensures API definition and implementation stay in sync but sacrifices direct HTTP routing control.

3. **Interceptor-based middleware**: All middleware runs as gRPC interceptors in a fixed chain. This is efficient but means no per-route middleware configuration.

4. **Cursor-based pagination with serialization**: Continuation tokens are serialized (SQL by default), allowing stateless pagination without offset performance cliffs at scale.

5. **Error code mapping**: gRPC status codes are mapped to `openfgav1.ErrorCode` enums, providing structured error codes beyond basic HTTP status codes.

## Notable Patterns

- **Server struct pattern** (`pkg/server/server.go:167-259`): All server configuration lives in a `Server` struct with 50+ `With*` option functions for configuration.

- **Error wrapper pattern** (`pkg/server/errors/errors.go:40-78`): `InternalError` struct separates public and internal error details for security.

- **Streaming pagination** (`pkg/server/list_objects.go:194-328`): StreamedListObjects sends results incrementally via gRPC streaming, with separate timeout handling from non-streamed ListObjects.

- **Multi-service registration**: Both `openfgav1.OpenFGAServiceServer` and `authzenv1.AuthZenServiceServer` are registered on the same gRPC server.

- **Health and reflection registration**: `healthv1pb.RegisterHealthServer` and `reflection.Register` enable Kubernetes health probes and tooling like grpcurl.

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| gRPC-first design | HTTP/REST clients require grpc-gateway; not a simple REST API |
| Protobuf-generated routes | Cannot add custom HTTP routes easily; limited routing flexibility |
| No URL versioning | Clients must track API version via package, not URL path |
| Fixed middleware chain | Cannot apply different middleware to different endpoints |
| No HTTP/1.1 chunked streaming | Streaming only via gRPC/HTTP2, not plain HTTP chunked responses |

## Failure Modes / Edge Cases

1. **Invalid continuation tokens** return `ErrInvalidContinuationToken` (`pkg/server/errors/errors.go:25`) — clients must handle token expiration/rotation.

2. **Page size validation** in ReadChanges (`pkg/server/read_changes.go:32-41`) rejects values outside [1, readChangesMaxPageSize] range.

3. **Store ID not found** returns specific error (`pkg/server/errors/errors.go:27`) rather than generic 404, enabling clients to distinguish missing store from other not-found conditions.

4. **Resolution complexity limit** (`ErrAuthorizationModelResolutionTooComplex` at line 21) prevents deeply nested authorization model resolution from consuming unlimited resources.

5. **Throttled timeout** (`ErrThrottledTimeout` at line 35) handles cases where request completes but times out during write throttle.

6. **Internal error wrapping** (`pkg/server/errors/errors.go:40-78`) can hide internal details from clients, making debugging harder in production.

## Future Considerations

1. **REST-first alternative**: Consider exposing a native REST/HTTP API alongside gRPC for simpler client integration without gateway.

2. **Per-route middleware**: Currently all middleware is global; adding route-specific middleware would enable fine-grained authz, rate limiting, or tracing.

3. **URL-based versioning**: Current package-based versioning works but may confuse REST-oriented clients expecting `/v1/` paths.

4. **HTTP streaming**: Currently streaming is gRPC-only; adding HTTP SSE support could simplify browser-based clients.

5. **OpenAPI documentation**: While protobuf definitions exist, generated OpenAPI/Swagger docs could improve API discoverability.

## Questions / Gaps

1. **No evidence found** for rate-limiting middleware — only CORS and standard interceptors are configured. Production deployments may need external rate limiting.

2. **No evidence found** for request body size limits beyond protobuf validation.

3. **Streaming timeout behavior** (`StreamedListObjects` at `pkg/server/list_objects.go:194-328`) has separate handling but the specific timeout values are not clearly documented in the handler.

4. **Auth middleware placement** in the interceptor chain (`cmd/run/run.go:563-641`) shows `// auth ...` comment but auth interceptor implementation location is not clearly identified in the explored files.

---

Generated by `dimensions/04-http-api-surface.md` against `openfga`.