# Source Analysis: nats-server

## Dependency Injection & Composition

### Source Info

| Field | Value |
|-------|-------|
| Name | nats-server |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/nats-server` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

nats-server uses **manual constructor injection** via a monolithic `Server` struct composition root. No DI container exists. All dependencies flow through a single `Options` struct passed to `NewServer()`, with interface-based customization points for authentication, logging, and account resolution. Subsystems are direct struct fields initialized during construction, with explicit startup/shutdown ordering enforced procedurally in `Start()`/`Shutdown()` methods.

## Rating

**7/10** — Good implementation with minor issues

nats-server demonstrates a coherent manual wiring pattern with clear lifecycle management. The `Options` struct provides a clean injection mechanism, and interface-based customization (Authentication, Logger, AccountResolver) enables testability and extensibility. However, the massive `Server` struct (~400+ fields) is a composition anti-pattern that makes the dependency graph implicit rather than explicit. Startup ordering is hardcoded procedurally with no declarative dependency declaration.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Composition root / Server struct | `Server` struct with all subsystems as direct fields | `server/server.go:168-385` |
| Constructor / NewServer | `NewServer(opts *Options) (*Server, error)` | `server/server.go:695` |
| Options struct (DI vehicle) | `Options` struct with all configuration fields | `server/opts.go:397-590` |
| ConfigureOptions (wiring entry) | `ConfigureOptions()` parses flags/config into Options | `server/opts.go:6141-6228` |
| Main composition | `main()` creates opts → NewServer → ConfigureLogger → Run → WaitForShutdown | `main.go:97-134` |
| Authentication interface | `Authentication` interface for custom auth | `server/auth.go:40-43` |
| ClientAuthentication interface | `ClientAuthentication` interface | `server/auth.go:46-59` |
| Logger interface | `Logger` interface for logging abstraction | `server/log.go:27-46` |
| AccountResolver interface | `AccountResolver` interface | `server/accounts.go:4045-4053` |
| StreamStore interface | `StreamStore` interface | `server/store.go:93-137` |
| ConsumerStore interface | `ConsumerStore` interface | `server/store.go:360-378` |
| Start() lifecycle | Server startup with ordered subsystem initialization | `server/server.go:2237-2550` |
| Shutdown() lifecycle | Graceful shutdown with reverse ordering | `server/server.go:2558-2727` |
| WaitForShutdown() | Blocks until `shutdownComplete` channel closed | `server/server.go:2748-2750` |
| JetStream struct | JetStream subsystem as `atomic.Pointer[jetStream]` field | `server/server.go:192` |
| internal struct | Eventing subsystem (`*internal`) | `server/events.go:124-147` |
| srvGateway struct | Gateway subsystem | `server/gateway.go:134-185` |
| Test seam (RunServer) | `RunServer()` helper for isolated testing | `server/server_test.go:80-100` |
| DefaultOptions() | Test helper providing defaults | `server/server_test.go:66-77` |

## Answers to Dimension Questions

### 1. How does the project wire its dependency graph without global state or init() hell?

**Manual constructor injection via Options struct.** The `Options` struct (`server/opts.go:397-590`) carries all configuration and injectable dependencies:
- `AccountResolver AccountResolver` (line 519) — can be injected before calling `NewServer`
- `CustomClientAuthentication Authentication` (line 527)
- `CustomRouterAuthentication Authentication` (line 528)
- `TLSConfig *tls.Config` (line 491)

No global state or `init()` functions. All wiring occurs at construction time in `NewServer()` (`server/server.go:695-955`), which receives a fully-populated `Options` instance. The `ConfigureOptions()` function (`server/opts.go:6141-6228`) is the composition entry point that parses flags and config files into an `Options` struct.

### 2. Are interfaces defined by consumers or producers?

**Interfaces are defined by consumers (producer doesn't define them).** For example:
- `Authentication` interface in `server/auth.go:40-43` is defined by the server package to allow custom auth implementations to be injected via `Options.CustomClientAuthentication`
- `ClientAuthentication` interface in `server/auth.go:46-59` is consumed by auth implementations
- `Logger` interface in `server/log.go:27-46` is defined by the server package for pluggable logging
- `AccountResolver` interface in `server/accounts.go:4045-4053` is defined by the server for pluggable account JWT resolution

The `Server` struct does not define interfaces for its subsystems (jetStream, gateway, etc.) — they are concrete struct fields.

### 3. How is startup ordering managed when services depend on each other?

**Explicit procedural ordering in `Start()`** (`server/server.go:2237-2550`). Dependencies are hardcoded as a linear sequence:

1. `s.running.Store(true)` (line 2278)
2. System account setup (lines 2351-2360)
3. `StartMonitoring()` HTTP server (line 2364)
4. Account resolver start (lines 2370-2374)
5. JetStream enablement (lines 2413-2432)
6. Gateway startup (lines 2484-2486)
7. WebSocket startup (lines 2491-2493)
8. LeafNode accept loop (lines 2496-2505)
9. MQTT startup (lines 2521-2523)
10. Routing cluster startup (line 2526-2530)
11. `startupComplete` channel closed (line 2541)
12. `AcceptLoop()` for client connections (line 2545)

There is no declarative dependency declaration (e.g., "start B after A completes"). Ordering is enforced by sequential function calls with no mechanism to verify or enforce correctness.

### 4. What happens during graceful shutdown — is ordering guaranteed?

**Yes, ordering is guaranteed via explicit procedural sequence** in `Shutdown()` (`server/server.go:2558-2727`):

1. `shutdown.CompareAndSwap(false, true)` prevents double shutdown (line 2563)
2. Signal pull consumers (line 2568)
3. Stepdown raft nodes (line 2571)
4. Shutdown eventing first (line 2577) — "to send out any messages for account status"
5. `running.Store(false)` (line 2586)
6. Close account resolver (lines 2592-2594)
7. Shutdown JetStream (line 2597)
8. Shutdown Raft nodes (line 2600)
9. Close all listeners (lines 2634-2682)
10. `close(quitCh)` to wake waiting goroutines (line 2687)
11. Close all client/route/gateway/leaf connections (lines 2690-2693)
12. Wait for accept loops via `doneExpected` counter (lines 2696-2699)
13. `grWG.Wait()` for all goroutines (line 2702)
14. Stop OCSP cache (lines 2711-2713)
15. Close logger (lines 2717-2724)
16. `close(shutdownComplete)` (line 2726)

Ordering is enforced procedurally with explicit comments explaining why certain subsystems shut down first.

### 5. Can individual services be tested without booting the entire system?

**Yes, but with caveats.** The test suite in `server/server_test.go` provides:

- `DefaultOptions()` helper (`server/server_test.go:66-77`) — creates a minimal Options struct
- `RunServer(opts *Options) *Server` (`server/server_test.go:80-100`) — creates and runs a server in a goroutine for testing

Individual subsystems have isolated test coverage (e.g., `memstore_test.go`, `filestore_test.go`, `auth_test.go`). However, the monolithic `Server` struct makes it difficult to test individual subsystems in complete isolation — any test that needs a server must still create the full `Server` instance. The `AccountResolver` interface allows mock resolvers for testing account-related code without a live resolver.

## Architectural Decisions

### Monolithic Composition Root

The `Server` struct is a single massive composition root holding ~400+ fields (`server/server.go:168-385`), including:
- `atomic.Pointer[jetStream]` for JetStream (line 192)
- `*srvGateway` for gateway (line 272)
- `sync.Map` for accounts (line 195)
- `map[uint64]*client` for clients (line 199)
- Multiple listener fields, maps, channels, and atomic values

**Tradeoff**: Simple to understand for small scale, but violates single responsibility. Adding a new subsystem requires modifying the central `Server` struct.

### No DI Container

nats-server has **no DI container** — no Uber fx, no Google wire, no reflection-based autowiring. All wiring is explicit in `NewServer()`. This keeps the code simple and debuggable but requires manual maintenance of initialization order.

### Options Struct as DI Vehicle

The `Options` struct (`server/opts.go:397-590`) serves as the primary DI mechanism, carrying:
- Plain configuration values (ports, timeouts, paths)
- Injectable interfaces (`AccountResolver`, `Authentication`, `Logger`)
- Concrete TLS config

### Interface-Based Extension Points

Three main interfaces enable customization:
- `Authentication` (`server/auth.go:40-43`)
- `Logger` (`server/log.go:27-46`)
- `AccountResolver` (`server/accounts.go:4045-4053`)

## Notable Patterns

### Atomic Lifecycle State

```go
// server/server.go:185-186
running     atomic.Bool
shutdown    atomic.Bool
```

Using `atomic.Bool` for lifecycle state avoids mutex overhead for simple state checks.

### Channels for Lifecycle Signaling

```go
// server/server.go:243-245
quitCh           chan struct{}
startupComplete  chan struct{}
shutdownComplete chan struct{}
```

Three channels coordinate startup completion, shutdown signaling, and shutdown completion.

### WaitGroup for Goroutine Tracking

```go
// server/server.go:251
grWG sync.WaitGroup // to wait on various go routines
```

All spawned goroutines are tracked via `grWG`. Shutdown waits for all via `grWG.Wait()` (`server/server.go:2702`).

### RunServer Test Helper

```go
// server/server_test.go:80-100
func RunServer(opts *Options) *Server {
    s, err := NewServer(opts)
    // ... configure logger
    // Run server in Go routine.
    go s.Start()
    return s
}
```

## Tradeoffs

| Aspect | Tradeoff |
|--------|----------|
| Monolithic Server struct | Simple mental model but violates SRP; adding subsystems modifies central file |
| No DI container | No magic, easy to debug, but manual wiring maintenance grows with codebase |
| Procedural startup ordering | Clear sequence but no compile-time verification of dependency correctness |
| Atomic.Bool for lifecycle | Lightweight but doesn't capture the full state machine |
| Manual channel coordination | Explicit but error-prone if ordering is wrong |

## Failure Modes / Edge Cases

1. **Double Shutdown Protection**: `Shutdown()` uses `CompareAndSwap` on `shutdown` atomic.Bool (`server/server.go:2563`) to prevent double invocation.

2. **Race between Start() and Shutdown()**: Explicitly acknowledged in code — `s.running.Store(true)` is placed after lock release to avoid race (`server/server.go:2277-2278`).

3. **Listener Closure Race**: Shutdown tracks `doneExpected` counter to wait for all accept loops to exit before closing connections (`server/server.go:2630-2699`).

4. **Embedded Server Usage**: When nats-server is embedded, options can be set directly "by hand" (acknowledged in comments at line 722-724), bypassing the normal configuration path.

5. **Startup Failure Recovery**: If `NewServer()` fails, the caller must handle cleanup — no RAII-style resource management.

## Future Considerations

1. **Declarative Dependency Declaration**: Replace procedural startup ordering with a declarative system (similar to `uber/fx` or `google/wire`) to enable compile-time verification of dependency graph correctness.

2. **Subsystem Interface Extraction**: Extract interfaces for major subsystems (jetStream, gateway, routing) to enable true isolated unit testing without a full Server instance.

3. **Graceful Shutdown Timeout**: Currently no timeout on `grWG.Wait()` — a runaway goroutine could block shutdown indefinitely.

## Questions / Gaps

1. **No evidence of DI container exploration**: The codebase does not explore any third-party DI libraries — all wiring is manual. Is this a deliberate choice or legacy?

2. **Interface ownership unclear**: While consumer-defined interfaces exist (Authentication, Logger, AccountResolver), the internal subsystems (jetStream, gateway) have no interfaces — they are directly coupled to `Server`. Was there consideration of interface extraction that was abandoned?

3. **Startup panic recovery**: If `Start()` panics partway through startup, some resources may be partially initialized. Is there recovery logic?

4. **No compile-time injection verification**: Unlike `wire` or `fx`, there's no way to catch missing dependencies at compile time. Runtime `NewServer()` returns errors for some missing dependencies but not all.

---

Generated by `dimensions/02-dependency-injection-composition.md` against `nats-server`.