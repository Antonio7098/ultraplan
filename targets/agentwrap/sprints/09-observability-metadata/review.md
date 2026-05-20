# Sprint 9 Review: Observability, Metadata, and Persistence Hooks

## Summary

- **Sprint reviewed:** 09-observability-metadata
- **Files examined:**
  - `targets/agentwrap/sprints/09-observability-metadata/plan.md` (sprint plan)
  - `targets/agentwrap/sprints/09-observability-metadata/reasoning.md` (sprint reasoning)
  - `targets/agentwrap/sources/PRD.md`, `targets/agentwrap/sources/TRD.md`
  - `targets/agentwrap/DECISIONS.md`, `targets/agentwrap/roadmap.md`
  - `targets/agentwrap/reports/study-index.md`
  - `targets/agentwrap/reports/evidence/observability-metadata.md`
  - `targets/agentwrap/reports/permission-based-agent-wrapping.md`
  - `studies/opencode-wrap-study/reports/final/04-workflow-composition-and-observability.md`
  - `studies/go-cli-study/reports/final/10-logging-observability.md`
  - `studies/go-cli-study/reports/final/14-performance.md`
  - `studies/go-cli-study/reports/final/15-philosophy.md`
  - `agentwrap/observability.go`, `agentwrap/observability_test.go`
  - `agentwrap/metadata.go`, `agentwrap/events.go`, `agentwrap/lifecycle.go`
  - `agentwrap/permissions.go`, `agentwrap/validation.go`
  - `agentwrap/doc.go`, `agentwrap/README.md`
- **Review date:** 2026-05-20

## Findings By Decision Area

### Decision 1: Run Records Are SDK Snapshots Built From Existing Metadata

- **Status:** Matches
- **Evidence Check:** The `RunRecord` type (`observability.go:18-50`) mirrors the decision: it embeds/reuses existing `AttemptSummary`, `PermissionMetadata`, `ValidationMetadata`, `RepairMetadata`, `Usage`, `CostEstimate` types rather than creating parallel structures. The `Status` field is projected from events via `statusFromPayload`. Unknown numeric values (usage tokens, throughput) remain nil pointer types as the evidence requires.
- **Code Evidence:** `RunRecord` at `observability.go:18-50`; `EventSummary` at `observability.go:52-59`; `statusFromPayload` at `observability.go:553-560`; `applyEventLocked` at `observability.go:312-342`.
- **Issue:** None found. The record model is exactly what the decision describes.
- **Recommendation:** None.

### Decision 2: Event Sinks And Stores Live Behind A Runtime-Neutral Observer Wrapper

- **Status:** Matches
- **Evidence Check:** `ObservingRuntime` (`observability.go:120-126`) wraps any `Runtime`, drains canonical events via `forward()` (line 247-259), fans out to named `EventSink` implementations with required/best-effort distinction, and updates a `RunStore` if configured. This directly follows the Sprint 8 `ValidatingRuntime` wrapper pattern as the decision intended.
- **Code Evidence:** `ObservingRuntime` at `observability.go:120-126`; `NamedEventSink` at `observability.go:128-133`; `forward()` at `observability.go:247-259`; `appendRecord()` at `observability.go:292-310` (sink fan-out and failure recording).
- **Issue:** None. The wrapper pattern is followed correctly.
- **Recommendation:** None.

### Decision 3: Persistence Is Optional And Backend-Neutral

- **Status:** Matches
- **Evidence Check:** `RunStore` interface (`observability.go:102-109`) is small (5 methods: `UpsertRun`, `AppendEvent`, `ListActiveRuns`, `GetCompletedRun`, `ListRunEvents`). `MemoryRunStore` (`observability.go:408-487`) is the only implementation. No SQLite or file backend ships. No store is required for `ObservingRuntime` to function.
- **Code Evidence:** `RunStore` interface at `observability.go:102-109`; `MemoryRunStore` at `observability.go:408-487`; `NewMemoryRunStore` at `observability.go:416-422`.
- **Issue:** None. Backend neutrality is preserved.
- **Recommendation:** None.

### Decision 4: Permission Audit And Raw Payload Persistence Are Safe By Default

- **Status:** Matches
- **Evidence Check:** Raw payload handling in `eventRecord()` (`observability.go:261-290`) defaults to omitting unsafe raw data and storing omission metadata. Permission audit records are merged from result metadata in `mergeResultLocked()` (`observability.go:366`). Required sink failures propagate to `Wait` via `mergeRequiredObserverError`.
- **Code Evidence:** Raw payload redaction at `observability.go:277-288`; permission merge at `observability.go:366`; `PersistencePolicy` at `observability.go:92-94`; required failure propagation at `observability.go:489-504`.
- **Issue:** None. The implementation respects `RawPayload.Safe` semantics and does not persist unsafe raw bytes by default.
- **Recommendation:** None.

### Decision 5: Sprint 9 Remains SDK-Only Despite Roadmap Residue

- **Status:** Matches
- **Evidence Check:** No CLI commands, executable `status/inspect`, or command surface was added. The public surface is solely SDK types and interfaces in the root package. The roadmap residue is acknowledged in the sprint reasoning as stale.
- **Code Evidence:** No `cmd/` or executable additions. All new code is in `agentwrap/observability.go` and `agentwrap/observability_test.go`.
- **Issue:** None.
- **Recommendation:** None.

## Pattern And Anti-Pattern Check

### Patterns Followed

| Pattern | Evidence Source | Implementation |
|---------|----------------|----------------|
| Canonical events as dashboard source | observability-metadata.md, 04-workflow-composition-and-observability.md | `RunEventRecord` captures canonical event fields; `EventSink` receives ordered events; inspection APIs expose records |
| Durable projection without backend lock-in | 04-workflow-composition-and-observability.md | `RunStore` interface + `MemoryRunStore` ref impl; no default SQLite/file store chosen |
| Structured diagnostics separate from debug logs | 10-logging-observability.md | Event records are structured (`RunEventRecord` fields); raw payload presence/omission is explicit metadata |
| Bounded/explicit sink behavior | 14-performance.md | Required vs best-effort sinks; failures recorded as `SinkFailure`; required failures change `Wait` outcome |
| Artifact-first metadata | 04-workflow-composition-and-observability.md | `withProducerMetadata()` attaches source run/provider/model to artifacts |
| Safe permission audit records | permission-based-agent-wrapping.md | `PermissionAudit` from metadata preserved in records; no unsafe raw payloads in persisted data |
| Event ordering and sequence integrity | 04-workflow-composition-and-observability.md, 14-performance.md | Per-run monotonic `Sequence` via `sync/atomic.Int64`; events stored in order via `MemoryRunStore.AppendEvent` |

### Anti-Patterns Avoided

| Anti-Pattern | Notes |
|-------------|-------|
| Log parsing for dashboards | Events are canonical; no log scraping |
| Adapter-local storage | `ObservingRuntime` is a wrapper; adapters stay storage-agnostic |
| SDK-owned DAG/dashboard | No dashboard, DAG, or workflow orchestration logic |
| Mandatory SQLite | No default durable backend; only in-memory reference store |
| Unsafe raw payload persistence | `RawOmitted=true` by default for unsafe payloads |
| Unknown cost as zero | `Usage` uses `*int64` fields; `EstimatedCost` is `*CostEstimate` |
| Roadmap residue expanding scope | `status/inspect` executable is explicitly excluded |

### Patterns Missed

None. All patterns the sprint was expected to follow are present.

## Test And Quality Gate Assessment

### Tests Examined

| Test | Status | Notes |
|------|--------|-------|
| `TestMemoryRunStoreActiveCompletedAndEventOrdering` | Pass | Tests active→completed transition, parent relationship, event ordering |
| `TestObservingRuntimeStoresRecordsAndOmitsUnsafeRawPayload` | Pass | Tests record completion, usage, artifact producer metadata, raw payload omission |
| `TestObservingRuntimeRequiredSinkFailureChangesWaitError` | Pass | Required sink failure surfaces as `SDKError` from `Wait` |
| `TestObservingRuntimeBestEffortSinkFailureIsRecorded` | Pass | Best-effort failure preserved in `SinkFailures`; `Wait` returns primary outcome |
| `TestMemoryRunStoreConcurrentRunIsolation` | Pass | 20 concurrent run upserts/events no data loss or contamination |

**Test gaps noted:**
- No explicit test for `RunEventRecord` raw payload safe=true path (when `RawPayload.Safe` is true, data should be persisted)
- No slow/drop accounting test (explicitly deferred in sprint plan)
- No permission audit completeness test through the observing wrapper specifically (permission audit is merged from metadata, which is tested at the store level)

### Quality Gates

| Gate | Status | Evidence |
|------|--------|----------|
| Progress dashboard data exists | ✅ Met | `RunRecord` with status, timing, runtime context, latest event, attempts, warnings; `ListActiveRuns` API |
| Completed run inspection exists | ✅ Met | `RunRecord` with final metadata; `GetCompletedRun` API |
| Provider/model artifact provenance exists | ✅ Met | `withProducerMetadata()` at `observability.go:576-598` |
| Permission audit is complete | ✅ Met | `Permissions` field in `RunRecord`; audit records merged from `RunMetadata` |
| Estimates are safe | ✅ Met | `Usage` uses `*int64`; `EstimatedCost` is `*CostEstimate`; nil means unknown |
| Persistence is optional | ✅ Met | `RunStore` is nil-able; `ObservingRuntime` works without store |
| Event ordering is testable | ✅ Met | `Sequence` field on `RunEventRecord`; ordering verified in tests |
| Raw payloads safe by default | ✅ Met | Unsafe raw bytes omitted; omission metadata recorded |
| SDK scope preserved | ✅ Met | No CLI surface; all additions are SDK types/interfaces |

### Deferrals

| Deferral | Justification |
|----------|---------------|
| Slow sink / drop accounting | Current wrapper does not drop observed events; deferred until high-frequency caller pressure |
| Durable backend selection | TRD explicitly avoids prescribing storage technology; production durability is caller-owned |
| Real OpenCode smoke | Sprint 9 did not change OpenCode adapter behavior |

## Decisions Needing Log Update

None. The sprint plan's execution evidence lists DEC-027 through DEC-030 as added, and these four decisions accurately capture the durable choices made during implementation.

Minor observation: The `ObservingRuntime` type's `ListActiveRuns`, `GetCompletedRun`, and `ListRunEvents` methods delegate to the store. This means `ObservingRuntime` itself partially implements `RunInspector`. If this is intentional as a convenience, it is consistent with the plan's sub-task 2.4. No new decision entry is required.

## Overall Assessment

- **Verdict:** Approve
- **Blocking issues:** None
- **Follow-ups:**
  - Consider adding a test for the safe raw payload path (when `Raw{ Safe:true }`, data is persisted)
  - Consider adding a permission audit completeness test specifically through `ObservingRuntime`
- **Risk carry-forward:**
  - High-frequency event persistence may become a bottleneck for long-running runs with many token-delta events. The current synchronous sink/store calls are explicit but could block event forwarding. Deferred to caller pressure.
  - `ObservingRuntime` wraps a `Runtime` but does not compose with `ValidatingRuntime` or `PolicyRunner` at the type level. Product code must compose wrappers manually. This is acceptable at this stage.
