# Repo Analysis: age

## IO Abstraction & Testability

### Repo Info

| Field | Value |
|-------|-------|
| Name | age |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/age` |
| Group | `age` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Age is a file encryption CLI that uses `io.Reader`/`io.Writer` interfaces for core encryption/decryption operations, enabling testability. However, the main command (`cmd/age/age.go`) directly uses `os.Stdout`/`os.Stderr` for UI output through module-level functions in `tui.go`, and `os.Stdin`/`os.Open` for file input, making full command-level testing require script-based test frameworks rather than simple in-memory buffers. The plugin system has a well-designed `ClientUI` interface for mocking user interactions, and the core library accepts `io.Reader`/`io.Writer` for streams.

## Rating

**6/10** — Some abstractions present. Core crypto operations use interfaces; CLI UI layer hardcodes terminal/output.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Stream abstraction | `encrypt()`/`decrypt()` accept `io.Reader`/`io.Writer` | `cmd/age/age.go:411`, `cmd/age/age.go:486` |
| Stream abstraction | `age.Encrypt()`/`age.Decrypt()` use `io.Reader`/`io.Writer` | `age.go:421`, `age.go:503` |
| IO interface | `Plugin.SetIO()` allows injecting custom streams | `plugin/plugin.go:173-177` |
| IO interface | `ClientUI` struct for plugin-user interaction callbacks | `plugin/client.go:319-337` |
| IO interface | `Recipient`/`Identity` use `ClientUI` for interaction | `plugin/client.go:28-35`, `plugin/client.go:172-176` |
| Test helper | `testOnlyConfigureScryptIdentity` hook for scrypt work factor in tests | `cmd/age/age.go:409` |
| Test helper | `testOnlyFixedRandomWord` for deterministic passphrase generation | `cmd/age/age.go` (not shown, referenced at `age_test.go:25`) |
| Test helper | `testOnlyPluginPath` for injecting plugin location in tests | `plugin/client.go:424` |
| Test script | `testscript` framework for integration tests | `cmd/age/age_test.go:69-76` |
| Terminal abstraction | `term.WithTerminal()` for cross-platform TTY access | `internal/term/term.go:41-62` |
| Terminal abstraction | `term.IsTerminal()` for terminal detection | `internal/term/term.go:120-122` |
| Hardcoded output | `errorf()`/`warningf()`/`printf()` use `log.New(os.Stderr)` | `cmd/age/tui.go:31-45` |
| Hardcoded output | `errorWithHint()` exits via `os.Exit(1)` | `cmd/age/tui.go:47-54` |
| Filesystem | `os.Open()` and `os.Create()` used for file I/O | `cmd/age/age.go:245`, `cmd/age/age.go:572` |
| Network | Plugins communicate via stdin/stdout pipes to subprocesses | `plugin/client.go:426-472` |

## Answers to Protocol Questions

### 1. Is stdout/stderr abstracted?

**Partial.** The core encryption/decryption functions accept `io.Reader`/`io.Writer` parameters, allowing output to be redirected to in-memory buffers. However, the CLI's error and informational output (`errorf`, `warningf`, `printf`) is hardcoded via `log.New(os.Stderr, "", 0)` at `cmd/age/tui.go:31`. These functions cannot be injected with custom writers for testing; they always write to `os.Stderr`.

### 2. Can commands be tested without a real terminal?

**Yes for core logic, limited for CLI layer.** The core `encrypt()` and `decrypt()` functions (`cmd/age/age.go:411-519`) use `io.Reader`/`io.Writer` and can be tested with `bytes.Buffer`. The plugin system uses `ClientUI` callbacks that can be mocked. However, testing the full CLI flow requires the `testscript` framework (`cmd/age/age_test.go:69-76`) which executes real binaries. Terminal interaction functions (`term.ReadSecret`, `term.ReadPublic`, `term.ReadCharacter`) directly access `/dev/tty` or `CONIN$/CONOUT$` and cannot be easily mocked.

### 3. Is filesystem access abstracted?

**No.** File input/output uses direct `os.Open()` and `os.Create()` calls. The `lazyOpener` struct (`cmd/age/age.go:560-585`) wraps file creation lazily but is not an interface. There is no `FileSystem` interface for mocking file access in tests.

### 4. Is network access mockable?

**Indirectly via plugins.** Network access is not direct; age communicates with plugins via subprocess stdio pipes (`plugin/client.go:426-472`). The `exec.Command` call at `plugin/client.go:433` spawns plugin binaries, so plugins could be replaced with test doubles. The `testOnlyPluginPath` variable (`plugin/client.go:424`) allows injecting a custom plugin directory for testing, as demonstrated in `plugin/client_test.go:74-86`.

## Architectural Decisions

1. **UI output functions are module-level singletons.** The `printf`, `errorf`, and `warningf` functions in `tui.go` are package-level functions backed by a logger writing to `os.Stderr`. This prevents dependency injection and makes output verification in unit tests require capturing stderr.

2. **Core crypto library is cleanly abstracted.** The `filippo.io/age` library properly uses `io.Reader`/`io.Writer` for data streams, making the core encryption/decryption logic highly testable with in-memory buffers.

3. **Terminal interaction is separated into `internal/term`.** The `term` package handles cross-platform terminal access (`/dev/tty` on Unix, `CONIN$/CONOUT$` on Windows), but this is not abstracted via an interface—tests that need to simulate terminal input must use `testscript` or real TTYs.

4. **Plugin system uses a callback-based UI interface.** The `ClientUI` struct (`plugin/client.go:319-337`) provides an interface for plugins to request user input, making plugin interactions testable by providing mock callbacks.

5. **File I/O is tightly coupled to `os` package.** The CLI directly calls `os.Open()` and `os.Create()` without abstracting filesystem access, limiting testability of file-based operations.

## Notable Patterns

- **`lazyOpener`** (`cmd/age/age.go:560-585`): Defers file creation until first write, but implements `io.WriteCloser` interface rather than injecting a factory.

- **`ClientUI` callbacks** (`plugin/client.go:319-337`): Structured approach to plugin-user interaction via `DisplayMessage`, `RequestValue`, `Confirm`, and `WaitTimer` function fields.

- **`testOnly*` package-level function hooks** (`cmd/age/age.go:409`): Allow tests to inject test-specific behavior (e.g., reduced scrypt work factor) without changing production code paths.

- **`testscript` integration testing** (`cmd/age/age_test.go:69-76`): Uses `github.com/rogpeppe/go-internal/testscript` for scripting CLI interactions in `testdata/` files, enabling high-fidelity testing without a real terminal.

## Tradeoffs

- **Testability vs. simplicity:** Direct use of `os.Stdout`/`os.Stderr` in UI functions keeps the code simple but prevents true unit testing of output. The `testscript` framework compensates for integration testing but adds complexity.

- **Terminal access vs. portability:** The `term` package's direct access to `/dev/tty` and `CONIN$/CONOUT$` enables interactive prompts but makes automated testing of those paths difficult.

- **Plugin isolation:** Running plugins as subprocesses provides isolation and flexibility but introduces overhead and makes debugging more complex. The `ClientUI` interface helps but doesn't fully abstract the subprocess nature.

## Failure Modes / Edge Cases

- **Plugin binary not found:** `NotFoundError` is returned when plugin binary cannot be located (`plugin/client.go:466-468`), with a clear error message and wrapped `exec.ErrNotFound`.

- **Terminal detection failures:** `term.IsTerminal()` returns false for non-TTY inputs, causing the CLI to skip terminal-specific buffering logic (`cmd/age/age.go:253-262`). This could cause unexpected behavior in edge cases.

- **stdin multi-use prevention:** The `stdinInUse` singleton (`cmd/age/age.go:72`) prevents reading from stdin for multiple purposes, but this is a module-level boolean that could be problematic in concurrent scenarios.

- **Lazy file output:** The `lazyOpener` only reports errors on `Close()`, which happens in a `defer` after all writing is complete (`cmd/age/age.go:270-276`). Late error reporting could confuse users.

## Future Considerations

- **IO interface for UI output:** Introducing an `io.Writer` interface for `printf`/`errorf` output would enable capturing and verifying CLI output in unit tests.

- **Filesystem interface:** Abstracting file operations behind an interface (e.g., `type FileSystem interface { Open(name string) (io.ReadCloser, error); Create(name string) (io.WriteCloser, error) }`) would enable testing file-based scenarios without actual files.

- **Terminal interface:** A `Terminal` interface for `ReadSecret`/`ReadPublic`/`ReadCharacter` would enable testing interactive prompts with mock implementations.

## Questions / Gaps

- **No evidence found** for explicit interfaces around file I/O (no `FileSystem` interface, no `File` interface abstractions).

- **No evidence found** for network mocking beyond the plugin subprocess pattern (no HTTP client interfaces).

- The `testOnlyConfigureScryptIdentity` hook at `cmd/age/age.go:409` is a clever pattern for test injection but relies on package-level function variable assignment which has minor goroutine safety concerns.

---

Generated by `06-io-abstraction.md` against `age`.