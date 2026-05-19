# Sprint Reasoning: Retry, Backoff, Fallback, and Rate Limits

> Target: agentwrap
> Sprint ID: 06-resilience-policies
> Output: `targets/agentwrap/sprints/06-resilience-policies/reasoning.md`
> Sprint Tracker: `targets/agentwrap/sprints/06-resilience-policies/plan.md`

## Overview

**Sprint:** Retry, Backoff, Fallback, and Rate Limits
**Purpose:** Add runtime-neutral resilience policy primitives and a testable policy execution layer so callers can express bounded retry, backoff, fallback, and rate-limit handling without adapter-specific branching.
**Roadmap Section:** `targets/agentwrap/roadmap.md` - `## Sprint 6: Retry, Backoff, Fallback, and Rate Limits`
**Depends On:** Sprint 2 runtime contract/error/event vocabulary, Sprint 3 OpenCode adapter strict failure semantics, Sprint 4 lifecycle/session cleanup and retained-session metadata, and Sprint 5 health/config preflight and effective configuration.
**Reasoning Status:** Ready For Tracker

## Target Sources

- `targets/agentwrap/sources/PRD.md` - graceful degradation, rate-limit/transient failure handling, retained runtime context, observability metadata, product-agnostic runtime abstraction, and non-goals that keep UltraPlan workflow logic out of the SDK.
- `targets/agentwrap/sources/TRD.md` - retry/fallback/backoff requirements, rate-limit handling, lifecycle states, canonical retry/fallback/rate-limit events, metadata requirements, error model, configuration requirements, concurrency limit representation, and extensibility.
- `targets/agentwrap/sources/feature-architecture.md` - state-first ownership, runtime versus logic separation, minimal abstraction rule, explicit state transitions, and collapse check against over-modularisation.
- `targets/agentwrap/roadmap.md` - Sprint 6 goal, scope, evidence inputs, outputs, and quality gate.

## Evidence Basis

**Evidence Status:** Complete for Sprint 6 planning. The required roadmap evidence packs and final reports were loaded. Per-source reports were not opened because the evidence packs, final reports, decision log, and current implementation references were enough to make the sprint decisions.
**Context Strategy:** Staged loading used. Planning loaded the PRD/TRD/feature protocol, roadmap sprint section, `study-index.md`, `resilience-policies.md`, `session-lifecycle.md`, the roadmap-listed final reports for resilience/error/config/state/session lifecycle, current sprint 5 artifacts, current decision log, and targeted code references in `agentwrap`.

### Evidence Packs Used

- `targets/agentwrap/reports/evidence/resilience-policies.md` - policy interface shape, failure classification, rate-limit distinction, fail-fast boundaries, and attempt preservation.
- `targets/agentwrap/reports/evidence/session-lifecycle.md` - explicit lifecycle states, retained-session behavior across retry/fallback, cancellation/cleanup boundaries, and malformed-event failure treatment.

### Final Reports Used

- `studies/opencode-wrap-study/reports/final/03-resilience-fallback-and-validation.md` - supports first-class composable policy abstraction, bounded retry with backoff, rate-limit metadata, failed-attempt evidence, and avoiding hard-coded adapter retry loops.
- `studies/opencode-wrap-study/reports/final/02-process-session-lifecycle.md` - supports explicit state machines, scope-bound cleanup, session relationship metadata, and no claim of true mid-run resume.
- `studies/go-cli-study/reports/final/05-error-handling.md` - supports typed errors, behavioral retry/fatal classification, sentinel/programmatic handling, and user-facing versus diagnostic separation.
- `studies/go-cli-study/reports/final/04-configuration-management.md` - supports explicit source-aware configuration and immutable run setup feeding policy decisions.
- `studies/go-cli-study/reports/final/07-state-context.md` - supports context propagation, cancellation-aware loops, centralized state ownership, and avoiding hidden global policy state.

### Per-Source Reports Used

- None. The sprint decisions are justified by evidence packs, final reports, accepted decisions, and current implementation references. If implementation needs exact behavior from a studied repo, open the cited source reports narrowly and record the added evidence in execution notes.

### Code References Used

- `/home/antonioborgerees/coding/agentwrap/runtime.go:9` - current public `Runtime` and `Run` contracts are small and should not be burdened with one adapter-specific retry loop.
- `/home/antonioborgerees/coding/agentwrap/runtime.go:23` - `RunRequest` already carries runtime/provider/model/session/timeout/metadata and health requirements; policy execution can derive per-attempt requests from this shape.
- `/home/antonioborgerees/coding/agentwrap/errors.go:19` - `ErrorRateLimit` exists as a distinct category.
- `/home/antonioborgerees/coding/agentwrap/errors.go:38` - `SDKError` already exposes `Retryable`, `Fallbackable`, `UserActionable`, and `Unrecoverable` flags for policy decisions.
- `/home/antonioborgerees/coding/agentwrap/events.go:42` - canonical event categories already include `rate_limit`, `retry`, and `fallback`.
- `/home/antonioborgerees/coding/agentwrap/metadata.go:17` - `RunMetadata` already includes `ParentRunID`, `Attempt`, context, session, errors, and native metadata.
- `/home/antonioborgerees/coding/agentwrap/health.go:9` - Sprint 5 added optional `HealthChecker`, which policy execution can use before launching attempts without changing `Runtime`.
- `/home/antonioborgerees/coding/agentwrap/health.go:121` - `RequiredHealthFailure` already gives fail-fast preflight behavior that policy code must respect rather than hide.
- `/home/antonioborgerees/coding/agentwrap/opencode/runtime.go:20` - OpenCode `StartRun` currently validates sessions and required health before launching a process; Sprint 6 should wrap this behavior rather than move policy decisions into the adapter.
- `/home/antonioborgerees/coding/agentwrap/opencode/health.go:17` - OpenCode implements health probes and returns unknown/degraded outcomes where readiness cannot be proven.
- `/home/antonioborgerees/coding/agentwrap/internal/testkit/fake_runtime.go:17` - fake runtime provides deterministic execution evidence and should be extended or paired with policy test fakes.

### Evidence Rejected Or Not Used

- **Circuit breaker design:** The resilience final report notes no studied repo implements a circuit breaker. Sprint 6 should not introduce a circuit breaker unless policy primitives leave room for one later.
- **Output validation and repair evidence:** Not used for implementation scope. Sprint 6 may carry a placeholder policy context field for validation results because the roadmap requires policy inspection of validation result, but Sprint 7 owns validators, repair prompts, and validation-informed retry behavior.
- **Workflow/DAG composition:** Rejected as non-scope. PRD/TRD keep product workflows outside the SDK, and Sprint 6 should not add UltraPlan-specific workflow sequencing.
- **OpenCode user-facing retry UI or upsell actions:** Not copied. The SDK is a library layer and should expose typed policy decisions/events, not application UI actions.
- **Durable retry state/persistence:** Not in Sprint 6. The resilience final report warns in-memory retry state is not durable; Sprint 8 owns persistence and historical inspection.
- **Real provider throttle management:** Not enough evidence for a shared provider limiter in this sprint. Represent rate-limit metadata and caller-defined limits, but do not build global cross-process throttling.

## Requirement Map

### Requirement Index Used In This Sprint

| Requirement | Source | Area | Applicability | Why It Matters For This Sprint |
| --- | --- | --- | --- | --- |
| Caller-configurable retry, fallback, and validation flows | PRD Graceful Degradation | Policy composition | Applicable | Sprint 6 must let callers express retry/fallback/backoff behavior without custom runtime-specific branching. |
| Policies composable, not hard-coded | TRD Retry, Fallback, and Backoff | Policy API | Applicable | The policy model must support sequences such as `retry -> fallback -> retry` without baking one flow into OpenCode. |
| Policy can inspect error, attempt count, runtime, provider, model, validation result, and rate-limit metadata | TRD Retry, Fallback, and Backoff | Policy input | Applicable | This defines the required `PolicyContext` fields even though validation result is mostly a Sprint 7 placeholder. |
| Policy can stop with explicit failure | TRD Retry, Fallback, and Backoff | Failure semantics | Applicable | Unrecoverable or exhausted policies must return typed failure, not loop silently. |
| Policy can emit retry/fallback decisions | TRD Retry, Fallback, and Backoff; TRD Canonical Event Model | Observability | Applicable | Sprint 6 must produce canonical retry/backoff/fallback/rate-limit events and metadata. |
| Retry/fallback attempts preserve original run relationship | TRD Retry, Fallback, and Backoff; TRD Metadata Requirements | Attempt metadata | Applicable | Attempt records need parent/original run references and per-attempt context. |
| Retry/repair policies can request original session reuse where useful and supported | PRD Graceful Degradation; TRD Retry, Fallback, and Backoff | Session retention | Applicable | Policy decisions need explicit same/fresh/fork/unsupported session intent and resolved metadata. |
| Rate limits classified separately from generic failures | PRD Success Metrics; TRD Rate Limit Handling | Rate limits | Applicable | Rate-limit events and policy context must include provider/model and retry-after/reset hints where available. |
| Required health/config failures fail fast before work | Sprint 5 decisions; PRD Health and Readiness | Preflight boundary | Applicable | Policy execution must not retry unrecoverable setup failures unless caller policy explicitly chooses fallback to a different viable alternative. |
| Output validation and repair | PRD Output Validation; TRD Output and Artifact Validation | Validation/repair | Partially applicable | Sprint 6 should not implement validators or repair, but policy context must not preclude Sprint 7 validation-informed decisions. |
| Durable run records and historical inspection | PRD Observability; TRD Persistence Requirements | Persistence | Non-Applicable | Sprint 8 owns persistence; Sprint 6 should expose attempt metadata that can be persisted later. |
| Product workflow logic | PRD Non-Goals; TRD System Boundary | Product workflow | Non-Applicable | Retry/fallback primitives must remain product-agnostic and not encode UltraPlan sprint/study flows. |

### Applicable Requirements

- **Composable retry/fallback/backoff:** The sprint must define policy primitives and execution semantics that let callers compose bounded decisions without writing adapter-specific branches.
- **Policy inspection context:** Policy evaluation must receive classified error, attempt number, runtime/provider/model, effective config, validation result placeholder, rate-limit metadata, and prior attempt summaries.
- **Explicit events and metadata:** Retry, backoff wait, fallback, rate-limit, and policy-exhausted decisions must be visible as canonical events and result metadata.
- **Attempt relationship preservation:** Each attempt must be traceable to an original logical run and must preserve per-attempt runtime/provider/model/session/error/timing facts.
- **Session reuse/fresh-session choice:** Policy decisions must explicitly request same retained session, fork, fresh session, or fallback session behavior using existing session action/relationship vocabulary.
- **Rate-limit distinction:** `ErrorRateLimit`, `EventRateLimit`, retry-after/reset metadata, provider, model, and user-safe details must be separate from generic runtime exit or timeout failures.
- **Health/config respect:** Policy execution must treat required health/config failures as first-class failures and avoid hiding them behind silent retry loops.

### Non-Applicable Requirements

- **Output validators and repair prompts:** Sprint 7 owns concrete validation schemas, repair contexts, repair attempts, and validation-result generation.
- **Persistence backend:** Sprint 8 owns durable run records, active-run stores, historical inspection, and replay.
- **Cost/time estimation:** Sprint 8 owns cost and timing estimation beyond per-attempt duration metadata.
- **Permissions and interactive blocking policy:** Later permission/blocking work owns interaction handling. Sprint 6 only propagates permission errors through policy context if they occur.
- **Executable/CLI command surface:** AgentWrap remains SDK-only.
- **Global circuit breaker:** Deferred. Sprint 6 should not implement provider circuit breakers without direct requirement pressure and evidence.

### Ambiguous Or Conflicting Requirements

- **Policy API versus runtime API:** TRD requires policy configurability, but the current `Runtime` interface is intentionally small. The sprint should add a composable wrapper/executor rather than require every runtime adapter to implement policy execution internally.
- **Unknown retryability default:** Evidence warns that optional recoverable flags are risky. Unknown errors should default to stop or fallback only when a caller policy explicitly says so; the built-in default should not retry unknown failures automatically.
- **Rate-limit detection depth:** OpenCode adapter currently classifies process/stream/exit failures, but provider-specific rate-limit signals may appear in stderr, structured events, or error text. Sprint 6 should add structured rate-limit metadata and safe detection seams, but avoid brittle provider-specific parsing beyond tested cases.
- **Validation result in policy context before Sprint 7:** TRD requires policy inspection of validation result. Sprint 6 should include the context field and tests with fake validation results, but should not implement validation execution.
- **Session reuse versus fresh retry default:** PRD values retained context, but fresh sessions may be safer after malformed output or unknown runtime state. The sprint should make the built-in default conservative and require explicit policy decisions for retained-session reuse.
- **Fallback across runtimes before a second runtime exists:** The SDK must be extensible, but only OpenCode and fake runtimes exist today. Sprint 6 should support fallback to an alternative runtime through interfaces and fake tests without inventing second-runtime-specific behavior.

### Open Questions

- Which OpenCode failure surfaces reliably expose provider rate limits: structured events, stderr text, process exit, or health probe output?
- Should the first built-in default policy retry only `ErrorRateLimit`, `ErrorTimeout`, and explicitly retryable errors, or should it never retry unless the caller opts in?
- What exact shape should `ValidationResult` take before Sprint 7, if any, without prematurely defining validator output?
- Should a fallback attempt be represented as a child run with `ParentRunID` pointing to the original logical run, or should all attempts share one logical `RunID` with separate `AttemptID` values?
- How should cancellation during backoff be represented: cancellation of the logical policy run only, or also a final failed/cancelled attempt record?

## Sprint Decision Analysis

### Decision Area 1: Policy Execution Boundary

**Problem:** Sprint 6 must add retry/fallback/backoff behavior without hard-coding one flow into OpenCode or expanding the core runtime interface prematurely.

**Requirements Applied**
- TRD requires composable retry/fallback/backoff policies and new policy types without changing core runtime adapters.
- PRD requires a runtime-neutral product interface and graceful degradation through configurable policy hooks.
- Feature protocol requires runtime orchestration to own sequencing and explicit state, while logic remains pure transformation.

**Evidence Applied**
- `resilience-policies.md` says retry/fallback/backoff must be composable and classify failures before decisions.
- The resilience final report says no studied repo provides a first-class composable policy abstraction and recommends a `ResiliencePolicy` interface for library/host contexts.
- Current `Runtime` is intentionally minimal at `/home/antonioborgerees/coding/agentwrap/runtime.go:9`.
- OpenCode `StartRun` currently owns process execution and preflight but not policy orchestration at `/home/antonioborgerees/coding/agentwrap/opencode/runtime.go:20`.
- DEC-007 and DEC-008 keep OpenCode mechanics in the adapter and strict stream failure semantics intact until policy-based recovery is explicit.

**Options Considered**
- **Option A:** Add a runtime-neutral policy executor/wrapper that accepts one or more `Runtime` alternatives, a base `RunRequest`, and `ResiliencePolicy` chain, then starts attempts by calling runtimes.
- **Option B:** Add retry/fallback methods directly to the `Runtime` interface and require each adapter to implement policy execution.
- **Option C:** Implement retry/backoff/fallback only inside the OpenCode adapter.

**Chosen Approach**
- Use Option A. Add a small public policy execution layer that wraps runtime attempts and produces a logical policy run/result with attempt metadata and canonical retry/fallback/rate-limit events.

**Decision Justification**
- Option A satisfies composability and future-runtime requirements without polluting adapters with product policy.
- Option B over-expands `Runtime` and forces every future runtime to own orchestration before evidence exists.
- Option C violates the roadmap quality gate because callers could not express `retry -> fallback -> retry` without adapter-specific branching.
- The accepted tradeoff is one new orchestration layer before a second runtime exists, justified by the hard TRD requirement and volatile external runtime/provider boundary.

**Execution Notes**
- Prefer names that communicate SDK-level orchestration, such as `Runner`, `PolicyRunner`, or `RunWithPolicy`, without implying product workflow/DAG execution.
- The executor should call existing `Runtime.StartRun`, consume events, wait for results, and evaluate policy decisions after terminal failures or rate-limit signals.
- Do not change the OpenCode adapter to silently retry; keep adapter failures explicit.
- Cancellation must interrupt active attempts and backoff waits through `context.Context`.

**Expected Evidence**
- **Tests:** fake runtime tests proving retry, fallback, retry-after backoff, stop, cancellation during backoff, and no adapter-specific branching.
- **Runtime Evidence:** retry/fallback/rate-limit events emitted with logical run correlation and per-attempt context.
- **Review Checks:** OpenCode adapter remains strict and does not contain hard-coded policy chains.

---

### Decision Area 2: Policy Interface, Decision Model, and Defaults

**Problem:** The sprint must decide how policies inspect failures and return bounded decisions while avoiding endless retries and unsafe unknown-default behavior.

**Requirements Applied**
- TRD requires policy inspection of current error, attempt count, runtime, provider, model, validation result, and rate-limit metadata.
- TRD requires policies to stop execution with explicit failure and emit retry/fallback decisions.
- PRD non-goals reject hiding unrecoverable failures behind endless retries.

**Evidence Applied**
- The resilience final report warns opencode lacks a max retry limit and identifies unbounded retry as an anti-pattern.
- The error-handling final report supports typed errors and behavioral classifications instead of string matching.
- Current `SDKError` exposes `Retryable`, `Fallbackable`, `UserActionable`, and `Unrecoverable` at `/home/antonioborgerees/coding/agentwrap/errors.go:38`.
- Sprint 5 health errors provide health/config classification and required preflight blocking that policy code can inspect.

**Options Considered**
- **Option A:** Define a simple `ResiliencePolicy` interface that receives immutable `PolicyContext` and returns a `PolicyDecision` of `stop`, `retry`, `fallback`, or `wait`, with explicit max-attempt/default policy helpers.
- **Option B:** Encode policy as a declarative struct only, such as `RetryPolicy{MaxAttempts, Backoff}` plus `FallbackPolicy`.
- **Option C:** Expose only callback hooks such as `OnError`, `OnRateLimit`, and `OnFallback`.

**Chosen Approach**
- Use Option A, with small built-in policy helpers for common bounded behavior. The interface should support declarative helpers but not be limited to static structs.

**Decision Justification**
- Option A can express `retry -> fallback -> retry`, inspect the full context, and remain testable with fake runtimes.
- Option B is easier to serialize but too limited for caller-defined fallback chains and session decisions.
- Option C is flexible but risks uncontrolled side effects and hidden state; callbacks should be hook points around decisions, not the only policy model.
- The accepted tradeoff is a small abstraction that must be carefully kept runtime-neutral and not over-generalized into workflow composition.

**Execution Notes**
- `PolicyContext` should include original request, current attempt number, prior attempts, current runtime context, effective config if available, `SDKError`, validation result placeholder, rate-limit info, session metadata, and elapsed time.
- `PolicyDecision` should include kind, next runtime alternative or request mutation, backoff delay, session action, reason, user-safe detail, and metadata.
- Built-in default should be conservative: do not retry unknown or unrecoverable errors automatically; retry only when policy and classification permit; fallback only when policy supplies an alternative.
- Policy exhaustion must return an explicit `SDKError` category such as `ErrorRuntimeExit`, `ErrorRateLimit`, `ErrorHealth`, or `ErrorUnknown` with safe detail and attempt metadata. Do not use `ErrorRepairExhausted` for retry exhaustion because repair is Sprint 7.

**Expected Evidence**
- **Tests:** policy table tests for retryable, fallbackable, unrecoverable, unknown, rate-limited, health/config failure, and max-attempt exhaustion.
- **Runtime Evidence:** policy decisions recorded in result metadata and emitted as `EventRetry`/`EventFallback`/`EventRateLimit`.
- **Review Checks:** unknown failures do not retry by default and all built-in retry loops are bounded.

---

### Decision Area 3: Attempt Metadata and Event Correlation

**Problem:** Retry/fallback attempts must be traceable to the original run, visible to dashboards, and auditable later by persistence.

**Requirements Applied**
- TRD requires retry/fallback attempts to preserve a relationship to the original run and record attempt metadata.
- PRD observability requires attempts, warnings, errors, provider/model, timing, and final status.
- TRD canonical event model requires retry and fallback transitions.

**Evidence Applied**
- `resilience-policies.md` says preserve failed attempts as useful evidence, not noise.
- The resilience final report recommends exposing retry state to callers.
- Current events include `CorrelationID` and `CauseEventID` at `/home/antonioborgerees/coding/agentwrap/events.go:11`.
- Current metadata has `ParentRunID` and `Attempt` at `/home/antonioborgerees/coding/agentwrap/metadata.go:17`.
- DEC-013 uses run ID as correlation ID and defers full causal graph until concrete need.

**Options Considered**
- **Option A:** Add explicit attempt records and policy metadata under `RunMetadata`, with a stable logical policy run ID, per-attempt runtime run IDs, attempt numbers, parent/original run references, decision history, and final selected result.
- **Option B:** Reuse only existing `RunMetadata.Attempt` and `ParentRunID`.
- **Option C:** Hide failed attempts and return only the final successful result.

**Chosen Approach**
- Use Option A, while reusing existing `ParentRunID`, `Attempt`, `CorrelationID`, `CauseEventID`, and event categories where possible.

**Decision Justification**
- Option A is required for dashboards, auditability, and later persistence.
- Option B is too thin for multiple attempts and fallback chains because it cannot explain why the final attempt happened.
- Option C violates the PRD because graceful fallback success must not hide failed attempts.
- The accepted tradeoff is additional metadata surface before persistence exists; this is necessary to avoid losing attempt evidence.

**Execution Notes**
- Keep one logical policy execution correlation ID across attempts.
- Preserve each runtime attempt's actual `RunID` in attempt metadata.
- Emit policy decision events from the executor, not from adapters.
- Include attempt start/end time, runtime/provider/model, session relationship, status, error category, delay, fallback target, and decision reason.
- Do not synthesize precise `CauseEventID` beyond clear local decision events unless implementation can do so accurately.

**Expected Evidence**
- **Tests:** event sequence tests proving retry/fallback/rate-limit events carry logical correlation and attempt numbers; result tests proving failed attempts remain visible after a later success.
- **Runtime Evidence:** `RunMetadata` includes original run, final attempt, decision history, and per-attempt summaries.
- **Review Checks:** a reviewer can reconstruct the attempt chain without reading adapter-specific logs.

---

### Decision Area 4: Rate-Limit Classification and `OnRateLimit`

**Problem:** Rate limits must be distinguishable from generic failures and available to policy evaluation with provider/model and retry timing metadata.

**Requirements Applied**
- PRD and TRD require rate-limit detection, caller-visible rate-limit events, and policy access to rate-limit metadata.
- TRD requires `OnRateLimit` hook behavior.
- TRD error model already includes `rate limit` as a category.

**Evidence Applied**
- `resilience-policies.md` says rate limits must be distinct events with provider/model metadata where available.
- The resilience final report recommends honoring server-provided retry hints and warns against `Schema.Unknown` for critical rate-limit data.
- Current `ErrorRateLimit` is defined at `/home/antonioborgerees/coding/agentwrap/errors.go:19`.
- Current `EventRateLimit` exists at `/home/antonioborgerees/coding/agentwrap/events.go:42`.

**Options Considered**
- **Option A:** Add a runtime-neutral `RateLimitInfo` model and `OnRateLimit` policy hook/context field; detect rate limits from classified `SDKError`, canonical `EventRateLimit`, and adapter-safe metadata; preserve unknown fields in native metadata.
- **Option B:** Treat rate limits as generic retryable errors using only `SDKError.Retryable`.
- **Option C:** Implement provider-specific OpenCode text parsing for every known provider in Sprint 6.

**Chosen Approach**
- Use Option A. Add a common rate-limit metadata shape and minimal safe detection seams. Keep provider-specific parsers small, tested, and adapter-local if any are needed.

**Decision Justification**
- Option A meets TRD requirements without requiring brittle provider-specific heuristics.
- Option B fails the success metric because callers cannot distinguish rate limits from generic failures.
- Option C is too broad and likely fragile without real provider evidence.
- The accepted tradeoff is partial detection: the SDK can represent rate limits fully, but real OpenCode detection should only claim what tests or runtime evidence prove.

**Execution Notes**
- `RateLimitInfo` should include provider, model, scope, limit name, retry-after duration, reset time, remaining/limit values where known, source, user-safe detail, and native metadata.
- `OnRateLimit` should be a policy hook or policy method path that can return wait/retry/fallback/stop.
- Backoff should honor `RetryAfter` or reset time when available, with caller-configured cap and jitter.
- Emit `EventRateLimit` before waiting or fallback when a rate limit is detected.

**Expected Evidence**
- **Tests:** rate-limit classified error tests, rate-limit event tests, retry-after honored over generic backoff tests, unknown rate-limit metadata tests, and fallback-on-rate-limit tests.
- **Runtime Evidence:** rate-limit metadata includes provider/model when present and safe detail without secrets.
- **Review Checks:** rate-limit detection does not rely on untested string matching as the only path.

---

### Decision Area 5: Session Continuity Across Attempts

**Problem:** Policies need to choose retained-session reuse or fresh sessions per attempt, but reuse can be unsafe or unsupported depending on failure mode and runtime capability.

**Requirements Applied**
- PRD requires policies to choose same retained session, fresh session, or fallback runtime/session where supported.
- TRD requires retry/repair policies to request reuse of original session and fallback policies to record whether context was preserved.
- Session lifecycle requirements require unsupported session operations to be explicit.

**Evidence Applied**
- `session-lifecycle.md` says session retention must be explicit: same session, forked session, fresh session, or unsupported.
- The process/session lifecycle final report says no studied repo achieves true mid-run state transfer and recommends explicit state machines and pragmatic fallback.
- DEC-011 says OpenCode same-session continuation is best-effort unless verified.
- Current `SessionAction` and `SessionRelationship` vocabulary exists in `/home/antonioborgerees/coding/agentwrap/metadata.go`.

**Options Considered**
- **Option A:** Make session behavior an explicit field in every policy decision, defaulting conservatively to fresh/default unless the policy asks for continue/fork and the runtime supports it.
- **Option B:** Always retry in the same session when a session ID exists.
- **Option C:** Always start a fresh session on every retry/fallback.

**Chosen Approach**
- Use Option A. Policy decisions should explicitly request session behavior, and attempt metadata must record the requested and resolved relationship.

**Decision Justification**
- Option A satisfies PRD/TRD while respecting DEC-011's best-effort OpenCode session status.
- Option B risks carrying corrupted or unsafe context after malformed output, cancellation, or unknown runtime state.
- Option C loses useful agent context and contradicts retained-session requirements.
- The accepted tradeoff is that callers/policies must be deliberate about context reuse.

**Execution Notes**
- Built-in retry helpers may default to `SessionActionDefault` or `SessionActionFresh`; do not silently force same-session reuse.
- Fallback to a different runtime should record `SessionRelationshipUnsupported` or fresh context unless the target runtime can explicitly continue/fork.
- Attempt metadata should record requested session action, requested session ID, resolved session ID, relationship, and whether retention was best-effort.

**Expected Evidence**
- **Tests:** same-session retry request, fresh retry request, unsupported session fallback, fork request when unsupported, and metadata preservation tests using fake runtimes.
- **Runtime Evidence:** policy/fallback events include session action and relationship fields.
- **Review Checks:** no implicit same-session retry is hidden in the policy executor.

## Deviations

| Requirement | Deviation | Reason | Risk | Disposition | Follow-up |
| --- | --- | --- | --- | --- | --- |
| Policy can inspect validation result | Sprint 6 should only add a placeholder/context field and fake tests, not real validation execution | Sprint 7 owns output validation and repair | Policy API may need adjustment after validators exist | Temporary | Revisit in Sprint 7 and update policy context only with implementation evidence |
| Rate-limit detection where available | Sprint 6 should not claim broad provider-specific OpenCode detection without evidence | Current implementation has no proven provider rate-limit stream samples | Real rate limits may initially surface as runtime exit or unknown | Temporary | Add fixture or live evidence when a real rate-limit sample is available |
| Fallback across runtimes | Sprint 6 can test with fake alternatives but not a real second runtime | Only OpenCode exists today | Interface may need adjustment when Codex/Claude/Pi is added | Temporary | Sprint 10 second-runtime pressure test |
| Durable attempt history | Store attempt history in result metadata only, not persistence | Sprint 8 owns persistence | Attempt evidence is in-memory only until stored by callers | Temporary | Sprint 8 persistence should store policy metadata and decision events |

## Cross-Cutting Reasoning

### Major Decision Summary

- **Policy executor outside adapters:** Required by runtime-neutral composition and evidence that libraries should expose typed policy control rather than application-owned retry internals.
- **Small `ResiliencePolicy` with explicit `PolicyDecision`:** Required to inspect classifications, rate-limit metadata, attempts, and session behavior while avoiding unbounded implicit retry.
- **Attempt records and policy events:** Required so graceful fallback does not hide failures and dashboards/persistence can audit the chain.
- **Common `RateLimitInfo` and `OnRateLimit`:** Required to distinguish rate limits from generic failures and honor retry hints.
- **Explicit session behavior per decision:** Required by retained-session semantics and evidence that mid-run resume is never guaranteed.

### Tradeoffs

- **Wrapper orchestration adds a new public surface:** Accepted because adapter-local retry would fail composability and future-runtime requirements.
- **Conservative unknown handling may require more caller configuration:** Accepted to avoid hidden retry storms and unbounded loops.
- **Attempt metadata expands before persistence exists:** Accepted because losing failed-attempt evidence would violate observability requirements.
- **Rate-limit detection may start incomplete:** Accepted because the sprint can define metadata and tested detection paths without over-claiming provider-specific behavior.
- **Validation result placeholder is intentionally narrow:** Accepted to avoid defining Sprint 7 validation architecture prematurely.

### Assumptions

- Existing `SDKError` classifications are sufficient for first policy decisions; new categories should be avoided unless implementation finds a concrete gap.
- Existing `EventRetry`, `EventFallback`, and `EventRateLimit` categories are the right canonical event categories for policy execution.
- The policy executor can consume runtime events and final results through the public `Run` interface without adapter-private hooks.
- Health/config preflight from Sprint 5 remains adapter-owned and is invoked through existing runtime start behavior or optional `HealthChecker` when policy needs explicit checks.
- Fake runtimes can provide enough deterministic coverage for retry/fallback/rate-limit/session decision behavior before live OpenCode rate-limit evidence exists.

### Dependencies

- **Sprint 2 runtime contract:** Provides `Runtime`, `Run`, events, `SDKError`, capabilities, and metadata fields.
- **Sprint 3 OpenCode adapter:** Provides a real strict runtime attempt path.
- **Sprint 4 lifecycle/sessions:** Provides explicit lifecycle states, cleanup semantics, and session relationship vocabulary.
- **Sprint 5 health/config:** Provides `HealthChecker`, required preflight behavior, effective config, and redaction.
- **Current fake runtime/testkit:** Needs extension or companion policy fakes for attempt sequencing and controlled failures.

### Risks

- **Policy over-abstracts into workflow composition:** Keep decisions to retry/fallback/backoff/rate-limit/session attempt behavior and explicitly exclude DAGs, validation repair, and product flows.
- **Unknown failures retry unexpectedly:** Default policy must be conservative and bounded; tests must assert unknown/unrecoverable stop behavior.
- **Rate-limit signals are hard to detect from OpenCode:** Use common metadata and fake fixtures now; only add adapter parsing with evidence.
- **Cancellation/backoff leaks goroutines:** Use context-aware waits and ensure active attempt cancellation propagates.
- **Session reuse after corrupted state:** Require explicit policy request and record unsupported/best-effort relationships.
- **Failed attempts are lost after success:** Make attempt history part of result metadata and event stream.

## Tracker Guidance

Use this reasoning to write `targets/agentwrap/sprints/06-resilience-policies/plan.md`.

The tracker must include:

- scope that follows the policy-executor wrapper decision above
- non-scope that blocks validation/repair, persistence, circuit breakers, CLI commands, and product workflows
- execution tasks for policy types, executor, attempt metadata, rate-limit handling, session decisions, fake tests, and documentation
- tests and evidence expectations from each decision area
- risks, assumptions, and open questions carried forward
- success criteria that prove `retry -> fallback -> retry`, rate-limit distinction, original-run traceability, and fake-runtime policy testability

## Evidence Review Checklist

- [x] Review can trace every sprint decision back to PRD/TRD requirements.
- [x] Review can trace every meaningful design choice back to evolved study evidence or an explicit open question.
- [x] Review can identify which evidence was loaded, omitted, rejected, or explored directly.
- [x] Review can see credible alternatives and why they were rejected.
- [x] Review can verify the planned tests and runtime evidence.
- [x] Review can identify planned or unplanned deviations.

## Phase Exit Criteria

- [x] Sprint scope is fully covered.
- [x] Target PRD and TRD requirements are mapped.
- [x] Evidence packs were read or staged according to the context strategy.
- [x] Applicable, non-applicable, and ambiguous requirements are recorded where relevant.
- [x] Study evidence is tied to decisions, risks, alternatives, or expected evidence.
- [x] Important decisions are explicitly justified.
- [x] Non-trivial alternatives are discussed.
- [x] Deviations, assumptions, risks, and unknowns are documented.
- [x] Expected execution and review evidence is defined.
- [x] The sprint tracker can be written from this reasoning without reopening every study report.

## Documentation Updates

- `targets/agentwrap/sprints/06-resilience-policies/plan.md` - must be created from this reasoning before implementation starts.
- `targets/agentwrap/DECISIONS.md` - implementation should add accepted decisions only after public policy, attempt metadata, and rate-limit behavior are confirmed by tests.
- `agentwrap/README.md` or package docs - implementation should document policy executor semantics, default behavior, rate-limit metadata, and non-scope boundaries.
- `targets/agentwrap/roadmap.md` - no change required for planning, but future roadmap cleanup may note that Sprint 6 does not include validation repair or circuit breaking.
