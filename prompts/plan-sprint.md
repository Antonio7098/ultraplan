# Sprint Planning - Evidence-Grounded Implementation Plan

Use this prompt to plan one implementation sprint for an UltraPlan target.

The outputs are a sprint reasoning document and then a sprint tracker plan. Do not implement code. Do not make ungrounded architecture decisions. Every important decision must trace to target requirements, roadmap scope, evolved study evidence, or an explicitly named open question.

## Required Inputs

Load these files first:

1. Target PRD: `targets/{target}/sources/PRD.md`
2. Target TRD: `targets/{target}/sources/TRD.md`
3. Target feature architecture protocol, if present: `targets/{target}/sources/feature-architecture.md`
4. Target decision log: `targets/{target}/DECISIONS.md`
5. Target roadmap: `targets/{target}/roadmap.md`
6. The roadmap section for the selected sprint.
7. Target study-index: `targets/{target}/reports/study-index.md`
8. The evidence packs referenced by the study-index for the sprint area.
9. Sprint reasoning template: `templates/sprint-reasoning.md`
10. Sprint plan template: `templates/sprint-plan.md`

## Evidence Loading Order

Use this order so the plan stays grounded and fits into context:

1. Read the PRD and TRD sections relevant to the sprint.
2. Read the selected sprint section in the roadmap.
3. Read the study-index to identify which evidence packs apply.
4. Read the relevant evidence packs — each is a small (~40 line) compressed guidance document.
5. When a sprint decision needs deeper evidence, open the linked `Final Report:` from the study-index or evidence pack.
6. When a final report references per-source analysis or code snippets, open only those that inform a concrete decision.
7. Resolve code references or inspect repository code only where implementation detail matters.

The evidence pack is a selector, not the full context. Do not pre-load every final report or per-source analysis. Read the pack, identify what you need, and open linked reports one at a time based on the sprint's decision needs.

## If Context Is Too Large

If the full set of reports does not fit into context:

1. Keep the PRD, TRD, feature architecture protocol, and roadmap sprint section in context.
2. Load only the evidence pack sections — never pre-load all final reports.
3. Add final report sections one at a time based on the sprint's decision needs.
4. Open per-source reports only when final-report evidence is insufficient for a specific decision.
5. Add code references only for specific implementation questions.
6. Record omitted evidence and the reason it was omitted in the sprint reasoning. Carry forward any material risk into the sprint tracker.

You may inspect more source reports or repository code directly when the evidence packs and final reports do not answer a decision. Keep this exploration narrow, cite it, and tie it to a concrete requirement, tradeoff, risk, or open question.

## Planning Rules

- Start from fundamentals. Do not pull later-sprint workflow complexity into an earlier sprint.
- Respect the roadmap scope. If evidence suggests a scope change, record it as a recommendation or open question instead of silently expanding the sprint.
- Separate requirements from design decisions.
- Write sprint reasoning before writing the sprint tracker.
- Use the reasoning document to justify design choices, tradeoffs, alternatives, expected evidence, and non-scope.
- Prefer small, testable increments over broad abstractions.
- Record tradeoffs, rejected alternatives, and anti-patterns.
- Treat missing evidence as a planning risk, not as permission to guess.
- The sprint must end with explicit quality gates and evaluation criteria.
- Do not implement code while planning.

## Decision Discipline

For every major decision, capture:

- Decision made.
- Requirement it satisfies.
- Evidence used.
- Tradeoff accepted.
- Alternative rejected.
- Risk or follow-up.

If the evidence is insufficient, write an open question instead of making the decision.

## Sprint Reasoning Output

Write the sprint reasoning to:

`targets/{target}/sprints/{sprint-slug}/reasoning.md`

Use `templates/sprint-reasoning.md` as the output format. Fill every section. Remove unused placeholder rows or decision areas only when they do not apply.

The reasoning document must be completed before writing the sprint tracker. It should explain why the sprint should take the planned shape, not just restate the roadmap.

## Sprint Tracker Output

Write the sprint plan to:

`targets/{target}/sprints/{sprint-slug}/plan.md`

Use `templates/sprint-plan.md` as the output format. Fill every section. Remove unused placeholder rows or tasks only when they do not apply.

The sprint tracker must cite `targets/{target}/sprints/{sprint-slug}/reasoning.md` and carry forward its decisions, expected evidence, risks, assumptions, and open questions.

## Quality Bar

A good sprint plan is specific enough that an implementation agent can execute it without rereading every study report, but evidence-grounded enough that the decisions can be audited later.

Avoid generic phrases such as "clean architecture", "robust error handling", or "flexible design" unless the plan names the concrete mechanism and cites the evidence behind it.
