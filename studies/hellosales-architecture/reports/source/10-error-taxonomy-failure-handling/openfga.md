# Source Analysis: openfga

## Error Taxonomy & Failure Handling

### Source Info

| Field | Value |
|-------|-------|
| Name | openfga |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/openfga` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

OpenFGA implements a well-structured error taxonomy with distinct layers: type system errors, tuple validation errors, storage errors, condition evaluation errors, and server API errors. Custom error types use Go's error wrapping (`%w`) and implement `Unwrap()` for `errors.Is()` matching. The system distinguishes client errors from server errors via gRPC status codes. Retry logic exists for database readiness and SQLite busy states but not for general API operations. Throttling is implemented via a rate-limited throttler with configurable thresholds. Partial failures in batch operations are handled through tuple-level error reporting. Panic recovery middleware exists for both HTTP and gRPC.

## Rating

**7/10** — Good implementation with minor issues. The error taxonomy is well-structured and layered, with proper sentinel errors and wrapping conventions. However, there is no general-purpose retry middleware for transient failures in API operations, and circuit breaker patterns are limited to throttling-based rate limiting rather than true cascade failure prevention.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Sentinel errors (typesystem) | `ErrModelNotFound`, `ErrDuplicateTypes`, `ErrCycle`, etc. | `pkg/typesystem/error.go:12-52` |
| Sentinel errors (storage) | `ErrCollision`, `ErrNotFound`, `ErrTransactionThrottled`, `ErrWriteConflictOnInsert` | `pkg/storage/errors.go:14-36` |
| Sentinel errors (server) | `ErrAuthorizationModelResolutionTooComplex`, `ErrStoreIDNotFound`, `ErrThrottledTimeout` | `pkg/server/errors/errors.go:22-35` |
| Custom error structs | `InvalidTypeError`, `InvalidRelationError`, `ObjectTypeUndefinedError`, `RelationUndefinedError` | `pkg/typesystem/error.go:56-140` |
| Internal error separation | `InternalError` struct with public/internal message separation | `pkg/server/errors/errors.go:40-53` |
| Error wrapping | `%w` format verb used throughout, e.g., `fmt.Errorf("%w: ...", err)` | `pkg/storage/errors.go:27`, `internal/graph/check.go:152` |
| Unwrap support | `Unwrap()` methods on `InvalidTypeError`, `InternalError`, etc. | `pkg/typesystem/error.go:68`, `pkg/server/errors/errors.go:50-53` |
| Error handling dispatcher | `HandleError()` maps internal errors to gRPC status codes | `pkg/server/errors/errors.go:128-144` |
| Iterator error | `ErrIteratorDone` sentinel for iteration completion | `pkg/storage/tuple_iterators.go:13` |
| Iterator done check | `IterIsDoneOrCancelled()` checks `ErrIteratorDone`, `context.Canceled`, `context.DeadlineExceeded` | `pkg/storage/tuple_iterators.go:553-555` |
| Retry (DB readiness) | `waitForDatabase()` and `waitForMigrationVersion()` use `cenkalti/backoff/v4` | `pkg/testfixtures/storage/readiness.go:21,49` |
| Retry (SQLite busy) | `busyRetry()` custom implementation with 10 max retries for `SQLITE_BUSY` | `pkg/storage/sqlite/sqlite.go:1353-1371` |
| Retry (HTTP client) | OIDC client uses `hashicorp/go-retryablehttp` | `internal/authn/oidc/oidc.go:52` |
| Throttler interface | `Throttler` interface with `Throttle()` method | `internal/throttler/throttler.go:26-29` |
| Constant rate throttler | `constantRateThrottler` with ticker-based rate limiting | `internal/throttler/throttler.go:45-114` |
| Dispatch throttling | `DispatchThrottlingCheckResolver` wraps check resolution with throttling | `internal/graph/dispatch_throttling_check_resolver.go:27-111` |
| Bounded datastore | `BoundedTupleReader` with semaphore-based concurrency limiting | `pkg/storage/storagewrappers/bounded_datastore.go:73-243` |
| Cache fallback | `CachedTupleReader` checks cache before delegate (fallback on miss) | `pkg/storage/storagewrappers/cached_reader.go:107-125` |
| Panic recovery (HTTP) | `HTTPPanicRecoveryHandler` middleware | `pkg/middleware/recovery/recovery.go:22-50` |
| Panic recovery (gRPC) | `PanicRecoveryHandler` for unary/stream | `pkg/middleware/recovery/recovery.go:53-61` |
| Timeout middleware | `NewUnaryTimeoutInterceptor`, `NewStreamTimeoutInterceptor` | `pkg/middleware/timeout.go:31-55` |
| Partial failure handling | `HandleTupleValidateError()` reports individual tuple errors | `pkg/server/errors/errors.go:147-166` |
| Union error continuation | `union()` continues processing on error to find `Allowed: true` | `internal/graph/check.go:199` |

## Answers to Dimension Questions

### 1. How does the system distinguish client errors from server errors from transient failures?

**Client errors** are distinguished by gRPC `codes` (e.g., `codes.NotFound`, `codes.InvalidArgument`) in `pkg/server/errors/errors.go:22-35`. The `HandleError()` function (`pkg/server/errors/errors.go:128-144`) maps internal errors to appropriate gRPC codes:
- `storage.ErrNotFound` → `codes.NotFound`
- `context.Canceled` → `codes.Canceled`
- `context.DeadlineExceeded` → `codes.DeadlineExceeded`
- `storage.ErrTransactionThrottled` → `codes.ResourceExhausted`

**Server errors** are wrapped in `InternalError` struct (`pkg/server/errors/errors.go:40-53`) which separates public-facing messages from internal details. The `Error()` method returns only the public message, while `Unwrap()` exposes the internal error for logging.

**Transient failures** are identified via `errors.Is()` checks for `storage.ErrTransactionThrottled` and `context.DeadlineExceeded`. SQLite retry is handled by `busyRetry()` (`pkg/storage/sqlite/sqlite.go:1353`) for `SQLITE_BUSY` errors. However, **there is no general retry middleware for transient API failures** — retry is limited to infrastructure (database readiness, OIDC discovery).

### 2. Are errors typed so callers can handle specific failure modes?

**Yes.** Sentinel errors allow callers to use `errors.Is()` for precise handling:
- `pkg/tuple/tuple_errors.go` defines `InvalidConditionalTupleError`, `InvalidTupleError`, `TypeNotFoundError`, `RelationNotFoundError` — all implement `Is()` method
- `pkg/storage/errors.go` defines `ErrCollision`, `ErrNotFound`, `ErrTransactionThrottled`, `ErrWriteConflictOnInsert`, `ErrWriteConflictOnDelete`
- `pkg/typesystem/error.go` defines `ErrModelNotFound`, `ErrCycle`, `ErrRelationUndefined`, etc.

Custom error structs like `InvalidRelationError` (`pkg/typesystem/error.go:72-86`) expose typed fields (`ObjectType`, `Relation`, `Cause`) so callers can inspect specific failure details.

The `InternalError` struct (`pkg/server/errors/errors.go:40-53`) has a `public` field for user-facing messages and an `internal` field for error chain access via `Unwrap()`.

### 3. What is the retry strategy — exponential backoff, jitter, max attempts?

**Database readiness:** `cenkalti/backoff/v4` with `NewExponentialBackOff()` — 100ms initial interval, 60s max elapsed time (`pkg/testfixtures/storage/readiness.go:21,49`).

**SQLite busy:** Custom `busyRetry()` (`pkg/storage/sqlite/sqlite.go:1353-1371`) — up to 10 retries, no backoff, checks `SQLITE_BUSY`, `SQLITE_LOCKED*` codes. Final error: `fmt.Errorf("sqlite busy error after %d retries: %w", maxRetries, err)`.

**HTTP (OIDC):** Uses `hashicorp/go-retryablehttp` (`internal/authn/oidc/oidc.go:52`).

**Missing:** No exponential backoff with jitter for general API retry. No `backoff.WithJitter()` observed. No retry configuration for datastore operations beyond SQLite busy and DB readiness.

### 4. How are partial failures in batch operations reported?

**Tuple-level validation:** `HandleTupleValidateError()` (`pkg/server/errors/errors.go:147-166`) iterates through validation errors and appends them to the response, allowing partial success reporting.

**Batch write handling:** `DuplicateTupleInWrite()` (`pkg/server/errors/errors.go:114`) returns error tuples that failed. The `InvalidWriteInputError()` constructor (`pkg/storage/errors.go:47-68`) wraps multiple invalid inputs.

**Iterator error aggregation:** `ConditionsFilteredTupleKeyIterator` (`pkg/storage/tuple_iterators.go:314-410`) stores `lastError` and returns it when all tuples are filtered out (lines 332-337, 371-375).

**Union reducer:** `union()` in `internal/graph/check.go:158-218` continues processing on error to find an `Allowed: true` result rather than failing fast on the first error.

**Gap:** No `PartialError` collection returned to callers with per-item error mapping (e.g., which specific tuple failed in a batch of 1000).

### 5. Does the system have circuit breakers to prevent cascade failures?

**Throttling-based limiting:** `constantRateThrottler` (`internal/throttler/throttler.go:45-114`) uses a bounded channel as a semaphore and records throttling delays in Prometheus. This is rate-limiting, not a classic circuit breaker.

**Concurrency bounding:** `BoundedTupleReader` (`pkg/storage/storagewrappers/bounded_datastore.go:73-243`) uses a `limiter` channel to bound concurrent reads. When threshold is exceeded, it adds artificial delay via `time.After(b.throttleTime)` (line 215).

**Dispatch throttling:** `DispatchThrottlingCheckResolver` (`internal/graph/dispatch_throttling_check_resolver.go:27-111`) sets `DispatchThrottled` in request metadata and calls `Throttle()` before resolution.

**Gap:** No true circuit breaker pattern observed (e.g., no "open/half-open/closed" state machine that trips on downstream failures and allows probe requests). The throttling is proactive (based on request rate) rather than reactive (based on downstream error rates). No observed fallback to degraded service modes when dependencies fail.

## Architectural Decisions

1. **Error type layering by domain** — Errors are organized by layer (typesystem, tuple, storage, condition, server), each with its own error file. This allows domain-specific error handling.

2. **Public/internal error separation** — `InternalError` struct (`pkg/server/errors/errors.go:40`) ensures internal details (stack traces, DB errors) are not leaked to clients while still being available for `errors.Is()` checks.

3. **Sentinel errors with wrapped variants** — `ErrWriteConflictOnInsert` wraps `ErrTransactionalWriteFailed` (`pkg/storage/errors.go:27`) using `%w`, allowing callers to catch either the specific or general transaction failure.

4. **gRPC status code mapping** — Central `HandleError()` dispatcher (`pkg/server/errors/errors.go:128`) provides consistent error code mapping across all API surfaces.

5. **Iterator completion sentinel** — `ErrIteratorDone` (`pkg/storage/tuple_iterators.go:13`) signals iteration completion distinct from cancellation or deadline exceeded, allowing precise error handling in iterators.

## Notable Patterns

- **`errors.Is()` with custom `Is()` methods** — `InvalidTupleError`, `TypeNotFoundError`, `RelationNotFoundError` in `pkg/tuple/tuple_errors.go:10-70` implement `Is()` for sentinel matching
- **Context-aware throttling** — `ContextWithThrottlingThreshold()` and `ThrottlingThresholdFromContext()` (`pkg/dispatch/throttler.go:13-28`) allow per-request throttle limits
- **Cache-first with fallback** — `CachedTupleReader` checks cache before delegate, with `HIGHER_CONSISTENCY` skip (`pkg/storage/storagewrappers/cached_reader.go:92-94`)
- **Panic recovery with error wrapping** — `ErrPanic` wraps recovered panics: `fmt.Errorf("%w: %w", ErrPanic, recoveredErr.AsError())` (`internal/graph/check.go:152`)
- **Union reducer error tolerance** — `union()` continues processing to find success despite some branches erroring (`internal/graph/check.go:199`)

## Tradeoffs

1. **No general API retry** — Retry is only implemented for infrastructure (DB, OIDC), not for transient Check/Expand/Write failures. This prevents retry storms but leaves callers to implement their own retry logic.

2. **No jitter in backoff** — SQLite `busyRetry` uses fixed retries; database readiness uses exponential backoff without jitter, potentially causing thundering herd on recovery.

3. **No circuit breaker states** — Throttling is proactive rate-limiting rather than reactive circuit breaking. Downstream failures won't trip the throttler to open/half-open states.

4. **Internal error leakage risk** — `InternalError.Unwrap()` returns the internal error (`pkg/server/errors/errors.go:50-53`), which could leak if not properly guarded in logging.

5. **Throttle delay vs. reject** — `BoundedTupleReader` adds artificial delay (`time.After(b.throttleTime)`) rather than rejecting with `ErrTransactionThrottled`, potentially causing request timeouts under sustained load.

## Failure Modes / Edge Cases

1. **SQLite busy exhaustion** — After 10 retries in `busyRetry()` (`pkg/storage/sqlite/sqlite.go:1370`), the operation fails. High-concurrency workloads may experience persistent failures.

2. **Iterator panic on close** — If iterator `Stop()` is called while `Next()` is in progress, the `defer s.Close()` in `ReadStartingWithUser` (`pkg/storage/storagewrappers/cached_reader.go:176`) could race.

3. **Cache inconsistency window** — `CachedTupleReader` serves stale data during the cache invalidation window. No TTL-based expiration observed, only invalidation on writes.

4. **Throttle threshold drift** — `threshold.controller.go:17-31` compares `currentCount > threshold` without hysteresis, which could cause oscillatory throttling behavior near the threshold.

5. **Context cancellation during throttle** — `constantRateThrottler.Throttle()` (`internal/throttler/throttler.go:99-114`) drains the queue channel. If context is cancelled during throttle, the request fails with `context.Canceled` rather than being processed.

6. **Panic unwrapping** — `recoveredErr.AsError()` in `internal/graph/check.go:152` assumes the panic value implements `error`. If a non-error panic is raised, this could cause a secondary panic.

## Future Considerations

1. **Add retry middleware for Check/Expand** — A general-purpose retry interceptor with exponential backoff and jitter would handle transient failures in authorization resolution.

2. **Implement proper circuit breaker** — A state-based circuit breaker (open/half-open/closed) that trips on downstream errors would prevent cascade failures during dependency outages.

3. **Partial failure collection** — Return structured `BatchErrors` with per-item error mapping for batch operations, allowing callers to identify exactly which tuples failed without retrying successful ones.

4. **Jitter in all backoff** — Add `backoff.WithJitter()` to all exponential backoff usage to prevent thundering herd on shared failure recovery.

5. **Graceful degradation levels** — Define degraded mode tiers (e.g., "read-only", "eventual-consistency-only") when dependencies are unavailable, rather than failing entirely.

## Questions / Gaps

1. **No evidence found** for retry configuration in datastore options (beyond SQLite busy and DB readiness). Is there a configured max retry for Check/Write operations?

2. **No evidence found** for timeout budgets across distributed components (e.g., Check deadline vs. Dispatch deadline vs. datastore deadline propagation).

3. **No evidence found** for circuit breaker state persistence across restarts. Is throttle state ephemeral?

4. **Unclear** whether `HIGHER_CONSISTENCY` reads still use cached results when cache is warm — the comment at `pkg/storage/storagewrappers/cached_reader.go:92-94` suggests skip, but the implementation flow warrants verification.

---

Generated by `dimensions/10-error-taxonomy-failure-handling.md` against `openfga`.
