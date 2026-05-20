# Source Analysis: Milvus

## Data Ingestion & Processing Pipelines

### Source Info

| Field | Value |
|-------|-------|
| Name | milvus |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/milvus` |
| Language / Stack | Go + C++ (internal/core/) + Rust (tantivy) |
| Analyzed | 2026-05-20 |

## Summary

Milvus implements a sophisticated multi-stage data ingestion pipeline centered around a log-structured WAL (Write-Ahead Log) as its single source of truth. Data flows through distinct stages: validation at the Proxy layer, transform via ID/timestamp allocation, enrichment through message building with headers, and persistent storage in the WAL backend. The pipeline employs channel-based sharding, time tick ordering, and a write-ahead buffer with capacity-based eviction for backpressure. Error handling spans validation errors, schema version mismatches, and recoverable WAL failures with exponential backoff retry. Observability is achieved through metrics at each pipeline stage.

## Rating

**8/10** — Good implementation with minor issues. The WAL-based streaming pipeline is well-architected with clear stage separation, proper backpressure mechanisms, and good observability. However, there are documented limitations (e.g., SchemaVersion not carried in InsertMessageHeader per comments at `internal/proxy/task_insert_streaming.go:24-28`) and the batch processing is somewhat implicit rather than explicitly configurable.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Ingestion Entry | Insert task struct with size checking | `internal/proxy/task_insert.go:24-41`, `task_insert.go:121-126` |
| Ingestion Entry | Streaming insert via WAL.AppendMessages | `internal/proxy/task_insert_streaming.go:77` |
| Ingestion Entry | Import task scheduler | `internal/datanode/importv2/scheduler.go:32-49` |
| Validation | validateUtil struct with configurable checks | `internal/proxy/validate_util.go:23-28`, `32-54` |
| Validation | Field validators (FloatVector, VarChar, Int, JSON) | `internal/proxy/validate_util.go:108-200` |
| Validation | Schema mismatch checking | `internal/proxy/task_insert.go:141-150` |
| Transform | RowID allocation via AllocAutoID | `internal/proxy/task_insert.go:167-186` |
| Transform | Timestamp assignment | `internal/proxy/task_insert.go:188-192` |
| Transform | Primary key checking and dynamic field checking | `internal/proxy/task_insert.go:201-229` |
| Enrichment | InsertMessageHeader with CollectionId, Partitions, SchemaVersion | `internal/proxy/task_insert_streaming.go:116-131` |
| Enrichment | Channel assignment by PK hash | `internal/proxy/task_insert_streaming.go:101` |
| Storage | WriteAheadBuffer with pending queue | `internal/streamingnode/server/wal/interceptors/wab/write_ahead_buffer.go:26-91` |
| Storage | Pending queue eviction based on capacity/keepalive | `internal/streamingnode/server/wal/interceptors/wab/pending_queue.go:82-186` |
| Batching | Insert size checking against MaxInsertSize | `internal/proxy/task_insert.go:121-126` |
| Batching | Delete batching by channel with maxSize limit | `internal/proxy/task_delete.go:157-213` |
| Batching | Import scheduler concurrent task execution | `internal/datanode/importv2/scheduler.go:90-106` |
| Backpressure | WriteAheadBuffer capacity-based eviction | `internal/streamingnode/server/wal/interceptors/wab/pending_queue.go:160` |
| Backpressure | Rate limiting rejection for DML operations | `internal/streamingnode/server/wal/adaptor/wal_adaptor.go:165-168` |
| Backpressure | Scanner backpressure via pending queue full condition | `internal/streamingnode/server/wal/adaptor/scanner_adaptor.go:250` |
| Error Handling | Schema version mismatch detection | `internal/proxy/task_insert_streaming.go:80-84` |
| Error Handling | WAL error codes (STREAMING_CODE_*) | `pkg/proto/streaming.proto:326-344` |
| Error Handling | Exponential backoff retry (10ms-5s) | `internal/streamingnode/server/wal/adaptor/wal_adaptor.go:258-291` |
| Error Handling | Unrecoverable error handling (ErrFenced, context cancellation) | `internal/streamingnode/server/wal/adaptor/wal_adaptor.go:276-278` |
| Observability | WriteAheadBufferMetrics tracking entries, size, time ticks | `internal/streamingnode/server/wal/metricsutil/wab.go:31-49` |
| Observability | TimeTick interceptor for timestamp allocation | `internal/streamingnode/server/wal/interceptors/timetick/timetick_interceptor.go:37-77` |
| Observability | Append rate counter with 10s sliding window | `internal/streamingnode/server/wal/adaptor/wal_adaptor.go:85` |
| Pipeline Flow | DML: Client → Proxy → StreamingClient.Append → StreamingNode → WAL | `docs/agent_guides/streaming-system/streaming-system.md:19` |
| Pipeline Flow | WAL Backend → RecoveryStorage (checkpoint) + Broadcaster ACK | `docs/agent_guides/streaming-system/streaming-system.md:23` |

## Answers to Dimension Questions

### 1. How does raw data become trustworthy structured data?

Raw data becomes trustworthy structured data through a multi-stage validation and transformation pipeline:

**Stage 1 - Schema Validation** (`internal/proxy/util.go:326-662`):
- `validateCollectionName()` at line 326 validates collection naming
- `validateFieldName()` at line 363 validates field names
- `validateDimension()` at line 397 validates vector dimensions
- `ValidateField()` at line 611 validates individual field schemas

**Stage 2 - Data Validation** (`internal/proxy/validate_util.go:108-200`):
- `validateUtil.Validate()` processes field data against schema
- Configurable validation options at lines 32-54: `withNANCheck()`, `withOverflowCheck()`, `withMaxLenCheck()`, `withMaxCapCheck()`
- Field-specific validators: `checkFloatVectorFieldData()` at line 849, `checkVarCharFieldData()` at line 926, `checkIntegerFieldData()` at line 1021

**Stage 3 - Transform** (`internal/proxy/task_insert.go:103-290`):
- RowID allocation via `common.AllocAutoID()` at line 171
- Timestamp assignment at lines 188-192
- Primary key checking via `checkPrimaryFieldData()` at line 223
- Dynamic field checking at line 202 via `checkDynamicFieldData()`

**Stage 4 - Enrichment** (`internal/proxy/task_insert_streaming.go:91-139`):
- Messages repacked with `InsertMessageHeader` containing CollectionId, Partitions, SchemaVersion
- Channel assignment by PK hash via `assignChannelsByPK()` at line 101
- Encryption config (CipherConfig) added at line 130

The pipeline enforces schema version consistency at `internal/proxy/task_insert.go:141-150`, rejecting writes when `schemaTimestamp != colInfo.updateTimestamp`.

### 2. What happens when a pipeline stage fails mid-batch?

**Proxy Layer Failures** (`internal/proxy/task_insert.go:115-150`):
- Collection schema mismatch returns `merr.WrapErrCollectionSchemaMisMatch()` at line 143
- Primary key validation errors returned at line 228
- Size exceeding `MaxInsertSize` returns `merr.WrapErrParameterTooLarge()` at line 125

**Streaming Layer Failures** (`internal/proxy/task_insert_streaming.go:77-88`):
- WAL append failure checked via `resp.UnwrapFirstError()`
- Schema version mismatch detected via `status.AsStreamingError(err).IsSchemaVersionMismatch()` at line 80
- Result status set accordingly at lines 81-84

**WAL Retry Logic** (`internal/streamingnode/server/wal/adaptor/wal_adaptor.go:258-291`):
- Exponential backoff: 10ms initial, 5s max interval
- Retries on recoverable errors
- Stops on `context.Canceled`, `context.DeadlineExceeded`, `walimpls.ErrFenced`

**Import Task Failures** (`internal/datanode/importv2/scheduler.go:96-103`):
- `conc.AwaitAll(fs...)` awaits all futures
- On error, continues processing other tasks (line 99: `continue`)
- Task marked completed only on success at line 101

**Write-Ahead Buffer Partial Handling** (`internal/streamingnode/server/wal/interceptors/wab/pending_queue.go:108-128`):
- `ErrEvicted` returned when expected message has been evicted (line 122)
- `io.EOF` returned when time tick is behind message buffer (line 117)
- Block operation until buffer updates (line 139)

### 3. How is data quality validated at each pipeline stage?

**Proxy Validation Layer** (`internal/proxy/validate_util.go:23-54`):
- `validateUtil` struct with configurable checks: `checkNAN`, `checkMaxLen`, `checkOverflow`, `checkMaxCap`
- Validation options applied via `withNANCheck()`, `withOverflowCheck()`, `withMaxLenCheck()`, `withMaxCapCheck()`

**Field-Level Validation** (`internal/proxy/validate_util.go:118-200`):
- Type-specific validation using switch on `fieldSchema.GetDataType()`
- Float vector validation at line 120
- VarChar validation at line 144
- Integer overflow checking
- JSON field validation at line 997

**Schema Consistency** (`internal/proxy/task_insert.go:141-150`):
- Schema version mismatch check before writes
- Collection info retrieved and compared against request schema timestamp

**UTF-8 Compatibility** (`internal/proxy/task_insert.go:231-236`):
- `checkInputUtf8Compatiable()` validates varchar/text field encoding

**Dynamic Field Checking** (`internal/proxy/task_insert.go:201-205`):
- Enabled when `schema.EnableDynamicField` is true
- `checkDynamicFieldData()` validates dynamic fields

### 4. How does the pipeline scale with data volume without OOM?

**Write-Ahead Buffer Capacity** (`internal/streamingnode/server/wal/interceptors/wab/pending_queue.go:26-37`):
- Capacity parameter limits buffer size (line 32)
- Keepalive duration for message eviction (line 33)
- `Evict()` method called after each append at `write_ahead_buffer.go:82`

**Eviction Strategy** (`internal/streamingnode/server/wal/interceptors/wab/pending_queue.go:157-186`):
- Triggers when `q.size > q.capacity` (line 160)
- Never releases last persisted message (lines 164-167 comment)
- Preserves catchup scanner functionality

**Rate Limiting** (`internal/streamingnode/server/wal/adaptor/wal_adaptor.go:165-168`):
- DML operations rejected when WAL is rate-limited via `IsRejected()` check
- `appendRateCounter` tracks append rate with 10-second sliding window at line 85, 229

**Import Task Concurrency** (`internal/datanode/importv2/scheduler.go:75-106`):
- Tasks executed concurrently via `conc.Future`
- `Slots()` method tracks used capacity for concurrency control
- Pending tasks retrieved at line 76: `s.manager.GetBy(WithStates(datapb.ImportTaskStateV2_Pending))`

**Batch Size Limits** (`internal/proxy/task_insert.go:121-126`):
- `MaxInsertSize` quota config enforced
- Request rejected if size exceeds limit

### 5. Can pipeline stages be independently deployed or scaled?

**Architecture Supports Independent Scaling** (`docs/agent_guides/streaming-system/streaming-system.md:7`):
- WAL spans multiple PChannels distributed across StreamingNodes
- Coordinated by StreamingCoord (singleton)
- Each StreamingNode manages a subset of PChannels

**Component Separation** (`CLAUDE.md:8-10`):
- Coordinators: rootcoord, datacoord, querycoordv2
- Nodes: proxy, querynodev2, datanode, streamingnode
- All component interfaces defined in `internal/types/types.go`

**PChannel-to-StreamingNode Assignment** (`docs/agent_guides/streaming-system/streaming-system.md:28`):
- Channel Management handles PChannel-to-StreamingNode assignment
- Node health monitoring
- VChannel/CChannel allocation

**TimeTick Interceptor Isolation** (`internal/streamingnode/server/wal/interceptors/timetick/timetick_interceptor.go:37-77`):
- Timestamp allocation per message
- Transaction management via TxnManager
- Ack manager for completion tracking

**Limitation**: The comment at `internal/proxy/task_insert_streaming.go:24-28` notes that `InsertMessageHeader` does not carry SchemaVersion, which can cause deadlock when the consistency gate waits for inserts at new schema version that will never arrive. This suggests coupling between Proxy and StreamingNode stages.

## Architectural Decisions

| Decision | Rationale | Evidence |
|----------|-----------|----------|
| WAL as single source of truth | Provides at-least-once delivery, ordered logging, and recovery capability | `docs/agent_guides/streaming-system/streaming-system.md:7` |
| Channel-based sharding | Distributes load across multiple StorageNodes, enables parallelism | `internal/proxy/task_insert_streaming.go:101` |
| TimeTick ordering | Monotonically increasing log sequence number for transaction ordering | `pkg/proto/streaming.proto:15` |
| Write-Ahead Buffer | Decouples write and persist, provides backpressure | `internal/streamingnode/server/wal/interceptors/wab/write_ahead_buffer.go:27-41` |
| Exponential backoff retry | Handles transient WAL failures gracefully | `internal/streamingnode/server/wal/adaptor/wal_adaptor.go:258-291` |
| Schema version consistency check | Prevents writes with stale schema | `internal/proxy/task_insert.go:141-150` |

## Notable Patterns

1. **Interceptor Pattern**: WAL uses interceptors (e.g., `timetickAppendInterceptor`, `wab.WriteAheadBuffer`) to layer functionality at `internal/streamingnode/server/wal/interceptors/timetick/timetick_interceptor.go:37`

2. **Pending Queue with Eviction**: Time-based and capacity-based eviction preserves recent messages while releasing old ones at `internal/streamingnode/server/wal/interceptors/wab/pending_queue.go:82-186`

3. **Message Builder Pattern**: `NewInsertMessageBuilderV1()` constructs messages with headers, body, and cipher config at `internal/proxy/task_insert_streaming.go:116-131`

4. **Rate Counter Sliding Window**: Append rate tracked via sliding window for adaptive rate limiting at `internal/streamingnode/server/wal/adaptor/wal_adaptor.go:85`, `229`

5. **Ack Manager for Timestamp Tracking**: Per-message acker tracks completion and transaction context at `internal/streamingnode/server/wal/interceptors/timetick/ack/ack.go`

## Tradeoffs

| Tradeoff | Impact | Mitigation |
|----------|--------|-------------|
| SchemaVersion not in InsertMessageHeader | Can cause deadlock waiting for new schema version inserts | Documented in TODO comment at `task_insert_streaming.go:24-28`; fix in PR #48139 |
| Backpressure via eviction | May lose messages if consumer falls too far behind | Last persisted message never evicted (line 164-167 comment) |
| Exponential backoff retry | May increase latency during WAL failures | Max interval capped at 5s |
| Synchronous validation at Proxy | Single-point bottleneck for high-volume inserts | Channel-based sharding distributes load |
| Write-Ahead Buffer memory | Capacity-based eviction may cause pressure | Keepalive-based eviction limits retention |

## Failure Modes / Edge Cases

| Failure Mode | Handling | File:Line |
|-------------|----------|-----------|
| Schema version mismatch | Returns `merr.ErrCollectionSchemaMismatch`, status set | `internal/proxy/task_insert_streaming.go:80-84` |
| WAL fenced (channel term mismatch) | Append rejected, WAL marked unavailable | `wal_adaptor.go:160-163`, `211-217` |
| Channel not exist | Returns `STREAMING_CODE_CHANNEL_NOT_EXIST` | `pkg/proto/streaming.proto:328` |
| Rate limit rejected | DML operations rejected with `NewRateLimitRejected` | `wal_adaptor.go:165-168` |
| Message evicted from buffer | Returns `ErrEvicted`, unrecoverable | `pending_queue.go:119-122` |
| Append canceled (context) | Returns immediately with `ctx.Err()` | `wal_adaptor.go:276` |
| Transaction expired | Returns `STREAMING_CODE_TRANSACTION_EXPIRED` | `pkg/proto/streaming.proto:336` |
| Partial batch failure | Each message has own ack; failures tracked per-message | `timetick_interceptor.go:67-76` |

## Future Considerations

1. **SchemaVersion Propagation**: Complete the fix for InsertMessageHeader carrying SchemaVersion (referenced at `task_insert_streaming.go:28`) to fully address schema deadlock scenario.

2. **Configurable Batch Tuning**: Currently batch sizes and flush intervals are implicit; explicit configuration would improve operational control.

3. **Cross-Stage Observability**: While individual stages have metrics, e.g., WAB metrics (`metricsutil/wab.go:39-49`), a unified pipeline trace would help diagnose end-to-end latency issues.

4. **Backpressure Signaling**: The current backpressure is capacity-based; adaptive backpressure based on consumer lag could improve throughput stability.

## Questions / Gaps

| Question | Evidence |
|----------|----------|
| What is the default WAB capacity and how is it tuned? | `NewWriteAheadBuffer()` receives `capacity` parameter but no visible config defaults found |
| How is the max message size determined for delete batching? | `maxSize` used at `task_delete.go:157` but its origin not traced |
| What happens when import task fails mid-batch? | `scheduler.go:96-103` continues other tasks but task state management unclear |
| Is there circuit breaker for cascading failures? | Retry logic present at `wal_adaptor.go:258-291` but no global circuit breaker observed |
| How does pipeline recover from partial WAL failure? | Recovery storage documented at `recovery/recovery_persisted.go` but detailed flow not analyzed |

---

Generated by `dimensions/07-data-ingestion-processing-pipelines.md` against `milvus`.