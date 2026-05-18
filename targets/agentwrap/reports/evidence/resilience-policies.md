# Evidence Pack: Resilience Policies

## Planning Purpose

Use this pack for health checks, startup validation, rate limits, retry, fallback, backoff, graceful degradation, and explicit failure classification.

## Source Reports

Primary:

- `studies/opencode-wrap-study/reports/final/03-resilience-fallback-and-validation.md`

Supporting:

- `studies/go-cli-study/reports/final/04-configuration-management.md`
- `studies/go-cli-study/reports/final/05-error-handling.md`
- `studies/go-cli-study/reports/final/13-security.md`

## Compressed Guidance

- Fail fast on unrecoverable health/configuration failures.
- Classify failures before policy decisions: unrecoverable, retryable, fallbackable, rate-limited, validation, cancellation, unknown.
- Keep retry/fallback/backoff composable rather than baking one flow into the runtime adapter.
- Surface rate limits as distinct events with provider/model metadata where available.
- Preserve failed attempts as useful evidence, not noise.

## Decisions This Pack Should Inform

- Error taxonomy.
- Policy interface.
- Health check scope.
- Configuration validation boundaries.
- Rate-limit hook behavior.

## Open Questions

- Which health checks are mandatory for MVP?
- How should policies express cascading provider/model/runtime fallback?
- What default behavior should be used when retryability is unknown?
