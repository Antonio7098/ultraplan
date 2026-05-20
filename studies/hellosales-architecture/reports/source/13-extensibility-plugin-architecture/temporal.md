# Source Analysis: temporal

## Extensibility & Plugin Architecture

### Source Info

| Field | Value |
|-------|-------|
| Name | temporal |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/temporal` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

Temporal is a durable execution platform that implements extensibility through a **composition-based architecture** rather than a traditional plugin system. Extensibility is achieved through:

1. **Worker Component Interfaces** — Go interfaces that define lifecycle hooks for registering workflows, activities, and per-namespace workers
2. **fx Dependency Injection** — Uber's fx DI framework composes modular service components with lifecycle hooks
3. **Nexus Endpoints** — External service integration via a registry pattern with long-polling cache
4. **CHASM State Machines** — Hierarchical state machines for callback and nexus operation execution
5. **SQL Plugin Interface** — Database driver abstraction for MySQL, PostgreSQL, SQLite

The system uses goroutine-based isolation (via `goro.Handle`) rather than process or WASM isolation. Error isolation is achieved through retry policies, backoff retriers, and an `OnFatalError` callback mechanism.

## Rating

**6/10** — Basic implementation with gaps

Temporal has a mature composition system for its own internal components, but lacks:
- **No external plugin loading** — No mechanism to load third-party plugins at runtime
- **No plugin verification/signing** — No security model for plugin validation
- **Process isolation** — Plugins run in-process via goroutines, not isolated processes/WASM
- **Formal versioning contract** — SDK evolution is the only versioning mechanism; no explicit API contract versioning

---

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| WorkerComponent interface | `WorkerComponent` interface with `RegisterWorkflow`, `RegisterActivities`, `DedicatedWorkerOptions` methods | `service/worker/common/interface.go:12-25` |
| PerNSWorkerComponent interface | `PerNSWorkerComponent` interface with `Register` method returning cleanup func | `service/worker/common/interface.go:36-45` |
| fx module composition | `worker.Module` composes `migration`, `deletenamespace`, `scheduler`, `batcher`, `workerdeployment` modules | `service/worker/fx.go:44-106` |
| Lifecycle hooks | `PerNamespaceWorkerManager.Start()` and `Stop()` methods with membership and namespace callbacks | `service/worker/pernamespaceworker.go:133-161` |
| Error isolation via OnFatalError | `onFatalError` handler distinguishes `NamespaceNotFound` (retryable) from other errors (non-retryable) | `service/worker/pernamespaceworker.go:511-525` |
| goro.Handle for goroutine isolation | `Handle` struct wraps context, cancel, done channel, and error storage for cooperative cancellation | `common/goro/goro.go:8-71` |
| EndpointRegistry interface | `EndpointRegistry` interface with `GetByName`, `GetByID`, `StartLifecycle`, `StopLifecycle` | `common/nexus/endpoint_registry.go:39-46` |
| Nexus endpoint long-polling cache | `refreshEndpointsLoop` with backoff retry policy and persistence fallback | `common/nexus/endpoint_registry.go:224-268` |
| SQL Plugin interface | `Plugin` interface with `CreateDB` and `GetVisibilityQueryConverter` methods | `common/persistence/sql/sqlplugin/interfaces.go:31-36` |
| Retry policy with backoff | `backoff.NewRetrier` with exponential backoff for worker start failures | `service/worker/pernamespaceworker.go:232` |
| Rate limiting for worker startup | `startLimiter` quotas.RateLimiter prevents worker start thundering herd | `service/worker/pernamespaceworker.go:123` |
| Per-namespace worker allocation | `getWorkerAllocation` uses consistent hashing to distribute workers across hosts | `service/worker/pernamespaceworker.go:255-281` |
| Component registration via fx group | `perNamespaceWorkerComponent` group collects `PerNSWorkerComponent` implementations | `service/worker/fx.go:202` |
| Worker versioning | `WorkerDeploymentVersion` with `VersioningBehavior` in `RegisterOptions` | `common/worker_versioning/worker_versioning.go:33-62` |
| Data converter extensibility | `sdk.PreferProtoDataConverter` for protobuf-first serialization | `common/sdk/converter.go:7-18` |
| CHASM Module | `chasm.Module` provides state machine registration | `temporal/fx.go:149` |
| Nexus operations component | `nexusoperations.Module` with executor registration | `components/nexusoperations/fx.go:8-19` |
| Callbacks component | `callbacks.Module` with HTTP caller provider | `components/callbacks/fx.go:17-24` |
| Cleanup on worker stop | `stopWorkerLocked` calls cleanup functions registered by components | `service/worker/pernamespaceworker.go:551-565` |
| Stale refresh goroutine handling | `args.ns != w.ns` check discards stale refresh calls | `service/worker/pernamespaceworker.go:417-420` |

---

## Answers to Dimension Questions

### 1. How are plugins discovered, loaded, and verified?

**Discovery** happens through fx dependency injection groups. The `perNamespaceWorkerComponent` group tag (`service/worker/fx.go:202`) collects all `PerNSWorkerComponent` implementations via `fx.Provide`. There is no explicit plugin discovery mechanism — all components are compiled into the binary.

**Loading** is implicit via fx module composition at startup. `worker.Module` (`service/worker/fx.go:44-106`) composes sub-modules like `migration.Module`, `deletenamespace.Module`, `scheduler.Module`, `batcher.Module`, `workerdeployment.Module`. Each module's `fx.Provide` registers constructors that fx assembles.

**Verification** — No evidence found of runtime verification, signing, or validation of plugin integrity. Components trust injected dependencies.

### 2. What extension points exist for custom business logic?

- **WorkerComponent** (`service/worker/common/interface.go:12-25`) — For registering workflows and activities on dedicated workers
- **PerNSWorkerComponent** (`service/worker/common/interface.go:36-45`) — For per-namespace workers with cleanup callbacks
- **Nexus Endpoints** — External HTTP integrations via `EndpointRegistry` (`common/nexus/endpoint_registry.go:39-46`)
- **CHASM State Machines** — Custom executors for callback and nexus operation handling via `RegisterExecutor` (`components/nexusoperations/fx.go:14`, `components/callbacks/fx.go:23`)
- **DataConverter** — Custom serialization via `sdkclient.Options.DataConverter` (`service/worker/pernamespaceworker.go:462`)
- **RetryPolicy** — Activity/workflow retry configuration via SDK options

### 3. How does the system prevent a misbehaving plugin from bringing down the host?

**Isolation mechanisms:**

1. **Goroutine-based isolation** via `goro.Handle` (`common/goro/goro.go:8-71`). Each background task runs in its own goroutine with a context that can be cancelled. The `Handle` struct provides `Done()` channel and `Cancel()` method for graceful shutdown.

2. **OnFatalError callback** (`service/worker/pernamespaceworker.go:511-525`) — When the SDK worker encounters a fatal error:
   - `NamespaceNotFound` errors trigger retry via `w.handleError(err)`
   - Other fatal errors (e.g., `InvalidArgument`, `ClientVersionNotSupported`) log an error and **do not restart** the worker
   
3. **Backoff retrier** (`service/worker/pernamespaceworker.go:232`) — Exponential backoff prevents crash-loops when restarting workers

4. **Rate limiting** (`service/worker/pernamespaceworker.go:123`) — `quotas.NewDefaultOutgoingRateLimiter` throttles worker startup to prevent thundering herd

5. **Per-namespace worker isolation** — Each namespace's worker is independent; a crash in one namespace's worker doesn't directly affect others

6. **Cleanup functions** — Component `Register` method returns optional cleanup func called on worker stop (`service/worker/pernamespaceworker.go:495-498`)

**Gap:** No process isolation (no WASM, no separate processes). A Go panic in a plugin could crash the entire process.

### 4. How are plugin APIs versioned to prevent breakage on upgrade?

**SDK versioning** — Temporal SDK uses semantic versioning via Go module versioning. The server asserts `ClientVersionNotSupported` errors when client/server versions are incompatible (`service/worker/pernamespaceworker.go:522`).

**Protobuf APIs** — Internal APIs use protobuf message versioning. Proto definitions in `api/` directory use proto3 with explicit `go_package` options. Protobuf's unknown field tolerance (enabled via `converter.NewProtoJSONPayloadConverterWithOptions(...AllowUnknownFields: true)` at `common/sdk/converter.go:15`) provides forward compatibility.

**Workflow type registration** — `RegisterWorkflowWithOptions` accepts explicit name, allowing versioning through naming (e.g., `BatchWFTypeName` vs `BatchWFTypeProtobufName` at `service/worker/batcher/fx.go:19-21`).

**No explicit plugin API versioning contract found** — No `PluginV2`, `ExtensionV1` interface versioning pattern observed.

### 5. What debugging and observability exists for plugin execution?

- **Metrics** — `workerMetricsEmitter` (`service/matching/workers/worker_metrics_emitter.go:12-20`) derives metrics from worker heartbeats. `MatchingEnableWorkerPluginMetrics` dynamic config controls export (`common/dynamicconfig/constants.go:1500`).

- **Worker heartbeat** — Workers emit periodic heartbeats with state, allowing server-side tracking (`service/matching/workers/registry_impl.go:382`).

- **Logging** — Structured logging via `log.Logger` with component tags (`tag.ComponentPerNSWorkerManager`, `tag.WorkflowNamespace`). Logger is injected into components via fx (`service/worker/fx.go`).

- **goro.Handle error storage** — Goroutine errors stored in `Handle.err` atomic value, retrievable via `Err()` method (`common/goro/goro.go:62-71`).

- **Namespace and membership callbacks** — State change callbacks provide observability into worker lifecycle (`service/worker/pernamespaceworker.go:151`, `service/worker/pernamespaceworker.go:153`).

- **No distributed tracing for plugin execution** — No evidence of trace context propagation into plugin callbacks.

---

## Architectural Decisions

### 1. Composition over Plugin Loading
Temporal chooses Go dependency injection (fx) over dynamic plugin loading. Components are compiled into the binary and wired via `fx.Provide`/`fx.Invoke`. This provides compile-time safety but prevents runtime plugin addition.

### 2. Goroutine-based Isolation (Not Process/WASM)
Background work uses `goro.Handle` for cooperative goroutine lifecycle management. Cancellation is context-based. This is lightweight but means a Go panic in a plugin can crash the process.

### 3. Registry Pattern for Nexus Endpoints
External service integrations use `EndpointRegistry` with long-polling cache backed by matching service. Endpoints are lazily loaded and kept current via background refresh loop with persistence fallback.

### 4. Per-Namespace Worker Model
Workers are partitioned by namespace with consistent hashing for allocation. This provides fault isolation between tenants but shares the process.

### 5. SQL Plugin Architecture
Database drivers implement the `Plugin` interface (`common/persistence/sql/sqlplugin/interfaces.go:32`) with `CreateDB` factory method. This allows MySQL, PostgreSQL, SQLite drivers to be selected via configuration.

---

## Notable Patterns

### Worker Component Registration
```go
// From service/worker/batcher/fx.go:66-82
func (s *workerComponent) DedicatedWorkerOptions(ns *namespace.Namespace) *workercommon.PerNSDedicatedWorkerOptions {
    return &workercommon.PerNSDedicatedWorkerOptions{
        Enabled: s.enabledFeature(ns.Name().String()),
    }
}

func (s *workerComponent) Register(registry sdkworker.Registry, ns *namespace.Namespace, _ workercommon.RegistrationDetails) func() {
    registry.RegisterWorkflowWithOptions(BatchWorkflowProtobuf, workflow.RegisterOptions{Name: BatchWFTypeName})
    registry.RegisterActivity(s.activities(ns.Name(), ns.ID()))
    return nil  // cleanup func
}
```

### Lifecycle Hook via fx
```go
// From service/worker/fx.go:190-192
func ServiceLifetimeHooks(lc fx.Lifecycle, svc *Service) {
    lc.Append(fx.StartStopHook(svc.Start, svc.Stop))
}
```

### Goroutine Handle for Background Tasks
```go
// From common/nexus/endpoint_registry.go:128-136
newReady := &dataReady{
    refresh: goro.NewHandle(backgroundCtx),
    ready:   make(chan struct{}),
}
if r.dataReady.CompareAndSwap(oldReady, newReady) {
    newReady.refresh.Go(func(ctx context.Context) error {
        return r.refreshEndpointsLoop(ctx, newReady)
    })
}
```

### Error Classification for Retry
```go
// From service/worker/pernamespaceworker.go:515-524
switch err.(type) {
case *serviceerror.NamespaceNotFound:
    w.handleError(err)  // retry
default:
    w.logger.Error("sdk worker got non-retryable error, not restarting", tag.Error(err))
}
```

---

## Tradeoffs

| Decision | Benefit | Cost |
|----------|---------|------|
| fx composition | Compile-time safety, clear dependency graph | No runtime plugin loading |
| Goroutine isolation | Low overhead, easy Go integration | No fault isolation; panic can crash process |
| Per-namespace workers | Tenant isolation, distributed allocation | Cross-namespace coordination complexity |
| Long-polling endpoint cache | Low latency reads without direct DB load | Cache staleness window, memory usage |
| Protobuf serialization | Forward compatibility, fast encoding | Proto schema management overhead |

---

## Failure Modes / Edge Cases

1. **Worker crash loop** — If `NamespaceNotFound` is repeatedly returned, `handleError` with exponential backoff prevents tight crash loop but doesn't provide circuit breaking (`service/worker/pernamespaceworker.go:325-363`).

2. **Stale refresh goroutines** — When namespace is updated, old refresh goroutines may run with stale state. The check `args.ns != w.ns` discards stale calls (`service/worker/pernamespaceworker.go:417-420`).

3. **Rate limiter exhaustion** — If `startLimiter.Reserve().Delay()` returns non-zero, worker startup is delayed with `errRetryAfter(delay)` (`service/worker/pernamespaceworker.go:428-432`).

4. **Missing cleanup on component crash** — If component's `Register` panics before returning cleanup func, cleanup may not be called. `stopWorkerLocked` iterates `w.cleanup` which may be nil (`service/worker/pernamespaceworker.go:551-565`).

5. **Cache inconsistency** — Nexus endpoint registry relies on long-polling which has a window of staleness. `refreshOnRead` dynamic config attempts mitigation but doesn't eliminate it (`common/nexus/endpoint_registry.go:155-161`).

6. **No plugin verification** — Malicious or misconfigured component can inject bad dependencies via fx since there's no signature verification.

---

## Future Considerations

1. **Process isolation for plugins** — Consider WASM or separate process model for third-party plugin isolation
2. **Plugin API contract versioning** — Formalize extension interface versioning (e.g., `WorkerComponentV2`) for API stability
3. **Circuit breaking** — Add circuit breaker for repeated plugin failures beyond exponential backoff
4. **Distributed tracing** — Propagate trace context into plugin execution for observability
5. **Runtime plugin loading** — Consider optional dynamic plugin loading for third-party extensions

---

## Questions / Gaps

1. **No external plugin loading mechanism** — Temporal has no mechanism to load plugins from external packages at runtime. All extensions must be compiled into the binary. Is this by design or a roadmap item?

2. **No plugin signing/verification** — How does Temporal intend to handle untrusted third-party plugins? The current model trusts all fx-injected components.

3. **Plugin API stability** — There's no documented API contract for external plugin authors. The `WorkerComponent` and `PerNSWorkerComponent` interfaces may change without notice.

4. **Resource cleanup on panic** — If a component's `Register` panics, the cleanup function is never registered and may not run. Are there any safeguards?

5. **No observability into plugin execution latency** — While worker heartbeat metrics exist, there's no per-plugin latency breakdown. How should plugin performance be debugged in production?

---

*Generated by `dimensions/13-extensibility-plugin-architecture.md` against `temporal`.*