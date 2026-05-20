# Source Analysis: nats-server

## State Management & Persistence

### Source Info

| Field | Value |
|-------|-------|
| Name | nats-server |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/nats-server` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

NATS-server implements JetStream, its built-in persistence layer, using a dual-store architecture with pluggable `StreamStore` and `ConsumerStore` interfaces supporting both in-memory and block-based file storage. State is organized around streams (message logs) and consumers (subscription state), with per-message TTL and scheduling support via timed hash wheels. The file store uses a block-per-file architecture with write coalescing, elastic pointer caches, and periodic fsync. Clustering uses Raft-based consensus (NRG) for replicated state with snapshot-based recovery. Consumer state (acks, pending, redelivered) is persisted separately in consumer-specific files.

## Rating

**7/10** — Good implementation with minor issues

Rationale: The architecture is well-designed with clear interface segregation (`StreamStore`/`ConsumerStore`), efficient block-based storage with subject indexing, and proper recovery mechanisms. However, there is no formal transaction boundary system, async flush modes trade durability for performance without explicit caller acknowledgment, and migration handling for schema/state changes lacks explicit documentation.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Storage interfaces | `StreamStore` and `ConsumerStore` interfaces define abstraction | `server/store.go:93-137`, `server/store.go:360-378` |
| Storage types | `FileStorage` and `MemoryStorage` constants | `server/store.go:33-38` |
| StreamState struct | Core state tracking for streams | `server/store.go:163-177` |
| ConsumerState struct | `{Delivered, AckFloor, Pending, Redelivered}` | `server/store.go:387-398` |
| FileStore struct | Main file-based store with block management | `server/filestore.go:174-217` |
| msgBlock struct | Per-file message block with cache and delete tracking | `server/filestore.go:220-270` |
| Memory store struct | In-memory store using `map[uint64]*StoreMsg` | `server/memstore.go:33-52` |
| Write cache | `cache` struct with write pointer and flush logic | `server/filestore.go:273-279` |
| Cache expiration | `tryExpireCacheLocked()` with `CacheExpire` timer | `server/filestore.go:6662-6723` |
| Write flush | `flushPendingMsgsLocked()` batching writes | `server/filestore.go:8175-8257` |
| State recovery | `recoverFullState()` with Highwayhash checksum | `server/filestore.go:1865-1939` |
| Sync options | `SyncAlways` and `AsyncFlush` modes | `server/filestore.go:62-71` |
| Subject indexing | `stree.SubjectTree` for O(1) subject lookups | `server/filestore.go:195`, `server/memstore.go:38` |
| TTL management | `thw.HashWheel` for timed hash wheel | `server/filestore.go:213`, `server/memstore.go:49` |
| Consumer state encoding | `encodeConsumerState()` binary format | `server/store.go:401-461` |
| Stream replication state | `StreamReplicatedState` for NRG consensus | `server/store.go:227-236` |
| JetStream cluster | `jetStreamCluster` struct with Raft meta | `server/jetstream_cluster.go:42-87` |
| Snapshot interface | `Snapshot(deadline, includeConsumers, checkMsgs)` | `server/store.go:134` |
| Snapshot result | `{Reader, State, errCh}` for async snapshots | `server/store.go:197-202` |
| Consistency checks | Batch `FastBatchOpCommit` with `canConsistencyCheck` | `server/stream.go:7130`, `server/stream.go:5522-5586` |

## Answers to Dimension Questions

### 1. How is state accessed and mutated — direct DB, repository, or event-sourced?

State is accessed through the `StreamStore` and `ConsumerStore` repository interfaces (`server/store.go:93-137`, `server/store.go:360-378`). Two implementations exist:
- **memStore** (`server/memstore.go`): In-memory map with `stree.SubjectTree` for subject indexing
- **fileStore** (`server/filestore.go`): Block-per-file on disk with per-block `stree.SubjectTree[SimpleState]` subject state cache

NATS-server is not event-sourced — it stores current state directly. However, JetStream clustering replicates operations via Raft (NRG) where entries are applied as Commands, making the replication log effectively serve as an event source for cluster consistency (`server/raft.go:3517`, `applyCommit`).

Mutation is via `StoreMsg()`, `RemoveMsg()`, `Purge()` on `StreamStore`, and `UpdateDelivered()`, `UpdateAcks()` on `ConsumerStore`. Batch operations use `FastBatchOpCommit` (`server/stream.go:5522-5586`) with optional consistency checks.

### 2. What consistency model does the system provide to callers?

NATS-server provides **tunable consistency** with two modes:

- **DefaultPersistMode** (`server/stream.go:186-197`): Synchronous flush — `FlushAllPending()` blocks until data is on disk
- **AsyncPersistMode** (`server/stream.go:193-196`): Write-behind — returns immediately, flush happens in background

For file storage, `SyncAlways` (`server/filestore.go:62`) forces fsync after every write. The default `AsyncFlush` batches writes up to `maxFlushWait` (8ms default) via `spinUpFlushLoop()`.

In clustered mode, **Raft consensus** (`server/jetstream_cluster.go`) ensures replicated state. Stream operations go through `streamMsgOp`, `deleteMsgOp`, `purgeStreamOp` entries replicated via NRG. Quorum must be reached before acknowledgment.

Consistency checking during batch commits (`canConsistencyCheck` in `server/stream.go:6179-6801`) validates sequence numbers and message accounting before committing. Checksum validation on `recoverFullState()` (`server/filestore.go:1896-1906`) detects corruption.

### 3. How is cache invalidation handled without stale reads?

**Multi-level caching** with time-based expiration:

1. **Write cache** (`cache` struct, `server/filestore.go:273-279`): Write pointer (`wp`) tracks unflushed bytes. `flushPendingMsgsLocked()` (`server/filestore.go:8175`) flushes to disk. `CacheExpire` duration (default 5s) controls inactivity-based expiration.

2. **Cache expiration timer**: `tryExpireCacheLocked()` (`server/filestore.go:6662`) expires cache based on `CacheExpire` after inactivity period. `startCacheExpireTimer()` (`server/filestore.go:6577`) resets timer on activity.

3. **Elastic pointer pattern**: `msgBlock.ecache` (`server/filestore.go:247`) holds weak reference for cache recycling when memory pressure increases.

4. **Subject state cache (fss)**: Per-block `stree.SubjectTree[SimpleState]` tracks per-subject message counts. `fssNotLoaded()` check loads block messages on demand. `SubjectStateExpire` controls FSS expiration.

5. **Write coalescing**: Multiple small writes batched before flush. `bytesPending()` (`server/filestore.go:8185`) returns pending data for the batch.

Stale reads are prevented by: (a) holding lock across flush (`fs.mu`), (b) `syncAlways` mode for immediate fsync, (c) Highwayhash checksum validation on recovery (`server/filestore.go:1897-1905`).

### 4. How is long-running workflow state persisted and resumed?

**Consumer state persistence** (`server/store.go:387-398`, `server/store.go:401-461`):
- `ConsumerState` struct: `{Delivered, AckFloor, Pending, Redelivered}`
- Binary-encoded via `encodeConsumerState()` into `.dat` files
- `ConsumerStore` interface methods: `UpdateDelivered()`, `UpdateAcks()`, `Update()` for atomic updates
- `BorrowState()` allows temporary state borrowing for efficiency

**Stream snapshots** (`server/store.go:197-202`):
- `SnapshotResult` contains `{Reader io.ReadCloser, State StreamState, errCh chan string}`
- `Snapshot(deadline, includeConsumers, checkMsgs)` (`server/filestore.go:12174`) creates point-in-time snapshot
- Used for stream replication and backup

**Recovery mechanisms**:
- `recoverFullState()` (`server/filestore.go:1865`) loads `index.db` with full stream state
- `recoverTTLState()` (`server/filestore.go:2157`) reloads timed hash wheel (`thw.db`)
- `recoverMsgSchedulingState()` (`server/filestore.go:2242`) reloads scheduled messages (`sched.db`)
- `expireMsgsOnRecover()` (`server/filestore.go:2529`) processes age-based cleanup on startup

**Cluster migration**: Stream reassignments tracked via `streamAssignment` (`server/jetstream_cluster.go:169-187`) with migration monitoring goroutines (`startMigrationMonitoring` at `server/jetstream_cluster.go:3231`). In-flight operations tracked via `inflightStreamInfo` (`server/jetstream_cluster.go:90-94`).

### 5. What happens to in-flight state during schema migrations?

**No explicit schema migration system exists.** The search for "migration" and "schema" in the codebase returned only:
- Stream migration between servers (`server/jetstream_cluster.go:3224-3237`, `server/jetstream_cluster.go:6474-6487`) — moving stream ownership
- MQTT retained message migration tests (`server/mqtt_test.go:3548`)
- Account/reservation consistency tests

**What happens during stream config changes**:
- Stream config updates via `UpdateConfig()` (`server/store.go:128`) can change retention limits, max msgs, max bytes, etc.
- The `Dirty()` flag (`server/filestore.go:207`) tracks when stream is modified but not yet synced to `index.db`
- If stream is reconfigured mid-operation, consistency checks (`canConsistencyCheck`) will validate state

**For consumer state**:
- Consumer config updates via `UpdateConfig()` (`server/ConsumerStore:368`) allow online reconfiguration
- State is preserved across config changes via `Update()` / `ForceUpdate()`
- `ErrStoreOldUpdate` (`server/store.go:69`) rejects consumer updates older than current state

**Recovery after schema changes**:
- `recoverFullState()` (`server/filestore.go:1865`) validates version via `fullStateMagic` and version range check (`server/filestore.go:1921`)
- If version mismatch, the `index.db` is removed and stream rebuilt from `.blk` files
- This is effectively a "reset and rebuild" strategy rather than live migration

## Architectural Decisions

| Decision | Rationale | Evidence |
|----------|-----------|----------|
| Block-per-file storage | Sequential writes are fast, easy to compact and expire | `server/filestore.go:220-270` msgBlock |
| Subject tree indexing (stree) | O(1) subject lookups vs full scan | `server/filestore.go:195` psim |
| Elastic pointer cache | Memory pressure handling without complex GC | `server/filestore.go:247` ecache |
| Timed hash wheel for TTL | O(1) expiration checks vs linear scan | `server/filestore.go:213` ttls |
| Binary encoding for consumer state | Compact, versioned, recoverable | `server/store.go:401-461` |
| Highwayhash for state integrity | Fast checksum for corruption detection | `server/filestore.go:1897-1905` |
| Raft for cluster replication | Built-in consensus for distributed state | `server/jetstream_cluster.go:42-87` |
| Write-behind by default | Throughput over durability for async mode | `server/filestore.go:70-71` AsyncFlush |

## Notable Patterns

1. **Interface segregation**: `StreamStore` and `ConsumerStore` are clean abstractions enabling testability and multiple implementations (`server/store.go:93-137`, `server/store.go:360-378`)

2. **Block-based storage with interior deletes**: Messages stored in `.blk` files; delete sequences tracked via AVL seqsets (`mb.dmap` at `server/filestore.go:254`) enabling efficient gap representation

3. **Elastic pointer cache recycling**: `elastic.Pointer[cache]` at `server/filestore.go:247` allows cache memory to be reclaimed while preserving strong references during active writes

4. **Write coalescing with activity tracking**: Cache expiration resets on both reads (`llts`) and writes (`lwts`), preventing premature eviction during bursts (`server/filestore.go:6565-6702`)

5. **Timed hash wheel for message scheduling**: `MsgScheduling` struct at `server/filestore.go:214` enables future message delivery with O(1) lookup via `thw.HashWheel`

6. **Consistency check gating**: Batch operations conditionally run consistency checks based on `canConsistencyCheck` flag, avoiding redundant validation overhead (`server/stream.go:7130`)

7. **Snapshot-based recovery**: Full state snapshot in `index.db` with Highwayhash integrity check, enabling atomic recovery from corruption (`server/filestore.go:1865-1906`)

## Tradeoffs

| Tradeoff | Description |
|----------|-------------|
| AsyncFlush vs durability | Default `AsyncFlush` batches writes up to 8ms, trading durability for throughput. Callers using `AsyncPersistMode` can lose data on crash. |
| Block size tuning | `BlockSize` (default 4MB) affects write amplification vs memory usage. Larger blocks = better sequential access but more memory pressure. |
| CacheExpire vs memory | Shorter `CacheExpire` = less memory usage but more disk I/O. Longer = better read performance but higher memory footprint. |
| SubjectStateExpire performance | If `SubjectStateExpire` is too short, subject statistics require block loading on every query. |
| No distributed transactions | JetStream clustering uses Raft consensus but does not support ACID transactions across multiple streams or consumers. |
| Rebuild vs migrate | Schema changes to `index.db` cause full rebuild from `.blk` files rather than live migration, causing downtime for large stores. |

## Failure Modes / Edge Cases

1. **Cache flush failure**: If `flushPendingMsgsLocked()` (`server/filestore.go:8175`) encounters a write error during I/O, it calls `dirtyCloseWithRemove()` and `rebuildStateLocked()` to recover lost data (`server/filestore.go:8224-8233`)

2. **Corrupt state file**: If Highwayhash checksum fails on `recoverFullState()`, the `index.db` is deleted and stream rebuilt from blocks (`server/filestore.go:1903-1905`)

3. **Lost stream data**: On hard crash during write, `LostStreamData` struct (`server/store.go:191-195`) captures message sequences that were never persisted, reported via `ld` in `flushPendingMsgsLocked()`

4. **Race between cache expiry and new writes**: `resetCacheExpireTimer()` (`server/filestore.go:6565`) resets timer on write activity; if write and expire happen simultaneously, lock ordering (`mb.mu`) provides consistency

5. **Consumer state version mismatch**: `ErrStoreOldUpdate` (`server/store.go:69`) rejected when consumer update is older than current state, preventing ack-floor regression

6. **Snapshot deadline exceeded**: Snapshot operations have deadlines; if exceeded, the `errCh` channel receives the error and partial snapshot may be discarded (`server/store.go:199-201`)

7. **Migration peer removal**: During stream migration, if peer is removed before migration completes, `stopMigrationMonitoring()` is deferred and state is cleaned up (`server/jetstream_cluster.go:3231`)

8. **Memory store TTL accuracy**: Timed hash wheel has bounded precision; messages with very short TTLs (< tick interval) may persist slightly beyond intended expiration (`server/filestore.go:6812`)

## Future Considerations

1. **Distributed transactions**: Current Raft replication does not support multi-stream ACID transactions; consider saga or two-phase commit patterns for workflows spanning multiple streams

2. **Incremental schema migration**: Currently schema changes to `index.db` cause full rebuild; incremental migration would reduce downtime for large stores

3. **Read replicas / follower reads**: JetStream clustering currently requires leader for all reads; read replicas could improve read throughput at expense of freshness

4. **Tiered storage**: No native cold storage tier; messages could be offloaded to object storage (S3) after age threshold, similar to VictoriaMetrics' tiered storage

5. **Transaction API surface**: Expose explicit transaction boundaries for callers to batch multiple stream/consumer mutations atomically

## Questions / Gaps

1. **No explicit transaction rollback**: If a batch write fails mid-way, there is no mechanism to roll back already-written messages — only crash recovery via `LostStreamData`

2. **No cache invalidation on external modification**: If `index.db` is externally modified, there is no invalidation signal to expire stale cache entries

3. **Consumer state scalability**: Consumer state stored in single `.dat` file per consumer; at high pending message counts, this could become a bottleneck. No sharding strategy observed.

4. **No cross-stream consistency**: Operations on multiple streams (e.g., fan-out) have no atomic guarantee — if one fails, others may succeed

5. **Limited observability into cache state**: While `CacheExpire` and `SubjectStateExpire` exist, there is no Prometheus metric or structured log for cache hit/miss rates to tune these values

6. **Migration quorum safety**: Stream migration uses peer count vs replica count comparison (`server/jetstream_cluster.go:3729`) but the exact safety properties during network partitions are not clearly documented

---

Generated by `dimensions/08-state-management-persistence.md` against `nats-server`.