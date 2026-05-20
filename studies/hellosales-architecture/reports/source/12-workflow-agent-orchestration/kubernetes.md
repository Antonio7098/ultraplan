# Source Analysis: kubernetes

## Workflow / Agent Orchestration

### Source Info

| Field | Value |
|-------|-------|
| Name | kubernetes |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/kubernetes` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

Kubernetes does not implement a traditional workflow/orchestration engine for arbitrary multi-step workflows. Instead, it provides a **controller pattern** — a distributed reconciliation loop where controllers watch resources and reconcile desired state. Workflow-like behavior emerges from the composition of controllers (Deployment, Job, StatefulSet) that model state transitions declaratively. The key workflow primitives are: (1) the **workqueue** for task ordering and rate-limiting, (2) **ControllerExpectations** for skip-sync optimization, (3) **backoff utilities** for retry management, (4) **leader election** for HA coordination, and (5) **ParallelizeUntil** for data-parallel work. There is no native DAG execution engine, checkpoint/recovery of mid-step state, or Saga-pattern compensation — those concerns are delegated to higher-level systems built atop Kubernetes.

## Rating

**5/10** — Basic implementation with significant gaps for complex workflow orchestration.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Work queue (FIFO with dirty/processing sets) | `Typed[T]` struct with `dirty` and `processing` sets tracking work item lifecycle | `staging/src/k8s.io/client-go/util/workqueue/queue.go:190-222` |
| Rate-limited requeue | Exponential failure rate limiter: base 5ms, max 1000s, combined with 10qps token bucket | `staging/src/k8s.io/client-go/util/workqueue/default_rate_limiters.go:50-56` |
| Delaying queue | Priority heap for delayed item processing | `staging/src/k8s.io/client-go/util/workqueue/delaying_queue.go` |
| Backoff with jitter | `Backoff` struct: Duration, Factor, Jitter, Steps, Cap | `staging/src/k8s.io/apimachinery/pkg/util/wait/backoff.go:30-53` |
| Expectations (skip-sync optimization) | `ControllerExpectations` tracks expected add/del counts with TTL-based expiration | `pkg/controller/controller_utils.go:128-316` |
| Job backoff state | `backoffRecord` with failures count and last failure timestamp persisted in `backoffStore` | `pkg/controller/job/backoff_utils.go:33-84` |
| Parallel execution | `ParallelizeUntil` spawns N workers, splits pieces into chunks, waits via `sync.WaitGroup` | `staging/src/k8s.io/client-go/util/workqueue/parallelizer.go:46-97` |
| Leader election | Lease-based election with `LeaseDuration`, `RenewDeadline`, `RetryPeriod` config | `staging/src/k8s.io/client-go/tools/leaderelection/leaderelection.go:116-166` |
| Worker loop pattern | `Get() -> syncHandler() -> Done() -> handleErr()` — standard controller reconcile loop | `pkg/controller/deployment/deployment_controller.go:486-497` |
| Rolling update workflow | `rolloutRolling` orchestrates scale-up new RS, scale-down old RSs, cleanup, status sync | `pkg/controller/deployment/rolling.go:31-66` |

## Answers to Dimension Questions

### 1. How are multi-step workflows defined, stored, and executed?

Kubernetes does not have a workflow definition DSL. Multi-step behavior is emergent from composing declarative resource specs (Deployment, Job, StatefulSet) and the controller reconciliation loop. Each controller defines a `syncHandler` that performs a discrete reconciliation step. The Deployment controller's `rolloutRolling` (`pkg/controller/deployment/rolling.go:31-66`) demonstrates a sequential 4-step workflow: (1) scale up new ReplicaSet, (2) scale down old ReplicaSets, (3) cleanup if complete, (4) sync status. There is no stored workflow definition — only the desired state in etcd and the controller's logic.

### 2. What happens when a workflow is interrupted mid-step — can it resume?

Partial resumability exists but is limited. The workqueue tracks items in `dirty` and `processing` sets (`staging/src/k8s.io/client-go/util/workqueue/queue.go:196-203`). If a controller crashes mid-step, the item remains in `processing` and will not be re-enqueued until `Done()` is called. The `ShutDownWithDrain()` mechanism (`queue.go:327-342`) waits for in-flight items to complete, but a hard crash leaves the item orphaned in `processing`. For Job controllers, `backoffRecord` (`pkg/controller/job/backoff_utils.go:33-37`) persists failure count across restarts, allowing backoff state to survive controller restarts. However, there is no step-level checkpoint — the controller restarts from the beginning of its sync, not from the middle of a multi-step rollout.

### 3. How are parallel workflow branches coordinated and joined?

`ParallelizeUntil` (`staging/src/k8s.io/client-go/util/workqueue/parallelizer.go:46-97`) provides barrier synchronization: it spawns worker goroutines, fans out chunks of work, and blocks via `sync.WaitGroup` until all workers complete. Context cancellation stops workers early. The Job controller uses this for bulk pod operations (`pkg/controller/job/job_controller.go:1214-1240`), with a local `errCh` channel collecting errors from concurrent deletions. There is no fan-out/fan-in DAG execution model — parallelization is limited to embarrassingly parallel operations within a single controller sync.

### 4. How does the system handle workflow-level timeouts and cancellations?

Context propagation is the primary cancellation mechanism. The worker loop passes `ctx` to `syncHandler` (`deployment_controller.go:493`). `leaderelection.Run()` (`leaderelection.go:211-222`) starts the leaderroutine and cancelled leaderroutine cancels the context. The `RenewDeadline` sets a timeout on each renewal attempt. Job backoff uses `DefaultJobPodFailureBackOff = 10s` and `MaxJobPodFailureBackOff = 10min` (`job_controller.go:76-79`). There is no workflow-level timeout that spans multiple controller syncs — each operation has its own timeout configured at the call site. `wait.PollUntilContextTimeout` (`backoff.go`) is used for deadline-bounded polling.

### 5. Is there compensation logic for partial workflow failures?

No Saga-style compensation exists. On failure, the controller requeues the work item with exponential backoff (`handleErr` at `deployment_controller.go:499-518`). The Job controller tracks pod failures in `backoffRecord` and delays recreation. The Deployment controller's rolling update can roll back by virtue of preserving the old ReplicaSet (scaled down but not deleted). However, there is no formal compensation/rollback mechanism — if a workflow step fails partway through, the controller simply continues reconciling from the observed state. Some controllers (e.g., StatefulSet) support rollback via revision history, but this is controller-specific and not a general compensation pattern.

## Architectural Decisions

1. **Controller pattern over workflow engine**: Kubernetes chose a declarative resource model + controller reconciliation rather than an imperative workflow DSL. This aligns with its infrastructure-as-data philosophy but sacrifices expressiveness for arbitrary workflows.
2. **Workqueue as backbone**: The `workqueue.Typed[T]` is the sole coordination primitive — providing FIFO ordering, rate limiting, delayed requeue, and metrics. No external message broker or workflow engine is required.
3. **Expectations for optimistic concurrency**: Controllers set expectations before creating resources and wait for watch events to satisfy them, avoiding unnecessary syncs (`pkg/controller/controller_utils.go:128-316`). This is a form of short-term checkpointing.
4. **Leader election for HA**: Only one controller instance actively reconciles at a time, using lease-based election. This is not workflow orchestration but prevents duplicate work across replicas.
5. **Backoff persistence per Job**: Job controller persists `backoffRecord` to survive restarts (`pkg/controller/job/backoff_utils.go`), but this is not general-purpose checkpointing.

## Notable Patterns

- **Reconcile loop**: `Get() -> Done() -> handleErr()` at `deployment_controller.go:486-497`
- **Rate limiter composition**: `NewTypedMaxOfRateLimiter` combines exponential + token bucket at `default_rate_limiters.go:50-56`
- **TTL expectations**: `ControlleeExpectations` with 5-minute timeout at `controller_utils.go:72,225-227`
- **ParallelizeUntil**: Barrier pattern at `parallelizer.go:46-97`
- **Slow start batch**: `SlowStartInitialBatchSize = 1` for gradual quota adoption at `controller_utils.go:87`
- **Pod failure backoff**: Exponential backoff with max cap at `job_controller.go:76-79`

## Tradeoffs

- **No step-level recovery**: If a controller crashes mid-reconcile, the work item may be delayed (stuck in `processing`) until the item is explicitly removed or the queue restarts. This is a known limitation.
- **No native DAG**: Fan-out/fan-in workflows require building custom controllers. The built-in parallelism is limited to `ParallelizeUntil` within a single sync.
- **No compensation/Saga**: Partial failures require manual intervention or rely on eventual consistency of the reconciliation loop. There is no automatic rollback of completed steps.
- **No workflow persistence**: Workflow state is not persisted to survive cluster failures. Desired state is in etcd, but the controller's internal state (backoff, expectations) is in-memory.
- **Leader election overhead**: Only one leader actively reconciles, which limits horizontal scaling of controllers but ensures consistency.

## Failure Modes / Edge Cases

- **Crash during sync**: Item left in `processing` set, not re-enqueued until queue restart or manual intervention (`queue.go:289-302`)
- **Watch delivers events out of order**: `ControllerExpectations.isExpired()` (`controller_utils.go:225-227`) handles this via 5-minute TTL, forcing a sync if expected events don't arrive
- **Backoff explosion**: Exponential backoff capped at `maxDelay` (1000s for API, 10min for pod failures) prevents unbounded delay
- **Split-brain during leader election**: Clock skew tolerance is configured via `LeaseDuration > RenewDeadline > RetryPeriod` ratio; the system tolerates clock skew but not clock skew rate
- **Pod creation storms**: `SlowStartInitialBatchSize = 1` and `ParallelizeUntil` limit blast radius during initial batch creation

## Future Considerations

- **Custom Resource Definitions (CRDs) + operators**: For complex workflows, the Kubernetes ecosystem uses operators (built on the same controller pattern) to encode domain-specific workflows. This is the standard path for workflow orchestration on Kubernetes.
- **Workflow CRDs**: Projects like Argo Workflows, Tekton Chains, and Apache Airflow on Kubernetes fill the gap for DAG-based workflow orchestration that Kubernetes itself does not provide.
- **Persistent Workflow State**: State is not persisted across controller restarts except for Job backoff records. For richer checkpointing, external state stores are needed.

## Questions / Gaps

- No evidence found of a formal workflow definition language or DSL for encoding multi-step workflows
- No evidence found of cross-controller workflow coordination (e.g., triggering one controller's workflow from another's completion)
- No evidence found of step-level retry semantics distinct from item-level retry (i.e., retrying a specific step within a multi-step sync)
- No evidence found of Saga pattern or compensation transactions
- No evidence found of workflow-level timeout spanning multiple controller syncs

---

Generated by `dimensions/12-workflow-agent-orchestration.md` against `kubernetes`.