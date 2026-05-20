# Source Analysis: nats-server

## Concurrency Model

### Source Info

| Field | Value |
|-------|-------|
| Name | nats-server |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/nats-server` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

nats-server implements a mature, production-grade concurrency model centered on disciplined goroutine lifecycle management via `sync.WaitGroup` (`grWG`), an internal `ipQueue` for lock-free intra-process message passing, and a custom semaphore pattern for bounded I/O concurrency. Goroutines are spawned via `startGoRoutine()` which registers them with `grWG.Add(1)` and tracked until `grWG.Wait()` on shutdown. JetStream adds flow control mechanisms, rate limiting, and backpressure via bounded queues with size/length limits. The server lacks `context.Context` usage for cancellation propagation outside tests but employs channel-based quit signals, LameDuck shutdown mode, and per-connection read/write loops for handling concurrency at scale.

## Rating

**8/10** — Very good implementation with minor issues. The concurrency architecture is solid, well-disciplined, and handles lifecycle management correctly. The main gaps are limited `context.Context` usage for cancellation propagation in production paths (concentrated in tests) and reliance on `sync.Map` in hot paths. The absence of `golang.org/x/sync/errgroup` is notable for multi-step operations.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| WaitGroup tracking | `grWG sync.WaitGroup` field in Server struct, used to track all goroutines | `server/server.go:251` |
| Goroutine startup | `startGoRoutine()` calls `grWG.Add(1)` then spawns goroutine | `server/server.go:4051-4064` |
| Shutdown wait | `s.grWG.Wait()` blocks until all goroutines complete | `server/server.go:2702` |
| Accept loop | Connection acceptance in dedicated goroutines via `startGoRoutine()` | `server/server.go:2877-2884` |
| Client readLoop | Per-client `readLoop()` goroutine with `defer s.grWG.Done()` | `server/client.go:1287,1382` |
| ipQueue generic | `ipQueue[T any]` struct with push/pop/drain, backed by `sync.Pool` | `server/ipqueue.go:25-36` |
| Bounded ipQueue | `ipqLimitBySize()` and `ipqLimitByLen()` for backpressure on queues | `server/ipqueue.go:68-81` |
| ipQueue registration | Queues registered in `s.ipQueues sync.Map` for monitoring | `server/ipqueue.go:106` |
| Channel signaling | `ipQueue` uses `ch chan struct{}` for notification (first element) | `server/ipqueue.go:28` |
| Sync out semaphore | `syncOutSem chan struct{}` for bounded catchup concurrency | `server/server.go:367` |
| Disk I/O semaphore | `dios chan struct{}` bounded to 4-16 concurrent disk operations | `server/filestore.go:13111-13129` |
| Global catchup bytes | `gcbOut int64` with `gcbKick chan struct{}` for backpressure | `server/server.go:360-364` |
| LameDuck mode | Graceful shutdown with `ldmCh chan bool` for connection draining | `server/server.go:280-281` |
| quitCh close | `close(s.quitCh)` releases all goroutines waiting on shutdown | `server/server.go:2687` |
| sync.Pool usage | Multiple pools for messages: `inMsgPool`, `outMsgPool`, `jsPubMsgPool`, etc. | `server/stream.go:5673,7880,7951` |
| pprof labels | `setGoRoutineLabels()` for profiling with `pprofLabels` | `server/server.go:4040-4048` |
| Raft channels | Raft nodes use typed channels: `reqs *ipQueue[*voteRequest]`, `apply *ipQueue[*CommittedEntry]` | `server/raft.go:456-461` |
| No errgroup | No usage of `golang.org/x/sync/errgroup` found | No evidence |

## Answers to Dimension Questions

### 1. How does the project manage goroutine lifetimes without leaking?

All long-lived goroutines are registered with `s.grWG.Add(1)` via `startGoRoutine()` (`server/server.go:4051-4064`). Every goroutine defers `s.grWG.Done()`. On shutdown, the server:
1. Closes all listeners (client, route, leaf, gateway, HTTP, MQTT, websocket)
2. Closes `s.quitCh` to signal goroutines to stop
3. Waits on `s.done` for each accept loop to exit
4. Calls `s.grWG.Wait()` to drain all tracked goroutines (`server/server.go:2686-2702`)

Short-lived goroutines (e.g., in `stream.go:2769`, `raft.go:2410`) use the same pattern with `defer s.grWG.Done()`. The `startGoRoutine()` guard prevents spawning if `s.grRunning` is false (server shutting down). Each client connection has exactly two goroutines (readLoop + writeLoop) both tracked via `grWG`.

### 2. Are there bounded concurrency patterns when handling many tasks?

Yes. The project uses several bounded concurrency patterns:

- **ipQueue with limits**: `ipqLimitBySize(max)` and `ipqLimitByLen(max)` enforce backpressure by causing `push()` to return errors when limits are reached (`server/ipqueue.go:113-141`). JetStream uses these for message ingress queues.

- **syncOutSem**: `chan struct{}` semaphore limits concurrent syncRequests during catchup (`server/server.go:367`, `server/jetstream_cluster.go:10337`). Acquire via `<-s.syncOutSem`, release via `s.syncOutSem <- struct{}{}`.

- **dios semaphore**: Global disk I/O concurrency bounded to 4-16 based on CPU cores (`server/filestore.go:13111-13129`). Used to prevent OS thread blocking from excessive disk operations.

- **gcbKick**: Global catchup byte limit with a kick channel to unblock stalled catchup sequences (`server/server.go:360-364`).

- **acceptConnections**: Each listener type (Client/Route/Leaf/Gateway/MQTT) runs a single accept loop in its own goroutine, dispatching to `startGoRoutine()` per connection (`server/server.go:2862-2888`).

### 3. How is cancellation propagated through multi-step operations?

Cancellation propagation is primarily channel-based, not `context.Context`-based:

- `quitCh chan struct{}` is closed on shutdown (`server/server.go:2687`), and goroutines check this channel or `s.isShuttingDown()`.
- LameDuck mode uses `ldmCh chan bool` to signal no new connections should be accepted (`server/server.go:2819-2821`).
- Raft nodes have `quit chan struct{}` (`server/raft.go:455`) checked in their runloops.
- JetStream uses `js.clusterQuitC()` which returns a channel closed when the cluster is stopping.

`context.Context` usage is **minimal in production code** — found only in tests (27 matches across test files using `context.WithTimeout`/`WithCancel`). Production paths rely on channel-based quit signals rather than context cancellation.

### 4. What patterns prevent channel deadlocks or goroutine leaks?

- **All goroutines registered**: `startGoRoutine()` ensures every spawned goroutine is counted in `grWG`, and `grWG.Wait()` on shutdown guarantees cleanup.
- **Non-blocking signal**: `ipQueue` notification uses `select` with `default` to avoid blocking on channel send (`server/ipqueue.go:135-138`).
- **shutdown ordering**: Listeners closed first (unblocking accept loops), then `quitCh` closed, then connections closed, then `grWG.Wait()` — ordered to prevent orphaned goroutines (`server/server.go:2633-2702`).
- **quitCh as broadcast**: `close(s.quitCh)` serves as a broadcast to all waiting goroutines, avoiding point-to-point deadlock on shutdown.
- **defer pattern**: Every goroutine path uses `defer s.grWG.Done()` to ensure cleanup on both normal and error exits.
- **Raft-specific**: `defer n.Stop()` in `monitorCluster()` ensures raft node cleanup (`server/jetstream_cluster.go:1549-1556`).

### 5. How does the system handle backpressure under load?

JetStream implements explicit flow control:

- **Consumer flow control**: `BatchFlowAck` and `FlowControl` messages for push-based consumers (`server/stream.go:280-281`). Heartbeat messages trigger flow control responses (`server/stream.go:3165-3176`).

- **Batched publishing flow control**: `fastBatch` with `checkFlowControl()` periodically sends flow control messages (`server/jetstream_batching.go:274-319`).

- **ipQueue bounded queues**: Stream message ingress queues (`msgs *ipQueue[*inMsg]`) and consumer queues use `ipqLimitByLen()`/`ipqLimitBySize()` so `push()` returns `errIPQLenLimitReached`/`errIPQSizeLimitReached` when full (`server/ipqueue.go:68-84,113-141`).

- **Consumer rate limit**: `RateLimit uint64` field (bits per second) on consumer config (`server/consumer.go:102`). Enforced in `handleFlowControl` and consumer delivery loops.

- **Global catchup limits**: `gcbOutMax` caps total catchup bytes in flight; stalled sequences kicked via `gcbKick` channel (`server/server.go:360-364`).

- **No explicit client connection limit**: While `connection_rate_limit` config exists (`server/opts.go:5172`), the main backpressure is at JetStream level, not connection level.

## Architectural Decisions

1. **Centralized goroutine tracking via WaitGroup**: All goroutines registered with `s.grWG` provides a single mechanism for shutdown coordination. This is simpler than distributed lifecycle management but requires discipline (every spawn must use `startGoRoutine()`).

2. **ipQueue as primary communication primitive**: Lock-free-ish queue using slice with position pointer, `sync.Pool` for memory reuse, and notification channel. Avoids the complexity of channel-based queues for high-throughput message passing within the server process.

3. **Per-connection goroutine pair**: Each TCP connection gets exactly two goroutines (readLoop + writeLoop). This is a classic Go pattern but means connection count directly maps to goroutine count (N clients = 2N goroutines). Accept loops are single-threaded dispatchers.

4. **Custom semaphore for disk I/O**: Uses buffered channel instead of `golang.org/x/sync/semaphore` — described as "a bit heavy" in comments (`server/filestore.go:13114`).

5. **No context.Context in production paths**: Cancellation uses channel-based `quitCh` and `isShuttingDown()` checks rather than ctx-based propagation. This is a conscious design choice, tradingctx's tree-cancellation for simpler channel semantics.

6. **sync.Map for ephemeral registrations**: `s.ipQueues sync.Map`, `s.accounts sync.Map`, `s.clients map[uint64]*client` — uses native Go maps for clients/accounts (requiring explicit locking) but `sync.Map` for less-contended or dynamically registered data.

## Notable Patterns

- **startGoRoutine() wrapper** (`server/server.go:4051`): Guards goroutine startup against shutdown, sets pprof labels, registers with WaitGroup.
- **ipQueue with sync.Pool** (`server/ipqueue.go:86-108`): Generic queue with memory pooling, size limits, and notification channel.
- **LameDuck shutdown** (`server/server.go:4396`): Graceful draining mode that stops accepting new connections but allows existing ones to drain within a time window.
- **sendq / recvq pattern** (`server/server.go:1837-1839`): Internal system communication queues for `internal` struct.
- **raft ipQueue set** (`server/raft.go:456-461`): 6 typed queues per raft node: votes, proposals, append entries, responses, apply, vote requests.
- **Consumer rate limiting** (`server/consumer.go:102`): Per-consumer rate limit in bits per second.

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| Per-connection goroutines | Simple model but N×2 goroutines for N clients; suitable for moderate connection counts but could be problematic at very high connection counts (100K+ connections = 200K goroutines). |
| sync.Map for ipQueues | Avoids mutex contention for registration but `sync.Map` has worse read-single-key performance than mutex-protected map. |
| Channel-based quit signals | Simpler than ctx cancellation but no built-in timeout/deadline on arbitrary operations — each goroutine must implement its own timer if needed. |
| Custom semaphore (dios) | Avoids external dependency but less flexible than `golang.org/x/sync/semaphore`; fixed-size at init time. |
| No errgroup | Single `grWG` is simpler but doesn't provide structured error collection or cancel-on-first-error that errgroup offers. |
| ipQueue blocking notification | Uses `ch chan struct{}` with buffer=1 for notification; when full, subsequent pushes don't block (non-blocking send with select/default). |

## Failure Modes / Edge Cases

1. **Goroutine leak if startGoRoutine not used**: If a developer spawns a goroutine without `startGoRoutine()`, it won't be tracked by `grWG` and `grWG.Wait()` won't wait for it — potential goroutine leak on shutdown. Code review discipline required.

2. **ipQueue push failure silent**: When `push()` returns `errIPQLenLimitReached` or `errIPQSizeLimitReached`, callers may not check the error and messages could be silently dropped unless the caller handles the error explicitly.

3. **readLoop writeLoop reconnection**: `writeLoop()` calls `c.reconnect()` after write error (`server/client.go:1324`). The reconnect path spawns new goroutines via `startGoRoutine()` but the old connection's goroutines must fully exit first.

4. **Raft catchup semaphore starvation**: If many catchup requests are in flight via `syncOutSem`, a new catchup can be blocked for the entire duration. No priority or fairness mechanism exists.

5. **LameDuck does not interrupt in-flight operations**: During LameDuck mode, existing operations continue; only new connections are rejected. Long-running JetStream operations (e.g., catchup) complete normally and may delay the actual shutdown.

6. **gcbKick single-shot channel**: Once `gcbKick` is closed (when `gcbOut >= gcbOutMax`), a new channel is created but the old one being closed means any waiter on the old channel may miss the signal if they hadn't selected yet.

7. **sync.Pool variability**: `sync.Pool` contents can be evicted under memory pressure; the ipQueue's slice pooling works well for steady-state but may cause allocation spikes after GC or under burst load.

## Future Considerations

- **context.Context adoption**: Production paths could benefit from `context.Context` for deadline/cancellation propagation, especially for JetStream API calls and raft operations.
- **Worker pool for client connections**: At very high connection counts, a fixed-size worker pool for processing client messages (rather than per-connection goroutines) could reduce goroutine overhead.
- **errgroup for multi-step operations**: Replacing ad-hoc goroutine tracking with `golang.org/x/sync/errgroup` would provide structured error propagation and cancel-on-error semantics.
- **Connection-level backpressure**: Currently backpressure is primarily JetStream-level. Connection-level flow control (e.g., TCP write buffer high-water marks) could prevent slow clients from blocking the server.

## Questions / Gaps

- **No evidence of structured concurrency** (e.g., `golang.org/x/sync/errgroup`) for grouping related goroutines in JetStream API request handling.
- **`context.Context` used only in tests**, not in production shutdown/cancellation paths. Is this intentional for simplicity, or a known gap?
- **`sync.Map` in ipQueues registration**: `s.ipQueues.Store(name, q)` uses `sync.Map` but the primary access pattern (push/pop) uses mutex locks. This is a minor inconsistency.
- **No graceful degradation under memory pressure**: If `sync.Pool` is emptied and allocations fail under memory pressure, there is no fallback mechanism noted in the code.