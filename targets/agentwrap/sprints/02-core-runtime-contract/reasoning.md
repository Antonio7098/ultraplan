# Sprint Reasoning: Core Runtime Contract

> Target: agentwrap
> Sprint ID: 02-core-runtime-contract
> Output: `targets/agentwrap/sprints/02-core-runtime-contract/reasoning.md`
> Sprint Tracker: `targets/agentwrap/sprints/02-core-runtime-contract/plan.md`
> Evidence Bundle: `targets/agentwrap/reports/sprint-evidence/02-core-runtime-contract.txt`

## Overview

**Sprint:** Core Runtime Contract
**Purpose:** Define the smallest public SDK contract that can express runtime execution, run/session identity, event streaming, artifacts, metadata, capabilities, and classifiable errors, then prove the contract with the fake runtime only. The reused Go CLI study material is internal evidence about boundaries, dependency injection, IO handling, and testability; it is not a directive to ship a CLI product.
**Roadmap Section:** `targets/agentwrap/roadmap.md` - `## Sprint 2: Core Runtime Contract`
**Depends On:** Sprint 0 target brief and decision scaffold; Sprint 1 project skeleton and fake runtime harness.
**Reasoning Status:** Ready For Tracker

## Target Sources

- `targets/agentwrap/sources/PRD.md` - product goals, runtime abstraction, structured events, metadata, output safety, and runtime-neutral SDK boundaries used to constrain the public contract.
- `targets/agentwrap/sources/TRD.md` - runtime interface, run/session lifecycle, canonical event model, configuration shape, error model, concurrency, extensibility, and acceptance criteria used to define contract requirements.
- `targets/agentwrap/sources/feature-architecture.md` - state-first modular flow used to keep orchestration state explicit, logic stateless, and abstractions earned by runtime volatility.
- `targets/agentwrap/roadmap.md` - Sprint 2 scope, evidence inputs, outputs, and quality gates.

## Evidence Basis

**Evidence Bundle:** `targets/agentwrap/reports/sprint-evidence/02-core-runtime-contract.txt`
**Evidence Status:** Complete and used with staged loading.
**Context Strategy:** Staged loading used. The bundle summary reports 35,714 lines and about 374,141 estimated tokens, so planning loaded required PRD/TRD/feature protocol/roadmap/template sources, all evidence pack sections, relevant final report sections, the highest-scored runtime-contract per-source report, selected resolved code references, and one roadmap-listed error-handling final report opened directly because typed/classified error design is explicit Sprint 2 scope but not included in the generated bundle.

### Evidence Packs Used

- `targets/agentwrap/reports/evidence/runtime-contract.md` - informs minimal public primitives, canonical event envelope, capability discovery, native payload preservation, and SDK/product boundary.
- `targets/agentwrap/reports/evidence/session-lifecycle.md` - informs run/session state, cancellation/cleanup contract visibility, malformed event failure status, and retained-session metadata boundaries.
- `targets/agentwrap/reports/evidence/testing-strategy.md` - informs fake-runtime-first verification, fixture expectations, malformed/unknown event cases, and sprint acceptance checks.

### Final Reports Used

- `studies/opencode-wrap-study/reports/final/01-runtime-contract-and-api-shape.md` - recommends a small contract layer with runtime abstraction, session, turn, typed events, raw payload escape hatch, open runtime/provider identifiers, and provider/model metadata; also warns no production-ready Go runtime-agnostic SDK was found.
- `studies/opencode-wrap-study/reports/final/02-process-session-lifecycle.md` - supports explicit lifecycle state, scope-bound cleanup concepts translated to Go as explicit close/cancel behavior, separation of transport decoding from domain logic, and no claim of true mid-run resume.
- `studies/go-cli-study/reports/final/11-testing-strategy.md` - reused from a different project as internal evidence about table-driven tests, fake runtime tests, fixture-driven event expectations, behavior assertions, and explicit integration deferrals.
- `studies/go-cli-study/reports/final/06-io-abstraction.md` - reused from a different project as internal evidence about injected streams and testable boundaries where event streams or fake runtimes need capture without real terminal side effects.
- `studies/go-cli-study/reports/final/12-extensibility.md` - reused from a different project as internal evidence about open extension identifiers, registry/capability discovery, and delaying plugin/workflow complexity until there is real implementation pressure.
- `studies/go-cli-study/reports/final/05-error-handling.md` - opened directly because Sprint 2 scope requires typed/classified errors; supports `%w` wrapping, sentinels for recoverable conditions, custom error types for structured data, and avoiding panic/string matching for operational errors.

### Per-Source Reports Used

- `studies/opencode-wrap-study/reports/source/01-runtime-contract-and-api-shape/t3code.md` - highest-scored runtime-contract source; used for session/thread/turn/item hierarchy, open `ProviderDriverKind`, raw event escape hatch, provider/model metadata, and known gaps around event source unions and unnormalized usage.

### Code References Used

- `t3code / packages/contracts/src/providerInstance.ts:18-28` - open driver identifiers parse successfully and unknown drivers are marked unavailable by runtime registry rather than rejected by the contract layer.
- `t3code / packages/contracts/src/providerInstance.ts:70-82` - separate branded driver and provider-instance identifiers prevent confusing implementation kind with configured routing instance.
- `opencode / packages/sdk/js/src/gen/types.gen.ts:704-736` - OpenCode exposes many structured event variants, supporting canonical projection instead of free-form stdout parsing.
- `opencode / packages/opencode/src/session/session.ts:207-227` - session metadata includes ID, directory, parent ID, cost, tokens, model, timing, permission, and version, supporting session as a first-class contract concept.
- `t3code / packages/contracts/src/provider.ts:53-96` - start, send turn, interrupt turn, and stop session inputs show a narrow caller-facing lifecycle surface without workflow/DAG concepts.
- `t3code / apps/server/src/provider/opencodeRuntime.ts:51-59` - tagged runtime errors carry operation, cause, and safe detail, supporting structured SDK error fields.
- `go-plugin / runner/runner.go:7-14` and `go-plugin / client.go:142-277` - process runner and client config separate execution mechanics from protocol details, informing adapter boundary shape without copying plugin transport concepts.

### Evidence Rejected Or Not Used

- **Most per-source reports in the generated bundle:** Omitted from active context because the sprint decisions were answered by evidence packs, final reports, the highest-scored runtime-contract source, and selected code references.
- **Most resolved code references:** Omitted because Sprint 2 defines the contract and fake-runtime proof, not OpenCode adapter mechanics or concrete subprocess supervision.
- **Final reports for state/context, concurrency, performance, resilience, and workflow observability:** Present in the bundle but not opened in detail for final decisions because this sprint should not implement concurrency limits, retry/fallback policies, persistence, dashboards, or workflow composition. Their risks are carried forward where relevant.
- **Direct repository code exploration beyond bundle and roadmap-listed error final report:** Not performed because the generated bundle plus direct error-handling final report provided sufficient evidence for Sprint 2 decisions.

## Requirement Map

### Requirement Index Used In This Sprint

| Requirement | Source | Area | Applicability | Why It Matters For This Sprint |
| --- | --- | --- | --- | --- |
| Product callers need one consistent way to start, monitor, cancel, and inspect runtime work | PRD Product Goals lines 29-36 | Runtime contract | Applicable | Defines the core public SDK contract surface. |
| Product callers must not know native command, event schema, process details, or provider mechanics | PRD Runtime Abstraction lines 106-112 | Runtime neutrality | Applicable | Requires OpenCode-specific behavior to stay behind adapter/capability metadata. |
| Canonical events for lifecycle, progress, messages, tools, artifacts, usage, warnings, errors, rate limits, permissions, and final result | PRD Structured Events lines 113-117 | Event model | Applicable | Defines event category coverage and dashboard/audit requirements. |
| Native runtime payloads should be preservable | PRD Structured Events lines 115-117; TRD Structured Runtime Events lines 39-48 | Diagnostics | Applicable | Requires raw payload retention in the event contract. |
| Runtime output truncation and artifact-first workflows must be accounted for | PRD Output Safety lines 157-161; TRD Output Truncation lines 147-155 | Artifacts | Applicable | Requires artifact references in the contract instead of assuming terminal/process output is complete. |
| Runtime-neutral interface for starting, monitoring, cancelling, and inspecting work | TRD Runtime Interface lines 15-22 | Public API | Applicable | Directly maps to runtime interface and fake implementation. |
| Explicit lifecycle states and stable run/session identifiers | TRD Run and Session Lifecycle lines 23-38 | State model | Applicable | Requires run/session ID types and lifecycle state constants/events. |
| Canonical event model allows future event types | TRD Canonical Event Model lines 49-68 | Event compatibility | Applicable | Requires extensible event shape rather than a closed OpenCode-only union. |
| Runtime capabilities must be discoverable | TRD Runtime Interface lines 17-22; Extensibility lines 232-239 | Capability discovery | Applicable | Requires capability discovery in the common path without forcing every runtime to support every feature. |
| Errors must be explicit and classifiable | TRD Error Model lines 214-220 | Error model | Applicable | Requires typed/classified SDK errors, safe diagnostics, and retry/fallback/user-actionable flags. |
| Multiple concurrent runs and isolated state | TRD Concurrency lines 222-230 | Isolation | Applicable as contract constraint | Sprint 2 must not use global run/session state that would prevent later concurrent runs. |
| Sprint 2 scope: runtime-neutral primitives, run/session IDs, lifecycle states, event envelope/categories, raw payload preservation, capability discovery, typed/classified errors, fake runtime only | Roadmap Sprint 2 lines 179-218 | Sprint scope | Applicable | Defines what this sprint must include and what it must avoid. |
| State-first protocol: explicit state ownership, runtime-first flow, earned abstractions | Feature architecture protocol phases 1-8 | Design discipline | Applicable | Requires the contract to distinguish durable identifiers, ephemeral runtime state, and derived event/metadata state. |

### Applicable Requirements

- **Runtime-neutral public contract:** The sprint must define primitives a caller can use without knowing OpenCode invocation or event details.
- **Run/session/turn identity and lifecycle:** The sprint must model stable run IDs and session IDs, and may include turn IDs as correlation units because evidence and requirements need per-request/response granularity without introducing workflows.
- **Canonical event envelope and categories:** The sprint must define an event shape that can carry lifecycle, session, message, tool, artifact, permission, warning, error, usage, final-result, validation, retry, and fallback categories even if later categories are only contract-level constants this sprint.
- **Raw native payload retention:** The sprint must preserve native structured payloads where safe, because later OpenCode adapter debugging and future runtime compatibility depend on information not promoted into canonical fields.
- **Capability discovery:** The sprint must make runtime-specific differences discoverable through capabilities/metadata, not required in the common caller path.
- **Typed/classified errors:** The sprint must define public error categories and classification metadata so callers and later policy code can distinguish configuration, health, runtime unavailable, provider/model/authentication, permission, rate limit, timeout, cancellation, malformed event, runtime exit, validation, repair exhausted, cleanup, and unknown errors.
- **Fake runtime verification:** The sprint must prove the contract with fake runtime tests, not real OpenCode.

### Non-Applicable Requirements

- **Real OpenCode structured event adapter:** Belongs to Sprint 3; Sprint 2 can define the target event model but must not launch or parse real OpenCode output.
- **Full cancellation/cleanup implementation:** Belongs to Sprint 4; Sprint 2 should define contract hooks/states and only fake-runtime behavior needed to prove the interface.
- **Health checks and configuration precedence:** Belongs to Sprint 5; Sprint 2 should define types only where needed by request/effective metadata, not implement preflight validation.
- **Retry, fallback, rate-limit handling, and backoff policies:** Belongs to Sprint 6; Sprint 2 can reserve event/error categories but must not implement policy composition.
- **Output validation and repair:** Belongs to Sprint 7; Sprint 2 can include validation event/error categories but must not implement validators or repair attempts.
- **Persistence hooks, dashboard run records, and cost/time estimation logic:** Belongs to Sprint 8; Sprint 2 can define metadata fields and artifact references but must not choose storage or estimation algorithms.
- **CLI product surface:** Not in scope for this target; Sprint 2 remains SDK/fake-runtime focused and treats CLI study material as internal evidence only.
- **Workflow/DAG/task orchestration:** Explicitly outside Sprint 2 and outside the SDK common path until later integration evidence requires more.

### Ambiguous Or Conflicting Requirements

- **Smallest primitive boundary:** PRD/TRD leave runtime, session, run, turn, task, and workflow as an open question. Roadmap Sprint 2 requires run/session IDs and runtime primitives. Evidence recommends runtime, session, turn, typed events, and metadata. This sprint should choose runtime, run, session, and turn as SDK contract primitives while explicitly rejecting task/workflow composition.
- **Session required versus optional:** PRD/TRD require session retention where supported, but not every runtime may support retained sessions. This sprint should model session identity and retention metadata as first-class concepts while representing support through capabilities.
- **Event type compatibility:** Evidence favors discriminated unions, while Go has no direct TypeScript-style discriminated union. This sprint should define a Go-friendly event envelope with typed categories and an unknown/raw path, leaving exact schema/codegen technology open.
- **Mandatory versus best-effort usage/cost metadata:** Requirements call for metadata, but evidence shows token usage is not normalized across providers. This sprint should define normalized optional fields plus native extensions, and defer mandatory-versus-best-effort policy to observability sprint.

### Open Questions

- What exact Go schema or validation strategy should represent event payload contracts without importing TypeScript/Effect assumptions?
- Should `TurnID` be public caller input, runtime output only, or both? Sprint 2 can include the type but should let fake tests and Sprint 3 adapter reality pressure the final behavior.
- Which metadata fields must be non-optional in a run result if OpenCode or future runtimes cannot always provide usage/cost values?
- What is the default behavior when malformed structured events appear mid-stream? Sprint 2 should define the error category and test fake decode failure, while Sprint 3 decides adapter behavior.
- How should session retention operations such as continue, reuse, fork, release, and replace be represented before Sprint 4 implements them?

## Sprint Decision Analysis

### Decision Area 1: Public Primitive Boundary

**Problem:** Sprint 2 must define the smallest public SDK primitives without pulling in product workflow concepts or overfitting to OpenCode internals.

**Requirements Applied**
- PRD Runtime Abstraction requires a runtime-neutral product interface and session reuse where supported.
- TRD Runtime Interface requires start, monitor, cancel, inspect, capability discovery, and native diagnostics.
- TRD Run and Session Lifecycle requires stable run and session identifiers and one-shot plus session-based follow-up work.
- Roadmap Sprint 2 requires runtime-neutral primitives, run/session identifiers, lifecycle states, and fake runtime only.

**Evidence Applied**
- Runtime-contract pack says runtime-specific behavior should be capabilities or metadata and the common path should stay runtime-neutral.
- Runtime contract final report recommends runtime abstraction, session entity, turn entity, typed event schema, and provider/metadata fields.
- t3code source report shows a session/thread/turn/item hierarchy but also shows the danger of too much hierarchy leaking into the contract.
- Feature architecture protocol says abstractions must be earned by volatility and should simplify reasoning.

**Options Considered**
- **Option A:** Public primitives are `Runtime`, `Run`, `Session`, `Turn`, `Event`, `Artifact`, `Metadata`, and `SDKError`, with task/workflow composition explicitly out of scope.
- **Option B:** Public primitives mirror t3code's full session/thread/turn/item hierarchy.
- **Option C:** Public primitive is only a single `RunTask` or blocking function that hides sessions and turns.

**Chosen Approach**
- Use Option A. Sprint 2 should define a small contract where a runtime starts a run, returns a run handle/result, emits canonical events, can expose or accept optional session references, and can correlate per-request work through turn identifiers. It should not introduce thread/task/workflow/DAG concepts.

**Decision Justification**
- Option A satisfies PRD/TRD run/session requirements while preserving room for future runtimes.
- Option B overfits the contract to one studied architecture and adds navigation cost before the OpenCode adapter exists.
- Option C fails retained-session and per-turn correlation requirements and would make repair/retry follow-up work harder later.
- The accepted tradeoff is that the contract includes `TurnID` before Sprint 3 proves exact OpenCode mapping; this is justified by evidence that turn/request granularity is needed, but the plan keeps behavior minimal.

**Execution Notes**
- The public contract should distinguish runtime kind, configured runtime/provider/model identity, run ID, session ID, and turn ID types so callers cannot mix identifiers accidentally.
- Session support must be represented as capability/metadata; a runtime that cannot retain sessions should be valid and explicit.
- The fake runtime should implement the contract without requiring OpenCode-specific names in the common path.

**Expected Evidence**
- **Tests:** Compile-time interface conformance for fake runtime; tests starting a fake run; tests for one-shot run and optional session metadata.
- **Runtime Evidence:** Fake event stream showing run ID, optional session ID, optional turn ID, runtime/provider/model metadata, and final result.
- **Review Checks:** Review confirms no workflow/DAG/task abstraction and no OpenCode-specific type in the public common path.

---

### Decision Area 2: Lifecycle State Model

**Problem:** The SDK must expose explicit lifecycle states, but later sprints own full cancellation, cleanup, retry, fallback, validation, repair, and retained-session behavior.

**Requirements Applied**
- PRD MVP requires queued, starting, running, waiting, retrying, failed, cancelled, and completed work states.
- TRD Run and Session Lifecycle requires initialized, health-checking, ready, starting, running, waiting, retrying, fallback, validating, repairing, completed, failed, cancelled, and cleaned up.
- TRD Observability requires active run status suitable for dashboards.
- Roadmap Sprint 2 requires lifecycle states while keeping implementation minimal and fake-runtime only.

**Evidence Applied**
- Session-lifecycle pack says lifecycle states should be explicit instead of inferred from process exit or final files.
- Process/session lifecycle final report says robust lifecycle requires explicit state visible to callers and cancellation that propagates through the call stack.
- t3code and opencode evidence show state unions for session/turn/runtime behavior, but no evidence supports claiming mid-run resume.

**Options Considered**
- **Option A:** Define the complete required state vocabulary now, but only implement/test minimal fake transitions for initialized/starting/running/waiting/completed/failed/cancelled/cleaned-up.
- **Option B:** Define only states used by the fake runtime and add later states when their sprints implement them.
- **Option C:** Avoid lifecycle states and infer status from event stream and final result.

**Chosen Approach**
- Use Option A. Sprint 2 should define the lifecycle state vocabulary required by PRD/TRD and roadmap, while tests focus on the subset needed to prove contract consumption with fake runtime.

**Decision Justification**
- Option A satisfies explicit-state requirements without implementing later policy behavior.
- Option B would make later retry/fallback/validation/repair sprints change core public state names, increasing compatibility risk.
- Option C violates PRD/TRD and evidence warning against opaque state.
- The accepted tradeoff is that some state constants are defined before their behavior exists; this is acceptable because the roadmap explicitly requires lifecycle-state definition in Sprint 2 and later sprints implement behavior.

**Execution Notes**
- State transitions must be emitted as canonical lifecycle events and reflected in run metadata/result status.
- States reserved for later behavior must be documented as contract states, not implemented behavior.
- Cleanup failure must remain a distinct future error/event concern; Sprint 2 should not hide it in generic failure.

**Expected Evidence**
- **Tests:** Table-driven fake lifecycle transition tests; invalid transition checks only if the implementation introduces a transition validator; failure and cancellation state tests.
- **Runtime Evidence:** Fake lifecycle event stream contains ordered state changes and final status.
- **Review Checks:** Review confirms later states are not wired to fake policy behavior that belongs in later sprints.

---

### Decision Area 3: Canonical Event Envelope And Native Payloads

**Problem:** The event model must support dashboards, auditing, diagnostics, future runtimes, and raw native payload preservation without copying OpenCode's generated event union into the public common path.

**Requirements Applied**
- PRD Structured Events requires canonical events for lifecycle, progress, messages, tool activity, artifacts, usage, warnings, errors, rate limits, permissions, and final result.
- TRD Structured Runtime Events requires OpenCode structured JSON later, native payload preservation, and explicit malformed event decode errors.
- TRD Canonical Event Model requires future event types without breaking existing callers.
- TRD Output Safety requires artifact references rather than relying on terminal output completeness.

**Evidence Applied**
- Runtime-contract pack says normalize native runtime output into canonical events while preserving native payloads.
- Runtime contract final report recommends discriminated event categories, raw event escape hatch, and normalized usage with provider-specific extensions.
- OpenCode code reference `types.gen.ts:704-736` shows native event variety is large enough that copying native events would leak OpenCode internals.
- t3code source report shows `raw` is useful but an enumerated raw-source union can still overfit known runtimes.

**Options Considered**
- **Option A:** Define a canonical event envelope with stable metadata fields, event type/category, typed payload shapes for core categories, optional raw native payload, artifact references, and unknown/native extension support.
- **Option B:** Expose OpenCode native event shapes directly as the SDK event contract.
- **Option C:** Expose raw JSON events and let callers parse what they need.

**Chosen Approach**
- Use Option A. Sprint 2 should define a canonical event envelope that includes event ID or sequence, run ID, optional session/turn IDs, runtime/provider/model metadata where known, timestamp, type/category, payload, raw native payload, warnings/errors as explicit events, and artifact references.

**Decision Justification**
- Option A satisfies dashboard/audit requirements while retaining native diagnostics.
- Option B violates runtime-neutrality and repeats the anti-pattern of generated SDK reflecting internal implementation.
- Option C violates PRD/TRD requirements that products build dashboards without parsing logs or native payloads.
- The accepted tradeoff is that the first event payload set may be intentionally small; future event categories are supported through compatibility rules and raw payloads.

**Execution Notes**
- Native payload preservation must be safe: redact or omit sensitive fields where required by security requirements.
- Malformed event behavior should have an explicit error category and fake fixture, but Sprint 3 decides real OpenCode stream recovery policy.
- Artifacts should be references/metadata in events, not large content blobs by default.

**Expected Evidence**
- **Tests:** Fixture tests for normal, unknown, malformed, partial, and final fake event streams; raw payload preservation checks; artifact reference event checks.
- **Runtime Evidence:** Fake runtime emits canonical events in order and includes raw native payload on selected events.
- **Review Checks:** Review confirms caller-facing event handling does not require parsing OpenCode-native fields.

---

### Decision Area 4: Capability Discovery And Open Runtime Identity

**Problem:** The contract must support OpenCode first while leaving room for additional runtimes without closed enums or runtime-specific requirements in the common path.

**Requirements Applied**
- PRD Product Goals allow future runtimes beyond OpenCode.
- TRD Runtime Interface says runtime-specific capabilities must be discoverable.
- TRD Extensibility says new runtimes and event types must be addable without changing product-level orchestration requirements.
- Roadmap Sprint 2 quality gate requires the contract to support OpenCode without naming OpenCode in the common path and plausibly support a second runtime.

**Evidence Applied**
- Runtime-contract pack says runtime-specific behavior should be capabilities or metadata.
- Runtime contract final report recommends open branded slugs instead of closed enums for driver/provider selection.
- t3code code references show unknown drivers should parse and be marked unavailable by runtime registry, not crash contract decoding.
- Extensibility final report supports registry/capability patterns but warns against premature plugin complexity and global singleton registries with silent overwrite.

**Options Considered**
- **Option A:** Use open string-like runtime/provider/model identifiers with validation and capability discovery, plus fake runtime capabilities for tests.
- **Option B:** Use closed enums for `OpenCode` and a few planned runtimes.
- **Option C:** Skip capability discovery until Sprint 10 second-runtime spike.

**Chosen Approach**
- Use Option A. Sprint 2 should define open identifier types and a capability description returned by the runtime/fake runtime, while avoiding a plugin registry or dynamic loading system.

**Decision Justification**
- Option A meets OpenCode-first and future-runtime goals without adding plugin architecture.
- Option B makes adding a second runtime a public API change and conflicts with evidence favoring open slugs.
- Option C hides runtime differences until too late and undermines the Sprint 2 quality gate.
- The accepted tradeoff is reduced compile-time exhaustiveness for runtime kind values; capability discovery and availability errors mitigate that cost.

**Execution Notes**
- Identifier validation should prevent empty or malformed common identifiers, but known-runtime availability should be a runtime/capability concern.
- Capabilities should describe support for sessions, cancellation, raw payloads, tool events, artifacts, permissions, usage, and structured events at contract level.
- No dynamic plugin loader, registry persistence, or third-party runtime installation flow belongs in this sprint.

**Expected Evidence**
- **Tests:** Fake runtime reports capabilities; unknown/open runtime kind values can be represented; unsupported retained-session behavior can be surfaced as capability absence or classified error.
- **Runtime Evidence:** Fake run metadata includes runtime kind, provider/model if supplied, and capability snapshot.
- **Review Checks:** Review confirms no closed runtime enum blocks future runtimes.

---

### Decision Area 5: Typed And Classified Error Contract

**Problem:** Sprint 2 must define public errors that callers and later policies can inspect, without implementing retry/fallback/repair behavior early.

**Requirements Applied**
- PRD Product Goals require failures to be explicit, typed, and recoverable where possible.
- TRD Error Model requires categories for configuration, health, runtime unavailable, provider unavailable, model unavailable, authentication, permission, rate limit, timeout, cancellation, malformed event, runtime exit, validation, repair exhausted, cleanup, and unknown.
- TRD Error Model requires errors to expose retryable, fallbackable, user-actionable, or unrecoverable classification and preserve safe diagnostics.
- Roadmap Sprint 2 requires typed/classified error requirements.

**Evidence Applied**
- Error-handling final report says mature Go CLIs use wrapped errors, sentinel errors for programmatic checking, custom error types for structured data, and avoid panic/string matching for operational failures.
- Runtime contract evidence shows t3code's tagged errors carry operation, cause, and detail.
- Session-lifecycle evidence says malformed structured events should be first-class lifecycle failures.

**Options Considered**
- **Option A:** Define an SDK error type or interface with category, operation, message, retryable/fallbackable/user-actionable/unrecoverable flags, safe detail, and `Unwrap` support.
- **Option B:** Use plain Go errors and document string prefixes.
- **Option C:** Implement full retry/fallback classification behavior now.

**Chosen Approach**
- Use Option A. Sprint 2 should define typed/classified errors and tests for classification, wrapping, and safe diagnostics, but not implement policy execution.

**Decision Justification**
- Option A satisfies TRD and gives later policy sprints programmatic inputs.
- Option B blocks reliable caller behavior and repeats anti-patterns from lower-rated error handling.
- Option C pulls Sprint 6 behavior into Sprint 2 and risks hard-coding policy flow before runtime adapter evidence.
- The accepted tradeoff is extra type surface before every error category is produced by real runtime behavior; this is required by TRD and roadmap scope.

**Execution Notes**
- Use wrapping so callers can use standard error-chain inspection.
- Sensitive values must not appear in normal error strings or safe diagnostic fields.
- Test errors should include configuration/malformed event/runtime exit/cancellation examples at minimum; later sprints add health/rate-limit/validation/repair/cleanup producers.

**Expected Evidence**
- **Tests:** Table-driven tests for category, classification flags, `errors.Is`/`errors.As` or equivalent, wrapping, and redacted safe detail.
- **Runtime Evidence:** Fake runtime can emit or return classified errors and error events.
- **Review Checks:** Review confirms no string matching, panic, or unclassified public error in the contract path.

---

### Decision Area 6: Fake Runtime Proof And Test Boundary

**Problem:** The contract must be executable enough to trust, but the roadmap explicitly keeps real OpenCode integration out of Sprint 2.

**Requirements Applied**
- Roadmap Sprint 2 scope says keep implementation minimal and fake runtime only.
- Roadmap non-negotiable rules say use fake runtimes and fixtures before trusting real OpenCode runs.
- TRD acceptance criteria require future OpenCode runs, cancellation, validation, metadata, and second-runtime support, but Sprint 2 only proves the contract foundation.

**Evidence Applied**
- Testing-strategy pack says test SDK contract with fake runtimes before relying on OpenCode integration tests.
- Testing final report says behavior-focused assertions, table-driven tests, centralized fakes/mocks, and fixture-driven expectations are top-tier Go CLI patterns.
- IO abstraction final report supports injectable streams/interfaces to avoid real terminal/process side effects in tests.

**Options Considered**
- **Option A:** Implement a fake runtime that exercises event consumption, lifecycle transitions, metadata/artifact references, raw payload preservation, capabilities, and classified errors.
- **Option B:** Add a gated real OpenCode smoke test in Sprint 2.
- **Option C:** Define only interfaces and skip executable fake proof.

**Chosen Approach**
- Use Option A. Sprint 2 should include fake runtime tests and fixtures sufficient to prove the public contract, with real OpenCode explicitly deferred to Sprint 3.

**Decision Justification**
- Option A satisfies the roadmap output and quality gate while avoiding external runtime flakiness.
- Option B belongs to Sprint 3 and would force adapter decisions early.
- Option C leaves the contract unproven and risks an API that cannot support streaming, lifecycle, or errors in practice.
- The accepted tradeoff is that Sprint 2 evidence is simulated; Sprint 3 must validate the contract against OpenCode structured output.

**Execution Notes**
- Tests should be table-driven and focus on externally visible behavior, not private implementation detail.
- Fixtures should include normal, unknown, malformed, partial, final, error, and artifact event sequences.
- If Sprint 1 fake harness is not present at implementation time, Sprint 2 must stop or explicitly record the dependency gap rather than silently building broad skeleton work.

**Expected Evidence**
- **Tests:** Unit/fixture tests for fake run start, stream consumption, final result, lifecycle failure, cancellation state, raw payload preservation, unsupported capability, and classified error.
- **Runtime Evidence:** Fake runtime event transcripts/golden expectations stored as test fixtures if Sprint 1 established fixture layout.
- **Review Checks:** Review confirms no real OpenCode dependency and no broad CLI/product workflow code.

## Deviations

| Requirement | Deviation | Reason | Risk | Disposition | Follow-up |
| --- | --- | --- | --- | --- | --- |
| Sprint evidence should come from generated bundle | Opened `studies/go-cli-study/reports/final/05-error-handling.md` directly outside the bundle | Roadmap Sprint 2 lists typed/classified errors and final error-handling evidence, but the generated command did not include that pack/report | Direct evidence could diverge from bundle selector discipline | Temporary, documented | Regenerate or expand future sprint evidence if error model decisions need deeper source-level review |
| Sprint 2 depends on Sprint 1 outputs | Current target sprint directory only shows Sprint 0 artifacts during planning | Sprint 2 is still plannable, but implementation requires skeleton/fake harness from Sprint 1 | Implementation agent could accidentally perform Sprint 1 scope inside Sprint 2 | Dependency risk | Tracker must require prerequisite verification before code work |

## Cross-Cutting Reasoning

### Major Decision Summary

- **Use runtime/run/session/turn/event/artifact/metadata/error as the Sprint 2 contract boundary:** Required by PRD/TRD and supported by runtime-contract evidence; task/workflow/DAG concepts are rejected as premature.
- **Define complete lifecycle vocabulary but implement minimal fake transitions:** Required by TRD lifecycle states and roadmap scope; later behavior states are reserved without policy implementation.
- **Use canonical event envelope plus raw native payload preservation:** Required by structured event and diagnostics requirements; evidence rejects exposing native OpenCode events directly.
- **Use open runtime/provider/model identifiers and capability discovery:** Required for multi-runtime direction and supported by t3code open-driver evidence; closed runtime enums are rejected.
- **Define typed/classified SDK errors now, not policy behavior:** Required by TRD and roadmap; retry/fallback/repair execution remains later scope.
- **Prove the contract with fake runtime only:** Required by roadmap and testing evidence; real OpenCode integration is deferred to Sprint 3.

### Tradeoffs

- Defining `TurnID` in Sprint 2 adds a public concept before real OpenCode mapping is implemented, accepted because evidence shows turn-level correlation is needed and task/workflow complexity is explicitly excluded.
- Defining all lifecycle states before implementing every behavior creates unused constants initially, accepted because the TRD and roadmap require explicit state vocabulary and later sprints can attach behavior without renaming public states.
- Using open string-like identifiers reduces compile-time exhaustiveness, accepted because multi-runtime extensibility and unknown-runtime tolerance are stronger requirements.
- Preserving raw payloads increases event size and exposes untyped data paths, accepted because diagnostics and future compatibility require native detail.
- Fake-runtime-only testing cannot prove OpenCode compatibility, accepted because Sprint 3 is the adapter sprint and Sprint 2 should avoid external runtime flakiness.

### Assumptions

- Sprint 1 will provide a buildable project skeleton, SDK/library boundary, fake runtime harness location, and fixture conventions before Sprint 2 implementation starts.
- The implementation language/package choices from Sprint 1 are compatible with public Go-style typed IDs, interfaces, event structs, and error wrapping patterns.
- No persisted agentwrap runtime records exist yet, so Sprint 2 does not need backward-compatibility migration code.
- OpenCode adapter details may force small contract revisions in Sprint 3; Sprint 2 should document that risk rather than overfitting now.

### Dependencies

- `targets/agentwrap/brief.md` and `targets/agentwrap/DECISIONS.md`: Must remain available as target guardrails.
- Sprint 1 project skeleton and fake runtime harness: Needed before implementation can add SDK contract code and tests.
- `targets/agentwrap/reports/sprint-evidence/02-core-runtime-contract.txt`: Planning source of truth for Sprint 2 evidence.
- `studies/go-cli-study/reports/final/05-error-handling.md`: Additional error-model evidence opened directly and cited as a documented deviation.

### Risks

- **Contract overfits to t3code hierarchy:** Mitigate by including only runtime/run/session/turn and rejecting thread/item/workflow in this sprint.
- **Contract underfits OpenCode event reality:** Mitigate with raw payload preservation, unknown event support, and Sprint 3 adapter pressure review.
- **Error model becomes policy engine early:** Mitigate by limiting Sprint 2 to classification and safe diagnostics, not retry/fallback decisions.
- **Lifecycle states imply behavior not implemented yet:** Mitigate by documenting reserved states and testing only fake-supported transitions.
- **Missing Sprint 1 skeleton blocks implementation:** Mitigate by making prerequisite verification the first tracker task and preventing skeleton catch-up work from being hidden in Sprint 2.
- **Large bundle evidence omitted from active context hides a source-specific caveat:** Mitigate by carrying omitted-evidence risk and reopening source reports only for concrete implementation blockers.

## Tracker Guidance

Use this reasoning to write `targets/agentwrap/sprints/02-core-runtime-contract/plan.md`.

The tracker must include:

- scope limited to public SDK contract definitions, fake runtime implementation, and tests proving event consumption, lifecycle transitions, capability discovery, raw payload preservation, artifact/metadata references, and error classification
- non-scope blocking real OpenCode adapter work, health/config validation, retry/fallback policy execution, validation/repair implementation, persistence, CLI product surface, and workflow/DAG abstractions
- execution tasks derived from the six decision areas above
- prerequisite check for Sprint 1 skeleton/fake harness availability before implementation work
- risks, assumptions, open questions, omitted evidence, and direct error-handling evidence deviation carried forward
- quality gates proving the contract supports OpenCode without naming OpenCode in the common path and plausibly supports a second runtime

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
- [x] Evidence bundle was read or staged according to the context strategy.
- [x] Applicable, non-applicable, and ambiguous requirements are recorded where relevant.
- [x] Study evidence is tied to decisions, risks, alternatives, or expected evidence.
- [x] Important decisions are explicitly justified.
- [x] Non-trivial alternatives are discussed.
- [x] Deviations, assumptions, risks, and unknowns are documented.
- [x] Expected execution and review evidence is defined.
- [x] The sprint tracker can be written from this reasoning without reopening every study report.

## Documentation Updates

- `targets/agentwrap/sprints/02-core-runtime-contract/plan.md`: Must be created from this reasoning before implementation starts.
- `targets/agentwrap/DECISIONS.md`: Implementation may add accepted decisions only after code and tests confirm the contract choices; planning alone should not update the accepted decision log.
- `targets/agentwrap/brief.md`: No change required during planning; update only if implementation discovers a target-level requirement correction.
