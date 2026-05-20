# Error Taxonomy & Failure Handling - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Dimension | `10-error-taxonomy-failure-handling` |
| Sources | cli, grafana, kubernetes, milvus, nats-server, openfga, pocketbase, temporal, victoriametrics |
| Date | 2026-05-20 |

## Sources Studied

| # | Source | Path |
|---|--------|------|
| 1 | cli | `sources/cli` |
| 2 | grafana | `sources/grafana` |
| 3 | kubernetes | `sources/kubernetes` |
| 4 | milvus | `sources/milvus` |
| 5 | nats-server | `sources/nats-server` |
| 6 | openfga | `sources/openfga` |
| 7 | pocketbase | `sources/pocketbase` |
| 8 | temporal | `sources/temporal` |
| 9 | victoriametrics | `sources/victoriametrics` |

## Executive Summary

Error taxonomy and failure handling is one of the most variable dimensions across the nine sources studied. Scores range from 6 to 8, with the spread driven primarily by whether a centralized error type system exists, whether retry policies include jitter, and whether circuit breakers are implemented. No source scored below 6, indicating the baseline expectation for error handling in production-grade Go systems is well-understood.

Three convergent findings emerge across all sources: (1) Go's standard `errors.Is`/`errors.As` with `fmt.Errorf` and `%w` is the universal error wrapping convention, though quality of `Unwrap()` implementation varies. (2) Exponential backoff with jitter is the recognized best practice for retry, yet only a minority of sources implement it fully. (3) Circuit breakers are almost universally absent — only Temporal has a real implementation (backed by `sony/gobreaker`). Every other source relies on rate limiting, backoff, or slow-consumer detection instead.

The most significant gap is partial failure handling in batch operations: only Kubernetes (via `ErrorList`/`ToAggregate()`) and OpenFGA (via tuple-level error reporting) provide structured per-item error aggregation. Most sources either stop on first failure or return a flat top-level error with no per-item breakdown.

## Core Thesis

Error taxonomy quality is a reliable proxy for system maturity. Sources with centralized error packages (Grafana `errutil`, Milvus `merr`, Temporal `serviceerror`) consistently score higher than those with decentralized, ad-hoc error definitions. The difference manifests in caller discrimination ability — typed errors with sentinel values enable `errors.Is()` checks that are impossible with opaque string errors. The gap between "typed error hierarchy" and "plain error strings" is the single largest differentiator in this dimension.

## Rating Summary

| Source | Score | Approach | Main Strength | Main Concern |
|--------|-------|----------|---------------|--------------|
| cli | 6/10 | Sentinel errors + backoff library | HTTPError/GraphQLError typed, scope suggestion UX | Constant backoff dominant, no circuit breaker |
| grafana | 7/10 | Centralized errutil package | StatusReason hierarchy, public/private separation | No jitter, errutil not enforced |
| kubernetes | 8/10 | StatusError + APIStatus interface | Predicate functions, RetryOnConflict, rate limiters | No formal circuit breaker, fallback implicit |
| milvus | 8/10 | Centralized merr package | 100+ errors, ErrorType enum, hierarchical rate limiter | No circuit breaker, streaming errors diverge |
| nats-server | 7/10 | ApiError hierarchy + slow consumer | Jitter in backoff, atomic batch semantics | Sentinel errors are strings, no circuit breaker |
| openfga | 7/10 | Layered errors by domain | Public/internal separation, gRPC status mapping | No general API retry, no circuit breaker |
| pocketbase | 6/10 | ApiError + db retry | Error factory methods, Go stdlib conventions | Narrow retry scope, batch loses partial results |
| temporal | 8/10 | gRPC-centric + circuit breaker | Gobreaker integration, DLQ, 20% jitter | Retry config scattered, not all errors Unwrap() |
| victoriametrics | 6/10 | Pragmatic scattered | BackoffTimer with jitter, health tracking | No unified error taxonomy, no circuit breaker |

## Approach Models

### Centralized Error Package (Grafana, Milvus, Temporal)
These sources invest in a single, structured error type with code, retryability, and classification fields. Grafana's `errutil.Error` (`pkg/apimachinery/errutil/errors.go:343`) carries `StatusReason`, `MessageID`, `LogLevel`, `Source`. Milvus's `milvusError` (`pkg/util/merr/errors.go:275`) carries `errCode`, `retriable`, `errType`. Temporal's `serviceerror` types carry gRPC status with protobuf details. This model enforces consistency across a large codebase and enables fine-grained caller discrimination, but requires discipline to use the package rather than plain `errors.New`.

### Layered Error Domain (OpenFGA, NATS)
OpenFGA organizes errors by layer (typesystem, tuple, storage, condition, server) with sentinel errors in each domain (`pkg/typesystem/error.go:12-52`, `pkg/storage/errors.go:14-36`). NATS uses a two-tier model: sentinel strings for core protocol errors (`server/errors.go:22-247`) and structured `ApiError` for JetStream (`server/jetstream_errors.go:57-61`). This model maps naturally to service boundaries but creates inconsistency when crossing layers.

### StatusError + Predicate Model (Kubernetes)
Kubernetes wraps `metav1.Status` in `StatusError` and provides predicate functions `IsNotFound()`, `IsConflict()`, `SuggestsClientDelay()` etc. (`staging/src/k8s.io/apimachinery/pkg/api/errors/errors.go:527-791`). Callers switch on predicates rather than type-asserting, which is more ergonomic but requires the predicate functions to exist for all needed error categories.

### HTTP-Centric (Pocketbase, CLI)
Pocketbase (`tools/router/error.go:36`) and CLI (`api/client.go:46-53`) model errors as HTTP responses with status codes. This is natural for API servers and CLI tools respectively, but lacks domain-specific failure mode encoding beyond the HTTP status code.

### Pragmatic Scattered (VictoriaMetrics)
VictoriaMetrics uses sentinel errors per domain (JWT, storage, scrape) without a unified error type hierarchy. This is the simplest model and sufficient for relatively homogeneous workloads, but makes cross-domain error handling ad-hoc.

## Pattern Catalog

### Pattern 1: Sentinel Errors with Unwrap() for errors.Is() Matching
**What**: Package-level error variables (e.g., `ErrCollectionNotFound`, `ErrNotFound`) implement `Unwrap()` so callers can use `errors.Is(err, merr.ErrCollectionNotFound)`.
**Sources**: Milvus (`pkg/util/merr/errors.go:49-259`), Kubernetes (`staging/src/k8s.io/apimachinery/pkg/api/errors/errors.go:144-434`), OpenFGA (`pkg/typesystem/error.go:12-52`), Temporal (`common/serviceerror/shard_ownership_lost.go:11-18`).
**Why it works**: Go's standard `errors.Is` traverses the unwrap chain, enabling callers to catch specific errors without string matching or type assertions.
**When to copy**: When building a library or service with domain-specific errors that callers need to handle programmatically.
**When overkill**: Simple CLI tools or one-off services where callers just log errors and exit.

### Pattern 2: Error Factory Constructors
**What**: Named constructors like `NewNotFound()`, `NewConflict()`, `NewBadRequest()` ensure consistent error structure.
**Sources**: Kubernetes (`staging/src/k8s.io/apimachinery/pkg/api/errors/errors.go:144-434`), Pocketbase (`tools/router/error.go:66-117`), Grafana (`pkg/apimachinery/errutil/errors.go`).
**Why it works**: Self-documenting call sites; prevents inconsistency from manual struct construction.
**When to copy**: When the same error structure is constructed from multiple call sites.
**Risk**: Can become a catalog that must be maintained alongside the error taxonomy.

### Pattern 3: Retry with Exponential Backoff + Jitter
**What**: Delay doubles on each retry with random jitter to prevent thundering herd.
**Sources**: Temporal (`common/backoff/retrypolicy.go:48,153,180`), Kubernetes (`staging/src/k8s.io/apimachinery/pkg/util/wait/backoff.go:29-53`), NATS (`server/stream.go:3381-3408`), VictoriaMetrics (`lib/timeutil/backoff_timer.go:9-68`).
**Why it works**: Jitter spreads retry attempts over time, reducing coordinated retry storms when a shared dependency recovers.
**When to copy**: Any retry against a shared downstream service (database, API, queue).
**When overkill**: Retries within a single process where no coordination occurs.

### Pattern 4: Circuit Breaker for Cascade Prevention
**What**: State machine (closed/open/half-open) that trips after threshold failures and fails fast while open.
**Sources**: Temporal (`common/circuitbreaker/circuitbreaker.go:19-31`, `service/history/queues/executable.go:885-942`) — uses `sony/gobreaker`.
**Why it works**: Prevents a failing downstream service from consuming all request capacity with retries.
**When to copy**: Multi-tenant services or services with multiple downstream dependencies.
**Gap**: Only Temporal implements this; every other source relies on rate limiting or backoff instead.

### Pattern 5: Rate Limiting as Circuit Breaker Alternative
**What**: Per-item or global rate limiters that delay or reject requests when thresholds are exceeded.
**Sources**: Kubernetes (`staging/src/k8s.io/client-go/util/workqueue/default_rate_limiters.go:30-259`), Milvus (`internal/util/ratelimitutil/rate_limiter_tree.go:171-357`), OpenFGA (`internal/throttler/throttler.go:45-114`).
**Why it works**: Proactive rate limiting prevents overload before it causes cascade failures. Sufficient for many workloads.
**Limitation**: Rate limiters track request rate, not error rate. A service returning 500 for every request will still exhaust retry capacity.

### Pattern 6: DLQ for Failed Task Sink
**What**: Failed tasks written to a dead-letter queue rather than discarded or retried infinitely.
**Sources**: Temporal (`service/history/replication/task_processor.go:275-356`).
**Why it works**: Enables manual intervention and replay without losing work. Particularly valuable for replication tasks that may fail transiently.
**When to copy**: Task/queue systems with at-least-once delivery guarantees.

### Pattern 7: Public/Private Error Separation
**What**: `InternalError` or `PublicError` types that separate what callers see from what operators log.
**Sources**: Grafana (`pkg/apimachinery/errutil/errors.go:459-478`), OpenFGA (`pkg/server/errors/errors.go:40-53`).
**Why it works**: Prevents accidental leakage of stack traces, DB errors, or internal state to clients while preserving full information for debugging.
**When to copy**: Services with untrusted clients or multi-tenant environments.

### Pattern 8: Error Type Classification (Client/Server/Transient)
**What**: Error types carry metadata distinguishing whether the caller can fix the issue (client error), the server should retry (transient), or the server has a bug (server error).
**Sources**: Grafana (CoreStatus mapping to HTTP codes), Milvus (ErrorType SystemError vs InputError), Kubernetes (StatusReason constants), NATS (400/500/503 ApiError codes).
**Why it works**: Enables callers to implement appropriate handling — retry for transient, show user message for client errors, alert for server errors.
**When to copy**: Any service with external API consumers.

### Pattern 9: Batch Partial Failure via Per-Item Status Array
**What**: Batch operations return a status array where each item carries its own success/failure indicator.
**Sources**: Milvus (`internal/datacoord/services_commit_backfill.go:104-122`), Kubernetes (`staging/src/k8s.io/apimachinery/pkg/util/validation/field/errors.go:463`).
**Why it works**: Callers can recover from partial failures by retrying only failed items rather than the entire batch.
**Gap**: Most sources stop on first failure or return a flat top-level error.

### Pattern 10: Graceful Degradation via Fallback
**What**: Primary execution path falls back to an alternative when the primary fails.
**Sources**: Kubernetes (`FallbackExecutor` in `staging/src/k8s.io/client-go/tools/remotecommand/fallback.go:27-60`, Watch→List fallback in reflector), OpenFGA (`CachedTupleReader` fallback on cache miss).
**Why it works**: Degrades gracefully rather than failing entirely when a dependency is unavailable.
**When to copy**: Non-critical auxiliary paths (caching, legacy index, read replicas).

## Key Differences

### Centralized vs Scattered Error Definitions
Grafana, Milvus, and Temporal each have a single package defining the canonical error type. Kubernetes, OpenFGA, and NATS distribute error definitions across packages by domain. Pocketbase, CLI, and VictoriaMetrics have minimal centralized error definition. Centralized error packages correlate with higher scores (7-8 vs 6) because they enforce consistency and reduce the likelihood of "error drift" where new error types don't follow established patterns.

### Retry Strategy Variation
Three distinct retry strategies appear:
1. **Constant backoff** (CLI dominant pattern, Pocketbase): Simple but ineffective for rate-limited APIs
2. **Exponential backoff without jitter** (Grafana, Milvus, OpenFGA, Kubernetes): Better but can cause synchronized retry storms
3. **Exponential backoff with jitter** (Temporal, NATS, VictoriaMetrics, Kubernetes): Best practice

The lack of jitter in Grafana, Milvus, and Kubernetes is a notable gap given they otherwise have sophisticated retry infrastructure.

### Circuit Breaker Presence
Only Temporal has a formal circuit breaker. Every other source either has no cascade prevention or uses rate limiting as a substitute. This is the single largest architectural gap in the study.

### Partial Failure Handling
Partial failure handling is the most inconsistent dimension:
- **Kubernetes**: `ErrorList` with `ToAggregate()` collects multiple validation errors
- **OpenFGA**: Tuple-level validation errors via `HandleTupleValidateError()`
- **Milvus**: Per-segment status arrays in backfill responses
- **Everyone else**: First-error-stop or flat top-level error with no per-item breakdown

## Tradeoffs

| Decision | Benefit | Cost | Best-Fit Context | Failure Mode | Alternative |
|----------|---------|------|-----------------|-------------|-------------|
| Centralized error package | Consistency, caller discrimination | Single point of coupling, import cycles | Large monorepos, library code | Package becomes bottleneck for error definition | Layered errors by domain |
| Exponential backoff + jitter | Prevents thundering herd | More complex configuration | Shared downstream services | Jitter misconfiguration can still cause spikes | Constant backoff |
| Circuit breaker | Cascade prevention, fail-fast | State management complexity | Multi-tenant, multiple downstreams | Breaker walls off healthy partitions | Rate limiting, backoff |
| DLQ for failed tasks | Work preservation, replay | Additional infrastructure | Task queues, replication | DLQ accumulation without monitoring | Infinite retry |
| Batch partial failure aggregation | Caller recovery | Complexity in error type design | High-value batch operations | Error overflow in pathological cases | Stop on first failure |
| Public/private error separation | Security, cleaner API | Additional error type fields | Multi-tenant, external APIs | Extra field maintenance | Single error message |

## Decision Guide

**Should you build a centralized error package?**
Yes, if: large monorepo (10+ packages), library with multiple consumers, domain-specific error codes needed.
No, if: simple service, single package, errors map directly to HTTP codes.

**Should you implement circuit breakers?**
Yes, if: multiple downstream dependencies, multi-tenant, production traffic with SLO requirements.
Consider rate limiting instead if: simple architecture, single downstream, operational maturity low.

**Should you use exponential backoff with jitter?**
Yes, always for external API calls. Jitter is cheap to implement and prevents a known failure mode.
No if: in-process retries with no coordination, retry budget already controlled by other means.

**Should you aggregate partial failures or stop on first error?**
Aggregate when: batch operations are high-value, callers need to recover incrementally, idempotency is available.
Stop on first error when: batch is atomic, partial results are useless, simplicity is paramount.

## Practical Tips

1. **Use sentinel errors with Unwrap()**: Define package-level error variables and implement `Unwrap()` on all custom error types. This enables `errors.Is()` matching without type assertions.

2. **Distinguish client/server/transient in error type**: Include a classification field (error type enum, HTTP status mapping, or retryability flag) so callers can route errors appropriately.

3. **Add jitter to all exponential backoff**: Use `rand` with a locked source to avoid global synchronization. Even 10-20% jitter significantly reduces thundering herd.

4. **Consider circuit breakers for multi-tenant services**: `sony/gobreaker` is a solid implementation. Start with per-destination breakers, not global.

5. **Use error factory constructors**: Named constructors (`NewNotFound`, `NewConflict`) self-document call sites and prevent inconsistency.

6. **Separate public and internal error messages**: Never return stack traces or internal error details to clients. Use a `Public()` method or separate `PublicError` type.

7. **Instrument retry and error rates**: Emit metrics for retry counts, error classifications, and circuit breaker state. Code inspection without metrics is insufficient for production debugging.

8. **Implement DLQ for at-least-once delivery**: If using a task queue, failed tasks should go to DLQ rather than being discarded.

## Anti-Patterns / Caution Signs

1. **No Unwrap() on custom error types**: Errors that wrap underlying errors but don't implement `Unwrap()` break `errors.Is()` chain traversal. Every `fmt.Errorf` with `%w` should wrap an error that also unwraps.

2. **Retry without jitter**: Any retry against a shared resource (database, API, queue) without jitter risks synchronized retry storms.

3. **No error type beyond HTTP status**: Services that return only HTTP status codes without domain-specific error codes force callers to parse messages.

4. **Silent error conversion to 500**: Any layer that converts domain errors to generic 500 without preserving the original error loses information that callers and operators need.

5. **Batch operations that lose partial results**: Returning only success or only failure for a batch, with no per-item status, prevents caller recovery.

6. **No retry budget**: Infinite retry loops with exponential backoff can consume resources indefinitely when a dependency is permanently unavailable.

7. **Circuit breaker absence in multi-tenant services**: Services handling traffic from multiple tenants where one tenant's downstream failure can affect others need circuit breakers.

8. **Error types that don't implement errors.Is**: Custom error structs that don't expose an `Is()` method cannot be caught with `errors.Is`, forcing callers to use type assertions.

## Notable Absences

1. **Error budget / SLO tracking**: No source implements error budgets for SLO tracking. This is a significant gap for production reliability.

2. **Structured error correlation IDs**: No source propagates correlation IDs through error chains for distributed tracing.

3. **Chaos engineering evidence**: No source demonstrates fault injection testing for error handling validation.

4. **Standardized partial failure type**: No source has a standard `PartialError` type for batch operations. Each source invents its own per-item status array format.

5. **Frontend error handling**: VictoriaMetrics, Kubernetes, and others were analyzed only for Go/backend patterns. TypeScript/frontend error handling was not studied.

## Per-Source Notes

### cli
HTTPError and GraphQLError types provide good caller discrimination for API errors. Scope suggestion on 4xx errors (`api/client.go:209-259`) is a strong UX pattern for developer-facing tools. Constant backoff dominant, no circuit breaker, inconsistent partial failure handling.

### grafana
errutil is the most sophisticated centralized error package in the study. StatusReason hierarchy, template system for i18n, and public/private separation are exemplary. Gaps: no jitter in retryer, no circuit breaker, errutil not mandatory (non-errutil errors fall through to generic 500).

### kubernetes
Predicate-based error checking (`IsNotFound`, `IsConflict`, etc.) is ergonomic. RetryOnConflict for API operations is well-designed. TypedRateLimiter with exponential per-item backoff and token bucket global limit is sophisticated. Watch→List fallback in reflector is graceful degradation done right. Gap: no formal circuit breaker.

### milvus
100+ sentinel errors organized by domain is comprehensive. ErrorType (SystemError vs InputError) classification and explicit retriability flag on each error are best-in-class. Hierarchical rate limiter (4 levels) provides fine-grained quota control. Gaps: no circuit breaker, no jitter in retry, streaming errors diverge from main merr package.

### nats-server
ApiError with machine-readable codes (400/500/503) provides good classification. Jitter in mirror consumer backoff is correct. Atomic batch commit with reject-and-revert semantics is sophisticated. Gaps: core protocol sentinel errors are plain strings without codes, no circuit breaker, inconsistent retry across subsystems.

### openfga
Error layering by domain (typesystem, tuple, storage, condition) is clean. Public/internal separation in InternalError is strong. gRPC status mapping via HandleError() is consistent. Gaps: no general API retry (only infrastructure retry), no circuit breaker, partial failure per-item mapping missing.

### pocketbase
ApiError with factory methods is clean for HTTP API use case. Go stdlib error conventions (errors.Is, errors.As, errors.Join) are idiomatic. SQLite lock retry with fixed backoff is appropriate for SQLite-backed app. Gaps: retry narrowly scoped to DB locks, no circuit breaker, batch loses partial results, no structured error codes for domain errors.

### temporal
Only source with real circuit breaker (sony/gobreaker). DLQ for failed tasks is best-in-class. 20% jitter with locked RNG source is correct. gRPC status as backbone enables cross-service error transmission. Gaps: retry policy configuration scattered across many functions, not all serviceerror types implement Unwrap().

### victoriametrics
BackoffTimer with exponential backoff and jitter is solid where implemented. Backend health tracking (setBroken()) is a pragmatic circuit breaker alternative. Error suppression for noisy failures (IsTrivialNetworkError) is thoughtful. Gaps: no unified error taxonomy, no circuit breaker, no partial failure reporting, retry inconsistent across subsystems.

## Open Questions

1. **Why is jitter absent from retry in Grafana, Milvus, and Kubernetes?** These sources have otherwise sophisticated retry infrastructure but omit jitter. Is this an oversight, a performance concern, or a deliberate tradeoff?

2. **Why do most sources lack circuit breakers?** Only Temporal implements circuit breakers. Every other source relies on rate limiting or backoff. Is this because circuit breakers are genuinely unnecessary for these architectures, or a gap waiting to cause cascade failures?

3. **Should partial failure handling be standardized?** Each source handles batch partial failures differently. Is there a general-purpose PartialError type that would serve most batch operation needs?

4. **What is the right error taxonomy for AI pipelines?** The dimension notes that AI pipelines have failure as the norm. Do the error taxonomies in these sources adequately handle the retry/delay/fallback patterns needed for LLM APIs, embedding pipelines, and agentic workflows?

5. **How should error taxonomies evolve as systems add streaming and real-time features?** Temporal and Milvus both have streaming-specific error handling that diverges from their main error packages. Is convergence needed, or is domain-specific error handling appropriate?

## Evidence Index

Every evidence reference uses format `path/to/file.ts:NN` from the source repository.

### cli
- `pkg/cmdutil/errors.go:35,38,41` — Sentinel errors (SilentError, CancelError, PendingError)
- `pkg/cmdutil/errors.go:21-32` — FlagError type with Unwrap()
- `api/client.go:46-53` — HTTPError type wrapping ghAPI.HTTPError
- `api/client.go:209-259` — Scope suggestion on 4xx errors
- `pkg/cmd/attestation/api/client.go:137,141,147` — Backoff with Permanent()
- `pkg/cmd/issue/shared/lookup.go:99-104` — PartialLoadError
- `pkg/cmd/skills/search/search.go:707-729` — Rate limit detection

### grafana
- `pkg/apimachinery/errutil/errors.go:343` — Core Error type
- `pkg/apimachinery/errutil/status.go:9-82` — CoreStatus hierarchy
- `pkg/apimachinery/errutil/template.go:9-23` — Template system
- `pkg/util/retryer/retryer.go:16-47` — Retry without jitter
- `pkg/infra/features/client.go:23` — Circuit breaker TODO
- `pkg/storage/unified/resource/kv/kv.go:75-89` — BatchError

### kubernetes
- `staging/src/k8s.io/apimachinery/pkg/api/errors/errors.go:33-434` — StatusError factory constructors
- `staging/src/k8s.io/apimachinery/pkg/api/errors/errors.go:527-791` — Predicate functions
- `staging/src/k8s.io/apimachinery/pkg/util/wait/backoff.go:29-53` — Backoff with jitter
- `staging/src/k8s.io/client-go/util/retry/util.go:26-105` — RetryOnConflict
- `staging/src/k8s.io/client-go/util/workqueue/default_rate_limiters.go:30-259` — TypedRateLimiter

### milvus
- `pkg/util/merr/errors.go:275-281` — milvusError struct
- `pkg/util/merr/errors.go:29-34` — ErrorType enum
- `pkg/util/merr/errors.go:49-259` — 100+ sentinel errors
- `pkg/util/merr/utils.go:68-93` — IsNonRetryableErr denylist
- `pkg/util/retry/retry.go:112-115` — Exponential backoff without jitter
- `internal/util/ratelimitutil/rate_limiter_tree.go:171-179` — Rate limiter hierarchy

### nats-server
- `server/errors.go:22-247` — Sentinel errors
- `server/jetstream_errors.go:57-61` — ApiError struct
- `server/jetstream_errors_generated.go:676-704` — Error code taxonomy
- `server/stream.go:3381-3408` — Retry with jitter
- `server/jetstream_batching.go:505-517` — Atomic batch reject

### openfga
- `pkg/typesystem/error.go:12-52` — Typesystem sentinel errors
- `pkg/storage/errors.go:14-36` — Storage sentinel errors
- `pkg/server/errors/errors.go:40-53` — InternalError public/internal separation
- `pkg/server/errors/errors.go:128-144` — HandleError gRPC mapping
- `internal/throttler/throttler.go:45-114` — Constant rate throttler

### pocketbase
- `tools/router/error.go:36-42` — ApiError struct
- `tools/router/error.go:66-117` — HTTP error factory methods
- `core/db_retry.go:43-61` — SQLite lock retry with fixed backoff
- `apis/batch.go:524-541` — BatchResponseError

### temporal
- `common/serviceerror/shard_ownership_lost.go:11-18` — Custom serviceerror types
- `common/backoff/retrypolicy.go:48,153,180` — Exponential backoff with jitter
- `common/circuitbreaker/circuitbreaker.go:19-31` — TwoStepCircuitBreakerWithDynamicSettings
- `service/history/queues/executable.go:885-942` — CircuitBreakerExecutable
- `service/history/replication/task_processor.go:275-356` — DLQ writing

### victoriametrics
- `lib/httpserver/httpserver.go:712` — ErrorWithStatusCode
- `lib/timeutil/backoff_timer.go:9-68` — BackoffTimer with jitter
- `app/vmctl/backoff/backoff.go:21-79` — VMCTL retry with fail-fast
- `lib/netutil/netutil.go:28-36` — IsTrivialNetworkError
- `app/vmauth/main.go:454` — Backend health tracking (setBroken)

---

Generated by dimension `10-error-taxonomy-failure-handling.md`.