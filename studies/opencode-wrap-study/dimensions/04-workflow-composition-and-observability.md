# Dimension: Workflow Composition and Observability

## Purpose

Study how runtime primitives are composed into higher-level workflows while preserving visibility, metadata, and control. Focus on DAGs, steps, dependencies, structured event projection, run dashboards, logs, metrics, cost/time/token accounting, and reportable decisions.

## Background

The Go library should be usable inside UltraPlan, 24-hour-testers, and future tools. It should expose enough primitives to build studies, sprint plans, validation loops, and agent dashboards without becoming UltraPlan itself.

## Steps

1. Read `prompts/base.md` for execution instructions.
2. For the target repo:
   - Identify workflow, task, step, DAG, or orchestration primitives.
   - Trace how child work is scheduled, coordinated, retried, and summarized.
   - Find structured runtime events, logs, metrics, traces, state stores, and dashboards.
   - Look for metadata capture: model, provider, tokens, cost, duration, attempts, artifacts, decisions.
   - Inspect how final reports or synthesized outputs cite source runs and evidence.
3. Answer the questions below.

## Evidence

- Workflow/task/step APIs and dependency models
- Event decoders, event buses, projectors, state stores, and run managers
- Logging, tracing, metrics, telemetry, and diagnostics code
- Cost/token/time usage metadata
- Report generation, synthesis, and evidence-linking code

## Questions

1. What workflow primitive is used, and how much does it know about the runtime?
2. How are steps scheduled, parallelized, retried, cancelled, and summarized?
3. How are structured runtime events projected into user-facing progress?
4. What metadata is captured for every run, step, provider, model, and artifact?
5. How are logs and durable state organized so tools can inspect active and historical runs?
6. What should remain in the runtime wrapper versus UltraPlan-specific orchestration?

## Analysis Axes

- **Primitive separation**: Is the runtime SDK separate from product-specific workflow logic?
- **Workflow ergonomics**: Are steps and dependencies simple to define and inspect?
- **Event projection**: Can callers build live progress views without parsing raw logs?
- **Metadata completeness**: Are cost, token, timing, runtime, attempt, and artifact fields captured?
- **Auditability**: Can final decisions be traced back to source runs and evidence?

## Rating

Assign a score from 1-10 based on the rubric below.

| Score | Meaning |
| ----- | ------- |
| 1-3 | Workflow behavior is ad hoc and invisible |
| 4-6 | Some orchestration exists but weak event/state model |
| 7-8 | Clear workflow primitives with useful state and progress events |
| 9-10 | Excellent composable workflows, event projection, metadata, and audit trail |

Fast heuristic:

> "Could UltraPlan show all active agents, progress, cost, and outputs by consuming canonical events without knowing runtime internals?"

## Output

Write findings to `reports/source/{NN}-{dimension-name}/{source-name}.md` using `../../templates/repo-analysis.md`.
