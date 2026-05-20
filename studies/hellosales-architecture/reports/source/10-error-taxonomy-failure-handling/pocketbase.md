# Source Analysis: pocketbase

## Error Taxonomy & Failure Handling

### Source Info

| Field | Value |
|-------|-------|
| Name | pocketbase |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/pocketbase` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

Pocketbase implements a structured error taxonomy centered on an `ApiError` type (`tools/router/error.go:36`) that maps HTTP status codes to typed error responses. The system distinguishes client errors (400/401/403/404), server errors (500), and transient failures (via SQLite lock retry logic in `core/db_retry.go`). Error wrapping uses Go's standard `errors.Is`/`errors.As`/`errors.Join` conventions. A dedicated retry mechanism handles database lock contention with fixed backoff intervals. No circuit breaker pattern was found outside of SQLite lock retries.

## Rating

**6/10** — Basic implementation with gaps. The error type system is well-designed for HTTP API errors, but retry logic is narrowly scoped to database locks, batch partial failures lack granular per-item reporting, and there is no general-purpose circuit breaker or rate-limiter for external service calls.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| ApiError type | `type ApiError struct` with `Status`, `Message`, `Data`, `rawData` fields | `tools/router/error.go:36-42` |
| HTTP error factory methods | `NewNotFoundError`, `NewBadRequestError`, `NewForbiddenError`, `NewUnauthorizedError`, `NewInternalServerError`, `NewTooManyRequestsError` | `tools/router/error.go:66-117` |
| Error conversion | `ToApiError(err error) *ApiError` maps `sql.ErrNoRows` and `fs.ErrNotExist` to 404 | `tools/router/error.go:134-147` |
| SafeErrorItem interface | `Code()`, `Error()` methods for structured error responses | `tools/router/error.go:15-21` |
| Error wrapping | `ApiError.Is()` uses `errors.Is` to unwrap underlying error | `tools/router/error.go:55-63` |
| Sentinel errors | Uses Go stdlib `sql.ErrNoRows`, `fs.ErrNotExist`, `http.ErrServerClosed` | `tools/router/error.go:139`, `apis/serve.go:309` |
| DB retry | `baseLockRetry` retries on "database is locked" / "table is locked" with fixed intervals | `core/db_retry.go:43-61` |
| Retry intervals | `[50, 100, 150, 200, 300, 400, 500, 700, 1000]ms`, max 12 attempts | `core/db_retry.go:15-18` |
| Batch partial failure | `BatchResponseError` with `code`, `message`, and nested `*ApiError` response | `apis/batch.go:524-541` |
| Error event types | `ModelErrorEvent`, `RecordErrorEvent`, `CollectionErrorEvent` | `core/events.go:216-328` |
| S3 ResponseError | `ResponseError` struct with `Code`, `Message`, `RequestId`, `Resource`, `Status` | `tools/filesystem/internal/s3blob/s3/error.go:14-22` |
| Error joining | `errors.Join` used for multi-error scenarios | `core/db.go:146`, `core/db_tx.go:41` |

## Answers to Dimension Questions

### 1. How does the system distinguish client errors from server errors from transient failures?

**Client errors** are represented by `ApiError` with HTTP status codes 400, 401, 403, 404, 429 (`tools/router/error.go:66-117`). Factory methods like `NewBadRequestError`, `NewForbiddenError` create typed client errors.

**Server errors** use status 500 via `NewInternalServerError` (`tools/router/error.go:102-109`).

**Transient failures** are handled by `baseLockRetry` in `core/db_retry.go:43-61`, which only retries on SQLite lock errors ("database is locked", "table is locked"). Other transient failures (network, external services) have no dedicated retry or circuit-breaker mechanism. The system relies on Go's stdlib error semantics (`errors.Is`, `errors.As`) to distinguish error categories.

### 2. Are errors typed so callers can handle specific failure modes?

**Partially.** The `ApiError` type carries an HTTP status code (`tools/router/error.go:41`) and a `rawData` field that can contain the underlying error. Callers can use `errors.As` to extract `*router.ApiError` and switch on the `Status` field. However, there are no user-defined sentinel errors beyond `sql.ErrNoRows` and `fs.ErrNotExist` — all 400-level errors use the same `ApiError` struct without sub-typing (e.g., no `ValidationError`, `AuthenticationError` types). The `SafeErrorItem` interface (`tools/router/error.go:15-21`) allows custom error codes, but there are no predefined constants for common error codes.

The `BatchResponseError` (`apis/batch.go:524-541`) is a custom error type implementing `SafeErrorItem`, but it is the only such case.

### 3. What is the retry strategy — exponential backoff, jitter, max attempts?

**Fixed backoff, no jitter, max 12 attempts.** The intervals are: `[50, 100, 150, 200, 300, 400, 500, 700, 1000]ms` (`core/db_retry.go:15`). The `getDefaultRetryInterval` function (`core/db_retry.go:64-69`) returns the interval by index, clamping at the last value for out-of-range attempts. The retry condition checks string contains "database is locked" or "table is locked" (`core/db_retry.go:52-53`). There is no exponential growth, no jitter, and the retry is scoped exclusively to SQLite lock errors. External service calls (S3, SMTP) have no retry mechanism.

### 4. How are partial failures in batch operations reported?

**Coarse-grained — the batch stops on first failure.** In `apis/batch.go:235-272`, the `batchProcessor.process` method recursively processes batch items and returns immediately on error (`p.results` is only populated for successful items). When an error occurs, the `failedIndex` is tracked (`apis/batch.go:257`), but the error returned is a `validation.Errors` map with a single key `requests` containing a `BatchResponseError` (`apis/batch.go:202-210`). This means the caller sees one error with no per-item success/failure breakdown. The individual `BatchRequestResult` items are only available if the entire batch succeeds.

The `BatchResponseError` (`apis/batch.go:524-541`) embeds the failed `*ApiError` in its `Resolve` method, but the overall batch response structure does not preserve results for successful items when any item fails.

### 5. Does the system have circuit breakers to prevent cascade failures?

**No.** There is no circuit breaker implementation anywhere in the codebase. The only resilience pattern is the SQLite lock retry in `core/db_retry.go`. External service integrations (S3 file uploads in `tools/filesystem/internal/s3blob/s3/s3.go:134-141`, SMTP in `mails/record.go`) have no retry, circuit breaker, or fallback logic. If an S3 upload fails, the error propagates directly to the caller. Database transaction errors that are not lock-related are not retried.

## Architectural Decisions

1. **HTTP-centric error model.** Errors are modeled as HTTP responses with status codes, messages, and structured data. This is appropriate for an API server but does not capture domain-specific failure modes beyond HTTP semantics.

2. **Go stdlib error handling.** The system uses Go's standard `errors.Is`, `errors.As`, and `errors.Join` rather than custom error chain utilities. This is idiomatic but means error type distinction relies on the `ApiError` struct's status code field rather than distinct error types.

3. **Database lock retry as the only retry mechanism.** Retry is tightly scoped to SQLite lock errors because SQLite has well-known lock contention issues. This is a pragmatic choice for a SQLite-backed application, but it means other I/O failures have no built-in resilience.

4. **Validation.Errors as the batch error container.** The batch failure model (`apis/batch.go:202-210`) uses `validation.Errors` to wrap the `BatchResponseError`, which is consistent with the error handling style but does not provide a structured per-item result array.

## Notable Patterns

- **Error factory functions** (`tools/router/error.go:66-117`): Each HTTP error type has a dedicated constructor with a default message, reducing boilerplate and ensuring consistent error responses.
- **SafeErrorItem interface** (`tools/router/error.go:15-21`): Allows custom errors to implement structured `Code()` and `Error()` methods for i18n-compatible error messages.
- **ExecHook for retry** (`core/db_retry.go:20-41`): The retry logic is injected as a database execution hook (`WithExecHook`), keeping retry logic decoupled from database operations.
- **Error event hooks** (`core/events.go:216-328`): `ModelErrorEvent`, `RecordErrorEvent`, `CollectionErrorEvent` allow plugins to intercept and handle errors during model lifecycle operations.

## Tradeoffs

- **Narrow retry scope**: Limiting retry to SQLite locks is safe and predictable but leaves other failure modes (network, external services) unhandled.
- **No circuit breaker**: Without a circuit breaker, a failing external dependency (S3, SMTP) can cause cascading failures. The system relies on timeouts at the HTTP handler level rather than bulkhead/circuit-breaker patterns.
- **Batch failure loses partial results**: When a batch fails, successful items are not included in the response, making it harder for clients to recover and retry only failed items.
- **No structured error codes for domain errors**: While the `SafeErrorItem` interface exists, there are no predefined error code constants for common failure modes, making it harder to build error-handling logic that switches on error codes rather than status + message.

## Failure Modes / Edge Cases

- **S3 upload failure** (`tools/filesystem/internal/s3blob/s3/s3.go:134-141`): If an S3 request fails, the error is returned directly without retry. The `ResponseError` type captures the S3 error structure but there is no fallback or retry.
- **Database lock timeout**: If SQLite remains locked after 12 retry attempts (`core/db_retry.go:17-18`), the error propagates as a generic database error.
- **Batch timeout** (`apis/batch.go:224-228`): If the batch transaction times out, a plain `errors.New("batch transaction timeout")` is returned — not an `ApiError`, requiring the caller to handle non-API errors.
- **OAuth provider failure** (`apis/record_auth_with_oauth2.go:137`): Uses `errors.Is(err, sql.ErrNoRows)` to detect missing user record, but external provider errors (network, invalid state) may propagate as generic 500 errors.
- **File upload size limit** (`apis/record_crud.go:717`): HTTP errors like `http.ErrMissingFile` are handled but other upload errors may not have dedicated handling.

## Future Considerations

- **Circuit breaker**: A circuit breaker for external service calls (S3, SMTP, OAuth providers) would prevent cascade failures and provide graceful degradation.
- **General-purpose retry with backoff/jitter**: Extending retry to network operations with exponential backoff and jitter would improve reliability for external integrations.
- **Structured error codes**: Defining a catalog of error codes (e.g., `validation_required`, `auth_invalid`, `batch_timeout`) as constants would allow callers to handle specific failure modes without parsing messages.
- **Batch partial failure reporting**: Returning both successful and failed items in a batch response would allow clients to recover from partial failures without re-executing successful items.

## Questions / Gaps

- No evidence of a circuit breaker pattern anywhere in the codebase.
- Retry is limited to SQLite lock errors; no retry for network or external service failures.
- Batch failure loses successful results — no granular per-item status array.
- No predefined error code constants beyond generic `validation_invalid_value`.
- S3 errors are wrapped with `errors.Join` but there is no retry or fallback.
- Batch timeout returns a plain error string, not a typed `ApiError`, forcing callers to handle non-API errors.

---

Generated by `dimensions/10-error-taxonomy-failure-handling.md` against `pocketbase`.