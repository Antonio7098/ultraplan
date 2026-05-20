# Dependency Injection & Composition - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Dimension | `02-dependency-injection-composition.md` |
| Sources | cli, grafana, kubernetes, milvus, nats-server (report missing), openfga, pocketbase, temporal, victoriametrics |
| Date | 2026-05-20 |

## Sources Studied

| # | Source | Path |
|---|--------|------|
| 1 | cli | `sources/cli` |
| 2 | grafana | `sources/grafana` |
| 3 | kubernetes | `sources/kubernetes` |
| 4 | milvus | `sources/milvus` |
| 5 | nats-server | *(report not available)* |
| 6 | openfga | `sources/openfga` |
| 7 | pocketbase | `sources/pocketbase` |
| 8 | temporal | `sources/temporal` |
| 9 | victoriametrics | `sources/victoriametrics` |

## Executive Summary

Dependency injection across these eight Go projects falls into three distinct models: **compile-time DI** (Grafana with Google Wire), **runtime DI container** (Temporal with Uber fx), and **manual composition** (cli, kubernetes, milvus, openfga, pocketbase, victoriametrics). No project uses `init()` for service wiring — all use explicit composition roots. Constructor injection is universal; the divergence is whether wiring is automated (via container) or explicit (via hand-written factory/options). Lifecycle management ranges from non-existent (cli) to formally coordinated (fx lifecycle hooks, Wire+dskit). The highest-scoring projects (Grafana 8, kubernetes 8, temporal 8, openfga 8) share one property: they encode lifecycle contracts as interfaces or conventions that are mechanically enforceable, not just documented.

## Core Thesis

The central question for DI design is not "container vs. manual" but "who owns the wiring complexity and how is lifecycle ordered?". Projects that centralize wiring in a single composition root (openfga `run()`, kubernetes `app/` packages, victoriametrics `main()`) score higher than those that distribute it. Projects that formalize lifecycle as an interface (`BackgroundService`, `Component`, `BackgroundService`) enable coordinated startup/shutdown; those that rely on ad-hoc `defer` or convention score lower. For HelloSales, the evidence suggests: invest in a formal composition root, define a lifecycle interface for long-running services, and choose wiring complexity placement deliberately rather than letting it emerge organically.

## Rating Summary

| Source | Score | Approach | Main Strength | Main Concern |
|--------|-------|----------|---------------|--------------|
| cli | 6/10 | Manual Factory with lazy functions | Explicit wiring, no external dependency | No lifecycle interface, no shutdown ordering, Factory growth risk |
| grafana | 8/10 | Google Wire (compile-time DI) + dskit | Compile-time cycle detection, coordinated lifecycle, excellent testability | Massive `wire.go` (490+ providers), wire generation required |
| kubernetes | 8/10 | Manual constructor injection via Config structs | Explicit two-phase config, descriptor-based controller registration | Global feature gates create implicit coupling, limited shutdown ordering |
| milvus | 7/10 | Manual constructor injection with roles orchestrator | Clear coordinator/node split, parallel init via errgroup, explicit shutdown ordering | `paramtable.Get()` global undermines DI, wiring complexity in `roles.go` |
| openfga | 8/10 | Functional options pattern | Excellent testability, LIFO cleanup ordering, explicit wiring | No DI container, `run()` grows with 50+ options |
| pocketbase | 7/10 | Manual composition with hook-based lifecycle | Lazy `Bootstrap()`, priority-ordered hooks, event chain with `Next()` | Monolithic `core.App` (60+ methods), no explicit shutdown ordering guarantee |
| temporal | 8/10 | Uber fx (runtime DI container) | Formal lifecycle hooks, reverse-dependency shutdown, optional"true" for testing | Multi-graph architecture complexity, `ServiceProviderParamsCommon` workaround |
| victoriametrics | 7/10 | Manual Init/Stop pattern | Explicit sequential init, `WG.Add/Done` shutdown tracking | Package-level global state, convention-based lifecycle, no interface segregation |

## Approach Models

### Model 1: Compile-Time DI Container
**Represented by: Grafana (Google Wire)**

Wire generates `wire_gen.go` from declarative `wire.NewSet()` declarations. Providers are constructor functions (`func ProvideXxx(...) (*Xxx, error)`) that Wire topologically sorts. The generated code is auditable and caught cycles at compile time. dskit wraps services with `BasicService` for coordinated lifecycle.

**What converges**: Compile-time safety (no runtime reflection, cycles caught at generation), explicit generated graph, no runtime DI overhead.

**Why they diverge from runtime DI**: Wire requires a code generation step (`make gen-go`) after wiring changes. Feature-flagged services must use `CanBeDisabled` at runtime rather than conditional wire bindings. The 490+ providers in a single `wire.go` creates a high-coupling single file.

### Model 2: Runtime DI Container
**Represented by: Temporal (Uber fx)**

fx provides lifecycle management (`fx.StartStopHook`), dependency resolution, and module composition. The multi-graph architecture spawns separate `fx.App` instances per service (history, matching, frontend, worker). Cross-graph dependency propagation uses `ServiceProviderParamsCommon` as a workaround.

**What converges**: Lifecycle hooks on `fx.Lifecycle` execute in reverse dependency order on shutdown. Optional dependencies via `optional:"true"` struct tags enable isolated testing.

**Why they diverge**: fx allows runtime configuration and conditional instantiation (service providers check `ServiceNames` map). The implicit dependency resolution can make debugging startup issues difficult. The multi-graph architecture is acknowledged as non-ideal for cross-service dependencies.

### Model 3: Manual Factory Pattern
**Represented by: cli**

A `*cmdutil.Factory` struct holds interface fields and lazy function references. `New()` in `default.go` wires dependencies. Commands receive the factory and extract what they need. No external dependency.

**What converges**: Explicit, no code generation, no reflection, readable by new contributors.

**Why they diverge from container approaches**: No cycle detection beyond what Go's type system provides. Adding a dependency requires changing the `Factory` struct and its wiring. No lifecycle interface means services manage their own cleanup independently.

### Model 4: Manual Constructor with Options Struct
**Represented by: kubernetes, milvus, victoriametrics**

Each binary or major component has a dedicated `app/` or `cmd/` package with structured Config objects. Two-phase pattern: raw `Config` → `CompletedConfig` → `Server`. Constructors receive dependencies as parameters.

**What converges**: Explicit initialization order enforced by call sequence. No external DI framework dependency. Testing via manually constructed configs with test helpers.

**Why they diverge**: kubernetes uses descriptor-based registration for controllers; milvus uses an orchestrator (`roles.go`) for component composition; victoriametrics uses package-level `Init/Stop` functions. All three avoid global mutable state but approach lifecycle differently.

### Model 5: Functional Options Pattern
**Represented by: OpenFGA**

`With*` option functions mutate a `Server` struct. `MustNewServerWithOpts()` takes variadic `OpenFGAServiceV1Option` arguments. A `container/list.List` cleanup chain with `PushFront` provides LIFO shutdown ordering.

**What converges**: Excellent testability — any combination of options can be provided. No reflection. Options are explicit in call sites.

**Why they diverge**: The 50+ options make the `run()` function lengthy (~90 lines of `With*` calls). No compile-time enforcement that all required services register cleanups. Functional options are immutable after construction.

### Model 6: Hook-Based Lifecycle
**Represented by: PocketBase**

`core.App` is a monolithic 60+ method interface. Lifecycle is managed through `OnBootstrap`, `OnServe`, `OnTerminate` hooks with priority-based ordering. `Bootstrap()` is lazy — called explicitly or via `Execute()`.

**What converges**: Users can extend behavior via hooks without subclassing. Priority ordering allows graceful shutdown sequencing.

**Why they diverge**: The `core.App` god interface creates implicit coupling — any service with access to the App has access to everything. No formal lifecycle interface that components implement; instead, hooks are registered separately from component definition.

## Pattern Catalog

### Pattern 1: Composition Root Pattern
**Problem solved**: Where does wiring complexity live?
**Sources**: openfga (`cmd/run/run.go:405`), kubernetes (`cmd/<binary>/app/`), milvus (`cmd/roles/roles.go:369`), victoriametrics (`app/victoria-metrics/main.go:50`)
**Why it works**: Single location for all dependency wiring makes the startup sequence debuggable and auditable. New contributors can find where everything is created.
**When to copy**: Always — even a simple `main()` that calls a single `NewApp()` function is better than distributed wiring.
**When overkill**: For trivially small services where all dependencies are created in one function.
**Evidence**: `cmd/run/run.go:405-1205` (openfga), `cmd/roles/roles.go:369-632` (milvus)

### Pattern 2: Lifecycle Interface
**Problem solved**: How are long-running services started and stopped in coordinated order?
**Sources**: grafana (`BackgroundService` at `pkg/registry/registry.go:25`), milvus (`Component` at `internal/types/types.go:54`), temporal (`fx.StartStopHook`), kubernetes (PostStartHook/PreShutdownHook)
**Why it works**: A common interface enables the composition root to manage all services uniformly without knowing their concrete types.
**When to copy**: When you have background services, goroutines, or resources that outlive a single request.
**When overkill**: For pure request-response services with no background work.
**Evidence**: `pkg/registry/registry.go:25-29` (grafana BackgroundService), `internal/types/types.go:54-59` (milvus Component with Init/Start/Stop/Register)

### Pattern 3: Constructor Injection
**Problem solved**: How do dependencies flow into services?
**Sources**: All eight sources use constructor injection — dependencies are passed as parameters to constructor functions.
**Why it works**: Dependencies are explicit in function signatures. Testing substitutes mock implementations by passing them to constructors.
**When to copy**: Always — avoid setter injection or field mutation after construction unless necessary (milvus uses setter injection for externally-created clients).
**When overkill**: For value objects that are created once and never depend on other services.
**Evidence**: `pkg/services/folder/folderimpl/folder.go:56-68` (grafana ProvideService), `cmd/components/mix_coord.go:41-50` (milvus NewMixCoord)

### Pattern 4: Functional Options for Optional Dependencies
**Problem solved**: How to wire optional or conditional dependencies without complicating core constructors?
**Sources**: openfga (`WithDatastore`, `WithLogger`, etc. at `pkg/server/server.go:261-864`), temporal (fx options via `fx.Provide`)
**Why it works**: Core struct has only required dependencies; optional ones are applied via `With*` closures. This keeps constructors simple while supporting variation.
**When to copy**: When services have multiple optional features (observability, auth backends, storage engines).
**When overkill**: When all dependencies are required — options add indirection without benefit.
**Evidence**: `pkg/server/server.go:261-864` (openfga 50+ option functions)

### Pattern 5: Lazy Initialization via Function Types
**Problem solved**: How to avoid startup cost for expensive resources that may not be used?
**Sources**: cli (`HttpClient func() (*http.Client, error)` at `pkg/cmdutil/factory.go:20-26`)
**Why it works**: Instead of `*http.Client` field, use `func() (*http.Client, error)`. Initialization is deferred to first call.
**When to copy**: For CLI tools where not all subcommands use all resources (e.g., Git remote for issue list).
**When overkill**: For services where all resources are needed at startup anyway — lazy init just shifts cost to mid-execution.
**Risk**: Failures occur mid-command rather than at startup, making errors less predictable.
**Evidence**: `pkg/cmdutil/factory.go:20-26`

### Pattern 6: Cleanup List with LIFO Ordering
**Problem solved**: How to guarantee shutdown ordering when services are started sequentially but must be stopped in reverse?
**Sources**: openfga (`cleanups list.List` with `PushFront` at `cmd/run/run.go:943-963`), victoriametrics (explicit reverse call order in `main()`)
**Why it works**: `PushFront` on a linked list means later-started services are at the front and run first during cleanup. The pattern is lightweight and requires no framework.
**When to copy**: When you have multiple independent services to stop and no formal lifecycle manager.
**When overkill**: When using a DI container with built-in lifecycle management (fx, Wire+dskit).
**Evidence**: `cmd/run/run.go:943-963` (openfga cleanup list), `app/victoria-metrics/main.go:109-127` (victoriametrics explicit reverse order)

### Pattern 7: Init/Stop Pair per Package
**Problem solved**: How to give each package a consistent lifecycle contract?
**Sources**: victoriametrics (`vmstorage.Init()`, `vmstorage.Stop()`), pocketbase (`Bootstrap()`, `OnTerminate` hooks)
**Why it works**: Each package exposes `Init` and `Stop` (or equivalent) functions. The composition root calls them in the correct order. Simple convention that is easy to understand.
**When to copy**: For multi-service products where each service is in a separate package.
**When overkill**: For single-package projects or when a formal lifecycle interface is used instead.
**Evidence**: `app/victoria-metrics/main.go:96-99` (sequential Init calls), `app/victoria-metrics/main.go:113-125` (reverse order Stop calls)

### Pattern 8: Future-Based Concurrent Startup
**Problem solved**: How to start independent services in parallel while maintaining a barrier before declaring the system ready?
**Sources**: milvus (`conc.Go()` futures in `cmd/roles/roles.go:145`, `waitForAllComponentsReady` via `reflect.Select`)
**Why it works**: Independent components start concurrently via goroutines, each producing a future. A barrier waits for all futures before proceeding. Both concurrency and correctness are achieved.
**When to copy**: When you have independent services that are slow to initialize (e.g., database connections, cache warming).
**When overkill**: When startup ordering is strictly required or when initialization is fast.
**Evidence**: `cmd/roles/roles.go:145` (signaling), `cmd/roles/roles.go:217-268` (waitForAllComponentsReady)

## Key Differences

### Container vs. Manual Wiring

Seven of eight sources use manual wiring; only Temporal uses a formal DI container (fx), and Grafana uses Wire (compile-time, not a runtime container). The manual-wiring projects all score 6-8, showing that the absence of a container is not a quality gap — it is a valid design choice for simpler products.

The key difference is where wiring complexity lives: in a single `run()` or `main()` function (openfga, victoriametrics), in structured `app/` packages (kubernetes), in an orchestrator (milvus `roles.go`), or distributed via a Factory struct (cli). Projects with centralized wiring score higher because the initialization sequence is auditable.

### Lifecycle Formalization

Grafana (8), temporal (8), and kubernetes (8) score highest on lifecycle management. They have formal interfaces (`BackgroundService`, `fx.Lifecycle` hooks, PostStartHook/PreShutdownHook) that allow a coordinator to manage startup and shutdown uniformly. cli (6) and pocketbase (7) score lower because lifecycle is implicit or ad-hoc.

The highest-scoring projects treat lifecycle as a first-class concern encoded in an interface. Lower-scoring projects treat it as a consequence of `defer` statements or hook registrations that are not validated by the type system.

### Interface Ownership

Most sources define interfaces in producer packages (e.g., `pkg/services/folder/service.go:10` in grafana, `pkg/storage/storage.go:409` in openfga). cli is an exception — interfaces are consumer-defined in `pkg/cmdutil/factory.go`. PocketBase defines the `core.App` interface centrally in the framework.

The divergence matters for testing: producer-defined interfaces enable swapping implementations (storage engine, auth method); consumer-defined interfaces enable mocking without implementation inheritance.

### Global State

milvus (`paramtable.Get()`) and victoriametrics (`vmstorage.Storage` package-level var) use global mutable state that bypasses the DI model. This is a recurring failure mode — the global singleton undermines testability and makes dependency graphs implicit. Kubernetes has a similar issue with `utilfeature.DefaultMutableFeatureGate`. These projects score well despite this because their other DI practices are sound.

## Tradeoffs

| Tradeoff | Benefit | Cost | Best-Fit Context | Failure Mode |
|----------|---------|------|------------------|--------------|
| DI container (fx, Wire) | Lifecycle coordination, cycle detection, testability | Framework dependency, code generation step, learning curve | Large multi-service products with complex dependency graphs | Multi-graph propagation workaround (temporal); massive wire.go (grafana) |
| Manual Factory | Simple mental model, no external dependency | Boilerplate in Factory struct and wiring function | Small-to-medium CLIs or single-service backends | Factory growth, circular dependency risk |
| Functional options | Excellent testability, explicit call sites | Verbose construction code, no compile-time completeness check | Services with many optional features or configuration variants | Option count growth, verbose construction |
| Hook-based lifecycle | User extensibility without subclassing | Implicit ordering via priority numbers, no type-level guarantee | Plugin architectures, user-customizable applications | Missing `e.Next()` breaks chain, priority collisions |
| Global config singleton | Convenient access without passing config everywhere | Hidden dependencies, testability cost | Early-stage projects with simple config | Undermines DI model (milvus `paramtable.Get()`) |
| Package-level global state | Simple access from package-internal functions | Implicit coupling, cannot substitute implementations | Single-process deployments with shared resources | Hard to test in isolation (victoriametrics `vmstorage.Storage`) |
| Lazy init via func types | Avoids startup cost for unused features | Failures occur mid-execution, harder to test | CLI tools where not all subcommands need all resources | Mid-command failure surfaces as runtime error |
| Init/Stop per package | Simple convention, clear responsibility | Convention not enforced by type system | Multi-package products with independent services | New methods may not follow pattern, no compile-time check |

## Decision Guide

**Do you have multiple long-running services with interdependencies?**
Yes → Use a lifecycle interface (`BackgroundService`, `Component`) and a formal coordinator. Avoid relying on `defer` for cleanup. Grafana's dskit integration or Temporal's fx lifecycle hooks are worth studying.

**Do you need optional dependencies for testing?**
Yes → Functional options (openfga) or fx's `optional:"true"` (temporal) allow partial construction without requiring all dependencies. Constructor injection is the prerequisite.

**Is your product a CLI tool with independent subcommands?**
Yes → cli's Factory pattern with lazy function references is the right model. Lifecycle is per-command, not per-system. No DI container needed.

**Do you have a public SDK alongside internal implementation?**
Yes → Define producer-owned interfaces in the public layer (`pkg/`) and use constructor injection to allow internal implementations to be swapped. openfga's `OpenFGADatastore` at `pkg/storage/storage.go:409` is a reference pattern.

**Are you building a framework that users extend?**
Yes → PocketBase's hook-based lifecycle (`OnBootstrap`, `OnTerminate`) enables user extensibility without subclassing.代价 is priority-based ordering is implicit and can collide.

**Is startup time critical and many services are optional?**
Yes → Temporal's conditional service instantiation (providers check `ServiceNames` map before creating fx.App) or cli-style lazy function references avoid paying startup cost for unused features.

## Practical Tips

1. **Define a lifecycle interface early** — even a simple `Start() error` / `Stop() error` interface enables a coordinator to manage all services uniformly. grafana's `BackgroundService` (`pkg/registry/registry.go:25`) and milvus's `Component` (`internal/types/types.go:54`) are reference implementations.

2. **Use constructor injection as the default** — pass dependencies as parameters to constructor functions. Avoid setter injection (milvus exception for externally-created clients is valid) and field mutation after construction.

3. **Centralize wiring in a composition root** — whether it's `main()`, a `run()` function, or an `app/` package, all service creation should be traceable to a single location. This makes the initialization sequence debuggable.

4. **Prefer interfaces over concrete types for cross-package dependencies** — producer-defined interfaces (grafana `folder.Service`, openfga `OpenFGADatastore`) enable testing and swapping implementations. Concrete types couple at the struct level.

5. **Use a cleanup list or explicit reverse call order for shutdown** — openfga's `PushFront` cleanup list (`cmd/run/run.go:943`) is a lightweight pattern that guarantees LIFO ordering. For more formal needs, use fx lifecycle hooks which handle this automatically.

6. **Avoid global config singletons** — `paramtable.Get()` in milvus and `utilfeature.DefaultMutableFeatureGate` in kubernetes are cited as failure modes. Pass config through constructors instead.

7. **Use sync.Once for init/start guards** — both milvus and victoriametrics use `sync.Once` to prevent double-init/double-start. This is simpler than a state machine for services that must only initialize once.

8. **Functional options scale better than constructors with many args** — if a service has 10+ configuration parameters, use an `OpenOptions` struct (victoriametrics at `lib/storage/storage.go:178`) or functional options (openfga) rather than a constructor with 10 parameters.

## Anti-Patterns / Caution Signs

1. **Global mutable state** — `paramtable.Get()` (milvus), `utilfeature.DefaultMutableFeatureGate` (kubernetes), `vmstorage.Storage` package-level var (victoriametrics). Any global mutable state undermines the DI model and makes testing require the real system.

2. **God interface (>50 methods)** — PocketBase's `core.App` at `core/app.go:28-714` is 60+ methods. Every new feature must update this interface. This is a bottleneck that couples the entire codebase.

3. **No lifecycle coordination** — cli relies on three independent `defer` statements with no coordination. If services have interdependencies during shutdown, ordering is not guaranteed.

4. **Convention-based lifecycle without type enforcement** — The `WG.Add/Done` pattern in victoriametrics is a convention, not an interface. New methods on `storage.Storage` may not follow it, causing shutdown leaks.

5. **Massive single-file wiring** — Grafana's `wire.go` with 490+ providers is a high-coupling artifact. Any change to wiring requires regenerating `wire_gen.go`. Consider splitting by module if approaching this scale.

6. **Factory growth** — cli `Factory` struct at `pkg/cmdutil/factory.go:16-43` grows with each new shared dependency. Every test that manually constructs a Factory must be updated. A DI container or interface-based approach would auto-inject mocks.

7. **Missing shutdown timeout per service** — Grafana's fixed 5-second `stopTimeout` (`pkg/registry/backgroundsvcs/adapter/manager.go:17`) may be insufficient for services with large cleanup tasks. PocketBase's 1-second HTTP shutdown timeout (`apis/serve.go:176`) is almost certainly too short.

8. **Panic on startup failure** — victoriametrics `MustOpenStorage` panics on failure (`lib/storage/storage.go:181`). milvus factory `mustSelectMQType` panics on invalid config (`internal/util/dependency/factory.go:139`). Startup failures should return errors, not panic.

## Notable Absences

1. **No runtime DI container in most projects** — Only Temporal (fx) uses a formal runtime DI container. Grafana uses Wire (compile-time). kubernetes, milvus, openfga, pocketbase, victoriametrics, and cli all use manual wiring. This suggests that for Go projects, manual wiring is the norm even at scale.

2. **No evidence of lazy loading beyond conditional instantiation** — Temporal can conditionally create services based on config, and cli uses lazy function references, but no project uses a true lazy-loading DI container pattern (where dependencies are loaded on first use). This may be because Go's explicit construction model makes lazy loading unnecessary.

3. **No evidence of dependency ownership policies** — No project has an explicit policy stating "interfaces must be defined by [consumer/producer]". Interface ownership is implicit and varies even within projects (grafana uses producer-owned; cli uses consumer-owned in Factory).

4. **No evidence of shutdown timeout per service** — Only Grafana has a shutdown timeout mechanism, and it is global (5 seconds), not per-service. Most projects either have no timeout or use a single process-level timeout.

5. **No evidence of compile-time DI in new projects** — Wire (grafana) is an established tool but no source uses a modern alternative (e.g., `wire` v2, `fancy`, or `inject`). The ecosystem for compile-time DI in Go appears stagnant.

## Per-Source Notes

**cli (6/10)** — The Factory pattern with lazy function references is elegant for CLI tools. Main gaps are no lifecycle interface and no shutdown ordering. The pattern of passing `*cmdutil.Factory` to every command constructor is worth studying for any command-pattern application.

**grafana (8/10)** — Wire + dskit is the most formal DI system studied. The `BackgroundService` interface and coordinated shutdown via `ManagerAdapter` should be the reference implementation for any project that needs lifecycle management at scale. The `wire.go` scale is a concern.

**kubernetes (8/10)** — The two-phase config completion (`Config` → `CompletedConfig` → `Server`) and descriptor-based controller registration are the strongest patterns. Global feature gates are the main weakness. The `PostStartHook`/`PreShutdownHook` system is underused — only bootstrap and a few controllers use it.

**milvus (7/10)** — The coordinator/node architecture is sound and the explicit shutdown ordering (coordinators → nodes → proxy) is the clearest in the study. However, `paramtable.Get()` undermines the otherwise clean DI model. The `dependency.Factory` interface for MQ/storage abstraction is excellent.

**openfga (8/10)** — The functional options pattern combined with a cleanup list for LIFO ordering is the most testable approach studied. The `MustNewServerWithOpts` / `NewServerWithOpts` split (panic vs. error return) is a good pattern for production/test divergence. Main concern is `run()` growth.

**pocketbase (7/10)** — The hook-based lifecycle is innovative and user-friendly. The lazy `Bootstrap()` allows flag parsing before DB initialization. The `core.App` monolithic interface is the main structural concern — it would benefit from segregation into focused interfaces (DatabaseProvider, MailerProvider, etc.).

**temporal (8/10)** — fx provides the most mature lifecycle management with explicit `OnStart`/`OnStop` hooks in dependency order. The multi-graph architecture is acknowledged as a workaround. The `optional:"true"` pattern for test dependencies is worth copying. Main concern is fx learning curve.

**victoriametrics (7/10)** — The `lib/`/`app/` split and sequential `Init/Stop` are the clearest patterns for a single-process multi-service product. The `WG.Add/Done` convention for graceful shutdown is simple and effective. Main concerns are package-level globals and lack of interface segregation for `storage.Storage`.

## Open Questions

1. **When does manual wiring become untenable?** The evidence suggests: somewhere between 50+ dependencies (openfga `run()` is lengthy) and 100+ (grafana `wire.go` is high-coupling). A formal DI container becomes worthwhile when wiring code exceeds ~5% of application logic.

2. **Should interfaces be consumer-owned or producer-owned?** The study found both patterns across high-scoring sources with no clear winner. Consumer-owned (cli Factory) enables easy mocking; producer-owned (grafana, openfga) enables clean abstraction layers. The answer may depend on whether the project is a library or an application.

3. **Is the lifecycle interface worth the indirection?** For pure request-response services, a lifecycle interface adds indirection without benefit. For long-running services with background work (query engines, coordinators, workers), it is essential. The decision should be based on whether services outlive individual requests.

4. **How should optional dependencies be declared in Go?** fx's `optional:"true"` struct tags are the most expressive approach found. Functional options handle them at construction time. Neither approach is clearly superior — fx tags are more declarative but functional options are more explicit in call sites.

5. **What replaces a DI container for cross-graph dependencies?** Temporal's `ServiceProviderParamsCommon` workaround shows thatfx's multi-graph architecture doesn't elegantly handle shared dependencies across service graphs. Is a unified graph, a shared resource module, or a separate entrypoint the right solution?

## Evidence Index

Every evidence reference in this report follows the format `source:path/to/file:line`.

| Source | Area | Evidence | Reference |
|--------|------|----------|-----------|
| cli | Factory struct | `*cmdutil.Factory` with lazy func fields | `pkg/cmdutil/factory.go:16-43` |
| cli | Lazy init fields | `HttpClient func() (*http.Client, error)` | `pkg/cmdutil/factory.go:20-26` |
| cli | Composition root | `Main()` wires cfg, factory, telemetry | `internal/ghcmd/cmd.go:52-175` |
| cli | Pager lifecycle | `StartPager()` / `StopPager()` | `pkg/iostreams/iostreams.go:205,252` |
| cli | Telemetry flush | `defer telemetryService.Flush()` | `internal/ghcmd/cmd.go:130` |
| grafana | Wire DI | 490+ providers in `wire.NewSet()` | `pkg/server/wire.go:223-507` |
| grafana | BackgroundService | `Run(ctx context.Context) error` interface | `pkg/registry/registry.go:25-29` |
| grafana | Wire gen | Generated `wire_gen.go` 1800+ lines | `pkg/server/wire_gen.go:309-821` |
| grafana | Graceful shutdown | 5-second timeout via `stopTimeout` | `pkg/registry/backgroundsvcs/adapter/manager.go:17,99-109` |
| grafana | Test seam | `ProvideTestEnv()` with mock services | `pkg/server/test_env.go:23-62` |
| kubernetes | Two-phase config | `Config` → `CompletedConfig` → `Server` | `cmd/kube-apiserver/app/config.go:33-59` |
| kubernetes | Controller descriptor | `ControllerDescriptor` map with metadata | `cmd/kube-controller-manager/app/controller_descriptor.go:50-57` |
| kubernetes | PostStartHook | Hook registration on genericapiserver | `pkg/controlplane/instance.go:365-368` |
| kubernetes | Shutdown timeout | Controller timeout logging, no forced ordering | `cmd/kube-controller-manager/app/controllermanager.go:790-805` |
| kubernetes | Feature gate global | `utilfeature.DefaultMutableFeatureGate` | `cmd/kube-controller-manager/app/testing/testserver.go:132` |
| milvus | Composition root | `MilvusRoles.Run()` orchestrates all components | `cmd/roles/roles.go:369-632` |
| milvus | Component interface | `Init/Start/Stop/Register` lifecycle | `internal/types/types.go:54-59` |
| milvus | Parallel init | DataCoord/QueryCoord via `errgroup` | `internal/coordinator/mix_coord.go:186-215` |
| milvus | Shutdown ordering | Coordinators first, nodes, proxy last | `cmd/roles/roles.go:593-631` |
| milvus | Global paramtable | `paramtable.Get()` singleton | `internal/rootcoord/root_coord.go:125` |
| milvus | Setter injection | `SetEtcdClient()`, `SetTiKVClient()` after construction | `internal/coordinator/mix_coord.go:404-420` |
| openfga | Functional options | `WithDatastore`, `WithLogger`, 50+ options | `pkg/server/server.go:261-864` |
| openfga | Cleanup list | `cleanups.PushFront` for LIFO ordering | `cmd/run/run.go:943-963` |
| openfga | Composition root | `run()` function 800+ lines | `cmd/run/run.go:405-1205` |
| openfga | Storage interface | `OpenFGADatastore` producer-defined | `pkg/storage/storage.go:409-421` |
| pocketbase | Monolithic App | 60+ method `core.App` interface | `core/app.go:28-714` |
| pocketbase | Hook system | `Hook[T]` with `Bind`/`Trigger` | `tools/hook/hook.go:54` |
| pocketbase | Bootstrap lifecycle | Explicit init sequence in `Bootstrap()` | `core/base.go:391-443` |
| pocketbase | Shutdown priority | `-9999` priority for HTTP graceful shutdown | `apis/serve.go:171-195` |
| pocketbase | Lazy bootstrap | `Bootstrap()` called on `Execute()` | `pocketbase.go:101-114` |
| temporal | fx DI framework | `go.uber.org/fx` composition | `temporal/fx.go:60-61` |
| temporal | Multi-graph | Separate `fx.App` per service | `temporal/fx.go:498-505` |
| temporal | Lifecycle hooks | `fx.StartStopHook` on `fx.Lifecycle` | `temporal/fx.go:539-541` |
| temporal | Cross-graph workaround | `ServiceProviderParamsCommon` with `fx.In` | `temporal/fx.go:347-377` |
| temporal | Optional deps | `optional:"true"` struct tags | `temporal/fx.go:373-375` |
| temporal | Graceful shutdown | `s.app.Stop(context.Background())` | `temporal/fx.go:333-335` |
| victoriametrics | Init/Stop per package | Sequential `Init()` calls | `app/victoria-metrics/main.go:96-99` |
| victoriametrics | Global storage | `vmstorage.Storage` package-level var | `app/vmstorage/main.go:192` |
| victoriametrics | Shutdown ordering | Explicit reverse call order | `app/victoria-metrics/main.go:113-125` |
| victoriametrics | WG tracking | `WG.Add(1)...WG.Done()` for graceful stop | `app/vmstorage/main.go:205-213` |
| victoriametrics | OpenOptions struct | Constructor with `OpenOptions` parameter | `lib/storage/storage.go:178` |
| victoriametrics | Panic on failure | `MustOpenStorage` panics | `lib/storage/storage.go:181` |

---

Generated by dimension `02-dependency-injection-composition.md`.