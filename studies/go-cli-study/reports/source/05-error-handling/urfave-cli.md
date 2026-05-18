# Repo Analysis: urfave-cli

## Error Handling Philosophy

### Repo Info

| Field | Value |
|-------|-------|
| Name | urfave-cli |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/urfave-cli` |
| Group | `urfave-cli` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

urfave-cli is a mature Go CLI framework that implements a layered error handling system. Errors are categorized into user-facing (usage errors, required flag violations) and operational (ExitCoder-based exit codes). The framework uses custom error types for internal error conditions but does not expose sentinel errors for programmatic checking by consumers. Contextual wrapping is applied inconsistently—some errors include flag names and values, but no `fmt.Errorf %w` wrapping pattern was found in core library code.

## Rating

**7/10** — Consistent contextual errors for user-facing cases, but limited sentinel error patterns and no `errors.Is`/`errors.As` usage in the library itself. The `ExitCoder` interface provides good separation between errors and exit codes, but the lack of exported sentinel errors limits programmatic error handling for library users.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Error types | `MultiError` interface wraps multiple errors | `errors.go:18-21` |
| Error types | `errRequiredFlags` for missing required flags | `errors.go:52-62` |
| Error types | `mutuallyExclusiveGroup` for flag conflicts | `errors.go:64-71` |
| Error types | `exitError` struct with exitCode + err | `errors.go:101-137` |
| ExitCoder interface | `ExitCoder` interface for custom exit codes | `errors.go:95-99` |
| ErrorFormatter | `ErrorFormatter` interface for custom formatting | `errors.go:91-93` |
| Error handling | `HandleExitCoder` handles errors and calls OsExiter | `errors.go:147-169` |
| Flag error wrapping | `fmt.Errorf("invalid value %q for flag -%s: %v", ...)` | `command.go:358` |
| MultiError creation | `newMultiError()` function | `errors.go:24-27` |
| OsExiter/ErrWriter | Package-level configurable exit/writer | `errors.go:10-15` |

## Answers to Protocol Questions

### 1. Are errors wrapped with context?

**Partially.** Contextual wrapping exists in some places but is not consistent across the codebase.

- **Flag parsing errors** include the flag name and invalid value: `command.go:358` uses `fmt.Errorf("invalid value %q for flag -%s: %v", val, fName, err)` which wraps the underlying error.
- **Required flag errors** include the flag name: `errors.go:57-62` formats `"Required flag %q not set"` with the flag name.
- **No sentinel errors** are exported for programmatic checking. The error types (`errRequiredFlags`, `mutuallyExclusiveGroup`) are unexported and cannot be used with `errors.Is`/`errors.As`.
- **No `fmt.Errorf %w` pattern** found in core library code for error wrapping—only in test files.

### 2. Which errors are user-facing vs operational?

**User-facing errors:**
- Usage errors from flag parsing (`command_run.go:181`): `"Incorrect Usage: %s\n\n"`
- Required flag errors (`errors.go:57-62`): formatted for humans with flag names
- Mutually exclusive flag errors (`errors.go:69-70`): user-friendly messages
- Help output displayed on usage errors (`command_run.go:182-198`)

**Operational errors:**
- `ExitCoder` interface allows custom exit codes for different failure modes (`errors.go:95-99`)
- `Exit()` function creates errors with exit codes (`errors.go:113-129`)
- `HandleExitCoder` prints errors to `ErrWriter` and calls `OsExiter` with exit code (`errors.go:147-169`)
- The `OsExiter` and `ErrWriter` globals are configurable for testing (`errors.go:10-15`)

### 3. How are fatal vs recoverable failures handled?

**Fatal failures:**
- `Exit()` function creates an `ExitCoder` with a specific exit code, triggering immediate exit via `HandleExitCoder`
- `OsExiter` defaults to `os.Exit` but is injectable for testing
- MultiError collects multiple errors but exits with the last ExitCoder's code (`errors.go:171-183`)

**Recoverable failures:**
- Flag validation errors return from `cmd.Set()` and `cmd.run()` but are handled by `handleExitCoder` which may suppress exit based on configuration
- `OnUsageError` hook allows custom handling of usage errors before exit (`command.go:72`)
- `CommandNotFound` handler for missing commands (`command.go:70`)
- Error handling chain traverses up to parent command via `handleExitCoder` (`command.go:324-336`)

### 4. Are sentinel errors used for programmatic checking?

**No.** No exported sentinel errors (e.g., `var ErrInvalidFlag = errors.New(...)`) found in the library. The internal error types are unexported:

- `requiredFlagsErr` interface (`errors.go:48-50`)
- `errRequiredFlags` struct (`errors.go:52-62`)
- `mutuallyExclusiveGroup` struct (`errors.go:64-71`)
- `mutuallyExclusiveGroupRequiredFlag` struct (`errors.go:73-88`)

Consumers cannot use `errors.Is()` to check for specific error conditions. Only `ExitCoder` and `MultiError` are exported interfaces that allow runtime inspection.

## Architectural Decisions

1. **`ExitCoder` over typed errors for exit codes**: The library uses an interface with `ExitCode()` method rather than sentinel errors for exit code determination. This allows any error to carry an exit code.

2. **Unexported internal error types**: Error types like `errRequiredFlags` are kept unexported, forcing users to rely on error messages rather than type checking. This limits extensibility.

3. **Configurable error output**: `OsExiter` and `ErrWriter` are package-level variables that default to `os.Exit` and `os.Stderr`, allowing tests to intercept exit behavior and capture error output.

4. **MultiError for batch errors**: The `MultiError` interface allows collecting multiple errors before exiting, with `handleMultiError` returning the last non-nil ExitCoder's code.

## Notable Patterns

- **ErrorFormatter interface** (`errors.go:91-93`): Allows custom `fmt.State` formatters for error output, used with `%+v` formatting.
- **Recursive MultiError handling** (`errors.go:171-183`): `handleMultiError` recursively processes nested MultiErrors and extracts exit codes.
- **Parent-chain error propagation** (`command.go:324-336`): Errors bubble up through parent commands until an `ExitErrHandler` is found or `HandleExitCoder` is invoked.
- **Suggestion on invalid flags** (`command.go:220-243`): `suggestFlagFromError` attempts to suggest similar flags when an invalid one is provided.

## Tradeoffs

1. **No sentinel errors vs. flexibility**: Not exporting sentinel errors prevents `errors.Is` checks but also means the library isn't coupled to specific error values. Users must rely on string matching or the `ExitCoder` interface.

2. **`%+v` formatting vs. simple errors**: The `HandleExitCoder` function uses `%+v` for `ErrorFormatter` types which produces verbose output. This may be confusing for simple errors.

3. **Exit on errors vs. recoverable**: Once `HandleExitCoder` is called with an `ExitCoder`, the process exits. There is no way to recover or continue after an error with an exit code. The `ExitErrHandler` on `Command` allows customization but the default is still to exit.

4. **Error message localization**: All error messages are hardcoded English strings with no i18n support. Users must override `ErrWriter` and parse output for localization.

## Failure Modes / Edge Cases

- **Empty Exit message** (`errors.go:153-158`): If `ExitCoder.Error()` returns empty string, nothing is written to `ErrWriter`. Test at `errors_test.go:236-259` confirms this behavior.

- **Recursive MultiError with mixed types** (`errors.go:171-183`): When a `MultiError` contains another `MultiError`, `handleMultiError` recursively unwraps but only keeps the last exit code found.

- **Missing flag suggestions** (`command.go:220-243`): If `Suggest` is enabled and a flag error occurs, `suggestFlagFromError` is called but may return an empty suggestion if no close match is found.

- **StopOnNthArg validation** (`command_run.go:102-104`): Negative values cause immediate error return before any parsing.

- **Shell completion mode skips normal errors** (`command_run.go:144-147`): Completion command bypasses normal error handling and returns directly from `Action`.

## Future Considerations

1. Export sentinel errors for common error conditions (e.g., `ErrRequiredFlags`, `ErrInvalidFlag`) to allow programmatic error checking via `errors.Is`.

2. Consider `errors.Is`/`errors.As` support by implementing wrapped errors with `fmt.Errorf %w` in the core library.

3. Add i18n support for error messages to enable localization.

4. Consider a `NonFatalError` type that can be returned without triggering exit, for scenarios where the application should continue with partial failure.

## Questions / Gaps

- **No evidence of error logging**: The library does not appear to have internal logging. Errors are written to `ErrWriter` or ignored. Debug tracing via `tracef` exists but is controlled by `URFAVE_CLI_TRACING` env var.

- **No structured error format**: Errors are human-readable strings only. No JSON or structured error payload for programmatic consumption.

- **No error recovery mechanism**: Once `HandleExitCoder` is called, exit is inevitable (unless overridden). There is no `error != nil` check that allows the caller to handle the error without exiting.

---

Generated by `study-areas/05-error-handling.md` against `urfave-cli`.