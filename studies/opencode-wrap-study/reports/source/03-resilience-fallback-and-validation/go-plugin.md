# Repo Analysis: go-plugin

## Resilience, Fallback, and Validation

### Repo Info

| Field | Value |
|-------|-------|
| Name | go-plugin |
| Path | `/home/antonioborgerees/coding/opencode-wrap-study/repos/go-plugin` |
| Group | `go-plugin` |
| Language / Stack | Go |
| Analyzed | 2026-05-17 |

## Summary

go-plugin is a Go library for building plugin hosts and plugins over gRPC or net/rpc. It implements a handshake-based protocol negotiation, secure config validation with checksums, graceful process exit with force-kill fallback, and a ping-based health check mechanism. The system has explicit error types for common failure modes (checksum mismatch, process not found, protocol version incompatibility) and degrades gracefully when optional services (like stdio streaming) are unavailable from older plugins. However, retry/backoff logic is minimal—timeouts exist but retry policies are not composable—and there is no structured event validation beyond JSON log parsing.

## Rating

**6/10** — Basic retries/validation with limited classification

The system has typed errors (`error.go:10-27`), bounded timeouts (5-second window for most operations), graceful degradation for unavailable services (`grpc_stdio.go:109-112`), and checksum-based binary validation (`client.go:334-357`). However, retry policies are not composable, error classification is minimal (no explicit transient vs. unrecoverable distinction), and partial progress/resume mechanisms are limited to process reattach rather than checkpoint/resume.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Startup validation - magic cookie | `MagicCookieKey` and `MagicCookieValue` checked for emptiness | `server.go:249-256` |
| Startup validation - cookie verify | Environment variable check for cookie value | `server.go:258-265` |
| Startup validation - protocol version | `checkProtoVersion()` validates protocol compatibility | `client.go:1028-1053` |
| Startup validation - protocol allowlist | `AllowedProtocols` list enforced | `client.go:910-921` |
| Health check - gRPC | `grpc_health_v1.Check()` for liveness | `grpc_client.go:127-133` |
| Health check - gRPC registration | `health.SetServingStatus()` registers service | `grpc_server.go:78-82` |
| Graceful exit - attempt then force kill | 2-second wait for graceful exit, then `runner.Kill()` | `client.go:554-567` |
| Graceful degradation - stdio unavailable | Falls back to no-op when `Unavailable/Unimplemented` | `grpc_stdio.go:109-112` |
| Error type - BasicError | RPC-safe error wrapper | `error.go:10-27` |
| Error types - typed errors | `ErrProcessNotFound`, `ErrChecksumsDoNotMatch`, `ErrSecureConfigNoChecksum`, `ErrSecureConfigNoHash`, `ErrSecureConfigAndReattach`, `ErrGRPCBrokerMuxNotSupported` | `client.go:45-73` |
| Version fallback | Falls back to lowest version if no match | `server.go:215-221` |
| Checksum validation | `SecureConfig.Check()` with constant-time compare | `client.go:334-357` |
| Timeout - broker accept | 5-second timeout on `MuxBroker.Accept()` | `mux_broker.go:61` |
| Timeout - grpc broker knock | 5-second timeout on multiplexed handshake | `grpc_broker.go:495` |
| Timeout - stream wait | 5-second timeout on stream acceptance | `mux_broker.go:183-204` |
| JSON log parsing | `parseJSON()` validates hclog JSON format | `log_entry.go:37-76` |
| JSON log fallback | Falls back to plain text on parse failure | `client.go:1228` |
| Process reattach validation | `pidWait()` checks process liveness | `internal/cmdrunner/process.go:14-24` |
| Reattach validation | `reattachFunc` validates process before returning runner | `internal/cmdrunner/cmd_reattach.go:17-40` |
| Non-blocking send - broker | `select` with `default` case prevents deadlock | `grpc_broker.go:598` |
| Protocol line validation | 7-part format validation for protocol messages | `server.go:424-446` |

## Answers to Protocol Questions

### 1. Which failures are considered unrecoverable, transient, retryable, or fallbackable?

**Unrecoverable:**
- Checksum mismatch (`ErrChecksumsDoNotMatch` at `client.go:53`) — binary tampered or wrong file
- Missing hash in `SecureConfig` (`ErrSecureConfigNoHash` at `client.go:61`)
- Empty checksum (`ErrSecureConfigNoChecksum` at `client.go:57`)
- Empty magic cookie key/value (`server.go:249-256`) — misconfigured plugin
- Magic cookie mismatch (`server.go:258-265`) — plugin loaded outside authorized host

**Transient/Retryable:**
- gRPC connection timeout (5-second timeout in `grpc_broker.go:495`)
- Broker stream acceptance timeout (5-second timeout in `mux_broker.go:61`)
- Plugin startup timeout (`client.go:825-831`)
- Graceful exit timeout: 2-second wait before force kill (`client.go:559`)

**Fallbackable:**
- Protocol version mismatch: falls back to lowest version (`server.go:215-221`)
- Stdio service unavailable (`codes.Unavailable` or `codes.Unimplemented`): falls back to no-op (`grpc_stdio.go:109-112`)
- Reattach to dead process: validated via `pidWait()` before returning runner (`internal/cmdrunner/process.go:14-24`)

**No explicit retryability classification system exists.** Errors are not classified into categories (e.g., no `IsRetryable()` method). The system relies on the caller to decide.

### 2. How are retries configured, bounded, and reported to callers?

**Bounded timeouts:**
- Plugin start timeout: configurable via `ClientConfig.StartTimeout` (default not visible in source, but `time.After()` used at `client.go:825`)
- Stream acceptance: 5-second hardcoded in `mux_broker.go:61`
- Multiplexing knock handshake: 5-second hardcoded in `grpc_broker.go:495`
- Graceful exit: 2-second hardcoded in `client.go:559`

**No retry loops:** The system does not implement automatic retry with backoff. Operations either succeed, timeout (caller decides retry), or fail permanently.

**Reported to callers:** Errors are returned directly from function calls. There is no structured retry metadata (e.g., `RetryAfter` field). `Ping()` returns the raw gRPC health check error (`grpc_client.go:127-133`).

### 3. How would the system express compositions like retry, fallback, retry, validate, repair?

**It cannot.** There is no composition mechanism. The library provides discrete primitives:
- `Ping()` for health checking
- `Kill()` with graceful-then-force fallback
- `SecureConfig.Check()` for checksum validation
- Protocol version negotiation with lowest-version fallback

These cannot be composed into policy chains. Caller must implement any multi-step recovery logic externally.

### 4. How are rate limits surfaced and handled?

**No rate limit handling exists.** No evidence of rate limit detection, backoff, or throttling in the codebase.

### 5. How are malformed JSON events, missing final events, empty streams, or partial outputs detected?

**Malformed JSON:** `parseJSON()` at `log_entry.go:37-76` catches `json.Unmarshal` errors and returns them. Caller can choose to fall back to plain text (`client.go:1228`).

**Missing final events / empty streams:** No explicit detection. gRPC `Recv()` returning `io.EOF` or `Unavailable` is handled in `grpc_stdio.go:137-139`, but no structured "run incomplete" flag is set.

**Partial outputs:** No checkpoint or run resume mechanism. The `MuxBroker` tracks streams in maps (`mux_broker.go:30-43`), but these are connection-level, not run-level. Process reattach (`cmd_reattach.go`) validates process existence but does not preserve run state.

### 6. What metadata is preserved for debugging, cost estimation, and later synthesis?

**Logging metadata:** JSON log entries include `@message`, `@level`, `timestamp`, and key-value pairs (`log_entry.go:12-17`).

**Connection metadata:** `GRPCBroker` tracks `clientStreams` and `serverStreams` maps (`grpc_broker.go:262-280`) for open connections.

**Process metadata:** `runner.ID()` and `runner.Kill()` for process lifecycle tracking.

**No cost estimation metadata.** No run duration tracking, token counting, or session state export.

## Architectural Decisions

1. **RPC-safe error wrapping** — `BasicError` at `error.go:10-27` exists solely to transport errors across net/rpc channels where `error` is an interface.

2. **Graceful-then-force Kill** — `Kill()` at `client.go:498-572` attempts `Close()` + 2-second wait before force-killing, ensuring plugins a chance to clean up.

3. **Protocol version fallback** — Server returns lowest version if no client version matches (`server.go:215-221`), enabling backward compatibility without complex negotiation.

4. **gRPC health check integration** — Plugins register a gRPC health service (`grpc_server.go:78-82`) enabling standard liveness probes via `grpc_health_v1.Check()` (`grpc_client.go:127-133`).

5. **Stdio degradation** — Old plugins lacking stdio service return `Unimplemented`; the client catches this and continues without stdio syncing (`grpc_stdio.go:109-112`).

## Notable Patterns

- **Timeout-with-default channel receive** (`mux_broker.go:183-204`): `select` with `time.After` for bounded waits, cleanup channel if timeout fires.
- **Non-blocking channel send** (`grpc_broker.go:598`): `select` with `default` prevents broker deadlocks when receiver is slow.
- **Checksum validation** (`client.go:334-357`): `subtle.ConstantTimeCompare` prevents timing attacks on checksums.
- **Deferred cleanup with recover** (`client.go:742-750`): Kills plugin process if panic occurs during startup.

## Tradeoffs

| Decision | Benefit | Cost |
|----------|---------|------|
| Hardcoded 5-second timeouts | Simplicity, predictability | Cannot adapt to slow plugins or networks |
| No retry loops | Simple, no thundering herd | Caller must implement all retry logic |
| Graceful-then-force kill | Gives plugins cleanup chance | Adds 2+ seconds to every kill |
| Protocol version fallback | Backward compatibility | Oldest plugin version dictates capability floor |
| Stdio fallback to no-op | Works with older plugins | Silent degradation may hide issues |

## Failure Modes / Edge Cases

- **Plugin starts but has no address** (`client.go:527-528`): `Kill()` checks `addr != nil` before calling `Close()` — force kill without graceful attempt.
- **gRPC multiplexing mismatch** (`ErrGRPCBrokerMuxNotSupported` at `client.go:72`): No automatic fallback; requires config change or plugin update.
- **Protocol version incompatibility** (`checkProtoVersion` at `client.go:1028-1053`): Returns error but no suggestion for resolution.
- **Process exits before reattach validation** (`cmd_reattach.go`): `pidWait()` uses 1-second polling with no upper bound — could wait indefinitely if process is zombies.
- **TCP port exhaustion** (`server.go:536-575`): Range-based port allocation with retry, but no clear upper bound on retry count visible.

## Future Considerations

- Explicit retry policy API (backoff, max attempts, retryable error classifier)
- Checkpoint/resume for long-running plugin sessions
- Rate limit detection and automatic throttling
- Structured run metadata export (duration, events, cost signals)
- Circuit breaker for plugin health

## Questions / Gaps

- **No retry classification**: Errors are not annotated with retry metadata; caller cannot programmatically determine if an error is transient.
- **No backoff policy**: No exponential backoff, jitter, or caller-configurable retry delays.
- **No checkpoint/resume**: Failed runs cannot be inspected or resumed; only full process reattach is available.
- **No rate limit handling**: No evidence of HTTP 429 or similar handling.
- **Minimal observability**: No structured run logs, event streams, or cost tracking beyond JSON stderr parsing.
- **5-second hardcoded timeouts**: Timeout values are scattered hardcoded constants rather than configurable policy.

---

Generated by `study-areas/03-resilience-fallback-and-validation.md` against `go-plugin`.