# Dimension: Terminal UX & Interaction Design

## Purpose

Understand how elite Go CLI projects handle terminal rendering, interactive prompts, loading states, and streaming text. Focus on UX quality and interruptibility.

## Background

CLI UX is often an afterthought but makes the difference between tools people love and tools people tolerate. Elite CLIs handle terminal rendering, interactive flows, and streaming output gracefully.

## Steps

1. Read `prompts/base.md` for execution instructions.
2. For each repo in the group:
   - Identify terminal rendering libraries (BubbleTea, tview, etc.)
   - Look for interactive prompt implementation
   - Find loading state or progress indicators
   - Check streaming text handling
3. Answer the questions below for each repo.

## Evidence

- Terminal library usage
- Prompt implementation
- Progress or loading indicators
- Streaming output handling
- Interruptible UX patterns

## Questions

1. How is terminal rendering handled?
2. How are loading states shown?
3. How are prompts implemented?
4. Is the UX interruptible?

## Analysis Axes

- **Library choice**: What terminal rendering approach is used?
- **Interactivity**: Are interactive flows well-designed?
- **Progress feedback**: Are long operations informative?
- **Streaming**: Is streaming text handled gracefully?

## Rating

Assign a score from 1–10 based on the rubric below.

| Score | Meaning                         |
| ----- | ------------------------------- |
| 1–3   | Clunky/unfriendly UX            |
| 4–6   | Functional but rough            |
| 7–8   | Thoughtful and polished         |
| 9–10  | Exceptional terminal experience |

Fast heuristic:

> “Would developers enjoy using this daily?”

## Output

Write findings to `reports/source/{NN}-{dimension-name}/{source-name}.md` using `../../templates/repo-analysis.md`.