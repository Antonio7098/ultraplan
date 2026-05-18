# Process and Session Lifecycle - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Protocol | `study-areas/02-process-session-lifecycle.md` |
| Groups | go-plugin, study-group-opencode, sdk-go, t3code |
| Date | 2026-05-17 |

## Repositories Studied

| # | Repo | Path | Group |
|---|------|------|-------|
| 1 | go-plugin | `/home/antonioborgerees/coding/opencode-wrap-study/repos/go-plugin` | go-plugin |
| 2 | opencode | `/home/antonioborgerees/coding/opencode-wrap-study/repos/opencode` | study-group-opencode |
| 3 | sdk-go | `/home/antonioborgerees/coding/opencode-wrap-study/repos/sdk-go` | sdk-go |
| 4 | t3code | `/home/antonioborgerees/coding/opencode-wrap-study/repos/t3code` | t3code |

## Executive Summary

All four repos implement lifecycle management for external runtimes, but with fundamentally different scope: go-plugin and t3code manage external subprocesses communicating over stdio/RPC, opencode wraps AI runtimes with Effect-based concurrency, and sdk-go orchestrates workflow activities inside a server-driven task system (no external subprocess). All four demonstrate explicit state modeling, structured cancellation, and scoped cleanup. None achieve true mid-run resume with full state transfer. The strongest patterns for a new OpenCode wrapper are Effect scoped resources (opencode, t3code) and explicit state machines with Deferred completion (opencode, t3code, go-plugin).

## Core Thesis

Robust process/session lifecycle requires: (1) explicit state representation visible to callers, (2) structured concurrency primitives that guarantee cleanup on all exit paths, (3) separation of transport decoding from domain logic, and (4) cancellation that propagates through the full call stack. The most reliable mechanism across all four repos is scope-bound resource management (Effect's `Scope`, go-plugin's `Kill()` + `WaitGroup`), which eliminates manual cleanup paths that are easy to get wrong.

## Rating Summary

| Repo | Score | Approach | Main Strength | Main Concern |
|------|-------|----------|---------------|--------------|
| go-plugin | 8/10 | Subprocess plugin host with stdout handshake | Production-grade supervision with mTLS, reattach, process group kill | No mid-run resume; reattach only for pre-detached plugins |
| opencode | 8/10 | Effect-based runtime wrapper with state machine | Scoped resources prevent leaks; explicit Runner states | V2Session stubbed; Effect complexity makes debugging harder |
| sdk-go | 7/10 | Server-driven workflow orchestration | Deterministic replay; command state machine for workflows | No external subprocess; session tied to specific worker |
| t3code | 8/10 | Effect-scoped Codex stdio wrapper with session reaper | Clean protocol/transport separation; resume with fallback | Resume is best-effort not deterministic; 5-min reaper granularity |

## Approach Models

### 1. Subprocess Host with Orthogonal Lifecycle (go-plugin)

go-plugin models lifecycle entirely around the `Client` → `Runner` → plugin process axis. The `Runner` interface (`runner/runner.go:14-37`) abstracts start/wait/kill separate from transport (net/rpc vs gRPC). Explicit states: `exited` bool, `processKilled` bool. Cleanup uses `Kill()` with 2s graceful timeout → force kill. Process registry via `managedClients` global slice.

**Best for**: Long-lived external plugins with upgrade requirements.

### 2. Effect Scoped Resources with State Machine (opencode, t3code)

Both opencode and t3code use Effect's `Scope` to bind resource lifetimes. opencode uses a `Runner<A, E>` state machine (`Idle | Running | Shell | ShellThenRun`) with explicit hooks. t3code uses `ProviderSessionRuntimeStatus` union (`connecting | running | ready | error | stopped | closed`) with `closedRef` guarding double-close. Cancellation propagates via Fiber interruption and scope closure.

**Best for**: Complex concurrent runtimes with multiple background tasks.

### 3. Server-Driven Task Scheduling (sdk-go)

sdk-go is architecturally different: no external subprocess. Workflows run as coroutines dispatched by a deterministic scheduler. Lifecycle is modeled as a command state machine with 12 states (`internal/internal_command_state_machine.go:184-196`). Cancellation is Go's `context.Context` with parent-child walking. Sessions are server-side constructs tied to a `SessionResourceID`.

**Best for**: Workflow orchestration where the server owns execution state.

### 4. Protocol Layer Separation (t3code)

t3code's `makeCodexAppServerPatchedProtocol` (`protocol.ts:139-406`) owns all JSON-RPC decoding, separating wire format (newline-delimited JSON) from domain routing. This cleanly separates transport from session logic.

**Best for**: Any stdio-based JSON-RPC runtime.

## Pattern Catalog

### Pattern 1: Explicit State Machine for Session/Run Lifecycle

**What it solves**: Without explicit states, callers cannot reason about whether a session is running, cancelled, or completed. Silent failures and race conditions result.

**Repos demonstrating**: go-plugin (`exited` flag at `client.go:91`), opencode (`Idle | Running | Shell | ShellThenRun` at `packages/opencode/src/effect/runner.ts:33-37`), t3code (`ProviderSessionRuntimeStatus` union at `packages/contracts/src/providerRuntime.ts:30`).

**Why it works**: State transitions are explicit events. Observers can subscribe to state changes. Failure modes map to specific states.

**When to copy**: Always. Any session or run should have a defined state union type.

**When overkill**: Simple fire-and-forget processes with no caller interaction.

### Pattern 2: Scope-Bound Resource Cleanup

**What it solves**: Manual cleanup (defer, finally) is error-prone when paths are many, exceptions can occur, or code evolves.

**Repos demonstrating**: t3code (`Scope.close(runtimeScope, Exit.void)` at `CodexSessionRuntime.ts:1233`), opencode (`ScopedCache` with `registerDisposer` at `packages/opencode/src/effect/instance-state.ts:31-42`), go-plugin (`Kill()` defers `clientWaitGroup.Wait()` at `client.go:512-513`).

**Why it works**: Scopes automatically release resources on scope exit regardless of how exit occurs (success, error, cancellation). Effect's `Scope` cascades to all forked fibers.

**When to copy**: For Effect-based systems, always prefer scoped resources. For Go, prefer explicit `Kill()` + `WaitGroup`.

**When risky**: If the scope boundary is unclear (e.g., long-lived scope with many acquisitions), cleanup timing may be unpredictable.

### Pattern 3: Deferred Completion for Pending Operations

**What it solves**: Callers need to wait for session/turn completion. Polling or blocking channels are clumsy. Deferred provides a composable future.

**Repos demonstrating**: t3code (`Deferred.Deferred` for pending approvals at `CodexSessionRuntime.ts:706-710`), opencode (`Deferred` in BackgroundJob for fiber interruption + fail (`packages/opencode/src/background/job.ts:186-190`)).

**Why it works**: Deferred can be resolved by the session runtime or failed/cancelled. Callers pipe to `Deferred.await`. Resolution is one-shot and deterministic.

**When to copy**: For any operation that blocks a caller pending an async result.

**When overkill**: Simple synchronous operations without callers waiting.

### Pattern 4: Cancellation via Signal Escalation

**What it solves**: Graceful shutdown requires giving the subprocess a chance to clean up before force-killing.

**Repos demonstrating**: opencode (`forceKillAfter: "3 seconds"` at `packages/core/src/cross-spawn-spawner.ts:335-340`), t3code (`forceKillAfter: "2 seconds"` at `CodexSessionRuntime.ts:725`), go-plugin (`Kill()` waits 2s before force kill at `client.go:530-567`).

**Why it works**: SIGTERM allows graceful handlers to run. SIGKILL (or equivalent) ensures the process dies if it hangs. Timeout escalation prevents indefinite hangs.

**When to copy**: For any subprocess that may have cleanup work (file writes, connection draining).

**When risky**: If the subprocess doesn't handle signals, escalation is meaningless.

### Pattern 5: Structured JSON Protocol Over Stdio

**What it solves**: Stdio is a byte stream. Without framing, you can't distinguish messages, detect corruption, or route different message types.

**Repos demonstrating**: t3code (`Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)` at `protocol.ts:106-117`), go-plugin (`bufio.Scanner` + `|` split at `client.go:835-944`), opencode (EventV2.define() + Schema.toTaggedUnion at `packages/core/src/session-event.ts:365-397`).

**Why it works**: Each line is one message. Schema validation catches malformed messages. Tagged unions route to handlers.

**When to copy**: For any stdio-based communication with an external runtime.

**When overkill**: Binary protocols (gRPC) handle framing at the transport layer.

### Pattern 6: Session Reaper for Orphan Cleanup

**What it solves**: Processes can die without cleaning up. Orphaned sessions accumulate and leak resources.

**Repos demonstrating**: t3code (`ProviderSessionReaper` sweeps every 5min, stops sessions idle >30min at `ProviderSessionReaper.ts:36-96`).

**Why it works**: Background task periodically scans for stale sessions and terminates them. Skips sessions with `activeTurnId` to avoid racing with active work.

**When to copy**: For long-running servers managing multiple sessions.

**When risky**: Reaper interval may not suit high-density multi-tenant deployments. 5-min granularity means 35-min worst-case orphan lifetime.

### Pattern 7: Reattach/Reconnect with Partial State Transfer

**What it solves**: Long-running sessions may need to survive host restarts.

**Repos demonstrating**: go-plugin (`ReattachConfig` stores Protocol/Addr/Pid at `client.go:296-315`), t3code (`thread/resume` with fallback to `thread/start` at `CodexSessionRuntime.ts:432-469`), opencode (`ACPSessionManager.load()` fetches session from SDK at `packages/opencode/src/acp/session.ts:46-75`), sdk-go (`RecreateSession` recreates on same worker at `internal/session.go:193-199`).

**Why it works**: Connection metadata (address, PID, resume cursor) is saved. On reconnect, a new client connects to the existing process or session. The server/provider maintains the authoritative session state.

**When to copy**: For long-lived sessions where client restarts should not lose work.

**When risky**: All four repos only restore connection metadata, not mid-run in-flight state. Resume is best-effort or limited to same worker (sdk-go).

## Key Differences

### go-plugin vs opencode vs t3code

go-plugin is battle-tested infrastructure from HashiCorp used in production by millions. Its lifecycle model is simpler (process host, not session manager) but its reattach mechanism is the most robust (stores PID, address, protocol). opencode and t3code use Effect which provides stronger composition but hides lifecycle in runtime internals. t3code's protocol layer separation (`makeCodexAppServerPatchedProtocol`) is the cleanest of the three.

### sdk-go is Fundamentally Different

sdk-go does not spawn external processes. Its "session" concept (Temporal sessions) pins activities to a specific worker for affinity, not for subprocess management. This is a different architectural category: server-driven orchestration vs client-driven process host. sdk-go's score is not directly comparable.

### Cancellation Propagation Depth

| Repo | Cancellation Reaches |
|------|---------------------|
| go-plugin | Context → gRPC client → broker → plugin; 2s timeout → force kill |
| opencode | AbortSignal → Fiber.interrupt → handle.kill() → process group |
| t3code | close() → Scope.close → all fibers → process forceKillAfter |
| sdk-go | context.Context → activity → sessionCancelFunc |

All four have cancellation that reaches the subprocess or its equivalent. The depth differs: t3code's scope closure is the most deterministic (all fibers killed simultaneously), while go-plugin's cancellation is more incremental.

### Resume Strategy Comparison

| Repo | Resume Mechanism | Scope |
|------|-------------------|-------|
| go-plugin | ReattachConfig (Protocol, Addr, Pid) | Pre-detached plugin only |
| t3code | thread/resume → fallback to thread/start | Same thread ID |
| opencode | ACPSessionManager.load() fetches from SDK | Session restored from SDK |
| sdk-go | RecreateSession(token) | Same worker only |

No repo achieves true mid-run state transfer. t3code's fallback-to-fresh-start on recoverable errors is the weakest but also the most pragmatic (no complex partial-state reconciliation).

## Tradeoffs

### Effect-based Scopes vs Manual Cleanup

**Benefit**: Effect scopes eliminate manual cleanup paths; all resources released deterministically on scope exit.

**Cost**: Effect's runtime introspection is opaque; debugging lifecycle issues requires understanding Effect internals.

**Best-fit**: New TypeScript/Go projects without existing cleanup infrastructure.

**Alternative**: go-plugin's explicit `Kill()` + `WaitGroup` is more verbose but more explicit. Better for systems where lifecycle must be auditable without a special runtime.

### Stdout Handshake vs Protocol Service

**Benefit (go-plugin stdout handshake)**: No pre-existing connection needed; plugin announces address after starting.

**Cost**: Plugin must not write to stdout before handshake. Any extra output breaks the protocol.

**Best-fit**: Plugins that can be modified to follow the protocol.

**Alternative (gRPC/broker services)**: More robust but requires pre-negotiated ports or Unix sockets.

### Session Affinity vs Session Migration

**Benefit (affinity)**: No distributed locking; session context stays on one worker.

**Cost**: Worker death kills the session. No automatic failover.

**Best-fit**: Stateful sessions where context must stay on one machine.

**Alternative (sdk-go cross-worker resume)**: Would require server-side session migration support.

### JSON-RPC over Stdio vs gRPC

**Benefit (JSON-RPC/stdio)**: Works over pipes, no port management, simple to debug.

**Cost**: No built-in framing, flow control, or bidirectional streaming.

**Best-fit**: Local subprocess communication.

**Alternative (gRPC)**: Richer semantics but requires network or Unix socket.

## Decision Guide

**If building a local subprocess wrapper with Effect**: Follow opencode/t3code's scoped resource pattern. Use `Scope.close()` to cascade cleanup. Model session state as a tagged union. Use Deferred for pending operations.

**If building a plugin host with upgrade requirements**: Follow go-plugin's `Runner` interface abstraction. Implement reattach with stored Protocol/Addr/Pid. Use `Kill()` with graceful timeout escalation.

**If building a workflow/orchestration system**: Follow sdk-go's command state machine pattern. Model lifecycle as a deterministic state machine driven by history events.

**If using stdio with an unmodified runtime**: Follow t3code's protocol layer separation. Own the JSON-RPC decoding in a dedicated module. Route notifications, requests, and responses separately.

**If needing mid-run resume**: None of the four repos achieve true mid-run state transfer. Implement checkpointing at the application level (not the wrapper level). The wrapper should only restore connection metadata.

## Practical Tips

1. **Model lifecycle as a tagged union** from the start. `Idle | Running | Cancelling | Failed | Completed` prevents silent state confusion.

2. **Use scope-bound cleanup for Effect systems**. `Effect.acquireRelease` or `Scope` ensures cleanup on all exit paths.

3. **Kill process groups, not just the process** on Unix. `kill(-pid, signal)` ensures child processes are terminated.

4. **Escalate signals with timeouts**. SIGTERM first (allows graceful cleanup), SIGKILL after timeout (ensures termination).

5. **Separate protocol decoding from session logic**. A dedicated module owning JSON-RPC parsing makes testing and debugging easier.

6. **Store reattach metadata early**. The PID, address, and protocol type should be captured at spawn time, not at reconnect time.

7. **Use Deferred for pending operations**. Callers need to await session completion, turn completion, or approval resolution.

8. **Implement a session reaper for long-lived servers**. Orphaned sessions are inevitable; a background sweeper prevents resource accumulation.

## Anti-Patterns / Caution Signs

- **No lifecycle state visible to callers**: If callers can't query whether a session is running, the design is opaque.
- **Cleanup only on success path**: If `defer` is missing and errors are not handled, resources leak on failure.
- **Blocking wait without timeout**: `Wait()` calls without timeout can hang indefinitely.
- **No signal escalation**: Force-killing without SIGTERM first means graceful handlers never run.
- **Reattach without process identity**: Storing only connection metadata (not PID) makes reattach fragile.
- **Cancellation not reaching child work**: If parent cancellation doesn't propagate to subprocesses, orphaned work continues after the parent is cancelled.
- **Double-close without guard**: `closedRef` or equivalent should prevent multiple cleanup attempts.

## Notable Absences

- **No WebSocket transport** in any of the four repos for remote runtime communication (opencode notes this gap at `packages/opencode/src/tool/shell.ts:192`)
- **No heartbeat/keepalive** mechanism for long-running sessions (t3code: `apps/server/src/provider/Layers/CodexSessionRuntime.ts:131`; sdk-go: heartbeat is for activities not sessions)
- **No mid-run state transfer**: None of the four repos can resume an in-flight operation with full context
- **No connection pooling** for HTTP clients (opencode: `packages/opencode/src/acp/session.ts:223`)
- **No graceful shutdown protocol** for zero-downtime restarts (t3code: `apps/server/src/provider/Layers/CodexSessionRuntime.ts:125`)
- **Effect's ChildProcessSpawner is experimental** (t3code: `apps/server/src/provider/Layers/CodexSessionRuntime.ts:106`)

## Per-Repo Notes

### go-plugin

A mature, production-grade plugin host. The `Runner` interface is the clearest abstraction for separating lifecycle from transport. The 2-second graceful timeout in `Kill()` is a reasonable default. Reattach is the most robust reconnection mechanism. Weakness: stdout handshake is fragile (any extra output breaks it), and mid-run resume is not supported.

### opencode

Effect-based with strong type safety on events and session messages. The `Runner` state machine is explicit and testable. Scoped resources prevent leaks. Weakness: V2Session stub (`packages/opencode/src/v2/session.ts:289-292`) means the V2 path is not wired. ACP session registry is in-memory.

### sdk-go

Fundamentally different architecture: server-driven task scheduling, not subprocess management. The command state machine is the most sophisticated lifecycle model of the four. Weakness: sessions are tied to specific workers with no cross-worker resume.

### t3code

The cleanest separation of protocol and transport. `makeCodexAppServerPatchedProtocol` owns all JSON-RPC concerns. Session reaper prevents orphaned sessions. `forceKillAfter: "2 seconds"` is explicit. Weakness: resume is best-effort (falls back to fresh start), and the Effect-based runtime means lifecycle is invisible without Effect tooling.

## Open Questions

1. **How should an OpenCode wrapper handle mid-run JSON corruption?** t3code wraps parse errors in `CodexAppServerProtocolParseError` and continues; opencode has no explicit error handling shown for malformed JSON.

2. **Should session state live in the wrapper or the SDK?** go-plugin and sdk-go let the host manage connection metadata; t3code and opencode store session state in a backing service (SQLite projection, SDK).

3. **What is the right reaper interval for a personal coding assistant?** t3code uses 30min/5min. A wrapper wrapping a CLI invoked per-task might not need a reaper at all.

4. **How should the wrapper expose lifecycle state to callers?** All four repos have opaque state (not exposed as a queryable API). Callers must subscribe to events.

## Evidence Index

- go-plugin `runner/runner.go:14-37` — Runner interface
- go-plugin `client.go:91` — exited flag
- go-plugin `client.go:530-567` — Kill() with graceful timeout
- go-plugin `client.go:296-315` — ReattachConfig
- go-plugin `client.go:835-944` — stdout handshake parsing
- go-plugin `internal/cmdrunner/cmd_runner.go:72-82` — CmdRunner.Start()
- opencode `packages/opencode/src/effect/runner.ts:33-37` — Runner state union
- opencode `packages/opencode/src/effect/instance-state.ts:31-42` — ScopedCache
- opencode `packages/core/src/cross-spawn-spawner.ts:335-340` — forceKillAfter
- opencode `packages/core/src/session-event.ts:365-397` — EventV2.define()
- opencode `packages/opencode/src/background/job.ts:186-190` — Fiber.interrupt pattern
- opencode `packages/opencode/src/acp/session.ts:46-75` — ACPSessionManager.load
- opencode `packages/opencode/src/v2/session.ts:289-292` — V2Session stub
- sdk-go `internal/internal_command_state_machine.go:184-196` — commandState enum
- sdk-go `internal/session.go:86-96` — SessionState enum
- sdk-go `internal/session.go:193-199` — RecreateSession
- sdk-go `internal/context.go:297-325` — cancelCtx.cancel()
- t3code `protocol.ts:139-406` — makeCodexAppServerPatchedProtocol
- t3code `apps/server/src/provider/Layers/CodexSessionRuntime.ts:751-762` — session status transitions
- t3code `apps/server/src/provider/Layers/CodexSessionRuntime.ts:432-469` — openCodexThread with resume
- t3code `apps/server/src/provider/Layers/CodexSessionRuntime.ts:1221-1236` — close()
- t3code `apps/server/src/provider/Layers/ProviderSessionReaper.ts:36-96` — session reaper
- t3code `apps/server/src/processRunner.ts:32` — forceKillAfter: "2 seconds"

---

Generated by protocol `study-areas/02-process-session-lifecycle.md`.