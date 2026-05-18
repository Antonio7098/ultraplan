# Dimension: Error Handling Philosophy

## Purpose

Understand how elite Go CLI projects handle errors: wrapping, user-facing vs debug errors, fatal vs recoverable failures, and error type design.

## Background

Go's error handling is simple but the conventions around *good* error handling are not. Elite CLIs wrap errors with context, distinguish user-facing from operational errors, and use typed errors for conditions that can be programmatically handled.

## Steps

1. Read `prompts/base.md` for execution instructions.
2. For each repo in the group:
   - Find error wrapping patterns (`fmt.Errorf` with `%w`)
   - Identify sentinel errors (`errors.New`, `errors.Is`)
   - Look for typed errors that carry structured data
   - Check how errors are rendered to users vs logs
   - Find how fatal vs recoverable errors are distinguished
3. Answer the questions below for each repo.

## Evidence

- Error definition patterns
- Wrapping with `%w`
- `errors.Is` / `errors.As` usage
- Custom error types
- Error rendering/logging

## Questions

1. Are errors wrapped with context?
2. Which errors are user-facing vs operational?
3. How are fatal vs recoverable failures handled?
4. Are sentinel errors used for programmatic checking?

## Analysis Axes

- **Contextual wrapping**: Does error chain include actionable context?
- **Type hierarchy**: Are there distinct error types for different categories?
- **Rendering**: Is error output designed for users or developers?
- **Sentinel usage**: Are there exported error variables for comparison?

## Rating

Assign a score from 1–10 based on the rubric below.

| Score | Meaning                                               |
| ----- | ----------------------------------------------------- |
| 1–3   | Panic-driven or vague errors                          |
| 4–6   | Some wrapping/context                                 |
| 7–8   | Consistent contextual errors                          |
| 9–10  | Excellent operational vs user-facing error separation |

Fast heuristic:

> “Would debugging production failures be pleasant?”

## Output

Write findings to `reports/source/{NN}-{dimension-name}/{source-name}.md` using `../../templates/repo-analysis.md`.