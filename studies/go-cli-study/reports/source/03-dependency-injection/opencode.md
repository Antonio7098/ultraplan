# Repo Analysis: opencode

## Dependency Injection & Wiring

### Repo Info

| Field | Value |
|-------|-------|
| Name | opencode |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` |
| Group | `opencode` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Opencode employs a centralized composition root pattern with clear dependency construction in `app.New()` (`internal/app/app.go:42-81`). Services are exposed through interface types (`Service` interfaces at `internal/session/session.go:25-34`, `internal/permission/permission.go:35-42`, `internal/llm/agent/agent.go:48-57`). Dependencies flow downward from the `App` struct to commands. Global state is limited to configuration (`cfg *Config` at `internal/config/config.go:123`) and a `globalManager` theme manager (`internal/tui/theme/manager.go:23`). The `context.Context` is used for request-scoped cancellation and value propagation.

## Rating

**8/10** — Clear composition root with explicit wiring. Services use interfaces for abstraction. Some globals exist (config, theme manager) but are narrowly scoped.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Composition root | `app.New()` constructs all dependencies | `internal/app/app.go:42-81` |
| Interface abstraction | `Service` interface for session | `internal/session/session.go:25-34` |
| Interface abstraction | `Service` interface for permissions | `internal/permission/permission.go:35-42` |
| Interface abstraction | `Service` interface for agent | `internal/llm/agent/agent.go:48-57` |
| Context usage | `context.WithCancel` for request-scoped cancellation | `cmd/root.go:97-98` |
| Context usage | `context.WithValue` for session/message ID propagation | `internal/llm/agent/agent.go:165,336` |
| Broker pattern | Pub/sub broker for event-driven communication | `internal/pubsub/broker.go:10-16` |
| Global config | Package-level `cfg *Config` variable | `internal/config/config.go:123` |
| Global theme | `globalManager` for theme management | `internal/tui/theme/manager.go:23` |
| Constructor pattern | `NewService()`, `NewAgent()`, `NewPermissionService()` | `internal/session/session.go:150-156` |

## Answers to Protocol Questions

1. **Where are dependencies constructed?**
   Dependencies are constructed in `app.New()` (`internal/app/app.go:42-81`), which serves as the composition root. The function receives a database connection and constructs all services: `Sessions`, `Messages`, `History`, `Permissions`, and the `CoderAgent`. The agent is initialized with tools via `CoderAgentTools()` (`internal/llm/agent/tools.go:14-41`).

2. **How are services passed around?**
   Services are passed via struct fields on the `App` struct (`internal/app/app.go:25-40`). Commands receive the `*App` instance directly (`cmd/root.go:100-104`) and access services through these fields. For example, `app.Sessions`, `app.CoderAgent`, etc.

3. **Is wiring centralized?**
   Yes. The `app.New()` function is the single location where all services are instantiated and wired together. Tools are composed in `CoderAgentTools()` (`internal/llm/agent/tools.go:14-41`) which is called from `app.New()`. The `setupSubscriptions()` function (`cmd/root.go:249-282`) wires up the pub/sub brokers to the TUI.

4. **Are globals avoided?**
   Mostly. There are two notable exceptions:
   - `cfg *Config` at `internal/config/config.go:123` — a package-level config singleton accessed via `config.Get()`
   - `globalManager` at `internal/tui/theme/manager.go:23` — a package-level theme manager
   
   These globals are narrowly scoped and used for configuration and theming rather than core application state.

5. **Is initialization explicit?**
   Yes. All initialization is explicit in `app.New()` and follows a clear order:
   1. Database queries (`db.New(conn)`)
   2. Services (`session.NewService(q)`, `message.NewService(q)`, etc.)
   3. App struct fields
   4. Theme initialization (`app.initTheme()`)
   5. Background LSP initialization (`go app.initLSPClients(ctx)`)
   6. Agent construction (`agent.NewAgent(...)`)

## Architectural Decisions

- **Composition root pattern**: All dependency wiring centralized in `app.New()`. The `App` struct holds all service instances and is passed to commands.
- **Interface abstraction for services**: Services like `session.Service`, `message.Service`, and `permission.Service` define interfaces that hide implementation details (`internal/session/session.go:25-34`, `internal/permission/permission.go:35-42`).
- **Pub/sub broker for event propagation**: A generic `Broker[T]` (`internal/pubsub/broker.go:10-16`) enables decoupled event communication between services and the TUI via the `Suscriber[T]` interface (`internal/pubsub/events.go:11-13`).
- **Context for request-scoped values**: `context.Context` is used for cancellation (`cmd/root.go:97`) and to propagate session IDs and message IDs through the call chain (`internal/llm/agent/agent.go:165,336`).
- **Global config singleton**: `cfg *Config` (`internal/config/config.go:123`) is a package-level variable initialized via `config.Load()` and accessed via `config.Get()`. This is a deliberate trade-off for configuration accessibility.

## Notable Patterns

- **Service interface pattern**: Each service (session, message, permission, agent) defines a `Service` interface. Concrete implementations embed `*pubsub.Broker[T]` for event publishing.
- **Constructor functions**: `NewService()`, `NewAgent()`, `NewPermissionService()` return interface types, enabling dependency injection and testability.
- **Tool composition**: `CoderAgentTools()` composes tools by passing services to tool constructors (`internal/llm/agent/tools.go:14-41`).
- **Background initialization**: LSP clients initialize asynchronously via `go app.initLSPClients(ctx)` (`internal/app/app.go:59-60`).

## Tradeoffs

- **Global config**: Using a package-level `cfg *Config` singleton (`internal/config/config.go:123`) trades some testability for simplicity. It is accessed via `config.Get()` throughout the codebase.
- **Global theme manager**: `globalManager` (`internal/tui/theme/manager.go:23`) is similarly global. Theme changes affect the entire application.
- **Background goroutines**: LSP client initialization and workspace watchers run in background goroutines managed via `sync.WaitGroup` and cancellation functions (`internal/app/lsp.go`). Cleanup is handled in `Shutdown()` but adds complexity.
- **Interface-only testability**: While services are accessed via interfaces, testing requires either real database connections or mocking the `db.Querier` interface.

## Failure Modes / Edge Cases

- **Config not loaded**: Functions like `ShouldShowInitDialog()` (`internal/config/init.go:20-42`) check if `cfg == nil` and return errors. If `config.Load()` fails in `cmd/root.go:85-88`, the application exits.
- **Session busy**: The agent tracks active requests in a `sync.Map` (`internal/llm/agent/agent.go:70`) and returns `ErrSessionBusy` if a session is already processing (`internal/llm/agent/agent.go:203-204`).
- **Permission denial**: Tool execution is canceled if permission is denied (`internal/llm/agent/agent.go:396-411`), with subsequent tool calls also canceled.
- **LSP client failure**: LSP clients are restarted via `restartLSPClient()` (`internal/app/lsp.go:99-125`) if they crash, but this adds recovery complexity.

## Future Considerations

- Consider injecting config as a dependency rather than using a global singleton for improved testability.
- The `sync.Map` for `activeRequests` could be replaced with a more structured concurrency pattern.
- MCP tools are fetched asynchronously (`internal/llm/agent/mcp-tools.go:140`) and cached globally — consider refresh mechanisms.

## Questions / Gaps

- **Config global trade-off**: The config global at `internal/config/config.go:123` is accessed via `config.Get()` throughout. This is a conscious design choice, but worth noting as a deviation from pure DI.
- **Tool initialization timing**: MCP tools are fetched in `initMCPTools()` (`cmd/root.go:195-207`) as a fire-and-forget goroutine. If tools are needed before they're fetched, behavior may be unexpected.

---

Generated by `study-areas/03-dependency-injection.md` against `opencode`.