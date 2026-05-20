# Source Analysis: pocketbase

## Concurrency Model

### Source Info

| Field | Value |
|-------|-------|
| Name | pocketbase |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/pocketbase` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

PocketBase demonstrates a mature concurrency model built on Go's native primitives. The architecture employs bounded semaphore patterns for resource-intensive operations, errgroup for fan-out operations, context propagation for cancellation, and a custom fire-and-forget goroutine helper with panic recovery. The realtime subsystem uses chunked client broadcasting with concurrent processing, while the JSVM plugin implements a simple VM pool. Graceful shutdown is handled via sync.WaitGroup and explicit context cancellation.

## Rating

**7/10** — Good implementation with minor issues. The concurrency model is thoughtful and covers most use cases, but lacks formal worker pools for general tasks, relies heavily on FireAndForget without always tracking goroutine lifecycles, and could benefit from more systematic backpressure mechanisms beyond file operations.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| FireAndForget goroutine helper | `FireAndForget(f func(), wg ...*sync.WaitGroup)` with panic recovery | `tools/routine/routine.go:13` |
| Goroutine lifecycle - shutdown signal | Signal notification goroutine | `pocketbase.go:189-195` |
| Graceful shutdown WaitGroup | `var wg sync.WaitGroup` for server shutdown | `apis/serve.go:168` |
| Context cancellation base | `baseCtx, cancelBaseCtx := context.WithCancel(context.Background())` | `apis/serve.go:142` |
| HTTP server graceful shutdown | Context timeout for shutdown: `context.WithTimeout(context.Background(), 1*time.Second)` | `apis/serve.go:176` |
| Cron ticker goroutine | Goroutine loop with channel stop signal | `tools/cron/cron.go:194-203` |
| Cron job execution | `go j.Run()` per due job | `tools/cron/cron.go:225` |
| Semaphore - thumb generation | `thumbGenSem *semaphore.Weighted` | `apis/file.go:39` |
| Semaphore - file deletion | `deleteSem := semaphore.NewWeighted(maxFilesDeleteWorkers)` | `core/base.go:1310` |
| Singleflight - thumb deduplication | `thumbGenPending *singleflight.Group` | `apis/file.go:38` |
| Errgroup - realtime broadcast | `group := new(errgroup.Group)` | `apis/realtime.go:231` |
| Errgroup - client chunk processing | `group.Go(func() error {...})` | `apis/realtime.go:234-249` |
| VM pool | `vmsPool` struct with busy flag | `plugins/jsvm/pool.go:15-19` |
| FireAndForget - backup restore | `routine.FireAndForget(func() {...})` | `apis/backup.go:146` |
| FireAndForget - installer | `routine.FireAndForget(func() {...})` | `apis/serve.go:258` |
| FireAndForget - file delete | `routine.FireAndForget(func() {...})` | `core/base.go:1331` |
| FSNotify watcher goroutine | `go func() { for { select {...} } }()` | `core/notify_watcher.go:155` |
| SSE connection idle timer | `time.NewTimer(ce.IdleTimeout)` with channel select | `apis/realtime.go:103-149` |
| DB query context timeout | `cancelCtx, cancel := context.WithTimeout(context.Background(), timeout)` | `core/db_retry.go:23` |
| OAuth context timeout | `ctx, cancel := context.WithTimeout(e.Request.Context(), 30*time.Second)` | `apis/record_auth_with_oauth2.go:76` |
| Subscription broker | `store *store.Store[string, Client]` for concurrent access | `tools/subscriptions/broker.go:12` |
| Mutex for VM pool items | `item.mux.Lock()` / `item.mux.Unlock()` | `plugins/jsvm/pool.go:44-70` |
| RWMutex for cron jobs | `mux sync.RWMutex` | `tools/cron/cron.go:27` |

## Answers to Dimension Questions

### 1. How does the project manage goroutine lifetimes without leaking?

**Evidence:** PocketBase uses several strategies:

- **`FireAndForget` with panic recovery** (`tools/routine/routine.go:13-35`): Spawns goroutines with defer/recover to prevent leaked panics. Optional `sync.WaitGroup` tracking allows callers to wait for completion.

- **Context cancellation for request-scoped work** (`apis/realtime.go:54-56`): Creates a cancellable context per SSE connection that is tied to the request lifecycle.

- **Channel-based stop signals for long-running services** (`tools/cron/cron.go:196-198`): The cron ticker uses `tickerDone <- true` to signal goroutine termination.

- **FSNotify watcher cleanup** (`core/notify_watcher.go:54-55`): Explicit `notifyWatcher.Close()` in termination hook.

**Gap:** `FireAndForget` is used extensively without always passing a `WaitGroup`, making it difficult to verify goroutine completion on shutdown. The comment at `core/base.go:1321` explicitly states "note: for now assume no context cancellation" for file deletion workers.

### 2. Are there bounded concurrency patterns when handling many tasks?

**Yes.** PocketBase uses semaphores for resource-intensive operations:

- **Thumbnail generation** (`apis/file.go:27-41`): Uses `semaphore.NewWeighted(maxWorkers)` where `maxWorkers` defaults to `runtime.NumCPU() + 2`, controlled by `PB_THUMBS_MAX_WORKERS` env var.

- **File deletion** (`core/base.go:1305-1310`): Uses `semaphore.NewWeighted(maxFilesDeleteWorkers)` where `maxFilesDeleteWorkers` defaults to 2000, controlled by `PB_FILES_DELETE_MAX_WORKERS` env var.

- **Singleflight deduplication** (`apis/file.go:38`): Uses `singleflight.Group` to prevent duplicate thumb generation for concurrent requests for the same file.

- **JSVM pool** (`plugins/jsvm/pool.go:22-33`): Pre-warms VM pool of configurable size for JavaScript execution reuse.

**Gap:** General HTTP request handling has no systematic bounded concurrency; backpressure is only applied to specific I/O-bound operations (thumb generation, file deletion).

### 3. How is cancellation propagated through multi-step operations?

**Evidence:**

- **HTTP Server shutdown** (`apis/serve.go:171-194`): Uses `cancelBaseCtx()` to cancel the base context, followed by `server.Shutdown(ctx)` with a 1-second timeout.

- **SSE connections** (`apis/realtime.go:54-56`): Creates `cancelCtx, cancelRequest := context.WithCancel(e.Request.Context())` and defers `cancelRequest()` to cancel on function return. The select loop at lines 106-149 listens on `ce.Request.Context().Done()` for request cancellation.

- **DB queries with timeout** (`core/db_retry.go:23`): Uses `context.WithTimeout(context.Background(), timeout)` for database retry logic.

- **OAuth flows** (`apis/record_auth_with_oauth2.go:76, 302`): Uses `context.WithTimeout(e.Request.Context(), 30*time.Second)` and `context.WithTimeout(context.Background(), 10*time.Second)`.

- **Backup operations** (`apis/backup.go:34, 84, 100, 131, 151`): All filesystem operations use explicit timeouts.

### 4. What patterns prevent channel deadlocks or goroutine leaks?

**Evidence:**

- **FireAndForget with panic recovery** (`tools/routine/routine.go:23-31`): Every spawned goroutine has `defer recover()` to prevent unhandled panics from crashing the process.

- **Buffered channels for signals** (`pocketbase.go:186`): `done := make(chan bool, 1)` — buffered channel prevents sender blocking if receiver is already done.

- **Select with default / channel closes** (`apis/realtime.go:106-149`): The SSE message loop uses `select` with `ok` check on channel receive to detect closed channels: `msg, ok := <-ce.Client.Channel()`.

- **Debounced file watcher** (`core/notify_watcher.go:172`): Uses `time.AfterFunc(50*time.Millisecond, ...)` to debounce and avoid concurrent modification issues.

- **Deferred cleanup** (`core/notify_watcher.go:55-59`): Always closes watcher and removes temp files in the termination hook, even on error.

**Potential issue:** The cron ticker's goroutine (`tools/cron/cron.go:194-203`) sends to `tickerDone` without checking if the ticker was already stopped, which could theoretically panic if Stop() is called twice. However, `Stop()` is protected by checking `ticker == nil`.

### 5. How does the system handle backpressure under load?

**Evidence:**

- **Semaphore acquisition with timeout** (`apis/file.go:230-231`): `ctx, cancel := context.WithTimeout(e.Request.Context(), api.thumbGenMaxWait)` followed by `api.thumbGenSem.Acquire(ctx, 1)` — requests wait up to 60 seconds (default) before failing.

- **Errgroup with chunking** (`apis/realtime.go:229-252`): Clients are chunked into groups of 150 (`clientsChunkSize` at `apis/realtime.go:26`) and processed concurrently, but each chunk is processed sequentially within the goroutine.

- **Optimistic deletes** (`core/base.go:1330-1341`): File deletions are run asynchronously with `FireAndForget` to avoid blocking the delete transaction. Errors are logged but do not propagate.

- **HTTP Server timeouts** (`apis/serve.go:152-154`): `WriteTimeout: 5 * time.Minute`, `ReadTimeout: 5 * time.Minute`, `ReadHeaderTimeout: 1 * time.Minute` provide server-level backpressure.

**Gap:** No explicit queue depth limiting or 429 responses for thumbs/file operations that hit semaphore limits. Requests simply fail after timeout. No circuit breaker pattern observed.

## Architectural Decisions

1. **FireAndForget as primary goroutine spawn mechanism**: PocketBase centralizes goroutine creation through `routine.FireAndForget`, which provides panic recovery. This is a pragmatic choice for non-critical background tasks, but the optional WaitGroup is not always used, making lifecycle tracking informal.

2. **Semaphore + Singleflight for expensive I/O**: Bounded concurrency for thumbnail generation combines semaphore (concurrency limit) with singleflight (deduplication). This is a well-known pattern for preventing thundering herd on cache-like operations.

3. **Chunked errgroup for realtime broadcasting**: The system chunks connected clients and processes each chunk in a separate goroutine, allowing parallel fan-out while preserving access check ordering within each chunk (`realtime.go:601` comment: "note: not executed concurrently to avoid races").

4. **FSNotify-based multi-instance synchronization**: Uses filesystem watches as a cross-platform mechanism for notifying multiple PB instances to reload settings/collections, avoiding distributed locking complexity.

5. **DB connection pool sizing via config**: `DefaultDataMaxOpenConns = 120`, `DefaultDataMaxIdleConns = 15` at `core/base.go:33-34` — reasonable defaults for SQLite with并发.

## Notable Patterns

- **JSVM pool** (`plugins/jsvm/pool.go`): Simple mutex-based pool with busy flag, creates new VM on demand if all pool items are busy. No automatic pool size growth limits.

- **Cron with RWMutex protection** (`tools/cron/cron.go`): Uses `sync.RWMutex` for concurrent job reads but exclusive writes for modifications like Add/Remove.

- **Deferred context cancellation**: `defer cancel()` is consistently used with `context.WithTimeout/WithCancel` to ensure cleanup.

- **Chunked client processing** (`tools/subscriptions/broker.go:29-31`): `ChunkedClients()` splits clients into chunks for batch processing.

## Tradeoffs

1. **FireAndForget simplicity vs. observability**: Fire-and-forget goroutines are easy to use but make it hard to track completion or failures. Errors in fire-and-forget tasks are only logged (`core/base.go:1335`).

2. **Semaphore limits vs. user experience**: Bounded semaphore prevents resource exhaustion but requests fail with timeout rather than queuing, potentially poor UX under load.

3. **Errgroup broadcasting vs. ordering**: Processing clients in parallel via errgroup improves throughput but access checks within each chunk are explicitly sequential to "ensure that the access checks are applied for the current record db state" (`realtime.go:601-602`).

4. **Optimistic file deletion vs. reliability**: Files are deleted asynchronously to avoid blocking transactions (`core/base.go:1330-1341`), but failures are logged and not retried or reported to users.

5. **No formal worker pool framework**: Uses raw goroutines + semaphore rather than a structured worker pool library, requiring manual lifecycle management per operation.

## Failure Modes / Edge Cases

1. **Goroutine leak potential**: If `FireAndForget` is called after app termination or during shutdown, goroutines may run in an undefined state with app components already cleaned up.

2. **Semaphore deadlock under extreme load**: If `PB_THUMBS_MAX_WAIT` (60s default) is too short, legitimate thumb generation requests fail. No queue or retry mechanism.

3. **Cron goroutine leak if Start/Stop racing**: The cron `Start()` method calls `Stop()` then spawns a timer goroutine. If `Stop()` is called concurrently, the ticker reference may be nil before the new goroutine sets it.

4. **FSNotify watcher races on shutdown**: The watcher goroutine at `notify_watcher.go:155` checks `!app.IsBootstrapped()` but there's a brief window where the app might be terminating.

5. **VM pool busy-spin on saturated pool**: If all VMs are busy in `plugins/jsvm/pool.go`, the code creates a new one-off VM (`pool.go:62`) rather than waiting. Under sustained high load, this could lead to unbounded VM creation.

6. **SSE connection memory on abandoned clients**: Connected clients are tracked in the broker until explicitly disconnected. If network failures prevent clean disconnect, clients may accumulate until idle timeout (5 minutes).

## Future Considerations

1. **Structured worker pool**: Consider adopting a formal worker pool (e.g., `github.com/oklog/run` or similar) for managing groups of goroutines with proper lifecycle control.

2. **Queue-based backpressure**: Instead of failing requests after timeout, consider a work queue with bounded depth and 503/Retry-After responses.

3. **Circuit breaker**: Add circuit breaker pattern for external service calls (OAuth, S3, email) to prevent cascading failures.

4. **Metrics instrumentation**: Add goroutine count, semaphore wait time, queue depth, and goroutine leak detection metrics.

5. **Context propagation verification**: Audit all `FireAndForget` calls to ensure they either don't need tracking or use the optional `WaitGroup`.

## Questions / Gaps

1. **No evidence found** of systematic goroutine leak detection or runtime health checks for concurrent operations. The system relies on manual tracking and logging.

2. **No evidence found** of priority-based goroutine scheduling or cancellation deadlines for non-I/O operations.

3. **No evidence found** of a formal semaphore for HTTP connection pooling limits beyond Go's default HTTP transport.

4. **Unclear** whether the VM pool's unbounded creation of new VMs under load (`plugins/jsvm/pool.go:62`) has been a problem in production.

---

Generated by `dimensions/06-concurrency-model.md` against `pocketbase`.