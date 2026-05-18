# Evidence Pack: Validation and Repair

## Planning Purpose

Use this pack for required output validation, missing file handling, report structure checks, repair prompts, and retrying in retained sessions.

## Source Reports

Primary:

- `studies/opencode-wrap-study/reports/final/03-resilience-fallback-and-validation.md`

Supporting:

- `studies/go-cli-study/reports/final/05-error-handling.md`
- `studies/go-cli-study/reports/final/06-io-abstraction.md`
- `studies/go-cli-study/reports/final/11-testing-strategy.md`

## Compressed Guidance

- Runtime success is not product success; validate expected artifacts separately.
- Validation should report expected vs observed state in a repair-friendly shape.
- Repair should be bounded and visible in run events/metadata.
- Prefer artifact-first workflows for large outputs rather than relying on captured terminal output.
- Use retained sessions for repair when supported and useful.

## Decisions This Pack Should Inform

- Validator shape.
- Repair attempt lifecycle.
- Required artifact model.
- Handling empty/malformed/missing outputs.
- Test fixtures for validation failures.

## Open Questions

- What validation primitives belong in the SDK versus caller code?
- How should repair prompts receive context without overloading runtime output limits?
- Should validation be synchronous after completion only, or also event-driven during a run?
