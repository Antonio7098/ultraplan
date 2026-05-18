# Repo Analysis: mitchellh-cli

## State & Context Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | mitchellh-cli |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/mitchellh-cli` |
| Group | `mitchellh-cli` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

A minimal CLI framework predating widespread `context.Context` adoption. Commands receive raw string args and return integer exit codes. State is centralized in `CLI` struct but flows through direct method calls rather than context propagation. Cancellation is limited to signal handling in UI layer only.

## Rating

**4/10** — Basic context handling

The library has no `context.Context` usage anywhere. Cancellation is limited to signal handling in the `BasicUi.ask()` method (`ui.go:62-104`). The `CLI.Run()` method (`cli.go:177-269`) executes commands synchronously with no mechanism for timeout or cancellation propagation. Commands are isolated and communicate via return codes only.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| No context.Context | Zero occurrences of `context.Context`, `context.WithCancel`, or `context.WithTimeout` | N/A |
| CLI struct state | `CLI` struct holds Args, Commands map, Name, Version, HelpWriter, ErrorWriter, and internal radix tree for routing | `cli.go:49-149` |
| Command interface | `Command.Run(args []string) int` — no context parameter | `command.go:26` |
| Signal handling | `signal.Notify(sigCh, os.Interrupt)` in BasicUi.ask for interrupt detection | `ui.go:69-71` |
| ConcurrentUi wrapper | `sync.Mutex` protecting UI operations | `ui_concurrent.go:11` |
| MockUi thread safety | `sync.Once` for initialization, `sync.RWMutex` on syncBuffer | `ui_mock.go:32,85-86` |
| CLI once initialization | `sync.Once` for deferred init in `CLI.Run()` | `cli.go:134,178` |

## Answers to Protocol Questions

### 1. How is `context.Context` propagated?

**No propagation — context.Context is not used at all.**

The `Command.Run()` method signature is `Run(args []string) int` with no context parameter (`command.go:26`). The `CLI.Run()` method (`cli.go:177-269`) calls `command.Run(c.SubcommandArgs())` directly with no context wrapping. There are zero references to `context.Context`, `context.WithCancel`, or `context.WithTimeout` in the entire codebase.

### 2. How is cancellation handled?

**Limited to signal handling in UI layer only.**

`BasicUi.ask()` (`ui.go:62-104`) registers for `os.Interrupt` signals and returns `errors.New("interrupted")` when received (`ui.go:103`). This cancellation only affects the `Ask`/`AskSecret` methods — not command execution. There is no mechanism for command-level cancellation, timeout, or graceful shutdown. The `CLI.Run()` method is synchronous and blocking with no timeout support.

### 3. Is application state centralized or per-command?

**Centralized in CLI struct, but state is NOT passed to commands.**

The `CLI` struct (`cli.go:49-149`) holds all application state: command map (`Commands map[string]CommandFactory`), parsed args, help/version flags, autocomplete settings, and IO writers. However, commands receive only `[]string` args — they have no access to the CLI struct or any centralized state. The `CommandFactory` pattern (`command.go:64-67`) allows deferred instantiation but the factory receives no contextual information.

### 4. How are sessions modeled?

**No explicit session concept.**

There is no session, request, or scope abstraction in this library. Each `CLI.Run()` invocation is independent. State persists only in the `CLI` struct between calls. The `sync.Once` patterns (`cli.go:134`, `ui_mock.go:32`) are for one-time initialization only, not session lifecycle.

## Architectural Decisions

1. **Exit codes over errors**: Commands return `int` exit codes rather than `error` values. The CLI wraps errors from command factories only (`cli.go:243-244`), not from command execution.

2. **No context propagation**: The library predates Go's context package adoption. The interface design uses raw args and exit codes.

3. **UI as separate concern**: The `Ui` interface (`ui.go:19-43`) is decoupled from command execution. UI state (readers, writers) is not shared with commands.

4. **Command factory pattern**: `CommandFactory func() (Command, error)` (`command.go:64-67`) allows expensive initialization to be deferred and enables dependency injection.

## Notable Patterns

- **Decorator wrapping**: `ConcurrentUi`, `PrefixedUi`, `ColoredUi` all wrap a `Ui` interface — similar to classic structural decoration.
- **sync.Once deferred init**: `CLI.Run()` uses `once.Do(c.init)` (`cli.go:178`) to ensure single initialization.
- **Radix tree command routing**: Nested subcommands use `armon/go-radix` tree for longest-prefix matching (`cli.go:333`).

## Tradeoffs

| Tradeoff | Consequence |
|----------|-------------|
| No context.Context | Cannot propagate deadlines, cancellation, or request-scoped values to commands. Long-running commands cannot be interrupted cleanly. |
| No error from command.Run | Callers cannot distinguish transient vs permanent failures; only exit code semantics. |
| UI decoupled from commands | Commands cannot output to UI directly — must receive UI as separate dependency if needed. |
| No timeout support | CLI.Run() blocks indefinitely; no way to set command execution timeout. |

## Failure Modes / Edge Cases

- **Stuck command**: If a command's `Run()` method blocks indefinitely, there is no mechanism to cancel it — the CLI will hang.
- **No graceful shutdown**: SIGINT during command execution will terminate the process without cleanup opportunity.
- **No request ID or trace context**: Cannot correlate CLI invocations across logging or debugging.
- **State leakage between runs**: If reusing a `CLI` instance across multiple invocations, internal state (command tree, autocomplete) persists — may cause unexpected behavior if commands are unregistered.

## Future Considerations

This library predates `context.Context` (added in Go 1.7). Modern Go CLI guidance recommends:
- Passing `context.Context` to command `Run` methods
- Supporting `context.WithCancel`, `context.WithTimeout`, `context.WithDeadline`
- Using structured logging with trace/request IDs from context
- Implementing graceful shutdown on SIGINT/SIGTERM

## Questions / Gaps

- **No evidence found** for context propagation, cancellation propagation, or session modeling in this codebase. Searched all `.go` files for `context.`, `Cancel`, `Timeout`, `Deadline`, `session`, `state` patterns — no matches.

---

Generated by `study-areas/07-state-context.md` against `mitchellh-cli`.