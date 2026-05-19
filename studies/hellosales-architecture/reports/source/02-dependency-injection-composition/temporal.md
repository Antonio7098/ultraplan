# Source Analysis: temporal

## Dependency Injection & Composition

### Source Info

| Field | Value |
|-------|-------|
| Name | temporal |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/temporal` |
| Language / Stack | Go |
| Analyzed | 2026-05-19 |

## Summary

Temporal uses **Uber's fx DI framework** as a formal dependency injection container. The composition root is at `temporal/fx.go:162` (`NewServerFx`), which creates `fx.App` instances. The application is structured as a **multi-graph architecture**: a top-level server `fx.App` that spawns separate `fx.App` instances per service (history, matching, frontend, worker) via `HistoryServiceProvider`, `MatchingServiceProvider`, etc. at `temporal/fx.go:488-591`. Dependencies flow via constructor injection through fx providers. Lifecycle is managed via `fx.StartStopHook` hooks on `fx.Lifecycle`. Shutdown ordering is guaranteed by fx's lifecycle system. The architecture is modular and extensible but introduces complexity in cross-service dependency propagation.

## Rating

**8/10** — Good implementation with minor issues. The fx-based DI provides excellent lifecycle management, testability seams via optional dependencies and interface-based design, and clear separation between services. However, the multi-graph architecture (separate fx.App per service) creates complexity in dependency propagation — the `ServiceProviderParamsCommon` workaround at `temporal/fx.go:347-461` is acknowledged as non-ideal in comments. No global mutable state, no init() hell.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| DI framework | Uber fx dependency injection container | `go.uber.org/fx` import in `temporal/fx.go:60-61` |
| Composition root | `NewServerFx()` creates fx.App with `TopLevelModule` | `temporal/fx.go:162-174` |
| Top-level module | `TopLevelModule` defines all server-level providers | `temporal/fx.go:132-153` |
| Service provider functions | `HistoryServiceProvider`, `MatchingServiceProvider`, etc. | `temporal/fx.go:488-591` |
| Cross-graph dependency propagation | `ServiceProviderParamsCommon` struct with `fx.In` | `temporal/fx.go:347-377` |
| GetCommonServiceOptions | Converts server graph dependencies to service graph fx options | `temporal/fx.go:386-461` |
| Lifecycle hooks | `fx.StartStopHook` for service start/stop ordering | `temporal/fx.go:539-541` |
| Namespace registry lifecycle | `lc.Append(fx.StartStopHook(registry.Start, registry.Stop))` | `common/namespace/nsregistry/fx.go:16` |
| Metrics reporter lifecycle | `lc.Append(fx.Hook{OnStart: reporter.Start, OnStop: reporter.Stop})` | `common/metrics/fx.go:20-30` |
| Cluster metadata lifecycle | `lc.Append(fx.Hook{OnStart: clusterMetadata.Start, OnStop: clusterMetadata.Stop})` | `common/cluster/fx.go:23-33` |
| DataStore factory lifecycle | `lc.Append(fx.StopHook(f.Close))` for datastore cleanup | `common/persistence/client/fx.go:217-218` |
| Dynamic config collection lifecycle | `lc.Append(fx.StartStopHook(col.Start, col.Stop))` | `common/dynamicconfig/fx.go:12` |
| Service-level fx options | `fx.Provide`, `fx.Invoke` pattern in each service Module | `service/history/fx.go:58-106` |
| Interface ownership | Interfaces defined by producer packages (e.g., `NamespaceRegistry` in `common/namespace`) | `common/namespace/nsregistry/registry.go` |
| Constructor injection | All providers accept dependencies as function parameters | `service/history/fx.go:118-168` |
| Optional dependencies | `optional:"true"` struct tags for conditional dependencies | `temporal/fx.go:373-375` |
| Fx groups | `group:"services"` for collecting service metadata | `temporal/fx.go:73-76` |
| Decorators | `fx.Decorate` for modifying injected values | `temporal/fx.go:551-569` |
| Graceful shutdown | `s.app.Stop(context.Background())` at `temporal/fx.go:334` |
| Shutdown ordering | fx lifecycle manages start/stop order | `temporal/fx.go:316-335` |
| Testing seam | fx allows providing mock implementations via `fx.Provide` | `common/persistence/client/fx.go:220-234` |

## Answers to Dimension Questions

**1. How does the project wire its dependency graph without global state or init() hell?**

No global mutable state. No `init()` functions for service wiring. The dependency graph is wired via fx providers in module definitions. Each package contributes `fx.Provide` and `fx.Invoke` declarations to its local `fx.Module`. The top-level `TopLevelModule` at `temporal/fx.go:132-153` composes all modules together. Cross-service dependencies (e.g., sharing persistence config across history, matching, frontend) use the `ServiceProviderParamsCommon` pattern (`temporal/fx.go:347-461`) — the comment at line 380-385 explicitly acknowledges this is a workaround for propagating dependencies across fx graphs.

**2. Are interfaces defined by consumers or producers?**

**Producers define interfaces.** For example:
- `NamespaceRegistry` interface is defined in `common/namespace/namespace.go` and implemented by `nsregistry.Registry` in `common/namespace/nsregistry/registry.go`
- `DataStoreFactory` is defined in `common/persistence/persistence.go` (producer)
- `HistoryServiceResolver` etc. are defined in `common/membership/membership.go` (producer)

Consumers depend on these interfaces via constructor injection. The comment at `temporal/fx.go:380-385` notes they "should instead either have one shared fx graph, or propagate the individual fx options" — indicating awareness that the current cross-graph propagation is non-ideal.

**3. How is startup ordering managed when services depend on each other?**

Startup ordering is managed by **fx's dependency resolution** — fx analyzes the provider graph and starts dependencies before dependents. Each service's `fx.Invoke(ServiceLifetimeHooks)` at `service/history/fx.go:98`, `service/frontend/fx.go:125`, etc. registers `fx.StartStopHook(svc.Start, svc.Stop)` on the `fx.Lifecycle`. The startup sequence is:
1. Server options provider (`temporal/fx.go:176`)
2. Top-level services (persistence, config, metrics) via `TopLevelModule`
3. Per-service fx.App instances created in service providers (`temporal/fx.go:498-505`)
4. Each service's providers and invocations execute in dependency order

Services are **conditionally created** based on config — `HistoryServiceProvider` at `temporal/fx.go:490-506` checks if the service is requested via `ServiceNames` map before creating its fx.App.

**4. What happens during graceful shutdown — is ordering guaranteed?**

Yes, ordering is guaranteed via **fx's lifecycle system**. When `ServerFx.Stop()` is called at `temporal/fx.go:333-335`, it calls `s.app.Stop(context.Background())`. fx then executes `OnStop` hooks in **reverse dependency order** — dependents stop before their dependencies.

Evidence:
- `ServiceLifetimeHooks` at `service/history/fx.go:539-541` registers `lc.Append(fx.StartStopHook(svc.Start, svc.Stop))`
- `RegistryLifetimeHooks` at `common/namespace/nsregistry/fx.go:16` registers namespace registry stop before service stop
- `DataStoreFactoryLifetimeHooks` at `common/persistence/client/fx.go:216-218` ensures datastore closes after all managers using it
- Queue factory lifecycle at `service/history/queue_factory_base.go:189-196` handles shard-specific queues

Each `fx.Hook.OnStop` can return an error, and fx will log errors but continue stopping other components.

**5. Can individual services be tested without booting the entire system?**

**Yes**, via several mechanisms:
1. **fx.Supply** for test doubles: Any dependency can be replaced with a mock via fx.Supply in test
2. **fx optional:"true"**: Dependencies marked optional can be omitted in tests (`temporal/fx.go:373-375`)
3. **Interface segregation**: Services depend on interfaces (e.g., `persistence.DataStoreFactory`, `namespace.Registry`) which can be mocked
4. **Manager lifetime hooks** at `common/persistence/client/fx.go:220-234` show the pattern for injecting mock factories: `func Factory, fx.Lifecycle) (T, error)` allows tests to provide mock implementations

For unit testing, fx's `NewAppWithRegistrant` or similar patterns allow testing individual components with mocked dependencies. The mock generators in `common/persistence/` (e.g., `persistence.NewMockClusterMetadataManager`) provide test doubles.

## Architectural Decisions

- **fx as DI container**: Uber fx was chosen for lifecycle management, dependency injection, and module composition. It's used extensively across all services.
- **Multi-graph architecture**: Each service (history, matching, frontend, worker) gets its own `fx.App` instance created by a provider function (`HistoryServiceProvider` etc.). This isolates service graphs but requires the `ServiceProviderParamsCommon` workaround for sharing server-level dependencies.
- **Conditional service instantiation**: Service providers check `ServiceNames` map before creating their fx.App — unused services don't start (`temporal/fx.go:490-506`).
- **Functional options via fx**: Server options are provided as fx values, not passed through constructor chains. The `ServerOptionsProvider` at `temporal/fx.go:176` handles configuration loading and validation.
- **Shared resource module**: `common/resource/fx.go:79-116` provides shared resources (clients, namespace registry, metrics handler) to all services via `resource.Module`.

## Notable Patterns

- **`fx.StartStopHook`**: Used throughout to register lifecycle callbacks. Consistent pattern across all services.
- **`fx.Annotate`**: Used for adding tags to parameters/results (e.g., `fx.ResultTags(`group:"deadlockDetectorRoots"`)` at `common/resource/fx.go:92-95`).
- **`fx.In` struct**: Used to group multiple dependencies for a provider function (e.g., `ServiceProviderParamsCommon` at `temporal/fx.go:347-377`).
- **`fx.Out` struct**: Used for providers that produce multiple values.
- **Groups and values**: `ServicesGroupOut` at `temporal/fx.go:73-76` uses `group:"services"` to collect service metadata from multiple providers.
- **`fx.Decorate`**: Used in `temporal/fx.go:551-569` to swap implementations conditionally (e.g., different ClaimMapper for frontend vs internal-frontend).
- **Provider function factories**: E.g., `managerProvider<T>()` at `common/persistence/client/fx.go:220-234` creates parameterized providers for persistence managers.
- **`fx.Invoke` for registration**: Used for side-effects like registering command handlers (`service/history/fx.go:102`) and HTTP routes (`service/frontend/fx.go:119-121`).

## Tradeoffs

- **Multi-graph complexity**: The separation of server graph and service graphs via separate `fx.App` instances (`temporal/fx.go:498-505`) provides isolation but requires the workaround of `ServiceProviderParamsCommon` to propagate shared dependencies. The comment at `temporal/fx.go:380-385` acknowledges this is not ideal.
- **fx learning curve**: fx has a significant learning curve with its concept of modules, groups, options, and lifecycle hooks. The migration to fx from a previous architecture is visible in some inconsistencies.
- **Startup time**: The extensive use of fx and the conditional service instantiation mean startup time depends on which services are enabled. Eager construction of all providers may increase cold-start time.
- **Testing complexity**: While fx allows mocking, testing a component often requires constructing an fx.App or providing many mock dependencies. The pattern at `common/persistence/client/fx.go:220-234` helps but doesn't eliminate boilerplate.
- **Implicit dependency order**: While fx resolves dependencies automatically, the implicit ordering can make debugging startup issues difficult. The extensive use of lifecycle hooks means startup is not a simple linear sequence.

## Failure Modes / Edge Cases

- **Provider registration order**: fx requires providers to be registered before they can be used. Circular dependencies will fail at startup with unclear error messages.
- **Missing required dependencies**: If a required dependency is not provided, fx will error at startup. The error message can be cryptic if the dependency chain is deep.
- **Shutdown timeout**: If `fx.App.Stop` is called with a context that times out, fx will abort remaining stop hooks. This could leave some services in an inconsistent state.
- **Service-specific graph failure**: If a service's fx.App fails to start (e.g., persistence unavailable), the entire server fails — even if other services could start. This is generally correct behavior but means a single failing service blocks all others.
- **Persistence factory closure ordering**: At `common/persistence/client/fx.go:216-218`, the datastore factory's `Close()` is registered as a stop hook. If managers still hold references, this could cause issues. The `defer factory.Close()` at `temporal/fx.go:632` in the cluster metadata initialization handles this differently.
- **Cross-graph dependency propagation lag**: The `ServiceProviderParamsCommon` workaround means service graphs don't get real-time updates if server-level dependencies change after service creation.

## Future Considerations

- Consider **unifying into a single fx graph** if the `ServiceProviderParamsCommon` workaround becomes too burdensome. This would eliminate the cross-graph propagation complexity but would require significant refactoring.
- The `PersistenceLazyLoadedServiceResolver` at `service/fx.go:22-25` uses `atomic.Value` for lazy loading. This could be replaced with a more type-safe lazy initialization pattern if fx ever adds native support.
- Consider adding **startup sanity checks** for critical dependencies (e.g., verify all required services can be resolved before starting).
- **Structured logging for fx events**: The `fxLogAdapter` at `temporal/fx.go:1099-1246` already handles this, but could be extended to provide more actionable diagnostics during startup failures.

## Questions / Gaps

- **No evidence of lazy service instantiation beyond conditional creation**: Services are either fully created or not created at all based on `ServiceNames` config. There's no lazy initialization of heavy services like history.
- **No evidence of DI testing utilities**: While fx allows mocking, there's no dedicated test infrastructure for creating test fx.Apps with common mocks.
- **Cross-service dependency version skew**: If server-level dependencies (e.g., cluster metadata) change after services are created, services won't see those changes. The implications of this aren't clear.
- **No compile-time verification of cleanup hooks**: While fx lifecycle ensures ordering, there's no compile-time check that all resources register cleanup hooks. Missing a cleanup registration would cause resource leaks.
- **`fx.Supply` vs `fx.Provide` misuse**: Some providers use `fx.Supply` for plain values and `fx.Provide` for constructors. Inconsistent usage could make the graph harder to reason about.