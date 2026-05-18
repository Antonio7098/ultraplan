# Repo Analysis: restic

## IO Abstraction & Testability

### Repo Info

| Field | Value |
|-------|-------|
| Name | restic |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/restic` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

restic employs a layered, interface-driven approach to IO abstraction that enables comprehensive testability. The terminal layer uses a `ui.Terminal` interface with a concrete implementation (`termstatus.Terminal`) that wraps `io.Reader`/`io.Writer` streams passed at construction time. Filesystem access is fully abstracted via the `fs.FS` interface with a `fs.Reader` implementation for testing. Network/backend operations are backed by a `backend.Backend` interface with a `mem.MemoryBackend` for tests. Commands receive `ui.Terminal` as a parameter and progress reporters are constructed from it. The result is that every major subsystem—terminal output, filesystem traversal, and repository storage—is injectable and mockable. Test helpers in `internal/ui/backup/text_test.go:11-14` demonstrate this pattern: `ui.MockTerminal` is passed to `NewTextProgress` to capture output in unit tests.

## Rating

**8/10** — Most side effects isolated. The codebase consistently uses interfaces for IO contracts. Terminal, filesystem, and backend are all abstracted. A `MockTerminal` enables unit testing of UI components without a real terminal. The `fs.FS` interface and `backend.Backend` interface are the key abstractions. However, some global state (e.g., direct `os.Getenv` in `cmd_backup.go:64`) exists, and the backup command still uses `os.Hostname()` directly at `cmd/restic/cmd_backup.go:64` rather than injecting it. The `global.Options.Term` field carries the terminal, but not all side-effectful operations are routed through it.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| `ui.Terminal` interface | Defines `Print`, `Error`, `SetStatus`, `ReadPassword`, `OutputWriter`, `OutputRaw`, `OutputIsTerminal`, `InputRaw`, `InputIsTerminal`, `CanUpdateStatus` | `internal/ui/terminal.go:10-36` |
| `ui.MockTerminal` | In-memory terminal implementation for tests; stores `Output` and `Errors` as `[]string` | `internal/ui/mock.go:10-53` |
| `termstatus.Setup` | Takes `io.ReadCloser stdin, io.Writer stdout, io.Writer stderr` — streams injected, not global | `internal/ui/termstatus/status.go:69` |
| `termstatus.New` | Takes `rd io.ReadCloser, wr io.Writer, errWriter io.Writer` — all streams explicit | `internal/ui/termstatus/status.go:99` |
| `fs.FS` interface | Abstracts filesystem operations: `OpenFile`, `Lstat`, `Join`, `Separator`, `Abs`, `Clean`, `VolumeName`, `IsAbs`, `Dir`, `Base` | `internal/fs/interface.go:10-31` |
| `fs.Reader` | In-memory filesystem for tests; implements `FS` interface via static check at line 43 | `internal/fs/fs_reader.go:21-43` |
| `fs.File` interface | Abstracts open files: `MakeReadable`, `io.Reader`, `io.Closer`, `Readdirnames`, `Stat`, `ToNode` | `internal/fs/interface.go:36-52` |
| `backend.Backend` interface | Abstracts storage operations: `Save`, `Load`, `Remove`, `List`, `Stat`, `Close`, `Delete` | `internal/backend/backend.go:19-90` |
| `backend.Handle` struct | Identifies files in backend: `Type FileType, IsMetadata bool, Name string` | `internal/backend/file.go:43-47` |
| `mem.MemoryBackend` | In-memory backend implementation for tests | `internal/backend/mem/mem_backend.go:52-255` |
| `TestRepositoryWithBackend` | Creates repository with injectable backend for tests | `internal/repository/testing.go:49-55` |
| `NewTextProgress(term, verbosity)` | UI components constructed with injected terminal | `internal/ui/backup/text.go` |
| `runBackup(ctx, opts, gopts, term, args)` | Backup command receives `ui.Terminal` as parameter | `cmd/restic/cmd_backup.go:486` |
| `global.Options.Term` | Terminal carried in global options struct | `internal/global/global.go:69` |
| `backupFSTestHook` | Package-level test hook allowing FS injection for tests | `cmd/restic/cmd_backup.go:166` |
| `stderr` isolation | Error messages written to `errWriter` field, separate from `wr` | `internal/ui/termstatus/status.go:26` |
| `OutputWriter()` | Returns `io.Writer` safe for concurrent use with Print/Error/SetStatus | `internal/ui/termstatus/status.go:175-180` |
| `stdio_wrapper.go` lineWriter | Buffers output line-by-line before calling Print | `internal/ui/termstatus/stdio_wrapper.go:9-49` |
| `fs.NewReader` | Creates in-memory FS from `io.ReadCloser` for stdin backup | `internal/fs/fs_reader.go:45-96` |
| `newLineWriter` | Wraps Print function as `io.WriteCloser` for concurrent-safe output | `internal/ui/termstatus/stdio_wrapper.go:17-18` |
| `fs.NewCommandReader` | Wraps command execution for `stdin-from-command`; takes context and error handler | `internal/fs/fs_reader_command.go` |

## Answers to Protocol Questions

### 1. Is stdout/stderr abstracted?

**Yes.** The `ui.Terminal` interface at `internal/ui/terminal.go:10-36` abstracts all terminal IO. The concrete `termstatus.Terminal` at `internal/ui/termstatus/status.go:21-44` stores `wr io.Writer` and `errWriter io.Writer` as fields, injected at construction time via `New(stdin, stdout, stderr)` at line 99. This means stdout and stderr are not hardcoded to `os.Stdout`/`os.Stderr` — they are passed as parameters. Error output is routed to `errWriter` (`internal/ui/termstatus/status.go:235`), keeping stderr distinct from stdout.

### 2. Can commands be tested without a real terminal?

**Yes.** `ui.MockTerminal` at `internal/ui/mock.go:10-53` provides a test double that stores `Output` and `Errors` as `[]string`. The `createTextProgress()` helper at `internal/ui/backup/text_test.go:11-14` demonstrates usage: it creates a `MockTerminal`, passes it to `NewTextProgress`, then asserts on `term.Errors` and `term.Output`. Tests in `internal/ui/backup/text_test.go:17-27` verify error message formatting without any terminal. Commands like `runBackup` at `cmd/restic/cmd_backup.go:486` receive `ui.Terminal` as a parameter, making them testable with `MockTerminal`.

### 3. Is filesystem access abstracted?

**Yes.** The `fs.FS` interface at `internal/fs/interface.go:10-31` defines all filesystem operations. A concrete `fs.Local` type (not shown, but `fs.Reader` at `internal/fs/fs_reader.go:21-43` implements the interface via static check at line 43) provides the production implementation. For tests, `fs.Reader` provides an in-memory filesystem seeded from an `io.ReadCloser`. The `backupFSTestHook` at `cmd/restic/cmd_backup.go:166` allows tests to replace the filesystem. `fs.NewReader` at `internal/fs/fs_reader.go:45-96` creates a testable in-memory FS for stdin backup.

### 4. Is network access mockable?

**Yes.** The `backend.Backend` interface at `internal/backend/backend.go:19-90` abstracts all storage operations including network-based backends (S3, SFTP, etc.). The `mem.MemoryBackend` at `internal/backend/mem/mem_backend.go:52-255` is an in-memory implementation for tests. `TestRepositoryWithBackend` at `internal/repository/testing.go:49-55` creates a repository with a custom backend. The backend is passed to `repository.New` at `internal/repository/repository.go:125`, so network calls are fully injectable. Backend test hooks at `internal/global/global.go:72` (`BackendTestHook`, `BackendInnerTestHook`) provide additional test injection points.

## Architectural Decisions

1. **Terminal as injected dependency**: Commands receive `ui.Terminal` rather than using a global. The interface is defined at `internal/ui/terminal.go:10-36`, with the primary implementation at `internal/ui/termstatus/status.go:21-44`. This allows `MockTerminal` for tests and `termstatus.Terminal` for production.

2. **FS interface for filesystem abstraction**: The `fs.FS` interface at `internal/fs/interface.go:10-31` is the single abstraction point for all filesystem operations. This enables `fs.Reader` for in-memory test filesystems and `fs.Local` for production.

3. **Backend interface for repository storage**: `backend.Backend` at `internal/backend/backend.go:19-90` abstracts the storage layer. This allows `mem.MemoryBackend` for tests and multiple production backends (local, S3, SFTP, etc.) via the factory pattern in `internal/backend/location/`.

4. **UI progress reporters constructed from Terminal**: UI components like `NewTextProgress(term, verbosity)` and `NewJSONProgress(term, verbosity)` at `internal/ui/backup/text.go` and `internal/ui/backup/json.go` are constructed from the injected terminal, not a global. This keeps UI rendering fully testable.

5. **Backend wrapper chain for cross-cutting concerns**: `wrapBackend` at `internal/global/global.go:592-627` chains `logger.New`, `sema.NewBackend`, `retry.New`, and optional test hooks around the backend. This is applied after backend creation and allows behavior like rate limiting, retry, and debug logging to be composed declaratively.

6. **Stdin handled via fs.Reader**: When `opts.Stdin` is set at `cmd/restic/cmd_backup.go:592-612`, the stdin content is wrapped as `fs.Reader` and passed to the archiver as if it were a filesystem. This keeps the code path uniform and testable.

## Notable Patterns

- **Static interface compliance checks**: `var _ ui.Terminal = &Terminal{}` at `internal/ui/termstatus/status.go:16`, `var _ FS = &Reader{}` at `internal/fs/fs_reader.go:43`, and `var _ backend.Backend = &MemoryBackend{}` at `internal/backend/mem/mem_backend.go:24` ensure compile-time interface compliance.

- **Test hook for FS injection**: `var backupFSTestHook func(fs fs.FS) fs.FS` at `cmd/restic/cmd_backup.go:166` is a package-level variable allowing tests to replace the filesystem without modifying the command's signature.

- **In-memory backend factory**: `mem.NewFactory()` at `internal/backend/mem/mem_backend.go:27-43` registers the memory backend as a factory, enabling `mem://` URLs to be used in tests.

- **`lineWriter` for concurrent-safe output**: `internal/ui/termstatus/stdio_wrapper.go:9-49` wraps a Print function as an `io.WriteCloser`, buffering line-by-line and only releasing output on newlines. This allows concurrent calls to `Print` while ensuring atomic line output.

- **`TerminalCounterFactory` interface**: `internal/restic/repository.go:134-138` allows the repository to create progress counters that only display on real terminals, decoupling terminal awareness from repository operations.

## Tradeoffs

1. **Not all global state is abstracted**: `os.Hostname()` is called directly at `cmd/restic/cmd_backup.go:64` rather than being injectable. This means testing hostname behavior requires more involved test setups.

2. **Backend test hooks are global options**: `BackendTestHook` and `BackendInnerTestHook` at `internal/global/global.go:72` are part of `global.Options`, meaning test injection requires setting up a global options struct rather than passing a test double directly to the function under test.

3. **Memory backend has limitations**: `mem.MemoryBackend` at `internal/backend/mem/mem_backend.go:52-255` does not implement `HasAtomicReplace` (line 224 returns `false`), which could affect tests for atomic save semantics.

4. **Complex backend wrapping**: `wrapBackend` at `internal/global/global.go:592-627` chains multiple wrappers. The retry wrapper configured with `15*time.Minute` at line 615 could mask failures in tests if not carefully considered.

5. **VSS only on Windows**: The VSS (Volume Shadow Copy) integration at `cmd/restic/cmd_backup.go:496-589` is only available on `runtime.GOOS == "windows"`, meaning the corresponding filesystem abstraction cannot be tested on Linux/macOS.

## Failure Modes / Edge Cases

- **MockTerminal returns `nil` for `OutputWriter()`**: `MockTerminal.OutputWriter()` at `internal/ui/mock.go:43-45` returns `nil`, which would panic if used. The `OutputWriter()` method is only used in the `termstatus.Terminal` implementation for concurrent-safe buffered writing.

- **`fs.Reader` requires clean paths**: `readerCleanPath` at `internal/fs/fs_reader.go:98-100` requires paths to start with `/`. Feeding an unclean path results in an error at line 49.

- **`readerFile.Read` enforces non-empty data**: `readerFile.Read` at `internal/fs/fs_reader.go:219-231` returns `ErrFileEmpty` (line 217) if no data is read and `AllowEmptyFile` is not set. This could cause unexpected failures in tests that seed empty stdin.

- **`termstatus.runWithoutStatus` always prints newlines**: At `internal/ui/termstatus/status.go:350`, every status line gets `fmt.Fprintln(t.wr, strings.TrimRight(line, "\n"))` appended with a newline, regardless of whether the input already ended with one. This could affect output comparison in tests.

- **`canUpdateStatus` false for non-terminal output**: At `internal/ui/termstatus/status.go:120-128`, `canUpdateStatus` is only set when `terminal.CanUpdateStatus(d.Fd())` returns true. This means status-line-style updates are disabled for redirected output, which is correct behavior but differs from interactive mode.

## Future Considerations

- Consider extracting `os.Hostname()` calls into a `HostnameProvider` interface or passing it through `global.Options` for full injectability.

- The `BackendTestHook` and `BackendInnerTestHook` globals in `global.Options` could be replaced with constructor injection for cleaner test composition.

- Adding `io.Reader`/`io.Writer` interfaces (rather than concrete types) for the terminal stdin/stdout/stderr would make `termstatus.New` more flexible for testing scenarios requiring custom buffering.

- Consider adding additional test helpers for capturing output from `termstatus.Terminal` directly (not just via `MockTerminal`) to test the real terminal implementation's line buffering behavior.

## Questions / Gaps

- No evidence found of abstracted time (`time.Time` injection). Time-dependent behavior likely requires clock manipulation via environment or direct code modification.

- The `backend.Transport` function at `internal/global/global.go:549` creates HTTP transports, but the transport is not exposed as a mockable interface. Network-level testing of backend operations uses `mem.MemoryBackend` rather than intercepting real HTTP.

- No evidence of structured logging abstraction (e.g., `log/slog` or `zap`). Debug logging uses `debug.Log` which appears to be a package-level logger.

---

Generated by `study-areas/06-io-abstraction.md` against `restic`.