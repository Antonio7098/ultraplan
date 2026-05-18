# Repo Analysis: fzf

## IO Abstraction & Testability

### Repo Info

| Field | Value |
|-------|-------|
| Name | fzf |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/fzf` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

fzf is a terminal-based fuzzy finder with deep TTY/terminal coupling. The UI layer (`tui/`) abstracts terminal I/O into interfaces (`Renderer`, `Window`), but the core and proxy components use `os.Stdout`/`os.Stderr` directly in multiple places. Filesystem access is hardcoded via `os` package calls with no abstraction layer. Network access (HTTP server) uses the standard `net` package without mockable interfaces. The codebase has substantial unit tests for algorithmic and template behavior, but command-output and terminal rendering are not designed for in-memory unit testing without real terminals.

## Rating

**4/10** — Some abstractions exist (Tui Renderer/Window interfaces, `Printer` function field), but stdout/stderr are hardcoded in critical paths, filesystem I/O is unabstracted, and network calls cannot be replaced with test doubles. The design prioritizes terminal fidelity over testability.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Tui Renderer interface | `Renderer` interface defines `GetChar`, `Init`, `Close`, `Refresh`, etc. | `src/tui/tui.go:843-870` |
| Tui Window interface | `Window` interface with `Print`, `CPrint`, `Move`, etc. | `src/tui/tui.go:872-914` |
| LightRenderer uses tty directly | `LightRenderer.ttyin`/`ttyout` are `*os.File` fields, output goes to TTY via `flushRaw` | `src/tui/light.go:111-143` |
| Printer function field | `Options.Printer` is a `func(string)` field, configurable default uses `fmt.Println` | `src/options.go:648`, `src/options.go:781` |
| Direct os.Stdout usage in proxy | `proxy.go` uses `io.Copy(os.Stdout, outputFile)` for proxy output | `src/proxy.go:73` |
| Direct os.Stderr in become | `util_unix.go:Become()` writes become errors to `os.Stderr` directly | `src/util/util_unix.go:64` |
| Terminal.go execute command | Execute action sets `cmd.Stdout = os.Stdout`, `cmd.Stderr = os.Stderr` | `src/terminal.go:5422-5431` |
| History file I/O | `History` uses `os.ReadFile`/`os.WriteFile` directly, no interface | `src/history.go:28`, `src/history.go:64` |
| Reader uses os.Stdin directly | `Reader.readFromStdin()` passes `os.Stdin` to `feed()`, no abstraction | `src/reader.go:241-244` |
| TtyIn function | `tui.TtyIn()` opens `/dev/tty` directly, returns `*os.File` | `src/tui/light.go:163-166` |
| HTTP server is real net.Listener | `startHttpServer()` uses `net.Listen("tcp", ...)` and `net.Conn`, no mock interface | `src/server.go:81-145` |
| Reader command execution | `readFromCommand()` creates real subprocess via `executor.ExecCommand()` | `src/reader.go:385-413` |

## Answers to Protocol Questions

### 1. Is stdout/stderr abstracted?

**Partial.** The `Options.Printer` field (`src/options.go:648`) allows customizing the output function, defaulting to `fmt.Println` (`src/options.go:781`). However, critical paths bypass this abstraction:
- `proxy.go:73` — `io.Copy(os.Stdout, outputFile)` for proxy output
- `terminal.go:5422-5431` — Execute action sets `cmd.Stdout = os.Stdout`, `cmd.Stderr = os.Stderr`
- `util_unix.go:64` and `util_windows.go:124` — become errors go directly to `os.Stderr`
- `main.go:46` — exit errors go to `os.Stderr`

The TUI layer itself is abstracted through `Renderer`/`Window` interfaces, routing output through `ttyout` file handle, but this is a TTY device, not a general-purpose output stream.

### 2. Can commands be tested without a real terminal?

**No.** fzf is fundamentally a terminal application:
- `tui.LightRenderer` opens `/dev/tty` directly (`src/tui/light.go:163-166`)
- `terminal.go:973` — `ttyin` is opened from TTY device for input reading
- `util.IsTty(os.Stdin)` check at `src/reader.go:138` determines input source
- The `--filter` mode (`src/options.go:641`) provides non-interactive batch mode, but this still writes to stdout directly

Unit tests exist for algorithmic components (pattern matching, template processing, item handling) using pure in-memory data, but the core Terminal, Reader, and execution paths require a real TTY.

### 3. Is filesystem access abstracted?

**No.** Filesystem I/O is performed directly via `os` package calls:
- `history.go:28` — `os.ReadFile(path)` for history loading
- `history.go:64` — `os.WriteFile()` for history persistence
- `reader.go:270-383` — `fastwalk.Walk()` for directory traversal (os.DirEntry based)
- `proxy.go:54` — `os.TempDir()` and `mkfifo()` for named pipes
- `server.go:98` — `os.Stat()` and `os.Remove()` for socket file management
- `reader.go:241` — `os.Stdin` directly in `readFromStdin()`

No filesystem interface or abstraction layer exists for IO mockability.

### 4. Is network access mockable?

**No.** The HTTP server (`server.go`) is implemented with raw `net` package:
- `net.Listener` from `net.Listen("tcp", ...)` or `net.Listen("unix", ...)` (`src/server.go:100`, `src/server.go:107`)
- `net.Conn` for connections (`src/server.go:139`)
- No interface wrapping the listener or connection for test doubles
- `actionChannel` is the only testable channel — actions are sent here from the HTTP handler

The server is intentionally minimal ("simplistic HTTP server without using net/http") to reduce binary size (`src/server.go:147-152`), but this means no network abstraction for testing.

## Architectural Decisions

1. **TUI as Renderer/Window interfaces** (`src/tui/tui.go:843-914`): The rendering layer is nicely abstracted with `Renderer` and `Window` interfaces, allowing different implementations (fullscreen, light). This is the strongest IO abstraction in the codebase.

2. **Printer function field** (`src/options.go:648`): Output can be redirected via the `Printer` field, but this only applies to the print-query action and not to the main result output in proxy mode.

3. **Terminal fidelity over testability**: fzf prioritizes direct TTY access for correct terminal behavior. The `--filter` mode provides batch operation but still writes raw output.

4. **History via plain files** (`src/history.go`): History persistence is simple file I/O without abstraction.

5. **Minimal HTTP server without net/http** (`src/server.go:147-152`): The custom HTTP implementation saves ~2.4MB binary size but prevents using mockable network interfaces.

## Notable Patterns

1. **EventBox for async communication** (`src/util/eventbox.go`): Inter-thread communication via channel-based event box, decoupled from direct I/O
2. **Executor for shell commands** (`src/util/util_unix.go:16-20`): Command execution abstracted through `Executor` struct, but still spawns real processes
3. **Options struct as DI container**: Configuration passed through large `Options` struct, but printer/listener/output channels are optional fields
4. **TTy reuse** (`src/terminal.go:972`): `ttyin` is reused across multiple fzf invocations to avoid fd issues

## Tradeoffs

1. **Terminal coupling vs testability**: Direct TTY access (`/dev/tty`, `os.Stdin`) enables correct terminal behavior but prevents unit testing of the main interaction loop.

2. **Binary size vs abstractions**: Rejecting `net/http` saves ~2.4MB but eliminates ability to mock network layer for tests.

3. **Performance vs flexibility**: Reader uses `os.Stdin` directly for maximum performance, but this prevents pipe-based unit testing of input handling.

4. **History simplicity**: Plain file I/O for history is straightforward but offers no in-memory mocking for tests.

## Failure Modes / Edge Cases

1. **Non-interactive stdin**: When stdin is not a TTY (`reader.go:138`), fzf silently reads from stdin instead of invoking the default command, which may be unexpected in test contexts.

2. **Proxy output to non-terminal**: `proxy.go:73` copies directly to `os.Stdout` — if stdout is redirected in tests, the behavior differs from terminal mode.

3. **become subprocess stderr**: Errors from become subprocess go to `os.Stderr` (`util_unix.go:64`) with no capture mechanism.

4. **Terminal fd management**: `terminal.go:972` reuses global `ttyin` — closing behavior is known to cause issues ("invalid terminal state after exit").

5. **HTTP server timeout**: Server uses `SetReadDeadline` (`server.go:170`) which may cause flaky tests under slow CI.

## Future Considerations

1. **IO interfaces for testing**: Introduce `InputReader`, `OutputWriter`, `FileSystem` interfaces to enable in-memory test doubles
2. **Output channel in Runner**: Make the output mechanism injectable rather than `Printer` function field
3. **History interface**: Abstract `History` persistence for testable in-memory history
4. **Network listener interface**: Wrap `net.Listener` to enable mock HTTP server in tests
5. **Reader input abstraction**: Allow `Reader` to accept an `io.Reader` instead of hardcoding stdin detection

## Questions / Gaps

1. **No evidence of integration test suite for IO paths**: Searched for test files that mock stdout/stderr or filesystem — found none. All tests use in-memory data or real system calls.

2. **Is there a library mode?**: fzf appears to only support CLI invocation; no public API for embedding with injectable IO.

3. **Printer field is underutilized**: Only used by `actPrint` action (`terminal.go:405`); main result output bypasses it.

4. **Proxy vs terminal mode divergence**: Proxy mode (`proxy.go`) handles output differently from terminal mode, with less IO abstraction.

---
Generated by `study-areas/06-io-abstraction.md` against `fzf`.