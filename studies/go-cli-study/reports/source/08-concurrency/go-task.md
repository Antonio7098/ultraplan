# Repo Analysis: go-task

## Concurrency & Async Patterns

### Repo Info

| Field | Value |
|-------|-------|
| Name | go-task |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/go-task` |
| Group | go-task |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Go-task uses structured concurrency with `errgroup.Group` for task execution and dependency handling, a semaphore-based concurrency limiter, and careful mutex protection for shared state. Goroutine spawning is localized to specific subsystems (watch, signals, taskfile reading). Race prevention is achieved through mutexes, atomic operations, and a deduplication channel pattern. Overall the concurrency design is well-structured and follows idiomatic Go patterns.

## Rating

**8/10** — Structured concurrency with errgroup, semaphore-based parallelism control, and mutex-protected shared state. Goroutine leaks are prevented through deferred cancel calls and explicit lifecycle management. Some watch-mode goroutines lack explicit cleanup on exit, but the design is otherwise sound.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| errgroup usage | Task execution and deps | `task.go:87`, `task.go:319`, `task.go:556` |
| errgroup with context (failfast) | Errgroup with context for early cancellation | `task.go:88-90`, `task.go:320-322` |
| Concurrency semaphore | Semaphore channel for max parallel tasks | `executor.go:78`, `setup.go:278`, `concurrency.go:3-22` |
| Atomic counter | Task call count limit | `task.go:197` |
| Mutex map (mkdir) | Per-task mkdir mutex | `executor.go:80`, `setup.go:271-274`, `task.go:306-315` |
| Mutex for execution hashes | Protects execution deduplication map | `executor.go:82`, `task.go:448-468` |
| RWMutex | Thread-safe taskfile data structures | `taskfile/ast/vars.go:18`, `taskfile/ast/tasks.go:22`, `taskfile/ast/include.go:32` |
| fsnotify event dedup | Channel-based event deduplication | `internal/fsnotifyext/fsnotify_dedup.go:25-50` |
| Watch goroutines | 6 goroutine launch sites in watch.go | `watch.go:39`, `watch.go:71`, `watch.go:87`, `watch.go:131`, `watch.go:158` |
| Signal handling goroutine | Intercepts SIGINT/SIGTERM | `signals.go:20-31` |
| Context cancellation | Shutdown via context cancelation | `watch.go:37`, `watch.go:82`, `task.go:341-342` |
| Taskfile reading parallelism | errgroup for included taskfiles | `taskfile/reader.go:316`, `taskfile/ast/graph.go:71` |
| Git cache mutex | Thread-safe git clone deduplication | `taskfile/node_git.go:32-54` |

## Answers to Protocol Questions

### 1. Where are goroutines launched?

Goroutines are spawned in specific, localized locations:

- **Watch mode** (`watch.go`): Multiple goroutines handle file watching, task rerunning, and directory registration:
  - Initial task runners: `watch.go:39`
  - Event processing loop: `watch.go:71`
  - Per-call task goroutines on events: `watch.go:87`
  - Directory registration loop: `watch.go:131`
  - Signal handler: `watch.go:158`

- **Signal interception** (`signals.go:20`): Background goroutine listens for interrupt signals.

- **fsnotify deduplication** (`internal/fsnotifyext/fsnotify_dedup.go:28`): Background goroutine deduplicates file system events.

- **Taskfile reading** (`taskfile/reader.go:323` and `taskfile/ast/graph.go:77`): Goroutines process included Taskfiles in parallel.

### 2. How are they coordinated?

Coordination mechanisms:

- **`errgroup.Group`** (`task.go:87,319,556`): Used for task execution and dependency running with optional failfast context (`task.go:88-90`). Also used in taskfile reading (`taskfile/reader.go:316`) and graph merging (`taskfile/ast/graph.go:71`).

- **Semaphore channel** (`concurrency.go:3-22`, `setup.go:278`): `acquireConcurrencyLimit()` and `releaseConcurrencyLimit()` use a buffered channel of struct{} to limit concurrent task execution. Tasks call `acquireConcurrencyLimit()` before running and `defer release()` after completion (`task.go:204-205`).

- **Context cancellation** (`task.go:462`, `watch.go:37,82`): Contexts are passed through task execution for proper cancellation propagation. Watch mode creates new contexts on file changes (`watch.go:82`).

- **Mutex protection**: Multiple mutexes protect shared state:
  - `executionHashesMutex` (`executor.go:82`) protects deduplication map
  - `mkdirMutexMap` (`executor.go:80`) per-task mutex for directory creation
  - `sync.RWMutex` on thread-safe collections (`vars.go:18`, `tasks.go:22`, `include.go:32`)

### 3. How is cleanup handled?

Cleanup is handled through multiple mechanisms:

- **Deferred release** (`task.go:205`): Every task that acquires a concurrency slot defers release via `defer release()`.

- **Deferred cancel** (`task.go:342`): Deferred commands run in a child context with deferred cancel.

- **Context chaining** (`task.go:462`): When executing a task that has a hash collision, the code waits on `otherExecutionCtx.Done()` and releases the concurrency slot before waiting (`task.go:455-456`).

- **Signal handling** (`signals.go:20-31`): A dedicated goroutine handles SIGINT/SIGTERM, allowing graceful shutdown. After 3 signals, it force exits.

- **Watcher close** (`watch.go:64`): The fsnotify watcher is closed via `defer w.Close()`.

- **Concurrency semaphore cleanup**: When concurrency is set to 0, the semaphore is nil and `acquireConcurrencyLimit` returns `emptyFunc` — no cleanup needed.

**Potential issue**: The watch loop (`watch.go:143`) blocks forever on `<-make(chan struct{})` with no mechanism to close it, meaning the goroutines launched in watch mode (`watch.go:39,71,87,131`) are never explicitly waited on or terminated. However, the signal handler can call `os.Exit(0)` which terminates the process.

### 4. Are race conditions considered?

Yes, race conditions are mitigated through:

- **Atomic operations** (`task.go:197`): `atomic.AddInt32` for task call counting — safe across goroutines.

- **Mutex maps** (`task.go:306-315`): Per-task mutexes protect directory creation from concurrent `os.MkdirAll` calls.

- **RWMutex on collections** (`taskfile/ast/vars.go:18`, `taskfile/ast/tasks.go:22`): Thread-safe access to variable and task collections.

- **Execution hash deduplication** (`task.go:448-468`): `executionHashesMutex` protects concurrent map access when checking for duplicate task executions.

- **Git cache mutex** (`taskfile/node_git.go:32-54`): Multiple goroutines cloning the same repo+ref are serialized via mutex-per-repo pattern. The comment explicitly notes thread-safety (`taskfile/node_git.go:120`).

- **Prompt mutex** (`taskfile/reader.go:56`): Serializes interactive prompts.

## Architectural Decisions

1. **Semaphore-based concurrency limiting**: Instead of a worker pool pattern, tasks directly acquire/release from a buffered channel. This is simple and effective but means unbounded goroutine count (though bounded by semaphore).

2. **Failfast via errgroup context**: When `e.Failfast` is set, `errgroup.WithContext(ctx)` is used, cancelling all sibling goroutines if any task fails. This is a clean pattern for early-exit scenarios.

3. **Execution deduplication via hash**: Tasks with identical hashes (same template variables) share execution context via `executionHashes` map, waiting on the first execution to complete before skipping subsequent runs.

4. **Per-task mutex map**: Instead of a single mutex or a lock-free structure, each task gets its own mutex for mkdir operations, reducing contention.

5. **Deferred command context**: Deferred commands run in a fresh `context.WithCancel(context.Background())` context that is cancelled after the deferred function completes, ensuring cleanup doesn't block.

## Notable Patterns

- **errgroup with failfast context** (`task.go:88-90`):
  ```go
  g := &errgroup.Group{}
  if e.Failfast {
      g, ctx = errgroup.WithContext(ctx)
  }
  ```

- **Semaphore acquire/release** (`task.go:204-205`):
  ```go
  release := e.acquireConcurrencyLimit()
  defer release()
  ```

- **Concurrency slot reacquire on nested calls** (`task.go:324-325`):
  ```go
  reacquire := e.releaseConcurrencyLimit()
  defer reacquire()
  ```

- **Execution deduplication** (`task.go:450-459`):
  ```go
  if otherExecutionCtx, ok := e.executionHashes[h]; ok {
      reacquire := e.releaseConcurrencyLimit()
      defer reacquire()
      <-otherExecutionCtx.Done()
      return nil
  }
  ```

## Tradeoffs

1. **Watch mode goroutine lifecycle**: Goroutines are spawned without explicit cleanup mechanism. The `<-make(chan struct{})` at `watch.go:143` blocks indefinitely. While the signal handler can terminate the process, goroutines launched for task execution (`watch.go:87`) could run longer than necessary if watch exits abnormally.

2. **Semaphore vs worker pool**: Using a semaphore means goroutines are created for each task regardless of concurrency setting. A worker pool would reuse goroutines but adds complexity. For a CLI tool with typically short-lived tasks, the semaphore approach is reasonable.

3. **Execution deduplication complexity**: The `startExecution` function with its mutex and context storage adds complexity. It's an optimization to avoid duplicate work for repeated identical task calls, but the mutex contention on every execution hash check (`task.go:448`) could be a bottleneck in high-concurrency scenarios.

4. **Per-task mutex memory**: The `mkdirMutexMap` pre-allocates a mutex for every task defined in the Taskfile (`setup.go:271`). For Taskfiles with thousands of tasks, this could use significant memory.

## Failure Modes / Edge Cases

1. **Goroutine leak in watch mode**: If the watch loop is interrupted but not cleanly exited (e.g., via non-signal external termination), goroutines at `watch.go:39,71,87,131,158` may not be waited on. However, since the main goroutine blocks at `watch.go:143`, process termination would kill them.

2. **Panic in deferred command** (`task.go:340`): The `runDeferred` function creates a context with cancel but the defer mechanism doesn't explicitly handle panics. If `runDeferred` panics, the defer still runs but the context cancel may be lost.

3. **Execution hash collision under high concurrency**: The `executionHashesMutex` is locked for the duration of checking and updating the execution map (`task.go:448-468`). Under high concurrency with many tasks starting simultaneously, this could serialize execution unnecessarily.

4. **Git clone race** (`taskfile/node_git.go:32-54`): The mutex-per-repo pattern correctly handles concurrent clones of the same repo, but if many goroutines try to clone different repos simultaneously, the global cache lock could become a bottleneck.

5. **Signal queue overflow**: If signals arrive faster than they are processed (`signals.go:20-31`), the unbuffered channel could block the signal handler goroutine. The `maxInterruptSignals = 3` with a buffered channel of size 3 (`signals.go:17`) means 3 signals can be queued; the 4th would block.

## Future Considerations

1. **Context lifecycle in watch mode**: Consider adding a done channel that is closed during graceful shutdown, allowing all watch goroutines to terminate cleanly.

2. **Worker pool pattern**: Consider replacing the semaphore-based unbounded goroutine model with a fixed-size worker pool for high-concurrency scenarios.

3. **Lock-free execution deduplication**: The current mutex-protected map could be replaced with a sync.Map or a lock-free alternative if profiling shows contention.

4. **Pre-allocated mutex map sizing**: Consider lazy initialization of the mutex map instead of pre-allocating for every task, to reduce memory for large Taskfiles.

## Questions / Gaps

1. **No evidence found** for graceful shutdown waiting on goroutines in watch mode — no `sync.WaitGroup` or equivalent used to wait for task goroutines to complete before exit.

2. **No evidence found** for context timeout on individual task execution (timeout is only set for remote Taskfile reads in `setup.go:76`).

3. **No evidence found** for structured logging with contextual goroutine IDs — logging is based on task names, not goroutine identifiers.

4. **No evidence found** for integration tests exercising race conditions — while there are concurrency primitives, race safety appears to rely on code review rather than test coverage.

---

Generated by `study-areas/08-concurrency.md` against `go-task`.