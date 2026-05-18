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

## Superseded Decisions

None.

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
