# Dimension: Process and Session Lifecycle

## Purpose

Understand how robust systems start, supervise, communicate with, cancel, and clean up external runtimes. Focus on subprocesses, long-lived servers, sessions, structured JSON event streams, stdin prompts, stderr diagnostics, WebSockets, HTTP clients, and reconnect/resume behavior.

## Background

The first OpenCode wrapper may call `opencode run --format json`, but the library should not be boxed into one-shot process execution. It needs a lifecycle model that can later handle managed runtime servers, ACP peers, remote runtimes, and multiple concurrent sessions.

## Steps

1. Read `prompts/base.md` for execution instructions.
2. For the target repo:
   - Find how runtime processes or sessions are launched.
   - Trace prompt input, structured JSON decoding, stderr diagnostics, HTTP, WebSocket, RPC, or protocol transport handling.
   - Identify cancellation, timeout, signal, shutdown, and cleanup paths.
   - Look for active session/run tracking and process registries.
   - Inspect tests for hangs, crashes, no-output cases, reconnects, and cleanup.
3. Answer the questions below.

## Evidence

- Process spawn/exec code and command construction, especially structured output flags such as `--format json`
- Transport code for stdio, HTTP, WebSocket, RPC, or generated SDK calls
- Context cancellation, signal handling, timeout, kill, and cleanup code
- Active process/session registries
- Tests for process failure, cancellation, and stream handling

## Questions

1. What lifecycle states are modeled before, during, and after a run?
2. How are prompts or commands sent to the runtime?
3. How are JSON events, stderr diagnostics, protocol messages, and final outputs decoded?
4. How does cancellation propagate to subprocesses, servers, sessions, and child work?
5. What prevents leaked processes, goroutines, file handles, sockets, and sessions?
6. Is there a strategy for reconnecting to or resuming an existing session?

## Analysis Axes

- **Lifecycle explicitness**: Are states like starting, running, blocked, cancelling, failed, and completed represented?
- **Transport discipline**: Is JSON/protocol decoding separated from domain/session logic?
- **Cleanup reliability**: Are all owned resources released on success, failure, timeout, and cancellation?
- **Concurrency safety**: Can multiple runs/sessions execute without shared-state hazards?
- **Resume readiness**: Can callers reconnect, continue, or inspect partial progress?

## Rating

Assign a score from 1-10 based on the rubric below.

| Score | Meaning |
| ----- | ------- |
| 1-3 | Fire-and-forget process/session handling with likely leaks |
| 4-6 | Basic lifecycle handling but weak cleanup or state modeling |
| 7-8 | Clear lifecycle, cancellation, stream capture, and cleanup |
| 9-10 | Production-grade supervision with resume/reconnect and strong tests |

Fast heuristic:

> "If a runtime emits malformed JSON, hangs, or the parent is cancelled, do we know exactly what happens?"

## Output

Write findings to `reports/source/{NN}-{dimension-name}/{source-name}.md` using `../../templates/repo-analysis.md`.
