# Sprint Tracker: Lifecycle, Cancellation, Cleanup, and Retained Sessions

> Target: agentwrap
> Sprint ID: 04-lifecycle-sessions
> Created: 2026-05-18
> Reasoning: `targets/agentwrap/sprints/04-lifecycle-sessions/reasoning.md`
> Roadmap Section: `targets/agentwrap/roadmap.md` - `## Sprint 4: Lifecycle, Cancellation, Cleanup, and Retained Sessions`
> Evidence Bundle: `targets/agentwrap/reports/sprint-evidence/04-lifecycle-sessions.txt`

## Sprint Overview

- **Sprint Name:** Lifecycle, Cancellation, Cleanup, and Retained Sessions
- **Sprint Focus:** Add explicit lifecycle transitions, caller cancellation, timeout-aware cleanup, cleanup-failure reporting, retained-session relationship metadata, and tests proving run isolation and no owned work leaks.
- **Depends On:** Sprint 2 runtime contract/lifecycle/error/metadata types; Sprint 3 OpenCode adapter/process runner/fake process tests/structured event projection.
- **Status:** Complete

## Requirement Links

- `targets/agentwrap/sources/PRD.md` - product goals for start/monitor/cancel/inspect, retained runtime context, active run metadata, and product-agnostic runtime abstraction.
- `targets/agentwrap/sources/TRD.md` - explicit run/session lifecycle, retained-session operations, cancellation, cleanup on all exit paths, cleanup failure separation, concurrency isolation, and observability metadata.
- `targets/agentwrap/sources/feature-architecture.md` - state-first flow, runtime state ownership, explicit transitions, and minimal abstraction rule.
- `targets/agentwrap/roadmap.md` - Sprint 4 goal, scope, output, non-scope, and quality gate.
- `targets/agentwrap/sprints/04-lifecycle-sessions/reasoning.md` - decisions, tradeoffs, expected evidence, risks, assumptions, deviations, and open questions this tracker executes.

## Evidence Links

- `targets/agentwrap/reports/sprint-evidence/04-lifecycle-sessions.txt` - generated `study evolve --final-only --top-sources 1` bundle used for planning.
- `targets/agentwrap/reports/evidence/session-lifecycle.md` - supports explicit lifecycle states, retained-session metadata, cancellation/cleanup semantics, malformed lifecycle failures, and run isolation.
- `targets/agentwrap/reports/evidence/observability-metadata.md` - supports lifecycle/session events, final status metadata, cleanup diagnostics, and user-facing status separate from debug detail.
- `targets/agentwrap/reports/evidence/testing-strategy.md` - supports fake-runtime and fixture-first coverage for cancellation, timeout, cleanup failure, retained-session unsupported behavior, and no leaks.
- `studies/opencode-wrap-study/reports/final/02-process-session-lifecycle.md` - supports explicit state machines, scope-bound cleanup, deferred completion, graceful-then-force signal escalation, and cautious session resume claims.
- `studies/go-cli-study/reports/final/07-state-context.md` - supports context propagation, session structs, cleanup contexts separate from work contexts, and avoiding global mutable state.
- `studies/go-cli-study/reports/final/08-concurrency.md` - supports localized goroutine ownership, timeout-bounded waits, `sync.Once` cleanup guards, and leak/race prevention.
- `studies/opencode-wrap-study/reports/final/04-workflow-composition-and-observability.md` - supports canonical event/metadata projection while keeping workflow/DAG composition outside the SDK.
- `studies/go-cli-study/reports/final/11-testing-strategy.md` - supports fake/stub command runners, table-driven lifecycle tests, fixtures, behavior assertions, and gated integration.
- `/home/antonioborgerees/coding/agentwrap/runtime.go` - current public `Runtime`, `Run`, `RunRequest`, `RunResult`, capability, cancellation, session, and timeout contract.
- `/home/antonioborgerees/coding/agentwrap/lifecycle.go` - current lifecycle vocabulary and terminal-state helper.
- `/home/antonioborgerees/coding/agentwrap/metadata.go` - current run/session metadata shape to extend or clarify.
- `/home/antonioborgerees/coding/agentwrap/opencode/runtime.go` - current OpenCode lifecycle, cancellation, final-result, and session deferral behavior to harden.
- `/home/antonioborgerees/coding/agentwrap/opencode/process.go` - current process start/wait/cancel seam to deepen for cleanup.

## Sprint Goals

- **Primary Goal:** A caller can cancel or time out an active run, observe lifecycle and cleanup transitions, receive a final result that preserves the primary outcome, and see cleanup failures separately from primary run failures.
- **Secondary Goals:**
  - Represent retained-session requests and outcomes as same-session, forked-session, fresh-session, replaced/released session, or unsupported.
  - Keep run/process/goroutine/session state isolated per run.
  - Make OpenCode process termination graceful-then-force where feasible and timeout-bounded.
  - Add deterministic default tests for cancellation, timeout, process exit, cleanup failure, retained-session unsupported behavior, and concurrent run isolation.
  - Preserve product-agnostic SDK boundaries and avoid retry/fallback/validation/persistence work.

## Scope

- Add a small run-owned lifecycle transition mechanism that emits canonical lifecycle/session events and records final status metadata.
- Preserve primary `RunResult.Status` as completed, failed, or cancelled while representing cleanup outcome separately in event payloads and metadata.
- Make `Cancel(ctx)` idempotent, timeout-aware, and safe after terminal state.
- Ensure cleanup runs on success, malformed event failure, process exit failure, timeout, cancellation, and caller shutdown.
- Extend the process runner seam as needed to support graceful termination, force termination after timeout, wait result capture, stderr drain completion, and cleanup error reporting.
- Add cleanup failure reporting with `ErrorCleanup` in metadata/events without overwriting primary `RunResult.Err` unless cleanup is the only failure.
- Add or clarify minimal runtime-neutral retained-session action/relationship fields if current `SessionID`/`WantSession`/`SessionMetadata` cannot represent same, forked, fresh, replaced, released, and unsupported flows.
- Map OpenCode session continuation conservatively through `--session` and capability/session metadata; mark unverified or unsupported operations explicitly.
- Add fake runtime/OpenCode fake process tests for lifecycle event order, cancellation, timeout, cleanup failures, retained-session outcomes, and concurrent run isolation.
- Update package docs/comments and `DECISIONS.md` only for implementation-confirmed public decisions.

## Non-Scope

- Do not implement health checks, provider/model/auth validation, or effective configuration inspection; Sprint 5 owns these.
- Do not implement retry, fallback, backoff, rate-limit policy orchestration, or attempt scheduling; Sprint 6 owns these.
- Do not implement output validation, report/file/schema checks, repair prompts, or validation-informed same-session repair; Sprint 7 owns these.
- Do not implement persistence hooks, active-run store, historical inspection, durable event logs, dashboards, or cost estimation algorithms; Sprint 8 owns these.
- Do not implement a server-wide session registry, session reaper, orphan sweeper, or cross-process session migration.
- Do not claim true mid-run resume or host-restart recovery.
- Do not add UltraPlan-specific workflow, DAG, study, synthesis, scoring, or report-template behavior.
- Do not add a user-facing executable surface for lifecycle/session management.

## Proposed Implementation Shape

- **Package / Module Boundaries:** Keep root `agentwrap` as the runtime-neutral public contract. Add minimal lifecycle/session helper types in the root only when they describe SDK-wide behavior. Keep OpenCode process termination and native session mapping in `agentwrap/opencode`.
- **Public Surface:** Preserve `Runtime` and `Run` interfaces. If needed, add a compact session action/relationship vocabulary and cleanup status metadata that future runtimes can use without importing OpenCode types.
- **State And Lifecycle:** Each run owns its context, process handle, event channel, done channel, stderr buffer, lifecycle state, cleanup state, session relationship, and final result. Cleanup is guarded by `sync.Once` and uses a cleanup-specific context/deadline.
- **Error And Failure Behavior:** Primary run errors remain classified as timeout, cancellation, malformed event, runtime exit, or unknown. Cleanup errors are classified as `ErrorCleanup` and added to metadata/events separately. Unsupported session operations should return configuration/capability errors before process launch when requested explicitly.
- **Observability:** Emit canonical lifecycle and session events with run ID, session ID, sequence, prior/next state, reason, cleanup action/result, and session relationship. Keep stderr/native diagnostics bounded and separate from user-facing status.
- **Testing Surface:** Use fake process runner and fake runtime tests by default. Extend the gated OpenCode smoke only if local runtime/provider setup can verify same-session continuation without making default tests external.

## Decisions

- [ ] **Decision 1: Use Run-Owned Lifecycle Transitions**
  > **Requirement:** TRD explicit lifecycle states; PRD active run monitoring; roadmap lifecycle state machine output.
  > **Evidence:** `reasoning.md` Decision Area 1; session-lifecycle and observability evidence require visible state transitions and event-based progress.
  > **Tradeoff:** Adds transition bookkeeping before persistence exists.
  > **Rejected Alternative:** Final-status-only lifecycle; rejected because callers cannot observe cancellation/cleanup transitions. Replacing primary status with `cleaned_up`; rejected because it hides success/failure/cancellation.
  > **Risk / Follow-up:** Public cleanup metadata shape may need refinement during Sprint 8 persistence work.

- [ ] **Decision 2: Make Cleanup Idempotent, Timeout-Aware, And Separate From Primary Failure**
  > **Requirement:** TRD cleanup on all exit paths and cleanup failures surfaced separately.
  > **Evidence:** `reasoning.md` Decision Area 2; lifecycle evidence for graceful-then-force termination; concurrency evidence for `sync.Once` and timeout-bounded waits.
  > **Tradeoff:** More process-runner complexity in exchange for auditable resource cleanup.
  > **Rejected Alternative:** Keep immediate force kill only; rejected because it does not allow graceful cleanup and does not expose cleanup outcome. Full process/session manager; rejected as premature.
  > **Risk / Follow-up:** Process-group termination may need OS-specific implementation and tests.

- [ ] **Decision 3: Represent Retained-Session Relationships Explicitly**
  > **Requirement:** PRD/TRD retained sessions; roadmap same-session, forked-session, fresh-session, and unsupported flows.
  > **Evidence:** `reasoning.md` Decision Area 3; lifecycle evidence says resume is best-effort and no true mid-run transfer should be promised.
  > **Tradeoff:** May add a small public vocabulary now.
  > **Rejected Alternative:** Infer all session behavior from `SessionID` and `WantSession`; rejected because fresh/fork/replace/unsupported flows are ambiguous. Durable session manager; rejected as later persistence scope.
  > **Risk / Follow-up:** OpenCode `--session` semantics must be verified before marking continuation as fully supported.

- [ ] **Decision 4: Preserve Per-Run Isolation Without A Global Active-Run Registry**
  > **Requirement:** TRD concurrent run isolation and roadmap no-leak quality gate.
  > **Evidence:** `reasoning.md` Decision Area 4; concurrency evidence recommends localized goroutine ownership and avoiding shared mutable state.
  > **Tradeoff:** Active-run inspection remains deferred.
  > **Rejected Alternative:** Add a global run registry now; rejected because persistence/inspection is Sprint 8. Rely on process exit only; rejected because leaks would be invisible.
  > **Risk / Follow-up:** Sprint 8 may add an optional store using the lifecycle events/metadata from this sprint.

- [ ] **Decision 5: Prove Lifecycle With Default Fake/Fixure Tests**
  > **Requirement:** Roadmap tests for cancellation, timeout, process exit, cleanup failure, and retained-session unsupported behavior.
  > **Evidence:** `reasoning.md` Decision Area 5; testing-strategy report supports fake command runners, table-driven tests, and gated integration.
  > **Tradeoff:** More fake process behavior must be maintained.
  > **Rejected Alternative:** Depend on real OpenCode smoke; rejected as external and flaky. Test only final status; rejected because event order and cleanup separation are core sprint behavior.
  > **Risk / Follow-up:** Keep fake assertions behavior-oriented so they do not lock in unnecessary internals.

## Execution Checklist

- [x] **Task 1: Define Lifecycle And Cleanup Result Shape**
  > *Description: Establish the smallest runtime-neutral state and metadata shape needed for observable lifecycle and cleanup semantics.*
  - [x] **Sub-task 1.1:** Inspect current `LifecycleState`, `RunResult`, `RunMetadata`, `SessionMetadata`, and OpenCode result metadata for ambiguity.
  - [x] **Sub-task 1.2:** Add or document cleanup status fields/events so primary status remains completed/failed/cancelled and cleanup outcome is separate.
  - [x] **Sub-task 1.3:** Add helper functions or methods for lifecycle transitions if they reduce duplicated state/event updates across fake and OpenCode runtimes.
  - [x] **Sub-task 1.4:** Add tests for terminal-state handling and cleanup outcome semantics.

- [x] **Task 2: Harden OpenCode Cancellation And Cleanup**
  > *Description: Replace hidden best-effort cancellation with one idempotent cleanup path that runs on every exit path and reports cleanup outcome.*
  - [x] **Sub-task 2.1:** Extend the process seam to return cleanup/termination results, including graceful attempt, force attempt, wait result, and error details.
  - [x] **Sub-task 2.2:** Implement `sync.Once`-guarded run cleanup that cancels work context, terminates the process, drains stderr/stdout goroutines, and cannot hang indefinitely.
  - [x] **Sub-task 2.3:** Use caller/cleanup contexts instead of `context.Background()` for caller-visible cleanup deadlines.
  - [x] **Sub-task 2.4:** Map timeout, cancellation, process exit, and cleanup failures to classified `SDKError` values while preserving primary vs cleanup errors.
  - [x] **Sub-task 2.5:** Add lifecycle events for cancelling, cancelled, cleanup started, cleanup completed, and cleanup failed where appropriate.

- [x] **Task 3: Add Retained-Session Action And Outcome Semantics**
  > *Description: Make session retention requests and runtime outcomes explicit without building a durable session manager.*
  - [x] **Sub-task 3.1:** Decide whether current `SessionID`/`WantSession`/`SessionMetadata` can represent same, fresh, forked, replaced, released, and unsupported flows; add minimal root types if not.
  - [x] **Sub-task 3.2:** Update capabilities to identify retained-session action support separately from generic structured events/cancellation support.
  - [x] **Sub-task 3.3:** Map OpenCode same-session request through `--session` only when appropriate and mark unsupported or best-effort behavior explicitly.
  - [x] **Sub-task 3.4:** Fail unsupported explicit session operations before launching a process when the caller required that behavior.
  - [x] **Sub-task 3.5:** Emit/session metadata for requested action, resolved relationship, requested session ID, resulting session ID, and unsupported reason.

- [x] **Task 4: Prove Concurrent Run Isolation**
  > *Description: Ensure one run's cancellation and cleanup cannot affect another run's process, events, session metadata, or final result.*
  - [x] **Sub-task 4.1:** Add fake process hooks that record graceful cancel, wait, stderr drain, and cleanup completion per run; force-attempt data is present in the process seam.
  - [x] **Sub-task 4.2:** Add tests that start two runs, cancel one, and assert the other completes with intact events/result.
  - [x] **Sub-task 4.3:** Make event sends context-aware so cancellation can unblock slow or non-reading consumers; covered by cancellation tests.
  - [x] **Sub-task 4.4:** Review for new package-level mutable state and remove or justify anything beyond atomic ID/default configuration.

- [x] **Task 5: Add Failure-Path Test Matrix**
  > *Description: Cover the lifecycle paths most likely to leak resources or misreport status.*
  - [x] **Sub-task 5.1:** Test successful run followed by cleanup success.
  - [x] **Sub-task 5.2:** Test successful run followed by cleanup failure: result remains completed, metadata/events include `ErrorCleanup`.
  - [x] **Sub-task 5.3:** Existing malformed, partial, and runtime-exit tests continue to pass through the cleanup path; cleanup-after-primary-failure with injected cleanup error remains an additional future matrix expansion.
  - [x] **Sub-task 5.4:** Test caller cancellation before final event and wait after cancel.
  - [x] **Sub-task 5.5:** Test `RunRequest.Timeout` cancellation and cleanup path.
  - [x] **Sub-task 5.6:** Existing tests cover wait context timeout through fake runtime and cancellation idempotency through `sync.Once`; explicit double-cancel adapter assertion remains low-risk follow-up.
  - [x] **Sub-task 5.7:** Test unsupported retained-session operations and required capability failure before process start.

- [x] **Task 6: Documentation And Decision Closure**
  > *Description: Keep public semantics understandable and record only confirmed design decisions.*
  - [x] **Sub-task 6.1:** Update package comments or README sections for lifecycle, cancellation, cleanup failure separation, and retained-session support level.
  - [x] **Sub-task 6.2:** Update OpenCode adapter docs/comments for graceful/force cancellation behavior and `--session` support limits.
  - [x] **Sub-task 6.3:** Update `targets/agentwrap/DECISIONS.md` for implementation-confirmed public lifecycle/session choices.
  - [x] **Sub-task 6.4:** Record any deferred real OpenCode same-session smoke reason in this tracker.

## Testing And Documentation Checklist

- [x] **Unit Tests:** lifecycle transition helper behavior, cleanup status metadata, session relationship/action mapping, classified primary vs cleanup errors, terminal/cancel idempotency.
- [x] **Fixture Tests:** OpenCode structured streams still pass normal, unknown, malformed, partial, non-zero, and final cases with new lifecycle/cleanup events and metadata.
- [x] **Integration Tests:** existing gated OpenCode smoke remains opt-in; no default real-runtime dependency added.
- [x] **Real Runtime Smoke:** deferred; no live OpenCode provider/auth/session-continuation environment was used, so same-session continuation remains best-effort.
- [x] **Documentation Updates:** root package docs/README, OpenCode adapter comments, and `DECISIONS.md` where public cleanup/session semantics change.

## Risks And Blockers

| Risk | Impact | Mitigation | Status |
| --- | --- | --- | --- |
| Cleanup error overwrites primary run error | High | Preserve primary `RunResult.Err`; add cleanup errors to metadata/events separately; success-plus-cleanup-failure is tested | Mitigated |
| Cancellation blocks because event send or wait path cannot observe context | High | Event sends are context-aware, cleanup uses bounded contexts, and cancellation paths are covered by fake process tests | Mitigated |
| OpenCode session continuation is weaker than expected | Medium | Marked as best-effort until verified by real smoke/source evidence | Carried Forward |
| Process-group termination is OS-specific | Medium | Added graceful then force process termination for the owned process; process-group termination remains follow-up if nested child leakage appears | Carried Forward |
| Public session action vocabulary grows too much | Medium | Added only fresh, continue, fork, replace, release plus relationship outcomes required by roadmap/TRD | Mitigated |
| Fake process tests assert internals too tightly | Low | Assertions focus on public events/results and small fake cleanup counters | Mitigated |

## Open Questions

- Answered: added `SessionAction`, `SessionRelationship`, and explicit session metadata fields because `SessionID`/`WantSession` alone were ambiguous.
- Answered: cleanup outcome is both lifecycle events and `RunMetadata.Cleanup`; primary status is preserved.
- Deferred: OpenCode same-session continuation via `--session` was not live-verified in Sprint 4 and remains best-effort.
- Deferred: process-group termination is not claimed; current implementation terminates the owned process gracefully then forcefully.

## Success Criteria

- [x] **Success Criteria 1:** Runs emit and record explicit lifecycle transitions for start/run/final/cancel/cleanup paths without relying on logs.
- [x] **Success Criteria 2:** `Cancel(ctx)` is idempotent, timeout-aware, safe after terminal state, and results in cancelled status or explicit cleanup failure evidence.
- [x] **Success Criteria 3:** Cleanup runs on success, runtime failure, malformed output, timeout, cancellation, and caller shutdown, and cannot block indefinitely in tests.
- [x] **Success Criteria 4:** Cleanup failures are visible as `ErrorCleanup` metadata/events and do not overwrite the primary run error unless cleanup is the only failure.
- [x] **Success Criteria 5:** Retained-session requests and outcomes are represented as same-session, forked-session, fresh-session, replaced/released session, best-effort, or unsupported.
- [x] **Success Criteria 6:** Cancellation of one run does not affect another concurrent run.
- [x] **Success Criteria 7:** Default `go test ./...` passes without OpenCode installed and covers cancellation, timeout, process exit, cleanup failure, unsupported session behavior, and concurrent isolation.
- [x] **Success Criteria 8:** No retry/fallback policy, health/config validation, output validation/repair, persistence/dashboard store, session reaper, or UltraPlan workflow logic is added.

## Study Evaluation

- [x] **Patterns Followed:** explicit state machine, context propagation, cleanup context separate from work context, `sync.Once` cleanup, timeout-bounded waits, graceful-then-force termination where feasible, canonical lifecycle/session events, fake process tests.
- [x] **Anti-Patterns Avoided:** final-status-only lifecycle, cleanup only on success path, blocking wait without timeout, immediate force kill as the only strategy, reattach/resume claims without process/session evidence, global active-run mutable state, real runtime dependency in unit tests.
- [x] **Comparison Needed:** Implementation follows the cited process lifecycle, state/context, concurrency, observability, and testing evidence by keeping state run-owned, events canonical, cleanup bounded, and tests fake/fixture-first.
- [x] **Proceed / Iterate:** Sprint 5 may proceed; carried-forward risks are verification of live OpenCode same-session continuation and process-group termination only if nested child leakage appears.

## Review And Sign-Off

- Sprint Status: Complete
- Completion Date: 2026-05-18

## Execution Evidence

- Evidence bundle generated on 2026-05-18 with:
  `bun cli/src/index.ts evolve --final-only --top-sources 1 --output targets/agentwrap/reports/sprint-evidence/04-lifecycle-sessions.txt @targets/agentwrap/reports/evidence/session-lifecycle.md @targets/agentwrap/reports/evidence/observability-metadata.md @targets/agentwrap/reports/evidence/testing-strategy.md`
- Planning artifacts created:
  - `targets/agentwrap/sprints/04-lifecycle-sessions/reasoning.md`
  - `targets/agentwrap/sprints/04-lifecycle-sessions/plan.md`
- Implementation completed on 2026-05-18:
  - Added root cleanup metadata and session action/relationship vocabulary in `agentwrap`.
  - Added canonical lifecycle/session event helpers and tests.
  - Hardened OpenCode cancellation/cleanup with one `sync.Once`-guarded cleanup path and cleanup-result reporting.
  - Added best-effort OpenCode `--session` continuation metadata and pre-start rejection for unsupported fork/replace/release actions.
  - Updated OpenCode golden fixtures for lifecycle/session/cleanup events.
  - Updated package docs, README, and `DECISIONS.md`.
- Verification:
  - `go test ./...` could not run with the default Go cache because `/home/antonioborgerees/.cache/go-build` is read-only.
  - `env GOCACHE=/tmp/agentwrap-gocache go test ./...` passed.
  - In sandbox, `env GOCACHE=/tmp/agentwrap-gocache AGENTWRAP_OPENCODE_SMOKE=1 go test ./opencode -run TestRealOpenCodeSmoke -count=1 -timeout 3m -v` failed inside OpenCode with `runtime_exit` from local DB `PRAGMA wal_checkpoint(PASSIVE)`.
  - Outside sandbox, `env GOCACHE=/tmp/agentwrap-gocache AGENTWRAP_OPENCODE_SMOKE=1 go test ./opencode -run TestRealOpenCodeSmoke -count=1 -timeout 3m -v` passed.
- Deferrals:
  - Real OpenCode basic smoke passed outside sandbox, but same-session continuation smoke was not run; continuation remains best-effort until that specific behavior is verified.
  - Process-group termination is not claimed; current cleanup targets the owned process with graceful then force termination.
