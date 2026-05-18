# Repo Analysis: gh-cli

## Error Handling Philosophy

### Repo Info

| Field | Value |
|-------|-------|
| Name | gh-cli |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/gh-cli` |
| Group | `gh-cli` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

gh-cli (GitHub CLI) demonstrates a mature and disciplined approach to error handling. It uses consistent `fmt.Errorf` with `%w` wrapping throughout (644+ instances), maintains a structured set of sentinel errors for programmatic checking (`ErrKeyAlreadyExists`, `divergingError`, `NotFoundError`, etc.), and employs custom error types that carry structured data (HTTPError, GraphQLError, GitError, FlagError). The codebase rigorously distinguishes user-facing errors (rendered via `printError` in `internal/ghcmd/cmd.go:281-301`) from operational/debug errors, and uses typed errors with `errors.Is`/`errors.As` for control flow. The main entry point (`internal/ghcmd/cmd.go:52`) maps specific error types to distinct exit codes (0, 1, 2, 4, 8), enabling precise scriptable error handling.

## Rating

**8/10** — Consistent contextual error wrapping with `%w`, well-structured sentinel and custom error types, clear separation between user-facing and operational errors, and disciplined exit code mapping. Minor扣分: some errors lack wrapping context, and the error type hierarchy is somewhat ad-hoc rather than formally documented.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Error wrapping with `%w` | `fmt.Errorf("could not create .ssh directory: %w", err)` — SSH key creation | `pkg/ssh/ssh_keys.go:64` |
| Error wrapping with `%w` | `fmt.Errorf("could not build http client: %w", err)` — workflow view | `pkg/cmd/workflow/view/view.go:102` |
| Sentinel error definition | `var ErrKeyAlreadyExists = errors.New("SSH key already exists")` | `pkg/ssh/ssh_keys.go:35` |
| Sentinel error definition | `var divergingError = errors.New("diverging changes")` | `pkg/cmd/repo/sync/sync.go:219` |
| Sentinel error definition | `var NotFoundError = errors.New("not found")` | `pkg/cmd/repo/view/http.go:17` |
| Sentinel error with `errors.Is` check | `errors.Is(err, ErrKeyAlreadyExists)` — key pair check | `pkg/ssh/ssh_keys.go:74` |
| Sentinel error with `errors.Is` check | `errors.Is(err, divergingError)` — sync conflict detection | `pkg/cmd/repo/sync/sync.go:151` |
| Custom error type with `errors.As` | `HTTPError` struct wrapping `ghAPI.HTTPError` | `api/client.go:46-49` |
| Custom error type with `errors.As` | `GraphQLError` struct wrapping `ghAPI.GraphQLError` | `api/client.go:42-44` |
| Custom error type with `errors.As` | `GitError{ExitCode int, Stderr string, err error}` | `git/errors.go:24-28` |
| Custom error type with `errors.As` | `FlagError{err error}` with `Unwrap()` | `pkg/cmdutil/errors.go:21-32` |
| Exit code mapping | `exitOK=0, exitError=1, exitCancel=2, exitAuth=4, exitPending=8` | `internal/ghcmd/cmd.go:44-49` |
| Exit code mapping in Main() | `errors.As(err, &authError)` → `exitAuth` | `internal/ghcmd/cmd.go:209-210` |
| User-facing error rendering | `printError()` distinguishes DNS errors, FlagErrors | `internal/ghcmd/cmd.go:281-301` |
| User-facing error rendering | DNS-specific message: "error connecting to %s\ncheck your internet connection" | `internal/ghcmd/cmd.go:284-288` |
| SilentError sentinel | `var SilentError = errors.New("SilentError")` — exit 1 no message | `pkg/cmdutil/errors.go:35` |
| CancelError sentinel | `var CancelError = errors.New("CancelError")` — user cancellation | `pkg/cmdutil/errors.go:38` |
| NoResultsError type | `type NoResultsError struct{message string}` with `Error()` | `pkg/cmdutil/errors.go:60-66` |
| errors.As for HTTP status | `errors.As(err, &httpErr) && httpErr.StatusCode == 404` | `pkg/cmd/variable/get/get.go:117` |
| errors.Is for os errors | `errors.Is(err, os.ErrNotExist)` — log file check | `pkg/cmd/run/view/view.go:40` |
| errors.Is for terminal interrupt | `errors.Is(err, terminal.InterruptErr)` — user cancel | `pkg/cmdutil/errors.go:44` |

## Answers to Protocol Questions

### 1. Are errors wrapped with context?

**Yes.** gh-cli uses `fmt.Errorf` with `%w` wrapping extensively (644+ instances found). Examples:
- `pkg/ssh/ssh_keys.go:64`: `fmt.Errorf("could not create .ssh directory: %w", err)`
- `pkg/cmd/workflow/view/view.go:102`: `fmt.Errorf("could not build http client: %w", err)`
- `pkg/cmd/variable/set/http.go:80`: `fmt.Errorf("failed to set variable %q: %w", opts.Key, err)`

The wrapping includes actionable context: what operation failed, which resource was targeted, and what specific action the user should take. However, not all errors are wrapped — some internal errors are returned directly, relying on the caller to wrap them.

### 2. Which errors are user-facing vs operational?

**User-facing errors** are rendered in `internal/ghcmd/cmd.go:281-301` (`printError`):
- DNS errors show a friendly "error connecting to %s\ncheck your internet connection" message
- Flag errors print the command usage string
- HTTP 401 errors suggest `gh auth login` or `gh auth refresh`
- SAML enforcement errors suggest a web browser authorization flow
- Missing scope errors suggest `gh auth refresh -s <scope>`

**Operational/debug errors** (full error chain) are shown:
- When `hasDebug` is true (via `GH_DEBUG=1`)
- For DNS errors: the full error is printed after the friendly message
- For FlagErrors: the full error is followed by usage

**Exit code distinction:**
- `exitOK (0)`: success
- `exitError (1)`: general failure
- `exitCancel (2)`: user cancellation
- `exitAuth (4)`: authentication failure
- `exitPending (8)`: pending state

### 3. How are fatal vs recoverable failures handled?

**Recoverable errors** are returned as errors and handled by the caller, with typed error checking for control flow:
- `errors.Is(err, divergingError)` triggers user-facing messaging about `--force`
- `errors.As(err, &httpErr) && httpErr.StatusCode == 404` triggers "not found" handling
- `errors.Is(err, ErrKeyAlreadyExists)` allows caller to decide if this is acceptable

**Fatal/recoverable is not structurally distinguished.** There is no `FatalError` type or `panic` mechanism for unrecoverable failures. All errors flow through the return path and are handled at the top level in `internal/ghcmd/cmd.go:194-248`.

**Exit codes enable scripts to distinguish fatal-like scenarios:**
- `exitAuth (4)`: authentication required
- `exitCancel (2)`: user cancelled
- `exitError (1)`: general failure

The `SilentError` sentinel (`pkg/cmdutil/errors.go:35`) triggers exit 1 without any error message, useful when the error message has already been displayed.

### 4. Are sentinel errors used for programmatic checking?

**Yes.** gh-cli defines and uses sentinel errors extensively:

**Defined sentinels:**
- `pkg/cmdutil/errors.go:35`: `SilentError`
- `pkg/cmdutil/errors.go:38`: `CancelError`
- `pkg/cmdutil/errors.go:41`: `PendingError`
- `pkg/ssh/ssh_keys.go:35`: `ErrKeyAlreadyExists`
- `pkg/cmd/repo/sync/sync.go:219`: `divergingError`
- `pkg/cmd/repo/view/http.go:17`: `NotFoundError`
- `pkg/cmd/run/shared/shared.go:272`: `ErrMissingAnnotationsPermissions`
- `pkg/cmd/pr/shared/commentable.go:20`: `errNoUserComments`
- `pkg/cmd/pr/shared/commentable.go:21`: `errDeleteNotConfirmed`
- `pkg/release/shared/fetch.go:131`: `ErrReleaseNotFound`
- `pkg/cmd/run/view/logs.go:77`: `errTooManyAPILogFetchers`
- `pkg/cmd/release/download/download.go:339`: `errSkipped`
- `pkg/cmd/root/root.go:55`: `AuthError` (custom type, not sentinel)

**Checked with `errors.Is`:**
- `pkg/ssh/ssh_keys.go:74`: `errors.Is(err, ErrKeyAlreadyExists)`
- `pkg/cmd/repo/sync/sync.go:151,197`: `errors.Is(err, divergingError)`
- `pkg/cmdutil/errors.go:44`: `errors.Is(err, CancelError) || errors.Is(err, terminal.InterruptErr)`

**Checked with `errors.As`:**
- `pkg/cmd/variable/get/get.go:117`: `errors.As(err, &httpErr) && httpErr.StatusCode == http.StatusNotFound`
- `pkg/cmd/run/view/view.go:40`: `errors.Is(err, os.ErrNotExist)`
- `internal/ghcmd/cmd.go:234`: `errors.As(err, &httpErr) && httpErr.StatusCode == 401`

## Architectural Decisions

### Error type hierarchy is ad-hoc rather than formally documented

gh-cli does not have a formal error type hierarchy. Error types emerge organically:
- `HTTPError`/`GraphQLError` wrap API client errors and carry structured data (status code, scopes suggestion)
- `GitError` carries exit code and stderr
- `FlagError` carries wrapped flag validation errors
- `ExternalCommandExitError` wraps `exec.ExitError` for extension exit codes

There is no `interface{ IsTemporary() bool }` or similar mechanism to distinguish transient vs permanent failures.

### Error wrapping is consistent but not mandatory

The codebase uses `fmt.Errorf` with `%w` in 644+ places, but there is no linter rule enforcing it. Some internal errors are returned unwrapped, relying on callers to wrap. This can lead to error chains that lack full context when errors bubble up through multiple layers.

### Exit codes are a first-class concern

The `Main()` function in `internal/ghcmd/cmd.go:52` is explicitly typed to return `exitCode` (not `int` or `error`), making exit code discipline a structural requirement. The mapping from error types to exit codes is centralized and exhaustive.

## Notable Patterns

### Sentinel error + returned data pattern

```go
// pkg/ssh/ssh_keys.go:73-75
if _, err := os.Stat(keyFile); err == nil {
    return &keyPair, ErrKeyAlreadyExists  // Return data even on error
}
```
The caller receives the partially-valid result and must check `errors.Is(err, ErrKeyAlreadyExists)` to decide whether to proceed or treat it as an error.

### Error type + status code double dispatch

```go
// pkg/cmd/variable/get/get.go:117
if errors.As(err, &httpErr) && httpErr.StatusCode == http.StatusNotFound {
    return cmdutil.FlagErrorf("variable %s not found", opts.VariableName)
}
```
Uses `errors.As` to access HTTP status code for fine-grained control flow.

### User-facing vs debug error rendering

```go
// internal/ghcmd/cmd.go:281-301
func printError(out io.Writer, err error, cmd *cobra.Command, debug bool) {
    var dnsError *net.DNSError
    if errors.As(err, &dnsError) {
        fmt.Fprintf(out, "error connecting to %s\n", dnsError.Name)
        if debug {
            fmt.Fprintln(out, dnsError)  // Full error only in debug mode
        }
        fmt.Fprintln(out, "check your internet connection or https://githubstatus.com")
        return
    }
    fmt.Fprintln(out, err)  // Full error for other errors
}
```

### Scope suggestion for API errors

```go
// api/client.go:209-258
func generateScopesSuggestion(statusCode int, endpointNeedsScopes, tokenHasScopes, hostname string) string
```
Automatically suggests `gh auth refresh -s <scope>` when API returns 4xx due to missing OAuth scopes.

## Tradeoffs

| Pattern | Benefit | Cost |
|---------|---------|------|
| 644+ `fmt.Errorf %w` wrapping | Rich error chains with context | Large volume; consistency depends on developer discipline |
| Custom error types (HTTPError, GitError) | Structured data for programmatic handling | Requires `errors.As` knowledge; not always checked |
| Centralized exit code mapping | Predictable script behavior | Error → exit code mapping is ad-hoc; new errors must be manually added to `Main()` |
| Sentinel errors for control flow | `errors.Is` allows clean comparison | Adding new sentinels requires coordination across packages |
| `SilentError` for suppressed output | Allows exit 1 without redundant message | Semantics of "silent" can be confusing in logs |

## Failure Modes / Edge Cases

### Silent failure on pager pipe closure

```go
// internal/ghcmd/cmd.go:211-213
} else if errors.As(err, &pagerPipeError) {
    return exitOK  // Ignore closed pager pipe
}
```
When output is piped and the downstream process closes the pipe early, gh exits 0 rather than treating it as a failure.

### Exit code 0 for "no results"

```go
// internal/ghcmd/cmd.go:214-219
} else if errors.As(err, &noResultsError) {
    if cmdFactory.IOStreams.IsStdoutTTY() {
        fmt.Fprintln(stderr, noResultsError.Error())
    }
    return exitOK  // no results is not a command failure
}
```
Empty results (e.g., no matching issues) return exit 0, which may surprise scripts expecting failure on empty output.

### HTTPError 401 → exitAuth but only at top level

The `exitAuth` mapping only occurs in `Main()`. If a command handles `HTTPError` internally (which many do), they return `exitError` rather than propagating the auth error type. This can lead to inconsistent exit codes for auth failures depending on where they occur.

### NotFoundError is a local sentinel

```go
// pkg/cmd/repo/view/http.go:17
var NotFoundError = errors.New("not found")
```
This is defined in `pkg/cmd/repo/view/` and only checked within that package. Other packages use their own `NotFoundError` variants or check `StatusCode == 404` directly.

## Future Considerations

- **Formal error type hierarchy**: Consider documenting a structured error type system (e.g., `TemporaryError`, `AuthorizationError`, `ValidationError`) with standard interfaces for error categorization.
- **Linter rule for wrapping**: A golangci-lint rule enforcing `%w` wrapping at certain abstraction boundaries could ensure consistent error chains.
- **Centralized scope suggestion**: The `generateScopesSuggestion` logic in `api/client.go:209-258` could be generalized into the `HTTPError` type itself, reducing repetition across commands.
- **Propagating AuthError**: Currently many commands handle auth errors implicitly. Making `AuthError` propagate consistently through all layers would give more predictable exit codes.

## Questions / Gaps

1. **Why does `NotFoundError` exist separately in `pkg/cmd/repo/view/http.go:17` when there is no package-level `NotFoundError` constant?** Other packages use HTTP status code checks or local error definitions.

2. **Is the `SilentError` pattern (exit 1, no message) documented for extension authors?** Extensions that return `SilentError` would trigger exit code 1, but the user wouldn't see why.

3. **Why is `exitPending (8)` defined but seemingly unused in the current codebase?** The `PendingError` sentinel exists (`pkg/cmdutil/errors.go:41`) but no command appears to return it.

4. **No evidence found** of a formal "temporary error" interface for retry logic. Commands that retry (e.g., network operations) appear to do so with ad-hoc loops rather than a standardized retry mechanism with backoff.

---

Generated by `study-areas/05-error-handling.md` against `gh-cli`.