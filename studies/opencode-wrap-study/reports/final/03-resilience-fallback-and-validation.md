# Resilience, Fallback, and Validation - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Protocol | `03-resilience-fallback-and-validation.md` |
| Groups | go-plugin, opencode, sdk-go, t3code |
| Date | 2026-05-17 |

## Repositories Studied

| # | Repo | Path | Group |
|---|------|------|-------|
| 1 | go-plugin | `/home/antonioborgerees/coding/opencode-wrap-study/repos/go-plugin` | go-plugin |
| 2 | opencode | `/home/antonioborgerees/coding/opencode-wrap-study/repos/opencode` | opencode |
| 3 | sdk-go | `/home/antonioborgerees/coding/opencode-wrap-study/repos/sdk-go` | sdk-go |
| 4 | t3code | `/home/antonioborgerees/coding/opencode-wrap-study/repos/t3code` | t3code |

## Executive Summary

All four repos implement some form of typed error handling and bounded retry with backoff, but they span a wide spectrum of policy composability and preflight validation strength. The two TypeScript/Effect repos (opencode, t3code) share a common Effect-based error taxonomy and retry machinery; the two Go repos (go-plugin, sdk-go) share a Go-idiomatic typed error hierarchy with server-side retry ownership. No repo implements a first-class composable policy abstraction that lets callers say "retry with exponential backoff, then fallback to X, then validate, then repair" as a single object. Policy composition is either absent (go-plugin), implicit via Effect pipes (opencode, t3code), or delegated to server-side configuration (sdk-go). All repos lack circuit breakers.

## Core Thesis

Resilience in these four repos is shaped by two primary forces: (1) **where the retry loop runs** — client-side vs. server-side vs. runtime-transport — and (2) **whether the domain is library-like or application-like**. go-plugin and sdk-go are libraries that hand control to the caller or server; opencode and t3code are applications that own the full retry lifecycle and expose it to end users. This distinction explains why opencode and t3code invest in typed error discrimination and actionable UI recovery, while go-plugin and sdk-go invest in RPC-safe error transport and server-compatible retry policies. The absence of a unified policy composability abstraction is the most significant gap across all four repos.

## Rating Summary

| Repo | Score | Approach | Main Strength | Main Concern |
|------|-------|----------|---------------|--------------|
| opencode | 7/10 | Effect-based typed error taxonomy + Effect.retry with exponential Schedule | Comprehensive error discrimination with actionable retry UI (free-tier upsell, Go-usage link) | No circuit breaker; SessionStatus not durable; no maximum retry limit |
| t3code | 7/10 | Effect/Schema validation backbone + two-tier resilience (WS transport + orchestration event recovery) | Schema-validated events and orchestration snapshot/replay recovery | Policy composability emergent only; `recoverable` flag optional; rate limit payload is `Schema.Unknown` |
| sdk-go | 7/10 | Server-owned RetryPolicy + client-side ExponentialRetryPolicy + ConcurrentRetrier throttling | Typed error hierarchy matching Temporal proto model; heartbeat batching | No preflight validation; no circuit breaker; no repair/resume API beyond server-side history |
| go-plugin | 6/10 | Typed errors via BasicError wrapper + graceful-then-force kill + protocol version fallback | RPC-safe error transport; gRPC health check integration; constant-time checksum validation | No retry loops; no backoff policy; hardcoded timeouts; no partial progress tracking |

## Approach Models

**opencode: Application-owned Effect Retry with Upsell Fallback**
opencode implements a client-side retry loop via Effect's `Schedule` + `Effect.retry`. Retryable errors are classified through a `retryable()` function that maps provider errors to typed `action` objects containing UI-facing upsell links. Context overflow triggers compaction (not retry). Rate limits are detected via header parsing and plain-text pattern matching. Structured output is enforced by injecting a `StructuredOutput` tool; missing output raises `StructuredOutputError`. This is the most user-facing model — the caller always gets an actionable next step.

**t3code: Two-Tier Effect/Schema Validation with Snapshot-Replay**
t3code separates WS transport resilience (exponential backoff, 7 retries, 64s cap) from orchestration event recovery (snapshot-then-replay bootstrap). All provider runtime events are schema-validated at decode time via Effect's Schema system. Errors are typed via `TaggedErrorClass` with a coarse `RuntimeErrorClass` taxonomy. Rate limits propagate as typed events but trigger no automatic retry. Model selection includes a fallback to `defaultInstanceIdForDriver`. The two-tier model is well-suited to apps with both transport instability and complex session state.

**sdk-go: Server-Owned Retry Policy with Client-Side Backoff Utilities**
sdk-go delegates retry scheduling to the Temporal server via `RetryPolicy` embedded in activity options. The SDK provides `ExponentialRetryPolicy` and `ConcurrentRetrier` for client-side throttling and backoff, but the retry loop itself runs server-side. Error typing is rich (`ApplicationError`, `TimeoutError`, `CanceledError`, `PanicError`, `NexusOperationError`) matching Temporal's proto failure model. Heartbeat batching reduces RPC load during long activities. No circuit breaker; no preflight validation.

**go-plugin: Library-Style RPC Transport with Minimal Retry**
go-plugin is a plugin host library, not an application. Its resilience model is centered on handshake negotiation, checksum validation, graceful-then-force kill, and gRPC health checks. Retry is limited to bounded timeouts (5s hardcoded) with no automatic retry loops. Protocol version fallback enables backward compatibility with older plugins. Stdio service degradation is graceful. Error typing exists via `BasicError` and named error variables, but retryability classification is absent — the caller decides.

## Pattern Catalog

**Pattern 1: Typed Error Hierarchy with Retryability Classification**
- Problem: Callers cannot programmatically determine whether an error is transient, retryable, or unrecoverable.
- Repos: opencode (via `retryable()` mapping), sdk-go (via `IsRetryable()` at `internal/error.go:1036-1073`), t3code (via `RuntimeErrorClass` taxonomy), go-plugin (named errors but no classification).
- Mechanism: Errors tagged with metadata (status code, retry flag, error type string) allowing handlers to switch on type.
- When to copy: Building any system where callers need to decide whether to retry without peeking at error message strings.
- When overkill: Library code where the caller owns retry decisions anyway.

**Pattern 2: Exponential Backoff with Server-Guided Cap**
- Problem: Blind exponential backoff can waste time if the server already knows when to retry.
- Repos: opencode (respects `retry-after` headers, caps at 30s without headers), t3code (caps at 64s), sdk-go (jitter in `ComputeNextDelay` at `internal/common/backoff/retrypolicy.go:141-147`).
- Mechanism: Start with initial delay, double each attempt, but honor server `retry-after` hint if present.
- When to copy: API client where the server provides rate limit headers or retry guidance.
- When overkill: Short-lived CLI tools or one-shot invocations.

**Pattern 3: Graceful Degradation for Optional Services**
- Problem: Old or minimal plugin versions may not implement all services the host expects.
- Repos: go-plugin (stdio fallback to no-op on `Unavailable/Unimplemented`), t3code (model fallback via instance selection).
- Mechanism: Catch specific error codes (e.g., `Unimplemented`) and provide a safe fallback that allows execution to continue.
- When to copy: Plugin hosts, multi-version APIs, or any system that must interoperate with varying client capabilities.
- When overkill: Systems where all capabilities are mandatory.

**Pattern 4: Schema-Driven Event Validation**
- Problem: Ad hoc JSON parsing hides field-level errors and provides no parse error location.
- Repos: t3code (pervasive `Schema.decodeEffect(Schema.fromJsonString(...))`), opencode (Effect Schema for error types and structured output).
- Mechanism: All external JSON is decoded through Effect's Schema system, producing typed errors with path information on failure.
- When to copy: Any system with structured protocol messages or provider event streams where validation failures should be debuggable.
- When overkill: Simple one-field JSON payloads where `JSON.parse` + field checks suffice.

**Pattern 5: Context Overflow Triggers Compaction (Not Retry)**
- Problem: Retrying a context-overflowed prompt wastes tokens and cannot succeed.
- Repos: opencode (sets `needsCompaction = true` at `packages/opencode/src/session/processor.ts:695-698`, triggers `compaction.create()` before next turn).
- Mechanism: Detect overflow, prune and summarize history to create room, then continue with compacted context.
- When to copy: LLM sessions with bounded context windows where overflow is recoverable via summarization.
- When overkill: Systems where overflow is fatal (no summarization capability) or where retry would succeed.

**Pattern 6: Snapshot-then-Replay Bootstrap for Session Recovery**
- Problem: After transport interruption, the session may have events that were not fully persisted.
- Repos: t3code (requires snapshot event before allowing replay at `apps/web/src/orchestrationRecovery.ts:88-211`).
- Mechanism: On reconnect, request a full snapshot first; then replay events since snapshot; detect sequence gaps as missing events.
- When to copy: Stateful streaming systems where incomplete events must not be applied.
- When overkill: Stateless request/response systems.

**Pattern 7: Actionable Retry UI via Typed Action Objects**
- Problem: Generic "retry in X seconds" messages leave users without a path forward.
- Repos: opencode (`retryable()` returns `{ reason, provider, title, message, label, link }` at `packages/opencode/src/session/retry.ts:76-119`, rendered as upsell).
- Mechanism: Error classification maps specific error types to user-facing actions with links (subscribe, workspace settings, etc.).
- When to copy: Consumer-facing LLM applications where quota limits require subscription upgrades.
- When overkill: Backend library code or internal services without UI.

## Key Differences

**Policy composability: opencode/t3code vs. go-plugin/sdk-go**
opencode and t3code compose retry policies via Effect's `.pipe()` chain, while go-plugin provides no composition and sdk-go delegates to server-side `RetryPolicy`. This means opencode and t3code can express richer "retry + fallback + validate" sequences at the cost of coupling to Effect.

**Where the retry loop runs**
sdk-go runs the retry loop server-side (Temporal server owns scheduling). go-plugin has no retry loop. opencode and t3code run client-side loops via Effect. The server-side model (sdk-go) simplifies client code but limits observability and custom policy at the SDK level. The client-side models (opencode, t3code) offer more control but require more retry infrastructure.

**Validation strength**
t3code has the strongest validation posture: every provider runtime event is schema-validated via Effect Schema. opencode validates structured output and MCP tool schemas. sdk-go has minimal validation (encoding chain only). go-plugin parses JSON logs but does not validate plugin protocol messages against a schema.

**Preflight validation**
All four repos fail to validate provider connectivity or credentials before spending runtime work. opencode checks `opencode.json` exists and is parseable. sdk-go sets defaults in `ensureRequiredParams()` but does not verify reachability. t3code and go-plugin also lack preflight connectivity checks.

**Durability of retry state**
opencode's `SessionStatus` is in-memory only and lost on process restart. t3code's `OrchestrationRecoveryState` is also in-memory and lost on crash. sdk-go relies on Temporal server for durable history. go-plugin has no durable retry state. No repo implements checkpoint/resume for failed runs.

## Tradeoffs

| Decision | Benefit | Cost | Seen In |
|----------|---------|------|---------|
| Server-owned retry loop | Simple client; retry state survives client restarts | Cannot customize retry behavior from SDK; limited observability | sdk-go |
| Client-owned retry loop | Full control; rich action metadata | Client must implement all retry infrastructure; state lost on restart | opencode, t3code |
| Effect Schema validation | Parse errors with path info; exhaustive union types | Schema changes require recompilation; `Schema.Unknown` defeats the guarantee | t3code, opencode |
| Bounded retry with max attempts | Prevents infinite retry loops | May fail when server-side fix is quick; requires caller to handle exhausted state | t3code (7 retries), sdk-go (`MaximumAttempts`) |
| Exponential backoff without cap | Simple formula | Can result in very long waits; may conflict with server guidance | go-plugin (unbounded wait) |
| Upsell-as-fallback | Actionable path forward for quota limits | Requires UI integration; not applicable to headless/library use cases | opencode |
| Snapshot-replay recovery | Recovers from partial event state | Requires snapshot capability from server; adds startup latency | t3code |
| gRPC health check integration | Standard liveness probe | Requires plugin to implement health service; adds complexity | go-plugin |

## Decision Guide

**Question: Does your system need composable retry/fallback/validate/repair policy chains?**
Yes → None of the four repos provide a first-class abstraction. opencode comes closest via Effect `.pipe()`, but the concerns are co-located in `retry.ts` and `processor.ts`, not a reusable policy type. Consider designing a `ResiliencePolicy` interface that can be composed and passed as a single parameter.

**Question: Is your system a library/host or an application?**
Library/host → Follow go-plugin and sdk-go models: invest in typed error transport, graceful exit, and server-compatible retry configuration. Do not assume retry loops run client-side.
Application → Follow opencode and t3code models: invest in typed error taxonomy, actionable UI recovery, schema validation, and context overflow compaction.

**Question: Do you need preflight connectivity validation?**
None of the four repos do it well. opencode checks config file existence. sdk-go sets defaults. For production systems, add a startup probe that validates API key validity, network reachability, and provider availability before the first billable request.

**Question: Do you need circuit breaker protection?**
No repo has one. If you need it, implement it as a per-provider consecutive failure counter that trips after N failures, preventing retry storms against a degraded provider. `ConcurrentRetrier` in sdk-go is the closest model but it resets on success rather than tripping open.

## Practical Tips

1. **Use typed errors with explicit retryability metadata.** The `retryable()` pattern in opencode (`packages/opencode/src/session/retry.ts:67-151`) and `IsRetryable()` in sdk-go (`internal/error.go:1036-1073`) show that error types should carry their own retry guidance rather than relying on callers to inspect error messages.

2. **Honor server-provided retry hints.** Both opencode and sdk-go check for `retry-after` headers or server-requested delays. Blind exponential backoff wastes time when the server already knows the correct wait interval.

3. **Expose retry state to callers.** opencode's `SessionStatus` with `{ type: "retry", attempt, message, action, next }` (`packages/opencode/src/session/status.ts:12-27`) and t3code's `WsConnectionStatus` with `reconnectAttemptCount`, `nextRetryAt` (`apps/web/src/rpc/wsConnectionState.ts:15-32`) let callers render meaningful UI rather than just logging.

4. **Distinguish context overflow (retry is futile) from rate limit (retry may succeed).** opencode's `ContextOverflowError` never retries, while `RateLimitReason` always retries. These are different failure modes requiring different handling.

5. **Schema-validate all external JSON at decode time.** t3code's pervasive `Schema.decodeEffect(Schema.fromJsonString(...))` pattern (`packages/shared/src/schemaJson.ts:14-27`) produces better errors than `JSON.parse` + ad hoc checks.

6. **Use jitter to prevent thundering herd.** sdk-go's `ComputeNextDelay` applies randomization (`internal/common/backoff/retrypolicy.go:141-147`). This matters when many clients retry simultaneously.

7. **Track partial progress explicitly.** t3code's `FilesPersistedPayload` with `files` and `failed` arrays (`packages/contracts/src/providerRuntime.ts:574-590`) and opencode's `CompactionPart` with `auto`, `overflow?`, `tail_start_id?` (`packages/opencode/src/session/message-v2.ts:184-191`) allow callers to understand what succeeded and what failed.

## Anti-Patterns / Caution Signs

- **Hardcoded timeout constants scattered across files.** go-plugin's 5-second timeouts at `mux_broker.go:61`, `grpc_broker.go:495`, `client.go:559` are not configurable. Prefer a central config object or environment variables.

- **`Schema.Unknown` for critical fields.** t3code's `AccountRateLimitsUpdatedPayload.rateLimits` is `Schema.Unknown` (`packages/contracts/src/providerRuntime.ts:536-539`), defeating the validation guarantee for rate limit data. Use a concrete schema.

- **`recoverable` flag left optional.** t3code's `SessionExitedPayload.recoverable?: boolean` requires callers to handle `undefined` conservatively. Infer a default from `exitKind`.

- **No maximum retry limit.** opencode's `Effect.retry` with `Schedule` has no `until` condition for max attempts — it retries indefinitely until `retryable()` returns `undefined`. A sustained outage could result in infinite retry.

- **Retry state not durable.** opencode's `SessionStatus` and t3code's `OrchestrationRecoveryState` are in-memory. Process restart loses retry progress. Persist retry metadata to durable storage if restart resilience is required.

- **`ConcurrentRetrier` resets on success, not trip-open.** sdk-go's throttling (`internal/common/backoff/retry.go:22-112`) does not fail-fast after repeated failures — it just applies backoff. A circuit breaker should trip and stay open.

- **Context cancellation not checked in retry loop.** sdk-go's `Retry()` checks `ctx.Done()` (`internal/common/backoff/retry.go:146-153`), but opencode's retry loop does not appear to have an explicit context cancellation check in the `Effect.retry` chain.

## Notable Absences

- **Circuit breaker pattern.** No repo implements a per-provider or per-endpoint circuit breaker that trips and stays open for a configured duration. All repos use retry with backoff as the sole resilience mechanism.

- **Durable checkpoint/resume for failed runs.** opencode saves session state to SQLite but has no mechanism to resume from the last successful step after a crash. sdk-go relies on Temporal server for history; t3code has in-memory recovery state only.

- **Automatic rate limit handling beyond retry.** t3code propagates rate limit events to UI but does not automatically throttle or retry. opencode retries with backoff but does not throttle new requests.

- **Composable policy abstraction.** No repo provides a `RetryPolicy | FallbackPolicy | ValidationPolicy` type that can be composed, configured, and passed as a single parameter. Composition is implicit via Effect `.pipe()` chains or delegated to server configuration.

- **Structured rate limit payload.** t3code's `AccountRateLimitsUpdatedPayload.rateLimits` is `Schema.Unknown`, making programmatic quota management impossible without out-of-band knowledge.

## Per-Repo Notes

**go-plugin** (score: 6/10)
go-plugin's resilience story is appropriate for a library whose callers own retry policy. Its strengths are in error transport (RPC-safe `BasicError`), graceful plugin exit, and health check integration. Its gaps (no retry loops, hardcoded timeouts, no partial progress tracking) are reasonable for a library but would be problematic in an application. The most copy-worthy pattern is the graceful-then-force kill (`client.go:554-567`) for scenarios where plugins need cleanup time before force termination.

**opencode** (score: 7/10)
opencode has the most sophisticated error taxonomy and user-facing retry UI. Its `retryable()` function that maps errors to upsell actions is a strong pattern for consumer applications. The main gaps are no circuit breaker, in-memory retry state, and unbounded retry count. The context overflow → compaction pattern (`packages/opencode/src/session/processor.ts:695-698`) is particularly worth studying for LLM session management.

**sdk-go** (score: 7/10)
sdk-go benefits from Temporal's server-side retry model, which provides durability and centralized state. The typed error hierarchy matching Temporal proto failures is strong. Client-side throttling via `ConcurrentRetrier` and heartbeat batching are production-proven patterns. The main gaps are no circuit breaker and no repair/resume API. The `ComputeNextDelay` jitter implementation is the most rigorous backoff implementation across the four repos.

**t3code** (score: 7/10)
t3code has the strongest validation posture and the most sophisticated session recovery model (snapshot-then-replay). Schema-validated events throughout the provider runtime contract are a model to emulate. The two-tier resilience (WS transport + orchestration recovery) cleanly separates concerns. The main gaps are optional `recoverable` flag, `Schema.Unknown` for rate limits, and lack of composable policy abstraction. The `OrchestrationRecoveryCoordinator` is the most explicit session recovery state machine in the study.

## Open Questions

1. **How would a first-class `ResiliencePolicy` interface be designed?** All four repos show that composing retry, fallback, validation, and repair is desirable, but none provide a reusable abstraction for it. The closest is opencode's `SessionRetry.policy()` function returning a `Schedule`, which could be extracted into a shared interface.

2. **Should circuit breaking be server-side or client-side?** sdk-go's server-owned retry model suggests circuit breaking belongs server-side. opencode and t3code's client-side retry models suggest circuit breaking belongs in the client. Which is correct depends on whether multiple clients share the same server endpoint.

3. **How should rate limit metadata be structured for programmatic use?** t3code's `Schema.Unknown` for rate limit data, combined with opencode's structured `RateLimitReason` schema, suggests there is no standard shape for rate limit metadata across providers. Should a common `RateLimitInfo` schema be proposed?

4. **When should context overflow trigger compaction vs. fail-fast?** opencode always compacts; go-plugin has no concept of context. For agents with very large context windows (1M+ tokens), compaction may be unnecessary. The boundary conditions for when compaction is worth its cost are unclear.

5. **How should session recovery state be made durable?** opencode saves session messages to SQLite but loses retry state on restart. t3code's `OrchestrationRecoveryState` is entirely in-memory. Is a hybrid model (durable event log + in-memory recovery state) the right approach?

## Evidence Index

- `go-plugin/client.go:1028-1053` — Protocol version check
- `go-plugin/client.go:334-357` — SecureConfig checksum validation
- `go-plugin/client.go:554-567` — Graceful-then-force kill
- `go-plugin/client.go:825-831` — Plugin start timeout
- `go-plugin/grpc_stdio.go:109-112` — Stdio fallback to no-op
- `go-plugin/error.go:10-27` — BasicError RPC-safe wrapper
- `go-plugin/server.go:249-256` — Magic cookie validation
- `opencode/packages/opencode/src/session/retry.ts:25-28` — Retry constants
- `opencode/packages/opencode/src/session/retry.ts:67-151` — Retryable classification
- `opencode/packages/opencode/src/session/retry.ts:175-198` — Effect Schedule retry policy
- `opencode/packages/opencode/src/session/processor.ts:695-698` — Context overflow compaction trigger
- `opencode/packages/opencode/src/session/processor.ts:738-745` — Stream interruption handling
- `opencode/packages/opencode/src/session/status.ts:12-27` — SessionStatus retry state
- `opencode/packages/opencode/src/session/message-v2.ts:42-45` — StructuredOutputError
- `opencode/packages/opencode/src/session/prompt.ts:1834-1849` — Structured output validation
- `sdk-go/internal/error.go:1036-1073` — IsRetryable classification
- `sdk-go/internal/client.go:1080-1104` — RetryPolicy struct
- `sdk-go/internal/common/backoff/retrypolicy.go:36-160` — ExponentialRetryPolicy
- `sdk-go/internal/common/backoff/retry.go:22-112` — ConcurrentRetrier throttling
- `sdk-go/internal/common/backoff/retry.go:115-159` — Retry function
- `sdk-go/internal/error.go:706-707` — NextRetryDelay override
- `t3code/apps/web/src/rpc/wsConnectionState.ts:9-12` — WS reconnect constants
- `t3code/apps/web/src/rpc/wsConnectionState.ts:203-212` — Reconnect delay formula
- `t3code/apps/web/src/orchestrationRecovery.ts:88-211` — Recovery coordinator
- `t3code/apps/web/src/orchestrationRecovery.ts:39-86` — Replay retry decision
- `t3code/apps/web/src/orchestrationRecovery.ts:124-138` — Event classification
- `t3code/packages/contracts/src/providerRuntime.ts:95-102` — RuntimeErrorClass taxonomy
- `t3code/packages/contracts/src/providerRuntime.ts:282-287` — SessionExitedPayload
- `t3code/packages/contracts/src/providerRuntime.ts:951-999` — ProviderRuntimeEventV2 union
- `t3code/packages/shared/src/schemaJson.ts:14-27` — Schema JSON decoding
- `t3code/packages/ssh/src/tunnel.ts:870-969` — SSH readiness probe with retry

---

Generated by protocol `03-resilience-fallback-and-validation.md`.