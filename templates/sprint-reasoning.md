# Sprint Reasoning: [Sprint Name]

> Target: [target-slug]
> Sprint ID: sprint-[XX]-[name]
> Output: `targets/[target-slug]/sprints/sprint-[XX]-[name]/reasoning.md`
> Sprint Tracker: `targets/[target-slug]/sprints/sprint-[XX]-[name]/plan.md`
 
## Overview

**Sprint:** [Name]
**Purpose:** [What this sprint will make true]
**Roadmap Section:** [Roadmap heading]
**Depends On:** [Earlier sprint outputs or "None"]
**Reasoning Status:** [Draft / Ready For Tracker / Blocked]

## Target Sources

- `targets/[target-slug]/sources/PRD.md` - [Product requirements used]
- `targets/[target-slug]/sources/TRD.md` - [Technical requirements used]
- `targets/[target-slug]/sources/feature-architecture.md` - [Use "None - [reason]" if not applicable]
- `targets/[target-slug]/roadmap.md` - [Sprint section used]

## Evidence Basis

**Evidence Status:** [Complete and used / Partial with reason / Missing with reason]
**Context Strategy:** [All packs loaded / Staged loading used / Additional source exploration used]

### Evidence Packs Used

- `targets/[target-slug]/reports/evidence/[pack].md` - [Decision area it informs]
- `targets/[target-slug]/reports/evidence/[pack].md` - [Decision area it informs]

### Final Reports Used

- `studies/[study]/reports/final/[dimension].md` - [Finding used in reasoning]
- `studies/[study]/reports/final/[dimension].md` - [Finding used in reasoning]

### Per-Source Reports Used

- `studies/[study]/reports/source/[dimension]/[source].md` - [Finding used in reasoning]
- `studies/[study]/reports/source/[dimension]/[source].md` - [Finding used in reasoning]

### Code References Used

- `[repo] / [path]:[line]` - [Implementation evidence used]
- `[repo] / [path]:[line]` - [Implementation evidence used]

### Evidence Rejected Or Not Used

- **[Evidence source]:** [Why it was not applicable to this sprint]
- **[Evidence source]:** [Why it was not applicable to this sprint]

## Requirement Map

### Requirement Index Used In This Sprint

| Requirement | Source | Area | Applicability | Why It Matters For This Sprint |
| --- | --- | --- | --- | --- |
| [PRD section / requirement] | PRD | [Product area] | [Applicable / Non-Applicable / Ambiguous] | [Reason] |
| [TRD section / requirement] | TRD | [Technical area] | [Applicable / Non-Applicable / Ambiguous] | [Reason] |

### Applicable Requirements

- **[Requirement]:** [Why it applies, what it requires, and what part of the sprint it constrains]
- **[Requirement]:** [Why it applies, what it requires, and what part of the sprint it constrains]

### Non-Applicable Requirements

- **[Requirement]:** [Why it does not apply to this sprint]

### Ambiguous Or Conflicting Requirements

- **[Requirement or pair]:** [What is unclear or in conflict]
- **[Requirement or pair]:** [Why interpretation is difficult]

### Open Questions

- [Question 1]
- [Question 2]

## Sprint Decision Analysis

### Decision Area 1: [Name]

**Problem:** [What must be decided before writing the sprint tracker]

**Requirements Applied**
- [Requirement and why it matters]
- [Requirement and why it matters]

**Evidence Applied**
- [Evidence pack/final report/per-source report/code reference and what it shows]
- [Evidence pack/final report/per-source report/code reference and what it shows]

**Options Considered**
- **Option A:** [Description]
- **Option B:** [Description]
- **Option C:** [Description or "Not needed"]

**Chosen Approach**
- [What the sprint should do]

**Decision Justification**
- [Why this approach best satisfies the requirements and evidence]
- [Why the rejected alternatives are worse for this sprint]
- [Tradeoffs and second-order effects]

**Execution Notes**
- [What implementation must preserve]
- [What discovery would force reasoning revision]

**Expected Evidence**
- **Tests:** [Unit / fixture / integration / smoke / failure-path evidence expected]
- **Runtime Evidence:** [Events / metadata / logs / diagnostics / health / lifecycle evidence expected]
- **Review Checks:** [What review must confirm]

---

### Decision Area 2: [Name]

**Problem:** [What must be decided before writing the sprint tracker]

**Requirements Applied**
- [Requirement and why it matters]
- [Requirement and why it matters]

**Evidence Applied**
- [Evidence pack/final report/per-source report/code reference and what it shows]
- [Evidence pack/final report/per-source report/code reference and what it shows]

**Options Considered**
- **Option A:** [Description]
- **Option B:** [Description]
- **Option C:** [Description or "Not needed"]

**Chosen Approach**
- [What the sprint should do]

**Decision Justification**
- [Why this approach best satisfies the requirements and evidence]
- [Why the rejected alternatives are worse for this sprint]
- [Tradeoffs and second-order effects]

**Execution Notes**
- [What implementation must preserve]
- [What discovery would force reasoning revision]

**Expected Evidence**
- **Tests:** [Unit / fixture / integration / smoke / failure-path evidence expected]
- **Runtime Evidence:** [Events / metadata / logs / diagnostics / health / lifecycle evidence expected]
- **Review Checks:** [What review must confirm]

## Deviations

| Requirement | Deviation | Reason | Risk | Disposition | Follow-up |
| --- | --- | --- | --- | --- | --- |
| [Requirement] | [Deviation] | [Why needed] | [Impact] | [Temporary/Permanent] | [Action] |

## Cross-Cutting Reasoning

### Major Decision Summary

- **[Decision 1]:** [Requirement and evidence basis]
- **[Decision 2]:** [Requirement and evidence basis]

### Tradeoffs

- [Tradeoff 1]: [Reason and accepted cost]
- [Tradeoff 2]: [Reason and accepted cost]

### Assumptions

- [Assumption 1]
- [Assumption 2]

### Dependencies

- [Previous sprint or system dependency]: [What is needed]
- [Unfinished work]: [Impact]

### Risks

- [Risk 1]: [Impact and mitigation]
- [Risk 2]: [Impact and mitigation]

## Tracker Guidance

Use this reasoning to write `targets/[target-slug]/sprints/sprint-[XX]-[name]/plan.md`.

The tracker must include:

- scope that follows the chosen approaches above
- non-scope that blocks rejected or premature alternatives
- execution tasks derived from the decision areas
- tests and evidence expectations from each decision area
- risks, assumptions, and open questions carried forward
- success criteria that can prove the reasoning was implemented

## Evidence Review Checklist

- [ ] Review can trace every sprint decision back to PRD/TRD requirements.
- [ ] Review can trace every meaningful design choice back to evolved study evidence or an explicit open question.
- [ ] Review can identify which evidence was loaded, omitted, rejected, or explored directly.
- [ ] Review can see credible alternatives and why they were rejected.
- [ ] Review can verify the planned tests and runtime evidence.
- [ ] Review can identify planned or unplanned deviations.

## Phase Exit Criteria

- [ ] Sprint scope is fully covered.
- [ ] Target PRD and TRD requirements are mapped.
- [ ] Evidence packs were read or staged according to the context strategy.
- [ ] Applicable, non-applicable, and ambiguous requirements are recorded where relevant.
- [ ] Study evidence is tied to decisions, risks, alternatives, or expected evidence.
- [ ] Important decisions are explicitly justified.
- [ ] Non-trivial alternatives are discussed.
- [ ] Deviations, assumptions, risks, and unknowns are documented.
- [ ] Expected execution and review evidence is defined.
- [ ] The sprint tracker can be written from this reasoning without reopening every study report.

## Documentation Updates

- [Doc or template]: [Why it must change]
- [Doc or template]: [Why it must change]
