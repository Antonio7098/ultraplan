# Source Analysis: kubernetes

## Error Taxonomy & Failure Handling

### Source Info

| Field | Value |
|-------|-------|
| Name | kubernetes |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/kubernetes` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

Kubernetes implements a comprehensive error taxonomy built around HTTP-like status codes mapped to `metav1.StatusReason` constants. The `StatusError` struct wraps `metav1.Status` objects, allowing errors to carry rich metadata (reason, message, details, retry delay). The system uses standard Go error wrapping (`errors.Is`/`errors.As`) augmented by an `APIStatus` interface for unwrapping. Client-go provides well-crafted retry utilities with exponential backoff and jitter, plus a `TypedRateLimiter` interface for per-item and global rate limiting. Fallback patterns exist for remote command execution (WebSocket→SPDY) and paginated list operations. Field-level validation errors are aggregated via `ErrorList` with `ToAggregate()`.

## Rating

**8/10** — Kubernetes demonstrates a mature, well-documented error taxonomy with strong typing (StatusError + Is*/SuggestsClientDelay predicates), comprehensive retry/backoff infrastructure, and intentional fallback patterns. Minor gaps: no formal circuit breaker for API server cascade prevention, and some fallback mechanisms are implicit rather than systematic.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Error type hierarchy | `StatusError` struct wrapping `metav1.Status` with factory constructors (`NewNotFound`, `NewAlreadyExists`, `NewConflict`, `NewInvalid`, etc.) | `staging/src/k8s.io/apimachinery/pkg/api/errors/errors.go:33-434` |
| Error predicates | `IsNotFound`, `IsConflict`, `IsAlreadyExists`, `IsInvalid`, `IsForbidden`, `IsBadRequest`, `IsTooManyRequests`, `SuggestsClientDelay` | `staging/src/k8s.io/apimachinery/pkg/api/errors/errors.go:527-791` |
| Error wrapping | Standard `errors.Is()`/`errors.As()` via `APIStatus` interface; `StatusError` implements `Cause()` and `Status()` methods | `staging/src/k8s.io/apimachinery/pkg/api/errors/errors.go:33-43` |
| Exponential backoff | `Backoff` struct with `Duration`, `Factor`, `Jitter`, `Steps`, `Cap` fields; `ExponentialBackoff()` and `ExponentialBackoffWithContext()` functions | `staging/src/k8s.io/apimachinery/pkg/util/wait/backoff.go:29-518` |
| Retry helpers | `RetryOnConflict()` for API operations, `OnError()` with custom retriable predicate | `staging/src/k8s.io/client-go/util/retry/util.go:26-105` |
| Rate limiting queue | `TypedRateLimiter[T]` interface; `TypedItemExponentialFailureRateLimiter`, `TypedBucketRateLimiter`, `TypedMaxOfRateLimiter` | `staging/src/k8s.io/client-go/util/workqueue/default_rate_limiters.go:30-259` |
| Flow control backoff | `Backoff` struct with per-item backoff map, jitter, GC | `staging/src/k8s.io/client-go/util/flowcontrol/backoff.go:32-149` |
| Fallback executor | `FallbackExecutor` with primary/secondary Executor and `shouldFallback` predicate | `staging/src/k8s.io/client-go/tools/remotecommand/fallback.go:27-60` |
| Fallback dialer | `FallbackDialer` and `StreamingFallbackDialer` for WebSocket→SPDY port forwarding fallback | `staging/src/k8s.io/client-go/tools/portforward/fallback_dialer.go:28-90` |
| Pager fallback | `FullListIfExpired` fallback on "Expired" error | `staging/src/k8s.io/client-go/tools/pager/pager.go:110` |
| WatchList fallback | Reflector falls back to full list on watch error | `staging/src/k8s.io/client-go/tools/cache/reflector.go:475-500` |
| Field validation errors | `Error` struct with `ErrorType` enum, `ErrorList` with `ToAggregate()` | `staging/src/k8s.io/apimachinery/pkg/util/validation/field/errors.go:31-501` |

## Answers to Dimension Questions

**1. How does the system distinguish client errors from server errors from transient failures?**

Kubernetes maps all errors through `metav1.StatusReason` which encodes HTTP-like semantics:
- **Client errors** (4xx): `StatusReasonNotFound` (`NewNotFound`), `StatusReasonAlreadyExists` (`NewAlreadyExists`), `StatusReasonConflict` (`NewConflict`), `StatusReasonInvalid` (`NewInvalid`), `StatusReasonForbidden` (`NewForbidden`), `StatusReasonBadRequest` (`NewBadRequest`), `StatusReasonUnauthorized` (`NewUnauthorized`), `StatusReasonTooManyRequests` (`NewTooManyRequests`)
- **Server errors** (5xx): `StatusReasonInternalError` (`NewInternalError`), `StatusReasonServerTimeout` (`NewServerTimeout`)
- **Transient failures**: `StatusReasonTimeout`, `StatusReasonTimeoutWait` — also signaled via `SuggestsClientDelay(err)` which returns `(retryAfterSeconds, bool)` — a client can extract the retry delay from the error itself

Evidence: `staging/src/k8s.io/apimachinery/pkg/api/errors/errors.go:47-68` (reason constants), `:791` (`SuggestsClientDelay`).

**2. Are errors typed so callers can handle specific failure modes?**

Yes. Each error factory (`NewNotFound`, `NewConflict`, `NewInvalid`, etc.) creates a `StatusError` with a specific `metav1.StatusReason`. Callers use predicate functions (`IsNotFound`, `IsConflict`, `IsAlreadyExists`, `IsForbidden`, `IsTooManyRequests`, etc.) to branch on specific failure modes. The `APIStatus` interface exposes `Status()` returning `metav1.Status` which contains `Reason`, `Message`, `Details`, and `RetryAfterSeconds`.

The field validation package provides structured `Error` objects with `ErrorType` constants (e.g., `ErrorTypeRequired`, `ErrorTypeDuplicate`, `ErrorTypeTooLong`) and a `ToAggregate()` function to collect multiple validation errors into a single error.

Evidence: `staging/src/k8s.io/apimachinery/pkg/api/errors/errors.go:527-784` (predicates), `staging/src/k8s.io/apimachinery/pkg/util/validation/field/errors.go:31-501` (field errors).

**3. What is the retry strategy — exponential backoff, jitter, max attempts?**

Yes — both exponential backoff and jitter are implemented.

**`wait.Backoff`** (`staging/src/k8s.io/apimachinery/pkg/util/wait/backoff.go:29-53`):
- `Duration` (initial interval), `Factor` (multiplier, default 1.0 for `DefaultRetry`, 5.0 for `DefaultBackoff`), `Jitter` (random factor, default 0.1), `Steps` (max iterations), `Cap` (max interval)
- `Step()` method at line 58 computes `next = min(duration*factor, cap)` + jitter

**`RetryOnConflict`** (`staging/src/k8s.io/client-go/util/retry/util.go:103`): Retries on `IsConflict` errors with configurable backoff, typically used for API update operations.

**`OnError`** (`staging/src/k8s.io/client-go/util/retry/util.go:48`): Generic retry with custom `retriable` predicate function.

**Rate-limited workqueue** (`staging/src/k8s.io/client-go/util/workqueue/default_rate_limiters.go:84-149`): `TypedItemExponentialFailureRateLimiter` uses `baseDelay * 2^failures` formula, capped at `maxDelay`. The `DefaultTypedControllerRateLimiter` combines exponential per-item backoff (5ms→1000s) with a token bucket (10 QPS, burst 100).

**DefaultRetry** (`staging/src/k8s.io/client-go/util/retry/util.go:26-30`): 5 steps, 10ms initial, factor 1.0, jitter 0.1
**DefaultBackoff** (`staging/src/k8s.io/client-go/util/retry/util.go:32-37`): 4 steps, 10ms initial, factor 5.0, jitter 0.1

**4. How are partial failures in batch operations reported?**

The field validation package supports this via `ErrorList` (`staging/src/k8s.io/apimachinery/pkg/util/validation/field/errors.go:463`) which accumulates multiple `Error` objects and converts to an aggregate via `ToAggregate()` (`errors.go:501`). This allows many field-level validation errors to be reported together as a single error containing all the details.

The API layer uses `metav1.Status` details to carry multiple causes (`[]StatusCause`). `NewApplyConflict(causes []metav1.StatusCause, message string)` at line 247 builds errors with multiple causes for apply Patch conflicts.

**5. Does the system have circuit breakers to prevent cascade failures?**

No explicit circuit breaker pattern (e.g., Hystrix-style open/half-open/closed state machine) was found. However, the rate limiter infrastructure (`TypedRateLimiter` with `TypedItemExponentialFailureRateLimiter` + `TypedBucketRateLimiter` composition) provides equivalent protection by exponentially increasing delay for failing items and globally limiting QPS. The `FlowControlBackoff` (`staging/src/k8s.io/client-go/util/flowcontrol/backoff.go`) also manages per-item backoff with jitter and periodic GC of stale entries.

The absence of a formal circuit breaker means a truly degraded service could still receive unlimited retries from many clients until their backoff individually maxes out.

## Architectural Decisions

1. **StatusError as the canonical error type**: All API errors are `StatusError` wrapping `metav1.Status`, providing a uniform structure with reason, message, details, and retry-after information. This is a deliberate design to map Kubernetes' API layer to HTTP semantics.

2. **Standard Go error wrapping over custom library**: Kubernetes uses `errors.Is`/`errors.As` with the `APIStatus` interface rather than `pkg/errors` or a custom wrapper type. This choice maintains compatibility with standard library tooling but requires callers to type-assert to `APIStatus` for rich error access.

3. **Typed rate limiters as generics**: The `TypedRateLimiter[T comparable]` interface uses generics to allow type-safe per-item rate limiting without boxing, enabling the controller pattern to track per-object backoff state efficiently.

4. **Fallback over failure for remote execution**: The `FallbackExecutor` pattern intentionally falls back from WebSocket to SPDY when upgrade fails, rather than failing. This reflects Kubernetes' design priority for connectivity over purity.

## Notable Patterns

- **Error factory constructors**: `NewNotFound`, `NewAlreadyExists`, `NewConflict`, `NewInvalid` etc. at `staging/src/k8s.io/apimachinery/pkg/api/errors/errors.go:144-434` provide self-documenting call sites and ensure consistent error structure.
- **Predicate-based error checking**: `IsNotFound(err)`, `IsConflict(err)`, etc. at `:527-784` enable callers to branch on error type without string matching or type assertions.
- **Retry with conflict detection**: `RetryOnConflict` at `staging/src/k8s.io/client-go/util/retry/util.go:103` specifically handles the common pattern of resource modified during update — it re-fetches and re-applies rather than propagating the conflict up.
- **Composable rate limiters**: `TypedMaxOfRateLimiter` at `staging/src/k8s.io/client-go/util/workqueue/default_rate_limiters.go:218` allows layering per-item exponential backoff over a global token bucket, combining burst protection with individual backoff.
- **Pager fallback**: `pager.go:110` falls back to full list when watch bookmark is expired — this is a graceful degradation pattern for watch stream interruptions.

## Tradeoffs

- **Rich error access requires interface type-assertion**: While `errors.Is()` works via standard wrapping, accessing `status.Details.Causes` or `retryAfterSeconds` requires `errors.As(err, &status)` and then calling `status.Status()`. Callers unfamiliar with this pattern may miss error details.
- **No formal circuit breaker**: The exponential backoff is per-item, not global. A catastrophic API server slowdown means all clients will eventually max out their backoff but they will all continue hammering the server during the ramp-up. A circuit breaker would halt traffic entirely during recovery.
- **Fallback is implicit in some paths**: Watch→List fallback in the reflector is implemented at `staging/src/k8s.io/client-go/tools/cache/reflector.go:475-500` but the decision logic is intertwined with watch bookmarks, making it non-obvious that this is a designed resilience pattern.
- **RetryOnConflict re-fetches blindly**: `RetryOnConflict` at `util/retry/util.go:103` re-fetches the full object on every conflict — this is correct for update operations but could cause thundering herd if many controllers conflict simultaneously.

## Failure Modes / Edge Cases

- **Conflict retries can cause write amplification**: When multiple controllers try to update the same object, `RetryOnConflict` causes exponential retry storms. The jitter in backoff mitigates but does not eliminate this.
- **Watch bookmark expiry without FallbackToList flag**: If the watch stream times out and `fallbackToList` is false, the reflector could get stuck waiting for a resourceVersion that no longer exists in etcd.
- **Backoff GC race**: `FlowControlBackoff.GC()` at `staging/src/k8s.io/client-go/util/flowcontrol/backoff.go:149` runs periodically but there is a window where an entry is expired but not yet GC'd, causing unnecessary delay.
- **TooManyRequests without RetryAfterSeconds**: `NewTooManyRequests` at `errors.go:327` accepts `retryAfterSeconds`, but if the server does not populate it, clients using `SuggestsClientDelay` will get `(0, false)` and may retry immediately.
- **Field validation aggregation loses ordering**: `ErrorList` is a slice — the order of validation errors is preserved but there is no sorting, so different runs may report errors in different orders.

## Future Considerations

1. **Formal circuit breaker**: A dedicated `CircuitBreaker` implementation (per-item or per-API-server) would provide cleaner cascade failure prevention, especially for API server outages. This could be built on top of the existing `TypedRateLimiter` infrastructure.

2. **Retry budget / quota**: Currently backoff caps are per-item but there is no global retry budget — a client could exhaust retries on all items even if the API server is healthy. A global retry throttle would prevent resource exhaustion.

3. **Error correlation IDs**: Kubernetes does not propagate correlation IDs through error chains. Adding a correlation ID to `StatusError.Details` would help trace errors across controller loops and API calls.

4. **Structured error channels for controllers**: The controller-runtime project (separate from core kubernetes) has adopted more sophisticated error handling with `ReconcileError` and `RequeueResult` types. Core kubernetes could benefit from similar structured error channels.

5. **Metrics for error classification**: Error classification for monitoring (4xx vs 5xx vs transient) is implicit in the code — emitting metrics for error types would help production debugging without code inspection.

## Questions / Gaps

- **No evidence of retry budget/throttle**: Searched `staging/src/k8s.io/client-go/util/retry/` and `staging/src/k8s.io/apimachinery/pkg/util/wait/` — no global retry throttle or budget mechanism found beyond per-item backoff.
- **No evidence of deadline propagation in error chain**: Errors wrapped with `fmt.Errorf` lose context about which component originated the error. There is no structured error context propagation (like OpenTelemetry span context in errors).
- **No evidence of error superset mapping for multi-error scenarios**: When multiple resources fail in a single operation (e.g.,批量 delete), errors are returned as a slice but there is no mechanism to represent partial success vs partial failure as a first-class error type.
- **No evidence of saga/compensation patterns**: The system does not appear to have compensation or saga patterns for multi-step operations that fail mid-flight — this is acceptable for Kubernetes' control-plane model but is a gap for higher-level workloads.

---

Generated by `dimensions/10-error-taxonomy-failure-handling.md` against `kubernetes`.