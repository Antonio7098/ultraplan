# Repo Analysis: restic

## Error Handling Philosophy

### Repo Info

| Field | Value |
|-------|-------|
| Name | restic |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/restic` |
| Group | `study-areas/05-error-handling.md` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

restic implements a sophisticated multi-tier error handling system that distinguishes between fatal errors (user-facing), operational errors (programmatic), and data corruption errors. The architecture uses sentinel errors for programmatic checking, custom error types for structured data, and a dedicated `fatalError` type to separate user-facing messages from operational errors. Error wrapping with `%w` is used consistently, and the `errors.Is`/`errors.As` pattern is employed throughout.

## Rating

**8/10** — Consistent contextual error wrapping with clear separation between fatal (user-facing) and operational errors. Strong use of sentinel errors and typed errors for programmatic handling. Minor扣分 for some inconsistencies in error message quality and occasional lack of structured data in errors.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Error wrapping with %w | `fmt.Errorf("failed to reload tree %v: %w", nodeID, err)` | `internal/walker/rewriter.go:133` |
| Error wrapping with %w | `fmt.Errorf("ParseSize: %q: %w", numStr, strconv.ErrRange)` | `internal/ui/format.go:97` |
| Error wrapping with %w | `fmt.Errorf("Detected data corruption while saving blob %v: %w\n...", id, err)` | `internal/repository/repository.go:404` |
| Sentinel error definition | `var ErrNoKeyFound = errors.New("wrong password or no key found")` | `internal/repository/key.go:21` |
| Sentinel error definition | `var ErrRemovedLock = errors.New("lock file was removed in the meantime")` | `internal/restic/lock.go:87` |
| Sentinel error definition | `var ErrTreeNotOrdered = errors.New("nodes are not ordered or duplicate")` | `internal/data/tree.go:24` |
| Sentinel error definition | `var ErrNoSnapshotFound = errors.New("no snapshot found")` | `internal/data/snapshot_find.go:15` |
| Sentinel error definition | `var ErrInvalidData = errors.New("invalid data returned")` | `internal/restic/repository.go:14` |
| errors.Is usage | `if errors.Is(err, os.ErrNotExist)` | `internal/restorer/restorer.go:280` |
| errors.Is usage | `if errors.Is(err, ErrInvalidData)` | `internal/restic/lock.go:212` |
| errors.As usage | `return errors.As(err, &e)` for `alreadyLockedError` | `internal/restic/lock.go:63` |
| Custom error type | `type fatalError struct { msg string; err error }` | `internal/errors/fatal.go:10` |
| Custom error type | `type alreadyLockedError struct { otherLock *Lock }` | `internal/restic/lock.go:47` |
| Custom error type | `type invalidLockError struct { err error }` | `internal/restic/lock.go:68` |
| Custom error type | `type MultipleIDMatchesError struct{ prefix string }` | `internal/restic/backend_find.go:10` |
| Custom error type | `type NoIDByPrefixError struct{ prefix string }` | `internal/restic/backend_find.go:18` |
| Custom error type | `type partialReadError struct { err error }` | `internal/repository/check.go:31` |
| Fatal error check | `errors.IsFatal(err)` in main error handler | `cmd/restic/main.go:205` |
| Fatal error creation | `errors.Fatalf("%s does not exist", pwdFile)` | `internal/global/global.go:219` |
| Error type hierarchy | `Error` struct in checker with TreeID and Err fields | `internal/checker/checker.go:70` |

## Answers to Protocol Questions

### 1. Are errors wrapped with context?

**Yes, extensively.** restic consistently uses `fmt.Errorf` with `%w` to wrap errors with context. Examples:
- `internal/repository/repository.go:404`: Wraps data corruption errors with blob ID context
- `internal/walker/rewriter.go:133`: Wraps tree reload failures with node ID
- `internal/global/global.go:345`: Wraps repository open failures with location context

The `internal/errors/errors.go` file (`errors.go:9-23`) wraps the `github.com/pkg/errors` package to hide the internal package from stack traces, providing cleaner error chains.

### 2. Which errors are user-facing vs operational?

**Clear separation exists via `fatalError` type** (`internal/errors/fatal.go:10-53`):

- **Fatal errors** (user-facing): Created via `errors.Fatal()` or `errors.Fatalf()`, printed directly to stderr and cause exit with error code. Examples in `internal/global/global.go:219,245,266,275,281,286`.

- **Operational errors** (programmatic): Wrapped with `%w` and handled via `errors.Is`/`errors.As`. Examples: `ErrNoKeyFound` (`internal/repository/key.go:21`), `ErrRemovedLock` (`internal/restic/lock.go:87`).

- **Data corruption errors**: Special category with user-friendly messages explaining hardware/software issues and directing users to file issues (`internal/repository/repository.go:404,509`).

The main loop in `cmd/restic/main.go:199-209` handles each category distinctly:
```go
case restic.IsAlreadyLocked(err):
    exitMessage = fmt.Sprintf("%v\nthe `unlock` command...", err)
case errors.IsFatal(err):
    exitMessage = err.Error()
case errors.Is(err, repository.ErrNoKeyFound):
    exitMessage = fmt.Sprintf("Fatal: %v", err)
```

### 3. How are fatal vs recoverable failures handled?

**Fatal errors** use the `fatalError` type (`internal/errors/fatal.go:10`) which is detected via `errors.IsFatal()` (`internal/errors/fatal.go:25-28`). These cause immediate program exit with the error message shown to user.

**Recoverable failures** use standard error wrapping and are handled at multiple levels:
- Retry logic in `internal/repository/check.go:48-54` (retries pack verification)
- Context cancellation in `internal/restorer/restorer.go:102-104`
- Backend retry wrapper in `internal/backend/retry/backend_retry.go:140`

Lock-related failures have special handling in `internal/restic/lock.go:207-215` distinguishing permanent vs transient errors.

### 4. Are sentinel errors used for programmatic checking?

**Yes, extensively.** Key sentinel errors:
- `internal/repository/key.go:21`: `ErrNoKeyFound` — checked in `internal/global/global.go:399`
- `internal/restic/lock.go:87`: `ErrRemovedLock` — checked in `internal/restic/lock.go:342,369`
- `internal/restic/repository.go:14`: `ErrInvalidData` — checked in multiple locations
- `internal/data/tree.go:24`: `ErrTreeNotOrdered` — checked in tests
- `internal/data/snapshot_find.go:15`: `ErrNoSnapshotFound`

`errors.Is` is used throughout for comparison (137 matches found), enabling proper error chain traversal.

## Architectural Decisions

1. **Dedicated errors package** (`internal/errors/`): Provides wrapped `errors.New`/`errors.Errorf` that hides the internal package from stack traces, and `fatalError` for user-facing errors separate from operational errors.

2. **Typed errors for programmatic conditions**: Custom types like `alreadyLockedError` (`internal/restic/lock.go:47`), `invalidLockError` (`internal/restic/lock.go:68`), `MultipleIDMatchesError` (`internal/restic/backend_find.go:10`) enable `errors.As` checks.

3. **Error values for user-facing messages**: The `fatalError` mechanism separates what users see from what programs check.

4. **Consistent wrapping convention**: All public APIs wrap errors with context using `%w`.

## Notable Patterns

1. **Contextual corruption messages** (`internal/repository/repository.go:404-406`): Data corruption errors include user guidance about hardware issues and a link to file issues.

2. **Lock error hierarchy** (`internal/restic/lock.go:45-85`): Two distinct error types for lock conflicts (`alreadyLockedError`) vs invalid locks (`invalidLockError`), each with `Is*` checker functions.

3. **Backend error wrapping** (`internal/backend/sftp/sftp.go:81,91,114`): Uses `errors.Wrap` for SSH/SFTP errors with context.

4. **Checker errors** (`internal/checker/checker.go:70-91`): `Error` and `TreeError` structs collect multiple errors for batched reporting.

## Tradeoffs

1. **Good**: Strong error type hierarchy enables precise error handling at call sites.

2. **Good**: `fatalError` separation means user messages never leak into programmatic error checks.

3. **Tradeoff**: Some error messages could benefit from structured data (e.g., JSON error responses in `cmd/restic/main.go:138-148`) rather than just string formatting.

4. **Tradeoff**: The `github.com/pkg/errors` compatibility layer adds indirection but improves stack trace clarity.

## Failure Modes / Edge Cases

1. **Password failure**: `ErrNoKeyFound` wraps with `errors.Is` check in `internal/global/global.go:399` → distinct exit message.

2. **Lock conflicts**: `alreadyLockedError` detected in `internal/restic/lock.go:208` → retry loop exits with `IsAlreadyLocked` message.

3. **Partial reads**: `partialReadError` in `internal/repository/check.go:31` distinguished via `errors.As` at line 144.

4. **Backend disconnection**: Context cancellation and retry logic in `internal/backend/retry/backend_retry.go:140` handles transient failures.

## Future Considerations

1. Could benefit from structured error types with error codes for machine-readable error categories.

2. JSON output mode (`--json` flag in `cmd/restic/main.go:137`) could include error chain information rather than just the top-level message.

## Questions / Gaps

1. **No evidence found** for error retry budgets or backoff strategies in the error wrapping itself — retry logic exists but seems backend-specific rather than centralized.

2. **No evidence found** for error categories or domains beyond operational vs fatal — all errors seem to fall into these two buckets.

---

Generated by `study-areas/05-error-handling.md` against `restic`.