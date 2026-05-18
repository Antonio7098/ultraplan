# Evidence Pack: CLI Design

## Planning Purpose

Use this pack for the Go CLI surface that will eventually wrap or exercise the SDK. Keep it focused on product ergonomics around configuration, commands, status, diagnostics, and testability.

## Source Reports

Primary:

- `studies/go-cli-study/reports/final/01-project-structure.md`
- `studies/go-cli-study/reports/final/02-command-architecture.md`
- `studies/go-cli-study/reports/final/04-configuration-management.md`
- `studies/go-cli-study/reports/final/09-terminal-ux.md`

Supporting:

- `studies/go-cli-study/reports/final/03-dependency-injection.md`
- `studies/go-cli-study/reports/final/05-error-handling.md`
- `studies/go-cli-study/reports/final/11-testing-strategy.md`
- `studies/go-cli-study/reports/final/12-extensibility.md`

## Compressed Guidance

- Keep CLI commands thin; route runtime behavior through SDK interfaces.
- Make effective configuration visible and explainable.
- Separate user-facing output from diagnostics.
- Provide status/inspect commands for active and historical runs.
- Design commands around workflows users understand: health, run, status, cancel, inspect, validate.
- Keep CLI implementation testable with fake runtimes and fixtures.

## Decisions This Pack Should Inform

- CLI package boundaries.
- Command list and command responsibilities.
- Configuration precedence UX.
- Error/status presentation.
- Test harness for CLI and SDK integration.

## Open Questions

- Is the first CLI a thin SDK exerciser or a product CLI for UltraPlan?
- Which commands are necessary for MVP versus debugging only?
- How much runtime-native detail should the CLI expose by default?
