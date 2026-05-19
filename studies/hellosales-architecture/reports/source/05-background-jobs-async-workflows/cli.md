# Source Analysis: cli

## Background Jobs & Async Workflows

### Source Info

| Field | Value |
|-------|-------|
| Name | cli |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/cli` |
| Language / Stack | Go |
| Analyzed | 2026-05-19 |

## Summary

The CLI does not implement a dedicated background job processing system with queues, workers, or a workflow orchestration engine. Instead, it relies on **external API-based job processing** via HTTP calls to a remote Copilot Agent Interface (CAPI), **polling patterns with time.Ticker** for waiting on async operations, and **golang.org/x/sync/errgroup** for bounded concurrent operations. Retry is handled via `cenkalti/backoff/v4`, but dead-letter handling is not explicit.

## Rating

**4** — Basic implementation with significant gaps. The CLI delegates job execution to an external service and uses simple polling with backoff for async result retrieval. There is no durable job queue, no explicit dead-letter queue, no workflow/orchestration engine, and no built-in cron scheduling.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Job type definition | `Job` struct with ID, SessionID, Status, Result fields | `pkg/cmd/agent-task/capi/job.go:17-35` |
| Session type | `session` and `Session` types for in-flight agent tasks | `pkg/cmd/agent-task/capi/sessions.go:29-53` |
| Job submission | HTTP POST to external CAPI service | `pkg/cmd/agent-task/capi/client.go:15-16` |
| Exponential backoff | `backoff.NewExponentialBackOff()` with 10s max elapsed | `pkg/cmd/agent-task/create/create.go:207-261` |
| Constant backoff retry | `backoff.NewConstantBackOff()` for upload retries | `pkg/cmd/release/shared/upload.go:133-159` |
| Upload retry loop | `backoff.RetryWithData()` with 3 max retries | `internal/codespaces/api/api.go:99,1204-1215` |
| Worker pool | `errgroup.WithContext()` with `SetLimit(numWorkers)` | `pkg/cmd/release/shared/upload.go:114-131` |
| Fan-out fetch workers | 10 concurrent workers via errgroup | `pkg/cmd/status/status.go:272-379` |
| Parallel section loading | errgroup for concurrent LoadNotifications/Events/SearchResults | `pkg/cmd/status/status.go:641-666` |
| Codespace state polling | `time.NewTicker(1 * time.Second)` polling loop | `internal/codespaces/states.go:37-108` |
| Codespace creation polling | ticker-based polling for provisioning | `internal/codespaces/api/api.go:820-855` |
| Heartbeat ticker | `time.Ticker` for keepalive notifications | `internal/codespaces/rpc/invoker.go:271-293` |
| Run watch polling | `time.Sleep(duration)` in watch loop | `pkg/cmd/run/watch/watch.go:154-186` |
| gRPC for codespaces | `google.golang.org/grpc` for internal RPC | `internal/codespaces/rpc/invoker.go:1-313` |
| Backoff permanent error | `backoff.Permanent(err)` for non-retryable failures | `pkg/cmd/agent-task/create/create.go:240` |

## Answers to Dimension Questions

### 1. How are background jobs submitted, tracked, and completed?

Jobs are **not managed locally** — the CLI submits jobs via HTTP POST to an external CAPI (Copilot Agent Interface) service at `pkg/cmd/agent-task/capi/client.go:15-16`. The job struct (`pkg/cmd/agent-task/capi/job.go:17-35`) contains fields for `ID`, `Status`, `Result`, and `ErrorInfo`. The CLI **polls** for job completion via `fetchJobWithBackoff()` at `pkg/cmd/agent-task/create/create.go:247-261`, which repeatedly calls `client.GetJob()` until the `PullRequest.Number` is populated or a timeout elapses.

No local queue, job store, or persistence layer for job state exists within the CLI itself.

### 2. What happens when a job fails — retry, dead-letter, or compensate?

Retry is implemented via **exponential and constant backoff** using `cenkalti/backoff/v4`. In `pkg/cmd/agent-task/create/create.go:207-261`, `fetchJobWithBackoff` retries when `j.PullRequest.Number == 0` (the "not ready" condition). Non-retryable errors are marked with `backoff.Permanent(err)` at line 240, causing immediate failure.

**No dead-letter queue mechanism** was found. Failed jobs are surfaced as errors to the caller but are not stored, logged to a DLQ, or subject to compensation logic. The CLI does not implement saga or compensation patterns.

### 3. How does the system handle job duration limits and cancellation?

Context-based cancellation is used throughout. The `backoff.WithContext()` pattern passes `ctx` into retry loops, respecting `ctx.Canceled` and `ctx.DeadlineExceeded`. For example, `fetchJobWithBackoff` uses `backoff.WithContext(bo, ctx)` at `pkg/cmd/agent-task/create/create.go:248`.

Codespace creation uses an explicit 2-minute timeout at `internal/codespaces/api/api.go:823`:
```go
ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
```

The heartbeat in `internal/codespaces/rpc/invoker.go:271-293` uses a `time.Ticker` that terminates when `ctx.Done()` is received. There is no per-job hard duration limit enforced by the CLI itself — limits are imposed by the remote API or via `context.WithTimeout`.

### 4. Are workflows composed of multiple steps with state management?

**No workflow/orchestration engine** is present. The CLI uses `golang.org/x/sync/errgroup` for **concurrency patterns** (fan-out worker pools and parallel section loading), but these are not stateful multi-step workflows with durable execution. Each concurrent operation is fire-and-forget within a single process context.

Examples:
- `ConcurrentUpload()` at `pkg/cmd/release/shared/upload.go:114-131` uses `errgroup.SetLimit(numWorkers)` to bound concurrency, but each upload is independent.
- `status.go:641-666` loads notifications, events, and search results in parallel but does not track per-step state.

The CLI does not compose multiple steps into durable workflows — it would need an external orchestrator (Temporal, etc.) for that.

### 5. How is backpressure applied when the system is overloaded?

Backpressure is applied only through **bounded concurrency limits** in `errgroup`. In `ConcurrentUpload()` at `pkg/cmd/release/shared/upload.go:121`, `g.SetLimit(numWorkers)` throttles concurrent uploads. The `fetchWorkers := 10` constant at `pkg/cmd/status/status.go:272` similarly caps parallel fetch goroutines.

**No queue-based backpressure** exists — if workers are saturated, new requests are rejected immediately (via `errgroup.WithContext` context cancellation) rather than being enqueued. There is no in-process queue that can buffer or shed load.

## Architectural Decisions

- **External job execution**: The CLI delegates actual job execution to a remote CAPI service rather than managing jobs itself. This keeps the CLI lightweight but introduces dependency on external service availability.
- **Polling over push notifications**: Instead of webhooks or server-sent events, the CLI polls for job completion using backoff. This is simpler but less efficient and can miss real-time updates.
- **No local persistence**: The CLI is stateless with respect to jobs. It does not store job history, progress, or results locally.
- **errgroup for concurrency**: Go's `errgroup` is used for structured concurrent operations with cancellation propagation, but it is not a queue or worker system.

## Notable Patterns

- **Exponential backoff polling** (`pkg/cmd/agent-task/create/create.go:207-261`): Polls an external API until a condition is met, with configurable max elapsed time, initial interval, and multiplier.
- **Bounded worker pools** (`pkg/cmd/release/shared/upload.go:114-131`): Uses `errgroup.SetLimit()` to cap concurrent operations.
- **Context-propagated cancellation**: All async operations respect `ctx.Done()` for clean shutdown.
- **Fan-out/fan-in patterns** via errgroup in `pkg/cmd/status/status.go:272-379`.

## Tradeoffs

- **Simplicity vs. reliability**: No dead-letter queue, no durable storage, no retry persistence means failed jobs cannot be recovered across CLI restarts or process crashes.
- **Polling efficiency**: Polling with backoff is simpler than subscriptions but creates unnecessary API load and introduces latency between job completion and detection.
- **No observability into remote job failures**: The CLI can report that a job failed but has no visibility into why the remote service failed it, unless the error info is embedded in the job response.
- **Delegated orchestration**: By offloading job execution to CAPI, the CLI cannot implement custom workflow logic, conditional branching, or saga compensation — it is entirely dependent on the remote service's capabilities.

## Failure Modes / Edge Cases

1. **External CAPI service downtime**: Jobs cannot be submitted or tracked while the service is unavailable. The CLI will retry with backoff but cannot proceed independently.
2. **Polling timeout**: If `fetchJobWithBackoff` exhausts its 10-second max elapsed time (configured at `pkg/cmd/agent-task/create/create.go:215`), it returns `(nil, nil)` — a silent "not yet ready" rather than a clear error.
3. **Context cancellation race**: If context is cancelled during a polling loop, the operation fails gracefully, but in-flight API calls may still complete or race.
4. **Non-retryable errors surfacing**: Errors wrapped with `backoff.Permanent()` fail immediately, which is correct for permanent failures but provides no graceful degradation.
5. **Goroutine leaks in fan-out**: If the producer panics in the fan-out pattern at `pkg/cmd/status/status.go:272-379`, the worker goroutines may leak since `errgroup.WithContext` cancellation depends on context from the group creator.

## Future Considerations

- Implement a **local job queue** (e.g., using a local SQLite or Badger store) to persist pending jobs and allow CLI restarts without losing job state.
- Add a **dead-letter queue** mechanism to capture permanently failed jobs for later inspection or manual retry.
- Introduce a **workflow orchestration** layer (e.g., Temporal) for multi-step workflows requiring durable execution, state management, and saga patterns.
- Replace polling with **server-sent events (SSE)** or **webhooks** for more efficient async notification.
- Add **load shedding** via a bounded work queue that rejects new jobs when saturated, rather than unbounded goroutine spawn.

## Questions / Gaps

1. **No evidence of job persistence across restarts**: Jobs exist only in memory and in-flight to the remote CAPI service. If the CLI process crashes, job state is lost.
2. **No evidence of scheduled/cron jobs**: All async work is triggered on-demand by user commands. There is no built-in scheduler for periodic background work.
3. **No evidence of distributed worker infrastructure**: The CLI is a single-process tool. There is no mechanism to coordinate job processing across multiple CLI instances.
4. **No evidence of job priority or queuing**: All submitted jobs appear to have equal priority. No priority queue or preemption mechanism exists.
5. **No evidence of job progress streaming**: While the CLI can follow logs via `fetchJobSessionURL`, there is no formal mechanism to stream incremental job progress back to the caller.

---

Generated by `05-background-jobs-async-workflows.md` against `cli`.