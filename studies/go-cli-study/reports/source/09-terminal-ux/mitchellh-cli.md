# Repo Analysis: mitchellh-cli

## Terminal UX & Interaction Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | mitchellh-cli |
| Path | `repos/mitchellh-cli` |
| Group | `mitchellh-cli` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

This is a CLI framework library, not an application with rich terminal UX. It provides foundational building blocks (UI interface, color support, concurrent wrapping, help generation, autocomplete). The design emphasizes composability through interface layering (BasicUi → ColoredUi → PrefixedUi → ConcurrentUi) rather than rich terminal rendering. No interactive prompts, progress indicators, or streaming text handling were found—this is infrastructure for CLI authors, not a terminal UX experience.

## Rating

**4/10** — Functional but rough. The library provides essential UI abstractions but lacks modern terminal polish. No interactive prompts beyond basic Ask/AskSecret, no progress indicators, no streaming support. Interruptibility is present in BasicUi.Ask via signal handling (`ui.go:69-103`). The architecture is clean and testable but represents foundational building blocks rather than a polished end-user experience.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| UI Interface | `Ui` interface defines Ask, AskSecret, Output, Info, Error, Warn methods | `ui.go:19-43` |
| Basic UI | `BasicUi` implementation using bufio.Reader and fmt.Fprint | `ui.go:48-128` |
| Color Support | `ColoredUi` wraps Ui with color attributes via `fatih/color` | `ui_colored.go:30-72` |
| Concurrent Safety | `ConcurrentUi` wraps Ui with mutex locking | `ui_concurrent.go:9-54` |
| Prefixed Output | `PrefixedUi` adds prefix strings to output methods | `ui.go:131-187` |
| Interrupt Handling | Signal notification in Ask for interruptibility | `ui.go:69-103` |
| Secret Input | Uses `speakeasy` for password-style input when TTY detected | `ui.go:79-80` |
| Mock UI | Thread-safe `MockUi` for testing with syncBuffer | `ui_mock.go:27-116` |
| Help Generation | `BasicHelpFunc` and `FilteredHelpFunc` for command help | `help.go:17-79` |
| Autocomplete | Integrates `posener/complete` for bash/zsh/fish completion | `cli.go:91-94` |
| UiWriter | `UiWriter` implements io.Writer for log integration | `ui_writer.go:6-18` |

## Answers to Protocol Questions

### 1. How is terminal rendering handled?

No dedicated terminal rendering library is used. Output is plain text via `fmt.Fprint` to an `io.Writer`. The `ColoredUi` (`ui_colored.go`) wraps output with ANSI color codes using `fatih/color`, but there is no terminal dimension handling, cursor positioning, or screen clearing. Terminal rendering is intentionally minimal—this is a building-block library.

### 2. How are loading states shown?

**No clear evidence found.** The codebase contains no loading indicators, spinners, progress bars, or any loading state feedback mechanism. The UI interface (`ui.go:19-43`) only defines Output, Info, Error, Warn methods for static text output. This is a gap in the library's UX design.

### 3. How are prompts implemented?

Prompts are implemented via `BasicUi.Ask` and `BasicUi.AskSecret` (`ui.go:54-105`). Ask uses a go-routine with channel-based concurrency (`ui.go:74-91`) to handle input asynchronously. Interruptibility is supported via `os.Signal` notification (`ui.go:69-71`). Secret input uses `speakeasy.Ask()` when a TTY is detected (`ui.go:79-80`), otherwise falls back to plain `bufio.Reader`. The `PrefixedUi` (`ui.go:141-155`) can wrap prompts with prefix strings. No interactive selection, confirmation dialogs, or multi-step wizards exist.

### 4. Is the UX interruptible?

**Yes, partially.** `BasicUi.ask()` (`ui.go:62-105`) registers for `os.Interrupt` signals (`ui.go:69-71`) and returns an error on interrupt (`ui.go:98-103`). This covers Ctrl+C during prompts. However, there is no graceful shutdown mechanism for long-running operations—only input prompts respect interrupts. No context propagation or cancellation tokens were found.

## Architectural Decisions

- **Interface-driven composability**: The `Ui` interface (`ui.go:19-43`) allows multiple implementations to be layered. A typical stack might be: `ConcurrentUi` → `ColoredUi` → `PrefixedUi` → `BasicUi`.
- **Concurrency via wrapping**: Thread safety is achieved by wrapping a `Ui` with `ConcurrentUi` (`ui_concurrent.go`), not by making implementations thread-safe internally.
- **Factory pattern for commands**: `CommandFactory` (`command.go:64-67`) creates command instances on demand to keep initialization cheap.
- **Radix tree for subcommand routing**: Uses `armon/go-radix` for efficient longest-prefix matching of nested subcommands (`cli.go:333`).

## Notable Patterns

- **Decorator/wrapper pattern**: Multiple Ui wrappers (`ColoredUi`, `PrefixedUi`, `ConcurrentUi`) compose behavior without modifying underlying implementations.
- **Deferred initialization**: `sync.Once` used for one-time initialization of fields like `MockUi.once` (`ui_mock.go:14-17`) and CLI's `init()` (`cli.go:134`).
- **Signal handling via goroutine + select**: `BasicUi.ask()` (`ui.go:93-104`) uses a select statement across error channel, result channel, and signal channel for interruptibility.

## Tradeoffs

- **No progress feedback**: The library provides no mechanism for showing progress during long operations, which is a significant limitation for CLI usability.
- **Minimal terminal rendering**: Plain text output only; no table rendering, no interactive widgets, no cursor manipulation.
- **No streaming text handling**: Output is line-based with `fmt.Fprint`/newline; no streaming or real-time output support.
- **Ask blocks entire input**: While interruptible via signal, the prompt blocks until complete—no timeout or partial input handling.

## Failure Modes / Edge Cases

- `BasicUi.ask()` will panic if `u.Reader` is nil (no nil check before `bufio.NewReader` at `ui.go:82`).
- `speakeasy.Ask()` silently falls back to echo input if not a TTY (`ui.go:79-84`)—no warning to user that secret input will be visible.
- Autocomplete installer requires `CLI.Name` to be set (`cli.go:204-207`), returns internal error if missing.
- `PrefixedUi` will pass empty prefix if query is empty string (`ui.go:141-146`), potentially losing the prompt entirely.

## Future Considerations

- Add progress indicator interface for long-running operations.
- Consider a terminal rendering layer (e.g., BubbleTea integration) for richer interactive experiences.
- Add timeout support to `Ask` methods.
- Implement more sophisticated interrupt handling that propagates to running command operations.

## Questions / Gaps

- No evidence of any loading/progress indicators across the codebase.
- No streaming output mechanism found.
- No interactive selection, confirmation dialogs, or multi-step flows.
- No cursor manipulation or screen clearing capabilities.

---

Generated by `09-terminal-ux.md` against `mitchellh-cli`.