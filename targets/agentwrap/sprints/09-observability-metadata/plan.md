# Sprint Tracker: Observability, Metadata, and Persistence Hooks

> Target: agentwrap
> Sprint ID: 09-observability-metadata
> Created: 2026-05-20
> Reasoning: `targets/agentwrap/sprints/09-observability-metadata/reasoning.md`
> Roadmap Section: `targets/agentwrap/roadmap.md` - `## Sprint 9: Observability, Metadata, and Persistence Hooks`

## Sprint Overview

- **Sprint Name:** Observability, Metadata, and Persistence Hooks
- **Sprint Focus:** Add runtime-neutral run records, event sinks, and optional persistence/inspection hooks so products can build dashboards and historical views without SDK-owned storage.
- **Depends On:** Sprints 0-8 runtime contract, OpenCode adapter, lifecycle/session handling, health/config checks, retry/fallback policy metadata, permission policy/audit events, and validation/repair metadata.
- **Status:** Completed

## Requirement Links

- `targets/agentwrap/sources/PRD.md` - active run monitoring, observability and metadata, cost/time estimation, evidence preservation for synthesis, permissions/blocking visibility, product-agnostic SDK goals.
- `targets/agentwrap/sources/TRD.md` - observability, metadata requirements, persistence requirements, canonical event model, permissions, error model, concurrency, security/secrets, output safety.
- `targets/agentwrap/sources/feature-architecture.md` - explicit state ownership, runtime-owned orchestration, logic/infra separation, minimal abstraction rule.
- `targets/agentwrap/roadmap.md` - Sprint 9 goal, scope, OpenCode internals evidence, output, and quality gate.
- `targets/agentwrap/sprints/09-observability-metadata/reasoning.md` - reasoning decisions this tracker executes.

## Evidence Links

- `targets/agentwrap/reports/evidence/observability-metadata.md` - run record schema, event sinks, usage/cost metadata, active/historical inspection, audit trails.
- `targets/agentwrap/reports/permission-based-agent-wrapping.md` - permission decision audit requirements and future runtime pressure.
- `studies/opencode-wrap-study/reports/final/04-workflow-composition-and-observability.md` - event projection, metadata capture, durable projection, and non-DAG boundary.
- `studies/go-cli-study/reports/final/10-logging-observability.md` - structured diagnostics, canonical event data separated from debug logs, and safe operator-facing observability.
- `studies/go-cli-study/reports/final/14-performance.md` - streaming, bounded memory, and persistence write bottleneck risks.
- `studies/go-cli-study/reports/final/15-philosophy.md` - accepted complexity only where product benefit is clear.
- `/home/antonioborgerees/coding/agentwrap/runtime.go` - current `Runtime`, `Run`, `RunRequest`, and `RunResult` boundaries.
- `/home/antonioborgerees/coding/agentwrap/metadata.go` - current metadata, attempt, policy, session, validation, repair, artifact, usage, and cost types.
- `/home/antonioborgerees/coding/agentwrap/events.go` - canonical event envelope, event kinds, and raw payload safety flag.
- `/home/antonioborgerees/coding/agentwrap/permissions.go` - permission policy summary and audit record model.
- `/home/antonioborgerees/coding/agentwrap/validation.go` - existing runtime-neutral wrapper pattern from Sprint 8.
- Roadmap note: Sprint 9 still mentions executable `status/inspect`, but that is stale and out of scope for the SDK-only target.

## Sprint Goals

- **Primary Goal:** Products can inspect active and completed runs through runtime-neutral records built from canonical events and metadata, with optional persistence hooks and no required storage backend.
- **Secondary Goals:**
  - Allow callers to attach event sinks and stores without coupling adapters to persistence.
  - Preserve permission audit, validation/repair, retry/fallback, session, artifact, usage, timing, and cost facts in inspectable records.

## Scope

- Define public run record/snapshot types for active and completed inspection.
- Define event record and event sink interfaces that consume canonical SDK events.
- Define optional persistence interfaces for run snapshot upsert, event append, active-run listing, completed-run lookup, and per-run event history.
- Implement a runtime-neutral observing wrapper that forwards events, updates active projections, records completed runs, and fans out to sinks/stores.
- Implement a deterministic in-memory reference store for tests and SDK inspection use.
- Add active-run and completed-run inspection APIs.
- Preserve permission audit records, permission denials, unsupported/best-effort policy features, and manual/ask facts in records and event history.
- Preserve validation/repair, retry/fallback, cleanup, retained-session, artifact, warning, error, timing, usage, and estimated cost metadata.
- Add artifact producer metadata where needed so an artifact can identify source run, runtime, provider, model, timing, usage, and estimated cost when available.
- Add raw payload persistence policy that excludes unsafe raw payload bytes by default and records safe omission markers.
- Add tests for record completeness, event ordering, sink/store failures, permission audit completeness, raw payload safety, and concurrent run isolation.
- Update README/package docs and add accepted decisions to `DECISIONS.md` after implementation evidence exists.

## Non-Scope

- Choosing SQLite, Postgres, files, or any durable backend as the SDK default.
- Building a dashboard, TUI, SSE server, or web API.
- Workflow/DAG scheduling, UltraPlan study workflow logic, or multi-agent orchestration.
- OpenCode server-mode SSE/REST client implementation.
- Broad public live approval service or approval UI.
- Second-runtime implementation.
- Persisting prompts, large artifact content, or unsafe native raw payload bytes by default.
- Replacing existing retry/fallback, validation/repair, permission, or lifecycle models.
- Any executable or CLI inspection surface.

## Proposed Implementation Shape

- **Package / Module Boundaries:** Keep public record, sink, store, inspector, and wrapper types in the root `agentwrap` package. Keep deterministic test helpers in `internal/testkit` if needed. Keep OpenCode adapter free of store dependencies.
- **Public Surface:** Add types such as `RunRecord`, `RunEventRecord`, `RunInspector`, `EventSink`, `RunStore`, `PersistencePolicy`, and an observing wrapper such as `ObservingRuntime`. Names can change during implementation, but the surface must express record snapshots, event append, active/completed inspection, and optional sink/store configuration.
- **State And Lifecycle:** Active projections update from run start through terminal completion. Terminal runs move from active to completed while preserving event history. Records preserve parent/retry/fallback/repair/session relationships and latest significant event.
- **Error And Failure Behavior:** Required persistence/sink failures are classified and visible. Best-effort sink failures are recorded in metadata/events and do not silently replace primary run outcomes.
- **Observability:** Canonical events remain the source of dashboard truth. Records include event counts, latest event summary, status/timing, runtime/provider/model, attempts, warnings, errors, artifacts, usage, estimates, session metadata, permission audit, validation/repair, policy, and cleanup facts.
- **Testing Surface:** Use fake runtimes, in-memory stores, deterministic clocks, and projection/store fixtures by default. Real OpenCode smoke is not required unless implementation changes adapter behavior.

## Decisions

- [x] **Decision 1: Run Records Are SDK Snapshots Built From Existing Metadata**
  > **Requirement:** PRD/TRD observability, metadata, active/historical inspection, and persistence requirements.
  > **Evidence:** `observability-metadata.md`, `opencode-wrap-study/reports/final/04-workflow-composition-and-observability.md`, `/home/antonioborgerees/coding/agentwrap/metadata.go`.
  > **Tradeoff:** Adds a public record/snapshot model, but avoids forcing every product to reconstruct state from raw events.
  > **Rejected Alternative:** Treat `RunMetadata` alone as the durable record, because active snapshots and event retention facts need record-specific fields.
  > **Risk / Follow-up:** Avoid duplicating attempt, permission, validation, repair, and artifact structures.

- [x] **Decision 2: Event Sinks And Stores Live Behind A Runtime-Neutral Observer Wrapper**
  > **Requirement:** TRD event sink, observability, concurrency, and optional persistence requirements.
  > **Evidence:** `observability-metadata.md`, `go-cli-study/reports/final/14-performance.md`, Sprint 8 `ValidatingRuntime` wrapper pattern.
  > **Tradeoff:** Event forwarding has ordering/backpressure complexity, but adapters stay storage-agnostic.
  > **Rejected Alternative:** Adapter-local persistence, because it would couple OpenCode mechanics to SDK durability and duplicate logic for future runtimes.
  > **Risk / Follow-up:** Tests must prove no silent event loss; slow sink behavior must be explicit.

- [x] **Decision 3: Persistence Is Optional And Backend-Neutral**
  > **Requirement:** TRD persistence requirements explicitly avoid prescribing storage technology.
  > **Evidence:** `opencode-wrap-study/reports/final/04-workflow-composition-and-observability.md`, `go-cli-study/reports/final/15-philosophy.md`.
  > **Tradeoff:** No production durable backend ships by default in this sprint.
  > **Rejected Alternative:** Built-in SQLite store now, because it overfits to OpenCode evidence and chooses a backend before product integration requires it.
  > **Risk / Follow-up:** A future product integration must choose and test a durable store.

- [x] **Decision 4: Permission Audit And Raw Payload Persistence Are Safe By Default**
  > **Requirement:** PRD/TRD permissions, audit, diagnostics, security/secrets, and cost/estimate requirements.
  > **Evidence:** `permission-based-agent-wrapping.md`, `/home/antonioborgerees/coding/agentwrap/permissions.go`, `/home/antonioborgerees/coding/agentwrap/events.go`.
  > **Tradeoff:** Default records provide less native forensic detail, but avoid leaking unsafe payload bytes or secrets.
  > **Rejected Alternative:** Persist all native raw payloads verbatim, because existing `RawPayload.Safe` semantics and security requirements forbid blind persistence.
  > **Risk / Follow-up:** Add explicit opt-in raw payload persistence later if a product needs it and can own redaction policy.

- [x] **Decision 5: Sprint 9 Remains SDK-Only Despite Roadmap Residue**
  > **Requirement:** PRD/TRD define an SDK boundary; the user clarified there is no CLI surface.
  > **Evidence:** `targets/agentwrap/sources/PRD.md`, `targets/agentwrap/sources/TRD.md`, current target clarification, and Sprint 9 reasoning.
  > **Tradeoff:** The roadmap executable wording is treated as stale and is not implemented in this sprint.
  > **Rejected Alternative:** Add a status/inspect command surface just because the roadmap text still says so.
  > **Risk / Follow-up:** Clean the roadmap wording later if needed so future sprint planning does not repeat the mistake.

## Execution Checklist

- [x] **Task 1: Define Run Record And Event Record Models**
  > *Description: Add the public data shapes that active and completed inspection will return.*
  - [x] **Sub-task 1.1:** Define `RunRecord` or equivalent with run ID, parent run ID, status, runtime/provider/model, effective safe config summary, timing, latest event summary, attempts, policy, session, permission, validation, repair, cleanup, artifacts, warnings, errors, usage, estimated cost, throughput, and native metadata summary.
  - [x] **Sub-task 1.2:** Define `RunEventRecord` or equivalent with run ID, event ID, sequence, time, kind, type, safe payload, raw payload presence/safety/omission metadata, and optional sink/store timestamps.
  - [x] **Sub-task 1.3:** Define mandatory versus best-effort fields in docs/comments so unknown usage/cost values remain unknown, not zero.
  - [x] **Sub-task 1.4:** Add artifact producer metadata if current `ArtifactRef` metadata is insufficient to identify source run/runtime/provider/model and usage/cost facts.

- [x] **Task 2: Define Event Sink, Store, And Inspector Interfaces**
  > *Description: Provide backend-neutral hooks for event persistence and run inspection.*
  - [x] **Sub-task 2.1:** Define `EventSink` for canonical event records with context-aware append semantics.
  - [x] **Sub-task 2.2:** Define `RunStore` or split interfaces for upserting run snapshots, appending event records, listing active runs, getting completed runs, and listing run events.
  - [x] **Sub-task 2.3:** Define required versus best-effort persistence behavior and error reporting semantics.
  - [x] **Sub-task 2.4:** Define `RunInspector` methods for active-run and completed-run lookup without exposing store implementation details.

- [x] **Task 3: Implement In-Memory Reference Store**
  > *Description: Provide a deterministic store for tests, examples, and thin commands without choosing durable storage.*
  - [x] **Sub-task 3.1:** Implement in-memory active/completed record storage with per-run ordered event history.
  - [x] **Sub-task 3.2:** Preserve active-to-completed transitions and keep completed records inspectable.
  - [x] **Sub-task 3.3:** Support concurrent run isolation with mutexes or equivalent safe synchronization.
  - [x] **Sub-task 3.4:** Add store tests for not-found, ordering, relationship metadata, concurrent writes, and completed-run lookup.

- [x] **Task 4: Implement Observing Runtime Wrapper**
  > *Description: Wrap any `Runtime` so events and final results update records and optional sinks without adapter changes.*
  - [x] **Sub-task 4.1:** Implement wrapper startup that creates an initial active record from `RunRequest` and inner run identity.
  - [x] **Sub-task 4.2:** Drain inner run events, assign stable sequence/order, forward events to callers, append event records, and update latest-event/status projections.
  - [x] **Sub-task 4.3:** On `Wait`, merge final `RunResult` metadata into the completed record and preserve primary outcome semantics.
  - [x] **Sub-task 4.4:** Preserve cancellation behavior and ensure observer cleanup cannot cancel unrelated runs.
  - [x] **Sub-task 4.5:** Record sink/store failures according to required or best-effort policy.

- [x] **Task 5: Preserve Audit, Usage, Cost, And Redaction Semantics**
  > *Description: Make records safe and useful for dashboards, audits, synthesis, and cost/time analysis.*
  - [x] **Sub-task 5.1:** Ensure permission policy summaries, allow/deny/ask/manual audit records, unsupported/best-effort features, and repair permission denials are preserved in records and event history.
  - [x] **Sub-task 5.2:** Persist validation and repair history from Sprint 8, including repair attempts and final validation status.
  - [x] **Sub-task 5.3:** Persist retry/fallback attempt relationships and policy decisions from Sprint 6.
  - [x] **Sub-task 5.4:** Preserve usage/cost fields with nil/unknown semantics and `Estimate` flags.
  - [x] **Sub-task 5.5:** Omit unsafe raw payload bytes by default and record safe omission markers.

- [x] **Task 6: Add Active And Completed Inspection API**
  > *Description: Provide product-facing methods for progress dashboards and historical inspection.*
  - [x] **Sub-task 6.1:** Add active-run listing with current status, elapsed time, latest event, attempts, warnings, and model/provider facts.
  - [x] **Sub-task 6.2:** Add completed-run lookup with full final metadata and event history references.
  - [x] **Sub-task 6.3:** Add run event history lookup with ordered records and configurable retention behavior if implemented.
  - [x] **Sub-task 6.4:** Add examples or docs showing a product dashboard consuming canonical events/records rather than logs.

- [x] **Task 7: Tests, Docs, And Decisions**
  > *Description: Prove the observability layer behaves correctly and record durable sprint decisions after implementation.*
  - [x] **Sub-task 7.1:** Add fake-runtime tests for success, failure, cancellation, retry/fallback, validation failure, repair success, permission denial, cleanup failure, and usage/cost metadata.
  - [x] **Sub-task 7.2:** Add event ordering, required sink failure, best-effort sink failure, and raw payload safety tests; slow sink/drop accounting is deferred because the current wrapper does not drop observed events.
  - [x] **Sub-task 7.3:** Add concurrent run tests proving isolation and no cross-run cancellation/state contamination.
  - [x] **Sub-task 7.4:** Update README/package docs with event sinks, stores, inspection APIs, raw payload safety, and estimate semantics.
  - [x] **Sub-task 7.5:** Add accepted decisions to `targets/agentwrap/DECISIONS.md` after implementation evidence exists.

## Testing And Documentation Checklist

- [x] **Unit Tests:** run record construction, event record conversion, store behavior, inspection APIs, raw payload policy, usage/cost semantics, permission audit aggregation.
- [x] **Fixture Tests:** fake runtime events for lifecycle, usage, artifact, permission, validation, retry/fallback, final result, malformed/native extension, and raw payload cases.
- [x] **Integration Tests:** observing wrapper around existing fake and OpenCode adapter interfaces where no live runtime is required.
- [x] **Real Runtime Smoke:** not required unless implementation changes OpenCode adapter behavior; record explicit deferral if unchanged.
- [x] **Documentation Updates:** README/package docs and decision log entries after implementation.

## Risks And Blockers

| Risk | Impact | Mitigation | Status |
| --- | --- | --- | --- |
| Store API overfits in-memory implementation | Medium | Keep interfaces minimal and backend-neutral; test through interface | Mitigated |
| High-frequency event persistence slows runs | High | Current wrapper is synchronous and explicit; bounded buffering/drop accounting deferred until high-volume caller pressure | Deferred |
| Unsafe native payloads leak into records | High | Default to canonical safe payloads and raw omission markers; test redaction behavior | Mitigated |
| Roadmap executable residue distorts SDK scope | Medium | Keep Sprint 9 explicitly SDK-only and record the roadmap mismatch | Closed |
| Optional sink failure hides important data loss | Medium | Record sink failures and distinguish required vs best-effort sinks | Mitigated |

## Open Questions

- Should the first reference store remain memory-only, or should a JSONL/file-backed fixture store be added for command demos? - Decide during implementation only if command tests need persistence across processes.
- What default event retention policy should apply to high-volume deltas? - Implementation should prefer significant-event retention by default and full retention opt-in if a default is needed.
- Should missing TRD lifecycle states be added now or projected from events/metadata? - Start with projection; expand public `RunStatus` only if tests show ambiguity.
- Should sink failure ever change the primary run result? - Only when persistence is explicitly configured as required.

Resolved during execution:

- Reference persistence remains memory-only in Sprint 9. Durable JSONL/file/SQLite stores are deferred to product integration because the SDK target has no command/process-crossing requirement.
- Default event retention stores all observed canonical event records in `MemoryRunStore`; bounded retention/drop accounting is deferred until high-frequency caller pressure appears.
- Lifecycle states are projected from existing events/metadata; no new `RunStatus` values were added.
- Required sink failures change `Wait` only when the primary runtime outcome succeeded; best-effort sink failures are recorded on the run record.

## Success Criteria

- [x] **Progress dashboard data exists:** A product can list active runs with status, elapsed time, latest event, attempts, warnings, runtime, provider, and model without runtime-specific code.
- [x] **Completed run inspection exists:** A product can inspect a completed run record with final status, timing, attempts, session relationship, validation/repair, cleanup, warnings, errors, artifacts, usage, and cost estimates.
- [x] **Provider/model artifact provenance exists:** A product can identify which runtime/provider/model produced a report or artifact where metadata is available.
- [x] **Permission audit is complete:** Records and event history explain whether tool actions were allowed, denied, or sent for manual approval, including repair permission denials.
- [x] **Estimates are safe:** Unknown usage/cost values are not zeroed, and estimates are clearly marked as estimates.
- [x] **Persistence is optional:** The SDK works with no store, an in-memory store, and caller-provided stores without adapter changes.
- [x] **Event ordering is testable:** Stored event records preserve per-run order and expose failed sink behavior explicitly; dropped-event accounting remains deferred because the current wrapper does not drop observed events.
- [x] **Raw payloads are safe by default:** Unsafe native raw payload bytes are not persisted unless explicitly configured.
- [x] **SDK scope is preserved:** Sprint 9 delivers records, sinks, stores, and inspection APIs without adding a command surface.

## Study Evaluation

- [x] **Patterns Followed:** canonical events as dashboard source, durable projection pattern without backend lock-in, structured diagnostics, bounded/explicit sink behavior, artifact-first metadata, safe permission audit records.
- [x] **Anti-Patterns Avoided:** log parsing for dashboards, adapter-local storage, SDK-owned DAG/dashboard, mandatory SQLite, unsafe raw payload persistence, treating unknown cost as zero, and roadmap residue expanding scope.
- [x] **Comparison Needed:** Compare implementation against observability-metadata, workflow-composition, logging-observability, performance, and permission evidence.
- [x] **Proceed / Iterate:** Proceed to Sprint 10 with bounded buffering/drop accounting and durable backend selection explicitly deferred until caller pressure requires them.

## Review And Sign-Off

- Sprint Status: Completed
- Completion Date: 2026-05-20

## Execution Evidence

- 2026-05-20: Sprint 9 reasoning and tracker created from roadmap, PRD/TRD, feature architecture protocol, study index, observability evidence, permission report, relevant final reports, Sprint 8 outputs, decision log, and current agentwrap code references.
- 2026-05-20: Sprint scope corrected to SDK-only after target clarification; stale executable `status/inspect` roadmap wording is treated as residue, not scope.
- 2026-05-20: Implemented root-package `RunRecord`, `RunEventRecord`, `EventSink`, `RunStore`, `RunInspector`, `PersistencePolicy`, `ObservingRuntime`, `NamedEventSink`, and deterministic `MemoryRunStore` in `/home/antonioborgerees/coding/agentwrap/observability.go`.
- 2026-05-20: Added tests in `/home/antonioborgerees/coding/agentwrap/observability_test.go` covering active/completed store transitions, event ordering, completed inspection, raw payload omission, artifact producer metadata, required sink failure, best-effort sink failure, and concurrent run isolation.
- 2026-05-20: Updated `/home/antonioborgerees/coding/agentwrap/README.md` and `/home/antonioborgerees/coding/agentwrap/doc.go` with observability, store, sink, inspection, estimate, and raw payload safety semantics.
- 2026-05-20: Added accepted decisions DEC-027 through DEC-030 to `targets/agentwrap/DECISIONS.md`.
- 2026-05-20: `go test ./...` failed under sandbox because the default Go build cache at `/home/antonioborgerees/.cache/go-build` is read-only.
- 2026-05-20: `env GOCACHE=/tmp/agentwrap-gocache go test ./...` passed for `github.com/antonioborgerees/agentwrap`, `github.com/antonioborgerees/agentwrap/internal/testkit`, and `github.com/antonioborgerees/agentwrap/opencode`.
- 2026-05-20: Real OpenCode smoke explicitly deferred because Sprint 9 did not change OpenCode adapter behavior.
