# Source Analysis: kubernetes

## Dependency Injection & Composition

### Source Info

| Field | Value |
|-------|-------|
| Name | kubernetes |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/kubernetes` |
| Language / Stack | Go |
| Analyzed | 2026-05-19 |

## Summary

Kubernetes uses **manual constructor injection** across its control plane components (kube-apiserver, kube-controller-manager, kube-scheduler, kubelet). Each binary has a dedicated "app" package that composes dependencies through structured Config objects, with a two-phase initialization pattern: (1) options parsing and config creation, (2) config completion and server creation. No external DI container is used. Lifecycle is managed through PostStartHook/PreShutdownHook callbacks registered on the generic apiserver server object. Controllers use a descriptor-based registration system with explicit ordering guarantees (e.g., ServiceAccountTokenController always starts first).

## Rating

**8/10** — Excellent DI implementation with minor gaps. The pattern is consistent, well-documented in code, and supports testing through dependency injection seams. However, global feature gates and default mutable state introduce implicit coupling that complicates fully isolated unit testing.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Config struct pattern | `Config` struct holds all dependencies for kube-apiserver | `cmd/kube-apiserver/app/config.go:33-41` |
| CompletedConfig pattern | `CompletedConfig` embeds private pointer preventing external instantiation | `cmd/kube-apiserver/app/config.go:56-59` |
| Constructor injection | All controllers receive `ControllerContext` with typed dependencies | `cmd/kube-controller-manager/app/controllermanager.go:462-498` |
| Controller descriptor | `ControllerDescriptor` wraps controller constructors with metadata | `cmd/kube-controller-manager/app/controller_descriptor.go:50-57` |
| Dependency struct | `Dependencies` struct for kubelet with explicit injected fields | `pkg/kubelet/kubelet.go:313-345` |
| Options pattern | `ServerRunOptions` embeds embedded options for composition | `cmd/kube-apiserver/app/options/options.go:39-43` |
| PostStartHook | Hook registration for bootstrap-controller | `pkg/controlplane/instance.go:365-368` |
| PreShutdownHook | Hook registration for stopping kubernetes-service-controller | `pkg/controlplane/instance.go:369-372` |
| Init ordering | ServiceAccountTokenController always starts first | `cmd/kube-controller-manager/app/controllermanager.go:666-672` |
| Test server | TestServer provides isolated server instantiation for tests | `cmd/kube-controller-manager/app/testing/testserver.go:54-59` |

## Answers to Dimension Questions

### 1. How does the project wire its dependency graph without global state or init() hell?

Kubernetes avoids a central DI container by using **manual composition at the binary level**. Each binary (kube-apiserver, kube-controller-manager, kubelet) has a dedicated `cmd/<binary>/app/` package that constructs dependencies in a specific order:

1. `NewServerRunOptions()` / `NewKubeControllerManagerOptions()` creates an options struct
2. `Config()` method on options creates the raw `Config` struct
3. `Complete()` method returns `CompletedConfig` (with private pointer to prevent external construction)
4. `Run()` or `New()` method on CompletedConfig creates and starts the server

Example from kube-apiserver (`cmd/kube-apiserver/app/server.go:148-173`):
```go
config, err := NewConfig(opts)          // phase 1: raw config
completed, err := config.Complete()    // phase 2: completed config
server, err := CreateServerChain(completed) // phase 3: server chain
prepared, err := server.PrepareRun()
return prepared.Run(ctx)
```

The controller manager uses `ControllerDescriptor` map (`cmd/kube-controller-manager/app/controller_descriptor.go:138-233`) with explicit `NewControllerDescriptors()` function that registers all controllers with their constructors.

### 2. Are interfaces defined by consumers or producers?

**Interfaces are defined by consumers** (in most cases). The pattern observed is:

- In kube-apiserver, `RESTStorageProvider` interface is defined in the controlplane package and implemented by each API group (`pkg/controlplane/instance.go:392-450`)
- In the controller manager, `Controller` interface is defined in the app package (`cmd/kube-controller-manager/app/controller_descriptor.go:35-44`) and implemented by downstream packages
- In kubelet, `Dependencies` struct (`pkg/kubelet/kubelet.go:313-345`) uses concrete types but accepts interfaces where they matter (e.g., `CAdvisorInterface`, `ContainerManager`, `VolumePlugins`)

The `ControllerDescriptor` at `cmd/kube-controller-manager/app/controller_descriptor.go:46-48` defines:
```go
type ControllerConstructor func(ctx context.Context, controllerContext ControllerContext, controllerName string) (Controller, error)
```

### 3. How is startup ordering managed when services depend on each other?

Startup ordering is managed through several mechanisms:

1. **Explicit ordering in descriptor map**: ServiceAccountTokenController is registered first and started first (`cmd/kube-controller-manager/app/controllermanager.go:666-672`)
2. **Controller start jitter**: Controllers start with jitter to avoid thundering herd (`cmd/kube-controller-manager/app/controllermanager.go:762`)
3. **PostStartHook/PreShutdownHook**: Lifecycle hooks registered on genericapiserver (`pkg/controlplane/apiserver/server.go:144-299`) execute in registration order
4. **Leader election callbacks**: When leader election is enabled, `OnStartedLeading` callback triggers controller startup (`cmd/kube-controller-manager/app/controllermanager.go:401-411`)
5. **Informer synchronization**: `cc.InformerFactory.WaitForCacheSync(ctx.Done())` called before scheduler starts (`cmd/kube-scheduler/app/server.go:287`)

The controller manager's `CreateControllerContext` (`cmd/kube-controller-manager/app/controllermanager.go:530-612`) waits for apiserver health before initializing informers.

### 4. What happens during graceful shutdown — is ordering guaranteed?

Graceful shutdown has **partial ordering guarantees**:

1. `RunControllers` (`cmd/kube-controller-manager/app/controllermanager.go:710-806`) waits for context cancellation
2. On shutdown timeout, controllers still running are logged but no forced termination order is enforced
3. The scheduler's `Run()` blocks until context is cancelled (`cmd/kube-scheduler/app/server.go:174`)
4. Leader election callbacks (`OnStoppedLeading`) handle loss of leadership but don't guarantee clean controller shutdown order

Evidence at `cmd/kube-controller-manager/app/controllermanager.go:790-805`:
```go
select {
case <-terminatedCh:
    return true
case <-shutdownCh:
    runningControllersLock.Lock()
    running := sets.List(runningControllers)
    runningControllersLock.Unlock()
    logger.Info("Controller shutdown timeout reached", "timeout", shutdownTimeout, "runningControllers", running)
    return false  // timeout reached, no forced termination ordering
}
```

For kube-apiserver, PreShutdownHooks run in order but only for the API server itself, not for dependent systems like etcd.

### 5. Can individual services be tested without booting the entire system?

**Yes, but with limitations**:

1. **Test server helpers**: `StartTestServer()` in `cmd/kube-controller-manager/app/testing/testserver.go:67-191` provides isolated server instantiation with custom flags
2. **UnsecuredDependencies**: kubelet provides `UnsecuredDependencies()` (`cmd/kubelet/app/server.go:500-536`) that returns dependencies without starting background processes
3. **Controller testing**: `ControllerDescriptor.BuildController()` (`cmd/kube-controller-manager/app/controller_descriptor.go:88-103`) allows constructing individual controllers with mocked context
4. **Dependency injection seams**: `Dependencies` struct allows substituting concrete implementations for testing

However, global state through `utilfeature.DefaultFeatureGate` and `utilfeature.DefaultMutableFeatureGate` creates implicit coupling. Tests must use `featuregatetesting.SetFeatureGatesDuringTest()` to avoid contention in parallel tests (`cmd/kube-controller-manager/app/testing/testserver.go:132`).

## Architectural Decisions

1. **No external DI framework**: Kubernetes uses manual composition rather than a framework like wire or fx. This was a deliberate choice to keep the codebase portable and avoid external tool dependencies.

2. **Two-phase config completion**: The pattern of `Config` → `CompletedConfig` → `Server` ensures all required fields are set before use. The private pointer prevents external instantiation.

3. **Descriptor-based controller registration**: `ControllerDescriptor` map allows metadata (feature gates, aliases, special handling flags) to be associated with controller constructors separately from the constructors themselves.

4. **SharedInformerFactory as universal dependency**: All components receive `clientgoinformers.SharedInformerFactory` as their primary access pattern for API objects, reducing the surface area of the dependency graph.

## Notable Patterns

1. **PostStartHook/PreShutdownHook**: Lifecycle hooks on `genericapiserver.GenericAPIServer` (`pkg/controlplane/apiserver/server.go:144-299`) allow deferred startup and cleanup logic to be registered during configuration.

2. **Delegation chain**: kube-apiserver uses `DelegationTarget` pattern (`pkg/controlplane/instance.go:317-389`) where APIExtensions → KubeAPIServer → Aggregator form a delegation chain, each wrapping the next.

3. **ControllerContext struct**: All controller dependencies are bundled in `ControllerContext` (`cmd/kube-controller-manager/app/controllermanager.go:462-498`) providing a clean interface for controller constructors.

4. **Service resolver pattern**: kube-apiserver uses `webhook.ServiceResolver` interface with multiple implementations (EndpointServiceResolver, ClusterIPServiceResolver, LoopbackServiceResolver) for service discovery.

## Tradeoffs

1. **Explicitness over magic**: Manual wiring requires more boilerplate but is explicit about what dependencies exist and how they're constructed.

2. **Global feature gates**: `utilfeature.DefaultMutableFeatureGate` is a global singleton that complicates testing. Tests must carefully manage feature gate state to avoid interference.

3. **Limited shutdown ordering**: No enforced ordering for controller shutdown. When timeout is reached, running controllers are logged but not forcibly terminated in a specific order.

4. **No constructor injection for small objects**: Many intermediate objects are created inline rather than injected, making it harder to test individual functions in isolation.

## Failure Modes / Edge Cases

1. **Circular dependency risk**: The delegation chain pattern could create circular dependencies if not carefully structured. The `DelegationTarget` interface breaks cycles.

2. **Feature gate race conditions**: Global feature gates with `SetFromMap` can race if multiple components call this concurrently during startup.

3. **Informer sync failures**: If `WaitForCacheSync` fails, controllers may start with stale data. The scheduler handles this explicitly (`cmd/kube-scheduler/app/server.go:286-291`).

4. **Config completion panics**: `Complete()` methods may panic if required fields are unset (e.g., `kubeletclient.KubeletClientConfig{}` check at `pkg/controlplane/instance.go:318-320`).

5. **Service account token dependency**: The explicit ordering for ServiceAccountTokenController exists because other controllers depend on SA tokens existing. If this controller fails, others cannot function.

## Future Considerations

1. The `Dependencies` struct in kubelet is explicitly called "temporary" (`pkg/kubelet/kubelet.go:310-312`) while they "figure out a more comprehensive dependency injection story." This indicates awareness that the current pattern is not final.

2. The move to staging packages (`staging/src/k8s.io/`) for `k8s.io/*` imports suggests ongoing refactoring toward cleaner interface boundaries.

3. Coordinated leader election (feature gated) adds complexity to startup ordering that may need further refinement.

## Questions / Gaps

1. **No evidence found** for constructor injection using interfaces for all dependencies — many places still use concrete types where interfaces could be used.

2. **No evidence found** for a composition root that wires all dependencies in a single function — each binary has its own composition logic spread across multiple files.

3. The global `utilfeature.DefaultMutableFeatureGate` is modified by multiple components during startup without clear synchronization, potentially causing race conditions in tests.

---

Generated by `dimensions/02-dependency-injection-composition.md` against `kubernetes`.