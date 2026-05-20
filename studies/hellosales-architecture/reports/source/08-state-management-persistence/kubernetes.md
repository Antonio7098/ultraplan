# Source Analysis: kubernetes

## State Management & Persistence

### Source Info

| Field | Value |
|-------|-------|
| Name | kubernetes |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/kubernetes` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

Kubernetes implements a comprehensive state management architecture centered on etcd as the authoritative store. The API server provides storage abstractions through a clean `storage.Interface`, with optimistic locking via `GuaranteedUpdate` for atomic mutations. Client-side caching uses the informer pattern with Reflector/ListerWatcher to maintain eventually consistent local caches. The API server maintains a server-side watch cache (cacher) to serve reads efficiently while delegating writes to etcd.

## Rating

**8/10** — Kubernetes demonstrates excellent state management with well-designed abstractions, strong consistency guarantees, and sophisticated caching. The main扣分 is complexity: the multi-layer caching (client-go informer + API server cacher + etcd) makes reasoning about staleness non-trivial. Schema migrations are managed declaratively via CRDs rather than traditional migration tooling.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Storage Interface | `storage.Interface` defines Create, Get, Watch, Delete, GuaranteedUpdate | `staging/src/k8s.io/apiserver/pkg/storage/interfaces.go:169-279` |
| etcd3 Store | etcd3 `store` struct wraps kubernetes client with transformer | `staging/src/k8s.io/apiserver/pkg/storage/etcd3/store.go:77-95` |
| Optimistic Locking | `GuaranteedUpdate` retry loop with revision-based conflict detection | `staging/src/k8s.io/apiserver/pkg/storage/etcd3/store.go:457-621` |
| Preconditions | `Preconditions` struct checks UID and ResourceVersion | `staging/src/k8s.io/apiserver/pkg/storage/interfaces.go:122-165` |
| Versioner | `Versioner` interface encodes/decodes resourceVersion | `staging/src/k8s.io/apiserver/pkg/storage/interfaces.go:46-71` |
| client-go Store | `Store` interface with Add/Update/Delete/Replace | `staging/src/k8s.io/client-go/tools/cache/store.go:41-82` |
| ThreadSafeStore | thread-safe map with RWLock protection | `staging/src/k8s.io/client-go/tools/cache/thread_safe_store.go:255-267` |
| SharedInformer | `SharedInformer` with event handlers and local cache | `staging/src/k8s.io/client-go/tools/cache/shared_informer.go:144-250` |
| Reflector | `Reflector` watch loop feeding Store | `staging/src/k8s.io/client-go/tools/cache/reflector.go:105-171` |
| DeltaFIFO | `DeltaFIFO` with delta types (Added/Updated/Deleted/Replaced/Sync) | `staging/src/k8s.io/client-go/tools/cache/delta_fifo.go:108-158` |
| API Server Cacher | `Cacher` struct with watchCache, reflector, watchers | `staging/src/k8s.io/apiserver/pkg/storage/cacher/cacher.go:263-344` |
| WatchCache | Cyclic buffer with `processEvent` updating cache | `staging/src/k8s.io/apiserver/pkg/storage/cacher/watch_cache.go:89-164` |
| CacheWatcher | Per-watch state with input/result channels | `staging/src/k8s.io/apiserver/pkg/storage/cacher/cache_watcher.go:51-88` |
| BtreeStore | O(log n) store with Snapshotter for exact RV reads | `staging/src/k8s.io/apiserver/pkg/storage/cacher/store/store_btree.go:150-283` |
| Generic Registry Store | `Store` struct with strategy hooks and GuaranteedUpdate | `staging/src/k8s.io/apiserver/pkg/registry/generic/registry/store.go:101-250` |
| Pod Storage | `PodStorage` struct with REST, Binding, Status | `pkg/registry/core/pod/storage/storage.go:54-67` |
| Compactor | Watch cache compaction when buffer full | `staging/src/k8s.io/apiserver/pkg/storage/cacher/compactor.go` |

## Answers to Dimension Questions

### 1. How is state accessed and mutated — direct DB, repository, or event-sourced?

State is accessed through a layered architecture:
- **Storage Interface** (`staging/src/k8s.io/apiserver/pkg/storage/interfaces.go:169-279`) defines the abstract API
- **etcd3 Store** (`staging/src/k8s.io/apiserver/pkg/storage/etcd3/store.go:77-95`) is the primary implementation
- **Generic Registry Store** (`staging/src/k8s.io/apiserver/pkg/registry/generic/registry/store.go:101-250`) provides REST semantics with validation/strategies

Mutations flow through `GuaranteedUpdate` which implements optimistic concurrency control. The pattern is not purely event-sourced but uses resourceVersion for optimistic locking. The generic registry wraps storage operations with admission strategies, defaulting, and validation hooks.

Read path: Client → API Server → Cacher (watch cache) → etcd
Write path: Client → API Server → etcd (with watch notification)

### 2. What consistency model does the system provide to callers?

Kubernetes provides **sequential consistency** for per-resource reads via resourceVersion. Key mechanisms:

- **ResourceVersion** (`staging/src/k8s.io/apiserver/pkg/storage/interfaces.go:46-71`) is a monotonically increasing revision in etcd
- **Optimistic Locking** with `Preconditions` (`staging/src/k8s.io/apiserver/pkg/storage/interfaces.go:122-165`) allows atomic compare-and-swap
- **Conflict Error** message: `"the object has been modified; please apply your changes to the latest version and try again"` at `staging/src/k8s.io/apiserver/pkg/registry/generic/registry/store.go:263`

Read-your-own-writes consistency is achieved via the watch cache being updated synchronously before the API response. However, the client-go informer provides **eventual consistency** — reads through informers may lag behind the authoritative store.

### 3. How is cache invalidation handled without stale reads?

Multi-layer invalidation strategy:

**API Server Cacher** (`staging/src/k8s.io/apiserver/pkg/storage/cacher/cacher.go`):
- `processEvent()` at line 866 pushes etcd events to `incoming` channel
- `dispatchEvents()` goroutine dispatches to all `cacheWatcher` instances (line 874-933)
- Each `cacheWatcher` filters by resourceVersion

**WatchCache** (`staging/src/k8s.io/apiserver/pkg/storage/cacher/watch_cache.go:233-267`):
- Cyclic buffer maintains sliding window of changes
- `processEvent()` updates cache atomically with watchers

**Client-go Informer** (`staging/src/k8s.io/client-go/tools/cache/reflector.go:105-171`):
- `Reflector` continuously calls `Watch()` to receive ongoing changes
- `DeltaFIFO` (line 108-158) queues deltas for processing
- `SharedInformer` (line 144-250) propagates to all registered event handlers

The watch-based approach ensures no stale reads from the API server — the cache is updated via the same revision stream that clients receive.

### 4. How is long-running workflow state persisted and resumed?

Kubernetes does not have a built-in workflow engine for long-running operations. However, it provides primitives for building such systems:

- **Finalizers** (`pkg/registry/generic/registry/store.go`) allow cleanup hooks on delete
- **Custom Resources** enable domain-specific state storage
- **Controller pattern** (`pkg/controller/`): Controllers watch resources, maintain desired state, use status subresources for progress
- **Pod status** persists across restarts via etcd

For workflow resumption, the standard pattern is:
1. Persist workflow state as CustomResource in etcd
2. Controller reconciles by reading current state
3. On restart, controller resumes from persisted state

The `ResourceVersion` enables optimistic concurrency for workflow updates.

### 5. What happens to in-flight state during schema migrations?

Kubernetes uses a **declarative schema evolution** approach rather than imperative migrations:

- **CRDs** (`staging/src/k8s.io/apiextensions-apiserver/pkg/apis/apiextensions/types_jsonschema.go`) support field pruning and defaulting
- **ResourceVersion** acts as optimistic lock — new schema versions must pass validation against old resources
- **Admission webhooks** can mutate resources during migration

No explicit "in-flight state" handling exists. If a schema change removes required fields, existing resources with those fields would fail validation on update. The system prefers:
1. Adding optional fields with defaults
2. Using admission webhooks for one-time migrations
3. Versioned APIs (`/apis/group/version/`) for breaking changes

etcd stores raw JSON — schema validation happens at the API server layer.

## Architectural Decisions

| Decision | Rationale | Tradeoff |
|----------|-----------|----------|
| etcd as single source of truth | Strong consistency, distributed coordination | Latency for every operation |
| Optimistic locking by default | High availability, no locking overhead | Retry complexity on conflicts |
| Watch-based cache invalidation | Near-real-time propagation | Eventual consistency window |
| Generic Registry pattern | Code reuse across all resource types | Complexity in generic store |
| ResourceVersion as monotonic counter | Simple conflict detection | Not globally ordered across resources |

## Notable Patterns

**1. Optimistic Concurrency with Retry Loop**
- `etcd3/store.go:457-621` implements a retry loop that fetches fresh state on conflict
- Exponential backoff not present — immediate retry

**2. Cacher with Multi-Reader Watch**
- `cacher.go:263-344` serves reads from watch cache
- `cacheWatcher` instances receive events in priority order

**3. Informer Pattern (Client-side)**
- `Reflector` → `ListerWatcher` → `Watch` → `Store`
- `DeltaFIFO` deduplicates and orders events
- `SharedInformer` coordinates across consumers

**4. Generic Registry Store**
- Strategy pattern for Create/Update/Delete validation
- `GuaranteedUpdate` closure pattern for atomic compare-and-swap

**5. Cyclic Buffer Watch Cache**
- `watch_cache.go:89-164` uses fixed-size circular buffer
- Compactor (`compactor.go`) handles overflow

## Tradeoffs

| Aspect | Tradeoff |
|--------|----------|
| etcd latency | Every write goes to etcd; read cache miss = etcd round-trip |
| Eventual consistency in clients | Informer cache may be stale; must handle resourceVersion conflicts |
| Optimistic locking retry | Hot objects (ConfigMaps, Services) can cause contention and retries |
| Watch cache memory | Btree store (`store_btree.go:150-283`) holds all resource versions in memory |
| No distributed transactions | Cross-resource atomic operations not supported |

## Failure Modes / Edge Cases

| Mode | Description | Evidence |
|------|-------------|----------|
| etcd watch failure | Network partition causes watcher to miss events | `watcher.go` must reconnect with exponential backoff |
| Conflict storms | Many controllers updating same resource cause retry loops | `GuaranteedUpdate` at `store.go:709-865` |
| Cache divergence | Client informer drifts from etcd state | `Reflector` resync triggered by `resyncPeriod` |
| Stale read from cache | Watch cache may serve pre-event state | Event handling order in `cache_watcher.go:147-163` |
| ResourceVersion overflow | 64-bit counter eventually wraps | Designed as monotonic, not globally ordered |
| TTL expiry | Cached objects with TTL may disappear | `store.go` TTL passed to etcd Create |

## Future Considerations

| Area | Consideration |
|------|---------------|
| Scale-out caching | API server cacher is single-process; cluster-level caching not addressed |
| Cross-namespace transactions | No two-phase commit; controllers must handle partial failures |
| Schema migration tooling | No built-in migration framework; webhooks + CRDs are manual |
| Watch reliability | etcd watch can miss events on reconnect ( bookmark feature addresses partially) |
| Tiered storage | No warm/cold data separation; etcd is sole store |

## Questions / Gaps

| Gap | Analysis |
|-----|----------|
| No cross-resource transactions | Kubernetes resources are independent; composite operations require custom coordination |
| Client retry burden | Conflict handling is delegated to client; no server-side retry queue |
| Schema migration is manual | No declarative migration DSL; upgrades require careful webhook ordering |
| Cache compaction correctness | Compactor at `compactor.go` must maintain event ordering invariants |
| No read-after-write consistency at client | Client-go informers are eventually consistent; strong consistency requires direct API calls |

---

Generated by `08-state-management-persistence.md` against `kubernetes`.