# TRD: Runtime Wrapper SDK Requirements

## Document Scope

This document defines technical requirements for a reusable runtime wrapper SDK. It intentionally avoids selecting implementation technologies, libraries, protocols, storage engines, or configuration file formats. Those decisions should be derived from the `opencode-wrap-study` results and later design work.

## System Boundary

The SDK is responsible for normalizing runtime execution and supervision. It is not responsible for product-specific UltraPlan concepts such as study scoring, PRD/TRD generation, report templates, sprint roadmaps, feature planning, or source discovery.

The SDK must provide primitives that products can use to build those workflows.

## Core Requirements

### Runtime Interface

- The SDK must define a runtime-neutral interface for starting, monitoring, cancelling, and inspecting runtime work.
- The interface must support a first runtime implementation for OpenCode.
- The interface must be extensible to additional runtimes without forcing callers to rewrite product workflows.
- Runtime-specific capabilities must be discoverable.
- Runtime-specific native data must be available for diagnostics without being required for normal product behavior.

### Run and Session Lifecycle

- The SDK must model lifecycle states explicitly.
- Required lifecycle states include at least: initialized, health-checking, ready, starting, running, waiting, retrying, fallback, validating, repairing, completed, failed, cancelled, and cleaned up.
- A run must have a stable identifier.
- A session, where supported by the runtime, must have a stable identifier.
- The SDK must support one-shot runs and session-based follow-up work where the runtime supports it.
- The SDK must support retaining a runtime session across related workflow steps where the runtime supports session continuity.
- The SDK must allow callers to explicitly continue, reuse, fork, release, or replace a retained session where those actions are supported.
- Retained sessions must preserve enough context for retry, repair, validation follow-up, planning, synthesis, or review workflows.
- The SDK must expose when a requested retained-session operation is unsupported by the runtime.
- The SDK must support cancellation from the caller.
- Cancellation must attempt to stop all owned runtime work and release owned resources.
- Process/session cleanup must happen on success, failure, timeout, cancellation, and caller shutdown.
- The SDK must surface cleanup failures separately from primary run failures.

### Structured Runtime Events

- The SDK must consume structured runtime output when the runtime provides it.
- For OpenCode, the SDK must use structured JSON output rather than free-form terminal text.
- The SDK must decode native runtime events into canonical events.
- Canonical events must preserve enough information for progress display, debugging, persistence, and synthesis.
- Native event payloads must be preservable as raw structured payloads.
- Malformed structured events must be reported as explicit decode errors.
- Decode errors must include enough context to identify the affected runtime, run, event position, and raw payload where safe.

### Canonical Event Model

The canonical event model must represent:

- Run lifecycle changes.
- Session lifecycle changes.
- Assistant/user messages or deltas.
- Tool calls and tool results.
- File/artifact creation or update references.
- Permission or interaction requests.
- Rate-limit signals.
- Warnings and recoverable errors.
- Fatal errors.
- Usage and cost-related updates.
- Final result/completion.
- Validation results.
- Retry and fallback transitions.

The event model must allow future event types without breaking existing callers.

### Health Checks and Preflight

- The SDK must support pre-run health checks.
- Health checks must be runnable independently from a full run.
- Health checks must identify runtime availability.
- Health checks must identify authentication or provider setup issues where detectable.
- Health checks must identify model/provider availability where detectable.
- Health checks must classify failures as unrecoverable, transient, degraded, or unknown.
- A caller must be able to require specific health checks before starting work.
- A run must fail fast when required health checks fail with unrecoverable status.

### Configuration Requirements

- The SDK must accept runtime, provider, model, permission, sandbox, retry, fallback, timeout, validation, and metadata configuration.
- The SDK must define configuration precedence semantics, but this document does not choose the file or serialization format.
- Runtime defaults must be distinguishable from caller-provided values.
- The effective configuration for each run must be inspectable.
- Invalid configuration must be rejected before runtime execution begins when validation is possible.
- Sensitive configuration values must not be included in normal logs or user-facing errors.

### Retry, Fallback, and Backoff

- The SDK must support retry policies.
- The SDK must support fallback policies across providers, models, runtimes, or caller-defined alternatives.
- The SDK must support backoff policies.
- Policies must be composable rather than hard-coded to one fixed sequence.
- A policy must be able to inspect the current error, attempt count, runtime, provider, model, validation result, and rate-limit metadata.
- A policy must be able to stop execution with an explicit failure.
- A policy must be able to emit events describing retry and fallback decisions.
- Retry and fallback attempts must preserve a relationship to the original run.
- Attempt metadata must be recorded.
- Retry and repair policies must be able to request reuse of the original runtime session when context retention is useful and supported.
- Fallback policies must record whether fallback preserved session context, started a fresh session, or moved to a runtime where prior context could not be retained.

### Rate Limit Handling

- The SDK must detect runtime/provider rate-limit signals where available.
- Rate-limit events must include provider, model, retry-after or reset information where available.
- Rate limits must be classified separately from generic failures.
- Rate limits must be available to retry/fallback policy evaluation.
- The SDK must support caller hooks for `OnRateLimit` behavior.

### Output and Artifact Validation

- The SDK must allow callers to define expected outputs.
- Expected outputs may include files, directories, structured data, report sections, metadata fields, or caller-defined validators.
- Validation must run after runtime completion and may run during execution where applicable.
- Validation failures must be explicit.
- Validation failures must include expected output, observed output, and repair context where safe.
- Validation must not mark a run successful solely because the runtime exited successfully.
- The SDK must support validation-informed retry or repair attempts.

### Repair and Reprompt

- The SDK must support caller-configured repair attempts after validation failure, missing output, empty output, malformed structured result, or incomplete artifact.
- Repair attempts must preserve context from the original run.
- If the runtime supports continuing the same session, repair should be able to use that session.
- If the runtime cannot continue the same session, repair must still preserve enough context for a new attempt.
- Repair attempts must make session retention behavior explicit: same session, forked session, new session with summarized context, or unsupported.
- Repair attempts must be bounded by caller policy.
- Repair attempts must be visible in run metadata and events.

### Permissions and Interaction

- The SDK must surface runtime permission prompts or interactive requests when available.
- The SDK must support caller-defined permission handling policy.
- The SDK must support non-interactive operation where callers require it.
- A runtime waiting for interaction must emit a blocked or waiting event.
- A blocked run must be cancellable.
- Permission decisions must be recorded in run metadata when safe.

### Sandboxing and Working Directory

- The SDK must allow callers to define runtime working directory constraints.
- The SDK must allow callers to define sandbox or permission mode requirements.
- The SDK must surface when requested sandbox or permission behavior cannot be enforced.
- The SDK must distinguish runtime permission failures from SDK validation failures.

### Output Truncation and Large Output Safety

- The SDK must account for runtime output truncation behavior.
- The SDK must not assume that terminal or process output contains complete information.
- The SDK must support artifact-first workflows for large outputs.
- The SDK must allow callers to direct agents toward durable output files when complete data matters.
- The SDK must preserve references to large artifacts rather than requiring large content in events.
- The SDK must surface truncation indicators where detectable.

### Observability

- The SDK must expose active run status.
- The SDK must expose historical run status where persistence is enabled by the caller.
- The SDK must emit structured events suitable for dashboards.
- The SDK must record runtime, provider, model, attempts, timing, warnings, errors, validation results, artifacts, and final status.
- The SDK must support caller-provided event sinks.
- The SDK must support logs or diagnostics suitable for debugging failed runs.
- Diagnostic output must separate user-facing messages from debug details.

### Metadata Requirements

Each run record must include:

- Run identifier.
- Parent run identifier, if this is a retry, fallback, or repair attempt.
- Runtime name and runtime version where available.
- Provider and model where available.
- Effective configuration summary.
- Start time, end time, duration, and current status.
- Attempt count and policy decisions.
- Token usage where available.
- Estimated cost where available.
- Throughput or TPS where available.
- Output artifacts.
- Validation results.
- Error classification and error detail.

Each generated report or artifact should be able to reference:

- Producing runtime.
- Producing provider/model.
- Time taken.
- Tokens used where available.
- Estimated cost where available.
- Source run identifier.

### Cost and Time Estimation

- The SDK must support best-effort run estimation before execution.
- Estimation inputs may include source size, prompt size, configured runtime, configured provider/model, historical timing, historical usage, and caller hints.
- Estimates must distinguish unknown values from zero values.
- Actual usage metadata must be recorded after execution where available.
- The SDK must allow products to improve estimates from historical observations.

### Persistence Requirements

- The SDK must allow callers to persist run state.
- Persistence must be optional at the SDK level.
- The persistence model must support active run inspection.
- The persistence model must support historical run inspection.
- The persistence model must support retry/fallback/repair relationships.
- The persistence model must support retained session relationships across different workflows.
- Persisted state must identify when a run continued a prior session, forked from a prior session, or started without prior session context.
- The persistence model must support artifact references.
- The persistence model must support replay or reconstruction of significant lifecycle events.
- This document does not prescribe the persistence technology.

### Error Model

- Errors must be explicit and classifiable.
- Error categories must include at least: configuration, health, runtime unavailable, provider unavailable, model unavailable, authentication, permission, rate limit, timeout, cancellation, malformed event, runtime exit, validation, repair exhausted, cleanup, and unknown.
- Errors must expose whether they are retryable, fallbackable, user-actionable, or unrecoverable.
- Errors must preserve safe diagnostic detail.
- Errors must avoid leaking secrets.

### Concurrency

- The SDK must support multiple concurrent runs.
- Run state must be isolated per run.
- Retained session state must be isolated from unrelated workflows unless the caller explicitly links them.
- Cancellation of one run must not cancel unrelated runs.
- Shared runtime/provider limits must be representable.
- The SDK must support caller-defined concurrency limits.
- The SDK must avoid leaking concurrent workers, sessions, processes, handles, or event streams.

### Extensibility

- New runtimes must be addable behind the same product-facing abstraction.
- Runtime capability differences must be discoverable.
- New canonical event types must be addable without breaking existing callers.
- New policy types must be addable without changing core runtime adapters.
- New validators must be caller-definable.
- Runtime-specific extensions must not pollute the common path.

### Security and Secrets

- Secrets must not be logged by default.
- Error messages must avoid exposing secret values.
- Runtime environment configuration must distinguish sensitive and non-sensitive values.
- The SDK must support callers that require non-interactive, least-privilege runtime execution.
- The SDK must surface trust-boundary-relevant events such as permission prompts, sandbox bypasses, and external provider calls where available.

## Open Technical Questions

- What is the correct minimal abstraction boundary: runtime, provider, session, run, turn, task, or workflow?
- Should workflow composition exist in the SDK, or should it remain entirely in products like UltraPlan?
- How should canonical event compatibility be versioned?
- How should native runtime event schemas be preserved and upgraded?
- What should be mandatory metadata versus best-effort metadata?
- What should be the default policy when structured event decoding fails mid-run?
- How should artifact references be normalized across local files, generated reports, remote outputs, and future source types?
- How should same-session repair work for runtimes that expose session continuation differently?
- What retention policy should govern session lifetime across retries, repairs, planning, synthesis, and implementation review?
- How should callers decide between retaining full runtime context and starting a fresh session with summarized context?

## Acceptance Criteria

- A product can start an OpenCode run and consume canonical structured events.
- A product can cancel an active run and observe cleanup completion or cleanup failure.
- A product can define required outputs and receive explicit validation success or failure.
- A product can configure retry/fallback/backoff behavior without hard-coded runtime-specific branching.
- A product can distinguish rate limits from other failures.
- A product can inspect active and completed run metadata.
- A product can see which provider/model produced a report or artifact.
- A product can preserve artifact references for later synthesis or planning.
- A product can retain a runtime session across a retry or repair workflow when the runtime supports it, and can see explicit metadata when retention was not possible.
- A second runtime can be introduced without changing product-level run orchestration requirements.
