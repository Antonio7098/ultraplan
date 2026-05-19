# Source Analysis: openfga

## Dependency Injection & Composition

### Source Info

| Field | Value |
|-------|-------|
| Name | openfga |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/openfga` |
| Language / Stack | Go |
| Analyzed | 2026-05-19 |

## Summary

OpenFGA uses **manual dependency injection via functional options** — not a DI container framework. The composition root is `cmd/run/run.go:405` (`run()` function), which wires all services together using typed constructor functions and `With*` option builders. There is no `init()` hell and no global mutable state beyond a single pinned TLS certificate pool (`cmd/run/run.go:101`). Services are constructed in explicit dependency order with shutdown handled via a `list.List` cleanup chain (`cmd/run/run.go:943`).

## Rating

**8/10** — Good implementation with minor issues. The functional options pattern provides excellent testability and clear ownership, but the lack of a formal DI container means the wiring logic in `run()` is lengthy (~90 lines of `With*` calls at `cmd/run/run.go:1044-1109`). Startup ordering is correct and shutdown is properly managed with guaranteed ordering through the cleanup list.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Composition root | `run()` function orchestrates all service creation | `cmd/run/run.go:405-420` |
| DI approach | Functional options pattern (`WithDatastore`, `WithLogger`, etc.) | `pkg/server/server.go:261-864` |
| Server construction | `MustNewServerWithOpts()` with variadic options | `pkg/server/server.go:657-664` |
| Dependency verification | `if s.datastore == nil { return nil, fmt.Errorf("...") }` check | `pkg/server/server.go:939-941` |
| Context verification | `if s.ctx == nil` check prevents nil context | `pkg/server/server.go:944-946` |
| Datastore creation | Factory function based on engine config (memory/postgres/mysql/sqlite) | `cmd/run/run.go:502-534` |
| Authenticator creation | Factory function switch on auth method | `cmd/run/run.go:537-558` |
| Shutdown management | `cleanups` list with `PushFront` ordering for LIFO release | `cmd/run/run.go:943-963` |
| Cleanup wrapper | `cleanupFromPlainFunc` converts plain funcs to context-aware cleanups | `cmd/run/cleanups.go:25-41` |
| gRPC graceful stop | `cleanupGrpcServer` falls back to hard stop on timeout | `cmd/run/cleanups.go:45-55` |
| Resolver chain | `CheckResolverOrderedBuilder.Build()` creates circular delegate chain | `internal/graph/builder.go:73-106` |
| Shared resources | `NewSharedDatastoreResources()` manages caches and waitgroups | `internal/shared/shared.go:67-141` |
| Storage interface | `OpenFGADatastore` interface defines all datastore operations | `pkg/storage/storage.go:409-421` |
| Authenticator interface | `Authenticator` interface with `Authenticate()` and `Close()` | `internal/authn/authn.go:20-26` |
| Interface ownership | Storage interfaces defined in `pkg/storage/storage.go` — producer-defined | `pkg/storage/storage.go:145-421` |
| Test seam | `server.MustNewServerWithOpts(ds, ...)` allows datastore injection | `pkg/server/server.go:657-664` |
| Test support | `pkg/server/test/server.go:10` runs tests with injected datastore | `pkg/server/test/server.go:10-12` |

## Answers to Dimension Questions

**1. How does the project wire its dependency graph without global state or init() hell?**

OpenFGA avoids `init()` functions for service wiring. The composition root is `cmd/run/run.go:405` (`run()` function). Dependencies flow via functional options (`WithDatastore`, `WithLogger`, etc. at `pkg/server/server.go:261-864`) to `MustNewServerWithOpts()`. There is one package-level variable — `grpcTLSCertPool` at `cmd/run/run.go:101` — which is an atomic pointer to an `x509.CertPool` for TLS certificate sharing, not mutable application state.

**2. Are interfaces defined by consumers or producers?**

Interfaces are defined by **producers** in the storage package. `OpenFGADatastore` interface at `pkg/storage/storage.go:409` is defined in `pkg/storage/storage.go` (the storage package), not by consumers. The server package depends on this interface via `storage.OpenFGADatastore` type. Similarly, `Authenticator` at `internal/authn/authn.go:20` is defined in the authn package.

**3. How is startup ordering managed when services depend on each other?**

Startup ordering is managed **implicitly through sequential construction** in `run()`. The sequence is:
1. Logger creation (`cmd/run/run.go:415`)
2. Telemetry setup with cleanup (`cmd/run/run.go:965-966`)
3. Datastore creation (`cmd/run/run.go:980-983`)
4. Authenticator creation (`cmd/run/run.go:985-989`) — authenticator cleanup registered
5. gRPC server options building (`cmd/run/run.go:991-997`)
6. Optional profiler server with cleanup (`cmd/run/run.go:1000-1022`)
7. Optional metrics server with cleanup (`cmd/run/run.go:1024-1042`)
8. Server construction via `MustNewServerWithOpts()` (`cmd/run/run.go:1044-1109`)
9. gRPC server registration and listener setup (`cmd/run/run.go:1122-1144`)
10. Optional HTTP server with cleanup (`cmd/run/run.go:1147-1189`)
11. Optional playground server (`cmd/run/run.go:1191-1199`)

The cleanup list uses `PushFront` for LIFO ordering (`cmd/run/run.go:966`, `1021`, `1041`, `1111`, `1188`, `1198`), ensuring later-started services stop first.

**4. What happens during graceful shutdown — is ordering guaranteed?**

Yes, ordering is guaranteed via the cleanup list pattern at `cmd/run/run.go:943-963`. The deferred function iterates `cleanups.Front()` to `cleanups.Back()`, executing each cleanup with a timeout context based on `config.ShutdownTimeout` (default 10s at `pkg/server/config/config.go:90`). `cleanupGrpcServer` at `cmd/run/cleanups.go:45-55` attempts graceful stop first, falling back to hard `Stop()` if the context expires. Each resource registers its cleanup via `PushFront`, so startup order is reversed on shutdown.

**5. Can individual services be tested without booting the entire system?**

Yes. The functional options pattern at `pkg/server/server.go:261-864` allows constructing a `Server` with only required dependencies. `MustNewServerWithOpts()` at line 657 panics on construction error (suitable for production), while `NewServerWithOpts()` at line 873 returns errors for tests. The datastore is the primary seam — `pkg/server/test/server.go:10` demonstrates `RunAllTests(t, ds storage.OpenFGADatastore)` passing in any implementation. A mock datastore can be provided to test server logic in isolation.

## Architectural Decisions

- **Functional options over DI container**: Chosen for simplicity and type safety. Each `With*` function is a simple closure that mutates the server struct. This avoids reflection-based injection and makes the code easier to understand.
- **Manual composition root in `run()`**: All wiring centralized in `cmd/run/run.go:405-1205`. This makes the startup sequence explicit and debuggable. Downside: the function is long (~800 lines).
- **Storage interface as the core abstraction**: `OpenFGADatastore` at `pkg/storage/storage.go:409` is the primary interface that server depends on, allowing PostgreSQL, MySQL, SQLite, or in-memory implementations.
- **Cleanup list for shutdown ordering**: Uses `container/list.List` with `PushFront` to collect cleanup functions in reverse startup order (`cmd/run/run.go:943`). This is a lightweight alternative to a formal lifecycle manager.

## Notable Patterns

- **`With*` option functions**: `OpenFGAServiceV1Option` func types (`pkg/server/server.go:261`) that mutate the `Server` struct. Consistent naming and implementation pattern across ~50 options.
- **Circular resolver chain**: `internal/graph/builder.go:97-103` links resolvers in a circular linked list where the last resolver delegates back to the first. The `SetDelegate`/`GetDelegate` pattern at `internal/graph/interface.go:36-40` enables this.
- **Context propagation wrapping**: `storagewrappers.NewContextWrapper()` at `pkg/server/server.go:991` conditionally wraps the datastore to propagate request cancellation.
- **Singleflight for deduplication**: `singleflight.Group` at `pkg/server/server.go:252` is shared across caches and used in `internal/shared/shared.go:50` for datastore operations.

## Tradeoffs

- **No external DI framework**: Avoids complexity but places all wiring burden on `run()`. Adding a new service dependency requires modifying `run()` directly.
- **Explicit is better than implicit**: Every dependency is visible in `run()`. However, the sheer number of `With*` options (50+) makes the construction code verbose.
- **Functional options are immutable after construction**: Once `Server` is constructed via `NewServerWithOpts()`, options cannot be changed. This is good for thread safety but limits dynamic reconfiguration.
- **Cleanup ordering relies on conventions**: `PushFront` is used consistently, but there's no compile-time enforcement that all services register cleanups. A missing cleanup registration would leak resources.

## Failure Modes / Edge Cases

- **Datastore creation failure** at `cmd/run/run.go:980-983`: The error is returned but telemetry (already started at line 965) is not explicitly closed on this path. The defer handles it since the cleanup was already pushed.
- **Authenticator failure** at `cmd/run/run.go:985-988`: Same pattern — error return after cleanups are registered.
- **TLS cert watcher goroutine leak**: `watchAndLoadCertificateWithCertWatcher` at `cmd/run/run.go:1236-1265` starts a goroutine that runs until context cancellation. If context is never cancelled (e.g., process crash), the goroutine leaks. This is generally acceptable.
- **Missing required dependency check**: `if s.datastore == nil` at `pkg/server/server.go:939` returns an error, but other required dependencies (like `ctx`) are checked separately at line 944.
- **Context timeout on shutdown**: If `config.ShutdownTimeout` is too short, `cleanupGrpcServer` will call `grpcServer.Stop()` instead of `GracefulStop()` (`cmd/run/cleanups.go:50-51`), potentially interrupting in-flight requests.

## Future Considerations

- Consider a formal DI container (e.g., `wire`) if the `run()` function continues to grow. The functional options pattern scales poorly as option count increases.
- The `grpcTLSCertPool` at `cmd/run/run.go:101` is a package-level global that could be encapsulated into a struct owned by the composition root.
- Add compile-time verification that all services register a cleanup, perhaps via a `registerCleanup()` interface that the composition root validates.

## Questions / Gaps

- **No evidence of lazy initialization**: All services are constructed eagerly in `run()`, even if they may not be used (e.g., playground server). This increases startup time for cases where not all features are enabled.
- **Singleflight group sharing**: The `singleflight.Group` is shared across caches (`pkg/server/server.go:252`) but it's unclear if this creates contention for different query types. No evidence found of tuning this for different workloads.
- **No interface for server options**: `OpenFGAServiceV1Option` is a function type, not an interface. This means there's no way to inspect which options were applied without examining the resulting `Server` struct.