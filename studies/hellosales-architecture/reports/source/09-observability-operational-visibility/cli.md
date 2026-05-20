# Source Analysis: cli

## Observability & Operational Visibility

### Source Info

| Field | Value |
|-------|-------|
| Name | cli |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/cli` |
| Language / Stack | Go (GitHub CLI) |
| Analyzed | 2026-05-20 |

## Summary

The GitHub CLI (`gh`) has a well-structured telemetry system built on a custom `ghtelemetry` package that records command invocations and their dimensions. Observability is primarily achieved through structured telemetry events (not traditional logging), with OpenTelemetry tracing limited to the codespaces API client. There is no centralized structured logging framework, no metrics collection infrastructure, and no health/readiness endpoints. The system provides visibility into command usage and API request traces, but lacks comprehensive observability for production debugging of a CLI tool.

## Rating

**4/10** — Basic implementation with significant gaps. Telemetry infrastructure is solid and well-tested, but there is no structured logging, no distributed tracing outside codespaces, no Prometheus metrics, no health endpoints, and correlation ID propagation is limited.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Telemetry - Event Recording | `EventRecorder` interface with `Record(event Event)` method | `internal/gh/ghtelemetry/telemetry.go:17-20` |
| Telemetry - Command Tracking | `RecordTelemetry` wraps cobra commands to record invocation with command path and flags | `pkg/cmdutil/telemetry.go:12-40` |
| Telemetry - Common Dimensions | Device ID, invocation ID, OS, arch added to every event | `internal/telemetry/telemetry.go:226-234` |
| Telemetry - Service Implementation | `service` struct buffers events, Flush() sends via flusher function | `internal/telemetry/telemetry.go:254-332` |
| Telemetry - Log Mode | `LogFlusher` writes JSON payloads to stderr for debugging | `internal/telemetry/telemetry.go:172-199` |
| Telemetry - GitHub Flush Mode | `GitHubFlusher` spawns detached `gh send-telemetry` subprocess | `internal/telemetry/telemetry.go:201-210` |
| Telemetry - Disabled on GHES | `telemetryDisablerTransport` disables telemetry when enterprise host detected | `api/http_client.go:160-169` |
| Tracing - OpenTracing | `opentracing.StartSpanFromContext` used in codespaces API | `internal/codespaces/api/api.go:1184` |
| Tracing - Span Naming | Span names constructed from API path patterns (e.g., `/repos/*/codespaces`) | `internal/codespaces/api/api.go:366-395` |
| Tracing - Context Propagation | Spans started from incoming context, defer span.Finish() | `internal/codespaces/api/api.go:1184-1186` |
| Debug - GH_DEBUG env var | `IsDebugEnabled()` parses `GH_DEBUG` (and legacy `DEBUG`) for api/http logging | `utils/utils.go:10-29` |
| Debug - Verbose HTTP logging | `LogVerboseHTTP` option passed to HTTP client for detailed request/response logging | `api/http_client.go:48-52` |
| Health - None found | No health check or readiness endpoint infrastructure | No evidence |

## Answers to Dimension Questions

### 1. Can an operator reconstruct a single request's full path through the system?

**Partially.** The codespaces API (`internal/codespaces/api/api.go:1182-1194`) uses OpenTracing spans with named segments (`/repos/*/codespaces`, `/user/codespaces/*/stop`), allowing request tracing within that subsystem. However, there is no system-wide correlation ID that propagates through all commands and API calls. The telemetry system records `invocation_id` per CLI invocation (`internal/telemetry/telemetry.go:226`), but this is not propagated to API requests as a correlation header. Outside codespaces, there is no distributed tracing infrastructure.

### 2. How are structured logs routed, stored, and queried in production?

**No structured logging exists.** The CLI uses stderr for user-facing output and debug HTTP logs (`api/http_client.go:49`). When `GH_TELEMETRY=log` is set, telemetry payloads are written to stderr as colored JSON (`internal/telemetry/telemetry.go:172-199`). There is no structured logging library (no slog, no zap), no log routing, no centralized log storage, and no log querying capability. This is a CLI tool rather than a long-running service, so traditional server-side log aggregation is not applicable.

### 3. What metrics indicate system health vs performance degradation?

**No metrics collection.** There are no Prometheus counters, gauges, or histograms. The closest thing to metrics is the telemetry system which records event counts (command invocations with dimensions like `is_tty`, `ci`, `agent`) but this is usage telemetry, not systems health metrics. There is no alerting integration, no dashboards, and no performance degradation indicators. Telemetry sampling rate (`GH_TELEMETRY_SAMPLE_RATE`) can be adjusted but this controls data collection, not system monitoring.

### 4. How does observability cross async boundaries (queues, workflows)?

**Limited.** The codespaces API creates opentracing spans for each HTTP request (`internal/codespaces/api/api.go:1182-1194`). The `do()` method passes context with span to `httpClient.Do(req)` so traces could propagate to downstream services if they read the context. However, there is no evidence of message queue instrumentation, no workflow tracing, and no span context propagation via HTTP headers (W3C TraceContext). The telemetry system operates synchronously at command end via `defer telemetryService.Flush()` (`internal/ghcmd/cmd.go:130`), with events buffered in-memory and sent via detached subprocess.

### 5. What debugging tooling exists for production issues?

**Minimal.** Debugging tools include:
- `GH_DEBUG=api` for verbose HTTP request/response logging (`utils/utils.go:16`, `api/http_client.go:44-46`)
- `GH_TELEMETRY=log` to see telemetry payloads instead of sending them (`pkg/cmd/root/help_topic.go:120`)
- DNS error detection with suggestions (`internal/ghcmd/cmd.go:283-289`)
- No built-in trace or profile collection

## Architectural Decisions

1. **Telemetry-first observability**: Rather than building traditional logging/metrics infrastructure, the project invested in a telemetry system that records command usage. This makes sense for a CLI tool where user behavior analysis is more valuable than system health monitoring.

2. **Detached subprocess for telemetry delivery**: Telemetry is sent via `gh send-telemetry` subprocess spawned with `cmd.Process.Release()` (`internal/telemetry/telemetry.go:414`), ensuring telemetry doesn't block command execution or be visible in process arguments.

3. **Best-effort telemetry**: All errors in telemetry collection/sending are silently ignored (`internal/telemetry/telemetry.go:361`), ensuring telemetry never impacts user experience.

4. **Context-aware span propagation in codespaces only**: OpenTracing is used exclusively in `internal/codespaces/api/api.go`, suggesting observability was added reactively for that feature rather than as系统性 infrastructure.

5. **Device ID via atomic file linking**: Device ID generation uses `os.Link()` for atomic creation (`internal/telemetry/telemetry.go:75`) to handle concurrent invocations safely.

## Notable Patterns

- **Event recorder pattern**: Commands receive `ghtelemetry.EventRecorder` interface and record events with dimensions (`pkg/cmdutil/telemetry.go:31-37`)
- **Flusher strategy**: `LogFlusher` and `GitHubFlusher` are injected based on telemetry state, enabling easy testing and debugging modes
- **Sample rate based on invocation ID**: Hash of invocation ID determines sample bucket, ensuring entire invocation is included or excluded as a unit (`internal/telemetry/telemetry.go:236-237`)
- **HTTP transport wrapping**: Auth headers, cache TTL, and telemetry disabler are implemented as `RoundTripper` wrappers (`api/http_client.go:95-127`)

## Tradeoffs

- **No structured logging**: While this reduces dependencies and complexity, it means production debugging relies on telemetry and debug flags rather than searchable logs
- **Telemetry vs metrics**: Investment went into usage telemetry rather than system metrics; appropriate for CLI but limits operational visibility
- **GHES automatic disable**: Enterprise users have telemetry silently disabled via `telemetryDisablerTransport` checking `ghauth.IsEnterprise()` on each request (`api/http_client.go:166-167`) — good for compliance but opaque to operators
- **No correlation IDs outside codespaces**: Only the codespaces API traces requests with OpenTracing; other API calls have no trace context

## Failure Modes / Edge Cases

- **Telemetry payload size bounded**: `maxPayloadSize = 16KB` (`internal/telemetry/telemetry.go:337`) prevents blocking on pipe buffer, but large command invocations with many flags could be silently truncated
- **Device ID race on first run**: Multiple concurrent invocations during first run use atomic linking trick, but losers read winner's file which could fail if disk I/O is slow (`internal/telemetry/telemetry.go:78-85`)
- **Telemetry state unknown to commands**: Commands check `isTelemetryDisabled(cmd)` via annotation (`pkg/cmdutil/telemetry.go:64-66`) but have no visibility into why — could silently drop events if config state changes mid-execution
- **Update checker runs in goroutine**: Background update check (`internal/ghcmd/cmd.go:146-152`) could leak goroutines if context is cancelled; errors only logged if `hasDebug`
- **No retry on telemetry send failure**: `SpawnSendTelemetry` silently returns on any error (`internal/telemetry/telemetry.go:402-405`), meaning telemetry can be lost without user knowledge

## Future Considerations

1. **Add structured logging**: A lightweight structured logger (slog is in stdlib since Go 1.21) could provide debug-level traces without major complexity
2. **Correlation ID header propagation**: Adding trace context to all API requests would enable system-wide request tracing
3. **Health check command**: A `gh doctor` or `gh status` command could check auth, config, and connectivity — aligns with existing `status` command pattern
4. **Prometheus metrics endpoint**: Even a CLI could expose a `/metrics` path if run as a daemon (for `gh_codespace` scenarios)
5. **Sampling rate visibility**: Operators currently have no way to know what percentage of telemetry is being collected without inspecting debug output

## Questions / Gaps

- **No evidence of log aggregation strategy**: How are CLI logs collected in CI/GitHub Actions environments?
- **No evidence of tracing backend**: What receives the OpenTracing spans from codespaces? Jaeger? Zipkin? OTEL Collector?
- **No evidence of alerting**: Are there any alerts based on telemetry data?
- **No evidence of crash reporting**: If the CLI crashes, is there any mechanism to report the crash?
- **GHES telemetry opt-out**: How do GHES admins verify telemetry is actually disabled? Is there audit logging?

---

Generated by `dimensions/09-observability-operational-visibility.md` against `cli`.