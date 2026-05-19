# Dimension: Governance & Evolution Strategy

## Purpose

Analyzes architectural governance and evolution — Architecture Decision Records, migration strategies, deprecation policies, schema evolution approaches, backward compatibility guarantees, and rollout patterns. Aligned with ultraplan's own philosophy of evidence-driven architecture that survives years of change.

## Steps

1. Read prompts/base.md for execution instructions.
2. Identify ADR or architectural decision documentation.
3. Examine migration and deprecation strategies for APIs and schemas.
4. Look for backward compatibility testing and semver adherence.
5. Evaluate rollout patterns (feature flags, canary, blue-green).

## Evidence

- ADR directory or architectural decision documentation
- Deprecation policy and migration guides
- Schema evolution strategy (database, API, config)
- Semantic versioning and compatibility testing
- Rollout and release engineering patterns

## Questions

1. How are architectural decisions documented and revisited?
2. What is the deprecation policy for APIs and how is it communicated?
3. How does the system evolve its data schema without downtime?
4. How are breaking changes introduced and migrated?
5. What rollout patterns are used to limit blast radius of changes?

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
