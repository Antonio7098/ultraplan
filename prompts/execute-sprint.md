# Sprint Execution - Plan-Driven Implementation

Use this prompt to execute one approved UltraPlan sprint plan.

The goal is implementation, verification, and evidence capture. Do not redesign the sprint unless the plan is blocked, contradicted by the codebase, or missing a decision required for safe implementation.

## Required Inputs

Load these files first:

1. Sprint plan: `targets/{target}/sprints/{sprint-slug}/plan.md`
2. Sprint reasoning: `targets/{target}/sprints/{sprint-slug}/reasoning.md`
3. Target PRD: `targets/{target}/sources/PRD.md`
4. Target TRD: `targets/{target}/sources/TRD.md`
5. Target roadmap: `targets/{target}/roadmap.md`
6. Sprint evidence bundle listed in the sprint plan.
7. Target feature architecture protocol, if present: `targets/{target}/sources/feature-architecture.md`

Load additional evidence only when the sprint plan cites it or when implementation reveals a concrete gap.

## Execution Rules

- Follow the sprint plan before inventing new work.
- Use the sprint reasoning document to understand why the plan made its design choices.
- Keep work inside the sprint scope.
- Do not pull non-scope or later-sprint behavior into the implementation.
- If the plan is wrong, incomplete, or unsafe, pause implementation long enough to update the plan with the reason.
- Prefer small, reviewable edits that match the existing codebase.
- Preserve product-specific boundaries called out in the PRD, TRD, and roadmap.
- Do not silently skip checklist items, tests, risks, or quality gates.
- Record explicit deferrals with reason, impact, and follow-up.

## Evidence And Context

Use the sprint evidence bundle as supporting context, not as a script. During implementation:

1. Recheck the relevant sprint plan decision before making a design choice.
2. Reopen cited evidence only when needed.
3. Explore source reports or repository code directly only for a concrete implementation question.
4. Cite any extra evidence added during execution in the sprint plan's `Execution Evidence` section.

If the generated evidence bundle does not fit into context, use the same staged loading rule as planning:

1. Keep the sprint plan, PRD/TRD requirements, and roadmap sprint section in context.
2. Load evidence sections tied to the current task.
3. Load final reports, per-source reports, and code references only as needed.
4. Record omitted context when it affects confidence or risk.

## Implementation Workflow

1. Read the sprint plan and identify the first incomplete task.
2. Inspect the existing codebase before editing.
3. Implement one coherent task or sub-task at a time.
4. Run the smallest useful verification after each meaningful change.
5. Update the sprint plan checklist and `Execution Evidence` as work progresses.
6. Repeat until the sprint is complete or blocked.
7. Run the sprint's full verification set before marking it complete.
8. Evaluate the completed work against the sprint's study-backed success criteria.

## Updating The Sprint Plan

Keep `targets/{target}/sprints/{sprint-slug}/plan.md` current during execution.

Update:

- `Status`
- task and sub-task checkboxes
- testing and documentation checklist
- risks and blockers
- open questions
- success criteria
- study evaluation
- review and sign-off
- execution evidence

Do not mark a task complete until implementation and its relevant verification are complete.

## Handling Blockers

If blocked:

1. Stop the affected task.
2. Record the blocker in `Risks And Blockers`.
3. Record what was tried in `Execution Evidence`.
4. Identify the smallest needed decision, evidence, dependency, or scope change.
5. Continue with another independent task only if it does not depend on the blocked decision.

If the blocker changes sprint scope, update `Scope`, `Non-Scope`, `Risks And Blockers`, and `Success Criteria` before continuing.

## Verification Rules

Run the tests and checks named in the sprint plan. If a named check cannot run:

- record the command or check that could not run
- record why it could not run
- record the residual risk
- add a follow-up or blocker if the risk is material

Verification should cover:

- deterministic unit tests for new logic
- fixture/golden tests for structured inputs and outputs
- failure-mode tests for explicit error paths
- integration or smoke tests for real runtime paths when the sprint touches them
- documentation or plan updates affected by the implementation

## Completion Rules

Before marking the sprint complete:

1. All in-scope checklist items are complete or explicitly deferred.
2. Required tests and checks have passed or have explicit justified deferrals.
3. Risks are closed, mitigated, or carried forward with owner/context.
4. Success criteria are satisfied or revised with a documented reason.
5. `Execution Evidence` includes the important commands, tests, decisions, deferrals, and review-ready notes.
6. `Study Evaluation` explains whether the implementation followed the intended patterns and avoided the named anti-patterns.
7. `Review And Sign-Off` has an accurate sprint status and completion date if complete.

## Final Response

When execution is done or blocked, report:

- implementation summary
- files changed
- tests/checks run
- sprint plan updates made
- remaining blockers, risks, or deferrals

Keep the response concise. The sprint plan is the durable record.
