# Repo Analysis: opencode

## Concurrency & Async Patterns

### Repo Info

| Field | Value |
|-------|-------|
| Name | opencode |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Opencode is a terminal-based AI assistant with a well-structured concurrency model. Goroutine spawning is localized to a few key areas: the app initialization (`cmd/root.go:134-153`, `internal/app/lsp.go:19,83`), the broker/subscription system (`internal/pubsub/broker.go:67-82`), and the agent execution (`internal/llm/agent/agent.go:210-229,241-249,551-701`). Coordination relies on `sync.WaitGroup` for tracked shutdown, `sync.Mutex`/`sync.RWMutex` for protected shared state, and `sync.Map` for active request tracking. Contexts with cancellation are used throughout for graceful shutdown. The codebase does NOT use `errgroup.Group` — instead it implements manual goroutine management with explicit wait patterns.

## Rating

**8/10** — Structured concurrency with intentional goroutine lifecycle management, proper use of context for cancellation, mutex protection for shared state, and explicit cleanup paths. The lack of `errgroup` means error propagation across concurrent tasks is ad-hoc rather than structured, and some patterns (like shell command processor in `shell/shell.go:109-127`) would benefit from more formal coordination.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Goroutine launch sites | TUI message handler goroutine | `cmd/root.go:134-153` |
| Goroutine launch sites | MCP tools initialization goroutine | `cmd/root.go:196-206` |
| Goroutine launch sites | Subscription consumer goroutines | `cmd/root.go:217-247` |
| Goroutine launch sites | LSP client initialization goroutines | `internal/app/lsp.go:19` |
| Goroutine launch sites | Workspace watcher goroutines | `internal/app/lsp.go:83` |
| Goroutine launch sites | Agent Run goroutine | `internal/llm/agent/agent.go:210-229` |
| Goroutine launch sites | Title generation goroutine | `internal/llm/agent/agent.go:241-249` |
| Goroutine launch sites | Summarize goroutine | `internal/llm/agent/agent.go:551-701` |
| Goroutine launch sites | Broker subscription cleanup goroutine | `internal/pubsub/broker.go:67-82` |
| Goroutine launch sites | Shell command processor goroutine | `internal/llm/tools/shell/shell.go:109-127` |
| Goroutine launch sites | Shell wait goroutine | `internal/llm/tools/shell/shell.go:120-127` |
| Goroutine launch sites | Spinner program goroutine | `internal/format/spinner.go:85-96` |
| Goroutine launch sites | Context processing goroutine in prompt | `internal/llm/prompt/prompt.go:118-121` |
| Goroutine launch sites | LSP client message handler | `internal/lsp/client.go:107-112` |
| Goroutine launch sites | LSP stderr handler | `internal/lsp/client.go:96-104` |
| Coordination | `sync.WaitGroup` for subscription tracking | `cmd/root.go:252,255-259` |
| Coordination | `sync.WaitGroup` for TUI message handler | `cmd/root.go:130-131,167` |
| Coordination | `sync.WaitGroup` for LSP watchers | `internal/app/app.go:39,76,88,171` |
| Coordination | `sync.Map` for active request cancellation | `internal/llm/agent/agent.go:70,119-132,549` |
| Coordination | Context for child process cancellation | `cmd/root.go:129,253` |
| Mutex usage | `clientsMutex sync.RWMutex` for LSP client map | `internal/app/app.go:35` |
| Mutex usage | `cancelFuncsMutex sync.Mutex` for watcher cancel funcs | `internal/app/app.go:38` |
| Mutex usage | `handlersMu sync.RWMutex` for LSP response handlers | `internal/lsp/client.go:33` |
| Mutex usage | `diagnosticsMu sync.RWMutex` for diagnostic cache | `internal/lsp/client.go:45` |
| Mutex usage | `openFilesMu sync.RWMutex` for open file tracking | `internal/lsp/client.go:49` |
| Mutex usage | `mu sync.RWMutex` for broker subscribers | `internal/pubsub/broker.go:12` |
| Mutex usage | `mu sync.Mutex` for shell command execution | `internal/llm/tools/shell/shell.go:23` |
| Mutex usage | `mu sync.Mutex` for session log file writes | `internal/logging/logger.go:104` |
| Context usage | `context.WithCancel` for graceful shutdown | `cmd/root.go:97,129,253` |
| Context usage | `context.WithTimeout` for timed operations | `cmd/root.go:200,276` |
| Context usage | `context.WithTimeout` for LSP initialization | `internal/app/lsp.go:37` |
| Context usage | `context.WithValue` for request-scoped data | `internal/llm/agent/agent.go:165,323,336,571` |
| Shutdown handling | Deferred cancel + explicit cleanup | `cmd/root.go:98,106` |
| Shutdown handling | Subscription cleanup with timeout | `cmd/root.go:261-279` |
| Shutdown handling | App shutdown cancels all watchers | `internal/app/app.go:164-171` |
| Shutdown handling | Broker shutdown closes all subscriber channels | `internal/pubsub/broker.go:32-49` |
| Shutdown handling | LSP client close with timeout | `internal/lsp/client.go:233-263` |
| Panic recovery | `logging.RecoverPanic` wrapper on goroutines | `cmd/root.go:136,197,219` |
| Panic recovery | `logging.RecoverPanic` on agent goroutine | `internal/llm/agent/agent.go:212,242` |
| Panic recovery | `logging.RecoverPanic` on LSP watcher | `internal/app/lsp.go:89` |
| Atomic usage | `atomic.Int32` for LSP request IDs | `internal/lsp/client.go:29` |
| Atomic usage | `atomic.Value` for LSP server state | `internal/lsp/client.go:52` |
| Atomic usage | `sync.Once` for shell singleton | `internal/llm/tools/shell/shell.go:44` |
| Atomic usage | `sync.Once` for context content loading | `internal/llm/prompt/prompt.go:42` |
| Channel usage | Unbuffered channel for TUI messages | `cmd/root.go:250` |
| Channel usage | Buffered channel for command queue | `internal/llm/tools/shell/shell.go:106` |
| Channel usage | Buffered channel for broker events | `internal/pubsub/broker.go:63` |
| Channel usage | Unbuffered channel for command results | `internal/llm/tools/shell/shell.go:278` |

## Answers to Protocol Questions

### 1. Where are goroutines launched?

Goroutines are launched in several distinct locations:

- **`cmd/root.go:134-153`**: TUI message handler goroutine receives messages from subscription channels and sends them to the Bubble Tea program.
- **`cmd/root.go:196-206`**: MCP tools initialization goroutine fetches MCP tools on startup.
- **`cmd/root.go:217-247`**: Subscription consumer goroutines (one per subscriber: logging, sessions, messages, permissions, coderAgent) process events and forward to TUI.
- **`internal/app/lsp.go:19`**: Each LSP client is initialized in its own goroutine via `go app.createAndStartLSPClient`.
- **`internal/app/lsp.go:83`**: Each workspace watcher runs in a dedicated goroutine via `go app.runWorkspaceWatcher`.
- **`internal/llm/agent/agent.go:210-229`**: Agent `Run()` spawns a goroutine for request processing.
- **`internal/llm/agent/agent.go:241-249`**: Title generation runs in a fire-and-forget goroutine when a session has no messages.
- **`internal/llm/agent/agent.go:551-701`**: Summarization runs in a background goroutine.
- **`internal/pubsub/broker.go:67-82`**: Broker spawns a goroutine per subscription to watch for context cancellation.
- **`internal/llm/tools/shell/shell.go:109-127`**: Shell spawns two goroutines — one processes commands from queue, one waits for process exit.
- **`internal/lsp/client.go:96-104,107-112`**: LSP client spawns goroutines for stderr reading and message handling.

### 2. How are they coordinated?

Coordination is achieved through multiple mechanisms:

- **`sync.WaitGroup`** (`cmd/root.go:130,252`, `internal/app/app.go:39,76,88`): Tracks active goroutines for subscription consumers and LSP watchers. The wait group is used to block shutdown until all tracked goroutines complete.

- **`sync.Map`** (`internal/llm/agent/agent.go:70`): Stores `context.CancelFunc` per session ID for request cancellation. The agent's `Cancel()` method retrieves and invokes the cancel function for a given session.

- **Context hierarchy** (`cmd/root.go:97,129,253`): A parent context with cancel is created at app start. Child contexts inherit cancellation. TUI message handling, subscriptions, and LSP watchers all derive from this hierarchy.

- **`sync.Mutex`/`sync.RWMutex`** (`internal/app/app.go:35,38`, `internal/lsp/client.go:33,45,49`, `internal/pubsub/broker.go:12`): Protects shared mutable state — LSP client map, watcher cancel funcs, response handlers, diagnostic cache, open files, broker subscribers.

- **`sync.Once`** (`internal/llm/tools/shell/shell.go:44`): Ensures only one persistent shell instance is created.

### 3. How is cleanup handled?

Cleanup is explicit and well-structured:

- **`cmd/root.go:156-170`**: The `cleanup()` function cancels subscriptions, cancels the TUI handler context, then waits on `tuiWg` with a 5-second timeout. Logs whether all goroutines completed or timed out.

- **`cmd/root.go:261-279`**: `setupSubscriptions` returns a cleanup function that cancels the subscription context, spawns a goroutine to wait on the WaitGroup, then either receives confirmation or times out after 5 seconds. Closes the message channel only after all writers confirm completion.

- **`internal/app/app.go:164-171`**: `Shutdown()` cancels all watcher cancel funcs stored in `watcherCancelFuncs`, then waits on `watcherWG`. Iterates and shuts down each LSP client with a 5-second timeout.

- **`internal/pubsub/broker.go:32-49`**: `Shutdown()` closes the `done` channel, then iterates all subscriber channels to close and remove them.

- **`internal/lsp/client.go:233-263`**: `Close()` closes all open files, closes stdin to signal the server, then waits for process exit with a 2-second timeout before killing.

### 4. Are race conditions considered?

Race conditions are mitigated through explicit locking:

- **`sync.RWMutex`** is used for read-heavy data structures (LSP client handlers, diagnostic cache, open files, broker subscribers) allowing concurrent readers while ensuring exclusive writer access.

- **`sync.Mutex`** is used for write-heavy sections (shell command execution at `shell/shell.go:140`, session log file writes at `logger.go:112`).

- **`sync.Map`** is used for the activeRequests store in the agent, providing safe concurrent access for the cancel map.

- **`atomic.Int32`** and **`atomic.Value`** are used for simple counters and state that don't need full mutex overhead.

- No `errgroup` is used — concurrent error propagation is handled ad-hoc through result channels and direct error return. This is a gap: when multiple goroutines encounter errors, there's no structured way to collect and handle them.

- The `processedMutex` in `prompt/prompt.go:68` protects the `processedFiles` map from concurrent access across multiple goroutines processing context paths.

## Architectural Decisions

1. **No `errgroup.Group`**: Opencode does not use the `golang.org/x/sync/errgroup` package. Goroutine coordination is done manually with `sync.WaitGroup`, `sync.Mutex`, and context cancellation. This means error propagation across concurrent tasks is not centrally managed.

2. **Subscription-based event bus**: The `Broker[T]` generic type (`internal/pubsub/broker.go:10-16`) provides a pub/sub system with context-aware subscription lifecycle. Each subscriber receives a channel that closes when the context is cancelled.

3. **Per-session cancellation via `sync.Map`**: The agent stores cancel functions keyed by session ID in a `sync.Map`, enabling fine-grained cancellation of individual requests.

4. **Bubble Tea integration for TUI concurrency**: The TUI uses the Charmbracelet Bubble Tea model, where the main program runs in a goroutine and receives messages via a channel (`cmd/root.go:134-153`).

5. **Shell singleton via `sync.Once`**: The `PersistentShell` is a process-wide singleton created via `sync.Once` (`shell/shell.go:44`), with command serialization through a buffered channel.

6. **Panic recovery wrappers on all goroutines**: Every goroutine that could panic is wrapped with `logging.RecoverPanic` to ensure the application doesn't crash and panic details are logged to a file.

## Notable Patterns

- **Context hierarchy for cancellation**: All goroutines receive a context derived from the app's main context. Cancel the parent, all children are signaled.

- **Explicit wait with timeout on shutdown**: Every wait operation (subscription cleanup, LSP client shutdown, watcher cleanup) has a timeout to prevent indefinite blocking.

- **Structured logging with source tracking**: `getCaller()` in `logger.go:15-24` captures file:line for every log statement, providing concrete evidence for debugging.

- **RWMutex for read-heavy maps**: LSP client state (handlers, diagnostics, open files) uses RWMutexes to allow concurrent readers while blocking writers.

- **sync.Once for one-time initialization**: Shell singleton and context content loading both use `sync.Once` to ensure expensive operations happen exactly once.

## Tradeoffs

- **No structured error aggregation for concurrent tasks**: Using `WaitGroup` without `errgroup` means errors from concurrent operations are not automatically collected. Each goroutine must handle its own error path independently.

- **Shell as a global singleton**: The `PersistentShell` is a global singleton which works for single-session operation but could be limiting if multi-session support is needed later.

- **Buffered channel with drop on slow consumer**: The subscription system (`cmd/root.go:234-236`) uses a 2-second timeout to drop messages if the TUI can't keep up, preventing slow consumers from blocking the entire system.

- **Broker without backpressure**: The `Broker[T].Publish()` method (`pubsub/broker.go:93-115`) sends to subscriber channels with a non-blocking select. If a subscriber is slow, events are dropped silently rather than applying backpressure.

## Failure Modes / Edge Cases

1. **Slow TUI consumer drops messages**: The subscription system (`cmd/root.go:234-236`) drops messages after a 2-second wait, which could result in missed events if the TUI is temporarily blocked.

2. **LSP client restart on panic**: The workspace watcher has panic recovery (`internal/app/lsp.go:89`) that triggers `restartLSPClient`, creating a new client instance. This could leave orphaned LSP processes if restart happens rapidly.

3. **Shell process orphaning**: If the shell's stdin pipe breaks (line 177 write fails), the `killChildren()` method (`shell/shell.go:246-269`) tries to SIGTERM child processes but may not catch all spawned subprocesses.

4. **Subscription channel closure edge case**: The subscription consumer (`cmd/root.go:223-228`) handles channel closure but if the channel is closed before context cancellation, the goroutine exits cleanly, which is correct but could mask issues.

5. **Timeout on subscription cleanup**: If a subscription goroutine is stuck, the 5-second timeout (`cmd/root.go:276`) will force-close the channel, potentially leaving work incomplete.

## Future Considerations

- Consider adopting `golang.org/x/sync/errgroup` for structured concurrent error handling in places where multiple goroutines contribute to a single operation (e.g., LSP initialization, prompt context processing).

- The shell singleton could become a bottleneck for concurrent command execution. Consider a pool or queue-based approach.

- The broker's non-blocking send (`pubsub/broker.go:110-115`) silently drops events. Consider adding metrics or logging for dropped events to detect consumer slowdowns.

- Consider adding lifecycle hooks for goroutines to register themselves with a central supervisor that tracks all active goroutines and their status.

## Questions / Gaps

- **No evidence found** for graceful degradation when the number of concurrent agent requests exceeds a threshold. The `sync.Map` stores cancellations but doesn't bound the number of active requests.

- **No evidence found** for integration tests that exercise concurrent goroutine scenarios. Race conditions may not be caught by the existing test suite.

- **No evidence found** for `errgroup` usage anywhere in the codebase — error propagation across concurrent operations is ad-hoc.

- **No evidence found** for resource limits on the broker subscriber count (beyond the hardcoded `maxEvents` of 1000 in `NewBrokerWithOptions`).

---
Generated by `study-areas/08-concurrency.md` against `opencode`.