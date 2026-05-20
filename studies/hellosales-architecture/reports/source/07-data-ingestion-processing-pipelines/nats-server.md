# Source Analysis: nats-server

## Data Ingestion & Processing Pipelines

### Source Info

| Field | Value |
|-------|-------|
| Name | nats-server |
| Path | `sources/nats-server` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

NATS-server implements a sophisticated multi-stage data ingestion and processing pipeline. Raw data enters through TCP socket `readLoop()` in `server/client.go:1377`, passes through a state-machine protocol parser (`server/parser.go:137`), undergoes validation (permissions, size limits, message tracing), and is delivered via subscription matching. JetStream adds durable streaming with batching, flow control, and partial batch recovery. Buffer management uses pooled sizes (512/4096/65536 bytes), dynamic resizing, and net.Buffers for vectored I/O. Backpressure is implemented via slow-consumer detection (pending bytes limit), stall mechanisms, and write timeouts.

## Rating

**8/10** — Excellent implementation with minor gaps. The pipeline is well-architected with comprehensive validation, efficient buffer management, and robust backpressure. Gaps: no per-message schema validation at ingestion; limited observability (no structured tracing spans per stage); pipeline stages are not independently deployable.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Ingestion entry point | `readLoop()` reads TCP data into buffers, starts at `client.go:1377` | `server/client.go:1377-1617` |
| Protocol parsing | State-machine parser with states for OP_START, PUB, MSG, CONNECT, etc. | `server/parser.go:57-135` |
| Message validation | Permission checking via `c.perms.pub.allow/deny` | `server/client.go:4300-4307` |
| Max control line protection | `overMaxControlLineLimit()` enforces 4KB (clients) / 64KB (routes) limits | `server/parser.go:1257-1279` |
| Buffer management | Pooled sizes: 512/4096/65536 bytes via `nbPoolSizeSmall/Medium/Large` | `server/ipqueue.go:364-367` |
| Dynamic buffer sizing | Grows to max 65536, shrinks based on utilization | `server/client.go:1566-1581` |
| Backpressure - slow consumer | `c.out.pb > c.out.mp` check triggers connection close | `server/client.go:2513-2539` |
| Backpressure - stall | Stall channel created at 75% of max pending | `server/client.go:2533-2539` |
| Backpressure - write timeout | `handleWriteTimeout()` closes or marks slow consumer | `server/client.go:1862-1920` |
| Message delivery | `deliverMsg()` queues to outbound buffer and adds to pending flush | `server/client.go:3656-3930` |
| Subscription matching | Sublist `Match()` for subject-based routing | `server/client.go:4401` |
| JetStream batching | `fastBatch` with flow control, `atomicBatch` for atomic commits | `server/jetstream_batching.go:49-61,43-47` |
| Batch recovery | Partial batch restoration via batchId/batchSeq in stream recovery | `server/jetstream.go:1550-1620` |
| Flow control | Dynamic ramp up/down of ackMessages based on catchup | `server/jetstream_batching.go:274-317` |
| Outbound flush | `flushOutbound()` uses `net.Buffers.WriteTo()` for vectored I/O | `server/client.go:1636-1859` |
| Split buffer handling | `argBuf`/`msgBuf` hold state across buffer boundaries | `server/parser.go:1182-1230` |
| Client kinds | CLIENT/ROUTER/GATEWAY/SYSTEM/LEAF/JETSTREAM/ACCOUNT constants | `server/client.go:44-60` |
| JetStream config | MaxMemory, MaxStore, StoreDir, SyncInterval config | `server/jetstream.go:41-53` |

## Answers to Dimension Questions

### 1. How does raw data become trustworthy structured data?

**Ingestion pipeline stages:**
1. TCP read via `readLoop()` (`client.go:1377`) — raw bytes into buffer
2. Protocol parser state machine (`parser.go:137`) — parses OP_PUB, OP_MSG, CONNECT, etc.
3. Size validation via `overMaxControlLineLimit()` (`parser.go:1257`)
4. Permission checks via `c.perms.pub.allow/deny` (`client.go:4300`)
5. Message trace destination validation from headers (`client.go:4308-4314`)
6. Gateway reply mapping (`client.go:4341-4352`)
7. Remote latency tracking setup (`client.go:4356-4375`)
8. Subscription matching via sublist (`client.go:4401`)

**No schema validation** — NATS treats messages as opaque bytes. Trust is established through authentication (CONNECT protocol), authorization (permissions), and size limits. No per-message schema or type checking.

### 2. What happens when a pipeline stage fails mid-batch?

**Mid-batch failure handling:**
- Parse errors: `c.sendErr("Unknown Protocol Operation")` + connection close (`parser.go:1234-1242`)
- Split buffers: `argBuf`/`msgBuf` preserve parser state across buffer boundaries (`parser.go:1182-1230`)
- JetStream batch recovery: checks `batchId`/`batchSeq` from message headers to restore partial batches (`jetstream.go:1550-1620`)
- Slow consumer: marks connection or closes based on `MaxPending` exceeded (`client.go:2513-2539`)
- Write timeout: closes CLIENT connections, marks others as slow consumer (`client.go:1862-1920`)

**No atomic rollback** — If delivery to a subscriber fails mid-batch, NATS does not roll back. Messages are delivered independently; the consumer handles failures via acknowledgment modes (no-ack, ack-all, ack-last).

### 3. How is data quality validated at each pipeline stage?

| Stage | Validation | File:Line |
|-------|------------|-----------|
| Ingestion | Max control line (4KB clients, 64KB routes) | `parser.go:1257-1279` |
| Auth | CONNECT protocol validation, auth violation handler | `parser.go:1234` |
| Permissions | pub/sub allow/deny lists | `client.go:4300-4307` |
| Per-message headers | `Nats-Msg-Id` deduplication, `ExpectedLastSeq` checks | `jetstream_batching.go:525-1024` |
| Message size | `overMaxControlLineLimit()` on msg payload | `parser.go:1257-1279` |
| JetStream | Strict JSON parsing if configured, batch header validation | `jetstream.go:47`, `jetstream_batching.go:525` |

**Gap**: No content-type validation, no schema validation, no message-level checksums.

### 4. How does the pipeline scale with data volume without OOM?

**Memory management strategies:**
1. **Pooled buffers** — `nbPoolSizeSmall/Medium/Large` (512/4096/65536) via `sync.Pool` (`ipqueue.go:364-367`)
2. **Dynamic buffer sizing** — grows to max 65536, shrinks when underutilized (`client.go:1566-1581`)
3. **net.Buffers vectored I/O** — avoids copies, uses scatter/gather (`client.go:1636-1859`)
4. **Pending flush list** — batches deliveries, not per-message (`client.go:3656-3930`)
5. **ipQueue with in-progress counter** — prevents queue overflow (`ipqueue.go:25-36`)
6. **JetStream storage limits** — MaxMemory/MaxStore bounds (`jetstream.go:41-53`)
7. **Max pending bytes per client** — `c.out.mp` slow consumer limit (`client.go:2513`)

**No evidence** of backpressure signaling to producers (e.g., protocol-level flow control or 503 responses on backpressure).

### 5. Can pipeline stages be independently deployed or scaled?

**No.** Pipeline stages are tightly coupled within the single `client` struct:
- Parser, validator, dispatcher are all methods on `client` (`client.go:4249-4260`)
- No pluggable stage architecture
- No worker pools per stage
- Subscription matching is done inline within the client goroutine

**However**, JetStream consumers support **consumer groups** for load balancing across instances. Routes enable **horizontal scaling** via clustering. Leaf nodes enable **topology extension** but not stage isolation.

## Architectural Decisions

1. **State-machine parser over streaming parser** — chosen for efficiency, avoids reflection, handles split buffers cleanly (`parser.go:57-135`)
2. **Opaque messages** — NATS does not interpret message content; trust comes from auth/authz, not content validation
3. **In-memory delivery with optional persistence** — core NATS is in-memory; JetStream adds durability as a separate layer
4. **Subscription matching at publish time** — matches when message is sent, not when received; eliminates need for broker-side queuing
5. **Per-client goroutine model** — each client runs its own readLoop and writeLoop goroutines; simple but limits scale per instance
6. **Split buffer handling via clone** — pubArg cloned across buffer boundaries to preserve parser state (`parser.go:1182-1230`)

## Notable Patterns

- **zero-copy delivery**: Uses `net.Buffers` (scatter/gather I/O) to avoid copying between kernel and user space (`client.go:1636-1859`)
- **pooled memory**: `sync.Pool` for buffers at fixed sizes reduces GC pressure (`ipqueue.go:364-367`)
- **stall semaphores**: Channels used as semaphores for write coordination (`client.go:2533-2539`)
- **sublist radix tree**: O(1) subscription matching via `stree` radix tree implementation (`server/sublist.go`)
- **dynamic flow control**: JetStream batch ack frequency ramps up/down based on catchup progress (`jetstream_batching.go:274-317`)
- **parse state machine**: Centralized `parse()` function with explicit state transitions handles all protocol variants (`parser.go:137-1243`)

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| Opaque messages | Simplicity, no schema coupling; downside: no content validation |
| Per-client goroutines | Simple implementation; downside: goroutine count scales with connections, not cores |
| In-memory default | Low latency; downside: data loss on crash without JetStream |
| No per-stage backpressure | Fast producers not throttled; downside: slow consumers trigger connection close, not flow control |
| Central parse state machine | Predictable performance; downside: adding new protocol ops requires parser changes |
| Subscription matching at publish | No broker-side queuing overhead; downside: matching cost paid at publish time |

## Failure Modes / Edge Cases

1. **Slow consumer close** — Client exceeds `MaxPending` bytes, connection closed (`client.go:2513-2539`)
2. **Stall deadlock** — Stall channel created but timeout not handled, blocks delivery (`client.go:3613-3651`)
3. **Write timeout** — Partial write leaves connection in inconsistent state (`client.go:1862-1920`)
4. **Split buffer message** — Large message spans multiple read buffers; `msgBuf` handles continuation (`parser.go:1182-1230`)
5. **Max control line exceeded** — Oversized control line triggers immediate close (`parser.go:1257-1279`)
6. **Malformed protocol** — Unknown operation triggers close + error to client (`parser.go:1234-1242`)
7. **JetStream partial batch** — Crash during batch leaves partial state; recovered via batchId/batchSeq (`jetstream.go:1550-1620`)
8. **Auth violation** — Invalid credentials trigger close, no retry mechanism (`parser.go:1234`)
9. **Subscription limit exceeded** — `sub.max > 0 && sub.nm >= sub.max` triggers auto-unsubscribe (`client.go:3656-3930`)

## Future Considerations

1. **Schema validation layer** — Could add optional schema registry at ingestion for content validation
2. **Per-stage backpressure** — Signal producers with 503 orFLOW control when internal queues are saturated
3. **Tracing spans per stage** — Add OpenTelemetry-style spans for observability across pipeline stages
4. **Pluggable pipeline stages** — Architecture change needed to support independent deployment of validate/transform/enrich stages
5. **Connection pooling** — For high-volume clients, could use pooled connections instead of 1:1 goroutine per connection

## Questions / Gaps

1. **No evidence** of distributed tracing across pipeline stages — no correlation IDs or trace context propagation
2. **No evidence** of per-stage latency metrics — only aggregate connection-level metrics available
3. **No evidence** of circuit breakers for downstream failures — subscriber failures propagate as connection closes
4. **No evidence** of message-level checksums or integrity verification
5. **No evidence** of pipeline observability hooks — cannot observe internal queue depths or processing delays per stage

---

Generated by `dimensions/07-data-ingestion-processing-pipelines.md` against `nats-server`.