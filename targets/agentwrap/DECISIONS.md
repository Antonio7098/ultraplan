# Decision Log: agentwrap

> Sources: `targets/agentwrap/sources/PRD.md`, `targets/agentwrap/sources/TRD.md`, `targets/agentwrap/sources/feature-architecture.md`, `targets/agentwrap/roadmap.md`, `targets/agentwrap/sprints/00-target-brief/reasoning.md`, `targets/agentwrap/reports/sprint-evidence/00-target-brief.txt`

## Policy

Record a decision when a sprint makes a durable product, SDK, public API, lifecycle, event, error, persistence, configuration, validation, entrypoint, or test strategy choice that future work must honor.

Each accepted decision must include:

- **Status:** Proposed, Accepted, Superseded, Deferred, or Rejected.
- **Date:** ISO date when the decision status changed.
- **Sprint:** Sprint that made or changed the decision.
- **Requirement Source:** PRD, TRD, roadmap, or other target requirement that required the decision.
- **Evidence Source:** Sprint evidence bundle, evidence pack, study report, source report, direct code reference, test result, or implementation finding.
- **Decision:** The choice future work should follow.
- **Tradeoff:** The cost or limitation accepted by choosing it.
- **Rejected Alternatives:** Credible alternatives and why they were not chosen.
- **Risk / Follow-up:** Known risk, mitigation, owner, or later decision needed.

Do not convert study recommendations into accepted architecture decisions until a sprint has enough requirement pressure, implementation context, and verification evidence. Open questions belong in the backlog until then.

## Entry Template

```markdown
### DEC-000: Decision title

- **Status:** Proposed | Accepted | Superseded | Deferred | Rejected
- **Date:** YYYY-MM-DD
- **Sprint:** Path to the sprint plan that made or changed the decision.
- **Requirement Source:** Requirement document path and section or requirement name.
- **Evidence Source:** Evidence bundle, evidence pack, study report, code reference, test result, or implementation finding.
- **Decision:** What future work should do.
- **Tradeoff:** Accepted cost or limitation.
- **Rejected Alternatives:** Alternatives and reasons.
- **Risk / Follow-up:** Risk, mitigation, follow-up sprint, or owner.
```

## Accepted Decisions

### DEC-001: Root SDK Package With Thin Executable Entrypoint

- **Status:** Accepted
- **Date:** 2026-05-18
- **Sprint:** `targets/agentwrap/sprints/01-project-skeleton/plan.md`
- **Requirement Source:** `targets/agentwrap/sources/PRD.md` product goals and non-goals; `targets/agentwrap/sources/TRD.md` system boundary; `targets/agentwrap/roadmap.md` Sprint 1 scope.
- **Evidence Source:** `targets/agentwrap/reports/sprint-evidence/01-project-skeleton.txt`; `studies/go-cli-study/reports/final/01-project-structure.md`; implementation in `/home/antonioborgerees/coding/agentwrap`.
- **Decision:** Use one Go module with the root package reserved for public SDK documentation and future public contracts, the executable entrypoint as a thin composition root, and `internal/` for private implementation and test harness code.
- **Tradeoff:** The root package exists before public runtime/session/event contracts are implemented.
- **Rejected Alternatives:** `pkg/agentwrap` was rejected because it adds path stutter before multiple public packages exist. Keeping all code under `internal/` was rejected because the product is an SDK, not only implementation support code.
- **Risk / Follow-up:** Keep the root package minimal until Sprint 2 defines the public contract.

### DEC-002: Framework-Neutral Executable Skeleton With Injected IO

- **Status:** Accepted
- **Date:** 2026-05-18
- **Sprint:** `targets/agentwrap/sprints/01-project-skeleton/plan.md`
- **Requirement Source:** `targets/agentwrap/roadmap.md` Sprint 1 quality gate and thin entrypoint rule.
- **Evidence Source:** `targets/agentwrap/reports/sprint-evidence/01-project-skeleton.txt`; `studies/go-cli-study/reports/final/02-command-architecture.md`; `studies/go-cli-study/reports/final/03-dependency-injection.md`; `studies/go-cli-study/reports/final/06-io-abstraction.md`; implementation in `internal/cli`.
- **Decision:** Keep the Sprint 1 executable skeleton framework-neutral. The entrypoint wires process args and IO, while private runner code accepts explicit dependencies and returns an exit code.
- **Tradeoff:** Sprint 9 may later refactor to Cobra or another framework if the real command surface earns it.
- **Rejected Alternatives:** Cobra was rejected as premature for a skeleton with no product command tree. Argument handling directly in the entrypoint was rejected because it weakens in-process tests.
- **Risk / Follow-up:** Reopen the executable framework choice in Sprint 9 if a user-facing command surface ever becomes justified.

### DEC-003: Private Structured Fixture And Fake Lifecycle Harness

- **Status:** Accepted
- **Date:** 2026-05-18
- **Sprint:** `targets/agentwrap/sprints/01-project-skeleton/plan.md`
- **Requirement Source:** `targets/agentwrap/sources/PRD.md` structured event requirement; `targets/agentwrap/sources/TRD.md` structured runtime events; `targets/agentwrap/roadmap.md` Sprint 1 fake runtime fixtures.
- **Evidence Source:** `targets/agentwrap/reports/sprint-evidence/01-project-skeleton.txt`; `targets/agentwrap/reports/evidence/testing-strategy.md`; implementation in `internal/testkit`.
- **Decision:** Use private JSONL structured fixtures and a private harness-local lifecycle runner under `internal/testkit`; preserve raw records and decode errors.
- **Tradeoff:** Sprint 2 may replace or adapt test helper concepts when it defines public lifecycle and event contracts.
- **Rejected Alternatives:** Terminal transcript fixtures were rejected because structured runtime output is required. A public fake runtime contract was rejected as Sprint 2 scope.
- **Risk / Follow-up:** Sprint 3 should add representative OpenCode structured fixtures and revisit fixture shape.

### DEC-004: Runtime, Run, Session, Turn, Event, Artifact, Metadata, Capability, And Error Contract Boundary

- **Status:** Accepted
- **Date:** 2026-05-18
- **Sprint:** `targets/agentwrap/sprints/02-core-runtime-contract/plan.md`
- **Requirement Source:** `targets/agentwrap/sources/PRD.md` runtime abstraction and structured events; `targets/agentwrap/sources/TRD.md` runtime interface, run/session lifecycle, extensibility, and error model; `targets/agentwrap/roadmap.md` Sprint 2 scope.
- **Evidence Source:** `targets/agentwrap/reports/sprint-evidence/02-core-runtime-contract.txt`; `targets/agentwrap/reports/evidence/runtime-contract.md`; `targets/agentwrap/reports/evidence/session-lifecycle.md`; implementation and tests in `/home/antonioborgerees/coding/agentwrap`.
- **Decision:** Define the public SDK boundary around `Runtime`, `Run`, `RunRequest`, `RunResult`, run/session/turn identifiers, canonical `Event`, artifact references, metadata, capability discovery, lifecycle states, and classified `SDKError`.
- **Tradeoff:** `TurnID` and some lifecycle/capability vocabulary exists before the real OpenCode adapter proves exact native mappings.
- **Rejected Alternatives:** A single blocking run function was rejected because it cannot support streaming events, cancellation, retained-session metadata, or turn correlation. A full task/workflow/DAG hierarchy was rejected because product workflow composition is outside the SDK core contract.
- **Risk / Follow-up:** Sprint 3 must pressure-test the contract against actual OpenCode structured events and record any compatibility adjustment.

### DEC-005: Canonical Events With Diagnostic Raw Payload Preservation

- **Status:** Accepted
- **Date:** 2026-05-18
- **Sprint:** `targets/agentwrap/sprints/02-core-runtime-contract/plan.md`
- **Requirement Source:** `targets/agentwrap/sources/PRD.md` structured events and output safety; `targets/agentwrap/sources/TRD.md` structured runtime events and canonical event model.
- **Evidence Source:** `targets/agentwrap/reports/sprint-evidence/02-core-runtime-contract.txt`; `studies/opencode-wrap-study/reports/final/01-runtime-contract-and-api-shape.md`; fake runtime tests for raw payload preservation and unknown/malformed event categories.
- **Decision:** Expose a runtime-neutral `Event` envelope with identity, sequence, correlation ID, optional cause event ID, runtime/provider/model context, category, type, payload, and optional `RawPayload`. Raw payloads are diagnostic extensions and are not safe to display or persist unless marked or redacted by adapter rules.
- **Tradeoff:** The initial payload shape is intentionally open (`EventPayload`) rather than a generated closed schema.
- **Rejected Alternatives:** Exposing OpenCode-native events directly was rejected because it leaks adapter internals. Raw JSON only was rejected because dashboards and products need canonical categories.
- **Risk / Follow-up:** Sprint 3 owns native OpenCode projection and redaction pressure; Sprint 7 may add stronger validation schema choices. Typed subscription or event registry behavior remains deferred until real caller pressure exists.

### DEC-006: Classified SDK Errors Without Policy Execution

- **Status:** Accepted
- **Date:** 2026-05-18
- **Sprint:** `targets/agentwrap/sprints/02-core-runtime-contract/plan.md`
- **Requirement Source:** `targets/agentwrap/sources/TRD.md` error model; `targets/agentwrap/roadmap.md` Sprint 2 typed/classified error scope.
- **Evidence Source:** `studies/go-cli-study/reports/final/05-error-handling.md`; implementation in `errors.go`; tests in `errors_test.go` and `internal/testkit/fake_runtime_test.go`.
- **Decision:** Public runtime failures use `SDKError` with category, operation, user-safe detail, optional diagnostic detail, retryable/fallbackable/user-actionable/unrecoverable flags, category-based default classification, construction options, and wrapped cause support.
- **Tradeoff:** Error categories and flags exist before retry/fallback policy behavior is implemented.
- **Rejected Alternatives:** Plain string-prefixed errors were rejected because callers would need string matching. Panic recovery for operational failures was rejected because expected runtime failures must be inspectable.
- **Risk / Follow-up:** Sprint 6 owns actual retry/fallback policy interpretation of these classifications. `errors.Is` sentinel support remains deferred until caller handling patterns justify it.

### DEC-007: Dedicated OpenCode Adapter Package

- **Status:** Accepted
- **Date:** 2026-05-18
- **Sprint:** `targets/agentwrap/sprints/03-opencode-adapter/plan.md`
- **Requirement Source:** `targets/agentwrap/sources/PRD.md` runtime abstraction and OpenCode-first MVP; `targets/agentwrap/sources/TRD.md` runtime interface and structured runtime events; `targets/agentwrap/roadmap.md` Sprint 3 scope.
- **Evidence Source:** `targets/agentwrap/reports/sprint-evidence/03-opencode-adapter.txt`; local `opencode run --help` output showing `--format json`; implementation in `/home/antonioborgerees/coding/agentwrap/opencode`; `env GOCACHE=/tmp/agentwrap-gocache go test ./... -count=1 -timeout 30s`; extended smoke suite finding that OpenCode workdir behavior requires explicit `--dir`.
- **Decision:** Implement OpenCode as a dedicated `opencode` package that returns an `agentwrap.Runtime`, launches `opencode run --format json` with `--dir` when `RunRequest.WorkDir` is set, decodes adapter-local native records, projects canonical events, and preserves raw native JSON as unsafe diagnostics.
- **Tradeoff:** The first real runtime package exists before a second runtime proves the package pattern.
- **Rejected Alternatives:** Adding OpenCode command flags or native event structs to the root SDK package was rejected because it would leak runtime mechanics into the common path. Keeping the implementation under `internal/testkit` was rejected because this is production adapter behavior.
- **Risk / Follow-up:** Sprint 4 should revisit process cleanup and retained-session operations; Sprint 10 should pressure-test the boundary against a second runtime.

### DEC-008: Strict OpenCode Structured Stream Failure Semantics

- **Status:** Accepted
- **Date:** 2026-05-18
- **Sprint:** `targets/agentwrap/sprints/03-opencode-adapter/plan.md`
- **Requirement Source:** `targets/agentwrap/sources/TRD.md` structured runtime events and error model; `targets/agentwrap/roadmap.md` Sprint 3 quality gate.
- **Evidence Source:** malformed, partial, non-zero-exit, timeout, and cancellation adapter tests in `/home/antonioborgerees/coding/agentwrap/opencode`; `env GOCACHE=/tmp/agentwrap-gocache go test ./... -count=1 -timeout 30s`.
- **Decision:** Treat malformed JSON records, valid records without required `type`, missing final structured result, non-zero exit, timeout, and cancellation as explicit classified run failures. Unknown valid native records remain non-fatal and are emitted as native extension events.
- **Tradeoff:** Benign-looking stdout corruption fails the run until a later resilience policy has evidence that continuation is safe.
- **Rejected Alternatives:** Continuing after malformed structured records was rejected because Sprint 3 has no consistency policy. Treating zero exit as success was rejected because structured final state is required.
- **Risk / Follow-up:** Sprint 6 may add policy-based recovery; Sprint 8 may add richer diagnostic persistence/redaction.

### DEC-009: Fixture-First OpenCode Adapter Tests With Gated Real Smoke

- **Status:** Accepted
- **Date:** 2026-05-18
- **Sprint:** `targets/agentwrap/sprints/03-opencode-adapter/plan.md`
- **Requirement Source:** `targets/agentwrap/roadmap.md` Sprint 3 output and quality gate; `targets/agentwrap/reports/evidence/testing-strategy.md`.
- **Evidence Source:** adapter fixtures in `/home/antonioborgerees/coding/agentwrap/opencode/testdata`; fake process-runner tests in `/home/antonioborgerees/coding/agentwrap/opencode`; skipped smoke test guarded by `AGENTWRAP_OPENCODE_SMOKE=1`; default `go test ./...` passing without OpenCode execution.
- **Decision:** Default tests use fixtures and fake process runners for deterministic coverage. Real OpenCode execution is available through an explicit environment-gated smoke test and is skipped by default.
- **Tradeoff:** The default gate proves adapter behavior and command construction, not provider/auth success against a live OpenCode run.
- **Rejected Alternatives:** Requiring OpenCode/provider setup for default tests was rejected as brittle. Omitting the real-runtime smoke path was rejected because the roadmap requires one.
- **Risk / Follow-up:** Run the smoke in an environment with configured provider/auth and record the result before relying on live OpenCode behavior operationally.

### DEC-010: Primary Run Status And Cleanup Outcome Are Separate

- **Status:** Accepted
- **Date:** 2026-05-18
- **Sprint:** `targets/agentwrap/sprints/04-lifecycle-sessions/plan.md`
- **Requirement Source:** `targets/agentwrap/sources/TRD.md` run and session lifecycle cleanup requirements; `targets/agentwrap/roadmap.md` Sprint 4 scope.
- **Evidence Source:** `targets/agentwrap/reports/sprint-evidence/04-lifecycle-sessions.txt`; implementation in `/home/antonioborgerees/coding/agentwrap`; `env GOCACHE=/tmp/agentwrap-gocache go test ./...`.
- **Decision:** Preserve `RunResult.Status` and `RunResult.Err` as the primary run outcome, and report cleanup separately through canonical lifecycle events plus `RunMetadata.Cleanup` with `ErrorCleanup` when cleanup fails.
- **Tradeoff:** Callers must inspect both the primary result and cleanup metadata to understand the full terminal condition.
- **Rejected Alternatives:** Replacing a successful, failed, or cancelled result with `cleaned_up` was rejected because it hides the primary outcome. Treating cleanup failure as the primary error after a successful run was rejected because it makes runtime success ambiguous.
- **Risk / Follow-up:** Sprint 8 persistence should store cleanup diagnostics alongside final result metadata without changing the primary status semantics. Public graceful-vs-force cleanup fields are deferred until callers need policy decisions from that distinction; adapter-local process cleanup still tracks graceful and force attempts internally.

### DEC-011: OpenCode Session Continuation Is Best-Effort Unless Verified

- **Status:** Accepted
- **Date:** 2026-05-18
- **Sprint:** `targets/agentwrap/sprints/04-lifecycle-sessions/plan.md`
- **Requirement Source:** `targets/agentwrap/sources/PRD.md` retained runtime context; `targets/agentwrap/sources/TRD.md` retained-session operations.
- **Evidence Source:** `targets/agentwrap/reports/sprint-evidence/04-lifecycle-sessions.txt`; OpenCode adapter implementation and tests in `/home/antonioborgerees/coding/agentwrap/opencode`.
- **Decision:** Represent retained-session requests with runtime-neutral action and relationship metadata. The OpenCode adapter passes same-session continuation through `--session` as best-effort metadata, while fork, replace, and release actions fail before process launch.
- **Tradeoff:** The SDK can represent required retained-session flows now, but OpenCode continuation is not claimed as durable session retention until live/runtime evidence verifies the behavior.
- **Rejected Alternatives:** Inferring all session behavior from `SessionID` and `WantSession` was rejected because fresh, forked, replaced, released, unsupported, and best-effort outcomes are ambiguous. Building a durable session manager was rejected as persistence scope.
- **Risk / Follow-up:** Run and record a real OpenCode same-session smoke before marking continuation fully supported.

### DEC-012: Silent OpenCode Runs Must Respect SDK Timeouts Before Sprint 6 Rate-Limit Work

- **Status:** Accepted
- **Date:** 2026-05-19
- **Sprint:** `targets/agentwrap/sprints/04-lifecycle-sessions/plan.md`
- **Requirement Source:** `targets/agentwrap/sources/TRD.md` run and session lifecycle, cancellation, cleanup, and error model requirements; `targets/agentwrap/roadmap.md` Sprint 4 lifecycle quality gate and Sprint 6 rate-limit scope.
- **Evidence Source:** Live OpenCode smoke investigation on 2026-05-19 with `openai/gpt-5.5`; implementation in `/home/antonioborgerees/coding/agentwrap/opencode`; `env GOCACHE=/tmp/agentwrap-gocache go test ./...`.
- **Decision:** Fix silent-run timeout correctness in the OpenCode adapter now by making structured output scanning context-aware and by classifying context-derived decode termination as timeout or cancellation rather than malformed-event failure.
- **Tradeoff:** The adapter remains strict about structured stream integrity and still does not attempt rate-limit-specific recovery or fallback behavior.
- **Rejected Alternatives:** Waiting until Sprint 6 was rejected because a run that ignores the SDK timeout violates core lifecycle guarantees independently of rate-limit policy. Treating context-derived scanner termination as malformed output was rejected because it obscures the real terminal condition. Silently downgrading oversized structured records was rejected for now because it weakens strict stream semantics without sufficient evidence.
- **Risk / Follow-up:** Sprint 6 still owns typed rate-limit detection, retry/backoff/fallback policy, and user-visible `OnRateLimit` behavior. If large native records become a real issue, revisit scanner size/error handling with evidence rather than silently skipping records.

### DEC-013: Lifecycle Events Track Actual Run State, With Causal Graph Deferred

- **Status:** Accepted
- **Date:** 2026-05-19
- **Sprint:** `targets/agentwrap/sprints/04-lifecycle-sessions/plan.md`
- **Requirement Source:** `targets/agentwrap/sources/TRD.md` explicit lifecycle states and observability requirements; `targets/agentwrap/roadmap.md` Sprint 4 lifecycle state machine quality gate.
- **Evidence Source:** Implementation review finding that cleanup after caller cancellation could emit `from=running` after the run had already transitioned to `cancelled`; regression tests in `/home/antonioborgerees/coding/agentwrap/opencode`; `env GOCACHE=/tmp/agentwrap-gocache go test ./...`.
- **Decision:** Track lifecycle state on each run and emit lifecycle transitions from the actual prior state. Populate `CorrelationID` with the run ID for lifecycle, session, and projected native events so all events from one run can be grouped.
- **Tradeoff:** Local lifecycle/session events are sent best-effort through the buffered event channel even after run context cancellation so terminal lifecycle evidence can still be observed.
- **Rejected Alternatives:** Hardcoding transition `from` states was rejected because it makes cleanup-after-cancel events misleading. Removing public correlation/cause fields was rejected because later persistence and replay work still need the envelope shape.
- **Risk / Follow-up:** Full `CauseEventID` population is deferred until persistence/replay or a concrete event-causality model exists; synthetic causality would be misleading. Process-group termination remains deferred until reproduced descendant-process leakage justifies OS-specific process-tree management.

### DEC-014: SDK Health Checker With Required Preflight Blocking

- **Status:** Accepted
- **Date:** 2026-05-19
- **Sprint:** `targets/agentwrap/sprints/05-health-config/plan.md`
- **Requirement Source:** `targets/agentwrap/sources/PRD.md` health and readiness; `targets/agentwrap/sources/TRD.md` health checks and preflight.
- **Evidence Source:** Sprint 5 implementation in `/home/antonioborgerees/coding/agentwrap`; `env GOCACHE=/tmp/agentwrap-gocache go test ./...`.
- **Decision:** Add an optional runtime-neutral `HealthChecker` interface with typed check IDs, health states, per-check results, aggregate reports, classified `SDKError` values, and caller-requested `RunRequest.RequireHealth` preflight blocking before OpenCode process launch.
- **Tradeoff:** Health remains an optional adapter capability rather than a required method on `Runtime`, so callers should type-assert or receive a runtime that explicitly advertises health support.
- **Rejected Alternatives:** Adding health methods directly to `Runtime` was rejected because it would force every future runtime to claim probe semantics before evidence exists. OpenCode-only helper functions were rejected because products need a runtime-neutral preflight contract.
- **Risk / Follow-up:** Sprint 6 policy code must consume health classifications without adding hidden retry/fallback behavior inside adapters.

### DEC-015: Source-Aware Effective Config Without SDK-Owned File Parsing

- **Status:** Accepted
- **Date:** 2026-05-19
- **Sprint:** `targets/agentwrap/sprints/05-health-config/plan.md`
- **Requirement Source:** `targets/agentwrap/sources/TRD.md` configuration requirements; `targets/agentwrap/sources/PRD.md` output safety.
- **Evidence Source:** Sprint 5 implementation in `/home/antonioborgerees/coding/agentwrap`; config/redaction tests; `env GOCACHE=/tmp/agentwrap-gocache go test ./...`.
- **Decision:** Represent effective configuration as a merged, source-aware SDK value with explicit source labels for defaults, adapter options, environment/config providers, caller requests, and runtime-discovered values. Secrets are represented by presence/source metadata and redacted diagnostics, not raw values.
- **Tradeoff:** The SDK exposes merge/validation primitives but still does not choose or parse a config file format.
- **Rejected Alternatives:** Choosing JSON/YAML/TOML config loading in the SDK was rejected as product-specific and contrary to the TRD. Relying only on `RunRequest` was rejected because callers need provenance and redacted inspection.
- **Risk / Follow-up:** Future product integrations may add config-provider layers, but direct env/file reads should remain isolated to config/probe boundaries.

### DEC-016: Policy Runner Wraps Runtime Attempts Instead Of Adapters Retrying Internally

- **Status:** Accepted
- **Date:** 2026-05-19
- **Sprint:** `targets/agentwrap/sprints/06-resilience-policies/plan.md`
- **Requirement Source:** `targets/agentwrap/sources/PRD.md` graceful degradation and runtime abstraction; `targets/agentwrap/sources/TRD.md` retry, fallback, and backoff requirements.
- **Evidence Source:** Sprint 6 implementation in `/home/antonioborgerees/coding/agentwrap`; `targets/agentwrap/reports/evidence/resilience-policies.md`; `env GOCACHE=/tmp/agentwrap-gocache go test ./...`.
- **Decision:** Add `PolicyRunner` as a runtime-neutral wrapper around existing `Runtime` attempts. Runtime adapters continue to report explicit attempt outcomes; policy execution owns retry, fallback, backoff, rate-limit events, cancellation-aware waits, and attempt metadata.
- **Tradeoff:** The SDK gains a public orchestration layer before a second production runtime exists.
- **Rejected Alternatives:** Adding retry/fallback methods to `Runtime` was rejected because it would force every adapter to own policy semantics. Implementing retry in the OpenCode adapter was rejected because it would hard-code one flow and leak adapter-specific behavior into product logic.
- **Risk / Follow-up:** Keep `PolicyRunner` scoped to resilience attempts. Do not expand it into workflow/DAG composition without new requirements and evidence.

### DEC-017: Explicit Policy Context And Conservative Built-In Decisions

- **Status:** Accepted
- **Date:** 2026-05-19
- **Sprint:** `targets/agentwrap/sprints/06-resilience-policies/plan.md`
- **Requirement Source:** `targets/agentwrap/sources/TRD.md` retry/fallback/backoff policy inspection requirements and error model.
- **Evidence Source:** Sprint 6 `BasicPolicy` and policy tests in `/home/antonioborgerees/coding/agentwrap`; `studies/go-cli-study/reports/final/05-error-handling.md`; `env GOCACHE=/tmp/agentwrap-gocache go test ./...`.
- **Decision:** Policy decisions are made through `ResiliencePolicy.Decide(context.Context, PolicyContext) (PolicyDecision, error)`. `PolicyContext` carries request, attempt, prior attempts, current result/error, target, alternatives, rate-limit info, and a minimal validation placeholder. The built-in `BasicPolicy` retries only classified retryable failures within explicit bounds, does not retry unknown or unrecoverable failures by default, and falls back only to configured alternatives.
- **Tradeoff:** Callers must opt into retry/fallback behavior instead of receiving broad automatic recovery.
- **Rejected Alternatives:** Static retry structs only were rejected because they cannot express caller-defined fallback/session decisions. Callback-only hooks were rejected because they encourage hidden side effects and mutable policy state.
- **Risk / Follow-up:** Sprint 7 should revisit the minimal validation placeholder when real validation results exist.

### DEC-018: Attempt History And Policy Decisions Are First-Class Run Metadata

- **Status:** Accepted
- **Date:** 2026-05-19
- **Sprint:** `targets/agentwrap/sprints/06-resilience-policies/plan.md`
- **Requirement Source:** `targets/agentwrap/sources/PRD.md` observability and metadata; `targets/agentwrap/sources/TRD.md` metadata requirements and retry/fallback attempt relationships.
- **Evidence Source:** Sprint 6 implementation in `metadata.go` and `policy.go`; policy tests proving failed attempts remain visible after success; `env GOCACHE=/tmp/agentwrap-gocache go test ./...`.
- **Decision:** Store per-attempt summaries in `RunMetadata.Attempts` and policy decisions in `RunMetadata.Policy`. Attempt summaries include attempt number, target index, runtime run ID, parent logical run ID, runtime/provider/model context, safe request fields, session metadata, timing, status, error category, rate-limit metadata, and native metadata references.
- **Tradeoff:** Run metadata grows before durable persistence is implemented.
- **Rejected Alternatives:** Reusing only the single `RunMetadata.Attempt` field was rejected because it cannot explain retry/fallback chains. Hiding failed attempts after a later success was rejected because graceful fallback must remain auditable.
- **Risk / Follow-up:** Sprint 8 persistence should store `Attempts` and `Policy.Decisions` so attempt history survives process lifetime.

### DEC-019: Rate Limits Have Dedicated Metadata And Policy Events

- **Status:** Accepted
- **Date:** 2026-05-19
- **Sprint:** `targets/agentwrap/sprints/06-resilience-policies/plan.md`
- **Requirement Source:** `targets/agentwrap/sources/PRD.md` graceful rate-limit handling; `targets/agentwrap/sources/TRD.md` rate-limit handling and canonical event model.
- **Evidence Source:** Sprint 6 `RateLimitInfo`, `EventRateLimit` policy emission, and tests for rate-limit retry/backoff behavior; `env GOCACHE=/tmp/agentwrap-gocache go test ./...`.
- **Decision:** Represent rate limits with `RateLimitInfo` and surface them through policy context, attempt metadata, and canonical `rate_limit` events. `BasicPolicy` can retry rate limits only when configured and honors `RetryAfter`/reset timing before generic backoff.
- **Tradeoff:** Real OpenCode/provider-specific rate-limit detection remains limited until fixtures or live evidence prove exact signal shapes.
- **Rejected Alternatives:** Treating rate limits as generic retryable errors was rejected because callers need policy-visible provider/model and retry timing metadata. Broad untested provider text parsing was rejected as fragile.
- **Risk / Follow-up:** Add adapter-local OpenCode rate-limit parsing only when fixture or live samples are available.

### DEC-020: Session Continuity Is Explicit Per Policy Decision

- **Status:** Accepted
- **Date:** 2026-05-19
- **Sprint:** `targets/agentwrap/sprints/06-resilience-policies/plan.md`
- **Requirement Source:** `targets/agentwrap/sources/PRD.md` retained runtime context; `targets/agentwrap/sources/TRD.md` retry/fallback retained-session requirements.
- **Evidence Source:** Sprint 6 policy decision/request derivation and session metadata tests; `targets/agentwrap/reports/evidence/session-lifecycle.md`; DEC-011; `env GOCACHE=/tmp/agentwrap-gocache go test ./...`.
- **Decision:** Policy decisions can explicitly set session behavior using existing `SessionAction` values, and attempt metadata records the requested and resolved session relationship. Built-in policy behavior does not silently force same-session retry.
- **Tradeoff:** Conservative defaults may require callers to configure session reuse when they want retained context.
- **Rejected Alternatives:** Always retrying in the same session was rejected because malformed/unknown failures can leave context unsafe. Always starting fresh was rejected because it discards useful retained context when a policy intentionally wants it.
- **Risk / Follow-up:** OpenCode same-session continuation remains best-effort until live runtime evidence verifies durable behavior.

### DEC-021: Minimal Core Status, Event, Error, And Policy Fact Model

- **Status:** Accepted
- **Date:** 2026-05-19
- **Sprint:** Post-Sprint 6 architecture cleanup before Sprint 7.
- **Requirement Source:** `targets/agentwrap/sources/TRD.md` runtime interface, structured events, error model, retry/fallback policy, and observability requirements; `targets/agentwrap/roadmap.md` Sprints 7+ validation/repair and observability scope.
- **Evidence Source:** `targets/agentwrap/reports/opencode-internals-report.md`; implementation cleanup in `/home/antonioborgerees/coding/agentwrap`; `GOCACHE=/tmp/agentwrap-gocache go test ./...`; real OpenCode smoke `AGENTWRAP_OPENCODE_SMOKE=1 GOCACHE=/tmp/agentwrap-gocache go test ./opencode -run TestRealOpenCodeSmoke -count=1 -timeout 3m` run outside the sandbox.
- **Decision:** Keep the SDK core model small and facts-first. Public run outcome uses `RunStatus` with only `starting`, `running`, `completed`, `failed`, and `cancelled`. Recovery phases such as retry, fallback, validation, repair, health, and cleanup are represented as events or metadata, not core run states. The canonical `Event` envelope contains only `ID`, `RunID`, `SessionID`, `Time`, `Type`, `Payload`, and `Raw`; SDK event projection is stored as payload metadata and exposed through `Event.Kind()`. `SDKError` stores failure facts such as category, operation, user/debug detail, status code, response headers/body, provider/model/runtime, exit/signal/native type, retry-after, metadata, and cause. Retry/fallback/user-actionability/unrecoverability are policy decisions made from facts at decision time, not boolean truth stored on the error. `BasicPolicy` owns default classification and exposes `ShouldRetry` / `ShouldFallback` hooks for callers to override strategy.
- **Tradeoff:** This is a breaking cleanup: older callers and tests that relied on lifecycle states such as `retrying`, `fallback`, `validating`, `repairing`, `cleaned_up`, event envelope fields such as `Sequence`, `TurnID`, `CorrelationID`, `CauseEventID`, `Context`, or error booleans must move to payload metadata, run metadata, or policy hooks.
- **Rejected Alternatives:** Mirroring OpenCode's exact 4 internal runner states was rejected because `agentwrap` needs caller-facing terminal statuses. Keeping the previous 14-state lifecycle was rejected because it mixed execution status with policy phases. Keeping event category and correlation fields in the canonical envelope was rejected because they were SDK projections rather than native event facts. Keeping `Retryable`/`Fallbackable`/`UserActionable`/`Unrecoverable` on `SDKError` was rejected because agentwrap-level retryability can differ from OpenCode-level retryability and must be strategy-owned.
- **Risk / Follow-up:** DEC-005, DEC-006, DEC-013, and DEC-017 are superseded where they describe the older envelope, error booleans, lifecycle vocabulary, or built-in retry classification. Sprint 7 validation/repair must build on fact-based errors and policy hooks rather than reintroducing lifecycle states for repair phases. Sprint 8 persistence should store event payload kind and policy metadata explicitly because those fields are no longer top-level event envelope fields.

### DEC-022: Permission Policy Is Initialized Through RunRequest And Translated By Adapters

- **Status:** Accepted
- **Date:** 2026-05-20
- **Sprint:** `targets/agentwrap/sprints/07-permission-policy/plan.md`
- **Requirement Source:** `targets/agentwrap/sources/PRD.md` permissions and blocking states; `targets/agentwrap/sources/TRD.md` permission/sandbox configuration and canonical permission events.
- **Evidence Source:** `targets/agentwrap/reports/permission-based-agent-wrapping.md`; Sprint 7 implementation in `/home/antonioborgerees/coding/agentwrap`; `GOCACHE=/tmp/agentwrap-go-build go test ./...`.
- **Decision:** Add structured `PermissionPolicy` to `RunRequest` while preserving legacy `PermissionMode` for compatibility and config summaries. Callers express SDK-level tool classes and actions at run initialization. Runtime adapters translate supported fields into native configuration and record support/audit metadata with a stable permission policy ID.
- **Tradeoff:** The public SDK gains a structured permission surface before a second runtime adapter exists.
- **Rejected Alternatives:** Adapter options were rejected because permission posture is caller intent for a specific run, not global runtime construction state. Mutating user OpenCode config files was rejected in favor of per-process `OPENCODE_CONFIG_CONTENT`.
- **Risk / Follow-up:** Sprint 11 should pressure-test the SDK tool vocabulary against Codex or Claude Code permission semantics.

### DEC-023: Live OpenCode Approval Posting Is Deferred Until Server-Mode Transport Exists

- **Status:** Accepted
- **Date:** 2026-05-20
- **Sprint:** `targets/agentwrap/sprints/07-permission-policy/plan.md`
- **Requirement Source:** `targets/agentwrap/roadmap.md` Sprint 7 scope; `targets/agentwrap/reports/permission-based-agent-wrapping.md` OpenCode event/approval API evidence.
- **Evidence Source:** Current OpenCode adapter in `/home/antonioborgerees/coding/agentwrap/opencode` uses `opencode run --format json` subprocess output, not `opencode serve` SSE/REST transport; `GOCACHE=/tmp/agentwrap-go-build go test ./...`; `GOCACHE=/tmp/agentwrap-go-build AGENTWRAP_OPENCODE_PERMISSION_SMOKE=1 go test ./opencode -run TestRealOpenCodePermissionSmoke -count=1 -timeout 10m`.
- **Decision:** Sprint 7 implements initialization-time policy translation and audit visibility for the current subprocess adapter. It does not claim live REST/SSE approval posting. Unsupported live approval behavior is documented as a deferral rather than faked.
- **Tradeoff:** Manual approval is represented through `ask` policy and native OpenCode behavior, but the SDK cannot yet programmatically answer approval requests over REST/SSE in subprocess mode.
- **Rejected Alternatives:** Implementing a broad public `ToolApprovalService` now was rejected because the adapter lacks the required transport and the roadmap explicitly defers that abstraction. Pretending JSON permission events can be answered without an approval API was rejected as unsafe.
- **Risk / Follow-up:** Add an OpenCode server-mode adapter or approval transport before promising SDK-managed live approval decisions.

## Superseded Decisions

- DEC-005 is superseded where it requires sequence, correlation, cause, context, or category fields in the canonical event envelope.
- DEC-006 is superseded where it requires retryable, fallbackable, user-actionable, or unrecoverable booleans on `SDKError`.
- DEC-013 is superseded where it requires public correlation fields or a broader lifecycle vocabulary beyond minimal run status.
- DEC-017 is superseded where it says `BasicPolicy` retries only pre-classified retryable failures or treats unrecoverable error flags as default policy truth.

## Open Decision Backlog

| Area | Open Decision | Requirement Source | Evidence To Reopen | Target Sprint |
| --- | --- | --- | --- | --- |
| Primitive boundary | What is the smallest public primitive: runtime, provider, session, run, turn, task, or workflow? | PRD open product questions; TRD runtime interface and lifecycle requirements | Resolved by DEC-004; reopen only if Sprint 3 adapter evidence contradicts it | Sprint 3 |
| Workflow composition | Which workflow composition concerns belong in the SDK versus UltraPlan or other products? | PRD non-goals; TRD system boundary | `workflow-composition-and-observability` study evidence; UltraPlan integration findings | Sprint 2, Sprint 11 |
| Event compatibility | How should canonical event compatibility be versioned and extended without breaking callers? | TRD canonical event model and open technical questions | DEC-005 defines the envelope; Sprint 3 should pressure-test versioning against OpenCode events | Sprint 3 |
| Native payload preservation | How should native runtime event schemas be preserved, upgraded, and exposed safely? | PRD structured events; TRD structured runtime events | OpenCode adapter evidence and event fixtures | Sprint 3 |
| Schema and validation strategy | What Go-friendly or implementation-language-appropriate validation/schema strategy should represent expected outputs and structured events? | PRD output validation; TRD output/artifact validation | `testing-strategy.md`, `validation-repair.md`, project skeleton decisions | Sprint 1, Sprint 7 |
| Metadata requirements | Which metadata fields are mandatory versus best-effort when runtimes expose incomplete data? | PRD observability and metadata; TRD metadata requirements | `observability-metadata.md`, OpenCode metadata realities | Sprint 4, Sprint 8 |
| Session retention | Which transitions should default to same session, forked session, fresh session, release, or replacement? | PRD retained runtime context; TRD run and session lifecycle | `session-lifecycle.md`, repair and lifecycle implementation evidence | Sprint 4, Sprint 7 |
| Output expectations | How should callers describe required files, directories, report sections, schemas, metadata fields, and custom validators in a runtime-neutral way? | PRD validate required outputs; TRD output and artifact validation | `validation-repair.md`, fake runtime fixtures, validation implementation | Sprint 7 |
| Repair behavior | How should repair attempts balance automated recovery, retained context, bounded attempts, and explicit user visibility? | PRD graceful degradation and repair questions; TRD repair and reprompt | `validation-repair.md`, `session-lifecycle.md`, policy tests | Sprint 7 |
| Decode failures | What is the default policy when structured event decoding fails mid-run? | TRD structured runtime events and error model | OpenCode event fixtures, malformed-event tests | Sprint 3 |
| Persistence backend boundary | What persistence model should the SDK expose without prescribing a product storage engine? | TRD persistence requirements | `observability-metadata.md`, fake persistence hooks, integration findings | Sprint 8 |
| Executable surface | Should this target expose any user-facing executable surface at all, or keep executable material as internal study evidence only? | User clarification; PRD product goals; TRD system boundary | internal engineering evidence, target docs, future scope decisions | Deferred / likely never |
| Configuration precedence | How should runtime defaults, caller-provided values, environment, and optional config files combine? | TRD configuration requirements | configuration management evidence and project skeleton findings | Sprint 5 |
| Concurrency limits | How should caller-defined concurrency limits and shared runtime/provider limits be represented? | TRD concurrency and rate-limit requirements | resilience and observability evidence, fake runtime stress tests | Sprint 6 |
| Security and permissions | How should permissions, sandbox constraints, secret masking, and non-interactive operation be modeled? | TRD permissions, sandboxing, and security requirements | security evidence, OpenCode adapter permission behavior | Sprint 3, Sprint 5 |

## Deferred In Sprint 0

- Public runtime/session/run/turn/event API.
- Go module, package layout, executable framework, and thin entrypoint.
- Event schema versioning and native payload compatibility policy.
- Persistence technology or storage format.
- Configuration file format and precedence details.
- Validation/schema implementation technology.
- OpenCode process invocation, health checks, cancellation, cleanup, retry, fallback, repair, and fixture design.
