# Source Analysis: grafana

## Dependency Injection & Composition

### Source Info

| Field | Value |
|-------|-------|
| Name | grafana |
| Path | `sources/grafana` |
| Language / Stack | Go |
| Analyzed | 2026-05-19 |

## Summary

Grafana uses **Google Wire** as its compile-time dependency injection framework, combined with **dskit** for service lifecycle management. Wire generates a `wire_gen.go` file that explicitly constructs the entire dependency graph via constructor injection. Services implementing `BackgroundService` are managed by a `ManagerAdapter` that wraps them with dskit's `BasicService` and uses dskit's module system for coordinated startup and graceful shutdown with ordering guarantees. Interfaces are defined by producers (each package defines its own interface), and consumers bind to concrete implementations via `wire.Bind`.

## Rating

**8/10** — Excellent implementation with minor issues. Wire provides compile-time safety, explicit wiring, and excellent testability. The primary gaps are: no init() hell (by design), but the sheer size of `wire.go` (490+ providers) creates high coupling; startup ordering relies on convention rather than declared constraints; and shutdown is coordinated but not strictly ordered beyond a 5-second timeout.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| DI Container | `wire.NewSet(...)` with 490+ providers, wire.Bind calls, and `Initialize()` injector functions | `pkg/server/wire.go:223-507` |
| Constructor Injection | `ProvideService(ctx context.Context, cfg *setting.Cfg, ...) (*Service, error)` pattern | `pkg/services/folder/folderimpl/folder.go:56-68` |
| Wire Gen | Generated `wire_gen.go` (1800+ lines) showing explicit constructor call ordering | `pkg/server/wire_gen.go:309-821` |
| Service Lifecycle | `BackgroundService` interface with `Run(ctx context.Context) error` | `pkg/registry/registry.go:25-29` |
| Background Services Registry | `BackgroundServiceRegistry` collecting all long-running services | `pkg/registry/backgroundsvcs/background_services.go:134-143` |
| Manager Adapter | Wraps background services with dskit `BasicService`, manages startup/shutdown | `pkg/registry/backgroundsvcs/adapter/manager.go:36-43` |
| Service Adapter | Adapts `registry.BackgroundService` to `dskit.NamedService` | `pkg/registry/backgroundsvcs/adapter/service.go:35-44` |
| Module Dependencies | `dependencyMap` defines module startup ordering | `pkg/modules/dependencies.go:24-40` |
| Graceful Shutdown | 5-second timeout, dskit `Shutdown()` coordinated via `managerAdapter` | `pkg/registry/backgroundsvcs/adapter/manager.go:99-109` |
| Testing Seam | `ProvideTestEnv()` with `notifications.NotificationServiceMock`, fake services | `pkg/server/test_env.go:23-62` |
| Fake Service | `FakeService` implementing `folder.Service` for unit tests | `pkg/services/folder/foldertest/foldertest.go:42` |
| Interface Binding | `wire.Bind(new(folder.Service), new(*folderimpl.Service))` | `pkg/server/wire.go:363` |
| Wire Build Tags | `//go:build wireinject && oss` separating OSS/Enterprise sets | `pkg/server/wireexts_oss.go:1-2` |

## Answers to Dimension Questions

### 1. How does the project wire its dependency graph without global state or init() hell?

Wire is used as a **compile-time DI container**. The wiring is defined declaratively in `wire.go` using `wire.NewSet()` with provider functions. Wire then generates `wire_gen.go` which explicitly constructs every service in the correct order. There is no global singleton registry or `init()` function. Each `Initialize*` function in `wire.go:540-577` acts as a composition root.

**Evidence**: `pkg/server/wire.go:540-543` — `Initialize()` uses `wire.Build(wireExtsSet)` which Wire replaces with explicit constructor chains in `wire_gen.go:309-821`.

### 2. Are interfaces defined by consumers or producers?

**Producers define interfaces**. Each domain package (e.g., `pkg/services/folder/`) defines its own `Service` interface. The wire binding connects the interface to a concrete implementation. For example:

- `pkg/services/folder/service.go:10` defines `type Service interface`
- `pkg/server/wire.go:363` binds `new(folder.Service)` to `new(*folderimpl.Service)`

This means interfaces follow the producer-owned pattern, not consumer-owned.

### 3. How is startup ordering managed when services depend on each other?

**Three mechanisms**:

1. **Wire dependency ordering**: Wire topologically sorts providers based on their input parameters. The generated `wire_gen.go:309-821` shows services constructed in dependency order (e.g., `sqlstore.ProvideService` before `kvstore.ProvideService(sqlStore)`).

2. **dskit module dependencies**: `pkg/modules/dependencies.go:24-40` defines a `dependencyMap` that Wire's `ManagerAdapter` uses to order module startup.

3. **BackgroundServices module**: All `BackgroundService` instances are registered to the `BackgroundServices` module which depends on `Core` (`pkg/registry/backgroundsvcs/adapter/dependencies.go:64`). Within `BackgroundServices`, services start concurrently but are not strictly ordered.

**Evidence**: `pkg/server/wire_gen.go:330` — `sqlStore` is constructed before `kvStore := kvstore.ProvideService(sqlStore)` at line 334.

### 4. What happens during graceful shutdown — is ordering guaranteed?

**Yes, but with a timeout**. The `ManagerAdapter.stopping()` (`pkg/registry/backgroundsvcs/adapter/manager.go:99-109`) calls dskit's `manager.Shutdown(ctx, reason)` which:
1. Calls `StopAsync()` on all services
2. Waits for services to stop (with 5-second timeout via `stopTimeout` at line 17)
3. Logs failures but continues shutdown of other services

Services that implement `CanBeDisabled` (`pkg/registry/registry.go:18-21`) can opt out of startup via `IsDisabled()`.

**Evidence**: `pkg/server/server.go:155-172` — `Shutdown()` delegates to `managerAdapter.Shutdown()`.

### 5. Can individual services be tested without booting the entire system?

**Yes, excellent testability**. Grafana provides:
- **Fake services** (e.g., `foldertest.FakeService` at `pkg/services/folder/foldertest/foldertest.go:10-157`) implementing interfaces
- **Mock notification service** (`notifications.NotificationServiceMock`)
- **Test environment** via `ProvideTestEnv()` at `pkg/server/test_env.go:23-62`
- **Separate `wireTestSet`** at `pkg/server/wire.go:522-538` using `sqlstore.ProvideServiceForTests` and `MockNotificationService`

Services can be instantiated directly with constructor parameters or fakes, without booting the full server.

## Architectural Decisions

### Wire as Compile-Time DI
Wire was chosen over runtime containers (like dig or fx) for:
- **Compile-time cycle detection**: Circular dependencies fail at code generation, not runtime
- **Explicit graph**: The `wire_gen.go` is auditable — every dependency is visible
- **No reflection**: Wire operates at generation time, not runtime
- **Performance**: No runtime DI overhead

### dskit Service Integration
Background services are wrapped with dskit's `BasicService` to gain:
- Standard service state machine (New → Starting → Running → Stopping → Terminated)
- Coordinated startup via `AwaitHealthy()`
- Observable service states and failure propagation

### Separated Wire Sets for Build Targets
The `wireexts_oss.go`, `wireexts_enterprise.go` pattern allows OSS-specific bindings without affecting Enterprise builds.

## Notable Patterns

| Pattern | Description | Evidence |
|---------|-------------|----------|
| Provider Functions | `func ProvideXxx(...) (*Xxx, error)` style constructors | `pkg/services/folder/folderimpl/folder.go:56` |
| Interface Binding | `wire.Bind(new(Interface), new(*ConcreteImpl))` | `pkg/server/wire.go:363` |
| Wire Sets Composition | `wire.NewSet(set1, set2, ...)` for modular wiring | `pkg/server/wire.go:492-505` |
| Service Adapter | Wraps Grafana services with dskit `NamedService` | `pkg/registry/backgroundsvcs/adapter/service.go:35` |
| Background Services Registry | Collects all long-running services in one struct | `pkg/registry/backgroundsvcs/background_services.go:134` |
| Fake/Mock Services | Concrete fakes implementing interfaces for testing | `pkg/services/folder/foldertest/foldertest.go:10` |
| Feature Toggles | `featuremgmt.FeatureToggles` passed through constructors for conditional behavior | `pkg/services/folder/folderimpl/folder.go:59` |

## Tradeoffs

| Tradeoff | Impact |
|----------|--------|
| **Massive `wire.go`** (490+ providers) | Single point of coordination becomes a high-coupling risk. Changes affect many services. |
| **Wire generation required** | `make gen-go` must be run after wiring changes; regeneration is not automatic |
| **Limited startup ordering within BackgroundServices** | Services start concurrently once `BackgroundServices` module starts; no fine-grained ordering |
| **5-second shutdown timeout** | Long-running services may be force-killed if they don't stop quickly |
| **No conditional wire bindings** | Wire is compile-time only; feature-flagged services must use runtime checks (e.g., `CanBeDisabled`) |
| **OSS/Enterprise split complexity** | `wireexts_oss.go` and `wireexts_enterprise.go` require careful synchronization of bindings |

## Failure Modes / Edge Cases

| Failure Mode | Mitigation |
|-------------|------------|
| **Circular dependency** | Caught at wire generation time (compile-time) |
| **Service fails to start** | dskit `AwaitHealthy()` fails, server exits with error |
| **Service blocks in `Run()`** | Context cancellation triggers shutdown; 5-second timeout may kill the service |
| **Shutdown timeout** | `stopTimeout = 5 * time.Second` at `pkg/registry/backgroundsvcs/adapter/manager.go:17` — service may be force-killed |
| **Disabled service still in dependency map** | `CanBeDisabled.IsDisabled()` checked before registration; service registered as invisible module to avoid broken dependencies (`pkg/registry/backgroundsvcs/adapter/manager.go:64-67`) |
| **Wire merge conflicts** | OSS/Enterprise bindings must not conflict; build tags help isolate but don't prevent logic drift |

## Future Considerations

1. **Module-level startup ordering**: Consider declaring explicit ordering constraints for background services that have startup dependencies (e.g., alerting must start after the database).

2. **Graceful shutdown timeout per service**: The fixed 5-second timeout may be insufficient for services with large cleanup tasks. A configurable or per-service timeout could prevent force-killing.

3. **Wire IDE support**: With 490+ providers, tooling for navigation and impact analysis would help developers understand the dependency graph.

4. **Dynamic feature loading**: Current approach uses `CanBeDisabled` at runtime. A future Wire with conditional bindings could enable compile-time exclusion of disabled features.

## Questions / Gaps

| Question | Status |
|----------|--------|
| Is there a mechanism for lazy service initialization (lazy singletons)? | **No clear evidence found** — Wire constructs all services eagerly at startup. |
| How are circular dependencies handled if detected? | **Caught at compile time** by Wire, but no special handling pattern observed. |
| Is there a service that restarts on failure? | **No evidence found** — dskit's `BasicService` does not auto-restart; services that fail transition to Failed state and stay there. |
| How are optional dependencies declared? | **No explicit pattern found** — Services that need optional dependencies typically accept them as pointers (nil check at runtime) or use `CanBeDisabled` pattern. |

---

Generated by `dimensions/02-dependency-injection-composition.md` against `grafana`.