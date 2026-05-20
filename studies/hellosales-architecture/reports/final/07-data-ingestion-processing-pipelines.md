# Data Ingestion & Processing Pipelines - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Dimension | `07-data-ingestion-processing-pipelines.md` |
| Sources | cli, grafana, kubernetes, milvus, nats-server, openfga, pocketbase, temporal, victoriametrics |
| Date | 2026-05-20 |

## Sources Studied

| # | Source | Path |
|---|--------|------|
| 1 | cli | `sources/cli` |
| 2 | grafana | `sources/grafana` |
| 3 | kubernetes | `sources/kubernetes` |
| 4 | milvus | `sources/milvus` |
| 5 | nats-server | `sources/nats-server` |
| 6 | openfga | `sources/openfga` |
| 7 | pocketbase | `sources/pocketbase` |
| 8 | temporal | `sources/temporal` |
| 9 | victoriametrics | `sources/victoriametrics` |

## Executive Summary

This study examined data ingestion and processing pipelines across nine Go-based systems ranging from CLI tools to distributed databases. The sources span three architectural archetypes: **ad-hoc processing** (cli, pocketbase) with minimal pipeline structure, **staged pipelines** (grafana, openfga, temporal) with configurable processing stages, and **streaming pipelines** (kubernetes, milvus, nats-server, victoriametrics) with log-structured flows and backpressure. Overall ratings ranged from 5/10 (basic) to 8/10 (good/excellent), with the highest-rated systems (kubernetes, milvus, nats-server, temporal, victoriametrics) demonstrating that mature production systems invest heavily in validation layering, bounded memory management, and explicit failure handling. A universal gap across all sources is the inability to independently deploy or scale pipeline stages—pipeline stages are process-coupled without exception.

## Core Thesis

Data ingestion pipelines must solve five core problems: transforming raw input into trustworthy structured data, handling failures gracefully without losing valid work, validating data quality at each stage without becoming a bottleneck, managing memory under load without OOM, and enabling operational inspection. This study found that **validation concentration at ingestion boundaries** (not distributed per-stage) combined with **memory-bounded queuing** and **explicit failure classification** produces the most robust pipelines. Systems that scatter validation throughout stages (kubernetes, milvus) or concentrate it at write boundaries (openfga, pocketbase) both succeed, but systems with no coherent validation strategy (cli, nats-server) exhibit the weakest data quality guarantees.

## Rating Summary

| Source | Score | Approach | Main Strength | Main Concern |
|--------|-------|----------|---------------|--------------|
| cli | 5/10 | Ad-hoc pipeline | Input validation patterns, streaming pagination | No pipeline abstraction, no backpressure, no observability |
| grafana | 7/10 | Pluggable stage pipeline | Configurable stage composition, managed streams | No independent stage scaling, no field-level validation |
| kubernetes | 8/10 | Strategy-pattern pipeline | Admission chain, GuaranteedUpdate, informer/watch | Admission plugins compile into API server |
| milvus | 8/10 | WAL-centric streaming | Channel sharding, capacity eviction, interceptor pattern | SchemaVersion coupling, no per-stage observability |
| nats-server | 8/10 | State-machine pipeline | Zero-copy delivery, pooled buffers, slow-consumer detection | No schema validation, no per-stage backpressure |
| openfga | 7/10 | Write-ahead validation pipeline | Goroutine workers, ULID ordering, transactional writes | No retry on transient failures, no resumeable pipelines |
| pocketbase | 5/10 | Form-object pipeline | Field interceptor pattern, dual DB pools | No batching, no DLQ, no backpressure |
| temporal | 8/10 | Task queue pipeline | 7 queue categories, DLQ, error classification | No independent stage scaling, rescheduler unbounded |
| victoriametrics | 8/10 | Concurrent stream pipeline | Memory-first queue, concurrency limiter, relabeling | No per-stage observability, protocol handlers tightly coupled |

## Approach Models

### 1. Ad-Hoc Processing (cli, pocketbase)

Both sources lack explicit pipeline abstractions. Data flows through sequential validation layers without formal stage composition.

- **cli** (`pkg/cmdutil/json_flags.go:225-257`): JSON export is a de facto pipeline (encode → filter → template → output) but has no formal stage interface
- **pocketbase** (`forms/record_upsert.go:23-34`): Form objects hold validation logic per record; no batching abstraction

**Cluster insight**: Both are basic implementations that work for low-volume use cases but would fail under production ETL workloads.

### 2. Pluggable Stage Pipeline (grafana, openfga)

Both use interface-based stage composition allowing custom stages without modifying core logic.

- **grafana** (`pkg/services/live/pipeline/pipeline.go:82-107`): `DataOutputter`, `Converter`, `FrameProcessor`, `FrameOutputter` interfaces with `ChannelRuleSettings` for configuration
- **openfga** (`internal/listobjects/pipeline/pipeline.go:121-131`): Goroutine-based workers with buffered channels, `mpsc.Accumulator` for error collection

**Cluster insight**: Pluggable stages enable customization but goroutine-based pipelines (openfga) are limited to single-process operation. Grafana's managed streams add server-side cursor management with schema caching (`runner.go:176-205`).

### 3. Streaming Pipeline (kubernetes, milvus, nats-server, victoriametrics)

These systems use log-structured flows with explicit ordering guarantees and backpressure mechanisms.

**kubernetes**: REST storage → admission (mutating/validating) → strategy transforms → etcd storage. Work queues with rate limiting and `TransactionStore` for atomic batching (`controller.go:739-749`).

**milvus**: WAL as single source of truth. `WriteAheadBuffer` with capacity-based eviction (`pending_queue.go:160`). Channel-based sharding distributes across StreamingNodes. Interceptor pattern layers functionality (timetick, WAB).

**nats-server**: TCP `readLoop` → state-machine parser → permission validation → subscription matching. Zero-copy via `net.Buffers` (`client.go:1636-1859`). Pooled buffers (512/4096/65536 bytes). Slow-consumer detection via pending bytes limit (`client.go:2513`).

**victoriametrics**: Protocol handlers normalize to internal format. Concurrent stream parsing with `ScheduleUnmarshalWork`. `FastQueue` memory-first with file fallback. Concurrency limiter with token-based backpressure (`concurrencylimiter.go:106`).

**Cluster insight**: Streaming pipelines excel at ordering guarantees and backpressure but sacrifice the ability to update historical data (immutable log).

### 4. Task Queue Pipeline (temporal)

Distinct from streaming pipelines: tasks are generated from workflow state transitions and routed through categorized queues (transfer, timer, replication, visibility, archival).

- 7 task categories with per-queue DLQ support (`dlq_writer.go:71-76`)
- Error classification in `HandleErr()`: invalid, safe-to-drop, retryable, terminal (`executable.go:503-584`)
- `stream_batcher` with MaxItems, MaxDelay, IdleTime options (`batcher.go:31-43`)

**Cluster insight**: Temporal's task queue model is the most sophisticated for failure isolation, but like all sources, stages cannot be independently deployed.

## Pattern Catalog

### Pattern 1: Validation Concentration at Boundaries

**Problem**: Distributing validation per-stage adds latency but ensures only valid data enters the pipeline.

**Sources**: kubernetes (`pkg/registry/core/pod/strategy.go:86-118`), openfga (`pkg/server/commands/write.go:149`), pocketbase (`core/record_model.go:1413-1427`)

**Mechanism**: kubernetes uses two-phase admission (mutating then validating) before any storage. openfga validates all tuples before `datastore.Write()`. pocketbase validates at HTTP layer, form layer, and field layer before transaction commit.

**When to use**: When data integrity is paramount and ingestion volume is manageable.

**When overkill**: High-frequency, high-volume ingestion where validation CPU cost is prohibitive.

### Pattern 2: Memory-Bounded Queues with Eviction

**Problem**: Unbounded queues cause OOM under load; need strategies that preserve recent data while shedding old data.

**Sources**: milvus (`pending_queue.go:160`), victoriametrics (`fastqueue.go:18`), temporal (`rescheduler.go`), nats-server (`ipqueue.go:25-36`)

**Mechanism**: 
- milvus: Capacity-based eviction never releases last persisted message (`pending_queue.go:164-167 comment`)
- victoriametrics: Memory channel with file fallback, `maxInmemoryBlocks` limit
- temporal: Priority queues in rescheduler with no visible upper bound (identified gap)
- nats-server: `ipQueue` with in-progress counter prevents overflow

**When to use**: Any pipeline processing faster than downstream can consume.

**Risk**: milvus note: "May lose messages if consumer falls too far behind" (`pending_queue.go:164-167 comment`). temporal identified gap: unbounded rescheduler could grow indefinitely.

### Pattern 3: Exponential Backoff Retry

**Problem**: Transient failures should be retried with increasing delays to avoid overwhelming failing services.

**Sources**: kubernetes (`pv_controller_base.go:524`), milvus (`wal_adaptor.go:258-291`), grafana (`retryer.go:18-47`), nats-server (implicit via slow-consumer)

**Mechanism**:
- milvus: 10ms initial, 5s max interval, stops on `ErrFenced` or context cancellation
- grafana: Caps at `maxDelay`, stops after `maxRetries`
- kubernetes: `AddRateLimited()` respects rate limiter before re-adding

**When to use**: When downstream services have transient failures that recover.

**Risk**: Backoff delays can cascade into perceived timeouts for end users. Max intervals must be tuned to SLA requirements.

### Pattern 4: Partial Failure Preservation with Deferred Error

**Problem**: When a batch fails mid-processing, previously successful items should be returned, not discarded.

**Sources**: openfga (`pipeline.go:445-449`), kubernetes (`controller.go:741-748`), temporal (`executable.go:503-584`)

**Mechanism**:
- openfga: Buffered values drained before error returned (`pipeline.go:445-449`)
- kubernetes: `SuccessfulIndices` callbacks execute on transaction failure (`controller.go:741-748`)
- temporal: Error classification determines retry vs. DLQ vs. drop

**When to use**: When batches contain independent items where partial success has value.

**Risk**: Requires idempotent operations if retrying failed items. Non-idempotent operations need DLQ rather than retry.

### Pattern 5: Dead Letter Queue for Unrecoverable Items

**Problem**: Some failures are not retryable; these items should be preserved for manual inspection rather than dropped.

**Sources**: temporal (`dlq_writer.go:64-143`), victoriametrics (`skipBrokenChunkFile` recovery at `persistentqueue.go:516`)

**Mechanism**: temporal uses per-queue-key DLQ with mutex-protected writes (`dlq_writer.go:89-91`). victoriametrics recovers corrupt chunks by skipping to next valid chunk.

**When to use**: When data loss is unacceptable and failures are not always transient.

**Risk**: DLQ can grow unbounded if root cause is not fixed. Requires operational monitoring.

### Pattern 6: Opaque Messages with Auth-Based Trust

**Problem**: Schema validation at ingestion adds latency; some systems treat messages as opaque bytes.

**Sources**: nats-server (`client.go:4300-4307`), openfga (tuple validation at write boundary only)

**Mechanism**: nats-server trusts messages based on authentication (CONNECT protocol) and authorization (permissions). No per-message content validation. openfga validates at write boundary but treats tuples as opaque during resolution.

**When to use**: Low-latency use cases where publishers are trusted (e.g., internal services).

**Risk**: Bad data propagates through entire pipeline. Only appropriate when publisher trust is established.

### Pattern 7: Streaming Pagination

**Problem**: Large result sets can cause OOM if loaded entirely into memory.

**Sources**: cli (`pagination.go:114`), grafana (`runner.go:176-205`), kubernetes (informer with DeltaFIFO), victoriametrics (stream parsing)

**Mechanism**: cli uses `paginatedArrayReader` streaming JSON arrays without full buffering. grafana uses schema caching with incremental frame transmission. victoriametrics uses concurrent stream parsing with bounded chunks.

**When to use**: Any API that can return large result sets.

**Risk**: Streaming adds code complexity. Must handle partial records at buffer boundaries.

## Key Differences

### Validation Distribution

| Model | Sources | Rationale |
|-------|---------|-----------|
| Concentrated at ingestion | openfga, pocketbase | Simpler storage; CPU cost at write time |
| Distributed per-stage | kubernetes, grafana, milvus | Fail early; avoid polluting downstream |
| Opaque (no content validation) | nats-server, cli | Lowest latency; requires trusted publishers |

kubernetes distributes validation via two-phase admission before storage. openfga concentrates validation at the write boundary before storage. nats-server performs no content validation whatsoever.

### Failure Handling Strategy

| Strategy | Sources | When Appropriate |
|----------|---------|------------------|
| All-or-nothing transaction | pocketbase, kubernetes (TransactionStore) | Items are interdependent |
| Best-effort with error accumulation | cli, openfga | Items are independent |
| DLQ with retry | temporal, victoriametrics (corrupt chunks) | Failures are transient or need manual inspection |
| Slow-consumer close | nats-server | Consumer cannot keep up |

pocketbase rolls back entire batch on any failure. temporal routes failures to DLQ based on error classification. cli accumulates errors but continues processing.

### Memory Management

| Approach | Sources | Tradeoff |
|----------|---------|----------|
| Pooled fixed-size buffers | nats-server | Low GC pressure; may waste memory on small messages |
| Capacity-based eviction | milvus | Preserves recent data; may lose old data |
| Memory-first with file fallback | victoriametrics | Fast under normal conditions; graceful degradation |
| Unbounded with backpressure | temporal (rescheduler gap) | Simple; risk of OOM |

nats-server uses `sync.Pool` with 512/4096/65536 byte pools. victoriametrics uses FastQueue that falls back to disk. milvus evicts based on capacity but never loses the last persisted message.

### Backpressure Signaling

| Mechanism | Sources | Evidence |
|-----------|---------|----------|
| HTTP 503/429 response | victoriametrics | `ErrQueueFullHTTPRetry` at `remotewrite.go:113` |
| Slow-consumer close | nats-server | `c.out.pb > c.out.mp` at `client.go:2513` |
| Capacity-based rejection | milvus | `IsRejected()` at `wal_adaptor.go:165-168` |
| Reader rate limiting | temporal | `ratelimiter` at `reader.go:66` |
| Flush interval batching | grafana, victoriametrics | 15s Loki flush; 1s remote write flush |

victoriametrics returns HTTP 429 when queue is full. nats-server closes connections when pending bytes exceed limit. kubernetes uses rate-limited work queues but doesn't signal backpressure to API callers.

## Tradeoffs

### Validation Timing: Early vs. Late

**Benefit of early (distributed)**: Bad data fails fast, doesn't consume downstream resources.

**Cost of early**: Validation latency added at ingestion; code complexity in stage implementations.

**Benefit of late (concentrated)**: Simpler pipeline; lower ingestion latency; storage only receives valid data.

**Cost of late**: Invalid data consumes resources until it reaches validation stage.

**Sources demonstrating**: kubernetes (early via admission), openfga (late via write boundary validation).

### Batching: Small-Frequent vs. Large-Infrequent

**Benefit of small-frequent**: Lower latency per item; faster detection of failures.

**Cost of small-frequent**: Higher per-item overhead; more network round trips.

**Benefit of large-infrequent**: Higher throughput; better compression ratios.

**Cost of large-infrequent**: Higher latency; more data at risk on failure.

**Sources demonstrating**: grafana 15s Loki flush (infrequent) vs. victoriametrics 1s flush (frequent). nats-server pending flush list batches deliveries (small-frequent).

### Pipeline Architecture: Monolithic vs. Composed

**Benefit of monolithic (single process)**: Simpler operations; no network overhead between stages; atomic transactions.

**Cost of monolithic**: Cannot independently scale or deploy stages; one process crash kills entire pipeline.

**Benefit of composed (stages as services)**: Independent scaling; fault isolation; polyglot stages.

**Cost of composed**: Network latency between stages; distributed transactions harder; operational complexity.

**Sources demonstrating**: All sources are monolithic at pipeline level. kubernetes admission plugins compile into API server. grafana pipeline runs in single Go process. victoriametrics cluster mode (`vminsert`/`vmselect`/`vmstorage`) provides some separation but protocol handlers still tightly coupled.

### Data Durability: Memory vs. Disk

**Benefit of memory-first**: Lower latency; better throughput under normal conditions.

**Cost of memory-first**: Data loss on crash; bounded by RAM.

**Benefit of disk-persisted**: Durability; larger capacity.

**Cost of disk-persisted**: Higher latency; operational complexity.

**Sources demonstrating**: nats-server in-memory delivery (JetStream optional). victoriametrics FastQueue memory-first with file fallback. kubernetes etcd is disk-persisted.

## Decision Guide

### When to Use Write-Ahead Logging (milvus, nats-server)

Choose WAL-based architecture when:
- Event ordering is critical (every read must see latest state)
- At-least-once delivery is acceptable (下游 must dedupe)
- You need efficient point-in-time recovery
- Horizontal scaling via channel sharding is required

Avoid when:
- You need to update historical records (WAL is append-only)
- Random access patterns dominate (WAL requires reconstruction)
- Latency is more important than durability

### When to Use Task Queues (temporal)

Choose task queue architecture when:
- Work items are generated from state transitions (workflows)
- You need granular retry/DLQ per item type
- Task categories have different processing requirements
- You want built-in retry with backoff

Avoid when:
- You need sub-millisecond latency (queue overhead)
- Items are not independently schedulable
- You want to avoid额外的 operational complexity

### When to Use Streaming Pipelines (victoriametrics, grafana)

Choose streaming pipeline when:
- High-volume continuous ingestion (metrics, events)
- Protocol normalization is needed (multiple input formats)
- You need concurrent processing of streams

Avoid when:
- Latency-sensitive responses required (streaming adds buffering)
- Data size is small (streaming overhead not justified)

### When to Skip Schema Validation (nats-server)

Choose opaque messages when:
- Publishers are trusted (internal services)
- Latency is critical
- Schema evolution is handled at publisher level
- You have out-of-band validation (e.g., separate audit pipeline)

Avoid when:
- Multiple untrusted publishers contribute data
- Data quality problems cause downstream failures
- Regulatory requirements mandate input validation

## Practical Tips

### Building a Robust Pipeline

1. **Add validation at entry points**: Reject invalid data early with clear error messages. kubernetes admission chain (`admission.go:76-82`) is exemplar.

2. **Use bounded queues with eviction policies**: Don't let queues grow unbounded. milvus capacity-based eviction (`pending_queue.go:160`) is a good model.

3. **Implement backpressure signaling**: Return 503 or 429 when queues are saturated. victoriametrics does this (`remotewrite.go:113`).

4. **Classify errors and handle accordingly**: Invalid任务是drop vs. retryable is retry vs. terminal is DLQ. temporal's `HandleErr()` (`executable.go:503-584`) is the clearest example.

5. **Use ULID or monotonic timestamps for ordering**: openfga uses ULID for distributed monotonic ordering without coordination (`pkg/storage/record.go:16-29`).

6. **Pool fixed-size buffers**: Reduce GC pressure. nats-server pooled buffers (512/4096/65536) at `ipqueue.go:364-367` is exemplary.

7. **Add observability per stage**: victoriametrics emits `vm_rows_ignored_total{reason}` metrics (`timeseries_limits.go:98-100`). kubernetes uses operation timestamps (`pv_controller_base.go:99`).

### Patterns to Delay Until Needed

- **Pluggable stage architecture**: Useful for multi-tenant or highly configurable systems. grafana's `ChannelRuleSettings` (`config.go:22-35`) adds complexity; not needed for single-purpose pipelines.
- **Distributed pipeline stages**: Increases operational complexity significantly. kubernetes admission plugins compile into API server for a reason.
- **Adaptive batching**: victoriametrics's `stream_batcher` with `MaxItems`/`MaxDelay` is useful but adds tuning requirements.

### Performance Quick Wins

- **Use `net.Buffers` for zero-copy delivery**: nats-server uses scatter/gather I/O (`client.go:1636-1859`).
- **Stream large result sets**: cli `paginatedArrayReader` avoids loading full arrays (`pagination.go:114`).
- **Limit concurrent goroutines**: victoriametrics `maxConcurrentInserts` (default 2×CPUs) at `concurrencylimiter.go:19`.

## Anti-Patterns / Caution Signs

### Pipeline Brittleness Indicators

1. **No error classification**: cli accumulates errors but treats all failures identically (`secret/set/set.go:298-321`). Temporal's classification (invalid/retryable/terminal) is superior.

2. **Unbounded queues**: temporal's rescheduler has no visible memory limit (`rescheduler.go`). Could grow indefinitely under sustained failures.

3. **No backpressure mechanism**: cli has no backpressure for large batch operations. PocketBase reads entire batch into memory (`e.BindBody` at `batch.go:118`).

4. **All-or-nothing without isolation**: PocketBase atomic batch rolls back entire batch on any failure (`batch.go:192`). Cannot extract partial results.

5. **Tightly coupled stages**: All sources show stages within single process. kubernetes admission plugins compile into binary (`admission.go:59`). OpenFGA workers are goroutines (`pipeline.go:399-410`).

### Operational Warning Signs

1. **Memory grows without bound**: Check for unbounded queue growth (temporal rescheduler, PocketBase batch).
2. **No visibility into stage health**: Most sources lack per-stage metrics; relies on aggregate metrics.
3. **Single-point-of-failure**: PocketBase single binary; kubernetes admission chain within single process.
4. **No DLQ**: cli, grafana, pocketbase, openfga have no DLQ mechanism for failed items.
5. **No retry backoff**: openfga has no retry logic on transient storage failures (`questions/gaps` section).

## Notable Absences

### No Independent Stage Deployment

Every source runs pipeline stages within a single process. Evidence:
- kubernetes: Admission plugins compile into kube-apiserver (`admission.go:59`)
- grafana: Pipeline runs in single Go process (`live/pipeline/` package)
- openfga: Workers are goroutines, not separate services (`pipeline.go:399-410`)
- victoriametrics: Protocol handlers tightly coupled within vmagent

### No Per-Stage Distributed Tracing

No source implements distributed tracing across pipeline stages. kubernetes uses `component-base/tracing` in etcd3 store but not end-to-end. openfga explicitly notes no correlation IDs or trace context propagation. grafana uses OpenTelemetry at `pipeline.go:31-53` but only for pipeline entry.

### No Schema Validation at Ingestion (Most Sources)

nats-server treats messages as opaque bytes. cli has no schema validation. openfga validates format but not content schema. kubernetes validates structure but not business rules. Only grafana (frame structure), milvus (field validators), and pocketbase (field `ValidateValue`) have field-level validation.

### No Per-Stage Backpressure (Most Sources)

victoriametrics is the only source with explicit HTTP-level backpressure (503/429). nats-server has slow-consumer detection but closes connections rather than signaling flow control. kubernetes has no backpressure from admission to storage. grafana has no backpressure mechanism for slow subscribers.

## Per-Source Notes

### cli

The CLI demonstrates that simple tools can have sophisticated input validation (args.go, json_flags.go) without needing full pipeline frameworks. Its streaming pagination (`paginatedArrayReader`) is a gem for memory efficiency. However, goroutine fan-out without bounded queues (`secret/set/set.go:289-296`) is a anti-pattern for large batches.

### grafana

Grafana's pluggable stage architecture (`Pipeline` with DataOutputter/Converter/FrameProcessor/FrameOutputter interfaces) is the most configurable of all sources. Managed streams with schema caching (`runner.go:176-205`) reduce bandwidth for stable schemas. Gaps: no DLQ, no per-stage backpressure, 15s Loki flush interval is a tradeoff between efficiency and data freshness.

### kubernetes

The gold standard for validation layering: two-phase admission (mutating then validating) ensures defaults are applied before policy checks. `GuaranteedUpdate` with optimistic concurrency avoids distributed locks. `TransactionStore` with fallback to individual processing handles stores that don't support atomic batching. Gap: admission plugins compile into binary, preventing independent scaling.

### milvus

WAL as single source of truth provides excellent ordering guarantees. Channel-based sharding enables horizontal scaling. Interceptor pattern (`timetick_interceptor.go:37`, `wab.WriteAheadBuffer`) allows layered functionality without modifying core. Gap: `SchemaVersion` not carried in `InsertMessageHeader` can cause deadlock (documented in TODO at `task_insert_streaming.go:24-28`).

### nats-server

State-machine parser (`parser.go:57-135`) is the most efficient protocol handling observed. Zero-copy delivery via `net.Buffers` and pooled buffers minimize memory operations. Slow-consumer detection via pending bytes limit is production-hardened. Gaps: no schema validation, no per-stage backpressure, per-client goroutine model limits scale.

### openfga

Write-ahead validation ensures storage only receives well-formed data. Goroutine-based workers with buffered channels provide concurrency without external queues. ULID for all temporal data enables distributed monotonic ordering. Gaps: no retry on transient failures, no resumeable pipelines, no per-stage observability.

### pocketbase

Form object pattern (`forms/record_upsert.go`) keeps validation logic co-located with data structure. Field interceptor pattern (`core/field.go:169-185`) enables extensible per-field behavior. Dual DB pools (concurrent/nonconcurrent) minimize `SQLITE_BUSY` errors. Gaps: no batching for bulk operations, no DLQ, no backpressure, atomic batch rolls back entirely.

### temporal

Error classification (invalid/safe-to-drop/retryable/terminal) is the most sophisticated failure handling observed. Per-queue DLQ with metrics enables operational monitoring. `stream_batcher` with configurable MaxItems/MaxDelay provides tuning flexibility. Gaps: no independent stage scaling, rescheduler unbounded, DLQ writes are synchronous (could block).

### victoriametrics

Memory-first persistent queue with file fallback is the best OOM protection observed. Token-based concurrency control (`concurrencylimiter.go:42-68`) provides fair FIFO ordering. Protocol adapter pattern normalizes all inputs to internal format. Relabeling as first-class feature enables powerful transformation. Gaps: no per-stage observability, protocol handlers tightly coupled, inline parsing limits extensibility.

## Open Questions

1. **How do systems recover from DLQ exhaustion?** temporal's DLQ has no visible size limits; what happens when DLQ itself becomes overloaded?

2. **Why do most systems lack per-stage observability?** Only victoriametrics and grafana emit granular metrics; kubernetes, openfga, temporal rely on aggregate metrics.

3. **Is independent stage deployment worth the complexity?** All sources chose monolithic pipelines despite the scaling limitation. Is the operational cost of distributed stages too high?

4. **How should schema evolution be handled at ingestion?** Most systems validate schema at write time but don't track schema version across pipeline stages.

5. **What's the right backpressure model for push-based systems?** grafana push handlers, nats-server, and milvus all lack producer-side backpressure signaling.

## Evidence Index

- `pkg/cmdutil/json_flags.go:225-257` — cli JSON export pipeline
- `pkg/cmdutil/file_input.go:8-16` — cli file input entry
- `pkg/cmd/secret/set/set.go:289-296` — cli goroutine fan-out
- `pkg/cmd/api/pagination.go:114` — cli streaming pagination
- `pkg/cmd/api/pagination.go:17-24` — cli Link header parsing
- `pkg/services/live/pipeline/pipeline.go:82-107` — grafana pipeline interfaces
- `pkg/services/live/pipeline/config.go:22-35` — grafana ChannelRuleSettings
- `pkg/services/live/managedstream/runner.go:176-205` — grafana schema caching
- `pkg/components/loki/lokihttp/batch.go:20-39` — grafana Loki batch struct
- `pkg/services/live/pipeline/pipeline.go:31-53` — grafana OpenTelemetry tracing
- `pkg/registry/core/pod/strategy.go:86-118` — kubernetes validation pipeline
- `pkg/registry/core/pod/strategy.go:59-67` — kubernetes strategy pattern
- `staging/src/k8s.io/apiserver/pkg/registry/generic/registry/store.go:709-865` — kubernetes GuaranteedUpdate
- `staging/src/k8s.io/client-go/util/workqueue/queue.go:190-222` — kubernetes work queue
- `staging/src/k8s.io/client-go/tools/cache/controller.go:739-749` — kubernetes TransactionStore batch
- `staging/src/k8s.io/apiserver/pkg/storage/cacher/cacher.go:80-150` — kubernetes cache layer
- `internal/proxy/task_insert.go:121-126` — milvus MaxInsertSize
- `internal/proxy/task_insert_streaming.go:77-88` — milvus WAL append
- `internal/proxy/validate_util.go:108-200` — milvus field validators
- `internal/streamingnode/server/wal/interceptors/wab/write_ahead_buffer.go:26-91` — milvus WAL buffer
- `internal/streamingnode/server/wal/interceptors/wab/pending_queue.go:160` — milvus capacity eviction
- `internal/streamingnode/server/wal/adaptor/wal_adaptor.go:258-291` — milvus backoff retry
- `internal/streamingnode/server/wal/adaptor/wal_adaptor.go:165-168` — milvus rate limiting
- `docs/agent_guides/streaming-system/streaming-system.md:7` — milvus WAL architecture
- `server/client.go:1377-1617` — nats-server readLoop
- `server/parser.go:57-135` — nats-server state-machine parser
- `server/client.go:2513-2539` — nats-server slow-consumer detection
- `server/client.go:1636-1859` — nats-server zero-copy delivery
- `server/ipqueue.go:364-367` — nats-server pooled buffers
- `server/jetstream.go:1550-1620` — nats-server batch recovery
- `server/jetstream_batching.go:274-317` — nats-server flow control
- `pkg/server/commands/write.go:149` — openfga tuple validation
- `internal/validation/validation.go:37-44` — openfga ValidateTupleForWrite
- `internal/listobjects/pipeline/pipeline.go:121-131` — openfga pipeline struct
- `internal/listobjects/pipeline/pipeline.go:399-410` — openfga worker execution
- `internal/listobjects/pipeline/pipeline.go:445-449` — openfga buffered drain
- `pkg/storage/record.go:16-29` — openfga TupleRecord ULID
- `pkg/server/commands/write.go:105` — openfga transactional write failure
- `apis/batch.go:192` — pocketbase atomic batch transaction
- `apis/batch.go:235-273` — pocketbase recursive processor
- `core/record_model.go:1413-1427` — pocketbase field validation
- `forms/record_upsert.go:23-34` — pocketbase form object
- `core/db_tx.go:14-16` — pocketbase RunInTransaction
- `service/history/tasks/category.go:20-27` — temporal task categories
- `service/history/queues/executable.go:503-584` — temporal error classification
- `service/history/queues/dlq_writer.go:64-143` — temporal DLQ writer
- `service/history/queues/dlq_writer.go:71-76` — temporal DLQ per queue key
- `common/stream_batcher/batcher.go:31-43` — temporal stream batcher
- `service/history/replication/task_processor.go:257-281` — temporal DLQ routing
- `service/history/queues/rescheduler.go:33-46` — temporal rescheduler
- `app/vmagent/main.go:251` — victoriametrics request routing
- `lib/protoparser/influx/stream/streamparser.go:36` — victoriametrics stream parsing
- `lib/writeconcurrencylimiter/concurrencylimiter.go:106` — victoriametrics concurrency limiter
- `lib/writeconcurrencylimiter/concurrencylimiter.go:128` — victoriametrics backpressure timeout
- `lib/timeserieslimits/timeseries_limits.go:115` — victoriametrics series limits
- `app/vmagent/remotewrite/pendingseries.go:236` — victoriametrics pending series
- `app/vmagent/remotewrite/pendingseries.go:74-98` — victoriametrics periodic flusher
- `lib/persistentqueue/fastqueue.go:18` — victoriametrics FastQueue
- `app/vmagent/remotewrite/remotewrite.go:113` — victoriametrics ErrQueueFull
- `lib/persistentqueue/persistentqueue.go:516` — victoriametrics corrupt chunk recovery
- `lib/storage/partition.go:46` — victoriametrics partition shards

---

Generated by dimension `07-data-ingestion-processing-pipelines.md`.
