# Dimension: Concurrency & Async Patterns

## Purpose

Understand how elite Go CLI projects handle concurrency: goroutine launching, coordination, cleanup, and race condition prevention.

## Background

CLIs that run commands in parallel or process streaming data need careful concurrency design. Getting it wrong leads to race conditions, goroutine leaks, or mysterious hangs.

## Steps

1. Read `prompts/base.md` for execution instructions.
2. For each repo in the group:
   - Identify where goroutines are launched
   - Look for coordination mechanisms (channels, sync.WaitGroup, errgroup)
   - Find cleanup and shutdown handling
   - Check for race condition prevention (mutexes, atomic, etc.)
3. Answer the questions below for each repo.

## Evidence

- `go` keyword usage sites
- `sync.WaitGroup`, `errgroup.Group`, or similar
- Channel patterns
- Mutex or atomic usage
- Shutdown or graceful termination

## Questions

1. Where are goroutines launched?
2. How are they coordinated?
3. How is cleanup handled?
4. Are race conditions considered?

## Analysis Axes

- **Launch boundaries**: Is goroutine spawning localized or scattered?
- **Coordination**: Are structured patterns like `errgroup` used?
- **Cleanup**: Does shutdown properly wait for goroutines?
- **Race prevention**: Are shared data accesses protected?

## Rating

Assign a score from 1–10 based on the rubric below.

| Score | Meaning                                 |
| ----- | --------------------------------------- |
| 1–3   | Unsafe goroutine chaos                  |
| 4–6   | Functional but hard to reason about     |
| 7–8   | Structured concurrency                  |
| 9–10  | Elegant async orchestration and cleanup |

Fast heuristic:

> “Could I confidently modify concurrency code?”

## Output

Write findings to `reports/source/{NN}-{dimension-name}/{source-name}.md` using `../../templates/repo-analysis.md`.