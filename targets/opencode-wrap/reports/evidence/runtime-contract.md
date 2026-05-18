# Evidence Pack: Runtime Contract

## Planning Purpose

Use this pack when deciding the SDK's public abstraction: runtime, session, run, turn, event, artifact, usage, error, and capability boundaries.

## Source Reports

Primary:

- `studies/opencode-wrap-study/reports/final/01-runtime-contract-and-api-shape.md`

Supporting:

- `studies/go-cli-study/reports/final/03-dependency-injection.md`
- `studies/go-cli-study/reports/final/06-io-abstraction.md`
- `studies/go-cli-study/reports/final/12-extensibility.md`

## Compressed Guidance

- Keep the product-facing API runtime-neutral.
- Normalize native runtime output into canonical events, while preserving native payloads for diagnostics.
- Treat runtime-specific behavior as capabilities or metadata, not as requirements for the common path.
- Avoid over-abstracting before OpenCode's structured event path is fully understood.
- Design the first contract so a second runtime can validate or break the abstraction early.

## Decisions This Pack Should Inform

- Minimal public primitives.
- Canonical event envelope.
- Capability discovery.
- Native payload retention.
- Boundary between SDK and product workflow.

## Open Questions

- Is `session` a required primitive or an optional capability?
- Does the SDK expose workflow steps, or only runtime runs/events?
- What native runtime fields must be promoted into canonical metadata?
