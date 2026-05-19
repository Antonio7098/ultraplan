# Sprint Tracker: [Sprint Name]

> Target: [target-slug]
> Sprint ID: sprint-[XX]-[name]
> Created: [YYYY-MM-DD]
> Reasoning: `targets/[target-slug]/sprints/sprint-[XX]-[name]/reasoning.md`
> Roadmap Section: [roadmap heading]
 
## Sprint Overview

- **Sprint Name:** [Insert sprint name]
- **Sprint Focus:** [Primary implementation outcome for this sprint]
- **Depends On:** [Earlier sprint outputs or "None"]
- **Status:** [Not Started / In Progress / Completed / Blocked]

## Requirement Links

- `targets/[target-slug]/sources/PRD.md` - [PRD requirements this sprint directly addresses]
- `targets/[target-slug]/sources/TRD.md` - [TRD requirements this sprint directly addresses]
- `targets/[target-slug]/sources/feature-architecture.md` - [Use "None - [reason]" if not applicable]
- `targets/[target-slug]/roadmap.md` - [Roadmap sprint section used]
- `targets/[target-slug]/sprints/sprint-[XX]-[name]/reasoning.md` - [Reasoning decisions this tracker executes]

## Evidence Links

- [Evidence pack/final report/per-source report/code reference] - [Decision or risk it supports]
- [Use "None - [reason]" when a section has no direct evidence link]

## Sprint Goals

- **Primary Goal:** [Clear end-of-sprint outcome]
- **Secondary Goals:**
  - [Secondary goal 1]
  - [Secondary goal 2]
  - [Secondary goal 3]

## Scope

- [Concrete work included in this sprint]
- [Concrete work included in this sprint]
- [Concrete work included in this sprint]

## Non-Scope

- [Related work that must not be done in this sprint]
- [Later-sprint behavior that must not be pulled forward]
- [Product-specific behavior that must stay outside this layer]

## Proposed Implementation Shape

- **Package / Module Boundaries:** [High-level boundaries and ownership]
- **Public Surface:** [Interfaces, commands, config shape, or user-visible surface]
- **State And Lifecycle:** [State transitions, ownership, cleanup, persistence, or session behavior]
- **Error And Failure Behavior:** [Typed errors, validation, retry/fallback, graceful degradation, or explicit failure handling]
- **Observability:** [Events, metadata, logs, status views, cost/time/tokens, or auditability]
- **Testing Surface:** [Fake runtimes, fixtures, unit tests, integration gates, smoke paths]

## Decisions

- [ ] **Decision 1: [Decision Name]**
  > **Requirement:** [PRD/TRD requirement]
  > **Evidence:** [Evidence pack, final report, per-source report, or code reference]
  > **Tradeoff:** [Accepted tradeoff]
  > **Rejected Alternative:** [Alternative and reason]
  > **Risk / Follow-up:** [Risk, mitigation, or open follow-up]

- [ ] **Decision 2: [Decision Name]**
  > **Requirement:** [PRD/TRD requirement]
  > **Evidence:** [Evidence used]
  > **Tradeoff:** [Accepted tradeoff]
  > **Rejected Alternative:** [Alternative and reason]
  > **Risk / Follow-up:** [Risk, mitigation, or open follow-up]

## Execution Checklist

- [ ] **Task 1: [Task 1 Name]**
  > *Description: [Briefly describe the purpose of this task. Keep it outcome-oriented rather than implementation-vague.]*
  - [ ] **Sub-task 1.1:** [First step]
  - [ ] **Sub-task 1.2:** [Second step]
  - [ ] **Sub-task 1.3:** [Third step or remove if not needed]

- [ ] **Task 2: [Task 2 Name]**
  > *Description: [Briefly describe the purpose of this task.]*
  - [ ] **Sub-task 2.1:** [First step]
  - [ ] **Sub-task 2.2:** [Second step]
  - [ ] **Sub-task 2.3:** [Third step or remove if not needed]

- [ ] **Task 3: [Task 3 Name]**
  > *Description: [Briefly describe the purpose of this task.]*
  - [ ] **Sub-task 3.1:** [First step]
  - [ ] **Sub-task 3.2:** [Second step]

- [ ] **Task 4: [Task 4 Name]**
  > *Description: [Briefly describe the purpose of this task.]*
  - [ ] **Sub-task 4.1:** [First step]
  - [ ] **Sub-task 4.2:** [Second step]

## Testing And Documentation Checklist

- [ ] **Unit Tests:** deterministic coverage for new SDK logic, state models, schemas, and validation rules
- [ ] **Fixture Tests:** structured runtime events, fake runtimes, golden outputs, and malformed-input cases for the sprint scope
- [ ] **Integration Tests:** runtime adapter, process lifecycle, configuration, persistence hooks, or CLI paths touched by the sprint
- [ ] **Real Runtime Smoke:** if the sprint adds or changes a supported runtime path, run at least one real-runtime smoke or record an explicit justified deferral
- [ ] **Documentation Updates:** update target docs, roadmap notes, decisions, or user-facing docs affected by the sprint

## Risks And Blockers

| Risk | Impact | Mitigation | Status |
| --- | --- | --- | --- |
| [Risk 1] | [High/Med/Low] | [Mitigation] | [Open/Mitigated/Closed] |
| [Risk 2] | [High/Med/Low] | [Mitigation] | [Open/Mitigated/Closed] |

## Open Questions

- [Question 1] - [Evidence needed or decision owner]
- [Question 2] - [Evidence needed or decision owner]

## Success Criteria

- [ ] **Success Criteria 1:** [Objective completion condition]
- [ ] **Success Criteria 2:** [Objective completion condition]
- [ ] **Success Criteria 3:** [Objective completion condition]
- [ ] **Success Criteria 4:** [Remove if not needed]

## Study Evaluation

- [ ] **Patterns Followed:** [Study-backed patterns this sprint intentionally follows]
- [ ] **Anti-Patterns Avoided:** [Study-backed risks or anti-patterns this sprint avoids]
- [ ] **Comparison Needed:** [How the completed sprint should be compared back against the evidence]
- [ ] **Proceed / Iterate:** [Condition for moving to the next sprint]

## Review And Sign-Off

- Sprint Status: [Not Started / In Progress / Completed / Blocked]
- Completion Date: [Date]

## Execution Evidence

- [Record tests run, explicit deferrals, notable commands, evidence packs or reports consulted, decisions, or review-ready evidence here as execution progresses]
