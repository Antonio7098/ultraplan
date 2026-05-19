# Source Analysis: nats-server

## Background Jobs & Async Workflows

### Source Info

| Field | Value |
|-------|-------|
| Name | nats-server |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/nats-server` |
| Language / Stack | Go |
| Analyzed | 2026-05-19 |

## Summary

nats-server is a high-performance message broker implementing the NATS protocol. Its JetStream subsystem provides durable stream storage and consumer-based job processing with built-in acknowledgement, retry, and delivery semantics. The architecture uses subjects (not queues) for job routing, pull-based consumers for work distribution, and advertises advisories for max delivery scenarios. Scheduling is supported via message headers and a hash-wheel timer implementation. No native workflow orchestration engine exists—multi-step workflows must be composed by clients using streams as state store.

## Rating

**6/10** — Good implementation with gaps

JetStream provides solid foundation for job queues with durable streams, consumer groups, and acknowledgment mechanics. However, critical gaps exist: no native dead-letter queue (DLQ) mechanism, no built-in workflow orchestration or saga pattern support, retry policies are limited to simple backoff arrays without jitter, and backpressure relies on slow-consumer disconnect semantics rather than proactive signaling.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Stream Config | `StreamConfig` struct with `Retention`, `MaxMsgs`, `MaxBytes`, `MaxAge`, `Discard` | `server/stream.go:50-130` |
| Consumer Config | `ConsumerConfig` struct with `MaxDeliver`, `BackOff`, `AckWait`, `AckPolicy` | `server/consumer.go:88-141` |
| Retry/Backoff | `BackOff []time.Duration` array in `ConsumerConfig` | `server/consumer.go:98` |
| Max Deliver | `MaxDeliver int` with `-1` for infinite, `hasMaxDeliveries()` check | `server/consumer.go:97,2331` |
| Ack Policies | `AckNone`, `AckAll`, `AckExplicit`, `AckFlowControl` constants | `server/consumer.go:333-341` |
| Max Deliveries Advisory | `JSConsumerDeliveryExceededAdvisory` published when threshold hit | `server/jetstream_events.go:120-132` |
| Delivery Exceeded Handler | `notifyDeliveryExceeded()` at `server/consumer.go:4718` | `server/consumer.go:4718-4723` |
| Pending Timer | `checkPending()` manages redelivery with backoff timing | `server/consumer.go:5927-6044` |
| Redelivery Queue | `rdq []uint64` and `addToRedeliverQueue()` for failed deliveries | `server/consumer.go:470,2872-2904` |
| Retention Policies | `LimitsPolicy`, `InterestPolicy`, `WorkQueuePolicy` | `server/store.go:143-149` |
| Stream/Consumer Limits | `JetStreamAccountLimits` with `MaxAckPending` | `server/jetstream.go:66-75` |
| Backoff Calculation | `ackWait()` returns configured backoff or default `AckWait` | `server/consumer.go:2198,5808` |
| Flow Control | `AckFlowControl` policy with `FlowControl bool` and heartbeats | `server/consumer.go:106,340-341` |
| Message Scheduling | `MsgScheduling` struct with hash-wheel timer | `server/scheduler.go:35-44` |
| Cron Parser | `parseCron()` for 6-field cron patterns | `server/cron.go:48-150` |
| ipQueue Backpressure | `ipqLimitBySize()` and `ipqLimitByLen()` with errIPQLenLimitReached | `server/ipqueue.go:64-84` |
| Slow Consumer Tracking | `isSlowConsumer` flag and `SlowConsumersStats` | `server/client.go:155,1442-1447` |
| Pull Consumer | Pull-based subscription with `nextMsgReqs *ipQueue[*nextMsgReq]` | `server/consumer.go:456` |
| Consumer Defaults | `JsAckWaitDefault = 30 * time.Second`, `JsDefaultMaxAckPending = 1000` | `server/consumer.go:569-580` |

## Answers to Dimension Questions

### 1. How are background jobs submitted, tracked, and completed?

**Jobs are submitted by publishing messages to NATS subjects.** The JetStream API uses subject-based routing (e.g., `$JS.API.STREAM.CREATE.*`) rather than HTTP REST. Messages are stored in streams with configurable retention policies (`LimitsPolicy`, `InterestPolicy`, `WorkQueuePolicy`).

**Tracking is done via consumer state:**
- `pending map[uint64]*Pending` tracks unacknowledged messages (`server/consumer.go:467`)
- `rdq []uint64` tracks sequences due for redelivery (`server/consumer.go:470`)
- `rdc map[uint64]uint64` tracks delivery count per sequence (`server/consumer.go:472`)

**Completion via acknowledgements:**
- Consumers send `+ACK` to acknowledge successful processing (`server/consumer.go:382`)
- `AckExplicit` policy requires explicit ack/nak for each message
- `AckAll` auto-acks all sequences below the acknowledged sequence
- `processAckMsg()` at `server/consumer.go:4850+` handles ack processing

**Submission flow:**
1. Client publishes to stream subject → stored in stream
2. Pull consumer requests messages via `JSApiRequestNextT` subject
3. Server delivers message with reply subject containing delivery metadata
4. Client processes and sends ack to reply subject

### 2. What happens when a job fails — retry, dead-letter, or compensate?

**Retry via `MaxDeliver` and `BackOff`:**
- `MaxDeliver` (default `-1` = infinite) sets maximum delivery attempts (`server/consumer.go:586-590`)
- `BackOff []time.Duration` defines progressive delays between retries (`server/consumer.go:98`)
- `checkPending()` at `server/consumer.go:5927` manages pending message timers with backoff
- On delivery expiration, message is added to redelivery queue: `addToRedeliverQueue()` (`server/consumer.go:2872`)

**Dead-letter handling:**
- **No native DLQ exists.** When `hasMaxDeliveries()` at `server/consumer.go:2331` returns true (delivery count >= maxdc), the message is removed from pending and advisory is published
- `JSConsumerDeliveryExceededAdvisory` at `server/jetstream_events.go:120-132` notifies that a message hit its max delivery threshold
- Clients must implement their own DLQ pattern (e.g., create a stream for failed messages and route there explicitly)

**Compensate:**
- No built-in compensation/saga pattern
- `AckTerm` (+TERM) terminates message delivery without re-queue (`server/consumer.go:392`)
- `Nak` (-NAK) with optional delay triggers immediate redelivery (`server/consumer.go:386`)

### 3. How does the system handle job duration limits and cancellation?

**Duration limits via `AckWait`:**
- `AckWait time.Duration` sets the timeout before unacknowledged message is redelivered (`server/consumer.go:96`)
- Default `JsAckWaitDefault = 30 * time.Second` (`server/consumer.go:569`)
- `checkPending()` evaluates elapsed time vs deadline: `elapsed >= deadline` triggers redelivery (`server/consumer.go:5997`)

**Cancellation:**
- `Consumer.Direct bool` field marks direct consumers that bypass meta-controller (`server/consumer.go:128`)
- `InactiveThreshold` deletes ephemeral consumers after inactivity (`server/consumer.go:120`)
- No user-facing job cancellation API; relies on consumer delete via `$JS.API.CONSUMER.DELETE.*.*`

**No job duration limits:**
- No timeout on total job processing time (only per-message AckWait)
- Consumer can run indefinitely; cleanup is only via explicit delete or inactivity threshold

### 4. Are workflows composed of multiple steps with state management?

**No native workflow/orchestration engine.** The system provides primitives but no built-in multi-step workflow composition.

**State primitives available:**
- Streams serve as durable state store with `RetentionPolicy` controlling message lifecycle
- `InterestPolicy` removes messages after all consumers acknowledge (`server/store.go:146`)
- `WorkQueuePolicy` removes message after first consumer acknowledges (`server/store.go:148`)
- Consumer position tracked via `sseq` (stream sequence), `dseq` (delivered sequence), `adflr`/`asflr` (ack floors) (`server/consumer.go:430-435`)

**Client-side composition required:**
- Multi-step workflows must be implemented by clients subscribing to output subjects of prior steps
- No DAG execution engine, no saga coordinator, no parent-child workflow concept
- Stream sourcing (`Mirror`, `Sources` in `StreamConfig`) allows fan-out patterns (`server/stream.go:69-70`)
- No evidence found of workflow state machine implementation

### 5. How is backpressure applied when the system is overloaded?

**Slow consumer disconnect:**
- Client connections marked as `isSlowConsumer` when outbound write blocks (`server/client.go:155,1862`)
- `writeDeadline` triggers slow consumer handling in `flushOutbound()` (`server/client.go:1853-1889`)
- `NumSlowConsumers` tracked in server metrics (`server/monitor.go:1282`)

**Consumer-level backpressure:**
- `MaxAckPending` limits unacknowledged messages per consumer (`server/consumer.go:105`)
- Default `JsDefaultMaxAckPending = 1000` (`server/consumer.go:577`)
- `MaxWaiting` limits concurrent pull requests (`server/consumer.go:104`)
- When pending reaches `maxp`, `signalNewMessages()` may be triggered (`server/consumer.go:2342`)

**ipQueue backpressure:**
- Internal queues support `ipqLimitBySize()` and `ipqLimitByLen()` options (`server/ipqueue.go:68-80`)
- `errIPQLenLimitReached` and `errIPQSizeLimitReached` returned when limits hit
- Not exposed as public API for external job queuing

**Flow control for push consumers:**
- `FlowControl bool` in consumer config enables heartbeat-based flow control (`server/consumer.go:106`)
- Requires `Heartbeat` duration when `FlowControl: true` (`server/jetstream_errors.go:314`)
- `AckFlowControl` ack policy functions like `AckAll` but acks based on flow control responses (`server/consumer.go:340-341`)

## Architectural Decisions

1. **Subject-based routing over queue-based**: JetStream uses NATS subjects for job routing, not traditional queue names. Jobs are published to subjects, consumers subscribe. This aligns with NATS philosophy but differs from RabbitMQ/AMQP mental model.

2. **Pull-based consumers as primary workload interface**: Pull consumers (`DeliverSubject == _EMPTY_`) are the primary work distribution mechanism. Workers request messages rather than having messages pushed. This enables better load distribution and worker autonomy.

3. **Acknowledgement as primary completion signal**: Messages require explicit acknowledgement under `AckExplicit` policy. This provides at-least-once delivery semantics with client-controlled completion.

4. **No native DLQ — advisory-only**: When messages exceed `MaxDeliver`, an advisory is published (`JSConsumerDeliveryExceededAdvisory`) but no automatic routing to DLQ occurs. Operators must implement DLQ pattern externally.

5. **Backoff as array, not algorithm**: `BackOff []time.Duration` is an explicit array of durations, not a computed backoff strategy. No jitter support. Error at `server/jetstream_errors_generated.go:209-210` if `MaxDeliver <= len(BackOff)`.

6. **Stream retention policies for message lifecycle**: Three policies (`LimitsPolicy`, `InterestPolicy`, `WorkQueuePolicy`) control when messages can be discarded. This replaces traditional queue TTL with more expressive lifecycle models.

7. **Message scheduling via headers, not separate scheduler**: Scheduled execution uses `Nats-Scheduler` and `Nats-Schedule-*` headers processed by `MsgScheduling` with hash-wheel timer (`server/scheduler.go:35-44`). Does not support distributed/cross-server scheduled job execution.

## Notable Patterns

1. **Redelivery queue with sequence tracking**: `rdq` and `rdqi` (sequence set) track sequences pending redelivery, enabling O(1) duplicate check (`server/consumer.go:2872-2904`)

2. **Backoff index per sequence**: `rdc map[uint64]uint64` tracks delivery count per sequence, used to index into `BackOff` array (`server/consumer.go:5980-5991`)

3. **Hash-wheel timer for message scheduling**: `MsgScheduling` uses `thw.HashWheel` for efficient scheduled message processing (`server/scheduler.go:37`)

4. **ipQueue for inter-goroutine communication**: Internal queues use `push()`/`pop()` with channel notification, supporting backpressure via size limits (`server/ipqueue.go:113-141`)

5. **Cluster consensus via Raft**: JetStream cluster uses Raft consensus for stream/consumer assignment with `inflightStreams`/`inflightConsumers` tracking pending operations (`server/jetstream_cluster.go:54-55,90-101`)

## Tradeoffs

1. **Simplicity vs Expressiveness**: Subject-based routing and pull consumers are simple and scalable, but lack advanced queue features (priority queues, message groups, scheduled delay queues) found in dedicated job systems.

2. **No native DLQ vs Operational burden**: Advisory-only max-delivery handling puts burden on operators to implement DLQ routing. This is flexible but requires custom implementation.

3. **Backoff as explicit array vs Algorithmic flexibility**: Explicit `BackOff` durations are predictable but lack jitter, exponential backoff, or adaptive strategies. Clients needing such behavior must implement externally.

4. **Message scheduling via headers vs Distributed scheduler**: Header-based scheduling works for single-server scheduled messages but cannot coordinate scheduled jobs across clustered servers without external coordination.

5. **No workflow engine vs Client complexity**: Absence of workflow/orchestration engine means clients must build multi-step workflow logic, increasing application complexity.

## Failure Modes / Edge Cases

1. **MaxDeliver exhaustion without DLQ**: Messages exceeding delivery threshold are removed from pending but not routed anywhere. Data loss if no external DLQ implemented.

2. **Backoff index bounds**: `rdc[seq]` could index beyond `BackOff` array length; code handles via `bi >= l` → `bi = l - 1` (`server/consumer.go:5805-5808`)

3. **Consumer orphaned by network partition**: Pull consumer with pending messages but disconnected: messages remain pending until `InactiveThreshold` elapses or `AckWait` expires

4. **Cluster split-brain on meta leader failure**: Raft-based meta controller requires quorum; split-brain possible if network partition exceeds `max_redeliver` window

5. **Backoff exceeds AckWait**: If `BackOff[0] > AckWait`, first backoff value overrides AckWait (`server/consumer.go:650-655`). Validation only when `BackOff` specified.

6. **Pending overflow with MaxAckPending=-1**: Unlimited ack pending with `MaxAckPending = -1` can cause memory accumulation if consumers fail to ack

## Future Considerations

1. **Dead-letter queue native support**: Implement automatic DLQ routing when `MaxDeliver` exceeded, either via special subject or separate storage

2. **Workflow/orchestration layer**: Consider adding JetStream Workflows or native saga pattern support for multi-step job composition

3. **Jitter in backoff**: Add optional jitter to retry backoff to prevent thundering herd on recovery

4. **Distributed message scheduling**: Cross-server schedule coordination for clustered deployments

5. **Job cancellation API**: User-facing API to cancel in-flight jobs by sequence number or correlation ID

6. **Adaptive backoff**: Algorithmic backoff strategies (exponential, adaptive) based on failure patterns

## Questions / Gaps

1. **No evidence found** for native dead-letter queue mechanism — only advisory on max delivery exceeded
2. **No evidence found** for workflow orchestration or saga pattern support
3. **No evidence found** for jitter in backoff retry configuration
4. **No evidence found** for job priority or preemption mechanisms
5. **No evidence found** for distributed cross-server message scheduling
6. **No evidence found** for job timeout beyond per-message AckWait
7. **No evidence found** for saga compensating transaction support
8. **No evidence found** for push-based consumer backpressure signaling (only pull-based MaxWaiting)

---

Generated by `dimensions/05-background-jobs-async-workflows.md` against `nats-server`.