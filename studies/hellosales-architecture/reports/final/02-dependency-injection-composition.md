# Dependency Injection & Composition - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Dimension | `02-dependency-injection-composition.md` |
| Sources | cli, grafana, kubernetes, milvus, openfga, pocketbase, temporal |
| Date | 2026-05-19 |

## Sources Studied

| # | Source | Path |
|---|--------|------|
| 1 | cli | `sources/cli` |
| 2 | grafana | `sources/grafana` |
| 3 | kubernetes | `sources/kubernetes` |
| 4 | milvus | `sources/milvus` |
| 5 | openfga | `sources/openfga` |
| 6 | pocketbase | `sources/pocketbase` |
| 7 | temporal | `sources/temporal` |

## Executive Summary

Dependency injection approaches across these seven Go projects span a spectrum from pure manual wiring to formal DI containers (Uber fx) to compile-time code generation (Google Wire). The central finding is that **all approaches work** — scores range from 6/10 to 8/10 — but they carry different tradeoffs in testability, lifecycle management, and startup/shutdown ordering. Projects with formal DI containers (Temporal, Grafana with Wire) score highest on lifecycle guarantees and startup ordering. Projects with manual wiring (cli, OpenFGA) score well on explicitness but lower on coordinated shutdown. The critical differentiator is not which approach is used but whether the approach is applied consistently and whether lifecycle hooks are registered for all resources.

## Core Thesis

DI implementation quality in Go projects correlates more with **discipline in lifecycle registration** than with the choice of DI mechanism. A well-disciplined manual composition root (Kubernetes, OpenFGA) outperforms a sloppy DI-container deployment (Temporal's multi-graph workarounds). The main technical challenges are: (1) wiring a dependency graph without global state or init() hell, (2) managing startup ordering when services depend on each other, (3) guaranteeing shutdown ordering, and (4) enabling isolated unit testing without booting the full system. All seven sources solve these problems differently, but projects with explicit lifecycle interfaces score higher on reliability.

## Rating Summary

| Source | Score | Approach | Main Strength | Main Concern |
|--------|-------|----------|---------------|--------------|
| cli | 6/10 | Manual Factory wiring + lazy func references | Explicit dependencies, no external tool | No formal lifecycle, no shutdown ordering |
| grafana | 8/10 | Google Wire (compile-time DI) + dskit lifecycle | Compile-time cycle detection, excellent testability | Massive wire.go (490+ providers), limited background service ordering |
| kubernetes | 8/10 | Manual constructor injection per binary + descriptor registry | Explicit wiring, no external deps, PostStartHook/PreShutdownHook | Global feature gates complicate testing, limited shutdown ordering |
| milvus | 7/10 | Manual constructor injection + factory interface + composition root | Parallel init within MixCoord, session-based discovery | paramtable.Get() global undermines DI, verbose wiring |
| openfga | 8/10 | Functional options pattern + manual composition root | Excellent testability, LIFO cleanup ordering | No DI container, 50+ With* options become verbose |
| pocketbase | 7/10 | Manual composition + hook-based lifecycle + monolithic App interface | Lazy Bootstrap(), priority-sorted hooks, event chain | Monolithic App interface (60+ methods), no explicit shutdown ordering guarantee |
| temporal | 8/10 | Uber fx DI container + multi-graph architecture | fx lifecycle guarantees, reverse-stop ordering, conditional service creation | Multi-graph complexity (ServiceProviderParamsCommon workaround), fx learning curve |

## Approach Models

### Model 1: Compile-Time DI with Code Generation
**Represented by: Grafana (Wire)**

Wire generates explicit constructor chains in `wire_gen.go`, providing compile-time cycle detection without runtime overhead. The generated file is auditable — every dependency is visible. Services implementing `BackgroundService` are managed by a `ManagerAdapter` wrapping dskit's `BasicService`. The primary strength is safety and explicitness; the primary weakness is that `wire.go` grows to 490+ providers, creating a high-coupling single file.

### Model 2: Formal DI Container (Runtime)
**Represented by: Temporal (fx)**

fx provides lifecycle management, dependency resolution, and module composition. The top-level `TopLevelModule` composes per-service `fx.App` instances. Cross-service dependency propagation requires the `ServiceProviderParamsCommon` workaround. Lifecycle hooks (`fx.StartStopHook`) guarantee reverse-stop ordering on shutdown. The primary strength is lifecycle guarantees; the primary weakness is the multi-graph architecture complexity.

### Model 3: Manual Composition Root with Functional Options
**Represented by: OpenFGA**

No external DI framework. The `run()` function wires all services via `With*` option functions. The cleanup list pattern (`container/list.List` with `PushFront`) provides LIFO shutdown ordering. The primary strength is testability and explicitness; the primary weakness is wiring complexity in `run()` (~800 lines).

### Model 4: Manual Constructor Injection with Lifecycle Interface
**Represented by: Kubernetes**

Each binary (`kube-apiserver`, `kube-controller-manager`, `kubelet`) has a dedicated `app/` package. `Config` → `CompletedConfig` → `Server` is the two-phase construction pattern. Controllers use `ControllerDescriptor` with explicit ordering. `PostStartHook`/`PreShutdownHook` manage lifecycle callbacks. The primary strength is explicitness without external dependencies; the primary weakness is global feature gates.

### Model 5: Manual Composition Root with Component Interface
**Represented by: Milvus**

No DI container. `MilvusRoles.Run()` orchestrates component creation. `Component` interface (Init/Start/Stop/Register) defines lifecycle. MixCoord bundles coordinators with parallel initialization. Setter injection wires dependencies after construction. Session-based discovery via etcd. The primary strength is parallel init and HA support; the primary weakness is `paramtable.Get()` global state.

### Model 6: Factory Struct with Lazy References
**Represented by: cli (GitHub CLI)**

No DI container or code generation. A `*cmdutil.Factory` struct is passed to every command constructor. Dependencies are lazy `func()`-typed fields to defer costly operations. Minimal lifecycle: telemetry flush, pager stop, update cancel. The primary strength is simplicity; the primary weakness is no formal lifecycle interface.

### Model 7: Monolithic App Interface with Hooks
**Represented by: PocketBase**

`core.App` (60+ methods) is the central interface holding all services. `NewBaseApp(config)` + `Bootstrap()` is the construction sequence. Hooks (`OnBootstrap`, `OnServe`, `OnTerminate`) manage lifecycle with priority ordering. The primary strength is lazy initialization and extensibility via hooks; the primary weakness is the monolithic interface coupling.

## Pattern Catalog

### Pattern 1: Composition Root
**Problem solved**: Where to wire the dependency graph so it happens in exactly one place.
**Sources**: Grafana (`pkg/server/wire.go:540-543` Initialize()), Kubernetes (`cmd/kube-apiserver/app/server.go:148-173`), Milvus (`cmd/roles/roles.go:369`), OpenFGA (`cmd/run/run.go:405`), Temporal (`temporal/fx.go:162`), PocketBase (`core/base.go:199`), cli (`internal/ghcmd/cmd.go:52`)
**Why it works**: Centralizing wiring makes the dependency graph auditable and avoids init() hell. Every source uses a deliberate single entry point.
**When to copy**: Always. Every non-trivial Go project should have a identifiable composition root.
**When overkill**: Trivial CLI tools with 2-3 dependencies can use direct construction inline.
**Evidence**: `cmd/run/run.go:405` (OpenFGA), `temporal/fx.go:162` (Temporal)

### Pattern 2: Constructor Injection
**Problem solved**: How dependencies reach the services that need them.
**Sources**: All seven sources use constructor injection consistently.
**Why it works**: Constructor injection makes dependencies explicit, enables testing with fake implementations, and prevents runtime nil-pointer dereferences from unset fields.
**When to copy**: Always use constructor injection. Avoid setter injection unless required (Milvus MixCoord setter injection at `internal/coordinator/mix_coord.go:404-420` is a special case).
**Evidence**: `pkg/services/folder/folderimpl/folder.go:56-68` (Grafana), `cmd/kube-controller-manager/app/controllermanager.go:462-498` (Kubernetes)

### Pattern 3: Lifecycle Interface (BackgroundService / Component)
**Problem solved**: How long-running services are started and stopped in a coordinated way.
**Sources**: Grafana (`BackgroundService` at `pkg/registry/registry.go:25-29`), Milvus (`Component` at `internal/types/types.go:54-59`), Kubernetes (PostStartHook/PreShutdownHook at `pkg/controlplane/apiserver/server.go:144-299`), Temporal (`fx.StartStopHook` throughout)
**Why it works**: A common interface enables the composition root to manage all services uniformly without knowing their internal details.
**When to copy**: For any service with async initialization or cleanup that needs to run at startup/shutdown.
**Evidence**: `pkg/registry/registry.go:25-29` (Grafana BackgroundService)

### Pattern 4: Shutdown Ordering via Cleanup List
**Problem solved**: How to guarantee reverse-order shutdown without a formal lifecycle manager.
**Sources**: OpenFGA (`cmd/run/run.go:943` with `container/list.List` + `PushFront`), Kubernetes (PreShutdownHook registration order), Milvus (coordinators → nodes → proxy at `cmd/roles/roles.go:593-631`)
**Why it works**: `PushFront` ensures later-initialized services clean up before earlier-initialized ones. The deferred cleanup loop iterates the list in order.
**When to copy**: When using manual composition without a DI container that provides lifecycle hooks.
**Evidence**: `cmd/run/run.go:943-963` (OpenFGA cleanup list)

### Pattern 5: Factory Interface for External Resources
**Problem solved**: How to abstract message queues and storage backends.
**Sources**: Milvus (`dependency.Factory` at `internal/util/dependency/factory.go:169`), OpenFGA (`OpenFGADatastore` at `pkg/storage/storage.go:409`)
**Why it works**: A factory interface allows runtime selection of backends (PostgreSQL vs MySQL vs SQLite; RocksMQ vs Kafka) without changing consuming code.
**When to copy**: When your application supports multiple storage or messaging backends.
**Evidence**: `internal/util/dependency/factory.go:169-173` (Milvus)

### Pattern 6: Lazy Initialization via func() Fields
**Problem solved**: How to defer costly operations (HTTP clients, Git remotes) until first use.
**Sources**: cli (`pkg/cmdutil/factory.go:20-26`: `HttpClient`, `Config`, `BaseRepo`, `Remotes`, `Branch` as `func()`-typed)
**Why it works**: Avoids computing expensive resources at startup, spreading cost across command execution.
**When to copy**: For CLI tools where not all commands use all resources.
**When risky**: Makes testing harder and failures can occur mid-command rather than at startup. Grafana and Kubernetes avoid this pattern entirely.
**Evidence**: `pkg/cmdutil/factory.go:20-26` (cli)

### Pattern 7: Two-Phase Config Completion (Config → CompletedConfig)
**Problem solved**: How to prevent use of partially-initialized config and enforce that all required fields are set.
**Sources**: Kubernetes (`Config` → `CompletedConfig` at `cmd/kube-apiserver/app/config.go:33-59`)
**Why it works**: `CompletedConfig` embeds a private pointer to `Config`, preventing external instantiation. The `Complete()` method validates and finalizes.
**When to copy**: When config has required fields that cannot be defaulted.
**Evidence**: `cmd/kube-apiserver/app/config.go:56-59` (Kubernetes CompletedConfig)

### Pattern 8: Functional Options Pattern
**Problem solved**: How to provide optional dependencies without constructor bloat.
**Sources**: OpenFGA (`WithDatastore`, `WithLogger`, etc. at `pkg/server/server.go:261-864`)
**Why it works**: Each `With*` function is a closure that mutates the server struct. Callers pass only the options they need.
**When to copy**: When a struct has many optional dependencies that vary by usage context.
**When overkill**: When all dependencies are required (Kubernetes, Temporal).
**Evidence**: `pkg/server/server.go:261` (OpenFGA option func types)

### Pattern 9: Module-Based Service Organization
**Problem solved**: How to partition services into independently startable groups.
**Sources**: Grafana (dskit `Module` system at `pkg/modules/dependencies.go:24-40`), Temporal (per-service fx.Modules at `service/history/fx.go:58-106`), Kubernetes (`ControllerDescriptor` map)
**Why it works**: Modules can declare dependencies on other modules, enabling a dependency graph that the lifecycle manager resolves automatically.
**When to copy**: When the application has distinct service groups (e.g., frontend vs background services).
**Evidence**: `pkg/modules/dependencies.go:24-40` (Grafana dependencyMap)

## Key Differences

### DI Container vs Manual Wiring

The most fundamental divide is whether to use a DI container (fx in Temporal, Wire in Grafana) or manual wiring (all others). Grafana's Wire is compile-time only — it generates `wire_gen.go` with explicit constructor calls, no reflection, no runtime DI overhead. Temporal's fx is a full runtime container with lifecycle management, dependency resolution, and module composition.

**Why the choice matters**: DI containers provide lifecycle guarantees (start ordering, reverse-stop shutdown) automatically. Manual wiring requires explicit lifecycle code for each resource. OpenFGA's cleanup list pattern (`cmd/run/run.go:943`) is manual but effective — it replicates what fx provides automatically.

### Interface Ownership: Producers vs Consumers

Grafana, Kubernetes, Temporal, and OpenFGA use **producer-defined interfaces** — each package defines its own `Service` interface that consumers depend on. cli uses **consumer-defined interfaces** — the `Factory` struct declares interface fields (`Browser`, `Prompter`) that implementations must satisfy.

The consumer-owned approach (cli) makes the factory interface the contract boundary. The producer-owned approach makes each domain package the authority on its own contract. Both work; producer-owned is more common in these sources.

### Startup Ordering Mechanisms

| Source | Mechanism |
|--------|-----------|
| Grafana | Wire topological sort + dskit module dependencyMap + BackgroundServices module |
| Kubernetes | ControllerDescriptor explicit order + PostStartHook registration order + Informer WaitForCacheSync |
| Milvus | Sequential in roles.go + errgroup parallel within MixCoord + session barrier |
| OpenFGA | Sequential construction order in run() |
| Temporal | fx dependency resolution + fx.StartStopHook |
| PocketBase | Sequential Bootstrap() |
| cli | Sequential Main() |

### Shutdown Ordering Mechanisms

| Source | Mechanism |
|--------|-----------|
| Grafana | dskit Shutdown() with 5s timeout, reverse stop via BasicService |
| Kubernetes | PreShutdownHook in registration order, no enforced ordering after timeout |
| Milvus | Coordinators first → nodes in parallel → proxy last, via sync errgroup |
| OpenFGA | LIFO via container/list.List with PushFront, 10s ShutdownTimeout |
| Temporal | fx reverse-stop ordering via fx.Lifecycle |
| PocketBase | OnTerminate hook priority (lowest = -9999 for HTTP server) |
| cli | Go defer stack (telemetry flush only) |

### Global State Hotspots

Four sources have global mutable state that bypasses DI:

| Source | Global | Impact |
|--------|--------|--------|
| Milvus | `paramtable.Get()` | Undermines DI model; tests require real config system |
| Kubernetes | `utilfeature.DefaultMutableFeatureGate` | Race conditions in parallel tests |
| cli | None significant | — |
| Grafana | None significant | — |
| OpenFGA | `grpcTLSCertPool` (atomic pointer, minor) | Single pinned TLS pool, not mutable app state |
| PocketBase | None significant | — |
| Temporal | None significant | — |

## Tradeoffs

### Wire (Grafana) vs fx (Temporal)

| Dimension | Wire | fx |
|-----------|------|-----|
| Lifecycle management | Via dskit BasicService | Native fx lifecycle hooks |
| Cycle detection | Compile-time | Runtime (startup error) |
| Startup ordering | Wire topological sort + convention | fx dependency graph |
| Shutdown ordering | dskit reverse stop | fx reverse stop |
| Conditional bindings | Runtime feature flags only | fx.Decorate + optional:true |
| Testability | Fake services + wireTestSet | fx.Supply mocks |
| Learning curve | Low (standard Go code) | High (modules, groups, options) |
| Tooling required | wire generate | fx build + compile |

**Verdict**: Wire is simpler and more explicit. fx is more powerful but complex. For HelloSales, Wire's compile-time cycle detection is a significant advantage for large backends.

### Manual Wiring (Kubernetes, OpenFGA, cli) vs Container (Temporal, Grafana)

**Benefit of manual**: No external dependency, explicit wiring visible in one function, no code generation step. Good for: projects with simple dependency graphs, projects that want to avoid DI framework lock-in.

**Cost of manual**: Lifecycle management is DIY. Each resource must register its cleanup. Shutdown ordering must be manually coordinated. As the graph grows, wiring code becomes verbose and error-prone.

**Benefit of container**: Automatic lifecycle management, startup/shutdown ordering guaranteed by the framework, dependency resolution is automatic. Good for: complex multi-service architectures, projects that benefit from conditional service instantiation.

**Cost of container**: External dependency, runtime overhead (minimal for fx), learning curve (significant for fx), debugging startup issues requires understanding the container's internals.

### Functional Options (OpenFGA) vs Factory Struct (cli)

**Benefit of functional options**: Immutable after construction, each option is independently composable, no setter bloat, thread-safe by default.

**Cost of functional options**: 50+ `With*` functions become verbose in the composition root. No compile-time enforcement that all required dependencies are set.

**Benefit of factory struct**: Simple, all dependencies visible in one struct, straightforward to add new fields.

**Cost of factory struct**: Becomes a god object if overused. Lazy `func()` fields complicate testing (cli's `pkg/cmdutil/factory.go:20-26`).

### Lazy Init (cli) vs Eager Init (all others)

**Benefit of lazy**: Faster startup for CLI tools where not all features are used.

**Cost of lazy**: Failures occur mid-execution, harder to test, error messages surface during command execution rather than at startup.

**Verdict**: For long-running services (all other sources), eager initialization is preferred. Lazy init is appropriate only for CLI tools with highly variable feature usage.

## Decision Guide

**Use Wire or compile-time DI if**: You want compile-time cycle detection, have a large dependency graph (50+ services), prefer explicit generated code over runtime reflection, and are willing to run `make gen-go` after wiring changes.

**Use fx or runtime DI container if**: You need conditional service instantiation, have complex lifecycle ordering requirements, want built-in module composition, and your team is comfortable with fx's concepts.

**Use manual composition with functional options if**: You prefer explicitness over magic, want to avoid external tool dependencies, have a stable dependency graph that doesn't change frequently, and value testability via straightforward constructor calls.

**Use manual composition with factory struct if**: You have a CLI tool with moderate complexity, want maximum simplicity, and can accept manual lifecycle management.

**Avoid global mutable state** (paramtable.Get(), DefaultFeatureGate) regardless of approach — it undermines testability and hides dependencies. Inject config through constructors instead.

## Practical Tips

1. **Name your composition root explicitly** — `run()`, `Initialize()`, `Bootstrap()`, `NewServerFx()` — and keep it in a single file. Kubernetes puts one per binary in `cmd/<binary>/app/`. OpenFGA has one in `cmd/run/run.go`.

2. **Use constructor injection exclusively** — pass dependencies as function parameters. Avoid setter injection except for genuinely optional post-construction wiring (Milvus MixCoord pattern).

3. **Register lifecycle hooks for every resource** — if it has a Start, it must have a Stop registered. Grafana's BackgroundService interface, Temporal's fx.StartStopHook, and OpenFGA's cleanup list all enforce this discipline.

4. **Prefer interfaces over concretions in factory/constructor signatures** — Grafana's `folder.Service`, Kubernetes' `Controller`, OpenFGA's `OpenFGADatastore` are all interfaces consumed by higher-level code. This enables testing with fakes and mocks.

5. **Use dskit BasicService or equivalent for Go services** — Grafana's wrapping of `BackgroundService` with dskit's `BasicService` gives a standard state machine (New → Starting → Running → Stopping → Terminated) for free.

6. **Implement shutdown ordering explicitly for manual wiring** — use the cleanup list pattern (OpenFGA's `PushFront` on `container/list.List`) or explicit ordering in the shutdown function (Milvus: coordinators → nodes → proxy).

7. **Avoid lazy func() fields for critical dependencies** — they make testing harder. Use lazy init only for expensive operations where the cost genuinely cannot be paid at startup (e.g., HTTP client for optional remote calls).

## Anti-Patterns / Caution Signs

| Anti-Pattern | Warning Sign | Affected Sources |
|--------------|-------------|------------------|
| Global config singleton | `paramtable.Get()`, `utilfeature.DefaultMutableFeatureGate` | Milvus, Kubernetes |
| No lifecycle hook for resource | Missing OnStop hook — resource leak on shutdown | cli (minimal lifecycle) |
| Massive composition root | Single file > 500 lines handling all wiring | Grafana (wire.go 490+ providers) |
| Monolithic interface | `core.App` with 60+ methods coupling all services | PocketBase |
| Silent failure on shutdown | No error returned from Stop, no timeout enforcement | PocketBase (1s timeout may be too short) |
| No test isolation for feature gates | Tests must use `featuregatetesting.SetFeatureGatesDuringTest()` | Kubernetes |
| Double-Stop via sync.Once hiding real errors | `sync.Once` makes second Stop() a no-op, hiding partial failures | Milvus |
| No rollback on failed startup | Init sequence continues after partial failure with no rollback | Milvus, PocketBase |
| Cross-graph dependency workaround | `ServiceProviderParamsCommon` workaround acknowledged as non-ideal | Temporal |

## Notable Absences

1. **No source uses lazy singletons** — once a service is constructed, it is held for the lifetime of the process. No lazy-initialized cached instances were observed.

2. **No source implements auto-restart on failure** — services that fail transition to a failed state and stay there. Kubernetes, Grafana, and Temporal all rely on process restart (k8s pod restart, systemd) rather than in-process restart.

3. **No source has compile-time enforcement of cleanup hook registration** — missing a shutdown hook causes resource leaks but compiles fine. This is a gap across all seven sources.

4. **No source uses constructor injection for all intermediate objects** — Kubernetes specifically notes "many intermediate objects are created inline rather than injected" as a limitation.

5. **No source has a formal optional dependency pattern** — services that need optional dependencies typically use nil checks at runtime or a pointer field that may be nil.

## Per-Source Notes

### cli (6/10)
Minimal DI with a `*cmdutil.Factory` passed to every command. Lazy `func()` fields for HttpClient, Config, Remotes. No formal lifecycle interface — only telemetry flush, pager stop, and update cancel have cleanup. Scores low on lifecycle management but high on simplicity and explicitness.

### grafana (8/10)
Wire DI with dskit lifecycle management. Excellent testability via `wireTestSet` and fake services. The `BackgroundService` interface and `ManagerAdapter` wrapping dskit `BasicService` provide robust lifecycle. Scores扣 on massive wire.go coupling and limited startup ordering within BackgroundServices.

### kubernetes (8/10)
Manual constructor injection across three binaries (apiserver, controller-manager, scheduler). Two-phase Config → CompletedConfig pattern. `ControllerDescriptor` map for explicit ordering. `PostStartHook`/`PreShutdownHook` for lifecycle. Global feature gates are the main testability concern.

### milvus (7/10)
Manual composition in `cmd/roles/roles.go`. Parallel coordinator init within MixCoord. Session-based service discovery. `paramtable.Get()` global state is the main architectural flaw. Setter injection for MixCoord client wiring.

### openfga (8/10)
Functional options pattern with a cleanup list for LIFO shutdown. Excellent testability via `MustNewServerWithOpts()` and `NewServerWithOpts()`. Scores扣 on verbosity as `run()` grows with 50+ `With*` options.

### pocketbase (7/10)
Monolithic `core.App` interface (60+ methods) as the central coupling point. Hook-based lifecycle with priority ordering. Lazy `Bootstrap()` for deferred initialization. Scores扣 on shutdown ordering guarantees and monolithic interface coupling.

### temporal (8/10)
Uber fx with multi-graph architecture. Per-service `fx.App` instances with `ServiceProviderParamsCommon` workaround for cross-graph dependency propagation. `fx.StartStopHook` provides lifecycle guarantees. Scores扣 on fx complexity and the non-ideal multi-graph workaround.

## Open Questions

1. **Should HelloSales use Wire or fx?** For a large backend with many services, Wire's compile-time cycle detection provides safety without runtime overhead. fx provides more power (conditional instantiation, groups) but at a significant learning curve. For a new project, Wire is lower-risk. For an existing project migrating to DI, fx is more flexible.

2. **Is a monolithic App interface ever justified?** PocketBase demonstrates that a 60+ method interface couples everything. Even if convenient for passing one object, it creates implicit dependencies. Smaller focused interfaces (Temporal's approach) are better for evolvability.

3. **How should shutdown timeout be configured?** Grafana uses a fixed 5s timeout, PocketBase uses 1s, OpenFGA uses 10s configurable. Long-running services (database transactions, large file uploads) may need per-service timeouts, not global ones.

4. **When does manual wiring become untenable?** OpenFGA's `run()` is ~800 lines. Grafana's wire.go has 490+ providers. Both are still maintainable because the wiring is explicit and well-structured. The warning sign is when adding a new service requires modifying many unrelated parts of the wiring file.

5. **How should feature flags interact with DI?** Grafana uses `CanBeDisabled` at runtime. Temporal uses conditional service instantiation via `ServiceNames` map. Wire cannot do conditional bindings at compile time. This tension is unresolved — feature flags that disable services are runtime behavior, but DI is often compile-time.

## Evidence Index

| Evidence | Source | File:Line |
|----------|--------|-----------|
| Wire NewSet with 490+ providers | grafana | `pkg/server/wire.go:223-507` |
| Wire Generate constructor ordering | grafana | `pkg/server/wire_gen.go:309-821` |
| BackgroundService interface | grafana | `pkg/registry/registry.go:25-29` |
| ManagerAdapter shutdown with 5s timeout | grafana | `pkg/registry/backgroundsvcs/adapter/manager.go:99-109` |
| dskit module dependencyMap | grafana | `pkg/modules/dependencies.go:24-40` |
| Wire test seam with ProvideTestEnv | grafana | `pkg/server/test_env.go:23-62` |
| FakeService for testing | grafana | `pkg/services/folder/foldertest/foldertest.go:10-157` |
| Kubernetes Config → CompletedConfig | kubernetes | `cmd/kube-apiserver/app/config.go:33-59` |
| PostStartHook/PreShutdownHook | kubernetes | `pkg/controlplane/apiserver/server.go:144-299` |
| ControllerDescriptor with explicit ordering | kubernetes | `cmd/kube-controller-manager/app/controllermanager.go:666-672` |
| Init ordering ServiceAccountTokenController first | kubernetes | `cmd/kube-controller-manager/app/controllermanager.go:666-672` |
| Global feature gate | kubernetes | `cmd/kube-controller-manager/app/testing/testserver.go:132` |
| Milvus composition root | milvus | `cmd/roles/roles.go:369-632` |
| Component interface Init/Start/Stop/Register | milvus | `internal/types/types.go:54-59` |
| Setter injection for MixCoord | milvus | `internal/coordinator/mix_coord.go:404-420` |
| Parallel init DataCoord/QueryCoord | milvus | `internal/coordinator/mix_coord.go:186-215` |
| Shutdown ordering coordinators → nodes → proxy | milvus | `cmd/roles/roles.go:593-631` |
| paramtable.Get() global singleton | milvus | `internal/rootcoord/root_coord.go:125` |
| dependency.Factory interface | milvus | `internal/util/dependency/factory.go:169-173` |
| OpenFGA run() composition root | openfga | `cmd/run/run.go:405-420` |
| Functional options pattern | openfga | `pkg/server/server.go:261-864` |
| Cleanup list with PushFront for LIFO | openfga | `cmd/run/run.go:943-963` |
| OpenFGADatastore interface | openfga | `pkg/storage/storage.go:409-421` |
| ShutdownTimeout 10s default | openfga | `pkg/server/config/config.go:90` |
| PocketBase core.App interface | pocketbase | `core/app.go:28-714` |
| BaseApp with all service fields | pocketbase | `core/base.go:75-193` |
| Bootstrap lifecycle sequence | pocketbase | `core/base.go:391-443` |
| Hook system with priority | pocketbase | `tools/hook/hook.go:99-101` |
| OnTerminate hook for graceful shutdown | pocketbase | `apis/serve.go:171-195` |
| Temporal fx composition root | temporal | `temporal/fx.go:162-174` |
| TopLevelModule | temporal | `temporal/fx.go:132-153` |
| ServiceProviderParamsCommon workaround | temporal | `temporal/fx.go:347-377` |
| fx.StartStopHook for lifecycle | temporal | `temporal/fx.go:539-541` |
| GetCommonServiceOptions cross-graph | temporal | `temporal/fx.go:386-461` |
| Namespace registry lifecycle hook | temporal | `common/namespace/nsregistry/fx.go:16` |
| DataStore factory StopHook | temporal | `common/persistence/client/fx.go:216-218` |
| Optional dependencies optional:true | temporal | `temporal/fx.go:373-375` |
| fx.Decorate for conditional implementation | temporal | `temporal/fx.go:551-569` |
| cli composition root Main() | cli | `internal/ghcmd/cmd.go:52-175` |
| Factory struct with lazy func fields | cli | `pkg/cmdutil/factory.go:16-43` |
| New() factory wiring | cli | `pkg/cmd/factory/default.go:26-46` |
| Constructor injection into commands | cli | `pkg/cmdutil/factory.go:16` |
| Telemetry flush via defer | cli | `internal/ghcmd/cmd.go:130` |
| HTTP mock registry for tests | cli | `pkg/httpmock/registry.go:18` |
| Browser interface defined by consumer | cli | `internal/browser/browser.go:9-11` |

---

Generated by dimension `02-dependency-injection-composition.md`.