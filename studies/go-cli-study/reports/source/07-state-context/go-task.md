# Repo Analysis: go-task

## State & Context Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | go-task |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/go-task` |
| Group | `07-state-context` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

go-task is a task runner/build tool similar to Make. It uses `context.Context` consistently throughout execution layers, with proper cancellation propagation via `errgroup.Group`. Application state is centralized in the `Executor` struct, which is configured once and passed through all operations. There is no explicit "session" concept — the `Executor` itself acts as the session-like state container.

## Rating

**8/10** — Clean context propagation and cancellation handling. Context flows through all execution layers (taskfile reading, task running, dependency execution, fingerprinting, preconditions). Signal handling intercepts SIGINT/SIGTERM for graceful shutdown. Minor扣分: deferred commands create fresh `context.Background()` instead of deriving from parent context, and there is no explicit session abstraction.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Context passed to Run | `Executor.Run(ctx context.Context, calls ...*Call)` | `task.go:42` |
| Context creation with timeout | `context.WithTimeout(context.Background(), e.Timeout)` | `setup.go:76` |
| Context propagation via errgroup | `g, ctx = errgroup.WithContext(ctx)` | `task.go:89` |
| Cancellation in RunTask | `ctx, cancel := context.WithCancel(context.Background())` | `task.go:341` |
| Child context for deps | `g, ctx = errgroup.WithContext(ctx)` | `task.go:321` |
| Context passed to runCommand | `e.runCommand(ctx, t, call, i)` | `task.go:275` |
| Context passed to status check | `fingerprint.IsTaskUpToDate(ctx, t, ...)` | `task.go:229` |
| Context passed to preconditions | `areTaskPreconditionsMet(ctx, t)` | `task.go:219` |
| Context in startExecution | `ctx, cancel := context.WithCancel(ctx)` | `task.go:462` |
| Watch loop cancellation | `ctx, cancel := context.WithCancel(context.Background())` | `watch.go:37` |
| Watch restarts on events | `ctx, cancel = context.WithCancel(context.Background())` | `watch.go:82` |
| Context error detection | `errors.Is(err, context.Canceled) \|\| errors.Is(err, context.DeadlineExceeded)` | `watch.go:152` |
| Signal interception | `signal.Notify(ch, os.Interrupt, syscall.SIGTERM, syscall.SIGHUP)` | `signals.go:18` |
| Executor struct (state container) | `Executor struct { ... executionHashes map[string]context.Context ... }` | `executor.go:81` |
| Execution hash map mutex | `executionHashesMutex sync.Mutex` | `executor.go:82` |
| Concurrency semaphore | `concurrencySemaphore chan struct{}` | `executor.go:78` |
| Deferred run uses fresh context | `ctx, cancel := context.WithCancel(context.Background())` | `task.go:341` |
| Prompt cancellation | `TaskCancelledByUserError` | `errors/errors_task.go:122` |
| No-terminal cancellation | `TaskCancelledNoTerminalError` | `errors/errors_task.go:135` |
| Missing vars cancellation | `TaskCancelledMissingVarsError` | `errors/errors_task.go:175` |
| Taskfile read with ctx | `reader.Read(ctx, node)` | `taskfile/reader.go:249` |
| HTTP node read with ctx | `(*HTTPNode) ReadContext(ctx context.Context)` | `taskfile/node_http.go:108` |
| Git node read with ctx | `(*GitNode) ReadContext(ctx context.Context)` | `taskfile/node_git.go:161` |
| RemoteExists with ctx | `RemoteExists(ctx context.Context, ...)` | `taskfile/taskfile.go:41` |
| Status checker interface | `IsUpToDate(ctx context.Context, t *ast.Task) (bool, error)` | `internal/fingerprint/checker.go:11` |
| Precondition check cancellation | `!errors.Is(err, context.Canceled)` | `precondition.go:24` |

## Answers to Protocol Questions

### 1. How is `context.Context` propagated?

Context is passed as the first parameter through all execution methods. The entry point at `cmd/task/task.go:196` creates `ctx := context.Background()`, then passes it to `e.Run(ctx, calls...)` at line 202. From there it flows through:

- `Executor.Run` → `Executor.RunTask` (`task.go:128`)
- `Executor.RunTask` → `e.startExecution` (closure, `task.go:207`), `e.runDeps` (`task.go:209`), `e.runCommand` (`task.go:275`)
- `Executor.runDeps` uses `errgroup.WithContext(ctx)` to propagate cancellation to parallel dependency tasks (`task.go:318-337`)
- `Executor.startExecution` creates a child context via `context.WithCancel(ctx)` at `task.go:462` to track per-task execution
- `Executor.Status` and fingerprint checks receive context at `status.go:12`, `task.go:229`
- Preconditions receive context at `precondition.go:16`
- Taskfile reading (`taskfile/reader.go:249`) and all node types receive context

Context is NOT propagated via `context.WithValue` — there is no ctx-keyed data passing. All state flows through the `Executor` struct fields.

### 2. How is cancellation handled?

Cancellation is handled through several mechanisms:

1. **`errgroup.WithContext`** — When `Failfast` is enabled or per-task, parallel sub-tasks (deps, commands calling other tasks) are cancelled as a group via `errgroup.Group`. When any task returns a non-nil error, all other goroutines in the group are cancelled. See `task.go:89`, `task.go:321`.

2. **Watch mode** — Creates a fresh root context on each file change event (`watch.go:82`). The previous context is cancelled via the previous `cancel()` call before creating a new one. File system watcher events (`fsnotify`) trigger task re-execution with a new context.

3. **Explicit context checks** — Before expensive operations like fingerprinting, `ctx.Err()` is checked at `task.go:215`. Precondition errors re-think cancellation at `precondition.go:24`.

4. **Error type for user cancellation** — `TaskCancelledByUserError` (`errors/errors_task.go:122`) and `TaskCancelledNoTerminalError` (`errors/errors_task.go:135`) distinguish user-initiated cancellation from other errors.

5. **Signal handling** — `InterceptInterruptSignals()` (`signals.go:16`) intercepts SIGINT/SIGTERM but notably does NOT cancel a context — it just logs and eventually exits. There is no graceful propagation of signals to running tasks via context cancellation. Watch mode does close the fsnotify watcher on interrupt (`watch.go:160`), but regular runs rely on process termination.

### 3. Is application state centralized or per-command?

Application state is **centralized in the `Executor` struct** (`executor.go:27-84`). All state is set up once via `Executor.Setup()` (`setup.go:26`) and remains on the executor instance for the duration of the run. Key state fields include:

- `Taskfile *ast.Taskfile` — parsed task definitions (`executor.go:65`)
- `Logger *logger.Logger` — output handle (`executor.go:66`)
- `Compiler *Compiler` — variable resolution (`executor.go:67`)
- `promptedVars *ast.Vars` — vars collected from interactive prompts (`executor.go:77`)
- `concurrencySemaphore chan struct{}` — concurrency limit (`executor.go:78`)
- `executionHashes map[string]context.Context` — running task deduplication (`executor.go:81`)
- `taskCallCount map[string]*int32` — loop detection (`executor.go:79`)
- `mkdirMutexMap map[string]*sync.Mutex` — directory creation serialization (`executor.go:80`)

No state is passed via function parameters beyond the call stack. CLI arguments, flags, and environment are merged into `Taskfile.Vars` at `cmd/task/task.go:176`.

**Exception**: Deferred commands (cleanup functions) create a fresh `context.Background()` at `task.go:341`, not derived from the parent context. This is a minor inconsistency.

### 4. How are sessions modeled?

There is **no explicit session concept** in go-task. The `Executor` instance serves as the session-like container. It holds all configuration, state, and execution references from initialization through completion.

- No session ID or token
- No session lifecycle events (start/end hooks)
- No session-scoped variable stores (beyond the per-executor `Taskfile.Vars` and `promptedVars`)
- No session persistence (no save/restore of executor state)
- The closest analog to "session" is the `Executor` struct itself, which is created per CLI invocation and discarded on completion

Execution deduplication via `executionHashes` (`executor.go:81`, `setup.go:268`) prevents duplicate task executions from concurrent watchers, acting like a session-level mutex — but it is not modeled as a session concept.

## Architectural Decisions

- **Context as execution token, not data carrier**: Context is used solely for cancellation/deadline propagation, not for passing values. All data flows through `Executor` fields or function parameters.
- **Executor as self-contained executor**: All state is encapsulated in `Executor`. No global variables. This makes the executor testable and reusable.
- **errgroup for structured concurrency**: Parallel task/dep execution uses `golang.org/x/sync/errgroup` with context propagation, ensuring clean cancellation of sibling goroutines.
- **Fresh context for watch mode**: Watch mode cancels and recreates context on each file change event rather than using a single long-lived context. This avoids context lifetime issues with long-running watch sessions.
- **Deferred commands use independent context**: Deferred cleanup commands (`runDeferred`, `task.go:340`) use `context.Background()` rather than deriving from the task's context. This is intentional (cleanup should not be cancelled when task is cancelled) but worth noting.

## Notable Patterns

1. **Execution deduplication via context map**: `executionHashes map[string]context.Context` (`executor.go:81`) stores the context of currently-executing tasks keyed by their content hash. Other tasks with the same hash wait on `otherExecutionCtx.Done()` to prevent duplicate execution. Protected by `executionHashesMutex` (`executor.go:82`). See `startExecution` at `task.go:438-469`.

2. **Concurrency semaphore for task-level parallelism**: `concurrencySemaphore` (`executor.go:78`) limits concurrent task executions to `e.Concurrency`. Acquired via `acquireConcurrencyLimit()` (`concurrency.go:3`) and released via `releaseConcurrencyLimit()` (`concurrency.go:14`). This is distinct from Go's native goroutine scheduling.

3. **Loop detection via atomic counter**: `taskCallCount map[string]*int32` (`executor.go:79`) tracks how many times each task has been called to prevent infinite recursion. Checked at `task.go:197` against `MaximumTaskCall` (1000).

4. **Taskfile graph as DAG**: Taskfiles form a directed acyclic graph via includes. The `Reader.Read` method (`taskfile/reader.go:249`) builds this graph, with context passed through for cancellation during network reads.

5. **Signal interception without context cancellation**: `InterceptInterruptSignals()` (`signals.go:16`) intercepts signals but does not cancel any context. It logs and eventually calls `os.Exit(1)`. This means signal handling is fire-and-forget rather than graceful.

## Tradeoffs

- **Deferred context mismatch**: Deferred cleanup commands run with `context.Background()` (`task.go:341`), meaning they cannot be cancelled even if the parent task is cancelled. This is likely intentional but creates an inconsistency in context lifecycle discipline.

- **No graceful shutdown via context**: Signal handling calls `os.Exit(1)` rather than cancelling contexts. Running subprocesses (via `execext.RunCommand`) will receive SIGINT when the process terminates, but there is no coordinated graceful shutdown sequence where context cancellation triggers clean termination of all child processes.

- **executionHashes memory growth**: `executionHashes` map is populated but only cleaned up when tasks complete normally. If a task panics or is killed, the context entry remains in the map. Over very long watch sessions with many task variants, this could grow unboundedly (though in practice task names are finite).

- **Watch mode context churn**: Each file change event creates a fresh context (`watch.go:82`). If tasks are slow or file events are frequent, this could create many context objects. However, the previous context is always cancelled first.

- **No session persistence or restoration**: There is no way to serialize/restore an executor session. Each CLI invocation is a fresh `Executor`. This is simple but limits use cases like daemon mode or interactive task consoles.

## Failure Modes / Edge Cases

- **Missing required variables**: If required variables are not set and cannot be prompted (non-terminal environment), `TaskCancelledMissingVarsError` is returned (`errors/errors_task.go:175`). This is treated as a cancellation error.

- **Prompt in non-terminal**: If a task requires interactive input but is run in a non-terminal environment, `TaskCancelledNoTerminalError` is returned (`errors/errors_task.go:135`).

- **User declined interactive prompt**: `TaskCancelledByUserError` returned when user refuses an optional prompt (`errors/errors_task.go:122`).

- **Context timeout during taskfile read**: If reading a remote taskfile times out, `TaskfileNetworkTimeoutError` is returned (`setup.go:100`).

- **Context cancelled in git lock**: If context is cancelled while waiting for a git repository lock, returns an error mentioning "context cancelled" (`taskfile/node_git.go:141`).

- **Cyclic task dependencies**: Detected via `taskCallCount` atomic counter (`task.go:197`). After 1000 recursive calls to the same task name, returns `TaskCalledTooManyTimesError`.

- **Watch directory removal**: If a watched directory is removed, fsnotify will trigger an event, but re-running tasks will fail gracefully with a directory creation error (`task.go:301-316` uses a mutex per task).

- **Goroutine leaks in errgroup**: If a task goroutine panics, `errgroup` cancels the context but the panic may not be recovered properly. No explicit panic recovery in goroutine closures.

## Future Considerations

- Consider adding session ID tracking for observability (correlating logs across tasks).
- Consider graceful shutdown: cancel contexts on SIGINT and wait for tasks to finish (with timeout) rather than `os.Exit(1)`.
- Consider session persistence (save/restore executor state) for daemon mode or interactive use.
- Consider `context.WithTimeout` for individual task executions rather than just global setup timeout.
- The `executionHashes` map could benefit from periodic cleanup of cancelled/completed entries.

## Questions / Gaps

- **Deferred command context source**: Why does `runDeferred` use `context.Background()` instead of deriving from the task context? The comment suggests it's intentional (cleanup should not be cancelled), but it breaks the pattern of consistent context propagation.

- **No session concept means no isolation**: Without session boundaries, if one task modifies shared `Executor` state (e.g., adds to `Taskfile.Vars`), it affects all subsequent tasks in the same run. There is no task-level isolation.

- **Signals and context lifecycle**: Signal handling intercepts SIGINT/SIGTERM but doesn't interact with the context system. Could a future improvement use context cancellation as the signal handler's shutdown mechanism?

---
Generated by `study-areas/07-state-context.md` against `go-task`.