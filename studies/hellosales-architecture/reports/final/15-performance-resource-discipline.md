# Performance & Resource Discipline - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Dimension | `15-performance-resource-discipline.md` |
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

Performance and resource discipline varies dramatically across the nine sources, ranging from exemplar implementations (nats-server 9/10, victoriametrics 9/10) to basic approaches with significant gaps (cli 5/10). The highest-performing systems share three characteristics: systematic object pooling with size-tiered strategies, benchmark-driven development with regression detection, and profiling infrastructure integrated into production paths. Lower-scoring systems typically show adequate streaming I/O but fail to implement consistent pooling, lack benchmarking culture, and treat profiling as an afterthought. The standout finding is that effective resource discipline is less about any single technique and more about the density of intentional optimization across memory management, batching, and observability.

## Core Thesis

Resource discipline separates production-ready systems from prototypes. Systems that treat pooling, batching, and profiling as first-class concerns — rather than optimization to be added later — demonstrate measurably better behavior under load. The best implementations use size-tiered pools to avoid fragmentation, time-and-size bounded batching to prevent memory bloat, and continuous profiling to catch regressions before deployment. The gap between nats-server/victoriametrics and cli/pocketbase is not one of language or scale, but of engineering culture: the high performers instrument their hot paths, measure allocation behavior, and tune batch sizes against real workloads.

## Rating Summary

| Source | Score | Approach | Main Strength | Main Concern |
|--------|-------|----------|---------------|--------------|
| cli | 5/10 | Streaming-first with pagination | `io.Copy` for artifact streaming (`pkg/cmd/run/download/http.go:57`) | No object pooling; only 2 benchmark tests |
| grafana | 6/10 | Sparse pooling with pre-allocation | Pre-allocated frameName buffers (`pkg/tsdb/influxdb/influxql/converter/converter.go:118`) | Inconsistent pooling; 185+ fresh `bytes.Buffer` allocations |
| kubernetes | 8/10 | Opportunistic batching with pooling | Scheduler batch caching with 500ms window (`pkg/scheduler/framework/runtime/batch.go:57-59`) | pprof not automatically enabled; watch cache per-session allocation |
| milvus | 7/10 | Hybrid Go/C++ with jemalloc | sync.Pool across lexer, segment, logging paths | CGO boundary overhead; bulk import still allocates 64MB |
| nats-server | 9/10 | Size-tiered pools with lock-free | 4 block pools (256KB-8MB) + 3 network buffer tiers | No CI-based regression gates; parser bypasses bufio |
| openfga | 8/10 | Channel-based pooling with streaming | MPMC queue with bounded growth (`internal/containers/mpmc/queue.go:27-42`) | No automatic batch tuning; limited pprof evidence |
| pocketbase | 6/10 | Hybrid memory/disk buffering | `bufferWithFile` with 16MB threshold (`tools/router/buffer_with_file.go:32`) | No profiling infrastructure; benchmark culture dormant |
| temporal | 6/10 | Slice reuse and LRU caching | Stream batcher with MinDelay/MaxDelay (`common/stream_batcher/batcher.go:31-43`) | No sync.Pool usage; benchmarks not in CI |
| victoriametrics | 9/10 | Leveled buffer pools with streaming | 10-tiered byte buffer pool (`lib/leveledbytebufferpool/pool.go:20`) | No hard pool limits; fixed flush intervals |

## Approach Models

### 1. Size-Tiered Pool Architecture

Both nats-server and VictoriaMetrics implement size-tiered buffer pools rather than single generic pools. nats-server uses four block pools (`blkPoolTiny` 256KB, `blkPoolSmall` 1MB, `blkPoolMedium` 4MB, `blkPoolBig` 8MB) at `server/filestore.go:1000-1023` and three network buffer tiers at `server/client.go:368-387`. VictoriaMetrics maintains ten pools for byte slice capacity ranges at `lib/leveledbytebufferpool/pool.go:20`. The benefit is preventing fragmentation: when a small buffer returns to a generic pool, it may be handed out for a larger request, wasting memory. The cost is complexity in size classification on every allocation. This approach is best for systems with highly variable buffer size requirements and is overkill for uniform workloads.

### 2. Streaming-First Architecture

OpenFGA and Temporal use streaming architectures that avoid buffering entire result sets. OpenFGA's `Receiver[T]` interface at `internal/listobjects/pipeline/pipeline.go:32-34` consumes values one at a time through a worker pipeline. Temporal's stream_batcher processes items in batches with time-based flush boundaries. The benefit is bounded memory regardless of result set size; the cost is increased latency for small results and complexity in flow control. This approach is best for query-heavy systems returning variable-sized result sets.

### 3. Configurable Batching with Flush Thresholds

Kubernetes, Milvus, and VictoriaMetrics use time-and-size bounded batching to prevent unbounded memory growth. Kubernetes' RealFIFO pre-allocates delta slices with `make([]Delta, 0, min(len(f.items), f.batchSize))` at `staging/src/k8s.io/client-go/tools/cache/the_real_fifo.go:503`. VictoriaMetrics flushes raw rows after `pendingRowsFlushInterval=2s` or when `maxRawRowsPerShard=8MB` is reached at `lib/storage/partition.go:49-72`. The benefit is predictable memory usage; the cost is latency at batch boundaries and potential for batch-specific failures. This approach is best for write-heavy systems where throughput matters more than individual write latency.

### 4. Hybrid Memory/Disk Buffering

PocketBase implements `bufferWithFile` at `tools/router/buffer_with_file.go:28-33` that stores up to 16MB in memory then spills to disk. This prevents OOM on large request bodies without the complexity of always streaming to disk. The benefit is handling both small and large requests gracefully; the cost is temp file management and potential for disk exhaustion on the same node. This approach is best for request-handling systems with unpredictable payload sizes.

### 5. CGO-Aware Memory Management

Milvus bridges Go and C++ via jemalloc, exposing stats at `internal/util/segcore/jemalloc_stats.go:26-49` with a 10s TTL cache. Go objects use sync.Pool at `internal/parser/planparserv2/pool.go:12-22` while C++ core uses jemalloc. The benefit is optimized memory for both managed and native code; the cost is CGO overhead and fragmentation at the boundary. This approach is best for systems with significant C++ components that need unified memory visibility.

## Pattern Catalog

### Pattern: Pool Reset Before Return

Every high-performing system resets pooled objects before returning them. nats-server explicitly nil's fields at `server/stream.go:5542` and `server/consumer.go:2703,2711`. VictoriaMetrics resets at `lib/protoparser/prometheus/stream/streamparser.go:130-132`. Grafana calls `.Reset()` at `pkg/infra/log/term/terminal_logger.go:257`. Without reset, stale data leaks and pooled objects carry unnecessary state, degrading cache efficiency.

**When to use**: Always, without exception.

**When overkill**: Objects are trivially constructable (< 1KB stack allocation) and pools would be tiny.

### Pattern: Pool Detoxification

VictoriaMetrics and Kubernetes discard oversized buffers rather than returning them to pools. VictoriaMetrics checks `cap > 1MB && cap > 4*len` at `lib/protoparser/protoparserutil/compress_reader.go:79` before returning. Kubernetes' `BufferProvider.Put()` at `staging/src/k8s.io/apimachinery/pkg/runtime/serializer/cbor/internal/modes/buffers.go:46-64` checks capacity before returning to pool. Without detoxification, pools accumulate large buffers that won't be reused, wasting memory.

**When to use**: When buffer sizes are highly variable and large buffers are rare.

**When overkill**: Fixed-size buffers; pools with strict size limits already.

### Pattern: Batch Boundary Metrics

Kubernetes tracks `BatchAttemptStats` and `BatchCacheFlushed` counters at `pkg/scheduler/metrics/metrics.go:141-142` to measure batching effectiveness. nats-server tracks global inflight batch counts with atomic operations at `server/jetstream_batching.go:33-35`. Without metrics, batching effectiveness is unobservable and misconfigured batches go undetected.

**When to use**: When batches are central to throughput.

**When overkill**: Static, rarely-changed batch configurations with clear performance budgets.

### Pattern: Benchmark-Driven Configuration

Milvus chose `defaultRegisterBuf=256` from benchmark A/B runs at `internal/util/cgo/manager_active.go:17`. VictoriaMetrics documents regex match costs from `BenchmarkOptimizedReMatchCost` at `lib/storage/tag_filters.go:634`. This contrasts with cli's hardcoded `per_page=100` at `pkg/cmd/run/shared/artifacts.go:28` with no evidence of tuning. Benchmark-driven config avoids both over-engineering (complex autoscaling for simple workloads) and under-engineering (static values for variable workloads).

**When to use**: For hot path parameters where workload characteristics dominate.

**When overkill**: Rarely-called paths; configuration values that change infrequently.

### Pattern: Stack Allocation in Hot Loops

nats-server pre-allocates `subj [256]byte` and `msg [4096]byte` on the stack at `server/sendq.go:54-62`, reusing them across iterations. openfga pre-sizes slices with `make([]string, 0, p.size)` at `internal/listobjects/pipeline/internal/worker/core.go:130`. This avoids heap allocation entirely for small, predictable buffers. The benefit is zero GC pressure for hot paths; the cost is stack pressure on goroutines with deep call chains.

**When to use**: Hot loops processing small, fixed-size structures.

**When overkill**: Variable-size data; deep recursion; functions called from many call sites.

### Pattern: Channel-Based Pooling

openfga's `MessagePool` uses channels instead of sync.Pool at `internal/listobjects/pipeline/internal/worker/core.go:95-145`. The comment states this avoids GC thrashing because channel-based items are "strong references that are not subject to garbage collection between GC cycles." This pattern is appropriate when predictability matters more than memory efficiency.

**When to use**: Predictable high-frequency allocation patterns; systems where GC pauses are observable.

**When overkill**: Low-frequency allocations; situations where memory efficiency matters more.

## Key Differences

### Why nats-server and VictoriaMetrics Score Highest

Both systems treat resource discipline as a first-class concern, not an optimization to add later. nats-server implements four size-tiered block pools and three network buffer tiers; VictoriaMetrics implements ten leveled pools. Both expose profiling endpoints in production paths and maintain extensive benchmark suites (nats-server: `test/bench_test.go` with 100+ benchmarks; VictoriaMetrics: 474 benchmark tests). The combination of systematic pooling, embedded profiling, and benchmark culture produces the highest scores.

### Why cli Scores Lowest

cli demonstrates adequate streaming I/O via `io.Copy` and reasonable pagination with `per_page=100`, but lacks any object pooling, has only two benchmark tests (both for documentation generation, not data paths), and has no pprof integration. The codebase uses idiomatic Go patterns that are readable but unoptimized. This is appropriate for a CLI tool where throughput is bounded by human interaction speed, but it would be inadequate for a high-throughput service.

### Why openfga Uses Channels Instead of sync.Pool

openfga's `MessagePool` at `internal/listobjects/pipeline/internal/worker/core.go:95-145` uses channel-based pooling to avoid GC pressure on hot paths. The comment explicitly acknowledges the tradeoff: channel-based items are stronger references that survive GC cycles. This differs from most other systems that use sync.Pool, suggesting openfGA's engineers observed GC thrashing in benchmarks and chose predictability over memory efficiency.

### Why kubernetes Prioritizes Opportunistic Batching

The scheduler's `batch.go:57-59` caches filtering/scoring results for pods with identical signatures, reusing node scores across consecutive pods. This is a workload-specific optimization for batch-scheduled workloads where many pods share the same constraints. It would be inappropriate for a system with highly heterogeneous pod requirements, demonstrating that optimization choices are workload-driven, not universal.

### Why milvus Uses jemalloc

Milvus has a C++ core (tantivy for search) that must coexist with Go's memory management. jemalloc provides unified memory visibility across the boundary and reduces fragmentation in long-running C++ processes. The 10s TTL on jemalloc stats at `internal/util/metrics/c_registry.go:124` balances accuracy against C call frequency. This is a legitimate response to hybrid language constraints, not an over-engineering choice.

## Tradeoffs

### Pool Size vs Memory Pressure

All sync.Pool implementations carry inherent risk: pools grow under load and only shrink when GC runs. nats-server mitigates with `ipqMaxRecycleSize` checks at `server/ipqueue.go:226-228`. VictoriaMetrics mitigates with size detoxification. kubernetes mitigates with 3MB caps on CBOR buffers at `staging/src/k8s.io/apimachinery/pkg/runtime/serializer/cbor/internal/modes/buffers.go:24`. grafana and pocketbase have no documented mitigations, leaving them vulnerable to pool bloat under sustained high load.

### Batching Latency vs Throughput

Time-based batching (Temporal's MinDelay=100ms, MaxDelay=500ms; VictoriaMetrics' pendingRowsFlushInterval=2s) improves throughput but adds latency for sparse traffic. Systems that need low latency for small requests (like openfga's ListObjects) prefer count-based batching with small defaults (ChunkSize=100). Systems that prioritize throughput over latency (like VictoriaMetrics for metrics ingestion) prefer time-based batching. No system implements adaptive batch sizing based on observed latency/throughput feedback.

### Streaming vs Buffering at I/O Boundaries

nats-server's handwritten parser at `server/parser.go:24-36` avoids bufio overhead in the hot path, but adds complexity and maintenance burden. VictoriaMetrics uses bufio.Reader/Writer pools for file I/O at `lib/filestream/filestream.go:185,346`, which is simpler but introduces buffered I/O abstraction costs. The choice depends on whether raw performance (nats-server) or maintainability (VictoriaMetrics) is prioritized.

### Slice Reuse vs Explicit Pooling

Temporal uses slice reset (`items[:0]`) at `common/stream_batcher/batcher.go:111-113` rather than sync.Pool, generating more garbage but avoiding pool fragmentation. openfga uses channel-based pooling for hot paths but falls back to heap allocation for less frequent operations. The tradeoff is code simplicity vs GC pressure. Temporal's choice is sensible for moderate throughput; VictoriaMetrics' pooling is necessary for 474 benchmarks worth of hot paths.

### Serializable Transactions for Batching

Kubernetes uses `sql.LevelSerializable` for sequence batch allocation at `staging/src/k8s.io/apimachinery/pkg/runtime/allocator.go:79`, preventing conflicts but increasing database overhead. Other systems use optimistic approaches with retry. Serializable isolation is appropriate when contention is low and correctness matters more than throughput; optimistic approaches scale better under contention but require retry logic.

## Decision Guide

**Choose size-tiered pools when**: Buffer sizes vary dramatically (256KB to 64MB in nats-server); memory efficiency matters; fragmentation from generic pools is observed.

**Choose streaming architecture when**: Result set sizes are unbounded; latency matters more than throughput; memory pressure is a concern. openfGA's pipeline, Temporal's stream_batcher, and VictoriaMetrics' stream parsers all demonstrate this.

**Choose time-based batching when**: Throughput is primary goal; latency for sparse traffic is acceptable; data is append-only (metrics, logs). VictoriaMetrics' 2s flush interval and Temporal's MaxDelay=500ms exemplify this.

**Choose count-based batching when**: Low latency is required; traffic is sparse or variable; individual operation atomicity matters. openfGA's ChunkSize=100 and cli's per_page=100 exemplify this.

**Choose hybrid memory/disk buffering when**: Request sizes vary widely; memory exhaustion is a concern; disk is available. PocketBase's bufferWithFile with 16MB threshold is the exemplar.

**Choose jemalloc when**: Significant C++ components exist; unified memory visibility is needed; fragmentation in native code is observed.

## Practical Tips

1. **Reset pooled objects before return**: Every high-performing system does this. Without reset, stale data leaks and pool efficiency degrades.

2. **Use size-tiered pools for variable-size buffers**: Don't use a single pool for 256KB and 64MB buffers. The fragmentation will waste memory.

3. **Instrument batch boundaries with metrics**: Track batch sizes, flush intervals, and dropped items. Without metrics, misconfigured batches go undetected until production failures.

4. **Benchmark hot path parameters**: Milvus' `defaultRegisterBuf=256` and VictoriaMetrics' regex cost tables show the value of data-driven configuration.

5. **Expose pprof in production paths**: kubernetes, nats-server, VictoriaMetrics, and milvus all expose profiling endpoints. Temporal and openfga make it configurable. grafana and pocketbase treat it as afterthought.

6. **Use sync.Pool for objects allocated > 1000/sec**: Below this threshold, GC is not a concern. Above it, pooling becomes necessary.

7. **Pre-allocate buffers with size hints**: `make([]byte, 0, 128)` as seen in grafana's converter avoids slice growth during iteration.

8. **Set batch size limits and enforce them**: Every bounded queue system in this study (nats-server, openfga, kubernetes) has explicit limits. Unbounded queues cause OOM.

## Anti-Patterns / Caution Signs

**No pooling in hot paths**: cli creates fresh `bytes.Buffer` instances at `pkg/cmd/run/watch/watch.go:159` in hot watch loops. grafana has 185+ fresh buffer allocations. This generates GC pressure that limits scalability.

**No benchmark coverage for data paths**: cli benchmarks documentation generation, not API pagination or JSON rendering — the actual hot paths. Temporal and pocketbase have dormant benchmark infrastructure. Without benchmarks, performance regressions go undetected.

**No profiling in production**: pocketbase has pprof as an indirect dependency only. grafana imports pprof but doesn't explicitly instrument hot paths. If you can't profile production, you can't debug production issues.

**Hardcoded batch sizes without tuning**: cli hardcodes `per_page=100` everywhere. grafana uses fixed 100-item sequences. Without benchmarking, these values may be far from optimal for the actual workload.

**No pool detoxification**: Buffers that grow beyond pool nominal size get returned with excess capacity, causing steady-state memory growth. kubernetes and VictoriaMetrics address this; grafana and pocketbase do not.

**No memory pressure detection**: Only VictoriaMetrics and Milvus expose memory metrics (jemalloc stats, runtime.MemStats). Most systems have no way to detect that they're approaching memory limits before OOM.

## Notable Absences

**Continuous profiling in CI**: No system implements Pyroscope or Parca for always-on profiling. pprof is available on-demand in most systems, but not continuously collected.

**Automatic batch tuning**: All batch sizes are statically configured. No system adapts batch sizes based on observed latency, throughput, or memory pressure.

**Zero-copy slice reuse in query paths**: VictoriaMetrics marshals into fresh buffers rather than reusing from a pool at `lib/storage/raw_row.go`. Temporal and openfga have similar patterns. True zero-copy requires arena/zone allocation not seen in these sources.

**Memory-limited queues**: Despite thousands of "batch" mentions across sources, no bounded queue implementation with explicit memory controls was found. Limits are count-based (nats-server `ipqLimitByLen`) or size-based (nats-server `ipqLimitBySize`), not both.

**Hard memory limits per component**: VictoriaMetrics uses `memory.Allowed()` for buffer sizing but has no enforcement mechanism. A malicious client can exceed memory limits temporarily before decompression size checks.

## Per-Source Notes

**cli (5/10)**: Streaming I/O is adequate; pagination is reasonable; retry backoff is solid. But no pooling, minimal benchmarks, no pprof. Appropriate for CLI tool; would be inadequate for high-throughput service.

**grafana (6/10)**: Good pre-allocated buffer patterns in InfluxDB; gzip writer pool is well-implemented. But inconsistent pooling (185+ fresh buffers elsewhere), sparse benchmarking, pprof imported but not instrumented. Could improve with systematic pooling rollout.

**kubernetes (8/10)**: Opportunistic scheduler batching is sophisticated; size-tiered pools for CBOR/gzip; comprehensive scheduler_perf with 5000-node support. Gaps in watch cache buffering and automatic pprof enablement. Strong reference implementation.

**milvus (7/10)**: Excellent jemalloc integration for C++ core visibility; sync.Pool across lexer, segment, logging; extensive 138-benchmark suite. CGO boundary introduces overhead; bulk import still allocates 64MB proportional to schema width.

**nats-server (9/10)**: Size-tiered pools (4 block + 3 network tiers) are exemplar; bounded queues with backpressure; batch publishing with flow control; lock-free fastrand. Minor gap: no CI-based regression gates. Near-perfect implementation.

**openfga (8/10)**: Channel-based pooling to avoid GC thrashing; MPMC queue for bounded growth; streaming pipeline avoids buffering entire result sets. Gaps in automatic batch tuning and production pprof visibility. Strong for permission-checking workloads.

**pocketbase (6/10)**: Smart hybrid `bufferWithFile` for request bodies; sync.Pool for gzip; chunked realtime broadcasting. Profiling is an afterthought; benchmark culture dormant; no pprof endpoints. Room for improvement in observability.

**temporal (6/10)**: LRU cache with eviction, stream batcher with time controls, slice reuse, lock-free atomics. No sync.Pool; no CI-based benchmarks; pprof exists but not in hot paths. Solid foundations, missing optimization.

**victoriametrics (9/10)**: 10-tiered buffer pool prevents fragmentation; streaming parsers with concurrent unmarshal; 474 benchmark tests; auth-protected pprof. Gaps in hard pool limits and decompressed size enforcement. Highest-performing system studied.

## Open Questions

1. **Why doesn't Temporal use sync.Pool?** The stream_batcher uses slice reuse instead. Is this a conscious decision based on profiling, or an oversight? The codebase has benchmarks but no evidence of pool-vs-slice profiling comparison.

2. **Why doesn't openfga use sync.Pool for hot paths?** The channel-based `MessagePool` trades memory efficiency for GC predictability. What benchmark evidence led to this choice? Could a hybrid approach (sync.Pool for non-hot paths, channels for hot paths) work better?

3. **How were hardcoded batch sizes determined?** cli's `per_page=100`, openfga's `ChunkSize=100`, kubernetes' RealFIFO `batchSize=1000`, Temporal's `RangeSize=100000`. No source documents the benchmarking that led to these values. Empirical data would strengthen confidence.

4. **Should pools have hard memory limits?** VictoriaMetrics' pools can grow until GC; kubernetes' CBOR pool caps at 3MB. VictoriaMetrics has no hard limit. Is this a gap? Under sustained high load with variable buffer sizes, could memory grow unboundedly?

5. **Why is continuous profiling absent from all sources?** Pyroscope and Parca are established tools for always-on profiling. No source integrates them. Is this a visibility gap, or is on-demand pprof sufficient for these workloads?

## Evidence Index

Every evidence reference in this report follows the `path/to/file.ts:NN` format.

**cli**:
- `pkg/cmd/run/download/http.go:57` — io.Copy streaming
- `pkg/cmd/api/pagination.go:114-150` — paginatedArrayReader with single-byte cache
- `pkg/cmd/api/pagination.go:171` — 4069-byte buffer in ReadFrom loop
- `pkg/cmd/run/shared/artifacts.go:28` — per_page=100 pagination
- `internal/codespaces/codespaces.go:18-22` — exponential backoff

**grafana**:
- `pkg/tsdb/azuremonitor/loganalytics/azure-log-analytics-datasource.go:889` — sync.Pool for gzip writer
- `pkg/infra/log/term/terminal_logger.go:239` — stringBufPool
- `pkg/tsdb/influxdb/influxql/converter/converter.go:118` — pre-allocated frameName buffer
- `pkg/tsdb/cloudwatch/time_series_query.go:59-69` — batch queries with feature toggle
- `pkg/cmd/grafana-server/commands/cli.go:6` — pprof import

**kubernetes**:
- `staging/src/k8s.io/apimachinery/pkg/runtime/allocator.go:35` — AllocatorPool
- `staging/src/k8s.io/apimachinery/pkg/runtime/serializer/cbor/internal/modes/buffers.go:24-62` — BufferProvider with 3MB cap
- `pkg/scheduler/framework/runtime/batch.go:57-59` — maxBatchAge=500ms
- `staging/src/k8s.io/client-go/tools/cache/the_real_fifo.go:503` — pre-allocated delta slices
- `test/integration/scheduler_perf/scheduler_perf.go:712` — 5000-node benchmark

**milvus**:
- `internal/parser/planparserv2/pool.go:12-22` — lexer/parser sync.Pool
- `internal/util/cgo/manager_active.go:17` — defaultRegisterBuf=256 from A/B runs
- `internal/util/segcore/jemalloc_stats.go:26-49` — comprehensive jemalloc stats
- `internal/storagev2/packed/constant.go:19-25` — 32MB buffer sizes
- `internal/http/server.go:294-297` — pprof with mutex/block profiling

**nats-server**:
- `server/filestore.go:1000-1023` — size-tiered block pools
- `server/client.go:368-387` — network buffer pools (3 tiers)
- `server/parser.go:35` — pre-allocated argsa array
- `server/jetstream_batching.go:49-61` — fastBatch with flow control
- `server/ipqueue.go:68-81` — ipqLimitByLen and ipqLimitBySize

**openfga**:
- `internal/planner/planner.go:15` — RNG pool
- `internal/listobjects/pipeline/internal/worker/core.go:95-145` — MessagePool with channels
- `internal/containers/mpmc/queue.go:27-42` — bounded MPMC queue
- `pkg/storage/storage.go:17` — DefaultMaxTuplesPerWrite=100
- `internal/listobjects/pipeline/pipeline.go:32-34` — Receiver[T] streaming interface

**pocketbase**:
- `apis/middlewares_gzip.go:70-78` — sync.Pool for gzip writer
- `tools/router/buffer_with_file.go:28-33` — hybrid memory/disk buffer
- `tools/logger/batch_handler.go:32-34` — BatchSize=100
- `apis/realtime.go:26` — clientsChunkSize=150
- `go.mod:34` — pprof as indirect dependency only

**temporal**:
- `common/cache/lru.go:30-47` — concurrent LRU with TTL
- `common/stream_batcher/batcher.go:31-43` — stream batcher config
- `common/stream_batcher/batcher.go:111-113` — slice reuse pattern
- `service/matching/config.go:282` — RangeSize=100000
- `common/pprof/pprof.go:56-64` — atomic once pprof initialization

**victoriametrics**:
- `lib/leveledbytebufferpool/pool.go:20` — 10-tiered buffer pool
- `lib/filestream/filestream.go:185,346` — bufio.Reader/Writer pools
- `lib/storage/partition.go:49-72` — pendingRowsFlushInterval=2s, maxRawRowsPerShard=8MB
- `lib/protoparser/prometheus/stream/streamparser.go:80` — streaming parser
- `lib/httpserver/httpserver.go:447-552` — pprof endpoints with auth protection

---

Generated by dimension `15-performance-resource-discipline.md`.