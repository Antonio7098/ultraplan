# Dimension: Background Jobs & Async Workflows

## Purpose

Examines how background processing is architected — queues, retries, workers, orchestration, cancellation, scheduling, and durable execution. This is arguably the most important dimension for HelloSales given its reliance on long-running AI pipelines and async data processing.

## Steps

1. Read prompts/base.md for execution instructions.
2. Identify the queuing/worker infrastructure (in-process, Redis, NATS, Kafka, Temporal).
3. Trace a job from submission through execution to completion/failure.
4. Examine retry policies, dead-letter handling, and backpressure.
5. Look for workflow orchestration, DAG execution, or saga patterns.

## Evidence

- Queue/worker abstractions and job type definitions
- Retry policy configuration (max attempts, backoff, jitter)
- Dead-letter queue or failed-job handling
- Workflow/orchestration engine if present
- Job scheduling and cron-like semantics

## Questions

1. How are background jobs submitted, tracked, and completed?
2. What happens when a job fails — retry, dead-letter, or compensate?
3. How does the system handle job duration limits and cancellation?
4. Are workflows composed of multiple steps with state management?
5. How is backpressure applied when the system is overloaded?

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
