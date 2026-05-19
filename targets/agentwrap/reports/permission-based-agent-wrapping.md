# Permission-Based Agent Wrapping: Architecture Report

**Date:** 2026-05-19  
**Author:** Agent Wrapped via OpenClaw  
**Status:** Design Complete

---

## Executive Summary

We investigated three AI coding agents (OpenCode, Codex, Claude Code) for the ability to implement programmatic permission controls — both static (pre-configured allowlists) and dynamic (runtime interception with re-prompting). All three support both approaches, though the mechanisms differ significantly.

---

## 1. Three-Layer Permission Architecture

For a production agent wrapper, we recommend a **two-layer static + dynamic** approach:

| Layer | Mechanism | Handles |
|-------|-----------|---------|
| **Static allowlisting** | Config/env var at session start | Pre-approved tools, broad path patterns, known-safe operations |
| **Runtime interception** | Event subscription + approval API | Path-level decisions, content validation, re-prompting, auditing |

### Why Both?

The config-only approach is insufficient for:

1. **Path-level granularity** — Config lets you say `bash=ask` but not "bash can only run `git`, `npm`, `make` but not `rm -rf /`"
2. **Content validation** — You can't see *what* is being written/edited, only *that* a write/edit is requested
3. **Re-prompting** — Config just says allow/deny; interception lets you say "wait, that looks like an SSH key — are you sure?" and give the agent feedback to course-correct
4. **Dynamic policy** — Some decisions depend on runtime state (file contents, prior operations, user context)

---

## 2. OpenCode

### 2.1 Config-Based Permissions

OpenCode reads config from `~/.config/opencode/opencode.jsonc` and supports environment variables:

```bash
OPENCODE_CONFIG=/path/to/config.json      # Path to config file
OPENCODE_CONFIG_CONTENT='{"permission":{}}'  # Raw JSON content
```

The `permission` block in the config schema supports per-tool rules:

```json
{
  "permission": {
    "read": "ask",
    "edit": "ask",
    "bash": "ask",
    "glob": "allow",
    "grep": "allow",
    "list": "allow",
    "todowrite": "allow",
    "external_directory": "deny",
    "repo_clone": "deny"
  }
}
```

Each tool can be `"ask"`, `"allow"`, or `"deny"`. The full set:
`read`, `edit`, `glob`, `grep`, `list`, `bash`, `task`, `external_directory`, `todowrite`, `question`, `webfetch`, `websearch`, `repo_clone`, `repo_overview`, `lsp`, `doom_loop`, `skill`

**Evidence:**
- Config schema: `https://opencode.ai/config.json`
- Env var support in SDK: `/packages/sdk/js/src/gen/sdk.gen.ts`
  ```typescript
  OPENCODE_CONFIG: process.env["OPENCODE_CONFIG"],
  OPENCODE_CONFIG_CONTENT: process.env["OPENCODE_CONFIG_CONTENT"],
  ```

### 2.2 Runtime Interception

OpenCode uses a clean REST API + SSE event stream:

```typescript
// Subscribe to events (including permission requests)
client.event.subscribe({ /* config */ })

// Approve or deny a permission request
client.postSessionIdPermissionsPermissionId({
  path: { id: sessionId, permissionID: permissionId },
  body: { allow: true }  // or { allow: false }
})
```

The permission event includes a `permissionID` which you POST back to approve/deny. Events are streamed via SSE.

**Evidence:**
- SDK: `/packages/sdk/js/src/gen/sdk.gen.ts` — `postSessionIdPermissionsPermissionId`
- `event.subscribe` method for real-time event streaming
- Agentwrap usage: `/agentwrap/opencode/integration_test.go` — `WithEnv("OPENCODE_CONFIG="+configPath)`

### 2.3 CLI Flag

```bash
opencode run --dangerously-skip-permissions  # Auto-approve everything (all-or-nothing)
```

No per-session allowlist flag exists — only all-or-nothing skip.

---

## 3. Codex

### 3.1 Config-Based Permissions

Codex uses `~/.codex/config.toml`:

```toml
model = "gpt-5.5"
approvals_reviewer = "user"  # Global only — not per-session
```

The protocol defines `PermissionProfile` and `AdditionalPermissionProfile` in the schema, but these are not exposed as CLI flags.

**Evidence:**
- Config file: `~/.codex/config.toml`
- Protocol definitions: `/codex-rs/protocol/src/models.rs` — `AdditionalPermissionProfile`
- Schema: `/codex-rs/protocol/src/v2/config.rs` — `ApprovalsReviewer` enum

### 3.2 Runtime Interception

Codex uses a richer protocol mechanism — approval is part of the submission dispatch cycle:

1. Agent emits `ExecApprovalRequestEvent` containing `call_id` + `available_decisions`
2. Wrapper subscribes to events
3. Wrapper sends `ReviewDecision` as part of next `submission_dispatch` message

Available decisions:
- `Approved` — one-shot allow
- `ApprovedForSession` — auto-approve this class of operation for the session
- `ApprovedExecpolicyAmendment` — approve AND persist a policy change
- `Denied` — deny with optional reason
- `Abort` — terminate the session

**Evidence:**
- Protocol: `/codex-rs/protocol/src/approvals.rs`
  ```rust
  pub struct ExecApprovalRequestEvent {
      pub call_id: String,
      pub available_decisions: Vec<ApprovalDecision>,
      // ...
  }
  ```
- Submission dispatch: `/codex-rs/protocol/src/items.rs`
- Event definition: `/codex-rs/protocol/src/approvals.rs` — `GuardianAssessmentEvent`

### 3.3 Notable Feature: ApprovedExecpolicyAmendment

Codex's most powerful feature is `ApprovedExecpolicyAmendment` — when you approve a file access, you can simultaneously tell Codex to persist that as an allowed path going forward. This bridges the static/dynamic boundary elegantly.

---

## 4. Claude Code

### 4.1 Config-Based Permissions

Claude Code has `--dangerously-skip-permissions` flag (all-or-nothing), but no per-session allowlists.

```bash
claude --dangerously-skip-permissions  # Auto-approve everything
```

### 4.2 Runtime Interception (Callback-Based)

Claude Code uses the cleanest runtime API — a simple callback hook:

```elixir
ClaudeCode.start_link(
  can_use_tool: fn %{tool_name: "Bash", tool_input: input} ->
    if allowed?(input["command"]), do: :allow, else: {:deny, reason: "Not allowed"}
  end
)
```

Or the more complete `PreToolUse` hook:

```elixir
hooks: %{
  PreToolUse: [
    %{
      hooks: [fn %{tool_name: name, tool_input: input}, _tool_use_id] ->
        if allowed?(input["file_path"]), do: :allow, else: {:deny, message: "Not allowed"}
      end]
    }
  ]
}
```

Tool input fields are predictable:
- `Bash` → `command`, `description`, `timeout`
- `Write` → `file_path`, `content`
- `Edit` → `file_path`, `old_string`, `new_string`
- `Read` → `file_path`, `offset`, `limit`

**Evidence:**
- Documentation: `https://hexdocs.pm/claude_code/permissions.html`
- User input hooks: `https://hexdocs.pm/claude_code/user-input.html`

---

## 5. Comparison Matrix

| Feature | OpenCode | Codex | Claude Code |
|---------|----------|-------|-------------|
| Per-session allowlist via config | ❌ | ❌ | ❌ |
| All-or-nothing skip flag | ✅ `--dangerously-skip-permissions` | ❌ | ✅ `--dangerously-skip-permissions` |
| Runtime interception | ✅ Event + REST API | ✅ ReviewDecision in submission dispatch | ✅ Callback hook |
| Re-prompt agent on suspicious action | ✅ | ✅ | ✅ |
| Persist approved policy dynamically | ❌ | ✅ `ApprovedExecpolicyAmendment` | ❌ |
| Audit log of all decisions | ✅ (via event stream) | ✅ (via event stream) | ✅ (via hook) |
| Granular path-level allowlist | ✅ (via interception) | ✅ (via interception) | ✅ (via interception) |

---

## 6. Recommended Architecture for agentwrap

### 6.1 Common Interface

```go
type ToolApprovalService interface {
    // Approve or deny a tool call
    Approve(ctx context.Context, req ApprovalRequest) error
    
    // Subscribe to permission events from the agent
    Subscribe(ctx context.Context, ch chan<- PermissionEvent)
    
    // Close cleans up resources
    Close() error
}
```

Implement three adapters:
- `OpenCodeApprovalAdapter` — SSE events + REST API
- `CodexApprovalAdapter` — Protocol events + submission dispatch
- `ClaudeCodeApprovalAdapter` — Callback hook

### 6.2 Config + Runtime Hybrid

```go
type Config struct {
    Permissions PermissionProfile  // Passed via env var at startup
    Interceptor InterceptorConfig  // Runtime decisions
}

type InterceptorConfig struct {
    Enabled    bool
    AllowList  []string  // Paths/regex patterns to allow without asking
    DenyList   []string  // Paths/regex patterns to always deny
    Hook       func(tool, input) (Decision, string)  // Custom logic
}

// Decision is one of: Allow, Deny, Ask, RePrompt
type Decision int
```

### 6.3 Decision Flow

```
Tool call request
        │
        ▼
┌──────────────────────┐
│  Config AllowList?   │──yes──▶ Allow (no event emitted)
└──────────────────────┘
        │ no
        ▼
┌──────────────────────┐
│  Config DenyList?    │──yes──▶ Deny (no event emitted)
└──────────────────────┘
        │ no
        ▼
┌──────────────────────┐
│  Interceptor Hook?   │──yes──▶ Hook returns Decision
└──────────────────────┘
        │ no (or Hook returns Ask)
        ▼
   Emit Permission Event → User/Wrapper Decision
        │
        ├─ Allow ──▶ Record in audit log
        ├─ Deny ────▶ Return error to agent
        └─ RePrompt ▶ Send feedback to agent, let it retry
```

### 6.4 Re-Prompting Use Cases

The runtime interceptor enables smart re-prompting:
- "That edit removes a safety check" → agent should reconsider
- "This bash command looks destructive" → ask for confirmation
- "This file is outside the project scope" → explain and deny
- "You keep trying the same failing command" → suggest an alternative
- "The file you're editing has a different structure than expected" → show the expected format

---

## 7. Evidence Sources

### OpenCode
- SDK: `/coding/ultraplan/studies/opencode-wrap-study/sources/opencode/packages/sdk/js/src/gen/sdk.gen.ts`
- Config schema: `https://opencode.ai/config.json`
- Integration test with config env var: `/agentwrap/opencode/integration_test.go`
- Permission event handling: `/agentwrap/opencode/decoder.go`

### Codex
- Protocol/approvals: `/coding/reference/codex/codex-rs/protocol/src/approvals.rs`
- Config: `~/.codex/config.toml`
- Submission dispatch protocol: `/codex-rs/protocol/src/items.rs`
- Config schema: `/codex-rs/protocol/src/v2/config.rs`

### Claude Code
- Documentation: `https://hexdocs.pm/claude_code/permissions.html`
- User input: `https://hexdocs.pm/claude_code/user-input.html`

### agentwrap Existing Code
- Runtime: `/coding/agentwrap/opencode/runtime.go`
- Options: `/coding/agentwrap/opencode/options.go`
- Process: `/coding/agentwrap/opencode/process.go`
- Integration test: `/coding/agentwrap/opencode/integration_test.go`

---

## 8. Next Steps

1. **Extend `agentwrap` Options** — Add `WithInterceptor(InterceptorConfig)` to the OpenCode adapter
2. **Implement OpenCode adapter** — Subscribe to `event.subscribe()` and route to interceptor hook
3. **Implement Codex adapter** — Route `ExecApprovalRequestEvent` to interceptor hook, send `ReviewDecision` in submission dispatch
4. **Implement Claude Code adapter** — Use `can_use_tool` / `PreToolUse` hooks
5. **Add RePrompt support to agentwrap** — Define how wrapper feedback is sent back to the agent (not just allow/deny)
6. **Persist approved policies** — For Codex, map `ApprovedExecpolicyAmendment` decisions back to the config layer

---

## 9. Status

| Item | Status |
|------|--------|
| Research complete | ✅ |
| OpenCode mechanism identified | ✅ |
| Codex mechanism identified | ✅ |
| Claude Code mechanism identified | ✅ |
| agentwrap code examined | ✅ |
| Common interface design | ✅ |
| Implementation | ⏳ Pending |