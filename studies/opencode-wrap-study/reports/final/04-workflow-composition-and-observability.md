# Workflow Composition and Observability - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Protocol | `04-workflow-composition-and-observability.md` |
| Groups | go-plugin, opencode, sdk-go, t3code |
| Date | 2026-05-17 |

## Repositories Studied

| # | Repo | Path | Group |
|---|------|------|-------|
| 1 | go-plugin | `/home/antonioborgerees/coding/opencode-wrap-study/repos/go-plugin` | go-plugin |
| 2 | opencode | `/home/antonioborgerees/coding/opencode-wrap-study/repos/opencode` | opencode |
| 3 | sdk-go | `/home/antonioborgerees/coding/opencode-wrap-study/repos/sdk-go` | go |
| 4 | t3code | `/home/antonioborgerees/coding/opencode-wrap-study/repos/t3code` | t3code |

## Executive Summary

Across four repos spanning Go plugin systems, TypeScript agent runtimes, a Temporal Go SDK, and an event-sourced orchestration server, two distinct poles emerge on the workflow composition and observability spectrum. At one end, **go-plugin** operates at process-granularity with no workflow semantics whatsoever — it is purely a lifecycle manager for external subprocesses. At the other end, **sdk-go** provides a comprehensive coroutine-based workflow runtime with command-based auditing, replay-aware logging, and a metrics handler interface. In the middle, **opencode** and **t3code** both use Effect-based event systems with typed event registries, PubSub distribution, and durable event projection — but neither provides an explicit DAG or step-dependency primitive.

The central finding: **none of the repos provide a first-class composable workflow with built-in DAG scheduling, step-level retry persistence, and structured live event projection simultaneously.** Every repo makes different tradeoffs along the axes of primitive separation, workflow ergonomics, event projection, metadata completeness, and auditability. The gaps in each repo point toward a common answer: a typed event registry with durable projection, separate from both the runtime engine and the product-specific orchestration layer.

## Core Thesis

Workflow composition and observability in agent runtimes divide into three cleanly separable concerns: (1) **runtime primitives** (what unit of work exists and what it knows about the runtime), (2) **event projection** (how structured runtime events become user-facing progress), and (3) **metadata capture** (what cost, token, duration, and artifact data is attached to each unit). The repos that score highest (sdk-go at 8/10, opencode and t3code at 7/10) are those that keep these concerns separate rather than conflated — even if none fully implements all three.

The practical implication for UltraPlan: the Go library should expose a typed event registry (not raw logs), a durable event projector pattern, and metadata fields for cost/tokens/duration — but should NOT implement DAG scheduling or user-facing dashboards itself. Those are UltraPlan-specific concerns built on top of the event stream.

## Rating Summary

| Repo | Score | Approach | Main Strength | Main Concern |
|------|-------|----------|---------------|--------------|
| go-plugin | 3/10 | Process lifecycle / RPC | Battle-tested plugin isolation, dual net/rpc + gRPC protocol | No workflow semantics, no event projection, no metadata |
| opencode | 7/10 | Session-centric with typed EventV2 registry | Rich metadata (cost, tokens, model, provider), Effect PubSub, SyncEvent durable projection | No DAG, dual event system migration incomplete, transient retry state |
| sdk-go | 8/10 | Coroutine dispatcher with command-based history | Deterministic replay, replay-aware logging/metrics, WorkflowInfo/WorkflowOptions | No built-in token/cost tracking, no structured live event API, no multi-workflow orchestration |
| t3code | 7/10 | Event sourcing with command/event model | Strong audit trail via append-only EventStore, Effect-based PubSub, causation/correlation IDs | No explicit step/DAG, in-memory read model, no token/cost accounting |

## Approach Models

### go-plugin — Plugin Process Manager
go-plugin does not have a workflow model. Its primitive is the **plugin process** managed over RPC. It provides subprocess lifecycle (start/kill/reattach), protocol negotiation, log streaming, and connection multiplexing — but nothing resembling a step, task, or DAG. The "workflow" is whatever the host application builds on top. This is appropriate for a low-level plugin system but means go-plugin cannot serve as the basis for UltraPlan's study/sprint plan orchestration without substantial additional work.

### opencode — Session-Centric Agent Runtime
opencode models work as **Sessions** — durable first-class entities backed by SQLite that own messages, parts, and run state. Child work is structured as forked subagent sessions, shell commands, and skill invocations. The runtime has migrated (partially) to a typed `EventV2` system with a registry-backed PubSub, while still maintaining a legacy event bus during migration. The step lifecycle is tracked via message parts (`step-start`, `step-finish`) rather than a scheduling primitive. Rich metadata (cost, tokens, model, provider, cache) is captured per step. The primary weakness is the lack of an explicit DAG — ordering is implicit in the message sequence.

### sdk-go — Temporal Coroutine Runtime
sdk-go uses a **coroutine-based dispatcher** (`dispatcherImpl`) as its core workflow primitive. Workflow code runs in green threads managed deterministically; all external operations (activities, child workflows, timers, signals) are recorded as **commands** in Temporal's append-only history. This creates a natural audit trail. The SDK provides strong observability primitives: a `metrics.Handler` interface, replay-aware logging, and queryable workflow metadata. It does not implement dashboards itself — that is deferred to Temporal UI. The primary gaps are no built-in token/cost tracking and no multi-workflow orchestration.

### t3code — Event-Sourced Orchestration Server
t3code implements an explicit **command/event model** where `OrchestrationCommand`s are validated by a `Decider`, persisted to an `EventStore`, and projected into an in-memory `OrchestrationReadModel`. Structured events flow through `PubSub` to Reactors for side effects. The architecture is clean and the audit trail is strong due to event sourcing. Weaknesses mirror opencode: no explicit step/DAG concept, in-memory read model (single-node), and no token/cost accounting.

## Pattern Catalog

### Pattern 1: Typed Event Registry with Subscribe/Publish
**What**: A global registry of typed event definitions (`EventV2.define()` in opencode, schema-first in t3code) that allows consumers to subscribe by event type and receive typed payloads.
**Repos**: opencode (`packages/core/src/event.ts:34-59`), t3code (`packages/contracts/src/orchestration.ts`)
**Why it works**: Decouples event producers from consumers. UltraPlan can subscribe to `Step.Ended` events without knowing the runtime internals.
**When to copy**: When you need multiple independent consumers of runtime events (TUI, dashboard, artifact store).
**When overkill**: When only one consumer exists or events are fire-and-forget.
**Evidence**: `EventV2.define()` registers typed events into a shared `registry: Map<string, Definition>` — consumers call `EventV2.subscribe(definition)` to get typed streams (`opencode.md:34-59`).

### Pattern 2: Durable Event Projection into SQLite
**What**: Events are written to SQLite immediately (`Database.transaction` with `behavior: "immediate"`) with sequence numbers, then asynchronously projected into read model tables.
**Repos**: opencode (`packages/opencode/src/sync/index.ts:167-183`), t3code (`apps/server/src/persistence/Services/OrchestrationEventStore.ts`)
**Why it works**: Ensures events survive even if projection fails. Sequence numbers enable replay. Immediate transaction mode ensures linearizable ordering.
**When to copy**: When you need durable audit trail with replay capability.
**When overkill**: For short-lived processes where replay is unnecessary.
**Evidence**: `SyncEvent.run()` uses an immediate transaction to write atomically (`opencode.md:123`). t3code's `OrchestrationEventStore.append` provides `readFromSequence(n)` for replay (`t3code.md:130`).

### Pattern 3: Coroutine Dispatcher for Deterministic Replay
**What**: Workflow code runs in managed green threads (coroutines) controlled by a custom dispatcher. All external operations yield command records that are persisted in history.
**Repos**: sdk-go (`internal/internal_workflow.go:1264-1321`)
**Why it works**: Enables deterministic replay — the dispatcher can re-run the exact same scheduling sequence by re-processing history events in order. Critical for Temporal's "workflow as code" model.
**When to copy**: When you need reliable failure recovery and replay.
**When overkill**: For simple linear workflows where replay is not required.
**Evidence**: `dispatcherImpl` with `ExecuteUntilAllBlocked`, `NewCoroutine`, `IsDone` at `internal/internal_workflow.go:163-179, 1264-1321` (`sdk-go.md:28`).

### Pattern 4: Command/Event Separation with Decider
**What**: A `Decider` function validates incoming commands against invariants and emits events. Commands and events are separate types; the event store is the source of truth.
**Repos**: t3code (`apps/server/src/orchestration/decider.ts:79-744`)
**Why it works**: Enables full audit trail. Commands are idempotent (via `commandReceiptRepository`). Events carry causation/correlation IDs for tracing.
**When to copy**: When you need auditable, replayable state changes.
**When overkill**: When you need high throughput and can tolerate at-most-once semantics.
**Evidence**: `decideOrchestrationCommand` function at `apps/server/src/orchestration/decider.ts:79` validates preconditions via invariants (`t3code.md:30`).

### Pattern 5: Replay-Aware Logging and Metrics
**What**: Logging and metrics infrastructure consults an `isReplay` flag to suppress duplicate entries during replay.
**Repos**: sdk-go (`internal/log/replay_logger.go`, `internal/common/metrics/handler.go:77-121`)
**Why it works**: Prevents log/metric pollution when workflows replay from history after a failure.
**When to copy**: When your runtime supports replay.
**When overkill**: When replay is not supported.
**Evidence**: `replayAwareHandler` suppresses metrics during replay (`internal/common/metrics/handler.go:77-121`) (`sdk-go.md:33`).

### Pattern 6: Effect PubSub for In-Process Event Distribution
**What**: Effect's `PubSub` backed in-process event bus allows typed event subscription within a single process.
**Repos**: opencode (`packages/core/src/event.ts:84-153`)
**Why it works**: Type-safe, scope-managed, composable. Integrates with Effect's fiber-based concurrency.
**When to copy**: For in-process event distribution with type safety.
**When overkill**: For cross-process or distributed scenarios.
**Evidence**: `EventV2.Service` backed by Effect `PubSub` at `packages/core/src/event.ts:84-153` (`opencode.md:39`).

### Pattern 7: MuxBroker for Dynamic Channel Creation
**What**: Plugins can open additional RPC connections over the same transport by negotiating stream IDs, without事先 knowing the number of channels needed.
**Repos**: go-plugin (`mux_broker.go:52-124`)
**Why it works**: Supports dynamic, multi-channel communication without pre-negotiating all channel types.
**When to copy**: For plugin systems that need flexible extensibility.
**When overkill**: For simple request/response RPC.
**Evidence**: Plugins can open additional RPC connections over the same transport by negotiating stream IDs (`mux_broker.go:52-124`) (`go-plugin.md:101`).

## Key Differences

### go-plugin vs. the others
go-plugin is a plugin process manager, not a workflow system. It has no concept of task, step, DAG, or structured event — only "plugin process." sdk-go, opencode, and t3code all have explicit workflow/event models. This is a category difference, not a quality difference.

### Session-centric (opencode) vs. Command-based (sdk-go) vs. Event-sourced (t3code)
- **opencode** treats a **Session** as the unit of work and persistence. The "workflow" is implicit in the session's message sequence. Rich metadata is captured per session/step.
- **sdk-go** treats **workflow history** as the source of truth. Commands are recorded in history; replay re-executes the workflow code deterministically. Strong replay story, but no built-in token/cost tracking.
- **t3code** uses explicit **event sourcing** with a `Decider` and append-only `EventStore`. Commands and events are separate types. Strong audit trail and causation tracking.

### Retry persistence
- **opencode**: Retry state is transient (Effect retry loop, not persisted). `SessionEvent.Retried` is published but only when `experimentalEventSystem` is enabled.
- **sdk-go**: Activity retry policy is well-defined; workflow-level retry replays from the beginning of history.
- **t3code**: No automatic retry mechanism. Failed commands record an error in `commandReceiptRepository`; the client must re-submit.
- **go-plugin**: No retry mechanism at all.

### Metadata completeness
- **opencode** captures: cost, tokens (input/output/reasoning/cache read/write), model reference, provider metadata, filesystem snapshot at step boundaries, tool attachments as file parts.
- **sdk-go** captures: `WorkflowInfo` (namespace, workflowID, runID, attempt, task queue, search attributes, memo), activity metadata (type, ID, attempt, retry policy, scheduled time), worker build ID. Does NOT capture tokens, cost, or LLM provider info.
- **t3code** captures: turn metadata (provider, model, runtime mode, session status), checkpoint metadata (git ref, file diffs), command receipts. Does NOT capture tokens or cost.
- **go-plugin** captures: negotiated protocol version, network address, PID. Nothing about work performed.

### Live event projection
- **opencode**: `GlobalBus.emit("event", {...})` is the live progress path for TUI. The V2 path (`EventV2.subscribe()`) exists but is gated behind `experimentalEventSystem`. No structured HTTP API for external consumers.
- **sdk-go**: No live event projection. External tools (Temporal UI) consume history directly. SDK emits metrics/logs to user-configured sinks.
- **t3code**: `PubSub` fans out to WebSocket server and reactors. No canonical "live progress view" builder — clients must subscribe to events and reconstruct progress themselves.
- **go-plugin**: Raw log forwarding only.

## Tradeoffs

### Typed Event Registry vs. Ad Hoc Event Emission
**Benefit**: Typed events enable type-safe subscription, schema validation, and clear consumer contracts.
**Cost**: Requires upfront schema design; migration overhead when event shapes change.
**Best-fit**: Systems with multiple independent consumers of runtime events.
**Failure mode**: Schema drift between producers and consumers if version management is poor.
**Alternative**: Raw log emission (go-plugin style) — simpler but requires parser coupling.

### Coroutine Dispatcher vs. Native Thread-per-Workflow
**Benefit**: Deterministic replay; workflow code is testable in isolation.
**Cost**: Workflow code cannot use native Go concurrency; must use SDK's `Channel`, `Selector`, `Go`.
**Best-fit**: Long-running workflows with complex state machines requiring reliable failure recovery.
**Failure mode**: Custom scheduler complexity; deadlock detection false positives.
**Alternative**: Native goroutines with event sourcing (t3code/opencode style) — more flexible but harder to replay.

### Durable Event Store vs. In-Memory State
**Benefit**: Survives restarts; enables full replay; supports audit trails.
**Cost**: Write latency (especially with immediate/lock-confined transactions); operational complexity.
**Best-fit**: Long-running processes or multi-session audit requirements.
**Failure mode**: Write bottleneck for high-frequency events (opencode's `SyncEvent` at `sync/index.ts:167-183` uses immediate transactions which serialize writes).
**Alternative**: In-memory only (t3code's `OrchestrationReadModel`) — faster but loses state on restart.

### Explicit DAG vs. Implicit Session/Event Ordering
**Benefit**: Clear dependency visualization, parallel execution, progress percentage.
**Cost**: Requires explicit step registration; more ceremony for simple linear workflows.
**Best-fit**: Complex multi-step studies with branching and fan-out.
**Failure mode**: Over-engineering for simple linear agent sessions.
**Alternative**: Implicit ordering via message/event sequence (opencode, t3code) — simpler but less inspectable.

### Session as Primitive vs. Workflow as Primitive
**Benefit**: Simpler data model; session = unit of work + audit trail.
**Cost**: No explicit DAG or step dependency; ordering is implicit in message sequence.
**Best-fit**: Single-threaded agent sessions where the agent drives its own flow.
**Failure mode**: Hard to coordinate multiple parallel agents with dependency ordering.
**Alternative**: sdk-go's explicit `ExecuteActivity`/`ExecuteChildWorkflow` commands — more verbose but more inspectable.

## Decision Guide

**Choose coroutine dispatcher (sdk-go) if**: You need deterministic replay, command-based auditing, and are comfortable building dashboards/consumption separately. The SDK is excellent but requires UltraPlan to build the workflow composition layer.

**Choose typed event registry + PubSub (opencode) if**: You want rich metadata (cost, tokens, model, provider) and are okay with a session-centric model. The V2 event system is the right seam for UltraPlan to consume. Watch the `experimentalEventSystem` migration.

**Choose event sourcing (t3code) if**: Auditability and command replay are paramount. The causation/correlation ID pattern is excellent for tracing event chains. However, the in-memory read model limits multi-node deployments.

**Avoid go-plugin as a workflow basis**: It is a plugin process manager, not a workflow system. Use it for what it is — subprocess lifecycle + RPC — and build workflow on top.

**Do not expect built-in DAG primitives**: None of the repos provide a first-class step/DAG with dependency ordering. UltraPlan must build this layer. The event stream (especially opencode's `EventV2`) provides the right hooks.

**Do not expect built-in token/cost accounting**: Only opencode captures this. sdk-go and t3code intentionally omit it. UltraPlan must implement metering via custom activity context or side effects.

## Practical Tips

1. **Start from opencode's EventV2 model**: The typed event registry with `EventV2.subscribe()` is the right abstraction for UltraPlan. It provides typed, filterable events without requiring UltraPlan to know runtime internals.

2. **Use sdk-go's metrics handler interface**: Define a minimal `metrics.Handler` interface and emit to it. Do not implement internal storage — let UltraPlan integrate with Prometheus/Grafana/OTLP.

3. **Adopt t3code's causation/correlation ID pattern**: Events should carry `causationEventId` (parent event) and `correlationId` (command that triggered them). This enables tracing event chains across sessions.

4. **Use opencode's SyncEvent immediate transaction pattern**: For durable event persistence, serialize writes with immediate transaction mode to ensure linearizable sequence numbers.

5. **Mirror sdk-go's `WorkflowInfo` pattern**: Pass a structured `WorkflowInfo`-equivalent (namespace, workflowID, runID, attempt, taskQueue, searchAttributes, memo) through the execution context. This gives every step visibility into its runtime environment.

6. **Implement replay-aware logging like sdk-go**: If the Go library supports replay, wrap loggers with an `isReplay` check to suppress duplicate entries.

7. **Use t3code's command receipt deduplication**: Track `commandId → status/resultSequence/error` to enable idempotent command processing and protect against duplicate submissions.

## Anti-Patterns / Caution Signs

- **Dual event system without migration plan**: opencode's `experimentalEventSystem` flag creates two event paths. Until V2 is default, observability is fragmented. UltraPlan should watch for flag removal, not build around legacy.

- **In-memory read model without snapshot strategy**: t3code's `OrchestrationReadModel` is held in memory. On restart, it bootstraps from snapshot. If the snapshot query returns stale data, the read model is inconsistent with the event store.

- **Immediate transaction for high-frequency events**: opencode's `SyncEvent.run()` uses `behavior: "immediate"` which acquires an exclusive lock on the SQLite database. For high-frequency token-delta events, this could become a write bottleneck.

- **Large processor with multiple responsibilities**: opencode's `SessionProcessor` is 823 lines handling LLM stream, event emission, tool call management, snapshot tracking, and compaction. Single-responsibility violation that slows development and increases risk.

- **Sticky cache dependency**: sdk-go's sticky cache (`workflowExecutionContextImpl`) speeds up subsequent workflow tasks but creates worker affinity. Worker restarts lose cache benefits and may cause task redistribution issues.

- **No retry state persistence**: opencode's retry is transient — retry count is not stored in `SessionMessageTable`. Interrupted sessions re-execute from scratch rather than resuming from the last successful step.

- **Subprocess-only visibility**: go-plugin provides no visibility into what plugins do. Without structured event emission from plugins, UltraPlan has no way to track progress without parsing raw logs.

## Notable Absences

- **No built-in DAG/step primitive**: None of the repos provide explicit step enumeration, dependency graphs, or progress percentage. UltraPlan must build this.
- **No first-class token/cost accounting**: Only opencode captures this. sdk-go and t3code omit it intentionally (sdk-go delegates to external systems; t3code lacks provider integration).
- **No structured live event API**: No repo provides an HTTP endpoint that streams canonical events as Server-Sent Events for external dashboard consumption. opencode's `GlobalBus` and t3code's `PubSub` are in-process only.
- **No distributed event store**: opencode (SQLite) and t3code (SQLite + in-memory read model) are both single-node. sdk-go defers to Temporal server but the SDK itself has no distributed store.
- **No explicit artifact registry**: opencode stores file attachments inline in tool results. t3code uses checkpoint git refs. No repo implements content-addressable artifact storage with cross-session reuse.
- **No built-in multi-agent fan-out/fan-in**: opencode's subagent sessions are awaited serially. sdk-go's `ExecuteChildWorkflow` is fire-and-forget (with `WaitForCompletion` option). Neither provides explicit fan-out scheduling across multiple concurrent agents.

## Per-Repo Notes

### go-plugin
A clean, focused plugin process manager. The right seam is **process lifecycle only** — start, kill, reattach, protocol negotiation, log forwarding. Anything above that (workflows, steps, retry, metadata) belongs in UltraPlan, not in the plugin layer.

### opencode
The most relevant reference for UltraPlan's event system. `EventV2` is the right abstraction. The primary work is: (1) promoting V2 to default and removing dual-write, (2) adding an HTTP SSE endpoint for `EventV2.subscribe()`, (3) persisting retry state per step. The Session model is appropriate; DAG composition can be layered on top.

### sdk-go
The gold standard for deterministic replay and command-based auditing. The Go library should mirror sdk-go's approach: coroutine dispatcher, command-based execution, `WorkflowInfo` context, replay-aware logging/metrics. The gaps (token/cost, multi-workflow orchestration) are correctly deferred to UltraPlan.

### t3code
The strongest event sourcing implementation. The `Decider` + `EventStore` + `ReadModel` + `Reactor` pattern is clean and值得 copying. The primary limitation is the in-memory read model and single-node deployment. The causation/correlation ID pattern should be adopted universally.

## Open Questions

1. **Should the Go library support replay?** If so, a coroutine dispatcher (sdk-go style) is needed. If not, native goroutines with event sourcing (t3code/opencode style) are simpler.

2. **Should the Go library include a DAG/step primitive, or defer that to UltraPlan?** opencode and t3code both show that implicit ordering via event sequence is sufficient for single-threaded sessions. An explicit DAG adds complexity that may not be needed.

3. **How should token/cost metering be integrated?** Only opencode implements this. sdk-go intentionally omits it (deferring to external systems). The Go library should decide whether to include metering hooks or require UltraPlan to implement via side effects.

4. **What is the right durability model?** SQLite with immediate transactions (opencode) is simple but single-node. t3code's in-memory read model is faster but loses state on restart. A write-ahead log or replicated log would support multi-node deployments but adds complexity.

5. **Should the Go library provide an external event stream API (HTTP SSE)?** opencode and t3code both lack this — external consumers must couple to in-process PubSub or poll the database. An SSE endpoint on the Go library would allow UltraPlan to consume events without embedding the library as a module.

6. **What is the scope of the "plugin" primitive?** go-plugin shows that a clean process isolation boundary is valuable. But should the Go library also manage plugin protocol negotiation, or is that UltraPlan's concern?

## Evidence Index

| Evidence | Source | File:Line |
|----------|--------|-----------|
| EventV2 registry pattern | opencode | `packages/core/src/event.ts:34-59` |
| SyncEvent immediate transaction | opencode | `packages/opencode/src/sync/index.ts:167-183` |
| Session schema with metadata | opencode | `packages/opencode/src/session/session.ts:207` |
| SessionEvent step lifecycle | opencode | `packages/core/src/session-event.ts:104-146` |
| SessionRetry policy | opencode | `packages/opencode/src/session/retry.ts` |
| GlobalBus live event path | opencode | `packages/opencode/src/bus/global.ts` |
| OTEL tracer setup | opencode | `packages/core/src/effect/observability.ts:70-96` |
| Coroutine dispatcher | sdk-go | `internal/internal_workflow.go:1264-1321` |
| Commands helper | sdk-go | `internal/internal_event_handlers.go:104-174` |
| Replay-aware metrics handler | sdk-go | `internal/common/metrics/handler.go:77-121` |
| WorkflowInfo metadata | sdk-go | `internal/internal_public.go:40-68` |
| ReplayLogger | sdk-go | `internal/log/replay_logger.go` |
| Update protocol state machine | sdk-go | `internal/internal_update.go:79-200` |
| OrchestrationCommand types | t3code | `packages/contracts/src/orchestration.ts:1278` |
| Decider function | t3code | `apps/server/src/orchestration/decider.ts:79-744` |
| EventStore append | t3code | `apps/server/src/persistence/Services/OrchestrationEventStore.ts` |
| Event projector | t3code | `apps/server/src/orchestration/projector.ts:167-653` |
| OrchestrationEngine queue | t3code | `apps/server/src/orchestration/Layers/OrchestrationEngine.ts:88-89` |
| Provider command reactor | t3code | `apps/server/src/orchestration/Layers/ProviderCommandReactor.ts` |
| Checkpoint reactor | t3code | `apps/server/src/orchestration/Layers/CheckpointReactor.ts` |
| Client.Start subprocess launch | go-plugin | `client.go:580-948` |
| Runner interface | go-plugin | `runner/runner.go:14-37` |
| Log entry streaming | go-plugin | `log_entry.go:11-76` |
| MuxBroker dynamic channels | go-plugin | `mux_broker.go:52-124` |
| gRPC stdio service | go-plugin | `grpc_stdio.go:51-83` |

---

Generated by protocol `04-workflow-composition-and-observability.md`.