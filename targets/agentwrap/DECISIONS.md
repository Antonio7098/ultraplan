# Decision Log: agentwrap

> Sources: `targets/agentwrap/sources/PRD.md`, `targets/agentwrap/sources/TRD.md`, `targets/agentwrap/sources/feature-architecture.md`, `targets/agentwrap/roadmap.md`, `targets/agentwrap/sprints/00-target-brief/reasoning.md`, `targets/agentwrap/reports/sprint-evidence/00-target-brief.txt`

## Policy

Record a decision when a sprint makes a durable product, SDK, public API, lifecycle, event, error, persistence, configuration, validation, CLI, or test strategy choice that future work must honor.

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

### DEC-001: Root SDK Package With Thin CLI Entrypoint

- **Status:** Accepted
- **Date:** 2026-05-18
- **Sprint:** `targets/agentwrap/sprints/01-project-skeleton/plan.md`
- **Requirement Source:** `targets/agentwrap/sources/PRD.md` product goals and non-goals; `targets/agentwrap/sources/TRD.md` system boundary; `targets/agentwrap/roadmap.md` Sprint 1 scope.
- **Evidence Source:** `targets/agentwrap/reports/sprint-evidence/01-project-skeleton.txt`; `studies/go-cli-study/reports/final/01-project-structure.md`; implementation in `/home/antonioborgerees/coding/agentwrap`.
- **Decision:** Use one Go module with the root package reserved for public SDK documentation and future public contracts, `cmd/agentwrap` as the executable composition root, and `internal/` for private CLI and test harness code.
- **Tradeoff:** The root package exists before public runtime/session/event contracts are implemented.
- **Rejected Alternatives:** `pkg/agentwrap` was rejected because it adds path stutter before multiple public packages exist. Keeping all code under `internal/` was rejected because the product is an SDK, not only a CLI.
- **Risk / Follow-up:** Keep the root package minimal until Sprint 2 defines the public contract.

### DEC-002: Framework-Neutral CLI Skeleton With Injected IO

- **Status:** Accepted
- **Date:** 2026-05-18
- **Sprint:** `targets/agentwrap/sprints/01-project-skeleton/plan.md`
- **Requirement Source:** `targets/agentwrap/roadmap.md` Sprint 1 quality gate and CLI thinness rule.
- **Evidence Source:** `targets/agentwrap/reports/sprint-evidence/01-project-skeleton.txt`; `studies/go-cli-study/reports/final/02-command-architecture.md`; `studies/go-cli-study/reports/final/03-dependency-injection.md`; `studies/go-cli-study/reports/final/06-io-abstraction.md`; implementation in `internal/cli`.
- **Decision:** Keep the Sprint 1 CLI framework-neutral. `cmd/agentwrap/main.go` wires process args and IO, while `internal/cli.Run` accepts explicit dependencies and returns an exit code.
- **Tradeoff:** Sprint 9 may later refactor to Cobra or another framework if the real command surface earns it.
- **Rejected Alternatives:** Cobra was rejected as premature for a skeleton with no product command tree. Argument handling directly in `main.go` was rejected because it weakens in-process tests.
- **Risk / Follow-up:** Reopen the CLI framework choice in Sprint 9.

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

## Superseded Decisions

None.

## Open Decision Backlog

| Area | Open Decision | Requirement Source | Evidence To Reopen | Target Sprint |
| --- | --- | --- | --- | --- |
| Primitive boundary | What is the smallest public primitive: runtime, provider, session, run, turn, task, or workflow? | PRD open product questions; TRD runtime interface and lifecycle requirements | `runtime-contract.md`, `session-lifecycle.md`, Sprint 2 implementation pressure | Sprint 2 |
| Workflow composition | Which workflow composition concerns belong in the SDK versus UltraPlan or other products? | PRD non-goals; TRD system boundary | `workflow-composition-and-observability` study evidence; UltraPlan integration findings | Sprint 2, Sprint 11 |
| Event compatibility | How should canonical event compatibility be versioned and extended without breaking callers? | TRD canonical event model and open technical questions | `runtime-contract.md`, OpenCode structured event adapter findings | Sprint 2, Sprint 3 |
| Native payload preservation | How should native runtime event schemas be preserved, upgraded, and exposed safely? | PRD structured events; TRD structured runtime events | OpenCode adapter evidence and event fixtures | Sprint 3 |
| Schema and validation strategy | What Go-friendly or implementation-language-appropriate validation/schema strategy should represent expected outputs and structured events? | PRD output validation; TRD output/artifact validation | `testing-strategy.md`, `validation-repair.md`, project skeleton decisions | Sprint 1, Sprint 7 |
| Metadata requirements | Which metadata fields are mandatory versus best-effort when runtimes expose incomplete data? | PRD observability and metadata; TRD metadata requirements | `observability-metadata.md`, OpenCode metadata realities | Sprint 4, Sprint 8 |
| Session retention | Which transitions should default to same session, forked session, fresh session, release, or replacement? | PRD retained runtime context; TRD run and session lifecycle | `session-lifecycle.md`, repair and lifecycle implementation evidence | Sprint 4, Sprint 7 |
| Output expectations | How should callers describe required files, directories, report sections, schemas, metadata fields, and custom validators in a runtime-neutral way? | PRD validate required outputs; TRD output and artifact validation | `validation-repair.md`, fake runtime fixtures, validation implementation | Sprint 7 |
| Repair behavior | How should repair attempts balance automated recovery, retained context, bounded attempts, and explicit user visibility? | PRD graceful degradation and repair questions; TRD repair and reprompt | `validation-repair.md`, `session-lifecycle.md`, policy tests | Sprint 7 |
| Decode failures | What is the default policy when structured event decoding fails mid-run? | TRD structured runtime events and error model | OpenCode event fixtures, malformed-event tests | Sprint 3 |
| Persistence backend boundary | What persistence model should the SDK expose without prescribing a product storage engine? | TRD persistence requirements | `observability-metadata.md`, fake persistence hooks, integration findings | Sprint 8 |
| CLI shape | Should this target expose any CLI surface at all, or keep CLI material as internal study evidence only? | User clarification; PRD product goals; TRD system boundary | `go-cli-study` final reports, internal-engineering target docs, future scope decisions | Deferred / likely never |
| Configuration precedence | How should runtime defaults, caller-provided values, environment, and optional config files combine? | TRD configuration requirements | configuration management evidence and project skeleton findings | Sprint 5 |
| Concurrency limits | How should caller-defined concurrency limits and shared runtime/provider limits be represented? | TRD concurrency and rate-limit requirements | resilience and observability evidence, fake runtime stress tests | Sprint 6 |
| Security and permissions | How should permissions, sandbox constraints, secret masking, and non-interactive operation be modeled? | TRD permissions, sandboxing, and security requirements | security evidence, OpenCode adapter permission behavior | Sprint 3, Sprint 5 |

## Deferred In Sprint 0

- Public runtime/session/run/turn/event API.
- Go module, package layout, command framework, and CLI skeleton.
- Event schema versioning and native payload compatibility policy.
- Persistence technology or storage format.
- Configuration file format and precedence details.
- Validation/schema implementation technology.
- OpenCode process invocation, health checks, cancellation, cleanup, retry, fallback, repair, and fixture design.
