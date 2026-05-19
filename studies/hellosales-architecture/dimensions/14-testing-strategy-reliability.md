# Dimension: Testing Strategy & Reliability Engineering

## Purpose

Studies testing philosophy and infrastructure — integration testing approach, end-to-end test harnesses, mocking strategies, test fixtures, deterministic testing of concurrent/async code, and reliability engineering practices. Essential for maintaining velocity in systems as complex as HelloSales.

## Steps

1. Read prompts/base.md for execution instructions.
2. Identify testing layers (unit, integration, e2e) and their organisation.
3. Examine test harness infrastructure (testcontainers, fixtures, mocks).
4. Look for deterministic testing of concurrent, async, or time-dependent code.
5. Evaluate CI integration, test speed, and flakiness management.

## Evidence

- Test directory structure and test naming conventions
- Integration test setup (containers, DB fixtures, network mocks)
- Mock/fake implementations for external dependencies
- Deterministic testing patterns for concurrent code
- CI pipeline test stages and parallelisation

## Questions

1. How does the project test async, concurrent, or time-dependent code deterministically?
2. What is the balance between unit, integration, and e2e tests?
3. How are external dependencies (DBs, APIs, queues) mocked or replaced in tests?
4. How does the project prevent flaky tests from eroding trust?
5. Can integration tests run locally without cloud dependencies?

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
