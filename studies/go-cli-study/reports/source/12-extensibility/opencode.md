# Repo Analysis: opencode

## Extensibility & Plugin Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | opencode |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

OpenCode demonstrates a well-structured plugin architecture centered on the Model Control Protocol (MCP). The system provides extensibility through: (1) a formal `BaseTool` interface in `internal/llm/tools/tools.go:69-72`, (2) MCP client implementations supporting stdio and SSE transport in `internal/llm/agent/mcp-tools.go:106-129`, (3) a permission-based security layer in `internal/permission/permission.go:35-42`, and (4) modular provider architecture supporting multiple LLM backends via a factory pattern in `internal/llm/provider/provider.go:86-168`. New commands are added through the tool registration system rather than CLI subcommands. The architecture is production-oriented with clear boundaries between internal packages and exported APIs.

## Rating

**7/10** — Well-designed modularity

OpenCode has a mature plugin architecture with MCP as the primary extension mechanism. The tool system is well-designed with clear interfaces, but extension is primarily limited to tool-style plugins rather than arbitrary command registration. The internal package boundaries are generally respected but some packages leak internal types.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Tool interface | `BaseTool` interface with `Info()` and `Run()` methods | `internal/llm/tools/tools.go:69-72` |
| MCP client | Stdio and SSE transport support with `mcp-go` library | `internal/llm/agent/mcp-tools.go:106-129` |
| MCP config | `MCPServer` struct with command, env, args, type, URL fields | `internal/config/config.go:28-35` |
| Provider factory | `NewProvider()` switch on `ModelProvider` enum | `internal/llm/provider/provider.go:86-168` |
| Permission service | `Service` interface with `Request()`, `Grant()`, `Deny()` | `internal/permission/permission.go:35-42` |
| Tool registration | `CoderAgentTools()` composes tools from factory functions | `internal/llm/agent/tools.go:14-41` |
| Agent interface | `Service` interface in agent package with `Run()`, `Cancel()`, `Update()` | `internal/llm/agent/agent.go:48-57` |
| LSP client | `Client` struct with `RegisterNotificationHandler()`, `RegisterServerRequestHandler()` | `internal/lsp/client.go:117-127` |
| Config validation | `Validate()` function checking model, provider, LSP validity | `internal/config/config.go:608-641` |
| Message service | `Service` interface for message CRUD operations | `internal/message/message.go:22-30` |
| Session service | `Service` interface in session package | `internal/session/session.go:1-30` |
| Theme system | `Manager` struct with theme registry | `internal/tui/theme/manager.go:1-50` |

## Answers to Protocol Questions

### 1. Can new commands be added cleanly?

**Yes, through the tool system.** New functionality is added as tools implementing `BaseTool` interface (`internal/llm/tools/tools.go:69-72`). Tools are composed in `CoderAgentTools()` (`internal/llm/agent/tools.go:14-41`) and can include MCP-based external tools via `GetMcpTools()` (`internal/llm/agent/mcp-tools.go:169-201`). The tool pattern is consistent across bash, edit, fetch, glob, grep, ls, view, write, patch, diagnostics, and sourcegraph tools. However, adding truly new CLI subcommands (beyond the root `opencode` command in `cmd/root.go:24-184`) requires modifying the core command structure.

### 2. Is extension anticipated?

**Yes, via MCP.** The architecture explicitly anticipates extension through MCP servers defined in config (`internal/config/config.go:27-35` with `MCPServer` struct supporting `MCPStdio` and `MCPSse` types). MCP tools are discovered dynamically via `ListTools` protocol (`internal/llm/agent/mcp-tools.go:156-161`). The `GetMcpTools()` function caches tools globally (`internal/llm/agent/mcp-tools.go:140`) and initializes them at startup (`cmd/root.go:109`). Third-party tools can be integrated by running MCP servers and configuring them in `.opencode.json`.

### 3. Are interfaces stable?

**Moderately stable.** The `BaseTool` interface (`internal/llm/tools/tools.go:69-72`) is small and stable with only two methods. The `Provider` interface (`internal/llm/provider/provider.go:53-59`) is also stable with three methods. However, internal types like `ToolCall` (`internal/llm/tools/tools.go:63-67`) and `AgentEvent` (`internal/llm/agent/agent.go:37-46`) leak into tool implementations. The config schema has evolved with explicit validation in `Validate()` (`internal/config/config.go:608-641`). The agent's `Service` interface (`internal/llm/agent/agent.go:48-57`) includes an `Update()` method for runtime model changes, suggesting intentional API surface.

### 4. Are internal APIs modular?

**Yes, with some caveats.** The codebase is organized into clear packages: `llm/tools`, `llm/provider`, `llm/agent`, `config`, `message`, `session`, `permission`, `pubsub`, `lsp`, `tui`. The `App` struct (`internal/app/app.go:25-40`) composes services via interfaces, allowing substitution. However, `CoderAgentTools()` (`internal/llm/agent/tools.go:14-41`) directly instantiates tool implementations rather than receiving them as dependencies, coupling the agent to concrete tool types. The permission system is tightly integrated into each tool rather than being a middleware decorator.

## Architectural Decisions

1. **MCP as primary extension mechanism**: Rather than building a custom plugin system, OpenCode adopted the MCP standard (`internal/llm/agent/mcp-tools.go`), enabling ecosystem compatibility with any MCP server implementation.

2. **Tool-based command model**: Instead of CLI subcommands, all agent capabilities are tools implementing `BaseTool`. This unifies bash execution, file operations, LSP diagnostics, and external MCP tools under a single interface.

3. **Provider factory pattern**: LLM providers are created via `NewProvider()` (`internal/llm/provider/provider.go:86-168`) using a switch on `ModelProvider` enum, allowing new providers to be added by extending the switch statement.

4. **Permission-as-security-layer**: Tools do not directly execute privileged operations; instead they go through `permission.Service.Request()` (`internal/permission/permission.go:74-108`), enabling user approval for dangerous operations while allowing auto-approval for safe commands.

5. **Pub/sub for service communication**: Services like messages, sessions, permissions, and agent events communicate via `pubsub.Broker[T]` (`internal/pubsub/broker.go`), decoupling components.

6. **Config-driven LSP initialization**: LSP clients are initialized based on config (`internal/config/config.go:64-70`), allowing per-language server configuration without code changes.

## Notable Patterns

- **Generic broker pattern**: `pubsub.Broker[T]` (`internal/pubsub/broker.go`) provides pub/sub for any type, used for AgentEvent, Message, PermissionRequest, etc.
- **BaseTool adapter**: MCP tools are wrapped in `mcpTool` struct (`internal/llm/agent/mcp-tools.go:18-23`) implementing `BaseTool`, adapting external protocol to internal interface.
- **Provider client options**: Builder pattern via `ProviderClientOption` (`internal/llm/provider/provider.go:74`) functional options for provider configuration.
- **Context propagation**: Session and message IDs passed via context values (`internal/llm/tools/tools.go:74-84`), avoiding explicit parameter threading.

## Tradeoffs

1. **Tool-centric vs command-centric**: By making everything a tool, the CLI gains consistency but loses traditional subcommand discoverability (e.g., `opencode git commit` vs `bash` tool executing `git commit`).

2. **MCP tool caching**: `GetMcpTools()` caches tools globally (`internal/llm/agent/mcp-tools.go:140`) — efficient but means new MCP servers require restart to take effect.

3. **Permission coupling**: Each tool directly calls `permission.Service.Request()`, creating coupling. A decorator or middleware pattern could make permissions more uniform.

4. **Agent/provider coupling**: `NewAgent()` (`internal/llm/agent/agent.go:73-111`) creates provider instances internally rather than receiving them, limiting testability and flexibility.

5. **Sync map for active requests**: Agent uses `sync.Map` for tracking active requests (`internal/llm/agent/agent.go:70`), which is appropriate for concurrent access but obscures request lifecycle.

## Failure Modes / Edge Cases

1. **MCP server crash**: If an MCP server crashes after tools are registered, calling those tools will fail. The `mcpTool.Run()` (`internal/llm/agent/mcp-tools.go:86-129`) calls `c.Close()` on each invocation, recreating connection each time — resilient but slow.

2. **Permission timeout**: `permission.Service.Request()` (`internal/permission/permission.go:98-107`) waits synchronously for user response with no explicit timeout — a denial that never comes blocks tool execution.

3. **Provider init failure**: If `createAgentProvider()` (`internal/llm/agent/agent.go:706-758`) fails, the agent cannot be created and the application errors out at startup.

4. **Tool name collision**: MCP tools are prefixed with server name (`internal/llm/agent/mcp-tools.go:41`) to avoid collision, but if two MCP servers have tools with the same name, the first one wins.

5. **LSP server detection**: `detectServerType()` (`internal/lsp/client.go:356-375`) relies on command path string matching — non-standard LSP server paths may not be detected correctly.

6. **Config merge conflicts**: `mergeLocalConfig()` (`internal/config/config.go:450-461`) merges local config over global, but there's no conflict resolution strategy for duplicate keys.

## Future Considerations

1. **Tool hot-reload**: Currently MCP tools are cached at startup. A dynamic tool discovery mechanism could allow adding tools without restart.

2. **Formal versioning API**: No explicit versioning of tool or provider interfaces. A stability guarantee system (stable, unstable, experimental) could help external integrators.

3. **Plugin manifest**: MCP configuration is purely in config files. A plugin manifest format could provide richer metadata, auto-discovery, and validation.

4. **Middleware pipeline**: Currently each tool individually handles permissions. A middleware chain could provide consistent cross-cutting concerns (logging, rate-limiting, permissions).

5. **Provider abstraction beyond LLMs**: The provider pattern could theoretically serve other model types (embedding models, reranking) but currently is tightly coupled to chat completion.

## Questions / Gaps

1. **No evidence found** for dynamic loading of compiled plugins (e.g., .so/.dylib files). MCP is the only extension mechanism — no native Go plugin system.

2. **No evidence found** for a public SDK or API for third-party developers to extend opencode programmatically. Extension is config-file driven (MCP servers) not code-driven.

3. **No evidence found** for version stability guarantees or deprecation policies for internal APIs.

4. **No evidence found** for sandboxing of MCP tool execution — tools run with full process privileges.

5. **No evidence found** for automatic rollback if MCP server configuration is invalid — malformed config is validated but no recovery mechanism.

---

Generated by `study-areas/12-extensibility.md` against `opencode`.