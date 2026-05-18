# Repo Analysis: urfave-cli

## Terminal UX & Interaction Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | urfave-cli |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/urfave-cli` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

urfave-cli is a Go library for building CLI applications. It focuses on argument parsing, flag handling, command hierarchy, and help generation. Terminal UX is handled through io.Writer-based output (stdout/stderr separation), text/template-based help rendering with word wrapping, and shell completion scripts. There is no interactive terminal rendering (no BubbleTea, tview, or similar), no progress/spinner indicators, and no streaming text handling. The library provides a `Reader` field for test injection but does not implement interactive prompts.

## Rating

**5/10** — Functional but rough. The library provides basic output mechanisms (Writer/ErWriter), customizable help templates, and shell completion, but lacks interactive UX features like prompts, progress indicators, or streaming output. Developers must build any rich terminal experience on top.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Output Writer | `Command.Writer io.Writer` field for stdout | `command.go:85` |
| Error Writer | `ErrWriter io.Writer = os.Stderr` global | `errors.go:15` |
| Help rendering | `text/template` with custom funcMap (wrap, indent, join) | `help.go:371-388` |
| Word wrapping | `wrap()` and `wrapLine()` functions | `help.go:534-582` |
| Help templates | `RootCommandHelpTemplate`, `CommandHelpTemplate`, `SubcommandHelpTemplate` | `template.go:44-111` |
| Shell completion | Embedded autocomplete scripts (bash, zsh, fish, pwsh) | `completion.go:21-41` |
| Shell completion command | Built-in `completion` command | `completion.go:60-71` |
| stdin parsing | `parseArgsFromStdin()` using `bufio.Reader` | `command_run.go:12-87` |
| Test injectability | `Reader io.Reader` on Command for test input | `command.go:83` |
| Help customization | `HelpPrinter`, `HelpPrinterCustom`, `VersionPrinter` vars | `help.go:33,43,46` |

## Answers to Protocol Questions

### 1. How is terminal rendering handled?

urfave-cli does not use terminal rendering libraries (no BubbleTea, tview, etc.). Output is handled through `io.Writer` interfaces:
- `Command.Writer` for standard output (`command.go:85`)
- `ErrWriter` global variable defaulting to `os.Stderr` (`errors.go:15`)
- Help text rendered via `text/template` with a funcMap providing `wrap`, `indent`, `nindent`, `join`, `subtract`, `offset` functions (`help.go:371-388`)

The `wrap()` function (`help.go:534`) performs word-wrapping at configurable width. Templates use `tabwriter` for alignment (`help.go:395`).

### 2. How are loading states shown?

No evidence found. The library does not implement loading states or progress indicators. There is no spinner, progress bar, or similar UX pattern. Long-running operations provide no built-in feedback mechanism.

### 3. How are prompts implemented?

No evidence found. urfave-cli does not implement interactive prompts. The `Reader` field on `Command` (`command.go:83`) exists solely for test injection of stdin data (`command_run.go:24` uses `bufio.NewReader(cmd.Reader)`). There is no prompt library integration, no interactive flow control, and no read-from-terminal-as-you-type behavior.

### 4. Is the UX interruptible?

Partially. The `Reader` field allows commands to read from any `io.Reader`, enabling testability. However, there is no SIGINT/SIGTERM handling for graceful shutdown, no cancellation awareness in the core run loop, and no streaming output that could be interrupted. The library exits via `OsExiter` (`errors.go:11`) which defaults to `os.Exit`.

## Architectural Decisions

1. **Writer/ErWriter separation**: Output streams are separated from the start (`command.go:85-87`), allowing redirectable stdout/stderr.
2. **Template-based help**: Help uses `text/template` with a funcMap, enabling user customization via template variables and custom functions.
3. **Shell completion as embedded commands**: Completion scripts are embedded at compile time via `//go:embed` (`completion.go:21-22`), avoiding runtime script generation.
4. **No terminal library**: Deliberately avoids terminal UI dependencies, keeping the library minimal and focused on argument parsing.

## Notable Patterns

- **Customizable help printers**: `HelpPrinter` and `HelpPrinterCustom` are package-level variables that can be overridden (`help.go:33,43`)
- **Suggest flag on typos**: `Suggest` field on Command enables "did you mean" suggestions via `SuggestCommand`/`SuggestFlag` (`suggestions.go`)
- **Context propagation**: Commands receive a `context.Context` through the run chain, enabling cancellation
- **Exit code handling**: `ExitCoder` interface allows commands to specify exit codes; `HandleExitCoder` processes them (`errors.go:95-137`)

## Tradeoffs

- **No interactive UX**: By avoiding terminal rendering libraries, urfave-cli remains lightweight but leaves interactive patterns (prompts, spinners) to user code
- **No streaming output**: The template-based help renders atomically; there is no incremental output mechanism
- **No built-in progress feedback**: Long operations must implement their own progress indication
- **os.Exit by default**: The `OsExiter` global defaults to `os.Exit`, which is not testable; tests must override it

## Failure Modes / Edge Cases

- **Closed writer**: `handleTemplateError()` silently ignores errors when the writer is closed (`help.go:351-361`)
- **Malformed templates**: Template parse errors are traced but not surfaced to the user unless `CLI_TEMPLATE_ERROR_DEBUG` is set
- **Stdin blocking**: `parseArgsFromStdin()` reads blocking from `cmd.Reader`; if no data is available, the command hangs

## Future Considerations

- Consider adding progress indicator interfaces for long-running command actions
- Consider cancellation/context-aware command execution with graceful shutdown
- Shell completion could be extended to support interactive completion (e.g., argument value completion from API)

## Questions / Gaps

- No evidence of terminal width detection for dynamic wrap width
- No evidence of color/ANSI escape support
- No evidence of interactive widget or form handling
- No evidence of streaming or real-time output handling

---

Generated by `study-areas/09-terminal-ux.md` against `urfave-cli`.