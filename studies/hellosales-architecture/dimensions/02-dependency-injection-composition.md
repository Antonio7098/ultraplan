# Dimension: Dependency Injection & Composition

## Purpose

Examines how services are wired together — lifecycle management, initialization ordering, interface composition, and dependency ownership. For HelloSales, understanding how large backends avoid global chaos during construction is critical.

## Steps

1. Read prompts/base.md for execution instructions.
2. Identify the dependency injection approach (manual wiring, container, constructor injection, etc.).
3. Trace how services are created, started, and shut down.
4. Examine how interface boundaries are owned and composed.
5. Look for lifecycle hooks, startup ordering, and graceful shutdown patterns.

## Evidence

- DI container / wiring file or manual composition root
- Constructor injection patterns and interface ownership
- Service lifecycle management (start/stop ordering)
- Initialisation complexity and startup time
- Testing seam availability (can services be tested in isolation?)

## Questions

1. How does the project wire its dependency graph without global state or init() hell?
2. Are interfaces defined by consumers or producers?
3. How is startup ordering managed when services depend on each other?
4. What happens during graceful shutdown — is ordering guaranteed?
5. Can individual services be tested without booting the entire system?

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
