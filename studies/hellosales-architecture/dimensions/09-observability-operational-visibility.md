# Dimension: Observability & Operational Visibility

## Purpose

Analyzes observability infrastructure — structured logging, distributed tracing, metrics collection, correlation ID propagation, event models, and debugging ergonomics. For AI systems where failures cross service boundaries, observability is the difference between 3am resolution and 3am chaos.

## Steps

1. Read prompts/base.md for execution instructions.
2. Identify the logging framework, format, and routing.
3. Examine tracing instrumentation and span propagation.
4. Look for metrics collection, dashboards, and alerting integration.
5. Evaluate how correlation IDs flow through async boundaries.

## Evidence

- Structured logging configuration (level, format, output)
- OpenTelemetry or tracing instrumentation
- Metrics exposition (Prometheus, statsd, custom)
- Correlation ID propagation through sync and async paths
- Health check and readiness endpoints

## Questions

1. Can an operator reconstruct a single request's full path through the system?
2. How are structured logs routed, stored, and queried in production?
3. What metrics indicate system health vs performance degradation?
4. How does observability cross async boundaries (queues, workflows)?
5. What debugging tooling exists for production issues?

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
