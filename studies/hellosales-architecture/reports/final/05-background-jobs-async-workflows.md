# Background Jobs & Async Workflows - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Dimension | `05-background-jobs-async-workflows.md` |
| Sources | cli, grafana, milvus, nats-server, openfga, pocketbase, temporal, victoriametrics |
| Date | 2026-05-20 |

## Sources Studied

| # | Source | Path |
|---|--------|------|
| 1 | cli | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/cli` |
| 2 | grafana | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/grafana` |
| 3 | milvus | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/milvus` |
| 4 | nats-server | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/nats-server` |
| 5 | openfga | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/openfga` |
| 6 | pocketbase | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/pocketbase` |
| 7 | temporal | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/temporal` |
| 8 | victoriametrics | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/victoriametrics` |

## Executive Summary

Background job processing across the eight studied sources spans a wide spectrum from rudimentary fire-and-forget goroutines to industrial-grade durable execution platforms. Only one source (Temporal) provides a complete implementation across all five dimension questions: job submission/tracking, retry/dead-letter handling, duration limits/cancellation, workflow orchestration, and backpressure. The majority rely on in-process goroutine patterns with no durability guarantees, simple polling with backoff, or message broker primitives that require significant application-level wiring to approach production-grade job processing. The most common gap is the absence of a dead-letter queue — most systems either retry indefinitely or silently drop failed work.

## Core Thesis

Background job architectures split fundamentally along a durability axis: systems that treat jobs as ephemeral in-memory events (cli, openfga, pocketbase) versus systems that persist job state to durable storage (temporal, nats-server, grafana, milvus, victoriametrics). The durable systems further diverge on whether they provide workflow orchestration (temporal) or only queue primitives (nats-server, grafana, milvus). For HelloSales specifically — which relies on long-running AI pipelines — none of the ephemeral systems are suitable without external augmentation. The choice is between adopting Temporal as a dedicated workflow platform or building on JetStream/Kubernetes primitives with significant additional investment in retry policies, DLQ handling, and observability.

## Rating Summary

| Source | Score | Approach | Main Strength | Main Concern |
|--------|-------|----------|---------------|--------------|
| temporal | 9 | Durable execution platform | Complete retry/DLQ/scheduling/cancellation semantics | Operational complexity, workflow determinism requirements |
| grafana | 6 | Dual-queue (in-memory + K8s API) | Lease-based claiming with rollback, Loki job history | No DLQ, no workflow orchestration, fixed worker count |
| milvus | 6 | In-process schedulers with etcd coordination | Two-phase queues, priority scheduling, slot-based node assignment | No DLQ, per-component scheduler fragmentation, task loss on crash |
| nats-server | 6 | JetStream durable streams | Subject-based routing, pull consumers, ack semantics | Advisory-only DLQ, no native workflow, backoff as static array |
| openfga | 5 | MPMC pipeline workers | Bounded queue backpressure, cycle detection, message pooling | No retry, no DLQ, no durability, in-process only |
| victoriametrics | 5 | FastQueue + evaluation timer | Hybrid memory/file persistence, chunked queue with metainfo | No per-job tracking, infinite retry or silent drop, no DLQ |
| cli | 4 | External delegation + polling | Exponential backoff polling, bounded errgroup concurrency | No local persistence, no DLQ, polling inefficiency, external dependency |
| pocketbase | 3 | Simple cron + FireAndForget | Minimal footprint, panic recovery, dual DB pool | No job persistence, no retry for async failures, no DLQ, single-node only |

## Approach Models

### 1. Durable Execution Platform (temporal)

Temporal implements the most complete model: workflow-as-code with deterministic replay, event-sourced state persistence, built-in retry policies with jitter, native dead-letter queue management with merge/delete workflows, scheduled workflows with cron-like semantics, and task-queue-based work distribution. It is the only source with true multi-step workflow orchestration and saga/compensation patterns.

### 2. Message Broker with Consumer Groups (nats-server)

JetStream provides durable stream storage, pull-based consumers for work distribution, and acknowledgement semantics. Jobs are messages published to subjects; consumers process and ack. Retry is configured via `BackOff []time.Duration` arrays. No native DLQ — advisory events notify when `MaxDeliver` is exceeded, requiring clients to implement DLQ routing.

### 3. Kubernetes API as Job Store (grafana)

Grafana uses Kubernetes etcd as a job persistence layer via custom resources. Jobs are claimed atomically using label selectors with resource version conflict handling. The Kubernetes informer provides notifications on job creation. Job history is archived to Loki. No DLQ; expired jobs are marked failed and cleaned up.

### 4. In-Process Priority Queues with Goroutine Workers (milvus)

Milvus uses per-component schedulers (querycoord, datacoord, proxy, rootcoord) with two-phase pending/running queues. Tasks are Go structs with `Cancel`, `Fail`, `Wait`, `Status`. Retry uses exponential backoff without jitter. No DLQ. Coordination via etcd for cluster topology, not for task persistence.

### 5. Bounded Channel Pipeline Workers (openfga)

OpenFGA uses MPMC (multi-producer multi-consumer) bounded ring-buffer queues for inter-worker communication. Workers are goroutines connected via typed channels. Backpressure is natural — `Send()` blocks when the buffer is full. No retry, no DLQ, no durability. Cycle groups handle quiescence detection for cyclic dataflows.

### 6. Persistent Queue for Data Ingestion (victoriametrics)

VictoriaMetrics is not a job system but a data sink. `FastQueue` provides hybrid in-memory/file persistence for failed remote writes. Exponential backoff with jitter for retries. Queue drops oldest blocks when size limits are exceeded. No per-job tracking, no DLQ. vmalert uses `time.Ticker` for periodic rule evaluation.

### 7. External API Delegation with Polling (cli)

The CLI delegates job execution to a remote Copilot Agent Interface (CAPI) service via HTTP. Jobs are tracked via polling with exponential backoff. No local queue, no DLQ, no workflow orchestration. Concurrency is bounded via `errgroup.SetLimit()`.

### 8. Minimal Cron + FireAndForget (pocketbase)

PocketBase provides only an in-process cron scheduler with 1-minute minimum resolution and a `FireAndForget` goroutine wrapper with panic recovery. No job persistence, no retry for async failures, no DLQ, no backpressure. SQLite lock contention has retry but this is DB-level, not job-level.

## Pattern Catalog

### Pattern: Exponential Backoff with Jitter

**What it solves**: Prevents thundering herd when many jobs retry simultaneously after a shared failure.

**Sources**: temporal (`common/backoff/retrypolicy.go:178-187`), victoriametrics (`lib/timeutil/backoff_timer.go:32-47`)

**Why it works**: Jitter randomizes retry timing across workers, spreading load during recovery. Temporal adds 20% randomization; VictoriaMetrics uses a similar approach.

**When to copy**: Any retry scenario with more than a handful of concurrent workers.

**When overkill**: Low-traffic systems with single or infrequent retries where thundering herd is unlikely.

### Pattern: Lease-Based Job Claiming

**What it solves**: Prevents double-processing when multiple workers can claim the same job.

**Sources**: grafana (`pkg/registry/apis/provisioning/jobs/persistentstore.go:150-161`)

**Why it works**: Uses Kubernetes resource version as optimistic locking. Atomic claim/update via API server conflict detection.

**When to copy**: Distributed systems where multiple consumers may contend for the same job.

**When overkill**: Single-process systems with goroutine workers sharing memory.

**Risk**: Clock skew between nodes can cause premature expiry or double-claim. grafana does not appear to have explicit clock skew mitigation.

### Pattern: Two-Phase Queue (Pending/Running)

**What it solves**: Separates job wait time from execution time, enabling fair scheduling and capacity management.

**Sources**: milvus (`internal/datacoord/task/global_scheduler.go:54-55`), grafana (in-memory scheduler)

**Why it works**: Jobs move from a shared pending pool to per-worker running state only when resources are available. Enables priority ordering and backpressure at the pending stage.

**When to copy**: Systems with heterogeneous job types or variable job duration where you want to prevent long jobs from blocking short ones.

### Pattern: MPMC Bounded Queue Backpressure

**What it solves**: Prevents memory exhaustion when producers outpace consumers.

**Sources**: openfga (`internal/containers/mpmc/queue.go:251-256`)

**Why it works**: Senders block on a `full` channel when the ring buffer is exhausted. Natural backpressure without explicit flow control logic.

**When to copy**: Pipeline-based processing where workers are coupled to producers.

**Risk**: Senders can block indefinitely if receivers fail to keep up and buffer extensions are exhausted.

### Pattern: Heartbeat Lease Renewal

**What it solves**: Detects worker crashes and enables job recovery without permanent loss.

**Sources**: grafana (`pkg/registry/apis/provisioning/jobs/driver.go:266-320`)

**Why it works**: A background goroutine periodically renews the job's lease. If 3 consecutive renewals fail, the `leaseExpired` channel closes and the job is re-queued.

**When to copy**: Long-running jobs where you need crash detection but cannot use context cancellation.

**Risk**: The 30-second default expiry in grafana may be too short for jobs with variable duration. No explicit per-job timeout configuration.

### Pattern: Progress Debouncing

**What it solves**: Avoids overwhelming the API server with rapid progress updates from fast-moving jobs.

**Sources**: grafana (`pkg/registry/apis/provisioning/jobs/progress.go:17-37`)

**Why it works**: Progress is sent immediately if more than 500ms has passed or the job is finished; otherwise batched and sent at most every 5 seconds.

**When to copy**: Jobs with high-frequency progress updates in systems where API calls are expensive.

### Pattern: Deterministic Job Naming

**What it solves**: Enables idempotent job creation and easy job discovery.

**Sources**: grafana (`pkg/registry/apis/provisioning/jobs/persistentstore.go:525-540`)

**Why it works**: Job names are generated from action type rather than random UUIDs, making jobs findable by name pattern and preventing duplicate creation.

### Pattern: Worker Interface Pattern

**What it solves**: Allows pluggable job handlers without changing the job dispatch infrastructure.

**Sources**: grafana (`pkg/registry/apis/provisioning/jobs/queue.go:45-54`)

**Why it works**: A `Worker` interface with `IsSupported()` and `Process()` methods allows SyncWorker, MigrationWorker, DeleteWorker, etc. to be registered and dispatched by the same infrastructure.

### Pattern: Context-Propagated Cancellation

**What it solves**: Clean shutdown of async operations without orphaning goroutines.

**Sources**: cli (`pkg/cmd/agent-task/create/create.go:248`), milvus (`task.go:92`), openfga (`pipeline.go:242`)

**Why it works**: `ctx` is passed through all async operations. When `ctx.Done()` fires (timeout or cancellation), all operations respect it.

**When to copy**: Any Go-based async system.

**Risk**: Cancellation is best-effort. Operations must explicitly check `ctx.Err()`.

### Pattern: Pull-Based Consumer Work Distribution

**What it solves**: Decouples producers from consumers, enabling elastic scaling and load-aware polling.

**Sources**: nats-server (`server/consumer.go:456`), temporal (task queue model)

**Why it works**: Workers request messages rather than having them pushed. This prevents worker overwhelm and allows SDKs to implement sticky execution for cache locality.

### Pattern: Hybrid In-Memory/File Persistence (FastQueue)

**What it solves**: Low-latency writes with durability fallback for spikes.

**Sources**: victoriametrics (`lib/persistentqueue/fastqueue.go:18-40`)

**Why it works**: In-memory channel for hot path; file-based queue activates when memory is saturated. Chunks are 500MB+ with JSON metainfo for crash recovery.

**When to copy**: High-throughput data ingestion where occasional remote storage unavailability must not cause data loss.

### Pattern: Round-Robin Tenant Fairness

**What it solves**: Prevents a single tenant from monopolizing a shared queue.

**Sources**: grafana (`pkg/util/scheduler/queue.go:172-209`)

**Why it works**: Iterates through tenants in round-robin order when selecting the next job to dequeue. No tenant can starve others regardless of job volume.

## Key Differences

### Durability vs. Simplicity

The primary split is between systems that persist job state (temporal, nats-server, grafana, milvus, victoriametrics) and those that treat jobs as ephemeral (cli, openfga, pocketbase). Persistent systems can recover from worker crashes; ephemeral systems lose in-flight work. For HelloSales AI pipelines — which are long-running and expensive — only persistent approaches are viable.

### Queue Primitive vs. Workflow Engine

nats-server JetStream provides queue primitives (streams, consumers, ack policies) but no workflow orchestration. Temporal provides both queue semantics AND workflow-as-code with deterministic replay. grafana and milvus sit in between: job queues with no multi-step coordination. openfga provides pipeline workers but no durable workflow state. HelloSales needs to evaluate whether queue primitives are sufficient for its AI pipeline use case or whether the added complexity of a workflow engine is justified.

### DLQ Implementation

Temporal is the only source with a native, operator-accessible DLQ (`temporal-sys-dlq-workflow` with delete and merge types). nats-server publishes advisories on max delivery exceeded but requires client-side DLQ routing. grafana, milvus, openfga, pocketbase, victoriametrics, and cli have no DLQ — failed jobs are either retried indefinitely or silently dropped.

### Backpressure Mechanisms

- **Bounded queue blocking**: openfga (MPMC), grafana (per-tenant limit of 100)
- **Rate limiting**: nats-server (MaxAckPending, MaxWaiting), victoriametrics (rate limiter, concurrency limiter)
- **Adaptive throttling**: milvus (Normal/Slowdown/Reject/Recovery states), victoriametrics (queue blocked metric)
- **Task queue backlog hints**: temporal (BacklogCountHint influences SDK polling behavior)
- **None**: cli, pocketbase

### Retry Policy Implementation

| Source | Exponential | Jitter | Max Attempts | Backoff Array |
|--------|-------------|--------|--------------|---------------|
| temporal | Yes | Yes (20%) | Yes | No — computed |
| nats-server | Yes | No | Yes (-1=infinite) | Yes — explicit |
| milvus | Yes | No | Per-usage | No |
| victoriametrics | Yes | Yes | No (infinite) | No |
| grafana | Yes | No | 5 retries | No |
| cli | Yes | No | Per-usage | No |
| openfga | No | No | No | No |
| pocketbase | No (fixed intervals) | No | 12 (DB locks only) | Yes — fixed |

### Job Duration Limits

Most systems rely on `context.Context` deadline propagation rather than hard per-job timeouts. grafana uses lease-based expiry (30s default). VictoriaMetrics uses `maxQueueDuration` and `sendTimeout`. Only temporal provides explicit `StartToCloseTimeout`, `WorkflowExecutionTimeout`, and activity-level timeout enforcement.

## Tradeoffs

### Using an External Queue vs. In-Process Scheduling

**Benefit** (external queue): Durability, horizontal scaling, cluster-wide visibility, operational tooling.
**Cost** (external queue): Additional infrastructure dependency, network hops, operational complexity.
**Best-fit**: Production systems requiring reliability and multi-node distribution.
**Failure mode**: Queue broker becomes a single point of failure or performance bottleneck.
**Alternative**: In-process goroutine scheduling (milvus, openfga) for low-latency, single-node workloads.

### Exponential Backoff with Jitter vs. Fixed Intervals

**Benefit** (jitter): Prevents thundering herd on shared failures.
**Cost** (jitter): Less predictable retry timing; debugging harder.
**Best-fit**: High-concurrency systems with potential for correlated failures.
**Failure mode**: Jitter that is too high can delay recovery unnecessarily.
**Alternative**: Fixed backoff intervals (pocketbase) for simple cases or low-frequency retries.

### Pull-Based vs. Push-Based Consumers

**Benefit** (pull): Workers control pace; prevents overwhelm; enables sticky execution.
**Cost** (pull): Higher latency for job delivery; requires workers to poll.
**Best-fit**: Work distribution across variable-capacity workers.
**Failure mode**: Polling overhead when many workers are idle.
**Alternative**: Push-based (grafana informer notifications) for low-latency delivery.

### Advisory-Only DLQ vs. Native DLQ Routing

**Benefit** (advisory-only): Flexibility — clients implement DLQ matching their needs.
**Cost** (advisory-only): Operational burden; DLQ is not automatic; requires custom implementation.
**Best-fit**: Systems where DLQ behavior varies by job type.
**Failure mode**: Failed jobs are lost if clients don't implement DLQ routing.
**Alternative**: Native DLQ routing (temporal) for automatic, standard handling.

### In-Memory vs. Persistent Job State

**Benefit** (in-memory): Lower latency, simpler code, no serialization overhead.
**Cost** (in-memory): Job loss on crash; no visibility into in-flight jobs.
**Best-fit**: Short-lived, restartable jobs; development environments.
**Failure mode**: Any crash loses all pending work.
**Alternative**: Persistent job state (K8s resources, JetStream, database) for production reliability.

### Single-Process vs. Distributed Scheduling

**Benefit** (single-process): Simpler deployment, no coordination overhead, no clock skew issues.
**Cost** (single-process): No horizontal scaling, no fault tolerance, single-node only.
**Best-fit**: Lightweight tools, single-instance deployments.
**Failure mode**: Node failure loses all work; cannot scale horizontally.
**Alternative**: Distributed scheduling (temporal, milvus cluster, grafana multi-pod) for HA and scaling.

## Decision Guide

### When to Use Temporal

Choose Temporal when:
- Workflows have multiple steps with state that must survive crashes
- You need guaranteed at-least-once execution with built-in retry and DLQ
- Your team can handle operational complexity (SQL/Cassandra/MySQL + Temporal cluster)
- You need cron-like scheduling with overlap policies and catchup windows
- You want workflow-as-code that is testable and version-controllable

### When to Use JetStream (nats-server)

Choose JetStream when:
- You need durable message delivery but not full workflow orchestration
- Your jobs are relatively flat (single step or simple fan-out)
- You can implement DLQ routing in your application
- You want lower operational complexity than Temporal
- Subject-based routing aligns with your domain model

### When to Use Kubernetes API as Job Store (grafana model)

Choose this approach when:
- Your application already runs on Kubernetes
- You want to avoid additional queue infrastructure
- You can accept the limitations of etcd (no message durability beyond resource creation)
- Lease-based claiming is acceptable for your failure model

### When to Use In-Process Schedulers

Choose in-process scheduling (milvus, openfga model) when:
- Latency is critical and network hops are unacceptable
- Jobs are short-lived and restartable
- You don't need multi-node distribution
- Your workload fits in a single process

### When to Avoid Dedicated Job Infrastructure

Avoid dedicated job infrastructure (pocketbase, basic cli model) when:
- Async work is truly fire-and-forget (logging, non-critical notifications)
- Your tool is a lightweight CLI that shouldn't have infrastructure dependencies
- Reliability is not critical and restarts are acceptable

## Practical Tips

### Patterns to Copy

1. **Exponential backoff with jitter** for any retry scenario with concurrent workers. See `common/backoff/retrypolicy.go:178-187` in temporal for reference implementation.

2. **Lease-based job claiming with rollback** for distributed job distribution. See grafana's `persistentstore.go:177-209` for the rollback function pattern.

3. **Two-phase pending/running queues** for capacity management and fair scheduling across job types.

4. **Progress debouncing** to reduce API load for high-frequency updates. See grafana `progress.go:17-37`.

5. **Deterministic job naming** from action type for idempotent job creation.

6. **Pull-based consumer model** for decoupling producers from consumers and enabling elastic worker scaling.

7. **Hybrid memory/file persistence** (FastQueue pattern) for high-throughput scenarios requiring durability.

8. **Worker interface pattern** for pluggable job handlers without changing dispatch infrastructure.

### Patterns to Avoid or Delay

1. **No retry mechanism** (openfga, pocketbase async) until you've confirmed your jobs are idempotent or failure is acceptable.

2. **Polling-only job tracking** (cli) for anything beyond development/low-reliability scenarios. Prefer webhooks or server-sent events.

3. **Infinite retry without DLQ** (victoriametrics) unless you're certain data loss is acceptable and indefinite delivery is required.

4. **1-minute cron resolution** (pocketbase) for any job needing sub-minute scheduling.

5. **Advisory-only max-delivery** (nats-server) without implementing explicit DLQ routing — you'll lose jobs silently.

### Decision Rules

- **Job duration > 30 seconds OR must survive process crash**: Use persistent job state (Temporal, JetStream, K8s API, or database-backed queue).
- **Multi-step workflows with state**: Use Temporal or build a custom state machine on top of JetStream/streams.
- **Low-latency, single-node, restartable jobs**: In-process goroutine schedulers may suffice.
- **Multi-tenant with fair resource sharing**: Round-robin tenant scheduling (grafana) or weighted fair queuing.
- **Need for observability into failed jobs**: Must have DLQ; only Temporal provides this natively.

## Anti-Patterns / Caution Signs

### Brittle Signs

- **No DLQ and no retry limit**: Jobs either retry forever or fail silently with no visibility.
- **Polling with no timeout strategy**: Polling that returns `(nil, nil)` on timeout (cli) is a silent failure mode.
- **No per-job timeout**: Systems where jobs can run indefinitely with no cancellation mechanism.
- **Fixed backoff without jitter**: All workers retry at identical intervals, causing thundering herd.
- **No progress tracking**: No visibility into whether a long-running job is making progress or stuck.

### Over-Coupled Signs

- **Per-component scheduler fragmentation** (milvus): Each component reinvents similar scheduling patterns, making cross-cutting retry policies impossible.
- **Workflow logic embedded in client applications** (nats-server without DLQ routing): Multi-step coordination must be built and maintained in every client.
- **In-memory job state with no recovery**: Jobs lost on any crash, with no way to determine what was in-flight.

### Hard-to-Operate Signs

- **No observability into queue depth**: Systems that provide no metrics on pending/running/completed jobs.
- **Clock skew sensitivity** (lease-based claiming): Without explicit clock sync monitoring, lease expiry becomes unpredictable.
- **No cancellation propagation**: Workers that don't respect context cancellation make graceful deployments impossible.
- **Blocking send on full queue**: MPMC queues that park senders indefinitely when exhausted can cause request hangs.

### Hard-to-Evolve Signs

- **No job versioning**: Jobs that cannot be upgraded without breaking in-flight instances.
- **No workflow abstraction**: Application code that directly manages job state transitions instead of using a workflow engine.

## Notable Absences

### No Native Saga/Compensation Pattern

Only Temporal provides explicit support for saga patterns and compensating transactions. All other sources either don't need multi-step workflows (CLI tools, data ingestion systems) or lack compensation mechanisms entirely.

### No Distributed Cross-Server Scheduling

nats-server header-based message scheduling works for single-server scheduled messages but cannot coordinate across a cluster without external coordination. grafana's cron is single-node. PocketBase's cron is single-instance. Only temporal provides true distributed scheduled workflow execution.

### No Adaptive Backoff Beyond Rate Limiting

While several systems have rate limiting, none implement adaptive backoff that adjusts retry strategy based on failure classification (transient vs. permanent). milvus comes closest with `Unrecoverable(err)` fast-fail, but retry strategy is still static per-usage.

### No Native Priority Queue with Preemption

Most systems treat all jobs equally or use simple priority levels (milvus has Normal/High). No source implements preemption — the ability to interrupt a running low-priority job to run a high-priority one.

### No Built-In Workflow Versioning

Temporal provides `SchedulerWorkflowVersion` constants for non-breaking workflow upgrades, but other sources have no formal workflow versioning mechanism. Jobs are typically versioned by their handler code, not by an explicit versioning policy.

## Per-Source Notes

### temporal
The benchmark implementation. Retry with jitter, native DLQ, workflow-as-code with deterministic replay, scheduled workflows, backlog tracking, priority rate limiting. The primary complexity is operational — requires a full Temporal cluster plus a persistence store. The scheduler workflow's CHASM migration suggests even Temporal is evolving its internal execution model.

### grafana
A pragmatic hybrid: in-memory scheduler for low-latency multi-tenant work, Kubernetes API for durable job persistence. Notable for lease-based claiming with rollback, Loki job history, and worker interface pattern. Gaps: no DLQ, no workflow orchestration, fixed worker count, no explicit cancellation propagation to workers.

### milvus
Sophisticated multi-component scheduling with priority queues, slot-based node assignment, and TSO timestamp allocation. The two-phase pending/running model is well-designed. Weaknesses: per-component scheduler fragmentation (duplicated code), no DLQ, no jitter in backoff, task loss on node crash.

### nats-server
JetStream provides production-grade durable streams and pull-based consumers. The advisory-only DLQ is the main gap — requires client implementation. Backoff as a static array (no jitter) is another limitation. Subject-based routing is a different mental model from queue-based systems.

### openfga
Well-engineered pipeline workers with MPMC bounded queues, cycle detection, and message pooling. The bounded queue backpressure is elegant. However, no retry, no DLQ, no durability — suitable for in-process authorization resolution but not for production job processing.

### victoriametrics
FastQueue is a solid persistent queue for data ingestion scenarios. The hybrid memory/file design balances latency and durability. However, infinite retry and silent drop on 409/400/415 are not appropriate for general job processing. vmalert's timer-based evaluation is not a job queue.

### cli
The external delegation + polling model is appropriate for a CLI tool that offloads work to a remote service. However, the polling inefficiency, silent timeout `(nil, nil)` return, and lack of any local job visibility make it unsuitable for production backend services.

### pocketbase
Explicitly designed as a lightweight, self-contained backend. The simplicity is a feature for its target use case (small self-hosted deployments). However, for HelloSales AI pipelines, it has severe gaps: no job persistence, no retry for async failures, no DLQ, no backpressure, single-node only.

## Open Questions

1. **What is the appropriate job persistence model for HelloSales AI pipelines?** The sources show a clear split between ephemeral in-memory and durable persistent approaches. AI pipelines likely require durability given their cost and duration, pointing toward Temporal or JetStream-based solutions.

2. **Should HelloSales implement a native DLQ or rely on advisory notifications?** Only Temporal provides native DLQ routing. JetStream advisories require custom client implementation. The operational cost of implementing DLQ routing must be weighed against the flexibility of custom behavior.

3. **How should job cancellation interact with in-progress AI work?** Context propagation handles cancellation initiation, but AI pipeline steps may not be interruptible. What is the semantics when a 10-minute AI inference is cancelled mid-execution?

4. **What is the retry budget for failed AI pipeline steps?** Most systems either retry indefinitely (data loss acceptable) or have fixed limits. AI pipelines may need typed retry policies — some steps idempotent and retryable, others not.

5. **Is polling acceptable for HelloSales job tracking?** Polling is simple but inefficient. Server-sent events, webhooks, or persistent connections (gRPC streaming) provide better latency but add infrastructure complexity.

6. **Should HelloSales adopt Temporal as a dedicated workflow platform or build on JetStream primitives?** Temporal's operational complexity is significant. JetStream provides queue primitives but requires significant additional investment in retry, DLQ, and observability.

7. **How does multi-tenant isolation work for AI pipeline job scheduling?** grafana's round-robin tenant fairness is one approach. VictoriaMetrics' per-URL queue limits is another. What isolation model fits HelloSales multi-tenant requirements?

## Evidence Index

- `pkg/cmd/agent-task/capi/job.go:17-35` — Job struct definition (cli)
- `pkg/cmd/agent-task/capi/client.go:15-16` — HTTP job submission (cli)
- `pkg/cmd/agent-task/create/create.go:207-261` — Exponential backoff polling (cli)
- `pkg/cmd/release/shared/upload.go:114-131` — Bounded errgroup concurrency (cli)
- `internal/codespaces/rpc/invoker.go:271-293` — Heartbeat ticker (cli)
- `pkg/util/scheduler/queue.go:91-118` — In-memory multi-tenant queue (grafana)
- `pkg/util/scheduler/queue.go:172-209` — Round-robin tenant fairness (grafana)
- `pkg/registry/apis/provisioning/jobs/persistentstore.go:150-161` — Atomic job claiming via resource version (grafana)
- `pkg/registry/apis/provisioning/jobs/persistentstore.go:177-209` — Job claim rollback function (grafana)
- `pkg/registry/apis/provisioning/jobs/driver.go:266-320` — Lease renewal loop (grafana)
- `pkg/registry/apis/provisioning/jobs/expired_job_cleanup.go:87-135` — Expired job cleanup (grafana)
- `pkg/registry/apis/provisioning/jobs/progress.go:17-37` — Progress debouncing (grafana)
- `pkg/registry/apis/provisioning/jobs/queue.go:45-54` — Worker interface (grafana)
- `pkg/util/retryer/retryer.go:18-47` — Generic retry utility (grafana)
- `internal/querycoordv2/task/scheduler.go:382` — Task scheduler interface (milvus)
- `internal/querycoordv2/task/task.go:73` — Task interface (milvus)
- `internal/datacoord/task/global_scheduler.go:48` — Global task scheduler (milvus)
- `internal/proxy/task_scheduler.go:443` — Proxy task scheduler (milvus)
- `pkg/util/retry/retry.go:39` — Retry package (milvus)
- `pkg/util/retry/options.go:46` — Retry options (milvus)
- `internal/querycoordv2/task/scheduler.go:1084` — Failed load cache (milvus)
- `pkg/streaming/util/ratelimit/adaptive_rate_limit_controller.go:34` — Adaptive rate limiting states (milvus)
- `server/stream.go:50-130` — Stream config (nats-server)
- `server/consumer.go:88-141` — Consumer config (nats-server)
- `server/consumer.go:97-98` — MaxDeliver and BackOff (nats-server)
- `server/consumer.go:333-341` — Ack policies (nats-server)
- `server/jetstream_events.go:120-132` — Max delivery exceeded advisory (nats-server)
- `server/consumer.go:470` — Redelivery queue (nats-server)
- `server/consumer.go:2872-2904` — addToRedeliverQueue (nats-server)
- `server/consumer.go:5927-6044` — checkPending timer (nats-server)
- `server/scheduler.go:35-44` — Hash-wheel timer for scheduling (nats-server)
- `server/ipqueue.go:64-84` — ipQueue backpressure (nats-server)
- `server/client.go:155,1442-1447` — Slow consumer tracking (nats-server)
- `internal/listobjects/pipeline/pipeline.go:98` — Pipeline builder (openfga)
- `internal/listobjects/pipeline/pipeline.go:399-410` — Pipeline worker start (openfga)
- `internal/containers/mpmc/queue.go:42` — MPMC queue struct (openfga)
- `internal/containers/mpmc/queue.go:251-256` — MPMC backpressure (openfga)
- `internal/concurrency/concurrency.go:10-21` — Concurrency pool (openfga)
- `internal/throttler/throttler.go:26` — Throttler interface (openfga)
- `internal/listobjects/pipeline/internal/worker/cycle.go:99` — Cycle group (openfga)
- `tools/cron/cron.go:20-28` — Cron scheduler (pocketbase)
- `tools/cron/cron.go:81-107` — Cron job registration (pocketbase)
- `tools/routine/routine.go:13-35` — FireAndForget (pocketbase)
- `core/db_retry.go:43-62` — DB lock retry (pocketbase)
- `core/base.go:1305-1310` — File delete semaphore (pocketbase)
- `common/backoff/retrypolicy.go:49-55` — Exponential retry policy (temporal)
- `common/backoff/retrypolicy.go:178-187` — Jitter implementation (temporal)
- `service/worker/dlq/workflow.go:139-146` — DLQ workflow types (temporal)
- `service/worker/dlq/workflow.go:179-191` — DLQ retry policies (temporal)
- `service/matching/backlog_manager.go:39-56` — Backlog manager interface (temporal)
- `service/matching/backlog_age_tracker.go:15-17` — Backlog age tracker (temporal)
- `service/worker/scheduler/workflow.go:71-72` — Scheduler workflow prefix (temporal)
- `service/worker/scheduler/workflow.go:195-214` — Tweakable policies (temporal)
- `service/history/history_engine.go:635-636` — Workflow cancellation (temporal)
- `service/matching/backlog_manager.go:27-29` — Persistence retry policy (temporal)
- `lib/persistentqueue/fastqueue.go:18-40` — FastQueue struct (victoriametrics)
- `lib/persistentqueue/fastqueue.go:186-229` — Queue write (victoriametrics)
- `lib/persistentqueue/persistentqueue.go:30-64` — File-based queue (victoriametrics)
- `lib/persistentqueue/persistentqueue.go:355-382` — Queue drop on size (victoriametrics)
- `lib/timeutil/backoff_timer.go:9-47` — Backoff timer (victoriametrics)
- `app/vmagent/remotewrite/client.go:416-515` — Remote write retry (victoriametrics)
- `lib/writeconcurrencylimiter/concurrencylimiter.go:103-136` — Concurrency limiter (victoriametrics)
- `app/vmalert/rule/group.go:731-757` — vmalert group executor (victoriametrics)

---

Generated by dimension `05-background-jobs-async-workflows.md`.
