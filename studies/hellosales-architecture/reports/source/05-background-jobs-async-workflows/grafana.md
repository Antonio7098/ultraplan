# Source Analysis: grafana

## Background Jobs & Async Workflows

### Source Info

| Field | Value |
|-------|-------|
| Name | grafana |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/grafana` |
| Language / Stack | Go (Kubernetes API-based job queue, in-memory scheduler) |
| Analyzed | 2026-05-19 |

## Summary

Grafana implements a dual-queue architecture: a lightweight in-memory multi-tenant scheduler for short-lived internal operations, and a Kubernetes API-based persistent job queue for the provisioning system. Jobs are claimed via lease mechanism, tracked with Prometheus metrics, and archived to Loki. No external queue infrastructure (Redis/Kafka/NATS) is used — all state lives in Kubernetes etcd. Retry policies use exponential backoff with configurable limits, and expired jobs are periodically cleaned up by a dedicated controller.

## Rating

**6/10** — Basic implementation with meaningful gaps. The provisioning job system is reasonably complete with lease-based claiming, progress tracking, and cleanup, but lacks distributed coordination beyond the single Kubernetes cluster. The in-memory scheduler is simple but has no persistence guarantees. No saga/workflow orchestration layer, no dead-letter queue with retry, and no backpressure mechanisms beyond per-tenant queue limits.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| In-memory multi-tenant queue | `Queue` struct with per-tenant channels, round-robin scheduling | `pkg/util/scheduler/queue.go:91-118` |
| Round-robin tenant fairness | `scheduleRoundRobin()` using `container/list` | `pkg/util/scheduler/queue.go:172-209` |
| Per-tenant queue limits | Default 100 items per tenant | `pkg/util/scheduler/queue.go:18` |
| In-memory queue enqueue | `Enqueue()` adds work to tenant-specific queues | `pkg/util/scheduler/queue.go:277-311` |
| In-memory queue dequeue | `Dequeue()` blocks using linked-list round-robin | `pkg/util/scheduler/queue.go:313-339` |
| Job persistence via K8s API | `Claim()` atomically claims job using label selectors | `pkg/registry/apis/provisioning/jobs/persistentstore.go:98-215` |
| Job claim atomicity | Resource version conflicts for atomic lease acquisition | `pkg/registry/apis/provisioning/jobs/persistentstore.go:150-161` |
| Job claim rollback | Returns rollback function to release claim | `pkg/registry/apis/provisioning/jobs/persistentstore.go:177-209` |
| Job insertion | `Insert()` creates jobs via Kubernetes API | `pkg/registry/apis/provisioning/jobs/persistentstore.go:460-522` |
| Job completion | `Complete()` deletes job from active store | `pkg/registry/apis/provisioning/jobs/persistentstore.go:286-330` |
| Retry with exponential backoff | `dequeueWithRetries()` using `dskit/backoff` | `pkg/util/scheduler/scheduler.go:55-81` |
| Backoff config | MinBackoff: 100ms, MaxBackoff: 1s, MaxRetries: 5 | `pkg/util/scheduler/scheduler.go:17-23` |
| Generic retry utility | `Retry()` with exponential backoff | `pkg/util/retryer/retryer.go:18-47` |
| Lease renewal loop | Renews job leases periodically, allows 3 consecutive failures | `pkg/registry/apis/provisioning/jobs/driver.go:266-320` |
| Lease failure tolerance | Closes `leaseExpired` channel after 3 failures | `pkg/registry/apis/provisioning/jobs/driver.go:309-310` |
| Progress update retry | Retries up to 3 times on conflict | `pkg/registry/apis/provisioning/jobs/driver.go:424-483` |
| Expired job cleanup | `Cleanup()` runs periodically, marks expired jobs as failed | `pkg/registry/apis/provisioning/jobs/expired_job_cleanup.go:87-135` |
| Cleanup interval config | 3x expiry, min 30s, max 5 min | `pkg/registry/apis/provisioning/jobs/expired_job_cleanup.go:33-41` |
| Default job expiry | 30 seconds | `pkg/registry/apis/provisioning/jobs/expired_job_cleanup.go:86` |
| Worker interface | `Worker` interface with `IsSupported()` and `Process()` | `pkg/registry/apis/provisioning/jobs/queue.go:45-54` |
| Concurrent multi-driver | `ConcurrentJobDriver` spawns N driver goroutines | `pkg/registry/apis/provisioning/jobs/concurrent_driver.go:13-25` |
| Driver concurrency config | Default based on CPU count | `pkg/registry/apis/provisioning/jobs/concurrent_driver.go:71-133` |
| Job progress tracking | `jobProgressRecorder` with mutex protection | `pkg/registry/apis/provisioning/jobs/progress.go:40-72` |
| Progress debounce | Immediate if >500ms or job finished, full every 5s | `pkg/registry/apis/provisioning/jobs/progress.go:17-37` |
| Job history via Loki | `WriteJob()` stores completed jobs, `RecentJobs()` queries | `pkg/registry/apis/provisioning/jobs/loki_history.go:52-108` |
| Job polling loop | `Run()` uses `time.NewTicker` for job discovery | `pkg/registry/apis/provisioning/jobs/driver.go:119-144` |
| K8s informer notifications | JobController sends notifications on job creation | `pkg/registry/apis/provisioning/jobs/driver.go:146-162` |
| Queue metrics | Prometheus metrics for queue length, wait duration | `pkg/util/scheduler/queue.go:151-165` |
| Deterministic job naming | Job name generated based on action type | `pkg/registry/apis/provisioning/jobs/persistentstore.go:525-540` |

## Answers to Dimension Questions

### 1. How are background jobs submitted, tracked, and completed?

**Submission:** Jobs are created via `Insert()` at `pkg/registry/apis/provisioning/jobs/persistentstore.go:460-522`, which writes a job resource to the Kubernetes API (etcd). The job receives a deterministic name based on action type (line 525-540) and is labeled with the repository.

**Tracking:** The `JobController` uses a Kubernetes informer (`pkg/registry/apis/provisioning/jobs/driver.go:146-162`) to receive notifications when jobs are created, rather than polling. The `jobProgressRecorder` (`pkg/registry/apis/provisioning/jobs/progress.go:40-72`) tracks progress with debounced updates (immediate if >500ms passed, full every 5 seconds at line 66).

**Completion:** `Complete()` at line 286-330 deletes the job from the active store. The job is then archived to Loki via `WriteJob()` in `pkg/registry/apis/provisioning/jobs/loki_history.go:52-79`.

### 2. What happens when a job fails — retry, dead-letter, or compensate?

**Retry:** The `dequeueWithRetries()` at `pkg/util/scheduler/scheduler.go:55-81` uses exponential backoff (100ms min, 1s max, 5 max retries). Progress updates retry up to 3 times on conflict (`pkg/registry/apis/provisioning/jobs/driver.go:424-483`).

**Dead-letter:** No explicit dead-letter queue. Failed/expired jobs are cleaned up by `Cleanup()` at `pkg/registry/apis/provisioning/jobs/expired_job_cleanup.go:87-135`. Expired jobs (lease older than 30s by default) are marked as `JobStateError` and archived — they are not retried.

**Compensation:** No compensation/saga pattern observed. The cleanup simply marks the job as failed with the lease expiry message.

### 3. How does the system handle job duration limits and cancellation?

**Duration limits:** The lease has a configurable expiry (default 30s at `expired_job_cleanup.go:86`). The `leaseRenewalLoop()` at `pkg/registry/apis/provisioning/jobs/driver.go:266-320` renews the lease periodically. If 3 consecutive renewal attempts fail, the `leaseExpired` channel is closed (lines 309-310), causing the job to be cleaned up as expired.

**Cancellation:** No explicit cancellation mechanism found. When a job's lease expires, it's simply marked as failed. The worker goroutines use `context.Context` but no graceful cancellation signal propagates to the worker `Process()` method.

### 4. Are workflows composed of multiple steps with state management?

**No.** The system uses a simple worker pattern where each `Worker.Process()` handles a job atomically. There is no multi-step workflow orchestration, no DAG execution, and no saga pattern. Job state is limited to: `JobStatePending`, `JobStateRunning`, `JobStateCompleted`, `JobStateFailed`, `JobStateError`. The `jobProgressRecorder` tracks intermediate progress (errors, warnings, resource counts) but this is ephemeral and not used for retry or resume.

### 5. How is backpressure applied when the system is overloaded?

**Per-tenant queue limits:** The in-memory scheduler enforces a default limit of 100 items per tenant (`pkg/util/scheduler/queue.go:18`). When the queue is full, `Enqueue()` blocks or discards based on configuration.

**No global backpressure:** There is no mechanism to slow down job submission based on system load. The Kubernetes-based job queue has no consumer-side backpressure — jobs accumulate in etcd until a driver claims them. The `ConcurrentJobDriver` has a fixed number of workers (based on CPU count) but does not dynamically scale down under load.

## Architectural Decisions

1. **No external queue infrastructure** — Grafana stores jobs as Kubernetes resources in etcd rather than using Redis, NATS, or Kafka. This avoids additional dependencies but limits queue semantics (no message durability, no consumer groups).

2. **Lease-based job claiming** — Jobs are claimed by updating a label with a timestamp (`LabelJobClaim`). This provides atomicity via resource version conflicts (`pkg/registry/apis/provisioning/jobs/persistentstore.go:150-161`) but requires careful clock synchronization across nodes.

3. **Polling + informer hybrid** — The job driver polls periodically (`time.NewTicker`) but receives immediate notifications via Kubernetes informer when jobs are created. This reduces polling frequency while ensuring responsiveness.

4. **Loki for job history** — Completed jobs are written to Loki rather than stored in etcd. This avoids etcd bloat but means job history is eventually consistent and not queryable via Kubernetes API.

5. **No distributed transactions** — Jobs are atomic with no multi-step coordination. If a job fails partway through, there is no compensation or rollback mechanism.

## Notable Patterns

- **Worker interface pattern** — `Worker` interface at `pkg/registry/apis/provisioning/jobs/queue.go:45-54` with `IsSupported()` and `Process()` allows pluggable job handlers (SyncWorker, MigrationWorker, DeleteWorker, etc.)

- **Lease renewal heartbeat** — `leaseRenewalLoop()` at `pkg/registry/apis/provisioning/jobs/driver.go:266-320` runs as a goroutine alongside job processing, renewing the lease every few seconds to prevent expiry.

- **Round-robin tenant fairness** — `scheduleRoundRobin()` at `pkg/util/scheduler/queue.go:172-209` iterates through tenants in round-robin order, ensuring no tenant monopolizes the queue.

- **Progress debouncing** — `maybeNotifyProgress()` at `pkg/registry/apis/provisioning/jobs/progress.go:17-37` batches progress updates to avoid overwhelming the API.

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| K8s API for job queue | No message durability; jobs lost if etcd data lost |
| No external queue | Simpler deployment; less operational overhead |
| Lease-based claiming | Clock skew can cause premature expiry or double-claim |
| No dead-letter queue | Failed jobs are lost after cleanup; no visibility into failure chain |
| In-memory scheduler | No persistence; jobs lost on restart |
| Fixed worker count | Cannot scale down under load; cannot scale up for bursts |
| Loki for history | Eventually consistent; cannot correlate with K8s job state |

## Failure Modes / Edge Cases

1. **Clock skew** — If nodes have different clocks, the lease timestamp comparison (`LabelJobClaim`) could allow two drivers to claim the same job, or fail to claim a valid job.

2. **Pod crash during job processing** — If a driver pod crashes while processing a job, the lease expires after 30s and the job is re-queued. However, any partial progress is lost — there is no checkpoint/resume.

3. **etcd write failure on claim** — If the claim update conflicts with another driver, `Claim()` returns `ErrJobClaimed` and the driver tries again on the next poll cycle.

4. **Loki write failure** — If archiving to Loki fails (`pkg/registry/apis/provisioning/jobs/loki_history.go:52-79`), the job is still completed but history is lost.

5. **Worker panic** — If `Worker.Process()` panics, the goroutine exits. The job lease eventually expires and it's re-claimed by another driver.

6. **Queue overflow** — If the per-tenant queue fills to capacity (100 items), new enqueues block or discard depending on configuration (`pkg/util/scheduler/queue.go:18`).

## Future Considerations

1. **Dead-letter queue** — Implement a DLQ pattern to capture failed jobs with their error context for later inspection or replay.

2. **Checkpoint/resume** — Add state persistence for long-running jobs so partial progress is preserved across restarts.

3. **Cancellation propagation** — Propagate `context.Context` cancellation to the worker `Process()` method for graceful shutdown.

4. **Dynamic worker scaling** — Allow the `ConcurrentJobDriver` to scale worker count based on queue depth or system load.

5. **Multi-step workflows** — Introduce a workflow engine for jobs with dependent steps (DAG execution).

## Questions / Gaps

1. **No backpressure on K8s job queue** — How does the system prevent etcd from accumulating millions of pending jobs if all workers are slow?

2. **No job retry after failure** — The cleanup marks failed jobs as `JobStateError` and archives them. Is there a way to automatically retry, or must this be done manually?

3. **No visibility into job dependencies** — How are sync ordering and repository dependencies managed? If repo B depends on repo A, and A's sync fails, what happens to B?

4. **Clock skew mitigation** — Is there any mechanism to handle clock drift between nodes claiming jobs?

---

Generated by `dimensions/05-background-jobs-async-workflows.md` against `grafana`.