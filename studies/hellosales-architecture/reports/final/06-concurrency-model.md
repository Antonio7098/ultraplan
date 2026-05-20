# Concurrency Model - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Dimension | 06-concurrency-model |
| Sources | cli, grafana, kubernetes, milvus, nats-server, openfga, pocketbase, temporal, victoriametrics |
| Date | 2026-05-20 |

## Sources Studied

| # | Source | Path |
|---|--------|------|
| 1 | cli | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/cli` |
| 2 | grafana | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/grafana` |
| 3 | kubernetes | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/kubernetes` |
| 4 | milvus | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/milvus` |
| 5 | nats-server | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/nats-server` |
| 6 | openfga | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/openfga` |
| 7 | pocketbase | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/pocketbase` |
| 8 | temporal | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/temporal` |
| 9 | victoriametrics | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/victoriametrics` |

## Executive Summary

This study examines concurrency architecture across nine Go-based open-source projects spanning databases, message brokers, orchestration systems, authorization servers, and CLIs. The nine sources reveal strong convergence on foundational patterns: `sync.WaitGroup` for lifecycle tracking, `context.Context` for cancellation propagation, and semaphore-based bounded concurrency. Divergence appears in the sophistication of backpressure mechanisms and the adoption of `golang.org/x/sync/errgroup` versus raw channel-based quit signals. Three projects (nats-server, temporal, kubernetes) demonstrate centralized goroutine tracking that enables deterministic shutdown, while others rely on per-operation discipline that is more fragile. No project achieved a perfect score; the most common gaps are inconsistent adoption of bounded concurrency across all code paths, limited circuit breaker patterns, and informal goroutine leak detection.

## Core Thesis

Go concurrency discipline scales with operational sophistication. Systems designed for high-throughput, long-running operations (nats-server, temporal, kubernetes, victoriametrics) invest in centralized goroutine tracking and explicit backpressure. Systems with simpler operational profiles (cli, pocketbase) use pragmatic fire-and-forget patterns that trade lifecycle observability for implementation simplicity. The `golang.org/x/sync/errgroup` package is the most robust abstraction for request-scoped fan-out, but its adoption is inconsistent—some mature projects deliberately prefer raw `sync.WaitGroup` for explicitness. Channel-based quit signals remain viable for long-lived server processes but lack the compositional power of context cancellation.

## Rating Summary

| Source | Score | Approach | Main Strength | Main Concern |
|--------|-------|----------|---------------|--------------|
| cli | 6/10 | errgroup + semaphore + WaitGroup | errgroup cancellation propagation, bounded search workers | Inconsistent goroutine tracking, some fire-and-forget goroutines |
| grafana | 8/10 | errgroup + semaphore.Weighted + WaitGroup | Consistent errgroup usage, graceful service shutdown | Channel-based semaphore in live.go less configurable |
| kubernetes | 8/10 | wait.Group + workqueue + context cancellation | Centralized workqueue, bounded parallelizer | Limited errgroup usage, sync.Cond complexity |
| milvus | 7/10 | ants pool + buffered channels + errgroup | Generic pool abstraction, slot-based backpressure | Inconsistent errgroup adoption, segment retrieval thundering herd |
| nats-server | 8/10 | grWG + ipQueue + semaphore channels | Centralized goroutine registry, ipQueue lock-free passing | No context.Context in production paths, no errgroup |
| openfga | 8/10 | errgroup.SetLimit + conc pool + throttler | Bounded edge resolution, multi-layer throttling | Pipeline goroutine leak if Close() not called |
| pocketbase | 7/10 | FireAndForget + semaphore + errgroup | Panic recovery in FireAndForget, chunked broadcasting | FireAndForget lifecycle tracking informal |
| temporal | 8/10 | goro package + AdaptivePool + sync.Cond | Dedicated lifecycle package, adaptive worker scaling | sync.Cond can cause spurious wakeups |
| victoriametrics | 8/10 | syncwg.WaitGroup + stopCh + semaphore | Thread-safe WaitGroup, queue timeout backpressure | No errgroup, unmarshalWorkCh has no producer timeout |

## Approach Models

### Centralized Goroutine Registry (nats-server, temporal, kubernetes)
These projects track all goroutines through a central mechanism—`s.grWG` in nats-server (`server/server.go:251`), `common/goro` package in temporal (`common/goro/group.go:15-20`), and `wait.Group` wrapper in kubernetes (`staging/src/k8s.io/apimachinery/pkg/util/wait/wait.go:42-74`). This enables `Wait()` to block until ALL goroutines complete, providing deterministic shutdown.

**Why it works**: Every goroutine spawn goes through a single path, making it impossible to forget lifecycle tracking. Shutdown races become impossible rather than merely unlikely.

**Tradeoff**: Requires discipline—developers must use the central mechanism. nats-server enforces via `startGoRoutine()` wrapper (`server/server.go:4051-4064`), but kubernetes' `wait.Group` is advisory.

### Request-Scoped errgroup (openfga, grafana, cli)
These projects use `golang.org/x/sync/errgroup` with `SetLimit()` for bounded fan-out within request handlers. openfga uses it in check resolution (`internal/check/check.go:219`), grafana in query execution (`pkg/services/query/query.go:145-146`), and cli in port forwarding (`pkg/cmd/codespace/ports.go:330-352`).

**Why it works**: `errgroup.WithContext` provides automatic context cancellation propagation—when any goroutine returns an error, all others are cancelled via the shared context. `SetLimit()` bounds concurrent goroutines without external dependencies.

**Tradeoff**: errgroup is request-scoped; it doesn't help with long-lived service goroutines. The error aggregation model (first error wins) may mask partial failures.

### Channel-Based Quit Signals (nats-server, kubernetes, pocketbase)
These projects use `quitCh chan struct{}` closed on shutdown rather than `context.Context` for internal goroutine cancellation. nats-server's `quitCh` broadcasts to all waiting goroutines (`server/server.go:2687`), kubernetes uses `stopCh` in workqueue (`staging/src/k8s.io/client-go/util/workqueue/queue.go:172`), and pocketbase uses ticker-based stop signals (`tools/cron/cron.go:196-198`).

**Why it works**: Channel closure is a simple, reliable signal that doesn't require context composition. Works well for fire-and-forget internal workers.

**Tradeoff**: No built-in deadline tracking, no cancellation reason tracking, no compositional cancellation (child can't cancel parent). Cannot pass values through the cancellation channel.

### Worker Pool with Bounded Channels (milvus, victoriametrics, temporal)
These projects use buffered channels as work queues with fixed worker counts. milvus uses `ants` library for pooled goroutines (`pkg/util/conc/pool.go:33-94`), victoriametrics uses explicit `StartUnmarshalWorkers()`/`StopUnmarshalWorkers()` pairs (`lib/protoparser/protoparserutil/unmarshal_work.go:24-50`), and temporal's `AdaptivePool` auto-scales between min/max workers (`common/goro/adaptive_pool.go:15-26`).

**Why it works**: Work queues decouple producers from consumers, enabling backpressure when workers are saturated. Buffered channels prevent blocking until the buffer is full.

**Tradeoff**: Unbounded buffers can cause memory bloat under sustained overload. Unbuffered or small buffers can cause producer blocking. Queue timeout handling adds complexity.

## Pattern Catalog

### Buffered Channel Semaphore
**Problem**: Need to limit concurrent operations without external dependencies.
**Sources**: cli (`pkg/cmd/skills/search/search.go:837-838`), victoriametrics (`lib/writeconcurrencylimiter/concurrencylimiter.go:95`), nats-server (`server/server.go:367`)
**Evidence**: `sem := make(chan struct{}, maxWorkers)` with acquire/release via channel send/receive.
**Why it works**: Idiomatic Go that integrates cleanly with `select` for non-blocking try-acquire patterns. No external imports required.
**When to copy**: When you need a simple concurrency limit and don't need dynamic resizing.
**When overkill**: When you need weighted semaphores, dynamic limit adjustment, or acquisition timeouts (use `golang.org/x/sync/semaphore.Weighted` instead).
**Risk**: Fixed size requires tuning for workloads with variable resource consumption.

### errgroup.WithContext for Fan-Out
**Problem**: Need to run multiple goroutines that should fail together and propagate cancellation.
**Sources**: openfga (`internal/check/check.go:214`), grafana (`pkg/services/ngalert/schedule/schedule.go:251`), cli (`pkg/cmd/codespace/ports.go:330`)
**Evidence**: `g, gctx := errgroup.WithContext(ctx)` followed by `g.SetLimit(limit)` and `g.Go(fn)`.
**Why it works**: Automatic context propagation—when any goroutine returns an error, the shared context is cancelled, causing other goroutines to exit. `SetLimit()` prevents unbounded goroutine creation.
**When to copy**: Request-scoped parallel operations where partial failure should cancel remaining work.
**When overkill**: Long-lived service goroutines, operations where you want to continue despite individual failures.
**Risk**: Goroutines in blocking system calls may not respect context cancellation immediately.

### Deferred Cancel-then-Wait
**Problem**: Need deterministic cleanup when a function with goroutines returns (success or error).
**Sources**: openfga (`internal/check/check.go:221-225`), kubernetes (`staging/src/k8s.io/client-go/util/workqueue/queue.go:217`), grafana (`pkg/registry/apis/secret/garbagecollectionworker/worker.go:86-87`)
**Evidence**:
```go
ctx, cancel := context.WithCancel(ctx)
defer func() {
    cancel()
    _ = pool.Wait()
}()
```
**Why it works**: `cancel()` runs first, signalling all descendent goroutines to exit. `pool.Wait()` then blocks until they complete. Both execute regardless of early return or panic.
**When to copy**: Any function that spawns goroutines with derived contexts.
**When overkill**: Simple fire-and-forget goroutines that run until process exit.
**Risk**: If goroutines are not checking `ctx.Done()`, cancellation may not work. Requires goroutines to cooperatively check cancellation.

### Non-Blocking Send with Context Check
**Problem**: Need to send on a channel without blocking, but only if context is not cancelled.
**Sources**: openfga (`internal/concurrency/concurrency.go:26-33`), nats-server (`server/ipqueue.go:135-138`), victoriametrics (`lib/writeconcurrencylimiter/concurrencylimiter.go:109-130`)
**Evidence**:
```go
func TrySendThroughChannel[T any](ctx context.Context, msg T, channel chan<- T) bool {
    select {
    case <-ctx.Done():
        return false
    case channel <- msg:
        return true
    }
}
```
**Why it works**: Checks context cancellation before send, avoiding goroutines blocked on send after cancellation.
**When to copy**: When you need fire-and-forget result reporting where the caller may cancel.
**When overkill**: When channels are sized to expected concurrency and receivers are always active.
**Risk**: Dropped messages if the channel is full—callers must handle the `false` return.

### Graceful Shutdown WaitGroup
**Problem**: Need to block shutdown until all in-flight operations complete.
**Sources**: nats-server (`server/server.go:2702`), kubernetes (`staging/src/k8s.io/client-go/util/workqueue/queue.go:217`), victoriametrics (`lib/syncwg/syncwg.go:42-47`)
**Evidence**: `defer q.wg.Wait()` followed by shutdown ordering (close listeners → close quitCh → wait).
**Why it works**: `WaitGroup.Wait()` blocks until all `Add()`/`Done()` pairs complete. Ordering ensures no new work starts after quit signal.
**When to copy**: Any long-lived process that handles requests or manages resources.
**When overkill**: Short-lived CLI tools where process exit is acceptable termination.
**Risk**: Missing `Add()` for any goroutine causes indefinite wait. `syncwg.WaitGroup.WaitAndBlock()` (`lib/syncwg/syncwg.go:42-47`) prevents new adds during wait, making the problem visible immediately.

### Adaptive Worker Pool
**Problem**: Workload varies over time; fixed pools either over-provision (wasting resources) or under-provision (limiting throughput).
**Sources**: temporal (`common/goro/adaptive_pool.go:61-93`)
**Evidence**: Pool scales from `minWorkers` to `maxWorkers` based on offer delay, shrinks via jittered timers when idle.
**Why it works**: Non-blocking send first; if delayed beyond `targetDelay`, add a worker. Creates workers on demand up to max, destroying them when idle.
**When to copy**: Workloads with variable concurrency needs and tolerance for pool growth/shrinkage latency.
**When overkill**: Predictable workloads, latency-sensitive workloads where worker creation overhead matters.
**Risk**: Adaptive logic adds complexity; workers may be created/destroyed frequently under fluctuating load.

### Panic Recovery in Goroutines
**Problem**: A panicking goroutine can crash the entire process.
**Sources**: pocketbase (`tools/routine/routine.go:23-31`), grafana (`pkg/services/query/query.go:150-163`), milvus (`pkg/util/conc/pool.go:66-94`)
**Evidence**: `defer func() { recover() }()` wrapped around goroutine body.
**Why it works**: Recover catches the panic, allowing the goroutine to exit cleanly. Without recover, panic propagates to the Go runtime stack and crashes the process.
**When to copy**: Any goroutine handling external input or executing untrusted code.
**When overkill**: Well-tested internal goroutines where panics indicate bugs that should crash the process.
**Risk**: Silently swallowing panics can mask bugs. Recovery should log the panic for debugging.

## Key Differences

### Centralized vs Per-Operation Lifecycle Tracking
nats-server tracks every goroutine via `s.grWG.Add(1)` in `startGoRoutine()` (`server/server.go:4051`), providing a single mechanism for shutdown coordination. temporal has a dedicated `common/goro` package (`common/goro/group.go:15-20`). kubernetes wraps `sync.WaitGroup` in `wait.Group` (`staging/src/k8s.io/apimachinery/pkg/util/wait/wait.go:42-74`).

In contrast, cli and pocketbase use `sync.WaitGroup` per-operation without a central registry. This is simpler but relies on developers remembering to use `wg.Wait()` at the right call sites. A forgotten `wg.Wait()` causes goroutine leaks that only manifest at shutdown.

### context.Context vs Channel-Based Cancellation
openfga, grafana, and cli use `context.Context` throughout for cancellation propagation. This enables compositional cancellation (cancelling a child context doesn't cancel the parent) and deadline tracking.

nats-server deliberately avoids `context.Context` in production paths, using `quitCh chan struct{}` instead (`server/server.go:2687`). The nats-server authors cite simplicity—channel closure is easier to reason about than context cancellation trees. This works well for server shutdown but lacks deadline tracking for request-scoped operations.

pocketbase uses both patterns—`context.WithCancel` for request-scoped work and channel-based stop signals for long-running services like the cron ticker (`tools/cron/cron.go:196-198`).

### Bounded Concurrency Granularity
openfga, grafana, and kubernetes apply bounded concurrency at the per-operation level (errgroup.SetLimit, semaphore.Weighted). nats-server applies limits at system layers (disk I/O semaphore `dios`, catchup semaphore `syncOutSem`). victoriametrics applies limits at ingress points (insert concurrency limiter, query concurrency limiter).

pocketbase applies bounded concurrency only to specific I/O operations (thumbnail generation, file deletion), leaving general HTTP request handling unbounded. This is pragmatic but means bulk operations can still overwhelm the system.

### errgroup Adoption
openfga, grafana, and cli consistently use `golang.org/x/sync/errgroup` for fan-out operations. kubernetes uses `wait.Group` instead, noting that the channel integration in `wait.Group.StartWithChannel()` provides flexibility that errgroup lacks. nats-server and victoriametrics don't use errgroup at all—nats-server's single `grWG` is simpler but doesn't provide error aggregation; victoriametrics built a custom `syncwg.WaitGroup` wrapper.

## Tradeoffs

| Decision | Benefit | Cost | Best-Fit Context | Failure Mode | Alternative |
|----------|---------|------|------------------|--------------|------------|
| Centralized goroutine registry (nats-server, temporal) | Deterministic shutdown, no forgotten goroutines | Requires wrapper function discipline | Long-lived servers | Developer spawns goroutine without registry | Per-operation WaitGroup |
| errgroup for fan-out | Automatic cancellation propagation, error aggregation | Less control over individual goroutines | Request-scoped parallel operations | First-error-cancels-all may mask partial failures | Raw WaitGroup + manual error collection |
| Channel-based quit signals | Simple, no context overhead | No deadline tracking, no compositional cancellation | Server shutdown, internal workers | Operations that need timeout enforcement | context.Context |
| Buffered channel semaphore | Idiomatic, no external imports | Fixed size, tuning required | Simple concurrency limits | Workloads with variable resource consumption | semaphore.Weighted for dynamic sizing |
| FireAndForget goroutines | Simple, low overhead | No lifecycle tracking, opaque failures | Non-critical background tasks | Errors silently ignored, goroutine leaks | WaitGroup-tracked goroutines |
| Adaptive worker pool | Resource efficiency under variable load | Complexity, potential thrashing | Highly variable workloads | Over-tuned parameters cause instability | Fixed-size pool |
| slot-based backpressure (milvus) | Fine-grained resource tracking | Complexity in slot accounting | Memory-intensive index builds | Slot accounting bugs cause incorrect backpressure | Count-based limits |

## Decision Guide

**Choose centralized goroutine tracking when:**
- Building a long-lived server process
- Shutdown determinism is critical
- Multiple subsystems coordinate lifecycle
- You can enforce discipline via wrapper functions

**Choose errgroup.WithContext when:**
- Request-scoped fan-out with failure-cancels-all semantics
- You need automatic error aggregation
- Goroutines share a single cancellation context
- SetLimit() provides sufficient bounding

**Choose channel-based quit signals when:**
- Building lightweight internal workers
- You need explicit ordering of shutdown steps
- Cancellation doesn't require deadline tracking
- Simplicity is preferred over compositional power

**Choose buffered channel semaphore when:**
- You need a simple concurrency limit
- Limits are fixed or rarely change
- You want idiomatic Go without external imports
- Dynamic sizing isn't required

**Choose semaphore.Weighted when:**
- You need weighted semaphore (acquire multiple units)
- Dynamic limit adjustment is needed
- Acquisition should support timeouts
- Multiple resources with different capacities

**Choose adaptive pool when:**
- Workload concurrency varies significantly
- You can tune min/max/targetDelay parameters
- Worker creation overhead is acceptable
- You have observability into offer delays

## Practical Tips

1. **Use `errgroup.WithContext` for request-scoped fan-out**: The automatic cancellation propagation prevents resource waste when one branch fails. Combined with `SetLimit()`, it provides bounded concurrency without external dependencies.

2. **Centralize goroutine tracking for long-lived servers**: nats-server's `startGoRoutine()` pattern (`server/server.go:4051`) ensures every goroutine is registered. temporal's `common/goro` package provides structured lifecycle management. Even without a formal package, a shared `sync.WaitGroup` passed through your server struct enables clean shutdown.

3. **Apply bounded concurrency at ingress points**: victoriametrics (`lib/writeconcurrencylimiter/concurrencylimiter.go:95`) and grafana (`pkg/services/query/query.go:145-146`) limit concurrency at entry points rather than per-operation. This prevents overload from bulk operations.

4. **Use buffered channels sized to expected concurrency**: `make(chan Result, len(items))` in `pkg/cmd/issue/edit/edit.go:266-267` prevents blocking when sending results. This avoids the need for separate synchronization when closing channels.

5. **Always pair defer cancel() with pool.Wait()**: The openfga pattern at `internal/check/check.go:221-225` ensures cancellation before wait, guaranteeing goroutines have been signaled before blocking on completion.

6. **Use non-blocking send with context check for fire-and-forget reporting**: The `TrySendThroughChannel` pattern (`internal/concurrency/concurrency.go:26-33`) prevents goroutines from blocking on send after the caller has cancelled.

7. **Instrument your concurrency primitives**: grafana's debouncer exposes `itemsDroppedCounter` (`pkg/util/debouncer/debouncer.go:199`); victoriametrics tracks `concurrencyLimitReached` and `concurrencyLimitTimeout`. Metrics make backpressure visible in production.

## Anti-Patterns / Caution Signs

1. **Untracked goroutines**: Any `go func()` without a corresponding `wg.Done()` in a function that returns is a potential leak. cli has this issue with the signal handler goroutine at `pkg/iostreams/iostreams.go:379-384`.

2. **Unbounded goroutine spawning**: Operations that spawn a goroutine per work item without a global bound can cause thundering herd. milvus's segment retrieval at `internal/querynodev2/segments/retrieve.go:129` spawns one goroutine per segment.

3. **Blocking system calls during context cancellation**: Goroutines in `select` with `ctx.Done()` and blocking operations (network I/O, disk I/O) may not exit immediately when context is cancelled. cli notes this at `pkg/cmd/release/shared/upload.go:152-158` where `backoff.Retry` may not respect context cancellation during sleep intervals.

4. **Missing panic recovery in worker goroutines**: A panicking worker crashes the process if not recovered. grafana wraps datasource calls in panic recovery (`pkg/services/query/query.go:150-163`), but many projects don't.

5. **close() on channels with waiting senders**: If a channel is closed while goroutines are blocked in send, the panic is immediate and unrecoverable. Always drain or signal before closing.

6. **No backpressure beyond bounded queues**: Many projects have bounded queues but no mechanism to shed load when full. victoriametrics is the exception—its insert limiter returns 503 with actionable error messages after queue timeout (`lib/writeconcurrencylimiter/concurrencylimiter.go:106-131`).

7. **sync.Cond without spurious wakeup checks**: temporal's `matchCond.Wait()` at `service/matching/matcher_data.go:635` could suffer spurious wakeups; the code correctly checks `matchResult` after every wake to avoid processing incomplete matches. If you use `sync.Cond`, always check the condition in a loop.

## Notable Absences

1. **Circuit breaker patterns**: No project implements circuit breakers for cascading failure prevention. grafana mentions this as a future consideration.

2. **Goroutine leak detection in CI**: No project has systematic tests for goroutine leak detection (e.g., using `goleak`). Leak detection is manual or absent.

3. **Structured concurrency (Go 1.22+)**: No project adopts the new scoped goroutine patterns from Go 1.22, likely due to the recency of the feature and the projects predating it.

4. **Priority-based goroutine scheduling**: All projects use FIFO scheduling. No project implements priority-based goroutine preemption.

5. **Context deadline on List operations**: Several projects use `context.WithTimeout` for individual operations but not consistently for List operations that could block indefinitely.

## Per-Source Notes

**cli (6/10)**: Pragmatic concurrency with solid errgroup usage for fan-out operations. Bounded worker pools (10 workers) in search operations are good, but not uniformly applied. Some fire-and-forget goroutines lack explicit lifecycle management, notably the signal handler and update checker.

**grafana (8/10)**: Strong consistency in concurrency patterns—errgroup for fan-out, semaphore.Weighted for resource limits, debouncer for event coalescing. The channel-based semaphore in live.go (`pkg/services/live/live.go:214-216`) is less idiomatic than semaphore.Weighted. Service lifecycle interface in `dskit/services` provides structured shutdown hooks.

**kubernetes (8/10)**: The workqueue package (`client-go/util/workqueue`) is the central concurrency primitive, providing bounded parallelism, rate limiting, and metrics. The `wait.Group` wrapper adds channel integration that raw `sync.WaitGroup` lacks. Shared informer pattern (3 goroutines per listener) is complex but effective.

**milvus (7/10)**: Generic `Pool[T]` wrapping `ants` provides flexible bounded pools. Slot-based backpressure in index scheduler is sophisticated. Segment retrieval thundering herd is the main concern—the query segment retrieval spawns unbounded goroutines per segment.

**nats-server (8/10)**: The most disciplined approach to goroutine lifecycle—every goroutine registered via `startGoRoutine()`, shutdown waits on `grWG.Wait()`. The `ipQueue` for lock-free message passing is well-engineered. Absence of `context.Context` in production paths is a notable limitation for request-scoped cancellation.

**openfga (8/10)**: Consistent use of `errgroup.SetLimit()` for bounded edge resolution. Multi-layer throttling (dispatch + datastore) is sophisticated. The circular resolver chain (`builder.go:97-106`) enables dynamic composition but complicates debugging. Pipeline goroutine lifecycle is explicit—callers must call `Close()` to avoid leaks.

**pocketbase (7/10)**: `FireAndForget` with panic recovery is pragmatic for non-critical background tasks. Semaphore for thumbnail generation (runtime.NumCPU()+2 workers) and file deletion (2000 workers) provides good bounds. The optional `WaitGroup` parameter to `FireAndForget` is not always used, making lifecycle tracking informal.

**temporal (8/10)**: Dedicated `common/goro` package with `Group`, `Handle`, and `KeyedSet` provides the most structured lifecycle management. `AdaptivePool` auto-scales workers based on offer delay. `sync.Cond` for matcher coordination is pragmatic for complex wait patterns but adds synchronization complexity.

**victoriametrics (8/10)**: Thread-safe `syncwg.WaitGroup` with `WaitAndBlock()` is a well-designed extension. Queue timeout backpressure returns actionable 503 errors with guidance. Auto-tuning via `cgroup.AvailableCPUs()` makes deployment in containers automatic. No `errgroup` usage means manual error collection.

## Open Questions

1. **Should context.Context replace channel-based quit signals?**: nats-server's deliberate avoidance of `context.Context` in production paths works well for simple shutdown but lacks deadline tracking. As Go's context propagation improves, will channel-based signals remain viable, or should they be deprecated in favor of context?

2. **When does adaptive pool complexity pay off?**: temporal's `AdaptivePool` adds significant complexity for dynamic scaling. Is it worth it compared to fixed pools with properly tuned sizes? Under what workloads does adaptive scaling provide measurable benefit?

3. **How should goroutine leak detection be systematized?**: No project has systematic CI-based leak detection. Should `goleak` be added to test suites? What are the tradeoffs between integration tests (which can catch leaks) and unit tests (which are more focused)?

4. **Is the circular resolver chain in openfga debuggable in production?**: The delegation chain skips intermediate wrappers when traversing to find the `LocalChecker`. How does this affect observability and debugging in production?

5. **What is the right backpressure model?**: victoriametrics queues with timeout; nats-server drops on full; grafana's debouncer drops on full. Which model is most appropriate for which workload characteristics? Is there a principled way to choose?

## Evidence Index

| Source | File:Line | Pattern |
|--------|-----------|---------|
| cli | `pkg/cmd/extension/manager.go:196-206` | WaitGroup for extension version fetching |
| cli | `pkg/cmd/skills/search/search.go:837-838` | Semaphore pattern |
| cli | `pkg/cmd/codespace/ports.go:330-352` | errgroup.WithContext for port forwarding |
| grafana | `pkg/services/ngalert/schedule/schedule.go:251` | errgroup cancellation propagation |
| grafana | `pkg/services/query/query.go:145-146` | errgroup.SetLimit |
| grafana | `pkg/util/debouncer/debouncer.go:199` | Buffer drop with metrics |
| kubernetes | `staging/src/k8s.io/apimachinery/pkg/util/wait/wait.go:42-74` | wait.Group wrapper |
| kubernetes | `staging/src/k8s.io/client-go/util/workqueue/queue.go:217` | Graceful queue shutdown |
| kubernetes | `staging/src/k8s.io/client-go/tools/cache/shared_informer.go:1196-1207` | 3-goroutine pipeline per listener |
| milvus | `pkg/util/conc/pool.go:33-94` | Generic Pool wrapping ants |
| milvus | `internal/datanode/index/scheduler.go:58-90` | Slot-based backpressure |
| milvus | `internal/querynodev2/segments/retrieve.go:129` | Per-segment goroutine spawn |
| nats-server | `server/server.go:251` | grWG tracking |
| nats-server | `server/server.go:4051-4064` | startGoRoutine wrapper |
| nats-server | `server/ipqueue.go:25-36` | ipQueue generic |
| nats-server | `server/ipqueue.go:68-81` | Bounded ipQueue |
| openfga | `internal/check/check.go:214-225` | Deferred cancel-then-wait |
| openfga | `internal/check/check.go:219` | errgroup.SetLimit |
| openfga | `internal/concurrency/concurrency.go:26-33` | TrySendThroughChannel |
| openfga | `internal/throttler/throttler.go:45-66` | constantRateThrottler |
| pocketbase | `tools/routine/routine.go:13-35` | FireAndForget with panic recovery |
| pocketbase | `apis/realtime.go:229-252` | Chunked errgroup broadcasting |
| temporal | `common/goro/group.go:15-20` | Group struct |
| temporal | `common/goro/adaptive_pool.go:61-93` | AdaptivePool backpressure |
| temporal | `service/matching/matcher_data.go:610-615` | sync.Cond for coordination |
| victoriametrics | `lib/syncwg/syncwg.go:12-49` | Thread-safe WaitGroup |
| victoriametrics | `lib/writeconcurrencylimiter/concurrencylimiter.go:95-136` | Insert concurrency limiter |
| victoriametrics | `lib/protoparser/protoparserutil/unmarshal_work.go:24-50` | Worker pool Start/Stop |
| victoriametrics | `lib/contextutil/stop_chan_context.go:16-47` | StopChanContext adapter |

---

Generated by dimension `06-concurrency-model`.