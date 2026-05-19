# Dimension: State Management & Persistence

## Purpose

Studies how state is managed — repository patterns, transaction boundaries, caching strategy, consistency models, snapshots, workflow state persistence, and event sourcing. For multi-tenant AI workflows, understanding how state is maintained across long-running operations is critical.

## Steps

1. Read prompts/base.md for execution instructions.
2. Identify the storage layer abstractions and query patterns.
3. Examine transaction boundaries and consistency guarantees.
4. Look for caching layers, invalidation strategies, and write-behind patterns.
5. Evaluate state persistence for long-running or resumable operations.

## Evidence

- Repository/DAL abstractions and query interfaces
- Transaction management and isolation level choices
- Caching layer (in-memory, Redis, CDN) and invalidation logic
- Workflow/process state persistence model
- Migration and schema evolution strategy

## Questions

1. How is state accessed and mutated — direct DB, repository, or event-sourced?
2. What consistency model does the system provide to callers?
3. How is cache invalidation handled without stale reads?
4. How is long-running workflow state persisted and resumed?
5. What happens to in-flight state during schema migrations?

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
