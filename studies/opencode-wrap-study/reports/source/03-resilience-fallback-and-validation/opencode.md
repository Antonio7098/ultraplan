# Repo Analysis: opencode

## Resilience, Fallback, and Validation

### Repo Info

| Field | Value |
|-------|-------|
| Name | opencode |
| Path | `/home/antonioborgerees/coding/opencode-wrap-study/repos/opencode` |
| Group | `opencode` |
| Language / Stack | TypeScript (Bun), Effect |
| Analyzed | 2026-05-17 |

## Summary

Opencode implements a multi-layered resilience system centered on typed error classification, configurable retry/backoff with explicit user-facing actions, structured output validation, session compaction for context overflow, and durable SQLite-based session state. The core retry machinery lives in `packages/opencode/src/session/retry.ts` and is woven into the session processor pipeline via Effect's `retry` combinator and a `Schedule` policy. Error types are first-class named errors with schemas, enabling discrimination and structured metadata (headers, body, status codes). Rate limit handling is explicit and multi-format (OpenAI, Anthropic, and plain-text patterns). Health checks exist at the HTTP API layer but preflight validation is limited to config file presence rather than runtime connectivity checks.

## Rating

**7/10** — Typed errors, bounded retry/backoff with exponential cap, structured output validation, and session compaction for overflow. Actionable retry UI with per-reason upsells (free tier vs. account limit). Gap: no circuit-breaker, limited preflight checks, no durable checkpoint resume across process restarts.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Retry backoff policy | `RETRY_INITIAL_DELAY = 2000`, `RETRY_BACKOFF_FACTOR = 2`, `RETRY_MAX_DELAY = 2_147_483_647`, `RETRY_MAX_DELAY_NO_HEADERS = 30_000` | `packages/opencode/src/session/retry.ts:25-28` |
| Retry delay from headers | `retry-after-ms`, `retry-after` (seconds), `retry-after` (HTTP date) parsing | `packages/opencode/src/session/retry.ts:34-65` |
| Retryable classification | 5xx always retried; context overflow never retried; specific error types mapped (rate limit, free tier, Go usage) | `packages/opencode/src/session/retry.ts:67-151` |
| Retry policy via Effect Schedule | `Schedule.fromStepWithMetadata` + `Effect.retry` in processor | `packages/opencode/src/session/retry.ts:175-198`, `packages/opencode/src/session/processor.ts:750-758` |
| Retry status tracking | SessionStatus with `{ type: "retry", attempt, message, action, next }` | `packages/opencode/src/session/status.ts:12-27` |
| Rate limit detection | HTTP header parsing (OpenAI `x-ratelimit-*`, Anthropic `anthropic-ratelimit-*`) + plain-text pattern matching | `packages/opencode/src/llm/src/route/executor.ts:111-131`, `packages/opencode/src/session/retry.ts:124-149` |
| Rate limit typed error | `RateLimitReason` with `retryAfterMs`, `limit`, `remaining`, `reset` | `packages/opencode/src/llm/src/schema/errors.ts:70-81` |
| Structured output error | `StructuredOutputError` with `message` and `retries` | `packages/opencode/src/session/message-v2.ts:42-45` |
| Structured output validation | Tool result decoded; missing structured output on finish triggers `StructuredOutputError` | `packages/opencode/src/session/prompt.ts:1834-1849` |
| Context overflow handling | `ContextOverflowError` never retried; triggers compaction | `packages/opencode/src/session/retry.ts:68-69`, `packages/opencode/src/session/processor.ts:695-698` |
| Session compaction | CompactionPart stored in DB; summary regenerated; tail preserved | `packages/opencode/src/session/compaction.ts:35-77`, `packages/opencode/src/session/message-v2.ts:184-191` |
| Session status idle/retry/busy | Three-state enum with `next: NonNegativeInt` for scheduled retry | `packages/opencode/src/session/status.ts:8-32` |
| Health check endpoint | `GET /global/health` returns `{ healthy: true, version }` | `packages/opencode/src/server/routes/instance/httpapi/groups/global.ts:47-53` |
| APIError typed schema | `message`, `statusCode`, `isRetryable`, `responseHeaders`, `responseBody`, `metadata` | `packages/opencode/src/session/message-v2.ts:46-54` |
| LLM error taxonomy | `InvalidRequest`, `NoRoute`, `Authentication`, `RateLimit`, `QuotaExceeded`, `ContentPolicy`, `ProviderInternal`, `Transport`, `InvalidProviderOutput`, `UnknownProvider` | `packages/opencode/src/llm/src/schema/errors.ts:31-168` |
| MCP tool output validation retry | Schema validation failure triggers retry without output schema | `packages/opencode/src/mcp/index.ts:131-149` |
| Go usage limit upsell | `GoUsageLimitError` parsed with workspace/limit metadata, produces actionable link | `packages/opencode/src/session/retry.ts:88-119` |

## Answers to Protocol Questions

### 1. Which failures are considered unrecoverable, transient, retryable, or fallbackable?

- **Unrecoverable (never retried):** `ContextOverflowError` — explicit check at `packages/opencode/src/session/retry.ts:69` because retrying a context-overflowed prompt wastes tokens and cannot succeed.
- **Transient (5xx):** Any HTTP status ≥ 500 is retried regardless of the provider's `isRetryable` flag (`packages/opencode/src/session/retry.ts:72-74`).
- **Retryable (provider-marked):** When `error.data.isRetryable === true` and status is not a known unrecoverable 4xx.
- **Rate-limitable:** Detected via headers (`retry-after-ms`, `retry-after`), plain-text patterns ("rate limit", "too many requests", "rate increased too quickly"), or JSON `error.code` containing `rate_limit` (`packages/opencode/src/session/retry.ts:124-149`).
- **Fallbackable:** Free tier limit (`FreeUsageLimitError`) and Go subscription limit (`GoUsageLimitError`) surface upsell actions rather than generic retry — the user is offered a path to continue via subscription.
- **Fallback for MCP:** MCP tool output schema validation failures are retried without the output schema (`packages/opencode/src/mcp/index.ts:131-149`).

### 2. How are retries configured, bounded, and reported to callers?

Configuration constants in `packages/opencode/src/session/retry.ts:25-28`:
- `RETRY_INITIAL_DELAY = 2000` ms
- `RETRY_BACKOFF_FACTOR = 2`
- `RETRY_MAX_DELAY_NO_HEADERS = 30_000` ms (caps delay when no server hint available)
- `RETRY_MAX_DELAY = 2_147_483_647` ms (32-bit signed max for `setTimeout`)

Bounded via exponential backoff capped at `RETRY_MAX_DELAY` for server-provided headers, or `RETRY_MAX_DELAY_NO_HEADERS` for no-header cases. There is no fixed retry count limit in the policy itself — it uses `Effect.retry` with a `Schedule` that only terminates when `retryable()` returns `undefined`.

Reporting to callers: `SessionStatus` stores `{ type: "retry", attempt, message, action, next }` and publishes a `BusEvent` (`packages/opencode/src/session/status.ts:12-27`). The UI surfaces `action.reason`, `action.link`, and countdown via i18n keys (e.g., `ui.sessionTurn.retry.inSeconds` in `packages/opencode/packages/ui/src/i18n/en.ts:49-51`).

### 3. How would the system express compositions like retry, fallback, retry, validate, repair?

The composition is expressed as a chain of concerns:

1. **Retry** via `Effect.retry(SessionRetry.policy(...))` in `packages/opencode/src/session/processor.ts:750-758`. The `SessionRetry.policy` function builds a `Schedule` that calls `retryable()` to decide continuation and `delay()` to compute the wait.

2. **Fallback** is not a separate combinator but encoded in the `retryable()` function: certain errors return an `{ message, action }` object where `action` is a user-facing upsell (free tier → subscribe; Go limit → workspace settings). This is not a fallback to an alternative provider — it is a fallback to a UI action.

3. **Validate** is handled at multiple points:
   - Structured output: `StructuredOutputError` is set when the model finishes without producing the required JSON schema (`packages/opencode/src/session/prompt.ts:1841-1849`).
   - MCP tool schemas: Validation failure on output triggers a retry without the schema (`packages/opencode/src/mcp/index.ts:133`).

4. **Repair** for context overflow: `ContextOverflowError` triggers `needsCompaction = true` in the processor (`packages/opencode/src/session/processor.ts:695-698`), which causes the session to run `compaction.create()` before the next turn (`packages/opencode/src/session/prompt.ts:1854-1861`). This is a repair attempt, not a retry.

There is no composable `retry + fallback + validate + repair` pipeline abstraction; the behaviors are co-located in `retry.ts` and `processor.ts`.

### 4. How are rate limits surfaced and handled?

Rate limits are surfaced in three ways:

1. **Structured**: `RateLimitReason` (from `packages/llm/src/schema/errors.ts:70-81`) with `retryAfterMs`, `limit`, `remaining`, `reset` fields. This flows through `LLMError` and is accessible to callers via the Effect error hierarchy.

2. **Header parsing**: `rateLimitDetails()` in `packages/opencode/src/llm/src/route/executor.ts:111-131` extracts OpenAI-style (`x-ratelimit-limit-*`, `x-ratelimit-remaining-*`, `x-ratelimit-reset-*`) and Anthropic-style (`anthropic-ratelimit-*-limit/remaining/reset`) headers.

3. **Plain-text fallback**: The `retryable()` function in `packages/opencode/src/session/retry.ts:124-149` matches plain-text messages containing "rate limit", "too many requests", or "rate increased too quickly" and returns a retryable result. This handles providers (e.g., Alibaba) that don't use structured error formats.

Handling: The retry policy respects `retry-after` headers (in ms, seconds, or HTTP date format) and falls back to exponential backoff. Rate limit errors never trigger compaction — they are always retryable.

### 5. How are malformed JSON events, missing final events, empty streams, or partial outputs detected?

- **Malformed JSON in error body**: `parseJSON()` in `packages/opencode/src/session/retry.ts:164-173` catches `JSON.parse` failures and returns `undefined`, causing `retryable()` to fall through. Similarly `ProviderError.parseAPICallError` and `ProviderError.parseStreamError` in `packages/opencode/src/provider/error.ts` handle malformed provider responses.

- **Missing final events / incomplete tool streaming**: The processor's `handleEvent` function (`packages/opencode/src/session/processor.ts`) processes `LLM.Event` stream events. Stream interruption (abort, disconnect) triggers the `onInterrupt` block which calls `halt()` and marks the assistant message with an error (`packages/opencode/src/session/processor.ts:738-745`). Incomplete tool calls leave `ToolPart` in `pending` or `running` state — the processor converts these to `output-error` with `"[Tool execution was interrupted]"` so the model sees a coherent error rather than a hanging call (`packages/opencode/src/session/message-v2.ts:846-857`).

- **Empty streams**: `stream()` in `packages/opencode/src/session/message-v2.ts:963-981` breaks when `next.items.length === 0` and the session exists. An empty message list for a valid session is a normal case, not an error.

- **Partial outputs**: Tool outputs are stored as `ToolStateCompleted` with full `input`, `output`, `title`, `metadata`, `time`, and `attachments`. If a tool result is partial (e.g., truncated for compaction), the `time.compacted` field is set and the output is replaced with `"[Old tool result content cleared]"` (`packages/opencode/src/session/message-v2.ts:790-791`).

- **Structured output**: If the model does not call the `StructuredOutput` tool when `format.type === "json_schema"`, the finish condition check at `packages/opencode/src/session/prompt.ts:1841-1849` sets `StructuredOutputError` and breaks the loop.

### 6. What metadata is preserved for debugging, cost estimation, and later synthesis?

- **Per-message metadata**: `AssistantMessage` stores `cost: Schema.Finite`, `tokens: { total?, input, output, reasoning, cache: { read, write } }`, and `finish` (`packages/opencode/src/session/message-v2.ts:473-486`). `StepFinishPart` records cost and token summary per step (`packages/opencode/src/session/message-v2.ts:229-246`).

- **Per-tool metadata**: `ToolStateCompleted` stores `title`, `metadata: Record<string, any>`, and `attachments: FilePart[]` (`packages/opencode/src/session/message-v2.ts:266-278`). `ToolStateError` stores error text and `metadata?.interrupted` flag (`packages/opencode/src/session/message-v2.ts:287-297`).

- **Per-retry metadata**: `RetryPart` stores `attempt`, `error: APIError`, and `time.created` (`packages/opencode/src/session/message-v2.ts:209-220`). This provides a full audit trail of retry attempts and the error at each attempt.

- **Session context**: `path: { cwd, root }` on every assistant message (`packages/opencode/src/session/message-v2.ts:468-471`) preserves working directory context.

- **Provider metadata**: `ProviderMetadata` from `packages/llm/src/schema/ids.ts` can be attached to `LLMError` and `RateLimitReason` for provider-specific debugging (e.g., OpenAI/ Anthropic rate limit headers).

- **Error context**: `APIError` stores `responseHeaders`, `responseBody`, and `metadata: Record<string, string>` (for codes like `ECONNRESET`, `ZlibError`) (`packages/opencode/src/session/message-v2.ts:46-53`). `AuthError` stores `providerID` for auth failures.

- **Compaction metadata**: `CompactionPart` stores `auto`, `overflow?`, and `tail_start_id?` to indicate which messages were compacted and why (`packages/opencode/src/session/message-v2.ts:184-191`). The summary regenerated after compaction preserves continuity.

## Architectural Decisions

1. **Effect-based retry scheduling** (`packages/opencode/src/session/retry.ts:175-198`): Retry policy is a `Schedule` composed with `Effect.retry`, integrating with Effect's error channel and allowing clean combination with other Effect combinators (interruption, catchCauseIf).

2. **Error type hierarchy via NamedError** (`packages/opencode/src/session/message-v2.ts:41-58`): Errors are schema-tagged unions (`APIError`, `ContextOverflowError`, `StructuredOutputError`, `AuthError`, etc.) rather than plain strings or codes, enabling exhaustive switch reasoning in error handlers.

3. **Retry reason → user action mapping** (`packages/opencode/src/session/retry.ts:76-119`): Rather than generic retry, `retryable()` returns an optional `action` containing `reason`, `provider`, `title`, `message`, `label`, and `link`. This allows the UI to render a specific upsell rather than a generic "retry in X seconds" message.

4. **Context overflow → compaction (not retry)** (`packages/opencode/src/session/processor.ts:695-698`): When context overflow occurs, the system does not retry — it triggers compaction which summarizes and prunes history to create room. Retry on overflow would be futile.

5. **Plain-text rate limit detection** (`packages/opencode/src/session/retry.ts:124-149`): Some providers (Alibaba) return plain-text error bodies rather than JSON. The `retryable()` function handles both JSON and plain-text patterns to avoid missed rate-limit cases.

6. **SessionStatus as ephemeral in-memory map** (`packages/opencode/src/session/status.ts:64-86`): Status is stored in `InstanceState` (a `ScopedCache` per directory), not persisted. On process restart, status is reset to `idle`. This means the retry countdown timer does not survive process restarts.

## Notable Patterns

1. **Exponential backoff with server-guided cap**: Delay starts at 2s and doubles each attempt, but server-provided `retry-after` headers take precedence and can override the exponential curve. Caps at 30s without headers, 2^31-1ms with headers.

2. **Effect Schedule retry policy**: `SessionRetry.policy()` returns a `Schedule` that carries metadata (`attempt`, `next`) used to update `SessionStatus`. The caller provides a `set` callback that writes the retry state, bridging the retry machinery and the status service.

3. **Schema-validated error bodies**: Provider error responses are parsed through `ProviderError.parseAPICallError` which extracts status code, retryability, headers, and body before constructing a typed `APIError` or `ContextOverflowError`.

4. **Tool call interruption → error result**: Incomplete tool calls (aborted, connection reset) are converted to `tool-error` tool results rather than being dropped, ensuring the model receives a consistent signal even when streaming is interrupted.

5. **Structured output as tool (not schema)**: When `format.type === "json_schema"`, a `StructuredOutput` tool is injected into the tool set. The model must call it to produce structured output. If the model finishes without calling it, `StructuredOutputError` is raised. This makes output validation a natural part of the tool-use flow rather than a post-hoc check.

## Tradeoffs

1. **Retry count is unbounded**: The `Schedule` retry has no maximum attempt count — it only stops when `retryable()` returns `undefined`. For rate-limited requests hitting a sustained outage, this could lead to indefinite retry with exponential backoff capped at 30s. No circuit-breaker pattern exists.

2. **SessionStatus is not durable**: Retry state (attempt number, next scheduled time) lives in memory via `InstanceState`. If the process restarts mid-retry, the state is lost. A user returning after a restart would see `idle` rather than a resumption of the retry countdown.

3. **Compaction as repair (not rollback)**: Context overflow triggers compaction, which summarizes and prunes. This is a forward repair (make room) rather than a true rollback (undo the overflow-causing operation). The compacted summary may lose detail.

4. **No fallback provider**: If a provider is unavailable (rate-limited or 5xx), the system retries that same provider rather than falling back to an alternative model or provider. The only "fallback" is the upsell action for quota limits.

5. **MCP schema validation fallback is all-or-nothing**: When MCP tool output schema validation fails, the system retries the tool call without any output schema. There is no partial validation or schema repair mechanism — just stripping the constraint entirely.

## Failure Modes / Edge Cases

1. **Retry loop on misconfigured rate limit**: If a provider returns `retry-after: 0` or a very small value repeatedly, the system will retry rapidly (2s, 4s, 8s...) but still hit the rate limit. Without a circuit breaker, this could amplify the problem.

2. **Compaction failure during overflow**: If compaction itself fails (e.g., LLM call fails during summarization), the session remains in an overflowed state and cannot make further progress. No secondary compaction fallback exists.

3. **Structured output tool not called**: If the model refuses or fails to call the `StructuredOutput` tool (e.g., model outputs plain text and finish="stop"), the session raises `StructuredOutputError` and stops. There is no repair attempt beyond the `retries: 0` field on the error.

4. **Partial tool output during compaction**: Tool outputs truncated for compaction are replaced with `"[Old tool result content cleared]"`. The original output is lost. For debugging or audit, only the summary remains.

5. **RetryStatus not synchronized across tabs**: `SessionStatus` is per-instance in-memory state. Multiple opencode instances (multiple terminal tabs) each have their own `InstanceState` — retry state set in one tab is not visible in another.

## Future Considerations

1. **Circuit breaker**: Add a per-provider failure count that trips after N consecutive failures, preventing retry storms against a degraded provider. Could use Effect's `Supervision` or a custom layer.

2. **Durable retry state**: Persist retry metadata (attempt, next scheduled time, reason) to SQLite so that a process restart resumes the retry rather than starting fresh.

3. **Fallback provider routing**: When a provider returns a persistent error (rate limit, quota exceeded), attempt the same request with an alternative model or provider before surfacing the upsell UI.

4. **Preflight health check**: Add a connectivity/credentials check at startup or first request to fail fast on misconfiguration (wrong API key, network unreachable) before spending time on a doomed request.

5. **Structured output retry with adjusted schema**: When `StructuredOutputError` is raised, a future iteration could shrink the schema or fall back to partial validation rather than stopping entirely.

## Questions / Gaps

1. **No maximum retry limit**: The `Effect.retry` has no `until` condition for max attempts. What happens after 100 consecutive rate limit errors? The backoff caps at 30s, so it becomes a 30s poll — but never gives up.

2. **No circuit breaker**: There's no per-provider consecutive failure counter that trips. A provider in a degraded state will receive full retry traffic from every session.

3. **Retry state not observable across restarts**: `SessionStatus` is in-memory only. A user who restarts opencode mid-retry sees `idle` and must manually retry.

4. **Preflight validation limited**: The system validates `opencode.json` exists and is parseable, but does not verify API keys, network reachability, or provider availability before the first LLM call.

5. **No checkpoint/resume for failed runs**: A session that fails (process killed, crash) leaves its messages in SQLite but has no mechanism to resume from the last successful step. The session is reloaded but any in-flight tool execution is lost.

---

Generated by `study-areas/03-resilience-fallback-and-validation.md` against `opencode`.