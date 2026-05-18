# Dimension: Project Structure & Boundaries

## Purpose

Understand how elite Go CLI projects organize their source code, establish package boundaries, and separate the CLI layer from business logic.

## Background

Go CLI projects face a common structural tension: where does the CLI layer end and the business logic begin? Too little separation makes testing hard and commands bloated. Too much adds indirection without benefit. Elite repos find the right balance.

## Steps

1. Read `prompts/base.md` for execution instructions.
2. For each repo in the group:
   - List the top-level directory structure
   - Identify the main entry point and command registration
   - Locate the `cmd/`, `internal/`, and `pkg/` directories if present
   - Trace the dependency flow from entry point to business logic
3. Answer the questions below for each repo.
4. Write per-repo analysis to `results/{NN}-{study-area-name}/{repo-name}.md`.

## Evidence

For each repo, collect:
- Top-level structure (ls output or equivalent)
- Location of `main.go` or entry point
- Location of command definitions
- Package dependency direction
- Any `internal/` or `pkg/` boundary usage

## Questions

1. Why are folders organized this way?
2. What belongs in `cmd/` vs `internal/` vs `pkg/`?
3. Is the CLI layer thin?
4. Where does business logic actually live?
5. How do they prevent package coupling?

## Analysis Axes

- **Dependency direction**: Do imports flow CLI → business logic or in both directions?
- **Package cohesion**: Are related files grouped together?
- **Layering discipline**: Is there a clear separation between input handling and core logic?

## Rating

Assign a score from 1–10 based on the rubric below.

| Score | Meaning                                                   |
| ----- | --------------------------------------------------------- |
| 1–3   | Chaotic folders, unclear ownership, circular dependencies |
| 4–6   | Mostly organized but inconsistent boundaries              |
| 7–8   | Clean layering, understandable ownership                  |
| 9–10  | Exceptional modularity and architectural discipline       |

Fast heuristic:

> “Could I onboard into this repo quickly?”

## Output

Write findings to `reports/source/{NN}-{dimension-name}/{source-name}.md` using `../../templates/repo-analysis.md`.

For each repo, provide:
- A structural map or description
- Evidence of layering (or lack thereof)
- Notable patterns and their rationale
- Tradeoffs made in the structure