# Repo Analysis: opencode

## Workflow Composition and Observability

### Repo Info

| Field | Value |
|-------|-------|
| Name | opencode |
| Path | `/home/antonioborgerees/coding/opencode-wrap-study/repos/opencode` |
| Group | `04-workflow-composition-and-observability` |
| Language / Stack | TypeScript / Effect, AI SDK, Drizzle ORM, Bun |
| Analyzed | 2026-05-17 |

## Summary

opencode implements a session-centric agent runtime. The "workflow primitive" is a **Session** — a first-class entity backed by SQLite that owns messages, parts, and run state. Child work is not scheduled via a DAG; it is structured as forked sessions (subagents), shell commands, and skill invocations, each published as distinct structured events. The runtime uses Effect's `PubSub` for an in-process event bus, with a `SyncEvent` layer for durable event projection into SQLite. OpenTelemetry tracing and OTLP log export are wired via `@effect/opentelemetry`. The system is mid-migration: a legacy event bus coexists with a new `EventV2` system gated behind `experimentalEventSystem`.

## Rating

**7 / 10**

The runtime has clear primitives (Session, Step, Shell, Tool, Text, Reasoning, Compaction) with rich metadata capture (cost, tokens, cache, provider, model, agent). However, step retry is ad hoc (legacy `retry.ts` utility), scheduling is session-bound rather than DAG-based, and the dual event system creates observability fragmentation. The "workflow" is implicit in the session lifecycle rather than a first-class composable artifact.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Session primitive | `Session.Info` schema with id, cost, tokens, model, agent, time | `packages/opencode/src/session/session.ts:207` |
| Step events | `SessionEvent.Step.Started/Ended/Failed` define step lifecycle | `packages/core/src/session-event.ts:104-146` |
| Shell events | `SessionEvent.Shell.Started/Ended` for command execution | `packages/core/src/session-event.ts:79-101` |
| Tool events | `SessionEvent.Tool.Input.Started/Delta/Ended/Called/Progress/Success/Failed` | `packages/core/src/session-event.ts:213-307` |
| Text/Reasoning events | `SessionEvent.Text.*` and `SessionEvent.Reasoning.*` | `packages/core/src/session-event.ts:148-211` |
| Compaction events | `SessionEvent.Compaction.Started/Delta/Ended` for context pruning | `packages/core/src/session-event.ts:332-363` |
| Retry tracking | `SessionEvent.Retried` with attempt count and error | `packages/core/src/session-event.ts:321-330` |
| Event registry | `EventV2.define()` registers typed events into a global registry | `packages/core/src/event.ts:34-59` |
| In-process pub/sub | `EventV2.Service` backed by Effect `PubSub` | `packages/core/src/event.ts:84-153` |
| Sync event layer | `SyncEvent` projects events into SQLite with sequence numbers | `packages/opencode/src/sync/index.ts:59-73` |
| Session messages | `MessageV2` schema with step-start/step-finish parts | `packages/opencode/src/session/message-v2.ts` |
| Session processor | `SessionProcessor` consumes LLM stream, publishes events | `packages/opencode/src/session/processor.ts:214-629` |
| Run state / Runner | `SessionRunState` wraps `Runner` with idle/busy/shell states | `packages/opencode/src/session/run-state.ts:1-153` |
| Event-to-message projector | `session-message-updater.ts` maps events → in-memory `SessionMessage` adapter | `packages/core/src/session-message-updater.ts:76-415` |
| Token/cost accounting | `Session.getUsage()` parses `LanguageModelUsage` + provider metadata | `packages/opencode/src/session/session.ts:377-444` |
| OpenTelemetry layer | OTLP exporter with service name, version, process role, run ID | `packages/core/src/effect/observability.ts:24-54` |
| OTEL trace setup | BatchSpanProcessor with AsyncLocalStorageContextManager | `packages/core/src/effect/observability.ts:70-96` |
| Effect bridge | `EffectBridge` restores workspace context for callbacks | `packages/opencode/src/effect/bridge.ts:48-82` |
| V2 event bridge | `EventV2Bridge` publishes V2 events to legacy bus + GlobalBus | `packages/opencode/src/event-v2-bridge.ts:62-78` |
| Event location context | `InstanceRef` + `InstanceStore` used to tag events with workspace/directory | `packages/opencode/src/event-v2-bridge.ts:46-59` |
| Model metadata | `ModelV2.Info` captures id, apiID, providerID, family, cost, limits | `packages/core/src/model.ts:43-106` |
| Provider metadata | `ProviderV2.Info` captures endpoint type, auth method, options | `packages/core/src/provider.ts:79-119` |
| Tool output | `ToolOutput.Structured` + `Content` (text/file) for structured results | `packages/core/src/tool-output.ts:1-18` |
| Session SQL schema | `SessionTable` + `SessionMessageTable` + `EventTable` persisted in SQLite | `packages/opencode/src/session/session.sql.ts` |
| Sync event SQL | `EventSequenceTable` stores sequence per aggregate for replay | `packages/opencode/src/sync/event.sql.ts` |
| Retry policy | `SessionRetry.policy()` wraps `Effect.retry` with backoff | `packages/opencode/src/session/retry.ts` |
| Background jobs | `BackgroundJob` cancels child jobs when session cancelled | `packages/opencode/src/session/run-state.ts:115-147` |

## Answers to Protocol Questions

### 1. What workflow primitive is used, and how much does it know about the runtime?

**Primitive: Session** (`Session.Info`, `packages/opencode/src/session/session.ts:207`)

A Session is a first-class durable entity. It knows: its own ID, parent ID (for subagent trees), project/workspace/directory, agent name, model reference, cost accumulator, token accumulator (input/output/reasoning/cache read-write), timestamps, title, and permission ruleset. It does NOT know about step DAGs or upstream dependencies — those are implicit in the message sequence.

The step lifecycle is tracked via message parts (`step-start`, `step-finish`) rather than a separate scheduling primitive. The processor (`packages/opencode/src/session/processor.ts:106`) creates a new assistant message and streams LLM events into it, publishing `Step.Started/Ended` events at `start-step`/`finish-step` stream markers.

**Rating: 6** — Session is well-scoped but step ordering is implicit, not a DAG.

### 2. How are steps scheduled, parallelized, retried, cancelled, and summarized?

**Scheduling/Parallelization**: Sessions run sequentially within a single session. Parallelization is limited to shell commands (PTY) and background subagents. Subagent sessions (`Session.Service.subagent`) are created as child sessions and awaited — no parallel DAG execution (`packages/opencode/src/v2/session.ts:308-327`).

**Retry**: `SessionRetry.policy()` (`packages/opencode/src/session/retry.ts`) wraps Effect's `retry` operator with a configurable backoff. The processor applies it at `processor.ts:750-780` keyed on provider. However, retry state is not persisted per-step — it is a transient Effect retry loop. `SessionEvent.Retried` is published but only when `experimentalEventSystem` is enabled (`processor.ts:756-766`).

**Cancellation**: `SessionRunState.cancel()` (`packages/opencode/src/session/run-state.ts:76-85`) cancels the `Runner` and all associated background jobs. The `Runner` (`packages/opencode/src/effect/runner.ts:39-215`) implements idle/busy/shell/shell-then-run states and responds to `Fiber.interrupt`.

**Summarization**: After each `finish-step`, a compaction summary is triggered asynchronously (`processor.ts:541-546`). The `Compaction` message records reason (auto/manual), summary text, and included files.

**Rating: 5** — Retry is transient, cancellation is well-implemented, but no first-class parallel DAG.

### 3. How are structured runtime events projected into user-facing progress?

**Event → Message Projection**: `session-message-updater.ts:76-415` defines a `match` function that routes each `SessionEvent` type to an in-memory `SessionMessage` mutation via an `Adapter`. This is the canonical event-to-message projection path. The `memory()` adapter builds a `MemoryState` with an append-only message array.

**Dual-write during migration**: The processor dual-writes: legacy `Bus` events + V2 events when `experimentalEventSystem` is enabled (`processor.ts:223-224`, etc.). The V2 path goes through `EventV2Bridge` → legacy bus + `GlobalBus`.

**GlobalBus**: `GlobalBus.emit("event", {...})` fires a raw event with workspace/session context to all subscribers, including the TUI (`packages/opencode/src/bus/global.ts`). This is the live progress path.

**No structured projection for live dashboards**: There is no documented "projector" that exposes a stream of structured events to external dashboards without parsing raw logs. The `SyncEvent` projector pattern is used for database persistence but not for external consumption.

**Rating: 6** — Event types are rich and typed, but live progress projection relies on GlobalBus rather than a structured event stream.

### 4. What metadata is captured for every run, step, provider, model, and artifact?

**Step metadata** (`SessionEvent.Step.Ended`, `session-event.ts:116-135`):
- `finish`: finish reason string
- `cost`: finite monetary cost
- `tokens`: { input, output, reasoning, cache: { read, write } }
- `snapshot`: filesystem snapshot hash at step boundaries

**Provider metadata** (`SessionEvent.Tool.*`, `session-event.ts:257-304`):
- `provider.executed`: boolean — did the provider handle the tool call natively?
- `provider.metadata`: Record<string, unknown> — provider-specific metadata (e.g., `cacheCreationInputTokens`)

**Model reference** (`session-event.ts:51-56`):
- `ModelV2.Ref` with id, providerID, variant

**Artifacts**:
- Tool attachments: file parts with uri, mime, name — normalized by `image.normalize()` for size limits (`processor.ts:393-405`)
- Patch files: hash + file list from snapshot diff (`processor.ts:528-539`)

**No explicit artifact store**: File attachments are embedded in tool results, not a separate artifact registry.

**Rating: 7** — Comprehensive cost/token/provider metadata. Artifact tracking is implicit via tool results.

### 5. How are logs and durable state organized so tools can inspect active and historical runs?

**Durable state**:
- `SessionTable` + `SessionMessageTable` + `PartTable` in SQLite — persistent record of all sessions/messages/parts
- `EventTable` + `EventSequenceTable` — event store for replay, per `sync/index.ts:327-351`
- `SyncEvent.run()` uses an immediate transaction to write atomically (`sync/index.ts:167-183`)

**Logs**:
- Effect `Logger` with structured JSON — `packages/core/src/effect/logger.ts` (imported by observability.ts)
- OTLP export via `OtlpLogger` when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (`observability.ts:56-68`)
- Span traces via `@effect/opentelemetry/NodeSdk` + `BatchSpanProcessor` (`observability.ts:70-96`)
- Span attributes include `session.id`, `agent`, `model`, `providerID` (injected via telemetry tracer proxy at `llm.ts:309-319`)

**Run inspection**:
- `Session.messages()` paginates through message history from SQLite
- `Session.findMessage()` searches newest-first with predicate
- `SyncEvent.replay()` replays events by sequence — enables audit trail reconstruction
- No HTTP API for live event stream consumption; the TUI consumes `GlobalBus` directly

**Rating: 6** — Durable event store + replay is excellent. Live log streaming via OTLP but no structured live query API.

### 6. What should remain in the runtime wrapper versus UltraPlan-specific orchestration?

**Runtime concerns (keep in core/opencode SDK)**:
- Session lifecycle (create, fork, cancel, wait)
- Step event emission (Step.*, Tool.*, Text.*, Reasoning.*, Compaction.*)
- Token/cost accounting from provider metadata
- Event registry + PubSub for in-process subscription
- SyncEvent projector pattern for durable event projection
- OTEL tracing with sessionId/agent/model attributes
- Retry policy with transient backoff (not persisted)

**UltraPlan-specific (move to product layer)**:
- DAG orchestration / parallel step execution
- Run dashboard with live structured event consumption
- Workflow composition graphs (sprint plans, validation loops)
- External artifact registry (separate from tool output)
- Multi-session run trees with fan-out/fan-in scheduling
- Billing reports that aggregate across sessions

**The V2 event system (`EventV2`) is the right seam**: It defines typed events with schemas (`session-event.ts`) and publishes via a registry-backed PubSub (`event.ts:84-153`). UltraPlan can subscribe to `EventV2.subscribe(Step.Ended)` to build live dashboards without knowing runtime internals. The current blocker is the dual-write migration — until `experimentalEventSystem` is on by default, the V2 path is incomplete.

## Architectural Decisions

| Decision | Rationale | Tradeoff |
|----------|-----------|----------|
| Session as workflow primitive | Simplifies data model; session = unit of work + audit trail | No explicit DAG — ordering is implicit in message sequence |
| Effect PubSub for in-process events | Type-safe, composable, scope-managed | No cross-process event delivery without bridging |
| EventV2 registry with schemas | Single source of truth for event shapes; enables `subscribe()` by type | Migration cost: dual-write during transition period |
| SQLite for event store | Simple, transactional, local-first | Not distributed; not suitable for multi-instance workspaces without replication |
| SyncEvent immediate transaction | Ensures event sequence numbers are atomic | Write bottleneck for high-frequency step events |
| OTEL via Effect + @effect/opentelemetry | Native Effect integration, spans carry session context | Requires AsyncLocalStorage context manager fix for non-Effect code paths |
| SessionProcessor as stream consumer | Keeps event emission co-located with LLM stream handling | Processor is large (800+ lines); conflates LLM coordination with event emission |

## Notable Patterns

- **Event registry**: `EventV2.define()` registers typed events into a shared `registry: Map<string, Definition>` — consumers can call `EventV2.subscribe(definition)` to get typed streams.
- **Event-to-message adapter**: `session-message-updater.ts` uses a `match` pattern on event type union to route mutations — similar to a typed Redux reducer.
- **SyncEvent projector registration**: `SyncEvent.init({ projectors: [...] })` freezes the system and registers projectors per versioned event type (`sync/index.ts:231-257`).
- **Immediate transaction for sequencing**: `Database.transaction(..., { behavior: "immediate" })` in `SyncEvent.run()` ensures linearizable sequence numbers.
- **Provider metadata normalization**: `Session.getUsage()` extracts cached token counts from provider-specific metadata keys (`session.ts:386-402`).
- **GlobalBus for live TUI**: Raw event emission via `GlobalBus.emit("event", {...})` bypasses typed event system for TUI consumption.

## Tradeoffs

- **No DAG-based scheduling**: Steps execute serially within a session. Parallel work (shell, subagent) is fire-and-forget or awaited without dependency tracking.
- **Dual event system**: `experimentalEventSystem` flag gates V2 events; legacy bus is still the live progress path for TUI.
- **Transient retry state**: Retry attempts are not persisted; replaying a failed step will re-execute from scratch.
- **SQLite event store**: Not distributed — each workspace instance has its own event store. Replay is local only.
- **Large processor**: `SessionProcessor` is 823 lines handling LLM stream, event emission, tool call management, snapshot tracking, and compaction. Single-responsibility violation.
- **No structured live query API**: Active runs are inspected via `Session.messages()` pagination or GlobalBus subscription. There is no REST endpoint for subscribing to a run's event stream.

## Failure Modes / Edge Cases

- **Doom loop detection**: `processor.ts:357-379` detects repeating tool calls with identical inputs (last 3 calls) and prompts for `doom_loop` permission before re-executing.
- **Tool call interruption**: `cleanup()` at `processor.ts:632-690` marks in-flight tool calls as `interrupted: true` in metadata when the session is aborted.
- **Context overflow**: `ContextOverflowError` triggers `needsCompaction = true`, routing to "compact" result instead of "continue" (`processor.ts:695-698`).
- **Provider-executed tool metadata loss**: When `provider.executed = true`, opencode never sees the result content — it is passed directly to the model. Tool progress events are still published but with the provider's output, not opencode's internal execution output.
- **Snapshot mismatch on replay**: `SyncEvent.replay()` requires sequential seq numbers per aggregate (`sync/index.ts:103-107`). Out-of-order replay is rejected.
- **Subagent session leak**: If `result.wait(child.id)` is interrupted, the child session may remain in the database until the parent is removed (`session.ts:594-615`).

## Future Considerations

- **Promote V2 event system to default**: Remove `experimentalEventSystem` flag and the dual-write in `SessionProcessor`. The V2 path (`EventV2.subscribe()`) should be the canonical live progress API.
- **External event stream API**: HTTP endpoint that streams `EventV2.subscribe()` as Server-Sent Events, allowing UltraPlan dashboards to consume canonical events without GlobalBus coupling.
- **Step DAG primitive**: Consider a `Workflow.Step` schema that expresses explicit dependencies (`after: [stepID, ...]`) for parallel fan-out scenarios.
- **Persisted retry state**: Store retry count in `SessionMessageTable` so interrupted sessions can resume from the last successful step rather than re-executing.
- **Artifact registry**: Extract file attachments into a named artifact store with content-addressable storage, enabling artifact reuse across sessions.
- **Distributed event store**: Replace SQLite event store with a replicated log (WAL or Kafka) for multi-instance workspace support with consistent replay ordering.

## Questions / Gaps

- **Gap**: No explicit workflow/DAG composition layer. The "workflow" is implicit in session message ordering.
- **Gap**: No structured API for external consumers (UltraPlan) to subscribe to live session events without coupling to GlobalBus.
- **Gap**: No persisted step-level retry state — retry is purely transient.
- **Gap**: No explicit artifact registry — attachments are stored inline in tool results.
- **Unresolved**: Whether `SyncEvent` sequence numbers should be global or per-aggregate for multi-session audit trails.
- **Unresolved**: Whether `EventV2.subscribe()` can scale to high-frequency token-delta events without backpressure.