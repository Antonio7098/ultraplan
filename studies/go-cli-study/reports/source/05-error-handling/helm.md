# Repo Analysis: helm

## Error Handling Philosophy

### Repo Info

| Field | Value |
|-------|-------|
| Name | helm |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/helm` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Helm demonstrates mature error handling with consistent contextual wrapping via `fmt.Errorf %w`, exported sentinel errors for programmatic checking, and custom error types for domain-specific failures. Error rendering separates user-facing CLI output from internal operational errors, though the distinction could be sharper.

## Rating

**8/10** — Consistent contextual errors with good sentinel error usage. User-facing vs operational error separation exists but is implicit rather than enforced by type design.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Error wrapping | `fmt.Errorf("error parsing index: %w", err)` pattern | `pkg/strvals/parser.go:199` |
| Error wrapping | `fmt.Errorf("get: failed to get %q: %w", key, err)` | `pkg/storage/driver/secrets.go:76` |
| Error wrapping | `fmt.Errorf("UPGRADE FAILED: %w", err)` | `pkg/cmd/upgrade.go:255` |
| Sentinel errors | `ErrReleaseNotFound = errors.New("release: not found")` | `pkg/storage/driver/driver.go:29` |
| Sentinel errors | `ErrReleaseExists = errors.New("release: already exists")` | `pkg/storage/driver/driver.go:31` |
| Sentinel errors | `ErrNoDeployedReleases = errors.New("has no deployed releases")` | `pkg/storage/driver/driver.go:35` |
| errors.Is check | `errors.Is(err, driver.ErrReleaseNotFound)` | `pkg/action/upgrade.go:235` |
| errors.Is check | `errors.Is(err, driver.ErrNoDeployedReleases)` | `pkg/action/upgrade.go:264` |
| errors.As check | `errors.As(err, &ev)` for event watch errors | `pkg/kube/wait.go:112` |
| Custom error type | `type StorageDriverError struct { ReleaseName string; Err error }` with Unwrap() | `pkg/storage/driver/driver.go:39-48` |
| Custom error type | `type ChartNotFoundError struct { RepoURL string; Chart string }` with Is() method | `pkg/repo/v1/error.go:23-35` |
| Custom error type | `type CommandError struct { error; ExitCode int }` | `pkg/cmd/root.go:475-478` |
| Custom error type | `type TraceableError` for template error location tracking | `pkg/engine/engine.go:332-336` |
| Multi-error handling | `type joinedErrors struct { errs []error; sep string }` with Unwrap() | `pkg/action/uninstall.go:232-254` |
| User-facing error | "UPGRADE FAILED: %w" prefix on upgrade failures | `pkg/cmd/upgrade.go:255` |
| User-facing error | "release name is invalid: %s" for validation errors | `pkg/action/upgrade.go:192` |
| Kubernetes errors | `apierrors.IsNotFound(err)`, `apierrors.IsAlreadyExists(err)` | `pkg/storage/driver/secrets.go:73,183` |
| Kubernetes errors | `apierrors.IsConflict(err)` for server-side apply | `pkg/kube/client.go:1201,1240` |

## Answers to Protocol Questions

### 1. Are errors wrapped with context?

**Yes.** Helm extensively wraps errors with contextual information using `fmt.Errorf` with `%w`. Examples:
- `pkg/storage/driver/secrets.go:76`: `fmt.Errorf("get: failed to get %q: %w", key, err)`
- `pkg/action/upgrade.go:255`: `fmt.Errorf("UPGRADE FAILED: %w", err)`
- `pkg/downloader/manager.go:770`: `fmt.Errorf("chart %s not found in %s: %w", name, repoURL, err)`

Over 360 instances of `fmt.Errorf` with `%w` wrapping were found across the codebase.

### 2. Which errors are user-facing vs operational?

**User-facing errors** are those displayed directly to CLI users:
- Upgrade failure message: `"UPGRADE FAILED: %w"` (`pkg/cmd/upgrade.go:255`)
- "release name is invalid" validation (`pkg/action/upgrade.go:192`)
- Chart not found: `ChartNotFoundError` renders as `"%s not found in %s repository"` (`pkg/repo/v1/error.go:28-29`)
- "no results found" for search (`pkg/cmd/search_hub.go:140`)

**Operational errors** are logged/debug-level and not shown to end users:
- Storage driver errors wrapped with context for debugging (`pkg/storage/driver/secrets.go:76-215`)
- Kubernetes API errors checked via `apierrors.IsNotFound`, `apierrors.IsConflict`
- Template parsing errors with `TraceableError` for developer debugging (`pkg/engine/engine.go:332-384`)

The distinction is implicit in naming and log levels rather than enforced by type hierarchy.

### 3. How are fatal vs recoverable failures handled?

**Recoverable failures** use standard error returns:
- Release not found: Returns `driver.ErrReleaseNotFound` which is checked with `errors.Is()` in callers (`pkg/action/upgrade.go:235`)
- Deployed release missing: Returns `driver.ErrNoDeployedReleases` and allows upgrade to proceed with current release (`pkg/action/upgrade.go:264-266`)

**Fatal/combined failures** use `joinedErrors` for multiple errors:
- Uninstall can complete with multiple delete errors: `pkg/action/uninstall.go:217-218` uses `fmt.Errorf("uninstallation completed with %d error(s): %w", len(errs), joinErrors(errs, "; "))`
- The `joinedErrors` type implements `Unwrap() []error` for proper error chain inspection (`pkg/action/uninstall.go:252-254`)

**No panic-driven error handling** was found — all errors flow through return values.

### 4. Are sentinel errors used for programmatic checking?

**Yes.** Helm exports sentinel errors from the storage driver package:
```go
var (
    ErrReleaseNotFound = errors.New("release: not found")
    ErrReleaseExists = errors.New("release: already exists")
    ErrInvalidKey = errors.New("release: invalid key")
    ErrNoDeployedReleases = errors.New("has no deployed releases")
)
```
These are checked via `errors.Is()` throughout:
- `pkg/action/upgrade.go:235`: `errors.Is(err, driver.ErrReleaseNotFound)`
- `pkg/action/uninstall.go:82`: `errors.Is(err, driver.ErrReleaseNotFound)`
- `pkg/action/rollback.go:289`: `errors.Is(err, driver.ErrNoDeployedReleases)`

The `ChartNotFoundError` type implements `Is(error) bool` for interface matching (`pkg/repo/v1/error.go:32-35`).

## Architectural Decisions

1. **Error wrapping is consistent but manual**: Every function that propagates errors explicitly wraps with context. There is no central error wrapping utility enforcing a format.

2. **Sentinel errors live in storage/driver**: The four core sentinel errors are in `pkg/storage/driver/driver.go:27-36`, making them the canonical errors for release lifecycle operations.

3. **Custom error types for domain concepts**: `ChartNotFoundError`, `StorageDriverError`, `TraceableError`, and `CommandError` each model a distinct failure domain with appropriate fields.

4. **Kubernetes error checking uses apierrors package**: The codebase distinguishes Kubernetes API errors (NotFound, AlreadyExists, Conflict) using `k8s.io/apimachinery/pkg/api/errors` functions rather than sentinel matching.

5. **Multi-error aggregation in uninstall**: The `joinedErrors` type allows collecting multiple delete failures while maintaining the error chain.

## Notable Patterns

- **Contextual prefixes in CLI commands**: `pkg/cmd/upgrade.go:255` prepends "UPGRADE FAILED: " before wrapping the underlying error, making CLI output actionable without losing the error chain.

- **Error chain preservation**: All custom error types implement `Unwrap()` (StorageDriverError at `pkg/storage/driver/driver.go:48`, joinedErrors at `pkg/action/uninstall.go:252-254`).

- **Template error traceability**: The `TraceableError` type (`pkg/engine/engine.go:332-336`) parses Go template errors to extract filename, line number, and executed function for better debugging.

- **Actionable user messages**: Many errors include suggested actions ("try 'helm repo update'", "run 'helm dependency build'") embedded in the error message.

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| Manual error wrapping | Flexible but requires discipline; inconsistent wrapping possible |
| No error type hierarchy | Simple stdlib-compatible design but cannot distinguish error categories via type |
| joinedErrors for multi-error | Allows partial failures but obscures individual error details |
| CommandError with ExitCode | Coubles error handling to CLI exit codes, less reusable for library use |

## Failure Modes / Edge Cases

1. **Error chain truncation**: Deep nesting of wrapped errors can make the root cause harder to trace when using `errors.Is()`.

2. **Template error parsing fragile**: `TraceableError` parsing in `pkg/engine/engine.go:354-384` uses string manipulation which could break if Go's template error format changes.

3. **Kubernetes error type assertions**: Multiple `apierrors.Is*` checks in `pkg/kube/client.go` assume specific Kubernetes error types which may not cover all server-side apply failure modes.

4. **Silent logging of uninstall errors**: At `pkg/action/uninstall.go:213`, uninstall errors are logged at Debug level rather than propagated, potentially hiding partial failures.

## Future Considerations

1. Consider a centralized error wrapping utility to enforce consistent context inclusion.
2. A dedicated `UserFacingError` interface could make the user/operational distinction explicit in the type system.
3. The `joinedErrors` type could benefit from implementing `errors.Is()` / `errors.As()` for individual error inspection.

## Questions / Gaps

- **No evidence found** of structured error logging (e.g., zerolog, zap) — Helm uses stdlib `log/slog`.
- **No evidence found** of error injection/mocking utilities for testing error paths beyond standard Go error handling.
- The `CommandError` type at `pkg/cmd/root.go:475-478` is defined but not widely used, suggesting it may be vestigial.

---

Generated by `05-error-handling.md` against `helm`.