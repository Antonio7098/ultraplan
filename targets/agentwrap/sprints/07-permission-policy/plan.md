# Sprint Tracker: Initialization-Time Permission Policy

> Target: agentwrap
> Sprint ID: 07-permission-policy
> Created: 2026-05-20
> Reasoning: `targets/agentwrap/sprints/07-permission-policy/reasoning.md`
> Roadmap Section: `targets/agentwrap/roadmap.md` - `## Sprint 7: Initialization-Time Permission Policy`

## Sprint Overview

- **Sprint Name:** Initialization-Time Permission Policy
- **Sprint Focus:** Add runtime-neutral permission policy primitives, OpenCode config translation, preflight classification, and permission audit events/metadata.
- **Depends On:** Sprints 0-6 runtime contract, OpenCode adapter, lifecycle/session handling, health/config, and resilience policy behavior.
- **Status:** Complete

## Requirement Links

- `targets/agentwrap/sources/PRD.md` - permissions and blocking states, caller-defined permission handling, non-interactive operation, metadata, product-agnostic SDK boundary.
- `targets/agentwrap/sources/TRD.md` - permission/sandbox configuration, canonical permission events, unsupported enforcement surfacing, error classification, metadata.
- `targets/agentwrap/roadmap.md` - Sprint 7 goal, scope, output, and quality gate.
- `targets/agentwrap/sprints/07-permission-policy/reasoning.md` - sprint design choices and deferrals.

## Evidence Links

- `targets/agentwrap/reports/permission-based-agent-wrapping.md`
- `targets/agentwrap/reports/evidence/runtime-contract.md`
- `targets/agentwrap/reports/evidence/session-lifecycle.md`
- `targets/agentwrap/reports/evidence/resilience-policies.md`
- `targets/agentwrap/reports/evidence/observability-metadata.md`
- `/home/antonioborgerees/coding/agentwrap/runtime.go`
- `/home/antonioborgerees/coding/agentwrap/config.go`
- `/home/antonioborgerees/coding/agentwrap/events.go`
- `/home/antonioborgerees/coding/agentwrap/opencode/runtime.go`
- `/home/antonioborgerees/coding/agentwrap/opencode/options.go`

## Scope

- Define public structured permission policy types.
- Attach structured permission policy to `RunRequest`.
- Add permission support classification and audit metadata.
- Translate supported policy into OpenCode config via `OPENCODE_CONFIG_CONTENT`.
- Reject unsupported required policy before process start unless best-effort is requested.
- Emit and record permission audit evidence from initialized policy and native permission events.
- Update tests, README/package docs, and `DECISIONS.md`.

## Non-Scope

- Live OpenCode REST/SSE approval transport.
- Codex or Claude Code adapters.
- Broad public `ToolApprovalService`.
- Durable persistence.
- Validation/repair behavior.

## Execution Checklist

- [x] **Task 1: Define Permission Policy Model**
  - [x] Add runtime-neutral permission action, tool, policy, support, and audit types.
  - [x] Add structured policy to `RunRequest` without removing legacy `PermissionMode`.
  - [x] Add validation and tests for unsupported/contradictory policy.

- [x] **Task 2: Implement OpenCode Translation**
  - [x] Translate supported tool/external-directory decisions to OpenCode permission config.
  - [x] Inject config with `OPENCODE_CONFIG_CONTENT` per process.
  - [x] Add tests for config generation and env precedence.

- [x] **Task 3: Permission Events And Metadata**
  - [x] Emit an initialization audit event for effective permission policy.
  - [x] Preserve native permission events as canonical permission events.
  - [x] Record permission policy summary and decisions in run metadata.

- [x] **Task 4: Documentation And Decisions**
  - [x] Update docs/README with usage and limitations.
  - [x] Add decision log entries for initialization-time policy and live approval deferral.
  - [x] Record execution evidence and final status.

## Testing And Documentation Checklist

- [x] Unit tests for permission policy validation and support classification.
- [x] OpenCode adapter tests for config env generation.
- [x] OpenCode adapter tests for permission audit metadata/events.
- [x] Documentation updates.

## Risks And Blockers

| Risk | Impact | Mitigation | Status |
| --- | --- | --- | --- |
| Current adapter cannot post live REST/SSE approval decisions | Medium | Implemented init-time config and audit path; recorded server-mode live approval as deferred in DEC-023 | Deferred |
| Policy overfits OpenCode tool names | Medium | SDK tool vocabulary lives in root package; OpenCode mappings live in adapter | Mitigated |
| Unsupported path-level policy appears enforced | High | Required path-level rules fail before process start; best-effort mode records unsupported metadata | Closed |

## Success Criteria

- [x] A caller can configure permission policy through the SDK at run initialization.
- [x] OpenCode receives native permission config without caller touching OpenCode APIs.
- [x] Unsupported required features fail before process start.
- [x] Permission decisions/audit evidence appear in canonical events and metadata.
- [x] OpenCode details do not leak into the common caller path.

## Study Evaluation

- [x] **Patterns Followed:** explicit config, typed errors, adapter-owned native translation, audit metadata, fake-first tests.
- [x] **Anti-Patterns Avoided:** mutating user config files, hidden broad allow-all, fake live approval semantics, product workflow coupling.
- [x] **Proceed / Iterate:** Proceed to Sprint 8. Live approval transport remains an explicit deferred capability, not a blocker for initialization-time policy.

## Review And Sign-Off

- Sprint Status: Complete
- Completion Date: 2026-05-20

## Execution Evidence

- 2026-05-20: Created Sprint 7 tracker and reasoning because the roadmap section existed but execution artifacts were missing.
- 2026-05-20: Added `/home/antonioborgerees/coding/agentwrap/permissions.go` with `PermissionPolicy`, SDK tool/action vocabulary, validation, summaries, support, and audit types.
- 2026-05-20: Added `RunRequest.PermissionPolicy` and `RunMetadata.Permissions`.
- 2026-05-20: Added `/home/antonioborgerees/coding/agentwrap/opencode/permissions.go` to translate SDK policy into per-process `OPENCODE_CONFIG_CONTENT`.
- 2026-05-20: Updated OpenCode runtime to preflight permission policy, inject native permission config, emit a `permission.policy` canonical event, and record permission metadata.
- 2026-05-20: Added tests in `/home/antonioborgerees/coding/agentwrap/permissions_test.go` and `/home/antonioborgerees/coding/agentwrap/opencode/runtime_test.go`.
- 2026-05-20: Updated `/home/antonioborgerees/coding/agentwrap/README.md`, `/home/antonioborgerees/coding/agentwrap/doc.go`, and `targets/agentwrap/DECISIONS.md`.
- 2026-05-20: `go test ./...` initially failed because the sandbox could not write to `/home/antonioborgerees/.cache/go-build`.
- 2026-05-20: `GOCACHE=/tmp/agentwrap-go-build go test ./...` passed.
- 2026-05-20: Added gated real-provider smoke `TestRealOpenCodePermissionSmoke` in `/home/antonioborgerees/coding/agentwrap/opencode/integration_test.go`.
- 2026-05-20: Real smoke `GOCACHE=/tmp/agentwrap-go-build AGENTWRAP_OPENCODE_PERMISSION_SMOKE=1 go test ./opencode -run TestRealOpenCodePermissionSmoke -count=1 -timeout 10m` passed in 17.657s. It verified real OpenCode/provider behavior for shell allow via initialized permission policy, unsupported required path preflight failure, and best-effort unsupported path metadata.
- 2026-05-20: Addressed audit follow-ups:
  - Added stable permission policy ID/fingerprint to `PermissionPolicySummary`, `PermissionMetadata`, and `permission.policy` event payload.
  - Reordered OpenCode startup so `permission.policy` is emitted before `process_started` and before `runner.Start`.
  - Added real smoke coverage for `PermissionActionAsk` that waits for a permission/blocking event and cancels instead of requiring human approval.
- 2026-05-20: `GOCACHE=/tmp/agentwrap-go-build go test ./...` passed after follow-ups.
- 2026-05-20: Real smoke `GOCACHE=/tmp/agentwrap-go-build AGENTWRAP_OPENCODE_PERMISSION_SMOKE=1 go test ./opencode -run TestRealOpenCodePermissionSmoke -count=1 -timeout 10m` passed in 21.385s with the `ask` case included.
