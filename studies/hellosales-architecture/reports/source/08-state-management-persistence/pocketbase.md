# Source Analysis: PocketBase

## State Management & Persistence

### Source Info

| Field | Value |
|-------|-------|
| Name | PocketBase |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/pocketbase` |
| Language / Stack | Go (SQLite via github.com/pocketbase/dbx) |
| Analyzed | 2026-05-20 |

## Summary

PocketBase implements a dual-database SQLite architecture with separate concurrent and nonconcurrent connection pools per database. It uses an in-memory `store.Store` for runtime caching (collections, settings), with a sophisticated locking-retry mechanism to handle SQLite's concurrency limitations. State mutation follows a hook-driven model that intercepts all save/delete operations, with deferred success/error callbacks that execute after transaction commit. Collections are eagerly cached on bootstrap and invalidated on any collection CRUD operation.

## Rating

**7/10** — Good implementation with notable SQLite concurrency constraints. The hook-based state lifecycle is well-designed, but the lack of true distributed caching and single-primary-key limitations are architectural constraints rather than gaps.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Dual DB connections | `initDataDB()` creates separate concurrent (120 max conns) and nonconcurrent (1 conn) pools for data.db | `core/base.go:1175-1209` |
| Dual DB for aux | `initAuxDB()` creates separate concurrent (20 max conns) and nonconcurrent (1 conn) pools for auxiliary.db | `core/base.go:1235-1260` |
| Auto-routing SELECT | `DB()` returns `dualDBBuilder` that routes SELECT to concurrent pool, writes to nonconcurrent | `core/base.go:490-500` |
| Transaction support | `RunInTransaction()` uses nested app clones with `TxAppInfo` tracking | `core/db_tx.go:14-49` |
| Retry on lock | `baseLockRetry()` retries with intervals on "database is locked" errors, max 12 attempts | `core/db_retry.go:15-62` |
| Collection cache | `ReloadCachedCollections()` stores collections array in `app.Store()` under `StoreKeyCachedCollections` | `core/collection_query.go:49-59` |
| Cache read path | `FindCachedCollectionByNameOrId()` reads from store, falls back to DB if uninitialized | `core/collection_query.go:99-113` |
| Settings cache | `Settings()` returns cached `*Settings` field, reloaded via `ReloadSettings()` hook | `core/base.go:598-601` |
| In-memory store | `store.Store[K,T]` is a concurrent-safe map with Get/Set/GetOrSet operations | `tools/store/store.go:12-257` |
| Hook-driven saves | `OnModelCreate/Update/Delete()` hooks intercept all state mutations | `core/db.go:265-448` |
| Deferred callbacks | `txInfo.OnComplete()` callbacks execute after transaction commits | `core/db_tx.go:79-112` |
| Migrations runner | `MigrationsRunner.Up()` runs migrations in nested aux+data transactions | `core/migrations_runner.go:119-173` |
| Automigrate | Plugin hook binds to `OnCollectionCreate/Update/DeleteRequest` | `plugins/migratecmd/migratecmd.go:82-86` |
| WAL checkpoint cron | Daily `PRAGMA wal_checkpoint(TRUNCATE)` cron job registered | `core/base.go:1360-1375` |
| Record model | `Record` struct embeds `store.Store` for data, expand, and custom visibility | `core/record_model.go:39-51` |

## Answers to Dimension Questions

### 1. How is state accessed and mutated — direct DB, repository, or event-sourced?

State is accessed through the `App` interface which wraps `dbx.Builder` query builders. There is no traditional repository pattern; instead, a **hook-driven lifecycle** is used:

- **Reads**: Via `ConcurrentDB()` (for SELECTs) using `dbx.SelectQuery` builders or model-specific query methods like `FindRecordById`, `FindCollectionByNameOrId`.
- **Writes**: Via `NonconcurrentDB()` (for INSERT/UPDATE/DELETE) through `App.Save()` / `App.Delete()`.
- **Cache reads**: Collections are cached in `app.Store()` and read via `FindCachedCollectionByNameOrId()`. Settings are cached in `app.settings` field.
- **Event sourcing-like**: Hooks (`OnModelCreate`, `OnModelAfterCreateSuccess`, etc.) fire before and after state changes. The `DBExporter` interface allows models to customize their export format.

Evidence: `core/db.go:175-231` shows `Save()` triggers `OnModelCreate`/`OnModelUpdate` hooks, which eventually call `db.Insert()` or `db.Update()` through the nonconcurrent DB.

### 2. What consistency model does the system provide to callers?

PocketBase provides **sequential consistency per SQLite database** with the following guarantees:

- **Writes are serialized** through the nonconcurrent DB connection (single connection, queued operations).
- **Reads can be concurrent** via the concurrent pool (up to 120 connections for data.db).
- **Transactions are serializable** within a single `RunInTransaction()` call — nested transactions reuse the same `*dbx.Tx`.
- **Deferred hooks**: Success/error hooks for model operations inside transactions fire only **after commit** via `txInfo.OnComplete()` callbacks (`core/db_tx.go:85-90`).
- **No distributed consistency**: There is no multi-node coordination. The `.notify` directory is used as a file-based cross-platform workaround for synchronizing runtime states between multiple PocketBase instances pointing to the same `pb_data`.

Evidence: `core/base.go:520-528` documents that `NonconcurrentDB()` "can process only 1 db operation at a time (other queries queue up)".

### 3. How is cache invalidation handled without stale reads?

Cache invalidation is **implicit and automatic** through hook bindings:

- Collections cache is invalidated on every collection create/update/delete via hook bindings in `registerCollectionHooks()`.
- The cache is updated through `app.Store().Set(StoreKeyCachedCollections, collections)` in `ReloadCachedCollections()`.
- If cache is uninitialized (e.g., during system migration), `FindCachedCollectionByNameOrId()` falls back to direct DB query (`core/collection_query.go:100-104`).

For the in-memory `store.Store` there is **no TTL or LRU eviction** — it grows until manually reset or the `ShrinkThreshold` (200 deletions) triggers a map rebuild.

Evidence: `core/base.go:1379` registers `app.registerCollectionHooks()` which binds to collection CRUD operations and reloads the cache.

### 4. How is long-running workflow state persisted and resumed?

**No native workflow persistence exists.** PocketBase is not a workflow engine. Long-running operations are not explicitly persisted mid-operation.

- **Transactional boundaries** exist via `RunInTransaction()`, but there is no concept of pausing/resuming a workflow.
- **Record state** is just SQLite row data — no saga, step, or checkpoint mechanism.
- **Realtime subscriptions** (`SubscriptionsBroker`) track client state in memory, not persisted.
- **Cron jobs** are registered as functions with schedule expressions, stored in memory only.

Evidence: `core/app.go:85-86` shows `SubscriptionsBroker()` returns an in-memory broker. `core/app.go:82` shows `Cron()` instance is created fresh on `NewBaseApp()`.

### 5. What happens to in-flight state during schema migrations?

Schema migrations run via `MigrationsRunner` within **nested transactions** (auxiliary.db transaction wrapping data.db transaction):

```go
err := r.app.AuxRunInTransaction(func(txApp App) error {
    return txApp.RunInTransaction(func(txApp App) error {
        // migration operations here
    })
})
```

`core/migrations_runner.go:129-166`

- Migrations are applied sequentially, each as a full transaction.
- If a migration fails, the entire migration's transaction rolls back.
- The `_migrations` table tracks applied files with their `applied` timestamp.
- **No in-flight record state is affected** because migrations operate on schema (tables/columns), not row data. However, if a migration modifies a column that an in-flight record is using, the record's next save will reflect the new schema.

Evidence: `core/migrations_runner.go:246-263` creates the migrations table with `CREATE TABLE IF NOT EXISTS`.

## Architectural Decisions

| Decision | Rationale | Tradeoff |
|----------|-----------|----------|
| Dual connection pools (concurrent vs nonconcurrent) | Minimizes SQLITE_BUSY errors by routing reads to a pool and serializing writes through a single connection | Write throughput is single-threaded; concurrent reads may see slightly stale data |
| SQLite as sole database | Zero-configuration, embedded, ACID-compliant, single-file backup | Not horizontally scalable; limited concurrent write capacity |
| Collections cached in-memory | Fast schema resolution without DB round-trip for every request | Cache invalidation depends on proper hook bindings; stale reads possible in edge cases |
| Hook-based state lifecycle | Allows users to intercept and modify behavior without subclassing | Complexity: hooks fire before/after, success/error, with priorities |
| Store-based record data | `store.Store` provides concurrent-safe access to record fields, expand, and visibility | No transactions at record field level; entire record is a unit |
| Settings stored in Param table | Single row in data.db, optionally encrypted | Settings reload requires a DB write on first boot if not persisted |

## Notable Patterns

1. **Dual DB Builder Routing**: `core/base.go:490-500` returns a `dualDBBuilder` that routes SELECT to concurrent pool and everything else to nonconcurrent pool.

2. **Lock Retry with Exponential Backoff**: `core/db_retry.go:15` defines retry intervals `[50, 100, 150, 200, 300, 400, 500, 700, 1000]ms` for SQLite lock contention.

3. **Shallow Clone for Transactions**: `core/db_tx.go:52-68` creates a shallow clone of `BaseApp` with swapped DB references and a new `TxAppInfo` to isolate transaction state.

4. **Deferred Hook Callbacks**: `core/db_tx.go:85-90` `OnComplete()` registers callbacks that fire only after transaction commit, allowing success hooks to execute on committed state.

5. **Bounded In-Memory Cache with Map Rebuild**: `tools/store/store.go:68-78` when deletions exceed `ShrinkThreshold` (200), the map is replaced with a new one to avoid unbounded growth.

6. **Nested Transactions**: `core/migrations_runner.go:129-166` runs migrations in nested `AuxRunInTransaction` → `RunInTransaction` to ensure atomicity across both databases.

## Tradeoffs

| Tradeoff | Impact |
|----------|--------|
| SQLite single-writer bottleneck | High-write workloads will queue behind the single nonconcurrent connection |
| No distributed cache | In multi-instance deployments, collection cache invalidation is not synchronized |
| No workflow state persistence | Long-running AI workflows cannot resume from a checkpoint; all state must be encoded in Record rows |
| In-memory settings reload | Settings changes in one instance are not propagated to other instances without restart |
| Hook ordering complexity | Multiple hooks with priorities can make behavior hard to predict; tests required to verify ordering |

## Failure Modes / Edge Cases

1. **SQLITE_BUSY timeout**: If lock retries exhaust (`baseLockRetry` at 12 attempts), queries fail with "database is locked" errors. Under sustained write load, this can occur.
2. **Stale collection cache in transactions**: If a collection is updated inside a transaction and `FindCachedCollectionByNameOrId()` is called before commit, the cached (old) collection is returned.
3. **Missing `e.Next()` in bootstrap hook**: `core/base.go:438-439` warns if `OnBootstrap` hook doesn't call `e.Next()` but app is not bootstrapped — a common user mistake.
4. **Orphaned storage files**: File deletion runs as fire-and-forget after model deletion, so failures are logged but not retried (`core/base.go:1331-1342`).
5. **Automigrate race**: Multiple simultaneous collection create/update requests could trigger concurrent schema changes; the migration lock helps but doesn't eliminate all race windows.

## Future Considerations

- **Distributed locking** for multi-instance deployments (currently uses `.notify` directory file-based sync which is limited).
- **Workflow checkpointing** would require a new abstraction layer (e.g., saga state machine) to persist mid-operation progress.
- **Redis/memcached integration** could replace the in-memory `store.Store` for collection caching, enabling shared cache across instances.
- **Read replicas** support is not possible with SQLite; horizontal read scaling requires a different database backend.

## Questions / Gaps

| Question | Finding |
|----------|---------|
| Is there any write-ahead log (WAL) configuration? | Yes — daily `PRAGMA wal_checkpoint(TRUNCATE)` runs via cron (`core/base.go:1360-1375`) |
| How is the store capacity managed? | `store.Store` uses unbounded maps with `SetIfLessThanLimit` for bounded caches (500 entries for filter expressions); no global capacity limit |
| Is there any transaction isolation level configuration? | No — SQLite uses default isolation (DEFERRED). `dbx.Tx` doesn't expose isolation level settings |
| What happens during concurrent collection updates? | Collection cache is invalidated via hooks; concurrent updates would serialize at the nonconcurrent DB connection for the collection row |
| Is there any snapshot/point-in-time recovery? | `CreateBackup()` copies the entire `pb_data` directory; no incremental or point-in-time support |

---

Generated by `dimensions/08-state-management-persistence.md` against `PocketBase`.