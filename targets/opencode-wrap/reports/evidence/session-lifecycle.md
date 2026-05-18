# Evidence Pack: Session Lifecycle

## Planning Purpose

Use this pack for lifecycle state, retained runtime sessions, retry/repair continuity, cancellation, cleanup, and malformed event behavior.

## Source Reports

Primary:

- `studies/opencode-wrap-study/reports/final/02-process-session-lifecycle.md`

Supporting:

- `studies/go-cli-study/reports/final/07-state-context.md`
- `studies/go-cli-study/reports/final/08-concurrency.md`
- `studies/go-cli-study/reports/final/14-performance.md`

## Compressed Guidance

- Model lifecycle states explicitly instead of inferring from process exit or final files.
- Retain runtime sessions across related workflows when supported: retry, repair, validation follow-up, synthesis, planning, and review.
- Make session retention explicit in metadata: same session, forked session, fresh session, or unsupported.
- Cancellation and cleanup need to be part of the contract, not left to runtime-specific code.
- Treat malformed structured events as first-class lifecycle failures.

## Decisions This Pack Should Inform

- Run/session state machine.
- Session retention policy.
- Cancellation and cleanup semantics.
- Retry/repair context continuity.
- Concurrent run isolation.

## Open Questions

- When should a workflow prefer a fresh session over retained context?
- What should happen if a retained session is unavailable during retry?
- How much session state should be persisted by the SDK versus the caller?
