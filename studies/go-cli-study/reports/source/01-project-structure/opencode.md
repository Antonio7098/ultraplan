# Repo Analysis: opencode

## Project Structure & Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | opencode |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` |
| Group | `opencode` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Opencode is a terminal-based AI assistant with a well-structured Go project that follows Go conventions for CLI tools. The project uses `cmd/` for CLI entry points, `internal/` for application logic, and employs a clean dependency flow from CLI to business logic. No `pkg/` directory exists, indicating no shared libraries are extracted.

## Rating

**8/10** — Clean layering with understandable ownership. The CLI layer in `cmd/root.go:24-309` is thin, delegating to `internal/app.App` for business logic. Dependency direction is strictly one-way from CLI to business logic, with no reverse dependencies. Minor扣分原因是部分大型文件（如`internal/config/config.go:980行）可能受益于进一步拆分为更小的子包。

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Entry point | `main.go:1-14` calls `cmd.Execute()` | `main.go:13` |
| Command registration | Cobra root command with flags | `cmd/root.go:24-309` |
| Thin CLI layer | `RunE` creates `App` and delegates | `cmd/root.go:49-183` |
| Business logic | `App` struct holds service instances | `internal/app/app.go:25-40` |
| Dependency injection | Services passed via constructor | `internal/app/app.go:42-81` |
| internal packages | 16 subdirectories in `internal/` | `internal/:20-36` |
| No pkg/ | No shared library extraction | glob search: none |
| DB layer | SQLC-generated queries in `internal/db/` | `internal/db/db.go` |
| TUI layer | Bubble Tea-based TUI in `internal/tui/` | `internal/tui/tui.go:1-10` |
| LLM layer | Agent service in `internal/llm/agent/` | `internal/llm/agent/agent.go:1` |
| Config management | Viper-based with nested struct | `internal/config/config.go:1-50` |
| Pub/sub pattern | Event system in `internal/pubsub/` | `cmd/root.go:255-259` |

## Answers to Protocol Questions

1. **Why are folders organized this way?**
   - `cmd/` holds CLI interface (Cobra commands) — thin wrapper that parses flags and creates the App
   - `internal/` holds all business logic organized by domain (app, db, llm, tui, etc.)
   - No `pkg/` because no code is extracted for external reuse
   - `internal/` subdirectories map to functional domains: `db` (database), `llm` (AI agents), `tui` (terminal UI), `config` (configuration), etc.

2. **What belongs in `cmd/` vs `internal/` vs `pkg/`?**
   - `cmd/`: CLI entry points, flag parsing, argument validation, main orchestration
   - `internal/`: Business logic, domain services, database, LLM integration, TUI components
   - `pkg/`: Not used — no shared libraries needed

3. **Is the CLI layer thin?**
   - Yes. `cmd/root.go:49-183` contains only flag parsing and orchestration. The `RunE` function creates `App` via `app.New()` and delegates all logic to it. No business logic in `cmd/`.

4. **Where does business logic actually live?**
   - `internal/app/app.go:42-81` — App initialization and service composition
   - `internal/llm/agent/agent.go` — AI agent logic (22KB, most complex)
   - `internal/db/` — SQLC-generated database queries
   - `internal/tui/tui.go` — TUI rendering
   - `internal/config/config.go` — Configuration management (980 lines, could be split)

5. **How do they prevent package coupling?**
   - Dependency injection via constructors (`app.New()` receives `*sql.DB`)
   - Services export interfaces (e.g., `session.Service`, `message.Service`)
   - `internal/` packages cannot be imported by external repos (Go's internal package rule)
   - No circular dependencies observed

## Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Thin CLI via Cobra | Standard Go CLI pattern, easy testability |
| Internal packages for domain logic | Go's internal package protection prevents external import |
| Service-based architecture | `App` composes independent services (`Sessions`, `Messages`, `Permissions`, `CoderAgent`) |
| Dependency injection | `App.New()` receives dependencies, enabling mocking in tests |
| SQLC for DB | Type-safe SQL queries generated from schema |
| Bubble Tea for TUI | Functional TUI framework with good testability |

## Notable Patterns

1. **Subscription-based communication**: `cmd/root.go:255-259` uses pub/sub for services to publish events to the TUI
2. **Panic recovery**: `main.go:9-11` and throughout with `logging.RecoverPanic`
3. **Background initialization**: MCP tools initialized in background goroutine (`cmd/root.go:195-207`)
4. **Structured logging**: Using `log/slog` internally with logging wrapper
5. **Context propagation**: All operations use `context.Context` for cancellation

## Tradeoffs

| Tradeoff | Impact |
|----------|--------|
| Large `internal/config/config.go` (980 lines) | Single file for all configuration — may become hard to maintain |
| No `pkg/` for shared types | No external reuse, but keeps it simple |
| Global state in `config.Get()` | Quick access but reduces testability |
| TUI coupled to app via subscriptions | Flexible event-driven but complex tracing |

## Failure Modes / Edge Cases

1. **Config hot-reload missing**: Changes to config file after startup don't take effect
2. **LSP client connection failures**: `internal/app/app.go:60` initializes LSP clients in background with no retry logic
3. **Subscription channel blocking**: `cmd/root.go:235` drops messages after 2-second timeout if TUI is slow
4. **MCP tools initialization**: 30-second timeout (`cmd/root.go:200`) may cause tools to be unavailable on first use

## Future Considerations

1. Split `internal/config/config.go` into smaller packages (e.g., `config/agent`, `config/llm`, `config/mcp`)
2. Add interface definitions for services to improve testability
3. Consider extracting `internal/llm/models` as a standalone package if other projects need LLM model definitions
4. Add integration tests that verify the full CLI flow

## Questions / Gaps

1. **Testing strategy unclear**: No `*_test.go` files visible in initial scan — how is the CLI tested?
2. **Migration management**: `internal/db/migrations/` — what migration tool is used? No evidence of sqlc.yaml processing for migrations
3. **Plugin system**: MCP servers are configured but how are they dynamically loaded?

---
Generated by `study-areas/01-project-structure.md` against `opencode`.