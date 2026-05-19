# Source Analysis: milvus

## Dependency Injection & Composition

### Source Info

| Field | Value |
|-------|-------|
| Name | milvus |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/milvus` |
| Language / Stack | Go (primary), C++ (internal/core/), Rust (tantivy) |
| Analyzed | 2026-05-19 |

## Summary

Milvus implements **manual constructor injection** with a layered composition root pattern. There is no DI container; wiring is done in `cmd/roles/roles.go` via `MilvusRoles.Run()` which orchestrates component creation through factory functions. Components follow a strict `Component` interface (Init/Start/Stop/Register) and the coordinator/node split determines lifecycle ownership. MixCoord is the unified coordinator that owns RootCoord, DataCoord, QueryCoord, and StreamingCoord, composing them via setter injection after construction.

## Rating

**7/10** — Good implementation with minor issues. The architecture is sound with clear separation between coordinators and nodes, constructor injection throughout, and parallel initialization of independent services. However, the lack of a formal DI container means wiring complexity lives in application code, and testing seams require specific build tags (`-tags dynamic,test -gcflags="all=-N -l"`). The `paramtable.Get()` global is a significant global state hotspot that undermines the otherwise clean composition model.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Composition Root | `MilvusRoles.Run()` orchestrates all component creation and startup | `cmd/roles/roles.go:369-632` |
| Component Interface | `Component` interface defines Init/Start/Stop/Register lifecycle | `internal/types/types.go:54-59` |
| Constructor Injection | `NewMixCoord(ctx, factory)` receives factory as constructor arg | `cmd/components/mix_coord.go:41-50` |
| Factory Interface | `dependency.Factory` interface abstracts MQ and storage creation | `internal/util/dependency/factory.go:169-173` |
| Setter Injection | `mixCoordImpl.SetEtcdClient()`, `SetTiKVClient()`, `SetMixCoordClient()` wire dependencies after construction | `internal/coordinator/mix_coord.go:404-420` |
| Parallel Init | DataCoord and QueryCoord init in parallel via errgroup | `internal/coordinator/mix_coord.go:186-215` |
| Shutdown Ordering | Coordinators stopped first, then nodes, then proxy | `cmd/roles/roles.go:593-631` |
| Session/Lease | Session utility manages component registration in etcd | `internal/util/sessionutil/session_util.go:1-150` |
| Active-Standby | `session.SetEnableActiveStandBy(true)` enables coord failover | `internal/coordinator/mix_coord.go:386` |
| Global ParamTable | `paramtable.Get()` is the ubiquitous config singleton | `internal/rootcoord/root_coord.go:125`, `internal/util/dependency/factory.go:51` |

## Answers to Dimension Questions

### 1. How does the project wire its dependency graph without global state or init() hell?

Milvus uses **manual constructor injection** at the composition root (`cmd/roles/roles.go:369`). A `dependency.Factory` interface (`internal/util/dependency/factory.go:169`) abstracts storage (ChunkManager) and message queue (MsgStream) creation. Components receive the factory at construction time (`NewProxy`, `NewMixCoord`, etc.) and use it to create their downstream resources.

The pattern avoids init() hell by:
- Having `MilvusRoles.Run()` explicitly order creation via `runComponent()` which creates, prepares, then runs each component
- Using futures (`conc.Future[component]`) to allow concurrent component startup while maintaining a barrier (`waitForAllComponentsReady`) before declaring the system ready
- Centralizing all wiring in one place (`cmd/roles/roles.go:484-528`)

**However**, the `paramtable.Get()` global (`internal/rootcoord/root_coord.go:125`) is used throughout as a global config singleton, which is a form of global state that bypasses the injection model.

### 2. Are interfaces defined by consumers or producers?

**Producers define interfaces** in `internal/types/types.go`. Each component type (DataNode, RootCoord, Proxy, etc.) has an interface defined in that file (e.g., `RootCoord` at line 138). These interfaces are implemented by the actual component packages and include both the RPC service interface (e.g., `rootcoordpb.RootCoordServer`) and lifecycle methods (`Component`).

The consumer-facing component wrapper (`cmd/components/*.go`) exposes a simplified `component` interface (`Prepare()/Run()/Stop()`) to the composition root, which differs from the internal component interface. This indirection allows the gRPC server layer (`internal/distributed/mixcoord/service.go`) to sit between the composition root and the actual coordinator implementation.

### 3. How is startup ordering managed when services depend on each other?

**Explicit ordering with parallelization where safe.** In `cmd/roles/roles.go:486-521`, MixCoord is started first (it contains the coordinators), then all other components concurrently. Within MixCoord (`internal/coordinator/mix_coord.go:186-215`), RootCoord is initialized and started first, then DataCoord and QueryCoord are initialized in parallel via `errgroup.WithContext` since they are independent of each other but both depend on RootCoord being ready.

The `waitForAllComponentsReady` function (`cmd/roles/roles.go:217-268`) uses `reflect.Select` over a channel set to wait for all futures, with fast-fail on any error. This ensures no component proceeds until all have reported ready.

The session lease mechanism (`internal/util/sessionutil/session_util.go`) provides additional ordering via `ProcessActiveStandBy` — components register in etcd and only become active after the session is established.

### 4. What happens during graceful shutdown — is ordering guaranteed?

**Yes, ordering is guaranteed.** In `cmd/roles/roles.go:593-631`:

1. **Coordinators first** (line 594): `mixCoord.Stop()` is called
2. **Nodes in parallel** (lines 605-620): `streamingNode`, `queryNode`, `dataNode`, `cdc` each stop in their own goroutine, waited on via `stopNodeWG`
3. **Proxy last** (lines 623-626): `proxy.Stop()` is called after all others
4. **Shared resources** (line 629): `kvfactory.CloseEtcdClient()`

The MixCoord `Stop()` itself (`internal/coordinator/mix_coord.go:342-369`) stops sub-coordinators in order: `GracefulStop()` → `queryCoordServer.Stop()` → `datacoordServer.Stop()` → `rootcoordServer.Stop()` → session stop.

A `GracefulStopTimeout` config (`cmd/components/proxy.go:70-71`, `internal/coordinator/mix_coord.go:68-69`) limits how long Stop waits before giving up.

### 5. Can individual services be tested without booting the entire system?

**Partially.** Milvus has extensive unit tests in each package (e.g., `internal/proxy/*_test.go`). Tests require specific build flags (`-tags dynamic,test -gcflags="all=-N -l"`) per `CLAUDE.md:39` because of monkey-patching via mockey. The `dependency.Factory` interface allows test factories (`NewDefaultFactory`, `MockDefaultFactory` in `internal/util/dependency/factory.go:50-67`) to be substituted.

However, the `paramtable.Get()` global means tests often require the real config system to be initialized, which creates coupling. Mock files in `internal/mocks/` are generated via `make generate-mockery-{module}` and can be used for interface-based testing.

Individual coordinators like `rootcoord.NewCore` (`internal/rootcoord/root_coord.go:192`) take a factory, but many internal components reach for `paramtable.Get()` directly rather than receiving config through constructors.

## Architectural Decisions

1. **No DI Container**: Milvus does not use a DI framework (like wire, fx, or dig). Wiring is done manually in `cmd/roles/roles.go`. This keeps dependencies explicit but pushes wiring complexity to application code.

2. **Coordinator/Node Architecture**: Coordinators (rootcoord, datacoord, querycoord) manage metadata; nodes (proxy, datanode, querynode) execute work. This allows MixCoord to bundle all coordinators in a single process for standalone mode while keeping them separable for cluster mode.

3. **Factory Pattern for External Resources**: `dependency.Factory` abstracts MQ type (RocksMQ, Kafka, Pulsar, Woodpecker) and storage (ChunkManager). Selection happens at factory `Init()` time based on config (`internal/util/dependency/factory.go:80-113`).

4. **Active-Standby for Coordinator HA**: Coordinators support active-standby mode via `session.SetEnableActiveStandBy(true)` (`internal/coordinator/mix_coord.go:386`). The `activateFunc` is invoked via `s.session.ProcessActiveStandBy` (`internal/coordinator/mix_coord.go:117-127`).

5. **Session-based Service Discovery**: Components register with etcd via `sessionutil.Session` and discover each other through etcd watches. This replaces static configuration with dynamic service discovery.

## Notable Patterns

- **Setter injection after construction**: `mixCoordImpl.SetEtcdClient()`, `SetTiKVClient()`, `SetMixCoordClient()` are called after `NewMixCoordServer()` returns (`internal/distributed/mixcoord/service.go:151-163`), wiring in externally-created clients.

- **sync.Once for init/start**: Both `initOnce` and `startOnce` prevent double-init/double-start (`internal/coordinator/mix_coord.go:71-72`, `internal/rootcoord/root_coord.go:163-164`).

- **Future-based concurrent startup**: `conc.Go()` creates a future for each component, and `<-sign` in `runComponent` (`cmd/roles/roles.go:145`) ensures `Prepare()` completes before `Run()` begins, while allowing components to start concurrently.

- **errgroup for parallel initialization**: DataCoord and QueryCoord initialize concurrently within MixCoord (`internal/coordinator/mix_coord.go:188-215`).

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| No DI container | Explicit wiring is verbose but transparent; no hidden magic. However, as complexity grows, wiring code in `roles.go` becomes harder to maintain. |
| `paramtable.Get()` global | Convenient access to config everywhere, but creates implicit global state that bypasses DI and makes testing harder. |
| MixCoord bundling | All coordinators in one process simplifies standalone mode but blurs boundaries between RootCoord, DataCoord, QueryCoord. |
| Session-based discovery | Dynamic service discovery enables HA but introduces etcd dependency and lease management complexity. |
| Factory for MQ | Allows runtime MQ selection but `DefaultFactory.Init()` can panic on invalid config (`internal/util/dependency/factory.go:90-91`), making misconfiguration fatal at startup rather than testable. |

## Failure Modes / Edge Cases

1. **Factory panic on bad config**: If MQ type is invalid, `mustSelectMQType` panics (`internal/util/dependency/factory.go:139`). This is a startup-time fatal error with no graceful degradation.

2. **Etcd lease expiration**: If the session lease expires, the component is considered dead (`internal/util/sessionutil/session_util.go:59`). This can cause flapping if etcd is unstable.

3. **Double-Stop protection**: `sync.Once` fields prevent double-stop, but if a component's `Stop()` fails partially, subsequent calls become no-ops via the Once mechanism — potentially hiding real errors.

4. **Parallel init race**: DataCoord and QueryCoord init in parallel but both call `SetFileResourceObserver` on the same observer (`internal/coordinator/mix_coord.go:190,202`). If the observer isn't thread-safe by that point, this could race.

5. **Missing graceful timeout**: If `GracefulStop()` times out (controlled by `GracefulStopTimeout` config), the process continues to `Stop()` which does a hard termination. There's no mechanism to escalate from graceful to graceful-forceful.

## Future Considerations

1. **Replace `paramtable.Get()` with injected config**: The global paramtable undermines testability and hides dependencies. Transitioning to constructor-injected configuration would improve testability and make dependencies explicit.

2. **Formal DI container**: As the system grows, the manual wiring in `roles.go` may become a maintenance burden. A lightweight DI container (like wire) could manage dependency graphs while keeping explicit wiring.

3. **Structured shutdown phases**: The current shutdown order (coordinators → nodes → proxy) works but is implicit in `roles.go`. A formal shutdown coordinator with phases and timeouts would make this more robust.

4. **Interface segregation for Component**: The `component` interface in `cmd/roles/roles.go:84-89` only has `Prepare/Run/Stop`, but actual components expose health checks and other methods. This indirection could be tightened.

## Questions / Gaps

1. **Why does `mixCoordClient` require a separate client interface vs. embedding the server?** MixCoord needs both a server (to serve gRPC) and a client (to forward requests from nodes to coordinators). The `mixCoordClient` is created via `mix.NewClient` but only used internally for certain cross-coordinator calls. This dual role (server + internal client) may indicate unclear boundary separation.

2. **Why is `streamingCoord` stopped via `GracefulStop()` while others use `Stop()`?** In `internal/coordinator/mix_coord.go:342-347`, `streamingCoord.Stop()` is called via `GracefulStop()` rather than the standard `Stop()`. The reason is not documented — this inconsistency could be accidental or intentional for ordering reasons.

3. **What happens if DataCoord/QueryCoord init fails after RootCoord started?** In the `errgroup` at `internal/coordinator/mix_coord.go:188-215`, if DataCoord init fails, QueryCoord continues (they run in parallel) but then `g.Wait()` returns the error. The error propagates up but RootCoord is already started. There's no rollback of RootCoord if DataCoord/QueryCoord fail to start.

4. **No clear evidence of interface ownership reversal**: The dimension question asks if interfaces are defined by consumers or producers. In Milvus, interfaces are defined in `internal/types/types.go` which is a central types package — this is neither pure producer nor consumer ownership. The interfaces appear to be defined by the architecture designers to describe component contracts, not by either end consuming them.

---

Generated by `dimensions/02-dependency-injection-composition.md` against `milvus`.