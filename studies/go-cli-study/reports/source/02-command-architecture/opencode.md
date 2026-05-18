# Repo Analysis: opencode

## Command Architecture

### Repo Info

| Field | Value |
|-------|-------|
| Name | opencode |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` |
| Group | `opencode` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Opencode uses a minimal single-command architecture with the Cobra framework. The root command (`root.go:24`) is the only command—it handles both interactive TUI mode and non-interactive prompt mode via flags. There are no subcommands, no command composition, and no lifecycle hooks beyond flag parsing in `RunE`. The `cmd/schema/main.go` is a standalone schema generator binary, not part of the main command tree. Commands are best described as **imperative**—the `RunE` function directly orchestrates app initialization, subscription setup, and TUI execution.

## Rating

**5/10** — Commands are somewhat organized but the root command contains mixed responsibilities: config loading, DB connection, MCP tool initialization, subscription setup, and TUI orchestration all live in `RunE` (`cmd/root.go:49-183`). There is no command composition or reusable scaffolding patterns. The architecture would not scale cleanly to 100+ commands.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Command definition | Single `rootCmd = &cobra.Command{...}` | `cmd/root.go:24` |
| Subcommand registration | No subcommands exist | N/A |
| Command entrypoint | `main.go:13` calls `cmd.Execute()` | `cmd/root.go:284` |
| RunE signature | `RunE: func(cmd *cobra.Command, args []string) error` | `cmd/root.go:49` |
| Flag definitions | `rootCmd.Flags().BoolP/StringP` calls | `cmd/root.go:291-308` |
| Flag completion | `RegisterFlagCompletionFunc` for output-format | `cmd/root.go:306` |
| Schema binary | Separate `cmd/schema/main.go` (not a Cobra subcommand) | `cmd/schema/main.go:26` |
| App initialization | `app.New(ctx, conn)` called in `RunE` | `cmd/root.go:100` |
| Subscription setup | `setupSubscriptions()` helper in same file | `cmd/root.go:249-281` |
| TUI execution | `program.Run()` from Bubble Tea | `cmd/root.go:173` |

## Answers to Protocol Questions

### 1. How are subcommands registered?

**No subcommands exist.** The only command is `rootCmd` defined at `cmd/root.go:24`. Subcommand registration would use `rootCmd.AddCommand(&cobra.Command{...})`, but this pattern is not used anywhere in the codebase. The `cmd/schema/main.go` is a standalone `main` package, not wired into the root command tree.

### 2. How is command discovery handled?

There is no command discovery mechanism. The binary has a single entry point (`main.go:13` → `cmd.Execute()` → `rootCmd.Execute()`). If more commands existed, Cobra's default behavior would handle help/version flag handling, but no explicit discovery pattern (e.g., `InitDefaultSubcommand()` or similar) is used.

### 3. Are commands declarative or imperative?

**Imperative.** The `RunE` function at `cmd/root.go:49` is a monolithic procedural block that:
1. Parses flags (`cmd/root.go:61-65`)
2. Validates format (`cmd/root.go:68-69`)
3. Changes directory (`cmd/root.go:72-84`)
4. Loads config (`cmd/root.go:85-88`)
5. Connects DB (`cmd/root.go:91-94`)
6. Creates app (`cmd/root.go:100-104`)
7. Initializes MCP tools (`cmd/root.go:109`)
8. Dispatches to either non-interactive flow (`cmd/root.go:112-115`) or TUI flow (`cmd/root.go:117-173`)

This is a single-purpose orchestrator, not a declarative command graph.

### 4. How do parent/child commands communicate?

There are no parent/child command relationships. Communication within the single command flows through:
- **Direct function calls**: `initMCPTools()`, `setupSubscriptions()` are called directly from `RunE`
- **Pub/sub events**: `setupSubscriptions()` at `cmd/root.go:249` wires up event channels from `app.Sessions`, `app.Messages`, `app.Permissions`, `app.CoderAgent` to the TUI message queue (`ch chan tea.Msg`)
- **Context propagation**: `context.WithCancel()` passed through subscription goroutines at `cmd/root.go:253`

### 5. How much logic exists directly in commands?

**Significant logic lives in the command layer.** The `RunE` function spans ~130 lines (`cmd/root.go:49-183`) including:
- Flag parsing and validation (`cmd/root.go:61-69`)
- Config loading (`cmd/root.go:85-88`)
- DB connection (`cmd/root.go:91-94`)
- App initialization (`cmd/root.go:100-104`)
- MCP tool initialization with its own goroutine and timeout (`cmd/root.go:195-207`)
- Subscription setup with 5 subscribers (`cmd/root.go:255-259`)
- TUI recovery logic (`cmd/root.go:187-193`)
- Cleanup functions (`cmd/root.go:156-170`)

Business logic (agent execution, tool handling, LSP integration) is properly abstracted in `internal/llm/agent/` and `internal/app/`, but orchestration logic is not DRY within the command layer.

## Architectural Decisions

- **Single command, flag-driven modes**: Instead of subcommands like `opencode interactive` vs `opencode prompt`, the project uses flags (`-p` for prompt, `-f` for format). This avoids command hierarchy complexity but conflates flag validation with command execution.
- **Inline subscription wiring**: The `setupSubscriptions()` function (`cmd/root.go:249-281`) manually wires 5 event subscribers into a single TUI message channel. This pattern is non-generic—adding a new subscriber requires modifying the command file.
- **Separate schema binary**: `cmd/schema/main.go` is a standalone program that generates JSON schema via `generateSchema()`. It is not integrated into the main command tree, suggesting it was likely used for development/documentation rather than a `opencode schema` subcommand.

## Notable Patterns

- **Bubble Tea TUI**: Uses `tea.NewProgram()` (`cmd/root.go:120`) with alt screen mode for the interactive interface.
- **Global zone manager**: `zone.NewGlobal()` (`cmd/root.go:119`) from `github.com/lrstanley/bubblezone` for mouse handling.
- **Goroutine-safe subscription model**: `setupSubscriber<T>()` (`cmd/root.go:209-247`) is a generic helper that fans out events to the TUI channel with deadlock-avoidance via select with timeout.
- **Panic recovery wrappers**: `logging.RecoverPanic()` wraps goroutines (`cmd/root.go:137`, `cmd/root.go:219`, `cmd/root.go:267`) to prevent cascading failures.

## Tradeoffs

**Pros:**
- Simple command structure—easy to understand for a single-purpose CLI
- Clean separation between business logic (`internal/app/`, `internal/llm/`) and command wiring
- Pub/sub decouples services from TUI

**Cons:**
- `RunE` is a large procedural function—violates single responsibility at the command layer
- No command composition—adding new commands requires touching the root command structure
- No lifecycle hooks (pre-run, post-run) beyond flag parsing; cleanup is done inline via `defer`
- Flag validation and config loading interleaved with orchestration
- No interface or base type for command scaffolding

## Failure Modes / Edge Cases

- If `config.Load()` fails, the error is returned but DB connection (opened just before) is not closed—the defer at `cmd/root.go:106` only runs on success path for `app.New()`.
- The MCP tools initialization (`cmd/root.go:195-207`) runs in a detached goroutine with a 30-second timeout. If it panics, `RecoverPanic` handles it, but errors are silently logged.
- Subscription cleanup (`cmd/root.go:261-279`) has a 5-second timeout; if any subscriber goroutine hangs, events may be dropped.
- TUI recovery (`cmd/root.go:187-193`) simply quits the program—no attempt to restart or preserve state.

## Future Considerations

- Consider extracting command orchestration into a separate package to reduce `RunE` size
- Add a `PreRunE`/`PostRunE` pattern or command base type to formalize lifecycle hooks
- If subcommands are added, extract subscription wiring into a reusable `App.WithSubscriptions()` pattern
- Schema generator could be integrated as a hidden `opencode schema` command via `cobra.EnableHiddenSubcommands()`

## Questions / Gaps

- **Command grouping**: No evidence of command clusters or command families. The codebase appears to have been designed for a single command and not extended to subcommands.
- **Help generation**: Uses Cobra's built-in help generation via `cmd.Help()` call at `cmd/root.go:52` when `--help` flag is detected. No custom help formatter observed.
- **Factory/scaffolding functions**: No evidence of command factories or base types. Each command appears to be hand-written.

---

Generated by `study-areas/02-command-architecture.md` against `opencode`.