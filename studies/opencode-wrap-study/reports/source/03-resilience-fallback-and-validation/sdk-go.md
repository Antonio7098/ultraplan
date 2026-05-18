# Repo Analysis: sdk-go

## Resilience, Fallback, and Validation

### Repo Info

| Field | Value |
|-------|-------|
| Name | sdk-go |
| Path | `/home/antonioborgerees/coding/opencode-wrap-study/repos/sdk-go` |
| Group | `sdk-go` |
| Language / Stack | Go |
| Analyzed | 2026-05-17 |

## Summary

The Temporal Go SDK implements a comprehensive resilience model centered on explicit error typing, configurable retry policies, and structured failure propagation. Retry behavior is primarily governed by server-side policies with client-side backoff utilities. Health checking is available via gRPC. Validation is lightweight—options are validated at registration time and at workflow/activity execution time, but there is no preflight validation of provider/model configuration before spending runtime work. The SDK does not implement a circuit breaker pattern, but does implement client-side throttling via `ConcurrentRetrier`. Partial progress is tracked via workflow history, but the SDK provides no explicit checkpoint/repair mechanism beyond what Temporal server provides via workflow execution state.

## Rating

**7/10** — Typed errors, bounded retry/backoff, validation, and useful failure state. The SDK scores well on failure explicitness and retry policy composability, but lacks strong preflight validation, health checks beyond basic connectivity, and explicit repair/resume mechanisms.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| RetryPolicy struct | `RetryPolicy` with `InitialInterval`, `BackoffCoefficient`, `MaximumInterval`, `MaximumAttempts`, `NonRetryableErrorTypes` | `internal/client.go:1080-1104` |
| Backoff implementation | `ExponentialRetryPolicy` with `ComputeNextDelay`, `SetBackoffCoefficient`, `SetMaximumInterval`, `SetExpirationInterval` | `internal/common/backoff/retrypolicy.go:36-160` |
| Retry function | `Retry()` with context, operation, policy, and `IsRetryable` handler | `internal/common/backoff/retry.go:115-159` |
| ConcurrentRetrier (throttling) | `ConcurrentRetrier` with `Throttle()`, `Succeeded()`, `Failed()` for client-side rate limiting | `internal/common/backoff/retry.go:22-112` |
| ApplicationError | Typed error with `NonRetryable()`, `NextRetryDelay()`, `Category()`, `Type()`, `Details()` | `internal/error.go:120-713` |
| TimeoutError | Typed error with `TimeoutType()`, `LastHeartbeatDetails()` | `internal/error.go:136-752` |
| CanceledError | Typed error with `Details()` | `internal/error.go:161-778` |
| PanicError | Contains `StackTrace()` | `internal/error.go:178-800` |
| IsRetryable classification | `IsRetryable()` function checks `TerminatedError`, `CanceledError`, `workflowPanicError`, `TimeoutError`, `ApplicationError.nonRetryable`, `NonRetryableErrorTypes` | `internal/error.go:1036-1073` |
| Health check | `CheckHealth()` using gRPC health check API | `internal/internal_workflow_client.go:1546-1563` |
| Activity heartbeat throttling | `heartbeatThrottleInterval`, `maxHeartbeatThrottleInterval` in activity execution | `internal/internal_task_handlers.go:2117,2163` |
| Payload validation | `CompositePayloadConverter` with ordered encoding chain | `converter/composite_data_converter.go:1-186` |
| Local activity validation | `getValidatedLocalActivityOptions()` checks for nil context params | `internal/internal_activity.go:197-200` |
| Worker options validation | `ensureRequiredParams()` sets defaults for Identity, Logger, MetricsHandler, DataConverter, FailureConverter, Tuner | `internal/internal_worker.go:261-293` |
| Nexus handler error retry | `apiHandlerErrorToNexusHandlerError()` maps retry behavior from `NexusHandlerErrorRetryBehavior` | `internal/nexus_operations.go:366-387` |
| Workflow task retry loop | Comment on workflow getting stuck in task retry loop | `internal/internal_worker.go:241` |

## Answers to Protocol Questions

### 1. Which failures are considered unrecoverable, transient, retryable, or fallbackable?

The SDK's `IsRetryable()` function (`internal/error.go:1036-1073`) classifies errors:

- **Unrecoverable** (never retryable): `TerminatedError`, `CanceledError`, `workflowPanicError`
- **Retryable timeouts**: Only `StartToClose` and `Heartbeat` timeout types are retryable (`internal/error.go:1050-1052`)
- **Application errors**: Retryable by default unless `NonRetryable=true` or type matches `NonRetryableErrorTypes` list (`internal/error.go:1057-1069`)
- **Generic Go errors**: Converted to `ApplicationError` with type from reflection; retryable unless type in `NonRetryableErrorTypes`
- **ServerError**: Has `nonRetryable` flag; the `excludeInternalFromRetry` capability controls whether internal errors are retried

There is no explicit "fallback" mechanism in the SDK—fallback behavior is the developer's responsibility via error handling in workflow code.

### 2. How are retries configured, bounded, and reported to callers?

**Configuration**: `RetryPolicy` struct (`internal/client.go:1080-1104`) provides:
- `InitialInterval` (default 1s if 0)
- `BackoffCoefficient` (default 2.0)
- `MaximumInterval` (default 100x initial interval)
- `MaximumAttempts` (default unlimited if 0, bounded by `ScheduleToCloseTimeout`)
- `NonRetryableErrorTypes` list

**Boundedness**: 
- `ExponentialRetryPolicy.ComputeNextDelay()` (`internal/common/backoff/retrypolicy.go:110-149`) checks `MaximumAttempts` and `ExpirationInterval`
- Jitter is applied to avoid global synchronization (`retrypolicy.go:142-147`)
- Client-side throttling via `ConcurrentRetrier` for rate limiting (`internal/common/backoff/retry.go:19-112`)

**Reporting**:
- `ActivityError` contains `retryState` field (`internal/error.go:261-270`)
- `ApplicationError.NextRetryDelay()` allows server-requested retry interval override (`internal/error.go:706-707`)
- `ApplicationError.Category()` maps to logging/metrics behaviors (`internal/error.go:710-712`)

### 3. How would the system express compositions like retry, fallback, retry, validate, repair?

The SDK does not have a composable policy builder for retry/fallback/validate/repair chains. Developers must implement composition manually in workflow code:

- **Retry**: Activity/Workflow options include `RetryPolicy`; the SDK sends this to the Temporal server which enforces retry. Local retry logic can be implemented with `backoff.Retry()` function (`internal/common/backoff/retry.go:115-159`)
- **Fallback**: No built-in fallback mechanism; implement in workflow code using `ActivityError` handling
- **Validate**: No built-in validation step between retries; developers use heartbeat details and `GetHeartbeatDetails()` to resume progress (`activity/activity.go:86-97`)
- **Repair**: No built-in repair loop; use `ContinueAsNewError` to restart workflow with corrected state (`internal/error.go:589-611`)

### 4. How are rate limits surfaced and handled?

**Client-side throttling**: `ConcurrentRetrier` (`internal/common/backoff/retry.go:22-112`) tracks consecutive failures and applies backoff. `Failed(includeSecondaryRetryPolicy bool)` allows secondary policies for compound backoff.

**Worker-level rate limiting**:
- `WorkerActivitiesPerSecond` - per-worker activity rate limit (`internal/internal_worker.go:130`)
- `WorkerLocalActivitiesPerSecond` - per-worker local activity rate limit (`internal/internal_worker.go:133`)
- `TaskQueueActivitiesPerSecond` - server-side throttling limit (`internal/internal_worker.go:136`)

**Heartbeat throttling**: `heartbeatThrottleInterval` and `maxHeartbeatThrottleInterval` prevent heartbeat storms (`internal/internal_task_handlers.go:2117-2118`). The `temporalInvoker` batches heartbeats and throttles RPCs (`internal/internal_task_handlers.go:2128-2180`).

**Nexus retry behavior**: `nexus.HandlerErrorRetryBehavior` enum (`RETRYABLE` / `NON_RETRYABLE`) maps from server to SDK (`internal/nexus_operations.go:368-374`).

### 5. How are malformed JSON events, missing final events, empty streams, or partial outputs detected?

**Payload encoding validation**: `PayloadConverter` interface (`converter/payload_converter.go:8-21`) does not have explicit validation methods; encoding is checked via `Encoding()` string matching. `CompositePayloadConverter` (`converter/composite_data_converter.go`) iterates through converters in order.

**Activity result validation**: `convertActivityResultToRespondRequest()` (`internal/internal_task_handlers.go:2460-`) handles conversion; unknown result types cause panics in the panic handler (`internal/internal_task_handlers.go:2377-2394`).

**Missing final events**: Not explicitly handled; the SDK relies on Temporal server for workflow state machine progression.

**Empty streams**: Not explicitly validated; `HistoryIterator` (`internal/internal_public.go:20-28`) has `HasNextPage()` but no explicit empty-check behavior.

**Nexus JSON handling**: `nexusFailureMetadataToPayloads()` (`internal/nexus_operations.go:335-355`) marshals Nexus failure to JSON payload with `encoding: json/plain` metadata.

### 6. What metadata is preserved for debugging, cost estimation, and later synthesis?

**Error metadata**:
- `ApplicationError.cause` - chains original error
- `ApplicationError.details` - encoded payload values
- `ApplicationError.errType` - string type for custom errors
- `ApplicationError.nextRetryDelay` - server-requested retry interval
- `ApplicationError.category` - `ApplicationErrorCategoryBenign` for expected errors
- `TimeoutError.lastHeartbeatDetails` - encoded heartbeat details
- `ActivityError.scheduledEventID`, `startedEventID`, `activityID`, `identity`, `retryState` (`internal/error.go:261-270`)
- `NexusOperationError` - has `ScheduledEventID`, `Endpoint`, `Service`, `Operation`, `OperationToken`, `Cause` (`internal/error.go:291-308`)

**Workflow context metadata**: `WorkflowInfo` contains `WorkflowExecution`, `TaskQueue`, `RunID`, `RetryPolicy`, etc.

**Activity context metadata**: `activityEnvironment` (`internal/internal_activity.go:112-139`) contains `attempt`, `heartbeatDetails`, `retryPolicy`, `scheduledTime`, `startedTime`, `deadline`.

**Heartbeat progress**: `RecordHeartbeat()` (`activity/activity.go:77-79`) and `GetHeartbeatDetails()` (`activity/activity.go:95-97`) allow activity to persist progress across retries.

## Architectural Decisions

1. **Server-side retry enforcement**: The SDK sends `RetryPolicy` to Temporal server, which owns retry scheduling, backoff calculation, and retry state tracking. The SDK's role is constructing the policy and converting failures.

2. **Typed error hierarchy**: `ApplicationError`, `TimeoutError`, `CanceledError`, `PanicError`, `ActivityError`, `ChildWorkflowExecutionError`, `NexusOperationError` provide structured failure information. This matches Temporal's proto failure model.

3. **Client-side throttling as separate from retry**: `ConcurrentRetrier` is distinct from the `RetryPolicy` - it handles client-side rate limiting when server returns busy/unavailable, not retry of application-level failures.

4. **No preflight validation**: Worker options are defaulted in `ensureRequiredParams()` but not validated for correctness (e.g., no connection check). `CheckHealth()` is available but optional.

5. **Payload conversion chain**: `CompositePayloadConverter` tries encoders in order; failure in one encoder falls through to the next. No schema validation is performed.

## Notable Patterns

1. **Exponential backoff with jitter**: `ComputeNextDelay()` applies randomization to avoid thundering herd (`internal/common/backoff/retrypolicy.go:141-147`)

2. **Heartbeat batching**: `temporalInvoker` batches heartbeat details and reports them within a throttle window to reduce RPC load (`internal/internal_task_handlers.go:2132-2176`)

3. **Context propagation for activity execution**: Activity context carries task metadata including retry policy, attempt number, heartbeat details, and data converters (`internal/internal_activity.go:112-139`)

4. **Error unwrking chain**: All SDK errors implement `Unwrap()` to allow Go's `errors.As()` for type switching in caller code

5. **Nexus-to-Temporal failure translation**: Bidirectional conversion between Nexus SDK failures and Temporal API failures, preserving retry semantics (`internal/nexus_operations.go:282-333`)

## Tradeoffs

- **Server owns retry loop**: Developers cannot intercept or modify retry behavior at the SDK level; must configure server-side `RetryPolicy`. Limits composability for custom retry strategies.
- **No circuit breaker**: `ConcurrentRetrier` throttles on failures but doesn't trip open and stay open; it resets on success. Cannot fail-fast after repeated failures.
- **No built-in fallback**: Fallback logic must be implemented in workflow code by catching `ActivityError` and taking alternative paths.
- **No repair/resume mechanism**: Partial progress is tracked in workflow history, but the SDK provides no explicit checkpoint/save-and-resume API.
- **Payload validation is implicit**: No explicit validation step for encoding/decoding - failures appear as conversion errors rather than schema validation errors.

## Failure Modes / Edge Cases

1. **Activity unregistered**: Returns `ActivityNotRegisteredError` which triggers retry (not non-retryable) so the workflow doesn't get stuck (`internal/internal_task_handlers.go:2369-2374`)

2. **Heartbeat timeout**: `TimeoutError` with `TIMEOUT_TYPE_HEARTBEAT` is not retryable by default; only `StartToClose` and `Heartbeat` timeouts are retryable (`internal/error.go:1050-1052`)

3. **Workflow panic**: Catches panic, converts to `PanicError`, causes workflow task timeout which triggers server-side retry with exponential backoff (`internal/internal_task_handlers.go:2377-2394`)

4. **Context cancellation during retry**: `Retry()` checks `ctx.Done()` and returns `lastErr` if context is cancelled (`internal/common/backoff/retry.go:146-153`)

5. **NonRetryableApplicationError**: Created via `NewNonRetryableApplicationError()` (`internal/error.go:403-408`) - server will not retry regardless of `RetryPolicy`

6. **Malformed payload decoding**: If payload encoding is unknown, `CompositePayloadConverter` returns nil and the chain continues; eventual failure may be opaque

7. **Eager activity dispatch failure**: If eager activity fails, the SDK falls back to server-assigned activity task poller path (`internal/internal_task_handlers.go:2369`)

## Future Considerations

1. **Preflight validation**: Add optional connectivity/namespace validation before worker starts to fail fast on misconfiguration
2. **Circuit breaker pattern**: Extend `ConcurrentRetrier` or add a separate `CircuitBreaker` implementation that can trip and stay open for a configured duration
3. **Composable retry/fallback policies**: Introduce a policy builder pattern allowing `RetryPolicy | Fallback | Validate | Repair` chains
4. **Repair/resume API**: Explicit checkpoint API allowing workflows to be inspected and resumed after failure
5. **Schema validation for payloads**: Add optional JSON schema or proto schema validation in the payload conversion chain

## Questions / Gaps

1. **No evidence found** for explicit JSON event validation beyond encoding chain - validation is implicit via converter selection
2. **No evidence found** for rate limit surface to callers beyond `CheckHealth` - rate limits are internal to worker poller
3. **No evidence found** for checkpoint/durable state API - partial progress is tracked in server-side history only
4. **No evidence found** for explicit repair loop - `ContinueAsNewError` provides restart but not resume-from-checkpoint
5. **No evidence found** for preflight validation of connection/namespace before worker startup - `ensureRequiredParams` only sets defaults, doesn't validate reachability