# Repo Analysis: mitchellh-cli

## Error Handling Philosophy

### Repo Info

| Field | Value |
|-------|-------|
| Name | mitchellh-cli |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/mitchellh-cli` |
| Group | `mitchellh-cli` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

mitchellh-cli is a minimalist CLI framework centered on command dispatch and helptext generation. Error handling is largely delegated to the caller — the framework uses `fmt.Errorf` without `%w` wrapping, has no sentinel errors, no typed errors, no `errors.Is`/`errors.As` usage, and no operational vs user-facing error separation. Panics are used for truly unrecoverable internal states (missing command tree nodes).

## Rating

**4/10** — Some wrapping/context (limited), but no sentinel errors, no typed error hierarchy, no `errors.Is`/`errors.As`, and no user vs operational error distinction. The framework provides `HelpWriter`/`ErrorWriter` separation which is a nascent pattern, but error handling is mostly an afterthought.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| `fmt.Errorf` without `%w` | `fmt.Errorf("internal error: CLI.Name must be specified...")` — no error wrapping chain | `cli.go:205-206` |
| `fmt.Errorf` without `%w` | `fmt.Errorf("Either the autocomplete install or uninstall flag may...")` — no `%w` wrap | `cli.go:211-213` |
| `errors.New` usage | `errors.New("interrupted")` for SIGINT in ask flow | `ui.go:103` |
| No `%w` wrapping | No usage of `%w` verb anywhere in codebase | — |
| No sentinel errors | No `var ErrX = errors.New("...")` pattern found | — |
| No `errors.Is` | No usage of `errors.Is` anywhere | — |
| No `errors.As` | No usage of `errors.As` anywhere | — |
| No typed errors | No custom error types (no `type FooError struct { ... }`) found | — |
| Panic for internal invariants | `panic("not found: " + k)` — called when radix tree returns a key that should exist | `cli.go:617-618` |
| Panic in help generation | `panic("command not found: " + key)` — called when command lookup fails after being confirmed present | `help.go:43` |
| `CommandFactory` returns error | `type CommandFactory func() (Command, error)` — factory can fail | `command.go:67` |
| `Run() int` exit code | Commands return int exit codes, not errors — `command.Run(args []string) int` | `command.go:26` |
| `RunResultHelp` sentinel | `const RunResultHelp = -18511` — magic number signals help requested | `command.go:10-11` |
| HelpWriter/ErrorWriter separation | `HelpWriter io.Writer` and `ErrorWriter io.Writer` as separate fields | `cli.go:119-129` |
| BasicUi error output | `Error(message string)` outputs to `ErrorWriter` | `ui.go:107-115` |

## Answers to Protocol Questions

### 1. Are errors wrapped with context?

**No.** The two `fmt.Errorf` calls in `cli.go:205-206` and `cli.go:211-213` produce plain errors without `%w` wrapping. There is no error chain construction. The error from `CommandFactory` at `cli.go:242-244` is passed through directly without wrapping. Callers cannot use `errors.Is` to check for specific conditions because errors are not wrapped.

### 2. Which errors are user-facing vs operational?

**No clear separation.** The framework does distinguish `HelpWriter` from `ErrorWriter` (`cli.go:119-129`), which is a structural attempt at separation, but:
- Errors returned from `CLI.Run()` go to callers directly — they can be user-facing or operational with no convention.
- The `Ui.Error(string)` method at `ui.go:107` sends to `ErrorWriter`, but this is output, not error-type distinction.
- There is no typed error distinction between recoverable operational errors and fatal user-facing errors.
- `RunResultHelp` is a special exit code, not an error type.

### 3. How are fatal vs recoverable failures handled?

**Via exit codes and panic.** The framework uses:
- **Exit codes** (`command.Run(args []string) int`) — commands return integer exit codes. `0` is success, non-zero is failure. This is the primary mechanism for signaling success/failure.
- **`RunResultHelp`** (`command.go:10`) is a magic number `-18511` that signals the CLI should display help and exit with code `1` (`cli.go:263-267`).
- **`panic`** for truly unrecoverable internal states: radix tree invariant violation (`cli.go:618`) and command-not-found in help (`help.go:43`). These indicate programmer errors, not runtime failures.
- **No typed "fatal" vs "recoverable" error interface** — the distinction is implicit in exit code semantics.

### 4. Are sentinel errors used for programmatic checking?

**No.** There are:
- No exported `var ErrX = errors.New("...")` sentinel variables.
- No `errors.Is` checks anywhere in the codebase.
- No `errors.As` usage.
- `RunResultHelp` is a constant exit code, not an error variable.
- `CommandFactory` returns a plain `error` interface — callers cannot programmatically distinguish error kinds except by string matching.

## Architectural Decisions

- **Exit codes as primary error signaling**: `Command.Run() int` returns exit codes, not Go errors. This is a design choice that predates modern Go error handling conventions and makes error chaining impossible within the framework itself.
- **`CommandFactory` as error boundary**: The factory pattern at `command.go:67` allows command instantiation to fail, and those errors propagate out of `CLI.Run()` (`cli.go:242-244`). This is one of the few places where errors exist in the system.
- **`HelpWriter`/`ErrorWriter` separation**: A structural attempt to separate help output from error output (`cli.go:119-129`), but this is output redirection, not error semantics.
- **Panic for invariants**: Internal data structure invariants (radix tree consistency) use panic rather than returning errors, treating these as "should never happen" programmer errors rather than runtime failures.

## Notable Patterns

- **`RunResultHelp` as signal**: A negative magic number `-18511` used to communicate "display help" from command to CLI framework, rather than using an error type or enum.
- **Exit-code-oriented design**: Entire error model is "return 0 for success, non-zero for failure" — the simplest possible model, but loses all error context.
- **`BasicUi` as naive output**: The `BasicUi` struct at `ui.go:48-52` is a plain writer with no error modeling — errors during `Ask`/`AskSecret` are returned as Go errors, but `Output`/`Error`/`Warn` are fire-and-forget.

## Tradeoffs

- **No error chaining**: Using `fmt.Errorf` without `%w` means errors cannot be inspected with `errors.Is`. Callers must resort to string matching, which is fragile.
- **No typed errors**: Without custom error types or sentinels, consumers of this library cannot programmatically handle specific error conditions (e.g., "is this a help request?").
- **Panic for invariants**: Panicking on internal invariant violations (`cli.go:618`, `help.go:43`) is appropriate for programmer errors but will crash a running CLI if ever triggered at runtime.
- **Minimal error abstraction**: The `Ui` interface (`ui.go:19-43`) treats errors as strings sent to an `ErrorWriter` — no structured error data, no error codes, no severity levels.

## Failure Modes / Edge Cases

- **SIGINT during `Ask`**: Returns `errors.New("interrupted")` at `ui.go:103` — a plain error without sentinel, wrapping, or specific type.
- **Command factory failure**: If `CommandFactory` returns an error (`cli.go:242-244`), it propagates out of `CLI.Run()` as a bare error with no additional context about which command failed.
- **Invalid flags**: Produces a string written to `ErrorWriter` (`cli.go:255-259`) — not a Go error returned from `Run`.
- **Autocomplete install without name**: Returns `fmt.Errorf` with no `%w` — caller cannot use `errors.Is` to detect this specific condition.
- **Unknown subcommand**: Returns exit code `127` and writes help to `ErrorWriter` (`cli.go:237-239`) — not an error value.

## Future Considerations

- Add `%w` wrapping to all `fmt.Errorf` calls to enable error chain inspection.
- Introduce sentinel errors for common failure modes (unknown command, invalid flags, help requested, autocomplete failure).
- Consider replacing the `Run() int` pattern with `Run() error` to align with modern Go conventions.
- Replace panics in `help.go:43` and `cli.go:618` with returned errors, since these can theoretically occur due to race conditions during command tree mutation.
- Add an error type hierarchy for distinct error categories (validation, infrastructure, user input).

## Questions / Gaps

- **Why `Run() int` instead of `Run() error`?** The design choice to return exit codes directly predates widespread adoption of `errors.Is`/`errors.As`. This makes the framework simple but loses all structural error handling.
- **Why magic number `-18511` for `RunResultHelp`?** A sentinel error variable would be more idiomatic and inspectable.
- **No investigation of application-level usage**: This analysis only covers the framework itself. Real applications built on mitchellh-cli may add their own error handling patterns on top.

---

Generated by `study-areas/05-error-handling.md` against `mitchellh-cli`.