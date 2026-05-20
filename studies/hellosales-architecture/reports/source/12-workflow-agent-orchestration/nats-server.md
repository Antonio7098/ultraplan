# Source Analysis: nats-server

## Workflow / Agent Orchestration

### Source Info

| Field | Value |
|-------|-------|
| Name | nats-server |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/nats-server` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

nats-server is a cloud-native message broker implementing the NATS protocol. It provides pub/sub messaging, request/reply, queue subscriptions, and clustering. The server includes JetStream for durable streaming and a Key-Value store layer built on streams. **nats-server has NO workflow/orchestration engine, no DAG execution, no multi-step workflow definition, and no business process state machines.** It is purely infrastructure for message routing — any workflow orchestration must be built on top using client-side logic.

## Rating

**2/10** — Workflow and agent orchestration capabilities are entirely absent. The server provides only basic message delivery retry via consumer acknowledgment policies, and message scheduling for delayed delivery. No workflow definition DSL, no checkpoint/recovery for multi-step workflows, no parallel branch coordination, no compensation or rollback logic.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Message Scheduling | `MsgScheduling` struct with cron/@every/@at patterns for delayed message delivery | `server/scheduler.go:35-49` |
| Raft State Machine | Raft consensus implementation for cluster leadership, not business workflows | `server/raft.go:129-137` |
| Raft Checkpoint | `RaftNodeCheckpoint` interface for async snapshot installation | `server/raft.go:96-105` |
| Consumer AckPolicy | `AckPolicy` enum: AckNone, AckAll, AckExplicit, AckFlowControl | `server/consumer.go:331-342` |
| Consumer AckWait | `AckWait` duration for redelivery timeout | `server/consumer.go:647` |
| Max Deliver | `MaxDeliver` setting for message redelivery limit | `server/consumer.go:802` |
| KV Store | Key-Value implemented as JetStream streams with `KV.>` subject pattern | `server/jetstream_api.go:4601` |
| Parallelism | Queue subscriptions only; no fork/join or DAG patterns found | `server/client.go:1-6917` (none in server/) |
| Compensation | No Saga pattern; "rollback" only for internal filestore operations | `server/stream.go:7393-7459` |
| Workflow DSL | No workflow definition found anywhere in codebase | `server/` directory search |

## Answers to Dimension Questions

### 1. How are multi-step workflows defined, stored, and executed?

**No evidence found.** nats-server has no workflow definition, no workflow storage, and no workflow execution engine. Multi-step workflows would need to be implemented entirely by clients using pub/sub patterns — the server provides no abstraction for workflow steps, dependencies, or execution state. There is no DSL, no configuration model, and no API for defining workflows.

### 2. What happens when a workflow is interrupted mid-step — can it resume?

**No workflow resume capability exists.** The only persistence primitives are:
- **Streams**: Durable message persistence with retention policies (`server/stream.go`)
- **Raft snapshots**: For cluster consensus recovery (`server/raft.go:1403-1529`)
- **Consumer state**: Message delivery/acknowledgment tracking (`server/consumer.go:6842-6892`)

If a client builds a workflow on top of NATS and it is interrupted mid-step, the client application must implement its own resume logic. The server does not track workflow state — only individual message delivery state.

### 3. How are parallel workflow branches coordinated and joined?

**No parallel branch coordination exists.** nats-server supports:
- **Queue subscriptions**: Load-balanced delivery across subscribers (`server/client.go` — queue groups)
- **Publish/subscribe**: Fan-out to multiple subscribers on same subject

There are **no patterns for**:
- Fork/join synchronization
- Barrier synchronization
- DAG-based execution
- Cross-branch dependency tracking
- Result aggregation from parallel branches

### 4. How does the system handle workflow-level timeouts and cancellations?

**No workflow-level timeout or cancellation mechanisms.** The server has:
- **Connection-level deadlines**: Write/read deadlines on connections (`server/opts.go:1440-1441`)
- **Consumer-level AckWait**: Timeout for acknowledging a delivered message (`server/consumer.go:647`)
- **MaxDeliver**: Maximum delivery attempts per message (`server/consumer.go:802`)
- **Consumer pause**: `PauseUntil` for temporary suspension (`server/jetstream_super_cluster_test.go:4765`)

These are all at the message delivery level, not workflow level. There is no workflow timeout, no workflow cancellation API, and no way to cancel an in-flight sequence of related messages representing a workflow.

### 5. Is there compensation logic for partial workflow failures?

**No compensation or Saga pattern exists.** "Rollback" in the codebase refers to internal operations:
- `stream.go:7393` — internal rollback during stream config updates
- `filestore.go:4984` — byte count compensation in block packing
- `accounts.go:420` — deny rule compensation

There is no:
- Saga pattern implementation
- Compensation actions for failed workflow steps
- Rollback/undo semantics for multi-step operations
- Transaction coordination across multiple messages

## Architectural Decisions

1. **Minimalist message broker design**: nats-server intentionally provides only message delivery primitives. Workflow orchestration is explicitly out of scope — this is a deliberate design choice to keep the server focused and lightweight.

2. **Raft for cluster consensus only**: The state machine in `server/raft.go:2404` is a Raft consensus implementation used for cluster leader election and meta-state replication (stream/consumer assignments), NOT business workflow state.

3. **JetStream as streaming layer**: Durable streams and consumers provide at-most-once and at-least-once delivery semantics with acknowledgment policies, but no workflow-level coordination.

4. **Key-Value as streams**: KV buckets are streams with special subject patterns (`KV.<bucket>.>`), not a general-purpose KV store. This means KV operations are essentially message operations with subject filtering.

## Notable Patterns

1. **Message scheduling** (`server/scheduler.go:35`): `MsgScheduling` struct supports cron expressions, @every, @at patterns — delayed/recurring message delivery only.

2. **Consumer acknowledgment** (`server/consumer.go:379-393`): Distinct ack types (AckAck, AckNak, AckProgress, AckNext, AckTerm) for fine-grained delivery control, but only at single-message level.

3. **Hash wheel timer** (`server/scheduler.go:37`): Uses `thw.HashWheel` for efficient scheduled message expiration — internal timing optimization.

4. **Raft checkpoint** (`server/raft.go:97`): `RaftNodeCheckpoint` allows asynchronous snapshot installation with abort capability — for cluster recovery, not workflow recovery.

## Tradeoffs

1. **No workflow abstraction**: By design, nats-server does not abstract workflows. Clients must build all orchestration logic, leading to duplicated effort across applications but keeping the server simple and fast.

2. **Message-level vs workflow-level semantics**: Acknowledgment policies operate at individual messages, not workflow steps. A "step" in a client-defined workflow is just a message that the client tracks.

3. **Durability trade-offs**: JetStream provides durability but the server does not track cross-message relationships that would be needed for workflow state.

4. **No native parallelism coordination**: Queue subscriptions provide load-balancing but no synchronization primitives for coordinated parallel execution.

## Failure Modes / Edge Cases

1. **No recovery for client-defined workflows**: If a client application crashes mid-workflow, the server has no knowledge of the workflow context. Messages remain in their delivered state; manual client-side intervention is required.

2. **Raft snapshot isolation**: Raft checkpoints (`server/raft.go:1465`) abort if another snapshot is installed concurrently — this is handled for cluster consensus but analogous workflow-level snapshot conflicts would be unhandled.

3. **Consumer redelivery storms**: With `AckPolicy == AckExplicit`, unacknowledged messages are redelivered after `AckWait`. If a workflow step crashes after partial processing but before ack, the message is redelivered with no idempotency guarantee.

4. **No atomic multi-message operations**: There is no mechanism to atomically publish multiple messages representing a workflow step — each message is independent.

## Future Considerations

1. **External workflow engines**: For HelloSales's AI pipeline orchestration needs, a separate workflow engine (Temporal, Airflow, Brigade) would be required. NATS could serve as the messaging layer beneath such an engine.

2. **Service Lane (NATS Service Mesh)**: While not workflow orchestration, NATS's service import/export and accounts system (`server/accounts.go`) could form the basis of a service mesh for orchestrated microservices.

3. **JetStream KV limitations**: The KV store is not suitable for workflow state storage without additional client-side logic for atomicity and workflow-level tracking.

## Questions / Gaps

1. **No workflow definition API**: No evidence of any API or configuration for defining multi-step workflows, dependencies, or data flow between steps.

2. **No workflow state store**: No mechanism to persist, track, or query the state of a multi-step workflow across multiple messages and participants.

3. **No step-level retry with backoff**: Consumer `MaxDeliver` provides fixed retry count but no exponential backoff, jitter, or retry policies per step.

4. **No workflow monitoring**: No APIs or events for workflow progress, step completion, or workflow-level metrics.

5. **No distributed workflow coordination**: No support for workflows spanning multiple services or requiring distributed transactions.

---

Generated by `dimensions/12-workflow-agent-orchestration.md` against `nats-server`.