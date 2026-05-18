# Repo Analysis: yq

## IO Abstraction & Testability

### Repo Info

| Field | Value |
|-------|-------|
| Name | yq |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/yq` |
| Group | `yq` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

yq demonstrates **partial IO abstraction**. Output streams are well-abstracted via `io.Writer` interfaces passed through cobra's `cmd.OutOrStdout()`, enabling test capture. Input is abstracted through `io.Reader` interfaces in decoders. However, stderr is hardcoded via `os.Stderr` for logging, and filesystem access uses direct `os.Open` calls with limited abstraction. The project has extensive tests that use in-memory buffers effectively.

## Rating

**6/10** — Some abstractions present, but stderr and filesystem are not fully mockable.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| `io.Writer` abstraction | `Encode` method takes `io.Writer` | `pkg/yqlib/encoder.go:13` |
| `io.Reader` abstraction | `Decoder` interface uses `io.Reader` | `pkg/yqlib/decoder.go:7-8` |
| `PrinterWriter` interface | `singlePrinterWriter` wraps `io.Writer` | `pkg/yqlib/printer_writer.go:16-24` |
| Stdout via cobra | `cmd.OutOrStdout()` used in eval commands | `cmd/evaluate_sequence_command.go:67` |
| Stderr hardcoded | `os.Stderr` in logger initialization | `pkg/yqlib/logger.go:18` |
| Filesystem direct | `os.Open(filename)` in readStream | `pkg/yqlib/utils.go:42` |
| bufio.Reader usage | `bufio.NewReader(os.Stdin)` | `pkg/yqlib/utils.go:38` |
| Test buffer capture | `bufio.NewWriter(&output)` in tests | `pkg/yqlib/printer_test.go:38` |
| Strings.Builder usage | `var sb strings.Builder` | `pkg/yqlib/operator_strings.go:49` |
| Colorize via io.Writer | `writer.Write()` in colorizeAndPrint | `pkg/yqlib/color_print.go:65` |

## Answers to Protocol Questions

### 1. Is stdout/stderr abstracted?

**Partially.** stdout is abstracted via `cmd.OutOrStdout()` in cobra commands (`cmd/evaluate_sequence_command.go:67`, `cmd/evaluate_all_command.go:60`), which returns `os.Stdout` by default but can be redirected. All encoders accept `io.Writer`, enabling in-memory capture.

**However**, stderr is hardcoded: the logger initializes with `slog.NewTextHandler(os.Stderr, ...)` (`pkg/yqlib/logger.go:18`), making stderr output non-mockable without replacing the global logger.

### 2. Can commands be tested without a real terminal?

**Yes.** The architecture supports terminal-free testing:

- `cmd.OutOrStdout()` allows capturing output to any `io.Writer`
- Encoders accept `io.Writer` — tests use `bytes.Buffer` (`pkg/yqlib/printer_test.go:38`)
- `NewSinglePrinterWriter(writer io.Writer)` (`pkg/yqlib/printer_writer.go:20`) enables direct writer injection
- The `string_evaluator.go` has `bufio.NewReader(strings.NewReader(input))` (`pkg/yqlib/string_evaluator.go:26`) for pure string evaluation

The extensive test suite in `pkg/yqlib/` demonstrates this — most tests use in-memory buffers rather than real terminals.

### 3. Is filesystem access abstracted?

**No.** Filesystem access is direct:

```go
// pkg/yqlib/utils.go:42
file, err := os.Open(filename)
```

The `readStream` function (`pkg/yqlib/utils.go:35-49`) returns `io.Reader`, but the concrete implementation uses `os.Open`. There's no interface abstraction for filesystem operations, no `fs.FS` usage, and no way to inject a test filesystem.

For writes, `multiPrintWriter` (`pkg/yqlib/printer_writer.go:55-86`) directly calls `os.Create(name)` and `os.MkdirAll`, making file output untestable without actual filesystem I/O.

### 4. Is network access mockable?

**N/A — no network access found.** yq is a local file processor; there is no HTTP client, no remote fetching, and no network operations in the codebase. The matches for "http.Client" in the grep were all documentation/README references, not implementation code.

## Architectural Decisions

1. **Cobra's output binding**: Uses `cmd.SetOut()` and `cmd.OutOrStdout()` (`cmd/root.go:70`) to route stdout through cobra's command context. This is idiomatic Go CLI design that enables test redirection.

2. **Encoder/Decoder interfaces**: The `Encoder` interface (`pkg/yqlib/encoder.go:12-17`) and `Decoder` interface (`pkg/yqlib/decoder.go:7-9`) abstract format handling. All encoders (YAML, JSON, XML, etc.) accept `io.Writer` and `io.Reader` respectively, enabling stream-based processing.

3. **Logger as global singleton**: `GetLogger()` returns a package-level logger initialized with `os.Stderr`. The `SetSlogger()` method (`pkg/yqlib/logger.go:38-41`) allows replacing the underlying logger but the interface doesn't expose a mockable output.

4. **PrinterWriter abstraction**: `PrinterWriter` interface (`pkg/yqlib/printer_writer.go:12-14`) abstracts output destinations, with `singlePrinterWriter` for regular output and `multiPrintWriter` for file-splitting. Both wrap `bufio.Writer`.

## Notable Patterns

1. **Stream-oriented processing**: `ReadDocuments(reader io.Reader, decoder Decoder)` (`pkg/yqlib/utils.go:57`) accepts `io.Reader` for input, allowing stdin, files, or in-memory buffers.

2. **Buffered output for performance**: `bufio.Writer` wrapping `io.Writer` (`pkg/yqlib/printer_writer.go:22`) provides buffered writes, with `GetWriter()` returning `*bufio.Writer` for batched output.

3. **Test helpers in `test/utils.go`**: Uses `bytes.Buffer` and `bufio.NewWriter` for capturing output diffs (`test/utils.go:16-23`).

4. **Front-matter handler with io.Reader**: `FrontMatterHandler` exposes `GetContentReader() io.Reader` (`pkg/yqlib/front_matter.go:13`), enabling content extraction without filesystem assumptions.

## Tradeoffs

1. **Logger singleton**: The global `Logger` with hardcoded stderr is simple but prevents mocking log output in tests.

2. **Direct os.Open**: While `readStream` returns `io.Reader`, the concrete filesystem access prevents filesystem mocking. Tests that test file handling require actual files on disk.

3. **No interface for filesystem**: Unlike projects that abstract `FS` or `FileSystem`, yq's multiPrintWriter directly calls `os.Create` and `os.MkdirAll` (`pkg/yqlib/printer_writer.go:74-78`), making file-output tests depend on real filesystem.

## Failure Modes / Edge Cases

1. **Logging output pollution**: Tests that capture stdout may still see stderr log messages if verbose logging is enabled (`pkg/yqlib/logger.go:18` hardcoded to stderr).

2. **File handle leaks**: `readDocuments` closes files on EOF (`pkg/yqlib/utils.go:75-76`) but only for `*os.File` types, not general `io.Reader`.

3. **Terminal detection**: `cmd/utils.go:48` calls `os.Stdout.Stat()` to check if stdout is a terminal — this could cause issues in certain test environments where stat fails.

4. **Buffered writer not flushed**: `singlePrinterWriter.bufferedWriter` (`pkg/yqlib/printer_writer.go:17`) must be explicitly flushed; if `GetWriter()` isn't called before output is read, buffered data may be lost.

## Future Considerations

1. Replace `os.Stderr` logger with injectable `io.Writer` to enable stderr capture in tests.

2. Introduce `FileSystem` interface to abstract `os.Open`/`os.Create` for test doubles.

3. Use `os.MkdirAll` replacement via `fs.FS` or similar to enable in-memory filesystem testing for the split-exp feature.

## Questions / Gaps

1. **No evidence found** for abstraction over `os.Getenv` — environment variable access is direct, though the `--security-disable-env-ops` flag (`cmd/root.go:213`) provides opt-out capability.

2. **No evidence found** for network client interfaces or HTTP mocking — network access simply doesn't exist in this codebase.

3. **Limited evidence** for filesystem abstraction beyond `io.Reader` return type — the `multiPrintWriter` is the main area where filesystem mocking would benefit tests.

---
Generated by `study-areas/06-io-abstraction.md` against `yq`.