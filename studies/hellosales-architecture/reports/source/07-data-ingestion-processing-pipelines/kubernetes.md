# Source Analysis: kubernetes

## Data Ingestion & Processing Pipelines

### Source Info

| Field | Value |
|-------|-------|
| Name | kubernetes |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/kubernetes` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

Kubernetes implements a sophisticated multi-stage data pipeline for processing cluster state. Raw data enters through the API server, passes through admission webhooks (mutating then validating), is transformed via strategy layers (PrepareForCreate/Validate/Canonicalize), stored in etcd with encryption transformers, and propagated to controllers via informer/watch mechanisms. The system uses GuaranteedUpdate semantics for atomic storage operations, work queues with rate limiting for controller processing, and batch-capable delta handling with transaction support. Pipeline observability is provided through metrics, cache sync checks, and operation timestamps.

## Rating

**8/10** — Good implementation with minor issues. The pipeline architecture is solid with clear stage separation, but deployment isolation of stages is limited (admission plugins compile into the API server), and while batching and backpressure are well-handled, memory scaling for very high throughput scenarios relies on external configuration rather than internal self-tuning.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| API Entry | REST storage for Pods with Binding subresource | `pkg/registry/core/pod/storage/storage.go:76-126` |
| Validation | Strategy pattern: `podStrategy` with PrepareForCreate/Validate/Canonicalize | `pkg/registry/core/pod/strategy.go:59-118` |
| Mutating Phase | Admission options with two-phase (mutating then validating) chain | `pkg/kubeapiserver/options/admission.go:76-82` |
| Storage Pipeline | `GuaranteedUpdate` with BeforeCreate/BeforeUpdate hooks | `staging/src/k8s.io/apiserver/pkg/registry/generic/registry/store.go:709-865` |
| Storage Interface | `storage.Interface` defining Get/List/Watch/Create/Update/Delete | `staging/src/k8s.io/apiserver/pkg/storage/interfaces.go:101-200` |
| etcd3 Store | `store` struct implementing storage.Interface with transformer | `staging/src/k8s.io/apiserver/pkg/storage/etcd3/store.go:77-97` |
| Data Transform | `value.Transformer` interface for encryption at rest | `staging/src/k8s.io/apiserver/pkg/storage/value/transformer.go:46-54` |
| Cache Layer | `Cacher` wrapping storage.Interface for watch caching | `staging/src/k8s.io/apiserver/pkg/storage/cacher/cacher.go:80-150` |
| Work Queue | `Typed[T]` queue with dirty/processing tracking and rate limiting | `staging/src/k8s.io/client-go/util/workqueue/queue.go:190-222` |
| Batch Processing | `processDeltasInBatch` with TransactionStore support for partial failure | `staging/src/k8s.io/client-go/tools/cache/controller.go:667-754` |
| Informer Pipeline | `SharedIndexInformer` with DeltaFIFO and event distribution | `staging/src/k8s.io/client-go/tools/cache/shared_informer.go:944-958` |
| Controller Loop | PV controller with rate-limited queues and worker goroutines | `pkg/controller/volume/persistentvolume/pv_controller_base.go:90-125,503-527` |
| Node Status Sync | Kubelet periodically syncs node status with retry backoff | `pkg/kubelet/kubelet_node_status.go:452-467,591-607` |

## Answers to Dimension Questions

### 1. How does raw data become trustworthy structured data?

Raw data enters through the API server's REST storage layer. For Pods specifically:

1. HTTP request arrives at `pkg/registry/core/pod/storage/storage.go:76` — `NewStorage()` creates REST endpoints
2. Binding creation at lines 177-201 — `BindingREST.Create()` validates pod-node binding requests
3. Strategy layer at `pkg/registry/core/pod/strategy.go:86-101` — `PrepareForCreate()` clears disallowed fields, sets `Phase=Pending`, computes `QoSClass`
4. Validation at lines 112-118 — `Validate()` runs `corevalidation.ValidatePodCreate` with `GetValidationOptionsFromPodSpecAndMeta`
5. Warnings at lines 120-129 — `WarningsOnCreate()` emits deprecation warnings
6. Canonicalize at lines 131-133 — normalization hook (currently empty for pods)
7. Storage at `staging/src/k8s.io/apiserver/pkg/registry/generic/registry/store.go:763-772` — `rest.BeforeCreate()` then `createValidation` runs
8. etcd persists via `staging/src/k8s.io/apiserver/pkg/storage/etcd3/store.go:77-97` with encryption transformers at `staging/src/k8s.io/apiserver/pkg/storage/value/transformer.go:46-54`

**Evidence**: `pkg/registry/core/pod/strategy.go:86-118` shows the validate→transform pipeline where `PrepareForCreate` clears fields and `Validate` runs structural validation. The `store.go:763-772` shows BeforeCreate hook and createValidation wrapped in GuaranteedUpdate.

### 2. What happens when a pipeline stage fails mid-batch?

Kubernetes handles partial failures through multiple mechanisms:

**Work Queue Retry**: `staging/src/k8s.io/client-go/util/workqueue/queue.go:289-302` — `Done()` re-adds items to queue if marked dirty during processing, enabling retry without data loss.

**Batch Transaction with Partial Success**: `staging/src/k8s.io/client-go/tools/cache/controller.go:739-749` — When `TransactionStore.Transaction()` fails, only callbacks for `SuccessfulIndices` execute:
```go
err := txnStore.Transaction(txns...)
if err != nil {
    for _, i := range err.SuccessfulIndices {
        if i < len(callbacks) {
            callbacks[i]()
        }
    }
    return fmt.Errorf("not all items in the batch successfully processed: %s", err.Error())
}
```

**Fallback to Individual Processing**: Lines 688-698 — If TransactionStore not supported, each delta is processed individually with accumulated errors.

**GuaranteedUpdate Conflict Detection**: `staging/src/k8s.io/apiserver/pkg/registry/generic/registry/store.go:807-809` — ResourceVersion mismatch returns `NewConflict` error, triggering client retry.

**Controller Rate Limiting**: `pkg/controller/volume/persistentvolume/pv_controller_base.go:524` — `volumeQueue.AddRateLimited(key)` applies exponential backoff on retry.

### 3. How is data quality validated at each pipeline stage?

**Admission Webhooks** (`pkg/kubeapiserver/options/admission.go:76-82`): Two-phase admission — mutating plugins run first (can modify objects), validating plugins run second (enforce invariants). Plugin order defined in `RecommendedPluginOrder`.

**Strategy Validation** (`pkg/registry/core/pod/strategy.go:112-118`):
- `Validate()` runs `corevalidation.ValidatePodCreate` with validation options
- `ValidateUpdate()` runs `corevalidation.ValidatePodUpdate` comparing old and new spec
- `WarningsOnCreate()` emits deprecation warnings

**Storage Preconditions** (`staging/src/k8s.io/apiserver/pkg/registry/generic/registry/store.go:700`): `storagePreconditions.ResourceVersion` checked before update.

**Selection Predicate** (`staging/src/k8s.io/apiserver/pkg/storage/selection_predicate.go`): Label and field filtering applied during LIST operations.

**ListErrorAggregator** (`staging/src/k8s.io/apiserver/pkg/storage/etcd3/store.go:113-142`): `abortOnFirstError` stops on first error during LIST (backward compatible behavior).

**Cache Sync Verification** (`staging/src/k8s.io/client-go/tools/cache/controller.go:143`): `HasSynced()` checks informer cache completeness before returning data.

### 4. How does the pipeline scale with data volume without OOM?

**Cacher Layer**: `staging/src/k8s.io/apiserver/pkg/storage/cacher/cacher.go:80-150` — Watch events cached with configurable `EventsHistoryWindow` (default `DefaultEventFreshDuration = defaultBookmarkFrequency + 15s`). Page size for initial/resync lists is `storageWatchListPageSize = int64(10000)` at line 66.

**Indexed Storage**: `staging/src/k8s.io/apiserver/pkg/storage/cacher/cacher.go` wraps underlying etcd storage, providing secondary indexes to reduce memory for frequently-queried field values.

**Delta FIFO**: `staging/src/k8s.io/client-go/tools/cache/delta_fifo.go` — Aggressive compaction of event history, only current state retained in store.

**Work Queue Memory Bounded**: `staging/src/k8s.io/client-go/util/workqueue/queue.go:190-222` — `Typed[T]` uses `dirty` and `processing` sets (interfaces{}) rather than unbounded queues. Items only re-added when processing fails.

**Controller Workers**: `pkg/controller/volume/persistentvolume/pv_controller_base.go:328` — `cache.WaitForNamedCacheSyncWithContext()` ensures cache is populated before workers start processing.

**External Resource Limits**: Memory scaling relies on `--storage-resilient-delta-period-seconds` and etcd quota configuration rather than internal self-tuning. No evidence of adaptive batching or memory-based flow control.

### 5. Can pipeline stages be independently deployed or scaled?

**Limited Isolation**: Admission plugins compile into kube-apiserver binary (`pkg/kubeapiserver/options/admission.go:59` calls `RegisterAllAdmissionPlugins`). Cannot independently deploy mutating vs validating webhook chains.

**Informer-Based Fan-Out**: Controllers scale independently via `--controllers` flag and informer shared informers (`staging/src/k8s.io/client-go/tools/cache/shared_informer.go:283-284`). Multiple controllers can share same informer factory to reduce API server load.

**Storage Layer**: `storage.Interface` allows swapping etcd3 for other backends (e.g., SQL), but this is compile-time not runtime.

**No Formal Stage Deployment**: No evidence of pipeline stages as independent microservices or sidecars. All stages run within kube-apiserver or kubelet processes.

**Controller Scaling**: Controllers like PV controller (`pkg/controller/volume/persistentvolume/pv_controller_base.go:309-345`) run as part of kube-controller-manager with configurable worker counts, but the controller binary must be scaled as a whole.

## Architectural Decisions

1. **Strategy Pattern for Resource Behavior**: Each resource type (Pod, Service, etc.) implements `rest.RESTCreateStrategy`, `rest.RESTUpdateStrategy` defining resource-specific validation and transformation (`pkg/registry/core/pod/strategy.go:59-67`). This allows consistent hooks (BeforeCreate, Validate, PrepareForCreate) across all resources without centralization.

2. **GuaranteedUpdate for Optimistic Concurrency**: Storage operations use `GuaranteedUpdate` (`store.go:709`) which wraps compare-and-swap semantics in a retry loop, ensuring no lost updates under contention without requiring distributed locks.

3. **Two-Phase Admission Chain**: Mutating admission runs before validating admission (`admission.go:77-79`), allowing defaults and mutations to be applied before validation catches policy violations.

4. **TransactionStore for Atomic Batching**: `processDeltasInBatch` (`controller.go:739`) supports atomic batch operations via `TransactionStore` interface, falling back to individual processing when not supported.

5. **Informer/Reflector Pattern for Event-Driven Controllers**: Shared informers (`shared_informer.go:949`) provide push-based updates to controllers via `ResourceEventHandler` interface, eliminating polling overhead.

## Notable Patterns

1. **Decorators for Cross-Cutting Concerns**: `store.go:165-171` defines `Decorator` hook for post-storage operations, allowing audit logging or finalization without modifying storage core.

2. **Begin/After Hooks for Transaction Semantics**: `store.go:175-201` defines `BeginCreate`/`AfterCreate`, `BeginUpdate`/`AfterUpdate` hooks enabling resource-specific commit/revert behavior.

3. **Rate-Limited Work Queues with Exponential Backoff**: `queue.go:227-251` shows `Add()` marking items dirty then pushing to queue; `AddRateLimited()` (`rate_limiting_queue.go:30`) respects rate limiter before re-adding.

4. **DeltaFIFO with Indexer**: `shared_informer.go:944-958` processes deltas from FIFO queue, updating indexer and triggering handlers in lock-protected section.

5. **Operation Timestamps for Metrics**: `pv_controller_base.go:99` uses `metrics.NewOperationStartTimeCache()` to track operation timing across controller operations.

## Tradeoffs

- **Consistency over Availability**: `GuaranteedUpdate` with resource version preconditions trades some availability for strong consistency — conflicts return errors rather than merging.

- **Memory vs Latency in Cacher**: Event history window (`DefaultEventFreshDuration`) trades memory for better watch resumption after controller restarts.

- **Batch Atomicity vs Simplicity**: `processDeltasInBatch` with transaction fallback adds complexity; not all stores support atomic batching (`store.go:688`).

- **Isolation vs Performance**: Admission plugin compilation into apiserver binary improves latency (no external RPC) but prevents independent scaling of mutating vs validating stages.

- **Backoff vs Throughput**: Rate limiting with exponential backoff (`AddRateLimited`) protects etcd but can cause slow recovery after transient failures.

## Failure Modes / Edge Cases

1. **Stale ResourceVersion**: `store.go:714-717` — If existing object has ResourceVersion 0, creation-on-update is rejected unless `AllowCreateOnUpdate` is true.

2. **Optimistic Lock Conflict**: `store.go:807-809` — Concurrent updates with same resource version return `NewConflict`, requiring client retry with fresh version.

3. **TTL Expiry During Processing**: `store.go:773` — TTL calculated at write time; if object expires during processing, TTL may be stale but this is handled by etcd.

4. **Informer Cache Out of Sync**: `controller.go:143` — `HasSynced()` returns false if cache not populated, causing `WaitForNamedCacheSyncWithContext` to block indefinitely until sync.

5. **Partial Batch Failure**: `controller.go:741-748` — Only successful callbacks execute on transaction failure, but error returned indicates partial success — client must decide whether to retry.

6. **Watch Bookmark Missed**: `cacher.go:73-77` — If bookmarks fail to send within `DefaultEventFreshDuration`, clients may miss events and need full re-list.

7. **Encryption Key Stale**: `value/transformer.go:102-105` — `TransformFromStorage` returns `stale=true` when key rotation occurs, indicating data needs re-decryption with new key.

## Future Considerations

1. **External Admission Plugins**: Current design compiles admission into apiserver; future could support out-of-process admission webhooks with better isolation.

2. **Adaptive Batching**: No evidence of memory-based flow control; could add auto-tuning of batch sizes based on queue depth.

3. **Multi-Region Storage**: Current etcd3 store assumes single cluster; could add scatter-gather replication with conflict resolution.

4. **Streaming LIST with Pagination**: Current pagination via `continue` token (`storage/continue.go`); could add server-sent events for large LIST results.

5. **TransactionStore Standardization**: Currently some stores fallback to individual processing; could standardize TransactionStore across all storage backends.

## Questions / Gaps

1. **No evidence found** for pipeline observability tracing (OpenTelemetry) integration at data plane level — only `component-base/tracing` used in etcd3 store (`store.go:50`), but end-to-end pipeline traces not evidenced.

2. **No evidence found** for data lineage or audit trail of transformations — audit logging at `audit/` package exists but not traced to specific pipeline stages.

3. **No evidence found** for circuit breakers on upstream dependencies — admission failure doesn't trigger backpressure on API server.

4. **No evidence found** for per-resource pipeline configuration — all resources share same generic registry pattern with resource-specific strategy.

---

Generated by `dimensions/07-data-ingestion-processing-pipelines.md` against `kubernetes`.