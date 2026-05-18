# Decision Log: opencode-wrap

> Sources: `targets/runwrap/sources/PRD.md`, `targets/runwrap/sources/TRD.md`, `targets/runwrap/sources/feature-architecture.md`, `targets/runwrap/roadmap.md`, `targets/runwrap/sprints/00-target-brief/reasoning.md`, `targets/runwrap/reports/sprint-evidence/00-target-brief.txt`

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

No accepted implementation or architecture decisions yet.

Sprint 0 creates the target brief and this decision scaffold only. Runtime primitives, package layout, event schema, persistence, CLI shape, validation technology, and OpenCode adapter behavior remain undecided until later evidence-backed sprints.

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
| CLI shape | What command hierarchy and command framework, if any, should expose runtime SDK behavior? | Roadmap Sprint 9; PRD product goals | `cli-design.md`, project skeleton and command architecture evidence | Sprint 1, Sprint 9 |
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
