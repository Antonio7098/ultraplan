# Sprint Reasoning: Output Validation and Repair

> Target: agentwrap
> Sprint ID: 08-validation-repair
> Output: `targets/agentwrap/sprints/08-validation-repair/reasoning.md`
> Sprint Tracker: `targets/agentwrap/sprints/08-validation-repair/plan.md`

## Overview

**Sprint:** Output Validation and Repair  
**Purpose:** Make runtime completion conditional on caller-defined output success criteria, and add bounded, visible repair attempts when validation fails.  
**Roadmap Section:** `targets/agentwrap/roadmap.md` - `## Sprint 8: Output Validation and Repair`  
**Depends On:** Sprints 0-7 runtime contract, OpenCode adapter, lifecycle/session handling, health/config checks, resilience policy metadata, and initialization-time permission policy.  
**Reasoning Status:** Ready For Tracker

## Target Sources

- `targets/agentwrap/sources/PRD.md` - validation of required outputs, graceful degradation through repair, retained runtime context, output safety, permissions/blocking states, and product-agnostic SDK goals.
- `targets/agentwrap/sources/TRD.md` - output/artifact validation, repair/reprompt, explicit lifecycle, permission distinction, error model, metadata, and artifact-first large output requirements.
- `targets/agentwrap/sources/feature-architecture.md` - state-first modular flow, runtime-owned orchestration, stateless validation logic, and minimal abstraction rule.
- `targets/agentwrap/roadmap.md` - Sprint 8 goal, scope, OpenCode internals evidence, output, and quality gate.

## Evidence Basis

**Evidence Status:** Complete and used  
**Context Strategy:** Staged loading used. PRD, TRD, feature protocol, roadmap Sprint 8, relevant evidence packs, key final reports, Sprint 7 artifacts, decision log, and narrow code references were loaded. Per-source reports were not opened because the packs and final reports were sufficient for sprint decisions.

### Evidence Packs Used

- `targets/agentwrap/reports/evidence/validation-repair.md` - validates that runtime success is not product success, validation needs expected-vs-observed repair context, repair must be bounded and visible, and large outputs should prefer artifacts.
- `targets/agentwrap/reports/evidence/session-lifecycle.md` - informs explicit same-session, fresh-session, unsupported, and best-effort repair continuity metadata.
- `targets/agentwrap/reports/evidence/testing-strategy.md` - requires fake-first validation/repair tests, structured fixtures, failure-path coverage, and gated real runtime evidence.
- `targets/agentwrap/reports/permission-based-agent-wrapping.md` - requires repair attempts to preserve initialized permission posture and keep native approval mechanics inside adapters.

### Final Reports Used

- `studies/opencode-wrap-study/reports/final/03-resilience-fallback-and-validation.md` - shows that structured output must be validated rather than trusted, policies need bounded attempts, and no studied repo has a complete composable validate/repair abstraction.
- `studies/go-cli-study/reports/final/05-error-handling.md` - supports classified, structured validation, repair-exhausted, and permission errors instead of string matching.
- `studies/go-cli-study/reports/final/06-io-abstraction.md` - supports injecting or isolating filesystem/IO boundaries so validators can be tested without hardcoded global IO.
- `studies/go-cli-study/reports/final/11-testing-strategy.md` - supports table-driven tests, centralized fakes, fixtures, and explicit integration gates.

### Per-Source Reports Used

- None. The final reports and evidence packs gave enough direction for this sprint's decisions.

### Code References Used

- `agentwrap/runtime.go:22` - `RunRequest` is the current caller input boundary where validation expectations should attach.
- `agentwrap/runtime.go:47` - `RunResult` already carries status, metadata, artifacts, warnings, usage, and classified error.
- `agentwrap/runtime.go:77` - `CapabilityValidationEvents` already exists and can be made real in this sprint.
- `agentwrap/policy.go:20` - `PolicyContext` already reserves `Validation *ValidationResult`, but the placeholder must become real.
- `agentwrap/metadata.go:17` - `RunMetadata` is the right place to add validation and repair summaries.
- `agentwrap/metadata.go:118` - existing `SessionAction` values can express same-session, fresh, fork, replace, release repair requests.
- `agentwrap/events.go:24` - `EventValidation` exists; repair should be visible through events or metadata without expanding core run status.
- `agentwrap/errors.go:12` - `ErrorValidation` and `ErrorRepairExhausted` already exist, and `ErrorPermission` is available for permission-denied repair attempts.
- `agentwrap/permissions.go:71` - `PermissionPolicy` is already run-scoped caller intent and must be copied into repair requests.
- `agentwrap/opencode/runtime.go:20` - OpenCode adapter startup owns permission translation and session args; validation/repair should wrap the runtime instead of embedding product validation in the adapter.

### Evidence Rejected Or Not Used

- **OpenCode live approval API details:** Relevant to future server-mode approval transport, but Sprint 8 must respect the initialized permission policy through existing `RunRequest.PermissionPolicy` and must not implement live approval posting.
- **CLI design evidence:** Sprint 8 does not add an executable/user-facing command surface.
- **Persistence backend evidence:** Sprint 9 owns durable event sink and persistence hooks. Sprint 8 should create metadata that persistence can later store, not choose a storage backend.
- **Full JSON schema technology choice:** Requirements ask for structured data validation, but no target requirement selects a schema library. Sprint 8 should expose caller-defined structured validators and minimal built-in checks without committing to a schema engine.

## Requirement Map

### Requirement Index Used In This Sprint

| Requirement | Source | Area | Applicability | Why It Matters For This Sprint |
| --- | --- | --- | --- | --- |
| Validate required outputs | PRD Primary Use Cases / Output Validation | Product success | Applicable | A run cannot be marked complete only because the runtime exited successfully. |
| Output validation MVP | PRD MVP Scope | Product success | Applicable | Sprint 8 is the MVP layer for validation and repair. |
| Output/artifact validation | TRD Output and Artifact Validation | Technical contract | Applicable | Defines expected files, directories, structured data, metadata fields, caller validators, and repair context. |
| Repair and reprompt | TRD Repair and Reprompt | Technical contract | Applicable | Requires bounded repair attempts and explicit retained-session behavior. |
| Permissions and interaction | TRD Permissions and Interaction | Security | Applicable | Permission denials during repair must remain distinct from validation failures. |
| Output truncation and large output safety | TRD Output Truncation and Large Output Safety | Artifacts | Applicable | Validation should encourage durable artifact references over terminal/process output. |
| Explicit lifecycle states | TRD Run and Session Lifecycle | Lifecycle | Applicable with DEC-021 constraint | Repair/validation phases should be event and metadata facts, not new core run statuses. |
| Persistence requirements | TRD Persistence Requirements | Durability | Non-Applicable | Sprint 9 owns persistence hooks; Sprint 8 only prepares metadata and event facts. |
| Cost and time estimation | PRD/TRD Cost and Time Estimation | Observability | Non-Applicable | Validation may preserve metadata but does not alter cost estimation. |

### Applicable Requirements

- **Runtime exit success is insufficient:** Validation must run after a successful runtime result when configured and must be able to convert the logical result to failed validation.
- **Expected outputs must be caller-defined:** The SDK must support file presence, directory presence, structured data, metadata field, artifact reference, and caller-defined validation checks without UltraPlan-specific report semantics.
- **Validation failures need repair context:** Each failure needs expected value, observed value, safe detail, and optional repair hint so a repair prompt can be generated without dumping large or sensitive output.
- **Repair attempts are bounded and visible:** Repair must have explicit max attempts, attempt metadata, events, and terminal exhaustion behavior.
- **Session continuity must be explicit:** Repair should be able to request same-session continuation when useful, but must record same, fresh, forked, unsupported, or best-effort outcomes.
- **Permission policy must carry through repair:** Repair requests must inherit the initialized `PermissionPolicy` unless the caller explicitly supplies a replacement; permission-denied repair must be categorized as permission failure, not validation failure.
- **Artifact-first large output:** Built-in validation should inspect durable artifact paths and references; large content should not be shoved into events or repair prompts.

### Non-Applicable Requirements

- **Durable persistence:** Sprint 8 should add metadata/events suitable for Sprint 9 persistence but must not choose a storage backend.
- **CLI status/inspect commands:** Future surface review or Sprint 9 command work owns user-facing commands.
- **Second runtime proof:** Sprint 11 owns pressure-testing the abstraction against another runtime.

### Ambiguous Or Conflicting Requirements

- **Structured data validation mechanism:** The TRD requires structured data validation but does not prescribe JSON Schema, Go struct decoding, or custom callbacks. The sprint should provide a minimal runtime-neutral validator interface and built-in JSON well-formed/required-field helpers only if they fit existing code style.
- **Same-session repair default:** Evidence says retained sessions are useful for repair, while DEC-020 rejects silently forcing same-session behavior. The sprint should make repair session action explicit and default conservatively to the caller's existing session request.
- **Validation inside policy runner vs separate wrapper:** Sprint 6 policy context reserved validation, but DEC-016 keeps resilience policy as attempt orchestration. Sprint 8 should integrate validation with policy context without turning `PolicyRunner` into a broad workflow engine.

### Open Questions

- Should the public request shape be `RunRequest.Validation *ValidationSpec` or should validation be provided only by a wrapping `ValidationRunner`? The plan recommends a wrapper plus a small request spec to keep the base runtime contract readable.
- Should structured validators include a built-in JSON schema engine later? Defer until caller evidence proves schema compatibility needs.
- Should repair prompts be generated by a default template or entirely caller-provided? The plan recommends a small default prompt builder with caller override, because repair context has a common shape.

## Sprint Decision Analysis

### Decision Area 1: Validation Boundary and Expected Output Model

**Problem:** Decide where expected outputs and validators live without embedding product-specific workflow concepts or adapter-specific logic.

**Requirements Applied**
- PRD output validation requires callers to define success criteria beyond runtime exit status.
- TRD output/artifact validation requires files, directories, structured data, metadata fields, and caller-defined validators.
- Feature architecture protocol requires runtime orchestration to own sequencing and logic modules to stay stateless.

**Evidence Applied**
- `validation-repair.md` says runtime success is not product success and validation must report expected vs observed state.
- `go-cli-study/reports/final/06-io-abstraction.md` supports testable filesystem/IO boundaries.
- `agentwrap/runtime.go:22` shows `RunRequest` is the existing caller input boundary.
- `agentwrap/opencode/runtime.go:20` shows adapters own native run mechanics; validation should not be embedded in OpenCode-specific startup.

**Options Considered**
- **Option A:** Add validation directly to every runtime adapter.
- **Option B:** Add a runtime-neutral validating wrapper that implements `Runtime`, plus small request-level validation spec types.
- **Option C:** Leave validation entirely to callers outside the SDK.

**Chosen Approach**
- Implement validation as a runtime-neutral wrapper/orchestrator around a `Runtime`, with public validation spec/types attached to `RunRequest` or wrapper config. Built-in validators should cover file presence, directory presence, artifact presence/reference, structured JSON/data checks where minimal, metadata fields, and caller-defined checks.

**Decision Justification**
- A wrapper keeps OpenCode details out of common validation logic and preserves product-agnostic SDK boundaries.
- Keeping validation entirely outside the SDK would violate PRD/TRD MVP requirements and prevent policy-visible validation facts.
- Embedding validation into adapters would duplicate logic for each runtime and make future runtimes harder.
- The tradeoff is one more orchestration layer, but this abstraction is earned because validation is caller-facing, runtime-neutral, and policy-visible.

**Execution Notes**
- Validation logic should be stateless and deterministic: given `RunResult`, artifacts, metadata, and a read-only artifact/filesystem view, it returns `ValidationResult`.
- File/directory validators should resolve paths relative to the run workdir or explicit artifact references and should avoid reading large content by default.
- Caller validators receive a safe context, not raw native payloads by default.

**Expected Evidence**
- **Tests:** Unit tests for each built-in validator, caller-defined validator invocation, expected vs observed failure details, and empty/missing/malformed cases.
- **Runtime Evidence:** `EventValidation` events with stable result IDs, pass/fail status, expectation IDs, safe details, and repair hints.
- **Review Checks:** OpenCode adapter remains free of product validation logic except for emitting native artifacts it already owns.

---

### Decision Area 2: Validation Result, Metadata, and Error Semantics

**Problem:** Decide how validation outcomes affect final run status, errors, events, and metadata.

**Requirements Applied**
- TRD error model requires `validation` and `repair_exhausted` categories.
- TRD metadata requirements require validation results and output artifacts in run records.
- DEC-021 requires recovery phases to be represented as events/metadata, not as expanded core statuses.

**Evidence Applied**
- `go-cli-study/reports/final/05-error-handling.md` supports structured errors and programmatic classification.
- `agentwrap/errors.go:12` already defines `ErrorValidation` and `ErrorRepairExhausted`.
- `agentwrap/metadata.go:17` already centralizes run metadata.
- `agentwrap/events.go:24` already includes `EventValidation`.

**Options Considered**
- **Option A:** Add `StatusValidating` and `StatusRepairing` run states.
- **Option B:** Keep core statuses unchanged and represent validation/repair as events, metadata, and classified errors.
- **Option C:** Return validation failures only as warnings while leaving status completed.

**Chosen Approach**
- Keep `RunStatus` unchanged. When validators fail and no repair succeeds, the logical final result is `StatusFailed` with `ErrorValidation` or `ErrorRepairExhausted`, while validation and repair phase details live in metadata and events.

**Decision Justification**
- This honors DEC-021 and keeps the public run status model small.
- Treating validation failures as warnings would violate the core sprint goal that product success criteria govern final success.
- Adding core validation/repair statuses would reintroduce the status expansion that DEC-021 explicitly removed.

**Execution Notes**
- Add `ValidationMetadata` and `RepairMetadata` or equivalent fields to `RunMetadata`.
- Promote the placeholder `ValidationResult` in `policy.go` into a durable result model with expectation IDs, passed/failed/skipped counts, safe failure context, and native metadata where needed.
- A validation failure before repair should use `ErrorValidation`; exhausted repair should use `ErrorRepairExhausted` with validation failures preserved.
- A permission denial during repair should surface as `ErrorPermission` with repair phase metadata, not as a validation error.

**Expected Evidence**
- **Tests:** Final result status/error tests for validation pass, validation fail without repair, repair success, repair exhaustion, and repair permission denial.
- **Runtime Evidence:** Final metadata includes all validation results and repair attempt summaries even when a later repair succeeds.
- **Review Checks:** No new core `RunStatus` values for validating or repairing.

---

### Decision Area 3: Repair Attempt Lifecycle and Session Continuity

**Problem:** Decide how repair attempts are launched, bounded, related to the original run, and connected to session retention.

**Requirements Applied**
- TRD repair and reprompt requires bounded repair attempts and preservation of context from the original run.
- PRD retained runtime context requires repair to use same-session context where supported.
- Roadmap Sprint 8 requires same-session repair where available and unsupported same-session repair tests.

**Evidence Applied**
- `session-lifecycle.md` requires explicit same, forked, fresh, unsupported, and best-effort session metadata.
- Roadmap Sprint 8 OpenCode internals evidence shows OpenCode same-session/fork continuation and `parentID` tracking can preserve repair context.
- DEC-011 says OpenCode continuation is best-effort unless verified.
- DEC-020 says session continuity must be explicit per policy decision.
- `agentwrap/metadata.go:118` defines `SessionAction` and `SessionRelationship`.

**Options Considered**
- **Option A:** Always repair in the same retained session.
- **Option B:** Always start a fresh session with summarized context.
- **Option C:** Let repair policy/request choose session action, defaulting conservatively and recording resolved relationship.

**Chosen Approach**
- Implement bounded repair attempts as a runtime-neutral repair flow that derives a repair `RunRequest`, carries a parent/original run relationship, and uses explicit repair session action. Same-session repair is available when requested and supported; unsupported same-session repair is reported explicitly or falls back only when caller policy permits.

**Decision Justification**
- Same-session repair is useful for context continuity, but silently forcing it could preserve poisoned context after malformed output or unsupported runtime behavior.
- Fresh sessions are safer in some failure modes but can lose useful context.
- Explicit caller/policy choice matches prior session policy decisions and leaves future persistence clear.

**Execution Notes**
- Add repair config with max attempts, optional prompt builder, session action, and optional policy hook for whether a validation failure is repairable.
- The default repair prompt should summarize failed expectations, observed state, artifact references, and safe repair hints; it must not embed large artifact content by default.
- Each repair attempt must emit repair start/end events or event payloads and must append metadata with attempt number, parent run ID, request safe fields, session relationship, validation result, and terminal error if any.
- Repair attempts should inherit provider/model/workdir/permission policy unless explicitly overridden.

**Expected Evidence**
- **Tests:** Repair success after one failed validation, repair exhaustion, unsupported same-session repair, fresh-session repair, cancellation during repair, and no unbounded loop.
- **Runtime Evidence:** Attempt metadata clearly links original run, repair run, and final validation.
- **Review Checks:** Repair flow does not become a generic DAG/workflow engine.

---

### Decision Area 4: Permission and Security During Repair

**Problem:** Ensure repair attempts do not bypass initialized permission posture and that repair permission denials remain distinct from validation failures.

**Requirements Applied**
- PRD permissions and blocking states require configurable permission handling and blocked state visibility.
- TRD permissions/sandboxing requires runtime permission failures to be distinguished from SDK validation failures.
- Roadmap Sprint 8 requires repair attempts to respect initialized permission policy and permission denials during repair to be reported distinctly.

**Evidence Applied**
- `permission-based-agent-wrapping.md` requires static config plus runtime auditability and warns against hiding permission mechanics.
- DEC-022 says permission policy is initialized through `RunRequest` and translated by adapters.
- DEC-023 defers live approval posting but preserves initialization-time policy and audit.
- `agentwrap/permissions.go:71` defines run-scoped `PermissionPolicy`.

**Options Considered**
- **Option A:** Let repair run without permission policy to maximize chance of success.
- **Option B:** Always clone the original permission policy into repair requests unless the caller explicitly provides a replacement.
- **Option C:** Disable automatic repair whenever permission policy is present.

**Chosen Approach**
- Repair attempts inherit the initialized `PermissionPolicy`, legacy `PermissionMode`, sandbox, workdir, and health/cap requirements by default. Permission-denied repair attempts terminate or follow explicit policy as `ErrorPermission`, with validation failure context preserved separately.

**Decision Justification**
- Repair often edits files, so relaxing permissions during repair would be a security regression.
- Disabling repair under permission policy would block a required MVP flow.
- Explicit inheritance plus distinct error category satisfies both validation and permission requirements.

**Execution Notes**
- Metadata should distinguish `validation_failed`, `repair_permission_denied`, and `repair_exhausted`.
- Permission audit events from repair attempts should remain in the event stream and final metadata.
- Do not add a public live approval service in this sprint.

**Expected Evidence**
- **Tests:** Repair request inherits permission policy; denied repair shell/edit action returns `ErrorPermission`; validation failures remain queryable in metadata.
- **Runtime Evidence:** Permission audit metadata includes repair attempts where available.
- **Review Checks:** No path broadens permission policy during repair without explicit caller input.

## Deviations

| Requirement | Deviation | Reason | Risk | Disposition | Follow-up |
| --- | --- | --- | --- | --- | --- |
| Structured data validation | Do not select a full schema library in Sprint 8 | No requirement or evidence chooses JSON Schema or another schema engine | Callers may need richer schemas later | Temporary | Reopen when a real caller needs schema compatibility |
| Same-session repair | Default does not silently force same-session repair | DEC-020 requires explicit session continuity decisions | Callers may need to configure same-session repair | Permanent unless superseded | Document defaults and add tests |
| Persistence of validation history | Metadata/events only, no durable backend | Sprint 9 owns persistence hooks | Validation evidence is process-local until persistence exists | Temporary | Sprint 9 stores validation/repair records |

## Cross-Cutting Reasoning

### Major Decision Summary

- **Validation is a runtime-neutral wrapper layer:** Required by PRD/TRD output validation and supported by validation-repair plus IO abstraction evidence.
- **Validation and repair are events/metadata, not core statuses:** Required by DEC-021 and supported by existing event/error shapes.
- **Repair is bounded and session-explicit:** Required by TRD repair/session requirements and supported by session lifecycle evidence.
- **Repair inherits permission policy:** Required by Sprint 8 roadmap and Sprint 7 permission decisions.

### Tradeoffs

- A validation wrapper adds an orchestration layer, but avoids adapter duplication and keeps validation product-agnostic.
- Minimal structured validation avoids premature schema-library commitment, but may require caller-defined validators for rich report validation.
- Same-session repair is not forced by default, preserving safety at the cost of explicit caller configuration for context-sensitive repair.
- Metadata grows before persistence exists, but Sprint 9 will need these facts.

### Assumptions

- Current `RunResult.Artifacts`, `RunMetadata.Artifacts`, and `WorkDir` are enough to locate built-in file/directory expectations.
- Existing fake runtime/testkit can be extended for validation and repair without launching OpenCode.
- OpenCode same-session continuation remains best-effort until live evidence proves stronger guarantees.
- Callers can tolerate validation running after runtime completion for Sprint 8; event-driven in-flight validation remains future scope.

### Dependencies

- **Sprint 6 policy runner:** Validation results should flow into policy context without changing retry/fallback into a generic workflow engine.
- **Sprint 7 permission policy:** Repair requests must carry `PermissionPolicy` and audit metadata.
- **OpenCode adapter session support:** Same-session repair depends on existing `--session` behavior and current best-effort metadata.
- **Testing harness:** Fake runtime support is needed for deterministic validation and repair tests.

### Risks

- **Over-broad validator API:** Could turn into product-specific report validation. Mitigation: keep built-ins generic and let callers provide custom validators.
- **Repair prompt leaks sensitive output:** Mitigation: repair context stores safe expected/observed facts and artifact references, not large raw content.
- **Permission-denied repair obscures original validation failure:** Mitigation: use `ErrorPermission` for terminal permission denial and preserve validation failure metadata separately.
- **Unbounded or nested repair loops:** Mitigation: max attempts is required for automatic repair and tests must prove exhaustion.

## Tracker Guidance

Use this reasoning to write `targets/agentwrap/sprints/08-validation-repair/plan.md`.

The tracker must include:

- scope for validation spec/model, built-in validators, validation wrapper, repair lifecycle, session behavior, permission inheritance, events, metadata, docs, and tests
- non-scope for persistence, CLI, schema-library choice, live approval transport, second runtime, and product-specific UltraPlan report validators
- execution tasks derived from the four decision areas
- tests and evidence expectations for pass/fail/repair/exhaustion/permission-denial/session cases
- risks, assumptions, and open questions carried forward
- success criteria that prove runtime exit success alone cannot mark configured validation runs as successful

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

## Documentation Updates

- `agentwrap/README.md` - document validation expectations, repair attempts, permission inheritance, and limitations.
- `agentwrap/doc.go` - summarize validation/repair public API once implemented.
- `targets/agentwrap/DECISIONS.md` - implementation should record durable decisions for validation wrapper boundary, repair/session behavior, and permission inheritance after code lands.
