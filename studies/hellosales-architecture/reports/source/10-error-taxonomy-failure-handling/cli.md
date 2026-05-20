# Source Analysis: cli

## Error Taxonomy & Failure Handling

### Source Info

| Field | Value |
|-------|-------|
| Name | cli |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/cli` |
| Language / Stack | Go (github.com/cli/cli/v2) |
| Analyzed | 2026-05-20 |

## Summary

The GitHub CLI (`gh`) has a well-structured error taxonomy with custom sentinel errors, typed HTTP/GraphQL errors, and a consistent error-wrapping convention using `fmt.Errorf` with `%w`. Retry logic is implemented via the `cenkalti/backoff` library with constant backoff and max-retries policies. No circuit breaker pattern was found. Partial failure handling exists in specific domains (issues, attestations) but is not generalized.

## Rating

**6/10** — Basic to good implementation with gaps. The error type hierarchy is solid at the core (`cmdutil/errors.go`), HTTP/GraphQL errors are properly typed, and retry logic is consistently applied. However, no circuit breakers exist, partial failure reporting is inconsistent, and retry strategies are limited to constant backoff (no exponential backoff or jitter in most places).

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Sentinel errors | `SilentError`, `CancelError`, `PendingError` | `pkg/cmdutil/errors.go:35,38,41` |
| FlagError type | `type FlagError struct` with `Unwrap()` | `pkg/cmdutil/errors.go:21-32` |
| NoResultsError | `type NoResultsError struct` | `pkg/cmdutil/errors.go:60-66` |
| HTTPError type | `type HTTPError struct` wrapping `*ghAPI.HTTPError` | `api/client.go:46-53` |
| GraphQLError type | `type GraphQLError struct` wrapping `*ghAPI.GraphQLError` | `api/client.go:42-44` |
| Git errors | `ErrNotOnAnyBranch`, `GitError`, `NotInstalled` | `git/errors.go:9,24,11` |
| Error wrapping | `fmt.Errorf("...: %w", err)` throughout | `api/client.go:118,124` |
| Retry with backoff | `backoff.NewConstantBackOff`, `backoff.Retry` | `pkg/cmd/attestation/api/client.go:137,141` |
| Max retries | `backoff.WithMaxRetries(bo, 3)` | `pkg/cmd/attestation/api/client.go:165` |
| Permanent errors | `backoff.Permanent(err)` to mark non-retryable | `pkg/cmd/attestation/api/client.go:147,246,251,258,294` |
| Rate limit detection | `isRateLimitError()` checking 429, 403 with headers | `pkg/cmd/skills/search/search.go:707-729` |
| Retry on 5xx | `shouldRetry()` returns true for status >= 500 | `pkg/cmd/release/shared/upload.go:133-140` |
| PartialLoadError | `type PartialLoadError struct` for GraphQL partial failure | `pkg/cmd/issue/shared/lookup.go:99-104` |
| Codespace retry | `withRetry()` retries on >=500 status | `internal/codespaces/api/api.go:1201-1215` |
| Exponential backoff | Used in `agent-task/create/create.go:217-220` | `pkg/cmd/agent-task/create/create.go:217-220` |
| Codespace polling backoff | `codespaceStatePollingBackoff` exponential | `internal/codespaces/codespaces.go:18-22` |
| Scope suggestion | `generateScopesSuggestion()` for missing OAuth scopes | `api/client.go:209-259` |
| Unwrap interface | `FlagError.Unwrap()`, `GitError.Unwrap()`, `NotInstalled.Unwrap()` | `pkg/cmdutil/errors.go:30-32`, `git/errors.go:20-22,37-39` |
| Errgroup partial results | `errgroup.Group` used in `FindIssuesOrPRs` | `pkg/cmd/issue/shared/lookup.go:107,121` |

## Answers to Dimension Questions

### 1. How does the system distinguish client errors from server errors from transient failures?

**Client vs Server**: HTTP status codes are the primary distinguisher. The `api.HTTPError` type wraps `*ghAPI.HTTPError` which includes `StatusCode`. Client errors (4xx) are surfaced immediately; server errors (5xx) trigger retry logic in several places.

- `api/client.go:169-178`: `handleResponse()` converts `ghAPI.HTTPError` to `HTTPError`, adding scope suggestions for 4xx
- `pkg/cmd/release/shared/upload.go:139`: `shouldRetry()` returns true only for `statusCode >= 500`
- `internal/codespaces/api/api.go:1210`: `withRetry()` returns immediately for `resp.StatusCode < 500`

**Transient failures**: The `backoff.Permanent()` function marks errors as non-retryable, differentiating permanent failures from transient ones. This is used throughout (`pkg/cmd/attestation/api/client.go:147`, `pkg/cmd/pr/create/create.go:1273`).

**No evidence found** for a unified error categorization scheme that formally distinguishes client/server/transient across all error paths. Each command handles this differently.

### 2. Are errors typed so callers can handle specific failure modes?

**Yes, but inconsistently.** The codebase uses Go's error wrapping and type assertions (`errors.As`) to enable caller discrimination:

- **HTTPError** (`api/client.go:46-53`): Callers can inspect `StatusCode`, `Headers`, `RequestURL` to handle specific HTTP error conditions
- **GraphQLError** (`api/client.go:42-44`): Callers can use `Match()` method to check specific GraphQL error codes
- **FlagError** (`pkg/cmdutil/errors.go:21-32`): Callers can use `errors.Is()` to detect flag errors
- **NotFoundError** (`pkg/cmd/pr/shared/finder.go:616`): Specific not-found handling
- **PartialLoadError** (`pkg/cmd/issue/shared/lookup.go:99-104`): Partial data available

**Inconsistent**: Many commands use plain `errors.New("...")` strings which prevent callers from programmatically handling specific failure modes. For example, `SilentError`, `CancelError`, and `PendingError` are sentinel errors (`pkg/cmdutil/errors.go:35-41`) but most domain-specific errors are opaque strings.

### 3. What is the retry strategy — exponential backoff, jitter, max attempts?

**Max attempts**: Consistently 3 retries across all retry implementations.

**Backoff type**: Mixed — constant backoff is most common:
- **Constant backoff**: `pkg/cmd/attestation/api/client.go:137` (`getAttestationRetryInterval = 200ms`), `pkg/cmd/release/shared/upload.go:143,151` (`retryInterval = 200ms`), `internal/codespaces/api/api.go:99` (`retryBackoff: 100ms`)
- **Exponential backoff**: Only in `internal/codespaces/codespaces.go:18-22` (polling) and `pkg/cmd/agent-task/create/create.go:217-220` (job session fetch)

**Jitter**: No evidence found. No uses of jitter in any backoff configuration.

**Constant backoff** is the dominant pattern, which is sub-optimal for GitHub's rate-limited API where exponential backoff with jitter would be more appropriate to avoid thundering herd on recovery.

### 4. How are partial failures in batch operations reported?

**Limited evidence.** The `golang.org/x/sync/errgroup` pattern is used for concurrent batch operations, but it returns on first error by default:

- `pkg/cmd/issue/shared/lookup.go:106-134`: `FindIssuesOrPRs` uses `errgroup.Group` but only returns the first error (`g.Wait()` at line 121). However, `PartialLoadError` at line 191 allows partial results alongside an error.

- `pkg/cmd/attestation/api/client.go:184-200`: Fetches bundles concurrently with `errgroup.Group`, but falls back gracefully when `BundleURL` is empty (line 194-199).

- `pkg/cmd/release/shared/upload.go:115-131`: Concurrent uploads with `errgroup.Group`, returns first error.

**No evidence found** for a generalized partial failure aggregation pattern (e.g., collecting all errors in a slice alongside successful results). Each command reinvents this ad-hoc.

### 5. Does the system have circuit breakers to prevent cascade failures?

**No.** No circuit breaker implementation found. The grep for "circuit.*breaker" returned no results. Rate limiting is detected via HTTP headers (`pkg/cmd/skills/search/search.go:707-729`) but there is no mechanism to short-circuit future requests after a threshold of failures.

The system relies on GitHub's `Retry-After` header handling and basic retry logic, but lacks a true circuit breaker pattern that would:
- Track failure rates
- Trip open after N failures in a window
- Refuse calls while open
- Periodically allow a test request to check recovery

## Architectural Decisions

1. **Error wrapping via `fmt.Errorf` with `%w`**: Go idiomatic error wrapping is used throughout, but no `errors.Wrap` is used — only `fmt.Errorf` with `%w`. This is a deliberate choice for simplicity.

2. **Unwrap interface for sentinel errors**: `FlagError`, `GitError`, `NotInstalled` all implement `Unwrap()` to allow callers to use `errors.Is()` and `errors.As()`. This is a positive pattern enabling caller-specific handling.

3. **Backoff library choice**: Uses `cenkalti/backoff/v4` (and v5 in one place). This is an external library rather than a homegrown solution, which is reasonable but means retry behavior is library-dependent.

4. **HTTPError/GraphQLError delegation**: The API layer wraps `go-gh` library errors (`ghAPI.HTTPError`, `ghAPI.GraphQLError`) rather than defining its own HTTP error types from scratch. This reduces duplication but couples error handling to the library's error structures.

5. **Scope suggestion on HTTP errors**: The `generateScopesSuggestion()` function (`api/client.go:209-259`) adds helpful messaging to 4xx errors suggesting which OAuth scopes are missing. This is a strong UX pattern for developer-facing CLI tools.

## Notable Patterns

1. **`backoff.Permanent()` for non-retryable errors**: Several places use `backoff.Permanent(err)` to indicate an error should not be retried, distinguishing permanent failures from transient ones (`pkg/cmd/attestation/api/client.go:147,246,251,258`).

2. **`FilteredAllError` for no-match scenarios**: `pkg/cmd/workflow/shared/shared.go:96` uses a struct error to signal "no results match filter" differently from "error fetching."

3. **`PartialLoadError` for graceful degradation**: `pkg/cmd/issue/shared/lookup.go:99-104` allows returning partial data alongside an error, enabling callers to decide whether to proceed.

4. **`errgroup.Group` for concurrent batch ops**: Consistent use of `errgroup` for parallel fetching, though the partial failure aggregation is ad-hoc.

5. **Rate limit detection via HTTP headers**: `pkg/cmd/skills/search/search.go:707-729` shows sophisticated rate limit detection checking multiple indicators (429, 403+ratelimit-remaining, 403+retry-after).

## Tradeoffs

1. **Constant vs exponential backoff**: Constant backoff (dominant pattern) is simpler but less effective at疏通ting rate-limited APIs. Exponential backoff is only used in two places.

2. **No circuit breaker**: Absence of circuit breakers means failures can cascade during outages. The system relies on GitHub's rate limit headers and basic retries.

3. **Inconsistent partial failure handling**: Each command handles partial failures differently (or not at all). No generalized `PartialResultsError` type or pattern.

4. **Opaque string errors**: Many commands use `errors.New("message")` rather than typed errors, making it impossible for callers to programmatically distinguish error types.

5. **No jitter**: Retry intervals are deterministic, which can cause thundering herd problems when many clients retry simultaneously after an outage.

## Failure Modes / Edge Cases

1. **Git operation failures**: `git/errors.go:24-39` captures exit code and stderr, but the `GitError.Unwrap()` returns the wrapped error which may be `nil` if the command succeeded but produced non-zero exit.

2. **GraphQL partial load**: `pkg/cmd/issue/shared/lookup.go:191` returns `&PartialLoadError{err}` when some project cards couldn't be fetched due to permissions — the issue is returned with partial data.

3. **Token/keyring failures**: `internal/keyring/keyring.go:11-13` has `ErrNotFound` and `TimeoutError` for credential retrieval failures.

4. **Codespace state polling**: `internal/codespaces/codespaces.go:89-117` retries indefinitely with exponential backoff (5 min max) for codespace state transitions, which is appropriate for long-running operations.

5. **Upload with delete retry**: `pkg/cmd/release/shared/upload.go:145-159` deletes then re-uploads; if delete succeeds but upload fails, the asset is lost.

## Future Considerations

1. **Circuit breaker**: Implement a circuit breaker pattern (e.g., using `sony/gobreaker`) to prevent cascade failures during GitHub API outages.

2. **Exponential backoff with jitter**: Migrate from constant backoff to exponential backoff with jitter for retries, especially in API client code.

3. **Generalized partial failure reporting**: Create a standard pattern for returning partial results with aggregated errors, rather than ad-hoc implementations per command.

4. **Typed errors for common cases**: Consider converting common string-based errors (e.g., "release not found", "no workflows enabled") to sentinel errors that callers can check with `errors.Is()`.

5. **Retry budget with rate limit awareness**: Currently retries are count-based (max 3). A smarter approach would respect the `Retry-After` header and adjust retry budgets accordingly.

## Questions / Gaps

1. **No evidence of centralized error logging/tracking**: Errors are returned to callers but there is no evidence of centralized error reporting or logging infrastructure.

2. **No evidence of error budget/sLO tracking**: No monitoring of retry rates, error rates, or circuit breaker state.

3. **Limited evidence of end-to-end retry testing**: While retry logic exists, no dedicated integration tests for retry behavior under various failure scenarios were found.

4. **No evidence of fallback to cached data**: During API failures, there is no evidence of fallback to cached responses (except `internal/config/config.go:41` for config).

5. **Hybrid error types not fully unwrapped**: `HTTPError` (`api/client.go:46-53`) wraps `*ghAPI.HTTPError` but doesn't expose all underlying fields directly, requiring `errors.As()` to access them.

---

Generated by `dimensions/10-error-taxonomy-failure-handling.md` against `cli`.