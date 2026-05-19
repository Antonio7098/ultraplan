# Study Index: agentwrap

## Purpose

This index routes implementation planning to the right evidence packs. The packs are intentionally small, but they are not the full sprint context. For sprint planning, load the relevant evidence packs and open their linked final reports, per-source reports, and code references as needed.

Primary target docs:

- `targets/agentwrap/sources/PRD.md`
- `targets/agentwrap/sources/TRD.md`
- `targets/agentwrap/sources/feature-architecture.md`

Primary study:

- `studies/opencode-wrap-study/reports/final/01-runtime-contract-and-api-shape.md`
- `studies/opencode-wrap-study/reports/final/02-process-session-lifecycle.md`
- `studies/opencode-wrap-study/reports/final/03-resilience-fallback-and-validation.md`
- `studies/opencode-wrap-study/reports/final/04-workflow-composition-and-observability.md`

Supporting Go CLI study:

- `studies/go-cli-study/reports/final/01-project-structure.md`
- `studies/go-cli-study/reports/final/02-command-architecture.md`
- `studies/go-cli-study/reports/final/03-dependency-injection.md`
- `studies/go-cli-study/reports/final/04-configuration-management.md`
- `studies/go-cli-study/reports/final/05-error-handling.md`
- `studies/go-cli-study/reports/final/06-io-abstraction.md`
- `studies/go-cli-study/reports/final/07-state-context.md`
- `studies/go-cli-study/reports/final/08-concurrency.md`
- `studies/go-cli-study/reports/final/09-terminal-ux.md`
- `studies/go-cli-study/reports/final/10-logging-observability.md`
- `studies/go-cli-study/reports/final/11-testing-strategy.md`
- `studies/go-cli-study/reports/final/12-extensibility.md`
- `studies/go-cli-study/reports/final/13-security.md`
- `studies/go-cli-study/reports/final/14-performance.md`
- `studies/go-cli-study/reports/final/15-philosophy.md`

## Evidence Packs

| Evidence Pack | Use For | Primary Reports | Supporting Reports |
| --- | --- | --- | --- |
| `evidence/runtime-contract.md` | Public SDK shape, runtime/session/run/turn abstractions, native vs canonical events, future runtime support | opencode-wrap `01` | go-cli `03`, `06`, `12` |
| `evidence/session-lifecycle.md` | Run/session lifecycle, retained sessions, cancellation, cleanup, malformed event handling, same-session retry/repair | opencode-wrap `02` | go-cli `07`, `08`, `14` |
| `evidence/resilience-policies.md` | Health checks, retry, fallback, backoff, rate limits, explicit failure classification | opencode-wrap `03` | go-cli `04`, `05`, `13` |
| `evidence/validation-repair.md` | Required outputs, artifact validation, repair prompts, missing/empty/malformed output handling | opencode-wrap `03` | go-cli `05`, `06`, `11` |
| `evidence/observability-metadata.md` | Active run views, event projection, usage/cost/timing metadata, auditability | opencode-wrap `04` | go-cli `10`, `14`, `15` |
| `evidence/cli-design.md` | Go CLI packaging and command shape for the eventual CLI surface around the SDK | go-cli `01`, `02`, `04`, `09` | go-cli `03`, `05`, `11`, `12` |
| `evidence/testing-strategy.md` | Test layout, fake runtimes, golden/fixture tests, integration boundaries, confidence gates | go-cli `11` | opencode-wrap `01`, `02`, `03`, `04` |

## Planning Rule

For any sprint plan:

1. Start with the PRD/TRD requirement sections.
2. Use this index to select the relevant evidence packs.
3. Load the evidence packs and their linked final reports.
4. Open per-source reports and code references only when a concrete decision needs them.
5. Record decisions in `targets/agentwrap/DECISIONS.md` when implementation begins.

## Initial Sprint Routing

| Sprint Area | Required Evidence Packs |
| --- | --- |
| Core SDK contract | `runtime-contract.md`, `testing-strategy.md` |
| OpenCode structured event adapter | `runtime-contract.md`, `session-lifecycle.md`, `testing-strategy.md` |
| Lifecycle, cancellation, retained sessions | `session-lifecycle.md`, `observability-metadata.md`, `testing-strategy.md` |
| Health and configuration validation | `resilience-policies.md`, `cli-design.md` |
| Retry/fallback/backoff policies | `resilience-policies.md`, `session-lifecycle.md` |
| Output validation and repair | `validation-repair.md`, `session-lifecycle.md` |
| Observability and run metadata | `observability-metadata.md`, `cli-design.md` |
| CLI wrapper surface | `cli-design.md`, `runtime-contract.md`, `resilience-policies.md` |

## Compression Boundary

This index intentionally does not summarize every report. The evidence packs are the selector layer. Sprint plans should cite the evidence packs and quote or link specific report evidence only when making a concrete decision.
