# Dimension: Project Structure & Boundaries

## Purpose

Analyzes how each project structures its codebase — package boundaries, module layout, top-level directory conventions, and separation of concerns at scale. HelloSales needs a structure that scales across ingestion, AI orchestration, and multi-tenant API surfaces without devolving into a monolith.

## Steps

1. Read prompts/base.md for execution instructions.
2. Inspect top-level directory layout: identify modules, packages, and their responsibilities.
3. Trace how code is organised across internal vs public packages.
4. Evaluate whether package boundaries align with domain concepts or implementation layers.
5. Identify conventions for naming, nesting, and package dependency direction.

## Evidence

- Top-level directory listing and README structure
- go.mod / module definition and internal vs pkg split
- Package dependency graph direction (cycles? acyclic layers?)
- Subpackage organisation patterns (by feature, layer, or domain)
- Mono-repo vs multi-module strategy

## Questions

1. How does the project keep package boundaries from eroding as it grows?
2. Is the structure organised by domain, layer, or a hybrid?
3. Where does internal API surface end and public SDK begin?
4. What conventions prevent circular dependencies?
5. How does the project structure support multiple contributors with isolated work areas?

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
