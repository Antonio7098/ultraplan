# Repo Analysis: age

## State & Context Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | age |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/age` |
| Group | `07-state-context` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

The age encryption tool is a stateless CLI with no `context.Context` usage, no cancellation handling, and no session modeling. Application state is minimal and passed through function parameters. This is appropriate for a short-running file encryption tool, but limits composability for long-running operations or pipeline use.

## Rating

**2/10** — No context propagation; no cancellation; minimal stateless design.

Rationale: The codebase explicitly avoids `context.Context` despite Go's standard pattern for cancellation and timeout. The CLI is fire-and-forget with no mechanism to interrupt long-running operations. This is acceptable for the tool's scope but represents a significant architectural gap for composability.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Context usage | No `context.Context` found in entire codebase (grep returned empty) | N/A |
| Main CLI | No context propagation; operates on io.Reader/Writer | `cmd/age/age.go:241-319` |
| Plugin client | No context; uses synchronous I/O over stdin/stdout | `plugin/client.go:78-103` |
| Stream encryption | No context; blocking I/O with no cancellation | `internal/stream/stream.go:63-108` |
| Key generation | No context; runs to completion | `cmd/age-keygen/keygen.go:129-155` |
| No cancellation | No signal handling, no graceful shutdown | `cmd/age/age.go:105-321` |

## Answers to Protocol Questions

### 1. How is `context.Context` propagated?

**No propagation.** `context.Context` is not used anywhere in the codebase. The grep search for `context\.Context` returned zero matches across all Go files.

All I/O operations use bare `io.Reader`/`io.Writer` interfaces without context support. See `age.Encrypt(dst io.Writer, recipients ...Recipient)` at `age/age.go:154` and `age.Decrypt(src io.Reader, identities ...Identity)` at `age/age.go:249`.

The plugin protocol (`plugin/client.go:78-103`) opens subprocess connections with no context deadline or cancellation support.

### 2. How is cancellation handled?

**It is not.** There is no signal handling, no graceful shutdown, and no cancellation propagation. Long-running encryption/decryption operations cannot be interrupted.

The `clientConnection.Close()` method at `plugin/client.go:475-481` sends `os.Interrupt` to the plugin process, but the CLI itself never handles interrupts for the main encryption flow.

### 3. Is application state centralized or per-command?

**Per-command (stateless).** There is no global application state. State flows through function parameters. The `main()` function in `cmd/age/age.go:105-321` parses flags and immediately delegates to `encrypt()` or `decrypt()` functions with no shared state.

Some package-level variables exist for coordination (e.g., `stdinInUse` at `cmd/age/age.go:72`), but these are minimal singletons for I/O coordination, not application state.

### 4. How are sessions modeled?

**They are not.** There is no session concept. Each invocation of `age` or `age-keygen` is independent. Files are encrypted/decrypted in a single pass with no concept of a session spanning multiple operations.

The plugin protocol (`plugin/client.go`) maintains no session state between calls—each `Wrap` or `Unwrap` operation is independent.

## Architectural Decisions

- **No context propagation**: All public APIs use bare `io.Reader`/`io.Writer` rather than `context.Context`. This makes the library unusable with Go's standard cancellation patterns.
- **Stateless by design**: The age file format is a single-pass encrypt/decrypt with no session concept. This matches the tool's purpose but limits composability.
- **Plugin subprocess model**: Plugin communication uses synchronous stdin/stdout with no timeouts or cancellation, relying on process lifecycle alone (`plugin/client.go:426-473`).

## Notable Patterns

- **Parameter state**: All state is passed as function parameters; no struct fields for application state
- **Lazy file opening**: `lazyOpener` at `cmd/age/age.go:560-585` defers file creation until first write
- **No global config**: Each command is self-contained with no shared configuration state

## Tradeoffs

| Tradeoff | Impact |
|----------|--------|
| No context.Context | Cannot use Go's standard cancel/timeout patterns; long operations cannot be interrupted |
| No cancellation | User cannot abort encryption/decryption mid-operation |
| Stateless design | Simple and predictable; but no pipeline support or composable workflows |
| Synchronous plugin I/O | Plugins cannot implement async operations; no timeout on plugin execution |

## Failure Modes / Edge Cases

- **Infinite read on corrupted input**: `stream.DecryptReader.Read` at `internal/stream/stream.go:71-108` will block indefinitely if input is truncated, with no cancellation possible.
- **Plugin subprocess leak**: If plugin communication hangs, there is no mechanism to terminate it short of process kill.
- **No timeout on passphrase prompt**: Terminal read at `internal/term/term.go` has no timeout; process hangs indefinitely if terminal input is unavailable.

## Future Considerations

- Add `context.Context` support to `Encrypt`/`Decrypt` public APIs for cancelable operations and timeouts.
- Implement signal handling for graceful shutdown during long operations.
- Add optional timeout for plugin subprocess execution.

## Questions / Gaps

- Why was `context.Context` explicitly avoided? Was this a deliberate design choice or an oversight?
- No evidence found for any timeout mechanism anywhere in the codebase. Is this intentional for simplicity, or a known limitation?

---

Generated by `study-areas/07-state-context.md` against `age`.