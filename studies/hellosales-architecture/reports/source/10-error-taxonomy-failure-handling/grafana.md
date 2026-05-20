# Source Analysis: grafana

## Error Taxonomy & Failure Handling

### Source Info

| Field | Value |
|-------|-------|
| Name | grafana |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/grafana` |
| Language / Stack | Go (backend), TypeScript/React (frontend) |
| Analyzed | 2026-05-20 |

## Summary

Grafana implements a comprehensive error taxonomy centered on the `errutil` package (`pkg/apimachinery/errutil/`). The system uses a structured `Error` type with `StatusReason` hierarchy to distinguish error categories, a template system for localized error messages, and scattered retry utilities across subsystems. Partial failure handling exists in KV operations via `BatchError`, and graceful degradation is present in search via SQL fallback. However, circuit breakers are absent, and retry logic is decentralized rather than unified.

## Rating

**7/10** — Good implementation with minor issues. The errutil system provides excellent error taxonomy with proper client/server/transient separation, typed errors for caller handling, and internationalization support. However, retry logic is fragmented across multiple implementations (no unified retry library), circuit breakers are not implemented (only a TODO comment), and batch partial failure handling is inconsistent across the codebase.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Core Error Type | `Error` struct with Reason, MessageID, LogMessage, Underlying, PublicMessage, PublicPayload, LogLevel, Source | `pkg/apimachinery/errutil/errors.go:343` |
| StatusReason Hierarchy | `CoreStatus` constants mapping to HTTP status codes (StatusBadRequest, StatusNotFound, StatusInternal, StatusBadGateway, etc.) | `pkg/apimachinery/errutil/status.go:9-82` |
| Error Wrapping | `Error.Unwrap()` returns `e.Underlying`, implements `errors.Is` and `errors.As` | `pkg/apimachinery/errutil/errors.go:416-448` |
| Template System | `Template` and `TemplateData` types with separate log/public message templates | `pkg/apimachinery/errutil/template.go:9-23` |
| Log Level Assignment | `CoreStatus.LogLevel()` returns appropriate LogLevel per status type | `pkg/apimachinery/errutil/status.go:136-165` |
| Source Attribution | `SourceServer` vs `SourceDownstream` to identify error origin | `pkg/apimachinery/errutil/source.go:6-13` |
| Retry Utility | `Retry()` function with exponential backoff (minDelay/maxDelay, no jitter) | `pkg/util/retryer/retryer.go:16-47` |
| SQLite Retry | backoff.Config with MinBackoff=50ms, MaxBackoff=10s, MaxRetries=10 for busy/locked | `pkg/storage/unified/sql/rvmanager/rv_manager.go:382-402` |
| KV Retry with Jitter | `maxAttempts=5`, `maxRetryJitter=100ms` for badger conflict retry | `pkg/storage/unified/resource/kv/kv.go:495-519` |
| Circuit Breaker | Only TODO comment suggesting future implementation — not implemented | `pkg/infra/features/client.go:23` |
| Fallback Error Writer | `errhttp.Write()` with `WithFallback()` option for non-errutil errors | `pkg/util/errhttp/writer.go:36-78` |
| BatchError Type | `BatchError` struct with Err, Index, Op for partial failure context | `pkg/storage/unified/resource/kv/kv.go:75-89` |
| Graceful Degradation | SQL fallback for resource stats when indexer not running | `pkg/storage/unified/sql/backend_stats.go` |
| Retryable Sentinel | `ErrRetryable` sentinel error for KV stream retry | `pkg/storage/unified/resource/kv/kv.go:22-29` |
| Public Error Conversion | `Error.Public()` returns `PublicError` (safe for JSON to client) | `pkg/apimachinery/errutil/errors.go:459-478` |

## Answers to Dimension Questions

### 1. How does the system distinguish client errors from server errors from transient failures?

**Client errors (4xx):** `StatusBadRequest`, `StatusUnauthorized`, `StatusForbidden`, `StatusNotFound`, `StatusConflict`, `StatusTooManyRequests`, `StatusValidationFailed`, `StatusUnprocessableEntity`, `StatusUnsupportedMediaType`, `StatusClientClosedRequest` — all map to HTTP 4xx codes via `CoreStatus.HTTPStatus()` at `pkg/apimachinery/errutil/status.go:102-133`.

**Server errors (5xx):** `StatusInternal` (HTTP 500), `StatusTimeout` (HTTP 504), `StatusNotImplemented` (HTTP 501), `StatusUnknown` (HTTP 500) — defined at `pkg/apimachinery/errutil/status.go:60-72`.

**Transient/Downstream errors:** `StatusBadGateway` (HTTP 502) and `StatusGatewayTimeout` (HTTP 504) marked with `SourceDownstream` via `WithDownstream()` option at `pkg/apimachinery/errutil/errors.go:204-221`. These indicate errors from downstream services proxied through Grafana.

**Transient retry indication:** `ErrRetryable` sentinel at `pkg/storage/unified/resource/kv/kv.go:22-29` marks errors that callers may retry by reopening the KV stream from a known resume point.

### 2. Are errors typed so callers can handle specific failure modes?

**Yes.** Errors are typed via the combination of:
- **`StatusReason`** — the `Reason` field in `Error` is a `StatusReason` interface that maps to HTTP status codes. Callers can switch on `err.Reason.Status().HTTPStatus()` to handle specific categories.
- **`MessageID`** — a dot-namespaced string identifier (e.g., `"sse.readDataError"`, `"plugin.notRegistered"`) that uniquely identifies the error type across the codebase. Defined at package level as sentinel `Base` variables.
- **`Source`** — `SourceServer` vs `SourceDownstream` at `pkg/apimachinery/errutil/source.go:6-13` to distinguish Grafana-internal errors from proxied downstream errors.

The `Base.Is()` method at `pkg/apimachinery/errutil/errors.go:291-311` enables `errors.Is()` checks against sentinel `Base` errors, allowing callers to do:

```go
if errors.Is(err, errutil.ErrDataSourceNotFound) { ... }
```

The template system (`pkg/apimachinery/errutil/template.go:9-121`) also supports structured `PublicPayload` for passing typed data to clients for further error handling on the client side.

### 3. What is the retry strategy — exponential backoff, jitter, max attempts?

**Exponential backoff without jitter:** The primary `Retry()` utility at `pkg/util/retryer/retryer.go:16-47` doubles the delay on each retry (`currentDelay = minDuration(currentDelay*2, maxDelay)`) but does **not** add jitter.

```go
// pkg/util/retryer/retryer.go:41
currentDelay = minDuration(currentDelay*2, maxDelay)
```

**Max attempts enforced:** Returns `errors.New("max retries exceeded")` after `maxRetries` attempts at line 33-35.

**Different configurations per subsystem:**
- **Scheduler:** Uses `dskit/backoff` with `DefaultMinBackoff=100ms, DefaultMaxBackoff=1s, DefaultMaxRetries=5` (`pkg/util/scheduler/scheduler.go:55-81`)
- **SQLite busy/locked:** `MinBackoff=50ms, MaxBackoff=10s, MaxRetries=10` (`pkg/storage/unified/sql/rvmanager/rv_manager.go:382-402`)
- **KV badger conflicts:** `maxAttempts=5` with `maxRetryJitter=100ms` — includes jitter (`pkg/storage/unified/resource/kv/kv.go:495-519`)
- **Remote index store:** `MinBackoff=50ms, MaxBackoff=10s, MaxRetries=10` (`pkg/storage/unified/search/remote_index_store.go:214-267`)

**No unified retry library** — each subsystem invents its own backoff configuration.

### 4. How are partial failures in batch operations reported?

**KV Batch (stop-on-first-failure):** The KV store's `BatchError` at `pkg/storage/unified/resource/kv/kv.go:75-89` wraps errors from batch operations with context about which operation (`Index`) failed. The `BatchError.Error()` format is:
```
"batch operation %d (mode: %d, key: %s) failed: %v"
```

The KV batch operations appear to stop on first failure based on the BatchError structure.

**Search batch (all-or-nothing):** `BatchProcess` in `pkg/storage/unified/search/embed/embedder/batch_process.go:15-54` returns an error if any batch fails — no partial results returned.

**Search reconciliation (partial failure tracking):** `processEvents` in `pkg/storage/unified/search/embed/reconciler/reconciler.go:500-536` returns separate lists of `failed` and `successes` events, allowing the caller to handle partial failures:

```go
func (s *Reconciler) processEvents(ctx context.Context, sinceRv int64, batch []*pendingEvent) 
    (maxRv, lowestFailedRv int64, failed, successes []*pendingEvent, abort bool)
```

**No consistent pattern** — batch failure semantics vary by subsystem.

### 5. Does the system have circuit breakers to prevent cascade failures?

**No circuit breaker implementation found.** Only a comment at `pkg/infra/features/client.go:23`:

```go
// For recurring outages, worth considering implementing a circuit breaker pattern.
```

This is a TODO/note comment acknowledging the need but not implementing it. There is no `circuitbreaker` package or similar in the codebase.

**Rate limiting exists** via `StatusTooManyRequests` (HTTP 429), but this is client-side backoff signaling rather than server-side cascade prevention.

## Architectural Decisions

### Centralized Error Infrastructure (`errutil`)
Grafana invested in a centralized error utility library at `pkg/apimachinery/errutil/` that provides:
- **Consistent error structure** across all Go code
- **HTTP status mapping** via `CoreStatus` (wraps k8s `StatusReason`)
- **Separation of concerns** between log messages, public messages, and underlying errors
- **Internationalization support** via `MessageID` and `PublicPayload` that clients can localize

This is a strong architectural decision enabling uniform error handling across a large monorepo.

### Sentinel Base Errors as Package Variables
Error definitions are typically package-level `Base` or `Template` variables (e.g., `var ErrRateLimited = errutil.TooManyRequests(...)` at `pkg/apimachinery/errutil/errors.go:324`). This enables `errors.Is()` checks without instantiating errors, though it requires discipline to use consistently.

### Downstream Error Source Tracking
`SourceDownstream` at `pkg/apimachinery/errutil/source.go:12` and `BadGateway`/`GatewayTimeout` factory functions at `pkg/apimachinery/errutil/errors.go:204-221` explicitly mark errors originating from proxied services. This helps distinguish Grafana bugs from upstream service failures.

### Template-Based Public Messages
The `Template` system at `pkg/apimachinery/errutil/template.go:9-121` separates:
- **Private data** — full error details for logging
- **Public data** — safe subset for client display via `WithPublic()` option

This prevents accidentally leaking sensitive internal error details to end users.

## Notable Patterns

### 1. Hierarchical StatusReason
`CoreStatus` (line-level errors) → `StatusReason` interface → `ProxyStatus`/`PluginStatus` (domain-specific errors). Allows future extension without modifying the core.

### 2. Error.Is() for Sentinel Matching
Package-level `Base` variables implement `errors.Is()` to allow callers to check error types without instantiation:
```go
// pkg/apimachinery/errutil/errors.go:293-311
func (b Base) Is(err error) bool
```

### 3. Public/Private Error Separation
`Error.Public()` returns a `PublicError` struct safe for JSON serialization, while the full `Error` is retained for internal logging and debugging.

### 4. Contextual Batch Errors
`BatchError` at `pkg/storage/unified/resource/kv/kv.go:75-89` includes operation index and mode for precise failure localization in batch operations.

### 5. ErrRetryable Stream Resume
The KV store uses `ErrRetryable` at `pkg/storage/unified/resource/kv/kv.go:22-29` to signal that callers can retry by reopening from a known resume point, enabling resumption after transient failures.

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| No circuit breakers | System can cascade-fail under sustained downstream outages. Relies on external load balancers or client backoff. |
| No jitter in retryer | `pkg/util/retryer/retryer.go:41` can cause thundering herd when multiple clients retry simultaneously. Other subsystems independently invented jitter. |
| Decentralized retry logic | No single `backoff.Retry()` call site uses the same configuration. Hard to reason about overall retry behavior. |
| BatchError stop-on-failure | Some batch operations fail entirely on first error, while others (reconciler) track partial failures. Inconsistent API for callers. |
| Template panic on error | `MustTemplate()` at `pkg/apimachinery/errutil/template.go:54-60` panics if template compilation fails. Ensures bugs are caught early but can crash startup. |
| errutil not mandatory | Non-errutil errors fall back to generic `ErrNonGrafanaError` via `errhttp/fallbackOrInternalError`. Inconsistent error handling between packages. |

## Failure Modes / Edge Cases

1. **Thunderinging herd on retry** — `Retry()` at `pkg/util/retryer/retryer.go:16-47` lacks jitter, so simultaneous failures cause synchronized retries.

2. **Errutil not enforced** — Code that doesn't use `errutil.Error` gets wrapped as generic 500 via `ErrNonGrafanaError` at `pkg/util/errhttp/writer.go:17`. Silent loss of error specificity.

3. **BatchError no partial recovery** — Most batch operations return on first failure. Callers cannot recover successful operations after a later operation fails.

4. **No timeout circuit breaker** — If a downstream service is slow but responsive, Grafana will wait until timeout rather than failing fast. Connection-level `DialTimeout` noted as future improvement at `pkg/infra/features/client.go:23`.

5. **Template panics crash process** — `MustTemplate()` at `pkg/apimachinery/errutil/template.go:54-60` panics on invalid template. Would crash Grafana on startup if any package-level template is malformed.

6. **Context cancellation not distinguished** — `StatusClientClosedRequest` at `pkg/apimachinery/errutil/status.go:48-54` is a non-standard HTTP 499 code for client disconnection, but Grafana code may not consistently use this for canceled contexts.

## Future Considerations

1. **Circuit breaker implementation** — The TODO at `pkg/infra/features/client.go:23` should be addressed to prevent cascade failures during sustained downstream outages.

2. **Unified retry library** — Consolidate scattered backoff configurations (`retryer.go`, `dskit/backoff`, ad-hoc configs) into a single `backoff.RetryWithJitter()` that includes jitter by default.

3. **Jitter in retryer** — Add jitter to `pkg/util/retryer/retryer.go:41` to prevent thundering herd, or deprecate this utility in favor of a properly-configured alternative.

4. **Partial batch failure API** — Standardize batch operation behavior (stop-on-failure vs. partial results) across the codebase for consistent caller experience.

5. **errutil middleware enforcement** — Consider API middleware that converts non-errutil errors to structured errors with stack trace capture, rather than silent fallback to generic 500.

## Questions / Gaps

1. **No evidence of timeout circuit breaker** — Only a comment suggesting it should be implemented. If downstream services hang without responding, Grafana will exhaust its request timeout waiting.

2. **Retry eligibility not centrally defined** — `isRetryableSnapshotStoreError()` at `pkg/storage/unified/search/remote_index_store.go` has hardcoded retry logic for specific gRPC codes. No systematic way to mark error types as retryable.

3. **Error observability unclear** — While structured errors exist, no evidence found of centralized error tracking/metrics (e.g., error counts by MessageID, error rate by service).

4. **Frontend error handling** — The study focused on Go backend. TypeScript error handling patterns in `public/app/` were not analyzed.

---

Generated by `dimensions/10-error-taxonomy-failure-handling.md` against `grafana`.
