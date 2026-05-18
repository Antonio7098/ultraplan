# Repo Analysis: t3code

## Workflow Composition and Observability

### Repo Info

| Field | Value |
|-------|-------|
| Name | t3code |
| Path | `/home/antonioborgerees/coding/opencode-wrap-study/repos/t3code` |
| Group | `t3code` |
| Language / Stack | TypeScript/Node.js + Effect (functional effect system) |
| Analyzed | 2026-05-17 |

## Summary

t3code is a minimal web GUI for coding agents (Codex, Claude, OpenCode) built on an event-sourcing architecture. The runtime uses a command/event model where `OrchestrationCommand`s are validated by a `Decider`, persisted to an `EventStore`, and projected into an in-memory `OrchestrationReadModel`. Structured events flow through `PubSub` to `Reactors` that handle side effects (provider dispatch, checkpointing). Observability is provided via Effect's `Metric` API with local NDJSON trace files and optional OTLP export.

## Rating

**7/10** — Clear workflow primitives with useful state and progress events. The command/event model provides strong auditability. However, there's no explicit DAG/step concept; workflows are implicit in the event sequence. Progress projection is limited to event subscription without a canonical live-view builder.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Command/event model | `OrchestrationCommand` union type (23 types) | `packages/contracts/src/orchestration.ts:1278` |
| Command validation | `decideOrchestrationCommand` function | `apps/server/src/orchestration/decider.ts:79-744` |
| Event persistence | `OrchestrationEventStore.append` | `apps/server/src/persistence/Services/OrchestrationEventStore.ts` |
| Read model projection | `projectEvent` function | `apps/server/src/orchestration/projector.ts:167-653` |
| Command queue | `Queue.unbounded<CommandEnvelope>` | `apps/server/src/orchestration/Layers/OrchestrationEngine.ts:88` |
| Event pub/sub | `PubSub.unbounded<OrchestrationEvent>` | `apps/server/src/orchestration/Layers/OrchestrationEngine.ts:89` |
| Command deduplication | `commandReceiptRepository.upsert` | `apps/server/src/orchestration/Layers/OrchestrationEngine.ts:177-184` |
| Provider ingestion | `ProviderRuntimeIngestionService` interface | `apps/server/src/orchestration/Services/ProviderRuntimeIngestion.ts:16-33` |
| Provider command reactor | `ProviderCommandReactor.ts` layer | `apps/server/src/orchestration/Layers/ProviderCommandReactor.ts` |
| Checkpoint reactor | `CheckpointReactor.ts` layer | `apps/server/src/orchestration/Layers/CheckpointReactor.ts` |
| Thread session state | `OrchestrationSession` schema | `packages/contracts/src/orchestration.ts:200+` |
| Metrics definitions | `t3_orchestration_commands_total`, `t3_orchestration_command_duration`, `t3_provider_turn_duration` | `apps/server/src/observability/Metrics.ts:22-55` |
| Trace recording | `server.trace.ndjson` NDJSON spans | `apps/server/src/observability/TraceRecord.ts` |
| OTLP export | Optional OTLP env vars (`T3CODE_OTLP_TRACES_URL`) | `docs/observability.md:94-98` |
| Span annotation | `Effect.annotateCurrentSpan` for command context | `apps/server/src/orchestration/Layers/OrchestrationEngine.ts:129-134` |
| Command receipt | `OrchestrationCommandReceiptRepository` | `apps/server/src/persistence/Services/OrchestrationCommandReceipts.ts` |

## Answers to Protocol Questions

### 1. What workflow primitive is used, and how much does it know about the runtime?

The workflow primitive is **commands and events** (`OrchestrationCommand` / `OrchestrationEvent`) rather than an explicit DAG or step construct. Commands carry `commandId`, aggregate kind, and metadata. The `Decider` (`apps/server/src/orchestration/decider.ts:79`) validates preconditions via invariants and emits events. The `OrchestrationEngine` (`apps/server/src/orchestration/Layers/OrchestrationEngine.ts:78-319`) maintains an unbounded command queue and processes commands sequentially per aggregate.

The runtime knows about:
- Thread/project lifecycle (create, archive, delete, meta updates)
- Turn lifecycle (start, interrupt, complete, diff)
- Session state (provider, model, status, active turn)
- Checkpoints (git refs per turn)
- Activities (structured runtime activity logs)
- Proposed plans (agent-generated plans for approval workflows)

The runtime does NOT know about:
- Explicit dependency graphs between steps
- Retry policies or timeout configurations
- Parallel step execution
- Step-level status beyond turn checkpoint status

### 2. How are steps scheduled, parallelized, retried, cancelled, and summarized?

**Scheduling**: Commands enter an unbounded `Queue` (`OrchestrationEngine.ts:88`) and are processed serially by a single worker fiber (`OrchestrationEngine.ts:290`). There's no parallelization within the orchestration engine itself.

**No explicit retry mechanism**: Failed commands record an error in `commandReceiptRepository` but do not automatically retry. The client must re-submit if desired.

**Cancellation**: `thread.turn.interrupt` command (`decider.ts:443-462`) sets an interrupt flag on the session. Provider runtime ingestion handles the interrupt and generates `thread.turn-interrupt-requested` events.

**Summarization**: Turn completion is captured via `thread.turn.diff.complete` command (`decider.ts:657-681`) which records checkpoint git refs, file diffs, and completion status. The `latestTurn` field in `OrchestrationThread` tracks turn state.

**No explicit step concept**: "Steps" are implicit in the event sequence (message-sent → turn-start-requested → session-set → message-sent → turn-diff-completed). There's no explicit step enumeration, progress percentage, or step-level error reporting.

### 3. How are structured runtime events projected into user-facing progress?

Events are projected into:
1. **In-memory `OrchestrationReadModel`** (`projector.ts:158-164`): Contains `projects[]`, `threads[]` with messages, activities, checkpoints, session state. Bootstrap from snapshot at startup.
2. **`PubSub` for real-time fanout**: `streamDomainEvents` property (`OrchestrationEngine.ts:316-318`) returns a `Stream` from the `PubSub`. Multiple consumers (WebSocket server, ProviderRuntimeIngestion, CheckpointReactor) independently subscribe.
3. **Projection pipeline**: `ProjectionPipeline` asynchronously projects events to SQLite tables for persistence (`OrchestrationProjectionPipeline`).

The WebSocket server consumes domain events and pushes to clients. However, there's no canonical "live progress view" builder—clients must subscribe to events and reconstruct progress themselves.

### 4. What metadata is captured for every run, step, provider, model, and artifact?

**Run metadata**:
- `OrchestrationCommand.commandId` — unique command identifier
- `OrchestrationCommandReceiptRepository` — tracks accepted/rejected status, result sequence, error detail

**Turn metadata** (via `OrchestrationSession`):
- Provider instance ID
- Model selection (instance + model name)
- Runtime mode (full-access, approval-required, auto-accept-edits)
- Interaction mode (default, plan)
- Session status (pending, running, completed, failed, interrupted)
- Active turn ID
- Turn start time, update time

**Checkpoint metadata** (via `OrchestrationCheckpointSummary`):
- Turn ID
- Checkpoint git ref
- Status (ready, missing, error)
- File diffs
- Completion timestamp

**Activity metadata** (via `OrchestrationThreadActivity`):
- Activity type and payload
- Turn association
- Timestamp
- Request ID for correlation

**Metrics captured**:
- `t3_rpc_requests_total`, `t3_rpc_request_duration`
- `t3_orchestration_commands_total`, `t3_orchestration_command_duration`, `t3_orchestration_command_ack_duration`
- `t3_provider_sessions_total`, `t3_provider_turns_total`, `t3_provider_turn_duration`
- `t3_git_commands_total`, `t3_git_command_duration`

**NOT captured**:
- Token counts per turn
- Cost per model/provider
- Latency per message token
- Explicit step durations (only command/turn durations)

### 5. How are logs and durable state organized so tools can inspect active and historical runs?

**Durable state**:
1. **EventStore** (`OrchestrationEventStore`): Append-only event log in SQLite. `readFromSequence(n)` enables event replay from any sequence number.
2. **CommandReceiptRepository** (`OrchestrationCommandReceipts`): Deduplication table mapping `commandId` → `status`, `resultSequence`, `error`. Enables idempotent command processing.
3. **Projection tables**: SQLite tables for threads, messages, checkpoints, activities via `ProjectionPipeline`.

**Logs**:
- stdout via `Logger.consolePretty()` — human-readable, not persisted
- Span events via `Logger.tracerLogger` — attached to active spans
- NDJSON trace file at `~/.t3/userdata/logs/server.trace.ndjson` — contains completed spans with attributes, events, timing

**Inspecting runs**:
- `replayEvents` WebSocket method replays events from a sequence
- `getFullThreadDiff` retrieves thread state at a point in time
- `subscribeThread` for live thread updates

**Trace file queries** (from `docs/observability.md`):
```bash
# Filter orchestration commands
jq -c 'select(.attributes["orchestration.command_type"] != null)' server.trace.ndjson

# Follow one trace
jq -r 'select(.traceId == "TRACE_ID") | [...]' server.trace.ndjson
```

### 6. What should remain in the runtime wrapper versus UltraPlan-specific orchestration?

**Runtime wrapper responsibilities** (should stay):
- Command/event model with aggregate-based ordering
- Decider with invariant validation
- EventStore and command receipt persistence
- ReadModel projection
- PubSub for domain event distribution
- Provider session/turn lifecycle management
- Basic metrics (command counts, durations, turn counts)
- Local trace file + optional OTLP export

**UltraPlan-specific responsibilities** (should be external):
- DAG/step definitions with explicit dependencies
- Step-level progress tracking and percentage completion
- Retry policies with backoff
- Parallel step execution
- Token/cost accounting per model
- User-facing dashboards (run lists, progress views)
- Approval workflow UI and state machine
- Multi-agent coordination (multiple concurrent sessions)
- Screenshot/video capture of provider output

## Architectural Decisions

1. **Event sourcing over CRUD**: All state changes are commands that emit events. The EventStore is the source of truth. This enables full audit trail and event replay.

2. **Effect runtime for composition**: Uses `effect/Effect` as the runtime primitive. `Queue`, `PubSub`, `Deferred`, `Metric` are all Effect primitives. This provides native back-pressure, fiber-based concurrency, and structured error handling.

3. **Aggregate-based command ordering**: Commands are processed sequentially per aggregate (project or thread). There's no cross-aggregate transaction—each command is independent. This avoids distributed locking but limits parallelism.

4. **In-memory read model with snapshot bootstrap**: The `OrchestrationReadModel` is held in memory. Bootstrap from `ProjectionSnapshotQuery` at startup. This is fast but means the process holds all state in memory.

5. **Separate event projection from event persistence**: Events are persisted first, then projected to the read model and async projection pipeline. This ensures events survive even if projection fails.

6. **Reactor pattern for side effects**: Reactors (`ProviderCommandReactor`, `CheckpointReactor`, `ProviderRuntimeIngestion`) subscribe to domain events and execute side effects. This decouples business logic from side effects.

## Notable Patterns

1. **Command envelope pattern** (`OrchestrationEngine.ts:52-56`): Commands are wrapped in an envelope with `result` Deferred and `startedAtMs` timestamp. This allows async command completion with metrics.

2. **Causation and correlation IDs** (`decider.ts:37-38`): Events carry `causationEventId` (parent event) and `correlationId` (command that triggered them). Enables tracing event chains.

3. **Invariant-based validation** (`commandInvariants.ts`): Preconditions checked before command processing. Returns `OrchestrationCommandInvariantError` on violation.

4. **Effect.fn() for traced functions** (`decider.ts:49`): Uses `Effect.fn("decideCommandSequence")` to create named spans automatically.

5. **Schema-first with Effect/Schema** (`packages/contracts/src/orchestration.ts`): All contracts defined with Effect's Schema for runtime validation.

6. **Optional OTLP via env vars** (`docs/observability.md:94-98`): Tracing/metrics export is opt-in. Local trace file always works.

## Tradeoffs

1. **Single-threaded command processing**: The orchestration engine processes one command at a time per aggregate. This is simple and correct but can't parallelize independent commands.

2. **In-memory read model**: Fast access but limited to single-node deployment. No cross-instance state sharing without external snapshot store.

3. **No explicit step/DAG concept**: The event model is flexible but doesn't provide built-in step enumeration, progress percentage, or dependency visualization.

4. **Metrics without local persistence**: Metrics exist in-process and via OTLP. If OTLP isn't configured, there's no local metric artifact to inspect.

5. **No token/cost accounting**: Turn metadata captures model selection but not token counts or cost. This would require provider integration hooks.

6. **Provider-runtime coupling**: The orchestration engine knows about provider sessions, turns, and approval flows. This couples the general command model to Codex-specific concepts.

## Failure Modes / Edge Cases

1. **Duplicate command handling**: If the same command is dispatched twice, the `CommandReceiptRepository` returns the cached result. Idempotent by design.

2. **Projection divergence**: If `projectEvent` fails for a given event, the transaction rolls back. But async projection pipeline (`ProjectionPipeline`) may lag. Historical runs could show inconsistent state if projection fails silently.

3. **Read model corruption**: If projection snapshot query returns stale data, the read model could be inconsistent with event store. No explicit reconciliation protocol beyond startup bootstrap.

4. **Provider runtime failures**: If provider session fails mid-turn, `ProviderRuntimeIngestion` must emit appropriate error events. If ingestion fails, events may be lost or duplicated.

5. **Spanning multiple aggregates**: Commands that affect multiple threads (e.g., project deletion) use `decideCommandSequence` to emit a sequence of commands. This is serial and not atomic across aggregates.

6. **Turn interruption race**: If interrupt is requested while turn is completing, the provider runtime must handle the race. No explicit locking.

## Future Considerations

1. **Add explicit step/DAG primitives**: To support UltraPlan's workflow composition, consider adding a `WorkflowStep` concept with explicit dependencies, parallel execution, and progress tracking.

2. **Token/cost metering**: Add per-turn token counting via provider integration hooks. This would enable cost dashboards and budget enforcement.

3. **Snapshot persistence**: Consider external snapshot store (Redis, PostgreSQL) for multi-node deployments. Current in-memory read model limits horizontal scaling.

4. **Step-level retries**: Add retry policy configuration per step type with backoff. Currently no automatic retry.

5. **Live progress projection service**: Build a canonical service that consumes domain events and projects live progress views. Currently each consumer (WebSocket server) must reconstruct progress.

6. **Cross-aggregate transactions**: Consider saga or outbox pattern for operations that span multiple aggregates (e.g., moving a thread between projects).

## Questions / Gaps

1. **How does CheckpointReactor interact with provider runtime to capture git refs?** The `thread.turn-diff-completed` event carries the checkpoint ref, but the mechanism of how the ref is captured is unclear—likely in provider runtime ingestion layer.

2. **What happens to in-flight turns during server restart?** Session state is persisted via `thread.session.set`, but the provider process may not survive restart. No explicit session resume protocol.

3. **How does the WebSocket server project events to clients?** Need to inspect `wsServer.ts` to understand event→push transformation.

4. **What's the full provider event schema?** Only the ingestion service interface was found. Need to trace `ProviderRuntimeIngestion.ts` layer implementation.

5. **No token or cost fields found in session or turn schemas.** Are these intentionally omitted or planned for future addition?

---

Generated by `study-areas/04-workflow-composition-and-observability.md` against `t3code`.