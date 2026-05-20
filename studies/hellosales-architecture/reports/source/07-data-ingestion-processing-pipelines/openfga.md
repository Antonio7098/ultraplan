# Source Analysis: openfga

## Data Ingestion & Processing Pipelines

### Source Info

| Field | Value |
|-------|-------|
| Name | openfga |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/openfga` |
| Language / Stack | Go (gRPC/HTTP server) |
| Analyzed | 2026-05-20 |

## Summary

OpenFGA is a high-performance Relationship-Based Access Control (ReBAC) authorization engine. Its data ingestion and processing pipelines handle authorization tuples and models through well-defined stages: HTTP/gRPC ingestion → middleware validation → command execution → storage. The system employs a layered architecture with clear separation between transport, business logic, and storage. Tuple writes are validated, normalized to `TupleRecord`, and stored transactionally with changelog recording. Graph-based authorization queries (Check, ListObjects) flow through resolver chains with caching, throttling, and concurrency controls. The ListObjects pipeline is a notable concurrent worker-based implementation using buffered channels with configurable batching (default 100 tuples/chunk, 128 buffer capacity, 3 goroutines).

## Rating

**7/10** — Good implementation with minor issues. Strong validation pipeline, configurable batching, and concurrency controls. Pipeline workers are well-structured. Gaps: no visible per-stage data quality metrics; pipeline stages (ListObjects) are not independently deployable; error handling in pipeline workers accumulates errors but doesn't distinguish transient vs permanent failures.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Ingestion entry point | `NewRunCommand()` defines all CLI flags including datastore, HTTP/gRPC config | `cmd/run/run.go:127` |
| Write flow | `WriteCommand.Execute()` validates then calls `datastore.Write()` | `pkg/server/commands/write.go:81-115` |
| Tuple validation | `ValidateTupleForWrite()` validates against TypeSystem | `internal/validation/validation.go:37-44` |
| Type restriction validation | `validateTypeRestrictions()` checks allowed types per relation | `internal/validation/validation.go:130-176` |
| Condition validation | `validateCondition()` validates CEL conditions and context | `internal/validation/validation.go:180-276` |
| Storage interface | `OpenFGADatastore` interface combines TupleBackend, AuthModelBackend, etc. | `pkg/storage/storage.go:407-421` |
| Tuple write contract | `Write()` deletes first, then writes; writes to changelog | `pkg/storage/storage.go:280` |
| Max tuples per write | `DefaultMaxTuplesPerWrite = 100` enforced | `pkg/storage/storage.go:17` |
| TupleRecord normalization | `TupleRecord` struct stores normalized tuple with ULID and timestamp | `pkg/storage/record.go:16-29` |
| ListObjects pipeline | `Pipeline` struct with workers map, error accumulator, buffered output | `internal/listobjects/pipeline/pipeline.go:121-131` |
| Pipeline config defaults | `defaultBufferSize=128`, `defaultChunkSize=100`, `defaultNumProcs=3` | `internal/listobjects/pipeline/pipeline.go:57-61` |
| Pipeline builder | `Builder.Build()` constructs workers from graph nodes | `internal/listobjects/pipeline/pipeline.go:237-420` |
| Worker execution | Workers run in goroutines with error accumulation via `mpsc.Accumulator` | `internal/listobjects/pipeline/pipeline.go:399-410` |
| Pipeline error handling | `Recv()` drains buffered values before checking errors; `Err()` returns first error | `internal/listobjects/pipeline/pipeline.go:432-477` |
| BatchCheck command | `NewBatchCheckCommand()` with configurable concurrency and throttling | `pkg/server/commands/batch_check_command.go` |
| Datastore throttling | `CheckDatastoreThrottle.Threshold` and `Duration` configurable | `cmd/run/run.go:358-360` |
| Check resolver chain | Circular linked list resolver chain with optional caching and throttling | `internal/graph/builder.go:66-106` |
| TypeSystem creation | `TypeSystem` struct with typeDefinitions, relations, conditions, computed relations | `pkg/typesystem/typesystem.go:169-185` |
| Model validation | `NewAndValidate()` validates schema version, duplicate types, relation rewrites | `pkg/typesystem/typesystem.go:1127-1184` |
| Iterator pattern | `TupleIterator` interface for streaming tuple reads | `pkg/storage/storage.go:150-212` |
| Paginated reads | `ReadPage()` returns tuples with continuation token (ULID-based) | `pkg/storage/storage.go:166` |

## Answers to Dimension Questions

### 1. How does raw data become trustworthy structured data?

Raw tuple data (`object#relation@user` string format) enters via gRPC/HTTP `Write` API (`pkg/server/write.go:22`) and passes through:

1. **Proto validation** — `req.Validate()` at `pkg/server/batch_check.go:34`
2. **TypeSystem resolution** — model loaded from datastore, cached (`pkg/server/write.go:43-47`)
3. **Tuple validation** — `validation.ValidateTupleForWrite(typesys, tk)` (`pkg/server/commands/write.go:149`)
   - `ValidateUserObjectRelation` checks user, object, relation format (`validation.go:18-32`)
   - `validateTuplesetRestrictions` prevents invalid userset assignments (`validation.go:83-124`)
   - `validateTypeRestrictions` enforces type allowed lists (`validation.go:130-176`)
   - `validateCondition` compiles and validates CEL conditions (`validation.go:180-276`)
4. **Implicit tuple prevention** — `validateNotImplicit()` at `pkg/server/commands/write.go:217-229` prevents self-referential tuples
5. **Normalize to TupleRecord** — `pkg/storage/record.go:16-29` stores with ULID, timestamps, decomposed fields
6. **Transactional write** — deletes applied first, then writes; changelog updated (`pkg/storage/storage.go:280`)

### 2. What happens when a pipeline stage fails mid-batch?

For **Write operations**: The `datastore.Write()` is transactional (`pkg/storage/storage.go:280`) — if deletes succeed but writes fail, the transaction rolls back. Concurrent write conflicts return `ErrTransactionalWriteFailed` (`pkg/server/commands/write.go:105`).

For **ListObjects pipeline** (`internal/listobjects/pipeline/pipeline.go`): Each worker runs in a goroutine (`pipeline.go:399-410`). Errors are collected via `mpsc.Accumulator[error]` (`pipeline.go:124`). In `Recv()`, when an error is received (`pipeline.go:453-458`), the pipeline is closed and the error stored. **Buffered values produced before the error are still drained** (`pipeline.go:445-449`) before the error is returned, ensuring partial results are preserved. However, there is **no way to resume** a failed pipeline — the caller must restart from scratch.

For **BatchCheck**: Individual check failures don't fail the entire batch. Each `BatchCheckOutcome` carries its own error (`transformCheckResultToProto` at `pkg/server/batch_check.go:148-162`).

### 3. How is data quality validated at each pipeline stage?

Validation is concentrated at the **Write boundary** rather than distributed across pipeline stages:

- **Write boundary validation** (`validation.ValidateTupleForWrite` at `internal/validation/validation.go:37-44`):
  - Format validation (user, object, relation strings)
  - Type restriction enforcement per relation
  - Tupleset restriction enforcement (no userset assignment to tupleset relations)
  - Condition compilation and context validation
  - Condition context size limit check (`pkg/server/commands/write.go:159-165`, default 32KB)
  - No implicit (self-referential) tuples (`pkg/server/commands/write.go:217-229`)
  - No duplicates in same request (`pkg/server/commands/write.go:181-183`)

- **Authorization model validation** occurs on model write via `typesystem.NewAndValidate()` (`pkg/typesystem/typesystem.go:1127-1184`):
  - Schema version check
  - No duplicate type definitions
  - Valid relation names (no "self"/"this")
  - Type restriction validation for each relation
  - Condition compilation with max evaluation cost

**Gap**: There is no visible **per-stage data quality observability** — no metrics or logs specifically tracking validation failure rates per stage. The system relies on request-time validation errors rather than ambient data quality monitoring.

### 4. How does the pipeline scale with data volume without OOM?

**Batching limits**:
- `DefaultMaxTuplesPerWrite = 100` (`pkg/storage/storage.go:17`) — hard cap on write batch size
- `defaultChunkSize = 100` (`internal/listobjects/pipeline/pipeline.go:59`) — pipeline chunk size
- `defaultBufferSize = 128` (`internal/listobjects/pipeline/pipeline.go:58`) — channel buffer per worker connection
- Pagination via ULID-based continuation tokens prevents unbounded result sets

**Concurrency controls**:
- `MaxConcurrentChecksPerBatchCheck` limit (`cmd/run/run.go:261`)
- `ResolveNodeBreadthLimit` for concurrent graph traversal (`cmd/run/run.go:283`)
- `ResolveNodeLimit` for max recursion depth (`cmd/run/run.go:281`)
- `MaxConcurrentReadsForCheck` datastore connection limit (`cmd/run/run.go:275`)
- Datastore connection pooling: `MaxOpenConns`, `MinIdleConns`, `MaxIdleConns` (`cmd/run/run.go:213-219`)

**Memory management**:
- Iterator-based tuple reads (`TupleIterator` interface) rather than loading all tuples in memory (`pkg/storage/storage.go:160`)
- Message pooling for pipeline workers (`worker.InitMessagePool` at `internal/listobjects/pipeline/pipeline.go:366`)
- `checkIteratorCache` and `listObjectsIteratorCache` limit cached tuples per key (`cmd/run/run.go:303-313`)

**No OOM protection**: There is no memory pressure detection or adaptive backpressure. Under extreme write volume, the system relies on connection pool exhaustion and request-level limits.

### 5. Can pipeline stages be independently deployed or scaled?

**No.** Pipeline stages are tightly coupled:

- The **ListObjects pipeline** (`internal/listobjects/pipeline/`) is built into the `ListObjectsQuery` command (`pkg/server/commands/list_objects.go`) with direct datastore access
- Workers are goroutines within a single process, not separate services or containers
- No service mesh or message queue decoupling — workers communicate via buffered Go channels
- The **resolver chain** (`internal/graph/builder.go`) is circular and composed at startup, not dynamically configurable per-request

**What can be scaled independently**:
- **Datastore** — multiple backend implementations (Postgres, MySQL, SQLite, Memory) via storage interface
- **Check resolver caching** — `CachedCheckResolver` can be enabled/disabled at startup (`internal/graph/cached_resolver.go`)
- **Dispatch throttling** — `DispatchThrottlingCheckResolver` can be enabled (`internal/graph/dispatch_throttling_check_resolver.go`)

## Architectural Decisions

1. **Write-ahead validation** — All tuple validation occurs before storage writes, ensuring the datastore only receives well-formed data. This simplifies storage implementations but concentrates CPU cost at ingestion.

2. **Transactional writes with changelog** — Every write modifies both the tuple store and a changelog table (`pkg/storage/storage.go:280`), enabling eventual consistency and cache invalidation without external messaging.

3. **TypeSystem as central validation authority** — The `TypeSystem` (`pkg/typesystem/typesystem.go:169-185`) is created per-request from stored authorization models, caching compiled conditions and relation metadata to avoid repeated deserialization.

4. **Pipeline workers as goroutines** — ListObjects uses Go's concurrency primitives (goroutines, channels) rather than external queue systems. This keeps the pipeline in-memory but couples it to the process lifecycle.

5. **Circular resolver chain** — Check resolvers form a circular linked list (`internal/graph/builder.go:66-106`) where the last resolver delegates back to the first, allowing optional middleware layers (caching, throttling) to wrap core resolution without modifying the core.

6. **ULID for all temporal data** — Tuples, continuation tokens, and changelog entries all use ULID, providing monotonic timestamps without centralized coordination.

## Notable Patterns

1. **Iterator pattern for streaming reads** — `TupleIterator` interface (`pkg/storage/storage.go:150-160`) allows storage backends to stream results without loading entire result sets.

2. **Message pool for pipeline workers** — `worker.MessagePool` (`internal/listobjects/pipeline/pipeline.go:271`) reuses message objects across workers to reduce allocations.

3. **Cycle detection via membership tracking** — Pipeline workers use `worker.Membership` (`internal/listobjects/pipeline/internal/worker/core.go`) to track concurrent entry/exit for cycle detection without global locks.

4. **Deferred error accumulation** — Pipeline errors accumulate in `mpsc.Accumulator` (`internal/listobjects/pipeline/pipeline.go:124`) and are only retrieved when the output is exhausted, allowing buffered results to be drained first.

5. **Option-based configuration** — Builder pattern with functional options (`WithBufferCapacity`, `WithChunkSize`, `WithNumProcs`) allows runtime tuning without struct modification.

6. **Weighted graph for query optimization** — `WeightedAuthorizationModelGraph` (`pkg/typesystem/weighted_graph.go`) computes optimal resolution paths using Thompson sampling, minimizing graph traversals.

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| Validation at write time | Ensures datastore integrity but CPU cost is concentrated at ingestion; read-path queries are cheaper |
| Go channels for pipeline | Low-latency in-memory communication but limits pipeline to single-process; no distributed tracing across workers |
| ULID for timestamps | Provides distributed monotonic ordering but 128-bit IDs increase storage footprint vs 64-bit |
| Circular resolver chain | Allows optional middleware layers but makes debugging cycle references harder |
| Iterator-based reads | Memory-efficient but requires caller to manage iterator lifecycle and exhaustion |
| Changelog per write | Enables cache invalidation and eventual consistency but doubles write throughput cost |

## Failure Modes / Edge Cases

1. **Malformed tuple strings** — e.g., `doc:budget#reader@person:` (missing ID) fail at proto validation before reaching business logic.

2. **Concurrent writes to same tuple** — `datastore.Write()` returns `ErrTransactionalWriteFailed` (`pkg/server/commands/write.go:105`), requiring retry logic in caller.

3. **Pipeline worker panic** — Recovered via `concurrency.RecoverFromPanic()` (`internal/listobjects/pipeline/pipeline.go:407`) and sent to error accumulator; pipeline closes but partial results may have been emitted.

4. **TypeSystem cache miss mid-request** — If model is not cached, loaded from datastore which adds latency; concurrent requests may contend on model cache.

5. **Condition evaluation cost exceeds limit** — `MaxConditionEvaluationCost` (`cmd/run/run.go:277`) causes early termination with error, preventing runaway CEL evaluation.

6. **Depth explosion** — `ResolveNodeLimit` (`cmd/run/run.go:281`) caps recursion depth but does not prevent wide fan-out from complex models with many intersections.

7. **Continuation token exhaustion** — If ULID-based pagination token is corrupted, `sqlcommon.NewSQLContinuationTokenSerializer` may fail to decode, causing read failures.

8. **Context cancellation during pipeline** — `Recv()` returns `("", false)` without closing when context is cancelled (`pipeline.go:438-440`), leaving cleanup responsibility to caller.

## Future Considerations

1. **Distributed pipeline workers** — Move ListObjects workers to separate services with message queue (e.g., NATS, Kafka) for independent scaling.

2. **Per-stage data quality metrics** — Emit validation success/failure rates per stage to observability backend for proactive data quality monitoring.

3. **Adaptive batching** — Dynamically adjust chunk sizes based on memory pressure or latency feedback.

4. **Resumeable pipelines** — Allow failed pipeline execution to resume from last checkpoint rather than requiring full restart.

5. **Storage sharding** — Add sharding support to `OpenFGADatastore` to distribute tuple storage across multiple backends.

## Questions / Gaps

1. **No evidence found** for pipeline stage health checks or readiness probes beyond datastore `IsReady()`. The ListObjects pipeline has no external liveness indicator.

2. **No evidence found** for retry logic on transient storage failures (e.g., connection resets). Write failures propagate immediately as errors without retry/backoff.

3. **No evidence found** for per-stage latency SLO tracking. Resolution metadata includes dispatch count and datastore query count but not stage-level latencies.

4. **No evidence found** for pipeline cancellation timeout. If a worker goroutine hangs, there is no deadline-based forced termination.

5. **Unclear** whether the changelog compaction or retention policy is configurable. Large installations may accumulate unbounded changelog growth.

---

Generated by `dimensions/07-data-ingestion-processing-pipelines.md` against `openfga`.