# Repo Analysis: opencode

## Process and Session Lifecycle

### Repo Info

| Field | Value |
|-------|-------|
| Name | opencode |
| Path | `/home/antonioborgerees/coding/opencode-wrap-study/repos/opencode` |
| Group | `study-group-opencode` |
| Language / Stack | TypeScript (Bun), Effect framework |
| Analyzed | 2026-05-17 |

## Summary

OpenCode implements a robust, Effect-based lifecycle model for process and session management. The architecture leverages the Effect functional framework for structured concurrency, with dedicated services for process spawning (`AppProcess`), background job management (`BackgroundJob`), session lifecycle (`Session.Service`), and a `Runner` state machine for shell/run orchestration. Cancellation is propagated via `AbortSignal` and Fiber interruption. Cleanup is managed through Effect's scoped resources and `InstanceState` with `ScopedCache` for per-directory state.

## Rating

**8/10** — Clear lifecycle with explicit state modeling, reliable cleanup via scoped resources, cancellation with signal escalation, and session tracking. Points deducted because V2Session has stub implementations (`create`, `prompt`, `shell`, `skill`, `compact`, `wait` return `{} as any` or empty effects) and shell timeout behavior is not fully tested.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Process spawn/exec | `AppProcess.run()` / `runStream()` backed by `CrossSpawnSpawner` | `packages/core/src/process.ts:172-185` |
| Command construction | Uses `ChildProcess.make()` from Effect's platform library | `packages/core/src/process.ts:180` |
| Transport (process) | Uses Effect's `ChildProcessSpawner` with `cross-spawn` | `packages/core/src/cross-spawn-spawner.ts:268` |
| Transport (shell) | Shell tool streams output via `Stream.decodeText(handle.all)` | `packages/opencode/src/tool/shell.ts:485` |
| Cancellation signal | `waitForAbort()` using `AbortSignal` event listener | `packages/core/src/process.ts:90-99` |
| Signal handling | SIGTERM with `forceKillAfter` escalation to SIGKILL | `packages/core/src/cross-spawn-spawner.ts:335-340` |
| Process kill | `killGroup` uses process group kill on Unix, `taskkill` on Windows | `packages/core/src/cross-spawn-spawner.ts:290-310` |
| Process kill (simple) | `killOne` uses `proc.kill()` directly | `packages/core/src/cross-spawn-spawner.ts:312-320` |
| Timeout handling | `Effect.timeoutOrElse` in `runCommand`, `forceKillAfter` for escalation | `packages/core/src/process.ts:156-160` |
| Shell timeout | `Effect.raceAll` between `exitCode`, `abort`, and `sleep(timeout)` | `packages/opencode/src/tool/shell.ts:542-546` |
| Session registry | `ACPSessionManager` with in-memory `Map<string, ACPSessionState>` | `packages/opencode/src/acp/session.ts:9` |
| Background job registry | `SynchronizedRef<Map<string, Active>>` for job state | `packages/opencode/src/background/job.ts:26` |
| Runner state machine | `Idle | Running | Shell | ShellThenRun` union type | `packages/opencode/src/effect/runner.ts:33-37` |
| Instance state cleanup | `ScopedCache` with `registerDisposer` for per-directory cleanup | `packages/opencode/src/effect/instance-state.ts:31-42` |
| Session event schema | `EventV2.define()` with tagged union for all event types | `packages/core/src/session-event.ts:365-397` |
| Session message types | `Schema.TaggedClass` discriminated unions for messages | `packages/core/src/session-message.ts:165-167` |
| Process tests | Tests for exit codes, truncation, stdin, abort, timeout | `packages/core/test/process/process.test.ts:1-292` |

## Answers to Protocol Questions

### 1. What lifecycle states are modeled before, during, and after a run?

**Before run:**
- `Runner` has `Idle` state (`packages/opencode/src/effect/runner.ts:33`)
- `BackgroundJob` has `Status = "running" | "completed" | "error" | "cancelled"` (`packages/opencode/src/background/job.ts:5`)
- Sessions have `time.created` and `time.updated` timestamps tracked in DB schema (`packages/opencode/src/session/session.ts:105-109`)

**During run:**
- `Runner` transitions: `Idle → Running → Idle`, `Idle → Shell → (ShellThenRun → Running → Idle)` (`packages/opencode/src/effect/runner.ts:83-169`)
- `BackgroundJob` status set to `"running"` on start (`packages/opencode/src/background/job.ts:157`)
- Session step events: `Step.Started`, `Step.Ended`, `Step.Failed` (`packages/opencode/src/session-event.ts:103-146`)
- Tool events: `Tool.Called`, `Tool.Progress`, `Tool.Success`, `Tool.Failed` (`packages/opencode/src/session-event.ts:249-307`)

**After run:**
- `Shell.Ended` event with output captured (`packages/opencode/src/session-event.ts:91-100`)
- `BackgroundJob` transitions to `completed`, `error`, or `cancelled` based on outcome (`packages/opencode/src/background/job.ts:143-147`)
- Session finalization updates `tokens`, `cost`, and `time.updated` (`packages/opencode/src/session/session.ts:720-758`)

### 2. How are prompts or commands sent to the runtime?

**Shell tool execution** (`packages/opencode/src/tool/shell.ts:424-559`):
1. Spawn via `spawner.spawn(cmd(...))` which uses Effect's `ChildProcessSpawner` backed by `cross-spawn`
2. Stream stdout/stderr via `Stream.runForEach(Stream.decodeText(handle.all), ...)` with chunk accumulation
3. Output buffered in memory up to `limits.maxBytes`, then spooled to file via `trunc.write()`
4. Race between exit code, abort signal, and timeout via `Effect.raceAll`
5. Process killed with `handle.kill({ forceKillAfter: "3 seconds" })` on timeout or abort

**Session prompting** (`packages/opencode/src/v2/session.ts:289-292`):
- `V2Session.prompt()` is stubbed (`return {} as any`)
- Legacy `Session.Service.create()` writes new session via `sync.run(Event.Created, ...)` (`packages/opencode/src/session/session.ts:556`)

### 3. How are JSON events, stderr diagnostics, protocol messages, and final outputs decoded?

**Event schema system** (`packages/core/src/session-event.ts`):
- `EventV2.define()` creates schemas with `type`, `aggregate`, `version` fields and `schema` payload
- All events share `Base = { timestamp, sessionID }` structure (lines 22-29)
- `All` union uses `Schema.toTaggedUnion("type")` for discriminated parsing (lines 365-397)
- Events include: `AgentSwitched`, `ModelSwitched`, `Prompted`, `Synthetic`, `Shell.Started/Ended`, `Step.Started/Ended/Failed`, `Text.Started/Delta/Ended`, `Tool.Input.Started/Delta/Ended`, `Tool.Called/Progress/Success/Failed`, `Reasoning.*`, `Retried`, `Compaction.*`

**Session messages** (`packages/core/src/session-message.ts`):
- `Message` union: `AgentSwitched`, `ModelSwitched`, `User`, `Synthetic`, `Shell`, `Assistant`, `Compaction`
- `Assistant` content: `AssistantText`, `AssistantReasoning`, `AssistantTool` (tagged union by `type`)
- `ToolState` status union: `ToolStatePending`, `ToolStateRunning`, `ToolStateCompleted`, `ToolStateError` (tagged by `status`)

**Process output handling**:
- `AppProcess.run()` collects stdout/stderr as `Buffer` with truncation flags (`packages/core/src/process.ts:29-36`)
- `collectStream()` aggregates chunks with byte-count tracking and truncation detection (`packages/core/src/process.ts:110-126`)
- `Shell tool` uses streaming with preview truncation and file spooling for large output

### 4. How does cancellation propagate to subprocesses, servers, sessions, and child work?

**Shell tool** (`packages/opencode/src/tool/shell.ts:533-555`):
- Registers `ctx.abort` listener for user cancellation
- On abort: `handle.kill({ forceKillAfter: "3 seconds" })` terminates process
- On timeout: same kill pattern with escalation

**AppProcess** (`packages/core/src/process.ts:162-168`):
- `waitForAbort(signal)` races against the command execution
- Signal listener removed on cleanup (`packages/core/src/process.ts:98`)

**BackgroundJob** (`packages/opencode/src/background/job.ts:182-192`):
- `cancel(id)` interrupts the fiber: `Fiber.interrupt(job.fiber).pipe(Effect.ignore)`
- Job status set to `"cancelled"` via `finish(id, "cancelled")`

**Runner** (`packages/opencode/src/effect/runner.ts:171-202`):
- `cancel()` interrupts the fiber, fails the deferred with `RunnerCancelled`, transitions to `Idle`
- `ShellThenRun` state: stops shell, fails pending deferred

**Session cleanup** (`packages/opencode/src/session/session.ts:594-615`):
- `remove(sessionID)` calls `cancelBackgroundJobs(background, sessionID)` to cancel related jobs
- Recursively removes child sessions

### 5. What prevents leaked processes, goroutines, file handles, sockets, and sessions?

**Process cleanup** (`packages/core/src/cross-spawn-spawner.ts:380-400`):
- `Effect.acquireRelease` with cleanup function that:
  - Awaits exit signal to check if process exited cleanly
  - On Windows, does nothing if already exited
  - Otherwise sends SIGTERM, escalates to SIGKILL if exit code non-zero
  - Uses `Deferred.await(signal)` to confirm termination

**File handle cleanup** (`packages/opencode/src/tool/shell.ts:447-469`):
- `closeSink()` registered via `Effect.addFinalizer(closeSink)` before spawning
- Streams closed with `stream.end()` and event handlers for `close`, `error`, `finish`

**Scoped resources** (`packages/opencode/src/effect/instance-state.ts:31-42`):
- `ScopedCache` keyed by directory for per-instance state
- `registerDisposer()` registered to invalidate cache on instance disposal
- Finalizer added to unregister disposer on scope exit

**Session cleanup** (`packages/opencode/src/session/session.ts:873-888`):
- `cancelBackgroundJobs()` filters by `sessionId` or `parentSessionId` metadata
- Runs with `concurrency: "unbounded"` to cancel all in parallel

### 6. Is there a strategy for reconnecting to or resuming an existing session?

**ACP session reconnection** (`packages/opencode/src/acp/session.ts:46-75`):
- `ACPSessionManager.load(sessionId, cwd, mcpServers, model?)` fetches session from SDK
- Creates `ACPSessionState` with `createdAt: new Date(session.time.created)` for timestamp accuracy

**Session forking** (`packages/opencode/src/session/session.ts:678-718`):
- `fork(input)` creates a new session with copied messages up to `messageID`
- `idMap` tracks old→new ID mappings for parent references
- Compaction tail_start_id remapped via `idMap.get()`

**Session message pagination** (`packages/opencode/src/v2/session.ts:216-255`):
- `messages()` with `cursor: { id, time, direction: "previous" | "next" }` for pagination
- `context()` excludes messages before latest compaction, enabling resume after compaction

**Instance state** (`packages/opencode/src/effect/instance-state.ts`):
- `ScopedCache` keyed by directory allows multiple concurrent instances
- Disposal via cache invalidation prevents leaks on close

## Architectural Decisions

1. **Effect framework for structured concurrency** — All process and session management uses Effect's `Fiber`, `Deferred`, `Scope` for composable cancellation and resource safety.

2. **Cross-spawn for cross-platform process spawning** — `packages/core/src/cross-spawn-spawner.ts` wraps `cross-spawn` to provide Effect-compatible process spawning with proper stdio configuration.

3. **State machine for runner lifecycle** — `Runner<A, E>` in `packages/opencode/src/effect/runner.ts` provides explicit `Idle | Running | Shell | ShellThenRun` states with hooks for `onIdle`, `onBusy`, `onInterrupt`.

4. **ScopedCache for per-directory state** — `InstanceState.make()` in `packages/opencode/src/effect/instance-state.ts` uses `ScopedCache` to manage per-project state with automatic cleanup.

5. **Tagged error/schema union for events** — `packages/core/src/session-event.ts` uses `EventV2.define()` and `Schema.toTaggedUnion("type")` for type-safe event dispatch.

6. **Process group kill for UNIX** — `packages/core/src/cross-spawn-spawner.ts:306` uses `process.kill(-proc.pid!, signal)` to kill process groups, ensuring child processes are terminated.

## Notable Patterns

1. **Timeout escalation**: `forceKillAfter` option in kill options escalates from SIGTERM to SIGKILL after a duration (`packages/core/src/cross-spawn-spawner.ts:335-340`)

2. **Stream truncation with file spooling**: Shell tool buffers output in memory up to `limits.maxBytes`, then spools to file to prevent memory exhaustion (`packages/opencode/src/tool/shell.ts:502-521`)

3. **Effect.raceAll for multi-way race**: Shell tool races exitCode, abort signal, and timeout to handle all termination scenarios (`packages/opencode/src/tool/shell.ts:542-546`)

4. **Fiber interruption with deferred completion**: BackgroundJob uses `Fiber.interrupt` + `Deferred.fail` pattern for clean cancellation (`packages/opencode/src/background/job.ts:186-190`)

5. **Event sourcing via SyncEvent**: Session changes published via `sync.run(Event.Updated, ...)` for event-driven state synchronization

## Tradeoffs

1. **V2Session stub implementations** — `create`, `prompt`, `shell`, `skill`, `compact`, `wait` return `{} as any` or empty effects, meaning this protocol isn't fully wired for V2 path.

2. **Effect framework complexity** — Deeply nested Effect code can be harder to debug; lifecycle invisible without Effect runtime introspection.

3. **No WebSocket transport** — Shell tool uses stdio streaming; no evidence of WebSocket-based transport for remote runtime communication.

4. **In-memory ACP session registry** — `ACPSessionManager` uses `Map<string, ACPSessionState>` in memory; no persistence or cluster-safe sharing.

5. **Windows taskkill fallback** — Process group kill on Windows requires `taskkill /pid ... /T /F` which is less reliable than UNIX signals.

## Failure Modes / Edge Cases

1. **Malformed JSON in event stream** — No explicit error handling shown for JSON decode failures in event processing.

2. **Process hangs** — Shell tool has timeout (default 120s) with `forceKillAfter: "3 seconds"` but no watchdog for runaway CPU.

3. **Parent cancellation during stream** — `Stream.interruptWhen(waitForAbort(signal))` at `packages/core/src/process.ts:224` handles this, but race window exists between output and abort.

4. **Session removal during active run** — `remove()` checks `hasInstance` flag and only publishes if instance exists (`packages/opencode/src/session/session.ts:610`), but active runs may not be cleaned up if instance context is missing.

5. **ACP session ID mismatch** — `load()` method creates state from fetched session but doesn't validate that the session's project/directory matches the requested cwd.

## Future Considerations

1. **V2Session completion** — Stub methods need implementation for full V2 API parity.

2. **WebSocket transport** — No evidence of WebSocket-based transport; needed for remote runtime servers.

3. **Resume after compaction** — `context()` method filters by compaction boundary, but no explicit "resume from checkpoint" mechanism.

4. **ACP reconnect robustness** — `load()` should validate session state matches expected cwd before creating local state.

## Questions / Gaps

1. **No evidence found** for JSON stream corruption handling in the event system.
2. **No evidence found** for heartbeat/keepalive mechanism for long-running sessions.
3. **No evidence found** for connection pooling or HTTP client reuse across requests.
4. **V2Session.prompt()** is stubbed — how are prompts actually delivered in V2 path?
5. **No evidence found** for graceful shutdown of the MCP server runtime (ACP layer).
6. **No evidence found** for session migration or failover across instances.

---

Generated by `study-areas/02-process-session-lifecycle.md` against `opencode`.