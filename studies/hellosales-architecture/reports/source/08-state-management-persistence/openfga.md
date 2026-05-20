# Source Analysis: openfga

## State Management & Persistence

### Source Info

| Field | Value |
|-------|-------|
| Name | openfga |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/openfga` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

OpenFGA implements a well-structured state management layer using SQL databases (PostgreSQL, MySQL, SQLite) with a rich caching hierarchy. State is accessed through the `OpenFGADatastore` interface (`pkg/storage/storage.go:409-421`), which composes multiple backends: tuple storage, authorization models, stores, assertions, and changelog. Write operations use `READ COMMITTED` isolation with `SELECT ... FOR UPDATE` row-level locking and ULID-based pagination. The system employs three distinct caching layers: authorization model cache (LRU, 1 week TTL, immutable models), iterator caches (per-request, 10s TTL), and check query caches. The changelog provides an append-only audit trail for changes.

## Rating

**8/10** — Good implementation with minor issues. The architecture is solid with clear separation of concerns, well-designed caching with invalidation, and proper transaction handling. Minor gaps include lack of distributed cache support and limited schema migration handling for in-flight operations.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Storage Interface | `OpenFGADatastore` interface composing multiple backends | `pkg/storage/storage.go:409-421` |
| Tuple Backend Interface | `TupleBackend`, `RelationshipTupleReader`, `RelationshipTupleWriter` interfaces | `pkg/storage/storage.go:144-285` |
| Changelog Backend | `ChangelogBackend.ReadChanges` for append-only change tracking | `pkg/storage/storage.go:395-405` |
| Write Transaction | Uses `READ COMMITTED` isolation, `SELECT ... FOR UPDATE` | `pkg/storage/sqlite/sqlite.go:395-401` |
| Write Atomicity | Tuple and changelog writes in single transaction | `pkg/storage/sqlite/sqlite.go:676-683` |
| Pagination | ULID-based continuation tokens via `SQLContinuationTokenSerializer` | `pkg/storage/sqlcommon/sqlcommon.go:245-264` |
| Model Caching | `NewCachedOpenFGADatastore` wraps datastore with LRU cache (168h TTL) | `pkg/storage/storagewrappers/model_caching.go:39-48` |
| Iterator Caching | `CachedDatastore` caches tuple iterators with invalidation | `pkg/storage/storagewrappers/cached_datastore.go:94-148` |
| Cache Invalidation | `InvalidEntityCacheEntry` tracked per-object/relation | `pkg/storage/cache.go:215-239` |
| Connection Pool | Configurable min/max open/idle conns, conn max lifetime | `cmd/run/run.go:486-491` |
| Schema Migration | Goose migrations for PostgreSQL, MySQL, SQLite | `assets/migrations/postgres/001_initialize_schema.sql:1-58` |
| Readiness Check | `IsVersionReady` validates migration revision | `pkg/storage/sqlcommon/sqlcommon.go:1147-1174` |
| Consistency Options | `ConsistencyPreference` enum (HIGHER_CONSISTENCY) for callers | `pkg/storage/storage.go:107-111` |

## Answers to Dimension Questions

### 1. How is state accessed and mutated — direct DB, repository, or event-sourced?

State is accessed through a **repository pattern** via the `OpenFGADatastore` interface (`pkg/storage/storage.go:409-421`). This interface composes five backends:

- **TupleBackend** (`RelationshipTupleReader` + `RelationshipTupleWriter`) — for tuple CRUD operations
- **AuthorizationModelBackend** — for versioned authorization models
- **StoresBackend** — for tenant/namespace management
- **AssertionsBackend** — for test assertions
- **ChangelogBackend** — for append-only change audit log

The underlying implementations are SQL databases (PostgreSQL, MySQL, SQLite) accessed via raw SQL queries using the `Masterminds/squirrel` query builder (`pkg/storage/sqlite/sqlite.go:177-238`). There is **no event sourcing** — the system uses direct tuple storage with a companion changelog table that records all writes and deletes as an audit trail.

Tuple writes are atomic: the `Write` function (`pkg/storage/sqlite/sqlite.go:387-684`) executes deletes, inserts, and changelog writes within a single `READ COMMITTED` transaction.

### 2. What consistency model does the system provide to callers?

The system provides **tunable eventual consistency with a stronger option**. The `ConsistencyOptions` struct (`pkg/storage/storage.go:107-111`) contains a `ConsistencyPreference` field with two values:

- `CONSISTENCY_PREFERENCE_UNSPECIFIED` (default) — uses cached reads
- `HIGHER_CONSISTENCY` — bypasses caches and reads directly from the database

In `CachedDatastore.ReadStartingWithUser` (`pkg/storage/storagewrappers/cached_datastore.go:167-169`), when `HIGHER_CONSISTENCY` is requested, the cache is skipped entirely and the underlying datastore is queried directly:

```go
if options.Consistency.Preference == openfgav1.ConsistencyPreference_HIGHER_CONSISTENCY {
    return iter(ctx)
}
```

The `CachedTupleReader` (`pkg/storage/storagewrappers/cached_reader.go:91-94`) follows the same pattern. This allows callers to choose between performance (cached) and consistency (direct) on a per-request basis.

### 3. How is cache invalidation handled without stale reads?

OpenFGA uses a **timestamp-based invalidation** pattern with entity-level granularity. The key types are:

1. **Store-level invalidation** — `GetInvalidIteratorCacheKey(storeID)` (`pkg/storage/cache.go:223-225`) marks an entire store's cache as invalid when any write occurs.

2. **Object-relation level invalidation** — `GetInvalidIteratorByObjectRelationCacheKey(storeID, object, relation)` (`pkg/storage/cache.go:227-229`) invalidates caches for specific object+relation combinations.

3. **User-object-type level invalidation** — `GetInvalidIteratorByUserObjectTypeCacheKeys` (`pkg/storage/cache.go:231-239`) for reverse lookup caches.

The invalidation check in `CachedTupleReader.tryGetFromCache` (`pkg/storage/storagewrappers/cached_reader.go:212-261`) compares the cache entry's `LastModified` timestamp against any invalidation entry's timestamp. If the invalidation occurred after the cache was created, the cache is deleted and a DB query ensues.

In `CachedDatastore.findInCache` (`pkg/storage/storagewrappers/cached_datastore.go:289-309`), the same pattern applies:
```go
invalid := isInvalidAt(cache, tupleEntry.LastModified, storeKey, invalidEntityKeys)
if invalid {
    cache.Delete(key)
    return nil, false
}
```

Cache entries use **jittered TTLs** (`pkg/storage/cache.go:458-486`) to prevent synchronized expirations across many entries.

### 4. How is long-running workflow state persisted and resumed?

OpenFGA does **not have long-running workflows** in the traditional sense. Authorization checks (`Check` API) are synchronous, single-request operations with no workflow state to persist. The system is a pure request-response authorization engine.

However, the **changelog** (`ChangelogBackend.ReadChanges`) provides a mechanism for capturing state changes over time. The changelog table (`assets/migrations/postgres/001_initialize_schema.sql:41-51`) stores all tuple writes and deletes with:
- ULID (sortable, time-ordered identifier)
- `inserted_at` timestamp
- Operation type (write/delete)

This allows external consumers to build read replicas, sync to other systems, or implement eventual consistency patterns. The `ReadChanges` method (`pkg/storage/sqlite/sqlite.go:1222-1317`) accepts a `horizonOffset` parameter to filter changes older than a certain time threshold, enabling point-in-time consistency for downstream consumers.

For **pagination**, OpenFGA uses ULID-based continuation tokens (`pkg/storage/sqlcommon/sqlcommon.go:245-264`). The `SQLContinuationTokenSerializer` encodes the last seen ULID and object type into a JSON token, allowing consistent resume points across pages.

### 5. What happens to in-flight state during schema migrations?

OpenFGA handles schema migrations via **Goose** (`github.com/pressly/goose/v3`). The `IsVersionReady` function (`pkg/storage/sqlcommon/sqlcommon.go:1147-1174`) checks whether the database schema revision meets `build.MinimumSupportedDatastoreSchemaRevision` before accepting traffic.

The migration strategy is:
1. **Pre-migration check** — Server refuses to start if migrations are required but `skipVersionCheck` is false
2. **No in-flight operation handling** — Since OpenFGA doesn't have long-running workflows, there is no special handling for in-flight state during migrations
3. **Atomic schema changes** — Each migration runs as a separate SQL script (e.g., `assets/migrations/postgres/005_add_conditions_to_tuples.sql`)

If a migration is required, operators must run `openfga migrate` before starting the server. If a server starts with an out-of-date schema, it returns a `ReadinessStatus` with `IsReady: false` and a descriptive message (`pkg/storage/sqlcommon/sqlcommon.go:1161-1169`).

## Architectural Decisions

1. **ULID for timestamps**: Uses ULID (Universally Unique Lexicographically Sortable Identifier) instead of UUID or auto-increment integers for paginated queries. ULIDs are time-ordered and can be generated client-side, enabling efficient pagination without server-side cursor state (`pkg/storage/sqlcommon/sqlcommon.go:708`, `ulid.MustNew`).

2. **Row-level locking with sorted key order**: To prevent deadlocks, tuple writes lock rows in a deterministic sorted order computed by `MakeTupleLockKeys` (`pkg/storage/sqlite/sqlite.go:265-330`). This ensures concurrent writes to the same store always acquire locks in the same sequence.

3. **Separate changelog table**: Tuple changes are written to both `tuple` and `changelog` tables within the same transaction. This provides an audit trail without mixing it into the primary tuple storage.

4. **Three-tier cache hierarchy**: (1) Authorization models cached indefinitely (immutable), (2) Tuple iterator caches with TTL and invalidation, (3) Check result caches. Each layer has different eviction semantics.

5. **No distributed cache**: All caches are in-memory. There is no Redis or Memcached integration. This simplifies deployment but limits cache sharing across instances.

6. **No optimistic locking version numbers**: Conflict detection relies on database-level `FOR UPDATE` locks and constraint violations rather than application-level optimistic locking versions.

## Notable Patterns

- **Repository/Backend composition**: `OpenFGADatastore` is composed from smaller interfaces (`TupleBackend`, `AuthorizationModelBackend`, etc.), making it easy to swap implementations or add wrappers (`pkg/storage/storage.go:409-421`)

- **Iterator pattern with resource management**: All tuple reads return `TupleIterator` which must be closed (`pkg/storage/storage.go:158`). The `SQLTupleIterator` (`pkg/storage/sqlcommon/sqlcommon.go:306-567`) handles async result fetching and early termination.

- **Write ordering**: Deletes are executed before writes in `Write` (`pkg/storage/sqlite/sqlite.go:441-596`), matching the interface contract (`pkg/storage/storage.go:274-280`)

- **Singleflight for deduplication**: `singleflight.Group` prevents multiple goroutines from executing the same expensive iterator drain operation (`pkg/storage/storagewrappers/cached_datastore.go:109`, `golang.org/x/sync/singleflight`)

- **Write options pattern**: `TupleWriteOptions` (`pkg/storage/storage.go:241-269`) uses functional options (`WithOnMissingDelete`, `WithDuplicateInsert`) to customize write behavior

- **Context propagation**: `ContextWithRelationshipTupleReader` (`pkg/storage/storage.go:37-52`) allows transport layers to inject mock readers for testing

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| In-memory only cache | Simple deployment, no external dependency; but no cache sharing across instances and cache loss on restart |
| READ COMMITTED isolation | Avoids deadlocks and allows concurrent writes; but allows non-repeatable reads within a transaction |
| No event sourcing | Simple implementation; but limited ability to replay or rebuild state |
| No optimistic concurrency | Simpler code; but relies on DB locks which may not scale as well |
| ULID-based pagination | Time-ordered, client-generatable; but requires sorting overhead on each query |
| WAL mode for SQLite | Good write performance; but increased storage usage and potential consistency issues on crash |

## Failure Modes / Edge Cases

1. **Write conflict detection** (`pkg/storage/sqlite/sqlite.go:592-595`): If a concurrent delete reduces the affected row count, `ErrWriteConflictOnDelete` is returned. This can occur if two requests try to delete the same tuple simultaneously.

2. **Duplicate insert detection** (`pkg/storage/sqlite/sqlite.go:631-635`): Constraint violations return `ErrWriteConflictOnInsert`. This happens when two requests try to write the identical tuple.

3. **SQLite busy errors** (`pkg/storage/sqlite/sqlite.go:1353-1390`): SQLite returns `SQLITE_BUSY` when the database is locked. The `busyRetry` function retries up to 10 times with configurable busy timeout (default 100ms via `_pragma=busy_timeout(100)`).

4. **Cache stampede prevention**: Uses `singleflight.Group` to prevent multiple requests from draining the same iterator concurrently (`pkg/storage/storagewrappers/cached_datastore.go:553`).

5. **Incomplete iterator caching** (`pkg/storage/storagewrappers/cached_datastore.go:515-518`): If the context is cancelled or results are incomplete, tuples are not cached:
```go
if c.tuples == nil || c.ctx.Err() != nil {
    c.iter.Stop()
    return
}
```

6. **Condition context validation**: When writing tuples with conditions, the condition context must serialize to a deterministic string representation for cache keys (`pkg/storage/cache.go:276-380`). Invalid characters cause errors.

## Future Considerations

1. **Distributed cache**: Adding Redis or Memcached support would enable cache sharing across instances and persistence across restarts.

2. **Optimistic locking**: Adding version numbers to tuples would enable more scalable conflict detection without row-level locks.

3. **Schema migration isolation**: For stores with large data, migrations could benefit from online schema change tools (e.g., `pg_repack`, `gh-ost`).

4. **Read replica support**: The current architecture has a single primary. Adding read replicas would improve read scalability.

5. **Event sourcing export**: Exposing the changelog as a stream (Kafka, Kinesis) would enable richer integrations.

## Questions / Gaps

1. **No evidence found** for handling cache warming after restart — caches start empty, which could cause a thundering herd on popular queries when a server restarts.

2. **No evidence found** for cache size limits on the authorization model cache beyond `maxAuthorizationModelCacheSize`. While it uses LRU eviction, there's no overflow to disk or distribution.

3. **No evidence found** for cross-store cache isolation testing. Each store's cache entries are namespaced by store ID in the cache key, but the underlying Theine cache is global.

4. **Schema migration for large tables**: No evidence of online migration tools for the `tuple` table when adding columns or indexes on large datasets.

5. **Cache coherence under high write load**: When a store has very high write rates, invalidation entries could accumulate rapidly. The cache invalidation pattern assumes writes are relatively infrequent relative to reads.

---

Generated by `dimensions/08-state-management-persistence.md` against `openfga`.