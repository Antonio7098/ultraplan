# Repo Analysis: go-plugin

## Runtime Contract and API Shape

### Repo Info

| Field | Value |
|-------|-------|
| Name | go-plugin |
| Path | `/home/antonioborgerees/coding/opencode-wrap-study/repos/go-plugin` |
| Group | `go-plugin` |
| Language / Stack | Go |
| Analyzed | 2026-05-17 |

## Summary

go-plugin is a Go plugin system over RPC that manages external plugin subprocesses. It exposes two public interfaces (`Plugin` and `GRPCPlugin`) that plugin authors implement, and two client-side types (`Client` and `ServeConfig`) that hosts use. The library supports both `net/rpc` and `gRPC` transport protocols, with connection brokering via `MuxBroker` (net/rpc) or `GRPCBroker` (gRPC). The public API is focused on plugin lifecycle management, interface dispensing, and stdout/stderr syncing — there is no built-in concept of sessions, turns, structured events, or JSON event streams for AI agent use cases.

## Rating

**4/10** — Usable API exists but runtime-specific details leak heavily. The library is tightly coupled to the plugin-as-subprocess model and exposes net/rpc and gRPC concepts directly. It has no notion of sessions, turns, structured JSON events, cancellation tokens, or metadata fields for model/provider/cost. While it supports cross-language plugins via gRPC, adapting it for OpenCode or other AI runtimes would require significant redesign.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Core Plugin interface | `Plugin` interface with `Server()` and `Client()` methods | `plugin.go:24-32` |
| GRPCPlugin interface | `GRPCPlugin` interface with `GRPCServer()` and `GRPCClient()` methods | `plugin.go:36-46` |
| Client struct | `Client` manages plugin subprocess lifecycle | `client.go:89-118` |
| ClientConfig | `ClientConfig` struct with all plugin configuration | `client.go:142-277` |
| ServeConfig | `ServeConfig` struct for server-side plugin serving | `server.go:62-104` |
| ClientProtocol interface | `ClientProtocol` interface with `Dispense()`, `Ping()`, `Close()` | `protocol.go:38-48` |
| ServerProtocol interface | `ServerProtocol` interface with `Init()`, `Config()`, `Serve()` | `protocol.go:20-36` |
| Protocol enum | `Protocol` type with `ProtocolNetRPC` and `ProtocolGRPC` | `protocol.go:11-18` |
| HandshakeConfig | `HandshakeConfig` for version negotiation | `server.go:35-55` |
| PluginSet | `PluginSet` map type for plugin registration | `server.go:57-59` |
| MuxBroker | `MuxBroker` for stream multiplexing on net/rpc | `mux_broker.go:32-38` |
| GRPCBroker | `GRPCBroker` for gRPC connection brokering | `grpc_broker.go:262-280` |
| ReattachConfig | `ReattachConfig` for plugin reattachment | `client.go:296-315` |
| BasicError | `BasicError` wrapper for cross-RPC error transmission | `error.go:10-12` |
| GRPCServer | `GRPCServer` struct for gRPC-based plugin serving | `grpc_server.go:39-67` |
| GRPCClient | `GRPCClient` struct for gRPC-based plugin connection | `grpc_client.go:93-102` |
| GRPCStdio service | gRPC stdio streaming service proto definition | `internal/plugin/grpc_stdio.proto:13-20` |
| StdioData message | StdioData message with STDOUT/STDERR channels | `internal/plugin/grpc_stdio.proto:24-32` |
| grpcController | gRPC controller service for shutdown | `internal/plugin/grpc_controller.pb.go:26-27` |
| Runner interface | `Runner` interface for custom subprocess execution | `runner/runner.go:7-14` |
| Discover function | `Discover()` for plugin binary discovery | `discover.go:19-30` |

## Answers to Protocol Questions

**1. What is the core abstraction: runtime, provider, session, turn, workflow, task, or something else?**

The core abstraction is **plugin-as-subprocess**. The host creates a `Client` that launches a plugin binary as a subprocess and communicates with it over RPC (net/rpc or gRPC). The plugin implements `Plugin` or `GRPCPlugin` and calls `plugin.Serve()`. There is no session, turn, workflow, or task abstraction. The fundamental unit is the plugin interface implementation dispensed through `ClientProtocol.Dispense()` (`client.go:445`, `protocol.go:43-44`).

**2. What is the minimal caller-facing API needed to start, send, stream, stop, and inspect a run?**

- **Start**: `NewClient(config *ClientConfig)` then `client.Start()` or `client.Client()` (`client.go:392-440`, `client.go:580-948`)
- **Send/Dispense**: `ClientProtocol.Dispense(name string)` returns the interface implementation (`protocol.go:43-44`)
- **Stream stdout/stderr**: `GRPCStdio` service streams data (`grpc_stdio.go:50-83`); net/rpc uses `SyncStreams()` (`rpc_client.go:103-113`)
- **Stop**: `Client.Kill()` (`client.go:498-572`)
- **Inspect**: `Client.Exited()`, `Client.ID()`, `Client.Protocol()`, `ClientProtocol.Ping()` (`client.go:478-482`, `client.go:126-137`, `client.go:1093-1105`, `protocol.go:46-47`)

There is no structured event stream, JSON output, or result shape beyond the dispensed interface. AI agent output would be captured as stdout/stderr via the stdio channel.

**3. Which runtime-specific concepts leak through the public API, and are they acceptable?**

Runtime-specific concepts that leak:
- **Protocol selection** (`ProtocolNetRPC` vs `ProtocolGRPC`) is exposed in `ClientConfig` (`client.go:219`), `ReattachConfig` (`client.go:300`), and the handshake negotiation (`server.go:373-411`)
- **TLS configuration** (`TLSConfig *tls.Config`, `AutoMTLS bool`) is exposed in `ClientConfig` (`client.go:177-250`) — runtime transport security is caller-controlled
- **Port range** (`MinPort`, `MaxPort`) for plugin communication (`client.go:187-190`) — TCP-based addressing leaks
- **Unix socket configuration** (`UnixSocketConfig`) leaks OS-specific details (`client.go:279-294`, `constants.go:7-13`)
- **Yamux** stream multiplexing for net/rpc (`mux_broker.go:14-16`) — connection multiplexing is visible
- **GRPCBroker multiplexing** via `PLUGIN_MULTIPLEX_GRPC` env var (`constants.go:15`) — multiplexed gRPC is configured via environment
- **Magic cookie** handshake (`MagicCookieKey`, `MagicCookieValue`) (`server.go:49-54`) — a UX feature that validates plugin intent

These leaks are NOT acceptable for a general AI SDK because they expose subprocess/RPC mechanics that OpenCode or other runtimes would not use. An OpenCode wrapper should not expose port ranges or yamux multiplexing.

**4. How are structured events and final outputs represented?**

They are NOT represented. go-plugin has no concept of structured events. Final outputs are:
- The dispensed interface returned by `Dispense()` — whatever the plugin author defined
- Stdout/stderr streamed via `GRPCStdio.StreamStdio()` or net/rpc `SyncStreams()`
- Errors wrapped in `BasicError` (`error.go:10-12`) for cross-RPC transmission

There is no JSON event schema, no structured metadata, no artifact representation.

**5. How are metadata fields represented for provider, model, token usage, cost, timings, and source runtime?**

They are NOT represented. go-plugin has no metadata fields for:
- Provider (e.g., OpenAI, Anthropic)
- Model name or version
- Token usage or cost
- Timings or latency
- Source runtime identification

These would need to be layered on top by a higher-level SDK.

**6. How does the design leave room for OpenCode, Codex, Claude Code, ACP, and direct LLM providers?**

The design does NOT leave room for these. go-plugin is a plugin subprocess host system, not a runtime abstraction. Its `Plugin`/`GRPCPlugin` interfaces are designed for interface dispatch, not for AI agent sessions. The library has no concept of:
- AI agent sessions or turns
- LLM provider configuration
- Structured JSON event streams (e.g., SSE, JSON lines)
- Request/response shaping for AI inference
- Cancellation based on model tokens or context windows

To use go-plugin for OpenCode, one would need to build an entirely new abstraction layer on top. The existing API cannot support a second runtime without redesigning the caller.

## Architectural Decisions

- **Two transport protocols**: The library supports `net/rpc` (legacy) and `gRPC` (`protocol.go:11-18`). This dual-protocol design adds complexity but enables cross-language plugin support via gRPC (`grpc_server.go:34-36`).
- **Plugin interface pattern**: Plugin authors implement `Plugin` (net/rpc) or `GRPCPlugin` (gRPC), creating a `Server()` that returns an RPC server and a `Client()` that returns the interface stub (`plugin.go:24-46`). This pattern is interface-based and flexible.
- **Subprocess lifecycle management**: `Client` fully manages the plugin subprocess: spawning, port selection, handshake negotiation, stdout/stderr capture (`client.go:580-948`). The host cannot easily swap in a different runtime (e.g., an in-process LLM API).
- **Version negotiation**: Plugins declare protocol versions via `VersionedPlugins` map. The handshake validates compatibility (`server.go:145-222`). This is a form of schema versioning but is not JSON-schema-based.
- **Broker pattern for multiplexed streams**: `MuxBroker` (net/rpc) and `GRPCBroker` (gRPC) allow plugins to open additional streams by unique ID (`mux_broker.go:52-76`, `grpc_broker.go:303-366`). This enables bidirectional communication but adds complexity.
- **mTLS auto-negotiation**: `AutoMTLS` generates one-time certificates for mutual TLS (`client.go:229-250`, `mtls.go`). This is a security feature that couples the client to the subprocess lifecycle.

## Notable Patterns

- **Handshake-based protocol negotiation**: Plugin and host agree on protocol version via stdout handshake line (`server.go:426-445`, `client.go:834-943`). The format is `coreVersion|protoVersion|network|address|protocol|cert[|multiplexFlag]`.
- **Interface-based plugin registration**: PluginSet maps string names to `Plugin` instances (`server.go:57-59`). Dispensing by name (`protocol.go:43-44`) allows multiple plugin types in one binary.
- **gRPC service auto-registration**: For gRPC plugins, the library auto-registers health, reflection, broker, controller, and stdio services (`grpc_server.go:78-99`). The plugin author only registers their own service.
- **Stdio streaming via dedicated gRPC service**: Stdout/stderr are streamed via `GRPCStdio` service (`grpc_stdio.go:50-83`), separate from the main plugin interface.
- **Runner abstraction**: `Runner` interface (`runner/runner.go:7-14`) allows custom subprocess execution, enabling reattachment and non-standard process management.

## Tradeoffs

- **Subprocess model is non-negotiable**: go-plugin ONLY supports plugins as external subprocesses. There is no mechanism to use it with an in-process LLM API, a local model server, or a cloud API. This is a fundamental constraint.
- **No structured events**: AI agent runs produce messages, artifacts, and metadata. go-plugin captures only stdout/stderr and interface return values. A wrapper would need to add event serialization.
- **Protocol leakage**: Callers must know whether they are using net/rpc or gRPC (`ClientConfig.AllowedProtocols`, `ReattachConfig.Protocol`). This is a low-level transport detail.
- **No cancellation semantics**: `Kill()` is the only stop mechanism (`client.go:498-572`). There is no graceful cancel-by-token or cancel-by-timeout for individual dispensation calls.
- **No provider/model abstraction**: The library has zero concept of AI providers or models. A wrapper SDK would need to add this entirely.
- ** yamux and gRPC multiplexing add complexity**: The broker mechanisms are powerful but add significant API surface area and potential failure modes (e.g., `grpc_broker.go:469-499` knock handshake for multiplexing).

## Failure Modes / Edge Cases

- **Handshake timeout**: If plugin doesn't output the handshake line within `StartTimeout`, an error is returned (`client.go:830-831`). The error message includes diagnostic output from `runner.Diagnose()`.
- **Protocol version mismatch**: If `CoreProtocolVersion` (`server.go:33`) doesn't match, the plugin is rejected (`client.go:861-867`). Error message instructs recompilation.
- **Graceful vs forced kill**: `Kill()` first attempts graceful Close via the client protocol, then waits 2 seconds, then force-kills (`client.go:530-567`). This can leave zombie-like states if the protocol Close() hangs.
- **Stdio blocking**: If the caller doesn't consume the stdio stream, the plugin process can block on stdout (`grpc_stdio.go:189-193`). The client starts stdio streaming but if the caller doesn't read, backpressure occurs.
- **gRPC broker multiplexing handshake**: The knock-based handshake for multiplexed gRPC can timeout (`grpc_broker.go:494-495`) and returns a cryptic error about "multiplexing knock handshake".
- **AutoMTLS with reattach**: `AutoMTLS` is explicitly incompatible with `Reattach` (`client.go:249-250`), and the error is only caught at startup.
- **Magic cookie validation**: Plugins without the correct `MagicCookieKey/MagicCookieValue` output a friendly error and exit (`server.go:259-266`). This prevents accidental direct execution.

## Future Considerations

- **Structured event schema**: A future version could add a structured event schema for stdout/stderr with timestamps and channel metadata, replacing the raw byte streaming.
- **Session abstraction**: Adding a `Session` concept that groups multiple dispensation calls and tracks metadata (provider, model, tokens, cost) would align better with AI agent use cases.
- **Cancellation tokens**: A context-based cancellation mechanism for individual plugin dispensation calls would improve composability.
- **gRPC reflection for schema discovery**: Already enabled (`grpc_server.go:85`), could be leveraged for dynamic interface discovery in a wrapper SDK.

## Questions / Gaps

- **No AI runtime concepts**: The library has no concept of sessions, turns, messages, or structured outputs for AI agent workflows.
- **No JSON event streaming**: There is no SSE, JSON lines, or similar mechanism for streaming structured data from plugins.
- **No metadata fields**: Provider, model, token usage, cost, and timing metadata are entirely absent.
- **No cancellation beyond Kill()**: The only cancellation mechanism is subprocess termination. There is no per-call cancellation.
- **Protocol-versioned plugins only**: The versioning system is for plugin protocol versions, not for API stability or AI runtime schemas.
- **Subprocess-only design**: There is no mechanism to use go-plugin with an in-process API (e.g., calling an OpenAI-compatible API directly). Any OpenCode wrapper would need a completely different execution model.

---

Generated by `study-areas/01-runtime-contract-and-api-shape.md` against `go-plugin`.