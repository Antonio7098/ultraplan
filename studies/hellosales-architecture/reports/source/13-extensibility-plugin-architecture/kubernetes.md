# Source Analysis: kubernetes

## Extensibility & Plugin Architecture

### Source Info

| Field | Value |
|-------|-------|
| Name | kubernetes |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/kubernetes` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

Kubernetes demonstrates a mature, multi-layered plugin architecture across its control plane components. The system uses registry-based plugin discovery with well-defined interface contracts for admission controllers, scheduler plugins, cloud providers, and authentication/authorization webhooks. Plugin isolation is achieved through dependency injection of read-only interfaces, lifecycle management with stop channels, and readiness checks with timeouts. The architecture supports both in-tree static plugins and out-of-tree webhooks, providing flexibility for extensibility.

## Rating

**8/10** — Excellent implementation with minor issues. Kubernetes provides a comprehensive plugin ecosystem with 13 scheduler extension points, full admission chain support, and cloud provider abstraction. However, plugin API versioning is implicit rather than explicit, webhook-based plugins lack process isolation (unlike scheduler plugins which run in-process), and debugging tooling is fragmented across different plugin types.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Admission Plugin Registry | `Factory` type definition for plugin creation | `staging/src/k8s.io/apiserver/pkg/admission/plugins.go:31-35` |
| Admission Plugin Registry | `Plugins.Register()` method stores factories in map | `staging/src/k8s.io/apiserver/pkg/admission/plugins.go:71-85` |
| Admission Plugin Registry | `Plugins.NewFromPlugins()` iterates and instantiates plugins | `staging/src/k8s.io/apiserver/pkg/admission/plugins.go:127-163` |
| Admission Plugin Registry | `Plugins.InitPlugin()` initializes and validates plugins | `staging/src/k8s.io/apiserver/pkg/admission/plugins.go:166-187` |
| Extension Interface | `Interface` base type with `Handles()` method | `staging/src/k8s.io/apiserver/pkg/admission/interfaces.go:122-127` |
| Extension Interface | `MutationInterface` with `Admit()` method | `staging/src/k8s.io/apiserver/pkg/admission/interfaces.go:129-135` |
| Extension Interface | `ValidationInterface` with `Validate()` method | `staging/src/k8s.io/apiserver/pkg/admission/interfaces.go:137-144` |
| Extension Interface | `PluginInitializer` interface for dependency injection | `staging/src/k8s.io/apiserver/pkg/admission/interfaces.go:159-161` |
| Extension Interface | `InitializationValidator` for post-init validation | `staging/src/k8s.io/apiserver/pkg/admission/interfaces.go:165-167` |
| Extension Interface | `ConfigProvider` for per-plugin configuration | `staging/src/k8s.io/apiserver/pkg/admission/interfaces.go:170-172` |
| Scheduler Plugin Registry | `Registry` type as `map[string]PluginFactory` | `pkg/scheduler/framework/runtime/registry.go:71` |
| Scheduler Plugin Registry | `Registry.Register()` adds plugins to registry | `pkg/scheduler/framework/runtime/registry.go:75-81` |
| Scheduler Plugin Registry | `Registry.Merge()` combines registries | `pkg/scheduler/framework/runtime/registry.go:94-100` |
| Scheduler Extension Points | `frameworkImpl` struct with 14 plugin slice fields | `pkg/scheduler/framework/runtime/framework.go:58-112` |
| Scheduler Extension Points | `getExtensionPoints()` maps config to plugin slices | `pkg/scheduler/framework/runtime/framework.go:125-142` |
| Scheduler Extension Points | `PreEnqueuePlugin` interface definition | `staging/src/k8s.io/kube-scheduler/framework/interface.go:445-449` |
| Scheduler Extension Points | `QueueSortPlugin` interface definition | `staging/src/k8s.io/kube-scheduler/framework/interface.go:454-461` |
| Scheduler Extension Points | `PreFilterPlugin` interface definition | `staging/src/k8s.io/kube-scheduler/framework/interface.go:508-530` |
| Scheduler Extension Points | `FilterPlugin` interface definition | `staging/src/k8s.io/kube-scheduler/framework/interface.go:532-565` |
| Scheduler Extension Points | `PostFilterPlugin` interface definition | `staging/src/k8s.io/kube-scheduler/framework/interface.go:567-589` |
| Scheduler Extension Points | `ScorePlugin` interface definition | `staging/src/k8s.io/kube-scheduler/framework/interface.go:614-626` |
| Scheduler Extension Points | `ReservePlugin` interface definition | `staging/src/k8s.io/kube-scheduler/framework/interface.go:628-646` |
| Scheduler Extension Points | `PreBindPlugin` interface definition | `staging/src/k8s.io/kube-scheduler/framework/interface.go:648-663` |
| Scheduler Extension Points | `BindPlugin` interface definition | `staging/src/k8s.io/kube-scheduler/framework/interface.go:689-699` |
| Scheduler Extension Points | `PermitPlugin` interface definition | `staging/src/k8s.io/kube-scheduler/framework/interface.go:676-687` |
| Scheduler Extension Points | `PostBindPlugin` interface definition | `staging/src/k8s.io/kube-scheduler/framework/interface.go:665-674` |
| Cloud Provider Registry | `Factory` type for cloud provider creation | `staging/src/k8s.io/cloud-provider/plugins.go:32` |
| Cloud Provider Registry | `providers` map storing registered factories | `staging/src/k8s.io/cloud-provider/plugins.go:37` |
| Cloud Provider Registry | `RegisterCloudProvider()` registers providers | `staging/src/k8s.io/cloud-provider/plugins.go:44-52` |
| Cloud Provider Registry | `GetCloudProvider()` retrieves provider instances | `staging/src/k8s.io/cloud-provider/plugins.go:68-76` |
| Cloud Provider Interface | `Interface` main cloud provider interface | `staging/src/k8s.io/cloud-provider/cloud.go:43-69` |
| Plugin Initialization | `pluginInitializer` struct with dependency fields | `staging/src/k8s.io/apiserver/pkg/admission/initializer/initializer.go:30-39` |
| Plugin Initialization | `Initialize()` method performs dependency injection | `staging/src/k8s.io/apiserver/pkg/admission/initializer/initializer.go:68-100` |
| Plugin Lifecycle | `Handler` base struct with operations set | `staging/src/k8s.io/apiserver/pkg/admission/handler.go:36-39` |
| Plugin Lifecycle | `WaitForReady()` with 10-second timeout | `staging/src/k8s.io/apiserver/pkg/admission/handler.go:64-78` |
| Plugin Lifecycle | `SetReadyFunc()` for late registration | `staging/src/k8s.io/apiserver/pkg/admission/handler.go:59-61` |
| Webhook Isolation | `Webhook` struct with `hookSource` and lifecycle `stopCh` | `staging/src/k8s.io/apiserver/pkg/admission/plugin/webhook/generic/webhook.go:51-83` |
| Webhook Isolation | `ShouldCallHook()` with namespace/object matching | `staging/src/k8s.io/apiserver/pkg/admission/plugin/webhook/generic/webhook.go:260-347` |
| Webhook Isolation | `Dispatch()` with readiness check before execution | `staging/src/k8s.io/apiserver/pkg/admission/plugin/webhook/generic/webhook.go:357-376` |
| Admission Chain | `chainAdmissionHandler` iterates through handlers | `staging/src/k8s.io/apiserver/pkg/admission/chain.go:23` |
| Admission Chain | `Admit()` returns immediately on first error | `staging/src/k8s.io/apiserver/pkg/admission/chain.go:31-44` |
| Admission Chain | `Validate()` returns immediately on first error | `staging/src/k8s.io/apiserver/pkg/admission/chain.go:47-60` |
| Plugin Registration Example | `Register()` pattern in serviceaccount plugin | `plugin/pkg/admission/serviceaccount/admission.go:63-69` |
| Built-in Admission Plugins | 31 admission plugins in `plugin/pkg/admission/` | `plugin/pkg/admission/` (multiple subdirectories) |
| Scheduler Built-in Plugins | NodeName, NodeAffinity, NodePorts, etc. | `pkg/scheduler/framework/plugins/` |
| Config Provider | `ReadAdmissionConfiguration()` reads plugin configs | `staging/src/k8s.io/apiserver/pkg/admission/config.go:57-129` |
| Scheduler Handle Interface | `fwk.Handle` passed to plugins for cluster access | `pkg/scheduler/framework/runtime/framework.go:58-112` |

## Answers to Dimension Questions

### 1. How are plugins discovered, loaded, and verified?

**Discovery:** Plugins are discovered through static registration via `Register()` functions called during init. For admission plugins, `Plugins.Register(name, factory)` stores factories in a registry map (`staging/src/k8s.io/apiserver/pkg/admission/plugins.go:71-85`). Scheduler plugins use `Registry.Register()` with a `map[string]PluginFactory` (`pkg/scheduler/framework/runtime/registry.go:75-81`). Cloud providers use `RegisterCloudProvider()` in a global map (`staging/src/k8s.io/cloud-provider/plugins.go:44-52`).

**Loading:** `NewFromPlugins()` iterates requested plugin names and calls `InitPlugin()` which instantiates via factory functions (`staging/src/k8s.io/apiserver/pkg/admission/plugins.go:127-163`). Configuration is provided via `ConfigProvider.ConfigFor()` which returns an `io.Reader` per plugin.

**Verification:** After initialization, `ValidateInitialization()` is called on each plugin if it implements `InitializationValidator` (`staging/src/k8s.io/apiserver/pkg/admission/plugins.go:182`). The `pluginInitializer.Initialize()` performs dependency injection and the initializer checks that plugins implement expected interfaces (`staging/src/k8s.io/apiserver/pkg/admission/initializer/initializer.go:68-100`).

### 2. What extension points exist for custom business logic?

**Scheduler:** 14 extension points via the scheduling framework:
- `PreEnqueue` — Called before adding Pods to queues (`staging/src/k8s.io/kube-scheduler/framework/interface.go:445-449`)
- `QueueSort` — Sort pods in scheduling queue (`interface.go:454-461`)
- `PreFilter` — Beginning of scheduling cycle (`interface.go:508-530`)
- `Filter` — Filter unsuitable nodes (`interface.go:532-565`)
- `PostFilter` — After pod cannot be scheduled (`interface.go:567-589`)
- `PreScore` — Informational before scoring (`interface.go:591-604`)
- `Score` — Rank nodes (`interface.go:614-626`)
- `Reserve` — Update plugin state (assume) (`interface.go:628-646`)
- `PreBind` — Before pod binding (`interface.go:648-663`)
- `Bind` — Bind pod to Node (`interface.go:689-699`)
- `PostBind` — After successful binding (`interface.go:665-674`)
- `Permit` — Prevent/delay binding (`interface.go:676-687`)
- `PlacementGenerate` — For pod group placement (`framework.go:139`)
- `PlacementScore` — For pod group scoring (`framework.go:140`)

**Admission:** Built-in chain handler (`staging/src/k8s.io/apiserver/pkg/admission/chain.go:23-70`) supports mutation via `MutationInterface.Admit()` and validation via `ValidationInterface.Validate()`. Both receive `context.Context`, `Attributes`, and `ObjectInterfaces`.

**Cloud Provider:** `Interface.Initialize()` hook for startup, plus `LoadBalancer()`, `Instances()`, `Zones()`, `Clusters()`, `Routes()` sub-interfaces (`staging/src/k8s.io/cloud-provider/cloud.go:43-69`).

**Webhooks:** External admission webhooks via `Webhook.Dispatch()` with match conditions evaluated via CEL expressions (`staging/src/k8s.io/apiserver/pkg/admission/plugin/webhook/generic/webhook.go:357-376`).

### 3. How does the system prevent a misbehaving plugin from bringing down the host?

**Timeout-based readiness:** `WaitForReady()` waits up to 10 seconds for plugin readiness (`staging/src/k8s.io/apiserver/pkg/admission/handler.go:64-78`). If a plugin doesn't become ready, it returns `false` and the request fails.

**Chain fail-fast:** The admission chain returns immediately on first error (`staging/src/k8s.io/apiserver/pkg/admission/chain.go:31-44` for Admit, `chain.go:47-60` for Validate), preventing one plugin from blocking others.

**Read-only interfaces:** Plugins receive read-only cluster state via `SharedLister` (`pkg/scheduler/framework/runtime/framework.go:60`) and `snapshotSharedLister`. They cannot directly mutate cluster state except through defined extension point APIs.

**Dependency injection isolation:** Plugins declare dependencies via `Wants*` interfaces (`WantsExternalKubeClientSet`, `WantsExternalKubeInformerFactory`, etc.) and receive interfaces, not implementations (`staging/src/k8s.io/apiserver/pkg/admission/initializer/initializer.go:82-99`). This limits what plugins can access.

**Webhook remote isolation:** External webhooks run as HTTP calls to remote services, providing process isolation. The `clientManager` manages webhook client creation and the `dispatcher` handles timeout/cancellation context (`staging/src/k8s.io/apiserver/pkg/admission/plugin/webhook/generic/webhook.go:74-77`).

**Limitation:** In-tree scheduler and admission plugins run in the same process as the host. A bug in a scheduler plugin can crash the scheduler process. Process-level isolation is only available via external webhooks.

### 4. How are plugin APIs versioned to prevent breakage on upgrade?

**No explicit API versioning mechanism found.** Plugin API contracts are defined by Go interfaces in the source code. The `Factory` function signature `func(config io.Reader) (Interface, error)` (`staging/src/k8s.io/apiserver/pkg/admission/plugins.go:35`) provides no version parameter.

**Mitigation via configuration:** Plugins receive configuration as an `io.Reader` and decode into versioned configuration structs. The scheduler uses `runtime.Object` for plugin configuration with versioned KubeSchedulerConfiguration (`pkg/scheduler/framework/runtime/registry.go:31`). This allows configuration schema evolution without changing the plugin interface.

**Staged component evolution:** Kubernetes uses `staging/src/k8s.io/` for API packages that live outside the main repo. This allows the `k8s.io/apiserver`, `k8s.io/kube-scheduler` packages to evolve independently.

**Match conditions CEL versioning:** Webhook match conditions use CEL expressions which are versioned as part of the AdmissionWebhook configuration (`staging/src/k8s.io/apiserver/pkg/admission/plugin/webhook/generic/webhook.go:326-344`).

**Gap:** Unlike some plugin systems (e.g., CSI spec versioning), Kubernetes plugin interfaces lack explicit semantic versioning. Breaking changes to plugin interfaces are managed through the Kubernetes deprecation policy rather than explicit versioning.

### 5. What debugging and observability exists for plugin execution?

**Logging:** `klog` is used throughout with structured logging. `klog.V(1).InfoS` logs plugin registration (`staging/src/k8s.io/apiserver/pkg/admission/plugins.go:83`). `klog.Warningf` logs disabled providers (`staging/src/k8s.io/cloud-provider/plugins.go:89`).

**Metrics:** `admissionmetrics.Metrics.ObserveMatchConditionExclusion()` records webhook match exclusions (`staging/src/k8s.io/apiserver/pkg/admission/plugin/webhook/generic/webhook.go:340`). Scheduler metrics recorded via `metrics.MetricAsyncRecorder` (`pkg/scheduler/framework/runtime/framework.go:97`).

**Readiness checking:** `WaitForReady()` with 10-second timeout provides health checking (`staging/src/k8s.io/apiserver/pkg/admission/handler.go:64-78`). `SetReadyFunc()` allows plugins to report when their caches are synced.

**Informational status messages:** Scheduler `Status` struct with `Code`, `Message`, and `Reasons` fields allows plugins to return detailed failure information (`staging/src/k8s.io/kube-scheduler/framework/interface.go:42-84`). For example, `Unschedulable` vs `UnschedulableAndUnresolvable` codes indicate different failure modes.

**Gap:** No unified plugin tracing or profiling infrastructure. Debugging requires component-specific knowledge. Scheduler plugins can use `klog` and context cancellation, but there's no standardized plugin logging API.

## Architectural Decisions

1. **Registry-based static registration** — Plugins register at init time via global registry maps. This is simple and compile-time safe but requires recompilation to add/remove plugins. Chosen for core Kubernetes components where dynamic loading is not required.

2. **Interface-based extension contracts** — All plugin types define explicit Go interfaces (`Interface`, `MutationInterface`, `ValidationInterface`, etc.). This provides type safety and clear contracts but creates a hard dependency on interface definitions.

3. **Chain-of-responsibility for admission** — Admission uses a handler chain that short-circuits on error. This is simple but means ordering matters and all plugins must be loaded even if early ones reject requests.

4. **Dependency injection via Wants* interfaces** — Plugins declare dependencies via optional interfaces that the initializer checks and populates. This is explicit and testable but requires boilerplate in each plugin.

5. **External webhooks for out-of-tree plugins** — Kubernetes chose HTTP webhooks over a binary plugin API (like CSI). This provides process isolation and polyglot support but adds network latency and requires webhook configuration management.

6. **Scheduler framework with Handle abstraction** — Scheduler plugins receive a `Handle` interface providing access to shared components. This provides good ergonomics but plugins are tied to scheduler lifecycle.

## Notable Patterns

**Factory pattern with registry** — `Factory func(config io.Reader) (Interface, error)` used consistently across admission (`plugins.go:31-35`), cloud provider (`plugins.go:32`), and scheduler (`registry.go:31`).

**Optional interface registration** — `WantsExternalKubeClientSet`, `WantsExternalKubeInformerFactory`, etc. allow plugins to opt into dependencies without requiring all plugins to implement them (`initializer.go:82-99`).

**Plugin slice per extension point** — Scheduler framework stores each plugin type in its own slice (`framework.go:64-76`), allowing the framework to iterate extension points generically (`getExtensionPoints()` at `framework.go:125-142`).

**Reinvocation policy** — Admission supports re-invocation where a plugin can request the chain be re-run after mutations (`interfaces.go:75-120`). This enables defaulting plugins to work correctly after mutating webhooks.

**Event-driven scheduler rescheduling** — Scheduler plugins implementing `EnqueueExtensions` register cluster events that should trigger pod re-evaluation (`interface.go:480-494`). This is more efficient than polling.

## Tradeoffs

| Decision | Benefit | Cost |
|----------|---------|------|
| Static in-tree plugins | Type safety, fast invocation, no serialization | Requires recompile for changes |
| Same-process scheduler plugins | Low latency, shared memory access | Plugin crash can crash scheduler |
| External webhook isolation | Process isolation, polyglot support | Network latency, configuration complexity |
| Go interface contracts | Type safety, IDE support | Hard coupling to Kubernetes types |
| Chain fail-fast | Simple mental model, early exit | Cannot aggregate all failures |
| No explicit plugin API versioning | Simplicity | Risk of silent breaking changes |

## Failure Modes / Edge Cases

1. **Plugin initialization deadlock** — If a plugin's `Initialize()` blocks indefinitely, the entire admission chain stalls. No watchdog timeout exists beyond `WaitForReady()`.

2. **Cache sync failure** — Plugins relying on informer caches may fail silently if caches don't sync. `HasSynced()` checks exist but are not enforced universally.

3. **Configuration parsing errors** — Malformed plugin configuration causes fatal errors at startup (e.g., `klog.Fatalf` on double registration at `plugins.go:77`).

4. **Webhook timeout during critical operations** — External webhooks have configurable timeouts. Long-running webhooks during admission can delay or timeout requests.

5. **Scheduler plugin infinite loops** — A malicious or buggy `Score()` or `Filter()` plugin could loop indefinitely. Context cancellation is the only backstop.

6. **Version skew between API server and scheduler** — If scheduler plugins are compiled against a different API surface than the running API server, subtle bugs may emerge.

7. **Cloud provider initialization race** — `Initialize()` may spawn goroutines (`cloud.go:47`). If stop channel closes before cleanup, goroutines leak.

## Future Considerations

1. **Plugin API versioning spec** — An explicit versioning scheme for plugin interfaces would prevent silent breaking changes and enable more aggressive interface evolution.

2. **Process isolation for scheduler plugins** — WASM or process-based plugin isolation would prevent buggy plugins from crashing the scheduler.

3. **Unified plugin observability** — A common plugin telemetry interface would enable consistent tracing, logging, and metrics across all plugin types.

4. **Dynamic plugin loading** — Currently plugins are statically linked. Dynamic loading (like CSI gRPC) would enable true plugin independence without recompiling Kubernetes.

5. **Multi-plugin coordination API** — Plugins currently operate independently. An API for plugins to coordinate (share state, communicate) would enable more sophisticated scheduling strategies.

## Questions / Gaps

1. **No evidence found** of a formal plugin sandbox or security model beyond Go interface capabilities. Plugin capabilities are limited by what interfaces they implement, not by a security sandbox.

2. **No evidence found** of a plugin upgrade or migration mechanism. Plugin configurations must be manually updated when plugin interfaces change.

3. **No evidence found** of a standardized plugin testing framework. Each plugin type has its own testing conventions.

4. **No evidence found** of a plugin registry service (like an OCI registry for container images) for distributing out-of-tree plugins.

5. **Webhook match conditions** use CEL but the evaluation engine is embedded in the API server. There's no external CEL evaluation API for testing.

---

*Generated by `dimensions/13-extensibility-plugin-architecture.md` against `kubernetes`.*
