# Source Analysis: temporal

## Concurrency Model

### Source Info

| Field | Value |
|-------|-------|
| Name | temporal |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/temporal` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

Temporal is a distributed workflow engine written in Go with a sophisticated concurrency architecture. The project uses centralized goroutine lifecycle management via a dedicated `common/goro` package, adaptive worker pools, and extensive context-based cancellation. The concurrency model prioritizes bounded resources, graceful shutdown, and structured patterns for fan-out/fan-in workflows. Channel usage is pragmatic—favoring buffered channels for task pipelines and sync.Cond for complex coordination scenarios.

## Rating

**8/10** — Excellent implementation with well-structured patterns. Minor gaps include inconsistent use of `errgroup` (only in tools/flakereport) and limited use of semaphore patterns for bounded concurrency.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Goroutine lifecycle management | `Group` struct with shared context, cancel, and WaitGroup | `common/goro/group.go:15-20` |
| Goroutine lifecycle management | `Handle` struct for single goroutine with done channel and error storage | `common/goro/goro.go:11-16` |
| Goroutine lifecycle management | `Go()` method spawns goroutines with shared context | `common/goro/group.go:29-36` |
| Goroutine lifecycle management | `KeyedSet` manages keyed goroutines with Sync() for updates | `common/goro/keyed_set.go:10-14,34-52` |
| Adaptive worker pool | `AdaptivePool` with min/max workers and adaptive scaling | `common/goro/adaptive_pool.go:15-26` |
| Adaptive worker pool | Worker count using `atomic.Int64` for lock-free tracking | `common/goro/adaptive_pool.go:24,47,83,106,120,137` |
| Fixed worker pool | Fixed-size pool executor with WaitGroup-based lifecycle | `service/worker/scanner/executor/executor.go:32-44,76-83` |
| Task pipeline | Two-stage pipeline: `getTasksPump()` and `dispatchBufferedTasks()` | `service/matching/task_reader.go:57-59,85-124,131-196` |
| Task pipeline | Buffered channel for task buffering with notify signal | `service/matching/task_reader.go:29-30,43` |
| Channel: sync.Cond | `sync.Cond` for blocking on match result in matcher | `service/matching/matcher_data.go:610-615,629-630,635` |
| Channel: streaming | `stream_batcher` with submit channel and response channels | `common/stream_batcher/batcher.go:19,26-29,62` |
| Channel: query results | `queryResults` SyncMap of result channels | `service/matching/matching_engine.go:167` |
| Context: cancellation | `context.WithCancel` for shared context in Group | `common/goro/group.go:53` |
| Context: AfterFunc | `context.AfterFunc` for joining contexts | `service/matching/pri_matcher.go:202-205,332-336` |
| Context: timeout | `context.WithTimeout` for task dispatch deadlines | `service/matching/task_reader.go:102` |
| WaitGroup usage | Scanner workflow goroutines tracked with `sync.WaitGroup` | `service/worker/scanner/scanner.go:101,167,175,181,187,238,234` |
| errgroup usage | `errgroup.WithContext` in flakereport bisect tool | `tools/flakereport/biseter.go:483` |
| Mutex usage | `sync.Mutex` for gaugeMetrics and userDataUpdateBatchers | `service/matching/matching_engine.go:122,129` |
| RWMutex usage | `sync.RWMutex` for versioned queues mutation | `service/matching/task_queue_partition_manager.go:73` |
| Fan-out pattern | Multiple scanner workflows started in parallel | `service/worker/scanner/scanner.go:166-210` |
| Per-namespace workers | Background goroutines for membership and refresh | `service/worker/pernamespaceworker.go:157-158,195,202` |

## Answers to Dimension Questions

### 1. How does the project manage goroutine lifetimes without leaking?

**Evidence**: The `common/goro` package provides centralized goroutine lifecycle management.

- `goro.Group` (`common/goro/group.go:15-20`) maintains a shared `context.Context`, `context.CancelFunc`, and `sync.WaitGroup` for coordinated lifecycle management across multiple goroutines.
- `goro.Handle` (`common/goro/goro.go:11-16`) wraps a single goroutine with its own cancelable context, done channel, and atomic error storage.
- `goro.KeyedSet` (`common/goro/keyed_set.go:10-14`) manages keyed goroutines where `Sync()` cancels goroutines for removed keys and starts new ones for added keys.
- Service shutdown uses explicit `sync.WaitGroup` patterns — e.g., `service/worker/scanner/scanner.go:234` calls `s.wg.Wait()` in `Stop()` after starting goroutines with `s.wg.Add(1)`.
- The `AdaptivePool` (`common/goro/adaptive_pool.go:95-133`) worker loop exits when the context is cancelled or when shrinking after `shrinkTimeout`.

### 2. Are there bounded concurrency patterns when handling many tasks?

**Evidence**: Yes, multiple bounded concurrency patterns exist.

- `AdaptivePool` (`common/goro/adaptive_pool.go:15-26`) enforces `minWorkers` and `maxWorkers` bounds with adaptive scaling based on `targetDelay` and `shrinkFactor`.
- `FixedPoolExecutor` (`service/worker/scanner/executor/executor.go:32-44`) uses a fixed-size pool with `size` configuration.
- Task reader (`service/matching/task_reader.go:29`) uses a `taskBuffer chan *persistencespb.AllocatedTaskInfo` with implicit buffering based on channel capacity.
- Flakereport parallel tool (`tools/flakereport/parallel.go:40-47`) uses a WaitGroup-based worker pool with explicit `concurrency` parameter.
- However, `errgroup` usage is limited — only found in `tools/flakereport/bisect.go:483`, not used in core service paths.

### 3. How is cancellation propagated through multi-step operations?

**Evidence**: Extensive use of `context.Context` for cancellation propagation.

- `context.AfterFunc` (`service/matching/pri_matcher.go:202-205,332-336`) joins two contexts — when the parent cancels, the child is cancelled.
- `context.WithTimeout` (`service/matching/task_reader.go:102`) wraps operations with deadlines.
- `context.WithCancel` (`common/goro/group.go:53`) creates shared cancellation context for goroutine groups.
- Context cancellation is checked at key points — e.g., `service/matching/matching_engine.go:379` checks `ctx.Err() != nil` in `watchMembership()`.
- In `service/matching/matcher_data.go:314-325`, `context.AfterFunc` arranges task cancellation when context is cancelled.

### 4. What patterns prevent channel deadlocks or goroutine leaks?

**Evidence**: Multiple defensive patterns observed.

- Buffered channels for signaling: `notifyC chan struct{}` with `make(chan struct{}, 1)` (`service/matching/task_reader.go:43`) enables non-blocking signal delivery.
- `sync.Cond` instead of channels for complex coordination: `matchCond sync.Cond` (`service/matching/matcher_data.go:612`) avoids deadlock-prone channel patterns for waiting on results.
- `context.AfterFunc` for automatic cleanup: when context cancels, tasks are removed and waiters are woken.
- Non-blocking send first in AdaptivePool: `select` with `default` case tries non-blocking send before potentially blocking (`common/goro/adaptive_pool.go:88-92`).
- `defer cancel()` and `defer stop()` patterns ensure cancellation is always propagated.

### 5. How does the system handle backpressure under load?

**Evidence**: Adaptive scaling and bounded queues.

- `AdaptivePool` (`common/goro/adaptive_pool.go:61-93`) implements backpressure by:
  - Trying non-blocking send first
  - If delayed beyond `targetDelay`, adding a new worker (up to `maxWorkers`)
  - Shrinking via jittered timers when idle
- Task reader (`service/matching/task_reader.go:102`) uses `taskReaderOfferTimeout` to limit blocking time.
- `stream_batcher` (`common/stream_batcher/batcher.go:116-123`) gathers items with `MinDelay` gaps and `IdleTime` timeouts, flushing when `MaxDelay` or `MaxItems` is reached.
- Fixed pool executor (`service/worker/scanner/executor/executor.go:95-105`) queues tasks in a run queue — no evidence of bounded queue with rejection.

## Architectural Decisions

1. **Dedicated goro package**: Temporal invests in a `common/goro` package for lifecycle management rather than ad-hoc goroutine spawning, indicating a deliberate choice for consistency and observability.

2. **sync.Cond for matcher coordination**: Using `sync.Cond` in `matcher_data.go:610-615` for blocking on match results instead of channels is a pragmatic choice for complex multi-party coordination where channels would increase complexity.

3. **Adaptive pools over fixed pools**: The `AdaptivePool` suggests the system anticipates varying load and prefers to scale dynamically rather than over-provision fixed workers.

4. **Context as cancellation primitive**: Heavy reliance on `context.Context` over manual channel-based cancellation indicates a preference for composable, hierarchical cancellation over ad-hoc signaling.

5. **Limited errgroup usage**: `errgroup` is only used in `tools/flakereport/bisect.go`, suggesting the project prefers explicit `sync.WaitGroup` patterns in production service paths for more control.

## Notable Patterns

- **Adaptive worker pool** (`common/goro/adaptive_pool.go`): Auto-scales between min/max workers based on offer delay, implementing natural backpressure.
- **Two-stage task pipeline** (`service/matching/task_reader.go`): Producer (`getTasksPump`) and consumer (`dispatchBufferedTasks`) separated by buffered channel.
- **Keyed goroutine sets** (`common/goro/keyed_set.go`): Manages lifecycle of named goroutines with atomic Sync() operation.
- **context.AfterFunc for cleanup** (`service/matching/matcher_data.go:314-325`): Arranges automatic cleanup when context is cancelled.
- **Per-namespace worker isolation** (`service/worker/pernamespaceworker.go`): Each namespace gets its own worker goroutines coordinated via membership changes.

## Tradeoffs

- **AdaptivePool complexity vs simplicity**: The adaptive scaling logic adds complexity but prevents over-provisioning; fixed pools are simpler but may waste resources.

- **sync.Cond vs channels**: `sync.Cond` is lower-level and easier to misuse (e.g., spurious wakeups), but avoids channel boilerplate for complex wait patterns.

- **Context propagation vs explicit cancellation**: Contexts are composable but can be overused; some paths may be harder to trace for cancellation responsibility.

- **WaitGroup vs errgroup**: `sync.WaitGroup` gives explicit control but requires manual error aggregation; `errgroup` simplifies error collection but provides less granular control.

## Failure Modes / Edge Cases

- **Goroutine leak in AdaptivePool**: If `Do()` is called with a context that never completes and workers are at `maxWorkers`, work could accumulate indefinitely in the internal channel. No evidence of bounded submission channel with backpressure.

- **Context leak in task reader**: `getTasksPump()` (`service/matching/task_reader.go:131-196`) runs until context cancellation, but if the parent context isn't properly cancelled on shutdown, the pump could leak.

- **Spurious wakeup in sync.Cond**: The `matchCond.Wait()` at `service/matching/matcher_data.go:635` could suffer spurious wakeups — the code checks `matchResult` after every wake to avoid processing incomplete matches.

- **Task queue partition cleanup**: `task_queue_partition_manager.go:156` uses `initCtx` with `initCancel` for partition lifecycle, but if `InvalidateAll()` isn't called on shutdown, context leaks could occur.

- **Errgroup not used in service paths**: Production services don't use `errgroup`, meaning errors from parallel operations may not be properly aggregated, requiring manual error collection patterns.

## Future Considerations

- Evaluate whether `errgroup` should be adopted in service paths for parallel operation error aggregation.
- Consider adding submission channel bounds to `AdaptivePool.Do()` to provide backpressure at the caller level.
- Assess whether `sync.Cond` usage could be replaced with channels + select for better Go idioms, though the complexity of the matcher coordination may warrant the current approach.
- Add metrics/observability for AdaptivePool scaling decisions to aid operations.

## Questions / Gaps

- **No evidence found** of semaphore pattern (`sync.Semaphore`) usage in the codebase for bounded concurrency control.
- **No evidence found** of worker pool pause/resume mechanism for load shedding.
- **No evidence found** of circuit breaker pattern for handling downstream failures.
- Limited evidence of backpressure at the client level — much of the backpressure is internal to pools.

---

Generated by `dimensions/06-concurrency-model.md` against `temporal`.
