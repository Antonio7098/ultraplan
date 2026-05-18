# Repo Analysis: opencode

## State & Context Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | opencode |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` |
| Group | `opencode` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

OpenCode implements a well-structured state and context management pattern using `context.Context` as the primary propagation mechanism. The architecture centralizes application state in an `App` struct (`internal/app/app.go:25-40`) that owns sessions, messages, permissions, and LSP client references. Context is passed through all layers—from CLI entry point through agent processing to tool execution—with explicit cancellation handling at each level. Sessions are modeled as explicit first-class entities with parent-child relationships and full lifecycle management via SQLite persistence.

## Rating

**8/10** — Clean propagation and cancellation. Context flows through all layers, cancellation is well-handled, and sessions are explicit. Minor扣分 for some context values using string keys rather than typed keys, and some `context.Background()` usage in background operations that could propagate cancellation more consistently.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Context creation | Main context created with `context.WithCancel` at CLI entry | `cmd/root.go:97-98` |
| Context propagation | Context passed to `app.New(ctx, conn)` | `cmd/root.go:100` |
| Context propagation | Agent `Run(ctx, ...)` accepts context and derives cancelable subcontext | `internal/llm/agent/agent.go:198-231` |
| Context for tool execution | Session ID and message ID stored via `context.WithValue` | `internal/llm/agent/agent.go:323,336` |
| Cancellation handling | Cancel func stored in `sync.Map` activeRequests | `internal/llm/agent/agent.go:117-133,209` |
| Cancellation in long-running commands | Check `ctx.Done()` before each streaming iteration | `internal/llm/agent/agent.go:278-283` |
| Session modeling | `Session` struct with ID, parent, title, tokens, cost | `internal/session/session.go:12-23` |
| Session service interface | All methods accept `context.Context` | `internal/session/session.go:25-34` |
| Message service | All methods accept `context.Context` | `internal/message/message.go:24-29` |
| Permission service | No context in methods (auto-approve uses session ID) | `internal/permission/permission.go:35-42` |
| Global state | `config.cfg` global pointer | `internal/config/config.go:123` |
| Global state | Theme manager `globalManager` singleton | `internal/tui/theme/manager.go:22-23` |
| ContextWithTimeout | LSP client initialization timeout | `internal/lsp/client.go:235` |
| ContextWithTimeout | LSP server ping timeout | `internal/lsp/client.go:295` |
| ContextWithTimeout | MCP tools fetch timeout (30s) | `cmd/root.go:200-201` |
| ContextWithCancel | TUI message handler context | `cmd/root.go:129` |
| ContextWithCancel | Subscription cleanup context | `cmd/root.go:253` |
| ContextWithValue | Workspace watcher stores itself in context | `internal/lsp/watcher/watcher.go:312` |
| ContextWithValue | Server name stored in context for LSP | `internal/lsp/watcher/watcher.go:317` |
| App struct | Owns Sessions, Messages, History, Permissions, CoderAgent, LSPClients | `internal/app/app.go:25-40` |
| Watcher cancellation | `watcherCancelFuncs` slice with `context.CancelFunc` | `internal/app/app.go:37` |
| Shutdown with timeout | 5-second timeout for LSP client shutdown | `internal/app/app.go:180-184` |
| Broker subscription | Accepts context, detects cancellation via `ctx.Done()` | `internal/pubsub/broker.go:51-85` |

## Answers to Protocol Questions

### 1. How is `context.Context` propagated?

Context is propagated from the CLI entry point (`cmd/root.go:97-98`) where a root context is created with `context.WithCancel(context.Background())`. This context flows through:

1. **App initialization**: `app.New(ctx, conn)` at `cmd/root.go:100`
2. **Agent execution**: `agent.Run(ctx, sess.ID, prompt)` at `internal/app/app.go:131`
3. **Streaming loop**: Context passed to `provider.StreamResponse(ctx, ...)` at `internal/llm/agent/agent.go:324`
4. **Tool execution**: Context passed to `tool.Run(ctx, ...)` at `internal/llm/agent/agent.go:390`
5. **Message/service layers**: All service methods accept `context.Context` (e.g., `internal/session/session.go:27`, `internal/message/message.go:24`)

Session ID and message ID are propagated via `context.WithValue` using typed context keys (`SessionIDContextKey`, `MessageIDContextKey`) at `internal/llm/agent/agent.go:323,336` and `internal/llm/tools/tools.go:26-27`.

### 2. How is cancellation handled?

Cancellation is handled through multiple mechanisms:

1. **Per-session cancellation**: The agent stores a `context.CancelFunc` in a `sync.Map` called `activeRequests` (`internal/llm/agent/agent.go:119-124`). Calling `agent.Cancel(sessionID)` invokes the cancel function.

2. **Checkpoints in streaming**: At `internal/llm/agent/agent.go:278-283`, the loop checks `ctx.Done()` before each iteration:
```go
select {
case <-ctx.Done():
    return a.err(ctx.Err())
default:
    // Continue processing
}
```

3. **Tool execution cancellation**: At `internal/llm/agent/agent.go:353-364`, remaining tool calls are marked as cancelled if context is done mid-execution.

4. **Graceful shutdown**: `app.Shutdown()` at `internal/app/app.go:163-186` cancels all watcher cancel functions and waits for completion with a 5-second timeout per LSP client.

5. **Subscription cleanup**: At `cmd/root.go:261-280`, subscription goroutines watch `ctx.Done()` and clean up resources.

### 3. Is application state centralized or per-command?

Application state is **centralized** in the `App` struct (`internal/app/app.go:25-40`) which holds:
- `Sessions session.Service` — session management
- `Messages message.Service` — message persistence  
- `History history.Service` — file tracking
- `Permissions permission.Service` — permission requests
- `CoderAgent agent.Service` — agent processing
- `LSPClients map[string]*lsp.Client` — LSP connections

Configuration is global via `config.Get()` returning a package-level `cfg *Config` (`internal/config/config.go:123,867-869`).

Theme state is also global via `globalManager` singleton at `internal/tui/theme/manager.go:22-23`.

There is no per-request state isolation beyond the session concept—sessions are the boundary for independent conversations, but the `App` struct itself is shared across all sessions.

### 4. How are sessions modeled?

Sessions are explicit first-class entities with rich modeling:

**Structure** (`internal/session/session.go:12-23`):
```go
type Session struct {
    ID               string
    ParentSessionID  string  // For sub-sessions (title generation, tasks)
    Title            string
    MessageCount     int64
    PromptTokens     int64
    CompletionTokens int64
    SummaryMessageID string  // For conversation compaction
    Cost             float64
    CreatedAt        int64
    UpdatedAt        int64
}
```

**Session types**:
1. **Regular sessions**: Created via `Sessions.Create(ctx, title)` for normal conversations
2. **Title sessions**: `CreateTitleSession(ctx, parentSessionID)` at `internal/session/session.go:68-80` — creates a child session for title generation with ID `"title-" + parentSessionID`
3. **Task sessions**: `CreateTaskSession(ctx, toolCallID, parentSessionID, title)` at `internal/session/session.go:54-66` — creates child session for task sub-agents

**Lifecycle**: Sessions persist to SQLite via `db.Querier` methods (`internal/db/sessions.sql.go`). They publish events via pubsub broker for UI reactivity.

**Usage in agent**: At `internal/llm/agent/agent.go:251-267`, the agent retrieves session and checks for `SummaryMessageID` to implement conversation compaction (truncating history to a summary).

## Architectural Decisions

1. **Context as primary propagation mechanism**: All service methods accept `context.Context`, ensuring cancellation and timeouts propagate through the call stack.

2. **Session as the unit of work**: Sessions are not just data—they own their lifecycle, messages, and relationship hierarchy (parent-child).

3. **Pubsub for state change notifications**: Services like `Sessions`, `Messages`, `Permissions` all embed `pubsub.Broker[T]` to broadcast state changes to the TUI and other subscribers.

4. **Cancellation stored in sync.Map**: The agent's `activeRequests` map allows per-session cancellation without additional synchronization.

5. **Global config with Get() accessor**: Configuration is a package-level variable accessed via `config.Get()` rather than dependency-injected, trading some testability for simplicity.

## Notable Patterns

- **Context values for correlation IDs**: Session ID and message ID are placed in context via `context.WithValue` and retrieved in tools via `GetContextValues(ctx)` at `internal/llm/tools/tools.go:74-84`.

- **Background title generation**: At `internal/llm/agent/agent.go:241-249`, title generation runs in a detached goroutine with `context.Background()` (not derived from request context), ensuring it doesn't block or get cancelled when the request completes.

- **Graceful degradation with timeouts**: LSP client initialization uses 5-second timeout (`internal/lsp/client.go:235`), MCP tools fetch uses 30-second timeout (`cmd/root.go:200`), workspace watching uses 30-second timeout (`internal/app/lsp.go:37`).

- **Subscription cleanup with timeout**: At `cmd/root.go:272-279`, the cleanup waits up to 5 seconds for subscription goroutines to complete before forcing closure.

## Tradeoffs

1. **Global config vs testability**: Using package-level `cfg` variable at `internal/config/config.go:123` simplifies usage but makes testing harder without abstraction.

2. **Background context independence**: Title generation uses `context.Background()` at line 245, so it won't be cancelled if the main request completes or is cancelled—a deliberate choice to ensure titles are generated even if user aborts.

3. **Sync.Map for active requests**: Using `sync.Map` at `internal/llm/agent/agent.go:70` for cancellation functions provides lock-free reads but sacrifices type safety and discoverability compared to a typed structure.

4. **No per-request isolation in App**: The `App` struct is shared across all sessions. While sessions are isolated from each other, the App-level resources (like LSP clients) are shared, which could cause issues if two sessions interact with the same LSP server differently.

## Failure Modes / Edge Cases

1. **Orphaned subscription goroutines**: If `cancel()` is called but `wg.Wait()` hangs beyond 5 seconds (`cmd/root.go:276`), the channel is closed anyway, potentially losing in-flight events.

2. **Title generation race**: If session is deleted before title generation completes at `internal/llm/agent/agent.go:245`, the background goroutine will attempt to save to a non-existent session.

3. **Context value key collisions**: Using string-based keys for workspace watcher context (`internal/lsp/watcher/watcher.go:312-317`) could collide with other packages using the same keys. The pattern uses string literals rather than custom types.

4. **Permission service lacks context**: The permission service methods (`internal/permission/permission.go:35-42`) don't accept context, so permission checks can't be timeout-controlled or cancelled.

5. **MCP tools goroutine leak**: At `cmd/root.go:195-207`, if `GetMcpTools` hangs indefinitely, the goroutine runs forever since there's no cancellation mechanism after the 30-second timeout context expires.

## Future Considerations

1. **Use typed context keys**: Replace string-based context keys (`"workspaceWatcher"`, `"serverName"`) with custom types to avoid collisions.

2. **Add context to permission service**: Consider passing `context.Context` to permission service methods for timeout/cancellation support.

3. **Structured activeRequests**: Replace `sync.Map` with a typed structure for better type safety and IDE support.

4. **Context propagation in background goroutines**: Consider whether title generation should respect session cancellation for consistency.

## Questions / Gaps

1. **No evidence found** for application state being passed via context (as opposed to being accessed via service injection). The App struct is accessed directly rather than being placed in context.

2. **No evidence found** for request-level isolation—sessions share the same `App` instance with all its services.

3. **Partial evidence** for context cancellation propagation to tools—while the agent checks `ctx.Done()` and passes context to `tool.Run()`, some internal operations (like `a.messages.Update(context.Background(), ...)` at `internal/llm/agent/agent.go:288`) use `context.Background()` instead of the request context.

---

Generated by `study-areas/07-state-context.md` against `opencode`.