# Repo Analysis: k9s

## IO Abstraction & Testability

### Repo Info

| Field | Value |
|-------|-------|
| Name | k9s |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/k9s` |
| Group | `06-io-abstraction` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

k9s is a Kubernetes CLI (TUI-based) that uses a hybrid approach to IO abstraction. While some components abstract IO via interfaces (e.g., `io.Writer` for log output, `Logger` interface for log operations), significant portions of the codebase directly use `os.Stdout`, `os.Stderr`, and raw `os.OpenFile` calls. The project provides a mock testing framework (`internal/config/mock/test_helpers.go`) for basic configuration and connection mocking, but lacks a comprehensive IO abstraction layer for true terminal-free unit testing.

## Rating

**4/10** — Some abstractions exist for certain subsystems (logging via `io.Writer`, Kubernetes client via `Connection` interface), but stdout/stderr and filesystem access are frequently hardcoded. Most commands cannot be unit tested without a real terminal.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Direct stdout usage | `os.Stdout` used in clipboard write check | `internal/view/clipboard.go:66` |
| Direct stdout usage | `os.Stdout.WriteString(seq)` for OSC52 clipboard | `internal/view/clipboard.go:102` |
| Direct stderr usage | `cmd.Stderr = os.Stderr` for shell execution | `internal/view/exec.go:599` |
| IO Writer abstraction | `Log.ansiWriter io.Writer` field | `internal/view/log.go:46` |
| IO Writer abstraction | `Dump(w io.Writer)` method on Config | `internal/config/data/config.go:51` |
| IO Writer abstraction | `Drain(path, opts, w io.Writer)` method | `internal/dao/types.go:97` |
| IO Writer abstraction | `dump(w io.Writer)` method on vul table | `internal/vul/table.go:105` |
| Stream abstraction | `strings.Builder` used in render helpers | `internal/render/helpers.go:129` |
| Logger interface | `Logger interface { Logs(...) }` defined | `internal/dao/types.go:157-160` |
| Connection interface | `Connection` interface for K8s client | `internal/client/types.go:89-143` |
| Mock testing helpers | `mockConnection`, `mockKubeSettings` provided | `internal/config/mock/test_helpers.go:120-184` |
| Mock testing helpers | `NewMockConfig(t)` helper for tests | `internal/config/mock/test_helpers.go:40-57` |
| Colorable output | `colorable.NewColorableStdout()` used for output | `cmd/root.go:48` |
| Network mockability | `mockConnection.Dial()` returns nil client | `internal/config/mock/test_helpers.go:140-142` |
| Network mockability | `Connection.Dial()` interface method | `internal/client/types.go:100` |
| Direct filesystem | `os.ReadFile`, `os.WriteFile`, `os.OpenFile` scattered | Multiple files |
| Direct filesystem | `ensureDir()` uses `os.MkdirAll` directly | `internal/view/log.go:434` |
| Direct exec streams | Shell commands use `os.Stdin, os.Stdout, os.Stderr` directly | `internal/view/exec.go:283, 558, 574, 599, 605` |

## Answers to Protocol Questions

### 1. Is stdout/stderr abstracted?

**Partially.** The codebase uses `colorable.NewColorableStdout()` (`cmd/root.go:48`) instead of raw `os.Stdout`, which provides ANSI color support and is testable to some degree. However:

- `os.Stdout` is still used directly in clipboard operations (`internal/view/clipboard.go:102`)
- Shell execution (`internal/view/exec.go`) directly assigns `os.Stdin, os.Stdout, os.Stderr` to command objects
- The `isTTY()` check at `clipboard.go:66` examines `os.Stdout` directly to detect terminal

### 2. Can commands be tested without a real terminal?

**Limited.** The project has mock helpers (`internal/config/mock/test_helpers.go`) and test helpers like `mockTableModel` that implement `ui.Tabular`. However:

- The TUI framework (tview) requires a real terminal for most view tests
- Clipboard functions check `isTTY(os.Stdout)` and bail if not a terminal
- Shell execution commands use raw `os.Stdin/Stdout/Stderr`
- No `io.Writer` abstraction is provided for capturing command output in tests

### 3. Is filesystem access abstracted?

**No.** Filesystem access is direct throughout the codebase:

- `os.ReadFile` at `internal/config/views.go:102`, `internal/config/styles.go:775`, `cmd/info.go:62`, etc.
- `os.WriteFile` at `internal/config/files.go:259, 272, 285`
- `os.OpenFile` at `internal/view/log.go:445`, `internal/view/yaml.go:80`
- No filesystem interface or abstraction layer detected

### 4. Is network access mockable?

**Yes (for Kubernetes API).** The `Connection` interface (`internal/client/types.go:89-143`) abstracts Kubernetes API access, and `mockConnection` (`internal/config/mock/test_helpers.go:120-184`) provides a no-op implementation for testing. However:

- Network mocking is specific to Kubernetes client operations
- No generic HTTP client abstraction exists
- Port forwarding (`internal/watch/forwarders.go`) uses real `portforward` package directly

## Architectural Decisions

1. **TUI-centric design**: k9s is built as a terminal user interface using `tview`. This fundamentally constrains testability because the UI layer requires a terminal. Most "commands" are interactive views, not CLI commands with injectable output streams.

2. **Kubernetes client abstraction via Connection interface**: The `Connection` interface (`internal/client/types.go:89-143`) provides a clean abstraction over Kubernetes API operations, enabling mock implementations for testing.

3. **Selective IO abstraction**: Some subsystems do abstract IO:
   - Log dumping uses `io.Writer` parameter (`internal/vul/scan.go:24`)
   - Drain operations accept `io.Writer` (`internal/dao/types.go:97`)
   - Config dump uses `io.Writer` (`internal/config/data/config.go:51`)

4. **colorable for output**: Using `colorable.NewColorableStdout()` instead of raw stdout provides ANSI color support but doesn't enable capture for testing.

## Notable Patterns

- **`Connection` interface**: Abstracts all Kubernetes API operations with `Dial()`, `DialLogs()`, `MXDial()`, `DynDial()` methods — enables test doubles via `mockConnection`
- **`Logger` interface**: `internal/dao/types.go:157` defines a `Logger` interface for log operations
- **Structured logging with slog**: Uses standard library `log/slog` throughout
- **Mock testing helpers**: `internal/config/mock/test_helpers.go` provides `NewMockConfig`, `mockConnection`, `mockKubeSettings` for test setup

## Tradeoffs

1. **TUI vs Testability**: Building as a TUI makes k9s highly interactive but severely limits unit testing of UI components. Integration tests require a real terminal.

2. **No filesystem abstraction**: Direct `os.ReadFile`/`os.WriteFile` calls throughout make it impossible to test file operations with in-memory files.

3. **Limited stdout/stderr abstraction**: The `colorable` package wraps stdout but doesn't provide a way to capture output for assertions.

4. **Shell execution bypasses abstraction**: Shell commands at `internal/view/exec.go:283, 558, 574, 599, 605` directly assign `os.Stdin/Stdout/Stderr`, making them untestable without a real terminal.

## Failure Modes / Edge Cases

- Clipboard operations fail gracefully when not a TTY (`clipboard.go:66-71`), but this is detection rather than abstraction
- Shell command execution will fail or misbehave in non-terminal environments
- File operations have no error simulation in tests
- No buffering mechanism for capturing UI output in tests

## Future Considerations

1. **Inject output streams**: Pass `io.Writer` parameters to UI rendering functions to enable output capture
2. **Filesystem interface**: Define a `FileSystem` interface for IO operations to enable in-memory file testing
3. **Separate UI from logic**: Extract business logic from view components to enable testing without UI
4. **Command pattern for shell execution**: Abstract shell execution behind an interface for testability

## Questions / Gaps

- No evidence of a `Console` or `Output` interface for abstracting terminal output
- No evidence of filesystem abstraction beyond direct `os` calls
- No evidence of test helpers for capturing stdout/stderr output
- No evidence of injectable HTTP clients for external API calls