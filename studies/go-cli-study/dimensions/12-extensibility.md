# Dimension: Extensibility & Plugin Design

## Purpose

Understand how elite Go CLI projects support extensibility: plugin systems, command registration, schema evolution, and internal API stability.

## Background

Extensibility determines whether a CLI can grow beyond its original scope. Some CLIs are designed to be extended; others are deliberately closed. Both are valid choices with different tradeoffs.

## Steps

1. Read `prompts/base.md` for execution instructions.
2. For each repo in the group:
   - Identify extension points (plugin loader, command registry, etc.)
   - Look for interface stability
   - Find internal vs exported API boundaries
   - Check for dynamic loading (plugin, bytecode, etc.)
3. Answer the questions below for each repo.

## Evidence

- Plugin or extension interfaces
- Command registration APIs
- Internal package boundaries
- Dynamic loading mechanisms
- Version stability guarantees

## Questions

1. Can new commands be added cleanly?
2. Is extension anticipated?
3. Are interfaces stable?
4. Are internal APIs modular?

## Analysis Axes

- **Extension philosophy**: Is extension a first-class concern?
- **Interface stability**: Are extension points versioned?
- **Module boundaries**: Can extensions access internal code?
- **Loading mechanism**: How are extensions loaded and executed?

## Rating

Assign a score from 1–10 based on the rubric below.

| Score | Meaning                               |
| ----- | ------------------------------------- |
| 1–3   | Hardcoded and rigid                   |
| 4–6   | Some extension points                 |
| 7–8   | Well-designed modularity              |
| 9–10  | Clean ecosystem/platform architecture |

Fast heuristic:

> “Could third parties extend this cleanly?”

## Output

Write findings to `reports/source/{NN}-{dimension-name}/{source-name}.md` using `../../templates/repo-analysis.md`.