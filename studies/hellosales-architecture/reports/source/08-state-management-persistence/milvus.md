# Source Analysis: milvus

## State Management & Persistence

### Source Info

| Field | Value |
|-------|-------|
| Name | milvus |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/milvus` |
| Language / Stack | Go + C++ (internal/core/) + Rust (tantivy) |
| Analyzed | 2026-05-20 |

## Summary

Milvus implements a multi-layer state management architecture using etcd as the primary metadata store with object storage (S3) for blob data, and a streaming WAL system for write durability. State is accessed through a Catalog/Repository pattern (not event-sourced), with Coordinators (rootcoord, datacoord, querycoordv2) maintaining in-memory caches backed by persistent storage. Cache invalidation is push-based via RPC. Long-running operations use WAL checkpoints for recovery, and schema migrations fence and flush in-flight segments before persisting.

## Rating

**8/10** — Good implementation with minor issues. The architecture is well-structured with clear separation between coordinators and execution nodes, atomic etcd transactions, and TSO-based consistency. Gaps include lack of distributed transactions across coordinators, limited rollback for schema changes, and eventual consistency model not being fully transparent to callers.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| etcd KV | `executeTxn()` commits etcd transactions atomically | `internal/kv/etcd/etcd_kv.go:765-767` |
| Catalog Interface | `RootCoordCatalog`, `DataCoordCatalog`, `QueryCoordCatalog` interfaces | `internal/metastore/catalog.go:20-293` |
| MetaTable | In-memory cache with `UpdateTimestamp`-based time-travel correctness | `internal/rootcoord/meta_table.go:790-832` |
| TSO | `timestampOracle` provides distributed timestamps with monotonic guarantees | `internal/tso/tso.go:47-56, 172-215` |
| Cache Interface | `Cache` interface with `RemoveCollection()`, `RemoveDatabase()` invalidation | `internal/proxy/meta_cache.go:55-105` |
| WAL Recovery | `recoveryStorageImpl` tracks recovery info, replays WAL for state restore | `internal/streamingnode/server/wal/recovery/recovery_storage_impl.go:34-105` |
| Checkpoint | `WALCheckpoint` persisted to catalog for cross-cluster recovery | `internal/streamingnode/server/wal/utility/checkpoint.go:11-31` |
| TxnBuffer | `TxnBuffer` buffers in-flight transactions with begin/commit/rollback | `internal/streamingnode/server/wal/utility/txn_buffer.go:20-68` |
| Schema Change Flush | `handleAlterCollection()` flushes segments before schema change | `internal/streamingnode/server/wal/recovery/recovery_storage_impl.go:591-617` |
| WriteBuffer | `WriteBuffer` with in-memory buffers and checkpoint persistence | `internal/flushcommon/writebuffer/write_buffer.go:41-151` |
| SnapshotMeta | `snapshotMeta` with catalog for persistent storage split | `internal/datacoord/snapshot_meta.go:169-199` |
| Consistency Levels | `Eventually`, `Bounded staleness`, `Session`, `Strong` consistency support | `internal/proxy/meta_cache.go:113` |

## Answers to Dimension Questions

### 1. How is state accessed and mutated — direct DB, repository, or event-sourced?

**Direct mutation via Catalog/Repository pattern**, not event-sourced.

- **Metadata**: State is stored in etcd (key-value) and accessed through `Catalog` interfaces. `RootCoordCatalog` (`internal/metastore/catalog.go:20-108`) manages database/collection/partition metadata; `DataCoordCatalog` (`internal/metastore/catalog.go:184-272`) manages segment/index/compaction; `QueryCoordCatalog` (`internal/metastore/catalog.go:274-293`) manages load/distribution.
- **Coordinators** maintain in-memory caches (`MetaTable` in `internal/rootcoord/meta_table.go:162-187`) backed by persistent catalog.
- **Blob data**: Stored in object storage (S3/MinIO), with references tracked in etcd via `snapshotMeta` (`internal/datacoord/snapshot_meta.go:169-199`).
- **No event sourcing**: Mutations are direct writes through coordinators, not append-only event logs.

### 2. What consistency model does the system provide to callers?

**Eventual consistency with TSO (Timestamp Oracle) as the backbone**, supporting configurable consistency levels.

- **TSO** (`internal/tso/tso.go:47-56`): Centralized timestamp oracle provides globally monotonic timestamps; all nodes sync with TSO for distributed ordering.
- **Consistency levels** (`internal/proxy/meta_cache.go:113`): Callers can specify `Eventually`, `Bounded staleness`, `Session`, or `Strong` consistency.
- **etcd transactions** (`internal/kv/etcd/etcd_kv.go:765-798`): Atomic multi-key operations with optional predicates (optimistic locking via `CompareVersionAndSwap` at line 633-647).
- **Limitation**: No distributed ACID transactions spanning multiple coordinators. Cross-coordinator operations rely on eventually-consistent cache propagation.

### 3. How is cache invalidation handled without stale reads?

**Push-based invalidation via RPC to all proxies.**

- `ExpireMetaCache()` (`internal/rootcoord/expire_cache.go:28-49`) broadcasts invalidation requests to all proxy nodes.
- `InvalidateCollectionMetaCache()` (`internal/proxy/impl.go:125-237`) handles invalidation types: drop, rename, load, release, alter operations.
- `LeaderCacheObserver` (`internal/querycoordv2/observers/leader_cache_observer.go:35`) and `CollectionObserver` (`internal/querycoordv2/observers/collection_observer.go:422-434`) invalidate shard/collection caches on leader or resource changes.
- **Time-travel correctness** (`internal/rootcoord/meta_table.go:797-805`): Cache invalidation uses `UpdateTimestamp` (not `CreateTime`) so queries at past timestamps before schema alteration fall back to catalog.
- **Limitation**: No built-in TTL or passive expiration; stale reads possible if invalidation broadcast fails silently.

### 4. How is long-running workflow state persisted and resumed?

**WAL-based persistence with checkpoint and TxnBuffer for in-flight transactions.**

- **Write-Ahead Log** (`internal/streamingnode/server/wal/recovery/recovery_storage_impl.go:34-105`): WAL records all write operations; `RecoverRecoveryStorage()` replays WAL to restore state on restart.
- **Checkpoints** (`internal/streamingnode/server/wal/utility/checkpoint.go:11-31`): `WALCheckpoint` is persisted to catalog; `notifyPersist()` (`recovery_storage_impl.go:174-180`) triggers background persistence.
- **TxnBuffer** (`internal/streamingnode/server/wal/utility/txn_buffer.go:20-68`): Buffers in-flight transactions with `HandleImmutableMessages()` processing begin/commit/rollback.
- **Balancer recovery** (`internal/streamingcoord/server/balancer/balancer_impl.go:33-68`): `RecoverBalancer()` restores channel assignments from catalog via `channel.RecoverChannelManager()`.
- **Segment recovery** (`internal/streamingnode/server/wal/recovery/segment_recovery_info.go:60-125`): Tracks segment-level recovery state with `ConsumeDirtyAndGetSnapshot()` for persistence.
- **WriteBuffer** (`internal/flushcommon/writebuffer/write_buffer.go:41-151`): Data node buffers writes in memory, flushes to storage at checkpoints.

### 5. What happens to in-flight state during schema migrations?

**Schema changes trigger segment flush and fencing before persisting the new schema.**

- `handleAlterCollection()` (`internal/streamingnode/server/wal/recovery/recovery_storage_impl.go:591-617`): When a schema change occurs, all segments are flushed before the alter operation is persisted.
- `AlterCollection()` (`internal/streamingnode/server/wal/interceptors/shard/shards/shard_manager_collection.go:153-155`): Flushes and fences segment allocations during schema changes.
- `ConfirmPrimaryResourceGroupReady()` (`internal/streamingcoord/server/balancer/balancer_impl.go:171-174`): Blocks during WAL migration to ensure consistent state.
- **Limitation**: In-flight buffered writes (not yet flushed) during schema migration may need explicit handling; no full rollback mechanism for partial schema change failures.

## Architectural Decisions

1. **etcd-only metadata with no alternate storage adapter**: All coordinators (rootcoord, datacoord, querycoordv2) share the same etcd instance for metadata; no pluggable storage backend for catalog. See `internal/kv/etcd/etcd_kv.go` and `internal/metastore/catalog.go`.

2. **In-memory caches with push-based invalidation**: Coordinators maintain in-memory state (`MetaTable`, `meta`, etc.) with explicit RPC-based invalidation broadcasts rather than TTL or version-based cache.

3. **TSO as single point for distributed ordering**: Timestamp oracle (`internal/tso/tso.go`) is a centralized service; while it can be deployed as an HA cluster, it creates a logical single point of coordination.

4. **WAL separates durable storage from object storage**: Streaming writes go to WAL first, then replayed/compacted into segments stored in object storage (S3/MinIO), decoupled by `snapshotMeta` (`internal/datacoord/snapshot_meta.go`).

5. **Multi-level catalog abstraction**: Separate catalog interfaces for RootCoord, DataCoord, QueryCoord, and StreamingCoord allow each coordinator to manage its own metadata domain while sharing the same etcd backend.

## Notable Patterns

1. **Catalog/Repository Pattern**: `RootCoordCatalog`, `DataCoordCatalog`, `QueryCoordCatalog` interfaces abstract persistent storage at `internal/metastore/catalog.go:20-293`.

2. **Push Cache Invalidation**: Coordinators broadcast invalidation to all proxies via `ExpireMetaCache()` rather than pull-based TTL.

3. **WAL Replay for Recovery**: Streaming system recovers state by replaying WAL from persistent storage (`internal/streamingnode/server/wal/recovery/recovery_storage_impl.go`).

4. **TxnBuffer for Streaming Transactions**: In-flight streaming transactions are buffered in memory and processed in immutable message batches (`internal/streamingnode/server/wal/utility/txn_buffer.go`).

5. **Optimistic Locking with etcd**: `CompareVersionAndSwap()` at `internal/kv/etcd/etcd_kv.go:633-647` provides version-based conflict detection.

## Tradeoffs

1. **Single etcd cluster for all metadata**: Shared etcd for all coordinators simplifies deployment but creates noise contention and blast radius if etcd becomes overloaded.

2. **No Distributed ACID Transactions**: Mutations across coordinators (e.g., collection drop requiring rootcoord + datacoord coordination) rely on eventual consistency and retry loops, not atomic multi-phase commits.

3. **Push invalidation fragility**: Cache invalidation depends on successful RPC to all proxies; silent failures leave stale caches.

4. **TSO bottleneck**: Centralized timestamp oracle can become a bottleneck at extreme scale; no read-only TSO replicas to distribute load.

5. **Schema migration blocking**: Schema changes flush all segments synchronously, potentially blocking writes during large migrations.

## Failure Modes / Edge Cases

1. **etcd network partition**: Coordinators lose ability to update metadata; reads may return stale cached data; writes fail. No split-brain handling.

2. **Proxy node failure during invalidation broadcast**: Partial invalidation leaves some proxies with stale collection metadata; recovery depends on next explicit operation or cache TTL (if configured).

3. **WAL replay failure on restart**: If WAL recovery info is corrupted or missing, streaming node may be unable to recover in-flight transaction state; potential data loss.

4. **Schema change during active streaming**: `AlterCollection()` fences segment allocations, but buffered writes not yet flushed may be lost or require compensating transactions.

5. **TSO failover**: TSO cluster uses etcd for leader election (`internal/tso/tso.go:77-101`); failover introduces a brief unavailability window for distributed timestamp generation.

6. **Segment manager race conditions**: In-memory segment maps (`internal/datacoord/segment_manager.go:131-146`) updated without distributed locking; relies on datacoord being single-instance or etcd watches for eventual consistency.

## Future Considerations

1. **Pluggable metastore**: Extending catalog abstraction to support PostgreSQL or SQLite for metadata would enable single-node deployments without etcd dependency.

2. **Distributed transactions**: Implementing two-phase commit or saga pattern across coordinators for atomic cross-coordinator operations.

3. **Passive cache invalidation with TTL**: Adding TTL-based expiration as a fallback to push invalidation for resilience against silent broadcast failures.

4. **Read-only TSO replicas**: Distributing timestamp read load across multiple TSO replicas to reduce central bottleneck.

5. **Schema versioning with backward compatibility**: Supporting non-blocking schema changes to allow concurrent reads during migration.

## Questions / Gaps

1. **No evidence of transaction retry policy**: While `executeTxn()` at `internal/kv/etcd/etcd_kv.go:765-767` uses etcd transactions, retry/backoff logic for transient failures was not clearly identified in the storage layer.

2. **Cache staleness on network failures**: Push invalidation failure modes are not explicitly handled with fallback mechanisms in the proxy layer.

3. **No documented rollback for schema migrations**: `handleAlterCollection()` flushes segments, but rollback path if schema change fails mid-way was not identified.

4. **Limited observability into in-memory state**: While coordinators maintain `MetaTable` and `meta` structs, no evidence of introspection APIs (e.g., dump cache state) for debugging.

---

Generated by `dimensions/08-state-management-persistence.md` against `milvus`.