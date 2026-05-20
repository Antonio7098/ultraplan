# Roadmap: agentwrap

## Roadmap Intent

Build the runtime wrapper SDK incrementally from the foundations upward. Each sprint should produce a small, reviewable layer that can be evaluated against the relevant study reports before the next layer starts.

The reused Go study material in this target is internal evidence about internals, boundaries, dependency injection, IO handling, and testing discipline. It is not a directive to ship a user-facing executable product.

The guiding rule is: do not add workflow complexity until the lower-level runtime primitive is demonstrably correct, testable, observable, and hard to misuse.

## Evidence Base

Target requirements:

- `targets/agentwrap/sources/PRD.md`
- `targets/agentwrap/sources/TRD.md`
- `targets/agentwrap/sources/feature-architecture.md`

Compression layer:

- `targets/agentwrap/reports/study-index.md`
- `targets/agentwrap/reports/evidence/runtime-contract.md`
- `targets/agentwrap/reports/evidence/session-lifecycle.md`
- `targets/agentwrap/reports/evidence/resilience-policies.md`
- `targets/agentwrap/reports/evidence/validation-repair.md`
- `targets/agentwrap/reports/evidence/observability-metadata.md`
- `targets/agentwrap/reports/evidence/testing-strategy.md`
- `targets/agentwrap/reports/permission-based-agent-wrapping.md`

Primary study dimensions:

- Runtime contract and API shape
- Process and session lifecycle
- Resilience, fallback, and validation
- Workflow composition and observability

Supporting Go internals/principles dimensions:

- Project structure and boundaries
- Command architecture
- Dependency injection
- Configuration management
- Error handling
- IO abstraction
- State and context
- Concurrency
- Terminal UX
- Logging and observability
- Testing strategy
- Extensibility
- Security
- Performance
- Engineering philosophy

## Evidence Loading Strategy

The evidence packs are selectors, not the full planning context.

For sprint planning, load the relevant evidence packs (each ~40 lines). Read the compressed guidance first, then open linked final reports only when a decision needs deeper evidence. Open per-source reports and code references only when final-report evidence is insufficient for a concrete decision.

The sprint planner should load the PRD, TRD, feature architecture protocol, roadmap sprint section, and the relevant evidence packs.

If the full set of reports does not fit into context:

1. Load the PRD, TRD, feature architecture protocol, and roadmap sprint section first.
2. Load the evidence pack sections.
3. Load only the `Final Report:` sections that match the sprint decisions being made.
4. Open per-source reports only when final-report evidence is insufficient.
5. Load resolved code references only for decisions that need concrete implementation evidence.
6. Record what was omitted from context and why in the sprint plan.

The sprint planner may explore more source reports or repository code directly when the evidence packs and final reports do not provide enough evidence for a decision. That exploration should be narrow, cited in the sprint plan, and tied to a specific requirement, tradeoff, risk, or open question.

## Non-Negotiable Development Rules

- Every sprint starts from the PRD/TRD requirement sections it satisfies.
- Every sprint plan cites the evidence packs used to inform its decisions.
- Every sprint ends with an evaluation against the same study dimensions that informed it.
- Do not proceed to the next sprint while known foundational defects remain.
- Keep executable-oriented study material internal to engineering principles; do not infer a user-facing executable surface from it.
- Keep product-specific UltraPlan workflow logic out of the SDK.
- Prefer explicit state, explicit errors, explicit lifecycle, and earned abstractions.
- Use fake runtimes and fixtures before trusting real OpenCode runs.
- Treat runtime exit success as insufficient; product success requires validation.

## Sprint 0: Target Brief and Decision Scaffold

### Goal

Create the working planning surface for implementation without making architecture decisions prematurely.

### Scope

- Create a concise `brief.md` from the PRD, TRD, and feature architecture protocol.
- Create an empty `DECISIONS.md` with a lightweight decision template.
- Use the shared sprint-reasoning and sprint-plan templates that force requirement mapping, evidence mapping, tradeoffs, tests, and evaluation.

### Evidence Inputs

- `PRD.md`
- `TRD.md`
- `feature-architecture.md`
- `study-index.md`

### Output

- `targets/agentwrap/brief.md`
- `targets/agentwrap/DECISIONS.md`
- `templates/sprint-reasoning.md`
- `templates/sprint-plan.md`

### Quality Gate

- A new sprint can be planned from the template without rereading all study reports.
- Open questions are listed, not silently decided.

## Sprint 1: Project Skeleton and Test Harness

### Goal

Establish the repository structure, package boundaries, and test harness before implementing runtime behavior.

### Scope

- Create the minimal Go module and thin executable entrypoint.
- Separate SDK/library surface from the executable entrypoint.
- Add fake runtime fixtures and structured event fixture loading.
- Add first tests for fake event decoding and fake run lifecycle.
- Add no real OpenCode integration yet.

### Evidence Inputs

- `evidence/executable-design.md`
- `evidence/testing-strategy.md`
- `studies/go-cli-study/reports/final/01-project-structure.md`
- `studies/go-cli-study/reports/final/02-command-architecture.md`
- `studies/go-cli-study/reports/final/03-dependency-injection.md`
- `studies/go-cli-study/reports/final/06-io-abstraction.md`
- `studies/go-cli-study/reports/final/11-testing-strategy.md`

### Output

- Buildable project skeleton.
- Thin executable entrypoint.
- Fake runtime test harness.
- Event fixture directory.

### Quality Gate

- Tests can exercise SDK behavior without launching OpenCode.
- Entrypoint behavior can be constructed without side effects.
- No package cycle or unclear ownership boundary exists.
- The skeleton can be explained as: executable boundary -> SDK runtime primitive -> fake runtime.

## Sprint 2: Core Runtime Contract

### Goal

Define the smallest public SDK contract that can express a runtime run, session, event stream, artifacts, metadata, and errors.

### Scope

- Define runtime-neutral primitives.
- Define run/session identifiers and lifecycle states.
- Define canonical event envelope and event categories.
- Define raw native payload preservation.
- Define capability discovery at the interface level.
- Define typed/classified error requirements.
- Keep implementation minimal; fake runtime only.

### Evidence Inputs

- `evidence/runtime-contract.md`
- `evidence/session-lifecycle.md`
- `studies/opencode-wrap-study/reports/final/01-runtime-contract-and-api-shape.md`
- `studies/go-cli-study/reports/final/03-dependency-injection.md`
- `studies/go-cli-study/reports/final/06-io-abstraction.md`
- `studies/go-cli-study/reports/final/12-extensibility.md`
- `studies/go-cli-study/reports/final/05-error-handling.md`

### Output

- Public SDK contract.
- Fake runtime implementing the contract.
- Tests proving event consumption, lifecycle transitions, and error classification.

### Quality Gate

- The contract supports OpenCode without naming OpenCode in the common path.
- The contract can plausibly support a second runtime.
- Every public error is classifiable.
- Every event has enough metadata for dashboard and audit use.
- No workflow/DAG abstraction has been added yet.

## Sprint 3: OpenCode Structured Event Adapter

### Goal

Implement the first real runtime adapter around OpenCode structured output.

### Scope

- Start OpenCode in structured output mode.
- Decode native structured events.
- Map native events into canonical events.
- Preserve raw native event payloads.
- Surface malformed event errors explicitly.
- Capture runtime exit, stderr diagnostics, and final result state.
- Keep retry/fallback out of this sprint.

### Evidence Inputs

- `evidence/runtime-contract.md`
- `evidence/session-lifecycle.md`
- `studies/opencode-wrap-study/reports/final/01-runtime-contract-and-api-shape.md`
- `studies/opencode-wrap-study/reports/final/02-process-session-lifecycle.md`
- `studies/go-cli-study/reports/final/06-io-abstraction.md`
- `studies/go-cli-study/reports/final/05-error-handling.md`
- `studies/go-cli-study/reports/final/10-logging-observability.md`
- `studies/go-cli-study/reports/final/11-testing-strategy.md`

### Output

- OpenCode adapter.
- Structured event fixtures from representative OpenCode output.
- Unit tests for normal, unknown, malformed, partial, and final event streams.
- One gated integration test path for real OpenCode, if available.

### Quality Gate

- A caller can run OpenCode and consume canonical events.
- Malformed structured output is not treated as success.
- Native payloads remain available for diagnostics.
- OpenCode-specific mechanics do not leak into the common caller path.

## Sprint 4: Lifecycle, Cancellation, Cleanup, and Retained Sessions

### Goal

Make runtime execution reliable under cancellation, timeout, cleanup, and same-session continuation.

### Scope

- Model explicit run/session lifecycle transitions.
- Support caller cancellation.
- Ensure owned runtime work is cleaned up on success, failure, timeout, and cancellation.
- Add retained-session metadata and behavior where the runtime supports it.
- Represent same-session, forked-session, fresh-session, and unsupported-session flows.
- Keep retry policy simple or manual; full policy composition comes later.

### Evidence Inputs

- `evidence/session-lifecycle.md`
- `evidence/testing-strategy.md`
- `studies/opencode-wrap-study/reports/final/02-process-session-lifecycle.md`
- `studies/go-cli-study/reports/final/07-state-context.md`
- `studies/go-cli-study/reports/final/08-concurrency.md`
- `studies/go-cli-study/reports/final/14-performance.md`

### Output

- Lifecycle state machine.
- Cancellation/cleanup implementation.
- Retained session behavior and metadata.
- Tests for cancellation, timeout, process exit, cleanup failure, and retained-session unsupported behavior.

### Quality Gate

- Cancellation of one run cannot affect unrelated runs.
- Cleanup failures are visible and separate from primary run failures.
- Retained session behavior is explicit in events and metadata.
- No leaked workers/processes/sessions are observed in tests.

## Sprint 5: Health Checks and Configuration Validation

### Goal

Fail fast before expensive runtime work when setup is invalid, while preserving runtime-neutral configuration semantics.

### Scope

- Add health check interface and OpenCode health check implementation.
- Validate runtime availability, authentication/provider/model readiness where detectable.
- Define effective configuration inspection.
- Define configuration precedence semantics without overfitting to one file format.
- Surface unrecoverable vs transient vs degraded health states.
- Add executable commands for health and effective config inspection.

### Evidence Inputs

- `evidence/resilience-policies.md`
- `evidence/cli-design.md`
- `studies/opencode-wrap-study/reports/final/03-resilience-fallback-and-validation.md`
- `studies/go-cli-study/reports/final/04-configuration-management.md`
- `studies/go-cli-study/reports/final/02-command-architecture.md`
- `studies/go-cli-study/reports/final/05-error-handling.md`
- `studies/go-cli-study/reports/final/13-security.md`

### Output

- Health check API.
- OpenCode health check.
- Effective config model.
- executable health/config commands.
- Tests for invalid config, missing runtime, unavailable provider/model, and degraded state.

### Quality Gate

- Missing unrecoverable setup fails before a run starts.
- Effective configuration can be inspected.
- Sensitive values are not printed in normal output.
- Health errors are typed and policy-readable.

## Sprint 6: Retry, Backoff, Fallback, and Rate Limits

### Goal

Add composable resilience policies without hard-coding one retry/fallback flow into the adapter.

### Scope

- Define policy interface for retry, fallback, and backoff decisions.
- Support rate-limit classification and `OnRateLimit` hook behavior.
- Allow policies to inspect error, attempt, runtime, provider, model, validation result, and rate-limit metadata.
- Preserve attempt relationships.
- Allow policy decisions about retained session reuse versus fresh session.
- Keep validation/repair minimal until Sprint 8.

### Evidence Inputs

- `evidence/resilience-policies.md`
- `evidence/session-lifecycle.md`
- `studies/opencode-wrap-study/reports/final/03-resilience-fallback-and-validation.md`
- `studies/go-cli-study/reports/final/05-error-handling.md`
- `studies/go-cli-study/reports/final/04-configuration-management.md`
- `studies/go-cli-study/reports/final/07-state-context.md`

### Output

- Policy primitives.
- Attempt metadata model.
- Retry/backoff/fallback events.
- Tests for retryable, fallbackable, unrecoverable, rate-limited, and unknown failures.

### Quality Gate

- A caller can express `retry -> fallback -> retry` without adapter-specific branching.
- Rate limits are distinguishable from generic failures.
- Every attempt is traceable to the original run.
- Policy behavior is testable with fake runtimes.

## Sprint 7: Initialization-Time Permission Policy

### Goal

Let SDK callers decide the agent permission posture at initialization time, while the runtime adapter translates that policy into OpenCode configuration and manages OpenCode approval events internally.

### Scope

- Define runtime-neutral permission policy primitives for SDK initialization.
- Support tool-level modes such as allow, deny, and ask/manual.
- Support workspace and external-directory policy where the runtime can enforce it directly.
- Classify policy features as native, SDK-managed, unsupported, or best-effort before the run starts.
- Generate or inject OpenCode permission configuration through supported config mechanisms.
- Handle OpenCode runtime approval requests inside the adapter according to the initialized SDK policy.
- Allow optional manual approval handling for `ask` decisions without making live approval mandatory for all callers.
- Emit canonical permission decision and audit events through the existing event stream.
- Keep Codex and Claude Code permission mechanics as design pressure only; do not implement their adapters in this sprint.
- Do not introduce a broad public `ToolApprovalService` until real SDK callers need live approval orchestration.

### Evidence Inputs

- `reports/permission-based-agent-wrapping.md`
- `evidence/runtime-contract.md`
- `evidence/session-lifecycle.md`
- `evidence/resilience-policies.md`
- `evidence/observability-metadata.md`
- `studies/opencode-wrap-study/reports/final/01-runtime-contract-and-api-shape.md`
- `studies/opencode-wrap-study/reports/final/02-process-session-lifecycle.md`
- `studies/go-cli-study/reports/final/04-configuration-management.md`
- `studies/go-cli-study/reports/final/05-error-handling.md`
- `studies/go-cli-study/reports/final/10-logging-observability.md`
- `studies/go-cli-study/reports/final/13-security.md`

### Permission Report Evidence

The permission architecture report establishes that OpenCode supports static permission configuration through config/env injection and runtime permission decisions through an event stream plus approval API. For the current SDK goal, agentwrap should expose initialization-time policy and keep OpenCode-specific approval mechanics inside the adapter.

Use the report now for:

- OpenCode permission config shape and environment injection.
- OpenCode permission event and approval API mechanics.
- The distinction between native static policy and runtime-managed decisions.
- Auditability requirements for every permission decision.

Defer from the report:

- A full cross-agent approval abstraction.
- Codex `ApprovedExecpolicyAmendment` implementation.
- Claude Code callback implementation.
- Mandatory live approval orchestration for every caller.

### Output

- Public SDK permission policy model.
- OpenCode policy translation layer.
- OpenCode approval-event handling driven by initialized policy.
- Permission decision/audit canonical events.
- Preflight errors for unsupported or contradictory policy.
- Tests for allow, deny, ask/manual, unsupported policy, config generation, approval handling, and audit event emission.

### Quality Gate

- A caller can initialize a run with a permission policy and never interact with OpenCode approval APIs directly.
- OpenCode approvals are resolved consistently from SDK policy.
- Unsupported policy features fail clearly before run start unless explicitly configured as best-effort.
- Manual approval requests are possible for `ask`, but optional.
- Permission decisions are visible in canonical events and metadata.
- OpenCode permission details do not leak into the common caller path.

## Sprint 8: Output Validation and Repair

### Goal

Make successful runtime execution subordinate to caller-defined product success criteria.

### Scope

- Define expected output/artifact requirements.
- Add validators for file presence, directory presence, structured data, and caller-defined checks.
- Add validation result events.
- Add repair attempt flow after validation failure.
- Support same-session repair where available.
- Encourage artifact-first large output flows.
- Respect initialized permission policy during repair attempts.
- Ensure permission denials during repair are reported distinctly from validation failures.

### Evidence Inputs

- `evidence/validation-repair.md`
- `evidence/session-lifecycle.md`
- `reports/permission-based-agent-wrapping.md`
- `studies/opencode-wrap-study/reports/final/03-resilience-fallback-and-validation.md`
- `studies/go-cli-study/reports/final/06-io-abstraction.md`
- `studies/go-cli-study/reports/final/05-error-handling.md`
- `studies/go-cli-study/reports/final/11-testing-strategy.md`

### OpenCode Internals Evidence

OpenCode's `StructuredOutputError` (`session/prompt.ts:1834-1849`) demonstrates how structured output is injected as a tool and validated at decode time — missing or malformed structured output raises a typed error rather than returning partial data to the caller. The `StructuredOutput` tool definition enforces schema compliance at the model level before any result reaches the consumer.

For repair flows, OpenCode's `SessionProcessor.Handle` (`session/processor.ts:823`) shows dual-write persistence: tool results are persisted as `ToolPart` records with explicit state transitions (`pending → running → completed | error`). The processor's `updateToolCall()`, `completeToolCall()`, `failToolCall()` methods provide a per-part lifecycle that repair attempts can reuse. Same-session repair maps to OpenCode's session continuation pattern: forking (`session.fork()`) or continuing (`SessionProcessor.process()`) within the same retained session.

Session continuation and `parentID` tracking (`session/session.ts`) enable repair flows where a repair prompt runs in the same session context. This avoids context loss across repair attempts while preserving the causal chain.

### Output

- Validator API.
- Validation result model.
- Repair attempt lifecycle.
- Tests for missing output, malformed output, empty output, repair success, repair exhaustion, and unsupported same-session repair.

### Quality Gate

- Runtime exit success alone cannot mark a run successful when validators are configured.
- Validation failures include actionable repair context.
- Repair attempts are bounded and visible.
- Repair attempts cannot silently bypass the initialized permission policy.
- Large output expectations can be redirected to artifacts rather than process output.

## Sprint 9: Observability, Metadata, and Persistence Hooks

### Goal

Expose enough structured state for dashboards, historical inspection, synthesis, and cost/time analysis without locking the SDK to a storage backend.

### Scope

- Define run record metadata.
- Define event sink hooks.
- Define optional persistence interface.
- Capture runtime, provider, model, attempts, timing, status, warnings, errors, artifacts, usage, estimated cost, session retention metadata, and permission policy summary.
- Include permission decision and denial audit records in the canonical event history.
- Add active-run and completed-run inspection.
- Add executable status/inspect commands.

### Evidence Inputs

- `evidence/observability-metadata.md`
- `evidence/cli-design.md`
- `reports/permission-based-agent-wrapping.md`
- `studies/opencode-wrap-study/reports/final/04-workflow-composition-and-observability.md`
- `studies/go-cli-study/reports/final/10-logging-observability.md`
- `studies/go-cli-study/reports/final/14-performance.md`
- `studies/go-cli-study/reports/final/15-philosophy.md`

### OpenCode Internals Evidence

OpenCode has **two parallel event systems** with different strengths:

1. **EventV2** (`packages/core/src/event.ts:34-59`): Typed event registry with `EventV2.define({ type, version?, aggregate?, schema })`. Events carry `{ id, type, data, version, location?, metadata? }`. `EventV2.subscribe(definition)` returns typed `Stream<Payload>`; `EventV2.Service` is backed by Effect `PubSub` with per-type lazy PubSubs and a global `all()` stream. Sync handlers (`EventV2.sync(handler)`) run synchronously before PubSub publish — ideal for bridging to persistence.

2. **Bus system** (`bus/bus-event.ts`): Legacy `BusEvent.define(type, properties)` with `{ id, type, properties }` shape. In-process pub/sub via `Bus.Service` backed by Effect `PubSub`. Per-instance isolation via `InstanceState`. `GlobalBus` (`bus/global.ts`) bridges events across instances.

The full **session event catalog** (`packages/core/src/session-event.ts:402`) defines 27+ event types across lifecycles: `SessionLifecycle` (AgentSwitched, ModelSwitched, Prompted), `Step` (Started/Ended/Failed), `Text` (Started/Delta/Ended), `Reasoning` (Started/Delta/Ended), `Tool` (Input.Started/Delta/Ended, Called, Progress, Success, Failed), `Shell` (Started/Ended), `Retried`, `Compaction` (Started/Delta/Ended). All share `Base: { timestamp, sessionID }`. Tokens are structured as `{ input, output, reasoning, cache: { read, write } }`.

**Session.Info** (`session/session.ts`) provides the canonical metadata schema: `id`, `slug`, `projectID`, `directory`, `parentID` (for forks), `title`, `agent`, `model: { id, providerID, variant? }`, `version`, `tokens: { input, output, reasoning, cache }`, `cost`, `time: { created, updated, compacting?, archived? }`, `summary`, `permission`, `revert`, `share`.

**SSE streaming** (`handlers/event.ts`): `GET /event` subscribes to all bus events via SSE with `{ type, data }` framing, 10-second heartbeat, and `InstanceDisposed` termination.

**SyncEvent projection** (`sync/index.ts:167-183`): Uses SQLite immediate transactions for durable write-ahead. Events are persisted with sequence numbers, then projected into read model tables.

**SessionStatus** (`session/status.ts:12-27`): In-memory `Map<SessionID, Info>` with typed states (`idle | retry | busy`). Published as `session.status` bus events. The `run` CLI subscribes to status events to detect session completion.

**OTEL integration** (`core/src/effect/observability.ts:70-96`): Tracer setup with `service.name` attribute, `OTEL_DIAGNOSTICS` env flag, schema-validated span attributes.

### Output

- Run record model.
- Event sink interface.
- Optional persistence hook.
- executable status/inspect commands.
- Tests for metadata completeness, permission audit completeness, and event ordering.

### Quality Gate

- A product can build a progress dashboard from canonical events.
- A product can identify which provider/model produced an artifact.
- A product can explain why a tool action was allowed, denied, or sent for manual approval.
- Estimates are clearly marked as estimates.
- Persistence is optional and not entangled with runtime adapters.

## Sprint 10: Future Interface Review

### Goal

Reassess whether any user-facing convenience surface is warranted after the SDK is mature. This is a placeholder for future scope review, not a commitment to ship a user-facing executable surface.

### Scope

- Reassess whether a command surface, API surface, or no additional surface is warranted.
- If a surface is justified, keep it thin and testable.
- Make configuration behavior visible only if a surface exists.
- Reassess whether manual permission approval needs a richer public API or UI surface.
- Separate stdout user output from diagnostics only if a surface exists.

### Evidence Inputs

- `evidence/testing-strategy.md`
- `reports/permission-based-agent-wrapping.md`
- `studies/go-cli-study/reports/final/01-project-structure.md`
- `studies/go-cli-study/reports/final/02-command-architecture.md`
- `studies/go-cli-study/reports/final/04-configuration-management.md`
- `studies/go-cli-study/reports/final/09-terminal-ux.md`
- `studies/go-cli-study/reports/final/10-logging-observability.md`
- `studies/go-cli-study/reports/final/11-testing-strategy.md`

### OpenCode Internals Evidence

OpenCode's **external SDK client** (`packages/sdk/js/src/v2/client.ts`) shows the factory-pattern entrypoint: `createOpencodeClient({ baseUrl, directory?, headers?, fetch? })` returns a typed `OpencodeClient` with methods grouped by domain (`session.*`, `config.*`, `event.subscribe()`, `file.*`, `mcp.*`, `provider.*`, `permission.*`). Header-based directory/workspace routing (`x-opencode-directory`, `x-opencode-workspace`) keeps the URL path clean.

The **CLI command architecture** (`cli/cmd/*`) uses `effectCmd({ command, describe, builder, instance?, handler })` to bridge yargs with Effect handlers. The `run` command (`cli/cmd/run.ts:852`) supports three modes: non-interactive (single prompt, stream events to stdout), interactive local (in-process server + TUI), and interactive attach (remote server). The `--format json` flag produces per-line `JSON.stringify({ type, timestamp, sessionID, ...data })` — the reference pattern for structured CLI output.

**Plugin hooks** (`packages/plugin/src/index.ts`) define the extensibility surface: `Hooks` interface with `hook`, `config`, `tool`, `auth`, `provider`, `chat.message`, `chat.params`, `chat.headers`, `permission.ask`, `command.execute.before`, `tool.execute.before/after`, `shell.env`, `experimental.*`.

**Configuration loading** (`config/config.ts`) demonstrates a well-tested precedence chain: managed config → cloud/console → remote well-known → global → env var path → project-local → env inline override. The `mergeConfigConcatArrays` deep merge and JSONC support are production-proven patterns.

### Output

- Determination on whether any additional surface is needed.
- Determination on whether manual approval remains callback-only, becomes a first-class API, or is deferred.
- If a surface exists, tests with fake runtime.
- If a surface exists, golden output fixtures for help/status/error output where useful.

### Quality Gate

- Any additional surface does not contain runtime business logic.
- If a surface exists, output is scriptable and diagnostics are separable.
- Effective configuration and error states are explainable if a surface exists.
- Permission policy and manual approval behavior are explainable without exposing OpenCode internals.
- The SDK can be exercised without requiring OpenCode in unit tests.

## Sprint 11: Second Runtime Spike

### Goal

Prove the abstraction is real by adding a minimal second runtime or runtime simulator that differs meaningfully from OpenCode.

### Scope

- Implement only enough to test contract pressure.
- Identify where the SDK overfit to OpenCode.
- Exercise canonical event mapping, lifecycle, health, permission policy, and error behavior.
- Use Codex or Claude Code permission semantics as explicit pressure against the Sprint 7 permission model if choosing a real second runtime.
- Do not broaden product scope.

### Evidence Inputs

- `evidence/runtime-contract.md`
- `evidence/session-lifecycle.md`
- `evidence/resilience-policies.md`
- `reports/permission-based-agent-wrapping.md`
- `studies/opencode-wrap-study/reports/final/01-runtime-contract-and-api-shape.md`
- `studies/opencode-wrap-study/reports/final/02-process-session-lifecycle.md`
- `studies/opencode-wrap-study/reports/final/03-resilience-fallback-and-validation.md`
- `studies/opencode-wrap-study/reports/final/04-workflow-composition-and-observability.md`

### OpenCode Internals Evidence

OpenCode's **external SDK client** (`packages/sdk/js/src/v2/client.ts`) demonstrates the HTTP/REST contract for a second runtime: `createOpencodeClient({ baseUrl })` connects to `opencode serve` and provides typed `session.*`, `config.*`, `event.subscribe()` (SSE), and `permission.reply()` methods. The `OpencodeServer` helper (`packages/sdk/js/src/server.ts`) spawns the `opencode serve` binary and parses the URL from stdout — proving the subprocess-launch pattern works.

The **InstanceState** pattern (`effect/instance-state.ts`) shows per-directory scoped state using `ScopedCache` — each project directory gets isolated state, avoiding cross-project contamination. This is a model for how the SDK wrapper can manage multiple runtime instances.

The **Runner state machine** (`effect/runner.ts:217`) enforces session concurrency with `Idle | Running | Shell | ShellThenRun` transitions. `Busy` is a `Schema.TaggedErrorClass` — the SDK must surface this as a typed error (409 Conflict equivalent) so callers can handle concurrent-access failures.

The **`--format json` event output** (`cli/cmd/run.ts`) with per-line `{ type, timestamp, sessionID, ...data }` provides the reference wire format for a second runtime that does not implement EventV2. A second runtime that only supports this output format must still be mappable to canonical events without losing metadata.

### Output

- Minimal second runtime implementation or simulator.
- Abstraction pressure report.
- Decision updates for any contract changes.

### Quality Gate

- The second runtime works without product-level orchestration changes.
- Permission policy semantics survive a non-OpenCode runtime without rewriting product code.
- Any OpenCode-specific assumptions are documented or removed.
- Public API changes are justified in `DECISIONS.md`.

## Sprint 12: UltraPlan Integration Spike

### Goal

Validate that the SDK primitive supports UltraPlan-style workflows without absorbing UltraPlan-specific concepts.

### Scope

- Run one narrow UltraPlan-like operation through the SDK.
- Configure permissions through the SDK at run initialization.
- Use runtime events for progress.
- Use validators for expected outputs.
- Preserve metadata for later synthesis.
- Do not implement full study orchestration inside the SDK.

### Evidence Inputs

- PRD/TRD
- `evidence/observability-metadata.md`
- `evidence/validation-repair.md`
- `reports/permission-based-agent-wrapping.md`
- `studies/opencode-wrap-study/reports/final/04-workflow-composition-and-observability.md`

### OpenCode Internals Evidence

OpenCode's **session fork/continue** pattern (`session/session.ts`) is the natural entry point for UltraPlan-style multi-step workflows: `session.create()` → `session.prompt()` → validate → `session.fork()` for repair or continuation. The `parentID` field provides session tree navigation for audit.

The **`--format json` event stream** (`cli/cmd/run.ts`) shows what UltraPlan would consume via the SDK: structured events with `type` discrimination (tool_use, step_start, step_finish, text, reasoning, error) and `sessionID` for correlation. The `event.subscribe()` SSE stream (`handlers/event.ts`) provides the live event path for real-time progress in UltraPlan's TUI or dashboard.

The **EventV2 subscription pattern** (`packages/core/src/event.ts:84-153`) demonstrates how UltraPlan can consume typed events without parsing raw logs: call `EventV2.subscribe(Step.Ended)` to get a typed stream of step completion events with cost/tokens/metadata. The `SessionEvent.All` tagged union (`packages/core/src/session-event.ts`) provides the complete event catalog for UltraPlan's dashboard filters.

The **plugin hooks** (`packages/plugin/src/index.ts`) define the integration boundary: `Hooks.tool.definition` and `Hooks.tool.execute.before/after` are the seams where UltraPlan would inject product-specific tool validation or observability without modifying the SDK.

The **SyncEvent projection** (`sync/index.ts:167-183`) with immediate transactions provides the persistence pattern: events are written durably with sequence numbers, then projected into read model tables. UltraPlan can use this pattern to build its own event store without coupling to the SDK's storage layer.

### Output

- Integration spike.
- Boundary report: what belongs in SDK vs UltraPlan.
- Updated decisions and deferred work.

### Quality Gate

- UltraPlan can use the SDK without parsing runtime-native output.
- UltraPlan can select a permission policy without implementing OpenCode approval logic.
- Product-specific concepts remain outside the SDK.
- Missing SDK primitives are identified as requirements, not patched around in product code.

## Sprint Evaluation Template

Every sprint must end with:

```text
Sprint:
Requirements covered:
Evidence packs used:
Final reports opened:
Decisions made:
Tradeoffs accepted:
Patterns followed:
Anti-patterns avoided:
Tests added:
Known gaps:
Evaluation against study dimensions:
Proceed / iterate:
```

## Expected Implementation Arc

The roadmap intentionally moves from stable primitives to product integration:

1. Planning scaffold.
2. Structure and tests.
3. Runtime contract.
4. OpenCode structured events.
5. Lifecycle and retained sessions.
6. Health/config readiness.
7. Resilience policies.
8. Initialization-time permission policy.
9. Validation and repair.
10. Observability and metadata.
11. Future interface review.
12. Second runtime pressure test.
13. UltraPlan integration pressure test.

This ordering keeps the project from jumping straight to workflows before the runtime primitive is solid.
