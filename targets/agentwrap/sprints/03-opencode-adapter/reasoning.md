# Sprint Reasoning: OpenCode Structured Event Adapter

> Target: agentwrap
> Sprint ID: 03-opencode-adapter
> Output: `targets/agentwrap/sprints/03-opencode-adapter/reasoning.md`
> Sprint Tracker: `targets/agentwrap/sprints/03-opencode-adapter/plan.md`
> Evidence Bundle: `targets/agentwrap/reports/sprint-evidence/03-opencode-adapter.txt`

## Overview

**Sprint:** OpenCode Structured Event Adapter
**Purpose:** Add the first real runtime adapter by launching OpenCode in structured-output mode, decoding native structured events, projecting them into the Sprint 2 canonical event contract, preserving native payloads for diagnostics, and making malformed output and runtime exits explicit failures.
**Roadmap Section:** `targets/agentwrap/roadmap.md` - `## Sprint 3: OpenCode Structured Event Adapter`
**Depends On:** Sprint 1 project skeleton and private fixture harness; Sprint 2 public runtime contract, canonical events, lifecycle states, capabilities, and classified errors.
**Reasoning Status:** Ready For Tracker

## Target Sources

- `targets/agentwrap/sources/PRD.md` - runtime abstraction, OpenCode-first MVP, structured events, raw native payload preservation, explicit failure handling, metadata, output safety, and product-agnostic boundary.
- `targets/agentwrap/sources/TRD.md` - runtime interface, OpenCode implementation requirement, structured runtime events, canonical event model, lifecycle/error requirements, cancellation constraints, observability metadata, and acceptance criteria.
- `targets/agentwrap/sources/feature-architecture.md` - state-first modular flow used to assign adapter-owned ephemeral process/decode state separately from pure projection logic and public SDK contracts.
- `targets/agentwrap/roadmap.md` - Sprint 3 goal, scope, output, evidence inputs, non-scope, and quality gate.

## Evidence Basis

**Evidence Bundle:** `targets/agentwrap/reports/sprint-evidence/03-opencode-adapter.txt`
**Evidence Status:** Complete and used with staged loading.
**Context Strategy:** Staged loading used. The bundle is 35,736 lines and 1,506,464 characters, so planning loaded required PRD/TRD/feature protocol/roadmap/template sources, all sprint evidence pack sections, relevant final report sections, selected code references, and the current Sprint 2 implementation surface in `/home/antonioborgerees/coding/agentwrap`. Per-source reports were not loaded in full because the final reports and direct implementation context were sufficient for Sprint 3 decisions.

### Evidence Packs Used

- `targets/agentwrap/reports/evidence/runtime-contract.md` - informs runtime-neutral adapter boundary, native payload retention, capability discovery, and avoiding OpenCode mechanics in the common path.
- `targets/agentwrap/reports/evidence/session-lifecycle.md` - informs explicit lifecycle events, malformed structured event failure, runtime exit reporting, and separating process supervision from later retained-session lifecycle work.
- `targets/agentwrap/reports/evidence/testing-strategy.md` - informs structured fixtures for normal, unknown, malformed, partial, and final event streams plus an explicitly gated real-runtime smoke path.

### Final Reports Used

- `studies/opencode-wrap-study/reports/final/01-runtime-contract-and-api-shape.md` - supports a small runtime abstraction, streaming canonical events, raw native payload escape hatch, session as a first-class concept, and adapter isolation from OpenCode internals.
- `studies/opencode-wrap-study/reports/final/02-process-session-lifecycle.md` - supports explicit state machines, process runner separation, JSON protocol decoding separate from domain logic, cancellation reaching child work, and no claim of true mid-run resume.
- `studies/go-cli-study/reports/final/06-io-abstraction.md` - supports injected readers/writers and testable stream boundaries for process stdout/stderr and fixture-driven decoder tests.
- `studies/go-cli-study/reports/final/11-testing-strategy.md` - supports table-driven tests, structured fixtures, fake/fixture tests before external integration, and build-tag or environment-gated integration tests.
- `studies/go-cli-study/reports/final/05-error-handling.md` - used from prior Sprint 2 reasoning and current code context to keep malformed event and runtime exit failures classified rather than string-only.
- `studies/go-cli-study/reports/final/10-logging-observability.md` - roadmap-listed for Sprint 3; used indirectly through the PRD/TRD and evidence guidance to capture stderr diagnostics separately from canonical caller events.

### Per-Source Reports Used

- None in full. The sprint decisions are constrained by the evidence packs, primary final reports, selected code references, and current SDK code. If implementation discovers an OpenCode-specific mapping ambiguity, the implementer should inspect the OpenCode source reports narrowly and cite the new evidence in execution notes.

### Code References Used

- `t3code / packages/contracts/src/providerInstance.ts:18-28` - open runtime identifiers should parse and unknown drivers should be represented as unavailable, not crash the contract path.
- `t3code / packages/contracts/src/providerRuntime.ts:247-261` - runtime events include base identity, ordering, refs, and raw payload fields, supporting the existing canonical event envelope.
- `opencode / packages/sdk/js/src/gen/types.gen.ts:704-736` - OpenCode exposes a rich native structured event union, supporting structured projection rather than terminal text parsing.
- `opencode / packages/opencode/src/session/session.ts:207-227` - OpenCode session metadata includes identifiers, directory, model, cost, tokens, and timing, which are candidate mappings into best-effort SDK metadata.
- `go-plugin / runner/runner.go:14-37` - process start, stdout, stderr, diagnose, and attached runner concerns should be separated from canonical event projection.
- `go-plugin / client.go:530-567` - graceful-then-force kill is later lifecycle evidence; Sprint 3 should leave hooks compatible with Sprint 4 but not implement full cleanup policy unless needed for safe subprocess termination.
- `/home/antonioborgerees/coding/agentwrap/runtime.go:8-20` - Sprint 2 public `Runtime` and `Run` interfaces define the adapter target surface.
- `/home/antonioborgerees/coding/agentwrap/runtime.go:22-35` - `RunRequest` already carries prompt, working directory, session/turn IDs, provider/model, permissions/sandbox placeholders, timeout, metadata, and required capabilities.
- `/home/antonioborgerees/coding/agentwrap/events.go:5-19` - canonical `Event` envelope already has identity, sequence, correlation, context, category, type, payload, and raw native payload.
- `/home/antonioborgerees/coding/agentwrap/events.go:51-59` - raw payloads are diagnostic and sensitive unless adapter redaction rules mark them safe.
- `/home/antonioborgerees/coding/agentwrap/errors.go:11-28` - classified error categories include malformed event, runtime exit, timeout, cancellation, cleanup, and unknown.
- `/home/antonioborgerees/coding/agentwrap/internal/testkit/fake_runtime.go:21-75` - fake runtime proves the public contract and provides the baseline behavior Sprint 3 adapter tests should match from a caller perspective.

### Evidence Rejected Or Not Used

- **Retry, fallback, validation, and repair evidence in the generated bundle:** Not used for adapter decisions because the roadmap explicitly keeps retry/fallback out of Sprint 3 and validation/repair out until Sprint 7.
- **Most per-source reports and resolved code references:** Omitted from active context because the final reports and selected code references were enough for planning; loading every source would add volume without changing Sprint 3 scope.
- **Workflow composition and observability final report in full:** Not loaded in detail because Sprint 3 does not implement dashboards, persistence, workflow orchestration, or policy decisions. Only metadata/diagnostic implications are carried into scope.
- **Full lifecycle cleanup and retained-session details:** Deferred to Sprint 4. Sprint 3 should terminate owned processes safely enough for tests and return final status, but not solve retained sessions, reapers, or cleanup-failure surfaces comprehensively.

## Requirement Map

### Requirement Index Used In This Sprint

| Requirement | Source | Area | Applicability | Why It Matters For This Sprint |
| --- | --- | --- | --- | --- |
| MVP supports OpenCode runtime execution through structured output | PRD MVP Scope | Runtime adapter | Applicable | This sprint is the first real runtime implementation. |
| Product callers must not know native command, event schema, process details, or provider mechanics | PRD Runtime Abstraction | Adapter boundary | Applicable | OpenCode invocation and event types must stay behind `Runtime`. |
| Canonical events for lifecycle, progress, messages, tools, artifacts, usage, warnings, errors, permissions, and final result | PRD Structured Events; TRD Canonical Event Model | Event projection | Applicable | Native OpenCode events must map into existing canonical categories where possible. |
| Native runtime event payloads should be preservable | PRD Structured Events; TRD Structured Runtime Events | Diagnostics | Applicable | Raw OpenCode events must be retained in `RawPayload` for debugging and future compatibility. |
| For OpenCode, use structured JSON output rather than free-form terminal text | TRD Structured Runtime Events | Decoder | Applicable | The adapter must decode structured output and must not parse terminal prose as primary success evidence. |
| Malformed structured events must be explicit decode errors with runtime/run/event position/raw payload context where safe | TRD Structured Runtime Events; TRD Error Model | Failure behavior | Applicable | The adapter must classify malformed records as `ErrorMalformedEvent` and emit/return explicit failure. |
| Runtime exits, stderr diagnostics, and final result state must be captured | Roadmap Sprint 3 Scope | Process result | Applicable | Exit success alone is insufficient and stderr must be diagnostic, not caller event text. |
| Keep retry/fallback out of this sprint | Roadmap Sprint 3 Scope | Non-scope | Applicable | The adapter may classify failures but must not retry, backoff, or fallback. |
| Integration tests should be focused and explicit about external runtime requirements | Testing evidence pack; go testing final report | Quality gate | Applicable | Real OpenCode tests must be gated; fixture tests carry default confidence. |
| State-first protocol requires runtime state ownership and pure logic extraction | Feature architecture protocol | Design discipline | Applicable | Process lifetime and stream state belong to the adapter runtime; native-to-canonical mapping should be a deterministic function tested by fixtures. |

### Applicable Requirements

- **OpenCode structured execution:** Sprint 3 must add an OpenCode runtime implementation that can start work through structured output mode and satisfy the public `Runtime` interface.
- **Runtime-neutral caller path:** Callers consume `agentwrap.Event`, `RunResult`, `Capabilities`, and `SDKError`; they should not need OpenCode command flags or native event names for common behavior.
- **Native event decoder and canonical projector:** The adapter must own native structured record decoding, unknown native event handling, canonical event mapping, event sequencing, and raw payload retention.
- **Malformed event and partial stream failure:** Malformed structured records, incomplete final streams, and final-result absence must not be treated as success.
- **Runtime exit and stderr diagnostics:** Process exit code, process start failure, stderr, and final status must be captured as classified diagnostics and metadata.
- **Representative fixtures:** Normal, unknown, malformed, partial, and final event streams must be covered by deterministic unit/fixture tests before relying on a real OpenCode binary.
- **Gated real OpenCode smoke:** One real-runtime integration path should exist if OpenCode is available and explicitly enabled, but it must not be required for default unit tests.

### Non-Applicable Requirements

- **Health checks and configuration validation:** Sprint 5 owns runtime availability, authentication/provider checks, model availability, config precedence, and fail-fast preflight. Sprint 3 may return start errors but should not build full health checks.
- **Full cancellation propagation, cleanup failure reporting, retained sessions, and reapers:** Sprint 4 owns lifecycle depth. Sprint 3 should provide enough cancellation/process termination for safe tests but should not claim complete cleanup semantics.
- **Retry, backoff, fallback, and rate-limit policy execution:** Sprint 6 owns policies. Sprint 3 can classify or emit observed rate-limit/error events if native events expose them, but must not retry.
- **Output validation and repair:** Sprint 7 owns file/report/schema validators and repair attempts. Sprint 3 final status is adapter/runtime result only.
- **Persistence, dashboards, historical inspection, and cost/time estimation:** Sprint 8 owns durable records and richer observability. Sprint 3 should fill best-effort metadata only.
- **Executable product surface:** The target remains SDK-first. No user-facing CLI command tree should be added for this sprint.
- **Workflow/DAG/task orchestration or UltraPlan-specific behavior:** Product workflow logic stays outside agentwrap.

### Ambiguous Or Conflicting Requirements

- **Exact OpenCode invocation contract:** The roadmap says "structured output mode" but does not pin exact command flags. The implementation must discover the current OpenCode invocation locally and isolate it behind adapter options. If the flag shape is unclear, record the command as an open question rather than spreading assumptions through public APIs.
- **Native event field promotion:** Requirements demand canonical events and metadata, while evidence warns against leaking runtime-specific fields. The adapter should promote only stable fields needed by the common event categories and retain everything else in `RawPayload`/native metadata.
- **Malformed mid-stream policy:** TRD requires explicit decode errors, but open questions ask what default policy should be. For Sprint 3, malformed structured output should fail the run explicitly without retry; later policy sprints may decide recoverability.
- **Session mapping:** Sprint 2 has `SessionID`, but full retained-session behavior is Sprint 4. Sprint 3 should capture native session IDs when present and set capability detail honestly, but not implement continue/reuse/fork/release operations.
- **Stderr handling:** Stderr may contain useful diagnostics, warnings, or non-structured runtime text. Sprint 3 should not parse stderr into canonical progress events. It should keep stderr as bounded diagnostic metadata attached to errors/results.

### Open Questions

- What exact OpenCode command/flags produce stable structured JSON output in the current environment?
- What native OpenCode event types and fields should be promoted into canonical lifecycle/message/tool/artifact/usage/final-result payloads versus preserved only as raw payload?
- Should unknown native event types become `EventUnknown` or `EventNativeExtension` by default, and what payload shape should they use?
- Should a malformed native record fail immediately, or can later adapter versions emit a recoverable error and continue? Sprint 3 should fail explicitly unless evidence proves continuation is safe.
- How much stderr should be retained in result/error metadata before redaction, truncation, or persistence policy exists?

## Sprint Decision Analysis

### Decision Area 1: Adapter Package Boundary And Public Surface

**Problem:** Sprint 3 must add a real OpenCode adapter without polluting the common SDK package with OpenCode command flags, native event names, or process details.

**Requirements Applied**
- PRD Runtime Abstraction requires product callers not to know native command, event schema, process details, or provider mechanics.
- TRD Runtime Interface requires a first runtime implementation for OpenCode behind the runtime-neutral interface.
- Roadmap Sprint 3 requires an OpenCode adapter while keeping OpenCode-specific mechanics out of the common caller path.

**Evidence Applied**
- Runtime-contract pack says runtime-specific behavior should be exposed as capabilities or metadata, not required for common flows.
- Runtime contract final report recommends a small contract layer and adapter boundaries that isolate OpenCode-specific mechanics from public API.
- Current `agentwrap.Runtime` and `agentwrap.Run` interfaces at `/home/antonioborgerees/coding/agentwrap/runtime.go:8-20` are already the adapter target.

**Options Considered**
- **Option A:** Add an OpenCode-specific package such as `opencode` or `internal/opencode` that implements `agentwrap.Runtime`, with adapter configuration kept out of the root contract except through existing request fields and capabilities.
- **Option B:** Add OpenCode fields and event types directly to the root `agentwrap` package.
- **Option C:** Implement the adapter inside `internal/testkit` as another fake-like runtime.

**Chosen Approach**
- Use Option A. Add a dedicated OpenCode adapter package with concrete adapter options and process/decoder internals, while exporting only a constructor and implementation of the existing public `Runtime` interface if an external caller needs to instantiate it.

**Decision Justification**
- Option A satisfies the MVP OpenCode requirement without making OpenCode mechanics part of the common path.
- Option B would violate runtime neutrality and make the second-runtime goal harder.
- Option C would hide the first real runtime from SDK callers and blur test support with production behavior.
- The accepted tradeoff is one runtime-specific package before a second runtime exists; this is justified because OpenCode is the first supported runtime and its mechanics are volatile enough to deserve isolation.

**Execution Notes**
- Keep root `agentwrap` changes minimal. Add root types only if mapping reveals a real contract gap, and record that as a Sprint 3 pressure finding.
- Adapter options may include executable path, extra args/env, stderr limit, clock/process runner hooks, and fixture decoder hooks, but they must not become required for common `RunRequest` callers.
- Capability detail should report OpenCode support honestly, including unsupported retained-session operations that Sprint 4 has not implemented.

**Expected Evidence**
- **Tests:** Compile-time assertion that the OpenCode adapter implements `agentwrap.Runtime`; constructor/options tests that do not spawn a process by default.
- **Runtime Evidence:** Capabilities identify runtime kind `opencode` and support for structured events/raw payloads.
- **Review Checks:** Review confirms common SDK callers still use `Runtime`, `RunRequest`, `Event`, and `RunResult` without OpenCode imports unless they are explicitly constructing the adapter.

---

### Decision Area 2: Process Runner And Stream Ownership

**Problem:** The adapter must start OpenCode and read structured output while keeping process mechanics testable and not overbuilding Sprint 4 lifecycle behavior.

**Requirements Applied**
- PRD MVP requires OpenCode runtime execution through structured output.
- TRD requires runtime work to be startable, monitorable, cancellable, and inspectable, while Sprint 4 owns deeper lifecycle cleanup.
- Roadmap Sprint 3 requires runtime exit, stderr diagnostics, and final result state capture.

**Evidence Applied**
- Session-lifecycle final report recommends separating process/transport decoding from domain logic and using explicit lifecycle state.
- `go-plugin` runner evidence separates `Start`, `Stdout`, `Stderr`, `Diagnose`, and attached lifecycle concerns.
- IO abstraction evidence supports injected stream/process dependencies for tests.

**Options Considered**
- **Option A:** Implement a small process runner abstraction internal to the adapter, defaulting to `os/exec`, with fake runner support for unit tests and bounded stderr capture.
- **Option B:** Call `exec.CommandContext` directly inside `StartRun` with no runner seam.
- **Option C:** Build a full retained session/process manager with reaper, reattach metadata, and cleanup failure model now.

**Chosen Approach**
- Use Option A. The adapter should own a narrow process runner seam for start/stdout/stderr/wait/kill so fixtures can drive adapter behavior without requiring a real OpenCode binary.

**Decision Justification**
- Option A supports deterministic unit tests and keeps process mechanics isolated.
- Option B would make malformed stream and exit-path tests slower and more brittle.
- Option C is premature because Sprint 4 owns full lifecycle, cancellation, cleanup, and retained sessions.
- The accepted tradeoff is a test seam that looks like an abstraction before there are two real process backends; this is warranted by external process volatility and fixture testing needs.

**Execution Notes**
- The default runner should pass prompt/workdir/provider/model/options to OpenCode only through adapter code, not the root SDK.
- Process stdout is the structured event source. Stderr is diagnostics only and should be bounded.
- `Cancel` should make a best-effort context/process stop if a run is active, but full cleanup-failure reporting belongs to Sprint 4.
- Do not add retry/backoff around process start or wait.

**Expected Evidence**
- **Tests:** Fake runner tests for process start failure, stdout normal stream, stderr capture, non-zero exit, context cancellation, and wait-after-stream behavior.
- **Runtime Evidence:** Run result includes final lifecycle status and safe diagnostic detail for start/exit failures.
- **Review Checks:** Review confirms no global process state and no real OpenCode requirement in default unit tests.

---

### Decision Area 3: Native Decoder And Canonical Projection

**Problem:** The adapter must map OpenCode native structured events into the existing canonical event envelope without losing diagnostics or leaking native schemas into caller code.

**Requirements Applied**
- PRD Structured Events requires canonical lifecycle/progress/message/tool/artifact/usage/warning/error/final-result events and raw native payload preservation.
- TRD Structured Runtime Events requires native runtime events to decode into canonical events and malformed events to be explicit decode errors.
- Roadmap Sprint 3 requires normal, unknown, malformed, partial, and final event stream tests.

**Evidence Applied**
- Runtime-contract final report recommends typed event schema plus raw native escape hatch.
- OpenCode event union evidence shows many native event variants, supporting projection instead of direct exposure.
- Current `agentwrap.Event` at `/home/antonioborgerees/coding/agentwrap/events.go:5-19` already supports sequence, correlation, category, type, payload, and raw payload.

**Options Considered**
- **Option A:** Implement decoder and projector as deterministic functions: native JSON line or record to native map/typed minimal struct, then canonical `agentwrap.Event`.
- **Option B:** Expose native OpenCode SDK/generated event structs directly in event payloads.
- **Option C:** Treat every native record as `EventNativeExtension` and defer canonical mapping.

**Chosen Approach**
- Use Option A. Decode each structured record, preserve raw bytes, promote known stable fields into canonical categories, and map unknown valid native event types to an explicit unknown/native-extension canonical event.

**Decision Justification**
- Option A satisfies product dashboard needs while retaining diagnostics.
- Option B leaks OpenCode-specific schemas into common product code.
- Option C technically preserves data but fails the Sprint 3 quality gate that callers can consume canonical events.
- The accepted tradeoff is that initial mappings may be incomplete until representative real OpenCode fixtures are captured.

**Execution Notes**
- Keep projection logic pure and table-driven so native event mapping can be reviewed independently from process code.
- Every emitted canonical event should have run ID, sequence, timestamp, runtime context, category, type, and raw payload.
- Raw payload `Safe` should default false unless the adapter deliberately redacts or proves safety.
- Unknown valid native event types should be visible and non-fatal; malformed JSON or invalid structured records should be fatal for Sprint 3.

**Expected Evidence**
- **Tests:** Fixture tests for known native events, unknown native event type, malformed JSON, valid JSON with unsupported shape, partial stream without final result, and raw payload preservation.
- **Runtime Evidence:** Canonical event sequence can be consumed without OpenCode-specific branching for common lifecycle/message/tool/artifact/usage/final events.
- **Review Checks:** Review confirms projection is deterministic and OpenCode-native fields that are not promoted remain available in raw/native metadata.

---

### Decision Area 4: Failure Semantics For Malformed Output, Exit, And Final State

**Problem:** Runtime process success is not enough. The adapter must classify decode failures, partial streams, non-zero exits, stderr diagnostics, and missing final state without retrying or validating deliverables.

**Requirements Applied**
- PRD says runtime failures must be explicit, typed, and recoverable where possible; product success requires validation later.
- TRD says malformed structured events are explicit decode errors and runtime exit is a classified error category.
- Roadmap Sprint 3 says malformed output is not success and retry/fallback is out of scope.

**Evidence Applied**
- Session-lifecycle pack says malformed structured events are first-class lifecycle failures.
- Current `SDKError` categories include `ErrorMalformedEvent` and `ErrorRuntimeExit` at `/home/antonioborgerees/coding/agentwrap/errors.go:11-28`.
- Error-handling evidence favors structured errors and wrapping over panic/string matching.

**Options Considered**
- **Option A:** Fail the run on malformed structured output, non-zero exit, or missing final result, returning classified `SDKError` plus bounded debug detail and raw payload context where safe.
- **Option B:** Continue after malformed records and emit recoverable error events.
- **Option C:** Treat zero exit code as success even if final event is absent.

**Chosen Approach**
- Use Option A for Sprint 3.

**Decision Justification**
- Option A directly satisfies the roadmap quality gate and avoids silently accepting corrupted event streams.
- Option B may be useful later, but without evidence that continuation is safe it risks dashboards and result consumers observing inconsistent state.
- Option C violates the PRD/TRD rule that product success is not runtime exit alone.
- The accepted tradeoff is stricter failure behavior in Sprint 3; later resilience/policy work can decide whether selected decode failures are recoverable.

**Execution Notes**
- Decode failures should include operation, run ID if available, sequence/line number, and safe raw payload preview in debug detail.
- Non-zero exit should be `ErrorRuntimeExit`; start binary missing should be `ErrorRuntimeUnavailable`; context deadline should be `ErrorTimeout`; cancellation should be `ErrorCancellation`.
- Missing final event after process completion should produce failed final result, not completed.
- Stderr should be bounded and recorded in debug detail or native metadata without being parsed as structured events.

**Expected Evidence**
- **Tests:** Malformed event returns `ErrorMalformedEvent`; non-zero process exit returns `ErrorRuntimeExit`; missing executable returns `ErrorRuntimeUnavailable`; missing final event is failed; zero exit with valid final event completes.
- **Runtime Evidence:** Final `RunResult.Status` and returned error agree, and emitted fatal/error events do not contradict the result.
- **Review Checks:** Review confirms no retry/fallback/backoff and no validation/repair behavior.

---

### Decision Area 5: Test And Integration Gate Shape

**Problem:** Sprint 3 needs real adapter confidence without making local or CI tests depend on OpenCode installation, credentials, or provider availability.

**Requirements Applied**
- Roadmap Sprint 3 requires structured event fixtures and one gated integration test path for real OpenCode if available.
- Testing-strategy evidence pack requires fake runtimes and fixtures before relying on real OpenCode runs.
- PRD/TRD require structured output and explicit failure behavior.

**Evidence Applied**
- Go testing final report recommends table-driven tests, fixture/golden tests, behavior assertions, and build tags or short-mode checks for integration paths.
- Current fake runtime and fixture harness under `/home/antonioborgerees/coding/agentwrap/internal/testkit` provide deterministic contract proof but not real adapter proof.

**Options Considered**
- **Option A:** Default unit/fixture tests use fake process runner and representative OpenCode JSON fixtures; real OpenCode smoke is gated by build tag and/or explicit environment variable.
- **Option B:** Require a real OpenCode binary for adapter tests.
- **Option C:** Skip real-runtime smoke entirely.

**Chosen Approach**
- Use Option A.

**Decision Justification**
- Option A gives deterministic coverage and a manual/CI opt-in path for real-runtime confidence.
- Option B would make tests brittle in environments without OpenCode or credentials.
- Option C misses the roadmap's real-runtime pressure requirement.
- The accepted tradeoff is that the default suite proves adapter logic, not the external binary installation path.

**Execution Notes**
- Add fixtures from representative OpenCode structured output where available; if real output cannot be captured during implementation, create minimal documented fixtures based on observed or documented native structure and record the gap.
- Gate real smoke with clear requirements, for example `AGENTWRAP_OPENCODE_INTEGRATION=1`, `testing.Short()` skip, or an `integration` build tag.
- The smoke should assert canonical event consumption and final status, not exact native event order beyond stable essentials.

**Expected Evidence**
- **Tests:** `go test ./...` passes without OpenCode; gated test skips by default and runs when explicitly enabled.
- **Runtime Evidence:** If OpenCode is available, one smoke run produces canonical events and a final result or classified setup failure.
- **Review Checks:** Review confirms fixture coverage includes normal, unknown, malformed, partial, and final streams.

## Deviations

| Requirement | Deviation | Reason | Risk | Disposition | Follow-up |
| --- | --- | --- | --- | --- | --- |
| Full cancellation and process cleanup are part of the TRD runtime interface | Sprint 3 only plans best-effort stop sufficient for adapter tests | Roadmap assigns lifecycle, cancellation, cleanup, and retained sessions to Sprint 4 | Adapter may need refactor when Sprint 4 deepens cleanup semantics | Temporary | Sprint 4 should build on or replace the narrow process runner cleanup path |
| Health/readiness should fail fast before work | Sprint 3 returns start/runtime errors but does not implement standalone health checks | Sprint 5 owns health and configuration validation | Missing binary/provider setup may be discovered at run start, not preflight | Temporary | Sprint 5 adds health and config validation |
| Product success requires output validation | Sprint 3 only validates event stream/final runtime result, not deliverables | Sprint 7 owns output validation and repair | A run can complete while missing product artifacts | Temporary | Sprint 7 adds validators and repair |

## Cross-Cutting Reasoning

### Major Decision Summary

- **Dedicated OpenCode adapter package:** Required by the OpenCode MVP while preserving runtime-neutral root SDK contracts.
- **Internal process runner seam:** Required to test external process behavior deterministically and avoid real OpenCode dependency in unit tests.
- **Pure decoder/projector:** Required to keep native structured parsing separate from canonical event mapping and make fixture tests precise.
- **Strict malformed/partial/final failure semantics:** Required because malformed structured output and missing final result must not be treated as success.
- **Fixture-first plus gated smoke:** Required to satisfy the quality gate without making CI depend on external runtime setup.

### Tradeoffs

- A runtime-specific adapter package is introduced before a second runtime exists, but OpenCode's process/event volatility justifies isolation.
- The adapter will include a process runner seam that has one production implementation, but the seam is necessary for deterministic stream, stderr, exit, and cancellation tests.
- Initial native event mappings may be incomplete, but raw payload preservation and unknown-event projection avoid data loss.
- Sprint 3 is deliberately strict on malformed output; later resilience policy can relax behavior with evidence.

### Assumptions

- The Sprint 2 public `Runtime`, `Run`, `Event`, `RunResult`, `Capabilities`, and `SDKError` contracts are sufficient unless real OpenCode output reveals a specific gap.
- OpenCode can be invoked locally in a structured JSON output mode, but exact flags may need implementation discovery.
- Stderr is diagnostic text and should not be parsed as the authoritative event stream.
- Real-runtime smoke may be skipped by default because OpenCode installation, provider configuration, and credentials are environment-dependent.

### Dependencies

- **Sprint 1:** Private fixture discipline and Go module/test harness exist in `/home/antonioborgerees/coding/agentwrap`.
- **Sprint 2:** Public runtime contract, event envelope, raw payload, lifecycle, metadata, capability, and error models are implemented and tested.
- **OpenCode binary/provider setup:** Needed only for gated integration smoke, not default unit tests.

### Risks

- **OpenCode structured output shape differs from assumptions:** Mitigate by capturing representative fixtures during implementation and keeping unknown valid native records non-fatal.
- **Adapter exposes OpenCode types through root SDK:** Mitigate through review checks and adapter package isolation.
- **Malformed event handling is too strict for real streams with benign noise:** Mitigate by requiring evidence before allowing continuation, and keep stderr separate from stdout structured stream.
- **Stderr may contain sensitive details:** Mitigate by bounding diagnostics and treating raw/native metadata as unsafe by default.
- **Cancellation path accidentally claims Sprint 4 completeness:** Mitigate by documenting best-effort behavior and keeping cleanup-failure semantics out of Sprint 3 success criteria.

## Tracker Guidance

Use this reasoning to write `targets/agentwrap/sprints/03-opencode-adapter/plan.md`.

The tracker must include:

- scope for a dedicated OpenCode adapter package implementing `agentwrap.Runtime`
- non-scope for health checks, retry/fallback, validation/repair, persistence, full retained sessions, and user-facing CLI commands
- tasks for process runner seam, structured decoder, canonical projector, result/error semantics, fixtures, and gated integration smoke
- tests for normal, unknown, malformed, partial, final, stderr, non-zero exit, missing binary, and cancellation/start context behavior
- risks and open questions about exact OpenCode invocation, native field promotion, unknown native events, malformed mid-stream policy, and stderr retention
- success criteria proving a caller can run or fake-run the adapter and consume canonical events without OpenCode-specific common-path code

## Evidence Review Checklist

- [x] Review can trace every sprint decision back to PRD/TRD requirements.
- [x] Review can trace every meaningful design choice back to evolved study evidence or an explicit open question.
- [x] Review can identify which evidence was loaded, omitted, rejected, or explored directly.
- [x] Review can see credible alternatives and why they were rejected.
- [x] Review can verify the planned tests and runtime evidence.
- [x] Review can identify planned or unplanned deviations.

## Phase Exit Criteria

- [x] Sprint scope is fully covered.
- [x] Target PRD and TRD requirements are mapped.
- [x] Evidence bundle was read or staged according to the context strategy.
- [x] Applicable, non-applicable, and ambiguous requirements are recorded where relevant.
- [x] Study evidence is tied to decisions, risks, alternatives, or expected evidence.
- [x] Important decisions are explicitly justified.
- [x] Non-trivial alternatives are discussed.
- [x] Deviations, assumptions, risks, and unknowns are documented.
- [x] Expected execution and review evidence is defined.
- [x] The sprint tracker can be written from this reasoning without reopening every study report.

## Documentation Updates

- `targets/agentwrap/sprints/03-opencode-adapter/plan.md` - must execute the reasoning decisions and carry forward risks/open questions.
- `targets/agentwrap/DECISIONS.md` - should be updated after implementation only if adapter behavior confirms durable decisions or changes Sprint 2 contract decisions.
- `/home/antonioborgerees/coding/agentwrap` package documentation or adapter README/comments - should document OpenCode adapter construction, test gating, raw payload sensitivity, and real-runtime smoke requirements if implementation adds public adapter package docs.
