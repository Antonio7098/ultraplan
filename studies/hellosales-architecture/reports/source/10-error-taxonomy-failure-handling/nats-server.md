# Source Analysis: nats-server

## Error Taxonomy & Failure Handling

### Source Info

| Field | Value |
|-------|-------|
| Name | nats-server |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/nats-server` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

nats-server implements a comprehensive error taxonomy with three distinct layers: (1) sentinel errors for core protocol violations, (2) an ApiError hierarchy for JetStream operations with machine-readable error codes, and (3) a custom error wrapping system with context propagation. The system uses exponential backoff with jitter for retries, slow-consumer detection for cascade prevention, and rate-limited logging to prevent log storms. Partial failures in batch operations are handled through a dedicated batch state machine that can reject or accept batches atomically. However, there is no explicit circuit breaker pattern—cascade failure prevention relies on slow-consumer detection and configurable write timeout policies.

## Rating

**7/10** — Good implementation with minor issues. The error taxonomy is well-structured with clear error code hierarchies and proper error wrapping. The retry mechanism includes exponential backoff with jitter. However, there is no explicit circuit breaker pattern, and retry behavior is inconsistent across subsystems (route reconnect vs. JetStream mirror setup use different approaches).

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Sentinel errors | `ErrConnectionClosed`, `ErrAuthentication`, `ErrMaxPayload`, `ErrTooManyConnections` | `server/errors.go:22-247` |
| ApiError struct | `{Code int, ErrCode uint16, Description string}` with JSON tags | `server/jetstream_errors.go:57-61` |
| Error identifiers | `ErrorIdentifier uint16` with 100+ JetStream-specific codes | `server/jetstream_errors.go:29` |
| Error wrapping | `errCtx` struct with `Unwrap()` and `Context()` methods | `server/errors.go:337-362` |
| Custom errors.Is | `ErrorIs()` function as backport for Go 1.12 compatibility | `server/errors.go:387-409` |
| Error composition | `fmt.Errorf("%w: invalid transform", ErrInvalidMappingDestination)` | `server/errors.go:226` |
| Retry backoff | `calculateRetryBackoff(fails)` with 5s base, 2m max, failures*2 multiplier | `server/stream.go:3381-3387` |
| Retry with jitter | Jitter of 100-200ms added to backoff | `server/stream.go:3407-3408` |
| Route reconnect backoff | Exponential backoff doubling delay up to `routeConnectMaxDelay` | `server/route.go:2950-2956` |
| Batch failure handling | `rejectBatchStateLocked()` returns entries to pool and corrects sequence | `server/jetstream_batching.go:505-517` |
| Rate-limited logging | `RateLimitWarnf`, `RateLimitErrorf` with configurable intervals | `server/log.go:230-250` |
| Slow consumer detection | `isSlowConsumer` flag, `SlowConsumerPendingBytes`, `SlowConsumerWriteDeadline` | `server/client.go:155,194-195` |
| Write timeout policy | `WriteTimeoutPolicyClose` and `WriteTimeoutPolicyRetry` options | `server/client.go:238-256` |
| Client close reasons | 40+ `ClosedState` values including auth failures, protocol violations | `server/client.go:189-227` |
| Error code taxonomy | ApiErrors map with 400 (client), 500 (server), 503 (unavailable) codes | `server/jetstream_errors_generated.go:676-704` |

## Answers to Dimension Questions

### 1. How does the system distinguish client errors from server errors from transient failures?

**Client errors (HTTP 400)**: ApiError uses `Code: 400` for validation failures like `JSBadRequestErr`, `JSConsumerConfigRequiredErr`, `JSConsumerAlreadyExists`. These indicate the caller sent malformed or invalid requests.

**Server errors (HTTP 500)**: `Code: 500` for internal failures like `JSClusterNotActiveErr`, `JSClusterNotLeaderErr`, `JSConsumerCreateErrF`.

**Transient failures (HTTP 503)**: `Code: 503` for `JSClusterNotAvailErr` ("JetStream system temporarily unavailable"), `JSClusterRequiredErr`. These indicate temporary conditions callers can retry.

Evidence: `server/jetstream_errors_generated.go:677-700` shows error codes mapped to HTTP status equivalents. The `IsNatsErr()` function at `server/jetstream_errors.go:32-54` allows callers to check specific error codes programmatically.

### 2. Are errors typed so callers can handle specific failure modes?

Yes. The `ApiError` struct includes `ErrCode uint16` with 100+ unique identifiers (e.g., `JSConsumerNotFoundErr: 10014`, `JSClusterNotLeaderErr: 10009`). Callers can use `IsNatsErr(err, JSClusterNotLeaderErr)` to handle specific conditions.

The `Unless()` error option at `server/jetstream_errors.go:15-18` allows error helpers to short-circuit and return existing errors rather than creating new ones.

However, the sentinel errors in `errors.go` are plain `errors.New()` strings without structured error codes, limiting caller discrimination to string matching.

### 3. What is the retry strategy — exponential backoff, jitter, max attempts?

**Exponential backoff with jitter**: Mirror consumer retry uses base backoff of 5 seconds multiplied by `fails*2`, capped at 2 minutes. Jitter of 100-200ms is added (`server/stream.go:3373-3408`):

```go
func calculateRetryBackoff(fails int) time.Duration {
    backoff := time.Duration(retryBackOff) * time.Duration(fails*2)
    if backoff > retryMaximum {
        backoff = retryMaximum
    }
    return backoff
}
```

**Route reconnection**: Uses pure exponential backoff (doubles each attempt up to `routeConnectMaxDelay`) with no jitter (`server/route.go:2950-2956`).

**Max attempts**: Route reconnection has `opts.Cluster.ConnectRetries` limit (`server/route.go:2942`). Mirror consumer retry has no explicit max attempts—it continues indefinitely with backoff capped at 2 minutes.

**No global retry middleware**: Each subsystem implements its own retry logic, leading to inconsistent patterns.

### 4. How are partial failures in batch operations reported?

The `batchApply` struct (`server/jetstream_batching.go:486-493`) tracks batch entries and sequence state. When a batch fails, `rejectBatchStateLocked()` (`server/jetstream_batching.go:505-517`) returns all committed entries to the memory pool and corrects `mset.clfs` (consumer lookback floor sequence):

```go
func (batch *batchApply) rejectBatchStateLocked(mset *stream) {
    mset.clMu.Lock()
    mset.clfs += batch.count
    mset.clMu.Unlock()
    for _, bce := range batch.entries {
        bce.ReturnToPool()
    }
    batch.clearBatchStateLocked()
}
```

This ensures atomic semantics: either all entries in a batch are applied, or the batch is fully rejected and sequences corrected.

For clustered streams, the sequence must be moved back on batch failure (`server/stream.go:7395-7396`).

### 5. Does the system have circuit breakers to prevent cascade failures?

**No explicit circuit breaker pattern** was found. Instead, nats-server uses:

**Slow consumer detection**: Connections flagged as `isSlowConsumer` when pending bytes exceed limits or write deadlines trigger. The server can close connections based on `WriteTimeoutPolicy` (`server/client.go:238-256, 1913-1917`):

```go
case policy == WriteTimeoutPolicyRetry && client.flags.isSet(isSlowConsumer):
case policy == WriteTimeoutPolicyClose && !client.flags.isSet(isSlowConsumer):
```

**Rate-limited logging**: Prevents log storms from repeated failures (`server/log.go:230-250`).

**Account-level resource limits**: `JSAccountResourcesExceededErr` (10002) signals when account limits are hit, allowing callers to back off.

The absence of a formal circuit breaker means repeated failures in critical paths (e.g., raft leader election, catchup) rely on backoff timers rather than a circuit that "opens" to fail-fast.

## Architectural Decisions

**Two-tier error model**: Core protocol errors use sentinel `errors.New()` strings, while JetStream errors use structured `ApiError` with machine-readable codes. This creates an impedance mismatch—NATS protocol errors are harder to discriminate programmatically than JetStream API errors.

**Error code generation**: JetStream error constants and `ApiErrors` map are generated from `errors.json` via `go generate`, ensuring consistency between error definitions and documentation (`server/jetstream_errors_generated.go:1`).

**Custom error backports**: The `ErrorIs()` and `errorsUnwrap()` functions (`server/errors.go:377-409`) are manual backports of Go 1.13+ error handling for Go 1.12 compatibility. This adds maintenance burden and indicates the codebase predates widespread adoption of standard error wrapping.

**Contextual error wrapping via `errCtx`**: Errors can carry opaque context strings via `NewErrorCtx(err, format, args...)` without modifying error type. The `UnpackIfErrorCtx()` function flattens nested contexts for display.

## Notable Patterns

**Error option pattern**: `Unless(err)` allows errors to chain: if a caught error is already an `ApiError`, return it unchanged rather than wrapping (`server/jetstream_errors.go:15-18`). This prevents error fatigue in deep call stacks.

**Rate-limited advisory logging**: `RateLimitWarnf` prevents log flooding during repeated transient conditions. Server-wide `changeRateLimitLogInterval()` allows tuning (`server/server.go:4712`).

**Graceful degradation via write timeout policies**: Connections can be configured to `WriteTimeoutPolicyRetry` (retry writes) or `WriteTimeoutPolicyClose` (close connection) on slow-consumer conditions.

**Staged batch commit**: Atomic batch publishes use a `batchStagedDiff` state machine with explicit `commitBatch()` and `abortBatch()` transitions (`server/jetstream_batching.go:31-35, 486-523`).

## Tradeoffs

**Retry inconsistency**: Route reconnection uses pure exponential backoff without jitter; JetStream mirror setup uses exponential backoff with jitter. A caller studying retry behavior must examine each subsystem separately.

**No structured error for core NATS**: Sentinel errors like `ErrConnectionClosed` lack error codes, forcing callers to match error strings. This is brittle and doesn't compose well with `%w`.

**Backport overhead**: Custom `ErrorIs()` and `errorsUnwrap()` implementations (`server/errors.go:377-409`) duplicate standard library functionality, requiring ongoing maintenance.

**Infinite retry without circuit**: Mirror consumer setup retries indefinitely with capped backoff. If the source stream is permanently unavailable, this creates a retry storm bounded only by backoff maximum.

**Batch semantics complexity**: The `batchApply` state machine handles partial failure by reverting sequence state, but the complexity is high—correctness depends on proper locking order (`mset.clMu` vs `batch.mu`).

## Failure Modes / Edge Cases

**Error string fragility**: Sentinel errors like `ErrTooManyConnections` are plain strings. A caller matching `"maximum connections exceeded"` will break if the string changes.

**Nested `errCtx` unwrapping**: `UnpackIfErrorCtx()` handles recursively nested `errCtx` by checking `*errCtx` type explicitly (`server/errors.go:366-372`). If `errCtx` embeds a non-`*errCtx` error, the recursion terminates but may produce awkward output like `"error: context"`.

**Stale mirror state after retry storm**: If mirror consumer setup fails repeatedly, `mset.mirror.fails` increments indefinitely. The backoff caps individual delays but not total retry time.

**Race between batch commit and stream close**: If stream closes while a batch commit is in progress, the outcome depends on lock ordering between `stream.mu` and `batch.mu`.

**TLS handshake error suppression**: Client probe TLS handshakes (load balancer probes) are logged at Debug level rather than Error, but non-probe errors are always surfaced (`server/client.go:6580-6587`).

## Future Considerations

**Formal circuit breaker**: Implement a dedicated circuit breaker for external dependencies (upstream servers, storage backends) with explicit closed/open/half-open states and configurable thresholds.

**Standard error wrapping migration**: Replace custom `ErrorIs()` backports with standard library `errors.Is()` now that Go 1.12 support is likely deprecated.

**Unified error code scheme**: Extend sentinel errors with numeric codes to match the JetStream error taxonomy, enabling programmatic error discrimination for all nats-server error conditions.

**Retry budget**: Add retry budgets (total time or total attempts) to mirror/source consumer setup to bound resource consumption during extended outages.

**Partial batch success reporting**: Currently batches are all-or-nothing. Consider supporting "best effort" batch with per-entry results for efficiency in non-critical paths.

## Questions / Gaps

**No explicit chaos testing evidence**: While the codebase has `TestNoRace*` tests for concurrency safety, there is no evidence of chaos engineering practices (fault injection, Netflix's Chaos Monkey) validating error handling under arbitrary failures.

**Documentation of retry budgets**: The `ConnectRetries` option for routes sets max retry attempts, but JetStream mirror setup has no documented max retry budget. This may be intentional but is not explained.

**Error observability**: No evidence of structured error telemetry (OpenTelemetry spans, error tracking integration) beyond log messages. Error observability in distributed traces is a gap.

---

Generated by `dimensions/10-error-taxonomy-failure-handling.md` against `nats-server`.
