# Source Analysis: victoriametrics

## State Management & Persistence

### Source Info

| Field | Value |
|-------|-------|
| Name | victoriametrics |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/victoriametrics` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

VictoriaMetrics is a time-series database (TSDB) purpose-built for metrics and monitoring workloads. Its state management architecture centers on a multi-tier storage system with in-memory buffering, automatic tiering, and periodic disk persistence. The design prioritizes write throughput with configurable flush intervals and uses a three-tier part merging strategy to balance query performance and storage efficiency. Caching is implemented through multiple working-set and LRU caches with optional file-backed persistence. Snapshot and retention mechanisms provide durability and data lifecycle management.

## Rating

**7 / 10** — Good implementation with minor issues

**Rationale**: VictoriaMetrics demonstrates solid TSDB engineering with well-structured tiered storage, reference-counted parts, and sharded caches. However, it lacks true transaction boundaries (no ACID transactions), provides only eventual consistency for ingested data, and relies on periodic flush intervals rather than synchronous persistence. The absence of a formal repository abstraction and the single-node focus limit its suitability for complex multi-tenant workflow state persistence.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Core Storage struct | `Storage` struct with caches, table, metadata storage, and file lock | `lib/storage/storage.go:43-160` |
| Table partitioning | `table` struct manages partitions via `ptws []*partitionWrapper` | `lib/storage/table.go:27-45` |
| Partition struct | `partition` struct with three-tier parts (inmemory, small, big) and raw row buffering | `lib/storage/partition.go:74-148` |
| Raw row buffering | `rawRowsShards` provides sharded write buffering with configurable flush interval | `lib/storage/partition.go:484-601` |
| In-memory part | `inmemoryPart` with chunked buffers and `MustStoreToDisk()` for persistence | `lib/storage/inmemory_part.go:14-57` |
| Index DB | `indexDB` struct with mergeset table and multiple caches for tag filtering | `lib/storage/index_db.go:75-151` |
| Working set cache | Two-tier `Cache` using fastcache with file-backed persistence and expiration | `lib/workingsetcache/cache.go:37-127` |
| MetricID cache | Sharded `metricIDCache` (16 shards) for deduplication tracking | `lib/storage/metric_id_cache.go:31-55` |
| Date-metric cache | Sharded `dateMetricIDCache` for per-day metric tracking | `lib/storage/date_metric_id_cache.go:31-40` |
| Part merging | Automatic merge triggers via `getPartsToMerge()` with `defaultPartsToMerge=15` | `lib/storage/partition.go:1791-1850` |
| Snapshot mechanism | `MustCreateSnapshot()` creates hard links; uses `snapshotLock` mutex | `lib/storage/storage.go:404-446` |
| Read-only mode | Automatic switch to read-only when disk space is low via `isReadOnly` atomic | `lib/storage/storage.go:727-764` |
| Flush intervals | `pendingRowsFlushInterval=2s`, `dataFlushInterval=5s` for durability | `lib/storage/partition.go:48-52` |
| Retention management | `removeStaleParts()` drops parts older than `retentionMsecs` | `lib/storage/partition.go:1742-1786` |
| Reference counting | `partWrapper` with `refCount` atomic and `mustDrop` flag for safe cleanup | `lib/storage/partition.go:151-200` |
| Metrics metadata | `metricsmetadata.Storage` with per-tenant bucket structure | `lib/storage/metricsmetadata/storage.go:35-53` |
| Insert API | `AddRows(mrs []storage.MetricRow)` entry point in vmstorage | `app/vmstorage/main.go:202-214` |
| Storage initialization | `MustOpenStorage()` with cache and index initialization | `lib/storage/storage.go:178-326` |

## Answers to Dimension Questions

### 1. How is state accessed and mutated — direct DB, repository, or event-sourced?

VictoriaMetrics uses **direct storage access through purpose-built TSDB structures**, not a traditional repository pattern. State mutation flows through:

1. **Ingest path**: `AddRows()` buffers rows in sharded `rawRowsShards` (`lib/storage/partition.go:457-480`), then periodically flushed to `inmemoryParts` every `pendingRowsFlushInterval` (2s by default) via `flushRowssToInmemoryParts()` (`lib/storage/partition.go:603-647`).

2. **Persistence**: In-memory parts are stored to disk via `MustStoreToDisk()` (`lib/storage/inmemory_part.go:38-57`), creating `.bin` data files, `.idx` index files, and `.metaindex` files.

3. **Query path**: Data is read through `netstorage` from distributed parts across partition tiers using merge sort.

No event sourcing or traditional DAL/repository abstraction is used. State is stored denormalized in columnar part files organized by time partitions.

### 2. What consistency model does the system provide to callers?

VictoriaMetrics provides **eventual consistency** with configurable durability lag.

- **Write consistency**: Data is visible for querying after `dataFlushInterval` (default 5s, `lib/storage/partition.go:52`). The `pendingRowsFlushInterval` (2s) moves data from raw buffers to in-memory parts, but in-memory parts are not queryable until merged and indexed.

- **Read consistency**: Queries merge results from multiple parts (inmemory, small, big) via sorted merge. No transaction isolation — concurrent reads may see partial flush states.

- **Atomic operations**: Individual metric writes are not atomic. Batch writes are committed via `AddRows()` without per-row acknowledgment.

- **No ACID transactions**: The storage does not support traditional DB transactions. It trades ACID guarantees for write throughput.

- **Read-only mode**: When disk space is low, storage switches to read-only (`lib/storage/storage.go:727-764`) preventing writes but ensuring existing data remains consistent.

### 3. How is cache invalidation handled without stale reads?

VictoriaMetrics uses **time-based expiration and cache rotation** rather than explicit invalidation:

- **Working set cache** (`lib/workingsetcache/cache.go`): Dual-tier cache (`curr`/`prev` fastcache instances) with configurable `cacheExpireDuration` (default 30 minutes). The `Load()` method (`lib/workingsetcache/cache.go:81-127`) loads from file and sets expiration. The cache operates as a write-through with periodic rotation.

- **MetricID cache** (`lib/storage/metric_id_cache.go`): Sharded cache with `rotationPeriod`. A background goroutine (`startRotation()` at line 84) periodically clears shards to prevent stale entries.

- **Tag filters cache** (`lib/storage/index_db.go:125`): LRU cache with TTL-based eviction. No explicit invalidation on writes — stale reads possible until TTL expires.

- **No write-through invalidation**: When new series are ingested, caches are not explicitly updated. Stale reads may occur until cache expiration or rotation.

- **Reference-counted parts**: `partWrapper` (`lib/storage/partition.go:151-200`) uses atomic reference counting to prevent garbage collection of in-use parts, avoiding stale references.

### 4. How is long-running workflow state persisted and resumed?

VictoriaMetrics is **not designed for workflow state persistence**. It is a metrics database, not a workflow engine. However, it does provide mechanisms for surviving restarts:

- **Cache persistence**: Working set caches can be persisted to disk files and reloaded on startup (`lib/workingsetcache/cache.go:81-127`), preserving recently accessed metric IDs and names.

- **Snapshot creation**: `MustCreateSnapshot()` (`lib/storage/storage.go:404-446`) creates hard links to all current parts under a snapshot directory, providing a point-in-time view. Snapshots are not automatically resumed — they are for external consumption (backups, read replicas).

- **Partition retention**: Parts are retained for `retentionMsecs` (configurable), after which `removeStaleParts()` (`lib/storage/partition.go:1742-1786`) deletes stale data.

- **No native workflow resumption**: Long-running operations (e.g., queries) do not persist intermediate state. Queries are stateless and must complete within deadline or be cancelled.

- **No checkpoint mechanism**: Unlike stream processing systems, VictoriaMetrics does not checkpoint in-flight computation.

### 5. What happens to in-flight state during schema migrations?

VictoriaMetrics has **no schema migration mechanism** for user-defined schemas because it stores raw time-series data without a user-defined schema.

- **Implicit schema**: The "schema" is defined by metric names, labels, and timestamp ranges. No ALTER TABLE equivalents.

- **In-flight data during retention changes**: When retention period is modified, `removeStaleParts()` (`lib/storage/partition.go:1742-1786`) removes parts older than the new retention deadline. In-flight queries referencing deleted parts may return partial data or errors.

- **No migration locking**: The storage does not pause writes during configuration changes. Concurrent operations proceed with the old or new configuration depending on timing.

- **Partition-based isolation**: Each partition operates independently with its own `indexDB` and parts list. Schema changes affect new partitions only; existing partitions retain their original structure.

- **No rollback mechanism**: Once parts are merged and deleted per retention policy, data cannot be recovered.

## Architectural Decisions

| Decision | Rationale | Tradeoff |
|----------|-----------|----------|
| Three-tier storage (inmemory/small/big) | Balances write throughput (in-memory) with query performance (merged big parts) | Memory pressure requires tuning; too many in-memory parts degrades query speed |
| Sharded caches (metricIDCache, dateMetricIDCache) | Reduces lock contention on multi-CPU write path | Increased complexity; shard imbalance可能导致热点 |
| Periodic flush (not write-through) | Maximizes ingest throughput by batching I/O | In-flight data loss risk on crash before flush |
| Reference-counted parts | Enables safe concurrent access and deletion | Overhead tracking references; circular ref risk mitigated by `mustDrop` flag |
| File locking for storage exclusivity | Prevents concurrent storage access corruption | Single-writer model limits horizontal write scaling |
| Merge-on-read | Queries merge from multiple tiers transparently | Longer query latency with many small parts; merge overhead |

## Notable Patterns

1. **Tiered merging** (`lib/storage/partition.go:1791-1850`): Parts automatically migrate from in-memory to small to big tiers when part counts exceed thresholds. `defaultPartsToMerge=15` triggers merges.

2. **Dual-tier fastcache** (`lib/workingsetcache/cache.go:50`): `modeSplit` cache uses two fastcache instances with rotation to avoid GC pressure while maintaining large working sets.

3. **Sharded write buffering** (`lib/storage/partition.go:490`): `rawRowsShards` shards writes by hash to reduce mutex contention during high-throughput ingestion.

4. **Hard-link snapshots** (`lib/storage/storage.go:430`): `MustCreateSnapshot()` uses filesystem hard links (not copy-on-write) for efficient point-in-time capture.

5. **Bloom filter cardinality limiting** (`lib/storage/storage.go:86-87`): Hourly and daily series limiters prevent cardinality explosions using bloom filters before expensive storage operations.

6. **Atomic switch for read-only mode** (`lib/storage/storage.go:735`): Uses `CompareAndSwap` on `isReadOnly` to prevent race conditions when disk space is exhausted.

## Tradeoffs

| Aspect | Tradeoff |
|--------|----------|
| Eventual consistency vs. durability | 2-5s flush interval maximizes write throughput but risks data loss on crash |
| No ACID transactions | Write throughput prioritized; no read isolation or atomic multi-row operations |
| Merge-on-read | Simpler storage engine but queries over many small parts are slower |
| Single-node storage focus | No distributed transactions; multi-tenant requires external sharding |
| Implicit schema | No migration tooling needed but no compile-time schema validation |
| Cache invalidation by TTL | Simpler implementation but stale reads possible until expiration |
| Reference counting overhead | Safe cleanup but atomic operations add latency on hot paths |

## Failure Modes / Edge Cases

1. **Crash before flush**: Up to `dataFlushInterval` (5s) of ingested data may be lost if process crashes before flush to disk.

2. **Disk space exhaustion**: Storage switches to read-only mode (`lib/storage/storage.go:735`). In-flight writes fail; reads continue from existing parts.

3. **Merge storms**: Frequent small ingests trigger constant merging; may cause CPU/IO spikes and temporary query slowdown.

4. **Cardinality explosion**: Bloom filter limiters (`lib/storage/storage.go:86-87`) reject writes exceeding hourly/daily limits, but may cause data loss if not monitored.

5. **Stale tag filter cache**: During high churn (many series created/deleted), tag filter cache may return stale metric IDs until TTL expiration.

6. **Partition lock contention**: `ptwsLock` (`lib/storage/table.go:37`) protects partition list; frequent partition creation/retirement under high load may cause contention.

7. **Hard link snapshot failures**: Snapshot creation may fail if filesystem does not support hard links or cross-device links (snapshots are created within same filesystem).

8. **Retention boundary races**: Part deletion in `removeStaleParts()` runs concurrently with queries; may return incomplete results for time ranges near retention cutoff.

## Future Considerations

1. **Write-ahead log (WAL)**: Adding a WAL would provide durability guarantees without sacrificing write throughput, similar to Kafka or InfluxDB's write path.

2. **Explicit cache invalidation**: Integrating write-through invalidation into the ingest path would eliminate stale reads in high-churn scenarios.

3. **Distributed storage**: Current single-node design limits multi-tenant deployments; distributed KV store (like RocksDB) could enable horizontal scaling.

4. **Transaction support**: Optional serializable transactions for correlated writes (e.g., atomic metric deletion and label update) would improve correctness for workflow state.

5. **Schema evolution tooling**: If VictoriaMetrics expands beyond pure metrics, migration tooling for label name changes or metric renaming would be necessary.

## Questions / Gaps

1. **No evidence of transaction isolation**: The analysis found no read-committed or serializable isolation. Is this a conscious design choice or future roadmap item?

2. **No formal repository abstraction**: State is mutated directly through `Storage`, `Partition`, and `Table` structs. Is there a plan to introduce a DAL layer for testability?

3. **No checkpointing for long queries**: Large range queries may take minutes. What happens if the process restarts mid-query? No evidence of query progress persistence.

4. **Cache coherence during merges**: When parts are merged, how are caches (e.g., `metricIDCache`) invalidated? Evidence shows `startRotation()` uses time-based rotation but no explicit invalidation on merge completion.

5. **No observability into in-memory data**: How can operators monitor bytes pending flush in `rawRowsShards`? No metrics exposed for in-flight buffer depth.

---

Generated by `dimensions/08-state-management-persistence.md` against `victoriametrics`.