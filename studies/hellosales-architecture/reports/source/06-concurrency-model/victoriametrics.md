# Source Analysis: victoriametrics

## Concurrency Model

### Source Info

| Field | Value |
|-------|-------|
| Name | victoriametrics |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/victoriametrics` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

VictoriaMetrics demonstrates a mature and disciplined concurrency architecture built on Go's native primitives. The project employs structured worker pools with bounded concurrency, graceful goroutine lifecycle management via `syncwg.WaitGroup` and `stopCh` channels, semaphore patterns via buffered channels for insert/query rate limiting, and consistent `context.Context` usage for cancellation propagation. The architecture prioritizes resource bounding through configurable limits and implements proper backpressure via queuing timeouts. The codebase shows careful attention to preventing goroutine leaks through paired start/stop functions and explicit shutdown signaling.

## Rating

8/10 — Good implementation with minor issues. The concurrency model is well-structured with bounded worker pools, semaphore-based concurrency limiters, and proper lifecycle management. Some areas use raw `sync.WaitGroup` instead of the thread-safe `syncwg.WaitGroup` wrapper, and cancellation propagation could be more uniform across all components.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Worker Pool | Unmarshal workers using buffered channel and WaitGroup | `lib/protoparser/protoparserutil/unmarshal_work.go:24-50` |
| Worker Pool | Stream aggregation uses buffered channel for CPU-bound parallelism | `lib/streamaggr/streamaggr.go:370-376` |
| Worker Pool | Query workers with work-stealing pattern | `app/vmselect/netstorage/netstorage.go:122-162` |
| Bounded Concurrency | Semaphore pattern for insert limiting with timeout | `lib/writeconcurrencylimiter/concurrencylimiter.go:95-136` |
| Bounded Concurrency | Query concurrency limiter with queue duration timeout | `app/vmselect/main.go:69-162` |
| Lifecycle Management | Thread-safe WaitGroup wrapper for graceful shutdown | `lib/syncwg/syncwg.go:12-49` |
| Lifecycle Management | Storage uses WG.Add/Done for all operations | `app/vmstorage/main.go:197-213` |
| Lifecycle Management | Stale snapshots remover with explicit stop channel | `app/vmstorage/main.go:481-509` |
| Context Usage | Custom StopChanContext wrapping stop channel | `lib/contextutil/stop_chan_context.go:16-47` |
| Context Usage | Alert group evaluation with cancel propagation | `app/vmalert/rule/group.go:416-454` |
| Context Usage | Scrape cancellation via context | `lib/promscrape/scraper.go:447` |
| Graceful Shutdown | HTTP server graceful shutdown with timeout | `lib/httpserver/httpserver.go:267` |
| Sync Primitives | Storage uses sync.Mutex for index protection | `lib/storage/index_db.go:985` |
| Sync Primitives | RWMutex for read-heavy alert rule state | `app/vmalert/rule/group.go:53` |
| Object Pooling | Result pool for query results | `app/vmselect/netstorage/netstorage.go:187` |
| Object Pooling | Reader pool for concurrent insert limiting | `lib/writeconcurrencylimiter/concurrencylimiter.go:70` |
| Cache Shutdown | Working set cache uses stopCh and WaitGroup | `lib/workingsetcache/cache.go:61-62,384-386` |

## Answers to Dimension Questions

### 1. How does the project manage goroutine lifetimes without leaking?

VictoriaMetrics uses a disciplined approach to goroutine lifecycle management:

- **Paired Start/Stop functions**: The `lib/protoparser/protoparserutil/unmarshal_work.go:24-50` implements `StartUnmarshalWorkers()` and `StopUnmarshalWorkers()` — workers are started with a buffered channel and WaitGroup, and stopped by closing the channel and calling `Wait()`. This is the canonical pattern.

- **Explicit stop channels**: `lib/workingsetcache/cache.go:61-62` defines `stopCh chan struct{}` and `wg sync.WaitGroup`. The cache's `runWatchers()` method at line 154-162 spawns goroutines that exit when `<-c.stopCh` is received in their select statements (`cache.go:170,214,266`).

- **Thread-safe WaitGroup**: `lib/syncwg/syncwg.go:12-49` provides a mutex-protected `WaitGroup` wrapper that prevents data races when `Add()` is called concurrently with `Wait()`. The storage at `app/vmstorage/main.go:197` uses this `syncwg.WaitGroup` (line 152), and every storage operation is wrapped in `WG.Add(1)` / `WG.Done()` (e.g., line 210-212).

- **Graceful shutdown block**: `syncwg.WaitGroup.WaitAndBlock()` at line 42-47 provides an atomic "wait until done then prevent new additions" operation, used for storage shutdown at `app/vmstorage/main.go:330`.

No evidence of orphaned goroutines or unterminated worker loops was found in the implementation patterns.

### 2. Are there bounded concurrency patterns when handling many tasks?

Yes, VictoriaMetrics employs bounded concurrency across multiple components:

- **Insert concurrency limiting** at `lib/writeconcurrencylimiter/concurrencylimiter.go:95-136`: A buffered channel (`concurrencyLimitCh = make(chan struct{}, *maxConcurrentInserts)`) acts as a semaphore. `IncConcurrency()` obtains a token (line 106-131) with an optional queue timeout (`maxQueueDuration`). Default value is `2*cgroup.AvailableCPUs()` (line 19). This provides hard bounding on concurrent insert operations.

- **Query concurrency limiting** at `app/vmselect/main.go:69-162`: Similar semaphore pattern with `concurrencyLimitCh = make(chan struct{}, *maxConcurrentRequests)` where the default is `min(cgroup.AvailableCPUs()*2, 16)` (line 57). Requests that cannot acquire a slot wait up to `search.maxQueueDuration` (default 10s) before returning `503 Service Unavailable`.

- **Worker pool sizing** at `lib/protoparser/protoparserutil/unmarshal_work.go:28-29`: Worker count is bounded by `cgroup.AvailableCPUs()`, and work is distributed via a buffered channel of the same capacity.

- **Stream aggregation parallelism** at `lib/streamaggr/streamaggr.go:370`: Uses `make(chan struct{}, cgroup.AvailableCPUs())` to bound concurrent aggregator pushes.

All bounded concurrency mechanisms use CPU core detection to auto-tune within containerized environments.

### 3. How is cancellation propagated through multi-step operations?

VictoriaMetrics uses multiple cancellation mechanisms:

- **context.Context** in alert evaluation (`app/vmalert/rule/group.go:416-420`): `evalCtx, cancel := context.WithCancel(ctx)` creates a derived context for each evaluation iteration. The cancel is stored in `g.evalCancel` (line 418) and deferred (line 420). When the group is updated (line 454), a new context and cancel function are created.

- **Custom StopChanContext** at `lib/contextutil/stop_chan_context.go:16-47`: Wraps a stop channel (`<-chan struct{}`) into a `context.Context`. The context's `Done()` method returns the stop channel directly (line 33). This is used in backup operations (e.g., `lib/backup/s3remote/s3.go:193`).

- **Discovery cancellation** at `lib/promscrape/scraper.go:447`: `ctx, cancel := context.WithCancel(context.Background())` is created for the scrape loop. Cancellation is propagated to HTTP client requests via context deadlines in `lib/promscrape/client.go:123` (`context.WithDeadline(c.ctx, deadline)`).

- **HTTP request cancellation** at `app/vmselect/main.go:141`: `case <-r.Context().Done()` checks the request context for client cancellation while queued.

- **Channel-based cancellation**: The `stopCh chan struct{}` pattern (e.g., `lib/workingsetcache/cache.go:62`) provides simpler cancellation than context, used extensively in cache watchers and background workers.

The project does not appear to use `golang.org/x/sync/errgroup` for propagating errors across goroutine groups.

### 4. What patterns prevent channel deadlocks or goroutine leaks?

VictoriaMetrics uses several patterns to prevent concurrency hazards:

- **Buffered channels for signaling**: All worker pool channels are created with explicit capacity matching the worker count (`lib/protoparser/protoparserutil/unmarshal_work.go:29`, `lib/streamaggr/streamaggr.go:370`), preventing send-side blocking.

- **Non-blocking send with fallback** at `lib/writeconcurrencylimiter/concurrencylimiter.go:109-130`: Uses `select` with `default` case to attempt non-blocking acquisition first, then waits with timeout — avoiding unbounded blocking.

- **Explicit channel close for termination**: Workers exit when `range` over channel detects closure (`lib/protoparser/protoparserutil/unmarshal_work.go:32-34`). The channel is closed exactly once in `StopUnmarshalWorkers()` (`unmarshal_work.go:43`).

- **Stop channel pattern**: `stopCh` is closed exactly once in `Stop()` methods (e.g., `lib/workingsetcache/cache.go:385`) and all workers check it in `select` statements with `default` cases.

- **Deferred Done() calls**: Storage operations at `app/vmstorage/main.go:210-212` use `WG.Add(1)` before and `WG.Done()` after via defer, ensuring cleanup even on panics.

- **Panic recovery** at `app/vmselect/main.go:739-747`: The `proxyVMAlertRequests` function recovers from `http.ErrAbortHandler` and other panics, preventing goroutine termination due to panic.

No evidence of circular channel dependencies or send-after-close patterns was found in the core concurrency code.

### 5. How does the system handle backpressure under load?

VictoriaMetrics implements backpressure through queuing with bounded queues and timeout enforcement:

- **Insert backpressure** at `lib/writeconcurrencylimiter/concurrencylimiter.go:106-131`: When the concurrency limit is reached, the request waits up to `insert.maxQueueDuration` (default 1 minute). If the timeout expires, a `503 ServiceUnavailable` error is returned with actionable guidance (`"Possible solutions: to reduce workload; to increase compute resources..."`). Metrics track both limit reaches (`concurrencyLimitReached`) and timeouts (`concurrencyLimitTimeout`).

- **Query backpressure** at `app/vmselect/main.go:127-162`: Requests attempt non-blocking entry to the concurrency channel; if blocked, they wait up to `search.maxQueueDuration` (10 seconds default). If the queue is full, a `429 TooManyRequests` response is returned with a `Retry-After: 10` header. Metrics expose current capacity and queue length.

- **Queue duration timeout**: Both insert and query limiters use `timerpool.Get()` for efficient timer reuse (avoiding goroutine allocation per timer).

- **Work channel buffering** at `lib/protoparser/protoparserutil/unmarshal_work.go:29`: The `unmarshalWorkCh` has capacity `gomaxprocs`, so producers can enqueue work without blocking as long as workers are actively consuming. If the channel is full, producers would block — there is no explicit timeout on this path.

- **Client cancellation integration**: At `app/vmselect/main.go:141`, the request context is checked during queue wait, so if the client disconnects, they don't remain queued unnecessarily.

The backpressure strategy is "queue with timeout" rather than "reject immediately," which handles short bursts gracefully while preventing unbounded memory growth under sustained overload.

## Architectural Decisions

1. **Custom syncwg.WaitGroup over errgroup**: VictoriaMetrics chose to implement a thread-safe `WaitGroup` wrapper (`lib/syncwg/syncwg.go`) rather than using `golang.org/x/sync/errgroup`. This provides `Add()` safety from concurrent goroutines and a `WaitAndBlock()` operation for graceful shutdown. The tradeoff is more manual error handling since `errgroup` provides error collection.

2. **Channel-based lifecycle over context for workers**: The `stopCh chan struct{}` pattern is preferred over `context.Context` for internal worker goroutines. This is pragmatically simpler for internal components that don't need deadline tracking or value passing — context is reserved for request-scoped cancellation where HTTP integration is needed.

3. **Auto-tuning via cgroup.AvailableCPUs()**: Worker pool sizes default to `cgroup.AvailableCPUs()` or multiples thereof, making the system self-configuring for containerized deployments without requiring manual tuning.

4. **Semaphore via buffered channel over struct{}**: The concurrency limiting uses `chan struct{}` rather than a custom semaphore type. This is idiomatic Go that integrates cleanly with `select` statements for non-blocking try-acquire patterns.

5. **sync.Pool for object reuse**: High-frequency objects (query results, insert context pool, reader wrappers) use `sync.Pool` to reduce GC pressure from short-lived allocations.

## Notable Patterns

- **Worker pool with channel distribution**: `lib/protoparser/protoparserutil/unmarshal_work.go:24-50` — classic channel-based worker pool where work is sent via channel to available workers.

- **Work-stealing in parallel query execution**: `app/vmselect/netstorage/netstorage.go:122-162` — workers first process their own channel, then steal work from other workers' channels. Notably, `runtime.Gosched()` is explicitly NOT called (line 143-146 comment explains why).

- **Reader wrapper for concurrency control**: `lib/writeconcurrencylimiter/concurrencylimiter.go:32-92` — wraps an `io.Reader` with `GetReader()`/`PutReader()` calls that manage concurrency tokens before/after each read, effectively bounding concurrent reads.

- **stopCh context adapter**: `lib/contextutil/stop_chan_context.go:16-47` — converts a plain stop channel into a `context.Context`, bridging the channel-based and context-based cancellation worlds.

- **Metric-guided cache mode switching**: `lib/workingsetcache/cache.go:259-360` — a background watcher monitors cache fill ratio and automatically transitions from split-mode (two half-size caches) to whole-mode (one full-size cache) when capacity exceeds 90%.

## Tradeoffs

1. **No errgroup error collection**: Components using `sync.WaitGroup` must manually track and propagate errors. The `syncwg.WaitGroup` provides no error collection mechanism, so error handling is scattered across call sites.

2. **Channel-based workers lack built-in panics recovery**: Worker goroutines in `lib/protoparser/protoparserutil/unmarshal_work.go:31-34` process items from a channel but have no panic recovery. If a worker panics, the entire process could crash. This is mitigated by careful input validation but represents a single-point-of-failure.

3. **Queue-duration timeout not configurable per-request**: The `search.maxQueueDuration` and `insert.maxQueueDuration` are global flags applied to all requests. High-priority requests cannot request a longer queue wait.

4. **UnmarshalWork channel has no producer timeout**: The `unmarshalWorkCh` at `lib/protoparser/protoparserutil/unmarshal_work.go:29` is unbuffered relative to workers but producers can block indefinitely if workers are slow and the channel fills. No timeout exists for producers.

5. **Storage WG pattern is advisory for readers**: `app/vmstorage/main.go:197` comments say "Every storage call must be wrapped into WG.Add(1) ... WG.Done()". But this is convention enforced by code review, not enforced by the compiler. Missing wrappers would not cause compilation errors but would cause shutdown hangs.

## Failure Modes / Edge Cases

- **Shutdown hang on missing WG.Done()**: If any code path calling storage operations fails to call `WG.Done()` after `WG.Add(1)`, `app/vmstorage/main.go:330` (`WG.WaitAndBlock()`) will hang indefinitely. This is partially mitigated by the `syncwg.WaitGroup.WaitAndBlock()` which blocks new `Add()` calls, making the issue visible quickly.

- **Panic in worker goroutine**: If a worker goroutine panics (e.g., in `lib/protoparser/protoparserutil/unmarshal_work.go:31-34`), the `sync.WaitGroup` does not recover. The panic propagates to the GOMAXPROCS stack and crashes the process.

- **Channel closure races**: While Go's channel closure semantics are well-understood, the pattern of closing `stopCh` in `Stop()` methods and checking it in `select` statements is safe only if all goroutines have already checked it or are guaranteed to check it before the channel is closed. The pattern is sound but requires discipline.

- **Timer resource management**: The use of `timerpool.Get()` at `lib/writeconcurrencylimiter/concurrencylimiter.go:116` requires that every code path that obtains a timer also returns it via `timerpool.Put()`. Missing return paths (e.g., early returns) could leak timers back to the pool.

- **Context cancellation in backup operations**: At `lib/backup/s3remote/s3.go:193` and similar, the context is stored in the struct and only canceled on `MustStop()`. If the context is canceled externally, the stored cancel function becomes a no-op, and the backup goroutine may continue until explicit `MustStop()`.

## Future Considerations

1. **Standardize on errgroup for multi-goroutine operations**: Adopting `golang.org/x/sync/errgroup` would provide automatic error collection and cancellation propagation across goroutine groups, reducing boilerplate and improving error handling consistency.

2. **Add panic recovery wrappers to worker pools**: Wrapping worker goroutines with `defer func() { recover() }()` would prevent a single panicking worker from crashing the entire process and would make the system more resilient to malformed input.

3. **Per-request queue timeout override**: Allowing high-priority requests to specify a longer queue wait would improve tail latency for latency-sensitive workloads.

4. **Instrument unmarshalWorkCh queue length**: The worker pool channel at `lib/protoparser/protoparserutil/unmarshal_work.go:29` has no metrics exposing its queue length, making it difficult to diagnose producer backpressure in production.

5. **Enforce WG.Add/WG.Done pattern via linter**: A static analysis tool could detect storage operation call sites that don't properly wrap calls with WaitGroup lifecycle, catching the shutdown hang issue at code review time rather than runtime.

## Questions / Gaps

1. **No evidence of distributed tracing integration**: The concurrency model does not appear to propagate tracing context through goroutine boundaries. If tracing spans are created per request, they may not be correctly continued across worker pool execution.

2. **No explicit memory bounding on work queues**: While `concurrencyLimitCh` bounds the number of concurrent operations, the internal work channels (e.g., `unmarshalWorkCh`) could theoretically grow unbounded if production exceeds consumption. No memory-based backpressure exists on these channels.

3. **Limited evidence of load shedding**: Under extreme load, the system relies on queue timeouts to shed load. There is no evidence of adaptive load shedding (e.g., reducing quality of service under memory pressure) or circuit breakers.

4. **No observability into WaitGroup blockages**: The `syncwg.WaitGroup` provides no metrics or logging when `Wait()` blocks for extended periods, making it difficult to diagnose shutdown hangs in production.

5. ** golang.org/x/sync/errgroup not used**: The project maintains a custom synchronization wrapper rather than using the standard errgroup package, suggesting either historical reasons or specific requirements not met by errgroup (such as the `WaitAndBlock()` functionality).