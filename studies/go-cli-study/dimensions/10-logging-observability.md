# Dimension: Logging & Observability

## Purpose

Understand how elite Go CLI projects handle logging, debug modes, and observability. Focus on structured logging, log levels, and separation from user output.

## Background

CLIs often mix user output with debug logs, making it hard to separate what the tool does from what the tool is telling the user. Elite CLIs use structured logging with clear separation.

## Steps

1. Read `prompts/base.md` for execution instructions.
2. For each repo in the group:
   - Identify the logging library (slog, zap, logrus, etc.)
   - Find log levels and how they're configured
   - Look for debug mode handling
   - Check separation between stdout (user output) and stderr (logs/debug)
3. Answer the questions below for each repo.

## Evidence

- Logging library and configuration
- Log level handling
- Debug flag implementation
- Output separation
- Structured log fields

## Questions

1. Is logging structured?
2. Are debug modes supported?
3. Are logs separated from user output?
4. What observability hooks exist?

## Analysis Axes

- **Structured logging**: Are logs machine-parseable?
- **Level handling**: Can verbosity be configured?
- **Output separation**: Are user-facing vs debug outputs separate?
- **Hooks**: Are there tracing or telemetry integration points?

## Rating

Assign a score from 1–10 based on the rubric below.

| Score | Meaning                                 |
| ----- | --------------------------------------- |
| 1–3   | Print debugging only                    |
| 4–6   | Basic logging                           |
| 7–8   | Structured logs and debug support       |
| 9–10  | Excellent observability and diagnostics |

Fast heuristic:

> “Could operators debug issues efficiently?”

## Output

Write findings to `reports/source/{NN}-{dimension-name}/{source-name}.md` using `../../templates/repo-analysis.md`.