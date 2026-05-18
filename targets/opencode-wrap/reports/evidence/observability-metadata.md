# Evidence Pack: Observability and Metadata

## Planning Purpose

Use this pack for active run views, event projection, durable metadata, cost/time/token capture, audit trails, and synthesis handoff.

## Source Reports

Primary:

- `studies/opencode-wrap-study/reports/final/04-workflow-composition-and-observability.md`

Supporting:

- `studies/go-cli-study/reports/final/10-logging-observability.md`
- `studies/go-cli-study/reports/final/14-performance.md`
- `studies/go-cli-study/reports/final/15-philosophy.md`

## Compressed Guidance

- Products should build progress views from canonical events, not logs.
- Every run should preserve runtime, provider, model, attempt, duration, status, warnings, errors, artifacts, and usage/cost data where available.
- Metadata should identify which model/provider produced each report or artifact.
- Separate user-facing status from diagnostics.
- Persist enough event/run state for synthesis and later adversarial review.

## Decisions This Pack Should Inform

- Run record schema.
- Event sink interface.
- Usage/cost metadata fields.
- Active and historical status inspection.
- Audit trail requirements.

## Open Questions

- Which metadata fields are mandatory versus best-effort?
- How should estimated cost be represented when usage data is incomplete?
- What event retention is needed for useful dashboards without storing excessive data?
