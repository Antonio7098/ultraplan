# State Management & Persistence - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Dimension | `08-state-management-persistence` |
| Sources | cli, grafana, kubernetes, milvus, nats-server, openfga, pocketbase, temporal, victoriametrics |
| Date | 2026-05-20 |

## Sources Studied

| # | Source | Path |
|---|--------|------|
| 1 | cli | `sources/cli` |
| 2 | grafana | `sources/grafana` |
| 3 | kubernetes | `sources/kubernetes` |
| 4 | milvus | `sources/milvus` |
| 5 | nats-server | `sources/nats-server` |
| 6 | openfga | `sources/openfga` |
| 7 | pocketbase | `sources/pocketbase` |
| 8 | temporal | `sources/temporal` |
| 9 | victoriametrics | `sources/victoriametrics` |

## Executive Summary

Nine production systems reveal a fundamental divide in state management philosophy: systems built for distributed coordination (Kubernetes, Temporal, NATS-server) invest in strong consistency primitives and explicit invalidation, while single-node or client-side systems (cli, PocketBase) accept weaker guarantees for simplicity. The most mature architectures share three properties: (1) a clear storage abstraction layer separating persistence semantics from business logic, (2) watch-based or timestamp-based cache invalidation rather than TTL-only expiration, and (3) a recovery mechanism for long-running operations. No source demonstrates perfect handling of all five dimension questions — gaps cluster around schema migration (no system has a good answer for in-flight state during migrations), cross-coordinator transactions (Milvus, Temporal), and distributed cache invalidation (most sources lack this entirely).

## Core Thesis

State management architecture is primarily determined by two forces: **operational scope** (single-process vs. distributed) and **workflow longevity** (stateless request-response vs. durable execution). Systems with wide operational scope and long-running workflows (Kubernetes, Temporal, Milvus) implement layered storage abstractions, explicit consistency models, and push-based cache invalidation. Systems with narrow scope or stateless workloads (cli, VictoriaMetrics, nats-server) rely on simpler write-behind patterns and time-based cache expiration. The most consequential architectural choice — whether to use optimistic locking, pessimistic locking, or eventual consistency without locking — is made implicitly by the storage technology chosen and is rarely revisited.

## Rating Summary

| Source | Score | Approach | Main Strength | Main Concern |
|--------|-------|----------|---------------|--------------|
| cli | 5/10 | File-based YAML config + API polling | Simple deployment; config migration system | No local database; no caching; no workflow persistence |
| grafana | 7/10 | SQLStore (xorm) + dual-write unified storage | Transaction retry logic; advisory lock migrations; query caching stub | Legacy/new storage coexistence; OSS caching is stub |
| kubernetes | 8/10 | etcd3 + storage.Interface + Generic Registry | Sequential consistency via resourceVersion; watch-based cache invalidation; GuaranteedUpdate | No cross-resource transactions; complex multi-layer caching |
| milvus | 8/10 | etcd + Catalog interfaces + TSO coordinator | Atomic etcd transactions; WAL with checkpoints; configurable consistency levels | No distributed ACID transactions; push invalidation fragility |
| nats-server | 7/10 | StreamStore/ConsumerStore interfaces + block file storage | Interface segregation; elastic pointer cache; write coalescing | No formal transactions; async flush trades durability |
| openfga | 8/10 | SQL + OpenFGADatastore + multi-layer LRU cache | Three-tier cache with timestamp invalidation; ULID pagination; row-level locking | No distributed cache; cache stampede on restart |
| pocketbase | 7/10 | SQLite + dual connection pools + in-memory store | Hook-driven state lifecycle; lock retry with backoff; bounded in-memory cache | SQLite single-writer bottleneck; no distributed cache |
| temporal | 8/10 | ExecutionManager + ExecutionStore + blob serialization | Durable execution; history tree for replay; range ID fencing | Last-write-wins for history nodes; no multi-entity transactions |
| victoriametrics | 7/10 | TSDB with tiered storage + sharded caches | Tiered merging; reference-counted parts; hard-link snapshots | No ACID transactions; eventual consistency only; no workflow persistence |

## Approach Models

### 1. Repository/DAL Abstraction with SQL Backend (Grafana, OpenFGA, PocketBase)

These systems define explicit interfaces separating business logic from storage. The `OpenFGADatastore` interface composes five backends; Grafana's `SQLStore` wraps xorm with transaction methods; PocketBase's `App` interface wraps `dbx.Builder`.

**Characteristic evidence:**
- OpenFGA `OpenFGADatastore` interface composes `TupleBackend`, `AuthorizationModelBackend`, `StoresBackend`, `AssertionsBackend`, `ChangelogBackend` (`pkg/storage/storage.go:409-421`)
- Grafana `WithTransactionalDbSession` wraps xorm sessions with automatic rollback on error (`pkg/services/sqlstore/transactions.go:17-94`)
- PocketBase `RunInTransaction` creates shallow app clones with swapped DB references (`core/db_tx.go:14-49`)

### 2. Distributed KV with Watch-Based Invalidation (Kubernetes, Milvus)

Both systems use etcd as the authoritative store with a client-side informer pattern. Cache invalidation is push-based — when etcd changes, watchers push updates to all clients.

**Characteristic evidence:**
- Kubernetes `storage.Interface` defines `Create`, `Get`, `Watch`, `Delete`, `GuaranteedUpdate` (`staging/src/k8s.io/apiserver/pkg/storage/interfaces.go:169-279`)
- Kubernetes `Reflector` watch loop feeds `DeltaFIFO` for deduplication (`staging/src/k8s.io/client-go/tools/cache/reflector.go:105-171`)
- Milvus `ExpireMetaCache()` broadcasts invalidation to all proxy nodes (`internal/rootcoord/expire_cache.go:28-49`)
- Milvus TSO provides globally monotonic timestamps (`internal/tso/tso.go:47-56`)

### 3. Interface-Segregated Storage with Pluggable Backend (NATS-server, Temporal)

Both define clean `StreamStore`/`ConsumerStore` (NATS) or `ExecutionStore`/`ExecutionManager` (Temporal) interfaces enabling multiple storage implementations and clear separation between high-level operations and storage primitives.

**Characteristic evidence:**
- NATS `StreamStore` and `ConsumerStore` interfaces enable in-memory and file-based implementations (`server/store.go:93-137`, `server/store.go:360-378`)
- Temporal `DataStoreFactory` creates `ExecutionStore`, `TaskStore`, `ShardStore` (`common/persistence/persistence_interface.go:32-51`)
- Temporal `ExecutionManager` wraps `ExecutionStore` with serialization logic (`common/persistence/execution_manager.go:28-37`)

### 4. WAL-Based Streaming Persistence (Milvus, NATS-server)

Both systems use write-ahead logs for durability before data reaches final storage. Milvus uses WAL for streaming node state; NATS JetStream uses it for message durability.

**Characteristic evidence:**
- Milvus `recoveryStorageImpl` replays WAL to restore state (`internal/streamingnode/server/wal/recovery/recovery_storage_impl.go:34-105`)
- NATS `msgBlock` stores per-file message blocks with write cache coalescing (`server/filestore.go:220-270`)
- NATS `recoverFullState()` with Highwayhash checksum validation (`server/filestore.go:1865-1939`)

### 5. Tiered TSDB Storage (VictoriaMetrics)

Purpose-built time-series storage with three tiers (inmemory/small/big parts), sharded write buffers, and merge-on-read query path.

**Characteristic evidence:**
- VictoriaMetrics `partition` struct with three-tier parts (`lib/storage/partition.go:74-148`)
- `rawRowsShards` provides sharded write buffering (`lib/storage/partition.go:484-601`)
- `inmemoryPart` with `MustStoreToDisk()` for persistence (`lib/storage/inmemory_part.go:38-57`)

### 6. Blob Serialization with History Replay (Temporal)

Workflow state stored as protobuf blobs with separate history preservation for replay-based recovery.

**Characteristic evidence:**
- Temporal `WorkflowSnapshot` and `WorkflowMutation` types containing all workflow state (`common/persistence/data_interfaces.go:344-398`)
- `Serializer` interface with blob encoding methods (`common/persistence/serialization/serializer.go:108-112`)
- History tree with `tree_id`, `branch_id`, `node_id`, `txn_id` (`schema/cassandra/temporal/schema.cql:58-80`)

### 7. File-Based Config with Migration System (cli)

No database — configuration stored in YAML with a versioned migration interface.

**Characteristic evidence:**
- `gh.Config` interface with `GetOrDefault`, `Set`, `Write`, `Migrate` (`internal/gh/gh.go:32-80`)
- `Migration` interface with `PreVersion`, `PostVersion`, `Do` (`internal/gh/gh.go:82-100`)
- `cfg.Migrate()` checks version before/after, writes on success (`internal/config/config.go:182-209`)

## Pattern Catalog

### Pattern 1: Optimistic Locking with Retry Loop

**Problem:** Concurrent mutations to the same resource can cause lost updates without blocking writers.

**Sources demonstrating it:** Kubernetes (`GuaranteedUpdate`), Temporal (`next_event_id` conditional updates), OpenFGA (`SELECT ... FOR UPDATE`), Milvus (`CompareVersionAndSwap`).

**Mechanism:** The storage layer detects conflicts by comparing a version counter or resource version. On conflict, the caller fetches fresh state and retries. No distributed lock is held during retry, maximizing availability.

**Why it works:** Availability remains high under contention because writers never block each other. Conflicts are detected on read rather than write, making the retry loop a client-side concern.

**When to copy:** When using etcd, Cassandra, or any storage with native version support. When your workload has moderate contention and can tolerate retries.

**When overkill:** High-contention hot keys where retry storms cause more harm than a distributed lock would. Kubernetes notes that "hot objects (ConfigMaps, Services) can cause contention and retries" (`staging/src/k8s.io/apiserver/pkg/registry/generic/registry/store.go:709-865`).

**Evidence:**
- Kubernetes `GuaranteedUpdate` retry loop at `staging/src/k8s.io/apiserver/pkg/storage/etcd3/store.go:457-621`
- Temporal conditional update via `next_event_id` at `common/persistence/data_interfaces.go:349`
- OpenFGA `SELECT ... FOR UPDATE` at `pkg/storage/sqlite/sqlite.go:395-401`

### Pattern 2: Watch-Based Cache Invalidation

**Problem:** Client-side caches can serve stale data when the authoritative store changes.

**Sources demonstrating it:** Kubernetes (client-go informer + API server cacher), Milvus (broadcast invalidation to proxies).

**Mechanism:** Instead of TTL-based expiration, clients maintain a watch connection to the authoritative store. When the store changes, it pushes deltas to all watchers who update their local caches atomically.

**Why it works:** Invalidation latency is near-zero — the cache is updated as soon as the store changes. No stale window based on TTL duration.

**When to copy:** When using etcd or any watch-capable storage. When clients need near-real-time consistency with the authoritative store.

**When overkill:** When clients are many and mostly idle (watch overhead is per-client). When eventual consistency within a TTL window is acceptable. When the store doesn't support watches natively.

**Evidence:**
- Kubernetes `SharedInformer` with event handlers and local cache at `staging/src/k8s.io/client-go/tools/cache/shared_informer.go:144-250`
- Kubernetes `Cacher` struct with `watchCache`, `reflector`, `watchers` at `staging/src/k8s.io/apiserver/pkg/storage/cacher/cacher.go:263-344`
- Milvus `InvalidateCollectionMetaCache()` at `internal/proxy/impl.go:125-237`

### Pattern 3: WAL Checkpoint for Streaming Recovery

**Problem:** Streaming data must survive process restarts without losing in-flight messages.

**Sources demonstrating it:** Milvus, NATS-server.

**Mechanism:** Every write is appended to a WAL before being committed to final storage. A checkpoint is periodically persisted marking the WAL offset. On restart, the system replays from the last checkpoint.

**Why it works:** The WAL provides durability without the overhead of writing every message to final storage immediately. Checkpoints bound recovery time.

**When to copy:** When building a streaming or messaging system. When writes are high-volume and immediate persistence is a bottleneck.

**When overkill:** When message loss is unacceptable (WAL can lose data on crash before flush). When the storage engine already provides durability guarantees.

**Evidence:**
- Milvus `WALCheckpoint` persisted to catalog at `internal/streamingnode/server/wal/utility/checkpoint.go:11-31`
- NATS `cache` struct with write pointer and flush logic at `server/filestore.go:273-279`
- NATS `flushPendingMsgsLocked()` batching writes at `server/filestore.go:8175-8257`

### Pattern 4: Timestamp-Based Entity Invalidation

**Problem:** Cache entries must be invalidated when the underlying entity changes, without TTL-based staleness windows.

**Sources demonstrating it:** OpenFGA, Kubernetes (resourceVersion).

**Mechanism:** Each cache entry is tagged with the entity's last-modified timestamp. When an entity is modified, its cache entry is deleted (or tagged invalid) based on timestamp comparison. Subsequent reads fetch fresh data.

**Why it works:** No staleness window — cache is invalidated immediately on modification. Timestamp comparison is lightweight and can be done without distributed coordination.

**When to copy:** When entities are modified by single-writer or low-contention workloads. When TTL-based invalidation causes unacceptable stale reads.

**When overkill:** When writes are extremely frequent (invalidation churn). When timestamp clocks are unreliable across nodes.

**Evidence:**
- OpenFGA `isInvalidAt()` compares cache timestamp against invalidation entry timestamp (`pkg/storage/storagewrappers/cached_reader.go:212-261`)
- OpenFGA `GetInvalidIteratorCacheKey` marks entire store's cache invalid on write (`pkg/storage/cache.go:223-225`)
- Kubernetes `resourceVersion` as monotonic revision in etcd (`staging/src/k8s.io/apiserver/pkg/storage/interfaces.go:46-71`)

### Pattern 5: Dual-Write with Read-Path Routing

**Problem:** Migrating from one storage backend to another without downtime requires writing to both during a transition period.

**Sources demonstrating it:** Grafana (legacy SQLStore → unified storage), NATS-server (memory ↔ file storage).

**Mechanism:** All writes go to both old and new storage. Reads route to one or the other based on migration state. After migration completes, reads switch to new storage and writes to new only.

**Why it works:** Zero downtime migration. Data divergence is detectable and recoverable. The pattern is well-understood from database migration literature.

**When to copy:** When migrating between storage systems. When running two systems in parallel during a transition period.

**When overkill:** When downtime is acceptable for the migration. When the new system can import from the old offline.

**Evidence:**
- Grafana `dualWriter` writes to legacy then unified with read-mode routing at `pkg/storage/legacysql/dualwrite/dualwriter.go:40-100`
- NATS `FileStorage` and `MemoryStorage` constants at `server/store.go:33-38`

### Pattern 6: Hook-Driven State Lifecycle

**Problem:** State mutations need to trigger side effects (cache invalidation, logging, async tasks) without coupling the mutator to those side effects.

**Sources demonstrating it:** PocketBase, Grafana (alert state hooks).

**Mechanism:** Register handlers that fire before and after state mutations. Handlers execute within or after transaction commit depending on type. Cache invalidation is a common use case.

**Why it works:** The mutator doesn't need to know about invalidation, logging, or event publishing. Handlers are registered declaratively and composed at runtime.

**When to copy:** When state mutations have multiple side effects that should be composable. When cache invalidation must happen atomically with state changes.

**When overkill:** When side effects are few and simple enough to inline. When all mutations should trigger the same side effects (simpler to call directly).

**Evidence:**
- PocketBase `OnModelCreate/Update/Delete()` hooks at `core/db.go:265-448`
- PocketBase `txInfo.OnComplete()` callbacks executing after transaction commit at `core/db_tx.go:79-112`
- Grafana alert state `StatePersister` interface at `pkg/services/ngalert/state/manager.go:34-37`

### Pattern 7: Durable Execution with History Replay

**Problem:** Long-running workflows must survive server restarts without losing in-progress state.

**Sources demonstrating it:** Temporal, Kubernetes (CRD-based controllers).

**Mechanism:** Workflow state is persisted to durable storage on every state transition. History events are preserved separately. On restart, the system loads state and replays events to reconstruct current state.

**Why it works:** The workflow can be resumed from the last persisted state regardless of what node runs it. Deterministic replay ensures consistent results.

**When to copy:** When workflows can take minutes to hours to complete. When workflow failures have high recovery cost. When you need to audit every state transition.

**When overkill:** When workflows complete in seconds. When stateless request-response semantics are sufficient.

**Evidence:**
- Temporal workflow state persisted as blobs on each transition at `common/persistence/execution_manager.go:72-130`
- Temporal history tree stored as append-only with `txn_id` for conflict resolution at `schema/cassandra/temporal/schema.cql:58-80`
- Kubernetes CRD state persists in etcd via `GenericRegistry Store` at `staging/src/k8s.io/apiserver/pkg/registry/generic/registry/store.go:101-250`

### Pattern 8: Reference-Counted Parts for Safe Cleanup

**Problem:** Data parts may be in use by readers while a garbage collection process wants to delete stale parts.

**Sources demonstrating it:** VictoriaMetrics, NATS-server.

**Mechanism:** Each data part has an atomic reference counter. Readers increment on access and decrement on done. The garbage collector only deletes parts with zero refcount. A `mustDrop` flag prevents deletion of parts that are about to be reused.

**Why it works:** Concurrent readers are never surprised by part deletion. The pattern is lock-free for the common case (read without deletion).

**When to copy:** When implementing tiered storage with background compaction. When parts are deleted based on age or size limits.

**Evidence:**
- VictoriaMetrics `partWrapper` with `refCount` atomic and `mustDrop` flag at `lib/storage/partition.go:151-200`
- NATS `msgBlock.ecache` elastic pointer for cache recycling at `server/filestore.go:247`

## Key Differences

### Why Consistency Models Diverge

The choice of consistency model is fundamentally constrained by the storage technology:

- **etcd-based systems** (Kubernetes, Milvus) inherit etcd's sequential consistency. Kubernetes provides strong consistency via `resourceVersion` and `GuaranteedUpdate`. Milvus adds a TSO for distributed timestamp ordering but lacks cross-coordinator ACID transactions.
- **SQL-based systems** (OpenFGA, Grafana, PocketBase) use database-default isolation (typically READ COMMITTED) with varying optimistic locking approaches. OpenFGA uses `SELECT ... FOR UPDATE` row-level locking sorted by deterministic key order to prevent deadlocks. Grafana adds optimistic locking for alert rules via version fields.
- **Blob storage systems** (Temporal, VictoriaMetrics) prioritize write throughput over query flexibility. Temporal's last-write-wins for history nodes trades strong consistency for availability. VictoriaMetrics provides only eventual consistency with configurable flush intervals.
- **File-based systems** (NATS-server, cli) have no consistency model beyond what the filesystem provides. NATS offers tunable sync/async flush; cli delegates to GitHub API.

The divergence is **correct** — each model reflects the storage technology's properties. Strong consistency has a cost; systems optimized for write throughput (VictoriaMetrics, NATS async mode) don't choose it.

### Why Cache Invalidation Strategies Vary

Cache invalidation falls into three categories:

1. **Watch-based push invalidation** (Kubernetes, Milvus): The store pushes changes to all clients. Near-zero staleness but requires the store to support watches and clients to maintain connections.

2. **Timestamp-based invalidation** (OpenFGA, Kubernetes `resourceVersion`): Cache entries are invalidated by timestamp comparison. Neither push nor pull — invalidation entries are written on mutation and checked on read. This is a hybrid that avoids constant watch connections.

3. **TTL-only expiration** (VictoriaMetrics, NATS cache expiration, Temporal XDCCache): No explicit invalidation — entries expire by time alone. Simpler but allows stale reads within the TTL window.

The key insight is that **watch-based invalidation requires storage support**. Kubernetes' etcd and Milvus' etcd support watches natively. SQL databases (OpenFGA, Grafana) do not support push invalidation, so OpenFGA uses timestamp-based invalidation entries instead. VictoriaMetrics and Temporal have no native push invalidation, so they rely on TTL.

### Why Long-Running Workflow Support Varies

Only three sources (Temporal, Kubernetes, Milvus) demonstrate genuine long-running workflow support:

- **Temporal**: The gold standard — durable execution model where workflow state survives server restarts via history replay. `WorkflowSnapshot` + `WorkflowMutation` + history tree.
- **Kubernetes**: No built-in workflow engine, but CRDs + controller pattern enables workflow-like behavior. State persists in etcd; controllers reconcile continuously.
- **Milvus**: WAL with checkpoints and TxnBuffer for streaming transactions. Not a general workflow engine, but provides resumable streaming.

The other six sources either have no long-running operations (OpenFGA, cli, VictoriaMetrics, nats-server) or use ad-hoc approaches (Grafana: in-memory alert state with periodic persistence; PocketBase: no workflow mechanism).

The gap is **not a quality issue** — it's a product fit issue. Grafana, PocketBase, and nats-server are not workflow engines; they don't need workflow state persistence. OpenFGA is a pure request-response authorization service. cli is a client. Adding durable execution to these would be unnecessary complexity.

### Why Schema Migration Approaches Differ

No source has a good answer for in-flight state during migrations. The approaches vary by data model:

- **SQL systems** (OpenFGA, Grafana, PocketBase): Traditional migration tooling (Goose, custom Migrator) with transactional atomicity per migration. Advisory locking prevents concurrent migration. In-flight queries see whatever schema exists at query time — no pause-and-resume.
- **KV systems** (Kubernetes, Milvus): Declarative schema evolution via CRDs or catalog updates. No explicit migration — new fields get defaults, removed fields cause validation failures. Admission webhooks can perform one-time migrations.
- **Blob/TSDB systems** (Temporal, VictoriaMetrics, NATS-server): No schema migration mechanism. Temporal relies on protobuf forward compatibility. VictoriaMetrics has no user-defined schema. NATS stream config changes use consistency checks but no migration tool.
- **File-based systems** (cli): Config migration via version-key approach.

The gap is **fundamental**: Most systems assume schema migrations happen when no queries are in flight. Kubernetes explicitly notes "no mechanism to drain in-flight requests before applying breaking migrations."

## Tradeoffs

| Design Choice | Benefit | Cost | Best-Fit Context | Failure Mode |
|---------------|---------|------|-------------------|--------------|
| Optimistic locking via version/revision | High availability under contention; no lock hold time | Retry complexity; can cause thundering herd on hot keys | Read-heavy workloads with moderate write contention | Retry storms on highly contended resources (Kubernetes notes ConfigMap contention) |
| Watch-based cache invalidation | Near-zero staleness; automatic propagation | Store must support watches; persistent connections; complexity | Scenarios requiring strong cache consistency with distributed store | Watch connection drops cause cache staleness until reconnect; etcd watch reconnect window |
| WAL + checkpoint persistence | High write throughput; bounded recovery time | In-flight data loss if crash before checkpoint; complexity | Streaming/messaging systems; high-volume write workloads | Crash between writes and checkpoint loses data; requires careful fsync tuning |
| Blob-based state storage | Fast writes; schema evolution via protobuf | Cannot query individual fields; all state must be loaded to inspect one field | Workflow engines; write-heavy workloads | Deserialization required for any field-level query; can cause memory pressure |
| TTL-only cache expiration | Simple implementation; no invalidation infrastructure needed | Stale reads possible within TTL window; TTL tuning required | Read-heavy workloads where stale reads are acceptable | TTL too short: cache churn and miss storms. TTL too long: stale data accumulation |
| Dual-write migration | Zero-downtime migration; gradual cutover | Double write latency; potential divergence if one write fails | Storage system migrations; blue-green deployments | If legacy write succeeds but new write fails silently, data diverges |
| Push-based cache invalidation (RPC) | Explicit; works across process boundaries | Fragile if broadcast fails silently; requires all nodes reachable | Milvus proxy cache invalidation; environments with known node set | Silent broadcast failure leaves stale caches on some proxies |
| TSO for distributed ordering | Total order of operations; simple consistency reasoning | Logical single point; bottleneck at scale; failover window | Systems needing global operation ordering without distributed locks | TSO leader failure causes brief unavailability; no read-only TSO replicas observed |
| Read-committed + row-level locking | Avoids deadlocks; concurrent writes scale | Non-repeatable reads within transaction; lock contention on hot rows | Write-heavy SQL workloads; systems with deterministic lock ordering (OpenFGA) | Deadlock if lock ordering is non-deterministic; high lock contention under contention |

## Decision Guide

**Should you use optimistic or pessimistic locking?**
- Use optimistic locking when: your storage supports version/revision (etcd, PostgreSQL with version columns, Cassandra with conditional writes); your workload has moderate contention; you prioritize availability.
- Use pessimistic locking when: your workload has high contention on hot keys; you cannot tolerate retry complexity; you have a clear locking primitive (database advisory lock, distributed lock service).
- Avoid both when: your workload is read-heavy with rare writes; eventual consistency within a window is acceptable.

**Should you implement watch-based or timestamp-based cache invalidation?**
- Use watch-based when: your storage is etcd or similar watch-capable KV; you have the infrastructure to maintain persistent watch connections; near-real-time consistency is critical.
- Use timestamp-based when: your storage is SQL without native push invalidation; you can write invalidation entries on mutation and check them on read.
- Use TTL-only when: stale reads within a window are acceptable; you want minimum implementation complexity; your cache size is bounded by natural eviction (LRU, memory pressure).

**Should you use WAL for persistence?**
- Use WAL when: you need durability before final storage commit; you're building a streaming or messaging system; writes are high-volume and immediate persistence is a bottleneck.
- Don't use WAL when: your storage engine already provides durability guarantees; your data model doesn't support append-only logs; the complexity isn't justified by throughput needs.

**Should you use blob or normalized storage for workflow state?**
- Use blob storage (protobuf/JSON) when: write throughput is critical; workflow state doesn't need field-level queries; schema evolution is managed via protobuf versioning.
- Use normalized storage when: you need to query individual workflow attributes; field-level access patterns are diverse; storage footprint is a concern.

**Should you implement explicit migration locking?**
- Use migration locking when: you run in HA mode with multiple nodes; schema migrations could run concurrently with queries; you need to prevent partial migration visibility.
- Don't use it when: single-node deployments; migrations are applied before application start; downtime for migration is acceptable.

## Practical Tips

1. **Use `resourceVersion` for optimistic locking even if your storage doesn't require it.** Kubernetes' pattern of attaching `Preconditions` with `UID` and `ResourceVersion` to mutations is a lightweight way to detect concurrent modifications without distributed locks. `staging/src/k8s.io/apiserver/pkg/storage/interfaces.go:122-165`

2. **Sort lock acquisition keys to prevent deadlocks.** OpenFGA's `MakeTupleLockKeys` (`pkg/storage/sqlite/sqlite.go:265-330`) computes a deterministic sort order for rows being locked, preventing deadlocks when concurrent writes target overlapping sets. This pattern applies to any multi-row SQL mutation.

3. **Implement lock retry with exponential backoff for SQLite.** PocketBase's retry intervals `[50, 100, 150, 200, 300, 400, 500, 700, 1000]ms` (`core/db_retry.go:15-62`) handle SQLite's locking model gracefully without overwhelming the database with retries. Grafana's `inTransactionWithRetryCtx` (`pkg/services/sqlstore/transactions.go:34-93`) uses a similar pattern.

4. **Use advisory locks for schema migrations in HA deployments.** Grafana's `Migrator` (`pkg/services/sqlstore/migrator/migrator.go:214-237`) uses database advisory locks with configurable timeout, ensuring only one node runs migrations even in multi-instance deployments.

5. **Distinguish between sync and async persistence modes.** NATS-server's `SyncAlways` vs `AsyncFlush` pattern (`server/filestore.go:62-71`) lets callers choose durability vs throughput. VictoriaMetrics uses periodic flush intervals as a similar tradeoff. Expose this choice explicitly.

6. **Persist checkpoints for WAL-based recovery.** Milvus' `WALCheckpoint` (`internal/streamingnode/server/wal/utility/checkpoint.go:11-31`) marks recoverable positions. On restart, replay starts from the checkpoint rather than the beginning of the WAL.

7. **Use ULID instead of UUID for time-ordered pagination.** OpenFGA's `ULID` (`pkg/storage/sqlcommon/sqlcommon.go:708`) provides sortable, time-ordered identifiers that can be generated client-side, enabling efficient pagination without server-side cursor state.

8. **Implement bounded in-memory cache with map rebuild.** PocketBase's `store.Store` (`tools/store/store.go:68-78`) uses `ShrinkThreshold` (200 deletions) to trigger map rebuild, avoiding unbounded growth without complex LRU implementation.

9. **Use jittered TTLs to prevent synchronized cache expiration.** OpenFGA's cache entries use jittered TTLs (`pkg/storage/cache.go:458-486`) to prevent all entries from expiring simultaneously and causing thundering herds.

10. **Use checksum validation on recovery.** NATS-server's `recoverFullState()` validates Highwayhash checksum (`server/filestore.go:1897-1905`) to detect corruption. Temporal stores `checksum` in `executions` table (`schema/cassandra/temporal/schema.cql:50-51`). This pattern catches corruption early rather than serving bad data silently.

## Anti-Patterns / Caution Signs

1. **No transaction rollback on migration failure.** The CLI's `cfg.Migrate()` (`internal/config/config.go:182-209`) runs migration `Do()` and writes config on success, but if `Do()` partially modifies state before failing, the in-memory config is not rolled back. The error is returned but the object is inconsistent.

2. **OSS caching stub deployed to production.** Grafana's `OSSCachingService` (`pkg/services/caching/service.go:72-84`) returns no-op for all operations — `HandleQueryRequest` always returns `false`. If OSS caching was intended for production, this stub should not ship.

3. **Dual-write without observability for divergence.** Grafana's `dualWriter` (`pkg/storage/legacysql/dualwrite/dualwriter.go:40-100`) continues if unified write fails when `errorIsOK` is true, with background retry. Silent divergence is possible if the background retry fails without alerting.

4. **Push cache invalidation without confirmation.** Milvus' `ExpireMetaCache()` broadcasts to all proxies but has no confirmation mechanism. If a proxy is unreachable, its cache stays stale. `internal/rootcoord/expire_cache.go:28-49`

5. **No maximum on in-memory alert state cache.** Grafana's `Manager.cache` struct (`pkg/services/ngalert/state/manager.go:48`) has no documented size limit. Under extreme alert counts, memory usage could be unbounded.

6. **AsyncFlush default trades durability without explicit caller acknowledgment.** NATS-server's default `AsyncFlush` (`server/filestore.go:70-71`) batches writes up to 8ms. Callers using `AsyncPersistMode` can lose data on crash. The default is convenient but risky for durability-sensitive workloads.

7. **SQLite concurrent write contention via busy timeout.** PocketBase's `baseLockRetry` (`core/db_retry.go:15-62`) retries 12 times with max 1000ms total wait. Under sustained write load, this can exhaust and fail with "database is locked."

8. **Cache stampede on restart.** OpenFGA has no cache warming — caches start empty. After restart, popular queries hit the database simultaneously (`pkg/storage/storagewrappers/cached_datastore.go:515-518`).

9. **History node last-write-wins silently drops earlier writes.** Temporal's `history_manager.go:1055-1059` uses `txn_id` for conflict resolution — the batch with larger `txn_id` wins. Earlier writes with lower `txn_id` are silently dropped. This is a design choice but can cause data loss in partition scenarios.

10. **No cross-resource atomic operations.** Kubernetes (per-resource etcd), Milvus (cross-coordinator operations via eventual consistency), Temporal (separate workflow execution and task queue updates) — none support ACID transactions across multiple resources. Composite operations require custom coordination or saga patterns.

## Notable Absences

**Distributed cache invalidation.** No source implements cross-node cache invalidation that survives network partitions. OpenFGA, Grafana, and PocketBase have in-process caches only. Kubernetes and Milvus use watch-based push invalidation, but if a node misses a watch event (network partition, restart), its cache can be stale indefinitely until the next explicit refresh or TTL expiration.

**True transactional dual-write.** Grafana's `dualWriter` is the closest approach, but it is not atomic — writes go to legacy, then unified, then success. If the process crashes between legacy commit and unified write, the two diverge. No source implements saga or two-phase commit for cross-storage atomicity.

**Online schema migration for large tables.** OpenFGA, Grafana, and PocketBase use standard SQL migration tools (Goose, custom Migrator) without support for online migrations that add columns or indexes to large tables without table locks. Systems like `pg_repack` or `gh-ost` are not mentioned in any source.

**Cache coherence in multi-node TSO deployments.** Milvus' TSO is centralized — while it can be deployed as an HA cluster, there is no read-only TSO replica to distribute read load. Under extreme scale, the TSO becomes a bottleneck.

**Formal workflow abstraction for long-running operations.** Grafana, PocketBase, and VictoriaMetrics have no standard abstraction for long-running operations. Alert state (Grafana) is managed ad-hoc. Cron jobs (PocketBase) are stored in memory only. Query operations (VictoriaMetrics) are stateless.

## Per-Source Notes

**cli (5/10):** No local database. State is YAML config files and API polling. The migration system is well-designed for config, but the absence of any local database means no workflow state persistence, no caching, and every operation hitting the network. Best for stateless CLI tools; insufficient for anything requiring local state.

**grafana (7/10):** Transaction retry logic and advisory lock migrations are mature. Dual-write for storage migration is a valid pattern with acknowledged tradeoffs. The alert state manager's separation of in-memory cache and persistence is well-structured. OSS caching stub is the main gap — it's a placeholder, not a production implementation.

**kubernetes (8/10):** The gold standard for distributed state management in this study. `storage.Interface`, `GuaranteedUpdate`, watch-based cache invalidation, and Generic Registry pattern are all exemplary. The main concern is complexity — the multi-layer caching (informer + API server cacher + etcd) makes reasoning about staleness non-trivial. No cross-resource transactions is a known limitation.

**milvus (8/10):** TSO-based consistency, atomic etcd transactions, and WAL with checkpoints are strong patterns. Push-based cache invalidation is well-designed but fragile — if broadcast fails silently, caches go stale. No distributed ACID transactions across coordinators is the main gap.

**nats-server (7/10):** The interface segregation (`StreamStore`/`ConsumerStore`) and block-based storage with subject indexing are well-engineered. Write coalescing and elastic pointer cache are sophisticated. The lack of explicit transaction boundaries and the async flush default are accepted tradeoffs for a messaging system.

**openfga (8/10):** Three-tier cache with timestamp-based invalidation is the strongest cache invalidation pattern in this study. Row-level locking with sorted key order prevents deadlocks. ULID pagination and the `OpenFGADatastore` interface composition are strong architectural patterns. In-memory only cache (no distributed cache) and potential cache stampede on restart are the main gaps.

**pocketbase (7/10):** Hook-driven state lifecycle and dual connection pool routing are sophisticated for a SQLite-based system. Lock retry with exponential backoff handles SQLite's concurrency limitations gracefully. The single-writer bottleneck and no distributed cache are architectural constraints, not gaps.

**temporal (8/10):** Durable execution model with history replay is the most mature long-running workflow support in this study. The layered `ExecutionManager` + `ExecutionStore` separation enables multiple storage backends. Range ID fencing for task queues is elegant. Last-write-wins for history nodes trades strong consistency for availability; this is a conscious trade-off.

**victoriametrics (7/10):** Tiered storage with reference-counted parts and merge-on-read is well-suited for time-series workloads. Hard-link snapshots are efficient. The lack of ACID transactions and eventual consistency with configurable flush intervals is appropriate for metrics storage. Not designed for workflow state persistence — this is a deliberate product scope decision.

## Open Questions

1. **How should systems handle cache invalidation during network partitions?** Watch-based push invalidation (Kubernetes, Milvus) can miss events during partition. Timestamp-based invalidation (OpenFGA) requires timestamp consistency across nodes. TTL-only expiration allows stale reads. Is there a pattern that handles partitions gracefully without sacrificing consistency?

2. **What is the right consistency model for cross-coordinator operations in Milvus?** The current model uses eventual consistency and retry loops. Is there a saga or two-phase commit pattern that could make cross-coordinator operations atomic without the complexity of distributed transactions?

3. **How can dual-write be made atomic?** Grafana's dual-write is acknowledged as non-atomic. Is there a practical pattern (outbox, saga, change data capture) that provides eventual consistency with better observability?

4. **Should workflow state persistence be a first-class abstraction?** Temporal's durable execution model is purpose-built. Kubernetes' CRD + controller pattern is general but requires custom implementation. Is there a middle ground — a reusable workflow persistence library that works with arbitrary storage backends?

5. **How should schema migration handle in-flight operations?** All sources defer this to deployment coordination. Is there a code-level pattern that can drain in-flight requests before breaking schema changes, or tolerate concurrent reads during migration?

6. **Is TSO the right model for globally ordered timestamps at scale?** Milvus' TSO is centralized. VictoriaMetrics has no global ordering. Temporal uses per-shard ordering. Is there a decentralized timestamp oracle that scales horizontally?

## Evidence Index

Every evidence reference follows the `path/to/file:NN` format from per-source reports.

### cli
- `internal/gh/gh.go:32-80` — Config interface
- `internal/config/config.go:49-51` — cfg struct
- `internal/config/config.go:182-209` — Migrate()
- `internal/keyring/keyring.go:22-58` — Keyring wrapper
- `api/http_client.go:89-105` — Cached HTTP client with TTL header
- `internal/skills/lockfile/lockfile.go:151-177` — File lockfile with flock

### grafana
- `pkg/services/sqlstore/sqlstore.go:42-56` — SQLStore struct
- `pkg/services/sqlstore/transactions.go:17-94` — Transaction retry logic
- `pkg/services/sqlstore/migrator/migrator.go:214-237` — Advisory lock migrations
- `pkg/services/caching/service.go:72-84` — OSS caching stub
- `pkg/storage/legacysql/dualwrite/dualwriter.go:40-100` — Dual-write routing
- `pkg/services/ngalert/state/manager.go:42-62` — Alert state manager

### kubernetes
- `staging/src/k8s.io/apiserver/pkg/storage/interfaces.go:169-279` — storage.Interface
- `staging/src/k8s.io/apiserver/pkg/storage/etcd3/store.go:457-621` — GuaranteedUpdate retry loop
- `staging/src/k8s.io/apiserver/pkg/storage/interfaces.go:122-165` — Preconditions struct
- `staging/src/k8s.io/apiserver/pkg/storage/cacher/cacher.go:263-344` — Cacher struct
- `staging/src/k8s.io/client-go/tools/cache/reflector.go:105-171` — Reflector watch loop
- `staging/src/k8s.io/client-go/tools/cache/delta_fifo.go:108-158` — DeltaFIFO
- `staging/src/k8s.io/client-go/tools/cache/shared_informer.go:144-250` — SharedInformer

### milvus
- `internal/kv/etcd/etcd_kv.go:765-767` — executeTxn
- `internal/metastore/catalog.go:20-293` — Catalog interfaces
- `internal/rootcoord/meta_table.go:790-832` — MetaTable in-memory cache
- `internal/tso/tso.go:47-56` — TSO oracle
- `internal/rootcoord/expire_cache.go:28-49` — ExpireMetaCache
- `internal/streamingnode/server/wal/recovery/recovery_storage_impl.go:34-105` — WAL recovery
- `internal/streamingnode/server/wal/utility/checkpoint.go:11-31` — WALCheckpoint
- `internal/streamingnode/server/wal/utility/txn_buffer.go:20-68` — TxnBuffer

### nats-server
- `server/store.go:93-137` — StreamStore interface
- `server/store.go:360-378` — ConsumerStore interface
- `server/filestore.go:220-270` — msgBlock struct
- `server/filestore.go:273-279` — cache struct
- `server/filestore.go:1865-1939` — recoverFullState with Highwayhash
- `server/filestore.go:62-71` — SyncAlways and AsyncFlush modes
- `server/filestore.go:8175-8257` — flushPendingMsgsLocked
- `server/filestore.go:6662-6723` — tryExpireCacheLocked
- `server/jetstream_cluster.go:42-87` — JetStream cluster with Raft

### openfga
- `pkg/storage/storage.go:409-421` — OpenFGADatastore interface
- `pkg/storage/storage.go:144-285` — TupleBackend interfaces
- `pkg/storage/sqlite/sqlite.go:395-401` — Read committed with FOR UPDATE
- `pkg/storage/sqlite/sqlite.go:676-683` — Tuple and changelog in transaction
- `pkg/storage/sqlcommon/sqlcommon.go:245-264` — ULID continuation token
- `pkg/storage/storagewrappers/model_caching.go:39-48` — Model caching LRU
- `pkg/storage/storagewrappers/cached_datastore.go:94-148` — Iterator caching
- `pkg/storage/cache.go:215-239` — Cache invalidation per object/relation
- `pkg/storage/cache.go:458-486` — Jittered TTLs

### pocketbase
- `core/base.go:1175-1209` — Dual connection pools
- `core/base.go:490-500` — dualDBBuilder routing
- `core/db_tx.go:14-49` — RunInTransaction with shallow clone
- `core/db_retry.go:15-62` — Lock retry intervals
- `core/db.go:265-448` — Hook-driven saves
- `core/db_tx.go:79-112` — OnComplete callbacks after commit
- `tools/store/store.go:68-78` — Bounded cache with map rebuild
- `core/collection_query.go:49-59` — Collection cache

### temporal
- `common/persistence/persistence_interface.go:32-51` — DataStoreFactory
- `common/persistence/persistence_interface.go:116-167` — ExecutionStore interface
- `common/persistence/execution_manager.go:28-37` — ExecutionManagerImpl
- `common/persistence/data_interfaces.go:344-398` — WorkflowSnapshot/Mutation
- `common/persistence/serialization/serializer.go:108-112` — Serializer interface
- `schema/cassandra/temporal/schema.cql:58-80` — History tree/branch model
- `common/persistence/persistence_interface.go:224-231` — Shard range ID fencing
- `common/persistence/xdc_cache.go:38-41` — XDCCache LRU with TTL

### victoriametrics
- `lib/storage/storage.go:43-160` — Storage struct with caches
- `lib/storage/partition.go:74-148` — Partition with three-tier parts
- `lib/storage/partition.go:484-601` — rawRowsShards sharded buffering
- `lib/storage/inmemory_part.go:14-57` — inmemoryPart with MustStoreToDisk
- `lib/storage/index_db.go:75-151` — indexDB with caches
- `lib/workingsetcache/cache.go:37-127` — Working set cache with file persistence
- `lib/storage/partition.go:151-200` — partWrapper with refCount
- `lib/storage/storage.go:404-446` — MustCreateSnapshot with hard links
- `lib/storage/partition.go:1742-1786` — removeStaleParts retention

---

Generated by dimension `08-state-management-persistence.md`.