# Source Analysis: grafana

## Workflow / Agent Orchestration

### Source Info

| Field | Value |
|-------|-------|
| Name | grafana |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/grafana` |
| Language / Stack | Go (backend), TypeScript/React (frontend) |
| Analyzed | 2026-05-20 |

## Summary

Grafana does not implement a general-purpose workflow/orchestration engine. Instead, it has several specialized execution models tailored to different problem domains:

1. **Alert Rule Scheduling** (`pkg/services/ngalert/schedule/`): A ticker-based evaluation scheduler that runs alert rules at configured intervals. Each rule gets its own goroutine and channel. State is persisted to DB via a `StatePersister` interface with async and sync implementations.

2. **Provisioning Jobs** (`pkg/registry/apis/provisioning/jobs/`): A job queue system for repository synchronization. Jobs are stored as Kubernetes-style resources, claimed via label-based optimistic locking, and processed by worker plugins. Features include lease renewal, rollback on claim failure, and history archival.

3. **Background Cleanup** (`pkg/services/cleanup/`): A simple periodic job runner with sequential task execution on a ticker.

4. **Scheduler Utility** (`pkg/util/scheduler/`): A generic worker-pool scheduler with configurable worker count, backoff, and retry semantics.

## Rating

**5/10** — Basic implementation with significant gaps. Grafana has well-crafted job queuing for provisioning but lacks: durable workflow definitions, DAG-based task routing, native resumability after interruption, compensation/rollback logic beyond rollback-on-claim-failure, and parallel branch coordination. The alerting scheduler provides resumability via state persistence but lacks workflow-level constructs (steps, transitions, compensating actions).

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Scheduler utility | Generic worker-pool with configurable workers, backoff, retry | `pkg/util/scheduler/scheduler.go:20-24` |
| Alert rule scheduling | Ticker-based scheduler with per-rule goroutines | `pkg/services/ngalert/schedule/schedule.go:179-188` |
| Alert state persistence | SyncStatePersister writes state transitions to DB | `pkg/services/ngalert/state/persister_sync.go:34-129` |
| Alert state async persistence | AsyncStatePersister batches periodic saves | `pkg/services/ngalert/state/persister_async.go:14-46` |
| Job queue Store interface | `Store` interface with Claim, Complete, Update, RenewLease | `pkg/registry/apis/provisioning/jobs/driver.go:26-52` |
| Lease-based job claiming | Jobs claimed via `LabelJobClaim` timestamp on label | `pkg/registry/apis/provisioning/jobs/persistentstore.go:104-215` |
| Job rollback | Rollback function resets claim label on failure | `pkg/registry/apis/provisioning/jobs/persistentstore.go:177-209` |
| Lease renewal | Background goroutine renews lease periodically | `pkg/registry/apis/provisioning/jobs/driver.go:266-320` |
| Concurrent job drivers | Multiple jobDriver instances run in parallel | `pkg/registry/apis/provisioning/jobs/concurrent_driver.go:71-134` |
| Job progress recording | JobProgressRecorder tracks errors, warnings, summaries | `pkg/registry/apis/provisioning/jobs/progress.go:40-72` |
| Job timeout handling | jobctx timeout with lease expiry detection | `pkg/registry/apis/provisioning/jobs/driver.go:202-340` |
| Job history archival | HistoryWriter persists completed jobs | `pkg/registry/apis/provisioning/jobs/history_writer.go:1-50` |
| Cleanup job runner | Sequential cleanup tasks on 10-minute ticker | `pkg/services/cleanup/cleanup.go:108-163` |
| Alert rule evaluation | Per-rule goroutine with evaluation and retry config | `pkg/services/ngalert/schedule/schedule.go:62-113` |

## Answers to Dimension Questions

### 1. How are multi-step workflows defined, stored, and executed?

**Alert scheduling**: Rules are stored in the database (`AlertRule` struct) with an `IntervalSeconds` field. The scheduler (`schedule.schedule`) uses a ticker to determine which rules are ready to run each tick. Each rule is assigned a dedicated goroutine via `ruleFactory.newRuleRoutine()`. Execution is triggered by calling `ruleRoutine.Run()` from `dispatcherGroup.Go`.

**Provisioning jobs**: Jobs are Kubernetes-style resources (`provisioning.Job`) with a `JobSpec` containing action-specific fields (Pull, Push, Delete, Move, etc.). Jobs are created via REST API and stored in the etcd-backed API server. The `jobDriver.Run()` loop polls for unclaimed jobs via `store.Claim()`, then dispatches to a `Worker.Process()` method.

**No workflow DSL**: There is no declarative workflow definition format. Workflows are implicit in the job type/action system and the per-rule scheduling model.

### 2. What happens when a workflow is interrupted mid-step — can it resume?

**Alert scheduling**: State is persisted after each evaluation cycle via `SyncStatePersister` or `AsyncStatePersister`. On restart, the state manager is "warmed" from the store via `stateManager.Warm(ctx, store, store, reader)` in `pkg/services/ngalert/evaluation_runner.go:45`. The scheduler can resume evaluation from the persisted state.

**Provisioning jobs**: If a job driver crashes while processing a job, the job remains claimed (with `LabelJobClaim` timestamp). The `JobCleanupController` periodically lists expired jobs (claim older than configured expiry) and resets their state to `Pending` (`pkg/registry/apis/provisioning/jobs/expired_job_cleanup.go:25-50`). This provides eventual resume but not fine-grained step-level recovery.

**Gap**: No step-level checkpointing. If a sync job is interrupted after processing 50 of 100 resources, it restarts from scratch (or relies on idempotency of individual resource operations).

### 3. How are parallel workflow branches coordinated and joined?

**Alert scheduling**: The scheduler uses `errgroup.WithContext(ctx)` for the dispatcher group. Rules ready to run in a tick are collected into `readyToRun`, then `buildSequences` distributes them across workers with time-based staggering via `sch.runSequences(sequences, step)`. There is no fan-out/fan-in pattern; all rules run independently.

**Provisioning**: `ConcurrentJobDriver` spawns N `jobDriver` instances, each running a separate goroutine. Jobs are claimed one-at-a-time from the queue, so parallelism is at the job level, not within a single job. No nested parallelism or join semantics exist.

**Gap**: No DAG execution, no parallel branch coordination, no join/barrier patterns.

### 4. How does the system handle workflow-level timeouts and cancellations?

**Alert scheduling**: `RetryConfig` (defined in `pkg/services/ngalert/schedule/schedule.go:116-121`) controls exponential backoff for evaluation failures. Individual rule routines have their own context; stopping is done via `ruleRoutine.Stop(reason)`.

**Provisioning jobs**: A `jobTimeout` context is created per job in `driver.go:202`, and a `leaseRenewalLoop` runs concurrently to extend the lease. If the job exceeds `jobTimeout`, `processJobWithLeaseCheck` aborts via `ctx.Err()` from the jobctx. If the parent context is cancelled (graceful shutdown), the job is left for retry rather than being completed.

**Cleanup jobs**: 9-minute hard timeout on cleanup work via `context.WithTimeout(ctx, timeout)` in `cleanup.go:127`.

### 5. Is there compensation logic for partial workflow failures?

**Provisioning jobs**: The primary compensation mechanism is the `rollback` function returned by `Claim()`. On claim conflict or failure, the rollback resets the job's claim label and sets state back to `Pending` (`persistentstore.go:196-209`). This allows another worker to pick up the job.

**Error handling**: `JobProgressRecorder` tracks failed resource operations (create, update, delete) and records error counts. Jobs can be marked `JobStateError` or `JobStateWarning` based on whether errors occurred. However, there is no Saga-style multi-step compensation (e.g., undo previous steps on failure).

**Gap**: No compensating transactions or saga pattern. Failed jobs do not automatically undo prior successful steps. Orphan cleanup jobs (`releaseResources`, `deleteResources`) handle resource cleanup after repository deletion but do not compensate within a workflow.

## Architectural Decisions

1. **Opt-in workers over generic runtime**: Workers implement the `Worker` interface (`pkg/registry/apis/provisioning/jobs/queue.go:48-54`) and self-report which job types they support via `IsSupported()`. This allows targeted job routing without a central interpreter.

2. **Kubernetes-style job resources**: Jobs are proper API resources with labels, status, metadata. Claiming uses optimistic locking via label updates (no dedicated locking server needed).

3. **Lease-based coordination**: Instead of a central queue, jobs are claimed by updating a label. Expired jobs are detected by a periodic cleaner. This is similar to leader election patterns but for job ownership.

4. **State persistence as resumability mechanism**: Alert state is periodically synced to DB. On restart, state is warmed before scheduling begins. This is not full checkpoint/replay but provides durability for the alert evaluation domain.

5. **Separate sync and async persisters**: `SyncStatePersister` writes immediately after evaluation; `AsyncStatePersister` batches writes on a tick. This allows teams to trade consistency for throughput.

## Notable Patterns

- **Per-rule goroutine with registry**: Alert rules are stored in a `ruleRegistry` map and each gets a dedicated goroutine. The scheduler creates/restarts/stops routines as rules are added/updated/deleted (`schedule.go:342-363`).

- **Lease renewal loop**: Job processing spawns a background goroutine that periodically calls `store.RenewLease()`. If renewal fails 3 times consecutively, the `leaseExpired` channel is closed and the job is aborted.

- **Job progress throttling**: `maybeNotifyProgress()` coalesces progress updates to avoid overwhelming the store — immediate notification on status change, then coalesced updates every 5 seconds (`progress.go:17-36`).

- **Context-aware provisioning identity**: Jobs run with `identity.WithProvisioningIdentity(ctx, namespace)` to scope permissions to the job's namespace rather than the operator's broader permissions.

## Tradeoffs

- **No workflow DSL**: Implicit workflows via job types trades expressiveness for simplicity. Adding new job types requires new worker implementations, not just new configuration.

- **No fine-grained step recovery**: Job interruption requires full job retry. For long-running sync jobs, this means re-processing all resources even if most were already completed.

- **No parallel branches within a job**: The sync worker processes resources sequentially. For large repository syncs, this limits throughput. Fan-out parallelism would require significant re-architecture.

- **Eventual resume for failed jobs**: Expired job cleanup runs on a configurable interval (default 30s), so interrupted jobs may wait before being reclaimed by another worker.

## Failure Modes / Edge Cases

1. **Job stuck in claimed state**: If a worker crashes without completing the job and the lease renewal loop also fails, the job sits claimed until `ListExpiredJobs` detects the expired claim. The configured expiry (default 30s) bounds the stuck duration.

2. **Claim conflict on progress update**: When `onProgress()` encounters an `apierrors.IsConflict(err)`, it retries by fetching fresh job data and re-attempting the update. Maximum 3 retries before giving up (`driver.go:460-467`).

3. **Orphan cleanup job race**: `handleOrphanCleanupJob` checks that the repository does NOT exist or is stuck in `Terminating` state. If the repository is recreated between job creation and execution, the worker aborts with an error.

4. **Namespace pending delete**: Workers skip jobs if `appcontroller.IsPendingDelete(r.Labels)` returns true, recording a warning but not failing.

5. **Alert rule state drift**: If the state manager fails to persist and the process restarts, alert state may be recomputed from the last persisted state, potentially missing transitions that occurred in the final evaluation cycle.

## Future Considerations

1. **DAG-based workflow engine**: The current job system could benefit from step-level dependencies, parallel branch execution, and join/barrier constructs for complex provisioning scenarios.

2. **Step-level checkpointing**: For long-running sync jobs, persisting progress at the resource level (not just job status) would enable true resume without full job retry.

3. **Saga/compensation support**: For multi-resource operations that may fail partway (e.g., move operations that involve create + delete), explicit compensation on failure would improve reliability.

4. **Workflow timeout orchestration**: Beyond per-job timeouts, a workflow-level timeout with cascading cancellation would help manage long-running operations.

## Questions / Gaps

1. **No evidence found** for workflow definition DSL or graph-based execution model beyond job-type routing.

2. **No evidence found** for parallel branch coordination (fan-out/fan-in, barriers, joins) within a single workflow.

3. **No evidence found** for fine-grained step-level retry (only job-level and evaluation-level retries exist).

4. **No evidence found** for native compensation/rollback beyond rollback-on-claim-failure — failed sync operations do not automatically undo prior successful operations within the same job.

5. **No evidence found** for workflow pause/resume controls (suspend and resume a running workflow mid-execution).

---

Generated by `dimensions/12-workflow-agent-orchestration.md` against `grafana`.