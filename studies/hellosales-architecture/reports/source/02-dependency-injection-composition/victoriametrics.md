# Source Analysis: victoriametrics

## Dependency Injection & Composition

### Source Info

| Field | Value |
|-------|-------|
| Name | victoriametrics |
| Path | `sources/victoriametrics` |
| Language / Stack | Go |
| Analyzed | 2026-05-19 |

## Summary

VictoriaMetrics uses **manual constructor injection** with a centralized composition root in `app/victoria-metrics/main.go`. There is no DI container. Services (`vmstorage`, `vmselect`, `vminsert`) are initialized in a strict order and communicate via direct package-level variables (e.g., `vmstorage.Storage`, `vmstorage.WG`). The approach is explicit and auditable but relies on conventions (e.g., `WG.Add/Done` pattern) rather than enforced lifecycle contracts.

## Rating

**7/10** — Good implementation with minor issues. The manual wiring is explicit and startup/shutdown ordering is well-defined, but global package variables for shared state and the reliance on ad-hoc `sync.WaitGroup` for lifecycle tracking introduce coupling that is not visible in type signatures. Testing seams exist but require careful setup.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Composition root | Main initializes services sequentially: `vmstorage.Init()`, `vmselect.Init()`, `vminsert.Init()` | `app/victoria-metrics/main.go:96-99` |
| Global storage reference | `Storage *storage.Storage` and `WG syncwg.WaitGroup` are package-level vars | `app/vmstorage/main.go:192,197` |
| Constructor injection | `MustOpenStorage(path, opts OpenOptions)` accepts `OpenOptions` struct | `lib/storage/storage.go:178` |
| Shutdown ordering | `httpserver.Stop()` → `vminsert.Stop()` → `vmstorage.Stop()` → `vmselect.Stop()` | `app/victoria-metrics/main.go:113-125` |
| Lifecycle wrapper | All storage calls wrapped in `WG.Add(1)...WG.Done()` for graceful shutdown | `app/vmstorage/main.go:205-213` |
| HTTP server lifecycle | `httpserver.Serve()` starts servers; `httpserver.Stop()` performs graceful shutdown | `lib/httpserver/httpserver.go:108,222` |
| Graceful shutdown delay | Optional `shutdownDelay` allows load balancer deregistration before stop | `lib/httpserver/httpserver.go:62` |
| Readiness check | `/ready` endpoint waits for scrape config initialization | `app/vminsert/main.go:375-384` |
| Interface for request handling | `RequestHandler func(w http.ResponseWriter, r *http.Request) bool` is a function type, not an interface | `lib/httpserver/httpserver.go:90` |
| Concurrent safe metrics | Storage uses `atomic` types and `sync.Mutex` for internal state | `lib/storage/storage.go:44-158` |
| Worker pool graceful stop | `syncwg.WaitGroup` used instead of `sync.WaitGroup` for concurrent Add from goroutines | `lib/syncwg/syncwg.go` |

## Answers to Dimension Questions

### 1. How does the project wire its dependency graph without global state or init() hell?

VictoriaMetrics uses a **single composition root** (`app/victoria-metrics/main.go`) where services are instantiated and wired explicitly in `main()`. Each service package exposes `Init()` and `Stop()` functions. There are no `init()` functions performing complex setup. The storage instance is assigned to a package-level variable (`vmstorage.Storage`) to be accessible from HTTP handlers, which is a form of global state but is explicit and limited to the package.

**Evidence**: `app/victoria-metrics/main.go:50-128` shows the sequential initialization: `vmstorage.Init()`, `vmselect.Init()`, `vminsert.Init()`.

### 2. Are interfaces defined by consumers or producers?

**Producers define interfaces internally**; consumers use the concrete types directly. The `storage.Storage` struct is concrete, not an interface. The httpserver uses a `RequestHandler` function type (`lib/httpserver/httpserver.go:90`) rather than an interface. The `Notifier` interface in `app/vmalert/notifier/notifier.go:10` is defined by the producer package. This means coupling is at the struct level, not the interface level, making mocking for tests require more effort.

**Evidence**: `lib/httpserver/httpserver.go:84-90` — `RequestHandler` is a function type, not an interface with methods.

### 3. How is startup ordering managed when services depend on each other?

Startup order is enforced by **call order in `main()`**. The sequence is:
1. `vmstorage.Init()` — opens storage, starts background workers
2. `vmselect.Init()` — initializes query caches, uses `vmstorage.DataPath`
3. `vminsert.Init()` — starts ingestion servers (graphite, influx, etc.)

The `vmselect.Init()` function at `app/vmselect/main.go:63-74` reads `vmstorage.DataPath` directly, creating an implicit dependency that is not expressible in the type system.

**Evidence**: `app/victoria-metrics/main.go:88-106` and `app/vmselect/main.go:63-66` where `vmstorage.DataPath` is used for temp and cache directories.

### 4. What happens during graceful shutdown — is ordering guaranteed?

**Yes, ordering is guaranteed by explicit call sequence** in `main()`:
```go
pushmetrics.Stop()
stopSelfScraper()
httpserver.Stop(listenAddrs)     // stop HTTP first to stop accepting
vminsertcommon.StopIngestionRateLimiter()
vminsert.Stop()                  // stop ingestion
vmstorage.Stop()                 // stop storage (waits on WG)
vmselect.Stop()                  // stop query processing
```

The `vmstorage.Stop()` calls `WG.WaitAndBlock()` (`app/vmstorage/main.go:330`) which waits for all in-flight operations (those wrapped in `WG.Add(1)...WG.Done()`) before closing the storage.

**Evidence**: `app/victoria-metrics/main.go:109-127` and `app/vmstorage/main.go:322-337`.

### 5. Can individual services be tested without booting the entire system?

**Partially**. The `lib/storage/storage.go` has a `MustOpenStorage()` constructor that can be called directly with a temporary path, and the storage package has extensive tests (e.g., `lib/storage/storage_test.go`). However, services like `vmselect` and `vminsert` depend on `vmstorage.Storage` being set. The `apptest/` directory contains integration-style tests that spin up real components.

**Evidence**: `lib/storage/storage_test.go:307` — `TestStorageOpenClose` tests storage in isolation with `mustOpenStorage` helper. `apptest/vmstorage.go` and `apptest/vmsingle.go` show test helpers for integration testing.

## Architectural Decisions

- **No DI container**: VictoriaMetrics avoids external DI frameworks, relying on explicit construction in `main()`. This keeps dependencies visible and avoids magic, but does not enforce ordering at the type level.
- **Package-level shared state**: `vmstorage.Storage` is a package-level singleton accessed by `vmselect` and `vminsert` packages. This is a pragmatic choice for a single-process deployment but creates implicit coupling.
- **`syncwg.WaitGroup` for lifecycle tracking**: All storage operations call `WG.Add(1)` before and `WG.Done()` after, providing a mechanism for graceful shutdown. This is a convention, not an interface contract — nothing forces new methods on `storage.Storage` to follow this pattern.
- **`OpenOptions` struct for configuration**: Constructor accepts an `OpenOptions` struct rather than many arguments, allowing optional parameters without breaking API.

## Notable Patterns

- **`Init/Stop` pairs**: Each major package (`vmstorage`, `vmselect`, `vminsert`) exposes `Init()` and `Stop()` functions for lifecycle management. This is a simple and consistent pattern.
- **Graceful shutdown via `sync.WaitGroup`**: `vmstorage.WG` is used to track in-flight operations. `WG.Add(1)` is called before every `Storage` operation.
- **`shutdownDelay` for load balancer deregistration**: The httpserver supports an optional delay before shutting down (`lib/httpserver/httpserver.go:62`) so that `/health` returns non-OK while the server is draining.
- **Atomic state for simple fields**: `Storage` uses `atomic.Uint64`, `atomic.Bool` for high-contention fields rather than mutexes.

## Tradeoffs

- **Global state via package variables**: `vmstorage.Storage` being a package-level `*storage.Storage` means any code in that package can access it, making it harder to reason about isolated unit tests. Not a true singleton pattern with ownership guarantees.
- **Implicit dependency on call order**: `vmselect.Init()` reads `vmstorage.DataPath` flag value at `app/vmselect/main.go:63`. If `vmstorage` were not initialized first, this would silently use the default path.
- **Convention-based lifecycle**: The `WG.Add/Done` pattern is not enforced by an interface. If a developer adds a new method to `storage.Storage` without wrapping it, graceful shutdown may leak operations.
- **No interface segregation for storage**: `*storage.Storage` is concrete. Consumers cannot inject alternative implementations for testing without modifying the package or using link-time substitution.

## Failure Modes / Edge Cases

- **Storage open failure**: `MustOpenStorage` panics on failure (`lib/storage/storage.go:181`), halting startup. No graceful recovery.
- **Double-stop protection**: Each `Stop()` function is designed to be called once. Calling `Stop()` twice would cause panics or undefined behavior.
- **In-flight operation timeout**: If a storage operation hangs (e.g., disk I/O blocked), `WG.Wait()` in `vmstorage.Stop()` would block indefinitely, preventing graceful shutdown.
- **Cache reset on startup**: If `resetCacheOnStartupFilename` exists in cache directory, contents are deleted (`lib/storage/storage.go:207-213`). This is intentional but could cause surprise data loss if the file is created accidentally.

## Future Considerations

- Consider introducing an interface for `Storage` operations to allow testing without the full storage implementation (e.g., a `StorageReader` interface for query-only tests).
- The `WG.Add/Done` convention could be formalized into a struct that wraps `storage.Storage` and enforces lifecycle tracking at the type level.
- Multi-tenancy is currently handled via auth tokens passed through request context (`lib/auth/auth.go`), but the storage layer does not have tenant isolation built into its API — it relies on higher layers to filter by tenant.

## Questions / Gaps

- **Is there a design document for the lifecycle architecture?** No evidence found. The `Init/Stop` pattern and `WG.Add/Done` convention appear to be tribal knowledge.
- **How is the dependency on `vmstorage.DataPath` in `vmselect.Init()` tested?** No clear evidence found of tests that verify select works when storage path is non-default.
- **Does `vmstorage.WG` have a maximum wait time?** No evidence found. If operations do not complete, `Stop()` would hang indefinitely.

---

Generated by `dimensions/02-dependency-injection-composition.md` against `victoriametrics`.