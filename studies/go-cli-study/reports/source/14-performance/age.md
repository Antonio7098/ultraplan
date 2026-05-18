# Repo Analysis: age

## Performance & Resource Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | age |
| Path | `repos/age` |
| Group | `14-performance` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Age is a file encryption CLI with a focused, well-optimized core. The codebase prioritizes minimal startup overhead, efficient streaming, and controlled memory allocation. The encryption layer uses chunked STREAM-style encryption with 64KB chunks, enabling constant memory footprint regardless of file size. No profiling hooks exist, but the design is naturally amenable to benchmarking since the heavy work is deferred to library calls.

## Rating

**8/10** — Efficient and scalable. Would still feel good at 100x scale.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Lazy file open | `lazyOpener` defers `os.Create` until first Write | `cmd/age/age.go:560-585` |
| Deferred passphrase prompt | `lazyScryptIdentity` uses functional lazy initialization | `cmd/age/age.go:476-484` |
| Chunked encryption | `ChunkSize = 64 * 1024` (64KB chunks) | `internal/stream/stream.go:20` |
| Streaming encrypt writer | `EncryptWriter.Write` flushes only on full chunk | `internal/stream/stream.go:195-219` |
| Chunked decryption | `DecryptReader` reads and decrypts one chunk at a time | `internal/stream/stream.go:71-108` |
| Atomic cache | `DecryptReaderAt` uses `atomic.Pointer[cachedChunk]` | `internal/stream/stream.go:354` |
| No benchmarking | No `Benchmark` functions found | (searched all `*_test.go`) |
| No profiling | No `pprof` or profiling hooks found | (searched entire repo) |
| Eager recipient parsing | Recipients parsed before encryption starts | `cmd/age/age.go:351-393` |
| Identity file lazy open | `absPath` resolves paths eagerly but files opened on demand | `cmd/age/age.go:243-250` |

## Answers to Protocol Questions

### 1. Is startup fast?

**Yes.** The CLI defers expensive work wherever possible:
- File creation is deferred via `lazyOpener` (`cmd/age/age.go:560-585`)
- Passphrase prompt is deferred until needed via `lazyScryptIdentity` (`cmd/age/age.go:476-484`)
- Flag parsing is minimal and standard library
- No heavy initialization at startup; crypto operations start only when needed

### 2. Is memory usage controlled?

**Yes.** Chunked STREAM encryption ensures bounded memory:
- `ChunkSize = 64 * 1024` at `internal/stream/stream.go:20`
- `EncryptWriter` buffers at most one chunk before flushing (`internal/stream/stream.go:203-217`)
- `DecryptReader` holds at most one decrypted chunk in `r.unread` (`internal/stream/stream.go:52`)
- `DecryptReaderAt` uses an atomic single-chunk cache (`internal/stream/stream.go:354`)
- No `sync.Pool` usage, but chunk turnover is quick enough that GC pressure is minimal

### 3. Is streaming used instead of buffering?

**Yes.** Encryption and decryption both stream:
- `age.Encrypt` returns an `io.WriteCloser` that encrypts as data is written (`age.go:154-173`)
- `age.Decrypt` returns an `io.Reader` that decrypts as data is read (`age.go:249-266`)
- `io.Copy(w, in)` in `cmd/age/age.go:429` pumps data through the encryptor
- `io.Copy(out, r)` in `cmd/age/age.go:516` pumps data through the decryptor
- The only buffering is for TTY safety (see `bufferTerminalInput` at `cmd/age/age.go:257`) and output validation (`bytes.Buffer` at `cmd/age/age.go:278-284`)

### 4. Are large operations incremental?

**Yes.** The STREAM-based encryption chunks data into 64KB units:
- `EncryptWriter` accumulates up to one chunk, then flushes (`internal/stream/stream.go:241-255`)
- `DecryptReader` processes chunks incrementally via `readChunk()` (`internal/stream/stream.go:113-152`)
- `DecryptReaderAt` can read arbitrary offsets within the encrypted file with caching

## Architectural Decisions

1. **Library-first design**: The core encryption is in library code (`age.go`, `internal/stream/`, `internal/format/`), not in the CLI. The `cmd/age/` layer is thin, reducing startup overhead of the CLI itself.

2. **Chunked STREAM encryption**: Based on the STREAM construction (、抗 ChaCha20-Poly1305 with 64KB chunks). This keeps memory bounded at `O(1)` regardless of input size.

3. **No plugin subprocess spawning on startup**: Plugin binaries are only invoked when needed (`cmd/age/age.go:385-389`). No eager plugin discovery or pre-warming.

4. **Identity sorting**: Native identities (X25519, Hybrid, Scrypt) are sorted before plugin identities in `decryptHdr` (`age.go:324-341`), allowing fast-path rejection of irrelevant plugin invocations.

5. **lazyOpener for output**: Output file is not opened until first write (`cmd/age/age.go:270-276`), preventing empty file creation if the operation fails early.

## Notable Patterns

- **Functional lazy initialization**: `lazyScryptIdentity = &LazyScryptIdentity{passphrasePromptForDecryption}` (`cmd/age/age.go:521`) defers passphrase UI until actually needed.
- **Chunk-aligned nonces**: Each chunk uses an incrementing nonce derived from chunk index (`internal/stream/stream.go:154-169`).
- **Terminal-aware buffering**: Input from TTY is buffered for passphrase prompts (`cmd/age/age.go:253-261`), output to TTY is buffered to prevent binary corruption (`cmd/age/age.go:277-308`).
- **Single-chunk decryption cache**: `DecryptReaderAt` maintains a single `atomic.Pointer[cachedChunk]` for the most recently accessed chunk (`internal/stream/stream.go:354`).

## Tradeoffs

- **No persistent object pools**: No `sync.Pool` for buffer reuse. Each operation allocates its own buffers. For long-running processes handling many files, this could cause GC pressure, but for CLI invocations (the primary use case) this is not a concern.
- **No profiling hooks**: No `pprof` endpoints or benchmark harnesses. While this keeps the binary lean, it makes production performance debugging harder.
- **Scrypt work factor is fixed by default**: `workFactor: 18` in `scrypt.go:46` means ~1s per encryption. Decryption caps at `maxWorkFactor: 22` (`scrypt.go:129`), but there is no automatic scaling. For high-volume automated encryption, this could be a bottleneck.

## Failure Modes / Edge Cases

- **Truncated input**: `DecryptReader.readChunk` at `internal/stream/stream.go:121-124` correctly handles `io.ErrUnexpectedEOF` for incomplete final chunks.
- **Trailing data after end**: `DecryptReader.Read` at `internal/stream/stream.go:98-104` detects and rejects files with data after the logical end.
- **PowerShell mangled headers**: `crlfMangledIntro` and `utf16MangledIntro` at `cmd/age/age.go:440-441` detect common file corruption from PowerShell redirection.
- **Max work factor on decryption**: `ScryptIdentity.Unwrap` at `scrypt.go:185-186` rejects work factors above `maxWorkFactor`, preventing DoS via high iteration counts.
- **Empty passphrase rejection**: `NewScryptRecipient` at `scrypt.go:40-41` and `NewScryptIdentity` at `scrypt.go:124-125` both reject empty passphrases.

## Future Considerations

- A `sync.Pool` for chunk buffers in `DecryptReaderAt` could reduce allocations in bulk decryption scenarios.
- Adding benchmark tests (`*_test.go` with `func Benchmark*`) would enable regression detection in performance-sensitive paths.
- An optional `pprof` endpoint or `--profile` flag could aid production debugging without impacting default binary size.

## Questions / Gaps

- **No profiling hooks found**: Searched entire repo for `pprof`, `Benchmark`, `runtime profiler`. No evidence found. This is a gap for production performance debugging.
- **No automatic scrypt scaling**: The TODO at `scrypt.go:45` ("automatically scale this to 1s") remains unaddressed. For automated scenarios, this could cause unnecessary slowdowns or configurable work factors.

---

Generated by `study-areas/14-performance.md` against `age`.