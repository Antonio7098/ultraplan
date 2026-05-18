# Dimension: Configuration Management

## Purpose

Understand how elite Go CLI projects handle configuration from multiple sources: flags, environment variables, config files. Focus on precedence rules, validation, and immutability.

## Background

Most CLIs start with just flags. Elite CLIs grow to support flags + env vars + config files with consistent precedence, validation at startup, and immutability after.

## Steps

1. Read `prompts/base.md` for execution instructions.
2. For each repo in the group:
   - Identify all configuration sources (flags, env vars, config files)
   - Trace the loading order and precedence
   - Find where defaults are set
   - Look for validation logic
   - Check if config is immutable after startup
3. Answer the questions below for each repo.

## Evidence

- Flag definitions and bindings
- Environment variable handling
- Config file loading and parsing
- Precedence logic (flag > env > config > default)
- Validation functions or patterns

## Questions

1. How are flags, env vars, and config files merged?
2. What precedence rules exist?
3. Is config immutable after startup?
4. Is validation centralized?

## Analysis Axes

- **Precedence clarity**: Is the order well-defined and consistent?
- **Immutability**: Can config change after initialization?
- **Validation**: Where and how are invalid configs caught?
- **Defaults strategy**: How are default values established?

## Rating

Assign a score from 1–10 based on the rubric below.

| Score | Meaning                                               |
| ----- | ----------------------------------------------------- |
| 1–3   | Config scattered randomly                             |
| 4–6   | Works but inconsistent precedence                     |
| 7–8   | Centralized config with good layering                 |
| 9–10  | Elegant, extensible, predictable configuration system |

Fast heuristic:

> “Can I easily understand flag/env/config precedence?”

## Output

Write findings to `reports/source/{NN}-{dimension-name}/{source-name}.md` using `../../templates/repo-analysis.md`.