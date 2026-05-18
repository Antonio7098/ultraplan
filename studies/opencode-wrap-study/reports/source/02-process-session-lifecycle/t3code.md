# Repo Analysis: t3code

## Process and Session Lifecycle

### Repo Info

| Field | Value |
|-------|-------|
| Name | t3code |
| Path | `/home/antonioborgerees/coding/opencode-wrap-study/repos/t3code` |
| Group | `t3code` |
| Language / Stack | TypeScript, Effect framework, Bun |
| Analyzed | 2026-05-17 |

## Summary

T3 Code is a minimal web GUI for coding agents (Codex, Claude, Cursor, OpenCode). The server is a Node.js WebSocket server that wraps Codex's `app-server` (JSON-RPC over stdio) and streams structured events to the React web app. Lifecycle management is built on Effect's scoped resources with explicit state modeling, structured JSON decoding, cancellation propagation, and session reaping.

## Rating

**8/10** — Clear lifecycle, cancellation, stream capture, and cleanup. Strong tests and structured error handling. Minor扣分: Codex resume fallback is best-effort rather than deterministic, and session reaper sweep timing could be tighter for short-lived sessions.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Process spawn/exec | `ChildProcess.make(options.binaryPath, ["app-server"], { forceKillAfter: "2 seconds", shell: process.platform === "win32" })` — spawns Codex app-server subprocess | `apps/server/src/provider/Layers/CodexSessionRuntime.ts:721-727` |
| Transport/stdio | `makeChildStdio(handle)` wires child stdout→stdin with TextEncoder/TextDecoder; stderr drained | `packages/effect-codex-app-server/src/_internal/stdio.ts:13-22` |
| JSON protocol layer | `makeCodexAppServerPatchedProtocol` — line-based JSON decoding, queue-based routing to notifications/requests/responses | `packages/effect-codex-app-server/src/protocol.ts:139-406` |
| Lifecycle states | `ProviderSessionRuntimeStatus` union: `connecting | running | ready | error | stopped | closed` | `packages/contracts/src/providerRuntime.ts` |
| Cancellation propagation | `close()` settles pending approvals with `"cancel"`, closes runtimeScope, shuts queues | `apps/server/src/provider/Layers/CodexSessionRuntime.ts:1221-1236` |
| Signal/timeout handling | `ProcessRunner` has `timeoutBehavior: "error" | "timedOutResult"`, `ProcessTimeoutError`, `forceKillAfter: "2 seconds"` | `apps/server/src/processRunner.ts:32,96,191-225` |
| Session registry | `ProviderSessionDirectory.listBindings()` returns active session bindings with status/lastSeenAt | `apps/server/src/provider/Services/ProviderSessionDirectory.ts` |
| Process reaper | Sweep by inactivity (30min default, 5min interval), skips sessions with activeTurnId | `apps/server/src/provider/Layers/ProviderSessionReaper.ts:36-96` |
| Session resume | `openCodexThread` tries `thread/resume` then falls back to `thread/start` on recoverable errors | `apps/server/src/provider/Layers/CodexSessionRuntime.ts:432-469` |
| Stderr diagnostics | `classifyCodexStderrLine` filters benign snippets, emits `process/stderr` notification events | `apps/server/src/provider/Layers/CodexSessionRuntime.ts:391-409` |
| Concurrency safety | Effect's Queues/Ref/Deferred for pending approvals and user inputs; `closedRef` guards double-close | `apps/server/src/provider/Layers/CodexSessionRuntime.ts:706-710,1221-1225` |
| Tests | `ProcessRunner` tests cover: output collection, stdin write, exit codes, timeout, truncation, Windows command-not-found | `apps/server/src/processRunner.test.ts:81-280` |

## Answers to Protocol Questions

### 1. What lifecycle states are modeled before, during, and after a run?

`ProviderSession.status` cycles through: `connecting` (app-server starting) → `running` (turn active) → `ready` (awaiting next turn) → `error` (failure) / `stopped` (user stop) / `closed` (normal exit). See `apps/server/src/provider/Layers/CodexSessionRuntime.ts:751-762` and the `updateSession` calls at lines 877-879 (thread/started), 891-893 (turn/started), 908-912 (turn/completed), 927-929 (error), 1160-1163 (exit).

### 2. How are prompts or commands sent to the runtime?

`sendTurn` builds `V2TurnStartParams` via `buildTurnStartParams` (CodexSessionRuntime.ts:1241-1277), encodes via `EffectCodexSchema`, and calls `client.raw.request("turn/start", params)`. The client is a CodexAppServerClient wrapping the stdio transport, built via `CodexClient.layerChildProcess(child)` at line 740. Prompts arrive as JSON-RPC `ClientRequest` messages over the newline-delimited stdio stream.

### 3. How are JSON events, stderr diagnostics, protocol messages, and final outputs decoded?

`makeCodexAppServerPatchedProtocol` (protocol.ts:139-406) owns decoding:
- `decodeWireMessage` (line 106-117): `Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)` parses each line
- `routeMessage` (line 280-297): discriminates `IncomingRequest` (has `id`) vs `IncomingNotification` (no `id`) vs `JsonRpcResponseEnvelope`
- stderr: `child.stderr` piped through `Stream.decodeText()` → `classifyCodexStderrLine` → `emitEvent({ kind: "notification", method: "process/stderr" })` at lines 1121-1151
- Final turn output: `client.request("turn/start")` → `decodeV2TurnStartResponse` (line 1258)

### 4. How does cancellation propagate to subprocesses, sessions, and child work?

`close()` (line 1221-1236):
1. Sets `closedRef = true` to guard double-close
2. `settlePendingApprovals("cancel")` — resolves all pending Deferreds with `"cancel"` decision
3. `settlePendingUserInputs({})` — resolves pending user inputs with empty answers
4. Updates session status to `"closed"`
5. `Scope.close(runtimeScope, Exit.void)` — Effect scope shutdown cascades to all forked fibers (including child stdin/stdout/stderr consumers, exitCode listener)
6. `Queue.shutdown` on both `serverNotifications` and `events`

`forceKillAfter: "2 seconds"` is set on the child process spawn at line 725. When the scope closes, the process is forcibly killed if it doesn't exit gracefully.

### 5. What prevents leaked processes, goroutines, file handles, sockets, and sessions?

- **Processes**: `forceKillAfter: "2 seconds"` on ChildProcess; `Layer.effect(CodexAppServerClient, make(...)).pipe(Effect.provideService(Scope.Scope, runtimeScope))` — scope-bound lifecycle ensures cleanup
- **Gorgets (Effect fibers)**: `Scope.close` at `close()` line 1233 terminates all forked-in-runtimescope fibers (stdin pump line 330-365, stdout pump line 367, stderr handler line 1121-1151, exitCode listener line 1153-1178, notification dispatcher line 1115-1118)
- **File handles**: child.stdout/stderr/stdin are Sink/Stream consumers on the child process handle; scope closure drives them to completion/drain
- **Sessions**: `ProviderSessionReaper` sweeps every 5 minutes, stopping sessions idle >30 minutes; `stopSession` triggers `CodexSessionRuntime.close()`
- **Queues**: `Queue.shutdown` called on both `serverNotifications` and `events` at line 1234-1235

### 6. Is there a strategy for reconnecting to or resuming an existing session?

Yes. `CodexSessionRuntime` accepts `resumeCursor?: CodexResumeCursor` (line 105). `openCodexThread` (line 432-469) first calls `thread/resume` with the stored provider thread ID; on `isRecoverableThreadResumeError` (line 411-417 checks for "not found", "missing thread", "no such thread", "unknown thread", "does not exist"), it falls back to fresh `thread/start`. The resume cursor is stored as `ProviderSessionRuntime.resumeCursor` (schema at `persistence/Services/ProviderSessionRuntime.ts:37`). On reconnection, `ProviderSessionRuntimeRepository.getByThreadId` retrieves the cursor and passes it to `makeCodexSessionRuntime`.

## Architectural Decisions

1. **Effect-based resource management**: All processes/streams are scoped via `Scope.Scope`. When a scope closes, all acquired resources (child processes, stream fibers, queues) are deterministically cleaned up. No manual `try/finally` needed.

2. **Structured protocol over raw stdio**: The `effect-codex-app-server` package owns the JSON-RPC protocol layer, separating wire format (newline-delimited JSON) from domain logic (notifications → queue, requests → handler). This is a clean separation of transport vs application.

3. **Deferred-based pending approval tracking**: Pending approvals and user inputs are stored in `Ref<Map<ApprovalRequestId, PendingApproval>>`. Each has a `Deferred.Deferred` that callers await. When the user resolves or the session closes, the deferred is resolved, unblocking the waiters.

4. **Provider session directory as registry**: `ProviderSessionDirectory` is the in-memory index of active sessions. It's backed by a SQLite projection. The reaper consults this directory to enumerate and clean up stale sessions.

5. **Stderr classification for diagnostics**: Codex app-server logs to stderr with structured prefixes. `classifyCodexStderrLine` strips ANSI codes, parses the timestamp/level/message pattern, filters benign errors (e.g., "state db missing rollout path"), and emits the rest as `process/stderr` events to the web client.

## Notable Patterns

- **Layer pattern for testability**: `CodexSessionRuntime.make` accepts `ChildProcessSpawner` as a dependency, allowing test harnesses to inject mock handles without spawning real processes.
- **Tagged errors for protocol-level failures**: `CodexAppServerSpawnError`, `CodexAppServerProcessExitedError`, `CodexAppServerProtocolParseError`, `CodexAppServerTransportError`, `CodexAppServerRequestError` — each carrying structured context for debugging.
- **Effect.repeat + Schedule for the reaper**: The session reaper uses `Effect.repeat(Schedule.spaced(Duration.millis(sweepIntervalMs)))` with a scoped fork, so it runs as a background task for the lifetime of the server.
- **Protocol versioning via generated schema**: The `effect-codex-app-server` package fetches the upstream Codex schema at build time and generates TypeScript types (`_generated/schema.gen.ts`). The client/server are versioned to the protocol, not the binary.

## Tradeoffs

- **Resume fallback is best-effort**: If `thread/resume` fails with a recoverable error, the code falls back to a fresh `thread/start`. This means the conversation context is lost on transient errors. A more robust approach might cache the full conversation state locally for retry.
- **Stderr is drained, not captured**: `makeChildStdio` sets `stderr: () => Sink.drain` — Codex's stderr diagnostic output is consumed and re-emitted as events but not buffered to `ProcessRunOutput.stderr`. This is intentional (stderr is for diagnostics, not output), but it means there's no post-hoc stderr log if the process crashes.
- **Provider session reaper has 5-minute granularity**: Sweep runs every 5 minutes with a 30-minute inactivity threshold. For short-lived interactive sessions, this means a session could be "orphaned" for up to 35 minutes before cleanup. This is acceptable for the current use case but may not suit high-density multi-tenant deployments.
- **Effect's ChildProcessSpawner is experimental**: `effect/unstable/process` is marked unstable. The API may change in future Effect versions, requiring migration work.

## Failure Modes / Edge Cases

1. **Malformed JSON from Codex**: `decodeWireMessage` wraps parse errors in `CodexAppServerProtocolParseError` (protocol.ts:106-117). The error is logged via `logProtocol` with stage `"decode_failed"` but does not terminate the session — the stream continues processing subsequent lines.

2. **Child process hangs**: If Codex hangs and doesn't produce output, `child.exitCode` never resolves. `ProcessRunner.run` has a 60-second default timeout (`DEFAULT_TIMEOUT` at line 96), after which `ProcessTimeoutError` is raised. For Codex session runtime, `forceKillAfter: "2 seconds"` ensures the process is killed when the Effect scope closes.

3. **Parent cancellation during turn**: If the user cancels a turn while it's in progress, `interruptTurn` sends `turn/interrupt` RPC to Codex (line 1286-1290). The turn may still complete server-side; the client handles this by ignoring late `turn/completed` events if the activeTurnId doesn't match.

4. **Session reaper races with active turn**: The reaper skips sessions where `thread.session.activeTurnId != null` (ProviderSessionReaper.ts:64). However, there's a window between checking and stopping where a turn could start. This is mitigated by the reaper logging skipped sessions and by `stopSession` being idempotent.

5. **Double-close on CodexSessionRuntime**: `closedRef` (line 710) guards against concurrent or repeated `close()` calls. The second call returns early at line 1223-1225.

## Future Considerations

- **Reconnect/resume with deterministic replay**: The current resume logic falls back to fresh start on recoverable errors. A more robust implementation would cache turn history locally and replay it on resume, ensuring no messages are lost.
- **Structured stderr buffering**: Consider capturing stderr to a ring buffer that can be retrieved post-mortem if the process exits abnormally, aiding debugging of crashes.
- **Multi-session concurrency**: Current architecture is one CodexSessionRuntime per thread. Supporting multiple concurrent sessions per provider instance would require session multiplexing at the transport layer.
- **Graceful shutdown with drain**: Instead of `forceKillAfter: "2 seconds"`, a graceful shutdown protocol could send a `shutdown` RPC and wait for clean exit, improving zero-downtime restarts.

## Questions / Gaps

- **No evidence found** for WebSocket-level reconnection/resume protocol. The web client reconnects to the WebSocket server and re-subscribes to thread events, but the server does not have a mechanism to replay missed provider events to a reconnecting client. This is a gap in the current design.
- **No evidence found** for health-check / keepalive ping on the child process. If Codex freezes (neither emits events nor exits), the only detection mechanism is the `ProcessRunner` timeout on the initial spawn, not ongoing liveness monitoring.
- **No evidence found** for resource cleanup on `ProviderSessionRuntimeRepository.deleteByThreadId` being called from the reaper. The reaper calls `providerService.stopSession` which closes the runtime, but it's unclear if the `ProviderSessionRuntime` row is deleted or just marked as stopped.

---

Generated by `study-areas/02-process-session-lifecycle.md` against `t3code`.