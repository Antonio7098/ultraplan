# Source Analysis: victoriametrics

## Error Taxonomy & Failure Handling

### Source Info

| Field | Value |
|-------|-------|
| Name | victoriametrics |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/victoriametrics` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

VictoriaMetrics implements a pragmatic error handling approach using Go's standard error wrapping patterns with some domain-specific custom error types. The system distinguishes errors through HTTP status codes and sentinel errors for specific failure modes. Retry logic is implemented via `BackoffTimer` with exponential backoff and jitter in several subsystems (vmctl, vmagent, vmauth). Circuit breakers are not explicitly implemented, but similar functionality is achieved through backend health tracking and rate-limited logging. Graceful degradation exists through error suppression flags and trivial network error handling.

## Rating

**6/10** — Basic implementation with gaps. VictoriaMetrics has solid error wrapping conventions and retry utilities in key subsystems, but lacks a unified error taxonomy, typed error hierarchies for callers, circuit breakers, and consistent partial failure handling. The approach is pragmatic but decentralized.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Custom Error Type | `ErrorWithStatusCode` struct with HTTP status code and `Unwrap()` | `lib/httpserver/httpserver.go:712` |
| User-Readable Error | `UserReadableError` interface for errors shown to users | `lib/httpserver/prometheus.go:31` |
| Storage Sentinel | `ErrDeadlineExceeded` for query timeout | `lib/storage/storage.go:1304` |
| Merge Sentinel | `errForciblyStopped` for stop signal during merge | `lib/storage/merge.go:40` |
| JWT Sentinel Errors | `ErrNilKey`, `ErrInvalidKey`, `ErrUnsupportedAlg`, `ErrInvalidSignature` | `lib/jwt/algo.go:38-47` |
| Error Wrapping | Standard `fmt.Errorf` with `%w` for error chaining | `lib/storage/storage.go:2213` |
| Backoff Timer | `BackoffTimer` with exponential backoff and jitter | `lib/timeutil/backoff_timer.go:9-68` |
| VMCTL Retry | `Backoff` struct with `Retry()` function and fail-fast on bad request | `app/vmctl/backoff/backoff.go:21-79` |
| Remote Write Retry | `sendBlockHTTP()` with indefinite retry using `BackoffTimer` | `app/vmagent/remotewrite/client.go:416-434` |
| Trivial Network Errors | `IsTrivialNetworkError()` suppresses broken pipe/reset by peer | `lib/netutil/netutil.go:28-36` |
| Graceful Shutdown | `-http.maxGracefulShutdownDuration` flag (default 7s) | `lib/httpserver/httpserver.go:61` |
| Error Suppression Flag | `-promscrape.suppressScrapeErrors` flag for scrape targets | `lib/promscrape/scrapework.go:43-46` |
| Error Metrics | `vm_promscrape_scrape_errors_total` for scrape failures | `lib/promscrape/scrapework.go` |
| HTTP Error Metrics | `vm_http_request_errors_total` by path and reason | `lib/httpserver/httpserver.go:567` |
| Backend Health Tracking | `bu.setBroken()` marks backend unavailable | `app/vmauth/main.go:454` |
| Retry Status Codes | Configurable `retryStatusCodes` for proxy retry | `app/vmauth/main.go:524-548` |

## Answers to Dimension Questions

### 1. How does the system distinguish client errors from server errors from transient failures?

VictoriaMetrics uses HTTP status codes as the primary mechanism for distinguishing error categories. The `ErrorWithStatusCode` type (`lib/httpserver/httpserver.go:712`) embeds an HTTP status code in errors. Server errors typically return HTTP 500 (internal server error) or HTTP 503 (service unavailable). Client errors are distinguished by HTTP 4xx codes. Transient failures are identified through specific sentinel errors like `io.EOF` and `IsTrivialNetworkError()` (`lib/netutil/netutil.go:28-36`) which indicate connection-level issues that may succeed on retry.

### 2. Are errors typed so callers can handle specific failure modes?

**Partially.** The codebase uses sentinel errors for specific failure modes:
- `ErrDeadlineExceeded` (`lib/storage/storage.go:1304`) — callers can detect timeout
- `ErrBadRequest` (`app/vmctl/backoff/backoff.go:19`) — non-retriable, fail fast
- `errForciblyStopped` (`lib/storage/merge.go:40`) — stop signal received
- `errLabelsLimitExceeded` (`lib/promscrape/scrapework.go:1098`) — label limit exceeded

However, there is no unified error type hierarchy or `errors.As` pattern for caller-based error type inspection. Most errors are plain `error` values wrapped with `fmt.Errorf`, making it difficult for callers to programmatically distinguish error categories beyond checking specific sentinels.

### 3. What is the retry strategy — exponential backoff, jitter, max attempts?

**Exponential backoff with jitter is implemented in multiple subsystems:**

- **`BackoffTimer`** (`lib/timeutil/backoff_timer.go:9-68`): Exponential doubling with random jitter. `Wait(stopCh)` blocks and doubles delay on each iteration. Supports `SetDelay()` for respecting Retry-After headers.

- **`VMCTL Backoff`** (`app/vmctl/backoff/backoff.go:21-45`): Configurable retries, factor, and min duration. Formula: `minDuration * factor^i`. Fails fast on `ErrBadRequest` or `context.Canceled`. No jitter.

- **VMAgent Remote Write** (`app/vmagent/remotewrite/client.go:416-434`): Uses `BackoffTimer` for indefinite retry. Configurable via `retryMinInterval` and `retryMaxInterval` flags.

- **VMAuth Proxy** (`app/vmauth/main.go:524-548`): Configurable status codes trigger retry. No backoff mechanism — immediate retry up to a limit.

**Max attempts:** VMCTL uses fixed `MaxRetries` (typically 10). VMAuth uses local retry with `goto again` pattern (`app/vmauth/main.go:441-446`). VMAgent remote write uses indefinite retry.

### 4. How are partial failures in batch operations reported?

**No explicit partial failure reporting mechanism found.** VictoriaMetrics does not appear to have a `BatchError` or equivalent type for collecting multiple errors from batch operations. Ingestion pipelines silently skip or log individual item failures rather than returning partial success/failure information to callers. The `mergeset` package returns errors at the stream/block level but does not aggregate individual item failures.

Error metrics like `vm_protoparser_read_errors_total` track error counts by type, but there is no structured way for callers to inspect which specific items failed in a batch operation.

### 5. Does the system have circuit breakers to prevent cascade failures?

**No explicit circuit breaker pattern found.** The codebase does not implement a dedicated circuit breaker library or pattern. Instead, similar functionality is achieved through:

- **Backend health tracking** (`app/vmauth/main.go:454`): `bu.setBroken()` marks a backend as unavailable after failures.

- **Rate-limited logging** (`lib/logger/logger.go:30-31`): `loggerErrorsPerSecondLimit` and `loggerWarnsPerSecondLimit` prevent log flooding during error storms.

- **Trivial network error suppression** (`lib/netutil/netutil.go:28-36`): `IsTrivialNetworkError()` suppresses logging for expected connection reset errors.

- **Error suppression flag** (`lib/promscrape/scrapework.go:43-46`): `-promscrape.suppressScrapeErrors` suppresses repeated scrape error logging.

There is no automatic circuit opening, half-open state, or failure threshold-based trip mechanism as seen in dedicated circuit breaker libraries.

## Architectural Decisions

1. **Pragmatic error wrapping**: Uses standard Go `fmt.Errorf` with `%w` throughout rather than a custom error wrapping library. This maintains Go idioms but limits structured error inspection.

2. **Decentralized retry logic**: Each subsystem (vmctl, vmagent, vmauth) implements its own retry mechanism rather than sharing a common retry library. This leads to inconsistency — VMCTL has fail-fast on bad request, VMAuth retries on status codes, VMAgent retries indefinitely.

3. **HTTP status code as error identity**: The `ErrorWithStatusCode` type (`lib/httpserver/httpserver.go:712`) couples errors to HTTP semantics, which is natural for an HTTP server but means non-HTTP components lack a unified error identity scheme.

4. **Log-based error management**: Rather than circuit breakers, VictoriaMetrics relies heavily on rate-limited logging (`lib/logger/logger.go:30-31`) to prevent cascading log volume during failures.

5. **Sentinel errors for specific domains**: JWT (`lib/jwt/`), storage (`lib/storage/`), and scrape (`lib/promscrape/`) each define their own sentinel errors rather than sharing a common error type hierarchy.

## Notable Patterns

1. **Error suppression for noisy failures**: `IsTrivialNetworkError()` (`lib/netutil/netutil.go:28-36`) suppresses "broken pipe" and "reset by peer" errors that are common but not actionable.

2. **Graceful shutdown with timeout**: HTTP server enforces `-http.maxGracefulShutdownDuration` (default 7s) and returns error if exceeded (`lib/httpserver/httpserver.go:270`).

3. **Fallback to legacy indexDB**: Storage falls back to legacy index search when composite index search fails (`lib/storage/storage.go:1530`).

4. **Scrape error suppression**: `-promscrape.suppressScrapeErrors` flag with configurable delay suppresses repeated error logs for scrape targets (`lib/promscrape/scrapework.go:390-401`).

5. **Backend broken marking**: `vmauth` marks backends as broken (`bu.setBroken()`) after failures, allowing health checking to remove them from rotation (`app/vmauth/main.go:454`).

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| Decentralized retry | Each subsystem can optimize its own retry behavior, but leads to inconsistent patterns and code duplication |
| No unified error type hierarchy | Go's native error interface is sufficient for simple cases, but makes it harder to build sophisticated error handling middleware |
| Rate-limited logging vs circuit breakers | Uses log rate limiting instead of circuit breakers to prevent cascade failures — simpler but less precise control |
| No structured partial failure reporting | Batch operations that partially fail do not provide callers with details about which items succeeded/failed |
| Sentinel errors per domain | Domain-specific sentinels are clear in intent but require importing multiple packages |

## Failure Modes / Edge Cases

1. **Indefinite retry without backoff**: VMAuth proxy retries on certain status codes (`retryStatusCodes`) without exponential backoff (`app/vmauth/main.go:524-548`), potentially causing thundering herd issues.

2. **Graceful shutdown timeout**: If graceful shutdown exceeds `-http.maxGracefulShutdownDuration`, the server errors out rather than forcefully terminating (`lib/httpserver/httpserver.go:270`), which could leave requests hanging.

3. **Backend health state not persisted**: Backend broken state (`bu.setBroken()`) is in-memory and lost on restart, meaning previously failed backends will immediately receive traffic again (`app/vmauth/main.go:454`).

4. **Error suppression masking issues**: The `-promscrape.suppressScrapeErrors` flag suppresses error logs, which may hide underlying problems if the flag is enabled in production (`lib/promscrape/scrapework.go:43-46`).

5. **No partial failure context**: Batch operations (e.g., multi-target writes) that fail partially do not return detailed error information to callers, making debugging difficult.

## Future Considerations

1. **Unified error package**: Consider creating a shared `vmerrors` package with a structured error type hierarchy similar to Grafana's `errutil`, supporting status reasons, error codes, and structured metadata.

2. **Circuit breaker library**: Implement a proper circuit breaker pattern with threshold-based tripping, half-open state for testing, and automatic recovery.

3. **Batch partial failure reporting**: Add `BatchResult` type that captures per-item success/failure status for batch operations, allowing callers to handle partial failures explicitly.

4. **Consistent retry middleware**: Create a shared retry middleware that can be configured per-operation with consistent backoff, jitter, and max attempts policies.

5. **Backend health persistence**: Persist backend health state to enable faster recovery and avoid sending traffic to known-failed backends after restart.

## Questions / Gaps

1. **No evidence of error code registry**: Does VictoriaMetrics have a central registry of error codes for API stability? No evidence found in current analysis.

2. **No structured error documentation**: Are error codes documented for API consumers? No public error documentation schema found.

3. **No error budget concept**: Does the system track error budgets for SLOs? Not implemented.

4. **No deadline propagation across components**: Does a request deadline propagate from HTTP layer to storage layer? Only `ErrDeadlineExceeded` sentinel found at storage boundary.

5. **No recovery mechanisms for stuck operations**: Are there mechanisms to detect and recover from stuck goroutines or operations? No evidence of watchdog or stuck operation detection.

---

Generated by `dimensions/10-error-taxonomy-failure-handling.md` against `victoriametrics`.