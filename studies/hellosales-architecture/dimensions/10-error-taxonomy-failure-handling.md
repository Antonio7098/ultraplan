# Dimension: Error Taxonomy & Failure Handling

## Purpose

Examines how the system models and handles failure — error type hierarchies, wrapping conventions, propagation patterns, retry strategies, partial failure semantics, and graceful degradation. One of the most underrated dimensions, especially for AI pipelines where failure is the norm, not the exception.

## Steps

1. Read prompts/base.md for execution instructions.
2. Identify the error type hierarchy and custom error definitions.
3. Examine error wrapping and unwrapping conventions.
4. Look for retry logic, circuit breakers, and fallback strategies.
5. Evaluate how partial failures are reported to callers.

## Evidence

- Custom error types and sentinel errors
- Error wrapping with stack traces and context
- Retry utility functions or middleware
- Circuit breaker or rate limiter implementations
- Graceful degradation and fallback paths

## Questions

1. How does the system distinguish client errors from server errors from transient failures?
2. Are errors typed so callers can handle specific failure modes?
3. What is the retry strategy — exponential backoff, jitter, max attempts?
4. How are partial failures in batch operations reported?
5. Does the system have circuit breakers to prevent cascade failures?

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
