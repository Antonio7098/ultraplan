# Sprint Reasoning: Target Brief and Decision Scaffold

> Target: agentwrap
> Sprint ID: 00-target-brief
> Output: `targets/agentwrap/sprints/00-target-brief/reasoning.md`
> Sprint Tracker: `targets/agentwrap/sprints/00-target-brief/plan.md`
> Evidence Bundle: `targets/agentwrap/reports/sprint-evidence/00-target-brief.txt`

## Overview

**Sprint:** Target Brief and Decision Scaffold
**Purpose:** Create the planning surface needed for later implementation sprints without selecting runtime architecture prematurely.
**Roadmap Section:** `targets/agentwrap/roadmap.md` - `## Sprint 0: Target Brief and Decision Scaffold`
**Depends On:** None
**Reasoning Status:** Ready For Tracker

## Target Sources

- `targets/agentwrap/sources/PRD.md` - product goals, non-goals, MVP boundaries, output safety, observability, and open product questions used to constrain the brief and decision log.
- `targets/agentwrap/sources/TRD.md` - technical requirements, system boundary, acceptance criteria, and open technical questions used to define what must be captured but not yet designed.
- `targets/agentwrap/sources/feature-architecture.md` - state-first design protocol used to keep Sprint 0 focused on behavior, state, flow, ownership, and earned abstractions rather than premature architecture.
- `targets/agentwrap/roadmap.md` - Sprint 0 scope, output paths, quality gate, and non-negotiable development rules.

## Evidence Basis

**Evidence Bundle:** `targets/agentwrap/reports/sprint-evidence/00-target-brief.txt`
**Evidence Status:** Complete and used
**Context Strategy:** Staged loading used. The bundle is 40,888 lines and about 430,979 estimated tokens, so the planning pass loaded the required PRD, TRD, feature architecture protocol, roadmap Sprint 0 section, evidence pack sections, relevant final report sections, the highest-value runtime-contract per-source report section, and selected resolved code references where they clarified why decisions must remain deferred.

### Evidence Packs Used

- `targets/agentwrap/reports/evidence/runtime-contract.md` - informs which runtime primitives must be documented as requirements or open questions, not implemented or finalized in Sprint 0.
- `targets/agentwrap/reports/evidence/cli-design.md` - informs the later CLI direction and supports keeping command/runtime behavior outside Sprint 0.
- `targets/agentwrap/reports/evidence/testing-strategy.md` - informs quality gates for later sprints and the need for explicit test evidence expectations in templates and plans.

### Final Reports Used

- `studies/opencode-wrap-study/reports/final/01-runtime-contract-and-api-shape.md` - shows no production-ready Go runtime-agnostic SDK was found, recommends small stable runtime/session/turn/event primitives, and warns against leaking runtime-specific mechanics into the common path.
- `studies/go-cli-study/reports/final/01-project-structure.md` - shows thin CLI boundaries and explicit package ownership are important later, while Sprint 0 should only capture the decision need.
- `studies/go-cli-study/reports/final/02-command-architecture.md` - shows command handlers should be thin and delegate to reusable logic later, but Sprint 0 should not choose a command framework or command tree.
- `studies/go-cli-study/reports/final/11-testing-strategy.md` - shows credible future implementation needs fake runtimes, fixtures, golden/output checks where relevant, and behavior-focused assertions.
- `studies/opencode-wrap-study/reports/final/02-process-session-lifecycle.md` - shows lifecycle state, cancellation, and cleanup are core future requirements, but are later-sprint implementation concerns.
- `studies/opencode-wrap-study/reports/final/04-workflow-composition-and-observability.md` - shows workflow composition and runtime events must remain separate, supporting a Sprint 0 non-scope boundary around DAGs and product workflows.

### Per-Source Reports Used

- `studies/opencode-wrap-study/reports/source/01-runtime-contract-and-api-shape/t3code.md` - highest-scored source report for the runtime-contract pack; used to preserve runtime/session/thread/turn/item concepts as candidate evidence and open questions rather than Sprint 0 decisions.

### Code References Used

- `t3code / packages/contracts/src/providerInstance.ts:18-28` - shows open driver identifiers are treated as registry-discovered availability rather than closed parse-time values; used as evidence to record multi-runtime extensibility as a later decision.
- `opencode / packages/sdk/js/src/gen/types.gen.ts:704-736` - shows OpenCode exposes many structured event variants; used to keep structured event capture in the brief and defer canonical event shape.
- `opencode / packages/opencode/src/session/session.ts:207-227` - shows session metadata can include IDs, directory, model, cost, tokens, timing, and permission; used to record metadata requirements without deciding the SDK record schema.

### Evidence Rejected Or Not Used

- **Most per-source reports in the generated bundle:** Not loaded in full because Sprint 0 creates planning documents and does not implement runtime, CLI, lifecycle, or testing code.
- **Most resolved code references:** Not used for direct planning decisions because code-level implementation detail belongs to later sprints.
- **Configuration, terminal UX, error handling, extensibility final reports beyond pack summaries:** Not opened in detail because Sprint 0 only needs to carry their decision areas forward as future concerns.
- **Direct repository exploration:** Not performed because the generated bundle and target documents were sufficient for Sprint 0 planning.

## Requirement Map

### Requirement Index Used In This Sprint

| Requirement | Source | Area | Applicability | Why It Matters For This Sprint |
| --- | --- | --- | --- | --- |
| Product-agnostic SDK foundation | PRD lines 3-7, 31-36 | Product boundary | Applicable | The brief must state that later work serves multiple products and runtimes, not only UltraPlan or OpenCode. |
| Non-goals exclude UltraPlan workflows and technology choices | PRD lines 38-45 | Scope control | Applicable | Sprint 0 must prevent the brief and decision log from selecting workflow or technology architecture prematurely. |
| Runtime abstraction and session retention | PRD lines 106-112 | Runtime model | Applicable as requirement capture only | The brief must capture runtime-neutral interface and session-retention needs, while leaving the smallest primitive as an open question. |
| Structured events and native payload preservation | PRD lines 113-117 | Event model | Applicable as requirement capture only | The brief must include canonical event expectations without deciding event schema. |
| Health, graceful degradation, validation, observability, cost/time, output safety | PRD lines 119-161 | MVP requirement set | Applicable as requirement capture only | The brief must summarize the full target surface so later sprints do not lose requirements. |
| System boundary excludes product-specific UltraPlan concepts | TRD lines 7-12 | Boundary | Applicable | Sprint 0 must explicitly separate SDK primitives from UltraPlan study/scoring/planning workflows. |
| Core technical requirements for runtime interface through security | TRD lines 15-247 | Technical requirement set | Applicable as requirement capture only | Sprint 0 must index requirements and open questions, not implement them. |
| Open technical questions | TRD lines 249-260 | Decision discipline | Applicable | The brief and decision log must preserve unknowns rather than silently deciding them. |
| Acceptance criteria | TRD lines 262-273 | Quality criteria | Applicable as future evaluation criteria | Sprint 0 must carry acceptance criteria forward into later planning. |
| Feature design protocol phases 0-8 | feature architecture protocol | Design discipline | Applicable | Sprint 0 must set up state-first, runtime-first, earned-abstraction planning rules. |
| Sprint 0 roadmap scope | roadmap lines 110-140 | Sprint scope | Applicable | The plan must include only `brief.md`, `DECISIONS.md`, and template use/verification. |

### Applicable Requirements

- **PRD product goals and MVP scope:** Sprint 0 must produce a brief that captures the SDK's product intent, MVP surface, non-goals, and success criteria so later implementation work starts from shared fundamentals.
- **TRD system boundary and core requirements:** Sprint 0 must preserve the full technical requirement set in a concise planning artifact, especially where later sprints need to make scoped decisions.
- **PRD/TRD open questions:** Sprint 0 must list unresolved product and technical questions instead of making architecture decisions without implementation evidence.
- **Roadmap Sprint 0 scope:** Sprint 0 must create planning documents only; no SDK module, runtime contract, CLI, fake runtime, adapter, health check, or test harness belongs in this sprint.
- **Feature architecture protocol:** Sprint 0 must make later implementation agents answer behavior, triggers, outputs, state ownership, flow, and abstraction justification before coding.

### Non-Applicable Requirements

- **OpenCode runtime execution:** Required for MVP but not implemented or designed in Sprint 0; belongs to later runtime contract and adapter sprints.
- **Health checks and configuration validation:** Required for MVP but not Sprint 0; only captured in the brief and decision log.
- **Retry, fallback, rate limits, validation, repair, retained-session behavior:** Required for MVP but later-sprint scope; Sprint 0 records them and blocks premature implementation.
- **CLI command design:** Evidence informs future direction, but Sprint 0 should not pick command framework, command hierarchy, or package layout.
- **Persistence backend, event schema versioning, cost estimation algorithm, and schema technology:** All remain open because the target documents explicitly avoid technology choices and the evidence does not force a Sprint 0 decision.

### Ambiguous Or Conflicting Requirements

- **Smallest primitive boundary:** PRD and TRD ask whether the smallest caller-facing primitive should be runtime, session, run, turn, task, or workflow. Evidence suggests runtime/session/turn/event concepts are important, but Sprint 0 must not choose the final public contract.
- **Workflow composition in SDK versus UltraPlan:** PRD/TRD ask how much workflow composition belongs in the SDK. Workflow evidence warns that DAG/workflow scheduling should not be pulled into the runtime wrapper too early.
- **Session retention default:** PRD/TRD require retained sessions where supported, but open questions remain about when to continue, reuse, fork, release, replace, or start fresh.
- **Mandatory versus best-effort metadata:** Requirements call for rich metadata, but token/cost availability varies by runtime/provider and must remain an explicit future decision.

### Open Questions

- What is the smallest public primitive: runtime, session, run, turn, task, or workflow?
- Which workflow composition concerns belong in the SDK, and which remain in UltraPlan or other products?
- How should callers describe expected outputs in a runtime-neutral way?
- What metadata is mandatory versus best-effort when runtimes expose incomplete usage or cost data?
- How should canonical event compatibility and native payload preservation be versioned?
- What Go-friendly validation or schema strategy should replace TypeScript/Effect-style schemas, if the implementation uses Go?
- Which session-retention transitions should be defaults, and when is a fresh session safer?

## Sprint Decision Analysis

### Decision Area 1: Planning-Only Sprint Boundary

**Problem:** Sprint 0 must decide how much work to include before any architecture exists.

**Requirements Applied**
- PRD non-goals prohibit building UltraPlan workflows or making technology choices in the target requirements.
- TRD system boundary says the SDK provides primitives and is not responsible for study scoring, PRD/TRD generation, report templates, sprint roadmaps, feature planning, or source discovery.
- Roadmap Sprint 0 scope includes only `brief.md`, `DECISIONS.md`, and use of the shared templates.

**Evidence Applied**
- Runtime-contract evidence pack says to avoid over-abstracting before OpenCode's structured event path is fully understood.
- Runtime contract final report says no production-ready Go runtime-agnostic SDK contract was found, so later architecture must be earned from small stable contracts.
- Workflow/observability final report says runtime primitives, event projection, and product workflow composition are separable and should not be conflated.

**Options Considered**
- **Option A:** Plan only documentation scaffolding and future decision discipline.
- **Option B:** Add a preliminary SDK contract or package layout to Sprint 0.
- **Option C:** Add a CLI skeleton because CLI evidence is present in the bundle.

**Chosen Approach**
- Sprint 0 should only plan creation of a concise target brief, an empty decision log with a reusable decision template, and verification that sprint templates support evidence-grounded planning.

**Decision Justification**
- This satisfies the roadmap exactly and respects PRD/TRD non-goals.
- Option B would silently decide the smallest primitive before Sprint 2's runtime-contract evidence is applied.
- Option C would pull Sprint 1 work forward and risk making project-structure decisions before the skeleton sprint.
- The accepted tradeoff is that Sprint 0 produces no executable code; the benefit is a clear planning surface that lowers risk for all later sprints.

**Execution Notes**
- `brief.md` must distinguish target facts from future design decisions.
- `DECISIONS.md` must start empty except for instructions/template rows; it must not contain decisions about runtime/session/event schema unless they were already made by source requirements.
- Any discovery that `brief.md` needs implementation-specific structure should be recorded as an open question or future decision, not resolved in Sprint 0.

**Expected Evidence**
- **Tests:** Documentation checks only: files exist, placeholders are removed, roadmap scope is represented, and no implementation files are changed.
- **Runtime Evidence:** None; runtime execution is not in scope.
- **Review Checks:** Reviewer can trace each statement in `brief.md` and each decision-template field back to PRD/TRD, roadmap, feature protocol, or study evidence.

---

### Decision Area 2: Brief Content Shape

**Problem:** The brief must be useful for later agents without becoming a premature architecture document.

**Requirements Applied**
- PRD product summary and goals require a reusable SDK for supervising agentic coding runtimes, OpenCode first but extensible later.
- PRD non-goals prohibit putting UltraPlan-specific workflows and technology choices inside the SDK.
- TRD core requirements define runtime interface, lifecycle, structured events, health, config, retry/fallback, validation, repair, permissions, observability, persistence, errors, concurrency, extensibility, and security.
- Feature architecture protocol requires behavior, trigger, outcome, state boundaries, linear flow, and earned abstractions before implementation.

**Evidence Applied**
- Runtime-contract evidence pack says product-facing API should stay runtime-neutral, native payloads should be preserved, and runtime-specific behavior should be capabilities or metadata.
- Runtime contract final report recommends small stable primitives but leaves several contract details open.
- Workflow/observability final report warns not to implement DAG scheduling or dashboards inside the runtime wrapper.

**Options Considered**
- **Option A:** A concise target brief organized around intent, users, goals, non-goals, MVP requirements, system boundary, open questions, and sprint guardrails.
- **Option B:** A detailed architecture brief with proposed package/module/API layout.
- **Option C:** A PRD/TRD copy-paste summary with minimal synthesis.

**Chosen Approach**
- `brief.md` should be a concise synthesized target brief that captures requirements and guardrails, includes a requirement/open-question index, and explicitly labels unresolved decisions.

**Decision Justification**
- Option A gives later agents the context they need without requiring every study report or duplicating the PRD/TRD.
- Option B violates the Sprint 0 goal of not making architecture decisions prematurely.
- Option C would satisfy file creation but not the roadmap quality gate that new sprints can be planned without rereading all study reports.
- The accepted tradeoff is that the brief may repeat high-level requirements already present in PRD/TRD; this is useful because it creates a compact planning entry point.

**Execution Notes**
- The brief should use source-labeled sections rather than unsourced claims.
- The brief should include explicit non-scope for workflow/DAG/dashboard/product-specific UltraPlan logic.
- The brief should carry open questions forward rather than resolving them.

**Expected Evidence**
- **Tests:** Documentation review verifies that all major PRD/TRD areas are represented and all ambiguous items are marked open.
- **Runtime Evidence:** None.
- **Review Checks:** Reviewer can plan Sprint 1 or Sprint 2 from the brief plus roadmap section without rereading every source report.

---

### Decision Area 3: Decision Log Shape

**Problem:** Later sprints need a durable way to record architecture decisions, but Sprint 0 must not populate it with speculative decisions.

**Requirements Applied**
- Planning rules require every major decision to capture decision, requirement, evidence, tradeoff, rejected alternative, and risk/follow-up.
- PRD/TRD open questions must remain visible.
- Roadmap non-negotiable rules require explicit state, explicit errors, explicit lifecycle, and earned abstractions.

**Evidence Applied**
- Runtime-contract final report has several decision guides, but many apply to future implementation sprints, not Sprint 0.
- Project-structure and command-architecture final reports show architecture choices have tradeoffs and should be documented rather than implied.
- Testing-strategy final report shows behavior evidence and quality gates must be attached to implementation decisions.

**Options Considered**
- **Option A:** Create an empty `DECISIONS.md` with a lightweight decision template and an index of known open decisions.
- **Option B:** Pre-fill `DECISIONS.md` with recommended future architecture choices from study reports.
- **Option C:** Skip decision logging until the first code sprint.

**Chosen Approach**
- `DECISIONS.md` should include a short policy, a decision entry template, and an open-decision backlog seeded from PRD/TRD/evidence questions, but no accepted implementation decisions.

**Decision Justification**
- Option A satisfies decision discipline and roadmap output while avoiding ungrounded architecture decisions.
- Option B would turn study recommendations into decisions before sprint-specific implementation evidence is applied.
- Option C would lose the decision trail before foundational choices begin in Sprint 1 and Sprint 2.
- The accepted tradeoff is that the decision log starts mostly empty; this is intentional and auditable.

**Execution Notes**
- The template must require requirement source, evidence source, tradeoff, rejected alternatives, risk/follow-up, and status.
- Open questions should be listed separately from accepted decisions.
- Later implementation agents should update the decision log only when a sprint actually decides something.

**Expected Evidence**
- **Tests:** Documentation review verifies that `DECISIONS.md` has a reusable template and no speculative accepted decisions.
- **Runtime Evidence:** None.
- **Review Checks:** Reviewer can identify which questions are still undecided before Sprint 1 and Sprint 2.

---

### Decision Area 4: Template and Quality-Gate Use

**Problem:** Sprint plans must remain evidence-grounded across later implementation work.

**Requirements Applied**
- Roadmap non-negotiable rules require every sprint to start from PRD/TRD requirements, generate/use the matching `study evolve` bundle, cite evidence packs, and end with evaluation.
- Planning rules require requirement mapping, evidence mapping, tradeoffs, alternatives, anti-patterns, risks, quality gates, and evaluation criteria.

**Evidence Applied**
- Testing-strategy evidence pack says each sprint should evaluate implementation against the same study dimensions used for reference repos.
- Testing final report says behavior-focused assertions, fake runtimes, fixtures, golden checks, and integration gates are the credible future testing evidence.
- CLI evidence pack says command behavior must stay testable with fake runtimes and fixtures.

**Options Considered**
- **Option A:** Verify and use the existing sprint reasoning and sprint plan templates, updating them only if they fail Sprint 0 quality needs.
- **Option B:** Rewrite templates specifically for `agentwrap`.
- **Option C:** Let each later sprint invent its own plan format.

**Chosen Approach**
- Sprint 0 should use the existing shared templates and plan a verification pass that checks they force evidence, requirements, decisions, risks, and evaluation. It should avoid target-specific template rewrites unless a concrete gap is found.

**Decision Justification**
- Option A respects the roadmap's shared-template intent and avoids unnecessary template churn.
- Option B would create target-specific process divergence without evidence.
- Option C would undermine auditability across sprints.
- The accepted tradeoff is that shared templates may be slightly verbose for small sprints; the consistency is worth it for evidence-grounded implementation.

**Execution Notes**
- Template verification should check that later plans cite the generated evidence bundle and carry open questions/risks forward.
- Sprint 0 should not add implementation test commands to templates; it should describe documentation-quality checks for this sprint and leave code test commands to later sprints.

**Expected Evidence**
- **Tests:** Documentation review verifies that `reasoning.md` and `plan.md` have no unused placeholders and include evidence links, requirement maps, decisions, quality gates, and evaluation criteria.
- **Runtime Evidence:** None.
- **Review Checks:** Reviewer can use the templates to plan Sprint 1 without reopening all study reports.

## Deviations

| Requirement | Deviation | Reason | Risk | Disposition | Follow-up |
| --- | --- | --- | --- | --- | --- |
| None | None | Sprint 0 follows roadmap scope | None | Not applicable | Not applicable |

## Cross-Cutting Reasoning

### Major Decision Summary

- **Keep Sprint 0 documentation-only:** Satisfies roadmap Sprint 0 and PRD/TRD non-goals; evidence warns against premature abstraction.
- **Make `brief.md` a synthesized requirement and guardrail document:** Satisfies the roadmap quality gate that later sprints can plan without rereading every study report.
- **Create an empty-but-structured `DECISIONS.md`:** Satisfies decision discipline while preserving open questions for later evidence-grounded decisions.
- **Use shared templates and verify them rather than inventing new process:** Satisfies roadmap process requirements and testing-strategy evidence for consistent quality gates.

### Tradeoffs

- Sprint 0 produces no executable code, accepted because the roadmap deliberately starts with planning scaffold before structure and test harness.
- The brief duplicates selected PRD/TRD content, accepted because later implementation agents need a concise planning entry point.
- The decision log starts without accepted architecture decisions, accepted because unresolved questions must remain explicit until sprint evidence justifies decisions.
- Full evidence bundle was not loaded, accepted because the bundle is too large and Sprint 0 decisions did not require most per-source or code-level detail.

### Assumptions

- The existing generated evidence bundle is current enough for Sprint 0 because it matches the roadmap command and includes the required three evidence packs.
- The shared templates are intended to remain target-neutral unless a concrete gap is discovered during Sprint 0 execution.
- `brief.md` and `DECISIONS.md` do not yet exist, so Sprint 0 implementation will create them from scratch.
- Sprint 0 implementation agents will not modify SDK code, generate a module, or run runtime smoke tests.

### Dependencies

- `targets/agentwrap/reports/sprint-evidence/00-target-brief.txt`: Must remain available as the evidence source of truth for Sprint 0.
- `templates/sprint-reasoning.md` and `templates/sprint-plan.md`: Must remain available as the shared planning formats.
- Later Sprint 1 and Sprint 2 plans: Depend on Sprint 0 brief and decision scaffold being accurate and non-speculative.

### Risks

- **Brief becomes architecture by stealth:** Mitigate by labeling unresolved design choices as open questions and refusing package/API/schema decisions in Sprint 0.
- **Decision log gets pre-filled with study recommendations as accepted decisions:** Mitigate by separating open-decision backlog from accepted decisions.
- **Future agents skip evidence loading because the brief exists:** Mitigate by stating that the brief is a planning entry point, not a substitute for sprint-specific evidence bundles.
- **Templates are too generic for implementation agents:** Mitigate by verifying that this plan carries concrete tasks, quality gates, and evidence expectations.

## Tracker Guidance

Use this reasoning to write `targets/agentwrap/sprints/00-target-brief/plan.md`.

The tracker must include:

- scope limited to `brief.md`, `DECISIONS.md`, and shared-template verification
- non-scope blocking SDK code, module layout, CLI skeleton, runtime contract, OpenCode adapter, test harness, and workflow/DAG implementation
- execution tasks derived from the four decision areas above
- documentation quality checks instead of runtime tests
- risks, assumptions, and open questions carried forward
- success criteria proving a later sprint can be planned from the brief, decision scaffold, roadmap, and evidence bundle

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

- `targets/agentwrap/brief.md`: Must be created in Sprint 0 so later implementation agents have a concise target entry point.
- `targets/agentwrap/DECISIONS.md`: Must be created in Sprint 0 so later implementation decisions are recorded with requirement and evidence traceability.
- `templates/sprint-reasoning.md`: Must be verified for continued suitability; update only if Sprint 0 execution finds a concrete gap.
- `templates/sprint-plan.md`: Must be verified for continued suitability; update only if Sprint 0 execution finds a concrete gap.
