# Source Analysis: openfga

## Extensibility & Plugin Architecture

### Source Info

| Field | Value |
|-------|-------|
| Name | openfga |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/openfga` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

OpenFGA does **not have a plugin architecture**. Instead, it follows a monolithic "batteries-included" design with interface-based swap points for extensibility. The system provides compile-time substitution points through Go interfaces and the functional options pattern, allowing users to swap storage backends and (to a limited degree) authentication methods at build/runtime configuration. No dynamic plugin loading, WASM, or external extension mechanism exists.

## Rating

**2** - Poor implementation or absent. OpenFGA has no plugin system. Extensibility is limited to:
- Swappable storage backends via interface (`OpenFGADatastore` at `pkg/storage/storage.go:407`)
- Three built-in authentication methods (none, preshared key, OIDC) selected at runtime configuration
- Standard gRPC/HTTP middleware chain (compile-time interceptor composition)
- Embedding as a library with functional options

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Storage Interface | `OpenFGADatastore` interface defining all storage operations | `pkg/storage/storage.go:407-421` |
| Storage Implementations | Four storage backends: memory, postgres, mysql, sqlite | `pkg/storage/memory/`, `pkg/storage/postgres/`, `pkg/storage/mysql/`, `pkg/storage/sqlite/` |
| Datastore Selection | Runtime switch on config.Datastore.Engine | `cmd/run/run.go:504-529` |
| Authenticator Interface | `authn.Authenticator` interface | `internal/authn/authn.go:*` |
| Auth Methods | Three built-in: NoopAuthenticator, PresharedKeyAuthenticator, OIDC | `internal/authn/*.go`, `internal/authn/presharedkey/presharedkey.go:13-44` |
| Auth Selection | Runtime switch on config.Authn.Method | `cmd/run/run.go:541-557` |
| Server Options | `OpenFGAServiceV1Option` functional options pattern | `pkg/server/server.go:261-869` |
| Middleware Chain | gRPC ChainUnaryInterceptor/ChainStreamInterceptor | `cmd/run/run.go:563-584` |
| Experimental Features | `Experimentals` slice with string-based feature flags | `pkg/server/config/config.go:107-121` |
| Library Embedding | `NewServerWithOpts` for embedding | `pkg/server/server.go:871-1028` |

## Answers to Dimension Questions

### 1. How are plugins discovered, loaded, and verified?

**No plugin system exists.** OpenFGA has no plugin discovery or loading mechanism. Storage backends are selected at runtime via configuration (`--datastore-engine` flag) and instantiated based on a switch statement in `cmd/run/run.go:504-529`. There is no verification of external plugins because none exist.

### 2. What extension points exist for custom business logic?

Limited extension points exist:

- **Storage backend**: Implement `OpenFGADatastore` interface (`pkg/storage/storage.go:407-421`) and register in the switch at `cmd/run/run.go:504-529`. Requires recompilation.
- **Authentication**: Implement `authn.Authenticator` interface (`internal/authn/authn.go`). Currently only three built-in implementations exist.
- **Middleware**: Extend the gRPC interceptor chain at build time in `cmd/run/run.go:563-641`. Cannot be extended at runtime.
- **Experimental features**: Feature flags defined in `pkg/server/config/config.go:107-121`, but these are internal flags, not external extension points.

### 3. How does the system prevent a misbehaving plugin from bringing down the host?

**Not applicable** - no plugin system exists. However, the system does have:
- Request timeouts configured via `RequestTimeout` and middleware (`pkg/middleware/timeout.go`)
- Panic recovery middleware first in the interceptor chain (`grpc_recovery.UnaryServerInterceptor` at `cmd/run/run.go:565-569`)
- Datastore connection pool limits (`MaxOpenConns`, `MaxIdleConns` in config)
- CEL condition evaluation cost limits (`MaxConditionEvaluationCost` at `pkg/server/config/config.go:67`)

### 4. How are plugin APIs versioned to prevent breakage on upgrade?

**No plugin API versioning exists.** Since there are no plugins, there is no API versioning mechanism. For the embedded library use case, the Go module system provides import versioning.

### 5. What debugging and observability exists for plugin execution?

**No plugin execution observability exists.** OpenFGA provides general observability:
- Prometheus metrics at `/metrics` endpoint (`pkg/server/config/config.go:299-303`)
- OpenTelemetry tracing (`pkg/server/config/config.go:248-254`)
- Structured logging with Zap (`pkg/logger/logger.go`)
- pprof profiler server (`pkg/server/config/config.go:292-296`)
- Request-level logging middleware (`pkg/middleware/logging/`)

## Architectural Decisions

1. **Monolithic design over plugin architecture**: OpenFGA prioritizes simplicity and correctness over extensibility. The codebase is a single binary with configurable components.

2. **Interface-based storage swap points**: The `OpenFGADatastore` interface (`pkg/storage/storage.go:407-421`) allows swapping databases but requires recompilation to add new backends.

3. **Functional options pattern**: Server configuration uses `OpenFGAServiceV1Option` functions (`pkg/server/server.go:261`) enabling flexible but compile-time-safe configuration.

4. **Compile-time authentication binding**: Authentication methods are bound at compile time via the switch in `cmd/run/run.go:541-557`. Users cannot add new auth methods without modifying the codebase.

5. **Middleware as extension mechanism**: The gRPC middleware chain (`cmd/run/run.go:563-641`) is the primary HTTP/gRPC-level extension point, but extensions require recompilation.

## Notable Patterns

1. **Options pattern**: `WithDatastore`, `WithLogger`, `WithResolveNodeLimit` etc. at `pkg/server/server.go:264-869`

2. **Interface composition**: `OpenFGADatastore` composes multiple smaller interfaces (`TupleBackend`, `AuthorizationModelBackend`, `StoresBackend`, etc.) at `pkg/storage/storage.go:407-421`

3. **Experimental feature flags**: String-based feature flags in `pkg/server/config/config.go:107-121` for incremental rollouts

4. **Context propagation wrappers**: `storagewrappers.NewContextWrapper` at `pkg/storage/storagewrappers/` for observability

## Tradeoffs

| Tradeoff | Impact |
|----------|--------|
| No dynamic plugins | Simplicity and correctness; cannot add custom logic without modifying core codebase |
| Interface-based storage | Users can implement custom storage but must recompile; no hot-swapping |
| Built-in auth only | Three methods (none, preshared, OIDC); no LDAP, SAML, OAuth extensions |
| Monolithic binary | Easy deployment; no separate plugin ecosystem management |
| Middleware chain compile-time | Standard Go limitation; cannot dynamically add interceptors at runtime |

## Failure Modes / Edge Cases

1. **Storage backend errors**: If a storage backend fails initialization, the server panics (see `cmd/run/run.go:508-529` error handling)

2. **Authenticator initialization failure**: Returns error from `authenticatorConfig` which propagates to server startup failure (`cmd/run/run.go:985-988`)

3. **Feature flag typos**: Experimental feature flags are string-based with no runtime validation; invalid flags are silently ignored

4. **No plugin isolation**: Since no plugin system exists, isolation concerns are moot - but this also means no protection against misbehaving extensions

5. **Library embedding risks**: When embedded as a library (`pkg/server/server.go:871`), caller has full access but shares the same process - bugs in caller code can affect the authorization engine

## Future Considerations

1. **Plugin system**: If OpenFGA were to add plugins, it would need:
   - Plugin discovery mechanism (directory scanning, config-based)
   - Plugin API contract versioning
   - Isolation mechanism (process, WASM, or goroutine)
   - Plugin verification/sandboxing

2. **External auth providers**: LDAP, SAML, OAuth2 integration would require either plugin system or compile-time provider selection

3. **Webhook/extension points**: Custom business logic during tuple writes, authorization checks, or model validation would require hook infrastructure

4. **SDK as extension**: The existing SDKs (Go, Node, Python, Java, .NET) are client-side only; no server-side extension via SDK

## Questions / Gaps

1. **Why no plugin system?** The design decision appears to prioritize correctness and simplicity over extensibility. No evidence found in docs or code explaining this choice.

2. **Can storage backends be added without modifying core?** No - adding a new storage backend requires adding a case to the switch at `cmd/run/run.go:504-529` and recompiling.

3. **Is there a roadmap for plugin support?** No evidence found of plugin roadmap or design documents.

4. **How does embedding compare to plugin model?** The library embedding pattern (`pkg/server/server.go:871`) provides some extensibility but shares the same process, limiting fault isolation.

---

Generated by `dimensions/13-extensibility-plugin-architecture.md` against `openfga`.
