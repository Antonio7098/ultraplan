# Sprint Reasoning: Observability, Metadata, and Persistence Hooks

> Target: agentwrap
> Sprint ID: 09-observability-metadata
> Output: `targets/agentwrap/sprints/09-observability-metadata/reasoning.md`
> Sprint Tracker: `targets/agentwrap/sprints/09-observability-metadata/plan.md`

## Overview

**Sprint:** Observability, Metadata, and Persistence Hooks  
**Purpose:** Make run state, event history, permission audit facts, usage/cost facts, and active/completed inspection available through runtime-neutral SDK hooks without choosing a storage backend.  
**Roadmap Section:** `targets/agentwrap/roadmap.md` - `## Sprint 9: Observability, Metadata, and Persistence Hooks`  
**Depends On:** Sprints 0-8 runtime contract, OpenCode adapter, lifecycle/session handling, health/config checks, retry/fallback policy metadata, permission policy/audit events, and validation/repair metadata.  
**Reasoning Status:** Ready For Tracker

## Target Sources

- `targets/agentwrap/sources/PRD.md` - observability, metadata, active-run monitoring, cost/time estimation, artifact evidence, permission visibility, historical inspection, and product-agnostic SDK goals.
- `targets/agentwrap/sources/TRD.md` - observability, metadata requirements, persistence requirements, canonical event model, permissions, error model, concurrency, and output safety.
- `targets/agentwrap/sources/feature-architecture.md` - state-first design, explicit state ownership, runtime-owned orchestration, logic/infra separation, and minimal abstraction rule.
- `targets/agentwrap/roadmap.md` - Sprint 9 goal, scope, OpenCode internals evidence, output, and quality gate.

## Evidence Basis

**Evidence Status:** Partial with reason  
**Context Strategy:** Staged loading used. PRD, TRD, feature architecture, roadmap Sprint 9, study index, observability pack, permission report, relevant final reports, Sprint 8 outputs, decision log, and narrow code references were loaded. The roadmap still contains an executable `status/inspect` reference that does not match the current SDK-only target; this sprint treats that as stale planning residue and keeps scope at the SDK layer.

### Evidence Packs Used

- `targets/agentwrap/reports/evidence/observability-metadata.md` - run record schema, event sink interface, usage/cost metadata, active/historical inspection, and audit trail requirements.
- `targets/agentwrap/reports/permission-based-agent-wrapping.md` - permission event/audit requirements and distinction between static policy, runtime decisions, and future live approval mechanics.

### Final Reports Used

- `studies/opencode-wrap-study/reports/final/04-workflow-composition-and-observability.md` - supports typed event registry concepts, durable event projection, metadata capture, and avoiding SDK-level DAG/dashboard composition.
- `studies/go-cli-study/reports/final/10-logging-observability.md` - supports structured diagnostics, separation of canonical event data from debug logs, and safe operator-facing diagnostics.
- `studies/go-cli-study/reports/final/14-performance.md` - supports streaming, bounded memory, disk-backed persistence for long sessions, and caution around high-frequency event writes.
- `studies/go-cli-study/reports/final/15-philosophy.md` - supports deliberate complexity, event bus/decorator patterns when earned, and rejecting complexity without matching product benefit.

### Per-Source Reports Used

- None. Evidence packs, final reports, roadmap OpenCode internals evidence, and narrow code inspection were sufficient for sprint-level planning.

### Code References Used

- `/home/antonioborgerees/coding/agentwrap/runtime.go:8` - `Runtime` and `Run` are the current start/events/wait/cancel boundary that observability must wrap or observe.
- `/home/antonioborgerees/coding/agentwrap/runtime.go:48` - `RunResult` already carries final status, metadata, artifacts, warnings, usage, timestamps, and classified error.
- `/home/antonioborgerees/coding/agentwrap/metadata.go:17` - `RunMetadata` already centralizes context, attempts, policy, session, permissions, cleanup, validation, repair, artifacts, warnings, errors, usage, estimated cost, and native metadata.
- `/home/antonioborgerees/coding/agentwrap/metadata.go:41` - `AttemptSummary` captures retry/fallback attempt lineage that run records must preserve.
- `/home/antonioborgerees/coding/agentwrap/metadata.go:79` - `PolicyMetadata` and dropped policy events are existing audit/read-model inputs.
- `/home/antonioborgerees/coding/agentwrap/metadata.go:120` - validation and repair metadata from Sprint 8 must be persisted without changing primary outcome semantics.
- `/home/antonioborgerees/coding/agentwrap/metadata.go:188` - session relationship metadata identifies fresh, same, forked, replaced, unsupported, and best-effort retained-session behavior.
- `/home/antonioborgerees/coding/agentwrap/metadata.go:203` - artifact references are already durable-reference shaped and should not embed large content in events.
- `/home/antonioborgerees/coding/agentwrap/metadata.go:212` - usage and cost estimate fields already distinguish unknown token values by nil pointers and mark estimates.
- `/home/antonioborgerees/coding/agentwrap/events.go:5` - canonical events are open envelopes; Sprint 9 should add ordering/recording behavior without closing the event schema prematurely.
- `/home/antonioborgerees/coding/agentwrap/events.go:24` - existing event kinds cover lifecycle, session, messages, tools, artifacts, permissions, usage, rate limits, validation, retry/fallback, and final result.
- `/home/antonioborgerees/coding/agentwrap/events.go:70` - raw native payloads are sensitive by default and must not be blindly persisted.
- `/home/antonioborgerees/coding/agentwrap/lifecycle.go:7` - public statuses currently include starting, running, validating, repairing, completed, failed, and cancelled; active-run projection must work from this vocabulary.
- `/home/antonioborgerees/coding/agentwrap/permissions.go:88` - `PermissionAudit` is the safe permission decision fact that run records must preserve.
- `/home/antonioborgerees/coding/agentwrap/permissions.go:98` - `PermissionMetadata` already summarizes effective policy, support, audit records, and unsupported features.
- `/home/antonioborgerees/coding/agentwrap/validation.go:137` - `ValidatingRuntime` demonstrates the existing wrapper pattern for runtime-neutral orchestration around a `Runtime`.

### Evidence Rejected Or Not Used

- **Roadmap `status/inspect` executable reference:** Treated as stale scope residue because the target is SDK-only.
- **OpenCode live SSE server/API implementation details:** Useful for future server-mode adapter work, but Sprint 9 should observe canonical SDK events and not require OpenCode-specific external event APIs.
- **Durable SQLite implementation as a requirement:** OpenCode evidence shows durable projection can work, but TRD explicitly does not prescribe persistence technology. Sprint 9 should define optional interfaces and an in-memory/reference implementation, not choose SQLite as the SDK default.
- **Workflow DAG/replay evidence:** The opencode-wrap report identifies DAG and deterministic replay as separate concerns. Sprint 9 should support event replay/reconstruction from records, not implement workflow scheduling or Temporal-style replay.
- **Full dashboard/UI evidence:** The PRD requires dashboards to be buildable by products; Sprint 9 should provide data surfaces and commands, not build a dashboard.

## Requirement Map

### Requirement Index Used In This Sprint

| Requirement | Source | Area | Applicability | Why It Matters For This Sprint |
| --- | --- | --- | --- | --- |
| Monitor many active runs | PRD Primary Use Cases | Active inspection | Applicable | Products need current phase/status, elapsed time, model/provider, attempts, warnings, and failure state without runtime-specific code. |
| Estimate and record run cost | PRD Primary Use Cases / Cost and Time Estimation | Usage/cost | Applicable | Run records need observed usage and clearly marked estimates. |
| Preserve evidence for later synthesis | PRD Primary Use Cases / Output Safety | Historical inspection | Applicable | Event history, artifact references, and metadata must be reloadable later. |
| Observability and Metadata | PRD Product Requirements | Metadata | Applicable | Every run must expose status, timing, runtime, provider, model, attempts, warnings, errors, artifacts, usage, and session retention metadata. |
| Structured Events | PRD/TRD | Event stream | Applicable | Dashboards must be built from canonical events, not parsed logs. |
| Permissions and Blocking States | PRD/TRD | Audit | Applicable | Permission decisions and denials must be visible and auditable. |
| Observability | TRD | SDK surface | Applicable | Requires active and historical status, structured events, event sinks, and diagnostics. |
| Metadata Requirements | TRD | Run records | Applicable | Defines the minimum run record and artifact producer facts. |
| Persistence Requirements | TRD | Optional storage | Applicable | Persistence must be optional and support active/completed inspection, attempt relationships, retained sessions, artifacts, and lifecycle replay. |
| Concurrency | TRD | Isolation | Applicable | Multiple concurrent runs require isolated active state and no cross-run cancellation or state contamination. |
| Security and Secrets | TRD | Redaction | Applicable | Diagnostics and raw payload persistence must avoid secret leakage. |
| Output Validation/Repair | TRD/Sprint 8 | Metadata continuity | Applicable | Sprint 9 must persist validation and repair facts without changing the outcome model from Sprint 8. |
| Workflow composition | Open product/technical questions | Product orchestration | Non-Applicable | SDK should not add UltraPlan workflow/DAG composition in this sprint. |

### Applicable Requirements

- **Run records must be product-usable:** A record must include run ID, parent run ID, runtime/provider/model, config summary, timing, status, attempts, policy decisions, usage, estimated cost, artifacts, validation, errors, permission audit, and session relationship facts.
- **Events are the dashboard source:** Products should subscribe to canonical events and build progress views without logs or native runtime event schemas.
- **Persistence is optional:** The SDK must define persistence hooks and an inspectable state model without forcing a storage engine on callers.
- **Active and completed inspection are both required:** Callers need in-memory active views while a run is executing and persisted/historical views where a store is configured.
- **Permission audit facts are first-class:** Static policy summaries, allow/deny/ask decisions, denials, unsupported/best-effort policy features, and manual approval markers must be available in canonical event history and final records.
- **Estimates must be marked as estimates:** Missing usage values remain unknown, not zero; cost estimates must not be represented as authoritative billing data.
- **Raw payloads require redaction discipline:** Native payloads can be useful for diagnostics, but the existing `RawPayload.Safe` flag means persistence must default to safe canonical data and only persist raw payloads when explicitly allowed.
### Non-Applicable Requirements

- **Second runtime proof:** Sprint 11 owns second-runtime pressure-testing.
- **DAG/workflow orchestration:** Products such as UltraPlan own workflow composition on top of run/event records.
- **Distributed storage:** TRD requires optional persistence hooks, not a distributed store.
- **OpenCode server-mode SSE client:** The current SDK surface streams canonical events from `Run.Events`; adapter-specific server streaming can be revisited in a future adapter sprint.
- **Live manual approval UI:** Sprint 7 intentionally deferred broad public live approval orchestration; Sprint 9 persists/inspects audit facts, not approval UX.
- **Executable status/inspect commands:** The roadmap still mentions these, but the target is SDK-only and this sprint does not add a command surface.

### Ambiguous Or Conflicting Requirements

- **Mandatory versus best-effort metadata:** PRD/TRD require broad metadata, but adapters cannot always supply tokens, costs, runtime version, or throughput. Sprint 9 should split required identity/status/timing fields from best-effort usage/cost/native facts.
- **Event retention depth:** Dashboards need enough event history, but high-frequency token/tool delta events can create persistence pressure. Sprint 9 should define a policy/config for retention and default to storing significant canonical events while allowing callers to opt into full event retention.
- **Raw native payload persistence:** Native payload preservation is useful for diagnostics, but security requirements require redaction and safe flags. Default persistence should exclude unsafe raw payload bytes.

### Open Questions

- Should the first reference persistence implementation be memory-only, JSONL, or filesystem-backed? The plan recommends memory-only plus interface tests unless implementation discovers a strong need for a file-backed fixture store.
- What is the default event retention policy for high-volume message deltas? The plan recommends "significant events by default, full canonical events opt-in" if implementation needs a default.
- Should `RunStatus` add explicit `initialized`, `health_checking`, `ready`, `waiting`, `retrying`, `fallback`, and `cleaned_up` statuses now to match TRD vocabulary, or should Sprint 9 project those phases from existing events/metadata until a lifecycle-focused revision is planned?
## Sprint Decision Analysis

### Decision Area 1: Run Record and Snapshot Model

**Problem:** Decide the shape and ownership of run records so active/historical inspection has a stable source of truth without duplicating every runtime-specific detail.

**Requirements Applied**
- PRD observability/metadata requires status, timing, runtime, provider, model, attempts, warnings, errors, artifacts, usage, cost, and session retention facts.
- TRD metadata requirements define run identifier, parent run identifier, runtime/version, provider/model, effective config summary, timing, status, attempts, policy decisions, usage, estimated cost, throughput, artifacts, validation, and errors.
- TRD persistence requirements require retry/fallback/repair relationships and retained session relationships.

**Evidence Applied**
- `observability-metadata.md` says every run should preserve runtime, provider, model, attempt, duration, status, warnings, errors, artifacts, and usage/cost data.
- `opencode-wrap-study/reports/final/04-workflow-composition-and-observability.md` separates runtime primitives, event projection, and metadata capture; it warns against adding DAG scheduling to this layer.
- `/home/antonioborgerees/coding/agentwrap/metadata.go:17` already has most record fields but marks them best-effort until observability sprints.
- `/home/antonioborgerees/coding/agentwrap/metadata.go:41` and `:120` show attempt, validation, and repair facts already exist and should be preserved rather than redesigned.

**Options Considered**
- **Option A:** Treat `RunMetadata` as the durable record directly.
- **Option B:** Add a `RunRecord`/`RunSnapshot` model that embeds or references `RunMetadata` and adds record-specific fields such as sequence, latest event, event counts, terminal error, persistence timestamps, and retention policy.
- **Option C:** Leave records entirely to callers and only document how to consume events.

**Chosen Approach**
- Define a runtime-neutral `RunRecord` or `RunSnapshot` model for active/completed inspection. It should use existing `RunResult`, `RunMetadata`, `AttemptSummary`, `PermissionMetadata`, `ValidationMetadata`, `RepairMetadata`, `ArtifactRef`, `Usage`, and `CostEstimate` types rather than creating parallel structures. Required record fields should be identity, status, timing, runtime context, latest event summary, and terminal outcome; usage/cost/runtime-version/native details remain best-effort.

**Decision Justification**
- A record model is required by PRD/TRD and lets products inspect without reconstructing state from event streams every time.
- Reusing existing metadata prevents Sprint 9 from undoing Sprint 4-8 decisions.
- Treating `RunMetadata` as the only record would not distinguish mutable active snapshots from append-only historical records or event retention facts.
- Leaving records to callers would fail the MVP durable run record requirement.
- The tradeoff is one more public model, but it is earned by the need to inspect active and completed runs.

**Execution Notes**
- Keep raw prompt/content out of records by default.
- Use nil for unknown usage/cost numeric facts and keep `CostEstimate.Estimate` semantics.
- Add artifact producer facts if existing `ArtifactRef.Metadata` is insufficient to identify source run/provider/model.
- Include event counters and latest significant event for fast status views without loading every event.
- Preserve permission audit, validation, repair, policy, cleanup, and session relationship metadata.

**Expected Evidence**
- **Tests:** Unit tests that build records from successful, failed, cancelled, retried, fallback, validation-failed, repair-succeeded, permission-denied, and cleanup-failed fake runs.
- **Runtime Evidence:** Final records show mandatory identity/status/timing fields and best-effort usage/cost without converting unknown values to zero.
- **Review Checks:** No duplicate shadow model for attempts, permission audit, validation, repair, or artifacts.

---

### Decision Area 2: Event Sink and Projection Boundary

**Problem:** Decide how events flow to dashboards and optional persistence without blocking runtime execution or hiding ordering/dropped-event behavior.

**Requirements Applied**
- PRD structured events require canonical events for dashboard use without log parsing.
- TRD observability requires caller-provided event sinks and diagnostics suitable for debugging failed runs.
- TRD concurrency requires isolated state for multiple concurrent runs.

**Evidence Applied**
- `observability-metadata.md` says progress views should come from canonical events, not logs.
- `opencode-wrap-study/reports/final/04-workflow-composition-and-observability.md` supports typed event registry/projection patterns but cautions that immediate durable writes can bottleneck high-frequency events.
- `go-cli-study/reports/final/14-performance.md` supports streaming and bounded memory for long-running work.
- `/home/antonioborgerees/coding/agentwrap/events.go:5` shows the current event envelope; `/home/antonioborgerees/coding/agentwrap/events.go:70` marks raw payload safety explicitly.
- `go-cli-study/reports/final/10-logging-observability.md` supports separating user-visible output from diagnostics.

**Options Considered**
- **Option A:** Make runtime adapters write directly to persistence stores.
- **Option B:** Add a runtime-neutral observer wrapper that fans out canonical events to one or more `EventSink` values and updates an inspectable projection.
- **Option C:** Require callers to drain `Run.Events()` and implement all persistence/projection themselves.

**Chosen Approach**
- Add an observer/persistence wrapper around `Runtime` or `Run` that drains canonical events, forwards them to callers, applies event sinks, and updates an active run projection. `EventSink` should be synchronous from the sink's perspective but isolated from adapter internals; slow sink behavior must be explicit through bounded buffering, backpressure, or recorded dropped sink events.

**Decision Justification**
- A wrapper matches the successful Sprint 8 `ValidatingRuntime` pattern and keeps persistence out of adapters.
- Direct adapter persistence would couple OpenCode mechanics to SDK durability and complicate future runtimes.
- Requiring callers to implement everything would fail the SDK-level event sink and inspection requirements.
- The tradeoff is careful event forwarding complexity; tests must prove events are neither reordered nor silently dropped.

**Execution Notes**
- Define event sequence and ingestion timestamp fields in stored event records if the public `Event` envelope remains unchanged.
- Do not persist unsafe `RawPayload.Data` unless configured; store safe metadata that raw data was present and whether it was omitted.
- Sinks should receive canonical events and record facts, not logs.
- A default no-op sink and in-memory projection should make the wrapper usable without persistence.
- If sink writes fail, surface the failure through metadata/events and final error classification only if configured as required; optional sinks should not turn successful runtime work into failure silently.

**Expected Evidence**
- **Tests:** Event ordering, sink failure behavior, slow consumer/drop accounting, raw payload redaction/omission, multiple concurrent run isolation, and final event/record consistency.
- **Runtime Evidence:** Event records include sequence/order, run ID, event kind/type, timestamp, safe payload summary, and optional omission markers for raw payloads.
- **Review Checks:** OpenCode adapter remains free of persistence/store writes.

---

### Decision Area 3: Optional Persistence Interface and Inspection Store

**Problem:** Decide the persistence contract that supports active/completed inspection while keeping storage backend optional and caller-owned.

**Requirements Applied**
- TRD persistence requirements say the SDK must allow callers to persist run state, support active and historical inspection, preserve attempt/session/artifact relationships, and not prescribe persistence technology.
- PRD post-run synthesis requires later workflows to reload event logs, artifact references, and metadata.
- Security requirements prohibit secret leakage in normal diagnostics and stored data.

**Evidence Applied**
- `opencode-wrap-study/reports/final/04-workflow-composition-and-observability.md` identifies durable event projection as valuable, especially sequence numbers and read models, but also notes write bottleneck risks.
- `go-cli-study/reports/final/14-performance.md` supports disk-backed persistence for long sessions when memory would grow unbounded.
- `go-cli-study/reports/final/15-philosophy.md` supports accepting complexity only when it maps to real product benefit.
- TRD explicitly avoids choosing a persistence technology.

**Options Considered**
- **Option A:** Add a built-in SQLite store in Sprint 9.
- **Option B:** Define `RunStore`/`EventStore`/`RunInspector` interfaces plus an in-memory reference store and tests.
- **Option C:** Persist only final `RunResult` values, not event history.

**Chosen Approach**
- Define optional persistence interfaces for event appends, run snapshot upserts, active-run listing, completed-run lookup, and event history lookup. Implement a deterministic in-memory reference store for tests and SDK inspection flows. Defer durable file/SQLite implementation unless implementation discovers a concrete need for a file-backed reference store.

**Decision Justification**
- Interfaces satisfy the TRD's backend-neutral persistence requirement.
- An in-memory store proves API shape and testability without committing to SQLite.
- Persisting only final results would not support active dashboards or replay/reconstruction of significant lifecycle events.
- Choosing SQLite now would overfit to OpenCode evidence and add operational decisions that the TRD explicitly leaves open.
- The tradeoff is that production durability remains caller-provided until a product integration selects a backend.

**Execution Notes**
- Store methods should accept `context.Context` and return classified or wrapped errors where appropriate.
- Active records should transition to completed on terminal state, not disappear.
- Keep store interfaces small: append event, upsert snapshot, get run, list active, list completed, list events for run.
- Include monotonic per-run sequence numbers and optional global sequence numbers if implementation can do so without overdesign.
- Add explicit configuration for required versus best-effort persistence.

**Expected Evidence**
- **Tests:** Store interface compliance using in-memory implementation; active-to-completed transitions; relationship lookup for parent/retry/fallback/repair; event history ordering; concurrent run isolation.
- **Runtime Evidence:** Inspecting a completed run returns the same final metadata that `Run.Wait` returned, minus unsafe omitted details.
- **Review Checks:** No SDK default storage engine or file format is implied as mandatory.

---

### Decision Area 4: Permission Audit, Redaction, and Cost/Usage Semantics

**Problem:** Decide how Sprint 9 preserves sensitive audit and usage facts so products can explain behavior without leaking secrets or overstating estimates.

**Requirements Applied**
- PRD and TRD permissions requirements require permission decisions and blocked states to be visible.
- TRD metadata and security requirements require safe diagnostic detail and no secret leakage.
- PRD/TRD cost/time estimation requires observed duration, usage, and cost-related metadata, with estimates distinguished from actual values.

**Evidence Applied**
- `permission-based-agent-wrapping.md` says audit logs of all decisions are required across OpenCode, Codex, and Claude Code pressure cases.
- `/home/antonioborgerees/coding/agentwrap/permissions.go:88` defines safe `PermissionAudit` facts; `/home/antonioborgerees/coding/agentwrap/permissions.go:98` centralizes policy summary/support/audit.
- `/home/antonioborgerees/coding/agentwrap/metadata.go:212` uses nil pointers for unknown token values and explicit `CostEstimate.Estimate`.
- `/home/antonioborgerees/coding/agentwrap/events.go:70` requires caution with native raw payloads.
- `go-cli-study/reports/final/10-logging-observability.md` supports structured diagnostics and user/debug separation.

**Options Considered**
- **Option A:** Persist every permission/native event payload verbatim for complete audit.
- **Option B:** Persist canonical permission audit records and safe canonical event payloads by default; omit unsafe raw payload bytes unless explicitly enabled.
- **Option C:** Store only a final permission policy summary and omit per-decision records.

**Chosen Approach**
- Persist canonical permission audit records and permission events as first-class record facts. Default persistence should store safe summaries and omit unsafe native raw payload bytes. Usage/cost fields should preserve unknown values as nil/absent and label estimates explicitly.

**Decision Justification**
- The SDK must explain why actions were allowed, denied, or sent to manual approval, but complete native payload capture conflicts with security requirements.
- Final summaries alone are insufficient for audit trails and blocked-run diagnosis.
- Existing permission and cost types already encode safe summaries and estimate flags; Sprint 9 should make them consistently recordable.
- The tradeoff is less complete native forensic detail by default, accepted to avoid secret leakage.

**Execution Notes**
- Include permission audit records from original attempts, retry/fallback attempts, and repair attempts.
- Ensure permission denials are queryable by event history and by final run record.
- Cost/time fields must identify source/estimate status where available; unknown must not be shown as zero.
- Diagnostics for sink/store failures should also avoid secret values.

**Expected Evidence**
- **Tests:** Permission policy event, allow, deny, ask/manual, unsupported, repair permission denial, and raw payload redaction persistence cases.
- **Runtime Evidence:** A completed run record can explain permission decisions without native OpenCode approval API details.
- **Review Checks:** No unsafe raw payload persistence by default; no cost estimate presented as actual billing.

---

## Deviations

| Requirement | Deviation | Reason | Risk | Disposition | Follow-up |
| --- | --- | --- | --- | --- | --- |
| Roadmap Sprint 9 `status/inspect` executable reference | The roadmap still mentions an executable surface, but the target is SDK-only | Stale planning residue remained in the roadmap | Sprint scope could drift into a command surface that the target does not want | Temporary | Keep Sprint 9 at SDK run records, event sinks, and optional persistence hooks; clean the roadmap separately if needed |
| TRD lifecycle states include more statuses than current public `RunStatus` | Sprint 9 may project health/waiting/retry/fallback from events/metadata instead of expanding statuses | Sprint 8 already added validating/repairing; another lifecycle expansion should be evidence-driven | Active dashboards may want more direct statuses | Temporary/open question | Reassess during implementation if record projection is awkward or inaccurate |
| Durable persistence requirement | Sprint 9 plans optional interfaces and in-memory reference store, not a production durable backend | TRD says persistence technology is not prescribed | No out-of-box durable historical store | Temporary | Product integration or later sprint should choose a backend |

## Cross-Cutting Reasoning

### Major Decision Summary

- **Run records as SDK snapshots, not adapter data dumps:** Satisfies PRD/TRD metadata and inspection requirements using existing metadata types and observability evidence.
- **Event sink/projection wrapper:** Satisfies dashboard/event-sink requirements while keeping adapters storage-agnostic.
- **Optional store interfaces with in-memory reference implementation:** Satisfies persistence API requirements without choosing a backend.
- **Permission audit and cost/usage safety by default:** Satisfies audit and estimate requirements while honoring security constraints.
- **SDK-only observability surface:** Keeps Sprint 9 on run records, event sinks, inspection APIs, and optional persistence hooks without inventing a command layer.

### Tradeoffs

- **Backend neutrality over immediate durability:** The SDK will prove persistence shape before selecting SQLite/file storage; production persistence remains caller-owned.
- **Safe summaries over complete raw payloads:** Default records are less forensic but safer and product-appropriate.
- **Wrapper complexity over adapter simplicity:** An observer wrapper must carefully preserve event ordering, but it avoids duplicating persistence in each runtime adapter.
- **Minimal commands over rich UX:** Commands will be useful for tests and basic inspection, but not a full dashboard.

### Assumptions

- Existing `RunMetadata`, `PermissionMetadata`, `ValidationMetadata`, `RepairMetadata`, and `PolicyMetadata` are the canonical inputs to run records.
- Products need stable SDK record and event surfaces more than an executable inspection layer in this sprint.
- A caller-provided durable store is acceptable for MVP until a specific product selects storage.
- Significant event retention can be configured without changing the public canonical event envelope.

### Dependencies

- **Sprint 8 validation/repair metadata:** Must be preserved in records and event histories.
- **Sprint 7 permission policy metadata/events:** Must be persisted and inspectable as audit records.
- **Sprint 6 policy metadata:** Attempt relationships and policy decisions must appear in records.
- **Sprint 4 lifecycle/session metadata:** Active projection and retained-session inspection depend on these fields.
### Risks

- **High-frequency event persistence can become slow:** Mitigate with retention policy, bounded buffers, and tests for drop/backpressure accounting.
- **Record model can duplicate metadata:** Mitigate by embedding/reusing existing public types and only adding projection-specific fields.
- **Optional persistence failures can confuse run outcomes:** Mitigate with explicit required/best-effort sink configuration and failure metadata.
- **Roadmap residue can pull scope sideways:** Mitigate by keeping Sprint 9 strictly at SDK record, sink, and store interfaces.
- **Unsafe raw payloads can leak:** Mitigate by default omission, redaction tests, and explicit opt-in for raw persistence.

## Tracker Guidance

Use this reasoning to write `targets/agentwrap/sprints/09-observability-metadata/plan.md`.

The tracker must include:

- run record and snapshot scope that reuses existing metadata types
- event sink/projection wrapper tasks with event ordering and raw payload safety tests
- optional persistence/store interfaces and in-memory reference implementation
- active and completed inspection APIs
- permission audit completeness, usage/cost estimate semantics, and artifact producer metadata
- risks around roadmap residue, retention policy, persistence backend neutrality, and raw payload safety
- quality gates proving dashboards can be built from canonical events and products can inspect provider/model/artifact/permission facts

## Evidence Review Checklist

- [x] Review can trace every sprint decision back to PRD/TRD requirements.
- [x] Review can trace every meaningful design choice back to evolved study evidence or an explicit open question.
- [x] Review can identify which evidence was loaded, omitted, rejected, or explored directly.
- [x] Review can see credible alternatives and why they were rejected.
- [x] Review can verify the planned tests and runtime evidence.
- [x] Review can identify planned or unplanned deviations.

## Phase Exit Criteria

- [x] Sprint scope is fully covered.
- [x] Target PRD and TRD requirements are mapped.
- [x] Evidence packs were read or staged according to the context strategy.
- [x] Applicable, non-applicable, and ambiguous requirements are recorded where relevant.
- [x] Study evidence is tied to decisions, risks, alternatives, or expected evidence.
- [x] Important decisions are explicitly justified.
- [x] Non-trivial alternatives are discussed.
- [x] Deviations, assumptions, risks, and unknowns are documented.
- [x] Expected execution and review evidence is defined.
- [x] The sprint tracker can be written from this reasoning without reopening every study report.
