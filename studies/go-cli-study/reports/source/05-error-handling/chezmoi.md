# Repo Analysis: chezmoi

## Error Handling Philosophy

### Repo Info

| Field | Value |
|-------|-------|
| Name | chezmoi |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/chezmoi` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

chezmoi demonstrates strong error handling practices with consistent contextual wrapping via `fmt.Errorf` with `%w`, sentinel errors for programmatic checking, and a clear separation between user-facing errors (printed to stderr) and operational errors (logged). The codebase uses `errors.Is`/`errors.As` extensively (109 matches) for error comparison. Fatal vs recoverable failures are distinguished via `ExitCodeError` — recoverable operational errors return exit code 1, while unrecoverable errors propagate as regular errors.

## Rating

**8/10** — Excellent operational vs user-facing error separation. Consistent contextual wrapping throughout the codebase. Strong use of sentinel errors and typed errors for conditions requiring programmatic handling. Minor扣分 for some `panic`-based error handling in template functions that could be more graceful.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Error wrapping with `%w` | Contextual wrapping in merge, config, sourcestate | `internal/cmd/mergecmd.go:101`, `internal/cmd/config.go:755`, `internal/chezmoi/sourcestate.go:1438` |
| Sentinel errors | `errEmptyDirName`, `errEmptyFilename` | `internal/chezmoi/attr.go:11-12` |
| Sentinel errors | `errEncryptionNotConfigured` | `internal/chezmoi/noencryption.go:5` |
| Sentinel errors | `errUnsupportedUpgradeMethod` | `internal/cmd/upgradecmd.go:41` |
| Custom error types | `cmdOutputError` struct with `Unwrap()` | `internal/cmd/errors.go:8-33` |
| Custom error types | `TooOldError`, `InconsistentStateError`, `NotInAbsDirError` | `internal/chezmoi/errors.go:21-66` |
| `errors.Is` usage | Checking for `fs.ErrNotExist`, `fs.SkipDir` | `internal/chezmoi/sourcestate.go:545`, `internal/chezmoi/system.go:130` |
| `errors.As` usage | Checking for `ExitCodeError`, `exec.ExitError` | `internal/cmd/cmd.go:59`, `internal/chezmoilog/chezmoilog.go:59` |
| Error rendering | User-facing errors printed to stderr | `internal/cmd/cmd.go:62` |
| Logging | `slog`-based structured logging for operational errors | `internal/chezmoilog/chezmoilog.go:211-230` |
| Fatal/recoverable separation | `ExitCodeError` for graceful exits | `internal/chezmoi/errors.go:11-17` |
| Multi-error combining | `chezmoierrors.Combine` using `errors.Join` | `internal/chezmoierrors/chezmoierrors.go:24` |

## Answers to Protocol Questions

### 1. Are errors wrapped with context?

**Yes.** chezmoi consistently wraps errors with `%w` to preserve error chains while adding contextual information. Examples:

- `internal/cmd/mergecmd.go:101`: `return fmt.Errorf("%s: %w", targetRelPath, err)`
- `internal/cmd/config.go:755`: `err = fmt.Errorf("%s: %w", targetRelPath, err)`
- `internal/chezmoi/sourcestate.go:1438`: `return fmt.Errorf("%s: %w", sourceAbsPath, err)`

The pattern is consistently `fmt.Errorf("descriptive context: %w", err)` throughout the codebase (48 matches found).

### 2. Which errors are user-facing vs operational?

**User-facing errors** are printed directly to stderr in `cmd.Main()` at `internal/cmd/cmd.go:62`:
```go
fmt.Fprintf(os.Stderr, "chezmoi: %s\n", deDuplicateError(err))
```

**Operational errors** are logged via `slog` at `InfoOrError`/`InfoOrErrorContext` in `internal/chezmoilog/chezmoilog.go:211-230`. When `logger == nil`, no logging occurs — the function is effectively a no-op for operational diagnostics.

The `deDuplicateError` function (`internal/cmd/cmd.go:70-81`) deduplicates error message components to improve readability for users.

### 3. How are fatal vs recoverable failures handled?

**Recoverable failures** that should result in a specific exit code use `ExitCodeError` (`internal/chezmoi/errors.go:11-17`), which is detected and handled in `cmd.Main()` (`internal/cmd/cmd.go:59-60`):
```go
if errExitCode := chezmoi.ExitCodeError(0); errors.As(err, &errExitCode) {
    return int(errExitCode)
}
```

**Unrecoverable errors** (programming errors, missing invariants) use `panic` in internal helper functions like `must()`, `mustValue()`, `mustValues()` at `internal/cmd/cmd.go:101-121`. These are considered developer errors rather than runtime conditions.

**Bbolt lock timeout** is specifically intercepted at `internal/cmd/cmd.go:217-221` and converted to a friendly user message.

### 4. Are sentinel errors used for programmatic checking?

**Yes.** Sentinel errors are defined and used extensively:

- `internal/chezmoi/attr.go:11-12`: `errEmptyDirName`, `errEmptyFilename`
- `internal/chezmoi/noencryption.go:5`: `errEncryptionNotConfigured`
- `internal/chezmoi/templatefuncs.go:5`: `errReturnEmpty`
- `internal/cmd/upgradecmd.go:41`: `errUnsupportedUpgradeMethod`
- `internal/cmd/cmd.go:221`: Timeout error message (not a sentinel but specific handling)

Usage via `errors.Is()` is found in 109 locations throughout the codebase for checking conditions like `fs.ErrNotExist`, `fs.SkipDir`, and custom sentinels.

## Architectural Decisions

- **ExitCodeError as typed error**: Rather than using a special error-wrapping pattern, chezmoi uses a typed error (`ExitCodeError`) that can be unwrapped via `errors.As()`. This allows the main function to extract exit codes while still preserving error chains.
- **deDuplicateError for user output**: The `deDuplicateError` function strips duplicate error message components to prevent verbose, repetitive user-facing error messages.
- **chezmoierrors.Combine for multi-error**: Uses Go 1.20's `errors.Join` semantics via a custom `Combine` function that handles 0, 1, or many errors.

## Notable Patterns

- **Unwrap pattern**: Custom error types implement `Unwrap() error` for chain traversal (e.g., `cmdOutputError` at `internal/cmd/errors.go:31-33`).
- **Template panic pattern**: In `internal/cmd/templatefuncs.go:149`, template execution errors use `panic(fmt.Errorf(...))` which is caught by the `must` helper — this is a deviation from the recover-based error handling elsewhere.
- **Structured logging with exec details**: The `chezmoilog` package (`internal/chezmoilog/chezmoilog.go`) provides rich structured logging for command execution including exit codes, durations, and stderr output.
- **Error type hierarchy**: Multiple custom error types exist for distinct failure categories (version mismatch, path violations, inconsistent state, unsupported file types).

## Tradeoffs

- **Panic in template functions**: Some internal template functions use `panic` for what在其他 contexts would be returning errors. This is contained to template execution but represents inconsistent error handling.
- **Limited error context in some commands**: Some error paths wrap with minimal context (e.g., just the path without operation description), though this is the exception rather than the rule.
- **Bbolt timeout handling is centralized**: The specific translation of `bbolterrors.ErrTimeout` to a user message happens in one place (`cmd.go:217`), which is good, but means other bbolt errors may not receive the same treatment.

## Failure Modes / Edge Cases

- **Missing git**: Various commands check for `exec.ErrNotFound` when git is not installed, providing user-friendly messages.
- **Config file not found**: `fs.ErrNotExist` is handled gracefully in config reading (`internal/cmd/config.go:821`).
- **Lock timeout**: Another instance running causes bbolt lock timeout, intercepted and converted to friendly message.
- **Encryption mismatches**: Incorrect passphrases for age encryption detected and reported (`internal/cmd/agecmd.go:104`).
- **Version mismatch**: `TooOldError` alerts users when source state requires newer chezmoi version.

## Future Considerations

- Consider standardizing the `panic`-based error handling in template functions to use error returns with `recover` at the top level instead.
- The de-duplication of error messages is a heuristic approach; a more deterministic approach might be preferable for complex error chains.
- Consider adding structured error codes for more granular programmatic error handling beyond just exit codes.

## Questions / Gaps

- **Panic in template functions**: Why use `panic` in `templatefuncs.go:149,162,167,386` rather than returning errors? The template execution is user-controlled code, but the panic feels inconsistent with the rest of the codebase.
- **Error type extensibility**: `ExitCodeError` is `int` under the hood, limiting ability to add more metadata. Is this sufficient for future needs?
- **No evidence found** of error categorization into "operational" vs "development" errors at the type level — the distinction exists behaviorally but not structurally in the type system.

---

Generated by `study-areas/05-error-handling.md` against `chezmoi`.