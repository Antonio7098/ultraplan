# Sprint Reasoning: Lifecycle, Cancellation, Cleanup, and Retained Sessions

> Target: agentwrap
> Sprint ID: 04-lifecycle-sessions
> Output: `targets/agentwrap/sprints/04-lifecycle-sessions/reasoning.md`
> Sprint Tracker: `targets/agentwrap/sprints/04-lifecycle-sessions/plan.md`
> Evidence Bundle: `targets/agentwrap/reports/sprint-evidence/04-lifecycle-sessions.txt`

## Overview

**Sprint:** Lifecycle, Cancellation, Cleanup, and Retained Sessions
**Purpose:** Make started runtime work observable and controlled across starting, running, cancellation, timeout, process exit, cleanup, and retained-session requests, with cleanup failures reported separately from primary run failures.
**Roadmap Section:** `targets/agentwrap/roadmap.md` - `## Sprint 4: Lifecycle, Cancellation, Cleanup, and Retained Sessions`
**Depends On:** Sprint 2 public runtime contract and lifecycle vocabulary; Sprint 3 OpenCode adapter, process runner seam, structured event projection, stderr diagnostics, and strict final-result failure semantics.
**Reasoning Status:** Ready For Tracker

## Target Sources

- `targets/agentwrap/sources/PRD.md` - start/monitor/cancel/inspect runtime work, retain runtime context across workflows where supported, cancellation/process cleanup, active-run metadata, and product-agnostic boundary.
- `targets/agentwrap/sources/TRD.md` - explicit run/session lifecycle, one-shot and session-based follow-up work, retained-session operations, caller cancellation, owned resource cleanup on all exit paths, cleanup failures separate from primary failures, concurrency isolation, and retained-session relationship metadata.
- `targets/agentwrap/sources/feature-architecture.md` - state-first flow used to assign ephemeral process/run state to the runtime adapter and pure lifecycle/session translation to small logic helpers.
- `targets/agentwrap/roadmap.md` - Sprint 4 goal, scope, output, evidence inputs, non-scope, and quality gate.

## Evidence Basis

**Evidence Bundle:** `targets/agentwrap/reports/sprint-evidence/04-lifecycle-sessions.txt`
**Evidence Status:** Complete and used. Generated on 2026-05-18 with `study evolve --final-only --top-sources 1`.
**Context Strategy:** Staged loading used. The bundle is 3,923 lines and 281,242 characters. Planning loaded the PRD/TRD/feature protocol/roadmap sprint section, all evidence pack sections, selected final-report sections for lifecycle, state/context, concurrency, observability metadata, and testing, plus current agentwrap code references. Per-source reports were not opened because final reports and direct code inspection were specific enough for Sprint 4 planning.

### Evidence Packs Used

- `targets/agentwrap/reports/evidence/session-lifecycle.md` - informs explicit run/session state, retained-session metadata, cancellation, cleanup, malformed event lifecycle failures, and concurrent run isolation.
- `targets/agentwrap/reports/evidence/observability-metadata.md` - informs caller-visible events and metadata for status, duration, warnings, errors, session relationship, cleanup result, and diagnostic separation.
- `targets/agentwrap/reports/evidence/testing-strategy.md` - informs fake-runtime-first coverage for cancellation, timeout, cleanup failure, retained-session unsupported behavior, and no worker/process leaks.

### Final Reports Used

- `studies/opencode-wrap-study/reports/final/02-process-session-lifecycle.md` - supports explicit state machines, scope-bound cleanup, deferred completion, graceful-then-force signal escalation, session reaper cautions, and limited best-effort resume.
- `studies/go-cli-study/reports/final/07-state-context.md` - supports context propagation, signal-context wiring, explicit session structs, cleanup contexts separate from work contexts, and avoiding hidden global state.
- `studies/go-cli-study/reports/final/08-concurrency.md` - supports localized goroutine ownership, timeout-bounded waits, `sync.Once` cleanup guards, race protection, and avoiding fire-and-forget work.
- `studies/go-cli-study/reports/final/14-performance.md` - supports streaming and bounded data structures rather than buffering unbounded process output or events.
- `studies/opencode-wrap-study/reports/final/04-workflow-composition-and-observability.md` - supports canonical events and metadata as the dashboard/audit surface, and warns against pulling DAG/workflow composition into the runtime wrapper.
- `studies/go-cli-study/reports/final/10-logging-observability.md` - supports separating user-facing status from diagnostics and keeping observability sinks optional.
- `studies/go-cli-study/reports/final/11-testing-strategy.md` - supports table-driven tests, fake/stub command runners, fixtures, integration gates, and behavior-focused lifecycle assertions.

### Per-Source Reports Used

- None in full. The final reports and current code references answered the Sprint 4 decisions. If implementation discovers an OpenCode-specific retained-session ambiguity, inspect the OpenCode or t3code per-source lifecycle report narrowly and cite the added evidence in execution notes.

### Code References Used

- `/home/antonioborgerees/coding/agentwrap/runtime.go:8` - public `Runtime` starts runs and reports capabilities.
- `/home/antonioborgerees/coding/agentwrap/runtime.go:14` - public `Run` exposes `Events`, `Wait`, and `Cancel`, which Sprint 4 must make lifecycle-safe.
- `/home/antonioborgerees/coding/agentwrap/runtime.go:22` - `RunRequest` already carries `SessionID`, `TurnID`, `Timeout`, `WantSession`, and `RequireCaps`.
- `/home/antonioborgerees/coding/agentwrap/runtime.go:44` - `RunResult` already carries final status, metadata, artifacts, warnings, usage, timing, and classified error.
- `/home/antonioborgerees/coding/agentwrap/lifecycle.go:3` - public lifecycle vocabulary includes cleanup, cancellation, timeout-adjacent failure states, and terminal-state helper.
- `/home/antonioborgerees/coding/agentwrap/metadata.go:17` - `RunMetadata` already has status, timing, session metadata, warnings, errors, usage, and native metadata slots.
- `/home/antonioborgerees/coding/agentwrap/metadata.go:35` - `SessionMetadata` currently captures retained, continued, forked, replaced, and unsupported capability indicators but lacks an explicit fresh-session relationship marker.
- `/home/antonioborgerees/coding/agentwrap/opencode/runtime.go:20` - OpenCode `StartRun` owns context, timeout, process, event channel, stderr capture, and background goroutines.
- `/home/antonioborgerees/coding/agentwrap/opencode/runtime.go:131` - current `Cancel` directly calls process cancel and returns cancellation failure as `ErrorCancellation`, not separate cleanup failure.
- `/home/antonioborgerees/coding/agentwrap/opencode/runtime.go:144` - context cancellation currently calls process cancel with `context.Background()`, so cleanup can hang or ignore caller cleanup deadline.
- `/home/antonioborgerees/coding/agentwrap/opencode/runtime.go:149` - run goroutine closes event/done channels and waits for process and stderr, but does not yet emit full lifecycle/cleanup events.
- `/home/antonioborgerees/coding/agentwrap/opencode/runtime.go:192` - final result merges primary failure status with metadata but cleanup is not represented separately.
- `/home/antonioborgerees/coding/agentwrap/opencode/runtime.go:223` - current retained-session metadata marks full retained lifecycle unsupported as a Sprint 4 deferral.
- `/home/antonioborgerees/coding/agentwrap/opencode/process.go:48` - process wait is guarded with `sync.Once`, a useful pattern to preserve for single completion.
- `/home/antonioborgerees/coding/agentwrap/opencode/process.go:66` - process cancel currently force-kills immediately rather than graceful-then-force terminating with visible cleanup outcome.

### Evidence Rejected Or Not Used

- **Retry/fallback policy evidence in resilience reports:** Not used for execution decisions because Sprint 4 keeps retry policy simple/manual and Sprint 6 owns full policy composition.
- **Durable event projection and persistence details:** Not used as an implementation requirement because Sprint 8 owns persistence hooks and historical inspection. Sprint 4 should emit metadata/events that persistence can later consume.
- **Session reaper for long-lived servers:** Not planned as MVP Sprint 4 implementation. Reapers are useful for server-managed many-session processes, but this sprint should first make each owned run cleanup explicit and testable.
- **Mid-run resume and reattach mechanisms:** Treated as cautionary evidence, not copied. The lifecycle report says none of the studied systems achieve true mid-run state transfer; Sprint 4 should not promise it.
- **Workflow/DAG observability patterns:** Rejected for this sprint because roadmap and product requirements keep UltraPlan workflow composition outside the SDK.

## Requirement Map

### Requirement Index Used In This Sprint

| Requirement | Source | Area | Applicability | Why It Matters For This Sprint |
| --- | --- | --- | --- | --- |
| Start, monitor, cancel, and inspect agent runtime work | PRD Product Goal 1 | Runtime control | Applicable | This sprint hardens cancellation, status, final result, and cleanup visibility for active runs. |
| Retain runtime context across workflows where supported | PRD Primary Use Cases; PRD Runtime Abstraction | Sessions | Applicable | Sprint 4 must make retained-session behavior explicit for same-session, forked, fresh, and unsupported flows. |
| Explicit lifecycle states including cancelled and cleaned up | TRD Run and Session Lifecycle | State model | Applicable | The public vocabulary exists, but Sprint 4 must make transitions observable and hard to misuse. |
| One-shot runs and session-based follow-up work | TRD Run and Session Lifecycle | Session behavior | Applicable | The adapter must distinguish one-shot runs from session-continuation requests without pretending unsupported features work. |
| Caller can continue, reuse, fork, release, or replace retained sessions where supported | TRD Run and Session Lifecycle | Retained sessions | Applicable | Sprint 4 should represent these operations and return unsupported metadata/errors when the runtime cannot perform them. |
| Cancellation must attempt to stop all owned runtime work and release owned resources | TRD Run and Session Lifecycle | Cancellation | Applicable | Current OpenCode cancellation force-kills but does not expose cleanup result or ensure all owned goroutines are accounted for. |
| Cleanup on success, failure, timeout, cancellation, and caller shutdown | TRD Run and Session Lifecycle | Cleanup | Applicable | Cleanup must be a first-class lifecycle phase, not best-effort hidden inside defers. |
| Cleanup failures separately from primary run failures | TRD Run and Session Lifecycle; Error Model | Error behavior | Applicable | A successful run with cleanup failure and a failed run with additional cleanup failure must be distinguishable. |
| Multiple concurrent runs isolated per run | TRD Concurrency | Concurrency | Applicable | Cancellation or cleanup of one run must not cancel unrelated runs or shared state. |
| Active-run status and structured events suitable for dashboards | TRD Observability; PRD Observability and Metadata | Observability | Applicable | Lifecycle and cleanup transitions should be emitted as canonical events and summarized in metadata. |
| Keep retry policy simple/manual | Roadmap Sprint 4 Scope | Non-scope | Applicable | The sprint can preserve parent/session relationship fields but must not build full retry/fallback orchestration. |

### Applicable Requirements

- **Explicit lifecycle transitions:** The implementation must emit and record starting/running/waiting/final/cleanup/cancelled/failed states from a single run-owned state machine.
- **Caller cancellation and timeout:** `Cancel(ctx)` and `RunRequest.Timeout` must propagate to the process and event-stream goroutines, then return/record classified cancellation or timeout behavior.
- **Cleanup on every exit path:** Success, decode failure, process exit failure, timeout, cancellation, and caller shutdown must all execute one cleanup path protected against double invocation.
- **Separate cleanup failure surface:** Cleanup errors should use `ErrorCleanup` in metadata and events without overwriting the primary result error unless cleanup is the only failure.
- **Retained-session metadata:** Requests to continue/reuse/fork/release/replace must be reflected as same-session, forked-session, fresh-session, replacement, release, or unsupported metadata/events.
- **Concurrent isolation:** Run-specific context, goroutines, events, stderr buffers, process handles, and session metadata must not be shared across runs except through explicit caller-provided IDs.
- **Fixture-first confidence:** Fake process/runtime tests must prove cancellation, timeout, cleanup failure, unsupported retained sessions, and leak checks without requiring OpenCode.

### Non-Applicable Requirements

- **Health checks and configuration validation:** Sprint 5 owns runtime/provider/model readiness, fail-fast preflight, and effective configuration inspection.
- **Retry, fallback, and backoff policy orchestration:** Sprint 6 owns composable policy evaluation and attempt orchestration. Sprint 4 may record parent/session relationship fields but should not choose retry policy.
- **Output validation and repair:** Sprint 7 owns validators, repair prompts, and validation-informed same-session repair.
- **Persistence, durable event stores, dashboards, and historical inspection:** Sprint 8 owns storage hooks and read models. Sprint 4 should provide in-memory events/metadata suitable for later persistence.
- **Session reaper or server-wide session registry:** Useful later for long-lived service mode, but not required before run-owned cleanup is correct.
- **Mid-run resume after host restart:** Evidence says studied systems only restore connection metadata or best-effort session context; Sprint 4 should not promise full in-flight state transfer.
- **UltraPlan workflow semantics:** Study, synthesis, sprint planning, scoring, DAGs, and report templates stay outside the SDK.

### Ambiguous Or Conflicting Requirements

- **Retained-session operation vocabulary:** TRD names continue, reuse, fork, release, and replace, while current `RunRequest` only has `SessionID` and `WantSession`. Sprint 4 should add the smallest runtime-neutral request/metadata vocabulary needed to represent these actions, or document unsupported behavior clearly if implementation keeps request shape unchanged.
- **Fresh-session metadata:** Roadmap requires representing fresh-session flows, while current `SessionMetadata` has retained/continued/forked/replaced/unsupported but no explicit fresh marker. Adding a small enum-like field may be warranted if implementation evidence confirms boolean fields are ambiguous.
- **Cleanup status as terminal state:** `StateCleanedUp` is terminal in the current public vocabulary. The plan must decide whether final `RunResult.Status` should remain primary outcome (`completed`, `failed`, `cancelled`) while cleanup is event/metadata, or whether cleanup replaces the final status. Replacing the primary outcome would hide success/failure, so Sprint 4 should prefer preserving primary status and recording cleanup separately.
- **Cancel return semantics:** `Cancel(ctx)` can fail to clean up while the run may still settle as cancelled. Sprint 4 should make `Cancel` return immediate cleanup-attempt failure where known and also place cleanup failure in final metadata.

### Open Questions

- What exact runtime-neutral shape should express retained-session actions: a new `SessionAction` field on `RunRequest`, an options struct, or metadata-only interpretation of `SessionID` and `WantSession`?
- Should cleanup status live as a dedicated metadata field, a lifecycle event payload, or both? The plan expects both event and metadata, but implementation should avoid making `RunResult.Status` lose the primary outcome.
- Does OpenCode's `--session` behavior continue the same session reliably enough to mark `SessionMetadata.Continued`, or should Sprint 4 keep OpenCode continuation as best-effort/native metadata until verified?
- Should process cancellation target the process group on Unix in Sprint 4? Evidence strongly suggests yes, but implementation must handle cross-platform behavior without breaking tests.

## Sprint Decision Analysis

### Decision Area 1: Lifecycle State Machine And Event Emission

**Problem:** The public lifecycle vocabulary exists, but current run implementations infer state mostly from final result paths. Sprint 4 needs a single source of truth for state transitions that callers can observe and tests can assert.

**Requirements Applied**
- TRD requires explicit lifecycle states and caller-visible monitoring.
- PRD requires products to monitor many active runtime instances by status, elapsed time, latest event, warnings, and final state.
- Roadmap Sprint 4 requires modeling explicit run/session lifecycle transitions.

**Evidence Applied**
- Session-lifecycle evidence says robust lifecycle requires explicit state representation visible to callers and state transitions as events.
- Observability evidence says products should build progress views from canonical events, not logs.
- Current `LifecycleState` at `/home/antonioborgerees/coding/agentwrap/lifecycle.go:3` gives stable state vocabulary, but OpenCode `run` at `/home/antonioborgerees/coding/agentwrap/opencode/runtime.go:149` does not yet emit comprehensive lifecycle/cleanup transitions.

**Options Considered**
- **Option A:** Add run-owned lifecycle transition helpers that update state, emit canonical lifecycle/session events, and append metadata consistently.
- **Option B:** Keep lifecycle as final `RunResult.Status` only, relying on native OpenCode events for progress.
- **Option C:** Make `StateCleanedUp` replace the final primary status after cleanup succeeds.

**Chosen Approach**
- Use Option A. Each run should own a small state machine or transition helper. It should emit canonical lifecycle events for starting/running/waiting/cancelling/cancelled/failed/completed/cleaning_up/cleaned_up-equivalent transitions and record final metadata. `RunResult.Status` should preserve the primary outcome, while cleanup status is recorded separately in event payload/metadata.

**Decision Justification**
- Option A satisfies monitoring and audit requirements without adding workflow orchestration.
- Option B leaves callers unable to observe cancellation/cleanup state reliably.
- Option C makes final results harder to reason about because a failed run that cleaned up successfully would appear only as cleaned up.
- The accepted tradeoff is a little more adapter/runtime bookkeeping now to prevent scattered state updates later.

**Execution Notes**
- Keep the transition helper runtime-neutral if it benefits fake and OpenCode runtimes, but do not introduce a large framework.
- Include previous state, next state, reason, operation, and timestamp in lifecycle event payloads where practical.
- If a native final event and local process status disagree, keep the strict failure behavior from Sprint 3 and emit/record a classified failure.

**Expected Evidence**
- **Tests:** Unit tests for legal/terminal lifecycle transitions; OpenCode fake-process tests asserting event order for success, malformed failure, timeout, cancellation, and cleanup failure.
- **Runtime Evidence:** Canonical lifecycle events and final metadata show primary status plus cleanup outcome.
- **Review Checks:** Review confirms state is not inferred from logs and `RunResult.Status` still communicates primary run outcome.

---

### Decision Area 2: Cancellation And Cleanup Semantics

**Problem:** Cancellation must stop owned runtime work and release resources on every exit path. Current OpenCode cancellation force-kills immediately and does not separately report cleanup failure.

**Requirements Applied**
- TRD requires cancellation from the caller, cleanup on success/failure/timeout/cancellation/shutdown, and cleanup failures surfaced separately.
- TRD concurrency requirements say cancellation of one run must not cancel unrelated runs.
- Roadmap quality gate requires no leaked workers/processes/sessions in tests.

**Evidence Applied**
- Session-lifecycle report recommends scope-bound cleanup, explicit `Kill()` plus wait group in Go, graceful-then-force signal escalation, and cancellation that reaches subprocesses.
- State/context report recommends separating cleanup context from work context so cleanup can complete after main cancellation.
- Concurrency report recommends `sync.Once` for one-time cleanup and timeout-bounded wait operations.
- Current OpenCode process uses `sync.Once` for `Wait` at `/home/antonioborgerees/coding/agentwrap/opencode/process.go:48`, but `Cancel` at `/home/antonioborgerees/coding/agentwrap/opencode/process.go:66` force-kills immediately.

**Options Considered**
- **Option A:** Add a run-owned cleanup path guarded by `sync.Once`; cancel work context, attempt graceful process termination, escalate after a timeout, wait for stdout/stderr goroutines, and record cleanup errors separately.
- **Option B:** Keep `exec.CommandContext` and process `Kill()` as the only cleanup mechanism.
- **Option C:** Build a full shared process/session manager and session reaper now.

**Chosen Approach**
- Use Option A. Sprint 4 should deepen the existing process runner seam with cleanup/termination results and timeout-aware graceful-then-force behavior, but keep ownership local to each run.

**Decision Justification**
- Option A directly satisfies cleanup and no-leak requirements while keeping implementation reviewable.
- Option B cannot distinguish primary run failure from cleanup failure and gives no graceful shutdown window.
- Option C is premature before retained session behavior and persistence are proven; evidence warns reapers are for long-lived managers and have race/interval tradeoffs.
- The accepted tradeoff is adapter-local lifecycle work before a generalized session manager exists.

**Execution Notes**
- Cleanup should run after normal completion, decode failure, process error, timeout, cancellation, and failed start where a process was acquired.
- Use a cleanup-specific context/deadline rather than `context.Background()` for process cancellation paths.
- On Unix, prefer process-group termination if implementation can do it without harming cross-platform tests; otherwise record process-group kill as an explicit follow-up.
- `Cancel(ctx)` should be idempotent and safe after terminal state.

**Expected Evidence**
- **Tests:** Fake process tests for graceful cancel success, graceful timeout then force kill, cancel error, cleanup error after successful run, cleanup error after primary failure, double cancel, wait after cancel, and wait timeout.
- **Runtime Evidence:** Final metadata includes cleanup attempted/completed/failed and any `ErrorCleanup` without losing the primary error.
- **Review Checks:** Review confirms no `context.Background()` is used for caller-visible cleanup deadlines and no cleanup path can block forever.

---

### Decision Area 3: Retained Session Request And Relationship Metadata

**Problem:** The SDK must represent same-session, forked-session, fresh-session, replacement, release, and unsupported flows, but current request/metadata only partially expresses retained-session intent.

**Requirements Applied**
- PRD requires retaining runtime context across related workflow steps when supported.
- TRD requires one-shot and session-based follow-up work, explicit continue/reuse/fork/release/replace operations where supported, and metadata when retention is unsupported.
- Roadmap Sprint 4 requires retained-session metadata and behavior where supported, plus same/forked/fresh/unsupported flows.

**Evidence Applied**
- Session-lifecycle report says none of the studied repos achieve true mid-run state transfer; wrappers should only restore connection/session metadata and avoid overclaiming.
- Runtime-contract evidence treats session as a central entity but supports runtime-specific capabilities and raw/native metadata escape hatches.
- Current `RunRequest` has `SessionID` and `WantSession` at `/home/antonioborgerees/coding/agentwrap/runtime.go:22`; current `SessionMetadata` has retained, continued, forked, replaced, and unsupported fields at `/home/antonioborgerees/coding/agentwrap/metadata.go:35`.
- Current OpenCode adapter passes `--session` when `SessionID` is present at `/home/antonioborgerees/coding/agentwrap/opencode/runtime.go:75` and marks full retained lifecycle unsupported at `/home/antonioborgerees/coding/agentwrap/opencode/runtime.go:223`.

**Options Considered**
- **Option A:** Add a minimal runtime-neutral session relationship/action vocabulary and use it in request, metadata, session events, and capabilities, while mapping unsupported operations to explicit `UnsupportedCapability` or classified errors.
- **Option B:** Treat any non-empty `SessionID` as same-session continuation and `WantSession` as retention, with no new fields.
- **Option C:** Build a retained-session manager that stores and reuses sessions across workflows.

**Chosen Approach**
- Use Option A if implementation confirms current booleans are ambiguous. Keep it minimal: enough to express one-shot, fresh retained session, continue/reuse same session, fork from session, replace session, release session, and unsupported. Do not implement a durable session registry.

**Decision Justification**
- Option A satisfies the roadmap's representation requirement and avoids silent guessing.
- Option B cannot represent fresh-session or forked-session flows clearly enough for dashboards and future policy decisions.
- Option C belongs after persistence and policy hooks, not before run-owned lifecycle is correct.
- The accepted tradeoff is small public surface growth in Sprint 4 to prevent downstream ambiguity.

**Execution Notes**
- Capabilities should distinguish structured events/raw payloads/cancellation from retained-session actions that are supported, best-effort, or unsupported.
- OpenCode continuation with `--session` should be marked continued only if tests or smoke evidence confirm the native behavior; otherwise mark requested session ID plus best-effort/native metadata and unsupported detail.
- Unsupported session actions should fail before launching a process when the caller explicitly requires them via capabilities or action fields.
- Session lifecycle events should include requested action, resolved relationship, requested session ID, produced session ID, and unsupported reason where applicable.

**Expected Evidence**
- **Tests:** Fake runtime and OpenCode adapter tests for fresh retained session, same-session request, unsupported fork/release/replace, required unsupported capability failure before process start, and metadata/event payloads.
- **Runtime Evidence:** `RunResult.Metadata.Session` and canonical `EventSession` events identify session relationship without parsing adapter-native metadata.
- **Review Checks:** Review confirms no claim of mid-run resume or cross-workflow persistence is made.

---

### Decision Area 4: Concurrent Run Isolation And Leak Prevention

**Problem:** Sprint 4 must prove cancellation and cleanup are per-run. Shared counters, process runners, goroutines, or channels must not let one run cancel or corrupt another.

**Requirements Applied**
- TRD concurrency requires multiple concurrent runs, isolated run state, retained session isolation unless explicitly linked, and no leaked workers/sessions/processes/handles/event streams.
- Roadmap quality gate says cancellation of one run cannot affect unrelated runs and no leaks are observed in tests.

**Evidence Applied**
- Concurrency report recommends localized goroutine launch sites, timeout-bounded waits, `sync.Once` cleanup, and protecting shared state with mutexes or atomics.
- State/context report warns against global mutable state and context stored in long-lived structs without ownership discipline.
- Current OpenCode run owns event channel, done channel, stderr buffer, process, context, and mutex at `/home/antonioborgerees/coding/agentwrap/opencode/runtime.go:88`, which is a good baseline; global `runCounter` at `/home/antonioborgerees/coding/agentwrap/opencode/runtime.go:16` should remain ID-only.

**Options Considered**
- **Option A:** Keep run-owned state and add explicit cleanup accounting/test hooks to prove per-run goroutines and processes exit; avoid global registries.
- **Option B:** Add a global active-run registry now for cancellation and inspection.
- **Option C:** Let process exit clean up goroutines implicitly without dedicated leak tests.

**Chosen Approach**
- Use Option A. Sprint 4 should keep each run self-contained and add deterministic tests for independent cancellation and cleanup. Active-run stores are later observability/persistence scope.

**Decision Justification**
- Option A satisfies isolation with the smallest surface area.
- Option B risks introducing shared mutable state before persistence and dashboard requirements are planned.
- Option C fails the roadmap's no-leak quality gate.
- The accepted tradeoff is test-only instrumentation or fakes to verify cleanup rather than a production registry.

**Execution Notes**
- Avoid package-level mutable state beyond atomic ID generation and immutable defaults.
- Use buffered events carefully so cancellation cannot deadlock on a caller that stopped reading; if needed, make send paths context-aware.
- Ensure `Events()` closes exactly once after the run settles and cleanup metadata has been emitted or recorded.

**Expected Evidence**
- **Tests:** Start two fake OpenCode runs; cancel one; assert the other completes and its events/results are intact. Tests should assert all fake process callbacks/goroutines reached completion.
- **Runtime Evidence:** Per-run event sequences and metadata remain isolated by run ID/session ID.
- **Review Checks:** Review confirms no global active-run mutable map is introduced without a later persistence/inspection design.

---

### Decision Area 5: Sprint 4 Test And Evaluation Gate

**Problem:** Lifecycle bugs are mostly failure-path bugs. The sprint needs deterministic evidence before relying on real OpenCode behavior.

**Requirements Applied**
- Roadmap output requires tests for cancellation, timeout, process exit, cleanup failure, and retained-session unsupported behavior.
- Testing evidence pack says fake runtimes and structured fixtures should precede real runtime tests and every sprint should evaluate against the same study dimensions.
- TRD acceptance criteria require a product can cancel an active run and observe cleanup completion or cleanup failure.

**Evidence Applied**
- Testing-strategy report recommends table-driven tests, fake/stub command runners, functional options for test configuration, fixture extraction, behavior assertions, and integration gating.
- Current OpenCode tests already use fake process runner and fixtures, giving a local pattern to extend.

**Options Considered**
- **Option A:** Add deterministic unit/fake-process tests for all lifecycle paths, plus retain the existing gated real OpenCode smoke only as optional confirmation.
- **Option B:** Depend on the real OpenCode smoke to validate lifecycle behavior.
- **Option C:** Test only public final status, not event order or cleanup metadata.

**Chosen Approach**
- Use Option A. Default `go test ./...` must cover lifecycle and retained-session semantics without OpenCode installed. The real smoke may be extended or explicitly deferred for session continuation if provider/auth setup is unavailable.

**Decision Justification**
- Option A follows the evidence and avoids external flakiness.
- Option B would make CI dependent on runtime installation and provider setup.
- Option C would miss the central Sprint 4 risks: event ordering, cleanup failure separation, and cancellation isolation.
- The accepted tradeoff is more fake process machinery to make edge cases reproducible.

**Execution Notes**
- Tests should assert behavior and public outputs, not implementation internals, except for fake process counters used to prove cleanup.
- Keep integration gates explicit via environment variable/build tag and record any deferral reason in the tracker.
- Update docs/comments where public session or cleanup semantics change.

**Expected Evidence**
- **Tests:** Default `go test ./...` covering cancellation, timeout, process exit, cleanup failure, same/fresh/unsupported session metadata, event ordering, and concurrent isolation.
- **Runtime Evidence:** Optional gated smoke documents whether OpenCode same-session continuation was verified or deferred.
- **Review Checks:** Review confirms tests would fail if cleanup failure overwrote primary error, if cancellation leaked to another run, or if unsupported session actions launched a process.

## Deviations

| Requirement | Deviation | Reason | Risk | Disposition | Follow-up |
| --- | --- | --- | --- | --- | --- |
| Retained sessions across workflows | No durable session registry or persistence in Sprint 4 | Sprint 8 owns persistence and historical inspection; evidence cautions against premature session managers | Retained-session behavior remains per-run/request and may be best-effort | Temporary | Revisit in Sprint 8 with persistence hooks |
| Continue/reuse/fork/release/replace where supported | Unsupported operations may fail before launch or be metadata-only for OpenCode if native behavior is unverified | Current OpenCode evidence only proves `--session` argument construction, not complete retained-session semantics | Callers may need to handle unsupported retained-session actions explicitly | Temporary | Verify OpenCode same-session behavior through gated smoke or source evidence |
| Cleanup terminal state | Final `RunResult.Status` should preserve primary outcome rather than always become `cleaned_up` | Preserving primary success/failure/cancelled status is more useful to callers; cleanup is separate metadata/event | Some callers may expect `StateCleanedUp` as final status | Intentional | Document cleanup status semantics in code/docs |

## Cross-Cutting Reasoning

### Major Decision Summary

- **Run-owned lifecycle state machine:** Required by TRD lifecycle and PRD monitoring; supported by lifecycle and observability evidence.
- **Idempotent cleanup with graceful-then-force termination:** Required by TRD cancellation/cleanup; supported by process lifecycle, state/context, and concurrency evidence.
- **Explicit retained-session relationship metadata:** Required by PRD/TRD retained-session behavior and roadmap same/fork/fresh/unsupported scope; constrained by evidence that true mid-run resume is not available.
- **Per-run isolation over global registry:** Required by TRD concurrency and roadmap quality gate; supported by concurrency evidence and existing run-owned OpenCode state.
- **Fixture-first lifecycle tests:** Required by roadmap output and testing evidence; builds on existing Sprint 3 fake process tests.

### Tradeoffs

- **Primary status plus cleanup metadata instead of final `cleaned_up` status:** Preserves caller understanding of success/failure while still exposing cleanup. Cost: cleanup state needs a clear metadata/event shape.
- **Small public session vocabulary over metadata-only inference:** Prevents ambiguous same/fresh/fork flows. Cost: possible public surface growth.
- **Adapter-local cleanup over shared session manager:** Keeps scope narrow and testable. Cost: active-run registry and orphan reaper remain deferred.
- **Strict unsupported session behavior over silent fallback:** Makes capability differences explicit. Cost: callers must handle unsupported operations.

### Assumptions

- Sprint 3 OpenCode adapter and tests are the current implementation baseline.
- The SDK remains library-first; no CLI or UltraPlan workflow behavior should be added.
- Default tests must not require OpenCode installed, authenticated, or configured.
- OpenCode session continuation is not assumed complete until implementation verifies it.
- Cleanup may require OS-specific process behavior; tests should keep cross-platform logic explicit.

### Dependencies

- Sprint 2 lifecycle, metadata, error, and runtime contract types.
- Sprint 3 OpenCode process runner, fake runner tests, strict structured output handling, and gated smoke path.
- Existing evidence bundle `targets/agentwrap/reports/sprint-evidence/04-lifecycle-sessions.txt`.

### Risks

- **Cleanup failure could hide primary run failure:** Mitigate by storing cleanup errors separately in metadata/events and preserving primary `RunResult.Err`.
- **Cancellation can deadlock if event sends block:** Mitigate with context-aware send or bounded/closed channels tested under non-reading consumers.
- **OpenCode `--session` semantics may be weaker than required:** Mitigate by marking behavior best-effort or unsupported unless verified.
- **Process-group termination may be OS-specific:** Mitigate with platform-specific files/tests or conservative default with documented follow-up.
- **Public session action vocabulary could overfit OpenCode:** Mitigate by keeping action names from TRD/roadmap and capability-gating unsupported actions.

## Tracker Guidance

Use this reasoning to write `targets/agentwrap/sprints/04-lifecycle-sessions/plan.md`.

The tracker must include:

- scope focused on lifecycle transitions, cancellation, cleanup, cleanup-failure separation, retained-session metadata, and concurrent isolation
- non-scope excluding retry/fallback policy, health/config checks, validation/repair, persistence/dashboard stores, session reaper, and UltraPlan workflows
- execution tasks derived from the five decision areas
- tests and evidence expectations for each lifecycle failure path
- risks, assumptions, open questions, and deviations carried forward
- success criteria that prove cleanup is visible and cancellation cannot affect unrelated runs

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

- `agentwrap` package docs/comments - document cleanup status semantics if Sprint 4 adds cleanup metadata or session action types.
- `agentwrap/opencode` package docs/comments - document cancellation, cleanup, retained-session support level, and gated smoke behavior.
- `targets/agentwrap/DECISIONS.md` - add only implementation-confirmed public lifecycle/session decisions during execution, not planning assumptions.
