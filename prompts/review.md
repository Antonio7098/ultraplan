# Sprint Review - Evidence-Grounded Implementation Review

Use this prompt to review code implemented in a sprint against the study evidence that informed it.

The goal is verification, not re-planning. Check whether the implementation matches the sprint's decisions, follows the study-backed patterns, avoids the named anti-patterns, and meets the quality gates. Do not redesign or expand scope.

## Required Inputs

Load these files first:

1. Sprint plan: `targets/{target}/sprints/{sprint-slug}/plan.md`
2. Sprint reasoning: `targets/{target}/sprints/{sprint-slug}/reasoning.md`
3. Target PRD: `targets/{target}/sources/PRD.md`
4. Target TRD: `targets/{target}/sources/TRD.md`
5. Target decision log: `targets/{target}/DECISIONS.md`
6. Target roadmap: `targets/{target}/roadmap.md`
7. Target study-index: `targets/{target}/reports/study-index.md`
8. The evidence packs referenced by the sprint plan or timeline.
9. The final reports, per-source reports, and code references the sprint reasoning cites.
10. The sprint's study evaluation criteria from the sprint plan's `Study Evaluation` section.

## Review Workflow

1. Read the sprint plan and reasoning to understand what was supposed to be built and why.
2. Read the PRD, TRD, and roadmap sections the sprint addresses.
3. Read the cited evidence packs, final reports, and per-source reports.
4. Read the actual implementation code — explore the relevant directories.
5. Check each decision area against the evidence and the implementation.
6. Check tests, quality gates, and success criteria.
7. Write the review findings.

## What To Check

### Decision Fidelity

For every decision in the sprint reasoning:

- Does the implementation match the chosen approach?
- Does it satisfy the requirement the decision was based on?
- Is the evidence from the study still applicable, or did implementation reveal a gap?
- If a deviation was necessary, is it documented with the reason?

### Pattern Compliance

Cross-reference the implementation against the patterns cited in the evidence packs and final reports:

- Are the study-backed patterns followed in the actual code?
- Are the named anti-patterns avoided?
- If a pattern was intentionally not followed, is the reason documented?

### Test Coverage

- Do unit tests cover the logic the sprint scope touches?
- Do fixture tests exercise normal, malformed, and edge-case inputs?
- Do integration or smoke tests validate real runtime paths where the sprint touches them?
- Are tests deterministic and fast?
- Are explicit deferrals justified with reason, impact, and follow-up?

### Quality Gates

Check the sprint's quality gates from the roadmap:

- Are all gates satisfied?
- If a gate cannot be checked yet (e.g., depends on a later sprint), is that documented?

### Documentation And Decisions

- Did implementation produce any new decisions that should be recorded in `DECISIONS.md`?
- Are the sprint plan's `Study Evaluation`, `Risks And Blockers`, and `Execution Evidence` sections up to date?

## Review Output

Write the review to:

`targets/{target}/sprints/{sprint-slug}/review.md`

Include:

### Summary

- Sprint reviewed
- Files and packages examined
- Review date

### Findings By Decision Area

For each decision area from the sprint reasoning:

- **Decision:** Name of the decision.
- **Status:** Matches / Matches With Caveats / Deviates / Cannot Verify.
- **Evidence Check:** Whether the implementation reflects the study evidence cited.
- **Code Evidence:** Specific files, types, or functions that implement the decision (with line references).
- **Issue:** Any gap, deviation, or risk found.
- **Recommendation:** What to do about it.

### Pattern And Anti-Pattern Check

- **Patterns followed:** List each pattern from the evidence that the code implements, with file references.
- **Anti-patterns avoided:** List each anti-pattern the code does not exhibit, with notes.
- **Patterns missed:** Patterns from the evidence that the sprint was expected to follow but did not.

### Test And Quality Gate Assessment

- Tests examined and their pass/fail status.
- Quality gates met or missed.
- Deferrals with justification.

### Decisions Needing Log Update

List any new durable decisions the implementation made that should be recorded in `targets/{target}/DECISIONS.md`.

### Overall Assessment

- **Verdict:** Approve / Approve With Follow-ups / Revisions Needed / Cannot Assess.
- **Blocking issues:** What must be fixed before proceeding.
- **Follow-ups:** Work for the current or a later sprint.
- **Risk carry-forward:** Risks that remain open after this review.
