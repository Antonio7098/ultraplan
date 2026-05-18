# Repo Analysis: age

## Concurrency & Async Patterns

### Repo Info

| Field | Value |
|-------|-------|
| Name | age |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/age` |
| Group | `08-concurrency` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Age is a file encryption CLI that processes data through a sequential pipeline with no concurrent goroutine spawning in the main encryption/decryption paths. Concurrency is limited to: (1) plugin subprocess communication with an optional 5-second WaitTimer callback fired in a goroutine, and (2) a single atomic.Pointer used for chunk caching in the random-access DecryptReaderAt. No structured concurrency primitives (errgroup, sync.WaitGroup) are used in production code. All I/O is synchronous and sequential.

## Rating

**3 / 10** — Functional but hard to reason about for concurrency needs. No goroutine chaos, but the project has essentially no concurrency design. Any future parallelization needs would require significant refactoring.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| goroutine launch (plugin WaitTimer) | `defer time.AfterFunc(5*time.Second, func() { c.WaitTimer(name) }).Stop()` in `readStanza` — the only goroutine spawn in production code | `plugin/client.go:394` |
| atomic usage | `atomic.Pointer[cachedChunk]` for chunk cache in random-access reader | `internal/stream/stream.go:354` |
| sync.OnceValue | `sync.OnceValue` used in test helper to cache build output | `cmd/age/age_test.go:54` |
| channels | `make(chan error, goroutines)` only in tests | `internal/stream/stream_test.go:782,818,863` |
| exec.Command | Plugin subprocess invocation via `exec.Command` | `plugin/client.go:433` |
| No WaitGroup/errgroup | No usage found in production code | — |
| No mutex | No usage found in production code | — |

## Answers to Protocol Questions

**1. Where are goroutines launched?**

Only one site: `plugin/client.go:394` in the `readStanza` function. When a `WaitTimer` callback is set and `r.ReadStanza()` blocks for more than 5 seconds, a goroutine fires `c.WaitTimer(name)` via `time.AfterFunc`. This is the sole goroutine spawn in production code.

**2. How are they coordinated?**

They are not coordinated. The WaitTimer callback fires and is forgotten — there is no synchronization mechanism waiting for or collecting results from it. There are no channels, WaitGroups, or errgroup patterns used to coordinate goroutines.

**3. How is cleanup handled?**

Plugin subprocess cleanup is done via `conn.Close()` (`plugin/client.go:82`) which closes the stdin/stdout pipes and waits for the subprocess to exit. The `clientConnection.close` function is defined at `plugin/client.go:403` and called via defer. For the WaitTimer goroutine, cleanup is handled implicitly by `time.AfterFunc(...).Stop()` — if the timer fires after the stanza is read, `.Stop()` prevents the callback from running.

**4. Are race conditions considered?**

Partially. The `DecryptReaderAt` uses an `atomic.Pointer[cachedChunk]` (`internal/stream/stream.go:354`) for the cache, which is a lock-free shared access pattern. However, there are no mutexes, no explicit race prevention for other shared state, and no use of Go's race detector in CI visible in the codebase. The primary data flow is sequential ( Encrypt → stream.NewEncryptWriter, Decrypt → stream.NewDecryptReader), avoiding many race scenarios by design.

## Architectural Decisions

- **Sequential pipeline by default**: Both Encrypt and Decrypt use simple sequential `io.Copy` patterns with streaming encryptors/decryptors. No parallelism is attempted in the main data path (`cmd/age/age.go:429`, `cmd/age/age.go:516`).
- **Plugin architecture uses subprocess isolation**: Plugins communicate over stdin/stdout pipes (`plugin/client.go:399-404`), keeping them fully isolated. This avoids shared-memory concurrency between the main process and plugins.
- **Random access reader uses atomic cache**: `DecryptReaderAt` (`internal/stream/stream.go:349-451`) uses `atomic.Pointer[cachedChunk]` to cache the most recently decrypted chunk, allowing concurrent `ReadAt` calls to share cached data without locking.

## Notable Patterns

- **Subprocess with timed callback**: Unique pattern at `plugin/client.go:392-397` where a long-running plugin call triggers an optional user-visible timer notification in a separate goroutine, with automatic cancellation via `AfterFunc(...).Stop()`.
- **Lock-free chunk cache**: `DecryptReaderAt` at `internal/stream/stream.go:409-445` uses `atomic.Load` and `atomic.Store` on a pointer, avoiding mutex overhead for the common case of sequential reads.
- **No structured concurrency**: No `errgroup`, no `sync.WaitGroup`, no channels for data flow — all production concurrency is single-point async fire-and-forget.

## Tradeoffs

- **Simplicity over throughput**: The sequential design is simple and correct but offers no parallelism for large file encryption. This is a deliberate choice — age is designed for CLI usage where files are typically modest size.
- **Plugin isolation over integration**: Using subprocess boundaries rather than in-process plugins eliminates goroutine management complexity but adds serialization overhead for plugin communication.
- **Atomic cache vs mutex**: Using `atomic.Pointer` for the chunk cache allows lock-free reads but means only one chunk is cached at a time (no multi-chunk prefetch).

## Failure Modes / Edge Cases

- **WaitTimer goroutine leak if callback never returns**: If `WaitTimer` blocks indefinitely, the goroutine is leaked. The `AfterFunc` is stopped on return from `readStanza`, but if `readStanza` itself never returns (e.g., hangs before reading), the timer fires and the goroutine runs the callback — with no mechanism to interrupt the blocking read.
- **Subprocess hang**: If a plugin subprocess hangs (never produces output, never exits), the `conn.Close()` at `plugin/client.go:82` will close pipes and the subprocess will receive SIGPIPE, but if the subprocess ignores SIGPIPE and continues, the connection may not terminate cleanly.
- **Atomic cache inconsistency**: If two `ReadAt` calls happen concurrently with different offsets that map to the same chunk, the last one to store wins — no staleness detection. This is acceptable because the cache stores complete decrypted chunks, not partial results.

## Future Considerations

- **Parallel encryption**: Adding `errgroup` to parallelize chunk encryption in `EncryptWriter` could improve throughput for large files with minimal API change.
- **Plugin connection pooling**: Currently each recipient plugin is a separate subprocess. A pool could reduce startup latency for multi-recipient encryption.
- **Multi-chunk cache**: The current single-chunk atomic cache could be extended to an LRU cache of multiple chunks for random-access patterns with more locality.

## Questions / Gaps

- **No explicit concurrency tests**: The concurrency tests in `internal/stream/stream_test.go` are testing stream operations via goroutines but not testing the plugin client's WaitTimer goroutine behavior.
- **No CI race detector**: No evidence of `go test -race` in the codebase workflow.
- **WaitTimer goroutine lifecycle**: The comment at `plugin/client.go:335` notes the WaitTimer "runs in a separate goroutine" but there is no documentation of what happens if the main operation completes before the timer fires — the `.Stop()` call handles it, but the edge case is not tested.