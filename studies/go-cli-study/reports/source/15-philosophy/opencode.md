# Repo Analysis: opencode

## Engineering Philosophy & Tradeoffs

### Repo Info

| Field | Value |
|-------|-------|
| Name | opencode |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

OpenCode is a terminal-based AI coding assistant built in Go. It demonstrates a clear philosophy of **terminal-first developer tooling** with deep integration into the developer's workflow. The architecture is intentionally modular—separating LLM providers, TUI rendering, session management, and persistence—while maintaining cohesive design through a central pub/sub broker pattern. The project optimizes for direct terminal interaction over web UI, user agency over automation, and extensibility through MCP and LSP integration.

## Rating

**8/10** — Strong coherent engineering style with intentional tradeoffs

The codebase feels *designed, not accumulated*. Every component has a clear purpose, and the interactions between components follow predictable patterns (e.g., pub/sub for event-driven communication). The philosophy of "user in control with AI as assistant" permeates both the UI (permission dialogs, explicit confirmations) and the agent design (tool-based execution with human oversight).

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Terminal-first architecture | TUI built on Bubble Tea, not web-based | `internal/tui/tui.go:1-25` |
| Modular LLM providers | Provider interface supporting OpenAI, Anthropic, Gemini, etc. | `internal/llm/provider/provider.go:1-30` |
| Event-driven communication | Pub/sub broker pattern for all services | `internal/pubsub/broker.go:10-19` |
| Permission system | User approval for dangerous operations | `internal/permission/permission.go:74-108` |
| Session persistence | SQLite storage for conversations | `internal/db/sessions.sql.go:1-30` |
| Agent tool abstraction | BaseTool interface for all AI tools | `internal/llm/tools/tools.go:1-25` |
| Prompt engineering | Sophisticated system prompts per provider | `internal/llm/prompt/coder.go:16-25` |
| Auto-compaction | Context window management | `internal/llm/agent/agent.go:535-704` |
| Diff/patch complexity | Full unified diff parsing and application | `internal/diff/diff.go:1-100` |
| MCP extensibility | External tool integration via MCP protocol | `internal/llm/agent/mcp-tools.go:1-30` |

## Answers to Protocol Questions

### 1. What philosophy does this repo optimize for?

**Terminal-native AI pair programming.** The README states "Terminal-based AI assistant for software development" (`README.md:18`). The architecture optimizes for direct terminal workflow rather than browser-based alternatives.

Key priorities visible in the code:
- **User agency**: The permission system (`internal/permission/permission.go:74-108`) requires explicit user approval for file modifications, shell commands, and other potentially destructive operations
- **Conversation continuity**: Sessions persist in SQLite (`internal/db/sessions.sql.go`) enabling long-running conversations with context preservation
- **Multi-provider flexibility**: A provider abstraction (`internal/llm/provider/provider.go`) allows seamless switching between OpenAI, Anthropic, Google Gemini, Copilot, Azure, and self-hosted models
- **Developer experience**: Vim-style keybindings, LSP integration for diagnostics, and a built-in editor in the TUI

### 2. What complexity is intentionally accepted?

The project accepts significant complexity to provide a rich developer experience:

- **LSP integration** (`internal/lsp/client.go:1-50`): Full Language Server Protocol implementation for diagnostics, file watching, and multi-language support. This adds substantial code (~800 lines across client, handlers, methods, protocol) but provides real-time error feedback.

- **Multiple AI providers**: Each provider has distinct API conventions (Anthropic's streaming events vs. OpenAI's chat completions). The provider layer (`internal/llm/provider/`) handles ~1300 lines to normalize these interfaces.

- **Diff/patch functionality**: A full unified diff parser with syntax highlighting (`internal/diff/diff.go:1-873`) for visualizing code changes. Includes hunk parsing, side-by-side rendering, and intra-line highlighting using chroma.

- **MCP (Model Context Protocol)**: Extensibility mechanism for external tools (`internal/llm/agent/mcp-tools.go`), adding another layer of complexity to tool discovery and execution.

- **Auto-compaction**: When context approaches limits, the agent summarizes conversations and creates new sessions (`internal/llm/agent/agent.go:535-704`). This adds complexity but prevents "out of context" failures.

- **Multi-theme TUI**: 10 color themes (`internal/tui/theme/`) with a theme manager, each theme being several hundred lines of style definitions.

### 3. What complexity is intentionally avoided?

- **No web UI**: All interaction happens in the terminal. No HTTP server, no browser-based components.
- **No built-in terminal multiplexing**: Assumes the user has their own terminal multiplexer (tmux, screen, etc.)
- **Simple permission model**: Flat permission grants vs. role-based ACLs. Permissions are session-scoped with auto-approve for non-interactive mode.
- **No built-in code execution sandbox**: While bash commands require permission, there's no isolation layer (containers, VMs). The project relies on user approval rather than technical sandboxing.
- **No collaboration/multiplayer**: Each session is single-user. No sync, no sharing, no presence indicators.

## Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Pub/sub broker for all services** (`internal/pubsub/broker.go`) | Decouples TUI from backend logic. Multiple subscribers (TUI message handler, logging, session updates) consume events without the producer knowing. Buffer size of 64 with drop-on-slow-consumer behavior prevents blocking. |
| **SQLite for persistence** (`internal/db/db.go`) | Single-file database suitable for CLI tools. No external dependencies. Migrations via goose (`internal/db/migrations/`). Schema supports sessions, messages, files with proper indexing. |
| **Tool abstraction layer** (`internal/llm/tools/tools.go:1-25`) | Every AI-callable action (bash, glob, grep, edit, fetch, etc.) implements BaseTool interface. This allows uniform handling, permission enforcement per-tool, and easy addition of new tools. |
| **System prompts per provider** (`internal/llm/prompt/coder.go:16-25`) | OpenAI and Anthropic get different system prompts optimized for their models' strengths. Anthropic prompt emphasizes concise output, tool usage, and context management. |
| **Permission-first design** (`internal/permission/permission.go`) | Dangerous operations (file write, shell execution) always require user confirmation. Permission requests queue and wait for TUI response. Auto-approve exists only for non-interactive mode (`cmd/root.go:128-129`). |
| **Event sourcing for messages** (`internal/llm/agent/agent.go:445-492`) | Message updates stream live to the TUI via pub/sub. Thinking deltas, content deltas, and tool calls all publish events that the TUI renders in real-time. |

## Notable Patterns

1. **Broker pattern for service communication**: Every service (sessions, messages, permissions, agent) embeds `*Broker[T]` and implements `Suscriber[T]` interface. The TUI subscribes to all services and routes events through a single channel (`cmd/root.go:249-281`).

2. **Tool call loop**: The agent (`internal/llm/agent/agent.go:276-310`) loops on `streamAndHandleEvents` until the model returns a non-tool-call finish reason. Each tool result appends to message history and triggers another generation. This is a standard LLM tool-use pattern but cleanly implemented.

3. **Context propagation**: Session ID and message ID pass through context values (`internal/llm/agent/agent.go:323, 336`) to allow tools to know which conversation they're operating in without explicit parameter threading.

4. **Graceful shutdown with wait groups**: The TUI (`cmd/root.go:156-170`) coordinates shutdown across multiple goroutines: app shutdown, subscription cancellation, TUI message handler wait. Timeout prevents hung processes.

## Tradeoffs

| Tradeoff | Accepted Cost | Benefit |
|----------|---------------|---------|
| **LSP complexity** | ~800 lines in `internal/lsp/`, watcher implementation | Real-time diagnostics prevent AI from suggesting broken code |
| **Multi-provider abstraction** | ~1300 lines in provider layer, complex model configuration | Users can switch models without changing workflow |
| **Diff/patch library** | ~900 lines in `internal/diff/` | Visual diffs help users understand changes before applying |
| **Theme system** | ~1000 lines across 10 theme files | User preference customization without code changes |
| **Permission system** | Every tool call requires potential user interaction | User trust and safety for destructive operations |
| **Auto-compaction** | Additional LLM call for summarization | Prevents context overflow failures in long sessions |

## Failure Modes / Edge Cases

1. **Context overflow**: Despite auto-compaction, very long sessions may still exceed context limits. The summary may lose important details depending on model capability.

2. **Permission timeout**: If a user ignores a permission dialog, the tool call blocks indefinitely. The implementation (`internal/permission/permission.go:105-107`) waits on a channel with no timeout.

3. **MCP server crashes**: MCP tools are fetched once at startup (`cmd/root.go:204`). If an MCP server becomes unavailable during a session, its tools will fail silently or return errors.

4. **Session corruption**: If the SQLite database is corrupted or locked, all session operations fail. No recovery mechanism exists beyond the database's own integrity checks.

5. **LLM provider rate limits**: No built-in retry logic or rate limit handling. The agent returns errors directly to the user.

6. **LSP startup failures**: LSP clients initialize in the background (`internal/app/app.go:59-60`). If `gopls` or other language servers fail, diagnostics silently degrade rather than alerting the user.

## Future Considerations

- **Permission caching**: Currently permissions are session-scoped. A persistent grant system would reduce repeated confirmations for common operations.
- **Rate limit handling**: Exponential backoff and retry logic for provider API limits.
- **Async MCP tool refresh**: Current implementation fetches MCP tools once. A hot-reload mechanism would support dynamic tool discovery.
- **Collaboration layer**: Multiplayer support via shared session IDs and real-time sync.
- **Sandboxed execution**: Containerized shell command execution for untrusted code.

## Questions / Gaps

1. **No explicit error recovery strategy**: While panic recovery exists (`cmd/root.go:186-193`), there's no structured error recovery for expected failure modes (network timeouts, API errors).

2. **No documentation of design decisions**: The codebase lacks `ARCHITECTURE.md` or similar design documentation. Philosophy is inferred from code rather than stated.

3. **No telemetry opt-out**: Usage tracking (`internal/llm/agent/agent.go:494-514`) appears to be always on. Users may want to disable this.

4. **Custom commands lack validation**: Command files are markdown with simple argument substitution (`internal/tui/components/dialog/custom_commands.go`). No schema validation on argument types.

---

Generated by `study-areas/15-philosophy.md` against `opencode`.