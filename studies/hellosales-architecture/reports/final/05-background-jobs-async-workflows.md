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

Background job processing across the studied sources falls into three architectural clusters: **in-process goroutine/queue systems**, **external message broker systems**, and **purpose-built durable execution platforms**. Only one source (Temporal) achieves exemplar-level implementation; the majority have meaningful gaps in retry policies, dead-letter handling, workflow orchestration, and backpressure. The most common anti-pattern is treating exponential backoff as sufficient retry infrastructure without dead-letter queues, jitter, or cancellation propagation. For HelloSales specifically, which requires long-running AI pipelines, the absence of durable execution infrastructure in most sources is a critical gap.

## Core Thesis

Background job architecture is fundamentally shaped by a system's tolerance for complexity versus its need for durability. Systems optimized for simplicity (cli, pocketbase) use in-process goroutines with fire-and-forget semantics and no persistence. Systems that need reliability within a single node (milvus, openfga, grafana) layer priority queues, lease-based claiming, and bounded channels but cannot survive node crashes. Systems that need distributed reliability either adopt external brokers (nats-server with JetStream) or purpose-built durable execution (temporal). The divergence is not quality-based but constraint-based: a CLI tool has different durability requirements than a distributed time-series database.

## Rating Summary

| Source | Score | Approach | Main Strength | Main Concern |
|--------|-------|----------|---------------|--------------|
| cli | 4/10 | External API delegation + polling | Lightweight, simple | No local durability, no DLQ, polling inefficiency |
| grafana | 6/10 | K8s API + in-memory scheduler | Lease-based claiming, multi-tenant fairness | No DLQ, no workflow engine, fixed workers |
| milvus | 6/10 | In-process priority queues + goroutines | Priority scheduling, action chains | No persistence, no DLQ, per-component duplication |
| nats-server | 6/10 | JetStream durable streams + pull consumers | Durable streams, ack semantics | No native DLQ, backoff as array not algorithm |
| openfga | 5/10 | MPMC pipeline + concurrency pools | Bounded queue backpressure, message pools | No retry, no DLQ, context as only timeout |
| pocketbase | 3/10 | Cron scheduler + FireAndForget | Zero dependencies, panic recovery | No job queue, no retry, no cancellation |
| temporal | 9/10 | Durable execution platform | Event sourcing, DLQ, workflows, scheduling | Operational complexity, replay determinism |
| victoriametrics | 5/10 | FastQueue + remote write retry | Hybrid memory/file persistence | No job concept, infinite retry, no DLQ |

## Approach Models

### In-Process Goroutine Workers

**Represented by:** cli, pocketbase, openfga (pipeline variant)

These systems use Go's native concurrency model as the job processing substrate. Workers are goroutines; queues are channels; backpressure is channel blocking. No external infrastructure is required.

- **cli**: HTTP POST to external CAPI + polling with `time.Ticker` + `errgroup.SetLimit()` for bounded concurrency
- **pocketbase**: Cron scheduler with `time.Ticker` + `FireAndForget` goroutines with panic recovery
- **openfga**: MPMC bounded ring buffer queues + concurrency pools + cycle group coordination

### External Broker / Queue Infrastructure

**Represented by:** nats-server (JetStream)

Message brokers provide durable message storage separate from the processing node. Jobs are messages; consumers subscribe or pull.

- **nats-server**: JetStream streams with `MaxDeliver`/`BackOff` arrays, pull-based consumers, advisory-only DLQ on max delivery exceeded

### Kubernetes API as Queue

**Represented by:** grafana (provisioning system)

The Kubernetes API (etcd) serves as a persistent job store. Jobs are Custom Resources; claiming uses label updates with optimistic concurrency.

- **grafana**: `Insert()` writes K8s resources, `Claim()` uses atomic label updates, lease renewal loop prevents expiry, Loki archives completed jobs

### In-Process Priority Queue Systems

**Represented by:** milvus, victoriametrics

These systems implement multi-queue architectures with pending/running phases, priority levels, and goroutine-based workers coordinated via in-memory data structures.

- **milvus**: Per-component schedulers with `PriorityQueue` + `ConcurrentMap`, action chain execution, TSO allocation, adaptive rate limiting for streaming
- **victoriametrics**: `FastQueue` hybrid memory+file persistence, chunked disk queue, `BackoffTimer` with jitter for remote write retry

### Durable Execution Platform

**Represented by:** temporal

A purpose-built platform providing workflow-as-code with full state persistence, event sourcing, and built-in orchestration.

- **temporal**: Event-sourced workflow state in PostgreSQL/Cassandra, `ExponentialRetryPolicy` with jitter, `temporal-sys-dlq-workflow` for DLQ handling, `temporal-sys-scheduler` for cron-like scheduling, backlog age tracking

## Pattern Catalog

### Pattern 1: Lease-Based Job Claiming

**Problem:** How to ensure only one worker processes a job in a multi-node environment without a central coordinator.

**Sources:** grafana, milvus (via etcd session)

**Mechanism:** Worker atomically updates job resource with a claim timestamp/lable. Resource version conflicts prevent double-claim. A background renewal loop prevents lease expiry during processing.

**Evidence:** `grafana/pkg/registry/apis/provisioning/jobs/persistentstore.go:150-161` (resource version conflicts), `grafana/pkg/registry/apis/provisioning/jobs/driver.go:266-320` (lease renewal loop)

**When to copy:** When jobs must be distributed across multiple nodes using only existing infrastructure (K8s), and at-least-once semantics are acceptable.

**When overkill:** Single-node deployments, or when an external queue broker (NATS/Kafka) is available.

### Pattern 2: Two-Phase Queue (Pending/Running)

**Problem:** How to track job lifecycle from submission through active processing while enabling cancellation and backpressure.

**Sources:** milvus, grafana

**Mechanism:** Separate collections for pending (waiting for resources) and running (actively processed). Tasks transition between phases based on resource availability and progress.

**Evidence:** `milvus/internal/datacoord/task/global_scheduler.go:54-55` (PriorityQueue pending, ConcurrentMap running), `milvus/internal/querycoordv2/task/scheduler.go:159` (per-node task buckets)

**When to copy:** When jobs have variable resource requirements and need to be staged before execution.

**When overkill:** Simple fire-and-forget workloads with bounded parallelism.

### Pattern 3: Bounded MPMC Queue with Extension

**Problem:** How to prevent unbounded memory growth while allowing throughput bursts.

**Sources:** openfga

**Mechanism:** Ring buffer queue with bounded capacity. When full, senders park. If extension budget remains, `Send()` doubles buffer capacity under write lock before parking.

**Evidence:** `openfga/internal/containers/mpmc/queue.go:42` (Queue struct), `openfga/internal/containers/mpmc/queue.go:241-256` (buffer extension and blocking)

**When to copy:** Pipeline architectures with variable-depth stages where memory must be bounded but latency spikes should be absorbed.

**When overkill:** When external queue infrastructure is available and horizontal scaling is required.

### Pattern 4: Exponential Backoff with Jitter

**Problem:** How to retry failed jobs without creating thundering herd on recovery.

**Sources:** temporal, milvus, nats-server (limited)

**Mechanism:** Retry intervals increase exponentially, with randomization (jitter) added to spread retry attempts over time.

**Evidence:** `temporal/common/backoff/retrypolicy.go:178-187` (20% jitter via `addJitter()`), `milvus/pkg/util/retry/retry.go:112` (pure exponential doubling, no jitter)

**When to copy:** Any retry scenario with multiple competing workers or clients.

**When overkill:** Single-consumer scenarios with predictable failure modes.

### Pattern 5: Progress Debouncing

**Problem:** How to update job progress without overwhelming observability systems.

**Sources:** grafana, victoriametrics (via queue metrics)

**Mechanism:** Progress updates are batched — immediate if last update > 500ms ago or job finished, otherwise every 5 seconds.

**Evidence:** `grafana/pkg/registry/apis/provisioning/jobs/progress.go:17-37` (`maybeNotifyProgress()`)

**When to copy:** Long-running jobs where progress updates could be frequent and noisy.

### Pattern 6: Deterministic Backoff Array

**Problem:** How to define predictable, operator-visible retry delays.

**Sources:** nats-server

**Mechanism:** `BackOff []time.Duration` is an explicit array of durations, not computed. Each delivery failure increments index into array.

**Evidence:** `server/consumer.go:98` (ConsumerConfig BackOff field), `server/consumer.go:5805-5808` (index bounds handling)

**When to copy:** When operators need explicit control over retry timing and observability into delay values is required.

**When overkill:** Complex retry scenarios where algorithmic backoff with jitter is preferred.

### Pattern 7: Hybrid Memory + File Persistence Queue

**Problem:** How to combine low-latency in-memory queuing with durability guarantees.

**Sources:** victoriametrics

**Mechanism:** In-memory channel first; when full, writes go to file-based disk queue. Reads try in-memory first, then disk queue. Chunk files track offsets for crash recovery.

**Evidence:** `victoriametrics/lib/persistentqueue/fastqueue.go:18-40` (FastQueue struct), `victoriametrics/lib/persistentqueue/persistentqueue.go:30-64` (file-based queue with offsets)

**When to copy:** Data ingestion pipelines where eventual delivery is acceptable and memory pressure is a concern.

**When overkill:** When external queue infrastructure provides sufficient durability.

### Pattern 8: Event-Sourced Workflow State

**Problem:** How to make workflow state durable, queryable, and replayable across failures.

**Sources:** temporal

**Mechanism:** All state changes recorded as immutable history events. Workflows can be replayed from any checkpoint. Event store enables fan-out queries and cross-namespace replication.

**Evidence:** `temporal/service/worker/scheduler/workflow.go` (full scheduler implementation), `temporal/common/backoff/retrypolicy.go` (retry policies)

**When to copy:** When workflows must survive node crashes, require audit trails, or need the ability to replay for debugging.

**When overkill:** Simple request/response background tasks with no need for durable state.

## Key Differences

### Durability vs. Simplicity

**High durability (temporal, nats-server JetStream):** These systems treat message persistence as foundational. Temporal uses PostgreSQL/Cassandra as event store; JetStream stores messages in streams with configurable retention.

**Low durability (cli, pocketbase, openfga):** These systems optimize for simplicity. Jobs exist only in memory or in-flight. Process crash = job loss.

**Partial durability (milvus, grafana, victoriametrics):** These use hybrid approaches — in-memory for speed but with some form of persistence or checkpointing. milvus loses tasks on node crash; grafana loses in-memory scheduler jobs; victoriametrics persists queue to disk.

### Retry Depth

**Shallow retry (openfga, pocketbase):** No formal retry mechanism. openfga uses `WithCancelOnError()` (first error cancels all); pocketbase only retries DB lock contention.

**Configurable retry (temporal, milvus, nats-server, grafana):** Exponential backoff with max attempts configuration. temporal adds jitter; nats-server uses array; milvus/grafana use doubling without jitter.

**Infinite retry (victoriametrics):** Remote writes retry indefinitely until success or explicit drop. Appropriate for metrics ingestion but problematic for bounded job completion.

### Dead-Letter Handling

**Native DLQ (temporal):** Built-in `temporal-sys-dlq-workflow` with merge/delete operations and configurable batch sizes.

**Advisory-only (nats-server):** `JSConsumerDeliveryExceededAdvisory` published but no automatic routing. Client must implement DLQ pattern externally.

**No DLQ (cli, openfga, pocketbase, milvus, victoriametrics):** Failed jobs are logged, returned as errors, or silently dropped. No visibility into failure chain.

### Workflow Orchestration

**None (cli, grafana, milvus, nats-server, openfga, pocketbase, victoriametrics):** These systems implement single-step job processing. grafana has pluggable worker interface but no multi-step composition; milvus has action chains but no persistent workflow state.

**Full orchestration (temporal):** Workflows are Go code with signals, queries, side effects, child workflows, and buffered starts. The scheduler workflow implements cron semantics with overlap policies, catchup windows, and jitter.

### Backpressure Mechanisms

**Queue-based blocking (openfga MPMC, milvus priority queue):** Senders block when queue is full, creating natural backpressure.

**Rate limiting (temporal, victoriametrics, openfga throttler):** Explicit rate limiters cap throughput; clients block on throttle channel.

**Slow consumer disconnect (nats-server):** Server marks clients as slow and may disconnect them when outbound write blocks.

**No backpressure (pocketbase, cli):** When saturated, these systems either fail requests or allow unbounded resource consumption.

## Tradeoffs

| Pattern | Benefit | Cost | Best-fit | Failure Mode |
|---------|---------|------|----------|--------------|
| In-process queue | Low latency, no network hops | Task loss on crash | Single-node, low-stakes tasks | Node crash loses all pending work |
| Goroutine workers | Familiar Go pattern, easy composition | Hard to limit/cancel across boundaries | Concurrent request handling | Context cancellation is best-effort |
| Lease claiming via K8s | No new infrastructure dependencies | Clock skew, no cross-cluster guarantee | K8s-native deployments | Clock skew causes premature expiry or double-claim |
| Exponential backoff (no jitter) | Predictable intervals | Thundering herd on recovery | Isolated retry scenarios | All failed tasks retry simultaneously |
| Exponential backoff + jitter | Spread retry load | Less predictable | Multi-worker retry scenarios | Slightly more complex configuration |
| No DLQ | Simpler code | No visibility into failures, no retry | Low-stakes, high-volume tasks | Failed tasks invisible, data loss |
| External broker (JetStream) | Durable, horizontally scalable | Additional operational burden | Distributed systems needing durability | Broker becomes SPOF unless clustered |
| Durable execution (Temporal) | Complete reliability, workflows | Significant operational complexity | Critical business workflows | Replay determinism requirements |
| Hybrid memory+file queue | Speed + durability | Disk I/O complexity | Data ingestion with durability needs | Chunk file corruption risk |

## Decision Guide

**Choose in-process goroutines + channels when:**
- Single-node deployment only
- Jobs are fire-and-forget or checked synchronously
- Can tolerate job loss on restart
- No external dependencies desired

**Choose Kubernetes API-as-queue when:**
- Already running on Kubernetes
- Jobs need to survive pod restarts (but not node crashes)
- Prefer declarative job definitions over imperative code
- Can tolerate clock skew issues in lease management

**Choose external message broker (NATS JetStream, Kafka) when:**
- Need horizontal worker scaling
- Jobs must survive broker node failures
- Multi-tenant with consumer group isolation needed
- Can accept additional infrastructure operational burden

**Choose durable execution platform (Temporal) when:**
- Workflows require multi-step state persistence
- Must survive cluster failures without losing in-progress work
- Audit trails and replay debugging are important
- Can accept significant operational complexity

**Avoid Temporal when:**
- Simple request/response background tasks only
- Team lacks operational maturity for distributed systems
- Cost/complexity outweighs reliability needs

## Practical Tips

1. **Always add jitter to exponential backoff.** Without it, thundering herd will overwhelm your system on recovery. See `temporal/common/backoff/retrypolicy.go:178-187`.

2. **Implement DLQ from day one.** Even a simple file-based DLQ (write failed jobs to a file) provides visibility and replay capability. None of the studied systems without DLQ had good failure observability.

3. **Use bounded queues for backpressure, not unbounded goroutines.** `errgroup.SetLimit()` (cli), MPMC bounded queues (openfga), and semaphore-based concurrency limiters (victoriametrics, pocketbase) prevent memory exhaustion under load.

4. **Lease renewal loops must handle cancellation.** grafana's `leaseRenewalLoop()` closes `leaseExpired` channel after 3 failures, but cancellation propagation to the worker `Process()` method is missing. This is a common gap.

5. **Separate pending/running task collections enables cancellation and backpressure.** milvus's two-phase queue pattern allows cancelling tasks before they start processing.

6. **For cron scheduling, use a catchup window and jitter.** temporal's scheduler workflow demonstrates this: `CatchupWindow` of 365 days, jitter config, and overlap policies prevent missed runs and duplicate executions.

7. **Context cancellation is best-effort, not guaranteed.** Every system that uses `ctx` for cancellation has gaps where goroutines continue running. Always combine with explicit cancellation signals for critical paths.

## Anti-Patterns / Caution Signs

**Silent data loss:**
- nats-server max delivery exceeded with no DLQ → message deleted
- victoriametrics HTTP 409/400/415 → block dropped without notification
- pocketbase FireAndForget errors → logged only

**No job timeout enforcement:**
- pocketbase cron jobs run forever with no timeout
- milvus no per-task hard timeout, relies on context cancellation
- openfga context deadline is sole duration limit

**No retry visibility:**
- openfga first-error cancels all pool goroutines
- cli polling timeout returns `(nil, nil)` silently
- grafana expired jobs marked as `JobStateError` and archived, no retry

**Infinite retry without circuit breaker:**
- victoriametrics retries forever until success
- milvus retry loops may never reach terminal state

**Context leaks:**
- milvus `baseTask.cancel` stored but not automatically called on scheduler Stop
- openfga workers may start before context cancellation is checked in `Build()`

**Queue overflow silent failures:**
- victoriametrics oldest blocks dropped when `maxPendingBytes` exceeded
- grafana per-tenant queue (100 items) blocks or discards depending on config

## Notable Absences

**No source implements:**
- Native priority queue with preemption (only priority levels for scheduling order)
- Built-in saga/compensation pattern
- Automatic workflow checkpointing (only temporal provides full durable state)
- Multi-tenant job isolation with quota enforcement (grafana has per-tenant limits but no global backpressure)

**DLQ is universally weak:**
- temporal: Excellent native DLQ
- nats-server: Advisory only
- All others: No DLQ at all

**No evidence of distributed tracing integration** within job processing cores (only SDK-level instrumentation in temporal).

## Per-Source Notes

**cli (4/10):** Delegated job execution to external CAPI service is a valid architectural choice for a CLI tool, but introduces dependency on external service availability. Polling with backoff is simple but inefficient. No local durability means job state is lost on process exit.

**grafana (6/10):** The K8s API-as-queue pattern is clever for K8s-native deployments but relies on clock synchronization. The lease renewal + cleanup pattern is sound. Missing DLQ and workflow orchestration are the main gaps.

**milvus (6/10):** Per-component schedulers are well-optimized for their specific tasks (query, data, index), but duplication across components is concerning. Priority-based scheduling and action chains show sophistication. No durable task persistence is the critical gap.

**nats-server (6/10):** JetStream provides solid durable messaging primitives. Pull consumers and subject-based routing align with NATS philosophy. Advisory-only DLQ and backoff as array (not algorithm) are the main limitations.

**openfga (5/10):** The MPMC bounded queue + pipeline pattern is well-engineered for authorization queries. Cycle group coordination is sophisticated. But the absence of retry and DLQ makes it unsuitable for long-running background jobs.

**pocketbase (3/10):** The lightweight, self-contained philosophy is coherent for its target use case (single-node embedded backend). But the 1-minute cron resolution, no job timeout, and no cancellation make it unsuitable for AI pipelines.

**temporal (9/10):** The gold standard for background job and async workflow systems. Event sourcing, DLQ workflows, scheduler with catchup windows, backlog age tracking — all demonstrate mature thinking. Minor gaps: no deadline propagation to child workflows, no per-workflow priority for multi-tenant isolation.

**victoriametrics (5/10):** FastQueue is well-designed for data ingestion. The hybrid memory+file persistence and chunked queue approach are sophisticated. But infinite retry without DLQ is inappropriate for job systems; it's designed for eventually-consistent metrics delivery.

## Open Questions

1. **For HelloSales specifically:** Given the requirement for long-running AI pipelines, is Temporal or a similar durable execution platform viable? If operational complexity is prohibitive, what is the minimum viable alternative?

2. **DLQ implementation:** Across all sources, DLQ remains the most consistently missing feature. What DLQ pattern would be appropriate for HelloSales — a separate stream (nats-server approach), a database table, or a workflow-based system (temporal approach)?

3. **Backpressure signaling:** Most sources handle backpressure implicitly. Should HelloSales implement explicit backpressure signals to clients about queue depth, or is implicit backpressure via HTTP 429 sufficient?

4. **Clock skew handling:** grafana's lease-based claiming has known clock skew risks. What mechanisms would ensure reliable job claiming in a HelloSales multi-node deployment?

## Evidence Index

| Evidence | Source | File:Line |
|----------|--------|-----------|
| Job struct with ID, SessionID, Status, Result | cli | `pkg/cmd/agent-task/capi/job.go:17-35` |
| Exponential backoff polling | cli | `pkg/cmd/agent-task/create/create.go:207-261` |
| errgroup bounded concurrency | cli | `pkg/cmd/release/shared/upload.go:114-131` |
| K8s lease-based claiming | grafana | `pkg/registry/apis/provisioning/jobs/persistentstore.go:150-161` |
| Lease renewal loop | grafana | `pkg/registry/apis/provisioning/jobs/driver.go:266-320` |
| In-memory round-robin scheduler | grafana | `pkg/util/scheduler/queue.go:172-209` |
| Two-phase task scheduler | milvus | `internal/datacoord/task/global_scheduler.go:54-55` |
| Exponential backoff retry | milvus | `pkg/util/retry/retry.go:112` |
| Adaptive rate limiting | milvus | `pkg/streaming/util/ratelimit/adaptive_rate_limit_controller.go:83` |
| JetStream ConsumerConfig BackOff | nats-server | `server/consumer.go:98` |
| MaxDeliver advisory | nats-server | `server/jetstream_events.go:120-132` |
| Pull consumer with ipQueue | nats-server | `server/consumer.go:456` |
| MPMC bounded queue | openfga | `internal/containers/mpmc/queue.go:42` |
| Concurrency pool with cancel-on-error | openfga | `internal/concurrency/concurrency.go:16-21` |
| Cycle group for pipeline coordination | openfga | `internal/listobjects/pipeline/internal/worker/cycle.go:99` |
| Cron scheduler with ticker | pocketbase | `tools/cron/cron.go:20-28` |
| FireAndForget with panic recovery | pocketbase | `tools/routine/routine.go:13-35` |
| ExponentialRetryPolicy with jitter | temporal | `common/backoff/retrypolicy.go:178-187` |
| DLQ workflow for merge/delete | temporal | `service/worker/dlq/workflow.go:139-146` |
| Scheduler workflow with catchup | temporal | `service/worker/scheduler/workflow.go:195-214` |
| Backlog age tracking | temporal | `service/matching/backlog_age_tracker.go:15-17` |
| FastQueue hybrid memory+file | victoriametrics | `lib/persistentqueue/fastqueue.go:18-40` |
| BackoffTimer with jitter | victoriametrics | `lib/timeutil/backoff_timer.go:9-47` |
| Queue blocked metric | victoriametrics | `app/vmagent/remotewrite/remotewrite.go:932-937` |

---

Generated by dimension `05-background-jobs-async-workflows.md`.