# Dimension: IO Abstraction & Testability

## Purpose

Understand how elite Go CLI projects abstract IO (stdout/stderr, filesystem, network) to enable testing without real terminals or external systems.

## Background

CLIs that hardcode `os.Stdout` or `os.Stderr` cannot be tested reliably. Elite CLIs inject IO streams or use interfaces for side effects, making commands testable with in-memory buffers.

## Steps

1. Read `prompts/base.md` for execution instructions.
2. For each repo in the group:
   - Identify where stdout/stderr are used
   - Look for IO interfaces or stream abstractions
   - Check filesystem access patterns
   - Find network access and how it's mockable
3. Answer the questions below for each repo.

## Evidence

- IO stream types (bufio.Reader, strings.Builder, etc.)
- Interface definitions for IO
- Test helpers that capture output
- Filesystem abstraction patterns
- Network client interfaces

## Questions

1. Is stdout/stderr abstracted?
2. Can commands be tested without a real terminal?
3. Is filesystem access abstracted?
4. Is network access mockable?

## Analysis Axes

- **Stream abstraction**: Are output streams passed as parameters or interfaces?
- **Interface design**: Are there interfaces for IO operations?
- **Test helpers**: Does the codebase provide helpers for capturing output?
- **Mockability**: Can network calls be replaced with test doubles?

## Rating

Assign a score from 1–10 based on the rubric below.

| Score | Meaning                                     |
| ----- | ------------------------------------------- |
| 1–3   | Direct stdout/filesystem/network everywhere |
| 4–6   | Some abstractions                           |
| 7–8   | Most side effects isolated                  |
| 9–10  | Extremely testable with clean IO contracts  |

Fast heuristic:

> “Could I unit test commands without a real terminal?”

## Output

Write findings to `reports/source/{NN}-{dimension-name}/{source-name}.md` using `../../templates/repo-analysis.md`.