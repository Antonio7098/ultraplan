# Dimension: Testing Strategy

## Purpose

Understand how elite Go CLI projects structure tests: unit vs integration, golden tests, mock organization, and what behavior is tested vs implementation details.

## Background

CLIs are notoriously hard to test well. Elite repos find the right balance: tests that catch regressions without becoming fragile orcoupled to implementation details.

## Steps

1. Read `prompts/base.md` for execution instructions.
2. For each repo in the group:
   - Identify test organization (table-driven, subtests, etc.)
   - Look for golden tests (output comparison)
   - Find mock structures and test helpers
   - Check for integration tests
3. Answer the questions below for each repo.

## Evidence

- Test organization patterns
- Golden file usage
- Mock implementations
- Test helper packages
- Integration test setup

## Questions

1. Are commands integration tested?
2. Are golden tests used?
3. How are mocks structured?
4. Is behavior tested or implementation details?

## Analysis Axes

- **Coverage approach**: Are happy paths and error paths tested?
- **Golden tests**: Is output compared against stored fixtures?
- **Mock isolation**: Are mocks well-organized or ad-hoc?
- ** Brittleness**: Are tests checking behavior or implementation?

## Rating

Assign a score from 1–10 based on the rubric below.

| Score | Meaning                                      |
| ----- | -------------------------------------------- |
| 1–3   | Sparse or brittle tests                      |
| 4–6   | Decent coverage but inconsistent             |
| 7–8   | Strong unit + integration patterns           |
| 9–10  | Exceptionally maintainable testing ecosystem |

Fast heuristic:

> “Would I trust refactors in this repo?”

## Output

Write findings to `reports/source/{NN}-{dimension-name}/{source-name}.md` using `../../templates/repo-analysis.md`.