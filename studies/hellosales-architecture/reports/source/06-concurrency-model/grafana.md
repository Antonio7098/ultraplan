# Source Analysis: grafana

## Concurrency Model

### Source Info

| Field | Value |
|-------|-------|
| Name | grafana |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/grafana` |
| Language / Stack | Go (backend), TypeScript/React (frontend) |
| Analyzed | 2026-05-20 |

## Summary

Grafana employs a mature, multi-faceted concurrency model leveraging Go's standard primitives (goroutines, channels, context) alongside structured patterns for lifecycle management, bounded concurrency, and cancellation propagation. The codebase demonstrates consistent use of `errgroup` for fan-out operations, `semaphore.Weighted` for resource pool limiting, and `sync.WaitGroup` for goroutine tracking. Context cancellation is well-integrated via `ctx.Done()` select patterns and errgroup context propagation. The main areas of concurrency are alert rule evaluation, query execution, background workers, and live connection handling.

## Rating

**8/10** — Good implementation with minor issues. Grafana demonstrates solid concurrency patterns across multiple domains (alerting, queries, background workers). Bounded concurrency is implemented via errgroup.SetLimit and semaphore patterns. However, some older code paths use basic sync primitives without higher-level abstractions, and the channel-based semaphore in live.go is a less idiomatic pattern compared to semaphore.Weighted.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| errgroup.WithContext | Alert rule evaluation dispatcher uses errgroup for cancellation propagation | `pkg/services/ngalert/schedule/schedule.go:251` |
| errgroup.SetLimit | Query execution uses bounded concurrency with SetLimit | `pkg/services/query/query.go:145-146` |
| errgroup.SetLimit | Team search bounded to 10 concurrent workers | `pkg/registry/apis/iam/team_search.go:481-482` |
| semaphore.Weighted | Zanzana authorization server global concurrency limit | `pkg/services/authz/zanzana/server/server.go:70,113-114` |
| semaphore.Weighted | GC worker bounded concurrent cleanups | `pkg/registry/apis/secret/garbagecollectionworker/worker.go:76` |
| semaphore.Weighted | Consolidation service bounded workers | `pkg/registry/apis/secret/service/consolidation.go:85` |
| sync.WaitGroup | Scheduler worker pool lifecycle tracking | `pkg/util/scheduler/scheduler.go:89,152-163` |
| sync.WaitGroup | Resource server graceful shutdown tracking | `pkg/storage/unified/resource/server.go:612` |
| sync.WaitGroup | Stream decoder lifecycle | `pkg/storage/unified/apistore/stream.go:27` |
| channel semaphore | Live service client concurrency limiting | `pkg/services/live/live.go:214-216` |
| context propagation | Scheduler queue cancellation via ctx.Done() | `pkg/util/scheduler/queue.go:259,305,331,334` |
| context timeout | GC worker per-item timeout | `pkg/registry/apis/secret/garbagecollectionworker/worker.go:55` |
| debouncer lifecycle | Debouncer group uses WaitGroup for goroutine tracking | `pkg/util/debouncer/debouncer.go:107,206-208` |

## Answers to Dimension Questions

### 1. How does the project manage goroutine lifetimes without leaking?

Grafana uses multiple strategies for goroutine lifecycle management:

**errgroup cancellation propagation** (`pkg/services/ngalert/schedule/schedule.go:251-269`): The alert scheduler creates an errgroup context; when parent context is cancelled, all child goroutines receive cancellation via the errgroup context. The dispatcher waits on `dispatcherGroup.Wait()` before exiting.

**sync.WaitGroup tracking** (`pkg/storage/unified/resource/server.go:611-612`): The resource server uses `inflight sync.WaitGroup` to track in-flight write operations during graceful shutdown. The `stopMu sync.Mutex` serializes the transition to stopping state to prevent races between `Add()` and `Wait()`.

**Service lifecycle pattern** (`pkg/util/scheduler/scheduler.go:137`): The scheduler implements the `services.Service` interface with `starting()` and `stopping()` lifecycle hooks. The `stopping()` method calls `s.wg.Wait()` to ensure all workers complete before shutdown.

**Deferred cleanup** in goroutines (`pkg/registry/apis/secret/garbagecollectionworker/worker.go:86-87`): GC worker uses `defer sema.Release(1)` and `defer wg.Done()` to ensure cleanup happens even on panic.

### 2. Are there bounded concurrency patterns when handling many tasks?

Yes, multiple bounded concurrency patterns are employed:

**errgroup.SetLimit** (`pkg/services/query/query.go:145-146`):
```go
g, ctx := errgroup.WithContext(ctx)
g.SetLimit(s.concurrentQueryLimit) // prevent too many concurrent requests
```

**semaphore.Weighted** (`pkg/services/authz/zanzana/server/server.go:113-114`):
```go
if zanzanaCfg.MaxConcurrentRequests > 0 {
    s.globalSem = semaphore.NewWeighted(int64(zanzanaCfg.MaxConcurrentRequests))
}
```

**Hardcoded limits** (`pkg/registry/apis/iam/team_search.go:481-482`):
```go
var g errgroup.Group
g.SetLimit(10) // Bounded to 10 concurrent team searches
```

**Channel-based semaphore** (`pkg/services/live/live.go:214-216`):
```go
semaphore = make(chan struct{}, clientConcurrency)
```

### 3. How is cancellation propagated through multi-step operations?

Cancellation propagates through several mechanisms:

**errgroup.WithContext** (`pkg/services/ngalert/schedule/schedule.go:251`): Creates a derived context where any goroutine failure cancels all others via the shared context.

**ctx.Done() in select loops** (`pkg/util/debouncer/debouncer.go:210-212`):
```go
select {
case <-g.ctx.Done():
    return
case value := <-g.buffer:
    g.processValue(value)
```

**Parent context passing** (`pkg/services/query/query.go:177`):
```go
ctxCopy := contexthandler.CopyWithReqContext(ctx)
subResp, err := s.QueryData(ctxCopy, user, skipDSCache, subDTO)
```

**Timeout contexts** (`pkg/registry/apis/secret/garbagecollectionworker/worker.go:55`):
```go
timeoutCtx, cancel := context.WithTimeout(context.Background(), w.Cfg.SecretsManagement.GCWorkerPerSecureValueCleanupTimeout)
```

### 4. What patterns prevent channel deadlocks or goroutine leaks?

**No channel deadlocks observed** in the examined code. Key patterns:

**Buffered channels for non-blocking sends** (`pkg/services/query/query.go:147`):
```go
rchan := make(chan splitResponse, len(queriesbyDs))
```

**Select with default for non-blocking adds** (`pkg/util/debouncer/debouncer.go:194-201`):
```go
select {
case g.buffer <- value:
    g.metrics.itemsAddedCounter.Inc()
    return nil
default:
    g.metrics.itemsDroppedCounter.Inc()
    return ErrBufferFull
}
```

**Explicit WaitGroup tracking** (`pkg/util/scheduler/scheduler.go:89`): Workers are tracked via WaitGroup, and the scheduler waits for all workers to complete before declaring stopped.

**Context-aware goroutine exits**: Goroutines listen on `ctx.Done()` and exit cleanly when context is cancelled.

### 5. How does the system handle backpressure under load?

**Bounded concurrency limits** prevent overload at entry points:
- Query service limits concurrent queries via `errgroup.SetLimit(s.concurrentQueryLimit)` at `pkg/services/query/query.go:146`
- Zanzana server limits via `semaphore.Weighted` at `pkg/services/authz/zanzana/server/server.go:114`
- GC worker limits via `semaphore.Weighted` at `pkg/registry/apis/secret/garbagecollectionworker/worker.go:76`

**Buffer drops with metrics** (`pkg/util/debouncer/debouncer.go:199`): When the debouncer buffer is full, items are dropped and a counter incremented, preventing blocking.

**Connection limiting** (`pkg/services/live/live.go:205-213`): Live connection count is checked against `LiveMaxConnections` config before accepting new clients.

**HTTP server graceful shutdown** (`pkg/api/http_server.go:500-507`): Server waits for in-flight requests via `wg.Wait()` before shutting down.

## Architectural Decisions

1. **errgroup as primary fan-out primitive**: Grafana consistently uses `golang.org/x/sync/errgroup` for managing groups of goroutines that should fail together. This provides implicit context propagation and error aggregation.

2. **semaphore.Weighted for resource pooling**: Configurable limits on concurrent operations are implemented via `golang.org/x/sync/semaphore` rather than fixed channel buffers, allowing dynamic configuration via settings.

3. **Service lifecycle interface**: The `dskit/services` package provides a structured `Service` interface with `Starting`, `Running`, `Stopping` states, used by scheduler and other long-running components.

4. **Singleflight for duplicate suppression**: The Zanzana server uses `singleflight.Group` at `pkg/services/authz/zanzana/server/server.go:61` to coalesce duplicate store requests.

5. **Channel-based semaphore as fallback**: The live service uses a buffered channel for concurrency limiting when `clientConcurrency > 1`, which is less idiomatic than semaphore but simpler for this specific use case.

## Notable Patterns

| Pattern | Location | Description |
|---------|----------|-------------|
| Worker pool | `pkg/util/scheduler/scheduler.go:152-163` | Fixed-size pool of workers consuming from a queue |
| Fan-out with limit | `pkg/services/query/query.go:172-190` | Concurrent datasource queries with bounded goroutines |
| Graceful shutdown | `pkg/storage/unified/resource/server.go:611-612` | In-flight operation tracking via WaitGroup |
| Debouncing | `pkg/util/debouncer/debouncer.go:100-214` | Buffered event debouncing with min/max wait times |
| Adaptive ring | `pkg/util/ring/adaptive_chan.go:64` | Dynamic channel sizing for resource optimization |

## Tradeoffs

1. **Complexity vs simplicity**: The multiple concurrency mechanisms (errgroup, semaphore, channels, WaitGroup) provide flexibility but require developers to understand when to use each. The live service's channel-based semaphore is simpler but less configurable than semaphore.Weighted.

2. **Blocking vs non-blocking**: The debouncer's buffer with drop-on-full behavior prevents blocking producers but may lose events under extreme load. This is a conscious trade-off for availability over durability.

3. **Context propagation overhead**: Copying request context (`pkg/services/query/query.go:177`) adds overhead but ensures proper tracing and auth context propagation to child goroutines.

4. **Global vs per-namespace limits**: The Zanzana server implements both global (`globalSem`) and per-namespace (`namespaceLimiters sync.Map`) concurrency limits, adding complexity but preventing noisy neighbor issues.

## Failure Modes / Edge Cases

1. **Panic recovery in goroutines** (`pkg/services/query/query.go:150-163`): The query service wraps datasource calls in panic recovery, logging errors but continuing execution to prevent one bad query from crashing the process.

2. **Semaphore leak on error** (`pkg/registry/apis/secret/garbagecollectionworker/worker.go:81-88`): If `sema.Acquire()` fails due to context cancellation, the goroutine exits without releasing. The `semaphore.Weighted` implementation handles this gracefully as the semaphore is cleaned up with the context.

3. **Errgroup early cancellation**: When one goroutine in an errgroup returns an error, the context is cancelled, causing all other goroutines to exit. This is correct behavior but can mask partial failures.

4. **Worker pool starvation**: The scheduler's round-robin queue dispatch could starve long-running tasks if many short tasks keep arriving, though the bounded worker count prevents resource exhaustion.

5. **Buffer full drops**: The debouncer's `ErrBufferFull` return means callers must handle backpressure, but the metric (`itemsDroppedCounter`) enables monitoring of this condition.

## Future Considerations

1. **Standardize on semaphore.Weighted**: The channel-based semaphore in live.go could be replaced with `semaphore.Weighted` for consistency and better configurability.

2. **Add circuit breakers**: The current patterns handle bounded concurrency but lack circuit breaker patterns for cascading failure prevention. Consider adding `breaker` patterns similar to those in dskit.

3. **Metrics for all concurrency primitives**: While some components (debouncer, GC worker) have concurrency metrics, a more uniform approach to exposing goroutine counts, queue depths, and semaphore utilization would improve operational visibility.

4. **Context timeout standardization**: Some operations use hardcoded timeouts (e.g., GC worker cleanup timeout) while others rely on caller-provided contexts. A more consistent timeout strategy would help with resource management.

## Questions / Gaps

1. **No evidence found** for graceful shutdown timeout limits — the HTTP server's shutdown at `pkg/api/http_server.go:500-507` does not appear to have a timeout, relying on context cancellation from the parent.

2. **No evidence found** for structured logging of goroutine IDs during debugging — while `log.Stack()` is used for panic recovery, there's no consistent goroutine ID logging for troubleshooting leaks.

3. **No evidence found** for backpressure signaling to callers beyond `ErrBufferFull` in debouncer — callers must handle the error but there's no standard retry or degradation pattern.

---

Generated by `dimensions/06-concurrency-model.md` against `grafana`.