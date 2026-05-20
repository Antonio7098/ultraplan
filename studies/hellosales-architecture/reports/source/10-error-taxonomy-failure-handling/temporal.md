# Source Analysis: temporal

## Error Taxonomy & Failure Handling

### Source Info

| Field | Value |
|-------|-------|
| Name | temporal |
| Path | `sources/temporal` |
| Language / Stack | Go (1.26.2) |
| Analyzed | 2026-05-20 |

## Summary

Temporal's error handling is comprehensive and multi-layered, combining gRPC-centric error modeling via `go.temporal.io/api/serviceerror`, custom internal error types in `common/serviceerror/`, circuit breakers backed by `sony/gobreaker`, a full retry policy infrastructure with exponential backoff and jitter in `common/backoff/`, and dead-letter queue (DLQ) handling for failed tasks. Errors are typed with structured details that survive gRPC serialization, and circuit breakers operate at the outbound queue level to prevent cascade failures.

## Rating

**8/10** — Good implementation with minor issues. Error taxonomy is rich and well-structured with clear gRPC code mapping, but some internal error types lack full `Unwrap()` support limiting error chaining, and the retry strategy configuration is spread across many policy creation functions rather than centralized.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Custom error types | `ShardOwnershipLost`, `StalePartitionCounts`, `SyncState`, `RetryReplication`, `StickyWorkerUnavailable`, `ObsoleteMatchingTask`, `ObsoleteDispatchBuildId`, `ActivityStartDuringTransition`, `staleStateError`, `DestinationDownError`, `UnprocessableTaskError` | `common/serviceerror/shard_ownership_lost.go:11-18`, `common/serviceerror/stale_partition_counts.go:11-14`, `service/history/queues/errors/errors.go:8-47` |
| Error wrapping | Custom errors implement `Status() *status.Status` returning gRPC status with protobuf details; `Unwrap()` on `DestinationDownError` | `common/serviceerror/shard_ownership_lost.go:35-47`, `service/history/queues/errors/errors.go:28-30` |
| gRPC status mapping | `convert.go` maps gRPC codes (`InvalidArgument`, `AlreadyExists`, `Aborted`, `Unavailable`, `FailedPrecondition`) to typed errors | `common/serviceerror/convert.go:18-54` |
| Retry policy | `ExponentialRetryPolicy` with configurable initial interval, backoff coefficient (default 2.0), maximum interval (default 10s), expiration interval, and maximum attempts | `common/backoff/retrypolicy.go:46-55`, `common/backoff/retrypolicy.go:81-92` |
| Jitter | 20% jitter added via `addJitter()` using a mutex-protected locked source to avoid global synchronization | `common/backoff/retrypolicy.go:178-187`, `common/backoff/retrypolicy.go:300-320` |
| Retry utilities | `ThrottleRetryContext`, `ThrottleRetryContextWithReturn` apply retry policies with resource-exhausted awareness and context deadline checking | `common/backoff/retry.go:49-101` |
| Circuit breaker | `TwoStepCircuitBreakerWithDynamicSettings` wraps `gobreaker.TwoStepCircuitBreaker` with dynamic config reload; used for outbound queues | `common/circuitbreaker/circuitbreaker.go:19-31`, `common/circuitbreaker/circuitbreaker.go:54-71` |
| Circuit breaker integration | `CircuitBreakerExecutable` wraps queue executables; `DestinationDownError` triggers circuit breaker open | `service/history/queues/executable.go:885-942` |
| DLQ support | Replication tasks and queue tasks can be written to DLQ; `NoopDLQWriter` for test; DLQ metrics tracked | `service/history/replication/task_processor.go:275-356`, `service/history/replication/noop_dlq_writer.go:5-11` |
| Task retry policies | Separate policies for persistence client, frontend client, history client, matching client, read tasks, task reschedule | `common/util.go:161-211` |
| Service error interceptor | `ServiceErrorInterceptor` converts serialization errors to `DataLoss`, truncates messages | `common/rpc/interceptor/service_error_interceptor.go:37-51` |
| Nexus failure conversion | `TemporalFailureToNexusFailure` / `NexusFailureToTemporalFailure` convert between Temporal and Nexus failure representations with retry behavior hints | `common/nexus/failure.go:98-277` |
| Frontend error masking | `NewFrontendServiceErrorInterceptor` masks `ShardOwnershipLost` as `Unavailable`, propagates `ResourceExhausted` via headers | `common/rpc/interceptor/frontend_service_error.go:40-56` |
| RetryableInterceptor | gRPC unary interceptor applying `ThrottleRetryContext` | `common/rpc/interceptor/retry.go:29-43` |
| Circuit breaker pool | `CircuitBreakerPool[K]` using `collection.OnceMap` for per-destination circuit breakers | `service/history/circuitbreakerpool/circuit_breaker_factory.go:8-19` |
| Circuit breaker config | `OutboundQueueCircuitBreakerSettings` dynamic config with `MaxRequests`, `Interval`, `Timeout` | `common/dynamicconfig/constants.go:2181-2184`, `common/dynamicconfig/shared_constants.go:93-102` |

## Answers to Dimension Questions

### 1. How does the system distinguish client errors from server errors from transient failures?

The system uses gRPC `codes` as the primary classification mechanism. `convert.go:18-54` maps:
- **Client errors**: `InvalidArgument` → `CurrentBranchChanged`; `AlreadyExists` → `TaskAlreadyStarted`; `FailedPrecondition` → `ObsoleteDispatchBuildId`, `ObsoleteMatchingTask`, `ActivityStartDuringTransition`
- **Server/transient errors**: `Unavailable` → `StickyWorkerUnavailable`; `Aborted` → `ShardOwnershipLost`, `RetryReplication`, `SyncState`, `StalePartitionCounts`
- **Resource exhaustion**: Dedicated `serviceerror.ResourceExhausted` with `Cause` and `Scope` fields, propagated via headers `X-Resource-Exhausted-Cause` and `X-Resource-Exhausted-Scope` (`frontend_service_error.go:46-55`)
- **Transient vs permanent**: `DestinationDownError` specifically signals a destination is down (circuit breaker trigger) vs internal errors (`queues/errors.go:5-11`). `UnprocessableTaskError` signals permanent failure without retry (`queues/errors.go:32-47`).

### 2. Are errors typed so callers can handle specific failure modes?

Yes, callers can handle specific error types. Each custom error in `common/serviceerror/` is a concrete struct (e.g., `ShardOwnershipLost`, `StalePartitionCounts`, `SyncState`) that can be type-asserted. The `FromStatus` function in `convert.go:11-57` reconstructs these types from gRPC status. However, not all internal errors implement `Unwrap()` for `errors.Is`/`errors.As` chaining — only `DestinationDownError` does explicitly (`queues/errors.go:28-30`). Many internal sentinel errors like `staleStateError` (`service/history/consts/const.go:150`) are plain error values without structured fields.

### 3. What is the retry strategy — exponential backoff, jitter, max attempts?

Exponential backoff with jitter and maximum attempt caps:
- **Formula**: `min(initialInterval * pow(backoffCoefficient, currentAttempt), maximumInterval)` (`retrypolicy.go:48`, `retrypolicy.go:153`)
- **Defaults**: Initial interval varies by context (1s for throttle, configurable otherwise), backoff coefficient 2.0, maximum interval 10s, no maximum attempts by default (`retrypolicy.go:19-23`)
- **Jitter**: 20% randomization (`addJitter` at `retrypolicy.go:178-187`) using a mutex-protected `rand.Rand` source to avoid global synchronization (`retrypolicy.go:300-320`)
- **Context-aware**: `ThrottleRetryContext` checks `ctx.Err()` before retry and respects context deadlines (`retry.go:62-86`)
- **Resource exhaustion special case**: Uses a separate throttle retry policy (1s initial, 10s max) in addition to the configured policy (`retry.go:64-82`)
- **Expiration**: Retry stops after `expirationInterval` elapses (`retrypolicy.go:148-151`)

### 4. How are partial failures in batch operations reported?

No explicit batch partial-failure pattern was found. Batch operations rely on the overall retry machinery. For replication tasks, failed tasks are written individually to the DLQ rather than accumulating partial results (`service/history/replication/task_processor.go:275-356`). The queue task system uses `UnprocessableTaskError` to reject tasks that should never be retried without going to DLQ (`queues/errors.go:32-47`). There is no consolidated "some succeeded, some failed" error response type with per-item status.

### 5. Does the system have circuit breakers to prevent cascade failures?

Yes, outbound queue circuit breakers:
- **`TwoStepCircuitBreakerWithDynamicSettings`** wraps `sony/gobreaker` with dynamic config reload capability (`circuitbreaker.go:19-31`)
- **`OutboundQueueCircuitBreakerPool`** provides per-`TaskGroupNamespaceIDAndDestination` circuit breakers (`circuitbreakerpool/circuit_breaker_factory.go:17-33`)
- **`CircuitBreakerExecutable`** wraps queue executables and treats `DestinationDownError` as a failure signal to the circuit breaker while unwrapping and returning the inner error (`executable.go:910-941`)
- **Configuration**: `MaxRequests`, `Interval` (clears counts), `Timeout` (open→half-open duration) via `CircuitBreakerSettings` (`shared_constants.go:93-102`)
- **When open**: Returns `ResourceExhausted` with `CAUSE_CIRCUIT_BREAKER_OPEN` to ensure task is retried less aggressively and does not go to DLQ (`executable.go:916-923`)

## Architectural Decisions

1. **gRPC status as error backbone**: All errors convert to/from `*status.Status` with protobuf details for cross-service transmission. This provides wire compatibility but requires `FromStatus` reconstruction on the receiving side (`convert.go:11-57`).

2. **Structured internal errors separate from API errors**: Internal `common/serviceerror` types complement the public `go.temporal.io/api/serviceerror` package. Internal errors carry richer domain-specific context (shard ownership, sync state, etc.) that would be inappropriate in the public API.

3. **Dynamic circuit breaker settings**: Circuit breakers reload settings from dynamic config on every `Allow()` call rather than subscribing to config changes, trading some efficiency for simpler architecture (`circuitbreaker.go:54-71`).

4. **DLQ as failure sink**: Tasks that exhaust retries or fail permanently are routed to DLQ rather than being discarded, enabling manual intervention and reprocessing.

## Notable Patterns

- **Error type + status pattern**: Each `serviceerror` type has `Error() string` for Go error interface and `Status() *status.Status` for gRPC serialization
- **Circuit breaker pool**: Per-destination circuit breakers managed via `OnceMap` to avoid creating breakers for destinations that never see traffic
- **Retry policy builders**: Fluent builder pattern (`WithInitialInterval`, `WithBackoffCoefficient`, etc.) for constructing retry policies (`retrypolicy.go:104-138`)
- **Throttle retry distinction**: Resource exhaustion errors use a separate (typically more aggressive) retry policy via `ThrottleRetryContext`
- **RetryLockedSource**: Custom RNG source wrapper to make `math/rand` thread-safe for jitter calculations

## Tradeoffs

1. **Error type explosion vs simplicity**: 14+ custom `serviceerror` types provide fine-grained handling but increase the surface area callers must understand
2. **Jitter implementation**: Using 20% fixed jitter (`retrypolicy.go:180`) rather than full jitter or configurable jitter limits adaptability to different workloads
3. **Circuit breaker per destination**: Fine-grained but means a destination that flaps causes repeated breaker transitions rather than a single global breaker
4. **No standard Unwrap on all errors**: Many `serviceerror` types lack `Unwrap()`, limiting use with `errors.Is`/`errors.As` — callers must use `Status()` / `FromStatus` round-trip instead
5. **DLQ per replication stream**: Replication DLQ is per-source-cluster, meaning different source clusters' failures are isolated, but there's no unified DLQ view across all sources

## Failure Modes / Edge Cases

1. **Circuit breaker open + DLQ disabled**: If `DestinationDownError` is returned but the DLQ is not enabled, tasks may be retried rapidly against a failing destination
2. **Context cancellation during retry delay**: `ThrottleRetryContext` breaks the retry loop if context is cancelled, returning `ctx.Err()` even if `operation` returned a retryable error (`retry.go:76-78`)
3. **Jitter seed panic**: `RetryLockedSource.Seed()` panics if called — this prevents accidental reseeding but could be surprising (`retrypolicy.go:311-313`)
4. **Serialization error masking**: `ServiceErrorInterceptor` converts all deserialization/serialization errors to `DataLoss`, which may hide the specific original error from callers (`service_error_interceptor.go:40-42`)
5. **DLQ ack level drift**: If `checkReplicationDLQEmptyLoop` fails repeatedly, the DLQ size gauge may become stale, masking actual DLQ accumulation

## Future Considerations

1. Standardize `Unwrap()` on all `serviceerror` types to enable idiomatic Go error chaining and `errors.Is`/`errors.As` usage
2. Consider centralized retry configuration rather than 10+ policy creation functions in `common/util.go`
3. Add partial-failure reporting for batch operations (list of per-item results/errors)
4. Support configurable jitter algorithms (full jitter vs equal jitter vs no jitter)
5. Consider circuit breaker metrics/alerts integration beyond just the blocked counter

## Questions / Gaps

1. No evidence found of a standard error code enum mapping internal errors to client-facing error codes (beyond gRPC codes)
2. No evidence found of error budget or error rate-based tripping for circuit breakers — only count-based tripping via `gobreaker` defaults
3. No evidence found of bulkhead/isolation patterns beyond circuit breakers (e.g., thread pool limits per destination)
4. How does the system handle errors that occur during DLQ write itself? The code assumes DLQ write succeeds (`task_processor.go:340-357`)