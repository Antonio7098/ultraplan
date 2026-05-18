# Repo Analysis: t3code

## Resilience, Fallback, and Validation

### Repo Info

| Field | Value |
|-------|-------|
| Name | t3code |
| Path | `/home/antonioborgerees/coding/opencode-wrap-study/repos/t3code` |
| Group | `t3code` |
| Language / Stack | TypeScript/Effect (Node.js + React) |
| Analyzed | 2026-05-17 |

## Summary

T3code is a multi-package TypeScript monorepo (apps/server, apps/web, packages/*) that bridges a React web UI to Codex App Server over WebSocket. The resilience model operates at two levels: (1) WebSocket transport reconnection with exponential backoff and retry limits, and (2) orchestration event recovery with snapshot-and-replay bootstrap. Error classification is wired through Effect's typed error model with explicit `RuntimeErrorClass` categories. Validation is pervasive via Effect/Schema — all provider runtime events and session state transitions are schema-validated at decode time.

## Rating

**7/10** — Typed errors, bounded retry/backoff, strong schema validation, and meaningful partial-progress state (orchestration recovery with snapshot/replay). Deduction: policy composability is emergent rather than designed; there is no first-class abstraction for composing retry/fallback/validate/repair chains and the error taxonomy is incomplete (e.g., `SessionExitedPayload.recoverable` is optional and underspecified).

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| WebSocket reconnection backoff | `WS_RECONNECT_INITIAL_DELAY_MS = 1_000`, `WS_RECONNECT_BACKOFF_FACTOR = 2`, `WS_RECONNECT_MAX_DELAY_MS = 64_000`, `WS_RECONNECT_MAX_RETRIES = 7` | `apps/web/src/rpc/wsConnectionState.ts:9-12` |
| WebSocket reconnect scheduling | `getWsReconnectDelayMsForRetry` computes delay as `min(1000 * 2^retry, 64000)` | `apps/web/src/rpc/wsConnectionState.ts:203-212` |
| RPC retry policy | `Schedule.addDelay(Schedule.recurs(WS_RECONNECT_MAX_RETRIES))` with `retryTransientErrors: true` | `apps/web/src/rpc/protocol.ts:219-228` |
| SSH tunnel readiness probe retry | `Schedule.spaced(Duration.millis(intervalMs)).pipe(Schedule.take(count))` for HTTP readiness polling | `packages/ssh/src/tunnel.ts:881-883` |
| SSH tunnel retry with backoff | `HttpClient.retry(retryPolicy)` wraps readiness checks | `packages/ssh/src/tunnel.ts:944` |
| Orchestration recovery coordinator | `createOrchestrationRecoveryCoordinator()` manages snapshot/replay phases | `apps/web/src/orchestrationRecovery.ts:88-211` |
| Replay retry tracker | `ReplayRetryTracker` with `attempts`, `latestSequence`, `highestObservedSequence` | `apps/web/src/orchestrationRecovery.ts:25-29` |
| Replay retry decision logic | `deriveReplayRetryDecision` with exponential backoff (`baseDelayMs * 2^(attempts-1)`) | `apps/web/src/orchestrationRecovery.ts:39-86` |
| Event classification | `classifyDomainEvent` returns `"ignore" \| "defer" \| "recover" \| "apply"` | `apps/web/src/orchestrationRecovery.ts:124-138` |
| IPC error classification | `RuntimeErrorClass = Schema.Literals(["provider_error", "transport_error", "permission_error", "validation_error", "unknown"])` | `packages/contracts/src/providerRuntime.ts:95-102` |
| Session exit with recovery hint | `SessionExitedPayload` has `recoverable?: boolean` and `exitKind?: RuntimeSessionExitKind` | `packages/contracts/src/providerRuntime.ts:282-287` |
| Provider runtime event schemas | `ProviderRuntimeEventV2` union of 45 typed event schemas | `packages/contracts/src/providerRuntime.ts:951-999` |
| Schema validation for all runtime events | `Schema.decodeUnknownSync(ProviderRuntimeEvent)` used in tests | `packages/contracts/src/providerRuntime.test.ts:6` |
| Desktop update retry flag | `DesktopUpdateState.canRetry: boolean` in IPC schema | `packages/contracts/src/ipc.ts:177` |
| Rate limit event propagation | `account.rate-limits.updated` event type with `AccountRateLimitsUpdatedPayload` | `packages/contracts/src/providerRuntime.ts:185,237,536-539,885-891` |
| Schema-based JSON decoding | `Schema.decodeEffect(Schema.fromJsonString(...))` used for all JSON input validation | `packages/shared/src/schemaJson.ts:14-27` |
| Error type taxonomy | `CodexAppServerSpawnError`, `CodexAppServerProcessExitedError`, `CodexAppServerProtocolParseError`, `CodexAppServerTransportError`, `CodexAppServerRequestError` | `packages/effect-codex-app-server/src/errors.ts:9-115` |
| Effect TaggedError usage | All application errors extend `Schema.TaggedErrorClass` for typed error discrimination | `packages/effect-codex-app-server/src/errors.ts:9` |
| Discord release notification retry | `HttpClient.retryTransient({ retryOn: "errors-and-responses" })` | `scripts/notify-discord-release.ts:125-126` |
| Keyed coalescing worker retry | `Effect.txRetry` used when draining a key that is still active/queued | `packages/shared/src/KeyedCoalescingWorker.ts:134` |
| WS connection metadata | `WsConnectionStatus` tracks `lastError`, `lastErrorAt`, `nextRetryAt`, `reconnectAttemptCount` | `apps/web/src/rpc/wsConnectionState.ts:15-32` |

## Answers to Protocol Questions

### 1. Which failures are considered unrecoverable, transient, retryable, or fallbackable?

**Unrecoverable**: Detected when:
- `deriveReplayRetryDecision` returns `shouldRetry: false` after exhausting `maxNoProgressRetries` (default appears to be 3 based on test cases in `orchestrationRecovery.test.ts:157-275`).
- Session exit `recoverable` is `false` or absent, and the exit kind is `error` rather than `graceful`.
- Error class is `validation_error` or `permission_error` in the `RuntimeErrorClass` taxonomy (`packages/contracts/src/providerRuntime.ts:95-102`).

**Transient / Retryable**: Detected when:
- WebSocket transport returns a non-fatal error; `getWsReconnectDelayMsForRetry` returns a non-null value within `WS_RECONNECT_MAX_RETRIES` (7 attempts).
- SSH tunnel readiness probe timeout: `SshReadinessError` with `kind: "probe-timeout"` wraps a retryable condition — the `waitForHttpReady` function retries until the timeout is reached (`packages/ssh/src/tunnel.ts:870-969`).
- RPC protocol layer: `retryTransientErrors: true` flag in `RpcClient.makeProtocolSocket` (`apps/web/src/rpc/protocol.ts:227`).

**Fallbackable**: Observed in model selection: if a selected provider instance is disabled, the system falls back to the `defaultInstanceIdForDriver` mapping — see `modelSelection.ts:186-313` in `apps/web/src/modelSelection.ts`. Provider-level fallback also occurs when `getProviderModels` returns a first-matching-kind fallback for custom providers.

**Evidence**: `apps/web/src/orchestrationRecovery.ts:39-86` (replay retry decision), `packages/contracts/src/providerRuntime.ts:282-287` (session exit recoverable flag), `apps/web/src/modelSelection.ts:186-313` (model/provider fallback).

### 2. How are retries configured, bounded, and reported to callers?

**Configuration**:
- WebSocket: constants `WS_RECONNECT_INITIAL_DELAY_MS = 1_000`, `WS_RECONNECT_BACKOFF_FACTOR = 2`, `WS_RECONNECT_MAX_RETRIES = 7`, `WS_RECONNECT_MAX_DELAY_MS = 64_000` in `apps/web/src/rpc/wsConnectionState.ts:9-12`. Configured via `Schedule.addDelay(Schedule.recurs(WS_RECONNECT_MAX_RETRIES), ...)` in `apps/web/src/rpc/protocol.ts:219-220`.
- SSH tunnel: configurable `timeoutMs`, `intervalMs`, `probeTimeoutMs` on `waitForHttpReady` with computed retry count from `timeoutMs / intervalMs` (`packages/ssh/src/tunnel.ts:878-883`).

**Bounded**:
- WS reconnects capped at `WS_RECONNECT_MAX_RETRIES` (7) before entering `"exhausted"` reconnect phase (`wsConnectionState.ts:237-242`).
- SSH readiness probe bounded by total `timeoutMs`.
- Replay retries bounded by `maxNoProgressRetries` parameter to `deriveReplayRetryDecision` (`orchestrationRecovery.ts:44,69`).

**Reported to callers**:
- `WsConnectionStatus` includes `reconnectAttemptCount`, `nextRetryAt`, `lastError`, `lastErrorAt`, `reconnectPhase` — surfaced via `useWsConnectionStatus()` hook for UI consumption.
- `ReplayRetryDecision` includes `delayMs` for scheduling retries (`orchestrationRecovery.ts:31-35`).
- `SessionExitedPayload` includes `recoverable?: boolean` and `exitKind` for caller decision-making.

**Evidence**: `apps/web/src/rpc/wsConnectionState.ts:15-32` (status tracking), `apps/web/src/orchestrationRecovery.ts:39-86` (bounded replay retry).

### 3. How would the system express compositions like retry, fallback, retry, validate, repair?

No first-class composition abstraction was found. The system handles these as separate patterns:
- **Retry**: Effect's `Schedule` + `Effect.retry` / `HttpClient.retry` / `HttpClient.retryTransient` scattered across `packages/ssh/src/tunnel.ts:944`, `apps/web/src/rpc/protocol.ts:226-227`, `scripts/notify-discord-release.ts:125-126`.
- **Fallback**: Model-level fallback in `modelSelection.ts:186-313` via instance selection; shell fallback in `shell.ts:47-52`; error message normalization with `normalizeSshErrorMessage` fallback string in `packages/ssh/src/tunnel.ts:215-217`.
- **Validate**: All provider events are decoded through `ProviderRuntimeEventV2` union schema (`packages/contracts/src/providerRuntime.ts:951-999`). JSON decoding uses `Schema.decodeEffect(Schema.fromJsonString(...))` throughout. The `FilesPersistedPayload` includes both `files` and `failed` arrays for partial validation tracking (`packages/contracts/src/providerRuntime.ts:574-590`).
- **Repair**: Orchestration recovery uses snapshot-then-replay with `beginSnapshotRecovery` / `completeSnapshotRecovery` / `beginReplayRecovery` / `completeReplayRecovery` cycle — this is a repair loop, but it is tightly bound to event sequence recovery, not general repair composition.

The patterns are composed implicitly via Effect's sequential pipeline (`pipe`) and Layer composition rather than an explicit policy combinator. There is no `RetryPolicy`, `FallbackPolicy`, or `ValidationPolicy` type that can be composed, configured, and passed as a single parameter.

**Gap**: Callers cannot say "use this retry policy with exponential backoff, but fall back to this model if retries exhaust, then validate the output schema, then attempt repair via replay." These concerns are entangled in different layers with no unifying interface.

### 4. How are rate limits surfaced and handled?

Rate limits are surfaced as typed provider runtime events:
- Event type `account.rate-limits.updated` defined in `packages/contracts/src/providerRuntime.ts:185,237`.
- Payload `AccountRateLimitsUpdatedPayload = Schema.Struct({ rateLimits: Schema.Unknown })` at line 536-539 — the `rateLimits` field is typed as `Schema.Unknown`, which is a weakness (no structured validation of the rate limit data).
- The event propagates through `ProviderRuntimeAccountRateLimitsUpdatedEvent` schema at lines 885-891.

No evidence of automatic retry or backoff triggered by rate limit events. The system relies on callers (UI) to observe the event and render appropriate UI (e.g., disable send buttons). The `rateLimits` being `Schema.Unknown` means the caller must also know the shape out-of-band.

**Evidence**: `packages/contracts/src/providerRuntime.ts:536-539,885-891`.

### 5. How are malformed JSON events, missing final events, empty streams, or partial outputs detected?

**Malformed JSON events**: Handled by `Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)` pattern used in `effect-codex-app-server/src/protocol.ts:90`, `packages/shared/src/schemaJson.ts:14-27`. Effect's schema decoder produces typed errors with path information on parse failure.

**Missing final events**: Orchestration recovery handles missing events via `classifyDomainEvent` — if `sequence !== state.latestSequence + 1` (a gap), it returns `"recover"` and triggers replay. This detects missing final events as sequence gaps (`apps/web/src/orchestrationRecovery.ts:133-136`).

**Empty streams**: `Stream.decodeText()` in `ClaudeTextGeneration.ts:71-75` — if the stream is empty, `Stream.runFold` returns `""`, which is distinguishable from a parse error. Text generation then fails with a `TextGenerationError` wrapping the empty output.

**Partial outputs**: `FilesPersistedPayload` tracks `files` (succeeded) and `failed` (failed) arrays separately (`packages/contracts/src/providerRuntime.ts:574-590`). The `TurnCompletedPayload` includes `errorMessage?: string` for describing partial failures (`packages/contracts/src/providerRuntime.ts:361-369`). The `deriveReplayRetryDecision` function treats a replay that doesn't advance `latestSequence` as a "no progress" condition requiring retry or failure (`orchestrationRecovery.ts:54-74`).

**No evidence found**: There is no explicit "final event missing" detector beyond the sequence gap check. Empty stream handling is implicit in the fold-to-string pattern rather than being a first-class concept.

### 6. What metadata is preserved for debugging, cost estimation, and later synthesis?

**Debugging metadata**:
- `WsConnectionStatus` (`apps/web/src/rpc/wsConnectionState.ts:15-32`): `lastError`, `lastErrorAt`, `closeCode`, `closeReason`, `reconnectAttemptCount`, `nextRetryAt`, `connectionLabel`.
- `ReplayRetryTracker` (`orchestrationRecovery.ts:25-29`): `attempts`, `latestSequence`, `highestObservedSequence`.
- `SshReadinessError.cause` includes `{ kind: "probe-timeout", attempt, probeTimeoutMs }` (`packages/ssh/src/tunnel.ts:919-922`).
- `CodexAppServerRequestError` preserves `code`, `errorMessage`, and optional `data` (`packages/effect-codex-app-server/src/errors.ts:61-87`).

**Cost estimation**:
- `ThreadTokenUsageSnapshot` (`packages/contracts/src/providerRuntime.ts:306-323`): `usedTokens`, `inputTokens`, `cachedInputTokens`, `outputTokens`, `reasoningOutputTokens`, `toolUses`, `durationMs`, `totalCostUsd`.
- `TurnCompletedPayload` includes `usage`, `modelUsage: unknown`, and `totalCostUsd: number` (`packages/contracts/src/providerRuntime.ts:361-369`).

**Later synthesis**:
- `ProviderRuntimeEventBase` includes `eventId`, `createdAt`, `raw?: RuntimeEventRaw` for preserving the unmodified upstream payload (`packages/contracts/src/providerRuntime.ts:247-261`).
- `SessionExitedPayload.reason?: string` and `detail?: unknown` for exit context.
- `OrchestrationRecoveryState` tracks `latestSequence` and `highestObservedSequence` for replay coordination.

## Architectural Decisions

1. **Effect/Schema as the validation backbone**: Every provider event, session state transition, and JSON payload is validated through Effect's Schema system at decode time. This is a strong choice — typed schema validation with parse error path information is far better than `JSON.parse` + ad hoc checks. However, some fields like `AccountRateLimitsUpdatedPayload.rateLimits` are `Schema.Unknown`, which breaks this chain.

2. **Two-tier resilience**: WS transport reconnection (exponential backoff, 7 retries, 64s cap) is separate from orchestration event recovery (snapshot + replay with retry budget). These are independent systems with different concerns — transport vs. application state.

3. **Orchestration recovery as explicit state machine**: `OrchestrationRecoveryCoordinator` maintains `latestSequence`, `highestObservedSequence`, `bootstrapped`, `pendingReplay`, `inFlight` as first-class state. This allows callers to understand exactly where in the recovery lifecycle they are and make informed decisions about retry/fail.

4. **Typed error taxonomy via TaggedErrorClass**: All application errors extend `Schema.TaggedErrorClass` which gives Effect's Cause machinery the ability to discriminate error tags at runtime. Error classes in `RuntimeErrorClass` (`provider_error`, `transport_error`, `permission_error`, `validation_error`, `unknown`) provide a coarse taxonomy.

5. **No policy composability abstraction**: Retry, fallback, and validation are implemented as separate Effect chains and not composed through a common interface. This makes it difficult to, e.g., swap out the retry policy or add a fallback without modifying multiple call sites.

## Notable Patterns

- **Exponential backoff with jitter ceiling**: `getWsReconnectDelayMsForRetry(retryIndex) = min(1000 * 2^retryIndex, 64000)` — classic exponential backoff capped at 64s.
- **Coalescing keyed worker with retry**: `KeyedCoalescingWorker` uses `Effect.txRetry` when trying to drain a key that is still active — handles thundering herd via coalescing with retry.
- **Snapshot-then-replay bootstrap**: Orchestration recovery requires a snapshot event before allowing replay, preventing partial-state issues.
- **Schema-driven JSON validation**: `Schema.decodeEffect(Schema.fromJsonString(...))` is the pervasive pattern for all external JSON input.
- **Error message normalization with fallback**: `normalizeSshErrorMessage(stderr, fallbackMessage)` tries to extract a meaningful message from stderr before using a fallback.
- **Version mismatch hints**: WS connection errors can carry `versionMismatchHint` metadata that is appended to the error message for better debugging (`wsConnectionState.ts:134-141`).

## Tradeoffs

1. **Strong validation at cost of flexibility**: Schema-validated events with exact union types mean any protocol change requires updating the schema union. This is safer but less flexible for rapid iteration.

2. **Rate limit handling is reactive not proactive**: No automatic retry/backoff triggered by `account.rate-limits.updated` events. The UI must handle display, but no automatic request throttling was found.

3. **`Schema.Unknown` for rate limit payload**: `AccountRateLimitsUpdatedPayload.rateLimits` is `Schema.Unknown` rather than a structured schema, defeating the validation guarantee for a critical field.

4. **`recoverable` flag is optional**: `SessionExitedPayload.recoverable?: boolean` — callers must handle the absent case conservatively. No default inferred from `exitKind`.

5. **No explicit retry budget across the whole system**: WS reconnect has its own per-attempt count; replay retry has `maxNoProgressRetries`; SSH probe has total timeout. These are independent budgets with no unified reporting to callers.

## Failure Modes / Edge Cases

- **Exhausted WS reconnect**: After 7 retries, `reconnectPhase` becomes `"exhausted"` and `nextRetryAt` becomes `null`. The connection enters a terminal error state requiring manual intervention or page reload.
- **Replay with no progress**: When `deriveReplayRetryDecision` returns `shouldRetry: false` (exhausted `maxNoProgressRetries`), the recovery fails and the system calls `failReplayRecovery()` which sets `bootstrapped: false`, requiring a full snapshot recovery restart.
- **SSH tunnel probe timeout**: If the backend never becomes ready within `timeoutMs`, `waitForHttpReady` returns `Option.none` and the error includes the last probe failure with attempt count.
- **Malformed JSON in protocol**: `CodexAppServerProtocolParseError` is thrown with `detail` and optional `cause`, propagating to callers via Effect's error channel.
- **Empty stream from text generation**: If `runClaudeJson` receives an empty response, `Stream.runFold` produces `""` which is then decoded — the `ClaudeOutputEnvelope` schema requires `structured_output: Unknown`, so an empty response would fail at decode time with a typed `Schemaerror`.
- **Version mismatch**: If WS connection detects a version mismatch, `versionMismatchHint` is appended to `lastError` to aid debugging (`wsConnectionState.ts:134-141, 150-151`).

## Future Considerations

1. **Structured rate limit payload**: Replace `Schema.Unknown` in `AccountRateLimitsUpdatedPayload` with a concrete schema so callers can programmatically inspect remaining quota vs. used quota.

2. **First-class resilience policy abstraction**: Introduce a `ResiliencePolicy` type composable as `retry(policy) + fallback(target) + validate(schema) + repair(recoveryFn)`. This would centralize the retry/backoff/budget logic currently scattered across multiple call sites.

3. **Default `recoverable` inference**: Make `SessionExitedPayload.recoverable` non-optional by inferring it from `exitKind` (e.g., `error` implies `recoverable: false` unless explicitly set).

4. **Unified retry budget tracking**: Report total retry budget consumption (WS reconnect + replay + provider calls) to callers via a single `RetriesRemaining` type rather than independent counters.

5. **Repair extensibility**: The `OrchestrationRecoveryCoordinator` is currently specific to event sequence recovery. Extending it to support repair strategies (e.g., "replay failed, then fall back to snapshot, then fail") would benefit from a policy-based approach.

## Questions / Gaps

1. **No evidence found** for automatic retry triggered by `account.rate-limits.updated` events. The rate limit event propagates to the UI but no automatic throttling or retry with backoff was identified.
2. **No evidence found** for a `CircuitBreaker` pattern. Retry is unbounded by default in Effect's `Schedule` unless explicitly composed with `Schedule.recurs`.
3. **No evidence found** for checkpointing or durable partial progress beyond the in-memory `OrchestrationRecoveryState`. A crashed process would lose recovery state entirely — there is no persisted checkpoint.
4. **`SessionExitedPayload.recoverable` is optional** — callers cannot safely default it and must handle `undefined`.
5. **No evidence found** for a structured way to express "retry N times with exponential backoff, then fallback to X, then fail" as a single policy object. The composition is implicit via Effect's `.pipe()` chain.
6. **SSH tunnel's `waitForHttpReady` probe does not distinguish between "connection refused" (definitely retry) vs. "403 Forbidden" (may not retry)** — all probe failures are wrapped in `SshReadinessError` and trigger retry.

---

Generated by `study-areas/03-resilience-fallback-and-validation.md` against `t3code`.