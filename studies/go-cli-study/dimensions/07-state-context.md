# Dimension: State & Context Management

## Purpose

Understand how elite Go CLI projects manage state and propagate context. Focus on `context.Context` usage, cancellation handling, session modeling, and application state patterns.

## Background

Modern Go CLIs increasingly need to manage long-running operations, cancellation, and session state. `context.Context` is the standard mechanism but its usage varies widely in quality.

## Steps

1. Read `prompts/base.md` for execution instructions.
2. For each repo in the group:
   - Find `context.Context` usage and propagation patterns
   - Identify cancellation handling
   - Look for application state (global or per-request)
   - Check for session or session-like patterns
3. Answer the questions below for each repo.

## Evidence

- Context creation and propagation
- `context.WithCancel`, `context.WithTimeout` usage
- Global state or state passed via context
- Cancellation in long-running commands
- Session or config state management

## Questions

1. How is `context.Context` propagated?
2. How is cancellation handled?
3. Is application state centralized or per-command?
4. How are sessions modeled?

## Analysis Axes

- **Context propagation**: Is context passed through all layers?
- **Cancellation quality**: Are long operations interruptible?
- **State location**: Where does application state live?
- **Session modeling**: Are there explicit session concepts?

## Rating

Assign a score from 1–10 based on the rubric below.

| Score | Meaning                              |
| ----- | ------------------------------------ |
| 1–3   | Shared mutable chaos                 |
| 4–6   | Basic context handling               |
| 7–8   | Clean propagation and cancellation   |
| 9–10  | Excellent lifecycle/state discipline |

Fast heuristic:

> “Would cancellation/shutdown behave predictably?”

## Output

Write findings to `reports/source/{NN}-{dimension-name}/{source-name}.md` using `../../templates/repo-analysis.md`.