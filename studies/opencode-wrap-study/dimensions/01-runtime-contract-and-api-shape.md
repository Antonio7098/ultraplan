# Dimension: Runtime Contract and API Shape

## Purpose

Define the smallest useful Go SDK contract for wrapping OpenCode first, then other runtimes later. Focus on public types, adapter boundaries, session/turn semantics, structured JSON event streams, cancellation, and how callers compose the runtime into higher-level tools.

## Background

This library should be a primitive, not an app framework. It needs a stable interface that can power tools like UltraPlan and 24-hour-testers while hiding runtime-specific mechanics such as CLI commands, OpenCode `--format json` output, HTTP SDKs, ACP sessions, permission prompts, and event formats.

## Steps

1. Read `prompts/base.md` for execution instructions.
2. For the target repo:
   - Identify public client, SDK, adapter, provider, or runtime interfaces.
   - Trace how a caller starts a session/run and sends work into it.
   - Identify the canonical result shape: structured events, messages, artifacts, errors, metadata.
   - Find how runtime-specific details are hidden or leaked.
   - Look for versioning, generated clients, schemas, and compatibility strategy.
3. Answer the questions below.

## Evidence

- Public SDK exports, interfaces, structs, generated clients, and schemas
- Session/run/turn creation APIs
- Event, message, request, response, JSON schema, and error types
- Adapter/provider registries or runtime selection mechanisms
- Tests that encode API behavior

## Questions

1. What is the core abstraction: runtime, provider, session, turn, workflow, task, or something else?
2. What is the minimal caller-facing API needed to start, send, stream, stop, and inspect a run?
3. Which runtime-specific concepts leak through the public API, and are they acceptable?
4. How are structured events and final outputs represented?
5. How are metadata fields represented for provider, model, token usage, cost, timings, and source runtime?
6. How does the design leave room for OpenCode, Codex, Claude Code, ACP, and direct LLM providers?

## Analysis Axes

- **Contract clarity**: Can the public interface be understood without reading internals?
- **Adapter isolation**: Are runtime-specific concerns contained behind narrow boundaries?
- **Composability**: Can a caller build workflows, validation, retries, and dashboards on top?
- **Event semantics**: Are structured streaming and final states explicit and lossless enough?
- **Version resilience**: Is there a plan for schema/API drift?

## Rating

Assign a score from 1-10 based on the rubric below.

| Score | Meaning |
| ----- | ------- |
| 1-3 | API is implicit, app-specific, or tightly coupled to one runtime |
| 4-6 | Usable API exists but runtime details leak heavily |
| 7-8 | Clear interfaces with manageable runtime-specific escape hatches |
| 9-10 | Small, stable, extensible SDK contract with strong type boundaries |

Fast heuristic:

> "Could this API support a second runtime without redesigning the caller?"

## Output

Write findings to `reports/source/{NN}-{dimension-name}/{source-name}.md` using `../../templates/repo-analysis.md`.
