# Sprint Tracker: Target Brief and Decision Scaffold

> Target: agentwrap
> Sprint ID: 00-target-brief
> Created: 2026-05-18
> Reasoning: `targets/agentwrap/sprints/00-target-brief/reasoning.md`
> Roadmap Section: `targets/agentwrap/roadmap.md` - `## Sprint 0: Target Brief and Decision Scaffold`
> Evidence Bundle: `targets/agentwrap/reports/sprint-evidence/00-target-brief.txt`

## Sprint Overview

- **Sprint Name:** Target Brief and Decision Scaffold
- **Sprint Focus:** Create documentation scaffolding that lets later implementation sprints start from a concise target brief, an auditable decision log, and shared evidence-grounded planning templates.
- **Depends On:** None
- **Status:** Completed

## Requirement Links

- `targets/agentwrap/sources/PRD.md` - product summary, goals, MVP scope, non-goals, success metrics, and open product questions summarized in the target brief.
- `targets/agentwrap/sources/TRD.md` - system boundary, core technical requirements, acceptance criteria, and open technical questions summarized and carried forward.
- `targets/agentwrap/sources/feature-architecture.md` - state-first planning protocol used as a guardrail for later design decisions.
- `targets/agentwrap/roadmap.md` - Sprint 0 scope, outputs, and quality gate.
- `targets/agentwrap/sprints/00-target-brief/reasoning.md` - decision basis this tracker executes.

## Evidence Links

- `targets/agentwrap/reports/sprint-evidence/00-target-brief.txt` - generated `study evolve --top-sources 1` bundle used for planning.
- `targets/agentwrap/reports/evidence/runtime-contract.md` - supports deferring runtime/session/turn/event contract decisions while capturing them as future decision areas.
- `targets/agentwrap/reports/evidence/cli-design.md` - supports keeping CLI implementation out of Sprint 0 while retaining later thin-CLI guardrails.
- `targets/agentwrap/reports/evidence/testing-strategy.md` - supports explicit quality gates, fake-runtime/fixture expectations for later sprints, and documentation checks for this sprint.
- `studies/opencode-wrap-study/reports/final/01-runtime-contract-and-api-shape.md` - supports avoiding premature API decisions and preserving unresolved runtime-contract questions.
- `studies/go-cli-study/reports/final/01-project-structure.md` and `studies/go-cli-study/reports/final/02-command-architecture.md` - support later CLI/package boundary concerns without deciding Sprint 0 implementation structure.
- `studies/go-cli-study/reports/final/11-testing-strategy.md` - supports behavior-focused future testing expectations and the Sprint 0 documentation review checks.
- `studies/opencode-wrap-study/reports/final/04-workflow-composition-and-observability.md` - supports keeping SDK runtime primitives separate from UltraPlan workflow/DAG concerns.

## Sprint Goals

- **Primary Goal:** Create `targets/agentwrap/brief.md` and `targets/agentwrap/DECISIONS.md` so future sprints have a concise target entry point and a disciplined decision record.
- **Secondary Goals:**
  - Verify that `templates/sprint-reasoning.md` and `templates/sprint-plan.md` force requirement mapping, evidence mapping, decisions, tradeoffs, risks, quality gates, and evaluation.
  - Carry PRD/TRD open questions into the brief and decision backlog without resolving them prematurely.
  - Record Sprint 0 non-scope so implementation agents do not pull runtime contract, CLI skeleton, or workflow complexity into this sprint.

## Scope

- Create `targets/agentwrap/brief.md` as a concise synthesis of target intent, users, goals, non-goals, MVP requirement areas, system boundary, feature-architecture guardrails, open questions, and later-sprint reminders.
- Create `targets/agentwrap/DECISIONS.md` with a lightweight decision policy, decision entry template, accepted-decision section, and open-decision backlog seeded from PRD/TRD/evidence questions.
- Verify the shared sprint templates are usable for later evidence-grounded sprint plans; update only if a concrete template gap is found.
- Ensure the sprint outputs cite the PRD, TRD, feature architecture protocol, roadmap, reasoning document, and generated evidence bundle.

## Non-Scope

- Do not create or modify SDK implementation code.
- Do not create a Go module, package layout, CLI skeleton, fake runtime, fixtures, or tests.
- Do not define the public runtime/session/run/turn/event API.
- Do not choose event schema versioning, persistence backend, configuration format, command framework, or validation/schema technology.
- Do not implement OpenCode adapter behavior, health checks, cancellation, retry/fallback, validation/repair, observability, persistence, or workflow/DAG logic.
- Do not turn study recommendations into accepted architecture decisions unless the roadmap or target requirements already require them.

## Proposed Implementation Shape

- **Package / Module Boundaries:** Documentation only. Create or update target-level markdown files; no code package/module boundary is introduced.
- **Public Surface:** `brief.md` becomes the target planning entry point. `DECISIONS.md` becomes the decision record and open-decision backlog.
- **State And Lifecycle:** No runtime state is introduced. The only tracked state is documentation status: target facts, open questions, accepted decisions, superseded decisions, and follow-ups.
- **Error And Failure Behavior:** No runtime errors are implemented. Documentation must distinguish accepted facts from open questions and must not hide insufficient evidence as a decision.
- **Observability:** The docs must preserve future observability requirements: canonical events, native payload preservation, metadata, artifact references, and historical inspection.
- **Testing Surface:** Documentation review only: file existence, placeholder removal, source/evidence citations, non-scope enforcement, and open-question carry-forward.

## Decisions

- [x] **Decision 1: Keep Sprint 0 Documentation-Only**
  > **Requirement:** Roadmap Sprint 0 scope and PRD/TRD non-goals.
  > **Evidence:** `targets/agentwrap/sprints/00-target-brief/reasoning.md` Decision Area 1; runtime-contract evidence warns against premature abstraction.
  > **Tradeoff:** No executable progress in Sprint 0.
  > **Rejected Alternative:** Add SDK contract, module layout, or CLI skeleton now; rejected because those are later sprint scopes.
  > **Risk / Follow-up:** Future agents may see Sprint 0 as too light; mitigate by making `brief.md` and `DECISIONS.md` directly useful for Sprint 1 and Sprint 2.

- [x] **Decision 2: Make The Brief A Requirement And Guardrail Synthesis**
  > **Requirement:** Later sprints must start from PRD/TRD requirements and avoid product-specific SDK scope creep.
  > **Evidence:** `targets/agentwrap/sprints/00-target-brief/reasoning.md` Decision Area 2; PRD/TRD requirement maps.
  > **Tradeoff:** Some PRD/TRD content is intentionally repeated in concise form.
  > **Rejected Alternative:** Write an architecture brief; rejected because Sprint 0 must not choose the public contract or implementation structure.
  > **Risk / Follow-up:** Brief may become stale; later sprints should update it only when target requirements or accepted decisions change.

- [x] **Decision 3: Start DECISIONS.md Empty But Structured**
  > **Requirement:** Every major future decision must record requirement, evidence, tradeoff, rejected alternative, and risk/follow-up.
  > **Evidence:** `targets/agentwrap/sprints/00-target-brief/reasoning.md` Decision Area 3; planning prompt decision discipline.
  > **Tradeoff:** Study recommendations remain open questions until their sprint makes a decision.
  > **Rejected Alternative:** Pre-fill architecture decisions from study reports; rejected as premature.
  > **Risk / Follow-up:** Decision backlog can grow; later sprints should close or update entries when evidence is sufficient.

- [x] **Decision 4: Verify Shared Templates Instead Of Forking Them**
  > **Requirement:** Roadmap says to use shared sprint-reasoning and sprint-plan templates that force requirement/evidence mapping and evaluation.
  > **Evidence:** `targets/agentwrap/sprints/00-target-brief/reasoning.md` Decision Area 4; testing-strategy evidence emphasizes quality gates and behavior-focused evidence.
  > **Tradeoff:** Shared templates may be verbose for small sprints.
  > **Rejected Alternative:** Create target-specific templates; rejected because no concrete gap requires process divergence.
  > **Risk / Follow-up:** If implementation agents find a real template gap, record it and update shared templates with evidence.

## Execution Checklist

- [x] **Task 1: Create Target Brief**
  > *Description: Write `targets/agentwrap/brief.md` as a concise, source-grounded planning entry point.*
  - [x] **Sub-task 1.1:** Summarize target intent, users, product goals, MVP surface, non-goals, and success metrics from the PRD.
  - [x] **Sub-task 1.2:** Summarize technical boundary, requirement areas, acceptance criteria, and open technical questions from the TRD.
  - [x] **Sub-task 1.3:** Add feature-architecture guardrails: behavior first, state boundaries, linear flow, runtime versus logic versus infra, and earned abstractions.
  - [x] **Sub-task 1.4:** Add Sprint 0 and later-sprint guardrails: no workflow complexity before runtime primitives are testable, no product-specific UltraPlan logic in the SDK, and no architecture decisions without evidence.

- [x] **Task 2: Create Decision Log Scaffold**
  > *Description: Write `targets/agentwrap/DECISIONS.md` so future decisions are auditable and open questions remain visible.*
  - [x] **Sub-task 2.1:** Add a decision policy requiring requirement source, evidence source, tradeoff, rejected alternative, risk/follow-up, status, and date.
  - [x] **Sub-task 2.2:** Add an accepted-decisions section with no speculative accepted architecture decisions.
  - [x] **Sub-task 2.3:** Add an open-decision backlog seeded from PRD/TRD/evidence questions: primitive boundary, workflow composition, event compatibility, schema/validation strategy, metadata requirements, session retention, output expectations, and repair behavior.

- [x] **Task 3: Verify Shared Sprint Templates**
  > *Description: Confirm the shared planning templates support future evidence-grounded sprint execution.*
  - [x] **Sub-task 3.1:** Check `templates/sprint-reasoning.md` requires source links, evidence basis, requirement map, decision analysis, tradeoffs, assumptions, risks, and phase exit criteria.
  - [x] **Sub-task 3.2:** Check `templates/sprint-plan.md` requires reasoning citation, evidence links, decisions, execution checklist, testing/documentation checklist, risks, open questions, success criteria, study evaluation, and execution evidence.
  - [x] **Sub-task 3.3:** Update templates only if a concrete missing requirement is found; otherwise record that no template change was needed.

- [x] **Task 4: Documentation Quality Review**
  > *Description: Verify Sprint 0 outputs are complete, source-grounded, and do not include implementation work.*
  - [x] **Sub-task 4.1:** Confirm `brief.md`, `DECISIONS.md`, `reasoning.md`, and `plan.md` exist and cite required sources.
  - [x] **Sub-task 4.2:** Confirm no unresolved placeholders remain in Sprint 0 documents.
  - [x] **Sub-task 4.3:** Confirm no SDK code, module skeleton, runtime contract, CLI code, test harness, or fixtures were added.
  - [x] **Sub-task 4.4:** Confirm open questions are visible and not silently resolved.

## Testing And Documentation Checklist

- [x] **Unit Tests:** Not applicable in Sprint 0 because no code is implemented; explicitly deferred with no residual code risk.
- [x] **Fixture Tests:** Not applicable in Sprint 0; fake runtime and structured event fixtures begin in later implementation sprints.
- [x] **Integration Tests:** Not applicable in Sprint 0; no runtime, CLI, or process behavior is added.
- [x] **Real Runtime Smoke:** Explicitly deferred because Sprint 0 does not launch or wrap OpenCode.
- [x] **Documentation Updates:** Created `brief.md` and `DECISIONS.md`; verified shared templates and found no concrete gap requiring template edits.

## Risks And Blockers

| Risk | Impact | Mitigation | Status |
| --- | --- | --- | --- |
| Brief includes premature architecture choices | High | Label candidate designs as open questions unless already required by PRD/TRD/roadmap | Closed |
| Decision log records study recommendations as accepted decisions | High | Keep accepted decisions empty except future evidence-backed entries; use open-decision backlog | Closed |
| Future sprints treat brief as a replacement for evidence bundles | Medium | State that the brief is a planning entry point and each sprint still uses its generated evidence bundle | Mitigated |
| Template verification turns into broad process rewrite | Medium | Update templates only if a concrete Sprint 0 gap is found | Closed |
| Missing evidence from omitted per-source reports hides a Sprint 0 issue | Low | Sprint 0 is documentation-only; carry omitted-evidence risk forward and reopen source reports if a concrete decision requires them | Mitigated |

## Open Questions

- What is the smallest public SDK primitive: runtime, session, run, turn, task, or workflow? - Needs Sprint 2 runtime-contract evidence and implementation pressure.
- Which workflow composition concerns belong in the SDK versus UltraPlan? - Needs Sprint 2/Sprint 11 boundary validation and workflow evidence.
- How should callers describe expected outputs in a runtime-neutral way? - Needs Sprint 7 validation/repair design evidence.
- What metadata is mandatory versus best-effort? - Needs Sprint 8 observability/metadata evidence and OpenCode adapter reality.
- How should canonical event compatibility and native payload preservation be versioned? - Needs Sprint 2/Sprint 3 event-contract decisions.
- What Go-friendly validation/schema strategy should be used if implementation is Go? - Needs Sprint 1/Sprint 2 technical decision, not Sprint 0.
- Which retained-session transitions should default to same session versus fresh session? - Needs Sprint 4/Sprint 7 lifecycle and repair evidence.

## Success Criteria

- [x] **Success Criteria 1:** `targets/agentwrap/brief.md` exists and concisely summarizes PRD/TRD intent, scope, non-goals, technical requirement areas, acceptance criteria, guardrails, and open questions.
- [x] **Success Criteria 2:** `targets/agentwrap/DECISIONS.md` exists with a reusable decision template, accepted-decision area, and open-decision backlog, without speculative accepted implementation decisions.
- [x] **Success Criteria 3:** Sprint 0 documents cite `targets/agentwrap/reports/sprint-evidence/00-target-brief.txt` and the relevant PRD/TRD/roadmap/template sources.
- [x] **Success Criteria 4:** No implementation code, module skeleton, CLI command, runtime adapter, fake runtime, fixture, or runtime test is added in Sprint 0.
- [x] **Success Criteria 5:** A future Sprint 1 planner can use the brief, decision log, roadmap, and evidence bundle without rereading every study report.

## Study Evaluation

- [x] **Patterns Followed:** Evidence-grounded planning, thin future CLI boundary as a guardrail, explicit decision records, explicit open questions, behavior-focused future quality gates.
- [x] **Anti-Patterns Avoided:** Premature runtime abstraction, generated SDK shape as public contract, closed runtime assumptions, product-specific UltraPlan logic in SDK scope, untested architecture by assertion.
- [x] **Comparison Needed:** Reviewed completed `brief.md` and `DECISIONS.md` against the PRD/TRD requirement map and the evidence pack guidance loaded in the reasoning document.
- [x] **Proceed / Iterate:** Sprint 0 outputs are complete, placeholder-free, source-grounded, and do not contain unresolved foundational defects or premature accepted decisions; proceed to Sprint 1 planning when ready.

## Review And Sign-Off

- Sprint Status: Completed
- Completion Date: 2026-05-18

## Execution Evidence

- Generated evidence bundle already exists: `targets/agentwrap/reports/sprint-evidence/00-target-brief.txt`.
- Sprint reasoning completed before tracker: `targets/agentwrap/sprints/00-target-brief/reasoning.md`.
- Created `targets/agentwrap/brief.md` as the concise target planning entry point, citing PRD, TRD, feature architecture protocol, roadmap, Sprint 0 reasoning, and Sprint 0 evidence bundle.
- Created `targets/agentwrap/DECISIONS.md` with a decision policy, reusable entry template, empty accepted-decision section, and open-decision backlog.
- Verified `templates/sprint-reasoning.md` includes target sources, evidence basis, requirement map, decision analysis, tradeoffs, assumptions, risks, evidence review checklist, and phase exit criteria. No template edit needed.
- Verified `templates/sprint-plan.md` includes reasoning citation, evidence links, decisions, execution checklist, testing/documentation checklist, risks, open questions, success criteria, study evaluation, review sign-off, and execution evidence. No template edit needed.
- Documentation review command: `rg -n "\[[^]]+\]|TODO|TBD|Insert|placeholder|\[target|\[Sprint|\[Name|Not completed|Not Started" targets/agentwrap/brief.md targets/agentwrap/DECISIONS.md targets/agentwrap/sprints/00-target-brief/plan.md`. Initial hit found only planned tracker checkboxes/status and the decision-log template placeholders; template placeholders were replaced with descriptive fields before final review.
- Scope review command: `find targets/agentwrap -maxdepth 2 -type f | sort`. Sprint 0 added only target-level markdown docs; no SDK code, module skeleton, CLI code, tests, harness, or fixtures were added by this sprint.
- Git review command: `git status --short`. Existing unrelated modified files and untracked sprint/evidence files were present before final review; Sprint 0 implementation touched only `targets/agentwrap/brief.md`, `targets/agentwrap/DECISIONS.md`, and this tracker.
- Explicit test deferrals: unit, fixture, integration, and real runtime smoke tests are not applicable because Sprint 0 is documentation-only and does not launch or wrap OpenCode.
