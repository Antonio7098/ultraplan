# Sprint Tracker: Core Runtime Contract

> Target: agentwrap
> Sprint ID: 02-core-runtime-contract
> Created: 2026-05-18
> Reasoning: `targets/agentwrap/sprints/02-core-runtime-contract/reasoning.md`
> Roadmap Section: `targets/agentwrap/roadmap.md` - `## Sprint 2: Core Runtime Contract`
> Evidence Bundle: `targets/agentwrap/reports/sprint-evidence/02-core-runtime-contract.txt`

## Sprint Overview

- **Sprint Name:** Core Runtime Contract
- **Sprint Focus:** Define and prove the smallest public SDK contract for runtime runs, sessions, events, artifacts, metadata, capabilities, and classified errors using the fake runtime only.
- **Depends On:** Sprint 0 target brief and decision scaffold; Sprint 1 project skeleton and fake runtime harness.
- **Status:** Not Started

## Requirement Links

- `targets/agentwrap/sources/PRD.md` - runtime abstraction, structured events, native payload preservation, metadata, output safety, product-agnostic SDK boundary, and OpenCode-first/multi-runtime direction.
- `targets/agentwrap/sources/TRD.md` - runtime interface, run/session lifecycle, canonical event model, capability discovery, error model, concurrency isolation, extensibility, and acceptance criteria.
- `targets/agentwrap/sources/feature-architecture.md` - state-first, runtime-first, earned-abstraction protocol used to constrain the contract to explicit state and minimal abstractions.
- `targets/agentwrap/roadmap.md` - Sprint 2 goal, scope, evidence inputs, output, and quality gate.
- `targets/agentwrap/sprints/02-core-runtime-contract/reasoning.md` - reasoning decisions, tradeoffs, expected evidence, risks, assumptions, and open questions this tracker executes.

## Evidence Links

- `targets/agentwrap/reports/sprint-evidence/02-core-runtime-contract.txt` - generated `study evolve --top-sources 1` bundle used for planning.
- `targets/agentwrap/reports/evidence/runtime-contract.md` - supports runtime-neutral primitives, canonical event envelope, capability discovery, and native payload retention.
- `targets/agentwrap/reports/evidence/session-lifecycle.md` - supports explicit lifecycle state, retained-session metadata, malformed event failure treatment, cancellation/cleanup contract visibility, and concurrent run isolation concerns.
- `targets/agentwrap/reports/evidence/testing-strategy.md` - supports fake-runtime-first verification, fixture event streams, behavior assertions, and real-runtime deferral.
- `studies/opencode-wrap-study/reports/final/01-runtime-contract-and-api-shape.md` - supports runtime/run/session/turn/event/metadata primitives, raw payload escape hatch, open identifiers, and avoiding generated native SDK leakage.
- `studies/opencode-wrap-study/reports/final/02-process-session-lifecycle.md` - supports explicit lifecycle state visible to callers and cleanup/cancellation contract hooks without claiming true mid-run resume.
- `studies/go-cli-study/reports/final/11-testing-strategy.md` - reused from a different project as internal engineering evidence about table-driven fake runtime tests, fixtures, compile-time conformance, and behavior-focused checks.
- `studies/go-cli-study/reports/final/06-io-abstraction.md` - reused from a different project as internal engineering evidence about injectable/testable IO and stream boundaries.
- `studies/go-cli-study/reports/final/12-extensibility.md` - reused from a different project as internal engineering evidence about open identifiers and capability discovery while delaying plugin/workflow complexity.
- `studies/go-cli-study/reports/final/05-error-handling.md` - direct additional evidence for typed/classified errors, wrapping, sentinels/custom types, safe diagnostics, and avoiding panic/string matching.
- `studies/opencode-wrap-study/reports/source/01-runtime-contract-and-api-shape/t3code.md` - supports session/turn/event hierarchy, open driver identifiers, raw event preservation, and warns against known-runtime source unions.

## Sprint Goals

- **Primary Goal:** Create a public SDK runtime contract that implementation and product callers can use to start a fake runtime run, consume canonical events, inspect result metadata, and receive classified errors without OpenCode-specific common-path types.
- **Secondary Goals:**
  - Define stable run, session, turn, runtime, provider, model, event, artifact, metadata, capability, lifecycle state, and error category types.
  - Implement or adapt the fake runtime so tests can prove the contract without launching OpenCode.
  - Add contract tests for event consumption, lifecycle transitions, raw payload preservation, artifact/metadata references, capability discovery, and error classification.
  - Record any implementation-confirmed public contract decisions in `targets/agentwrap/DECISIONS.md` only after code and tests validate them.

## Scope

- Verify Sprint 1 project skeleton, SDK/library boundary, fake runtime harness, and fixture conventions exist before adding Sprint 2 code.
- Define runtime-neutral public SDK primitives for runtime, run, optional retained session, turn correlation, canonical event, artifact reference, run metadata, capabilities, and final result.
- Define stable identifier types for run, session, turn, runtime kind, provider, model, event, and artifact references as applicable to the existing Sprint 1 package layout.
- Define lifecycle state vocabulary required by PRD/TRD and roadmap, with documentation or comments distinguishing states implemented by fake tests from states reserved for later policy/lifecycle sprints.
- Define canonical event envelope and event categories for lifecycle, session, message/progress, tool activity, artifact, permission/blocking, warning, recoverable error, fatal error, usage, final result, validation, retry, fallback, rate limit, and unknown/native extension events.
- Define raw native payload preservation in the event model with safe diagnostic boundaries and tests that raw payloads survive fake projection.
- Define capability discovery at the interface level so runtimes can report supported session retention, cancellation, structured events, raw payloads, artifacts, permissions, usage, validation events, and other contract-level features.
- Define typed/classified SDK errors with category, operation, retryable/fallbackable/user-actionable/unrecoverable classification, safe detail, and wrapping support.
- Implement the fake runtime against the contract and add tests proving the public behavior listed in this sprint.

## Non-Scope

- Do not launch, invoke, parse, or smoke-test real OpenCode.
- Do not implement the OpenCode structured event adapter; it belongs to Sprint 3.
- Do not implement full cancellation propagation, process cleanup, retained-session continuation, session reaper, or cleanup-failure behavior; those belong to Sprint 4.
- Do not implement health checks, provider/model availability checks, authentication checks, effective configuration precedence, or CLI health/config commands; those belong to Sprint 5.
- Do not implement retry, fallback, backoff, rate-limit hooks, policy composition, or attempt orchestration; those belong to Sprint 6.
- Do not implement output validators, validation-informed repair, same-session repair, or artifact-first prompt guidance; those belong to Sprint 7.
- Do not implement persistence hooks, active-run stores, historical inspection, dashboards, cost/time estimation algorithms, or CLI status/inspect commands; those belong to Sprint 8 or later.
- Do not add workflow, DAG, task orchestration, UltraPlan study concepts, scoring, synthesis, sprint planning, or product-specific report validation to the SDK.
- Do not create a dynamic plugin loader or third-party runtime installation system.

## Proposed Implementation Shape

- **Package / Module Boundaries:** Use the Sprint 1 SDK/library package boundary. Keep the public contract in the SDK surface and the fake runtime in the test/fake package or fixture location established by Sprint 1. Do not add CLI command behavior.
- **Public Surface:** Runtime interface for starting work and exposing capabilities; run handle/result for stream and completion behavior; typed identifiers; event envelope/categories; artifact and metadata structs; SDK error category/classification types. Keep OpenCode names out of the common path.
- **State And Lifecycle:** Model durable identity as run/session/turn IDs, ephemeral state as lifecycle transitions emitted by the runtime, and derived state as event/result metadata. Define full required state vocabulary, but fake tests only need to exercise core transitions.
- **Error And Failure Behavior:** Public errors must be classifiable and inspectable, preserve wrapped causes, expose safe diagnostics, avoid secrets, and separate category/classification from later policy behavior.
- **Observability:** Events and final result must include enough metadata for later dashboard/audit work: run ID, optional session/turn IDs, runtime kind, provider/model when known, timestamps/sequence where applicable, artifacts, warnings/errors, usage placeholders, and final status.
- **Testing Surface:** Fake runtime unit tests, fixture/golden event stream expectations where Sprint 1 conventions exist, compile-time fake runtime conformance, table-driven error classification tests, and explicit real-runtime deferral.

## Decisions

- [ ] **Decision 1: Use Runtime/Run/Session/Turn/Event As The Contract Boundary**
  > **Requirement:** PRD Runtime Abstraction; TRD Runtime Interface and Run and Session Lifecycle; roadmap Sprint 2 scope.
  > **Evidence:** `reasoning.md` Decision Area 1; runtime-contract final report recommends runtime abstraction, session entity, turn entity, typed events, and metadata.
  > **Tradeoff:** Adds `TurnID` before real OpenCode mapping is proven.
  > **Rejected Alternative:** Full session/thread/turn/item hierarchy; rejected as over-abstracted for Sprint 2. Single blocking run function; rejected because it cannot support session retention and turn correlation.
  > **Risk / Follow-up:** Sprint 3 may reveal OpenCode mapping pressure; update `DECISIONS.md` only with tested implementation findings.

- [ ] **Decision 2: Define Full Lifecycle Vocabulary But Minimal Fake Behavior**
  > **Requirement:** PRD MVP lifecycle states; TRD Run and Session Lifecycle; roadmap Sprint 2 quality gate.
  > **Evidence:** `reasoning.md` Decision Area 2; session-lifecycle pack and final report require explicit state visible to callers.
  > **Tradeoff:** Some lifecycle states are reserved before their behavior exists.
  > **Rejected Alternative:** Add states only when behavior is implemented; rejected because later public state renames are compatibility risks.
  > **Risk / Follow-up:** Document reserved states clearly and prevent tests from implying retry/fallback/repair behavior exists.

- [ ] **Decision 3: Use Canonical Event Envelope With Raw Native Payload Preservation**
  > **Requirement:** PRD Structured Events and Output Safety; TRD Structured Runtime Events and Canonical Event Model.
  > **Evidence:** `reasoning.md` Decision Area 3; OpenCode native event union at `types.gen.ts:704-736`; t3code raw event evidence.
  > **Tradeoff:** Raw payloads add untyped diagnostic data and possible event size overhead.
  > **Rejected Alternative:** Expose OpenCode native events directly; rejected because it leaks adapter internals. Expose raw JSON only; rejected because products need dashboard-ready canonical events.
  > **Risk / Follow-up:** Sprint 3 must validate that OpenCode structured output can map into the envelope without losing critical fields.

- [ ] **Decision 4: Use Open Runtime Identifiers And Capability Discovery**
  > **Requirement:** PRD multi-runtime direction; TRD capability discovery and extensibility; roadmap Sprint 2 second-runtime plausibility gate.
  > **Evidence:** `reasoning.md` Decision Area 4; t3code open `ProviderDriverKind` evidence at `providerInstance.ts:18-28` and `70-82`.
  > **Tradeoff:** Runtime kind values are less compile-time exhaustive than a closed enum.
  > **Rejected Alternative:** Closed runtime enum for OpenCode/Codex/Claude; rejected because adding runtimes would require public SDK changes.
  > **Risk / Follow-up:** Availability checks must happen through capabilities/health later, not parse-time rejection.

- [ ] **Decision 5: Define Typed/Classified SDK Errors Without Policy Execution**
  > **Requirement:** PRD explicit typed recoverable failures; TRD Error Model categories and classification flags; roadmap Sprint 2 scope.
  > **Evidence:** `reasoning.md` Decision Area 5; direct error-handling final report recommends wrapping, typed errors, sentinels, safe user/operational separation, and avoiding panic/string matching.
  > **Tradeoff:** Error category surface exists before all categories have real producers.
  > **Rejected Alternative:** Plain errors with string prefixes; rejected as uninspectable. Full policy execution now; rejected as Sprint 6 scope.
  > **Risk / Follow-up:** Later policy sprints may need additional classification metadata; add only with tests and decision updates.

- [ ] **Decision 6: Prove Contract With Fake Runtime Only**
  > **Requirement:** Roadmap Sprint 2 scope and non-negotiable rule to use fake runtimes before real OpenCode.
  > **Evidence:** `reasoning.md` Decision Area 6; testing-strategy pack and final report recommend fake runtimes, fixtures, table-driven tests, and explicit integration gates.
  > **Tradeoff:** Sprint 2 cannot prove real OpenCode compatibility.
  > **Rejected Alternative:** Add gated real OpenCode smoke now; rejected as Sprint 3 scope. Define interfaces without fake proof; rejected as untested contract design.
  > **Risk / Follow-up:** Sprint 3 must pressure-test the contract against actual OpenCode structured output and record any contract revision.

## Execution Checklist

_No CLI product surface is in scope for this sprint. Any CLI study references below are internals-only evidence about boundaries, injection, IO, and testability._

- [ ] **Task 1: Verify Prerequisites And Existing Boundaries**
  > *Description: Confirm Sprint 2 starts from the Sprint 1 SDK/test harness and does not silently absorb missing Sprint 1 work.*
  - [ ] **Sub-task 1.1:** Confirm SDK/library package, fake runtime harness, fixture/testdata conventions, and test command from Sprint 1 exist.
  - [ ] **Sub-task 1.2:** If Sprint 1 outputs are missing, stop implementation and record the blocker instead of creating broad project skeleton work inside Sprint 2.
  - [ ] **Sub-task 1.3:** Confirm `targets/agentwrap/brief.md`, `targets/agentwrap/DECISIONS.md`, this reasoning file, and the evidence bundle are available.

- [ ] **Task 2: Define Public Runtime Contract Primitives**
  > *Description: Add the public SDK types that represent runtime execution without OpenCode-specific names or product workflow concepts.*
  - [ ] **Sub-task 2.1:** Define stable identifier types for run, session, turn, event, runtime kind, provider, model, and artifact references as needed by the package layout.
  - [ ] **Sub-task 2.2:** Define the runtime interface and run/result concepts for starting work, streaming/consuming events, awaiting final result, inspecting metadata, and exposing capabilities.
  - [ ] **Sub-task 2.3:** Define request/input shape with prompt, working directory, optional session reference, provider/model preferences, permission/sandbox placeholders, timeout/metadata fields only where needed for the contract.
  - [ ] **Sub-task 2.4:** Confirm no task/workflow/DAG/UltraPlan-specific types enter the SDK contract.

- [ ] **Task 3: Define Lifecycle, Metadata, Artifacts, And Capabilities**
  > *Description: Make state and runtime support explicit enough for dashboards, auditing, and future adapter work.*
  - [ ] **Sub-task 3.1:** Define lifecycle state vocabulary from PRD/TRD and mark states whose behavior is implemented in later sprints.
  - [ ] **Sub-task 3.2:** Define run/session/turn metadata fields for runtime kind, provider, model, attempts placeholder, timing, status, warnings/errors, artifacts, usage/cost placeholders, and session retention metadata.
  - [ ] **Sub-task 3.3:** Define artifact references as references/metadata, not large content blobs.
  - [ ] **Sub-task 3.4:** Define capability discovery for sessions, cancellation, structured events, raw payloads, artifacts, permissions, usage, validation events, and unsupported behavior reporting.

- [ ] **Task 4: Define Canonical Event Model**
  > *Description: Add canonical event envelope/categories that product callers can consume without native runtime parsing.*
  - [ ] **Sub-task 4.1:** Define event envelope fields for identity, ordering or timestamp, runtime/provider/model context where known, event category/type, payload, and optional raw native payload.
  - [ ] **Sub-task 4.2:** Define event categories for lifecycle, session, message/progress, tool, artifact, permission/blocking, usage, warning, recoverable error, fatal error, rate limit, validation, retry/fallback, final result, and unknown/native extension.
  - [ ] **Sub-task 4.3:** Define malformed/unknown event representation as explicit error/event paths for fake tests, while deferring real OpenCode recovery policy to Sprint 3.
  - [ ] **Sub-task 4.4:** Add documentation/comments that raw native payloads are diagnostic extensions and must be safe to persist or display only after redaction rules are respected.

- [ ] **Task 5: Define Typed/Classified Errors**
  > *Description: Make all public runtime failures inspectable by callers and later policies.*
  - [ ] **Sub-task 5.1:** Define error categories required by TRD: configuration, health, runtime unavailable, provider unavailable, model unavailable, authentication, permission, rate limit, timeout, cancellation, malformed event, runtime exit, validation, repair exhausted, cleanup, and unknown.
  - [ ] **Sub-task 5.2:** Define classification metadata for retryable, fallbackable, user-actionable, unrecoverable, safe detail, operation, and wrapped cause.
  - [ ] **Sub-task 5.3:** Add tests for category/classification behavior, wrapping/inspection, redaction-safe detail, and fake runtime error emission.
  - [ ] **Sub-task 5.4:** Confirm no public contract path uses panic, string matching, or unclassified errors for expected runtime failures.

- [ ] **Task 6: Implement Fake Runtime Contract Proof**
  > *Description: Exercise the public contract with deterministic fake runtime behavior before any real adapter exists.*
  - [ ] **Sub-task 6.1:** Make the fake runtime implement the public runtime contract and report deterministic capabilities.
  - [ ] **Sub-task 6.2:** Add normal event stream fixture or test sequence: start, lifecycle transitions, message/progress, artifact reference, usage placeholder, final result.
  - [ ] **Sub-task 6.3:** Add failure event stream fixture or test sequence: malformed/unknown event, classified runtime error, cancellation state, unsupported capability/session behavior.
  - [ ] **Sub-task 6.4:** Add tests that consume events as a caller would, assert final metadata/status, assert raw payload preservation, and assert no OpenCode dependency.

- [ ] **Task 7: Review And Decision Log Updates**
  > *Description: Close the sprint with evidence, not just code presence.*
  - [ ] **Sub-task 7.1:** Run the Sprint 1/Sprint 2 test command and record results in this tracker.
  - [ ] **Sub-task 7.2:** Review public contract names and docs against the reasoning decisions and roadmap quality gate.
  - [ ] **Sub-task 7.3:** Update `targets/agentwrap/DECISIONS.md` only for implementation-confirmed accepted decisions, including requirement, evidence, tradeoff, rejected alternative, and risk/follow-up.
  - [ ] **Sub-task 7.4:** Record known gaps for Sprint 3 adapter pressure, Sprint 4 lifecycle/cancellation, and Sprint 6 policy behavior.

## Testing And Documentation Checklist

- [ ] **Unit Tests:** table-driven tests for identifier validation if present, lifecycle state/result behavior, event envelope construction, capability reporting, and error classification/wrapping.
- [ ] **Fixture Tests:** fake runtime event streams for normal, unknown, malformed, partial/failure, final, artifact, raw-payload, and unsupported-capability cases.
- [ ] **Integration Tests:** not applicable for real runtime in Sprint 2; any in-process fake integration test is acceptable if it does not launch OpenCode or depend on external binaries.
- [ ] **Real Runtime Smoke:** explicitly deferred to Sprint 3 because this sprint is fake-runtime only by roadmap scope.
- [ ] **Documentation Updates:** update public SDK comments/docs where the contract introduces reserved states, raw payload safety, capability semantics, and error classification; update `DECISIONS.md` only after implementation evidence exists.

## Risks And Blockers

| Risk | Impact | Mitigation | Status |
| --- | --- | --- | --- |
| Sprint 1 skeleton/fake harness is missing when implementation starts | High | First task verifies prerequisites and stops rather than absorbing Sprint 1 scope | Open |
| Contract overfits t3code session/thread/turn/item hierarchy | High | Include turn correlation but reject thread/item/workflow concepts in Sprint 2 | Open |
| Contract underfits real OpenCode events | High | Preserve raw payloads, unknown event path, and require Sprint 3 adapter pressure review | Open |
| Lifecycle states imply unimplemented retry/fallback/repair behavior | Medium | Document reserved states and test only fake-supported transitions | Open |
| Error categories become policy execution | Medium | Limit Sprint 2 to classification and wrapping; defer policy decisions to Sprint 6 | Open |
| Raw payloads leak sensitive runtime/provider data | High | Treat raw payloads as diagnostic data with safe persistence/display rules and redaction follow-up | Open |
| Omitted per-source bundle evidence hides a source-specific constraint | Medium | Reopen per-source reports only for concrete implementation blockers and cite any added evidence | Open |

## Open Questions

- What exact Go schema or validation approach should represent event payload contracts? - Needs implementation pressure and possibly Sprint 3 adapter findings.
- Should `TurnID` be caller-provided, runtime-generated, or both? - Sprint 2 should include type/correlation support; Sprint 3 should validate real mapping.
- Which metadata fields are mandatory versus best-effort when runtimes expose incomplete usage/cost data? - Carry to Sprint 8 unless Sprint 2 implementation finds a blocker.
- What is the default behavior when malformed structured events appear mid-stream? - Sprint 2 defines category/test fake error; Sprint 3 decides real adapter recovery policy.
- How should same-session, forked-session, fresh-session, release, and replace operations be represented before Sprint 4 implements them? - Model capability/metadata only unless implementation evidence forces more.
- Should the direct error-handling final report be included in a regenerated Sprint 2 bundle? - Recommended if implementation changes the error model beyond this plan.

## Success Criteria

- [ ] **Success Criteria 1:** Public SDK contract supports fake runtime start, event consumption, final result inspection, and cancellation/error state representation without OpenCode-specific common-path types.
- [ ] **Success Criteria 2:** Run/session/turn identifiers, lifecycle states, event envelope/categories, artifact references, metadata, raw payload preservation, capabilities, and classified errors are defined and tested.
- [ ] **Success Criteria 3:** Fake runtime implements the contract and deterministic tests prove normal, unknown/malformed, failure, cancellation, unsupported-capability, raw-payload, artifact, and final-result paths.
- [ ] **Success Criteria 4:** Every public error surfaced by the contract is classifiable and inspectable without string matching or panic recovery.
- [ ] **Success Criteria 5:** No workflow/DAG/task orchestration, real OpenCode adapter, health/config validation, retry/fallback policy, validation/repair implementation, persistence, or CLI product surface is added.
- [ ] **Success Criteria 6:** Review can plausibly explain how a second runtime would implement the contract through capabilities and canonical events without changing product-level orchestration requirements.

## Study Evaluation

- [ ] **Patterns Followed:** runtime-neutral contract, open runtime/provider identifiers, explicit lifecycle state, canonical event envelope with raw payload escape hatch, capability discovery, typed/classified errors, fake-runtime-first tests, table-driven behavior assertions.
- [ ] **Anti-Patterns Avoided:** OpenCode generated SDK as public contract, closed runtime enum, raw stdout/log parsing, workflow/DAG abstraction, unclassified string errors, panic for operational failures, real runtime dependency in unit tests, direct terminal/process coupling.
- [ ] **Comparison Needed:** Compare completed code and tests against `reasoning.md` Decision Areas 1-6 and evidence dimensions from runtime-contract, session-lifecycle, and testing-strategy packs.
- [ ] **Proceed / Iterate:** Proceed to Sprint 3 only if the contract is testable with fake runtime, no foundational public API ambiguity blocks adapter work, and all Sprint 2 non-scope boundaries were respected.

## Review And Sign-Off

- Sprint Status: Not Started
- Completion Date: Not completed

## Execution Evidence

- Planning evidence bundle exists: `targets/agentwrap/reports/sprint-evidence/02-core-runtime-contract.txt`.
- Sprint reasoning completed before this tracker: `targets/agentwrap/sprints/02-core-runtime-contract/reasoning.md`.
- Planning used staged evidence loading because the bundle reports 35,714 lines and about 374,141 estimated tokens.
- Direct additional evidence used for Sprint 2 error model: `studies/go-cli-study/reports/final/05-error-handling.md`.
- Implementation tests, commands, decision-log updates, and any explicit deferrals should be appended here during sprint execution.
