# Dimension: Dependency Injection & Wiring

## Purpose

Understand how elite Go CLI projects construct and pass around dependencies. Focus on whether wiring is centralized or spread across commands, and whether globals are avoided.

## Background

Good DI makes CLIs testable and components reusable. Bad DI leads to global state, hidden dependencies, and commands that can only be tested with a real filesystem or network.

## Steps

1. Read `prompts/base.md` for execution instructions.
2. For each repo in the group:
   - Find where dependencies are constructed (main, factory, or command itself)
   - Identify how services are passed to commands
   - Look for interfaces used to abstract dependencies
   - Check for global variables or package-level state
3. Answer the questions below for each repo.

## Evidence

- Constructor functions or factory patterns
- Interface definitions for services
- How commands receive their dependencies
- Any use of `context.Context` for request-scoped values
- Global state patterns (or their absence)

## Questions

1. Where are dependencies constructed?
2. How are services passed around?
3. Is wiring centralized?
4. Are globals avoided?
5. Is initialization explicit?

## Analysis Axes

- **Explicit construction**: Are dependencies built in one place?
- **Interface abstraction**: Are dependencies exposed through interfaces?
- **Direction of flow**: Do dependencies flow downward (command → service) or sideways?
- **Testability**: Can commands be tested without real IO?

## Rating

Assign a score from 1–10 based on the rubric below.

| Score | Meaning                                            |
| ----- | -------------------------------------------------- |
| 1–3   | Globals everywhere, hidden dependencies            |
| 4–6   | Some injection but inconsistent                    |
| 7–8   | Clear composition root and explicit wiring         |
| 9–10  | Extremely testable and disciplined dependency flow |

Fast heuristic:

> “Can I see where the app is assembled?”

## Output

Write findings to `reports/source/{NN}-{dimension-name}/{source-name}.md` using `../../templates/repo-analysis.md`.