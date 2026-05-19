# Sprint Tracker: Retry, Backoff, Fallback, and Rate Limits

> Target: agentwrap
> Sprint ID: 06-resilience-policies
> Created: 2026-05-19
> Reasoning: `targets/agentwrap/sprints/06-resilience-policies/reasoning.md`
> Roadmap Section: `targets/agentwrap/roadmap.md` - `## Sprint 6: Retry, Backoff, Fallback, and Rate Limits`

## Sprint Overview

- **Sprint Name:** Retry, Backoff, Fallback, and Rate Limits
- **Sprint Focus:** Add a runtime-neutral resilience policy executor, policy primitives, attempt metadata, retry/backoff/fallback/rate-limit events, and fake-runtime tests for bounded policy behavior.
- **Depends On:** Sprint 2 runtime contract/error/event types; Sprint 3 OpenCode adapter; Sprint 4 lifecycle/session/cancellation/cleanup semantics; Sprint 5 health/config preflight and effective config.
- **Status:** Complete

## Requirement Links

- `targets/agentwrap/sources/PRD.md` - graceful degradation, rate limits and transient failures, retained runtime context, observability metadata, product-agnostic SDK boundary, and non-goals.
- `targets/agentwrap/sources/TRD.md` - retry/fallback/backoff, rate-limit handling, canonical retry/fallback/rate-limit events, lifecycle states, metadata requirements, error model, configuration, concurrency limit representation, and extensibility.
- `targets/agentwrap/sources/feature-architecture.md` - state ownership, runtime/logic/infra separation, minimal abstraction rule, and explicit state transitions.
- `targets/agentwrap/roadmap.md` - Sprint 6 goal, scope, output, evidence inputs, and quality gate.
- `targets/agentwrap/sprints/06-resilience-policies/reasoning.md` - policy boundary decisions, evidence, deviations, assumptions, risks, and expected evidence this tracker executes.

## Evidence Links

- `targets/agentwrap/reports/evidence/resilience-policies.md` - policy composition, failure classification, rate-limit distinction, fail-fast boundaries, and attempt preservation.
- `targets/agentwrap/reports/evidence/session-lifecycle.md` - explicit lifecycle/session state, retained-session decisions, cancellation/cleanup semantics, and malformed-event failure treatment.
- `studies/opencode-wrap-study/reports/final/03-resilience-fallback-and-validation.md` - first-class policy abstraction need, bounded retries, backoff, rate-limit metadata, failed-attempt evidence, and no hard-coded adapter policy.
- `studies/opencode-wrap-study/reports/final/02-process-session-lifecycle.md` - state machines, cleanup, session relationships, and no guaranteed mid-run resume.
- `studies/go-cli-study/reports/final/05-error-handling.md` - typed errors, behavioral retry/fatal classification, and user-safe versus diagnostic separation.
- `studies/go-cli-study/reports/final/04-configuration-management.md` - source-aware effective config and immutable setup feeding policy decisions.
- `studies/go-cli-study/reports/final/07-state-context.md` - context propagation, cancellation-aware loops, and avoiding hidden global policy state.
- `/home/antonioborgerees/coding/agentwrap/runtime.go` - existing `Runtime`, `Run`, and `RunRequest` surface to wrap.
- `/home/antonioborgerees/coding/agentwrap/errors.go` - existing `SDKError` classifications and behavioral flags.
- `/home/antonioborgerees/coding/agentwrap/events.go` - existing canonical retry, fallback, and rate-limit event categories.
- `/home/antonioborgerees/coding/agentwrap/metadata.go` - existing run/session metadata and attempt fields to extend.
- `/home/antonioborgerees/coding/agentwrap/health.go` - existing health preflight types and required health failure semantics.
- `/home/antonioborgerees/coding/agentwrap/opencode/runtime.go` - OpenCode strict attempt execution that must remain policy-free.
- `/home/antonioborgerees/coding/agentwrap/internal/testkit/fake_runtime.go` - deterministic fake runtime base for policy tests.

## Sprint Goals

- **Primary Goal:** A caller can run a task through policy orchestration and express bounded retry, backoff, fallback, and rate-limit handling without OpenCode-specific branching.
- **Secondary Goals:**
  - Define small policy primitives for context, decision, backoff, fallback alternative, rate-limit info, attempt summary, and policy exhaustion.
  - Emit canonical retry, fallback, and rate-limit events with logical correlation and attempt metadata.
  - Preserve every failed and successful attempt in result metadata, including runtime/provider/model/session/error/timing details.
  - Support explicit policy decisions about same-session, forked-session, fresh-session, and unsupported-session behavior.
  - Add deterministic fake-runtime tests for retryable, fallbackable, unrecoverable, rate-limited, unknown, health/config, cancellation, and max-attempt behavior.

## Scope

- Add runtime-neutral public policy types, including `ResiliencePolicy`, `PolicyContext`, `PolicyDecision`, `PolicyDecisionKind`, `BackoffPolicy`, `FallbackAlternative`, `RateLimitInfo`, `AttemptSummary`, and policy execution result metadata.
- Add a policy executor/wrapper that accepts a base `RunRequest`, one or more runtime alternatives, and a policy or policy chain, then starts attempts through existing `Runtime.StartRun`.
- Add bounded built-in policy helpers for common behavior, such as max attempts, fixed/exponential backoff with cap, jitter hook or deterministic jitter seam, retryable-error retry, rate-limit retry-after handling, and ordered fallback alternatives.
- Add `OnRateLimit` handling through policy context/decision flow so callers can wait, retry, fallback, or stop on a rate-limit signal.
- Add attempt metadata that records original logical run ID, attempt number, runtime run ID, parent/original references, runtime/provider/model, effective request values, session action/relationship, started/finished time, duration, error category, decision reason, and final status.
- Emit canonical `EventRetry`, `EventFallback`, and `EventRateLimit` events from the policy executor, not from individual adapters.
- Preserve adapter events from each attempt while adding logical policy correlation and enough metadata for a dashboard to group attempts.
- Add rate-limit metadata model and tests for retry-after/reset handling, provider/model propagation, safe user details, and native metadata preservation.
- Add explicit session behavior to policy decisions so retries/fallbacks can request same session, fork, fresh session, default behavior, or unsupported/fail-fast handling.
- Respect Sprint 5 required health/config preflight and do not hide unrecoverable setup failures behind implicit retries.
- Extend or add test fakes under test-only/internal boundaries so policy behavior is deterministic without live OpenCode/provider credentials.
- Update package docs/README and `DECISIONS.md` after implementation confirms public policy choices.

## Non-Scope

- Do not implement output validation, validator schemas, report-section checks, artifact validation, validation execution, repair prompts, or repair attempts; Sprint 7 owns those.
- Do not implement durable persistence, active-run stores, historical inspection, replay, or dashboard APIs; Sprint 8 owns those.
- Do not add global circuit breakers or provider-wide throttling. Leave extension room but require separate evidence before implementing.
- Do not add product workflow composition, DAGs, UltraPlan study/sprint planning logic, scoring, report templates, or product-specific fallback chains.
- Do not add CLI commands or executable UX.
- Do not make the OpenCode adapter silently retry, fallback, or sleep internally.
- Do not parse arbitrary provider rate-limit text broadly without fixture or live evidence.
- Do not require a real second runtime; use fake runtime alternatives for fallback tests until a later sprint adds another adapter.
- Do not define the final Sprint 7 validation result schema beyond the minimal placeholder needed for policy context compatibility.

## Proposed Implementation Shape

- **Package / Module Boundaries:** Keep runtime-neutral policy types in the root `agentwrap` package if they are caller-facing. Keep fake policy helpers in tests or `internal/testkit`. Keep adapter-specific rate-limit parsing, if any, in `agentwrap/opencode`, but keep policy execution outside adapters.
- **Public Surface:** Prefer a small function/type such as `PolicyRunner`, `RunWithPolicy`, or `Runner` that wraps existing `Runtime` values. Expose policy context/decision/rate-limit/attempt metadata as SDK types. Do not add retry methods to `Runtime` unless implementation proves the wrapper cannot satisfy requirements.
- **State And Lifecycle:** One logical policy execution owns a sequence of runtime attempts. Active attempts use existing `Run` lifecycle; the policy executor adds `retrying`, `fallback`, and backoff wait transitions through canonical events and metadata.
- **Error And Failure Behavior:** Use existing `SDKError` categories and behavioral flags. Unknown and unrecoverable failures stop by default. Retry/fallback occurs only when policy allows it. Exhaustion returns an explicit classified failure and attempt history.
- **Observability:** Emit `EventRateLimit`, `EventRetry`, and `EventFallback` with attempt number, runtime/provider/model, delay, next target, session action, safe reason, and policy name where available. Preserve failed attempts even when a later fallback succeeds.
- **Testing Surface:** Use table-driven tests with fake runtimes, fake clocks, deterministic backoff, and fixture events. Default tests must not require OpenCode, provider credentials, or network access.

## Decisions

- [x] **Decision 1: Add Policy Executor Outside Runtime Adapters**
  > **Requirement:** PRD runtime-neutral interface and TRD composable retry/fallback/backoff.
  > **Evidence:** `reasoning.md` Decision Area 1; `resilience-policies.md`; `studies/opencode-wrap-study/reports/final/03-resilience-fallback-and-validation.md`; current `Runtime` and OpenCode adapter boundaries.
  > **Tradeoff:** Adds a new orchestration layer before a second real runtime exists.
  > **Rejected Alternative:** Put retry/fallback logic in OpenCode or require every runtime to implement policy methods.
  > **Risk / Follow-up:** Keep this layer limited to resilience attempts, not workflow/DAG composition.

- [x] **Decision 2: Use Explicit Policy Context And Decisions With Conservative Defaults**
  > **Requirement:** TRD policy inspection of error, attempt, runtime, provider, model, validation result, and rate-limit metadata.
  > **Evidence:** `reasoning.md` Decision Area 2; Go error-handling evidence; current `SDKError` behavioral flags.
  > **Tradeoff:** Callers must opt into richer behavior rather than receiving broad automatic retries by default.
  > **Rejected Alternative:** Static retry structs only or callback-only policy hooks.
  > **Risk / Follow-up:** Revisit validation-result fields in Sprint 7 after validators exist.

- [x] **Decision 3: Preserve Attempt History As First-Class Metadata**
  > **Requirement:** TRD attempt metadata and original-run relationship; PRD observability and metadata.
  > **Evidence:** `reasoning.md` Decision Area 3; current event correlation and metadata fields.
  > **Tradeoff:** Result metadata grows before persistence is implemented.
  > **Rejected Alternative:** Return only the final successful attempt and hide failed attempts.
  > **Risk / Follow-up:** Sprint 8 should persist attempt metadata and policy events.

- [x] **Decision 4: Model Rate Limits Separately From Generic Retryable Failures**
  > **Requirement:** PRD/TRD rate-limit handling and caller-visible rate-limit events.
  > **Evidence:** `reasoning.md` Decision Area 4; `EventRateLimit`; `ErrorRateLimit`; resilience evidence about retry hints and structured rate-limit metadata.
  > **Tradeoff:** Real provider-specific detection may initially be partial.
  > **Rejected Alternative:** Treat rate limits only as generic `Retryable` errors.
  > **Risk / Follow-up:** Add real OpenCode rate-limit fixtures when available.

- [x] **Decision 5: Make Session Continuity Explicit Per Policy Decision**
  > **Requirement:** PRD retained runtime context; TRD retry/fallback session behavior.
  > **Evidence:** `reasoning.md` Decision Area 5; `session-lifecycle.md`; DEC-011; current session action/relationship vocabulary.
  > **Tradeoff:** Built-in policies are more conservative and may not reuse context unless configured.
  > **Rejected Alternative:** Always retry in the same session or always start fresh.
  > **Risk / Follow-up:** Verify OpenCode same-session behavior with real runtime evidence before relying on it operationally.

## Execution Checklist

- [x] **Task 1: Define Policy Primitives**
  > *Description: Establish the smallest runtime-neutral policy vocabulary that can express retry, fallback, backoff, rate-limit, stop, and session decisions.*
  - [x] **Sub-task 1.1:** Add `PolicyContext` with original request, current attempt, prior attempts, runtime/provider/model context, effective config if available, current `SDKError`, optional validation result placeholder, optional `RateLimitInfo`, session metadata, elapsed time, and caller metadata.
  - [x] **Sub-task 1.2:** Add `PolicyDecision` with decision kind, reason, safe detail, next request mutation or runtime alternative, backoff delay, session action, rate-limit handling metadata, and native/debug metadata.
  - [x] **Sub-task 1.3:** Add decision kinds for stop, retry, wait, fallback, and no-op/continue if implementation needs it.
  - [x] **Sub-task 1.4:** Add `ResiliencePolicy` interface and small composition helpers without introducing workflow/DAG abstractions.
  - [x] **Sub-task 1.5:** Add tests for policy context immutability and decision validation.

- [x] **Task 2: Implement Bounded Backoff And Built-In Policy Helpers**
  > *Description: Provide safe defaults and common pieces callers can compose without making retry behavior implicit or unbounded.*
  - [x] **Sub-task 2.1:** Add fixed and exponential backoff helpers with max delay, max attempts, and deterministic test seam for jitter.
  - [x] **Sub-task 2.2:** Honor `RateLimitInfo.RetryAfter` or reset time before generic backoff when policy allows waiting.
  - [x] **Sub-task 2.3:** Add helpers for retrying only retryable categories/flags and stopping unknown/unrecoverable failures.
  - [x] **Sub-task 2.4:** Add ordered fallback helper that can switch runtime/provider/model/request values and record fallback reason.
  - [x] **Sub-task 2.5:** Add max-attempt and max-elapsed-time exhaustion behavior with classified failure.

- [x] **Task 3: Add Policy Executor / Runtime Wrapper**
  > *Description: Execute attempts through existing runtimes while policy code owns retry/fallback/backoff sequencing.*
  - [x] **Sub-task 3.1:** Add a runner/wrapper entrypoint that accepts context, base `RunRequest`, primary runtime, optional alternatives, and policy.
  - [x] **Sub-task 3.2:** Start each attempt with `Runtime.StartRun` and preserve adapter errors exactly as classified.
  - [x] **Sub-task 3.3:** Consume attempt events and final result, then evaluate policy only at defined decision points.
  - [x] **Sub-task 3.4:** Make backoff waits context-aware and cancellation-safe.
  - [x] **Sub-task 3.5:** Cancel active attempts when the logical policy run is cancelled.
  - [x] **Sub-task 3.6:** Ensure OpenCode adapter code remains free of hard-coded retry/fallback/backoff policy.

- [x] **Task 4: Record Attempt Metadata And Policy Events**
  > *Description: Make every policy action visible and reconstructable without adapter logs.*
  - [x] **Sub-task 4.1:** Add attempt summary metadata for attempt number, runtime run ID, parent/original run ID, runtime/provider/model, session request/result, status, timing, error category, and native metadata references.
  - [x] **Sub-task 4.2:** Add policy metadata for decision history, final decision, exhausted reason, and selected final attempt.
  - [x] **Sub-task 4.3:** Emit `EventRetry` for retry decisions and backoff waits, including attempt number, delay, reason, and next session action.
  - [x] **Sub-task 4.4:** Emit `EventFallback` for provider/model/runtime/request fallback decisions, including source and target context.
  - [x] **Sub-task 4.5:** Preserve attempt event correlation under one logical policy correlation ID.
  - [x] **Sub-task 4.6:** Add tests proving failed attempts remain visible after a later success.

- [x] **Task 5: Implement Rate-Limit Metadata And Hook Behavior**
  > *Description: Let callers and policies distinguish provider/runtime rate limits from generic errors.*
  - [x] **Sub-task 5.1:** Add `RateLimitInfo` with provider, model, scope, limit name, retry-after duration, reset time, remaining/limit values, source, safe detail, and native metadata.
  - [x] **Sub-task 5.2:** Map `SDKError{Category: ErrorRateLimit}` and canonical `EventRateLimit` into policy context.
  - [x] **Sub-task 5.3:** Add `OnRateLimit` policy hook/path that can return wait, retry, fallback, or stop.
  - [x] **Sub-task 5.4:** Emit `EventRateLimit` from the policy executor when a rate limit is detected or synthesized from a classified failure.
  - [x] **Sub-task 5.5:** Add fake fixtures for rate-limit with retry-after, reset time, no timing hint, provider-only metadata, and model-specific metadata.
  - [x] **Sub-task 5.6:** If OpenCode rate-limit parsing is added, keep it adapter-local, redacted, fixture-backed, and narrowly scoped.

- [x] **Task 6: Support Explicit Session Decisions Across Attempts**
  > *Description: Preserve context only when policy explicitly asks for it and runtime metadata can represent the outcome.*
  - [x] **Sub-task 6.1:** Add session action fields to policy decisions and attempt request derivation.
  - [x] **Sub-task 6.2:** Support default/fresh/continue/fork/replace/release request derivation using existing `SessionAction` and `SessionRelationship` vocabulary.
  - [x] **Sub-task 6.3:** Record requested and resolved session relationships in attempt summaries.
  - [x] **Sub-task 6.4:** Add fake tests for same-session retry, fresh retry, unsupported fork, fallback to runtime without session support, and best-effort retention.
  - [x] **Sub-task 6.5:** Keep built-in policies conservative; no implicit same-session retry after malformed or unknown failures.

- [x] **Task 7: Fake Runtime Test Matrix**
  > *Description: Prove policy behavior deterministically without live OpenCode or provider access.*
  - [x] **Sub-task 7.1:** Add or extend fake runtimes for scripted success, retryable failure, fallbackable failure, unrecoverable failure, unknown failure, rate limit, health/config failure, timeout, cancellation, and event streams.
  - [x] **Sub-task 7.2:** Test `retry -> success` with bounded attempts and emitted retry event.
  - [x] **Sub-task 7.3:** Test `retry -> fallback -> retry -> success` without adapter-specific branching.
  - [x] **Sub-task 7.4:** Test unrecoverable/config/auth/permission failures stop unless explicit fallback policy supplies a viable alternative.
  - [x] **Sub-task 7.5:** Test unknown failures do not retry by default.
  - [x] **Sub-task 7.6:** Test cancellation during active attempt and during backoff.
  - [x] **Sub-task 7.7:** Test required health failure from Sprint 5 remains visible and does not get silently retried.

- [x] **Task 8: Documentation And Decision Log**
  > *Description: Record the public policy behavior only after implementation and tests confirm it.*
  - [x] **Sub-task 8.1:** Update root docs/README with policy executor usage, default behavior, rate-limit handling, attempt metadata, and cancellation semantics.
  - [x] **Sub-task 8.2:** Add `DECISIONS.md` entries for implementation-confirmed policy executor boundary, policy decision model, attempt metadata, rate-limit model, and session continuity behavior.
  - [x] **Sub-task 8.3:** Record any OpenCode rate-limit detection evidence or explicit deferral.
  - [x] **Sub-task 8.4:** Record deviations if implementation changes the planned API shape.

## Testing And Documentation Checklist

- [x] **Unit Tests:** policy decision validation, built-in retry/fallback/backoff helpers, max-attempt exhaustion, unknown/unrecoverable stop defaults, rate-limit metadata, and session decision derivation.
- [x] **Fixture Tests:** fake runtime event streams for retryable, fallbackable, unrecoverable, rate-limited, unknown, timeout, cancellation, health/config, malformed-event, and final success cases.
- [x] **Integration Tests:** policy executor wrapping the fake runtime and OpenCode adapter start path with fake process runner; no live OpenCode required by default.
- [x] **Real Runtime Smoke:** deferred because the sprint specifically needs rate-limit behavior and forcing a real provider rate limit would be unsafe, slow, and environment-dependent. Fake fixtures and the OpenCode fake-process policy wrapper test cover the sprint contract.
- [x] **Documentation Updates:** package docs/README and `targets/agentwrap/DECISIONS.md` after implementation confirms the public policy model.

## Risks And Blockers

| Risk | Impact | Mitigation | Status |
| --- | --- | --- | --- |
| Policy layer grows into product workflow orchestration | High | Implemented `PolicyRunner` as attempt orchestration only; no workflow/DAG/product concepts added | Closed |
| Unknown failures retry by accident | High | `BasicPolicy` stops `ErrorUnknown` by default; covered by `TestBasicPolicyDoesNotRetryUnknownByDefault` | Closed |
| Backoff cancellation leaks goroutines or blocks shutdown | High | Policy waits use context-aware sleep; covered by `TestPolicyRunnerCancellationDuringBackoff` | Mitigated |
| Rate-limit detection from real OpenCode is incomplete | Medium | Added `RateLimitInfo`, fake tests, explicit real-rate-limit smoke deferral, and adapter-local parsing for the evidence-backed OpenCode HTTP/session patterns; broader live coverage still needs real samples | Mitigated |
| Attempt history is lost after successful fallback | High | Added `RunMetadata.Attempts` and `RunMetadata.Policy`; covered by fallback success tests | Closed |
| Same-session retry carries corrupted context | Medium | Session action remains explicit in `PolicyDecision`; no implicit same-session retry added | Mitigated |
| API over-abstracts before second real runtime | Medium | Kept surface small: `PolicyRunner`, `ResiliencePolicy`, `BasicPolicy`, metadata; fallback tested with fake runtimes | Mitigated |
| Required health/config failures are hidden by fallback logic | Medium | Start failures are preserved as classified attempt errors and policy fallback requires explicit policy behavior | Mitigated |

## Open Questions

- Which OpenCode surfaces reliably expose rate limits? - Implemented adapter-local parsing for structured error payloads and stderr JSON/text using the provided OpenCode evidence. Live samples are still needed before claiming broader provider coverage.
- Should the built-in default policy retry any failure automatically? - No. `BasicPolicy{}` stops by default; callers must configure `MaxAttemptsPerTarget` and alternatives.
- What exact validation-result placeholder should exist before Sprint 7? - Implemented minimal `ValidationResult` with `Passed`, `Errors`, and `Native`; revisit in Sprint 7.
- Should attempts have separate public `AttemptID` values? - No for Sprint 6. Attempt number plus runtime `RunID` is sufficient; revisit if persistence needs stable independent attempt IDs.
- How should cancellation during backoff be represented in final metadata? - Represented as a failed/cancelled logical policy result with latest attempt history and classified cancellation/timeout error.

## Success Criteria

- [x] **Success Criteria 1:** A caller can express `retry -> fallback -> retry` using runtime-neutral policy primitives and fake runtimes.
- [x] **Success Criteria 2:** Policy execution does not require OpenCode-specific branching and does not add hidden retry logic inside the OpenCode adapter.
- [x] **Success Criteria 3:** Rate limits are represented separately from generic failures through `ErrorRateLimit`, `RateLimitInfo`, `EventRateLimit`, and policy context.
- [x] **Success Criteria 4:** Retry/backoff behavior is bounded by max attempts or max elapsed time and is cancellation-aware.
- [x] **Success Criteria 5:** Unknown and unrecoverable failures do not retry by default.
- [x] **Success Criteria 6:** Every attempt is traceable to the original logical run with runtime run ID, attempt number, runtime/provider/model, session relationship, timing, status, and error metadata.
- [x] **Success Criteria 7:** Failed attempts remain visible even if a later retry or fallback succeeds.
- [x] **Success Criteria 8:** Policies can request retained-session reuse, fork, fresh session, or default behavior, and resolved relationships are recorded.
- [x] **Success Criteria 9:** Required health/config failures from Sprint 5 remain explicit and are not silently hidden by policy execution.
- [x] **Success Criteria 10:** Default tests pass without OpenCode installed, provider credentials, network access, or a real rate-limit event.

## Study Evaluation

- [x] **Patterns Followed:** typed error-based policy decisions, bounded retry, server-guided retry-after handling where available, explicit retry state, failed-attempt preservation, context-aware cancellation, explicit session state, and fake-first tests.
- [x] **Anti-Patterns Avoided:** unbounded retry, retrying unknown failures by default, adapter-local hard-coded policy chains, hidden failed attempts, broad untested provider string parsing, global circuit breakers without evidence, product workflow composition, and implicit same-session retry.
- [x] **Comparison Needed:** Compare implementation against `resilience-policies.md`, `session-lifecycle.md`, resilience final report anti-patterns, Go error-handling behavioral classification, and state/context cancellation guidance.
- [x] **Proceed / Iterate:** Proceed to Sprint 7 only if retry/fallback/backoff/rate-limit policy behavior is bounded, observable, fake-testable, and leaves validation/repair architecture intentionally open.

## Review And Sign-Off

- Sprint Status: Complete
- Completion Date: 2026-05-19

## Execution Evidence

- Planning artifacts created on 2026-05-19:
  - `targets/agentwrap/sprints/06-resilience-policies/reasoning.md`
  - `targets/agentwrap/sprints/06-resilience-policies/plan.md`
- Planning scope confirmed:
  - Policy executor wraps runtimes rather than changing adapter semantics.
  - Validation/repair remains Sprint 7.
  - Persistence remains Sprint 8.
  - Circuit breakers and global provider throttling remain deferred.
  - Default verification should use fake runtimes and deterministic clocks.
- Implementation artifacts created on 2026-05-19:
  - `/home/antonioborgerees/coding/agentwrap/policy.go` - `PolicyRunner`, `ResiliencePolicy`, `BasicPolicy`, backoff helpers, `RateLimitInfo`, policy decisions, attempt execution, and policy events.
  - `/home/antonioborgerees/coding/agentwrap/policy_test.go` - fake-runtime tests for retry, fallback, unknown stop defaults, rate-limit handling, retry-after behavior, cancellation during backoff, and exponential backoff caps.
  - `/home/antonioborgerees/coding/agentwrap/metadata.go` - `AttemptSummary`, `AttemptRequest`, `PolicyMetadata`, and `PolicyDecisionRecord`.
  - `/home/antonioborgerees/coding/agentwrap/opencode/rate_limit.go` - adapter-local OpenCode rate-limit classification and metadata extraction from structured error payloads, stderr JSON/text, retry-after headers, and OpenAI/Anthropic rate-limit headers.
  - `/home/antonioborgerees/coding/agentwrap/opencode/runtime_test.go` - fake-process test proving `PolicyRunner` wraps OpenCode attempts without moving retry into the adapter.
  - `/home/antonioborgerees/coding/agentwrap/README.md` and `/home/antonioborgerees/coding/agentwrap/doc.go` - policy semantics and scope guardrails.
  - `targets/agentwrap/DECISIONS.md` - DEC-016 through DEC-020 for policy runner boundary, policy context/defaults, attempt metadata, rate-limit metadata, and explicit session continuity.
- Verification:
  - `go test ./...` failed because the sandbox could not write to `/home/antonioborgerees/.cache/go-build`.
  - `env GOCACHE=/tmp/agentwrap-gocache go test ./...` passed.
- Additional evidence used during execution:
  - User-provided OpenCode rate-limit evidence for `packages/llm/src/route/executor.ts`, `packages/opencode/src/session/retry.ts`, and `packages/opencode/src/session/message-v2.ts` informed adapter-local parsing of `429`, `503`, `504`, `529`, `retry-after-ms`, `retry-after`, OpenAI `x-ratelimit-*`, Anthropic `anthropic-ratelimit-*`, JSON `too_many_requests` and `resource_exhausted`, OpenCode `FreeUsageLimitError` and `GoUsageLimitError`, and quota exclusions such as `insufficient_quota` and `quota_exceeded`.
- Deferrals:
  - Real rate-limit smoke is deferred because intentionally forcing provider rate limits is unsafe and environment-dependent. Sprint 6 uses fake rate-limit fixtures and records the OpenCode parsing question for future evidence.
  - No broader provider-specific parsing was added beyond the evidence-backed OpenCode patterns above because no additional live samples were available.
