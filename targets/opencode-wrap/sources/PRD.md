# PRD: Runtime Wrapper SDK

## Product Summary

Build a reusable SDK for running and supervising agentic coding runtimes from product workflows. The first supported runtime is OpenCode, with the product direction explicitly allowing other runtimes later, such as Codex, Claude Code, Pi, ACP-compatible agents, and direct model/provider workers.

The SDK is a foundational primitive. It should be usable by UltraPlan, 24-hour-testers, and future tools without those tools needing to understand each runtime's native process model, event format, permission behavior, provider configuration, or failure modes.

## Problem

Agentic coding tools are useful but difficult to embed reliably into larger workflows. Each runtime has different invocation mechanics, event formats, permissions, output limits, provider/model setup, truncation behavior, rate limits, and failure modes. Product workflows need consistent control over these runtimes:

- Start runs only when the configured runtime and providers are healthy.
- Observe progress across many concurrent agent instances.
- Capture structured events, outputs, usage, costs, and artifacts.
- Handle rate limits, transient failures, missing outputs, malformed outputs, and blocked runs.
- Validate required files or report structures before marking work complete.
- Recover gracefully through retry, fallback, reprompt, or explicit failure.

Without a shared runtime SDK, every product rebuilds this behavior ad hoc and inconsistently.

## Target Users

- Developers building agent-powered workflow tools.
- UltraPlan users running comparative studies, synthesis, sprint planning, and implementation reviews.
- Reliability or QA workflows that need long-running autonomous agent execution.
- Future product surfaces that need to orchestrate multiple agent runtimes behind a consistent interface.

## Product Goals

1. Provide one consistent way for product code to start, monitor, cancel, and inspect agent runtime work.
2. Make runtime failures explicit, typed, and recoverable where possible.
3. Support graceful degradation through configurable retry, fallback, and validation flows.
4. Preserve enough metadata for progress dashboards, cost estimation, auditing, and synthesis.
5. Keep the SDK product-agnostic so it can power UltraPlan and other tools.
6. Use OpenCode first while keeping the product model open to additional runtimes.

## Non-Goals

- Do not build the whole UltraPlan product in this SDK.
- Do not define study dimensions, scoring systems, report templates, or sprint-planning workflows inside the runtime SDK.
- Do not make technology choices in this document.
- Do not require callers to use a specific configuration file format.
- Do not hide unrecoverable failures behind endless retries.
- Do not depend on parsing free-form terminal text when a structured runtime output exists.

## Primary Use Cases

### Run a Runtime Task

A caller provides a prompt, runtime selection, model/provider preferences, working directory, permissions policy, and expected outputs. The SDK starts the runtime, streams structured progress, and returns a final result or explicit failure.

### Monitor Many Active Runs

A product can show all active runtime instances, current phase/status, elapsed time, latest event, selected model/provider, attempts, warnings, and expected completion or failure state.

### Validate Required Outputs

A caller can require files, directories, report sections, JSON schemas, or other artifacts to exist before a run is considered successful. Failed validation should be reported explicitly and may trigger a configured repair attempt.

### Retain Runtime Context Across Workflows

A caller can retain a runtime session across related workflow steps when the runtime supports it. This allows retry, repair, validation follow-up, synthesis, or implementation review steps to continue with the original runtime context instead of starting cold.

### Gracefully Handle Rate Limits and Transient Failures

When a provider or runtime hits a rate limit, network issue, timeout, malformed response, or transient execution failure, the SDK exposes enough information for the caller's configured policy to retry, wait, switch model/provider/runtime, or fail.

### Estimate and Record Run Cost

The SDK captures runtime, provider, model, duration, token usage, estimated cost, and observed throughput where available. Products can estimate future run cost and display actual run metadata after completion.

### Preserve Evidence for Later Synthesis

The SDK makes it easy for callers to persist references to output artifacts, event logs, source lines, reports, and metadata so later planning or synthesis work can load the right context automatically.

## MVP Scope

The MVP should support:

- OpenCode runtime execution through structured output.
- Runtime health checks before starting a run.
- Provider/model configuration validation where the runtime exposes enough information.
- Structured event projection into a canonical caller-facing stream.
- Explicit lifecycle states for queued, starting, running, waiting, retrying, failed, cancelled, and completed work.
- Cancellation and process/session cleanup.
- Configurable retry, fallback, and backoff policy hooks.
- Rate-limit detection and caller-visible rate-limit events.
- Output/artifact validation and informed repair attempts.
- Run metadata capture: runtime, provider, model, started time, completed time, duration, attempts, tokens, estimated cost, and final status.
- Durable run records sufficient for dashboards and historical inspection.

## Post-MVP Direction

- Additional runtimes behind the same interface.
- Direct provider/model workers for one-off article, guide, or document studies.
- Runtime fallback chains across different runtime types.
- More advanced cost/time estimation based on source size, prompt shape, runtime history, and model/provider behavior.
- Richer repair flows that reconnect to the same session where the runtime supports it.
- Cross-workflow session retention for related retry, repair, planning, and review flows.
- Support for sources beyond repositories, including guides, articles, documentation, and transcripts.
- Backward analysis: re-checking plans and implementations against the studies and evidence used to create them.

## Product Requirements

### Runtime Abstraction

- The SDK must present a runtime-neutral product interface.
- Product callers must not need to know the native command, event schema, process details, or provider mechanics for each runtime.
- Runtime-specific details may be exposed as structured metadata or escape hatches when needed, but they must not be required for common product flows.
- The SDK must allow products to retain and reuse runtime sessions across related workflow steps where the runtime supports session continuity.

### Structured Events

- The SDK must expose canonical events for lifecycle, progress, messages, tool activity, artifacts, usage, warnings, errors, rate limits, permissions, and final result.
- Native runtime event payloads should be preservable for debugging and future compatibility.
- Products must be able to build dashboards from canonical events without parsing logs.

### Health and Readiness

- The SDK must allow callers to check whether a runtime is installed, reachable, authenticated, and compatible enough to start work.
- Health checks must distinguish unrecoverable setup failures from transient runtime/provider failures.
- A run must fail fast when required runtime/provider configuration is absent or invalid.

### Graceful Degradation

- The SDK must support caller-configurable retry, fallback, and backoff policies.
- Policies must be composable so callers can express flows such as retry, fallback, retry, validate, repair, and retry again.
- Failures must remain explicit even when graceful fallback succeeds.
- Policies should be able to choose whether to continue in the same retained session, start a fresh session, or fallback to a different runtime/session when supported.

### Output Validation

- The SDK must let callers define success criteria beyond runtime exit status.
- Missing files, malformed artifacts, empty outputs, incomplete reports, and invalid structures must be detectable.
- Validation failures must include enough context to support a repair prompt or a clear user-facing error.

### Permissions and Blocking States

- The SDK must surface permission requests, interactive prompts, and blocked states when a runtime exposes them.
- Callers must be able to configure how permission or interaction events are handled.
- The SDK must avoid hanging silently when the runtime is waiting for input.

### Observability and Metadata

- Every run must expose status, timing, runtime, provider, model, attempts, warnings, errors, output artifacts, and usage metadata where available.
- Metadata must include enough information to identify which model/provider produced each report or artifact.
- The SDK must support active-run inspection and historical-run inspection.
- Metadata must show when a run reused, continued, forked, or replaced a prior runtime session.

### Cost and Time Estimation

- The SDK must record observed duration, usage, and cost-related metadata.
- The SDK should support estimates before a run starts, with accuracy improving from observed historical runs.
- Estimates must be marked as estimates and must not be treated as authoritative billing data.

### Output Safety

- The SDK must account for runtime output truncation and lossy output behavior.
- Where large output may be needed later, products must be able to direct agents toward durable artifact files instead of relying on terminal output.
- The SDK should preserve structured runtime events and artifact references in a way that downstream tools can reload safely.

## Success Metrics

- A caller can run OpenCode through the SDK and receive canonical structured events.
- A caller can show active runs and their progress without runtime-specific code.
- A missing provider/model setup fails before expensive work begins.
- Rate-limit and transient failures can be handled by policy rather than custom branching.
- Required output validation catches missing or malformed deliverables.
- Run records include model/provider, timing, attempt, usage, and artifact metadata.
- A second runtime can be added without changing the core product-facing workflow model.

## Open Product Questions

- What should be the smallest caller-facing primitive: runtime, session, run, turn, task, or workflow?
- How much workflow composition belongs in the SDK versus UltraPlan?
- How should callers describe output expectations in a runtime-neutral way?
- How should cost estimates be presented when token/cost data is incomplete?
- What metadata should be mandatory versus best-effort?
- How should repair attempts balance automated recovery with explicit user visibility?
- Which workflow transitions should default to retaining runtime session context, and when is a fresh session safer?
