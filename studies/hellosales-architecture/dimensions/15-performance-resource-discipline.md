# Dimension: Performance & Resource Discipline

## Purpose

Examines performance and resource management — memory allocation patterns, object pooling, streaming versus buffering, batching strategy, lazy loading, query optimization, and profiling discipline. For AI/data systems where a single pipeline can process GBs, resource discipline separates production-ready from prototype.

## Steps

1. Read prompts/base.md for execution instructions.
2. Identify memory management patterns (pooling, reuse, zero-alloc).
3. Examine streaming vs buffering choices in data paths.
4. Look for batching strategies in I/O, DB, and API calls.
5. Evaluate profiling, benchmarking, and optimisation culture.

## Evidence

- Object pool or sync.Pool usage
- Streaming readers/writers vs in-memory buffers
- Batch processing parameters and flush thresholds
- Benchmark tests and performance regression detection
- Pprof or tracing-based optimisation evidence

## Questions

1. How does the system avoid allocating memory proportional to data size?
2. Where does the system buffer vs stream, and what drives the choice?
3. How are batch sizes tuned and what happens at batch boundaries?
4. Is there a performance regression testing culture?
5. What profiling tools are used to identify bottlenecks?

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
