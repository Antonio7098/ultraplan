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
- **Status:** Complete

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
- **State And Lifecycle:** Add first-class `validating` and `repairing` run states. Repair attempts still carry parent/original linkage, explicit session action, and resolved session relationship, with events and metadata providing detailed phase evidence.
- **Error And Failure Behavior:** Validation failure without successful repair returns `ErrorValidation`. Exhausted repair returns `ErrorRepairExhausted` with validation details preserved. Permission denial during repair returns `ErrorPermission` with repair phase metadata, not `ErrorValidation`.
- **Observability:** Emit `EventValidation` for validation start/result and add repair events or payload conventions for repair start/result/exhaustion. Final metadata includes validation results, repair attempt summaries, inherited permission policy ID, and session relationship.
- **Testing Surface:** Use fake runtimes and test fixtures by default. Real OpenCode smoke is optional and should be gated; record an explicit deferral if no adapter path changes require it.

## Decisions

- [x] **Decision 1: Validation Is Runtime-Neutral Wrapper Behavior**
  > **Requirement:** PRD/TRD output validation requires product success criteria beyond runtime exit.
  > **Evidence:** `validation-repair.md`, `go-cli-study/reports/final/06-io-abstraction.md`, `agentwrap/opencode/runtime.go`.
  > **Tradeoff:** Adds an orchestration wrapper, but avoids adapter duplication and product-specific validation in OpenCode.
  > **Rejected Alternative:** Adapter-local validation, because it would leak validation behavior into runtime-specific code.
  > **Risk / Follow-up:** Keep built-ins generic even while making template-file Markdown and JSON validation first-class; add product-specific validators only in caller code.

- [x] **Decision 2: Validation And Repair Are First-Class Run States**
  > **Requirement:** TRD lifecycle and error model require explicit phase visibility for important work states.
  > **Evidence:** `agentwrap/errors.go`, `agentwrap/metadata.go`, `agentwrap/events.go`.
  > **Tradeoff:** The public lifecycle grows to include `validating` and `repairing`, but the model becomes easier to understand and orchestrate.
  > **Rejected Alternative:** Keep validation/repair only in metadata and events, which would make product-success phases look secondary.
  > **Risk / Follow-up:** Lifecycle transitions must stay coherent and not regress into incidental state sprawl.

- [x] **Decision 3: Repair Attempts Default To Same Session**
  > **Requirement:** TRD repair/reprompt and retained-session requirements.
  > **Evidence:** `session-lifecycle.md`, roadmap Sprint 8 OpenCode internals evidence, DEC-011, DEC-020.
  > **Tradeoff:** Default same-session repair improves continuity, but unsupported or unsafe continuation must be surfaced explicitly.
  > **Rejected Alternative:** Default fresh-session repair, because it throws away the main context advantage of repair.
  > **Risk / Follow-up:** OpenCode same-session repair remains best-effort until live runtime evidence verifies durability.

- [x] **Decision 4: Repair Inherits Permission Policy**
  > **Requirement:** Sprint 8 roadmap and TRD permissions/sandboxing require repair to respect initialized permission policy.
  > **Evidence:** `permission-based-agent-wrapping.md`, DEC-022, DEC-023, `agentwrap/permissions.go`.
  > **Tradeoff:** Repair may fail due to policy denial even when a broader policy could fix the output.
  > **Rejected Alternative:** Relax permissions during repair, because it would bypass caller intent.
  > **Risk / Follow-up:** Consider explicit caller repair overrides later if a real product needs them.

## Execution Checklist

- [x] **Task 1: Define Validation Model**
  > *Description: Add the public types that describe expectations, validator context, validation results, validation failures, and repair context.*
  - [x] **Sub-task 1.1:** Define expectation IDs, expectation kinds, including template-file Markdown and JSON expectation types, plus template path, artifact path, and metadata fields, severity, and safe repair hints.
  - [x] **Sub-task 1.2:** Replace the minimal `ValidationResult` placeholder with a durable result model that records pass/fail/skipped counts and failure details.
  - [x] **Sub-task 1.3:** Add `validating` and `repairing` lifecycle states plus validation and repair fields in `RunMetadata` while keeping existing metadata backward-compatible.

- [x] **Task 2: Implement Built-In Validators**
  > *Description: Provide generic validators that meet Sprint 8 scope without product-specific report semantics.*
  - [x] **Sub-task 2.1:** Implement file presence and directory presence validation relative to workdir or artifact roots.
  - [x] **Sub-task 2.2:** Implement artifact presence/reference validation against `RunResult.Artifacts` and `RunMetadata.Artifacts`.
  - [x] **Sub-task 2.3:** Implement Markdown template-file validation for required headings, sections, ordering, and unresolved placeholder or required-block checks in a runtime-neutral template model.
  - [x] **Sub-task 2.4:** Implement JSON validation for well-formed output plus minimal required-field or shape checks, and support caller-defined validators.
  - [x] **Sub-task 2.5:** Ensure validators return safe expected/observed facts and avoid embedding large content by default.

- [x] **Task 3: Add Validation Wrapper Runtime**
  > *Description: Run validators after successful runtime completion and convert failed validation into explicit logical failure.*
  - [x] **Sub-task 3.1:** Implement a `Runtime`-compatible validation wrapper around an inner runtime.
  - [x] **Sub-task 3.2:** Forward inner runtime events while adding lifecycle transitions into `validating` and validation events and final metadata.
  - [x] **Sub-task 3.3:** Preserve cancellation behavior and ensure cancellation during validation returns the correct category.
  - [x] **Sub-task 3.4:** Wire validation results into policy context where policy execution evaluates them.

- [x] **Task 4: Implement Bounded Repair Flow**
  > *Description: Launch repair attempts after validation failure when configured, then re-run validation until success or exhaustion.*
  - [x] **Sub-task 4.1:** Define repair config with max attempts, repairability decision hook, default same-session action, prompt builder, and request override.
  - [x] **Sub-task 4.2:** Build repair prompts from validation failures, safe observed facts, artifact references, and repair hints.
  - [x] **Sub-task 4.3:** Start repair attempts with parent/original linkage, explicit session behavior, and lifecycle transitions into `repairing`.
  - [x] **Sub-task 4.4:** Record repair success, repair failure, repair exhaustion, and unsupported same-session behavior in state transitions, events, and metadata.

- [x] **Task 5: Preserve Permission Policy During Repair**
  > *Description: Ensure repair attempts cannot bypass the initialized permission posture.*
  - [x] **Sub-task 5.1:** Clone original `PermissionPolicy`, `PermissionMode`, sandbox, workdir, provider/model, and required caps/health into repair requests by default.
  - [x] **Sub-task 5.2:** Add tests proving repair permission denial is surfaced as `ErrorPermission` and not folded into validation failure.
  - [x] **Sub-task 5.3:** Preserve permission audit metadata from repair attempts in the final result.

- [x] **Task 6: Tests, Docs, And Decisions**
  > *Description: Add focused evidence that the sprint behavior works and document limitations.*
  - [x] **Sub-task 6.1:** Add unit/table tests for template-file Markdown validators, JSON validators, and caller-defined validators.
  - [x] **Sub-task 6.2:** Add fake-runtime tests for missing output, template mismatch, invalid JSON, JSON shape mismatch, repair success, repair exhaustion, unsupported same-session repair, cancellation, and permission denial.
  - [x] **Sub-task 6.3:** Update README/package docs with template-file Markdown validation, JSON validation, repair usage, and artifact-first guidance.
  - [x] **Sub-task 6.4:** Add accepted decisions to `DECISIONS.md` after implementation evidence exists.

## Testing And Documentation Checklist

- [x] **Unit Tests:** template-file Markdown validators, JSON validators, result aggregation, error categories, prompt builder, permission inheritance, session-action derivation.
- [x] **Fixture Tests:** fake run artifacts, missing files, Markdown section mismatches against a real template file, invalid JSON, JSON shape mismatches, repair prompts, repair attempt event sequences.
- [x] **Integration Tests:** wrapper with OpenCode adapter only if implementation touches adapter request/session behavior; otherwise record explicit deferral.
- [x] **Real Runtime Smoke:** gated and optional for this sprint unless OpenCode repair/session behavior changes; deferred because OpenCode adapter behavior was not changed.
- [x] **Documentation Updates:** README, package docs, and decision log after implementation.

## Risks And Blockers

| Risk | Impact | Mitigation | Status |
| --- | --- | --- | --- |
| Validator API becomes UltraPlan-specific | High | Built-ins are generic; product-specific checks use caller-defined validators | Mitigated |
| Repair prompt includes too much or sensitive output | High | Prompt builder uses safe expected/observed facts and hints; details are capped | Mitigated |
| Same-session repair overclaims OpenCode support | Medium | Default continuation is explicit; unsupported same-session is tested and surfaced | Mitigated |
| Permission denial during repair hides original validation failure | High | Permission denial returns `ErrorPermission`; validation metadata preserves original failures | Mitigated |
| Repair loop can run indefinitely | High | `RepairConfig.MaxAttempts` bounds repair; exhaustion is tested | Closed |

## Open Questions

- Resolved: validation config lives on `ValidatingRuntime` config and may be supplied per request through `RunRequest.Validation`.
- Resolved: Markdown template validation supports heading order and unresolved placeholder detection in Sprint 8; stricter template shells remain future caller pressure.
- Resolved: JSON validation stays minimal with well-formed JSON plus required root fields; no schema library was added.
- Resolved: repair has a safe default prompt builder plus caller override hooks.
- Resolved: `repairing` represents active repair execution.
- Resolved: unsupported same-session repair fails explicitly unless future caller policy adds a fresh-session fallback path.

## Success Criteria

- [x] **Configured validation controls success:** A runtime result with successful process exit fails logically when required validators fail.
- [x] **Validation is a visible run phase:** Callers can observe a run enter and leave `validating` without reconstructing it from metadata.
- [x] **Markdown templates are enforceable:** A caller can validate an artifact against a template file and receive explicit mismatch failures when headings, ordering, or placeholder resolution are wrong.
- [x] **JSON outputs are enforceable:** A caller can require valid JSON and minimal shape or required-field compliance and receive explicit mismatch failures.
- [x] **Validation details are actionable:** Failures include expectation, observed state, safe detail, and repair context.
- [x] **Repair is a visible run phase:** Callers can observe a run enter and leave `repairing` with coherent transitions.
- [x] **Repair is bounded and visible:** Repair attempts emit events, update metadata, stop at max attempts, and return `ErrorRepairExhausted` when appropriate.
- [x] **Same-session repair is the default:** Unless overridden, repair attempts request continuation in the original session and surface unsupported continuity explicitly.
- [x] **Session continuity is explicit:** Repair metadata shows same, fresh, forked, unsupported, or best-effort session relationship from the repair result.
- [x] **Permission posture is preserved:** Repair attempts inherit initialized permission policy and permission denials surface as `ErrorPermission`.
- [x] **Artifact-first behavior is supported:** File/directory/artifact validators operate on durable artifacts and avoid relying on terminal output for large content.

## Study Evaluation

- [x] **Patterns Followed:** typed/classified errors, explicit events/metadata, fake-first tests, injected/testable IO boundary, bounded attempts, artifact-first validation, first-class template-file Markdown and JSON validation.
- [x] **Anti-Patterns Avoided:** process-exit-as-success, adapter-local product validation, unbounded repair, permission broadening, raw large content in events/prompts, ambiguous hidden validation/repair phases.
- [x] **Comparison Needed:** Implementation was compared against validation-repair, session-lifecycle, error-handling, IO-abstraction, and testing-strategy evidence through the sprint checklist and tests.
- [x] **Proceed / Iterate:** Validation failure, repair success, repair exhaustion, permission denial, and unsupported same-session repair have deterministic tests.

## Review And Sign-Off

- Sprint Status: Complete
- Completion Date: 2026-05-20

## Execution Evidence

- 2026-05-20: Sprint 8 reasoning and tracker created from roadmap, PRD/TRD, feature architecture protocol, study index, validation/session/testing/permission evidence, final reports, Sprint 7 artifacts, decision log, and current agentwrap code references.
- 2026-05-20: Scope updated to make Markdown template validation and JSON validation explicit first-class built-ins rather than leaving them implied under generic structured-data validation.
- 2026-05-20: Markdown validation scope clarified with the concrete template/artifact case: validate `go-cli-study/reports/repo/01-project-structure/yq.md` against `ultraplan/templates/repo-analysis.md`.
- 2026-05-20: Implemented Sprint 8 in `/home/antonioborgerees/coding/agentwrap`: added `ValidationSpec`, validation expectations/results, built-in validators, `ValidatingRuntime`, bounded repair, validation/repair metadata, and `validating`/`repairing` statuses.
- 2026-05-20: Added deterministic tests in `validation_test.go` for built-in validators, Markdown template mismatch, invalid JSON, caller-defined validators, missing output logical failure, repair success, repair exhaustion, unsupported same-session repair, cancellation during repair, and permission denial during repair.
- 2026-05-20: Updated `/home/antonioborgerees/coding/agentwrap/README.md`, `/home/antonioborgerees/coding/agentwrap/doc.go`, and `targets/agentwrap/DECISIONS.md` with validation/repair usage and accepted decisions DEC-024 through DEC-026.
- 2026-05-20: Verification passed: `env GOCACHE=/tmp/agentwrap-gocache go test ./...`.
- 2026-05-20: Real OpenCode smoke deferred because Sprint 8 did not change the OpenCode adapter request/session behavior; residual live-runtime same-session confidence remains covered by DEC-011 follow-up.
