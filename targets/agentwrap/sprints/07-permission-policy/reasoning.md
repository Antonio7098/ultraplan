# Sprint Reasoning: Initialization-Time Permission Policy

> Target: agentwrap
> Sprint ID: 07-permission-policy
> Output: `targets/agentwrap/sprints/07-permission-policy/reasoning.md`
> Sprint Tracker: `targets/agentwrap/sprints/07-permission-policy/plan.md`

## Overview

**Sprint:** Initialization-Time Permission Policy  
**Purpose:** Let callers configure runtime-neutral permissions when starting SDK work, then let the OpenCode adapter translate that policy into native permission configuration and preserve permission decisions/audit evidence.  
**Roadmap Section:** `targets/agentwrap/roadmap.md` - `## Sprint 7: Initialization-Time Permission Policy`  
**Depends On:** Sprints 0-6 runtime contract, OpenCode adapter, lifecycle, health/config, and resilience policy layers.  
**Reasoning Status:** Ready For Execution

## Evidence Basis

- `targets/agentwrap/sources/PRD.md` requires permissions and blocking states to be surfaced, caller-defined permission handling policy, non-interactive operation, cancellable blocked runs, and permission decisions in metadata when safe.
- `targets/agentwrap/sources/TRD.md` requires permission/sandbox configuration, canonical permission events, unsupported-enforcement surfacing, and distinction between permission failures and validation failures.
- `targets/agentwrap/roadmap.md` scopes Sprint 7 to initialization-time SDK policy, OpenCode config translation, adapter-owned approval mechanics, canonical audit events, and no broad public `ToolApprovalService`.
- `targets/agentwrap/reports/permission-based-agent-wrapping.md` shows OpenCode config/env permission injection plus runtime approval mechanics. For this sprint, the subprocess adapter can implement config/env injection and audit projection; live REST/SSE approval posting is deferred until a server-mode transport exists.

## Decisions

- **Permission policy belongs on `RunRequest`:** It is caller intent for a run/session initialization, not an adapter option or global mutable setting.
- **Keep legacy `PermissionMode`:** Preserve the simple field for compatibility and effective-config summaries, but introduce structured `PermissionPolicy` for real decisions.
- **Translate to native OpenCode config first:** Use `OPENCODE_CONFIG_CONTENT` because it is per-process and avoids mutating user config files.
- **Classify enforcement before launch:** Unsupported or contradictory policy should fail before process start unless the caller marks unsupported features as best-effort.
- **Defer live approval transport:** The current adapter starts `opencode run --format json`; it does not own an OpenCode server/SSE client. This sprint records the deferral instead of faking live approval semantics.

## Non-Scope

- Codex or Claude Code adapters.
- A public live approval service.
- OpenCode server-mode transport.
- Validation/repair permission overrides.
- Durable persistence of permission audit records beyond current run metadata.

