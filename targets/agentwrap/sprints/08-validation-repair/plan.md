# Sprint Tracker: Output Validation and Repair

> Target: agentwrap
> Sprint ID: 08-validation-repair
> Created: 2026-05-20
> Reasoning: `targets/agentwrap/sprints/08-validation-repair/reasoning.md`
> Roadmap Section: `targets/agentwrap/roadmap.md` - `## Sprint 8: Output Validation and Repair`

## Sprint Overview

- **Sprint Name:** Output Validation and Repair
- **Sprint Focus:** Add runtime-neutral output expectations, especially template-file-to-Markdown-artifact validation and JSON validation, plus bounded repair attempts that preserve session and permission facts.
- **Depends On:** Sprints 0-7 runtime contract, OpenCode adapter, lifecycle/session handling, health/config, resilience policy metadata, and initialization-time permission policy.
- **Status:** Not Started

## Requirement Links

- `targets/agentwrap/sources/PRD.md` - validate required outputs, graceful degradation through repair, retained runtime context, permissions, observability, output safety.
- `targets/agentwrap/sources/TRD.md` - output/artifact validation, repair/reprompt, error model, session lifecycle, permissions/sandboxing, metadata, artifact-first large output safety.
- `targets/agentwrap/sources/feature-architecture.md` - runtime-owned orchestration, stateless validation logic, explicit state, minimal abstraction.
- `targets/agentwrap/roadmap.md` - Sprint 8 goal, scope, OpenCode internals evidence, output, and quality gate.
- `targets/agentwrap/sprints/08-validation-repair/reasoning.md` - reasoning decisions this tracker executes.

## Evidence Links

- `targets/agentwrap/reports/evidence/validation-repair.md` - validator shape, repair context, bounded repair, artifact-first outputs.
- `targets/agentwrap/reports/evidence/session-lifecycle.md` - repair session continuity and explicit session relationship metadata.
- `targets/agentwrap/reports/evidence/testing-strategy.md` - fake-first tests, fixtures, edge cases, integration gates.
- `targets/agentwrap/reports/permission-based-agent-wrapping.md` - permission policy and audit constraints during repair.
- `studies/opencode-wrap-study/reports/final/03-resilience-fallback-and-validation.md` - output validation, bounded attempts, typed failures.
- `studies/go-cli-study/reports/final/05-error-handling.md` - classified, structured errors.
- `studies/go-cli-study/reports/final/06-io-abstraction.md` - testable filesystem/IO boundaries.
- `studies/go-cli-study/reports/final/11-testing-strategy.md` - table-driven tests, fakes, fixtures, golden expectations.
- `/home/antonioborgerees/coding/agentwrap/runtime.go` - current request/result/capability boundary.
- `/home/antonioborgerees/coding/agentwrap/policy.go` - policy context validation placeholder and attempt orchestration.
- `/home/antonioborgerees/coding/agentwrap/metadata.go` - metadata, attempt, and session relationship structures.
- `/home/antonioborgerees/coding/agentwrap/events.go` - validation event kind and event envelope.
- `/home/antonioborgerees/coding/agentwrap/errors.go` - validation, repair-exhausted, and permission error categories.
- `/home/antonioborgerees/coding/agentwrap/permissions.go` - run-scoped permission policy to inherit during repair.

## Sprint Goals

- **Primary Goal:** A configured run is only successful when runtime execution succeeds and all required output validators pass, with bounded repair available after validation failure.
- **Secondary Goals:**
  - Emit validation and repair facts as canonical events and metadata.
  - Preserve explicit session relationship and parent/repair attempt history.
  - Ensure repair attempts inherit permission policy and report permission denials distinctly.

## Scope

- Define runtime-neutral validation expectation, validation result, validation failure, repair context, and repair metadata types.
- Add a validation configuration surface for SDK callers without adding UltraPlan-specific report semantics.
- Implement built-in validators for file presence, directory presence, artifact reference/presence, Markdown template-file compliance, JSON output validation, metadata fields, and caller-defined checks.
- Implement a `Runtime`-compatible validation/repair wrapper that runs validators after successful attempts and can launch bounded repair attempts.
- Promote `PolicyContext.Validation` from placeholder into a real policy-visible validation result.
- Emit validation and repair events with safe expected/observed detail, attempt numbers, session relationship, and repair outcome.
- Add metadata for validation results, repair attempts, repair exhaustion, and permission-denied repair.
- Ensure repair requests inherit workdir, runtime/provider/model, sandbox, permission mode, and `PermissionPolicy` unless explicitly overridden.
- Add fake-runtime and fixture coverage for missing output, malformed structured output, empty output, repair success, repair exhaustion, unsupported same-session repair, cancellation during repair, and permission denial during repair.
- Update package docs/README and add implementation decisions to `DECISIONS.md` after code lands.

## Non-Scope

- Durable persistence of validation/repair records; Sprint 9 owns persistence hooks.
- User-facing executable commands or CLI output.
- Selecting a full JSON Schema or third-party schema engine.
- UltraPlan-specific report section validators, scoring, or roadmap/planning workflow logic.
- OpenCode server-mode REST/SSE approval transport or public live approval service.
- Codex, Claude Code, or second-runtime adapters.
- General workflow/DAG composition beyond bounded validation and repair.

## Proposed Implementation Shape

- **Package / Module Boundaries:** Keep public validation types in the root `agentwrap` package. Put deterministic validation logic in small root-package helpers or an internal helper if it has no public surface. Keep OpenCode adapter unchanged except where tests prove adapter artifact/session facts need exposure.
- **Public Surface:** Add validation expectation/spec types and a `Runtime` wrapper such as `ValidationRunner` or `ValidatingRuntime`. Include first-class template-file-to-Markdown-artifact and JSON validators, caller-defined validator interface/function support, and repair config with max attempts, prompt builder, session action, and request override hook.
- **State And Lifecycle:** Keep core `RunStatus` values unchanged. Validation and repair phases are event and metadata facts. Repair attempts have parent/original run linkage, explicit session action, and resolved session relationship.
- **Error And Failure Behavior:** Validation failure without successful repair returns `ErrorValidation`. Exhausted repair returns `ErrorRepairExhausted` with validation details preserved. Permission denial during repair returns `ErrorPermission` with repair phase metadata, not `ErrorValidation`.
- **Observability:** Emit `EventValidation` for validation start/result and add a repair event kind or repair payload convention for repair start/result/exhaustion. Final metadata includes validation results, repair attempt summaries, inherited permission policy ID, and session relationship.
- **Testing Surface:** Use fake runtimes and test fixtures by default. Real OpenCode smoke is optional and should be gated; record an explicit deferral if no adapter path changes require it.

## Decisions

- [ ] **Decision 1: Validation Is Runtime-Neutral Wrapper Behavior**
  > **Requirement:** PRD/TRD output validation requires product success criteria beyond runtime exit.
  > **Evidence:** `validation-repair.md`, `go-cli-study/reports/final/06-io-abstraction.md`, `agentwrap/opencode/runtime.go`.
  > **Tradeoff:** Adds an orchestration wrapper, but avoids adapter duplication and product-specific validation in OpenCode.
  > **Rejected Alternative:** Adapter-local validation, because it would leak validation behavior into runtime-specific code.
  > **Risk / Follow-up:** Keep built-ins generic even while making template-file Markdown and JSON validation first-class; add product-specific validators only in caller code.

- [ ] **Decision 2: Validation And Repair Are Events/Metadata, Not Core Statuses**
  > **Requirement:** TRD lifecycle and error model, constrained by DEC-021 minimal status model.
  > **Evidence:** `agentwrap/events.go`, `agentwrap/errors.go`, `agentwrap/metadata.go`.
  > **Tradeoff:** Callers inspect metadata/events for phase detail instead of new statuses.
  > **Rejected Alternative:** Add `validating` and `repairing` statuses, which would reverse DEC-021.
  > **Risk / Follow-up:** Documentation must make final status/error plus validation metadata inspection clear.

- [ ] **Decision 3: Repair Attempts Are Bounded And Session-Explicit**
  > **Requirement:** TRD repair/reprompt and retained-session requirements.
  > **Evidence:** `session-lifecycle.md`, roadmap Sprint 8 OpenCode internals evidence, DEC-011, DEC-020.
  > **Tradeoff:** Same-session repair requires explicit caller/policy selection rather than being silently forced.
  > **Rejected Alternative:** Always same-session repair, because unsupported or unsafe continuation would be hidden.
  > **Risk / Follow-up:** OpenCode same-session repair remains best-effort until live runtime evidence verifies durability.

- [ ] **Decision 4: Repair Inherits Permission Policy**
  > **Requirement:** Sprint 8 roadmap and TRD permissions/sandboxing require repair to respect initialized permission policy.
  > **Evidence:** `permission-based-agent-wrapping.md`, DEC-022, DEC-023, `agentwrap/permissions.go`.
  > **Tradeoff:** Repair may fail due to policy denial even when a broader policy could fix the output.
  > **Rejected Alternative:** Relax permissions during repair, because it would bypass caller intent.
  > **Risk / Follow-up:** Consider explicit caller repair overrides later if a real product needs them.

## Execution Checklist

- [ ] **Task 1: Define Validation Model**
  > *Description: Add the public types that describe expectations, validator context, validation results, validation failures, and repair context.*
  - [ ] **Sub-task 1.1:** Define expectation IDs, expectation kinds, including template-file Markdown and JSON expectation types, plus template path, artifact path, and metadata fields, severity, and safe repair hints.
  - [ ] **Sub-task 1.2:** Replace the minimal `ValidationResult` placeholder with a durable result model that records pass/fail/skipped counts and failure details.
  - [ ] **Sub-task 1.3:** Add validation and repair fields to `RunMetadata` while keeping existing metadata backward-compatible.

- [ ] **Task 2: Implement Built-In Validators**
  > *Description: Provide generic validators that meet Sprint 8 scope without product-specific report semantics.*
  - [ ] **Sub-task 2.1:** Implement file presence and directory presence validation relative to workdir or artifact roots.
  - [ ] **Sub-task 2.2:** Implement artifact presence/reference validation against `RunResult.Artifacts` and `RunMetadata.Artifacts`.
  - [ ] **Sub-task 2.3:** Implement Markdown template-file validation for required headings, sections, ordering, and unresolved placeholder or required-block checks in a runtime-neutral template model.
  - [ ] **Sub-task 2.4:** Implement JSON validation for well-formed output plus minimal required-field or shape checks, and support caller-defined validators.
  - [ ] **Sub-task 2.5:** Ensure validators return safe expected/observed facts and avoid embedding large content by default.

- [ ] **Task 3: Add Validation Wrapper Runtime**
  > *Description: Run validators after successful runtime completion and convert failed validation into explicit logical failure.*
  - [ ] **Sub-task 3.1:** Implement a `Runtime`-compatible validation wrapper around an inner runtime.
  - [ ] **Sub-task 3.2:** Forward inner runtime events while adding validation events and final metadata.
  - [ ] **Sub-task 3.3:** Preserve cancellation behavior and ensure cancellation during validation returns the correct category.
  - [ ] **Sub-task 3.4:** Wire validation results into policy context where policy execution evaluates them.

- [ ] **Task 4: Implement Bounded Repair Flow**
  > *Description: Launch repair attempts after validation failure when configured, then re-run validation until success or exhaustion.*
  - [ ] **Sub-task 4.1:** Define repair config with max attempts, repairability decision hook, session action, prompt builder, and request override.
  - [ ] **Sub-task 4.2:** Build repair prompts from validation failures, safe observed facts, artifact references, and repair hints.
  - [ ] **Sub-task 4.3:** Start repair attempts with parent/original linkage and explicit session behavior.
  - [ ] **Sub-task 4.4:** Record repair success, repair failure, repair exhaustion, and unsupported same-session behavior in events/metadata.

- [ ] **Task 5: Preserve Permission Policy During Repair**
  > *Description: Ensure repair attempts cannot bypass the initialized permission posture.*
  - [ ] **Sub-task 5.1:** Clone original `PermissionPolicy`, `PermissionMode`, sandbox, workdir, provider/model, and required caps/health into repair requests by default.
  - [ ] **Sub-task 5.2:** Add tests proving repair permission denial is surfaced as `ErrorPermission` and not folded into validation failure.
  - [ ] **Sub-task 5.3:** Preserve permission audit metadata from repair attempts in the final result.

- [ ] **Task 6: Tests, Docs, And Decisions**
  > *Description: Add focused evidence that the sprint behavior works and document limitations.*
  - [ ] **Sub-task 6.1:** Add unit/table tests for template-file Markdown validators, JSON validators, and caller-defined validators.
  - [ ] **Sub-task 6.2:** Add fake-runtime tests for missing output, template mismatch against `ultraplan/templates/repo-analysis.md`, invalid JSON, JSON shape mismatch, repair success, repair exhaustion, unsupported same-session repair, cancellation, and permission denial.
  - [ ] **Sub-task 6.3:** Update README/package docs with template-file Markdown validation, JSON validation, repair usage, and artifact-first guidance.
  - [ ] **Sub-task 6.4:** Add accepted decisions to `DECISIONS.md` after implementation evidence exists.

## Testing And Documentation Checklist

- [ ] **Unit Tests:** template-file Markdown validators, JSON validators, result aggregation, error categories, prompt builder, permission inheritance, session-action derivation.
- [ ] **Fixture Tests:** fake run artifacts, missing files, Markdown section mismatches against a real template file, invalid JSON, JSON shape mismatches, repair prompts, repair attempt event sequences.
- [ ] **Integration Tests:** wrapper with OpenCode adapter only if implementation touches adapter request/session behavior; otherwise record explicit deferral.
- [ ] **Real Runtime Smoke:** gated and optional for this sprint unless OpenCode repair/session behavior changes; record command and result if run.
- [ ] **Documentation Updates:** README, package docs, and decision log after implementation.

## Risks And Blockers

| Risk | Impact | Mitigation | Status |
| --- | --- | --- | --- |
| Validator API becomes UltraPlan-specific | High | Keep built-ins generic and require caller-defined validators for report-specific rules | Open |
| Repair prompt includes too much or sensitive output | High | Use safe expected/observed facts and artifact references, not raw large content | Open |
| Same-session repair overclaims OpenCode support | Medium | Record best-effort/unsupported session relationship and gate live smoke | Open |
| Permission denial during repair hides original validation failure | High | Final error uses permission category; validation metadata preserves original failures | Open |
| Repair loop can run indefinitely | High | Require explicit bounded max attempts and test exhaustion | Open |

## Open Questions

- Should validation config live directly on `RunRequest`, only on a wrapper, or both with one canonical normalization path? The reasoning recommends wrapper orchestration plus small request-level spec.
- Should Markdown template validation support only required sections and ordering in Sprint 8, or also exact placeholder/text matching and required table shells? Start with sections/order plus unresolved-slot detection, then add stricter matching only if required.
- Should built-in JSON validation stay minimal or add a schema library later? Defer until caller evidence chooses a schema approach.
- Should repair use a default prompt builder or require caller-provided prompts? Implement a small safe default with caller override.
- Should `EventRepair` be added as a new event kind or should repair use `EventValidation` payload subtypes? Choose the smallest shape that remains clear in tests.

## Success Criteria

- [ ] **Configured validation controls success:** A runtime result with successful process exit fails logically when required validators fail.
- [ ] **Markdown templates are enforceable:** A caller can validate an artifact such as `go-cli-study/reports/repo/01-project-structure/yq.md` against a template such as `ultraplan/templates/repo-analysis.md` and receive explicit mismatch failures when headings, ordering, required blocks, or placeholder resolution are wrong.
- [ ] **JSON outputs are enforceable:** A caller can require valid JSON and minimal shape or required-field compliance and receive explicit mismatch failures.
- [ ] **Validation details are actionable:** Failures include expectation, observed state, safe detail, and repair context.
- [ ] **Repair is bounded and visible:** Repair attempts emit events, update metadata, stop at max attempts, and return `ErrorRepairExhausted` when appropriate.
- [ ] **Session continuity is explicit:** Repair metadata shows same, fresh, forked, unsupported, or best-effort session relationship.
- [ ] **Permission posture is preserved:** Repair attempts inherit initialized permission policy and permission denials surface as `ErrorPermission`.
- [ ] **Artifact-first behavior is supported:** File/directory/artifact validators operate on durable artifacts and avoid relying on terminal output for large content.

## Study Evaluation

- [ ] **Patterns Followed:** typed/classified errors, explicit events/metadata, fake-first tests, injected/testable IO boundary, bounded attempts, artifact-first validation, first-class template-file Markdown and JSON validation.
- [ ] **Anti-Patterns Avoided:** process-exit-as-success, adapter-local product validation, unbounded repair, permission broadening, raw large content in events/prompts, new core validation/repair statuses.
- [ ] **Comparison Needed:** Compare completed implementation against validation-repair, session-lifecycle, error-handling, IO-abstraction, and testing-strategy evidence.
- [ ] **Proceed / Iterate:** Proceed to Sprint 9 only when validation failure, repair success, repair exhaustion, permission denial, and unsupported same-session repair have deterministic tests.

## Review And Sign-Off

- Sprint Status: Not Started
- Completion Date: TBD

## Execution Evidence

- 2026-05-20: Sprint 8 reasoning and tracker created from roadmap, PRD/TRD, feature architecture protocol, study index, validation/session/testing/permission evidence, final reports, Sprint 7 artifacts, decision log, and current agentwrap code references.
- 2026-05-20: Scope updated to make Markdown template validation and JSON validation explicit first-class built-ins rather than leaving them implied under generic structured-data validation.
- 2026-05-20: Markdown validation scope clarified with the concrete template/artifact case: validate `go-cli-study/reports/repo/01-project-structure/yq.md` against `ultraplan/templates/repo-analysis.md`.
