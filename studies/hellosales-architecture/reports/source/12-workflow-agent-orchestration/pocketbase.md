# Source Analysis: pocketbase

## Workflow / Agent Orchestration

### Source Info

| Field | Value |
|-------|-------|
| Name | pocketbase |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/pocketbase` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

PocketBase is a backend-as-a-service framework built in Go. It does **not** implement a workflow/orchestration engine. Instead, it provides:

1. **Cron-based scheduled jobs** (`tools/cron/cron.go`) — time-triggered, not event-driven workflows
2. **Hook-based event system** (`tools/hook/hook.go`) — reactive handlers attached to app lifecycle and model events
3. **Fire-and-forget background tasks** (`tools/routine/routine.go:13`) — simple goroutine wrappers with panic recovery
4. **Database transaction rollback** (`core/db_tx.go`) — only within a single db transaction

There is **no DAG execution engine, no state machine, no checkpoint/recovery mechanism, no step-level retry semantics, no Saga pattern, and no parallel branch coordination**. PocketBase is fundamentally a request-response CRUD framework with hooks, not a workflow orchestration system.

## Rating

**2 / 10** — Poor implementation or absent

Workflow/orchestration capabilities are essentially nonexistent. The system offers only basic cron scheduling and hook handlers, none of which constitute a workflow engine.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Cron scheduler | Simple crontab-like scheduler with time-based trigger | `tools/cron/cron.go:19` |
| Job struct | Basic job with id, expression, and run function | `tools/cron/job.go:6-10` |
| Hook system | Generic concurrent-safe hook manager | `tools/hook/hook.go:34-57` |
| Fire-and-forget | Goroutine wrapper with panic recovery | `tools/routine/routine.go:9-34` |
| DB retry | Lock retry for database contention | `core/db_retry.go:20-41` |
| Transaction rollback | Standard db transaction rollback | `core/db_tx.go:78` |
| Manual rollback | Record upsert dry-run with manual rollback | `forms/record_upsert.go:259-274` |
| Backup restore revert | Revert logic for failed backup restore | `core/base_backup.go:274-288` |
| App event hooks | Bootstrap, Serve, Terminate, Backup events | `core/base.go:236-241` |
| Model event hooks | OnModelCreate, OnModelUpdate, OnModelDelete and after variants | `core/base.go:244-256` |
| No workflow DSL | No workflow definition or configuration model found | — |
| No checkpoint | No workflow state persistence or checkpoint mechanism | — |
| No parallel branches | No DAG execution or parallel branch coordination | — |
| No compensation | No Saga or compensation logic for multi-step failures | — |

## Answers to Dimension Questions

### 1. How are multi-step workflows defined, stored, and executed?

**No evidence found.** PocketBase has no workflow definition DSL or configuration model. Multi-step workflows cannot be defined, stored, or executed within this codebase. The closest approximations are:

- **Cron jobs** (`tools/cron/cron.go:68-107`) — registered by id and cron expression, execute a single function
- **Hooks** (`tools/hook/hook.go:54`) — event handlers attached to app or model lifecycle events

Neither constitutes a workflow engine.

### 2. What happens when a workflow is interrupted mid-step — can it resume?

**No evidence found.** There is no workflow state persistence, no checkpoint/recovery mechanism, and no resumption capability. If a "workflow" (e.g., a cron job or hook chain) is interrupted mid-execution, there is no mechanism to resume it. The system relies entirely on the caller to handle completion or retry.

The `tools/routine/routine.go:9-34` `FireAndForget` function executes tasks in goroutines with panic recovery, but provides no completion tracking, no state checkpoint, and no retry on interrupt.

### 3. How are parallel workflow branches coordinated and joined?

**No evidence found.** There is no parallel execution model in PocketBase. The cron scheduler (`tools/cron/cron.go:216-227`) runs due jobs concurrently via `go j.Run()` at line 225, but there is no branch coordination, no join semantics, and no fan-out/fan-in patterns. Each job runs in isolation.

### 4. How does the system handle workflow-level timeouts and cancellations?

**No evidence found.** There are no workflow-level timeout or cancellation mechanisms. The cron scheduler has no per-job timeout (`tools/cron/job.go:23-26` simply calls `j.fn()`). The DB retry mechanism (`core/db_retry.go:20-41`) handles only database lock contention, not workflow timeouts.

### 5. Is there compensation logic for partial workflow failures?

**Partial evidence.** The system has **transaction rollback** within a single database operation (`core/db_tx.go:78`), and a **manual rollback pattern** in `forms/record_upsert.go:259-274` for dry-run submits. The backup restore process (`core/base_backup.go:274-288`) also has a revert function.

However, there is **no Saga pattern, no compensation/rollback for multi-step workflows, and no cross-service transactional consistency**. The rollback capabilities are limited to single-transaction or single-record scenarios.

## Architectural Decisions

1. **Hook-based reactivity over workflow orchestration** — PocketBase chose an event-hook model rather than a workflow engine, likely to keep the core simple and focused on CRUD/API operations.

2. **Cron for scheduled tasks** — Time-triggered jobs are the only "workflow-like" construct, using standard cron expressions (`tools/cron/schedule.go:85` shows step parsing).

3. **Goroutine-based background execution** — `FireAndForget` (`tools/routine/routine.go:13`) is the primary mechanism for non-blocking background work, with panic recovery but no result tracking.

4. **DB-level transaction rollback only** — Rollback is confined to database transactions (`core/db_tx.go`) and does not extend to multi-step workflow compensation.

## Notable Patterns

- **Hook chain with `e.Next()`** (`tools/hook/hook.go:153-173`) — Hooks execute in reverse order, each calling `e.Next()` to proceed. This is a middleware-like chain, not a workflow.

- **Tagged hooks** (`tools/hook/tagged.go:54`) — Hooks can be filtered by tags (e.g., collection name) to target specific models.

- **Fire-and-forget with semaphore** (`core/base.go:1310-1342`) — File deletion uses a semaphore to limit concurrent workers, the only place that resembles a task queue.

- **DB lock retry with exponential backoff** (`core/db_retry.go:43-62`) — Retries on "database is locked" errors with intervals: 50ms, 100ms, 150ms, 200ms, 300ms, 400ms, 500ms, 700ms, 1000ms.

## Tradeoffs

| Aspect | Tradeoff |
|--------|----------|
| Simplicity | No workflow engine means simpler code, but complex business processes must be implemented outside PocketBase |
| Scalability | Cron-based jobs and hooks are not designed for high-throughput workflow execution |
| Reliability | No checkpoint/recovery means interrupted workflows cannot resume; failures are not retryable at the workflow level |
| Consistency | Only DB-level transactions; no distributed transaction or Saga support |
| Extensibility | Hooks are limited to the predefined event types; cannot define custom workflow steps |

## Failure Modes / Edge Cases

1. **Interrupted cron job** — If a cron job crashes mid-execution, there is no retry, no state checkpoint, and no recovery mechanism. Next scheduled run simply executes again.

2. **Hook chain failure** — If a hook handler fails and doesn't call `e.Next()`, the chain stops. The system logs a warning about missing `e.Next()` in bootstrap (`core/base.go:438-439`), but doesn't prevent the issue.

3. **Transaction rollback scope** — Rollback only covers the current DB transaction. If a multi-step operation spans multiple transactions, partial failure leaves data inconsistent.

4. **Backup restore revert panic** — If revert fails during backup restore, the system panics (`core/base_backup.go:293`), which could leave the app in an inconsistent state.

5. **Fire-and-forget failure** — `routine.FireAndForget` catches panics but silently logs them; the caller has no way to know if the background task succeeded.

## Future Considerations

PocketBase could consider adding workflow orchestration if the project scope expands to support:

- DAG-based workflow execution with state persistence
- Checkpoint/recovery for interrupted workflows
- Step-level retry with configurable backoff
- Saga pattern for cross-service rollback
- Parallel branch coordination with join barriers

However, this would represent a significant architectural shift from the current request-response model.

## Questions / Gaps

- **No workflow DSL** — How should users define multi-step workflows in PocketBase today? Answer: They cannot; workflows must be implemented externally.
- **No async task queue** — How does PocketBase handle long-running background tasks? Answer: Only via `FireAndForget` goroutines; no task queue or worker pool with backpressure.
- **No scheduled job persistence** — Are cron jobs persisted? Answer: No; jobs are registered in-memory at startup and lost on restart.
- **No workflow timeout** — How are runaway workflows terminated? Answer: They are not; there is no timeout or cancellation mechanism.
- **No Saga/compensation** — How does PocketBase handle partial failures in multi-step operations? Answer: It doesn't; only single-transaction rollback is supported.

---

Generated by `dimensions/12-workflow-agent-orchestration.md` against `pocketbase`.