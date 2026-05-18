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

## Study Evolve Planning Flow

The evidence packs are selectors, not the full planning context.

For sprint planning, run `study evolve` on the sprint's evidence packs and write the result to `targets/agentwrap/reports/sprint-evidence/`. The command expands each pack into a large planning bundle:

- the evidence pack content
- every linked final report from `## Source Reports`
- top per-source reports by score, with `--top-sources 1` as the default planning depth
- resolved code references from the reports unless `--no-code` is used
- bundle statistics and code-reference resolution counts

Use `--top-sources 1` for real sprint planning with code included. Use `--top-sources 2` only when the sprint needs a heavier evidence dump. Use the default top 5 only for quick orientation.

Sprint evidence bundle commands:

| Sprint | Command |
| --- | --- |
| 0 Target Brief and Decision Scaffold | `study evolve --top-sources 1 --output targets/agentwrap/reports/sprint-evidence/00-target-brief.txt @targets/agentwrap/reports/evidence/runtime-contract.md @targets/agentwrap/reports/evidence/testing-strategy.md` |
| 1 Project Skeleton and Test Harness | `study evolve --top-sources 1 --output targets/agentwrap/reports/sprint-evidence/01-project-skeleton.txt @targets/agentwrap/reports/evidence/testing-strategy.md` |
| 2 Core Runtime Contract | `study evolve --top-sources 1 --output targets/agentwrap/reports/sprint-evidence/02-core-runtime-contract.txt @targets/agentwrap/reports/evidence/runtime-contract.md @targets/agentwrap/reports/evidence/session-lifecycle.md @targets/agentwrap/reports/evidence/testing-strategy.md` |
| 3 OpenCode Structured Event Adapter | `study evolve --top-sources 1 --output targets/agentwrap/reports/sprint-evidence/03-opencode-adapter.txt @targets/agentwrap/reports/evidence/runtime-contract.md @targets/agentwrap/reports/evidence/session-lifecycle.md @targets/agentwrap/reports/evidence/testing-strategy.md` |
| 4 Lifecycle, Cancellation, Cleanup, and Retained Sessions | `study evolve --top-sources 1 --output targets/agentwrap/reports/sprint-evidence/04-lifecycle-sessions.txt @targets/agentwrap/reports/evidence/session-lifecycle.md @targets/agentwrap/reports/evidence/observability-metadata.md @targets/agentwrap/reports/evidence/testing-strategy.md` |
| 5 Health Checks and Configuration Validation | `study evolve --top-sources 1 --output targets/agentwrap/reports/sprint-evidence/05-health-config.txt @targets/agentwrap/reports/evidence/resilience-policies.md @targets/agentwrap/reports/evidence/testing-strategy.md` |
| 6 Retry, Backoff, Fallback, and Rate Limits | `study evolve --top-sources 1 --output targets/agentwrap/reports/sprint-evidence/06-resilience-policies.txt @targets/agentwrap/reports/evidence/resilience-policies.md @targets/agentwrap/reports/evidence/session-lifecycle.md @targets/agentwrap/reports/evidence/observability-metadata.md @targets/agentwrap/reports/evidence/testing-strategy.md` |
| 7 Output Validation and Repair | `study evolve --top-sources 1 --output targets/agentwrap/reports/sprint-evidence/07-validation-repair.txt @targets/agentwrap/reports/evidence/validation-repair.md @targets/agentwrap/reports/evidence/session-lifecycle.md @targets/agentwrap/reports/evidence/testing-strategy.md` |
| 8 Observability, Metadata, and Persistence Hooks | `study evolve --top-sources 1 --output targets/agentwrap/reports/sprint-evidence/08-observability-metadata.txt @targets/agentwrap/reports/evidence/observability-metadata.md @targets/agentwrap/reports/evidence/testing-strategy.md` |
| 9 Executable Surface Review | `study evolve --top-sources 1 --output targets/agentwrap/reports/sprint-evidence/09-executable-surface.txt @targets/agentwrap/reports/evidence/runtime-contract.md @targets/agentwrap/reports/evidence/resilience-policies.md @targets/agentwrap/reports/evidence/testing-strategy.md` |
| 10 Second Runtime Spike | `study evolve --top-sources 1 --output targets/agentwrap/reports/sprint-evidence/10-second-runtime-spike.txt @targets/agentwrap/reports/evidence/runtime-contract.md @targets/agentwrap/reports/evidence/session-lifecycle.md @targets/agentwrap/reports/evidence/resilience-policies.md @targets/agentwrap/reports/evidence/observability-metadata.md` |
| 11 UltraPlan Integration Spike | `study evolve --top-sources 1 --output targets/agentwrap/reports/sprint-evidence/11-ultraplan-integration.txt @targets/agentwrap/reports/evidence/observability-metadata.md @targets/agentwrap/reports/evidence/validation-repair.md @targets/agentwrap/reports/evidence/session-lifecycle.md` |

The sprint planner should load the PRD, TRD, feature architecture protocol, roadmap sprint section, and that generated bundle.

If the generated bundle does not fit into context:

1. Load the PRD, TRD, feature architecture protocol, and roadmap sprint section first.
2. Load the evidence pack sections from the bundle.
3. Load only the `Final Report:` sections that match the sprint decisions being made.
4. Load `Per-Source Reports:` one source at a time, starting with the highest-scored source.
5. Load resolved code references only for decisions that need concrete implementation evidence.
6. Record what was omitted from context and why in the sprint plan.

The sprint planner may explore more source reports or repository code directly when the generated bundle does not provide enough evidence for a decision. That exploration should be narrow, cited in the sprint plan, and tied to a specific requirement, tradeoff, risk, or open question.

## Non-Negotiable Development Rules

- Every sprint starts from the PRD/TRD requirement sections it satisfies.
- Every sprint generates the matching `study evolve --top-sources 1` bundle before planning implementation.
- Every sprint plan cites the generated bundle path and the evidence packs used to produce it.
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
- Keep validation/repair minimal until Sprint 7.

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

## Sprint 7: Output Validation and Repair

### Goal

Make successful runtime execution subordinate to caller-defined product success criteria.

### Scope

- Define expected output/artifact requirements.
- Add validators for file presence, directory presence, structured data, and caller-defined checks.
- Add validation result events.
- Add repair attempt flow after validation failure.
- Support same-session repair where available.
- Encourage artifact-first large output flows.

### Evidence Inputs

- `evidence/validation-repair.md`
- `evidence/session-lifecycle.md`
- `studies/opencode-wrap-study/reports/final/03-resilience-fallback-and-validation.md`
- `studies/go-cli-study/reports/final/06-io-abstraction.md`
- `studies/go-cli-study/reports/final/05-error-handling.md`
- `studies/go-cli-study/reports/final/11-testing-strategy.md`

### Output

- Validator API.
- Validation result model.
- Repair attempt lifecycle.
- Tests for missing output, malformed output, empty output, repair success, repair exhaustion, and unsupported same-session repair.

### Quality Gate

- Runtime exit success alone cannot mark a run successful when validators are configured.
- Validation failures include actionable repair context.
- Repair attempts are bounded and visible.
- Large output expectations can be redirected to artifacts rather than process output.

## Sprint 8: Observability, Metadata, and Persistence Hooks

### Goal

Expose enough structured state for dashboards, historical inspection, synthesis, and cost/time analysis without locking the SDK to a storage backend.

### Scope

- Define run record metadata.
- Define event sink hooks.
- Define optional persistence interface.
- Capture runtime, provider, model, attempts, timing, status, warnings, errors, artifacts, usage, estimated cost, and session retention metadata.
- Add active-run and completed-run inspection.
- Add executable status/inspect commands.

### Evidence Inputs

- `evidence/observability-metadata.md`
- `evidence/cli-design.md`
- `studies/opencode-wrap-study/reports/final/04-workflow-composition-and-observability.md`
- `studies/go-cli-study/reports/final/10-logging-observability.md`
- `studies/go-cli-study/reports/final/14-performance.md`
- `studies/go-cli-study/reports/final/15-philosophy.md`

### Output

- Run record model.
- Event sink interface.
- Optional persistence hook.
- executable status/inspect commands.
- Tests for metadata completeness and event ordering.

### Quality Gate

- A product can build a progress dashboard from canonical events.
- A product can identify which provider/model produced an artifact.
- Estimates are clearly marked as estimates.
- Persistence is optional and not entangled with runtime adapters.

## Sprint 9: Future Interface Review

### Goal

Reassess whether any user-facing convenience surface is warranted after the SDK is mature. This is a placeholder for future scope review, not a commitment to ship a user-facing executable surface.

### Scope

- Reassess whether a command surface, API surface, or no additional surface is warranted.
- If a surface is justified, keep it thin and testable.
- Make configuration behavior visible only if a surface exists.
- Separate stdout user output from diagnostics only if a surface exists.

### Evidence Inputs

- `evidence/testing-strategy.md`
- `studies/go-cli-study/reports/final/01-project-structure.md`
- `studies/go-cli-study/reports/final/02-command-architecture.md`
- `studies/go-cli-study/reports/final/04-configuration-management.md`
- `studies/go-cli-study/reports/final/09-terminal-ux.md`
- `studies/go-cli-study/reports/final/10-logging-observability.md`
- `studies/go-cli-study/reports/final/11-testing-strategy.md`

### Output

- Determination on whether any additional surface is needed.
- If a surface exists, tests with fake runtime.
- If a surface exists, golden output fixtures for help/status/error output where useful.

### Quality Gate

- Any additional surface does not contain runtime business logic.
- If a surface exists, output is scriptable and diagnostics are separable.
- Effective configuration and error states are explainable if a surface exists.
- The SDK can be exercised without requiring OpenCode in unit tests.

## Sprint 10: Second Runtime Spike

### Goal

Prove the abstraction is real by adding a minimal second runtime or runtime simulator that differs meaningfully from OpenCode.

### Scope

- Implement only enough to test contract pressure.
- Identify where the SDK overfit to OpenCode.
- Exercise canonical event mapping, lifecycle, health, and error behavior.
- Do not broaden product scope.

### Evidence Inputs

- `evidence/runtime-contract.md`
- `evidence/session-lifecycle.md`
- `evidence/resilience-policies.md`
- `studies/opencode-wrap-study/reports/final/01-runtime-contract-and-api-shape.md`
- `studies/opencode-wrap-study/reports/final/02-process-session-lifecycle.md`
- `studies/opencode-wrap-study/reports/final/03-resilience-fallback-and-validation.md`
- `studies/opencode-wrap-study/reports/final/04-workflow-composition-and-observability.md`

### Output

- Minimal second runtime implementation or simulator.
- Abstraction pressure report.
- Decision updates for any contract changes.

### Quality Gate

- The second runtime works without product-level orchestration changes.
- Any OpenCode-specific assumptions are documented or removed.
- Public API changes are justified in `DECISIONS.md`.

## Sprint 11: UltraPlan Integration Spike

### Goal

Validate that the SDK primitive supports UltraPlan-style workflows without absorbing UltraPlan-specific concepts.

### Scope

- Run one narrow UltraPlan-like operation through the SDK.
- Use runtime events for progress.
- Use validators for expected outputs.
- Preserve metadata for later synthesis.
- Do not implement full study orchestration inside the SDK.

### Evidence Inputs

- PRD/TRD
- `evidence/observability-metadata.md`
- `evidence/validation-repair.md`
- `studies/opencode-wrap-study/reports/final/04-workflow-composition-and-observability.md`

### Output

- Integration spike.
- Boundary report: what belongs in SDK vs UltraPlan.
- Updated decisions and deferred work.

### Quality Gate

- UltraPlan can use the SDK without parsing runtime-native output.
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
8. Validation and repair.
9. Observability and metadata.
10. Future interface review.
11. Second runtime pressure test.
12. UltraPlan integration pressure test.

This ordering keeps the project from jumping straight to workflows before the runtime primitive is solid.
