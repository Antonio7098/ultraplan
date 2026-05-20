# Source Analysis: grafana

## State Management & Persistence

### Source Info

| Field | Value |
|-------|-------|
| Name | grafana |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/grafana` |
| Language / Stack | Go (backend), TypeScript/React (frontend) |
| Analyzed | 2026-05-20 |

## Summary

Grafana implements a multi-layered state management strategy spanning traditional SQL persistence via xorm, a modern unified storage layer with dual-write capabilities, in-memory caching for query results, and specialized state management for long-running alert evaluations. The system supports multiple database backends (SQLite, MySQL, PostgreSQL) with a migration system that includes advisory locking and transaction retry logic. The alerting subsystem maintains evaluation state in-memory with periodic and event-driven persistence to the database.

## Rating

**7/10** — Good implementation with minor issues. Grafana demonstrates mature patterns in transaction management and schema migration. However, the legacy SQLStore and newer unified storage coexist without clean separation, and in-flight state during migrations relies on careful ordering rather than transactional guarantees.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| SQL Store abstraction | `SQLStore` struct with xorm engine wrapper, supports SQLite/MySQL/PostgreSQL | `pkg/services/sqlstore/sqlstore.go:42-56` |
| Session/transaction management | `WithTransactionalDbSession`, `InTransaction` methods with retry logic | `pkg/services/sqlstore/transactions.go:17-94` |
| DB session interface | `SessionDB` struct implementing Get/Exec/NamedExec with sqlx | `pkg/services/sqlstore/session/session.go:21-43` |
| Migration system | `Migrator` struct with add/remove/getlog operations, runs in transaction | `pkg/services/sqlstore/migrator/migrator.go:38-50,198-310` |
| Migration locking | Advisory lock with configurable timeout for HA-safe migrations | `pkg/services/sqlstore/migrator/migrator.go:214-237` |
| Caching service | `OSSCachingService` stub with interface `CachingService` | `pkg/services/caching/service.go:58-84` |
| Query caching | `WithQueryDataCaching` wraps responses with cache-check-and-update flow | `pkg/services/caching/service.go:176-235` |
| Unified storage backend | `NewStorageBackend` with file/SQL/grpc backends, garbage collection config | `pkg/storage/unified/sql/backend.go:106-200` |
| Dual-write pattern | `dualWriter` writes to legacy then unified, with read-mode routing | `pkg/storage/legacysql/dualwrite/dualwriter.go:40-100` |
| Alert state manager | `Manager` struct with in-memory cache, `InstanceStore`, `Historian` interfaces | `pkg/services/ngalert/state/manager.go:42-62` |
| Alert state persistence | `StatePersister` interface with `Async` and `Sync` methods | `pkg/services/ngalert/state/manager.go:34-37` |
| Alert rule store | `DBstore` using `WithTransactionalDbSession` for rule CRUD | `pkg/services/ngalert/store/alert_rule.go:45-100` |

## Answers to Dimension Questions

### 1. How is state accessed and mutated — direct DB, repository, or event-sourced?

State is accessed through a layered approach:

- **SQLStore** (`pkg/services/sqlstore/sqlstore.go:42-56`): Primary legacy DAL using xorm, providing `WithTransactionalDbSession` and `InTransaction` methods. Services call these with callbacks that receive a `*DBSession` (xorm's session type).

- **Repository-style access**: Domain services like `dashboards.DashboardService` (`pkg/services/dashboards/dashboard.go:17-45`) and `datasources.DataSourceService` (`pkg/services/datasources/datasources.go:14-67`) define interface methods that are implemented by concrete types calling into SQLStore.

- **Unified Storage** (`pkg/storage/unified/sql/backend.go:106-200`): Newer resource-based storage implementing `resource.StorageBackend` interface with SQL backend as default.

- **Dual-write layer** (`pkg/storage/legacysql/dualwrite/dualwriter.go:40-49`): Routes writes to both legacy SQL and unified storage during migration. The `getMode` function determines whether reads come from legacy or unified based on migration state.

- **Event sourcing for alerting**: Alert state transitions publish events via `bus.Publish` after transaction commit (`pkg/services/sqlstore/transactions.go:87-91`). However, the primary state is stored relationally, not an event store.

### 2. What consistency model does the system provide to callers?

Grafana provides **read-committed** consistency with optimistic locking in certain operations:

- **Transaction isolation**: Uses database-default isolation (typically read-committed for PostgreSQL/MySQL; serialized for SQLite). The `inTransactionWithRetryCtx` function (`pkg/services/sqlstore/transactions.go:34-93`) handles retry on database locked errors (SQLite) and commits atomically.

- **Optimistic locking**: Alert rule updates use version conflicts (`pkg/services/ngalert/store/alert_rule.go:41` — `ErrOptimisticLock`). The store methods check and reject stale updates.

- **Dual-write consistency**: The `dualWriter` (`pkg/storage/legacysql/dualwrite/dualwriter.go:51-88`) writes to legacy first, then unified. If unified fails and `errorIsOK` is true, it continues with legacy data and retries unified in background. If `errorIsOK` is false, unified failures are blocking.

- **No distributed transactions**: There is no two-phase commit between legacy SQL and unified storage. In-flight writes can be lost if the process crashes between legacy commit and unified write.

### 3. How is cache invalidation handled without stale reads?

- **Query caching** (`pkg/services/caching/service.go:176-235`): `WithQueryDataCaching` first checks cache via `HandleQueryRequest`, returns immediately on hit. On miss, it executes the query and calls `UpdateCacheFn` to populate the cache. The `X-Cache` header reports hit/miss status.

- **OSS caching stub**: `OSSCachingService` (`pkg/services/caching/service.go:72-84`) is a no-op implementation — `HandleQueryRequest` always returns `false` (cache miss) and empty response. The interface exists but the actual caching implementation is empty for OSS.

- **Feature-flagged async caching**: When `FlagAwsAsyncQueryCaching` is enabled, the `ShouldCacheQuery` function (`pkg/services/caching/service.go:36`) can prevent caching of async query results (`pkg/services/caching/service.go:219-230`).

- **No explicit invalidation**: There is no visible cache invalidation mechanism (no TTL configuration, no explicit invalidation calls in the observed code). Cache entries are presumably invalidated by TTL or never for the OSS implementation.

### 4. How is long-running workflow state persisted and resumed?

- **Alert evaluation state** (`pkg/services/ngalert/state/state.go:26-81`): Alert state is held in-memory in a `cache` struct (`pkg/services/ngalert/state/manager.go:48`). The `State` struct contains `FiredAt`, `StartsAt`, `EndsAt`, `ResolvedAt`, `LastEvaluationTime`, and `Values`.

- **Periodic persistence**: The `StatePersister` interface has two implementations — `Async` for background periodic saves, `Sync` for event-driven saves. The `Manager.Run` method (`pkg/services/ngalert/state/manager.go:127-130`) starts the async persister.

- **Warm restarts**: `Manager.Warm` (`pkg/services/ngalert/state/manager.go:132-150`) reloads state from `InstanceStore` on startup by fetching org IDs, then loading states for each org.

- **No native workflow engine**: Grafana does not have a workflow engine. Long-running operations like dashboard snapshots or cloud migrations use direct DB storage with explicit state fields rather than a resumable workflow abstraction.

### 5. What happens to in-flight state during schema migrations?

- **Advisory lock protection**: Migrations acquire an advisory lock before running (`pkg/services/sqlstore/migrator/migrator.go:214-237`). The lock is released after migration completes.

- **Transaction atomicity**: Each migration runs in its own transaction (`pkg/services/sqlstore/migrator/migrator.go:328-348`). If a migration fails, only that migration's changes are rolled back; prior successful migrations remain committed.

- **Skip mechanism**: Migrations can have conditions (`pkg/services/sqlstore/migrator/migrator.go:364-381`) that skip execution if already applied but not logged (for backward compatibility).

- **In-flight queries**: The system does not pause in-flight queries during migration. Queries running concurrently with a migration could see partial schema changes depending on timing and isolation levels.

- **No pause-and-resume**: There is no mechanism to drain in-flight requests before applying breaking migrations. Schema changes that require downtime rely on deployment coordination outside the code.

## Architectural Decisions

1. **SQLStore as central persistence**: All legacy data lives in xorm-wrapped SQL stores. The `SQLStore` struct (`pkg/services/sqlstore/sqlstore.go:42-56`) is a singleton that wraps connection pooling, engine configuration, and migration execution.

2. **Multi-driver support**: The `migrator.NewDialect` function (`pkg/services/sqlstore/sqlstore.go:112`) selects dialect based on driver name, enabling SQLite (default for dev), MySQL, and PostgreSQL with driver-specific handling.

3. **Dual-write for migration**: The `dualWriter` pattern (`pkg/storage/legacysql/dualwrite/dualwriter.go:40-49`) enables gradual migration from legacy SQL to unified storage without downtime. Reads can be from either source depending on migration mode.

4. **xorm session as transaction boundary**: Both legacy `DBSession` (xorm) and new `SessionDB`/`SessionTx` (sqlx) are used. Transactions wrap business logic in callbacks rather than explicit begin/commit.

5. **Alert state manager separates cache and persistence**: The `Manager` (`pkg/services/ngalert/state/manager.go:42-62`) holds an in-memory cache but delegates persistence to `StatePersister`, allowing sync vs async persistence strategies.

## Notable Patterns

- **Transactional callbacks**: `WithTransactionalDbSession(ctx, func(sess *DBSession) error)` pattern ensures sessions are properly closed and errors trigger rollback.

- **Migration retry with backoff**: The migrator uses dskit backoff (`pkg/services/sqlstore/migrator/migrator.go:410-426`) to retry on SQLite locked errors, with up to 10 retries.

- **Write-behind with background error tolerance**: Dual-writer continues on unified errors when `errorIsOK` is true, retrying in background without blocking the response.

- **Feature-toggle cache decisions**: Query caching respects `FlagAwsAsyncQueryCaching` to disable caching for async queries.

## Tradeoffs

1. **Two storage systems**: Legacy SQLStore and newer unified storage create complexity. Dual-write prevents data divergence but adds latency and failure modes.

2. **No transactional cross-store consistency**: Writes to legacy and unified storage are not atomic. Process crash between commits leaves the two out of sync.

3. **OSS caching is a stub**: The `OSSCachingService` (`pkg/services/caching/service.go:72-84`) returns no-op for all operations, meaning query caching only works for AWS async-specific implementations.

4. **In-memory alert state risk**: Alert state is primarily in-memory with periodic persistence. A crash loses unpersisted state transitions that would be recovered on restart via the warm-up process.

5. **No native workflow persistence**: Long-running workflows lack a standard abstraction, making resumption dependent on ad-hoc field tracking.

## Failure Modes / Edge Cases

- **Migration lock timeout**: If `MigrationLockAttemptTimeout` is exceeded, migrations fail and the application refuses to start. In HA setups, only one node runs migrations.

- **Dual-write divergence**: If the background unified write fails silently (e.g., after legacy commit succeeds), the system continues with stale reads from legacy. Monitoring catches this via `backgroundErrors` counter.

- **SQLite concurrent write contention**: SQLite's locking model causes `inTransactionWithRetry` to sleep and retry up to `TransactionRetries` times. Under high write load, this can cause latency spikes.

- **Alert state cache eviction**: The `cache` struct (`pkg/services/ngalert/state/manager.go:48`) has no documented size limit. Under extreme alert counts, memory usage could be significant.

- **Session reuse detection**: `transactions.go:40-43` explicitly prevents reusing a non-transaction session that didn't start the transaction — a safeguard that could cause panic if violated.

## Future Considerations

1. **Implement real OSS caching**: Replace `OSSCachingService` stub with actual in-memory or Redis-based caching with TTL and invalidation support.

2. **Add transactional dual-write**: Consider a saga or outbox pattern to make legacy+unified writes atomic, or accept eventual consistency with better observability.

3. **Workflow abstraction**: Introduce a standard persistence model for long-running operations if the system grows beyond alert state.

4. **Schema migration coordination**: Add a pre-migration drain phase to pause request processing before breaking changes.

## Questions / Gaps

- **No evidence found** for cache TTL configuration in the OSS caching implementation.
- **No evidence found** for snapshot isolation level configuration; default database isolation is assumed.
- **No evidence found** for unified storage garbage collection behavior beyond configuration options.
- **Unclear** how dashboard version history is pruned and whether in-flight edits could be lost during migration.

---

Generated by `dimensions/08-state-management-persistence.md` against `grafana`.