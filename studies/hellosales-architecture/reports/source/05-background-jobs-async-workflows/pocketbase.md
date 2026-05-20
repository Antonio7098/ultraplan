# Source Analysis: pocketbase

## Background Jobs & Async Workflows

### Source Info

| Field | Value |
|-------|-------|
| Name | pocketbase |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/pocketbase` |
| Language / Stack | Go |
| Analyzed | 2026-05-19 |

## Summary

PocketBase is a lightweight, self-contained backend platform. It does **not** implement a traditional background job queue system (no Redis, NATS, Kafka, or external queue infrastructure). Instead, async processing is limited to: (1) an in-process cron scheduler for periodic tasks, (2) a simple `FireAndForget` goroutine wrapper for fire-and-forget async execution, and (3) realtime subscriptions via SSE. The only retry mechanism is DB-level lock contention retry (SQLite busy). No dead-letter queue, no workflow orchestration, no saga patterns, and no durable execution infrastructure exist.

## Rating

**3/10** — Poor implementation for background jobs / async workflows

PocketBase is explicitly designed as a lightweight, self-contained backend and intentionally omits distributed async infrastructure. However, for the purposes of this dimension's criteria, it has severe gaps: no persistent job queues, no retry policies for async failures, no dead-letter handling, no workflow orchestration, and no backpressure mechanisms beyond basic DB connection pooling.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Cron scheduler | `Cron` struct with ticker-based scheduling | `tools/cron/cron.go:20-28` |
| Cron job registration | `Add(jobId, cronExpr, fn)` method | `tools/cron/cron.go:81-107` |
| Cron job execution | `go j.Run()` launches job in goroutine | `tools/cron/cron.go:225` |
| Cron min interval | Default 1 minute, configurable | `tools/cron/cron.go:37,46-56` |
| Fire-and-forget async | `FireAndForget(f, wg...)` with panic recovery | `tools/routine/routine.go:13-35` |
| Realtime subscriptions | `Broker` struct for SSE pub/sub | `tools/subscriptions/broker.go:11-13` |
| DB lock retry | `baseLockRetry()` with backoff intervals | `core/db_retry.go:43-62` |
| Retry intervals | `{50,100,150,200,300,400,500,700,1000}ms` array | `core/db_retry.go:15` |
| Max lock retries | 12 attempts | `core/db_retry.go:18` |
| Batch transaction timeout | Configurable via `Batch.Timeout` setting | `apis/batch.go:100-103` |
| File delete workers | Semaphore with 2000 max workers | `core/base.go:1305-1310` |
| DB connection routing | Concurrent vs non-concurrent DB split | `core/base.go:482-500` |
| Query timeout | `--queryTimeout` flag, default 30s | `pocketbase.go:241-246` |
| Cron hook registration | `app.Cron().Start()` called on serve | `core/base.go:1350-1358` |
| Autobackup cron job | `__pbAutoBackup__` registered via cron | `core/base_backup.go:305-314` |
| DB optimization cron | `__pbDBOptimize__` WAL checkpoint cron | `core/base.go:1360-1375` |
| Log cleanup cron | `__pbLogsCleanup__` every 6 hours | `core/base.go:1535-1540` |

## Answers to Dimension Questions

### 1. How are background jobs submitted, tracked, and completed?

**Submission:** Jobs are registered at startup via `app.Cron().Add(jobId, cronExpr, fn)` (`tools/cron/cron.go:81-107`). There is no programmatic job submission API for ad-hoc background tasks. Jobs are purely time-based (cron expressions).

**Tracking:** Cron jobs are tracked only by their ID in the `Cron.jobs` slice (`tools/cron/cron.go:25`). There is **no job state persistence** — if the process restarts, all job state is lost. Jobs are identified by string ID only.

**Completion:** Jobs are considered complete when their function returns. There is **no completion callback, no result storage, and no job status tracking**. The system does not track whether a job succeeded or failed.

**Additional async patterns:**
- `routine.FireAndForget(fn)` (`tools/routine/routine.go:13`) spawns a goroutine with panic recovery but provides no tracking, result, or completion semantics
- Realtime subscriptions (`tools/subscriptions/broker.go`) use SSE for push notifications but are not job-related

### 2. What happens when a job fails — retry, dead-letter, or compensate?

**Retry for DB locks only:** PocketBase implements retry only for SQLite `database is locked` / `table is locked` errors via `baseLockRetry()` in `core/db_retry.go:43-62`. The retry uses fixed backoff intervals `{50, 100, 150, 200, 300, 400, 500, 700, 1000}ms` with a maximum of 12 attempts (`core/db_retry.go:15,18`). This retry is **not** a general-purpose async job retry mechanism — it only handles SQLite lock contention.

**Dead-letter queue:** **None.** No dead-letter queue or failed-job handling mechanism exists for background tasks. When a cron job fails, the error is logged but the job is not retried, moved to a DLQ, or otherwise handled.

**Compensation:** **None.** No saga pattern, compensation transactions, or rollback mechanisms exist for failed async operations.

**Note:** The batch API (`apis/batch.go`) has timeout and atomic transaction semantics for API requests within a batch, but this is not a background job system.

### 3. How does the system handle job duration limits and cancellation?

**Duration limits:**
- SQL query timeout via `--queryTimeout` flag, default 30 seconds (`pocketbase.go:241-246`, `core/base.go:37`)
- DB connection pool limits on concurrent connections (`core/base.go:1175-1203`)
- Batch transaction timeout in `apis/batch.go:100-103` (default 3 seconds, configurable)
- Cron jobs have **no duration limit** — a job can run indefinitely

**Cancellation:**
- **No job cancellation API exists.** There is no `job.Cancel()` or `job.Stop()` mechanism
- Cron jobs run to completion; stopping the cron ticker (`Cron.Stop()` at `tools/cron/cron.go:155-171`) only prevents future executions, not in-progress jobs
- `FireAndForget` goroutines (`tools/routine/routine.go:13`) have no cancellation mechanism — they run until completion or process exit

### 4. Are workflows composed of multiple steps with state management?

**No.** PocketBase has **no workflow orchestration engine, no DAG execution, no state machine, and no saga pattern implementation**.

What exists instead:
- **Hook system** (`tools/hook/hook.go`): Synchronous before/after hooks on model events (create, update, delete, validate). These are inline middleware, not durable workflows.
- **Batch transactions** (`apis/batch.go`): Atomic execution of multiple API requests within a single DB transaction, but no multi-step workflow with state.
- **Cron jobs**: Independent scheduled functions with no inter-job dependencies or state.

### 5. How is backpressure applied when the system is overloaded?

**Limited backpressure mechanisms exist:**

1. **Dual DB pool** (`core/base.go:482-500`): Separate concurrent and non-concurrent DB pools. Writes go to the non-concurrent single-connection pool to prevent SQLite busy errors.

2. **Semaphore for file deletion** (`core/base.go:1305-1310`): `PB_FILES_DELETE_MAX_WORKERS` env var controls max concurrent file delete workers (default 2000). Uses `semaphore.NewWeighted(maxFilesDeleteWorkers)` to bound parallelism.

3. **ipQueue-based** backpressure is **not applicable** — PocketBase does not use NATS JetStream or similar queue-based systems.

4. **No request queuing or shedding:** When the system is overloaded, there is no built-in mechanism to shed load, queue requests, or apply backpressure to incoming requests. The system will attempt to process all requests until resource exhaustion.

## Architectural Decisions

1. **Lightweight philosophy:** PocketBase is designed to be self-contained with no external dependencies (no Redis, queue broker, etc.). Async processing was traded for simplicity.

2. **In-process cron only:** All scheduling is in-process with a 1-minute minimum tick interval (`tools/cron/cron.go:37`). This means jobs cannot run more frequently than once per minute and are not distributed across multiple instances.

3. **No persistent job state:** Job definitions are in-memory only. Restarting the process loses all job state and pending work.

4. **SQLite-first design:** Retry logic is tailored to SQLite lock contention (`core/db_retry.go`), not general-purpose async job failures.

5. **Hooks as async substitute:** PocketBase uses synchronous hooks for most "reactive" behavior rather than async job queues. This works for low-latency operations but not for long-running background work.

## Notable Patterns

- **`FireAndForget` with panic recovery** (`tools/routine/routine.go:13-35`): Spawns a goroutine that auto-recovers from panics, used primarily for non-critical background tasks like file deletion.

- **Dual DB pool routing** (`core/base.go:482-500`): Routes reads to concurrent pool and writes to single-connection pool to minimize `SQLITE_BUSY` errors.

- **Hook chain pattern** (`tools/hook/hook.go`): Uses `e.Next()` to chain handlers, allowing before/after interceptors on model and request lifecycle events.

- **Cron-based maintenance** (`core/base.go:1360-1375`): System maintenance (WAL checkpoint, optimize, log cleanup) is handled via cron jobs registered during bootstrap.

## Tradeoffs

| Aspect | Tradeoff |
|--------|----------|
| No external queue | Zero dependency footprint, but no durable job execution |
| In-process cron | Simple deployment, but single-node only, no HA |
| No job persistence | Restart resilience, but lost in-flight work |
| SQLite lock retry | Handles concurrency, but not general job failure |
| No DLQ | Simplicity, but failed jobs have no visibility |
| 1-min cron resolution | Sufficient for maintenance tasks, but insufficient for high-frequency work |

## Failure Modes / Edge Cases

1. **Process restart loses all pending work**: Cron job functions are in-memory; on restart, pending iterations are lost.

2. **No job timeout**: A misbehaved cron job (infinite loop, blocking call) will run forever with no timeout or cancellation.

3. **Single-node only**: The cron scheduler is in-process. Multiple PocketBase instances will each run their own cron jobs independently — no work distribution or deduplication.

4. **SQLite lock retry exhaustion**: After 12 failed lock attempts (`core/db_retry.go:18`), the operation fails permanently. Under sustained contention, this causes request failures.

5. **Fire-and-forget goroutine failures**: Errors in `FireAndForget` tasks are only logged to stdout; there is no error callback, retry, or tracking.

6. **No visibility into job state**: There is no API or UI to view pending/running/completed cron jobs or their history.

## Future Considerations

1. **Job queue integration**: For production use with async AI pipelines, PocketBase would need an external job queue (e.g., background-worker library + Redis, or a dedicated system like Temporal).

2. **Persistent job state**: A job persistence layer (DB-backed job store) would enable restart resilience and job history.

3. **DLQ support**: Failed jobs should be routed to a dead-letter queue for visibility and manual intervention.

4. **Workflow engine**: Multi-step workflows (e.g., for AI pipeline orchestration) would require a workflow engine like Temporal or custom state machine implementation.

5. **Cancellation support**: Context-aware job execution with cancellation tokens would prevent runaway jobs.

## Questions / Gaps

1. **How are ad-hoc background tasks submitted?** No mechanism exists for submitting one-off background tasks — only cron-scheduled jobs.
2. **What happens if a cron job takes longer than its interval?** The next iteration will overlap since `runDue` fires `go j.Run()` without waiting (`tools/cron/cron.go:225`).
3. **Is there any observability for background jobs?** No metrics, logs with job IDs, or tracing for cron job execution found.
4. **How does multi-instance deployment work with cron?** Each instance runs its own cron jobs independently — there is no leader election or job deduplication.
5. **Are there any rate limiting mechanisms for async operations?** No rate limiting, throttling, or backpressure on `FireAndForget` tasks.

---

*Generated by `dimensions/05-background-jobs-async-workflows.md` against `pocketbase`.*