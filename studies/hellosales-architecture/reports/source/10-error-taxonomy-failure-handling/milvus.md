# Source Analysis: milvus

## Error Taxonomy & Failure Handling

### Source Info

| Field | Value |
|-------|-------|
| Name | milvus |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/milvus` |
| Language / Stack | Go + C++ (internal/core/) + Rust (tantivy) |
| Analyzed | 2026-05-20 |

## Summary

Milvus implements a comprehensive error taxonomy with a centralized `merr` package (`pkg/util/merr/`) defining 100+ sentinel errors organized by service domain (collection, partition, segment, index, database, node, IO, privilege, etc.). Each error carries a numeric code, a retryability flag, and an error type classification (SystemError vs InputError). The retry mechanism (`pkg/util/retry/`) provides exponential backoff with configurable max attempts and sleep intervals. Rate limiting is implemented through a hierarchical `RateLimiterTree` with 4 levels (global → database → collection → partition). Error wrapping follows structured conventions using field-based context accumulation. No circuit breaker pattern was found.

## Rating

**8/10** — Good implementation with minor issues. The error taxonomy is thorough and well-organized, with clear separation between client errors (InputError) and server/system errors (SystemError). The retry mechanism is solid with exponential backoff and denylist support. Rate limiting is hierarchical and comprehensive. However, no circuit breaker pattern exists for cascade failure prevention, and partial failure reporting in batch operations relies on per-item status arrays rather than a standardized error aggregation pattern.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Error hierarchy | `milvusError` struct with `msg`, `detail`, `retriable`, `errCode`, `errType` fields | `pkg/util/merr/errors.go:275-281` |
| Error type enum | `ErrorType` with `SystemError (0)` and `InputError (1)` constants | `pkg/util/merr/errors.go:29-34` |
| Sentinel errors | 100+ sentinel errors organized by domain (service, collection, partition, segment, index, db, node, IO, etc.) | `pkg/util/merr/errors.go:49-259` |
| Error codes | Numeric codes from 1-3000+ for each error | `pkg/util/merr/errors.go:49-259` |
| Retryability flag | `retriable bool` on each `milvusError` | `pkg/util/merr/errors.go:278` |
| Multi-error support | `multiErrors` struct and `Combine()` function | `pkg/util/merr/errors.go:317-361` |
| Error wrapping | `wrapFields()` and `wrapFieldsWithDesc()` functions | `pkg/util/merr/utils.go:1159-1174` |
| Error wrapping helpers | 60+ `WrapErr*` helper functions (WrapErrCollectionNotFound, WrapErrServiceNotReady, etc.) | `pkg/util/merr/utils.go:367-1386` |
| Non-retryable denylist | `IsNonRetryableErr()` checking permanent errors (not found, permission denied) | `pkg/util/merr/utils.go:68-93` |
| Retry config | Default 10 attempts, 200ms initial sleep, 3s max sleep | `pkg/util/retry/options.go:53-58` |
| Exponential backoff | `c.sleep *= 2` doubling on each retry | `pkg/util/retry/retry.go:112-115` |
| Unrecoverable errors | `Unrecoverable()` and `IsRecoverable()` functions | `pkg/util/retry/retry.go:213-225` |
| Rate limiter tree | 4-level hierarchy (global → database → collection → partition) | `internal/util/ratelimitutil/rate_limiter_tree.go:171-179` |
| Token bucket | `Limiter` struct with `AllowN()` method | `pkg/util/ratelimitutil/limiter.go:40-73` |
| gRPC rate limit middleware | `RateLimitInterceptor()` grpc middleware | `internal/proxy/rate_limit_interceptor.go:40-73` |
| Partial failure reporting | Per-segment `SegmentStatuses` array with committed/failed counts | `internal/datacoord/services_commit_backfill.go:104-122` |
| Quota states | `QuotaState_DenyToWrite`, `QuotaState_DenyToRead`, `QuotaState_DenyToDDL` | `internal/util/ratelimitutil/rate_limiter_tree.go:95-112` |
| Streaming errors | `IsUnrecoverable()`, `IsRateLimitRejected()`, `IsWrongStreamingNode()` | `internal/util/streamingutil/status/streaming_error.go:57,100,34` |
| Status conversion | `Status()` returning `commonpb.Status` with code, reason, retriable flag | `pkg/util/merr/utils.go:104-126` |
| Legacy code mapping | `oldCode()` and `OldCodeToMerr()` for backward compatibility | `pkg/util/merr/utils.go:177-270` |

## Answers to Dimension Questions

### 1. How does the system distinguish client errors from server errors from transient failures?

**SystemError vs InputError classification** — The `ErrorType` enum at `pkg/util/merr/errors.go:29-34` distinguishes `SystemError (0)` from `InputError (1)`. The `IsInputError` flag is stored in `status.ExtraInfo` and set via `WrapErrAsInputError()` or `WrapErrAsInputErrorWhen()`.

**Retriability flag** — Each `milvusError` carries a `retriable bool` field (`pkg/util/merr/errors.go:278`). Errors marked non-retriable include IO permission errors (`ErrIoPermissionDenied`), invalid arguments (`ErrIoInvalidArgument`), and collection not found (`ErrCollectionNotFound`). Errors marked retriable include transient failures like `ErrServiceNotReady`, `ErrServiceUnavailable`, and `ErrChannelTSafeStalled`.

**Denylist approach** — `IsNonRetryableErr()` at `pkg/util/merr/utils.go:68-93` explicitly checks a denylist of permanent errors (resource not found, access denied) versus malformed request errors (invalid argument, invalid range, entity too large).

### 2. Are errors typed so callers can handle specific failure modes?

**Yes** — The `milvusError` struct with its `errCode int32` field provides fine-grained error identification. The `Is()` method at `pkg/util/merr/errors.go:309-315` performs equality comparison based on `errCode`, enabling callers to use `errors.Is(err, merr.ErrCollectionNotFound)` for specific error handling.

**60+ WrapErr helper functions** in `pkg/util/merr/utils.go` provide context-rich error wrapping: `WrapErrCollectionNotFound(collection any, msg ...string)`, `WrapErrServiceNotReady(role string, sessionID int64, state string, msg ...string)`, etc.

**Structured error fields** — The `valueField` and `boundField` types (`pkg/util/merr/utils.go:1180-1214`) allow errors to carry structured key-value context (e.g., `collection=foo`, `expected<=value<=upper`).

**Error type classification** via `GetErrorType()` at `pkg/util/merr/utils.go:358-364` enables callers to distinguish system errors from input errors at runtime.

### 3. What is the retry strategy — exponential backoff, jitter, max attempts?

**Exponential backoff without jitter** — The retry implementation at `pkg/util/retry/retry.go:112-115` doubles sleep time on each retry (`c.sleep *= 2`), capping at `c.maxSleepTime` (default 3 seconds). No jitter is applied.

**Default configuration** at `pkg/util/retry/options.go:53-58`:
- `attempts: 10`
- `sleep: 200ms`
- `maxSleepTime: 3s`

**Configurable via options** — `Attempts()`, `Sleep()`, `MaxSleepTime()`, and `RetryErr()` functional options allow callers to customize behavior. `AttemptAlways()` sets attempts to 0 for unlimited retries.

**Unrecoverable fast-fail** — The `Unrecoverable()` function at `pkg/util/retry/retry.go:218-220` wraps errors with a sentinel marker that causes `IsRecoverable()` to return `false`, triggering immediate retry termination.

**Denylist integration** — The `IsNonRetryableErr()` check combined with `retry.Unrecoverable()` allows permanent failures to fail fast without exhausting retry attempts.

### 4. How are partial failures in batch operations reported?

**Per-item status arrays** — Milvus uses `[]*commonpb.Status` or similar per-item status slices to report partial failures in batch operations, rather than a single aggregated error.

**Example from CommitBackfillResult** at `internal/datacoord/services_commit_backfill.go:104-122`:
```go
committed, failed := countStatuses(statuses)
// Top-level Success unless every broadcast failed -- partial failures are
// surfaced through per-segment statuses.
respStatus := merr.Success()
if committed == 0 && lastErr != nil {
    respStatus = merr.Status(lastErr)
}
return &datapb.CommitBackfillResultResponse{
    Status:            respStatus,
    TotalSegments:     total,
    CommittedSegments: committed,
    FailedSegments:    failed,
    SegmentStatuses:   sortStatuses(statuses),
}
```

**Multi-error aggregation** — The `Combine()` function at `pkg/util/merr/errors.go:353-361` and `multiErrors` struct enable wrapping multiple errors into one, with `Unwrap()` supporting error chain traversal.

**Batch operation patterns** — Batch save/remove operations in etcd use `SaveByBatchWithLimit()` and `RemoveByBatchWithLimit()` with per-batch callbacks that accumulate partial failures.

### 5. Does the system have circuit breakers to prevent cascade failures?

**No circuit breaker pattern found** — Grep searches for `circuit`, `breaker`, and `CircuitBreaker` across the codebase returned only tie-breaker logic for sort operations and load balancing, not fault isolation patterns. No `if err > threshold { stop(); }` style circuit breaker implementation was found.

**Rate limiter tree as alternative** — The hierarchical `RateLimiterTree` at `internal/util/ratelimitutil/rate_limiter_tree.go:171-357` provides a form of back-pressure with 4-level granularity (global → database → collection → partition), but this is quota enforcement, not fault isolation.

**Quota states** — The system has `QuotaState_DenyToWrite`, `QuotaState_DenyToRead`, `QuotaState_DenyToDDL` states that can halt operations, but these are configured limits rather than adaptive circuit breakers.

**Potential gap** — If a downstream dependency (e.g., object storage, etcd) experiences prolonged failure, the exponential backoff retry will eventually exhaust attempts but does not prevent continued request accumulation. A proper circuit breaker would "trip" after threshold failures and fast-fail all subsequent requests for a cooldown period.

## Architectural Decisions

**Centralized error package** — All Milvus errors are defined in `pkg/util/merr/` with a single `milvusError` type carrying code, retryability, and type metadata. This enforces consistency but creates a central bottleneck for error definition.

**Numeric error codes as primary identity** — Errors are identified by `int32` codes rather than by type name strings. This enables compact serialization (gRPC status) and efficient comparison, but requires the `oldCode()` mapping for backward compatibility with legacy error codes.

**Error wrapping via functional options** — The `WrapErr*` functions use `wrapFields()` and `wrapFieldsWithDesc()` internally rather than `fmt.Errorf` with `%w`, preserving the `milvusError` type through wrapping and enabling `errors.Is()` behavior based on error code.

**cockroachdb/errors adoption** — Milvus uses `github.com/cockroachdb/errors` for error wrapping (`errors.Wrap`, `errors.Is`, `errors.Unwrap`) rather than standard library `fmt.Errorf`, likely for enhanced stack trace and error context support.

**Streaming errors separate** — Streaming-specific errors in `internal/util/streamingutil/status/streaming_error.go` and `internal/distributed/streaming/internal/errs/error.go` define their own sentinel errors with `IsUnrecoverable()`, `IsRateLimitRejected()`, and `IsFenced()` methods, creating a parallel error hierarchy for the streaming subsystem.

## Notable Patterns

**Structured field accumulation** — Error messages accumulate context via `[key=value]` suffixes rather than prepended text, enabling parsers to extract structured data from error strings.

**Exponential backoff with doubling** — Simple `c.sleep *= 2` pattern without jitter; capped at `maxSleepTime`.

**Denylist + Allowlist for retry** — The `IsNonRetryableErr()` denylist is checked first, then the error's `retriable` flag is consulted, allowing `merr.IsRetryableErr()` to determine final retry eligibility.

**Hierarchical rate limiting** — 4-level rate limiter tree (global → database → collection → partition) with `RateLimiterNode` managing per-rate-type limiters and quota states.

**Partial failure via top-level success** — Batch operations return success at the top level unless ALL items fail, with per-item statuses surfaced in the response for granular reporting.

## Tradeoffs

**Pros:**
- Comprehensive error taxonomy with 100+ well-categorized errors enables precise failure diagnosis
- Retryability is explicit on each error, avoiding guesswork
- Error type (SystemError vs InputError) classification enables caller-side handling differentiation
- Structured wrapping preserves error chain for debugging
- Hierarchical rate limiting provides fine-grained quota enforcement

**Cons:**
- No circuit breaker pattern for cascade failure prevention
- Exponential backoff lacks jitter, potentially causing thundering herd on recovery
- Single centralized `merr` package may create import cycles and package coupling
- No standard partial error type; each batch operation invents its own per-item status array format
- Streaming errors are separate from core `merr`, creating inconsistency

## Failure Modes / Edge Cases

**Context cancellation during retry** — The retry loop at `pkg/util/retry/retry.go:101-110` checks `ctx.Done()` before sleeping and returns `lastErr` if context is cancelled, handling graceful shutdown during retry.

**Deadline exhaustion** — At `pkg/util/retry/retry.go:84-97`, if `time.Until(deadline) < c.sleep`, the retry aborts rather than sleeping past the deadline.

**Non-retryable errors in retry loops** — When `IsNonRetryableErr()` returns true (e.g., `ErrIoKeyNotFound`), the code should call `retry.Unrecoverable()` to fast-fail. If it doesn't, the retry loop still respects the error's `retriable` flag via `IsRecoverable()`.

**Multi-error unwrapping** — `multiErrors.Unwrap()` returns the last error in the chain (or a subslice for 3+ errors), which may not be the "most informative" error for callers.

**Rate limiter token refund** — `RateLimiterNode.Cancel()` at `pkg/util/ratelimitutil/rate_limiter_tree.go:76-82` refunds tokens on request cancellation, preventing rate limit starvation when requests are cancelled.

## Future Considerations

**Circuit breaker** — Implement a `CircuitBreaker` type wrapping the retry mechanism that trips after N consecutive failures and enters a half-open state after a cooldown period, preventing cascade failures when downstream services are degraded.

**Jitter for retry backoff** — Add configurable jitter (`sleep + rand(0, sleep/2)`) to prevent thundering herd when multiple clients retry simultaneously after a shared failure.

**Standardized partial error type** — Create a `PartialError` type that wraps a slice of per-item results with their individual errors, providing a standard format for batch operation partial failures.

**Error code range documentation** — Document the error code ranges (1-1000 service, 100-200 collection, etc.) in code comments to guide developers adding new errors.

**Streaming error convergence** — Consider converging the streaming-specific errors into `merr` to provide a unified error taxonomy across all Milvus subsystems.

## Questions / Gaps

1. **Circuit breaker absence** — No circuit breaker pattern found anywhere in the codebase. Is this a deliberate tradeoff, or was it planned but not implemented?

2. **Jitter absence** — Why was jitter omitted from the exponential backoff? Thundering herd on shared dependency recovery is a known risk.

3. **Streaming error divergence** — Streaming errors (`internal/util/streamingutil/status/streaming_error.go`) have their own `IsUnrecoverable()` pattern that doesn't use `merr.Unrecoverable()`. Is convergence planned?

4. **Partial error standardization** — Batch operations report partial failures differently (segment statuses array in backfill, multiErrors in combine). Is there a plan to standardize?

5. **Error code allocation policy** — New error codes are allocated sequentially. Is there a process for reserving ranges for future subsystems, or is the current approach (sequential addition) sufficient?

---

Generated by `dimensions/10-error-taxonomy-failure-handling.md` against `milvus`.