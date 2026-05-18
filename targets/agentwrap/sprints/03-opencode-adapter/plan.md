# Sprint Tracker: OpenCode Structured Event Adapter

> Target: agentwrap
> Sprint ID: 03-opencode-adapter
> Created: 2026-05-18
> Reasoning: `targets/agentwrap/sprints/03-opencode-adapter/reasoning.md`
> Roadmap Section: `targets/agentwrap/roadmap.md` - `## Sprint 3: OpenCode Structured Event Adapter`
> Evidence Bundle: `targets/agentwrap/reports/sprint-evidence/03-opencode-adapter.txt`

## Sprint Overview

- **Sprint Name:** OpenCode Structured Event Adapter
- **Sprint Focus:** Implement the first real runtime adapter for OpenCode by launching structured output, decoding native records, projecting canonical events, preserving raw native payloads, and surfacing malformed output, runtime exits, stderr diagnostics, and final state as explicit SDK results/errors.
- **Depends On:** Sprint 1 project skeleton and fixture harness; Sprint 2 runtime contract, event envelope, lifecycle vocabulary, capabilities, and classified error model.
- **Status:** Complete

## Requirement Links

- `targets/agentwrap/sources/PRD.md` - OpenCode-first MVP, runtime-neutral product interface, structured events, raw payload preservation, explicit failure handling, metadata, and output safety.
- `targets/agentwrap/sources/TRD.md` - runtime interface, OpenCode implementation, structured runtime events, canonical event model, lifecycle states, error model, cancellation constraints, and acceptance criteria.
- `targets/agentwrap/sources/feature-architecture.md` - state-first modular flow, explicit runtime state ownership, pure logic extraction, and minimal-abstraction rule.
- `targets/agentwrap/roadmap.md` - Sprint 3 goal, scope, output, evidence inputs, and quality gate.
- `targets/agentwrap/sprints/03-opencode-adapter/reasoning.md` - decisions, tradeoffs, expected evidence, risks, assumptions, and open questions this tracker executes.

## Evidence Links

- `targets/agentwrap/reports/sprint-evidence/03-opencode-adapter.txt` - generated `study evolve --top-sources 1` bundle used for planning.
- `targets/agentwrap/reports/evidence/runtime-contract.md` - supports runtime-neutral adapter boundary, canonical projection, raw payload retention, and capability reporting.
- `targets/agentwrap/reports/evidence/session-lifecycle.md` - supports explicit lifecycle events, process/session state visibility, malformed event failure, and runtime exit reporting.
- `targets/agentwrap/reports/evidence/testing-strategy.md` - supports fixture-first testing, malformed/unknown/partial/final stream cases, and gated integration tests.
- `studies/opencode-wrap-study/reports/final/01-runtime-contract-and-api-shape.md` - supports adapter isolation, streaming canonical events, raw native escape hatch, and OpenCode structured event projection.
- `studies/opencode-wrap-study/reports/final/02-process-session-lifecycle.md` - supports process runner separation, protocol decoding separate from domain mapping, explicit states, and scoped cleanup concepts.
- `studies/go-cli-study/reports/final/06-io-abstraction.md` - supports injected streams and process seams for deterministic stdout/stderr tests.
- `studies/go-cli-study/reports/final/11-testing-strategy.md` - supports table-driven fixture tests, behavior assertions, and explicit real-runtime gating.
- `/home/antonioborgerees/coding/agentwrap/runtime.go` - current public `Runtime`, `Run`, `RunRequest`, `RunResult`, and capability contract to implement.
- `/home/antonioborgerees/coding/agentwrap/events.go` - current canonical event envelope and raw payload contract to populate.
- `/home/antonioborgerees/coding/agentwrap/errors.go` - current classified error categories to use for malformed events, runtime exits, missing binary, timeout, cancellation, and unknown failures.

## Sprint Goals

- **Primary Goal:** A caller can instantiate an OpenCode runtime adapter, start a run, consume canonical `agentwrap.Event` values produced from OpenCode structured output, and receive a classified final result or failure without parsing OpenCode-native output.
- **Secondary Goals:**
  - Keep OpenCode command and native event mechanics isolated in an adapter package.
  - Add deterministic fixtures and fake process-runner tests for normal, unknown, malformed, partial, and final event streams.
  - Preserve raw native payloads for diagnostics while defaulting them to unsafe unless deliberately redacted.
  - Capture runtime exit code, stderr diagnostics, start errors, missing final result, and malformed event failures explicitly.
  - Add one gated real OpenCode smoke path that is skipped unless the runtime is available and explicitly enabled.

## Scope

- Add a dedicated OpenCode adapter package in `/home/antonioborgerees/coding/agentwrap` that implements `agentwrap.Runtime`.
- Add adapter construction/options for executable path, extra args/env where needed, stderr diagnostic limit, and test hooks without changing the common root SDK contract unless real OpenCode evidence proves a gap.
- Start OpenCode in structured output mode from `RunRequest` prompt, working directory, provider/model preferences where supported, permissions/sandbox placeholders where safely mappable, and timeout/context values.
- Decode structured stdout records into native event representations while preserving raw bytes and sequence/line position.
- Project known native events into canonical lifecycle, message/progress, tool, artifact, usage, warning/error, permission/blocking, session, and final-result events where native data supports them.
- Represent unknown but valid native events as explicit `EventUnknown` or `EventNativeExtension` canonical events with raw payload preservation.
- Treat malformed JSON/structured records, invalid event shapes, missing final result, process start failure, and non-zero runtime exit as explicit classified failures.
- Capture bounded stderr diagnostics and final process result metadata separately from canonical stdout events.
- Add representative OpenCode structured event fixtures for normal, unknown, malformed, partial, and final streams.
- Add default unit/fixture tests that pass without OpenCode installed.
- Add a gated real OpenCode smoke/integration test path if OpenCode is available.

## Non-Scope

- Do not implement standalone health checks, provider/model availability checks, authentication validation, or configuration precedence; Sprint 5 owns these.
- Do not implement retry, fallback, backoff, rate-limit policy execution, or attempt orchestration; Sprint 6 owns these.
- Do not implement output/artifact validation, required report checks, validation-informed repair, or reprompt flows; Sprint 7 owns these.
- Do not implement persistence, active-run stores, historical inspection, dashboards, cost/time estimation algorithms, or durable event logs; Sprint 8 owns these.
- Do not implement full retained-session operations such as continue, reuse, fork, release, replace, session reaper, or cleanup-failure surfacing; Sprint 4 owns lifecycle/session depth.
- Do not add UltraPlan-specific study, synthesis, sprint planning, scoring, report validation, or workflow/DAG concepts.
- Do not add a user-facing CLI command surface for running OpenCode through agentwrap.
- Do not parse free-form terminal text as the primary event source when structured output is available.
- Do not treat runtime exit success as sufficient if the structured stream is malformed or lacks a final result.

## Proposed Implementation Shape

- **Package / Module Boundaries:** Keep the root `agentwrap` package as the runtime-neutral contract. Add a runtime-specific OpenCode adapter package, for example `opencode`, plus private/internal files for process runner, decoder, projector, fixtures, and adapter tests. Keep test-only helpers under adapter tests or `internal/testkit` as appropriate.
- **Public Surface:** Export a constructor such as `opencode.NewRuntime(options...)` only if external callers need to instantiate the adapter. The returned type implements `agentwrap.Runtime`. Avoid OpenCode-native public event types unless they are adapter-local and not required by common callers.
- **State And Lifecycle:** Adapter-owned ephemeral state includes process handle, stdout scanner/decoder position, stderr buffer, event sequence, cancellation channel/context, and final-result observation. Public state is emitted through canonical lifecycle/final events and `RunResult.Status`.
- **Error And Failure Behavior:** Use `SDKError` categories: `ErrorRuntimeUnavailable` for missing executable/start setup, `ErrorMalformedEvent` for invalid structured output, `ErrorRuntimeExit` for non-zero exit or final stream failure, `ErrorTimeout` for context deadline, `ErrorCancellation` for caller cancellation, and `ErrorUnknown` for unexpected adapter failures. Include safe user detail and bounded debug detail.
- **Observability:** Fill `RuntimeContext` with `RuntimeKind("opencode")`, runtime name/version where available, provider/model from request or native event where known, event sequence/time, artifacts/usage when present, stderr diagnostics in debug/native metadata, and raw native payloads with `Safe: false` by default.
- **Testing Surface:** Unit tests for decoder/projector, fake process runner tests for runtime behavior, fixture tests for event streams, and gated real OpenCode smoke with explicit environment/build-tag requirements.

## Decisions

- [x] **Decision 1: Isolate OpenCode In A Dedicated Adapter Package**
  > **Requirement:** PRD runtime abstraction; TRD first OpenCode implementation; roadmap Sprint 3 OpenCode adapter output.
  > **Evidence:** `reasoning.md` Decision Area 1; runtime-contract evidence recommends adapter boundaries that isolate OpenCode mechanics.
  > **Tradeoff:** Adds a runtime-specific package before a second runtime exists.
  > **Rejected Alternative:** Put OpenCode fields/native event types in the root SDK package; rejected because it leaks adapter internals. Hide the adapter under `internal/testkit`; rejected because this is production runtime behavior.
  > **Risk / Follow-up:** Sprint 10 should pressure-test whether this package boundary generalizes for a second runtime.

- [x] **Decision 2: Use A Narrow Internal Process Runner Seam**
  > **Requirement:** OpenCode execution, runtime exit capture, stderr diagnostics, and deterministic tests.
  > **Evidence:** `reasoning.md` Decision Area 2; lifecycle report and `go-plugin` runner evidence separate process start/stdout/stderr/diagnose concerns.
  > **Tradeoff:** Introduces a seam with one production implementation.
  > **Rejected Alternative:** Direct `exec.CommandContext` in `StartRun`; rejected because malformed streams, stderr, and exit behavior need fakeable tests. Full process manager/reaper now; rejected as Sprint 4 scope.
  > **Risk / Follow-up:** Sprint 4 may deepen or replace parts of the runner for cleanup and retained sessions.

- [x] **Decision 3: Decode Then Project Native Events Deterministically**
  > **Requirement:** TRD structured event decoding, canonical event model, raw payload preservation, and malformed event errors.
  > **Evidence:** `reasoning.md` Decision Area 3; OpenCode native event union evidence; current `agentwrap.Event` envelope.
  > **Tradeoff:** Initial mapping may be partial until real OpenCode fixtures reveal all event shapes.
  > **Rejected Alternative:** Expose OpenCode native event structs directly; rejected because common callers should not know native schema. Treat every record as raw extension; rejected because products need canonical progress/final events.
  > **Risk / Follow-up:** Record any root event contract gaps in `DECISIONS.md` after implementation evidence, not before.

- [x] **Decision 4: Fail Strictly On Malformed Output, Missing Final Result, And Runtime Exit**
  > **Requirement:** Malformed structured output is not success; product success requires more than exit status; retry/fallback out of scope.
  > **Evidence:** `reasoning.md` Decision Area 4; session-lifecycle pack and TRD error model.
  > **Tradeoff:** Some recoverable-looking malformed records will fail runs until resilience policy exists.
  > **Rejected Alternative:** Continue after malformed records; rejected without evidence that continuation preserves consistent state. Zero exit means success; rejected because missing final structured state is ambiguous.
  > **Risk / Follow-up:** Sprint 6 can introduce policy-based recovery if evidence supports it.

- [x] **Decision 5: Use Fixture-First Tests Plus A Gated Real Smoke**
  > **Requirement:** Roadmap Sprint 3 fixture coverage and optional real OpenCode integration path.
  > **Evidence:** `reasoning.md` Decision Area 5; testing-strategy evidence recommends deterministic fixtures and explicit integration gates.
  > **Tradeoff:** Default tests prove adapter logic, not external OpenCode installation/provider setup.
  > **Rejected Alternative:** Require OpenCode for default tests; rejected as brittle. Skip real smoke entirely; rejected by roadmap output.
  > **Risk / Follow-up:** If OpenCode cannot be run locally during implementation, record the smoke as an explicit deferral with the exact blocker.

## Execution Checklist

- [x] **Task 1: Verify Sprint 2 Contract And Adapter Boundary**
  > *Description: Confirm the adapter starts from the current public SDK contract and only changes it when real evidence requires it.*
  - [x] **Sub-task 1.1:** Inspect `/home/antonioborgerees/coding/agentwrap` current `Runtime`, `Run`, `RunRequest`, `Event`, `RawPayload`, `RunResult`, `Capabilities`, and `SDKError` definitions.
  - [x] **Sub-task 1.2:** Choose and create the OpenCode adapter package boundary, keeping root package changes minimal.
  - [x] **Sub-task 1.3:** Add compile-time interface assertion that the adapter implements `agentwrap.Runtime`.
  - [x] **Sub-task 1.4:** Update documentation/comments explaining that OpenCode mechanics are adapter-local and common callers consume canonical SDK types.

- [x] **Task 2: Discover And Isolate OpenCode Structured Invocation**
  > *Description: Determine the exact local OpenCode structured-output command shape and keep it behind adapter configuration.*
  - [x] **Sub-task 2.1:** Identify the current OpenCode command/flags for structured JSON output from local help/docs or a guarded manual probe.
  - [x] **Sub-task 2.2:** Add adapter options for executable path, extra args/env, stderr limit, and process-runner test injection.
  - [x] **Sub-task 2.3:** Build command arguments from `RunRequest` prompt, working directory, provider/model where supported, timeout/context, and safe metadata only.
  - [x] **Sub-task 2.4:** Record any unsupported request fields as capability detail or metadata, not silent behavior.

- [x] **Task 3: Implement Process Runner And Run Handle**
  > *Description: Start, monitor, wait, and best-effort cancel an owned OpenCode process without implementing full Sprint 4 lifecycle policy.*
  - [x] **Sub-task 3.1:** Add internal process runner interface and default `os/exec` implementation for start/stdout/stderr/wait/best-effort stop.
  - [x] **Sub-task 3.2:** Implement adapter `StartRun` to create a run ID, runtime context, event stream, stderr capture, and run goroutine.
  - [x] **Sub-task 3.3:** Implement `Events`, `Wait`, `ID`, and best-effort `Cancel` on the OpenCode run handle.
  - [x] **Sub-task 3.4:** Ensure process start failure, context deadline, cancellation, wait errors, and non-zero exit map to classified `SDKError` values.

- [x] **Task 4: Implement Native Decoder And Fixture Format**
  > *Description: Decode structured OpenCode records while preserving raw payload and source position.*
  - [x] **Sub-task 4.1:** Add native record type or map-based decoder that can parse one structured JSON record from stdout.
  - [x] **Sub-task 4.2:** Preserve raw bytes, encoding, line/sequence position, and decode error context.
  - [x] **Sub-task 4.3:** Add representative fixtures for normal stream, unknown native event, malformed record, partial stream without final result, non-zero exit with stderr, and final result stream.
  - [x] **Sub-task 4.4:** Add tests that load fixtures and assert raw payload preservation, decode position, and malformed error classification.

- [x] **Task 5: Implement Canonical Projection**
  > *Description: Convert native OpenCode events into canonical `agentwrap.Event` values suitable for product callers.*
  - [x] **Sub-task 5.1:** Map native lifecycle/session/progress/message/tool/artifact/usage/warning/error/final events into existing event categories where stable fields exist.
  - [x] **Sub-task 5.2:** Map unknown valid native events to `EventUnknown` or `EventNativeExtension` without failing the run.
  - [x] **Sub-task 5.3:** Populate run ID, optional session/turn IDs, sequence, correlation ID, cause event ID where meaningful, timestamp, runtime/provider/model context, type, payload, and raw payload.
  - [x] **Sub-task 5.4:** Default `RawPayload.Safe` to false unless the adapter redacts or proves the payload safe.

- [x] **Task 6: Implement Final Result And Failure Semantics**
  > *Description: Make final runtime state explicit and prevent malformed or partial streams from becoming successful runs.*
  - [x] **Sub-task 6.1:** Track whether a final-result native/canonical event was observed.
  - [x] **Sub-task 6.2:** Return `StateCompleted` only when structured final state and process result are both compatible with success.
  - [x] **Sub-task 6.3:** Return `StateFailed` with `ErrorMalformedEvent` for malformed structured output and with `ErrorRuntimeExit` for non-zero exit or missing final result.
  - [x] **Sub-task 6.4:** Attach bounded stderr/debug/native metadata to `RunResult` and errors without treating stderr as canonical progress events.

- [x] **Task 7: Add Unit, Fixture, And Gated Integration Tests**
  > *Description: Prove adapter behavior without requiring OpenCode by default, then provide an opt-in real-runtime path.*
  - [x] **Sub-task 7.1:** Add table-driven decoder/projector tests for normal, unknown, malformed, partial, final, usage/artifact, and raw-payload cases.
  - [x] **Sub-task 7.2:** Add fake process-runner tests for start failure, stdout stream success, stderr capture, non-zero exit, context timeout, and cancellation.
  - [x] **Sub-task 7.3:** Add a gated real OpenCode smoke test using an explicit environment variable and/or build tag; skip cleanly when disabled or unavailable.
  - [x] **Sub-task 7.4:** Run `go test ./...` and, if possible, the gated smoke path; record commands and results in this tracker.

- [x] **Task 8: Review Scope And Update Decisions**
  > *Description: Close the sprint with evidence and durable decisions only where implementation confirmed them.*
  - [x] **Sub-task 8.1:** Review root SDK changes for OpenCode leakage, public API churn, or workflow/product-specific concepts.
  - [x] **Sub-task 8.2:** Review adapter tests against roadmap quality gate: canonical event consumption, malformed output failure, raw payload availability, and common-path neutrality.
  - [x] **Sub-task 8.3:** Update `targets/agentwrap/DECISIONS.md` only for accepted implementation-confirmed adapter decisions or Sprint 2 contract changes.
  - [x] **Sub-task 8.4:** Record follow-ups for Sprint 4 lifecycle/session cleanup, Sprint 5 health/config, Sprint 6 resilience, and Sprint 8 observability if adapter evidence creates them.

## Testing And Documentation Checklist

- [x] **Unit Tests:** decoder, projector, capabilities, constructor/options, run handle behavior, error classification, stderr bounding, final-result state, and raw payload safety defaults.
- [x] **Fixture Tests:** representative OpenCode structured streams for normal, unknown, malformed, partial/no-final, non-zero exit diagnostics, usage/artifact where available, and final result.
- [x] **Integration Tests:** gated real OpenCode smoke path that is skipped unless explicitly enabled and OpenCode is available.
- [x] **Real Runtime Smoke:** run when available; otherwise record exact deferral reason, such as missing binary, missing provider/auth setup, or unknown structured-output flag.
- [x] **Documentation Updates:** package docs/comments for adapter construction, structured-output requirement, test gating, raw payload sensitivity, strict malformed-event behavior, and explicit Sprint 4/5/6/7 deferrals.

## Risks And Blockers

| Risk | Impact | Mitigation | Status |
| --- | --- | --- | --- |
| Exact OpenCode structured-output command is unknown or has changed | High | Discover locally, isolate flags behind adapter options, and record command evidence | Mitigated |
| Native event mapping underfits real OpenCode output | High | Preserve raw payloads, keep unknown valid events non-fatal, and capture representative fixtures | Mitigated |
| Adapter leaks OpenCode types into root SDK | High | Keep adapter package boundary and review root package diffs explicitly | Mitigated |
| Malformed-event strict failure rejects benign noise | Medium | Treat stdout as structured-only and stderr as diagnostics; require evidence before allowing continuation | Mitigated |
| Stderr or raw payload contains sensitive data | High | Bound diagnostics, keep debug detail separate from user detail, and mark raw payloads unsafe by default | Mitigated |
| Real smoke cannot run in local/CI environment | Medium | Gate smoke and record explicit skip reason; rely on fixture/fake process tests for default gate | Mitigated |
| Best-effort cancellation is mistaken for full cleanup semantics | Medium | Document Sprint 4 ownership and limit Sprint 3 success criteria | Mitigated |

## Open Questions

- Resolved: OpenCode structured output command is `opencode run --format json`; verified locally with `opencode run --help` on 2026-05-18 and isolated behind adapter options.
- Resolved: Sprint 3 promotes stable structured records into canonical lifecycle/progress/message/tool/artifact/usage/warning/error/final categories when evidence is present, and keeps native details in unsafe raw payload/native metadata.
- Resolved: unknown valid native events are categorized as `EventNativeExtension` and do not fail the run.
- Resolved: stderr retention defaults to 16 KiB and is configurable with `WithStderrLimit`.
- Resolved with deferral: the real OpenCode smoke path exists and is gated by `AGENTWRAP_OPENCODE_SMOKE=1`; it was not run by default because provider/auth setup should remain explicit.

## Success Criteria

- [x] **Success Criteria 1:** An OpenCode adapter package exists and its runtime implementation satisfies `agentwrap.Runtime`.
- [x] **Success Criteria 2:** A caller can start an adapter run through `RunRequest`, consume canonical events from `Events()`, and await a `RunResult` without parsing OpenCode-native output.
- [x] **Success Criteria 3:** Native structured records are decoded, sequenced, mapped to canonical events, and preserved as raw payloads with unsafe-by-default diagnostics.
- [x] **Success Criteria 4:** Unknown valid native events are surfaced without failing the run, while malformed records, partial streams without final result, start failures, non-zero exits, timeouts, and cancellations produce classified SDK errors.
- [x] **Success Criteria 5:** Default `go test ./...` passes without OpenCode installed and covers normal, unknown, malformed, partial, final, stderr, and exit scenarios through fixtures/fake process runner.
- [x] **Success Criteria 6:** A gated real OpenCode smoke path exists and either runs successfully when explicitly enabled or records a justified skip/deferral.
- [x] **Success Criteria 7:** No retry/fallback, health/config preflight, validation/repair, persistence/dashboard, retained-session operations, or UltraPlan-specific workflow logic is added.

## Study Evaluation

- [x] **Patterns Followed:** runtime-neutral common path, dedicated adapter boundary, explicit lifecycle/failure states, structured stdout decoding, raw payload escape hatch, process/stream injection for tests, table-driven fixture tests, and gated integration.
- [x] **Anti-Patterns Avoided:** OpenCode generated/native schema as root SDK contract, free-form terminal text parsing as success source, zero-exit-only success, unclassified string errors, real runtime dependency in unit tests, retry/fallback in adapter sprint, and workflow/DAG abstraction.
- [x] **Comparison Needed:** Compare implementation against `targets/agentwrap/sprints/03-opencode-adapter/reasoning.md` Decision Areas 1-5 and the runtime-contract, session-lifecycle, and testing-strategy evidence packs.
- [x] **Proceed / Iterate:** Proceed to Sprint 4 only if canonical event consumption works, malformed output is explicit failure, raw payloads are preserved, adapter mechanics stay out of the common path, and remaining lifecycle gaps are documented for Sprint 4.

## Review And Sign-Off

- Sprint Status: Complete
- Completion Date: 2026-05-18

## Execution Evidence

- Generated evidence bundle before planning: `targets/agentwrap/reports/sprint-evidence/03-opencode-adapter.txt`.
- Planning used staged evidence loading because the bundle is 35,736 lines and 1,506,464 characters.
- Loaded required execution inputs: `plan.md`, `reasoning.md`, `sources/PRD.md`, `sources/TRD.md`, `sources/feature-architecture.md`, and `roadmap.md`.
- Inspected current Sprint 2 contract files: `/home/antonioborgerees/coding/agentwrap/runtime.go`, `events.go`, `errors.go`, `lifecycle.go`, `metadata.go`, and `ids.go`.
- Discovered local OpenCode binary at `/home/antonioborgerees/.opencode/bin/opencode`.
- Verified structured-output invocation with `opencode run --help`; command exposes `--format` choices `default` and `json`, with `json` described as raw JSON events.
- Implemented `/home/antonioborgerees/coding/agentwrap/opencode` as a dedicated adapter package with constructor/options, compile-time `agentwrap.Runtime` assertion, `os/exec` runner, JSON-line decoder, canonical projector, run handle, bounded stderr diagnostics, strict final-result checks, and gated smoke test.
- Added fixtures under `/home/antonioborgerees/coding/agentwrap/opencode/testdata`: normal, unknown, malformed, partial/no-final, final usage/artifact, and non-zero-exit streams.
- Added deterministic tests for command construction, capabilities, decoder/projector behavior, raw payload preservation, unknown native events, malformed output, missing final result, non-zero exit/stderr bounding, start failure, cancellation, timeout, and gated real OpenCode smoke skip behavior.
- Verification: initial `go test ./...` failed because Go attempted to create build cache under read-only `/home/antonioborgerees/.cache/go-build`; reran with `GOCACHE=/tmp/agentwrap-gocache`.
- Verification: `env GOCACHE=/tmp/agentwrap-gocache go test ./opencode -run TestContextTimeoutClassifiesRunAsTimeout -count=1 -timeout 5s` passed after adding context-driven process cancellation.
- Verification: `env GOCACHE=/tmp/agentwrap-gocache go test ./... -count=1 -timeout 30s` passed for `github.com/antonioborgerees/agentwrap`, `github.com/antonioborgerees/agentwrap/internal/testkit`, and `github.com/antonioborgerees/agentwrap/opencode`.
- Real runtime smoke status: `TestRealOpenCodeSmoke` exists and skips unless `AGENTWRAP_OPENCODE_SMOKE=1` is set. A sandboxed smoke run failed because OpenCode could not run `PRAGMA wal_checkpoint(PASSIVE)` against its SQLite state under the Codex sandbox. The equivalent `opencode run --format json` command succeeded outside the sandbox, matching `ultraplan/cli` behavior.
- Verification: `env GOCACHE=/tmp/agentwrap-gocache AGENTWRAP_OPENCODE_SMOKE=1 go test ./opencode -run TestRealOpenCodeSmoke -count=1 -timeout 5m` passed outside the sandbox for `github.com/antonioborgerees/agentwrap/opencode` in 6.546s.
- Added extended opt-in smoke coverage behind `AGENTWRAP_OPENCODE_SMOKE_SUITE=1`: basic final text, real file creation in a temp workdir, invalid model classified failure, timeout classified failure, and UltraPlan config parity.
- Extended smoke found and fixed an adapter command bug: `exec.Cmd.Dir` alone was insufficient for OpenCode workdir behavior because UltraPlan/OpenCode use the explicit `--dir` flag. The adapter now passes `--dir <RunRequest.WorkDir>` when a workdir is provided, while still setting the subprocess working directory.
- Verification: `env GOCACHE=/tmp/agentwrap-gocache AGENTWRAP_OPENCODE_SMOKE_SUITE=1 AGENTWRAP_OPENCODE_SMOKE_CONFIG=/home/antonioborgerees/coding/ultraplan/cli/opencode-config.json go test ./opencode -run TestRealOpenCodeSmokeSuite -count=1 -timeout 10m` passed outside the sandbox for `github.com/antonioborgerees/agentwrap/opencode` in 20.016s.
- Tightened event debug behavior: blank stdout records now fail as `ErrorMalformedEvent` instead of being ignored, every valid typed native record is emitted as either a mapped canonical event or `EventNativeExtension`, and final result metadata includes `event_count`, `event_categories`, `native_event_types`, and `native_extension_count` for post-run diagnostics.
- Verification: `env GOCACHE=/tmp/agentwrap-gocache go test ./... -count=1 -timeout 30s` passed after stricter blank-record handling and event summary metadata.
- Verification: `env GOCACHE=/tmp/agentwrap-gocache AGENTWRAP_OPENCODE_SMOKE_SUITE=1 AGENTWRAP_OPENCODE_SMOKE_CONFIG=/home/antonioborgerees/coding/ultraplan/cli/opencode-config.json go test ./opencode -run TestRealOpenCodeSmokeSuite -count=1 -timeout 10m` passed outside the sandbox after stricter event handling for `github.com/antonioborgerees/agentwrap/opencode` in 19.100s.
- Test hardening: converted decoder/projector coverage to table-driven tests across known canonical categories, unknown native extension events, malformed JSON, missing type, and non-string type.
- Test hardening: added golden regression snapshots for emitted canonical event shape and final result metadata for normal, unknown/native-extension, and usage/artifact fixture streams.
- Verification: `env GOCACHE=/tmp/agentwrap-gocache go test ./opencode -count=1 -timeout 30s` passed after table-driven and golden regression test additions.
- Verification: `env GOCACHE=/tmp/agentwrap-gocache go test ./... -count=1 -timeout 30s` passed after table-driven and golden regression test additions.
- Scope review: no root SDK API changes were made, no OpenCode-native event structs were exported through the common package, and no retry/fallback, health/config preflight, validation/repair, persistence/dashboard, retained-session operations, or UltraPlan workflow logic was added.
- Decision log updated in `targets/agentwrap/DECISIONS.md` with DEC-007 dedicated OpenCode adapter package, DEC-008 strict structured stream failure semantics, and DEC-009 fixture-first tests with gated real smoke.
