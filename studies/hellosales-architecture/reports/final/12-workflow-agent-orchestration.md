# Workflow / Agent Orchestration - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Dimension | `12-workflow-agent-orchestration` |
| Sources | cli, grafana, kubernetes, milvus, nats-server, openfga, pocketbase, temporal, victoriametrics |
| Date | 2026-05-20 |

## Sources Studied

| # | Source | Path |
|---|--------|------|
| 1 | cli | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/cli` |
| 2 | grafana | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/grafana` |
| 3 | kubernetes | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/kubernetes` |
| 4 | milvus | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/milvus` |
| 5 | nats-server | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/nats-server` |
| 6 | openfga | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/openfga` |
| 7 | pocketbase | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/pocketbase` |
| 8 | temporal | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/temporal` |
| 9 | victoriametrics | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/victoriametrics` |

## Executive Summary

Workflow and agent orchestration capabilities are largely absent across this source set, with one striking exception. Eight of nine sources score 2–5/10, providing only basic job scheduling, cron triggers, or simple state machines without any durable execution model. **Temporal** alone demonstrates an exemplar implementation, scoring 9/10 with event-sourcing-based durable workflow execution that handles interruption recovery, step-level retry, parallel branch coordination via child workflows, and workflow-level timeout/cancellation. The other sources treat workflow orchestration as out-of-scope or use primitive patterns (ticker-based evaluation, hook chains, workqueues) that lack the checkpointing, DAG execution, compensation logic, and resumability required for production AI pipeline orchestration.

## Core Thesis

Workflow orchestration is a dimension where most infrastructure software deliberately chooses simplicity over capability. Message brokers (nats-server), authorization engines (openfga), CRUD backends (pocketbase), and database components (milvus, victoriametrics) treat multi-step orchestration as outside their scope — they provide primitives (queues, state machines, cron triggers) that **could** be composed into workflows by higher-layer systems, but do not themselves implement durable execution engines. The one exception — Temporal — exists precisely because durable workflow orchestration **is** its core product, making it the only source here that demonstrates what production-grade AI pipeline orchestration looks like. For HelloSales, this study strongly suggests building on Temporal (or Cadence) rather than attempting to layer workflow primitives from simpler systems.

## Rating Summary

| Source | Score | Approach | Main Strength | Main Concern |
|--------|-------|----------|---------------|--------------|
| cli | 2/10 | Thin API client | Stateless simplicity; no local execution burden | No local workflow visibility; state entirely in backend |
| grafana | 5/10 | Job queue + state persistence | Lease-based job claiming; alert state warm restart | No DAG; no step-level recovery; no compensation |
| kubernetes | 5/10 | Controller reconcile loop | Workqueue + backoff + leader election; declarative model | No DAG; no step-level recovery; no compensation |
| milvus | 3/10 | Task-as-state-machine | Priority queue scheduling; action-list task model | No DAG; no checkpoint; no compensation; stuck tasks |
| nats-server | 2/10 | Message broker | JetStream durable streams; consumer ack semantics | No workflow DSL; no workflow state; no parallel joins |
| openfga | 2/10 | Authorization engine | Graph-based authorization resolution; worker pipeline | Stateless single-query model; no workflow orchestration |
| pocketbase | 2/10 | Hook + cron | Fire-and-forget goroutines; DB transaction rollback | No workflow DSL; no checkpoint; no resume |
| temporal | 9/10 | Event-sourcing durable execution | Seamless resume; step-level retry; child workflows | No built-in Saga compensation; HSM persistence incomplete |
| victoriametrics | 2/10 | Ticker-based rule evaluation | YAML rule config; hot config reload; ALERTS_FOR_STATE | No DAG; no step-level retry; no compensation |

## Approach Models

### 1. Thin Client / Stateless (cli, nats-server, openfga)

These systems delegate all workflow execution to external systems:
- **cli**: Wraps GitHub Actions and Copilot CAPI — purely an API client with no local execution
- **nats-server**: Provides message delivery primitives but no workflow abstraction; clients build orchestration on top
- **openfga**: Authorization engine with stateless single-query resolution; workflow context is entirely external

### 2. Job Queue with Lease Claiming (grafana, kubernetes)

Both systems use a pattern where work items are claimed via optimistic locking:
- **grafana** (`pkg/registry/apis/provisioning/jobs/driver.go:26-52`): Label-based `Store.Claim()` with rollback on failure; `JobCleanupController` resets expired jobs
- **kubernetes** (`staging/src/k8s.io/client-go/util/workqueue/queue.go:190-222`): FIFO queue with `dirty`/`processing` sets; `handleErr()` requeues with exponential backoff

### 3. Task-as-State-Machine (milvus, pocketbase)

Simpler than full workflow engines — each task is an object with a `Process()` method or transition function:
- **milvus** (`internal/datacoord/compaction_task.go:24-48`): `CompactionTask` interface with `Process() bool`; state transitions drive completion
- **pocketbase** (`tools/cron/cron.go:19`): Cron jobs and hooks as isolated execution units

### 4. Periodic Evaluation (grafana alerting, victoriametrics)

Time-triggered rule evaluation, not event-driven workflow orchestration:
- **grafana** (`pkg/services/ngalert/schedule/schedule.go:179-188`): Ticker-based alert rule evaluation with per-rule goroutines
- **victoriametrics** (`app/vmalert/rule/group.go:425-426`): `time.NewTicker(g.Interval)` loop with semaphore-limited concurrent rule execution

### 5. Durable Event-Sourced Execution (temporal)

The exemplar model: append-only History Events as source of truth, Workflow Tasks processed by workers, seamless resume via history replay. This is the only model that provides all five dimension capabilities (definition, resume, parallel branches, timeouts, compensation).

## Pattern Catalog

### Pattern: Event-Sourcing Workflow State

**What it solves**: Durable workflow execution with seamless resume after interruption, without requiring explicit checkpoint/restore code.
**Sources**: temporal (`docs/architecture/README.md:32`, `service/history/workflow/mutable_state_impl.go:435-586`)
**Why it works**: Append-only history is immutable and complete — replaying events reconstructs exact workflow state at any point.
**When to copy**: For any workflow engine where interruption tolerance and long-running execution matter. This is the gold standard.
**When overkill**: Short-lived, idempotent operations that never need to survive interruption.

### Pattern: Lease-Based Job Claiming

**What it solves**: Distributed job ownership without a central queue server.
**Sources**: grafana (`pkg/registry/apis/provisioning/jobs/persistentstore.go:104-215`), kubernetes (workqueue)
**Why it works**: Jobs are claimed by updating a label timestamp. Expired jobs are detected by a periodic cleaner. Prevents duplicate work without dedicated locking infrastructure.
**When to copy**: For job systems that need multi-worker coordination without a message broker. Works well for GitOps-style sync controllers.
**When overkill**: Single-worker systems, or systems requiring fine-grained step tracking within a job.

### Pattern: Workqueue as Controller Backbone

**What it solves**: Ordered task processing with rate limiting, delayed requeue, and metrics.
**Sources**: kubernetes (`staging/src/k8s.io/client-go/util/workqueue/queue.go:190-222`)
**Why it works**: A single abstraction handles ordering, backoff, dead-letter tracking, and observability. Controllers don't need external queuing infrastructure.
**When to copy**: For any controller-style system that reconciles declarative desired state.
**When overkill**: For complex multi-step workflows, where the workqueue is too low-level to express step dependencies.

### Pattern: Exponential Backoff with Jitter

**What it solves**: Retry storms that could overwhelm a system under failure.
**Sources**: kubernetes (`staging/src/k8s.io/client-go/util/workqueue/default_rate_limiters.go:50-56`), temporal (`service/history/workflow/retry.go:32-54`)
**Why it works**: Exponential backoff spreads retry load over time; jitter prevents synchronized retry waves.
**When to copy**: For any system that retries failed operations — applies to job queuing, API clients, and workflow step execution.
**When risky**: When the retry budget is limited (e.g., consumer with MaxDeliver), since backoff can exhaust retries before success.

### Pattern: Child Workflows for Parallel Fan-Out

**What it solves**: Parallel branch execution with isolation and independent retry.
**Sources**: temporal (`service/history/workflow/mutable_state_impl.go:2716-2718`)
**Why it works**: Child workflows have their own history, can fail and retry independently, and signal their completion to the parent. This provides fault isolation between branches.
**When to copy**: For workflows with parallel branches that could have different failure modes and retry budgets.
**When overkill**: Simple parallel activities within a single workflow can use async activity execution instead.

### Pattern: Optimistic Locking via Label Updates

**What it solves**: Distributed job claiming without etcd transactions or a locking server.
**Sources**: grafana (`pkg/registry/apis/provisioning/jobs/persistentstore.go:104-215`)
**Why it works**: Jobs carry a `LabelJobClaim` timestamp. Workers atomically update the label to claim. Expired claims are detected by comparing against a configured expiry threshold.
**When to copy**: For Kubernetes-style job systems where jobs are API resources.
**When risky**: High claim conflict rates can cause starvation. Requires careful expiry tuning.

### Pattern: Alert State Warm Restart

**What it solves**: Resuming alert rules after restart without losing pending alert state.
**Sources**: grafana (`pkg/services/ngalert/evaluation_runner.go:45`), victoriametrics (`app/vmalert/rule/alerting.go:820-821`)
**Why it works**: State is persisted to DB or time-series. On restart, state is reconstructed before scheduling resumes.
**When to copy**: For stateful evaluation systems that need to survive restarts without losing context.
**When overkill**: Stateless evaluation or operations with no meaningful mid-execution state.

### Pattern: Ticker-Based Periodic Evaluation

**What it solves**: Simple, predictable cadence for rule/job execution.
**Sources**: grafana (`pkg/services/ngalert/schedule/schedule.go:179-188`), victoriametrics (`app/vmalert/rule/group.go:425-426`)
**Why it works**: A ticker fires at a configured interval; the handler evaluates all ready items. Simple to implement and predict.
**When to copy**: For monitoring-style workloads where evaluation cadence is more important than event-driven response.
**When overkill**: Event-driven workflows that need immediate response to external events.

## Key Differences

### Why temporal stands apart

Every other source either (a) has no workflow engine, (b) has only a simple job queue, or (c) delegates to an external system. Temporal is the **only source that implements durable workflow execution with full interruption recovery**. This is by design — it's Temporal's core product, not a feature added to an existing system.

### Why kubernetes and grafana converge on similar patterns

Both systems originated from infrastructure that needed to reconcile desired state. Kubernetes' controller pattern and Grafana's provisioning job system both use workqueue-based task processing with lease claiming, because both solve the same problem: distributed reconciliation of declarative resources. The patterns are similar not because one copied the other, but because the problem domain selects for the same solutions.

### Why databases and message brokers score low on this dimension

Milvus, nats-server, openfga, pocketbase, and victoriametrics are all primarily data-layer systems. Workflow orchestration is simply out of scope for their designs. Adding a DAG execution engine to a vector database (milvus) or a message broker (nats-server) would bloat the system and compromise its primary design goals. These systems provide primitives that could **support** a workflow engine, but they are not themselves workflow engines.

### Why cli scores low despite being well-designed

The GitHub CLI is a thin client — it correctly delegates workflow execution to GitHub's infrastructure. The low score reflects the absence of **local** orchestration, not a design flaw. For a CLI tool, this is the right choice.

## Tradeoffs

| Decision | Benefit | Cost | Best-Fit Context | Failure Mode | Alternative |
|----------|---------|------|------------------|--------------|-------------|
| Event-sourcing for workflow state | Seamless resume; complete audit trail; no need for explicit checkpoints | Replay overhead for long histories; MutableState sync complexity | Long-running workflows; audit requirements; interruption tolerance | History growth; replay cost for very long workflows | Checkpoint-based persistence (simpler but requires explicit save/restore) |
| Workqueue as sole coordination primitive | Single abstraction; no external broker; good observability | Limited to FIFO + backoff; no DAG; no step dependencies | Controller reconcile loops; job queues with simple ordering | Step-level dependencies require custom controllers | DAG-based workflow engine (more expressiveness, more complexity) |
| Lease-based job claiming | No central lock server; scales to many workers | Claim conflicts cause retry; expiry tuning required | Kubernetes-style controllers; GitOps sync jobs | Starvation under high conflict; stale job detection latency | Database-based job queue (stronger consistency, more infrastructure) |
| Ticker-based evaluation | Simple; predictable; low overhead | No event-driven response; latency equal to tick interval | Monitoring rules; periodic maintenance; batch scheduling | Misses events between ticks; not suitable for real-time workflows | Event-driven execution (immediate response, more complexity) |
| Child workflows for parallelism | Fault isolation; independent retry; clean completion signaling | Overhead vs in-process parallel activities; more state to manage | Fan-out workflows with independent branch lifetimes | Child workflow explosion; parent waiting on many children | In-process async activities (lower overhead, shared failure risk) |
| Thin client delegation | Simple; no local state management; scales horizontally | No local visibility; depends on backend availability; no offline capability | CLI tools; API-focused systems | Backend becomes single point of failure | Local execution engine (more capability, more complexity) |

## Decision Guide

**Q: Does your system need to execute workflows that can be interrupted mid-step and reliably resume?**

Yes → Temporal (event-sourcing) is the only exemplar in this study. Alternative: build checkpoint/replay on top of a durable log (but this is essentially reinventing Temporal).

**Q: Do you need to define workflows declaratively (DSL/YAML) vs imperatively (code)?**

Declarative → Look at Grafana's job resources (Kubernetes-style) or victoriametrics's YAML rules. Imperative → Temporal workflows-as-code.

**Q: Is your system primarily a data layer (database, message broker, cache)?**

Yes → Do not add a workflow engine. Build clients that use your data layer as the state store for an external workflow engine.

**Q: Do you need parallel branch coordination (fan-out/fan-in)?**

Yes → Temporal child workflows or Kubernetes ParallelizeUntil (limited to embarrassingly parallel within a single sync).

**Q: Do you need compensation/Saga for partial failures?**

No other source in this study demonstrates built-in Saga compensation. Temporal provides retry/continue mechanisms but manual compensation still required. For Saga, consider dedicated frameworks (Conductor, AWS Step Functions) or build explicit compensation into Temporal activity code.

**Q: Is your system a CLI or API client?**

Yes → Delegate orchestration to backend. Do not attempt to build local workflow execution. Focus on session tracking and log display.

## Practical Tips

1. **Build on Temporal, don't build your own workflow engine.** The complexity of durable execution (checkpointing, replay, task generation, timeout management, parallel branch coordination) is underappreciated. Eight of nine sources either lack these capabilities or implement them in limited forms. Temporal's 9/10 score reflects years of production hardening.

2. **Lease-based claiming works well for stateless workers.** If you need job queuing without a message broker, grafana's label-based claiming pattern (`persistentstore.go:104-215`) is a proven approach. It scales to many workers and doesn't require a central locking server.

3. **Exponential backoff with jitter is universal.** Found across kubernetes, temporal, and grafana. Implement it for any retry scenario — it prevents retry storms and is simple to add to any workqueue or API client.

4. **State persistence enables resume.** Alert state warm-restart in grafana (`evaluation_runner.go:45`) and ALERTS_FOR_STATE in victoriametrics (`alerting.go:820-821`) show two approaches: database persistence and time-series persistence. Either is better than no state persistence for stateful workloads.

5. **For controller-style systems, workqueue is sufficient.** Kubernetes demonstrates that a well-designed workqueue (with dirty/processing tracking, rate limiting, and backoff) can support complex distributed reconciliation without a workflow engine.

6. **Don't add a workflow engine to a database or message broker.** milvus, nats-server, and openfga correctly treat workflow orchestration as out of scope. If you need AI pipeline orchestration on top of these systems, build a separate workflow layer.

## Anti-Patterns / Caution Signs

- **Ticker-only evaluation with no event-driven triggers**: Systems like victoriametrics that only evaluate on fixed intervals cannot react to data changes mid-interval. If your workflow needs immediate response, this pattern is insufficient.

- **No compensation for multi-step operations**: pocketbase, milvus, nats-server, and victoriametrics all lack rollback or compensation. If your domain has multi-step operations that could partially fail, these systems will leave you without recovery options.

- **Claimed jobs stuck in processing state**: kubernetes (`queue.go:289-302`) and grafana both have scenarios where crashed workers leave jobs in a claimed-but-not-completed state. Without explicit expiry detection and cleanup, jobs can be orphaned indefinitely.

- **History growth in long-running workflows**: temporal's event-sourcing model means very long workflows accumulate large histories. Without archival, this can impact replay performance.

- **No step-level recovery means full job retry**: grafana and milvus both lack step-level checkpointing. If a job is interrupted, it restarts from the beginning — potentially re-processing thousands of items that had already succeeded.

- **Hook chains without timeout enforcement**: pocketbase's hook system (`tools/hook/hook.go`) runs hooks without per-hook timeouts. A slow hook can block the entire chain.

- **Polling over streaming for session logs**: cli uses 5-second polling intervals (`create.go:24`). For interactive or latency-sensitive scenarios, this adds unnecessary delay and overhead compared to WebSocket/SSE push.

## Notable Absences

| Pattern | Why Absent | Risk |
|---------|------------|------|
| Formal DAG execution engine | Only temporal has it; others use linear or job-queue models | Cannot express multi-step dependencies or parallel fan-out/fan-in |
| Built-in Saga/compensation | temporal has retry/continue but no automatic compensation | Multi-step transactions require manual compensation code |
| Step-level checkpointing | Only temporal's event-sourcing naturally provides it | Interrupted jobs must restart from beginning |
| Workflow pause/resume | grafana and kubernetes lack suspend/resume controls | Cannot pause a workflow mid-execution for debugging or throttling |
| Cross-controller workflow coordination | kubernetes controllers are isolated; no triggering between controllers | Complex workflows require custom operators or external orchestrators |
| Workflow-level timeout spanning multiple steps | kubernetes, grafana, milvus all have per-job or per-task timeouts only | Long-running workflows cannot be bounded at the workflow level |
| Parallel branch join barriers | No source except temporal's child workflows provides explicit join semantics | Parallel branches must coordinate via polling or signals |

## Per-Source Notes

### cli
The CLI is a thin client to GitHub Actions and Copilot agent services. It has no local workflow engine and correctly delegates execution to backends. Session state (queued, in_progress, completed, failed, etc.) is maintained by the backend. Polling every 5 seconds for session logs is simple but adds latency. The `CapiClient` interface (`client.go:13-21`) cleanly isolates all agent API interactions.

### grafana
Grafana has two distinct orchestration models: (1) alert rule scheduling with per-rule goroutines and state persistence via `SyncStatePersister`/`AsyncStatePersister`, and (2) provisioning jobs with lease-based claiming, rollback-on-claim-failure, and concurrent job drivers. Neither model provides DAG execution or step-level recovery. The job progress throttling (`progress.go:17-36`) is a useful pattern for avoiding store overwhelm.

### kubernetes
The controller pattern is the dominant model. Workqueue (`queue.go:190-222`) provides ordering, rate limiting, and backoff. `ControllerExpectations` (`controller_utils.go:128-316`) provides optimistic concurrency via short-term checkpointing. `ParallelizeUntil` (`parallelizer.go:46-97`) enables barrier synchronization within a single sync. No cross-controller workflow coordination exists.

### milvus
Task-as-state-machine pattern via `CompactionTask.Process()` returning bool. Action-list model in querycoordv2 (`task.go:129`) provides ordered steps but no DAG. No checkpointing — compaction tasks restart from scratch on interruption. No compensation; partial compaction results are abandoned.

### nats-server
Pure message delivery infrastructure. JetStream provides durable streams and consumer acknowledgment policies, but no workflow abstraction. Key-Value store is streams under the hood. Workflow orchestration must be built externally by clients.

### openfga
Authorization engine with graph-based resolution. Worker pipeline (`pipeline.go:340-362`) is for authorization resolution, not workflow orchestration. Set operation reducers (`check.go:158-374`) provide parallel subproblem resolution but for authorization queries only.

### pocketbase
Hook system (`hook.go`) and cron scheduler are the only workflow-like constructs. Fire-and-forget goroutines with panic recovery. DB transaction rollback only — no cross-service compensation. Jobs are registered in-memory at startup and lost on restart.

### temporal
The exemplar. Event-sourcing with append-only History Events. `MutableStateImpl` (`mutable_state_impl.go:127-200`) is an in-memory cache backed by persisted history. Seamless resume via history replay. Child workflows for parallel branches. `getBackoffInterval` (`retry.go:32-54`) for exponential retry. Timer queue for timeout handling. Gap: no built-in Saga compensation — must be implemented manually in workflow code.

### victoriametrics
Ticker-based alert rule evaluation with YAML configuration. `execConcurrently` (`group.go:731-757`) uses semaphore pattern for concurrent rule execution. Alert state can be restored from `ALERTS_FOR_STATE` series on restart. No DAG, no step-level retry, no compensation.

## Open Questions

1. **For HelloSales specifically**: Given that 8 of 9 sources lack production-grade workflow orchestration, and the only exemplar (Temporal) is a dedicated workflow platform, should HelloSales build on Temporal rather than implementing orchestration within its own codebase?

2. **Checkpoint granularity**: Temporal's event-sourcing provides implicit step-level checkpointing via history events. For systems that don't use event-sourcing, what is the right checkpoint granularity — step-level, phase-level, or job-level?

3. **Compensation patterns for AI pipelines**: AI pipelines may call external APIs, modify databases, and send messages. If a step fails partway through, what is the right compensation model? Temporal's manual approach vs. explicit Saga frameworks?

4. **Evaluation cadence**: For sales workflow stages that span hours or days, ticker-based evaluation (grafana, victoriametrics) would miss state changes between ticks. What is the right trigger model for long-running business workflows?

5. **State in backend vs. local**: cli delegates all state to the backend. temporal persists state to its own storage. grafana persists alert state to the application's database. For HelloSales, where should workflow state live — in the workflow engine, in the application's database, or distributed across both?

## Evidence Index

Every evidence reference in this report follows the `path/to/file:NN` format from per-source reports.

| Source | Evidence | File:Line |
|--------|----------|-----------|
| cli | `workflow run` sends `workflow_dispatch` event via REST API | `pkg/cmd/workflow/run/run.go:1-120` |
| cli | `Session` struct with `State` field | `pkg/cmd/agent-task/capi/sessions.go:29-53` |
| cli | Session state machine states | `pkg/cmd/agent-task/shared/display.go:28-49` |
| cli | `CreateJob()` POST to CAPI | `pkg/cmd/agent-task/capi/job.go:58-128` |
| cli | `LogRenderer.Follow()` polls every 5s | `pkg/cmd/agent-task/shared/log.go:29-54` |
| cli | Exponential backoff (10s max, 300ms initial, 1.5x) | `pkg/cmd/agent-task/create/create.go:217-222` |
| cli | `CapiClient` interface | `pkg/cmd/agent-task/capi/client.go:13-21` |
| grafana | Scheduler utility with workers, backoff, retry | `pkg/util/scheduler/scheduler.go:20-24` |
| grafana | Alert rule scheduling with per-rule goroutines | `pkg/services/ngalert/schedule/schedule.go:179-188` |
| grafana | `SyncStatePersister` writes state transitions to DB | `pkg/services/ngalert/state/persister_sync.go:34-129` |
| grafana | `AsyncStatePersister` batches periodic saves | `pkg/services/ngalert/state/persister_async.go:14-46` |
| grafana | `Store` interface with Claim, Complete, Update, RenewLease | `pkg/registry/apis/provisioning/jobs/driver.go:26-52` |
| grafana | Lease-based job claiming via label timestamp | `pkg/registry/apis/provisioning/jobs/persistentstore.go:104-215` |
| grafana | Job rollback resets claim label on failure | `pkg/registry/apis/provisioning/jobs/persistentstore.go:177-209` |
| grafana | Lease renewal loop | `pkg/registry/apis/provisioning/jobs/driver.go:266-320` |
| grafana | `ConcurrentJobDriver` spawns N jobDriver instances | `pkg/registry/apis/provisioning/jobs/concurrent_driver.go:71-134` |
| grafana | `JobProgressRecorder` tracks errors, warnings | `pkg/registry/apis/provisioning/jobs/progress.go:40-72` |
| grafana | Job timeout via `jobctx` with lease expiry detection | `pkg/registry/apis/provisioning/jobs/driver.go:202-340` |
| grafana | HistoryWriter persists completed jobs | `pkg/registry/apis/provisioning/jobs/history_writer.go:1-50` |
| grafana | Sequential cleanup on 10-minute ticker | `pkg/services/cleanup/cleanup.go:108-163` |
| grafana | Alert rule evaluation with per-rule goroutine | `pkg/services/ngalert/schedule/schedule.go:62-113` |
| kubernetes | `Typed[T]` workqueue with dirty/processing sets | `staging/src/k8s.io/client-go/util/workqueue/queue.go:190-222` |
| kubernetes | Exponential failure rate limiter: 5ms base, 1000s max, 10qps token bucket | `staging/src/k8s.io/client-go/util/workqueue/default_rate_limiters.go:50-56` |
| kubernetes | Delaying queue with priority heap | `staging/src/k8s.io/client-go/util/workqueue/delaying_queue.go` |
| kubernetes | `Backoff` struct: Duration, Factor, Jitter, Steps, Cap | `staging/src/k8s.io/apimachinery/pkg/util/wait/backoff.go:30-53` |
| kubernetes | `ControllerExpectations` with TTL-based expiration | `pkg/controller/controller_utils.go:128-316` |
| kubernetes | `backoffRecord` persisted in `backoffStore` | `pkg/controller/job/backoff_utils.go:33-84` |
| kubernetes | `ParallelizeUntil` spawns N workers with WaitGroup barrier | `staging/src/k8s.io/client-go/util/workqueue/parallelizer.go:46-97` |
| kubernetes | Lease-based election with LeaseDuration, RenewDeadline, RetryPeriod | `staging/src/k8s.io/client-go/tools/leaderelection/leaderelection.go:116-166` |
| kubernetes | Worker loop: `Get() -> syncHandler() -> Done() -> handleErr()` | `pkg/controller/deployment/deployment_controller.go:486-497` |
| kubernetes | Rolling update: scale up new RS, scale down old RSs, cleanup, status sync | `pkg/controller/deployment/rolling.go:31-66` |
| milvus | `CompactionTask` interface with `Process() bool` state machine | `internal/datacoord/compaction_task.go:24-48` |
| milvus | `compactionTaskMeta` persists tasks via `SaveCompactionTask` to catalog | `internal/datacoord/compaction_task_meta.go:168-177` |
| milvus | `mixCompactionTask.Process()` handles failed/timeout states | `internal/datacoord/compaction_task_mix.go:267-289` |
| milvus | `CompactionQueue` heap-based priority scheduling | `internal/datacoord/compaction_queue.go:36-75` |
| milvus | `globalTaskScheduler` with `schedule()` loop | `internal/datacoord/task/global_scheduler.go:91-133` |
| milvus | `baseTask.Step()` and `baseTask.StepUp()` track action progression | `internal/querycoordv2/task/task.go:273-279` |
| milvus | `SegmentTask` and `ChannelTask` contain ordered `[]Action` slices | `internal/querycoordv2/task/task.go:73-111` |
| milvus | `TaskStatus` states: Created, Started, Succeeded, Canceled, Failed | `internal/querycoordv2/task/task.go:44-50` |
| nats-server | `MsgScheduling` with cron/@every/@at patterns | `server/scheduler.go:35-49` |
| nats-server | Raft consensus implementation for cluster leadership | `server/raft.go:129-137` |
| nats-server | `RaftNodeCheckpoint` for async snapshot installation | `server/raft.go:96-105` |
| nats-server | `AckPolicy` enum: AckNone, AckAll, AckExplicit, AckFlowControl | `server/consumer.go:331-342` |
| nats-server | `AckWait` duration for redelivery timeout | `server/consumer.go:647` |
| nats-server | `MaxDeliver` setting for message redelivery limit | `server/consumer.go:802` |
| nats-server | KV store as JetStream streams with `KV.>` subject pattern | `server/jetstream_api.go:4601` |
| openfga | Authorization models define permissions via `type`, `relations`, `define` | `pkg/typesystem/typesystem.go:1-200` |
| openfga | `LocalChecker.ResolveCheck()` for single-request graph traversal | `internal/graph/check.go:395-472` |
| openfga | ListObjects internal pipeline of workers for reverse expansion | `internal/listobjects/pipeline/pipeline.go:120-131` |
| openfga | Workers subscribe to edges forming directed graph, DFS-based construction | `internal/listobjects/pipeline/pipeline.go:340-362` |
| openfga | Cycle detection in graph resolution | `internal/graph/check.go:419-428` |
| openfga | Request-level timeouts via Go context | `internal/graph/check.go:54` |
| pocketbase | Cron scheduler with time-based trigger | `tools/cron/cron.go:19` |
| pocketbase | Job struct with id, expression, run function | `tools/cron/job.go:6-10` |
| pocketbase | Generic concurrent-safe hook manager | `tools/hook/hook.go:34-57` |
| pocketbase | Fire-and-forget goroutine wrapper with panic recovery | `tools/routine/routine.go:9-34` |
| pocketbase | DB lock retry with exponential backoff | `core/db_retry.go:20-41` |
| pocketbase | Standard db transaction rollback | `core/db_tx.go:78` |
| pocketbase | Record upsert dry-run with manual rollback | `forms/record_upsert.go:259-274` |
| temporal | Workflows defined as code in SDK languages | `docs/architecture/README.md:22` |
| temporal | Append-only History Events reconstruct workflow state | `docs/architecture/README.md:32` |
| temporal | Workflow Tasks processed by workers advancing via commands | `docs/architecture/README.md:67-68` |
| temporal | `MutableStateImpl` tracks pending activities, timers, child workflows | `service/history/workflow/mutable_state_impl.go:127-200` |
| temporal | `NewMutableStateFromDB` reconstructs state from persistence | `service/history/workflow/mutable_state_impl.go:435-586` |
| temporal | Atomic commit: events + mutable state | `docs/architecture/history-service.md:300-301` |
| temporal | `TaskGenerator` creates Transfer/Timer tasks | `service/history/workflow/task_generator.go:34-96` |
| temporal | `workflowTaskStateMachine` manages workflow task lifecycle | `service/history/workflow/workflow_task_state_machine.go:1` |
| temporal | `getBackoffInterval` computes exponential retry | `service/history/workflow/retry.go:32-54` |
| temporal | `AddStartChildWorkflowExecutionInitiatedEvent` spawns child workflows | `service/history/workflow/mutable_state_impl.go:2716-2718` |
| temporal | `ExecutionStore` manages workflow execution | `common/persistence/persistence_interface.go:115-167` |
| temporal | `Transaction` interface for Create/Update/ConflictResolve | `service/history/workflow/transaction.go:12-57` |
| temporal | `LoadMutableState` loads execution context from persistence | `service/history/workflow/context.go:141-179` |
| temporal | `AddWorkflowTaskScheduleToStartTimeoutEvent` handles WFT timeouts | `service/history/interfaces/mutable_state.go:76` |
| temporal | `TimerQueueActiveTaskExecutor` processes timer task types | `service/history/timer_queue_active_task_executor.go:90` |
| temporal | `TransferQueueActiveTaskExecutor` dispatches Workflow/Activity tasks | `service/history/transfer_queue_active_task_executor.go:114` |
| victoriametrics | YAML-based config with Groups and Rules | `app/vmalert/config/config.go:25-55` |
| victoriametrics | Ticker-based periodic evaluation via `time.NewTicker(g.Interval)` | `app/vmalert/rule/group.go:425-426` |
| victoriametrics | `execConcurrently` loop with semaphore pattern | `app/vmalert/rule/group.go:731-757` |
| victoriametrics | In-memory `alerts map[uint64]*notifier.Alert` | `app/vmalert/rule/alerting.go:47` |
| victoriametrics | Query `ALERTS_FOR_STATE` series to restore alert state | `app/vmalert/rule/alerting.go:820-821` |
| victoriametrics | Semaphore pattern for concurrency control | `app/vmalert/rule/group.go:742` |
| victoriametrics | Context-based cancellation via `evalCancel` | `app/vmalert/rule/group.go:418` |
| victoriametrics | SIGHUP handler for hot config reload | `app/vmalert/main.go:173` |

---

Generated by dimension `12-workflow-agent-orchestration.md`.