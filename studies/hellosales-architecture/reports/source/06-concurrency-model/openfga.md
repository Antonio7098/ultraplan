# Source Analysis: openfga

## Concurrency Model

### Source Info

| Field | Value |
|-------|-------|
| Name | openfga |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/openfga` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

OpenFGA demonstrates a mature and sophisticated concurrency architecture built around idiomatic Go patterns. The project employs `golang.org/x/sync/errgroup` for bounded parallel execution with context cancellation, `sourcegraph/conc/pool` for context-aware goroutine pooling, and a multi-layered throttling system for backpressure. The check resolution engine (`internal/check/check.go`) uses errgroup with `SetLimit()` to bound concurrent edge evaluations, while the ListObjects pipeline (`internal/listobjects/pipeline/pipeline.go`) implements a structured worker-based concurrency model with cycle detection. Context propagation is consistent throughout, with panic recovery middleware at both HTTP and gRPC layers. The architecture shows careful consideration of goroutine lifecycle management, bounded concurrency, and graceful shutdown.

## Rating

**8/10** — Good implementation with minor issues. OpenFGA exhibits strong concurrency discipline with bounded errgroup pools, context-aware throttling, and structured pipeline workers. The circular resolver chain and the interplay between singleflight and explicit concurrency limits represent nuanced tradeoffs. Some areas (cached iterator drain, constantRateThrottler goroutine lifecycle) have subtle edge cases.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Goroutine lifecycle (errgroup) | `pool.SetLimit(r.concurrencyLimit)` bounds concurrent goroutines in `ResolveUnionEdges` | `internal/check/check.go:219` |
| Goroutine lifecycle (pool) | `pool.New().WithContext(ctx).WithCancelOnError().WithFirstError().WithMaxGoroutines(maxGoroutines)` creates context-aware pool | `internal/concurrency/concurrency.go:16-22` |
| Goroutine lifecycle (WaitGroup) | `WaitGroup *sync.WaitGroup` in `SharedDatastoreResources` ensures goroutine completion before cache closure | `internal/shared/shared.go:51,146` |
| Channel signaling | `concurrency.TrySendThroughChannel` uses non-blocking send with context cancellation check | `internal/concurrency/concurrency.go:26-33` |
| Channel usage | `out := make(chan ResponseMsg, len(edges))` — buffered channel for fan-out results | `internal/check/check.go:216` |
| Bounded concurrency | `pool.SetLimit(r.concurrencyLimit)` on errgroup limits concurrent edge resolutions | `internal/check/check.go:219` |
| Bounded concurrency | `WithResolveNodeBreadthLimit` sets "maximum number of nodes that can be evaluated concurrently on a given level" | `pkg/server/server.go:326-337` |
| Cancellation propagation | `context.WithCancel(ctx)` child context created per resolution branch | `internal/check/check.go:214` |
| Cancellation propagation | `defer cancel()` paired with `defer pool.Wait()` ensures cleanup on both success and error | `internal/check/check.go:221-225` |
| Worker pool pattern | `workers` map + `sync.WaitGroup` in pipeline manages concurrent worker goroutines | `internal/listobjects/pipeline/pipeline.go:123-126,395-410` |
| Worker pool pattern | `worker.NewCycleGroup()` for cycle detection in concurrent workers | `internal/listobjects/pipeline/pipeline.go:334` |
| Throttler (dispatch) | `constantRateThrottler` uses time.Ticker + buffered channel for rate-limited dispatch | `internal/throttler/throttler.go:45-66,78-87` |
| Throttler (datastore) | `checkDatastoreThrottleThreshold` and `checkDatastoreThrottleDuration` per-request throttle config | `pkg/server/server.go:239-244` |
| Context deadline | `listObjectsDeadline` and `listUsersDeadline` enforce per-request timeouts | `pkg/server/server.go:180-185` |
| Panic recovery | `grpc_recovery.WithRecoveryHandlerContext(recovery.PanicRecoveryHandler)` wraps gRPC interceptors | `cmd/run/run.go:565-568` |
| Panic recovery | `concurrency.RecoverFromPanic(&err)` deferred in pipeline workers | `internal/listobjects/pipeline/pipeline.go:407` |
| Fan-out/fan-in | Two goroutines in `ResolveRecursive` fan out to `ResolveUnionEdges` and recursive resolution | `internal/check/check.go:524-554` |
| Bounded channel | `make(chan ResponseMsg, len(edges))` — channel sized to expected concurrent operations | `internal/check/check.go:216` |
| Streaming result | `Receiver[T any]` interface for non-buffered streaming in pipeline | `internal/listobjects/pipeline/pipeline.go:34` |
| Singleflight | `singleflight.Group` shared across cache and datastore operations | `pkg/server/server.go:252,926` |

## Answers to Dimension Questions

### 1. How does the project manage goroutine lifetimes without leaking?

OpenFGA uses multiple mechanisms for goroutine lifecycle management:

**errgroup with deferred cancellation and wait** (`internal/check/check.go:214-225`):
```go
ctx, cancel := context.WithCancel(ctx)
out := make(chan ResponseMsg, len(edges))
var pool errgroup.Group
pool.SetLimit(r.concurrencyLimit)
defer func() {
    cancel()
    _ = pool.Wait()
    close(out)
}()
```
Each resolution call creates a child context with cancel, sets up an errgroup with a concurrency limit, and defers both cancellation and wait. This ensures goroutines complete before the function returns.

**sync.WaitGroup in SharedDatastoreResources** (`internal/shared/shared.go:51,146`):
```go
WaitGroup *sync.WaitGroup
// ...
func (s *SharedDatastoreResources) Close() {
    s.WaitGroup.Wait()  // wait for goroutines before closing cache
```

**Pipeline worker lifecycle** (`internal/listobjects/pipeline/pipeline.go:395-410,485-515`):
Workers are started with `sync.WaitGroup.Go()`, and `Pipeline.Close()` cancels the context, drains output, waits on the WaitGroup, then closes the error accumulator. The `Close()` method is idempotent and nil-safe.

**ConstantRateThrottler goroutine** (`internal/throttler/throttler.go:58-66,89-94`):
The throttler spawns a goroutine in `newConstantRateThrottler()` that runs `runTicker()`. The goroutine exits when `done` channel is closed and `ticker.Stop()` is called in `Close()`. The `Close()` method sends to `done`, stops the ticker, then closes both `done` and `throttlingQueue`.

### 2. Are there bounded concurrency patterns when handling many tasks?

**Yes.** OpenFGA implements bounded concurrency at multiple levels:

**errgroup.SetLimit** (`internal/check/check.go:219`):
```go
var pool errgroup.Group
pool.SetLimit(r.concurrencyLimit)
```
The `ConcurrencyLimit` is configurable per check resolver (`internal/check/check.go:49`). In `ResolveUnionEdges`, this limits concurrent edge evaluations to prevent unbounded goroutine spawning.

**WithResolveNodeBreadthLimit** (`pkg/server/server.go:326-337`):
The server option documents: "on a given level of the tree, the maximum number of nodes that can be evaluated concurrently (the breadth)." This is enforced through the check resolver's `concurrencyLimit`.

**Concurrent reads limits** (`pkg/server/server.go:400-436`):
```go
WithMaxConcurrentReadsForListObjects(maxConcurrentReads uint32)
WithMaxConcurrentReadsForCheck(maxConcurrentReadsForCheck uint32)
WithMaxConcurrentReadsForListUsers(maxConcurrentReadsForListUsers uint32)
```
These limit in-flight datastore reads per request.

**maxConcurrentChecksPerBatchCheck** (`pkg/server/server.go:748-754`):
Limits concurrent checks within a single BatchCheck request.

**Pipeline buffer capacity** (`internal/listobjects/pipeline/pipeline.go:57-61`):
```go
defaultBufferSize int = 1 << 7  // 128
defaultChunkSize  int = 100
defaultNumProcs   int = 3
```
Workers have configurable buffer capacity and chunk size, limiting queued work.

### 3. How is cancellation propagated through multi-step operations?

**Per-branch context creation** (`internal/check/check.go:214`):
```go
ctx, cancel := context.WithCancel(ctx)
```
A child context is created for each resolution call. When `defer cancel()` executes, the child context is cancelled, propagating to all descendent operations.

**TrySendThroughChannel pattern** (`internal/concurrency/concurrency.go:26-33`):
```go
func TrySendThroughChannel[T any](ctx context.Context, msg T, channel chan<- T) bool {
    select {
    case <-ctx.Done():
        return false  // context cancelled, don't send
    case channel <- msg:
        return true
    }
}
```
This prevents sending on channels after context cancellation, avoiding goroutines blocked on send.

**Deferred cancellation paired with wait** (`internal/check/check.go:221-225`):
```go
defer func() {
    cancel()
    _ = pool.Wait()
    close(out)
}()
```
Both cancel and wait are deferred, ensuring cleanup happens regardless of early return or error.

**Pipeline context chain** (`internal/listobjects/pipeline/pipeline.go:397`):
```go
ctx, cancel := context.WithCancel(ctx)
```
The pipeline's `Build()` creates a cancellable context passed to all workers.

### 4. What patterns prevent channel deadlocks or goroutine leaks?

**Buffered channels for expected concurrency** (`internal/check/check.go:216`):
```go
out := make(chan ResponseMsg, len(edges))
```
The channel is sized to the number of expected concurrent operations, preventing producers from blocking when consumers haven't started.

**Non-blocking send with TrySendThroughChannel** (`internal/concurrency/concurrency.go:26-33`):
The function checks `ctx.Done()` first, avoiding blocking sends on cancelled contexts.

**Pipeline output drain on Close** (`internal/listobjects/pipeline/pipeline.go:493-499`):
```go
for {
    msg, ok := p.output.Recv(context.Background())
    if !ok {
        break
    }
    msg.Done()
}
p.wg.Wait()
```
Before waiting on the WaitGroup, the pipeline drains remaining output messages using `context.Background()` to avoid blocking on context cancellation during shutdown.

**ConstantRateThrottler non-blocking send** (`internal/throttler/throttler.go:69-76`):
```go
func (r *constantRateThrottler) nonBlockingSend(signalChan chan struct{}) {
    select {
    case signalChan <- struct{}{}:
    default:
        // message dropped
    }
}
```
Dropping excess throttle signals prevents unbounded queue growth.

**Singleoutput pattern in ResolveExclusion** (`internal/check/check.go:665-676`):
The base result uses a buffered channel of size 1 with explicit close, avoiding deadlock when the caller only needs one result.

### 5. How does the system handle backpressure under load?

**Dispatch throttling** (`internal/throttler/throttler.go:96-114`):
The `constantRateThrottler.Throttle()` blocks on a rate-limited channel. Requests exceeding dispatch thresholds wait for the ticker, preventing CPU exhaustion from dispatch storms.

**Datastore throttling** (`pkg/server/server.go:764-783`):
```go
func WithCheckDatabaseThrottle(threshold int, duration time.Duration) OpenFGAServiceV1Option
```
Per-request throttle threshold and duration limit database query pressure.

**Check dispatch throttling resolver** (`internal/graph/dispatch_throttling_check_resolver.go`):
When `checkDispatchThrottlingEnabled` is true, the resolver wraps the check chain and throttles based on dispatch count relative to threshold.

**Request-level timeouts** (`pkg/server/server.go:361-388`):
```go
WithListObjectsDeadline(deadline time.Duration)
WithListUsersDeadline(deadline time.Duration)
```
Deadlines bound maximum request duration.

**singleflight for cache deduplication** (`pkg/server/server.go:252,926`):
```go
singleflightGroup *singleflight.Group
```
Deduplicates concurrent identical cache lookups, preventing thundering herd on cache misses.

**Iterator drain timeout** (`pkg/storage/storagewrappers/cached_reader.go:23-24`):
```go
const DefaultDrainTimeout = 30 * time.Second
```
Background iterator drain operations have a timeout, preventing indefinite blocking.

## Architectural Decisions

1. **errgroup over raw sync.WaitGroup for request-scoped concurrency**: OpenFGA uses `golang.org/x/sync/errgroup` with `SetLimit()` for per-request bounded concurrency. This provides automatic context cancellation propagation and error aggregation without manual WaitGroup management.

2. **sourcegraph/conc pool for context-aware worker pooling**: The `concurrency.NewPool()` function wraps the conc library's `ContextPool` with `WithContext(ctx).WithCancelOnError().WithFirstError()`, providing request-scoped goroutine pools that respect context cancellation and return the first error.

3. **Circular resolver chain for check resolution**: Resolvers are composed as a circular linked list (`builder.go:97-106`), where `SetDelegate()` chains each resolver to the next, with the last delegate pointing back to the first. This allows dynamic composition of caching, throttling, and shadow resolvers.

4. **Separate dispatch and datastore throttling**: The architecture distinguishes between dispatch throttling (limiting recursive resolution steps via `constantRateThrottler`) and datastore throttling (limiting database queries per request). This allows independent tuning of graph traversal vs database load.

5. **Pipeline workers with cycle detection**: The ListObjects pipeline uses `worker.CycleGroup` to track concurrent membership, allowing workers to detect and handle cyclic graph edges without explicit recursion limits.

## Notable Patterns

- **Fan-out with early short-circuit** (`internal/check/check.go:284-300`): When a union branch returns `Allowed: true`, the loop immediately returns, cancelling remaining branch evaluations.

- **Buffered streaming output with buffer drain** (`internal/listobjects/pipeline/pipeline.go:432-469`): `Pipeline.Recv()` drains buffered values before checking for new errors or output, preserving ordering while preventing unbounded memory growth.

- **Deferred cleanup with cancel-then-wait** (`internal/check/check.go:221-225`): The pattern of deferring both `cancel()` and `pool.Wait()` ensures deterministic cleanup regardless of early returns.

- **ConstantRateThrottler ticker goroutine** (`internal/throttler/throttler.go:78-87`): A dedicated goroutine for rate signal generation allows time-based dispatch limiting independent of request processing.

- **SharedIteratorStorage with semaphore-like limit** (`pkg/storage/storagewrappers/sharediterator/shared_iterator_datastore.go:510`): Uses WaitGroup to track active iterators and enforce `SharedIteratorLimit`.

## Tradeoffs

- **singleflight vs explicit concurrency limits**: The `singleflightGroup` deduplicates cache lookups but doesn't limit concurrent cache-fill operations. The `ConcurrencyLimit` on errgroup bounds edge resolution concurrency, but these two mechanisms operate independently and could theoretically allow more goroutines than intended if not carefully tuned.

- **Buffered channels sized to expected concurrency**: `make(chan ResponseMsg, len(edges))` in `ResolveUnionEdges` assumes the number of edges equals concurrent operations. If edges share a common prefix in the resolution tree, concurrent operations may be fewer than channel capacity, but the channel still reserves memory proportional to edge count.

- **ConstantRateThrottler non-blocking send**: Dropping throttle signals when the queue is full means high load can result in immediate dispatch rather than controlled throttling. The comment "message dropped" indicates deliberate behavior, but this could lead to throttle ineffectiveness under sustained load.

- **Pipeline workers share interpreter and error accumulator**: Each worker receives a copy of `core` (passed by value), but shares the same `core.Interpreter`, `core.Errors`, and `core.Pool` via pointers. This is efficient but means worker errors are accumulated in a shared accumulator that must be drained by the pipeline owner.

- **Circular resolver chain debuggability**: The circular delegation chain (`builder.go:97-103`) allows dynamic composition but makes debugging harder since calls loop back to the start. The `LocalCheckResolver()` helper traverses the chain to find the `*LocalChecker`, but this traversal skips intermediate wrappers like `CachedCheckResolver` or `DispatchThrottlingCheckResolver`.

## Failure Modes / Edge Cases

- **Goroutine leak if Pipeline.Close() not called**: The `Build()` function returns a `*Pipeline` that must be explicitly closed. If the caller forgets to call `Close()`, the workers' goroutines will leak. The comment at line 235-236 states: "The caller must call Close on the returned Pipeline to avoid leaking goroutines."

- **Context cancellation during iterator drain**: The iterator cache's drain operation uses `drainTimeout` (default 30s) to bound background drain. If drain takes longer than the timeout, the iterator may be abandoned while still holding resources.

- **ConstantRateThrottler goroutine leak if Close not called**: If the throttler is not closed, the `runTicker()` goroutine runs indefinitely. `Server.Close()` (`server.go:1037-1042`) closes both `listObjectsDispatchThrottler` and `listUsersDispatchThrottler`, mitigating this for server use cases.

- **Race on cache invalidation during iterator drain**: The iterator cache entry stores `LastModified` time. If a write occurs during iterator drain, the entry may be invalidated after the drain starts but before it completes. The singleflight mechanism partially mitigates this.

- **Throttle signal drop under extreme load**: The `nonBlockingSend` drops throttle signals when the queue is full. Under extreme load, this means throttling becomes ineffective and requests proceed without delay, potentially causing cascading failures.

## Future Considerations

- **Structured concurrency with Go 1.22+**: The project could adopt `slices.Concurrent` or scoped goroutines from newer Go versions to simplify lifecycle management.

- **errgroup for all parallel operations**: Currently some areas use `sync.WaitGroup` directly (e.g., `ResolveExclusion` at `check.go:666`). Consolidating on errgroup would provide uniform error propagation and cancellation.

- **Metrics-driven auto-scaling of concurrency limits**: Currently `ConcurrencyLimit` and `MaxConcurrentReads*` are static configuration. Dynamic adjustment based on queue depth or latency could improve resource utilization.

- **Backpressure via bounded channel with select-default**: The `TrySendThroughChannel` function could be extended to return a signal when the channel is full, allowing callers to implement their own backpressure rather than dropping messages.

## Questions / Gaps

- **No evidence of semaphore pattern for resource acquisition**: While `concurrency.NewPool()` uses `WithMaxGoroutines`, there is no use of `golang.org/x/sync/semaphore` for acquiring database connections or other bounded resources. How are database connection pool limits enforced at the request level?

- **Limited evidence of context deadline on List operations**: While `listObjectsDeadline` and `listUsersDeadline` exist, the concrete implementation of how they're enforced (e.g., via `context.WithDeadline` or via check inside resolution loops) was not fully traced. Need deeper investigation into `listobjects/pipeline` to confirm deadline enforcement.

- **Shared iterator lifecycle management**: The `SharedIteratorStorage` uses `sync.WaitGroup` to track active iterators and enforces a limit, but it's unclear what happens when the limit is reached and a new iterator is requested. Does it block, error, or evict?

- **No evidence of worker pool auto-scaling**: The pipeline uses fixed `NumProcs` (default 3) per worker subscription. There's no evidence of dynamic worker scaling based on queue depth or throughput.

---

Generated by `dimensions/06-concurrency-model.md` against `openfga`.