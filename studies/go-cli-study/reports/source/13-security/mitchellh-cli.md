# Repo Analysis: mitchellh-cli

## Security & Trust Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | mitchellh-cli |
| Path | `repos/mitchellh-cli` |
| Group | `mitchellh-cli` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

mitchellh-cli is a framework library for building command-line interfaces in Go, used by major HashiCorp tools (Packer, Consul, Vault, Terraform, Nomad). It provides infrastructure for subcommand parsing, UI abstractions, and shell autocompletion — but does not itself execute shell commands or handle credentials. Security responsibility is delegated entirely to the consumer application.

## Rating

**3/10** — Basic security hygiene for a CLI framework. The library itself makes no attempt at input validation, provides no shell sandboxing, and delegates all credential handling to implementers. However, it does provide secure defaults for secret input (masked terminal) and properly separates output streams.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Secret input handling | `BasicUi.ask()` uses `speakeasy.Ask("")` for terminal secret input, falling back to regular reader for non-TTY | `ui.go:79-80` |
| Output stream separation | `CLI.HelpWriter` and `CLI.ErrorWriter` allow separating stdout/stderr | `cli.go:119-129` |
| Signal handling for input | Interrupt signal registered during secret input to prevent echoing | `ui.go:69-71` |
| Concurrent UI safety | `ConcurrentUi` wraps any Ui with mutex protection | `ui_concurrent.go:9-11` |
| Argument parsing | `CLI.processArgs()` handles `-h`, `--help`, `-v`, `--version`, and autocomplete flags | `cli.go:632-668` |

## Answers to Protocol Questions

### 1. How are secrets stored?

**No evidence found.** This library is a CLI framework and does not store secrets. The `Ui` interface provides `AskSecret()` for collecting secrets from users, but storage is the responsibility of the application using this library. `BasicUi.ask()` at `ui.go:58-105` uses `speakeasy.Ask("")` to collect secrets from terminals without echo — this is the only security-relevant behavior in the library.

### 2. How is shell execution sandboxed?

**No evidence found.** This library does not execute shell commands. It is a parsing and UI framework only. Shell execution is entirely absent from this codebase.

### 3. How are user inputs validated?

**No evidence found.** No input validation functions exist in this codebase. `cli.go:632-717` shows argument parsing for help/version flags and subcommand routing, but there is no sanitization or validation of arbitrary user input. The library trusts its inputs completely.

### 4. Are trust boundaries explicit?

**No.** There are no trust boundary markers in this library. The `Command.Run(args []string)` interface at `command.go:14-31` receives raw string arguments with no annotation about trust level. The library makes no distinction between trusted and untrusted input.

## Architectural Decisions

1. **Delegation model**: The library explicitly delegates all application logic (including security decisions) to the `Command` implementation. This is visible in `command.go:14` where `Command` is a simple interface with no security annotations.

2. **Secure terminal input**: When collecting secrets via `BasicUi.ask()`, the library uses `speakeasy` to disable terminal echo (`ui.go:79-80`), and registers a signal handler to gracefully abort on interrupt (`ui.go:69-71`).

3. **Stream separation**: `CLI` distinguishes `HelpWriter` and `ErrorWriter` (`cli.go:119-129`), allowing applications to route output appropriately, though this is framed as "recommended" rather than enforced.

## Notable Patterns

1. **Factory pattern for commands** (`command.go:67`): Commands are created via `CommandFactory` functions, allowing lazy initialization and preventing command instances from leaking state across invocations.

2. **Decorator pattern for UI** (`ui.go:131-186`, `ui_colored.go:28-60`, `ui_concurrent.go:7-53`): UI implementations wrap each other (e.g., `PrefixedUi`, `ColoredUi`, `ConcurrentUi`), allowing composition without modifying base behavior.

3. **Signal-safe interrupt handling** (`ui.go:93-104`): The secret input routine uses a `select` statement across error, input, and signal channels to ensure graceful cancellation.

## Tradeoffs

- **No input validation**: The library intentionally provides no input validation, placing that burden on implementers. This makes the library simple but shifts security responsibility entirely to consumers.

- **No shell sandboxing**: As a framework, it does not and cannot provide shell execution safety — that would require understanding the semantics of whatever commands the consumer runs.

- **Secret input relies on TTY detection** (`ui.go:79`): `AskSecret` only uses `speakeasy` (secure terminal) when `isatty.IsTerminal()` returns true. For non-TTY environments, it falls back to regular `bufio.Reader` which would echo characters — potentially exposing secrets in non-interactive contexts.

- **No credential isolation**: Secrets collected via `AskSecret` are returned as plain strings to the caller. The library provides no automatic redaction from logs, debug output, or error messages.

## Failure Modes / Edge Cases

1. **Non-TTY secret exposure**: `ui.go:79` checks `isatty.IsTerminal(os.Stdin.Fd())` — if stdin is piped or redirected, `AskSecret` falls back to regular line reading with echo, potentially exposing secrets.

2. **No command-line argument validation**: Arbitrary strings passed as command arguments are passed directly to `Command.Run()` without sanitization. Malformed or malicious input reaches the command implementation.

3. **Double-free of autocomplete flags**: `cli.go:646-655` sets `isAutocompleteInstall` or `isAutocompleteUninstall` flags and continues, but the parsing logic does not prevent these from being processed as subcommand arguments later.

4. **Template injection (theoretical)**: `cli.go:517` uses `sprig.TxtFuncMap()` for help template rendering. If command help templates contain unsanitized user input, template injection is theoretically possible.

## Future Considerations

- Add an optional input validation hook for commands
- Extend `AskSecret` to return an `io.Reader` instead of a string to avoid in-memory secret storage
- Document the trust model explicitly: the library expects consumers to validate all external input

## Questions / Gaps

1. **No evidence of credential storage**: This library provides no mechanisms for storing, caching, or protecting credentials after collection. Any security around credentials is entirely the responsibility of the consuming application.

2. **No evidence of shell command execution**: This codebase does not execute shell commands in any form. Security analysis of shell sandboxing is not applicable.

3. **No evidence of trust boundary documentation**: The library provides no guidance on trust boundaries. Consumers must infer from the absence of validation that they are responsible for all input sanitization.

---

Generated by `study-areas/13-security.md` against `mitchellh-cli`.