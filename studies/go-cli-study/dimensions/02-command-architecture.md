# Dimension: Command Architecture

## Purpose

Understand how elite Go CLI projects define, register, and compose subcommands. Focus on whether commands are declarative or imperative, how parent/child communication works, and how much logic lives directly in command handlers.

## Background

Command architecture is where Go CLI design either becomes elegant or becomes a mess. The best CLIs treat commands as thin orchestration layers that delegate to reusable business logic. The worst CLIs put everything in `RunE` functions.

## Steps

1. Read `prompts/base.md` for execution instructions.
2. For each repo in the group:
   - Find how commands are defined (struct fields, function calls, etc.)
   - Trace how subcommands are registered to their parent
   - Identify the command composition pattern
   - Look for lifecycle hooks (pre-run, post-run, etc.)
   - Check if commands are grouped into clusters
3. Answer the questions below for each repo.

## Evidence

- Command definition patterns (struct embedding, functional options, etc.)
- Subcommand registration calls
- `RunE` or `Run` function signatures and what they receive
- Any command scaffolding or factory functions
- Help generation implementation

## Questions

1. How are subcommands registered?
2. How is command discovery handled?
3. Are commands declarative or imperative?
4. How do parent/child commands communicate?
5. How much logic exists directly in commands?

## Analysis Axes

- **Command composition**: Can new commands be composed from existing ones?
- **Lifecycle hooks**: Are pre/post hooks available and used?
- **Reusable scaffolding**: Is boilerplate reduced through helpers or base types?
- **Run function size**: How much logic typically lives in `RunE`?

## Rating

Assign a score from 1–10 based on the rubric below.

| Score | Meaning                                          |
| ----- | ------------------------------------------------ |
| 1–3   | Commands are giant procedural scripts            |
| 4–6   | Commands somewhat organized but mixed with logic |
| 7–8   | Thin commands with reusable patterns             |
| 9–10  | Elegant command lifecycle and scalable structure |

Fast heuristic:

> “Could this scale to 100+ commands cleanly?”

## Output

Write findings to `reports/source/{NN}-{dimension-name}/{source-name}.md` using `../../templates/repo-analysis.md`.