# Dimension: Data Ingestion & Processing Pipelines

## Purpose

Examines how data moves through ingestion and processing pipelines — stages, transforms, batching, validation, normalization, enrichment, and ETL flow. HelloSales is fundamentally a data system: raw signals become structured intelligence through multi-stage pipelines.

## Steps

1. Read prompts/base.md for execution instructions.
2. Identify the data ingestion path: how raw data enters the system.
3. Trace data through processing stages (validate → transform → enrich → store).
4. Examine batching strategy, backpressure, and partial-failure handling.
5. Look for pipeline observability and data quality checks.

## Evidence

- Ingestion entry points and data format contracts
- Pipeline stage definitions and data flow between stages
- Validation and normalization logic
- Batching and flush semantics
- Error handling for malformed or partial data

## Questions

1. How does raw data become trustworthy structured data?
2. What happens when a pipeline stage fails mid-batch?
3. How is data quality validated at each pipeline stage?
4. How does the pipeline scale with data volume without OOM?
5. Can pipeline stages be independently deployed or scaled?

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
