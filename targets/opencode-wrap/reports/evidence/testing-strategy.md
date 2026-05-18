# Evidence Pack: Testing Strategy

## Planning Purpose

Use this pack for confidence gates before implementation moves between sprints. Emphasize fake runtimes, structured event fixtures, lifecycle edge cases, and validation/repair failures.

## Source Reports

Primary:

- `studies/go-cli-study/reports/final/11-testing-strategy.md`

Supporting:

- `studies/opencode-wrap-study/reports/final/01-runtime-contract-and-api-shape.md`
- `studies/opencode-wrap-study/reports/final/02-process-session-lifecycle.md`
- `studies/opencode-wrap-study/reports/final/03-resilience-fallback-and-validation.md`
- `studies/opencode-wrap-study/reports/final/04-workflow-composition-and-observability.md`

## Compressed Guidance

- Test the SDK contract with fake runtimes before relying on OpenCode integration tests.
- Use structured event fixtures for normal, malformed, partial, and unknown event streams.
- Test cancellation, timeout, cleanup, retry, fallback, retained session behavior, validation failure, and repair exhaustion.
- Keep integration tests focused and explicit about external runtime requirements.
- After each sprint, evaluate the implementation against the same study dimensions used for reference repos.

## Decisions This Pack Should Inform

- Fake runtime design.
- Fixture layout.
- Golden event/result expectations.
- Integration test boundaries.
- Sprint acceptance checks.

## Open Questions

- Which edge cases are MVP blockers?
- How should external runtime tests be gated in CI?
- What minimum evaluation score is required before moving to the next sprint?
