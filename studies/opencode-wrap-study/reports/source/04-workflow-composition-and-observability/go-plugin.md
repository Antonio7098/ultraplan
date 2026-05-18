# Repo Analysis: go-plugin

## Workflow Composition and Observability

### Repo Info

| Field | Value |
|-------|-------|
| Name | go-plugin |
| Path | `/home/antonioborgerees/coding/opencode-wrap-study/repos/go-plugin` |
| Group | `go-plugin` |
| Language / Stack | Go |
| Analyzed | 2026-05-17 |

## Summary

go-plugin is a plugin system over RPC (net/rpc or gRPC) for managing external subprocess plugins. It provides lifecycle management (start, kill, reattach), protocol negotiation, bidirectional communication via MuxBroker, and log streaming from plugins to the host. It does NOT provide workflow primitives, DAG scheduling, step composition, retry logic, cost/token accounting, or run dashboards — those concerns are entirely up to the host application.

## Rating

**3/10** — Workflow behavior is ad hoc and invisible.

go-plugin manages plugin **processes**, not workflow steps. It has no concept of task dependencies, retry policies, or structured state. The library does stream logs from plugins (`log_entry.go:11-35`) and supports stdio forwarding, but provides no event projection, no run metadata (cost, tokens, duration), and no observability primitives beyond raw log forwarding. There is no DAG, no step, no orchestrated execution.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Plugin lifecycle (start/kill/reattach) | `Client.Start()` launches subprocess, parses protocol line from stdout | `client.go:580-948` |
| Runner abstraction | `runner.Runner` interface decouples process management | `runner/runner.go:14-37` |
| Protocol negotiation | `CoreProtocolVersion`, `protocolVersion()` function | `server.go:28-33`, `server.go:145-222` |
| Log streaming | JSON log entries parsed from stderr, forwarded to host hclog | `log_entry.go:11-76`, `client.go:1169-1279` |
| Stdio forwarding | gRPC stdio service streams stdout/stderr | `grpc_stdio.go:51-83`, `grpc_stdio.go:126-172` |
| Connection multiplexing | yamux session for net/rpc; gRPC stream multiplexing | `mux_broker.go:18-205`, `internal/grpcmux/grpc_muxer.go:10-41` |
| Plugin interface | `Plugin` and `GRPCPlugin` interfaces for dispensing | `plugin.go:22-46` |
| gRPC services | Broker, Controller, Stdio gRPC services registered | `grpc_server.go:78-99` |

## Answers to Protocol Questions

### 1. What workflow primitive is used, and how much does it know about the runtime?

**No workflow primitive exists.** go-plugin operates at process granularity only. The primary primitive is the `Client` (`client.go:89-118`) which manages a single plugin subprocess lifecycle. The `Runner` interface (`runner/runner.go:14-37`) abstracts subprocess execution but carries no knowledge of tasks, steps, or DAGs. There is no step, no task, no workflow graph — only "plugin process."

### 2. How are steps scheduled, parallelized, retried, cancelled, and summarized?

**Not applicable.** Scheduling, parallelization, retry, and cancellation are outside scope. The `Kill()` method (`client.go:498-572`) can terminate a plugin process, and `Start()` launches it — but there is no retry mechanism, no step dependency tracking, no composition of steps into larger units. Each plugin is an isolated RPC endpoint.

### 3. How are structured runtime events projected into user-facing progress?

**No event projection exists.** Log entries are parsed (`log_entry.go:37-76`) and forwarded to the host's hclog logger, but there is no structured event bus, no state store, no projector. Users see raw logs. The `GRPCStdio` service (`grpc_stdio.go:13-20`) streams stdout/stderr bytes but does not emit structured events with metadata.

### 4. What metadata is captured for every run, step, provider, model, and artifact?

**Minimal metadata.** The `Client` tracks:
- `negotiatedVersion` (`client.go:100`)
- `address` (network address of plugin)
- `runner.ID()` (typically PID) (`runner/runner.go:52`)
- Process exit state (`client.go:90`, `client.go:788-790`)

**No metadata captured for**: model, provider, tokens, cost, duration of individual operations, artifacts, or decisions. Plugin stderr logs are forwarded but not parsed for structured telemetry.

### 5. How are logs and durable state organized so tools can inspect active and historical runs?

**No durable state store.** Plugin logs go to the host's hclog logger (structured JSON via `log_entry.go:11-17`). The `logStderr()` function (`client.go:1169-1279`) parses log lines and writes to hclog. There is no persisted state, no run database, no historical query API. Each plugin is a fire-and-forget subprocess; the host must implement its own log aggregation and state persistence.

### 6. What should remain in the runtime wrapper versus UltraPlan-specific orchestration?

**Clear separation exists, but in the opposite direction of the question.** go-plugin is a thin process-and-RPC layer. It provides:
- Subprocess lifecycle (`Client.Start`, `Client.Kill`)
- Protocol negotiation
- Log and stdio forwarding
- Connection multiplexing (MuxBroker)

What is **missing** (and belongs in UltraPlan or a wrapper):
- Workflow/step primitives with dependency ordering
- Retry policies, timeouts, backoff
- Structured event emission (progress, cost, tokens, artifacts)
- Run state store and dashboard data
- Cancellation propagation

The runtime wrapper should handle "how do we manage one plugin's lifecycle," while UltraPlan should handle "how do we compose many plugin calls into a study/sprint plan with observability."

## Architectural Decisions

1. **Process isolation over in-process plugins.** go-plugin uses subprocess RPC to crash-separate plugins from the host. This is a correctness decision, not a workflow decision. (`client.go:89-118`, `runner/runner.go:14-37`)

2. **Dual protocol support.** net/rpc (legacy) and gRPC. Protocol is negotiated at handshake. (`protocol.go:11-18`, `server.go:373-411`)

3. **Yamux multiplexing for net/rpc.** Multiple logical channels (control, stdout, stderr, broker) multiplexed over one connection. (`rpc_client.go:65-70`)

4. **Runner interface for testability.** The `Runner` interface (`runner/runner.go:14-37`) allows custom process management (e.g., container-based execution) without changing the plugin protocol layer.

5. **No workflow state.** State lives entirely in the host application. go-plugin has no concept of a "run," a "step," or "workflow execution context."

## Notable Patterns

- **Magic cookie handshake.** A key-value pair validated at startup to prevent accidental execution of plugins. (`server.go:249-266`)
- **AutoMTLS.** Automatic mutual TLS certificate generation and exchange. (`client.go:669-692`, `server.go:306-340`)
- **MuxBroker for dynamic channel creation.** Plugins can open additional RPC connections over the same transport by negotiating stream IDs. (`mux_broker.go:52-124`)
- **Unix socket preference on POSIX.** Plugins prefer Unix domain sockets (with optional group-based access) over TCP on non-Windows platforms. (`server.go:528-611`)

## Tradeoffs

**Strengths:**
- Battle-tested across Terraform, Packer, Nomad, Vault, Boundary, Waypoint
- Strong process isolation: plugin panics don't crash the host
- Both net/rpc and gRPC support; cross-language plugin capability via gRPC
- Pluggable runner for containerized or custom execution environments

**Weaknesses:**
- No workflow semantics: each plugin is an island
- No structured event projection, observability, or telemetry
- No metadata about run context, cost, tokens, or decisions
- No retry, no step composition, no DAG
- Log forwarding is raw — no parsing into structured run records
- No durable state; all run history must be implemented by the host

## Failure Modes / Edge Cases

- **Plugin process exits before connection** — Client logs error and sets `exited=true` (`client.go:777-783`). The host must handle this.
- **Stderr log parsing fails** — Falls back to plain text debug logging (`client.go:1228-1249`). Non-JSON, non-hclog plugins produce unstructured output.
- **Protocol version mismatch** — Clear error message with version numbers (`server.go:862-866`).
- **Reattach to dead process** — `ErrProcessNotFound` returned (`client.go:49`).
- **gRPC broker multiplex not supported** — `ErrGRPCBrokerMuxNotSupported` returned (`client.go:72`).
- **5-second timeout on MuxBroker accept/dial** — Hardcoded, not configurable (`mux_broker.go:61`, `mux_broker.go:189`).

## Future Considerations

- Structured event emission API for plugins to report step progress, cost, tokens without host-side parsing
- Built-in retry with backoff for transient plugin failures
- Run state store interface for durable history and dashboard queries
- Optional metadata context propagation across plugin calls (run ID, parent step, etc.)

## Questions / Gaps

- **No evidence found** of any workflow, step, or task composition primitive. This is a process-launch library, not a workflow library.
- **No evidence found** of structured event projection or telemetry. Log forwarding exists but not structured event emission.
- **No evidence found** of cost, token, or duration tracking per operation.
- **No evidence found** of a run state store or durable history mechanism.
- **No evidence found** of retry, backoff, or cancellation semantics beyond `Kill()`.

---
Generated by `study-areas/04-workflow-composition-and-observability.md` against `go-plugin`.