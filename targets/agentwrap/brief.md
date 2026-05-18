# Target Brief: agentwrap

> Sources: `targets/agentwrap/sources/PRD.md`, `targets/agentwrap/sources/TRD.md`, `targets/agentwrap/sources/feature-architecture.md`, `targets/agentwrap/roadmap.md`, `targets/agentwrap/sprints/00-target-brief/reasoning.md`, `targets/agentwrap/reports/sprint-evidence/00-target-brief.txt`
> Implementation: `/home/antonioborgerees/coding/agentwrap`

## Purpose

Build a reusable runtime wrapper SDK for starting, supervising, observing, cancelling, validating, and recovering agentic coding runtime work from product workflows. OpenCode is the first supported runtime, but the SDK must stay product-agnostic and runtime-neutral enough to support later runtimes such as Codex, Claude Code, Pi, ACP-compatible agents, and direct provider workers.

The reused Go study material is internal evidence about boundaries, dependency injection, IO handling, and testing discipline. It does not mean this target is becoming a CLI product.

The SDK is a foundational primitive for UltraPlan, 24-hour-testers, and future tools. Product callers should not need to understand each runtime's native process model, event format, provider setup, permission behavior, output truncation behavior, or failure modes.

## Target Users

- Developers building agent-powered workflow tools.
- UltraPlan users running comparative studies, synthesis, sprint planning, and implementation reviews.
- Reliability and QA workflows that need long-running autonomous agent execution.
- Future products that need to orchestrate multiple agent runtimes behind one interface.

## Product Goals

- Provide one consistent way to start, monitor, cancel, and inspect runtime work.
- Make failures explicit, typed, classifiable, and recoverable where possible.
- Support configurable retry, fallback, backoff, validation, and repair flows without hiding unrecoverable failures.
- Preserve metadata for progress dashboards, cost estimation, auditing, synthesis, and historical inspection.
- Keep the SDK independent of UltraPlan-specific workflows and open to additional runtimes.
- Use structured runtime output where available instead of parsing free-form terminal text.

## Non-Goals

- Do not build UltraPlan workflows, study scoring, PRD/TRD generation, report templates, sprint roadmaps, feature planning, or source discovery inside the SDK.
- Do not choose implementation language details, storage engines, configuration file formats, framework choices, schema systems, or persistence backends from this brief.
- Do not rely on terminal text when structured runtime output exists.
- Do not hide unrecoverable setup, provider, permission, validation, or runtime failures behind endless retries.
- Do not add workflow or DAG abstractions before the lower-level runtime primitive is implemented, testable, observable, and hard to misuse.

## MVP Requirement Areas

- **Runtime abstraction:** Runtime-neutral starting, monitoring, cancellation, inspection, capability discovery, native diagnostics, and session retention where supported.
- **Run and session lifecycle:** Explicit states, stable run/session identifiers, one-shot and follow-up work, retained-session operations, cancellation, cleanup, and cleanup-failure reporting.
- **Structured events:** OpenCode structured JSON output first, decoded into canonical lifecycle, progress, message, tool, artifact, permission, rate-limit, warning, error, usage, validation, retry, fallback, and final-result events.
- **Native payload preservation:** Canonical events must preserve enough native structured payload detail for debugging and future compatibility.
- **Health and readiness:** Runtime, provider, model, authentication, and compatibility checks that distinguish unrecoverable, transient, degraded, and unknown states.
- **Configuration:** Runtime, provider, model, permissions, sandbox, retry, fallback, timeout, validation, and metadata configuration with inspectable effective values and secret-safe diagnostics.
- **Retry, fallback, and repair:** Caller-configurable policies that can inspect errors, attempts, runtime/provider/model, validation results, rate limits, and session-continuation support.
- **Validation:** Caller-defined expected outputs, including files, directories, structured data, report sections, metadata fields, and custom validators; runtime exit success alone is insufficient.
- **Permissions and blocking states:** Permission prompts, interactive requests, blocked/waiting states, non-interactive policy, and cancellable waiting behavior.
- **Observability and metadata:** Active and historical status, event sinks, diagnostics, run records, artifact references, usage, timing, attempts, warnings, errors, and final status.
- **Cost and time estimation:** Best-effort pre-run estimates and observed duration, usage, and cost metadata, with estimates clearly distinguished from billing facts.
- **Persistence hooks:** Optional caller-enabled persistence for active inspection, historical inspection, event reconstruction, retained-session relationships, retry/fallback/repair lineage, and artifact references.
- **Security:** Secret-safe logs and errors, explicit sensitive configuration handling, least-privilege/non-interactive support, and trust-boundary-relevant events.

## Technical Boundary

The SDK owns reusable runtime supervision primitives. Products own product-specific workflows.

Inside the SDK boundary:

- runtime-neutral execution primitives
- OpenCode adapter behavior when that sprint is in scope
- lifecycle, event projection, health, configuration, policy, validation, repair, observability, metadata, and persistence hooks
- typed/classified errors and explicit state transitions

Outside the SDK boundary:

- UltraPlan study dimensions, scoring systems, reports, sprint plans, roadmaps, and source discovery
- product dashboards and workflow composition beyond reusable runtime state
- product-specific validation policies, prompts, synthesis rules, and review workflows

## Acceptance Direction

Later implementation sprints must make it possible for a caller to run OpenCode through the SDK, receive canonical structured events, show active progress without runtime-specific code, fail fast on missing setup, handle rate limits and transient failures by policy, validate required outputs, preserve run metadata, and add a second runtime without changing the core product-facing workflow model.

Sprint 0 does not implement these capabilities. It records them as requirements and decision pressure for later sprints.

## Feature-Architecture Guardrails

- Start each later feature by stating the new behavior, trigger, outcome, and sync/async shape.
- Identify durable, ephemeral runtime, and derived state before choosing modules.
- Assign each state owner to a clear system boundary.
- Draw the flow linearly before coding: input -> runtime -> logic -> state mutation -> output.
- Separate runtime orchestration from pure logic and external infrastructure.
- Introduce abstractions only when there is real volatility, more than one implementation or imminent implementation pressure, and simpler reasoning.
- Write the runtime flow first, then extract logic, infra, or persistence only after the flow stabilizes.
- Keep state transitions explicit and avoid hidden mutations inside helpers.

## Later-Sprint Guardrails

- Sprint 1 may create the minimal project skeleton and fake runtime test harness, but not real OpenCode behavior.
- Sprint 2 must earn the public runtime contract from runtime/session/event requirements and evidence; Sprint 0 does not choose the smallest primitive.
- Sprint 3 and later adapter work must use structured OpenCode output and preserve native payloads where safe.
- Runtime primitives must stay separate from UltraPlan workflow/DAG composition.
- Study material about executables and entrypoints is evidence about internals only, not a commitment to ship a user-facing executable surface here.
- Use fake runtimes and fixtures before trusting real OpenCode runs.
- Treat runtime exit success as insufficient; product success requires validation.
- Record major decisions in `targets/agentwrap/DECISIONS.md` with requirement, evidence, tradeoff, rejected alternative, risk/follow-up, status, and date.

## Open Questions To Carry Forward

- What is the smallest caller-facing primitive: runtime, provider, session, run, turn, task, or workflow?
- Which workflow composition concerns belong in the SDK, and which should remain in UltraPlan or other products?
- How should callers describe expected outputs in a runtime-neutral way?
- How should canonical event compatibility and native payload preservation be versioned?
- What metadata must be mandatory, and what can remain best-effort when runtimes expose incomplete usage or cost data?
- What should happen when structured event decoding fails mid-run?
- How should artifact references be normalized across local files, reports, remote outputs, and future source types?
- Which retained-session transitions should default to continuing context, and when is a fresh session safer?
- How should repair attempts balance automated recovery with explicit user visibility?
- What validation or schema strategy should be used if implementation language and package choices make that relevant?

## Planning Entry Point

Future sprint planners should start with this brief, the roadmap sprint section, the sprint reasoning and plan templates, and that sprint's generated evidence bundle. This brief is not a replacement for PRD/TRD requirements or evolved study evidence; it is a compact index of target intent, boundaries, guardrails, and unresolved decisions.
