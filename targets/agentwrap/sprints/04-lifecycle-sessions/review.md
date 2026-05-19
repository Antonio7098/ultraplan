# Sprint Review: Lifecycle, Cancellation, Cleanup, and Retained Sessions

## Summary

- **Sprint:** 04-lifecycle-sessions
- **Sprint Date:** 2026-05-18
- **Review Date:** 2026-05-19
- **Target:** agentwrap
- **Files and Packages Examined:**
  - `agentwrap/lifecycle.go` — lifecycle state vocabulary, terminal helper
  - `agentwrap/lifecycle_events.go` — LifecycleEvent/SessionEvent constructors
  - `agentwrap/metadata.go` — CleanupMetadata, SessionAction, SessionRelationship, SessionMetadata
  - `agentwrap/runtime.go` — public Runtime/Run contract, RunRequest.SessionAction, RunMetadata.Cleanup
  - `agentwrap/lifecycle_test.go` — terminal state unit test
  - `agentwrap/lifecycle_events_test.go` — lifecycle/session event payload tests
  - `agentwrap/opencode/runtime.go` — StartRun, Cancel, cleanup, finalResult, lifecycle transition tracking
  - `agentwrap/opencode/process.go` — graceful-then-force Cancel with SIGTERM→wait→Kill
  - `agentwrap/opencode/options.go` — processRunner interface, cleanupResult shape
  - `agentwrap/opencode/runtime_test.go` — 15 test functions covering lifecycle, cancellation, timeout, cleanup, sessions, concurrency
  - `agentwrap/opencode/integration_test.go` — gated real OpenCode smoke suite
  - `agentwrap/opencode/decoder.go` — context-aware native record scanning
  - `agentwrap/opencode/projector.go` — native-to-canonical event projection
  - `agentwrap/opencode/testdata/` — fixtures: normal.ndjson, unknown.ndjson, final.ndjson, malformed.ndjson, partial.ndjson, nonzero.ndjson; golden snapshots
  - `ultraplan/targets/agentwrap/DECISIONS.md` — DEC-010 through DEC-013

## Findings By Decision Area

### Decision Area 1: Lifecycle State Machine And Event Emission

- **Decision:** Run-owned lifecycle transition helpers that emit canonical lifecycle/session events and record final metadata; preserve `RunResult.Status` as primary outcome.
- **Status:** Matches
- **Evidence Check:** Session-lifecycle evidence (explicit state machines), observability evidence (canonical events), and lifecycle.go vocabulary all reflected in implementation.
- **Code Evidence:**
  - `agentwrap/lifecycle_events.go:9-28` — `LifecycleEvent()` constructor
  - `agentwrap/lifecycle_events.go:30-47` — `SessionEvent()` constructor
  - `agentwrap/opencode/runtime.go:346-355` — `emitLifecycle()` transition and event emission
  - `agentwrap/opencode/runtime.go:357-370` — `transitionLifecycle()` tracks actual prior state, prevents invalid transitions
  - `agentwrap/opencode/runtime.go:60-61` — lifecycle initialized to `StateInitialized`
- **Issue:** None.
- **Recommendation:** None.

---

### Decision Area 2: Cancellation And Cleanup Semantics

- **Decision:** Run-owned cleanup path guarded by `sync.Once`; attempt graceful termination, escalate after timeout, record cleanup errors separately; cleanup on every exit path; `Cancel(ctx)` idempotent and timeout-aware.
- **Status:** Matches
- **Evidence Check:** Session-lifecycle scope-bound cleanup, concurrency `sync.Once` and timeout-bounded waits, process graceful-then-force pattern from evidence all implemented.
- **Code Evidence:**
  - `agentwrap/opencode/runtime.go:332-344` — `cleanup()` with `sync.Once` guard, returns `CleanupMetadata`
  - `agentwrap/opencode/runtime.go:174-182` — `Cancel()` emits cancelled lifecycle, calls cleanup
  - `agentwrap/opencode/runtime.go:189-197` — `cancelOnContextDone()` triggers cleanup when context expires
  - `agentwrap/opencode/runtime.go:239-241` — cleanup runs in `run()` after decode loop + process wait
  - `agentwrap/opencode/runtime.go:250-330` — `finalResult()` preserves primary error, adds cleanup errors to `RunMetadata.Errors` separately
  - `agentwrap/opencode/process.go:68-95` — `execProcess.Cancel()`: SIGTERM → 2s wait → Kill
  - `agentwrap/metadata.go:41-46` — `CleanupMetadata` struct with Attempted/Completed/Failed/Error
- **Issue:** `cancelOnContextDone()` at runtime.go:194 uses `context.Background()` with a 2s timeout for cleanup. The sprint plan required "Use caller/cleanup contexts instead of context.Background() for caller-visible cleanup deadlines". However, in the context-done-triggered path, no caller context is available (the parent context was already cancelled). This is an acceptable pragmatic choice, but should be documented.
- **Recommendation:** Add a comment on `cancelOnContextDone` explaining why `context.Background()` is the only available parent in that path. No code change needed.

---

### Decision Area 3: Retained Session Request And Relationship Metadata

- **Decision:** Add minimal runtime-neutral `SessionAction`/`SessionRelationship` vocabulary; reject unsupported operations before process launch; map OpenCode `--session` as best-effort.
- **Status:** Matches
- **Evidence Check:** Session-lifecycle evidence (no true mid-run resume), roadmap requirement for same/forked/fresh/unsupported flows all implemented.
- **Code Evidence:**
  - `agentwrap/metadata.go:47-77` — `SessionAction` (fresh/continue/fork/replace/release) and `SessionRelationship` (fresh/same/forked/replaced/released/unsupported/best_effort) types
  - `agentwrap/runtime.go:44` — `SessionAction` field on `RunRequest`
  - `agentwrap/opencode/runtime.go:492-509` — `validateSessionRequest()` rejects fork/replace/release with `ErrorConfiguration` before any process is launched
  - `agentwrap/opencode/runtime.go:511-547` — `sessionMetadata()` maps requested action to resolved relationship; continue is `SessionRelationshipBestEffort`
  - `agentwrap/opencode/runtime.go:378-385` — `emitSession()` emits canonical session relationship events
  - `agentwrap/opencode/options.go:84-99` — Capabilities report fork/replace/release as unsupported
- **Issue:** None. The implementation correctly avoids over-claiming OpenCode session support and fails fast for unsupported operations.
- **Recommendation:** None.

---

### Decision Area 4: Concurrent Run Isolation

- **Decision:** Keep run-owned state; avoid global registries; add deterministic tests proving cancellation of one run does not affect another.
- **Status:** Matches
- **Evidence Check:** Concurrency evidence (localized goroutine ownership, avoiding shared mutable state) reflected in implementation.
- **Code Evidence:**
  - `agentwrap/opencode/runtime.go:126-158` — `run` struct owns all per-run state: context, process, events channel, done channel, stderr buffer, mutexes, counters
  - `agentwrap/opencode/runtime.go:16` — only package-level mutable state is `runCounter` atomic (ID generation only)
  - `agentwrap/opencode/runtime_test.go:356-383` — `TestCancelOneConcurrentRunDoesNotAffectAnother` proves isolation
- **Issue:** None.
- **Recommendation:** None.

---

### Decision Area 5: Sprint 4 Test And Evaluation Gate

- **Decision:** Deterministic unit/fake-process tests for all lifecycle paths; default `go test ./...` must pass without OpenCode; real smoke is optional.
- **Status:** Matches
- **Evidence Check:** Testing-strategy report (table-driven tests, fake command runners, behavior assertions) reflected.
- **Code Evidence:**
  - `agentwrap/opencode/runtime_test.go:274-290` — `TestCancelClassifiesRunAsCancelled` with lifecycle transition assertions
  - `agentwrap/opencode/runtime_test.go:292-303` — `TestContextTimeoutClassifiesRunAsTimeout`
  - `agentwrap/opencode/runtime_test.go:305-322` — `TestBlockedStdoutTimeoutStaysTimeout`
  - `agentwrap/opencode/runtime_test.go:324-338` — `TestCleanupFailureDoesNotOverwritePrimarySuccess`
  - `agentwrap/opencode/runtime_test.go:340-354` — `TestUnsupportedSessionActionFailsBeforeStart`
  - `agentwrap/opencode/runtime_test.go:356-383` — isolation test
  - `agentwrap/opencode/runtime_test.go:185-214` — golden fixture tests for normal/unknown/final
  - `agentwrap/opencode/integration_test.go` — gated real smoke (suite includes same-session continuation, cancellation, timeout, invalid model)
- **Issue:** No explicit test for double-cancel idempotency at the OpenCode adapter level (noted as low-risk follow-up in the plan).
- **Recommendation:** Add a `TestDoubleCancelIsSafe` test that calls `run.Cancel()` twice and asserts no error on the second call and cleanup is only performed once. Small gap, low risk.

## Pattern And Anti-Pattern Check

### Patterns Followed

| Pattern | Evidence In Code |
|---------|-----------------|
| Explicit state machine | `transitionLifecycle()` at `opencode/runtime.go:357-370` tracks `from` state and enforces valid transitions |
| Context propagation | Work context (`run.ctx`) and cleanup context (derived from caller or Background with timeout) are separate |
| Cleanup context separate from work context | `cleanup()` at runtime.go:332 receives explicit `ctx` parameter; `cancelOnContextDone` at 194 uses a fresh derived context |
| `sync.Once` cleanup guard | `cleanupOnce` at `opencode/runtime.go:139` guards `cleanup()` |
| Timeout-bounded waits | Process Cancel at `process.go:81-86` uses 2s timer before force kill |
| Graceful-then-force termination | `process.go:76` SIGTERM → `process.go:91` Kill after 2s timeout |
| Canonical lifecycle/session events | `lifecycle_events.go` constructors; `emitLifecycle()` and `emitSession()` at runtime.go |
| Fake process tests | `fakeRunner`/`fakeProcess` at `runtime_test.go:19-77`; 15+ test functions use them |
| Per-run state ownership | `run` struct at `runtime.go:126-158` owns all mutable state |

### Anti-Patterns Avoided

| Anti-Pattern | Status | Notes |
|-------------|--------|-------|
| Final-status-only lifecycle | Avoided | Lifecycle events emitted for transitions; `RunResult.Status` preserves primary outcome |
| Cleanup only on success path | Avoided | Cleanup runs on success, decode failure, process error, timeout, cancellation |
| Blocking wait without timeout | Avoided | Process cleanup has 2s timeout; eventual go-routine-level waits are bounded |
| Immediate force kill as only strategy | Avoided | SIGTERM sent first; Kill only after 2s grace period |
| Reattach/resume claims without evidence | Avoided | `SessionRelationshipBestEffort` with explicit `UnsupportedReason` |
| Global active-run mutable state | Avoided | Only `runCounter` atomic is package-level |
| Real runtime dependency in unit tests | Avoided | All default tests use `fakeRunner`/`fakeProcess` |
| Cleanup overwriting primary status | Avoided | `finalResult()` preserves primary status; cleanup errors added to `RunMetadata.Errors` separately |

### Patterns Missed

None. All patterns cited in the evidence and sprint plan are followed.

## Test And Quality Gate Assessment

### Tests Examined

All tests in `agentwrap/opencode/runtime_test.go` (15 tests), plus root package tests in `lifecycle_test.go`, `lifecycle_events_test.go`, `errors_test.go`.

All tests pass (verified via `env GOCACHE=/tmp/agentwrap-gocache go test ./...`).

| Test | Coverage | Status |
|------|----------|--------|
| `TestRunSuccessEmitsCanonicalEventsAndResult` | Normal run: 6 events, lifecycle+session+progress+message+final+lifecycle | Pass |
| `TestRunUnknownEventDoesNotFail` | Unknown native events mapped to native extension | Pass |
| `TestRunProjectsUsageAndArtifacts` | Usage and artifact projection from final.ndjson | Pass |
| `TestRunFixtureGoldenEvents` (3 subtests) | Golden snapshot comparison for normal/unknown/final | Pass |
| `TestRunMalformedFails` | Malformed JSON → ErrorMalformedEvent | Pass |
| `TestRunPartialWithoutFinalFails` | No final result → ErrorRuntimeExit | Pass |
| `TestRunNonZeroExitCapturesStderr` | Non-zero exit + stderr → ErrorRuntimeExit, bounded stderr | Pass |
| `TestStartFailureIsRuntimeUnavailable` | Process start failure → ErrorRuntimeUnavailable | Pass |
| `TestCancelClassifiesRunAsCancelled` | Cancel → cancelled status, lifecycle events | Pass |
| `TestContextTimeoutClassifiesRunAsTimeout` | Timeout → timeout error, failed status | Pass |
| `TestBlockedStdoutTimeoutStaysTimeout` | Blocked stdout + timeout → timeout not cancellation | Pass |
| `TestCleanupFailureDoesNotOverwritePrimarySuccess` | Cleanup error → primary completed, cleanup metadata has ErrorCleanup | Pass |
| `TestUnsupportedSessionActionFailsBeforeStart` | Fork action → config error, process not started | Pass |
| `TestCancelOneConcurrentRunDoesNotAffectAnother` | Cancel run1 → cancelled, run2 completes normally | Pass |
| `TestCapabilities` | Structured events + raw payloads supported, sessions unsupported | Pass |
| `TestLifecycleTerminalStates` | Terminal helper correctness | Pass |
| `TestLifecycleEventPayload` | Lifecycle event payload shape | Pass |
| `TestSessionEventPayload` | Session event payload shape | Pass |

### Quality Gates (from roadmap)

| Gate | Status | Evidence |
|------|--------|----------|
| Cancellation of one run cannot affect unrelated runs | Met | `TestCancelOneConcurrentRunDoesNotAffectAnother` |
| Cleanup failures are visible and separate from primary run failures | Met | `TestCleanupFailureDoesNotOverwritePrimarySuccess`; `CleanupMetadata` on `RunResult` |
| Retained session behavior is explicit in events and metadata | Met | `SessionMetadata`, `SessionAction`, `SessionRelationship` types; session events; capability reporting |
| No leaked workers/processes/sessions observed in tests | Met | Concurrent isolation test asserts `CancelCount() > 0` on cancelled run; all fake process goroutines complete |

### Deferrals

| Deferral | Justification | Impact |
|----------|--------------|--------|
| Real OpenCode same-session continuation smoke | No live provider/auth environment was available; `AGENTWRAP_OPENCODE_SMOKE_SUITE=1` test exists but not run by default | Continuation remains best-effort |
| Process-group termination | OS-specific; current implementation terminates owned process only | If OpenCode spawns child processes, they may not be cleaned up |
| Explicit double-cancel adapter test | Low risk because `sync.Once` and `context.CancelFunc` idempotency make it safe | No test coverage for this specific path |

## Decisions Needing Log Update

None. The following Sprint 4 decisions are already recorded in `DECISIONS.md`:

- **DEC-010** (Primary Run Status And Cleanup Outcome Are Separate) — `DECISIONS.md:149-160`
- **DEC-011** (OpenCode Session Continuation Is Best-Effort Unless Verified) — `DECISIONS.md:161-172`
- **DEC-012** (Silent OpenCode Runs Must Respect SDK Timeouts) — `DECISIONS.md:173-183`
- **DEC-013** (Lifecycle Events Track Actual Run State) — `DECISIONS.md:185-196`

No new durable decisions were made during implementation that are not already captured.

## Overall Assessment

### Findings Summary

| Area | Status |
|------|--------|
| Decision 1: Lifecycle state machine | Matches |
| Decision 2: Cancellation and cleanup | Matches With Caveats (see Issue below) |
| Decision 3: Retained sessions | Matches |
| Decision 4: Concurrent isolation | Matches |
| Decision 5: Test coverage | Matches With Caveats (see Issue below) |
| Pattern compliance | All patterns followed, all anti-patterns avoided |
| Quality gates | All met |

### Issues

1. **Minor:** `cancelOnContextDone()` at `opencode/runtime.go:194` uses `context.Background()` — this is the only available parent when the caller's context is already done, but the choice could be documented. The plan required caller-visible cleanup deadlines, but in this codepath no caller context is available. Low risk.

2. **Low/Minor:** No explicit double-cancel test at the adapter level (noted in plan as low-risk follow-up).

### Verdict

**Approve With Follow-ups**

### Blocking Issues

None.

### Follow-ups

1. Add `TestDoubleCancelIsSafe` to verify idempotency at the adapter level (sprint plan noted this as a follow-up).
2. Document the `context.Background()` usage in `cancelOnContextDone` with a brief comment explaining why no caller context is available in that path.
3. Carry forward the process-group termination risk and OpenCode same-session verification to Sprint 5 or later.

### Risk Carry-Forward

| Risk | Impact | Mitigation |
|------|--------|------------|
| OpenCode `--session` continuation not live-verified | Session metadata may claim best-effort continuation that does not work in practice | Documented as best-effort; `AGENTWRAP_OPENCODE_SMOKE_SUITE` gated test exists for verification |
| Process-group termination not implemented | OpenCode child processes may leak if OpenCode spawns subprocesses | Current implementation terminates owned process; follow-up if leakage appears |
