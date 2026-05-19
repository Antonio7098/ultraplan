# Dimension: Workflow / Agent Orchestration

## Purpose

Examines how complex multi-step workflows are orchestrated — graph execution engines, state transition models, resumability and checkpointing, DAG-based task routing, and agent coordination. Directly critical for HelloSales's AI pipeline orchestration where sales workflows span multiple stages, models, and data sources.

## Steps

1. Read prompts/base.md for execution instructions.
2. Identify the workflow execution model (DAG, state machine, actor, etc.).
3. Examine how workflow state is persisted and resumed after interruption.
4. Look for checkpointing, compensation (Saga), and retry-at-step semantics.
5. Evaluate how parallel branches, joins, and error paths are modelled.

## Evidence

- Workflow definition DSL or configuration model
- State persistence and checkpoint/recovery mechanism
- Step-level retry and timeout configuration
- Parallel execution and join patterns
- Compensation or rollback logic for failed workflows

## Questions

1. How are multi-step workflows defined, stored, and executed?
2. What happens when a workflow is interrupted mid-step — can it resume?
3. How are parallel workflow branches coordinated and joined?
4. How does the system handle workflow-level timeouts and cancellations?
5. Is there compensation logic for partial workflow failures?

## Rating

Assign a score from 1-10 based on the analysis findings.

| Score | Meaning |
| ----- | ------- |
| 1-3 | Poor implementation or absent |
| 4-6 | Basic implementation with gaps |
| 7-8 | Good implementation with minor issues |
| 9-10 | Excellent, exemplar implementation |

## Output

Write findings to `reports/source/{NN}-{dimension-name}/{source-name}.md` using `../../templates/repo-analysis.md`.
