# Repo Analysis: rclone

## Error Handling Philosophy

### Repo Info

| Field | Value |
|-------|-------|
| Name | rclone |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/rclone` |
| Group | `rclone` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

rclone implements a sophisticated, layered error handling system with clear separation between operational errors (retriable), fatal errors (non-retriable), and user-facing errors. The codebase uses sentinel errors extensively, wraps errors with context via `fmt.Errorf` + `%w` (1706+ occurrences), and provides structured error types that implement interfaces for retry control (`Retrier`), fatal behavior (`Fataler`), and no-retry behavior (`NoRetrier`). The error hierarchy allows both programmatic error checking via `errors.Is`/`errors.As` and categorizes errors for exit code mapping.

## Rating

**8/10** — Excellent operational vs user-facing error separation. Consistent contextual wrapping throughout the codebase. The `fserrors` package provides a well-designed taxonomy of error behaviors (retriable, fatal, no-retry, countable) with wrapper types that preserve chainability. However, user-facing vs operational error rendering is less explicitly separated compared to the best-in-class implementations — error messages tend to be developer-oriented even when surfaced to end users.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Error wrapping with `%w` | 1706+ occurrences across codebase | `vfs/zip.go:21`, `vfs/vfscache/item.go:197`, `lib/rest/rest.go:56` |
| Sentinel errors | 50+ exported error sentinels in `fs/fs.go:27-55` | `fs/fs.go:36-37` |
| `errors.Is` usage | 172 matches for error chain inspection | `fs/sync/sync.go:338`, `fs/operations/operations.go:751` |
| `errors.As` usage | 27 matches for type extraction | `backend/s3/s3.go:1283`, `backend/drive/drive.go:1443` |
| Retry interface | `Retrier` interface with `Retry() bool` | `fs/fserrors/error.go:22-29` |
| Fatal interface | `Fataler` interface with `Fatal() bool` | `fs/fserrors/error.go:92-99` |
| NoRetry interface | `NoRetrier` interface with `NoRetry() bool` | `fs/fserrors/error.go:142-152` |
| Countable error | `CountableError` interface for stats tracking | `fs/fserrors/error.go:292-298` |
| Custom error type | `FileTooSmallError` with `Unwrap()` for chain | `fs/fs.go:61-73` |
| Retry decision function | `ShouldRetry()` with string matching | `fs/fserrors/error.go:404-434` |
| Error stats tracking | `StatsInfo.Error()` classifies errors | `fs/accounting/stats.go:756-780` |
| Exit code mapping | Error-to-exit-code switch statement | `cmd/cmd.go:497-516` |

## Answers to Protocol Questions

### 1. Are errors wrapped with context?

**Yes, extensively.** rclone wraps errors with `fmt.Errorf` + `%w` over 1706 times throughout the codebase. Wrapping patterns include operation context (`"vfs cache item: failed to read metadata: %w"` at `vfs/vfscache/item.go:197`), source/destination context (`"failed to stat source: %s: %w"` at `vfs/vfscache/cache.go:389`), and HTTP-specific context. The `fserrors` package provides wrapper functions (`RetryError`, `FatalError`, `NoRetryError`, `NoLowLevelRetryError`) that preserve the error chain via `Unwrap()` while tagging the error with behavioral metadata.

### 2. Which errors are user-facing vs operational?

The codebase does not make a hard user-facing vs operational distinction in error rendering — error messages are generally consistent across both contexts. However, the **operational vs fatal separation** is clearly defined:

- **Operational (retriable)**: Network timeouts, temporary failures, rate limiting — handled via `fserrors.RetryError` and `fserrors.ShouldRetry()`. These result in `exitcode.RetryError` (exit code 4).
- **Fatal (non-retriable)**: Disk full, permission denied, irrecoverable state — handled via `fserrors.FatalError()`. These result in `exitcode.FatalError` (exit code 10).
- **Countable errors**: Track error counts in stats but don't immediately halt operations.

User-facing feedback comes through stats reporting (`stats.go:473` adds "(fatal error encountered)" suffix) and exit codes, but the error messages themselves are developer-oriented.

### 3. How are fatal vs recoverable failures handled?

**Layered handling:**

1. **Interface-based tagging**: Errors implement `Fataler`, `Retrier`, `NoRetrier` interfaces via wrapper types in `fs/fserrors/error.go:103-177`.
2. **Decision functions**: `IsFatalError()`, `IsRetryError()`, `ShouldRetry()` walk the error chain to determine behavior.
3. **Sync-level handling** (`fs/sync/sync.go:338-344`):
   ```go
   case fserrors.IsFatalError(err):
       fs.Errorf(nil, "Cancelling sync due to fatal error: %v", err)
       return err
   case fserrors.IsNoRetryError(err):
       return err
   ```
4. **Stats tracking** (`fs/accounting/stats.go:768-778`): Errors are classified and counted.
5. **Exit mapping** (`cmd/cmd.go:497-516`): Maps error types to exit codes.

### 4. Are sentinel errors used for programmatic checking?

**Yes, extensively.** The `fs/fs.go:27-55` exports 30+ sentinel errors:
- `ErrorDirNotFound`, `ErrorObjectNotFound`, `ErrorFileTooSmall`, `ErrorPermissionDenied`, `ErrorNotImplemented`, `ErrorCantCopy`, `ErrorCantMove`, etc.

These are used with `errors.Is()` for programmatic handling throughout the codebase (172+ `errors.Is` calls). The `FileTooSmallError` struct (`fs/fs.go:61-73`) demonstrates a custom error type that wraps a sentinel while preserving `errors.Is` compatibility via `Unwrap()`.

Backend-specific errors use `errors.As()` for type extraction (e.g., `backend/s3/s3.go:1283` extracting `smithy.APIError`, `backend/drive/drive.go:1443` extracting Google API errors).

## Architectural Decisions

### Error Interface Hierarchy
rclone defines four behavioral error interfaces in `fs/fserrors/error.go`:
- `Retrier` (line 22): "should this operation be retried at a high level?"
- `Fataler` (line 92): "should this cause the entire operation to finish immediately?"
- `NoRetrier` (line 142): "should this NOT be retried at a high level?"
- `NoLowLevelRetrier` (line 192): "should this NOT be retried at a low level?"

This allows error producers to tag errors with behavior without coupling to specific error types.

### Wrapper Pattern for Error Tagging
All behavioral tags are implemented as wrapper types (`wrappedRetryError`, `wrappedFatalError`, etc.) that embed the original error and implement `Unwrap()`. This preserves the full error chain for debugging while adding behavioral metadata.

### Stats-Based Error Classification
The `StatsInfo.Error()` method (`fs/accounting/stats.go:756-780`) classifies every error and updates retry/fatal error flags. This provides a unified view of error state across operations.

### Backend Error Abstraction
Each backend implements `shouldRetry()` method (e.g., `backend/s3/s3.go:1276-1312`) that extracts backend-specific error types via `errors.As` before falling back to the general `fserrors.ShouldRetry()`.

## Notable Patterns

### Consistent Wrapping Convention
All error wrapping follows the pattern `"context: operation: %w"` providing three layers of context. Examples:
- `lib/kv/bolt.go:104`: `"cannot open db: %s: %w"` — includes db path
- `lib/oauthutil/oauthutil.go:360`: `"couldn't fetch token: %w"` — operation context
- `backend/s3/s3.go:1289`: `"RequestTimeout"` error code handling within retry logic

### Error String Matching for Retriability
`fs/fserrors/error.go:381-390` maintains a hardcoded list of retriable error strings for network errors that don't implement standard `Timeout()`/`Temporary()` interfaces. This is acknowledged as "incredibly ugly" but necessary for stdlib error compatibility.

### Countable Error Pattern
Errors can be marked as "counted" via `CountableError` interface to prevent double-counting in stats (`fs/fserrors/error.go:292-341`).

### Graceful vs Fatal Transfer Limit
`fs/accounting/accounting.go:25-31` defines both a fatal and graceful variant for transfer limit errors:
- `ErrorMaxTransferLimitReachedFatal` — wraps with `FatalError()`, stops immediately
- `ErrorMaxTransferLimitReachedGraceful` — wraps with `NoRetryError()`, allows clean shutdown

## Tradeoffs

**Pros:**
- Comprehensive error taxonomy covers all operational scenarios
- Interface-based design allows orthogonal error behavior (retry × fatal × countable)
- `Unwrap()` chain preservation enables full stack traces in debugging
- Consistent wrapping convention across 1700+ error sites

**Cons:**
- No explicit user-facing vs developer-facing error rendering separation
- Error string matching for retriability (`retriableErrorStrings`) is fragile and acknowledged as ugly
- The `CountableError` pattern adds complexity; many errors are wrapped twice (once for behavior, once for counting)
- Large number of sentinel errors (30+) may require ongoing maintenance as new error cases are discovered

## Failure Modes / Edge Cases

1. **Context cancellation** — `fserrors.ContextError()` overwrites error with context error only if perr is nil, ensuring original error isn't lost (`fs/fserrors/error.go:452-459`)

2. **Error chain walking** — All `Is*` functions walk the full error chain via `liberrors.Walk()`, handling multi-level wrapping

3. **Retry exhaustion** — Handled at sync level with `fatalErr` propagation (`fs/sync/sync.go:76,343-360`)

4. **Backend-specific errors** — Each backend must implement its own `shouldRetry` that extracts provider-specific error types before falling back to general logic

5. **Nil error handling** — All wrapper functions guard against nil (`fs/fserrors/error.go:69-72`, `118-123`)

## Future Considerations

- Could benefit from structured user-facing error rendering that translates operational errors into user-friendly messages
- The `retriableErrorStrings` string matching could be replaced with more robust error wrapping in stdlib
- Error documentation could be improved — many sentinels lack doc comments explaining when they're used

## Questions / Gaps

- **User-facing error rendering**: No evidence found of explicit user-facing error formatting layer. All errors appear to be developer-oriented strings.
- **Error localization**: No evidence found of i18n/l10n for error messages.
- **Error recovery suggestions**: Errors don't include suggested recovery actions in the message text.

---

Generated by `study-areas/05-error-handling.md` against `rclone`.