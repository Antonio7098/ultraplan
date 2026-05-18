# Dimension: Resilience, Fallback, and Validation

## Purpose

Identify patterns for explicit failures, health checks, retries, fallback, rate-limit handling, structured event validation, output validation, and informed repair attempts. The goal is graceful degradation without hiding unrecoverable misconfiguration.

## Background

UltraPlan and 24-hour-testers need long-running agent work to survive transient failures but fail fast on invalid setup. The runtime wrapper should make retry/fallback/backoff composable across runtimes, providers, models, sessions, and validation steps.

## Steps

1. Read `prompts/base.md` for execution instructions.
2. For the target repo:
   - Find startup validation and health checks.
   - Identify retry, backoff, rate-limit, fallback, circuit-breaker, or degraded-mode logic.
   - Trace error types and retryability classification.
   - Look for JSON event validation, output/artifact validation, and reprompt/repair loops.
   - Inspect how partial progress, checkpoints, and failures are persisted.
3. Answer the questions below.

## Evidence

- Config validation, health checks, provider/model checks, and preflight code
- Retry/backoff/rate-limit/fallback policies
- Error types, exit-code handling, and retryability classification
- JSON event decoders, output validators, schema validators, report/file checks, and repair prompts
- Checkpoints, durable state, run logs, and failure metadata

## Questions

1. Which failures are considered unrecoverable, transient, retryable, or fallbackable?
2. How are retries configured, bounded, and reported to callers?
3. How would the system express compositions like retry, fallback, retry, validate, repair?
4. How are rate limits surfaced and handled?
5. How are malformed JSON events, missing final events, empty streams, or partial outputs detected?
6. What metadata is preserved for debugging, cost estimation, and later synthesis?

## Analysis Axes

- **Failure explicitness**: Are errors typed, classified, and useful to callers?
- **Policy composability**: Can retry/fallback/backoff be combined without hard-coded branching?
- **Preflight quality**: Does the system fail fast for bad configuration before spending runtime work?
- **Validation strength**: Are structured events and outputs checked against the actual expected artifacts/contracts?
- **Partial progress**: Can a failed run be inspected, resumed, or repaired?

## Rating

Assign a score from 1-10 based on the rubric below.

| Score | Meaning |
| ----- | ------- |
| 1-3 | Failures are opaque or only logged |
| 4-6 | Basic retries or validation with limited classification |
| 7-8 | Typed errors, bounded retry/backoff, validation, and useful state |
| 9-10 | Composable resilience policy with health checks, fallback, repair, and strong observability |

Fast heuristic:

> "Can the caller decide what to retry, what to fallback, and what to fail fast?"

## Output

Write findings to `reports/source/{NN}-{dimension-name}/{source-name}.md` using `../../templates/repo-analysis.md`.
