# Source Analysis: pocketbase

## Observability & Operational Visibility

### Source Info

| Field | Value |
|-------|-------|
| Name | pocketbase |
| Path | `sources/pocketbase` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

PocketBase implements a custom structured logging system based on Go's `slog` package with batched writes to an embedded SQLite database (aux DB). Logs are stored in the `_logs` table with JSON-encoded data, configurable min level, and retention via `MaxDays`. The system lacks distributed tracing (no OpenTelemetry), lacks Prometheus metrics, and has no correlation ID propagation. Request activity logging exists but request metadata is not correlated via IDs. Health endpoints are present but do not include dependency checks.

## Rating

5/10 — Basic implementation with significant gaps. Structured logging to SQLite is functional and well-implemented, but distributed tracing, metrics collection, and correlation ID propagation are absent. The system relies on log-based debugging for production issues.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Logging Framework | Uses Go `slog` with custom `BatchHandler` that batches writes | `tools/logger/batch_handler.go:14` |
| Log Model | Log struct stored in `_logs` table with JSON data | `core/log_model.go:11-18` |
| Logger Initialization | BatchHandler writes to SQLite every 3s or 200 logs | `core/base.go:1410-1474` |
| Log Settings Config | `LogsConfig` struct with MaxDays, MinLevel, LogIP, LogAuthId | `core/settings_model.go:560-565` |
| Activity Logger Middleware | `activityLogger()` middleware logs request success/failure | `apis/middlewares.go:347-372` |
| Health Endpoint | `/api/health` returns 200 OK with optional metadata | `apis/health.go:18-53` |
| Panic Recovery | `panicRecover()` middleware catches panics and logs them | `apis/middlewares.go:252-275` |
| Fire-and-Forget Recovery | `FireAndForget` auto-recovers panics in goroutines | `tools/routine/routine.go:9-29` |
| Log Print (dev mode) | Colored stderr output with level prefixing | `core/log_printer.go:28-67` |
| Logs API | Superuser-only logs list/stats/view endpoints | `apis/logs.go:13-18` |
| Request Event Store | Request data stored in `RequestInfo` struct (no ID) | `core/event_request.go:167-174` |

## Answers to Dimension Questions

### 1. Can an operator reconstruct a single request's full path through the system?

**No.** There is no request correlation ID. The `activityLogger` middleware records request method, URL path, status code, IP, auth ID, and duration (`apis/middlewares.go:347-372`), but there is no unique identifier linking logs to a specific request. The `_logs` table stores logs with `created` timestamp and JSON `data` field, but no request ID field exists in `Log` model (`core/log_model.go:11-18`). Operators must correlate by timestamp, IP, and auth information, which is error-prone.

### 2. How are structured logs routed, stored, and queried in production?

**Storage:** Logs are written to the auxiliary SQLite database in the `_logs` table. The `BatchHandler` accumulates up to 200 logs before flushing (every 3 seconds via ticker) (`core/base.go:1415-1417`). Each log has `level`, `message`, `created`, and a JSON `data` map.

**Routing:** There is no external log routing. Logs are stored locally in SQLite. The `WriteFunc` in `initLogger()` uses `AuxRunInTransaction` to batch-insert logs (`core/base.go:1432-1457`).

**Querying:** The `/api/logs` endpoint (superuser-only) exposes log listing with filtering via `search.Provider` and stats via `LogsStats` (`apis/logs.go:25-73`). Filter fields include `id`, `created`, `level`, `message`, `data`, and `data.*` nested fields (`apis/logs.go:20-23`).

**Retention:** `LogsConfig.MaxDays` controls retention; expired logs are deleted via cron job every 6 hours (`core/base.go:1535-1540`). When `MaxDays == 0`, logs are not persisted and the aux DB is VACUUMed (`core/base.go:1522-1526`).

### 3. What metrics indicate system health vs performance degradation?

**No metrics system exists.** There are no Prometheus, statsd, or OpenTelemetry metric exporters. Health status is limited to `/api/health` returning a static 200 OK (`apis/health.go:18-53`), optionally revealing `canBackup` and `realIP` for superusers.

**Indicators available:**
- `app.Logger()` level-based filtering (`core/base.go:1397-1407`)
- Log query stats via `/api/logs/stats` (`apis/logs.go:39-59`)
- SQL query logging in dev mode (`core/base.go:1211` and `core/base.go:1270-1278`)
- No latency histograms, no request counters, no error rate metrics

### 4. How does observability cross async boundaries (queues, workflows)?

**Poorly.** There is no formal async boundary abstraction. Goroutine-based async work uses `FireAndForget` which auto-recovers panics (`tools/routine/routine.go:24`) but does not propagate context or correlation IDs. The cron system (`tools/cron/cron.go`) executes jobs on schedules but logs are emitted via `app.Logger()` with no job ID correlation — only message and timestamp. Background tasks such as file uploads, S3 operations, and mail sending use `context.Background()` directly (`tools/filesystem/filesystem.go:52`, `tools/auth/google.go:28`), making request correlation impossible.

### 5. What debugging tooling exists for production issues?

- **Activity logs:** Request success/failure logged to `_logs` table (no request ID)
- **Log filtering:** API-based log search with field resolvers (`apis/logs.go:20-23`)
- **Dev mode:** Colored stderr output with SQL statement logging (`core/log_printer.go:28-67`)
- **Panic recovery:** Middleware catches panics and returns 500 with stack trace (`apis/middlewares.go:260-275`)
- **No profiler endpoints:** No pprof, no trace endpoints
- **No request replay:** No way to replay a failed request
- **File leak detection:** `log.Printf` for unclosed readers/writers (`tools/filesystem/blob/reader.go:119`, `tools/filesystem/blob/bucket.go:467,645`)

## Architectural Decisions

### Custom BatchHandler over external logger
PocketBase implements a custom `BatchHandler` (`tools/logger/batch_handler.go`) wrapping Go's `slog.Handler` interface rather than using a third-party logger like `zap` or `logrus`. This provides full control over batching, JSON serialization, and SQLite persistence, but requires maintaining custom code.

### SQLite for log storage
Logs are stored in the auxiliary SQLite database rather than stdout or a separate log aggregator. This keeps the deployment simple (single binary) but scales poorly and is not queryable from external systems. Retention is managed via `MaxDays` setting and cron-based cleanup.

### No OpenTelemetry integration
Despite being a mature Go project, PocketBase does not use OpenTelemetry for tracing or metrics. This is likely a design choice to keep the binary self-contained, but it means operators cannot integrate with standard observability pipelines (Jaeger, Prometheus, Grafana).

### Activity logger as middleware
Request activity logging is implemented as a middleware (`activityLogger`) bound via `pbRouter.Bind(activityLogger())` (`apis/base.go:30`), meaning it is always active and cannot be easily replaced or extended with external log shippers.

### Log level configuration per environment
The `IsDev()` flag and `LogsConfig.MinLevel` jointly control log verbosity. In dev mode, all logs are printed to stderr and the minimum level is set to `-99999` (i.e., all levels) (`core/base.go:1401-1402`). In production, the configured `MinLevel` is used.

## Notable Patterns

### BatchHandler with BeforeAddFunc
The `BatchHandler` supports a `BeforeAddFunc` callback that can skip log insertion conditionally (`tools/logger/batch_handler.go:25`). PocketBase uses this to skip persistence when `MaxDays == 0` while still allowing dev-mode printing (`core/base.go:1418-1430`).

### RequestInfo caching
`RequestEvent.RequestInfo()` caches the parsed request data to avoid repeated parsing (`core/event_request.go:86-107`), but the cache stores no unique request identifier.

### Settings reload hook for log level
The log handler level is hot-reloaded via `OnSettingsReload()` hook (`core/base.go:1496-1532`), allowing runtime log level changes without restart.

### FireAndForget goroutine safety
`FireAndForget` recovers panics in spawned goroutines (`tools/routine/routine.go:24-29`), preventing orphaned goroutines from crashing the process but providing no visibility into what went wrong.

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| SQLite log storage | Simple deployment vs. poor queryability and scaling |
| No OpenTelemetry | Self-contained binary vs. no standard observability integration |
| No correlation IDs | Simplicity vs. inability to trace request paths |
| Activity logger middleware | Always-on logging vs. no pluggable external logging |
| Cron-based log cleanup | Simple implementation vs. potential for log spikes on restart |

## Failure Modes / Edge Cases

- **Log DB full:** If the aux DB fills up (disk exhaustion), log writes fail silently (`core/base.go:1450`) and `printLog` is called as fallback, meaning logs are only visible in dev mode.
- **High log volume:** With `MaxDays > 0` and high request volume, the 200-log batch size or 3s ticker interval could cause memory pressure or delayed log writes.
- **Lost async logs:** Goroutines that panic and are recovered by `FireAndForget` log only to stderr in dev mode; in production those logs are lost if `MaxDays == 0`.
- **No trace on panics across goroutines:** Panic recovery in `panicRecover()` middleware (`apis/middlewares.go:260`) captures the stack, but async panics caught by `FireAndForget` only log the error message, not the full stack.
- **Settings reload race:** The log cleanup on settings reload runs after the level is updated but before the old logs are deleted, potentially deleting logs that were just written.

## Future Considerations

- **OpenTelemetry integration:** Adding OTEL tracing and metrics would allow standard pipeline integration. The custom `BatchHandler` could be replaced with an OTEL exporter.
- **Correlation IDs:** Adding a unique request ID generated at router entry and propagated through `RequestEvent` context would enable request path reconstruction.
- **Prometheus metrics:** Exposing a `/metrics` endpoint with request latency histograms, error counters, and DB connection pool stats would enable standard alerting.
- **Structured log shipping:** The current SQLite-only storage makes log aggregation difficult. A pluggable log handler (interface-based `WriteFunc`) would allow external log shippers.
- **Health check depth:** The `/api/health` endpoint could be extended to check DB connectivity, disk space, and aux DB health.

## Questions / Gaps

1. **No distributed tracing:** No evidence of OpenTelemetry, Zipkin, Jaeger, or any distributed tracing framework.
2. **No metrics endpoint:** No Prometheus or statsd exposition. No `/metrics` endpoint.
3. **No correlation ID propagation:** `RequestInfo` struct (`core/event_request.go:167`) has no ID field.
4. **No profiler endpoints:** No pprof, no trace endpoint for live debugging.
5. **Async boundaries opaque:** Goroutines use `context.Background()` and lack correlation context.
6. **Log storage not queryable externally:** SQLite-only storage prevents integration with external log aggregation systems (ELK, Splunk, CloudWatch).
7. **No error budget alerting:** No configuration for alerting on error rate thresholds.

---

Generated by `dimensions/09-observability-operational-visibility.md` against `pocketbase`.