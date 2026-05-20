# Source Analysis: VictoriaMetrics

## Data Ingestion & Processing Pipelines

### Source Info

| Field | Value |
|-------|-------|
| Name | VictoriaMetrics |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/victoriametrics` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

VictoriaMetrics implements a sophisticated multi-stage data ingestion pipeline designed for high-throughput time series data. The pipeline processes data through distinct stages: protocol-specific handlers, concurrent stream parsing, validation/normalization, batching/queueing, compression, and persistent queue storage before eventual remote write to storage backends. The architecture emphasizes memory efficiency, backpressure handling, and graceful degradation under load.

## Rating

**8/10** — VictoriaMetrics demonstrates a well-engineered ingestion pipeline with strong evidence of production-hardened design. The system excels at concurrent stream processing, batching, and memory management. Minor gaps exist around granular per-stage observability and independent deployability of pipeline stages.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| HTTP Ingestion Entry Points | `requestHandler()` routes all protocol endpoints | `app/vmagent/main.go:251` |
| Prometheus Remote Write | `InsertHandler()` for prometheus write protocol | `app/vmagent/promremotewrite/request_handler.go:26` |
| InfluxDB Handler | `InsertHandlerForHTTP()` for InfluxDB line protocol | `app/vmagent/influx/request_handler.go:47` |
| Stream Parsing | `Parse()` with concurrent workers | `lib/protoparser/influx/stream/streamparser.go:36` |
| Concurrent Work Scheduling | `ScheduleUnmarshalWork()` schedules parallel parsing | `lib/protoparser/protoparserutil/unmarshal_work.go:13` |
| Write Concurrency Limiter | `IncConcurrency()` with `maxConcurrentInserts` | `lib/writeconcurrencylimiter/concurrencylimiter.go:106` |
| Backpressure Queue Timeout | Returns 503 after `maxQueueDuration` | `lib/writeconcurrencylimiter/concurrencylimiter.go:128` |
| Series Limits Validation | `IsExceeding()` checks label count/name/value | `lib/timeserieslimits/timeseries_limits.go:115` |
| Pending Series Batching | `tryPushTimeSeries()` accumulates until limits | `app/vmagent/remotewrite/pendingseries.go:236` |
| Periodic Flush | `periodicFlusher()` flushes on interval/size | `app/vmagent/remotewrite/pendingseries.go:74` |
| Compression | snappy/zstd encoding with `vmProtoCompressLevel` | `app/vmagent/remotewrite/pendingseries.go:314` |
| FastQueue Memory-First | Memory channel with file fallback | `lib/persistentqueue/fastqueue.go:18` |
| Queue Full Error | `ErrQueueFullHTTPRetry` returns 429 | `app/vmagent/remotewrite/remotewrite.go:113` |
| Corrupt Chunk Recovery | `skipBrokenChunkFile()` recovers from corruption | `lib/persistentqueue/persistentqueue.go:516` |
| Drop on Overload | `dropSamplesOnOverload` flag | `app/vmagent/remotewrite/remotewrite.go:101` |
| Partition Storage | `AddRows()` ingests to time-based partitions | `lib/storage/storage.go:1626` |
| Raw Rows Shards | `rawRowsShardsPerPartition` for concurrent writes | `lib/storage/partition.go:46` |
| Inflight Merge Limit | `maxInmemoryParts` limits concurrent merges | `lib/storage/partition.go:35` |

## Answers to Dimension Questions

### 1. How does raw data become trustworthy structured data?

Raw data undergoes multi-stage transformation to become trustworthy structured data:

**Stage 1 — Protocol Parsing**: Raw bytes are parsed by protocol-specific handlers (`app/vmagent/main.go:251`). Each protocol (Prometheus, InfluxDB, Graphite, OpenTSDB, OpenTelemetry, DataDog, NewRelic, Zabbix) has dedicated handlers that decode protocol-specific formats.

**Stage 2 — Stream Parsing with Concurrency Control**: Stream parsers (`lib/protoparser/influx/stream/streamparser.go:36`) use `writeconcurrencylimiter.GetReader()` to limit concurrent parsing operations (`lib/writeconcurrencylimiter/concurrencylimiter.go:64`). Work is scheduled via `protoparserutil.ScheduleUnmarshalWork()` which distributes parsing across goroutine pools.

**Stage 3 — Validation**: 
- **Timeseries Limits** (`lib/timeserieslimits/timeseries_limits.go:115`): Validates max labels per series (40 default), max label name length (256), max label value length (4KB)
- **Relabeling** (`lib/promrelabel/relabel.go:111`): Applies user-defined relabeling rules, removes empty labels, strips internal `__` labels

**Stage 4 — Timestamp Normalization**: Timestamps are converted to milliseconds. InfluxDB precision detection (`lib/protoparser/influx/stream/streamparser.go:95-112`) applies appropriate multipliers (ns→1e6, us→1e3, ms→1, s→1e-3, etc.). Missing Graphite timestamps default to current time (`lib/protoparser/graphite/stream/streamparser.go:165`).

**Stage 5 — Batching & Compression**: Series accumulate in `pendingSeries` (`app/vmagent/remotewrite/pendingseries.go:236`) until `maxRowsPerBlock` (10000) or `flushInterval` (1s) triggers a flush. Data is compressed with zstd or snappy (`pendingseries.go:314-317`).

**Stage 6 — Persistent Queue**: Data is written to `FastQueue` (`lib/persistentqueue/fastqueue.go:18`) which uses memory channels first, falling back to file-based queue when readers don't keep up.

### 2. What happens when a pipeline stage fails mid-batch?

VictoriaMetrics handles mid-batch failures with several strategies:

**Parser-Level Error Handling**: Invalid lines are either skipped (with logging) or cause batch failure depending on `skipInvalidLines` configuration. In InfluxDB parser (`lib/protoparser/influx/parser.go:232-238`), invalid lines increment `invalidLines` counter and are skipped if `skipInvalidLines=true`.

**Concurrency Limiter Timeout**: When concurrent insert limit is reached, the system waits up to `maxQueueDuration` (1 minute default) before returning HTTP 503 (`lib/writeconcurrencylimiter/concurrencylimiter.go:128`).

**Queue Full Handling**:
- When persistent queue exceeds `maxPendingBytesPerURL`, oldest data is dropped to make room (`app/vmagent/remotewrite/remotewrite.go:356-382`)
- `ErrQueueFullHTTPRetry` returns HTTP 429 to clients (`remotewrite.go:114-119`)
- `dropSamplesOnOverload` flag (`remotewrite.go:101`) can be set to drop samples instead of queueing when `disableOnDiskQueue` is set

**Block-Level Atomicity**: Each block is independently compressed and sent. If compression fails, only that block is affected; other blocks proceed.

**Corrupt Chunk Recovery**: `skipBrokenChunkFile()` (`lib/persistentqueue/persistentqueue.go:516`) recovers from corrupt chunks by skipping to the next valid chunk.

**Partial Failure in Remote Write**: When sending to multiple remote storages with sharding, failures are isolated per-storage. Replication ensures data isn't lost if one storage fails.

### 3. How is data quality validated at each pipeline stage?

**Stage 1 — Protocol Parsing**:
- Line size validation: `influx.maxLineSize` (256KB default) (`lib/protoparser/influx/stream/streamparser.go:21`)
- Request size validation: `influx.maxRequestSize` (64MB default) (`lib/protoparser/influx/stream/streamparser.go:23`)
- Encoding validation: gzip/deflate decompression verification (`protoparserutil.GetUncompressedReader`)

**Stage 2 — Stream Parsing**:
- Invalid UTF-8 sequences handled by `bytesutil.ReadLine()` 
- Malformed metric names/values caught in `unmarshalRow()` with line skipping (`lib/protoparser/graphite/parser.go:148-171`)

**Stage 3 — Validation via timeserieslimits** (`lib/timeserieslimits/timeseries_limits.go`):
- `vm_rows_ignored_total{reason="too_many_labels"}` — tracks series exceeding max labels
- `vm_rows_ignored_total{reason="too_long_label_name"}` — tracks label names exceeding 256 chars
- `vm_rows_ignored_total{reason="too_long_label_value"}` — tracks values exceeding 4KB
- Warning logs throttled to 5-second intervals to avoid log spam

**Stage 4 — Relabeling Validation**:
- `removeEmptyLabels()` (`lib/promrelabel/relabel.go:125`) removes labels with empty name/value
- `FinalizeLabels()` (`lib/promrelabel/relabel.go:148`) ensures internal labels are stripped
- Metrics track relabeling outcomes: `promrelabel_*` counters

**Stage 5 — Batch-Level**:
- `IsExceeding()` returns true if limits violated, samples are dropped
- `adjustSampleValues()` (`pendingseries.go:250`) applies significant figures and rounding

**Stage 6 — Persistent Queue**:
- Block checksums verified on read
- Corrupt chunks are skipped with recovery mechanism

### 4. How does the pipeline scale with data volume without OOM?

VictoriaMetrics employs multiple memory management strategies:

**Concurrency Limiting**: `maxConcurrentInserts` (default: 2×CPUs) (`lib/writeconcurrencylimiter/concurrencylimiter.go:19`) limits concurrent goroutines processing requests. Excess requests queue up to `maxQueueDuration` before timeout.

**Write Concurrency Limiter Pattern**: `GetReader()`/`PutReader()` (`lib/writeconcurrencylimiter/concurrencylimiter.go:42-68`) implements token-based concurrency control where tokens are acquired before reading and released after.

**Memory-Mapped Streams**: Stream parsers process data in bounded chunks via `protoparserutil.ReadUncompressedData()` which processes in `maxRequestSize` chunks.

**Batch Size Limits**:
- `maxRowsPerBlock` = 10000 samples per block (`pendingseries.go:29`)
- `maxLabelsPerBlock` = 10×maxRowsPerBlock = 100000 labels
- `maxUnpackedBlockSize` = 8MB (`pendingseries.go:28`)
- Blocks are split if exceeding `MaxBlockSize` (512KB) after compression

**FastQueue Memory Management** (`lib/persistentqueue/fastqueue.go`):
- `maxInmemoryBlocks` limits memory queue depth
- Falls back to file-based queue when memory limit reached
- `pendingInmemoryBytes` tracks memory usage
- `IsWriteBlocked()` returns true when disabled and at capacity

**Partition Sharding**: `rawRowsShardsPerPartition` (`lib/storage/partition.go:46`) distributes write load across CPU-count shards, reducing contention and limiting any single shard's memory.

**In-Memory Merge Limits**: `maxInmemoryParts` = 60 (`lib/storage/partition.go:35`) limits concurrent in-memory merges. If exceeded, data is flushed to disk.

**Data Flush Intervals**: 
- `pendingRowsFlushInterval` = 2s for raw rows visibility
- `dataFlushInterval` = 5s for guaranteed persistence
- `flushInterval` = 1s for remote write batches

**Cardinality Limits**:
- `maxHourlySeries` limits unique series per hour
- `maxDailySeries` limits unique series per day

### 5. Can pipeline stages be independently deployed or scaled?

**Limited Independent Scalability**: Pipeline stages are not fully independently deployable or scalable:

**Cluster Mode Architecture** (`app/vminsert/`, `app/vmselect/`, `app/vmstorage/`):
- `vminsert`: Handles data ingestion, can scale horizontally
- `vmselect`: Handles queries, can scale horizontally
- `vmstorage`: Handles data storage, scales with data volume
- This provides some stage isolation but still coupled within a cluster

**Within vmagent**:
- Multiple `-remoteWrite.queues` (default: CPUs×2) (`app/vmagent/remotewrite/remotewrite.go:66`) provides parallelism per remote storage
- `-remoteWrite.shardByURL` enables sharding across multiple remote storages
- Concurrent workers for stream parsing are controlled by CPU count

**Not Independently Scalable**:
- Protocol handlers and parsers are coupled within vmagent
- No ability to scale parsing separately from queue writing
- No ability to deploy custom intermediate transforms between stages
- Compression and batching are tightly coupled in `pendingseries.go`

**Relative Independence**: vmagent and victoria-metrics are separate binaries that can be deployed on different hosts, allowing some architectural separation of scraping/collection (vmagent) from storage/query (victoria-metrics).

## Architectural Decisions

1. **Memory-First Persistent Queue**: FastQueue prioritizes memory for performance but gracefully falls back to disk when memory pressure increases, preventing OOM while maintaining low latency under normal conditions.

2. **Token-Based Concurrency Control**: Write concurrency limiter uses a channel-based token system that provides fair FIFO ordering and easy backpressure signaling via HTTP 503.

3. **Sharded Partition Storage**: Time-based partitions with per-partition shards reduce lock contention and enable parallel writes across CPU cores.

4. **Batch Compression**: Compressing entire batches (snappy or zstd) before persistent queue provides efficient storage and network transfer at the cost of decompression overhead on read.

5. **Relabeling as First-Class Feature**: Promrelabel is deeply integrated, enabling powerful data transformation at ingestion time without requiring external processors.

6. **Protocol Adapter Pattern**: All protocols normalize to internal `prompb.TimeSeries` format, enabling uniform downstream processing regardless of ingestion protocol.

## Notable Patterns

**Object Pooling**: Extensive use of `sync.Pool` for `PushCtx` (`app/vmagent/common/push_ctx.go`), `writeRequestBuf`, `compressBuf`, and other allocations to reduce GC pressure.

**Periodic Flusher**: Background goroutine with jittered ticker (`pendingseries.go:74-98`) handles both interval-based and size-triggered flushing.

**Error Context Propagation**: Custom `httpserver.ErrorWithStatusCode` type (`lib/httpserver/httpserver.go`) carries HTTP status codes with errors for proper response handling.

**Metrics-Driven Observability**: Extensive internal metrics (`vm_concurrent_insert_*`, `vm_rows_ignored_*`, `vm_persistentqueue_*`) provide pipeline visibility.

**Graceful Shutdown**: `MustFlushOnStop()` (`pendingseries.go:149`) ensures in-flight data is persisted before exit.

## Tradeoffs

1. **Memory vs Durability**: FastQueue's memory-first approach is fast but vulnerable to data loss on crash before disk persist. The 5-second `dataFlushInterval` is a tradeoff between memory efficiency and durability.

2. **Compression CPU vs Network**: zstd compression at higher levels reduces network traffic but increases CPU usage. The `vmProtoCompressLevel` flag allows tuning this tradeoff.

3. **Batching Latency vs Throughput**: 1-second default flush interval introduces latency but improves throughput through larger batches. Configurable via `remoteWrite.flushInterval`.

4. **Cardinality Limits vs Completeness**: Hard limits on series count prevent OOM but may lose data if limits are exceeded without warning.

5. **Inline Parsing vs Extensibility**: Protocol-specific handlers are deeply integrated, making custom protocol support require code changes rather than plugin architecture.

## Failure Modes / Edge Cases

1. **OOM Under Pressure**: If `disableOnDiskQueue` is set and `dropSamplesOnOverload` is false, the system will queue indefinitely in memory, potentially causing OOM.

2. **Stuck Concurrent Inserts**: If a slow network client holds a concurrency token for `maxQueueDuration`, subsequent inserts timeout with 503.

3. **Corrupt Queue Files**: While `skipBrokenChunkFile()` recovers from corruption, some data may be lost.

4. **Clock Skew**: Timestamp normalization assumes server clock is correct; future timestamps or old timestamps may cause issues.

5. **Partition Boundary Races**: Time-based partitioning may have edge cases at month boundaries if system clock skews during operation.

6. **Relabeling Errors**: Aggressive relabeling rules can drop all samples silently if misconfigured; metrics track this but no alerting built-in.

## Future Considerations

1. **Plugin Architecture**: Could benefit from a plugin system for custom protocol handlers or intermediate pipeline stages.

2. **Per-Stage Metrics**: Currently metrics are aggregated; granular per-stage latency/throughput metrics would improve observability.

3. **Adaptive Batching**: Could dynamically adjust batch sizes based on network latency and throughput observations.

4. **End-to-End Acknowledgment**: No built-in mechanism for confirming data durability at the storage layer; depends on remote storage's acknowledgment.

## Questions / Gaps

1. **No Evidence Found**: How does the system handle clock synchronization issues when multiple vmagent instances write to the same storage?

2. **No Evidence Found**: What is the exact behavior when `maxPendingBytesPerURL` is exceeded mid-block — is the partial block dropped or completed?

3. **No Evidence Found**: Does the persistent queue provide any fsync durability guarantee, or is data only persisted on flush interval?

4. **No Evidence Found**: How does the cluster mode coordinate across multiple `vminsert` instances for the same tenant — is there distributed locking?

---

*Generated by `dimensions/07-data-ingestion-processing-pipelines.md` against `VictoriaMetrics`.*
