# Repo Analysis: go-task

## IO Abstraction & Testability

### Repo Info

| Field | Value |
|-------|-------|
| Name | go-task |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/go-task` |
| Group | `go-task` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

go-task demonstrates excellent IO abstraction through its `Executor` struct which accepts `io.Reader`/`io.Writer` streams via functional options. The `Output` interface pattern enables testable output formatting. However, filesystem access is spread across multiple locations with varying patterns, and network access for remote Taskfiles is only mockable via interfaces at the Taskfile reading level.

## Rating

**8/10** — Most side effects isolated. The `Executor` accepts `Stdin`, `Stdout`, `Stderr` as injectable streams, and there is a `Prompter` interface for IO. Network operations use `Reader` interface abstractions. Filesystem operations use `Node` interface but direct `os` calls still appear in `fsext/fs.go`. The `WithAssumeTerm` option and `SyncBuffer` test helper demonstrate testability design.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Executor IO fields | `Executor.Stdin`, `Executor.Stdout`, `Executor.Stderr` as `io.Reader`/`io.Writer` fields | `executor.go:60-62` |
| IO functional options | `WithStdin()`, `WithStdout()`, `WithStderr()`, `WithIO()` options | `executor.go:541-593` |
| Output interface | `Output` interface with `WrapWriter()` method | `internal/output/output.go:12-14` |
| Output implementations | `Interleaved`, `Group`, `Prefixed` output style implementations | `internal/output/interleaved.go:9-12`, `internal/output/group.go`, `internal/output/prefixed.go` |
| Test buffer helper | `SyncBuffer` type for capturing output in tests | `executor_test.go:146-151` |
| Prompter interface | `Prompter` struct with `Stdin`, `Stdout`, `Stderr` fields for interactive input | `internal/input/input.go:25-29` |
| Executor default IO | Defaults to `os.Stdin`, `os.Stdout`, `os.Stderr` in `NewExecutor()` | `executor.go:96-98` |
| Command execution IO | `RunCommandOptions` accepts `Stdin`, `Stdout`, `Stderr` writers | `internal/execext/exec.go:29-31` |
| Command execution passed to executor | `execext.RunCommand()` receives executor's IO streams | `task.go:414-423` |
| Logger IO | `Logger` struct with `Stdin`, `Stdout`, `Stderr` io.Reader/io.Writer fields | `internal/logger/logger.go:132-140` |
| Node interface for filesystem | `Node` interface with `Read()`, `Location()` methods for Taskfile reading | `taskfile/node.go` |
| RemoteNode interface | `RemoteNode` interface for HTTP/Git-based Taskfiles with `ReadContext()` | `taskfile/node_http.go:16-20` |
| Checker interface | `StatusCheckable` and `SourcesCheckable` interfaces for fingerprint abstraction | `internal/fingerprint/checker.go:9-19` |
| Mock checker | `MockStatusCheckable` and `MockSourcesCheckable` generated mocks | `internal/fingerprint/checker_mock.go:28-175` |
| Taskfile Reader option injection | `Reader` accepts functional options for config injection | `taskfile/reader.go:38-85` |

## Answers to Protocol Questions

### 1. Is stdout/stderr abstracted?

**Yes.** The `Executor` struct (`executor.go:59-62`) exposes `Stdin io.Reader`, `Stdout io.Writer`, `Stderr io.Writer` as fields. These are set via functional options:
- `WithStdin(stdin io.Reader)` at `executor.go:541-551`
- `WithStdout(stdout io.Writer)` at `executor.go:553-564`
- `WithStderr(stderr io.Writer)` at `executor.go:566-577`
- `WithIO(rw io.ReadWriter)` at `executor.go:579-593` (sets all three to same source)

In `NewExecutor()` (`executor.go:94-98`), these default to `os.Stdin`, `os.Stdout`, `os.Stderr`.

When running commands, the executor's IO streams are passed to `execext.RunCommand()` at `task.go:420-422`.

### 2. Can commands be tested without a real terminal?

**Yes.** The test infrastructure uses `SyncBuffer` (`executor_test.go:146`) to capture output, and `WithStdout`/`WithStderr` options to redirect output. Tests use `WithInput()` option to simulate stdin input (`executor_test.go:79-89`).

The `WithAssumeTerm(bool)` option (`executor.go:401-412`) explicitly exists for testing terminal-related behavior without a real TTY.

The `Logger.Prompt()` method (`logger.go:189-217`) checks `term.IsTerminal()` and returns `ErrNoTerminal` when not in a terminal, allowing tests to handle non-terminal scenarios gracefully.

### 3. Is filesystem access abstracted?

**Partial.** The `Node` interface (`taskfile/node.go`) abstracts Taskfile reading with `Read()` and `Location()` methods. Implementations include:
- `node_file.go` — local file system access
- `node_git.go` — Git-based remote Taskfiles
- `node_http.go` — HTTP-based remote Taskfiles
- `node_cache.go` — Caching layer for remote Taskfiles

However, `internal/fsext/fs.go` uses direct `os.Getwd()`, `os.Stat()`, `os.MkdirAll()` calls without abstraction (`fs.go:29-33`, `fs.go:124-127`, `fs.go:310-311` in `task.go`).

The `checker_mock.go` provides mock implementations of `StatusCheckable` and `SourcesCheckable` interfaces for fingerprinting, enabling testing of task up-to-date checks without real filesystem operations.

### 4. Is network access mockable?

**Yes, at the Taskfile reading level.** The `Reader` struct (`taskfile/reader.go:43-57`) uses `RemoteNode` interface to read remote Taskfiles. The `readRemoteNodeContent()` method (`taskfile/reader.go:473-577`) handles caching and download with configurable options.

The `Reader` accepts functional options like `WithOffline()`, `WithDownload()`, `WithTrustedHosts()` that affect network behavior. The `WithPromptFunc()` option allows custom handling of trust prompts.

However, once a Taskfile is loaded, network operations during task execution (e.g., HTTP checks in fingerprinting) are not separately mockable beyond the `StatusCheckable` interface.

## Architectural Decisions

1. **Functional options pattern for Executor configuration** — The `Executor` struct uses the functional options pattern (`executor.go:20-24`) allowing callers to inject IO streams and other dependencies. This enables testability without breaking existing API consumers.

2. **Output interface for formatting** — The `Output` interface (`output.go:12-14`) with `WrapWriter()` method allows different output formatting strategies (interleaved, prefixed, grouped) to be injected. This separates output rendering from execution logic.

3. **Node interface hierarchy for Taskfile sources** — The `Node` interface hierarchy (`taskfile/node.go`) with `RemoteNode` specialization enables different sources (local file, Git, HTTP) to be loaded through a unified interface. This makes testing remote Taskfile loading possible without actual network access.

4. **Separation of Logger and Executor** — The `Logger` (`logger.go:132-140`) is a separate struct that receives IO streams independently from the `Executor`. This allows logging to be tested in isolation.

## Notable Patterns

- **IO stream injection**: `Executor` receives IO streams at construction time via options, enabling tests to provide `bytes.Buffer` or `strings.Builder` for capture.

- **Output wrapper pattern**: The `Output.WrapWriter()` method (`output/output.go:13`) returns wrapped stdout/stderr writers plus a close function, allowing output to be captured or transformed before reaching the actual streams.

- **Interface-based fingerprinting**: `StatusCheckable` and `SourcesCheckable` interfaces (`fingerprint/checker.go:9-19`) enable different fingerprinting strategies (timestamp, checksum, none) to be tested via mocks.

- **Test helper buffer**: `SyncBuffer` in `executor_test.go` provides a thread-safe buffer for capturing test output, used in conjunction with `goldie` for fixture-based assertion.

## Tradeoffs

1. **Filesystem abstraction incomplete** — While `Node` interface handles Taskfile reading, the `fsext` package uses direct `os` calls. This means some filesystem-dependent behavior cannot be easily mocked in tests.

2. **Logger has direct IO dependencies** — The `Logger` struct is instantiated in `cmd/task/task.go:25-30` with direct `os.Stdout`/`os.Stderr` references. While the `Executor` is highly testable, error reporting before executor creation uses hardcoded streams.

3. **Network mockability limited to Taskfile loading** — Network operations are mockable only at the Taskfile reading level via `RemoteNode`. Task-level network checks in commands are not abstracted through interfaces.

4. **AssumeTerm flag for testing** — The `AssumeTerm` boolean on both `Executor` (`executor.go:49`) and `Logger` (`logger.go:139`) exists specifically to bypass terminal detection in tests. This is a pragmatic solution but adds conditional logic to the production code path.

## Failure Modes / Edge Cases

- **IO stream closed prematurely**: If the `CloseFunc` returned by `Output.WrapWriter()` is not properly handled, output may not be flushed. The code at `task.go:424-426` shows proper handling with error logging.

- **Non-terminal prompt handling**: `Logger.Prompt()` at `logger.go:195` checks `term.IsTerminal()` and returns `ErrNoTerminal` when no terminal is detected. If tests don't account for this, interactive prompts will fail.

- **Offline mode with uncached remote Taskfiles**: `Reader.readRemoteNodeContent()` at `taskfile/reader.go:488-491` returns `TaskfileCacheNotFoundError` when in offline mode and no cache exists. This is a controlled failure mode.

- **Concurrent Taskfile reading**: The `Reader` uses `errgroup.Group` for parallel Taskfile loading (`reader.go:316`), with thread-safe graph operations protected by mutex (`reader.go:372-373`).

## Future Considerations

1. **Extract filesystem interface**: Consider abstracting `fsext` operations behind an interface to enable complete filesystem mocking in tests.

2. **Command-level network abstraction**: Consider interface-based network client injection for task commands that make HTTP calls, similar to the `StatusCheckable` pattern.

3. **Error output injection**: Currently error reporting in `cmd/task/task.go` creates its own `Logger` with hardcoded streams. Consider passing the executor's logger or making error output equally injectable.

## Questions / Gaps

- **No evidence found** for a `Fs` interface or abstraction in the main executor path. The `fsext` package is utility code, not an abstraction layer.

- **Prompt behavior in tests**: The `Prompter` type in `internal/input/input.go` is a concrete implementation that wraps `bubbletea`. While it accepts IO streams, testing it would require understanding the Bubble Tea framework integration.

---

Generated by `study-areas/06-io-abstraction.md` against `go-task`.