# Repo Analysis: go-plugin

## Process and Session Lifecycle

### Repo Info

| Field | Value |
|-------|-------|
| Name | go-plugin |
| Path | `/home/antonioborgerees/coding/opencode-wrap-study/repos/go-plugin` |
| Group | `go-plugin` |
| Language / Stack | Go / RPC (net/rpc and gRPC) |
| Analyzed | 2026-05-17 |

## Summary

go-plugin is a mature, battle-tested plugin system for HashiCorp tooling that launches subprocess plugins and communicates over RPC (net/rpc or gRPC). It models explicit lifecycle states for plugin processes (starting, running, stopping, exited), uses structured handshake protocol over stdout for address negotiation, and provides comprehensive cleanup via `Client.Kill()` and `CleanupClients()`. The design supports reattachment to running plugins, automatic mTLS, and graceful shutdown with timeout fallbacks. Lifecycle is well-separated from transport: the `Runner` interface abstracts process execution, the client manages lifecycle separately from RPC protocol negotiation.

## Rating

**8/10** — Clear lifecycle, cancellation, stream capture, and cleanup. Production-grade supervision used by millions of machines across Terraform, Packer, Nomad, Vault, Boundary, and Waypoint. Docked one point for lack of formal reconnect/resume for active sessions (reattach only works for pre-detached plugins, not mid-run recovery).

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Process spawn/exec | `CmdRunner.Start()` calls `exec.Cmd.Start()` to spawn plugin subprocess | `internal/cmdrunner/cmd_runner.go:72-82` |
| Structured handshake | Client parses `"%d|%d|%s|%s|%s|%s"` protocol line from stdout (core protocol, API version, network, address, protocol type, TLS cert) | `client.go:835-944` |
| JSON log parsing | `parseJSON()` decodes hclog JSON from stderr into structured `logEntry` with level, message, timestamp, KV pairs | `log_entry.go:38-76` |
| Context cancellation | `Client.Start()` creates `doneCtx` with `ctxCancel` for lifecycle-level cancellation | `client.go:753-754` |
| Signal handling | `Serve()` in non-test mode wraps interrupt signals and ignores them to protect plugin lifecycle | `server.go:462-473` |
| Graceful kill + timeout | `Client.Kill()` attempts graceful client.Close(), waits 2s, then force kills | `client.go:530-567` |
| Cleanup on failure | `defer` in `Start()` kills runner if initialization fails | `client.go:740-751` |
| Process registry | `managedClients` slice tracked globally; `CleanupClients()` iterates and kills all | `client.go:42-43, 362-383` |
| Reattach support | `ReattachConfig` stores Protocol, Addr, Pid for reconnecting to existing plugin process | `client.go:296-315` |
| gRPC stdio streaming | `grpcStdioClient.Run()` streams stdout/stderr over gRPC using `StreamStdio` | `grpc_stdio.go:126-172` |
| gRPC health check | `Ping()` uses `grpc_health_v1` service to verify plugin liveness | `grpc_client.go:127-134` |
| Graceful stop | `GRPCServer.Stop()` calls `grpc.Server.Stop()` then broker.Close() | `grpc_server.go:118-136` |
| Runner interface | `Runner` and `AttachedRunner` interfaces abstract process lifecycle from transport | `runner/runner.go:14-55` |
| Pipes wait group | `pipesWaitGroup` ensures stdout/stderr pipe readers complete before `Wait()` | `client.go:107-108, 756-758, 773-774` |
| Session tracking | `Client.Exited()` flag tracks process state with mutex protection | `client.go:91, 478-482` |
| Shutdown controller | `GRPCControllerServer.Shutdown()` calls `server.Stop()` on client close | `grpc_controller.go:18-25` |

## Answers to Protocol Questions

### 1. What lifecycle states are modeled before, during, and after a run?

**Before run:** `Client` is constructed with `ClientConfig` (Cmd, Plugins, HandshakeConfig, etc.). The `Runner` interface is set up via either `cmdrunner.NewCmdRunner()` (default) or a custom `RunnerFunc`.

**During run:** `Client.Start()` transitions from "not started" to "starting" by setting address, creating context (`doneCtx`), and launching goroutines:
- `logStderr` goroutine reads stderr for log parsing (`client.go:763`)
- stdout scanner reads lines for protocol handshake (`client.go:797-809`)
- `runner.Wait()` goroutine tracks process exit (`client.go:777`)
- Pipes wait group ensures pipe reading completes (`client.go:758, 773-774`)

The protocol handshake parses `"coreVersion|apiVersion|network|address|protocolType|tlsCert"` from stdout (`client.go:835-944`). After successful handshake, `c.address` is set and the client transitions to "running".

**After run:** `Client.Kill()` first attempts graceful close (calls `client.Close()` which closes gRPC connections via `grpc_client.go:105-109`), waits up to 2 seconds for graceful exit, then force-kills the runner. The `exited` flag is set under lock (`client.go:788-790`). The `clientWaitGroup` blocks until all goroutines finish.

**States explicitly tracked:** `exited` bool (`client.go:91`), `processKilled` bool for testing (`client.go:112`), `doneCtx` context for cancellation (`client.go:98-99`).

### 2. How are prompts or commands sent to the runtime?

This is a plugin-host RPC system, not a prompt-based AI runtime. Communication flow:

**Plugin → Host (stdout):** The plugin writes a single handshake line to stdout: `"CoreProtocolVersion|ProtocolVersion|Network|Address|ProtocolType|TLSCert"` (`server.go:426-446`). This is read line-by-line via `bufio.Scanner` (`client.go:802-805`) and parsed by splitting on `|`.

**Host → Plugin (stdin):** `cmd.Stdin = os.Stdin` is set (`client.go:659`), preserving TTY for interactive tools like SSH. The plugin reads stdin normally.

**For gRPC plugins:** Communication flows over the negotiated RPC connection (TCP or Unix socket), not stdin/stdout. The plugin serves gRPC and the client dials via `grpc.Dial()` (`grpc_client.go:48`).

**Stdout/stderr sync:** Pipes are set up via `cmd.StdoutPipe()` and `cmd.StderrPipe()` (`internal/cmdrunner/cmd_runner.go:53-61`). Stderr is parsed for JSON hclog entries; stdout is scanned line-by-line for the handshake protocol. For gRPC stdio, data is streamed over the `GRPCStdio` service (`grpc_stdio.go:50-83`).

### 3. How are JSON events, stderr diagnostics, protocol messages, and final outputs decoded?

**Stderr JSON diagnostic parsing:** `logStderr()` in `client.go:1169-1278` reads stderr with a buffered reader and attempts `parseJSON()` (`log_entry.go:38-76`). If successful, the `logEntry` struct is used to extract level, message, timestamp, and KV pairs for structured logging via hclog. If JSON parsing fails, it falls back to parsing `[TRACE]`, `[DEBUG]`, `[INFO]`, `[WARN]`, `[ERROR]` prefixes (handles panic/fatal stacks specially).

**Protocol handshake parsing:** `Start()` at `client.go:835-850` splits the stdout line by `|` into parts. It validates:
- `parts[0]` = core protocol version (must match `CoreProtocolVersion` = 1)
- `parts[1]` = API protocol version (matched against `VersionedPlugins`)
- `parts[2]`/`parts[3]` = network/address for `net.ResolveTCPAddr` or `net.ResolveUnixAddr`
- `parts[4]` = protocol type (`ProtocolNetRPC` or `ProtocolGRPC`)
- `parts[5]` = base64-encoded TLS cert (optional, for AutoMTLS)

**gRPC stdio:** `grpcStdioServer.StreamStdio()` (`grpc_stdio.go:50-83`) reads from `stdoutCh` and `stderrCh` channels and streams `plugin.StdioData` messages with `STDOUT` or `STDERR` channel designation. The client `grpcStdioClient.Run()` (`grpc_stdio.go:126-172`) receives these and writes to the configured `io.Writer`s.

### 4. How does cancellation propagate to subprocesses, servers, sessions, and child work?

**Context tree:** `Client.Start()` creates `doneCtx, ctxCancel := context.WithCancel(context.Background())` (`client.go:753-754`). This context is passed to:
- `grpcClient` (via `doneCtx` in `newGRPCClient`) (`grpc_client.go:58, 85`)
- `grpcStdioClient.Run()` which checks `srv.Context().Done()` for client-side stream cancellation (`grpc_stdio.go:68-69, 139-141`)
- The reattach wait goroutine (`client.go:993`)
- `runner.Wait()` calls in multiple goroutines use `context.Background()` (not doneCtx) — Wait() is called on the runner directly

**Kill propagation:** `Client.Kill()` (`client.go:498-572`) first attempts graceful close via `client.Close()` (which closes gRPC connection and calls `broker.Close()` and `controller.Shutdown()`), then waits 2s, then calls `runner.Kill(context.Background())` which calls `cmd.Process.Kill()`.

**gRPC graceful shutdown:** `GRPCServer.Stop()` (`grpc_server.go:118-125`) calls `s.server.Stop()` which stops accepting new connections and tears down existing ones. The broker is also closed.

**Managed client cleanup:** `CleanupClients()` (`client.go:364-383`) spawns a goroutine per managed client to call `Kill()` in parallel, then waits via `WaitGroup`.

**goroutine leak prevention:** The `clientWaitGroup` tracks all goroutines (`logStderr`, stdout scanner, reattach waiter, etc.). `Kill()` defers waiting on this group (`client.go:512-513`) to ensure all lifecycle goroutines complete before `Kill()` returns.

### 5. What prevents leaked processes, goroutines, file handles, sockets, and sessions?

**Process cleanup:**
- `cmd.StdoutPipe()` / `cmd.StderrPipe()` return `io.ReadCloser` that are closed when `cmd.Wait()` completes
- `pipesWaitGroup` (`client.go:107-108`) prevents `Wait()` from being called before stdout/stderr reading completes
- `runner.Kill()` calls `Process.Kill()` which terminates the process; subsequent Kill calls handle `os.ErrProcessDone` gracefully

**Socket cleanup:**
- Unix domain socket removed via `rmListener.Close()` which calls `os.Remove(path)` (`server.go:648-665`)
- `hostSocketDir` is cleaned up via `os.RemoveAll()` in `Client.Kill()` (`client.go:515-517`)
- TCP listener closed when `server.Serve()` returns

**goroutine cleanup:**
- All goroutines registered with `clientWaitGroup`; `Kill()` blocks on `WaitGroup.Wait()`
- `doneCtx` cancellation signals lifecycle goroutines to exit

**Session cleanup:**
- `Client.Close()` closes the gRPC client connection, broker, and controller
- `GRPCBroker` manages multiplexed connections and closes them all on `Close()`

**No evidence of:**
- Finalizer-based cleanup (would appear as `runtime.SetFinalizer`)
- Explicit `close()` error checks in defer chains (some errors are swallowed with `_ =`)

### 6. Is there a strategy for reconnecting to or resuming an existing session?

**Reattach:** Yes, `ReattachConfig` (`client.go:296-315`) allows reconnecting to a running plugin. It stores:
- `Protocol` (net/rpc or gRPC)
- `ProtocolVersion`
- `Addr` (network address)
- `Pid` (process ID)
- `ReattachFunc` (custom runner implementation)
- `Test` flag (prevents Kill from terminating the process)

The flow: `NewClient(config)` with `Reattach` set calls `c.reattach()` (`client.go:615-617`). This creates a context and spawns a goroutine that waits on the runner to detect exit. The client stores the address and protocol directly. No state is transferred — the caller must reconstruct any session state.

**Resume mid-run:** No. There is no mechanism to resume an in-progress operation after reconnection. The reattach is designed for host process upgrades where the plugin keeps running, not for mid-session recovery. If the plugin crashes or is killed, any in-flight work is lost.

**Limitations:** Reattach requires the plugin to have been started with `ReattachConfig` information available. The README notes this requires "the host/plugin to know this is possible and daemonize properly" (`README.md:68-72`).

## Architectural Decisions

1. **Transport orthogonal to lifecycle** — The `Runner` interface (`runner/runner.go:14-37`) abstracts process start/wait/kill, completely separate from whether the plugin uses net/rpc or gRPC. This allows embedding in containers, SSH sessions, or other environments with different process models.

2. **stdout handshake protocol** — The plugin writes a single structured line to stdout containing all connection metadata. This avoids complex negotiation and allows the client to parse the address and protocol before any RPC connection. The format is text-based with `|` separators for simplicity.

3. **gRPC as first-class protocol** — Unlike many RPC systems that treat gRPC as an afterthought, go-plugin has deep gRPC integration: broker service for dynamic port allocation, controller service for shutdown, stdio service for output streaming, and health checking via the standard gRPC health service.

4. **mTLS auto-negotiation** — `AutoMTLS` generates one-time certificates on both sides with the client sending its cert during handshake via `PLUGIN_CLIENT_CERT` environment variable. This provides transport authentication without pre-shared keys.

5. **Unix socket preference** — On non-Windows platforms, plugins listen on Unix domain sockets rather than TCP. This provides isolation (filesystem permissions) and avoids port conflicts. TCP fallback exists for Windows and when Unix sockets are unavailable.

6. **Managed client registry** — The global `managedClients` slice allows bulk cleanup via `CleanupClients()` at program exit. This is critical for tooling like Terraform that may create many plugin processes.

## Notable Patterns

- **Graceful degradation** — If gRPC stdio is unavailable (older plugin), the stdio client logs a warning and does nothing (`grpc_stdio.go:109-113`). Similarly, `parseJSON` falls back to level-prefix parsing.

- **Panic isolation** — Plugin panics do not crash the host; the subprocess is killed and the host continues. This is explicitly documented in the README (`README.md:89-91`).

- **Protocol versioning** — Both core protocol (constant `CoreProtocolVersion = 1`) and API protocol (user-configurable `HandshakeConfig.ProtocolVersion`) allow incompatible changes.

- **WaitGroup coordination** — `pipesWaitGroup` and `clientWaitGroup` coordinate between stdout/stderr readers and process Wait to prevent premature pipe closure.

## Tradeoffs

1. **Stdout handshake coupling** — The handshake protocol is tightly coupled to stdout text format. If a plugin writes anything to stdout before the handshake line, the client will misparse and fail. This is a known limitation.

2. **No true async cancellation** — While `doneCtx` exists, `runner.Wait()` is called with `context.Background()` in several places, meaning cancellation doesn't reliably interrupt blocking waits. The 2-second graceful timeout in `Kill()` is the fallback.

3. **No partial reconnect** — Reattach only restores the connection, not any in-flight state. For long-running operations, the caller must implement their own checkpointing if they want resumability.

4. **Unix socket on Windows not supported** — The codebase has explicit `if runtime.GOOS == "windows"` branches for TCP-only listening (`server.go:529-531, 578`).

5. **Single protocol per connection** — Once a plugin commits to net/rpc or gRPC, it cannot switch. The protocol type is part of the handshake line (`parts[4]`).

## Failure Modes / Edge Cases

| Scenario | Behavior |
|----------|----------|
| Plugin exits before handshake | `Start()` times out with "timeout while waiting for plugin to start" (`client.go:831`) or "plugin exited before we could connect" (`client.go:833`) |
| Malformed handshake line | Returns "Unrecognized remote plugin message" with `runner.Diagnose()` appended diagnostic (`client.go:840-848`) |
| Protocol version mismatch | Returns "incompatible core API version with plugin" or "incompatible API version with plugin" (`client.go:862-866, 1051-1053`) |
| Plugin crashes mid-run | `runner.Wait()` returns error, logged via `c.logger.Error("plugin process exited", ...)` (`client.go:779`). `Exited()` becomes true. |
| Parent cancelled before handshake completes | `doneCtx` cancels the select, `Start()` returns "plugin exited before we could connect" |
| gRPC stdio unavailable | Client logs warning and continues without stdout/stderr sync (`grpc_stdio.go:109-113`) |
| Unix socket creation fails | Falls back to TCP listener on Windows; returns error on Unix (`server.go:578-610`) |
| TLS cert mismatch | Connection fails at `tls.Client()` level; error propagates through `Dial()` |
| Kill called on already-exited process | `runner.Kill()` handles `os.ErrProcessDone` gracefully (`internal/cmdrunner/cmd_runner.go:88-99`) |
| Scanner reads partial line | `isPrefix` flag causes line to be re-buffered; continuation handling at `client.go:1198-1209` |

## Future Considerations

1. **Structured reattach state** — The current `ReattachConfig` only captures connection metadata. A richer format could include session checkpoint data for mid-run resumption.

2. **Context propagation to plugin** — The plugin receives `doneCtx` in `GRPCClient`, but net/rpc plugins have no context concept. A `Context()` method on the plugin interface could enable per-call cancellation.

3. **Async handshake** — The current model blocks `Start()` until the handshake line is received. An async version could allow other initialization work in parallel.

4. **Metrics/observability** — No telemetry beyond hclog. Production deployments would benefit from tracing, metrics, and structured event emission for lifecycle state transitions.

## Questions / Gaps

| Question | Answer |
|----------|--------|
| Does the plugin receive the parent's context for cancellation? | The `GRPCClient` receives `doneCtx` (`grpc_client.go:58, 85`) which is cancelled when `Kill()` is called. net/rpc plugins do not receive context. |
| What happens if stdout is closed before the handshake line? | The `bufio.Scanner` will return an error, and `Start()` will return "Failed to read any lines from plugin's stdout" (`client.go:842`). |
| Is there a way to query the running state without blocking? | `Client.Exited()` returns the `exited` flag under lock (`client.go:478-482`). `NegotiatedVersion()` returns the negotiated protocol version. |
| Can multiple clients share a single plugin process? | Only via reattach. Each `Client` with `Reattach` pointing to the same process shares the same connection. No reference counting exists. |
| What cleanup occurs on client.Close() vs client.Kill()? | `Close()` closes gRPC/broker but does not kill the process. `Kill()` closes the client and then terminates the process. |

---

Generated by `study-areas/02-process-session-lifecycle.md` against `go-plugin`.