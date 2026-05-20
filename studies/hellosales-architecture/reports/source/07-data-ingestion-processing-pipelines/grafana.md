# Source Analysis: grafana

## Data Ingestion & Processing Pipelines

### Source Info

| Field | Value |
|-------|-------|
| Name | grafana |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/grafana` |
| Language / Stack | Go (backend), TypeScript (frontend) |
| Analyzed | 2026-05-20 |

## Summary

Grafana implements a multi-stage pipeline architecture for live data processing through its `pkg/services/live/pipeline/` package. Raw data enters via HTTP/WebSocket push handlers (`pushhttp/push.go`, `pushws/push_pipeline.go`), flows through configurable stages (DataOutputters → Converter → FrameProcessors → FrameOutputters), and outputs to destinations like Loki or managed streams. Batching is implemented in the Loki HTTP client (`components/loki/lokihttp/batch.go`) with 15-second flush intervals and buffer retry on failure. Error handling includes exponential backoff retry (`util/retryer/retryer.go`), circular channel recursion detection (`pipeline/pipeline.go:315`), and graceful degradation when frames are nil. OpenTelemetry tracing is integrated throughout the pipeline. Schema caching in managed streams enables efficient incremental frame transmission.

## Rating

**7/10** — Good implementation with minor issues. The pipeline architecture is well-designed with clear stage separation, but there are gaps in observable backpressure handling, partial failure granularity is coarse (batches either succeed or fully retry), and scaling characteristics of pipeline stages aren't clearly documented.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| HTTP Push Entry | `Handle()` reads body with 500k max limit, converts data, pushes frames to ManagedStreamRunner | `pkg/services/live/pushhttp/push.go:48-100` |
| WebSocket Push Entry | `ServeHTTP()` upgrades to WebSocket, reads messages in loop, calls `pipeline.ProcessInput()` | `pkg/services/live/pushws/push_pipeline.go:40-85` |
| Pipeline Architecture | `Pipeline` struct with DataOutputter, Converter, FrameProcessor, FrameOutputter interfaces | `pkg/services/live/pipeline/pipeline.go:82-107` |
| Pipeline Data Flow | `ProcessInput()` → `processInput()` → `processChannelFrames()` with stage ordering | `pkg/services/live/pipeline/pipeline.go:218-279` |
| ChannelRuleSettings | Defines stages: DataOutputters → Converter → FrameProcessors → FrameOutputters | `pkg/services/live/pipeline/config.go:22-35` |
| Loki Batch Struct | `batch` struct holds pending streams and bytes with `add()` method | `pkg/components/loki/lokihttp/batch.go:20-39` |
| Batch Encoding | `encode()` Snappy-compresses batch for push requests | `pkg/components/loki/lokihttp/batch.go:88-96` |
| Batch Embedder | `Embed()` filters empty content, batches texts with configurable chunk sizes | `pkg/storage/unified/search/embed/embedder/batch_embedder.go:35-88` |
| Batch Processing | `BatchProcess()` splits inputs into chunks, runs concurrently via `errgroup` | `pkg/storage/unified/search/embed/embedder/batch_process.go:25-55` |
| Loki Writer Buffering | `lokiWriter` with buffered streams, `flushPeriodically()` every 15 seconds | `pkg/services/live/pipeline/frame_output_loki.go:62-105` |
| Telegraf Type Normalization | `float64FieldTypeFor()` normalizes numeric types, `getFieldAndValue()` handles type validation | `pkg/services/live/telemetry/telegraf/convert.go:276-345` |
| JSON to Frame Validation | `jsonDocToFrame()` validates at least 2 fields, fills missing fields with nulls | `pkg/services/live/pipeline/json_to_frame.go:102-136` |
| ChannelRule Validation | `Valid()` checks pattern syntax and registers converter/processor/outputter types | `pkg/services/live/pipeline/models.go:9-50` |
| Pipeline Error Recursion | `errChannelRecursion` detects circular redirects, prevents infinite loops | `pkg/services/live/pipeline/pipeline.go:315-325` |
| Retry with Backoff | `Retry()` with exponential backoff, caps at maxDelay, stops after maxRetries | `pkg/util/retryer/retryer.go:18-47` |
| Remote Index Retry | `retryRemoteIndexStore()` wraps operations with retry logic, logs warnings | `pkg/storage/unified/search/remote_index_store.go:214-237` |
| OpenTelemetry Tracing | `tracerProvider()` configures Jaeger exporter with batched traces | `pkg/services/live/pipeline/pipeline.go:31-53` |
| ProcessInput Tracing | Creates span with body attributes at input entry | `pkg/services/live/pipeline/pipeline.go:221-228` |
| Frame Processing Tracing | `processFrame()` and `execProcessor()` trace each processing stage | `pkg/services/live/pipeline/pipeline.go:371-456` |
| Threshold Output | Monitors field threshold transitions, outputs state changes to channel | `pkg/services/live/pipeline/frame_output_threshold.go:23-28` |
| Schema Caching | `Stream.Push()` updates frame cache, detects schema changes for incremental sends | `pkg/services/live/managedstream/runner.go:176-205` |
| Rate Tracking | `incRate()` tracks message rate per path in 60-second sliding window | `pkg/services/live/managedstream/runner.go:207-238` |

## Answers to Dimension Questions

### 1. How does raw data become trustworthy structured data?

Raw data enters through HTTP push handlers (`pushhttp/push.go:48-100`) with a 500k body size limit. The `HandlePipelinePush()` path routes to `Pipeline.ProcessInput()` which applies a multi-stage transformation pipeline:
1. **DataOutputters** — optional early raw data output
2. **Converter** — transforms raw bytes to `ChannelFrame` (e.g., Telegraf convert in `telegraf/convert.go:276-345`)
3. **FrameProcessors** — modify frames (drop/keep fields, etc.)
4. **FrameOutputters** — route to destinations

Type normalization happens in `float64FieldTypeFor()` (`telegraf/convert.go:276-310`) which converts all numeric types to float64. JSON to frame conversion (`json_to_frame.go:102-136`) validates at least 2 fields (Time + data) and fills missing fields with nulls. The `ChannelRule.Valid()` method (`models.go:9-50`) validates pattern syntax and checks that converters, processors, and outputters are registered.

**No evidence found** for cryptographic integrity verification (e.g., HMAC signatures on ingested payloads) — trust appears based on network isolation and plugin configuration rather than data integrity guarantees.

### 2. What happens when a pipeline stage fails mid-batch?

When `processFrame()` finds no matching rule, it returns nil gracefully (`pipeline/pipeline.go:370-393`). If a frame processor returns nil, the pipeline stops for that frame (`pipeline/pipeline.go:416-418`). For Loki output, `flushPeriodically()` (`frame_output_loki.go:84-105`) appends failed buffers back for retry on flush failure.

The `BatchProcess()` function (`batch_process.go:43-44`) validates output count matches input count — all-or-nothing semantics where any batch failure causes the entire operation to fail. The retry mechanism (`retryer/retryer.go:18-47`) uses exponential backoff with max retries.

**Gap identified**: When a frame processor fails mid-frame in a batch, the behavior isn't clearly isolated — the batch retry could re-process already-succeeded frames in the same batch.

### 3. How is data quality validated at each pipeline stage?

- **Ingestion**: Body size limited to 500k (`pushhttp/push.go:62`), WebSocket message reading with error handling (`pushws/push_pipeline.go:62-84`)
- **Conversion**: `telegraf/convert.go:319-320` returns error for unknown field types; `json_to_frame.go:120-122` validates minimum 2 fields
- **Processing**: `ChannelRule.Valid()` (`models.go:9-50`) validates registered types; `float64FieldTypeFor()` normalizes numeric values
- **Output**: Image validation in `store/validate.go:63-75` checks file extension and MIME type; threshold monitoring in `frame_output_threshold.go:23-28`

Schema changes are detected in managed streams (`runner.go:185-189`) — if schema changes, full frame is sent; otherwise only data is sent.

**Gap identified**: No evidence of field-level data quality checks (e.g., range validation, nullity enforcement) in the pipeline itself beyond type normalization.

### 4. How does the pipeline scale with data volume without OOM?

- **Managed streams**: Schema caching with incremental frame transmission reduces bandwidth (`runner.go:176-205`)
- **Loki batch**: Pending streams and bytes accumulate until 15-second flush or size threshold (`batch.go:20-39`)
- **Batch embedder**: Configurable chunk size splits large inputs; concurrent processing via `errgroup` (`batch_process.go:25-55`)
- **Rate tracking**: Per-path rate limiting with 60-second sliding window (`runner.go:207-238`)

**Gap identified**: No evidence of memory-bounded queue depth limits or circuit breakers that would prevent OOM on sustained high throughput. The `ManagedStreamRunner` has no visible backpressure mechanism when subscribers are slow.

### 5. Can pipeline stages be independently deployed or scaled?

Pipeline stages are configured via `ChannelRuleSettings` (`config.go:22-35`) with data-driven configuration (not code-level). However:

- **Evidence of independent scaling**: FrameOutputters are pluggable (`FrameOutputter` interface at `pipeline.go:96`), converters and processors are registered by name (`models.go:28-42`)
- **No evidence of**: Separate deployment units, separate process boundaries, or horizontal scaling of individual stages

The pipeline runs within a single Go process (`live/pipeline/` package), making independent scaling of stages limited to thread-level concurrency via `errgroup` in batch processing (`batch_process.go:43`).

## Architectural Decisions

1. **Push-based ingestion over pull**: Grafana Live uses HTTP/WebSocket push handlers rather than a broker queue, reducing latency but requiring publishers to handle backpressure directly.

2. **Pluggable stage architecture**: Converter, FrameProcessor, and FrameOutputter are interfaces (`pipeline.go:82-107`) allowing custom stages without modifying core pipeline logic.

3. **15-second flush interval for Loki output** (`frame_output_loki.go:84-105`): Tradeoff between network efficiency (batching) and data freshness.

4. **All-or-nothing batch semantics** (`batch_process.go:43-44`): Simplifies failure handling but may cause unnecessary retries when only some items in a batch fail.

5. **Schema caching for incremental frames** (`runner.go:176-205`): Reduces bandwidth for stable schemas but adds complexity in schema change detection.

## Notable Patterns

- **Pipeline pattern**: Configurable stage composition via `ChannelRuleSettings` allowing different processing paths per channel
- **Managed stream pattern**: Server-side cursor management with client subscription tracking (`pkg/services/live/managedstream/`)
- **Exponential backoff retry** (`retryer/retryer.go:18-47`): Standard retry with jitter-friendly linear backoff
- **Circular channel detection** (`pipeline.go:315`): Prevents infinite loops in channel rule chains
- **Sliding window rate tracking** (`runner.go:207-238`): Per-path message rate calculation with 60-second window

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| Push-based ingestion | Low latency vs. No built-in backpressure for slow consumers |
| 15s Loki flush interval | Network efficiency vs. Data lag on failure |
| All-or-nothing batch | Simplicity vs. Potential over-retries |
| In-memory schema cache | Fast incremental frames vs. Memory growth on schema drift |
| Single-process pipeline | Simpler operations vs. Limited independent scaling |

## Failure Modes / Edge Cases

1. **Slow subscribers**: Managed stream subscribers that consume slowly could cause memory growth — no visible backpressure mechanism
2. **Schema drift**: If schema changes rapidly, full frames sent each time could increase bandwidth; caching helps but no eviction policy found
3. **Batch partial failure**: After `BatchProcess()` fails, retry re-processes already-succeeded items in the failed batch
4. **Circular channel rules**: Detected via `errChannelRecursion` but only prevents — doesn't break cycle cleanly
5. **Loki flush on shutdown**: `frame_output_loki.go:100-102` appends failed buffer back for retry — on hard shutdown, unflushed data is lost
6. **WebSocket disconnect**: `push_pipeline.go:62-84` reads in loop — on disconnect mid-batch, partial data may be lost (no transaction semantics)

## Future Considerations

- **Backpressure signaling**: Implement reactive backpressure for slow subscribers (e.g., HTTP 429 or WebSocket flow control)
- **Batch item-level retry**: Instead of all-or-nothing, track per-item success/failure and retry only failed items
- **Pipeline stage isolation**: Consider separate goroutine pools per stage for independent scaling
- **Circuit breaker**: Add circuit breaker pattern to prevent cascade failures when downstream services are unhealthy
- **Dead letter queue**: For malformed data, consider a DLQ rather than dropping frames

## Questions / Gaps

1. **No evidence found** for field-level range validation or nullity constraints in pipeline processing
2. **No evidence found** for memory-bounded queue depth limits in managed streams
3. **No evidence found** for distributed scaling of pipeline stages across multiple instances
4. **Unclear**: How schema cache eviction works when schemas drift extensively over time
5. **Unclear**: What happens to in-flight WebSocket messages when a rule is dynamically updated

---

Generated by `dimensions/07-data-ingestion-processing-pipelines.md` against `grafana`.