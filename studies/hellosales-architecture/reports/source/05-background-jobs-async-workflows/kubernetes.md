# Source Analysis: kubernetes

## Background Jobs & Async Workflows

### Source Info

| Field | Value |
|-------|-------|
| Name | kubernetes |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/kubernetes` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

Kubernetes provides robust background job processing through native Job and CronJob resources backed by a controller pattern. The architecture uses a workqueue-based reconciliation model with exponential backoff retry, pod failure policies, and UID-based tracking for job completion. No dedicated dead-letter queue exists; failed jobs remain visible in job status with tracked UIDs. CronJob scheduling provides time-based job triggering with concurrency policies.

## Rating

**7/10** — Good implementation with minor issues. The Kubernetes job system is battle-tested and production-grade for container batch workloads. However, it lacks native workflow/DAG orchestration (multi-step state machines), explicit dead-letter queues with retry semantics beyond job-level backoff, and advanced scheduling features like迟到 requeue or cron-like scheduling with configurable jitter. The absence of Temporal-like durable execution primitives limits use cases requiring long-running AI pipelines with complex branching.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Workqueue base interface | `TypedInterface[T]` with Add, Len, Get, Done, ShutDown | `staging/src/k8s.io/client-go/util/workqueue/queue.go:30-38` |
| Rate limiting queue | `TypedRateLimitingInterface[T]` with AddRateLimited, Forget, NumRequeues | `staging/src/k8s.io/client-go/util/workqueue/rate_limiting_queue.go:26-40` |
| Delaying queue | `TypedDelayingInterface[T]` with AddAfter for delayed re-enqueue | `staging/src/k8s.io/client-go/util/workqueue/delaying_queue.go:35-41` |
| Exponential backoff limiter | `TypedItemExponentialFailureRateLimiter[T]` — baseDelay*2^failures, capped | `staging/src/k8s.io/client-go/util/workqueue/default_rate_limiters.go:84-105` |
| Default rate limiter | Combines exponential + bucket (10 QPS, 100 bucket) | `staging/src/k8s.io/client-go/util/workqueue/default_rate_limiters.go:50-56` |
| Job controller struct | `Controller` with queue, podControl, expectations | `pkg/controller/job/job_controller.go:89-156` |
| Job backoff record | Tracks failuresAfterLastSuccess and lastFailureTime per job | `pkg/controller/job/backoff_utils.go:33-37` |
| Job backoff calculation | `getRemainingTimeForFailuresCount` — exponential backoff: `defaultBackoff * 2^(failures-1)`, capped at `maxBackoff` | `pkg/controller/job/backoff_utils.go:255-276` |
| Job controller constants | DefaultJobApiBackOff=1s, MaxJobApiBackOff=1min, DefaultJobPodFailureBackOff=10s, MaxJobPodFailureBackOff=10min | `pkg/controller/job/job_controller.go:72-79` |
| Pod failure policy | `matchPodFailurePolicy` with FailJob, FailIndex, Ignore, Count actions | `pkg/controller/job/pod_failure_policy.go:27-76` |
| Worker pattern | `processNextWorkItem` — Get(), defer Done(), on error AddRateLimited(), else Forget() | `pkg/controller/job/job_controller.go:729-753` |
| UID tracking expectations | `uidTrackingExpectations` for tracking pods awaiting finalizer deletion | `pkg/controller/job/tracking_utils.go:43-53` |
| CronJob controller | `ControllerV2` with `TypedRateLimitingInterface[string]` queue | `pkg/controller/cronjob/cronjob_controllerv2.go:66-86` |
| CronJob cleanup | `cleanupFinishedJobs` respects FailedJobsHistoryLimit/SuccessfulJobsHistoryLimit | `pkg/controller/cronjob/cronjob_controllerv2.go:700-736` |
| CronJob concurrency | ForbidConcurrent blocks new jobs if active exist; ReplaceConcurrent deletes active | `pkg/controller/cronjob/cronjob_controllerviv2.go:593-621` (lines 593-621 in cronjob_controllerv2.go) |
| Slow-start batch creation | Batch size doubles each iteration for pod creation | `pkg/controller/job/job_controller.go:1888` (referenced in `manageJob`) |

## Answers to Dimension Questions

### 1. How are background jobs submitted, tracked, and completed?

**Submission**: Jobs are created via Kubernetes API (`kubectl create job` or client-go). CronJobs auto-submit Jobs on schedule based on cron expression.

**Tracking**: The Job controller uses a workqueue with keys derived from job namespace/name (`controller.KeyFunc`). Each job key is processed by `syncJob()` which reconciles desired vs actual pod state. Job completion is tracked via pod phase (Succeeded/Failed) recorded in job `.status.conditions`. The `uncounted` set tracks pods whose results have been written to job status but not yet incorporated.

**Completion**: `manageJob()` creates or deletes pods to match `spec.completions` and `spec.parallelism`. When a pod finishes, `getNewFinishedPods()` segregates succeeded/failed pods not yet in status; these are incorporated into job `.status.succeeded`/`.status.failed` counters. The job reaches `Complete`/`Failed` condition when counters match completions or max retries exhausted.

**File evidence**:
- `pkg/controller/job/job_controller.go:908-1203` — `syncJob` main sync logic
- `pkg/controller/job/job_controller.go:1744-1799` — `manageJob` core pod management
- `pkg/controller/cronjob/cronjob_controllerv2.go:442-694` — `syncCronJob` reconciliation

### 2. What happens when a job fails — retry, dead-letter, or compensate?

**Retry (backoff)**: On pod failure, the job controller tracks failures in `backoffRecord` (`pkg/controller/job/backoff_utils.go:33-37`). The backoff duration is `defaultBackoff * 2^(failures-1)` up to `maxBackoff` (10 minutes for pod failures). The `enqueueSyncJobWithDelay()` method re-enqueues the job with the calculated delay.

**Pod Failure Policy**: Jobs can define `spec.podFailurePolicy` with rules (`pkg/controller/job/pod_failure_policy.go:27-76`) that specify actions:
- `FailJob` — marks job as failed, no more pods created
- `FailIndex` — marks indexed job as failed, no replacement pod created for that index
- `Ignore` — treats pod as successful
- `Count` — counts toward completions without failing the job

**No Dead-Letter Queue**: There is no explicit DLQ. Failed pods are tracked in job `.status.failed` and job reaches `Failed` condition. Jobs remain visible for inspection. Orphan pods are handled separately via PodGC and the orphan worker.

**Compensate**: No saga or compensation pattern exists. Job failure is terminal unless `restartPolicy=OnFailure` or `restartPolicy=Always` (on pod level). The system does not rollback or compensate partial work.

### 3. How does the system handle job duration limits and cancellation?

**Duration limits**: Jobs can set `spec.activeDeadlineSeconds` at job or pod level. When exceeded, pods are terminated via `ActiveDeadlineExceeded` condition. The `manageJob` loop checks `activeDeadlineSeconds` at `pkg/controller/job/job_controller.go:1799` (within manageJob logic).

**Cancellation**: Jobs are cancelled by setting `.spec.suspend=true` or deleting the job. When suspended, `jobSuspended()` returns true (`pkg/controller/job/job_controller.go:1740-1742`), causing `manageJob` to delete all active pods. On job deletion, the job controller's informer triggers deletion of associated pods via owner reference cascading delete.

**Job timeout via `.spec.backoffLimit`**: The job `spec.backoffLimit` (default 6) limits pod retry restarts before job is marked failed.

### 4. Are workflows composed of multiple steps with state management?

**No native workflow/DAG**: Kubernetes Job is a single-pod-workload primitive, not a workflow engine. There is no native multi-step orchestration with state management between steps. Complex pipelines require external tools (Argo Workflows, Tekton, Temporal) built atop Kubernetes.

**CronJob scheduling**: CronJobs only trigger Jobs on schedule; they do not compose steps or manage state across executions. Each triggered Job is independent.

**Indexed jobs**: Jobs support indexed pods (`spec.completionMode=Indexed`), where each pod has a unique index. This enables simple fan-out/fan-in patterns but lacks native state aggregation between indices.

**Evidence of limitation**: No evidence of saga patterns, step-to-step state persistence, or DAG execution primitives. The job controller focuses on pod lifecycle, not workflow orchestration.

### 5. How is backpressure applied when the system is overloaded?

**Workqueue rate limiting**: The default `TypedItemExponentialFailureRateLimiter` applies exponential backoff on errors. Combined with `TypedBucketRateLimiter` (10 QPS, 100 bucket), the queue enforces both per-item and global rate limits (`staging/src/k8s.io/client-go/util/workqueue/default_rate_limiters.go:50-56`).

**API server backoff**: API operations that fail get retried with `DefaultJobApiBackOff=1s` to `MaxJobApiBackOff=1min` exponential backoff (`pkg/controller/job/job_controller.go:72-75`).

**Slow-start batch creation**: `manageJob` creates pods in batches using slow-start: initial batch size doubles each successful iteration (`pkg/controller/job/job_controller.go:1888` in the manageJob logic), avoiding overwhelming the API server with large job pod creation.

**Max pod changes per sync**: `MaxPodCreateDeletePerSync=500` caps pod creates/deletes per sync cycle (`pkg/controller/job/job_controller.go:84-86`).

**No explicit queue depth limits**: The workqueue does not appear to enforce max depth or reject items when overloaded; backpressure is implicit via rate limiting.

## Architectural Decisions

| Decision | Rationale | Tradeoff |
|----------|-----------|----------|
| Workqueue-based controller pattern | Decouples observation from processing; enables concurrent workers | Debugging distributed across goroutines |
| Exponential backoff for retries | Prevents thundering herd on transient failures | Can delay recovery for long-running failures |
| UID-tracking expectations | Allows tracking in-flight creates/deletes without blocking | Extra memory for tracking sets |
| No DLQ | Job status provides visibility; DLQ adds complexity | No automatic isolated retry for poison messages |
| Pod Failure Policy via spec | Declarative failure handling | Limited to fixed actions; no custom logic |
| CronJob owns Job lifecycle | Simplifies CronJob controller logic | CronJob must track/cleanup old Jobs |

## Notable Patterns

**Controller reconciliation loop**: Standard pattern of `informer -> queue -> worker -> reconcile -> update status`. Workers call `Get()` from queue, process, `Done()` mark complete, on error `AddRateLimited()` for retry.

**Expectations pattern**: Before creating pods, call `ExpectCreations()`; on API confirmation, `CreationObserved()` decrements counter; `SatisfiedExpectations()` returns true when all expected creates/deletes have been observed.

**Slow-start for batch operations**: Large pod creations start with small batch and exponentially grow, preventing API server overload.

**Backoff record per job**: `backoffStore` persists `backoffRecord` keyed by job key, tracking consecutive failures and last failure time for exponential backoff calculation.

## Tradeoffs

- **No native multi-step workflows**: Kubernetes Job is ideal for single workload batch jobs; complex pipelines require external workflow engines (Argo, Tekton, Temporal).
- **No durable execution**: Job controller state is in-memory; on restart, reconcilation replays. Long-running jobs with complex branching lack native support.
- **Limited retry semantics**: Pod failure policy provides only fixed actions (FailJob, Ignore, Count); no configurable retry with custom handlers.
- **No built-in DLQ**: Failed jobs remain in job status; no separate queue for poison messages that require manual inspection.
- **Backoff granularity**: Backoff is at job level, not per-pod-index level (though indexed jobs have per-index tracking via annotations).

## Failure Modes / Edge Cases

| Failure Mode | Behavior |
|--------------|----------|
| API server transient failure | Exponential backoff on API calls; job requeues via `AddRateLimited()` |
| Pod OOMKilled | Treated as failed pod; subject to backoff and pod failure policy |
| Kubelet reports pod as Unknown | Pod enters `Unknown` phase; controller waits for explicit deletion or Kubelet update |
| Job controller crashes mid-sync | Workqueue item remains un-processed until worker picks it up again after restart |
| Orphan pods (unowned by job) | Separate `orphanWorker` in `processNextOrphanPod` handles cleanup |
| PodGC deletes pods before job sees them | UID tracking expectations handles this; controller waits for expected deletions |
| CronJob overlaps with slow job | `ForbidConcurrent` prevents new job if old one active; `ReplaceConcurrent` deletes old one |
| Clock skew | CronJob uses informer cache time; `nextScheduleDelta=100ms` tolerance |

## Future Considerations

- **Workflow engines**: Integration with Temporal or Argo Workflows would provide durable execution, saga patterns, and multi-step orchestration.
- **Dead-letter queue**: A native DLQ for jobs that exhaust retries would improve operability.
- **Job set primitives**: Kubernetes JobSet (alpha/beta) provides multi-job coordination for distributed training (e.g., Ray on Kubernetes), partially addressing complex AI pipeline needs.
- **Enhanced scheduling**: CronJob could benefit from configurable jitter to prevent thundering herd at scheduled times.

## Questions / Gaps

1. **No evidence of distributed tracing** within the job controller for cross-pod job correlation.
2. **No evidence of custom workqueue implementations** beyond the client-go default (e.g., no Redis or NATS-based queues).
3. **No evidence of job priority/preemption** beyond `priorityClassName` on pods.
4. **No evidence of job-level resource quotas or burst limits** beyond namespace-level ResourceQuota.
5. **CronJob timezone support** is marked as not officially supported (`cronjob_controllerv2.go:786-789`).

---

Generated by `dimensions/05-background-jobs-async-workflows.md` against `kubernetes`.
