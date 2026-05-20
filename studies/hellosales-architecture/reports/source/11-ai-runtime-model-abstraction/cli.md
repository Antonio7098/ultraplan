# Source Analysis: cli

## AI Runtime & Model Abstraction

### Source Info

| Field | Value |
|-------|-------|
| Name | cli |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/cli` |
| Language / Stack | Go (github.com/cli/cli/v2) |
| Analyzed | 2026-05-20 |

## Summary

The `cli` source is the **GitHub CLI (`gh`)**, a command-line tool for interacting with GitHub. It is not an AI runtime or model abstraction platform. The CLI provides thin integrations with GitHub's Copilot AI features through:

1. **Agent Detection** — detects which AI coding agent is running via environment variables
2. **Copilot CLI Invocation** — downloads and runs the external Copilot CLI as a subprocess
3. **Copilot API (CAPI) Client** — manages agent task sessions via GitHub's REST API
4. **Streaming Log Renderer** — parses SSE data containing `chat.completion.chunk` entries and renders tool calls

The AI reasoning, prompt management, model routing, and context handling all occur on GitHub's infrastructure. The CLI itself does not abstract across AI providers, manage prompts/templates, track tokens, or handle context windows.

## Rating

**2 / 10** — Not applicable to AI runtime abstraction

This is a GitHub API client with auxiliary Copilot integrations. It does not implement an AI orchestration layer.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Agent Detection | `detectWith()` checks env vars like `AI_AGENT`, `CLAUDECODE`, `CODEX_SANDBOX`, `GEMINI_CLI`, `COPILOT_CLI`, `OPENCODE` | `internal/agents/detect.go:38-98` |
| Agent Detection | `AgentName` type with constants for known agents: `claude-code`, `codex`, `copilot-cli`, `gemini-cli`, `opencode`, `amp` | `internal/agents/detect.go:12-19` |
| Copilot CLI Invocation | `runCopilot()` downloads and execs the external Copilot binary; sets `COPILOT_GH=true` env var | `pkg/cmd/copilot/copilot.go:133-193` |
| CAPI Client | `CapiClient` interface with methods: `CreateJob`, `GetJob`, `GetSession`, `GetSessionLogs`, `ListSessionsByResourceID` | `pkg/cmd/agent-task/capi/client.go:13-21` |
| CAPI HTTP Transport | `capiTransport` adds `Bearer` auth and `Copilot-Integration-Id: copilot-4-cli` header | `pkg/cmd/agent-task/capi/client.go:64-76` |
| Streaming Log Parser | `chatCompletionChunkEntry` struct matches OpenAI chat completion chunk format with `Delta`, `Choices`, `FinishReason` | `pkg/cmd/agent-task/shared/log.go:496-518` |
| Tool Call Rendering | `renderLogEntry()` handles tool calls: `bash`, `view`, `create`, `str_replace`, `think`, `report_progress`, `run_setup`, etc. | `pkg/cmd/agent-task/shared/log.go:91-269` |
| Job Creation | `CreateJob()` sends `problem_statement` and `custom_agent` to CAPI `agents/swe/v1/jobs` endpoint | `pkg/cmd/agent-task/capi/job.go:58-128` |
| Backoff Retry | `backoff.RetryWithData()` with `NewExponentialBackOff()` for polling job session URL | `pkg/cmd/agent-task/create/create.go:216-223` |
| Session Polling | `GetSessionLogs()` fetches SSE logs from `agents/sessions/{id}/logs` endpoint | `pkg/cmd/agent-task/capi/sessions.go:335-362` |

## Answers to Dimension Questions

### 1. How does the system abstract across different AI providers without leaky abstractions?

**No evidence found.** The CLI does not abstract across AI providers. It only integrates with GitHub's Copilot via:
- The CAPI HTTP API (`pkg/cmd/agent-task/capi/`)
- The external Copilot CLI binary invocation (`pkg/cmd/copilot/`)

There is no pluggable adapter interface, provider registry, or abstraction layer for switching between AI backends. The CLI assumes Copilot/GitHub throughout.

### 2. How are prompts constructed, versioned, and tested?

**No evidence found for prompt management.** Prompts are not constructed in the CLI — the `problem_statement` is user-provided text passed directly to the CAPI `CreateJob` endpoint (`pkg/cmd/agent-task/capi/job.go:77`). Prompt engineering, versioning, and testing are entirely the responsibility of the Copilot backend.

### 3. How is context window overflow handled — truncation, summarization, or segmentation?

**No evidence found.** Context window management is handled entirely by the Copilot backend. The CLI passes only a `problem_statement` string and receives back session logs. There is no visible token counting, context truncation, or segmentation logic in the CLI.

### 4. How does streaming work end-to-end from provider to end user?

1. User creates an agent task via `gh agent-task create` → `CreateJob()` POST to CAPI
2. CAPI returns a `Job` with a `session_id`
3. Client polls `GetSessionLogs()` periodically (every 5 seconds via `defaultLogPollInterval` in `create.go:24`)
4. Logs are returned as SSE-like `data: {...}` format
5. `LogRenderer.Follow()` fetches and diffs logs, calling `Render()`
6. `Render()` parses entries as `chatCompletionChunkEntry` JSON objects
7. `renderLogEntry()` processes delta content and tool calls, rendering markdown to terminal

See: `pkg/cmd/agent-task/shared/log.go:31-54` (Follow), `log.go:58-89` (Render), `log.go:91-269` (renderLogEntry).

### 5. How are token costs tracked and attributed to tenants/users?

**No evidence found.** Token counting and cost tracking are not implemented in the CLI. Usage accounting is handled by GitHub's Copilot backend, which attributes usage to the user's Copilot plan. The CLI provides no visibility into token counts, model pricing, or per-tenant cost attribution.

## Architectural Decisions

1. **Thin Copilot Integration**: The CLI acts as a client for Copilot services rather than implementing AI capabilities. AI reasoning happens server-side; the CLI handles task lifecycle management and log rendering.

2. **Polling over WebSockets**: Session logs are fetched via periodic HTTP polling (`GetSessionLogs()` called every 5 seconds) rather than WebSocket or Server-Sent Events push. See `create.go:274-284`.

3. **SSE Log Format**: The log format uses `data: ` prefixes followed by JSON, matching the SSE standard. The parser only processes entries that unmarshal to `chatCompletionChunkEntry` with `object == "chat.completion.chunk"` (`log.go:75-78`).

4. **Backoff for Job Polling**: Job creation uses exponential backoff when polling for PR/session association (`create.go:217-223`). The CAPI client itself does not implement per-request retry or model fallback.

5. **OAuth Token Requirement**: Agent tasks require OAuth tokens (prefix `gho_` from device flow), not GitHub App tokens (`agent_task.go:69-99`). This reflects Copilot's licensing model.

## Notable Patterns

- **Environment-based Agent Detection**: Uses env vars (`CLAUDECODE`, `CODEX_SANDBOX`, `GEMINI_CLI`, `OPENCODE`, `AI_AGENT`) to detect which AI tool is running the CLI. This is purely observational, not a provider abstraction.

- **Tool Call Rendering via Type Switch**: `renderLogEntry()` dispatches on tool call name (`bash`, `view`, `create`, etc.) with full JSON schema for each tool's arguments (`log.go:128-265`).

- **Generic Tool Call Fallback**: Unknown tool calls render via `renderGenericToolCall()` with a hardcoded `genericToolCallNamesToTitles` map (`log.go:432-494`), allowing graceful handling of new tools without code changes.

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| Polling over streaming | Simple to implement; avoids WebSocket complexity; adds latency (5s poll interval) |
| External Copilot CLI as subprocess | Zero AI implementation burden; couples to Copilot's binary interface and release cadence |
| Thin CAPI client | No sophisticated retry, no circuit breakers, no rate-limit awareness beyond HTTP status codes |
| Log rendering in CLI | Rendering is nicely formatted but is display-only; no semantic understanding of tool outputs |

## Failure Modes / Edge Cases

1. **Copilot API Unavailable**: `CreateJob()` returns HTTP errors directly; no fallback to alternate provider or cached prompts (`job.go:96-105`).

2. **Session Log Timeout**: `fetchJobSessionURL()` returns after 10 seconds with a fallback link to `https://github.com/copilot/agents` (`create.go:217-219`). User sees generic page rather than structured feedback.

3. **Malformed Log Entries**: Parser skips entries that don't unmarshal to `chatCompletionChunkEntry` or lack `object == "chat.completion.chunk"` (`log.go:77-78`). Unknown entries are silently ignored.

4. **OAuth Token Expiry**: Agent-task commands require OAuth tokens; if expired, user must re-authenticate with `gh auth login` (`agent_task.go:96-98`).

5. **External Binary Dependency**: `gh copilot` downloads and runs an external binary; if GitHub's release infrastructure is down, installation fails (`copilot.go:278-286`).

## Future Considerations

- A proper AI runtime abstraction would require a provider adapter interface with `Completions()`, `Embeddings()`, `ModelInfo()` methods and a registry pattern.
- Prompt templating and versioning would need a dedicated package (e.g., `internal/prompts/`) with file-based or database-backed revision tracking.
- Token counting could be implemented by wrapping responses and parsing usage metadata from provider APIs.
- Context window overflow handling would require a `ContextManager` that tracks cumulative token counts and applies strategies (truncate, summarize, chain-of-thought compression).

## Questions / Gaps

| Question | Answer |
|----------|--------|
| Is there a provider abstraction for AI? | **No** — only GitHub CAPI is integrated |
| Is there a prompt template system? | **No** — prompts are user-provided strings |
| Is there token counting or cost tracking? | **No** — usage is tracked by Copilot backend |
| Is there context window management? | **No** — handled by Copilot backend |
| Is there model routing or fallback? | **No** — no multi-model support |
| Is there AI-specific rate limit handling? | **No** — only generic HTTP retry via `backoff` |

---

Generated by `dimensions/11-ai-runtime-model-abstraction.md` against `cli`.
