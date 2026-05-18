# IO Abstraction & Testability - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Protocol | `06-io-abstraction.md` |
| Groups | All groups |
| Date | 2026-05-15 |

## Repositories Studied

| # | Repo | Path | Group |
|---|------|------|-------|
| 1 | age | `repos/age` | age |
| 2 | chezmoi | `repos/chezmoi` | 06-io-abstraction |
| 3 | dive | `repos/dive` | 06-io-abstraction |
| 4 | fzf | `repos/fzf` | go-cli-study |
| 5 | gdu | `repos/gdu` | gdu |
| 6 | gh-cli | `repos/gh-cli` | gh-cli |
| 7 | go-task | `repos/go-task` | go-task |
| 8 | helm | `repos/helm` | go-cli-study |
| 9 | k9s | `repos/k9s` | 06-io-abstraction |
| 10 | lazygit | `repos/lazygit` | go-cli-study |
| 11 | mitchellh-cli | `repos/mitchellh-cli` | mitchellh-cli |
| 12 | opencode | `repos/opencode` | go-cli-study |
| 13 | rclone | `repos/rclone` | 06-io-abstraction |
| 14 | restic | `repos/restic` | go-cli-study |
| 15 | urfave-cli | `repos/urfave-cli` | 06-io-abstraction |
| 16 | yq | `repos/yq` | yq |

## Executive Summary

IO abstraction for testability is a spectrum across Go CLI projects. Elite projects (restic, gh-cli, gdu, go-task, mitchellh-cli) score 8/10 by providing injectable `io.Writer`/`io.Reader` streams, interface-based filesystem and network abstractions, and purpose-built test helpers. Mid-tier projects (chezmoi, helm, urfave-cli) score 6-7/10 with partial abstractions—stdout via parameters but hardcoded stderr in some paths. Weaker projects (fzf, k9s, opencode) score 3-4/10, using direct `os.Stdout`/`os.Stderr` and lacking filesystem/network abstractions. The fast heuristic—"Could I unit test commands without a real terminal?"—correctly identifies the tier: projects that pass `io.Writer` to commands enable buffer-based testing; those that don't require integration test frameworks or real terminals.

## Core Thesis

Go CLI testability hinges on whether side-effectful operations (stdout/stderr, filesystem, network) are injected as interfaces or passed as parameters rather than accessed directly via `os.*` calls. The most effective pattern combines: (1) `io.Writer`/`io.Reader` parameters at the command level, (2) interface abstractions for filesystem (`fs.FS`, `System`) and network (`backend.Backend`, `HTTPClient`), and (3) test helpers that provide in-memory implementations. Projects that hardcode `os.Stdout` in UI layers can still achieve high testability if the business logic sits behind injectable interfaces—which is why restic scores 8 despite using TUI components.

## Rating Summary

| Repo | Score | Approach | Main Strength | Main Concern |
|------|-------|----------|---------------|--------------|
| age | 6/10 | Interface + direct hybrid | Core crypto uses `io.Reader`/`io.Writer` cleanly | UI functions use `log.New(os.Stderr)` at `cmd/age/tui.go:31` |
| chezmoi | 7/10 | Config fields as IO handles | `System` interface with 8 implementations at `internal/chezmoi/system.go:25` | Template funcs bypass `c.stderr` at `internal/cmd/templatefuncs.go:296` |
| dive | 6/10 | afero + resolver interface | `afero.Fs` injection at `cmd/dive/cli/internal/command/adapter/exporter.go:20` | Docker CLI hardcodes `cmd.Stdout = os.Stdout` at `dive/image/docker/cli.go:27` |
| fzf | 4/10 | TUI interfaces + direct | `Renderer`/`Window` interfaces at `src/tui/tui.go:843-914` | `proxy.go:73` uses `io.Copy(os.Stdout, outputFile)` directly |
| gdu | 8/10 | UI interface + Writer injection | `UI` interface at `cmd/gdu/app/app.go:30-49`, tests use `bytes.Buffer` | TUI hardcodes `os.Stdout` at `cmd/gdu/app/app.go:102` |
| gh-cli | 8/10 | IOStreams + factory injection | `iostreams.Test()` at `pkg/iostreams/iostreams.go:551-568` provides in-memory buffers | Some commands use `os.Open` directly at `pkg/cmd/variable/set/set.go:237` |
| go-task | 8/10 | Executor with functional options | `WithStdout()`/`WithStderr()` at `executor.go:553-577`, `SyncBuffer` at `executor_test.go:146` | `fsext` uses direct `os.Getwd()`/`os.Stat()` at `internal/fsext/fs.go:29-33` |
| helm | 7/10 | Output writer per command | Commands accept `out io.Writer` at `pkg/cmd/install.go:132` | Kubernetes client created inside `Configuration.Init` at `pkg/action/action.go:664` |
| k9s | 4/10 | Selective + colorable | `Log.ansiWriter io.Writer` at `internal/view/log.go:46` | Shell execution uses raw `os.Stdin/Stdout/Stderr` at `internal/view/exec.go:599` |
| lazygit | 6/10 | OSCommand function injection | `ICmdObjRunner` interface at `pkg/commands/oscommands/cmd_obj_runner.go:18-23` | HTTP uses `http.Get` directly at `pkg/updates/updates.go:268` |
| mitchellh-cli | 8/10 | Ui interface + decorators | `Ui` interface at `ui.go:19-43`, `MockUi` with `syncBuffer` at `ui_mock.go:27-33` | Library scope excludes network/filesystem |
| opencode | 3/10 | Direct fmt throughout | LSP transport uses `io.Writer` at `internal/lsp/transport.go:16` | CLI output uses `fmt.Println` at `internal/app/app.go:156` |
| rclone | 6/10 | Operations accept io.Writer | `operations.List(ctx, f, w io.Writer)` at `fs/operations/operations.go:864` | Commands hardcode `os.Stdout` at `cmd/ls/ls.go:42` |
| restic | 8/10 | Terminal interface + FS + Backend | `ui.Terminal` at `internal/ui/terminal.go:10-36`, `fs.FS` at `internal/fs/interface.go:10-31`, `backend.Backend` at `internal/backend/backend.go:19-90` | `os.Hostname()` direct at `cmd/restic/cmd_backup.go:64` |
| urfave-cli | 7/10 | Writer/ErrWriter on Command | `Writer io.Writer` field at `command.go:85`, tests use `bytes.Buffer` | `tracef` writes to `os.Stderr` directly at `cli.go:47` |
| yq | 6/10 | Cobra's OutOrStdout | `cmd.OutOrStdout()` at `cmd/evaluate_sequence_command.go:67` | Logger uses `slog.NewTextHandler(os.Stderr)` at `pkg/yqlib/logger.go:18` |

## Approach Models

### 1. Interface-Based Layering (restic, gh-cli, gdu)

The most robust approach defines interfaces for each IO domain—terminal, filesystem, network—and passes concrete implementations at construction or invocation time. Restic's `ui.Terminal` interface (`internal/ui/terminal.go:10-36`) exemplifies this: commands receive `ui.Terminal` as a parameter, `MockTerminal` provides in-memory buffers for tests, and the `fs.FS` interface (`internal/fs/interface.go:10-31`) enables `fs.Reader` for in-memory filesystem testing. Gh-cli's `iostreams.IOStreams` (`pkg/iostreams/iostreams.go:49-54`) follows the same pattern with `System()` and `Test()` constructors producing real or in-memory streams respectively.

### 2. Functional Options with Stream Injection (go-task, mitchellh-cli)

Go-task's `Executor` struct accepts `Stdin`, `Stdout`, `Stderr` as fields set via `WithStdin()`, `WithStdout()`, `WithStderr()` functional options (`executor.go:541-577`). This approach is fluent for consumers and enables trivial test wiring: `Executor{...WithStdout(&bytes.Buffer{})}`. Mitchellh-cli's `Ui` interface (`ui.go:19-43`) with `BasicUi` and `MockUi` implementations uses a similar injection-via-constructor pattern.

### 3. Config-Struct IO Fields (chezmoi, helm, urfave-cli)

These projects attach IO streams to a configuration or command struct. Chezmoi's `Config` holds `stdin io.Reader`, `stdout io.Writer`, `stderr io.Writer` at `internal/cmd/config.go:279-281`. Helm's commands receive `out io.Writer` as a parameter. Urfave-cli's `Command` struct has `Writer` and `ErrWriter` fields (`command.go:85-87`). This pattern is idiomatic but requires discipline—template functions in chezmoi (`internal/cmd/templatefuncs.go:296`) and tracef in urfave-cli (`cli.go:47`) bypass these abstractions.

### 4. Partial Abstraction with Leaky UI (age, dive, rclone, yq)

These projects abstract core operations but leave UI output hardcoded. Age's core `encrypt()`/`decrypt()` use `io.Reader`/`io.Writer` at `cmd/age/age.go:411,486`, but `tui.go:31` uses `log.New(os.Stderr)`. Rclone's operations accept `io.Writer` (`fs/operations/operations.go:864`), but commands pass `os.Stdout` directly (`cmd/ls/ls.go:42`). Yq uses cobra's `OutOrStdout()` but logger initializes with `os.Stderr` at `pkg/yqlib/logger.go:18`.

### 5. TUI-Centric (fzf, k9s, lazygit)

TUI applications face inherent testability constraints because the UI layer requires terminal access. Fzf's `Renderer`/`Window` interfaces at `src/tui/tui.go:843-914` are well-designed but ultimately drive TTY devices. K9s uses `tview` which requires a real terminal. Lazygit's `ICmdObjRunner` interface (`pkg/commands/oscommands/cmd_obj_runner.go:18-23`) abstracts command execution, but interactive prompts in `app.go` read directly from `os.Stdin`. These projects compensate with integration test frameworks (fzf's testscript, lazygit's integration client) but cannot achieve unit-test-level output capture.

### 6. Minimal Abstraction (opencode)

Opencode uses direct `fmt.Printf` throughout (`internal/app/app.go:156`, `internal/format/spinner.go:72`). Tests verify behavior via return values, not output capture. This is the least testable pattern—adding an `IO` interface with `Stdout()`, `Stderr()` methods would be a significant improvement.

## Pattern Catalog

### Pattern: IOStreams with Test Constructor

**Problem**: How to provide real IO in production and in-memory buffers in tests without branching code.

**Solution**: Create an `IOStreams` struct with a `System()` constructor for production (returns real `os.Stdout`/`os.Stderr`) and a `Test()` constructor for tests (returns `bytes.Buffer` instances).

**Repos**: gh-cli (`pkg/iostreams/iostreams.go:478-523,551-568`), mitchellh-cli (`ui_mock.go` pattern), gdu (`stdout.CreateStdoutUI(output io.Writer)` at `stdout/stdout.go:45`)

**Evidence**:
- gh-cli `Test()` at `pkg/iostreams/iostreams.go:551-568`: returns `(io *IOStreams, in *bytes.Buffer, out *bytes.Buffer, errOut *bytes.Buffer)`
- gdu `CreateStdoutUI(output io.Writer)` at `stdout/stdout.go:45-58`

**When to use**: When building a CLI framework or application with multiple commands that all need IO access.

**When overkill**: Simple scripts or single-command tools where global state is acceptable.

### Pattern: Functional Options for IO Injection

**Problem**: How to make struct field injection ergonomic while maintaining backward compatibility.

**Solution**: Define `WithStdin(io.Reader)`, `WithStdout(io.Writer)`, `WithStderr(io.Writer)` as `Option` functions that modify the struct.

**Repos**: go-task (`executor.go:541-577`), helm (builder pattern via `ClientOptWriter`)

**Evidence**:
- go-task `WithStdout` at `executor.go:553-564`: sets `e.Stdout = stdout`
- go-task `WithIO(rw io.ReadWriter)` at `executor.go:579-593`: sets all three streams

**When to use**: When building APIs that may be consumed by external projects and need backward compatibility.

**When overkill**: Internal tools with stable APIs.

### Pattern: System Interface for Filesystem

**Problem**: How to test filesystem operations without creating/deleting real files.

**Solution**: Define a `System` or `FS` interface with methods like `Open`, `ReadFile`, `WriteFile`, `Stat`, and provide in-memory implementations (e.g., `ReadOnlySystem`, `MemoryFS`).

**Repos**: chezmoi (`System` at `internal/chezmoi/system.go:25` with 8 implementations), restic (`fs.FS` at `internal/fs/interface.go:10-31`), rclone (`fs.Fs` interface at `fs/types.go:17-48`), dive (via `afero`)

**Evidence**:
- chezmoi `System` interface at `internal/chezmoi/system.go:25`: `Chmod, Chtimes, Glob, Link, Lstat, Mkdir, ...`
- restic `fs.FS` at `internal/fs/interface.go:10-31`: `OpenFile, Lstat, Join, Separator, ...`
- chezmoi `WithTestFS` at `internal/chezmoitest/chezmoitest.go:86-91`: wraps `vfst` for in-memory FS

**When to use**: When the application reads/writes files as a core function (dotfile managers, backup tools, file processors).

**When overkill**: Tools with minimal filesystem access (e.g., network-only tools, simple calculators).

### Pattern: Backend Interface for Network/Storage

**Problem**: How to test network operations or cloud storage backends without making real API calls.

**Solution**: Define a `Backend` or `Repository` interface with methods like `Save`, `Load`, `List`, `Delete`, and provide in-memory implementations for tests.

**Repos**: restic (`backend.Backend` at `internal/backend/backend.go:19-90` with `mem.MemoryBackend`), rclone (`fs.Fs` interface covers remote operations)

**Evidence**:
- restic `backend.Backend` interface at `internal/backend/backend.go:19-90`: `Save, Load, Remove, List, Stat, Close, Delete`
- restic `mem.MemoryBackend` at `internal/backend/mem/mem_backend.go:52-255`: implements Backend interface
- restic `TestRepositoryWithBackend` at `internal/repository/testing.go:49-55`: creates repo with injectable backend

**When to use**: When building tools that interact with cloud storage (S3, GCS), remote APIs, or any external system.

**When overkill**: CLIs that only read local files or make HTTP calls through well-known libraries that already provide test doubles.

### Pattern: MockTerminal / MockUi for UI Testing

**Problem**: How to test terminal output without a real TTY.

**Solution**: Create a mock implementation of the terminal UI interface that stores output in memory (slices of strings) rather than printing.

**Repos**: restic (`ui.MockTerminal` at `internal/ui/mock.go:10-53`), gh-cli (via `iostreams.Test()`), mitchellh-cli (`MockUi` at `ui_mock.go:27-33`), go-task (`SyncBuffer` at `executor_test.go:146-151`)

**Evidence**:
- restic `MockTerminal` at `internal/ui/mock.go:10-53`: stores `Output` and `Errors` as `[]string`
- mitchellh-cli `MockUi` at `ui_mock.go:27-33`: has `OutputWriter` and `ErrorWriter` as `*syncBuffer`
- go-task `SyncBuffer` at `executor_test.go:146-151`: thread-safe buffer for output capture

**When to use**: When building TUI applications or any CLI with significant output formatting.

**When overkill**: CLIs that only produce simple, unstructured output.

### Pattern: Test Hook Variables

**Problem**: How to inject test doubles without changing function signatures or constructors.

**Solution**: Export a package-level variable (often named `*TestHook` or `testOnly*`) that tests can set to inject behavior.

**Repos**: age (`testOnlyConfigureScryptIdentity` at `cmd/age/age.go:409`, `testOnlyFixedRandomWord`, `testOnlyPluginPath` at `plugin/client.go:424`), restic (`backupFSTestHook` at `cmd/restic/cmd_backup.go:166`)

**Evidence**:
- age `testOnlyPluginPath` at `plugin/client.go:424`: allows injecting custom plugin directory
- restic `backupFSTestHook` at `cmd/restic/cmd_backup.go:166`: `func(fs fs.FS) fs.FS`

**When to use**: When you need to override behavior in tests but cannot change the API or constructor chain.

**When risky**: Package-level variables can cause test pollution if not properly reset. Use `sync.Once` or similar for thread-safe lazy initialization.

## Key Differences

### TUI vs Batch Applications

Batch-oriented tools (yq, rclone operations, helm chart operations) can achieve high testability because output can be captured in `bytes.Buffer` and assertions made on the result string. TUI applications (fzf, k9s, lazygit) face a fundamental constraint: the `gocui` or `tview` libraries require a terminal. These projects compensate by providing alternative execution modes (`--ci`, `--filter`, NoUI) and using integration test frameworks, but unit testing of UI components remains limited.

**Evidence**: fzf's `--filter` mode at `src/options.go:641` provides non-interactive batch operation, but core terminal rendering requires `/dev/tty` at `src/tui/light.go:163-166`.

### Library vs Application

CLI libraries (mitchellh-cli, urfave-cli) focus on providing abstractions for their consumers. They abstract terminal IO but intentionally omit filesystem and network abstractions since those are consumer responsibilities. Applications (restic, gh-cli) own the full stack and must abstract all three domains.

**Evidence**: mitchellh-cli `Ui` interface at `ui.go:19-43` provides terminal abstraction; the README explicitly states the library doesn't handle network/filesystem.

### Plugin Architecture

Projects with plugin systems (age, helm registry) abstract plugin-user interaction via interfaces (`ClientUI` at `plugin/client.go:319-337` in age), making plugin interactions testable through mock callbacks. This is distinct from projects without plugin systems where the entire codebase is a monolith.

**Evidence**: age `ClientUI` at `plugin/client.go:319-337`: `DisplayMessage, RequestValue, Confirm, WaitTimer` function fields.

### Abstraction Completeness

Some projects (restic, gh-cli) achieve consistent abstraction across all IO domains. Others (dive, rclone) abstract filesystem well but leave stdout hardcoded in commands. This inconsistency means testability varies depending on which code path is being tested.

**Evidence**: rclone operations accept `io.Writer` at `fs/operations/operations.go:864` but `cmd/ls/ls.go:42` passes `os.Stdout` directly.

## Tradeoffs

### Simplicity vs Testability

Direct `fmt.Fprintf(os.Stderr, ...)` is simpler to write and debug than `fmt.Fprintf(ui.stderr, ...)`. The cost is inability to capture output in tests. Projects like opencode prioritize simplicity; projects like restic prioritize testability.

| Repo | Choice | Rationale |
|------|--------|-----------|
| opencode | Direct fmt | Internal tool, simpler codebase |
| restic | Terminal interface | Production tool with extensive test suite |
| age | Hybrid | Core crypto abstracted, UI kept simple |

### Binary Size vs Abstraction

Fzf deliberately avoids `net/http` to save ~2.4MB (`src/server.go:147-152`). This binary-size optimization prevents using standard HTTP testing patterns (mock servers, transport replacement).

| Repo | Trade | Impact |
|------|-------|--------|
| fzf | No net/http | Binary smaller but HTTP server untestable |
| helm | Full net/http | Larger binary but standard HTTP testing works |
| rclone | Partial | Operations abstract, commands hardcode |

### Global State vs Dependency Injection

Projects like rclone use package-level singletons (`fshttp.Transport` at `fs/fshttp/http.go:38`) for convenience. Tests must call `ResetTransport()` (`fs/fshttp/http.go:54-55`) to isolate. Gh-cli injects everything through `Factory`, requiring more upfront design but producing more testable code.

| Repo | Approach | Test Pattern |
|------|----------|--------------|
| gh-cli | DI via Factory | `Factory.IOStreams` propagated to all commands |
| rclone | Package singletons | `fshttp.ResetTransport()` in test setup |
| k9s | Global config | `mockConnection` set via package variable |

### Interface Complexity vs Flexibility

Restic's `fs.FS` interface has 20+ methods (`internal/fs/interface.go:10-31`). This enables comprehensive mocking but requires substantial implementation for custom filesystems. Smaller interfaces (like `io.Reader`/`io.Writer`) are easier to implement but provide less behavioral fidelity.

## Decision Guide

**Choose interface-based IO injection when:**
- Building a production CLI used by others (restic, gh-cli, helm patterns)
- Testability is a first-class requirement
- The team has bandwidth to maintain interface contracts

**Choose functional options when:**
- Building APIs with many optional dependencies
- Backward compatibility is important
- The codebase is medium-sized

**Choose config-struct fields when:**
- Building cobra-based CLIs (cobra's `cmd.OutOrStdout()` pattern)
- Most commands need IO streams
- Some commands may override defaults

**Accept direct os.* usage when:**
- Building internal tooling where testability is lower priority
- The tool is a simple script, not a framework
- Binary size is critical (embedded systems, CLI installers)

**Avoid when:**
- Mixing injectable and non-injectable IO in the same codebase (causes confusion about which paths are testable)
- Using global state where context-local would work better

## Practical Tips

1. **Default to injectable IO streams**. Pass `io.Writer` as a parameter to command `Run` functions rather than accessing `os.Stdout` directly. This single decision enables buffer-based testing.

2. **Use `bytes.Buffer` for test output capture**. It's idiomatic Go, requires no custom infrastructure, and supports `fmt.Fprintf` directly:
   ```go
   buf := &bytes.Buffer{}
   cmd.Run(ctx, buf)
   got := buf.String()
   ```

3. **Define interfaces at the boundary, not internals**. Define `Terminal` or `FileSystem` interfaces where your code meets external systems, not deep inside business logic.

4. **Provide a `Test()` constructor alongside `System()`**. Gh-cli's pattern at `pkg/iostreams/iostreams.go:551-568` is exemplary—infrastructure should ship with its own test helper.

5. **Use `syncBuffer` for concurrent-safe test buffers**. Mitchellh-cli's `syncBuffer` at `ui_mock.go:84-116` wraps `bytes.Buffer` with `sync.RWMutex` for thread-safe output capture.

6. **Isolate global state in factories**. Instead of accessing `os.Stderr` directly, create the HTTP client in a factory function that can be replaced in tests.

7. **Exploit Go's static interface checks**. Add `var _ Terminal = &Terminal{}` compile-time assertions to ensure implementations satisfy interfaces:
   - restic at `internal/ui/termstatus/status.go:16`
   - restic at `internal/fs/fs_reader.go:43`

8. **Use `httptest.Server` for HTTP mocking**. It's simpler than building custom mock servers:
   - chezmoi at `internal/cmd/applycmd_test.go:220-241`
   - gh-cli at `pkg/cmd/issue/list/list_test.go:29-31`

## Anti-Patterns / Caution Signs

1. **`log.New(os.Stderr, ...)` as module-level singleton**. Age's `tui.go:31` creates a logger backed by `os.Stderr` that cannot be redirected. Prefer passing `io.Writer` to logging functions.

2. **`cmd.Stdout = os.Stdout` in command execution**. Dive at `dive/image/docker/cli.go:27` and rclone at `cmd/ls/ls.go:42` bypass any IO abstraction. This should trigger a refactor to pass `io.Writer` instead.

3. **`http.Get` or `http.DefaultClient.Do` as direct calls**. Lazygit at `pkg/updates/updates.go:268` makes HTTP calls directly, preventing test doubles. Wrap HTTP in an interface.

4. **Hardcoded `/dev/tty`**. Fzf at `src/tui/light.go:163-166` opens `/dev/tty` directly. While sometimes necessary for interactive prompts, it should be isolated behind a `Terminal` interface, not scattered through code.

5. **`os.Open`/`os.Create` without abstraction**. Yq at `pkg/yqlib/utils.go:42`, opencode throughout. If filesystem access is a core operation, define an interface.

6. **Template functions bypassing config IO**. Chezmoi's template funcs at `internal/cmd/templatefuncs.go:296` write to `os.Stderr` directly. This creates an untestable code path even though the surrounding architecture is well-abstracted.

7. **Global HTTP transport singleton**. Rclone's `fshttp.Transport` at `fs/fshttp/http.go:38` complicates test isolation. While `ResetTransport()` exists, it's a workaround for a design problem.

8. **No output capture in tests**. Opencode's tests don't capture stdout/stderr—they verify behavior via return values. This works but misses output format regressions.

## Notable Absences

### No `fs.FS` Interface in Most Projects

Despite Go 1.16's `io/fs` package establishing `fs.FS` as a standard, only restic (`internal/fs/interface.go:10-31`) explicitly uses it. Most projects define custom filesystem interfaces or use `afero` (dive).

### No stdin Abstraction

Few projects abstract stdin. When they do (gh-cli's `iostreams.Test()` returns stdin buffer), it's rare. Most assume stdin is connected to a terminal.

### No Time Abstraction

Time is rarely abstracted. The `Timestamper` variable pattern (helm at `pkg/action/action.go:63`) appears in only one project. Time-dependent tests require clock manipulation libraries.

### No Structured Logging Abstraction

Log abstraction is rare. Most projects use `fmt.Fprintf(os.Stderr)` or `log` package directly. Only yq uses structured logging (`slog`), but it hardcodes the handler to `os.Stderr`.

## Per-Repo Notes

| Repo | Key Takeaway |
|------|--------------|
| **age** | Core crypto is cleanly abstracted; UI layer is not. Consider extracting UI behind an interface. |
| **chezmoi** | Best-in-class `System` interface with 8 implementations. Template stderr bypass is the main gap. |
| **dive** | `afero` usage demonstrates library-level FS abstraction. Docker CLI hardcoding is the main gap. |
| **fzf** | TUI architecture is well-designed (`Renderer`/`Window` interfaces) but fundamentally terminal-coupled. |
| **gdu** | Excellent `UI` interface design. TUI hardcoding `os.Stdout` is an inconsistency to fix. |
| **gh-cli** | Gold standard for IO abstraction. `iostreams.Test()` and `httpmock.Registry` are exemplary. |
| **go-task** | `Executor` functional options are ergonomic. `fsext` direct `os` calls are the main gap. |
| **helm** | Commands consistently accept `io.Writer`. K8s client creation inside `Init` is the main gap. |
| **k9s** | TUI-centric design limits testability. `Connection` interface is solid but underutilized. |
| **lazygit** | `ICmdObjRunner` interface is excellent for command testing. HTTP abstraction is the main gap. |
| **mitchellh-cli** | Clean `Ui` interface with decorator pattern. Library scope excludes network/filesystem. |
| **opencode** | Minimal IO abstraction. LSP transport is the exception. Needs significant refactoring. |
| **rclone** | Operations are well-abstracted. Commands hardcoding `os.Stdout` is the main gap. |
| **restic** | Most complete IO abstraction. `Terminal`, `fs.FS`, `backend.Backend` all injectable. |
| **urfave-cli** | Framework-level IO abstraction is solid. `tracef` and `os.Args` are the main gaps. |
| **yq** | Cobra integration is idiomatic. Logger hardcoding `os.Stderr` and filesystem direct calls are gaps. |

## Open Questions

1. **Why do projects with strong IO abstraction still leak direct `os.*` calls?** Even restic (8/10) has `os.Hostname()` direct at `cmd/restic/cmd_backup.go:64`. The pattern seems to be: abstract what tests need to mock, leave everything else direct.

2. **Should CLI frameworks mandate IO interfaces?** Urfave-cli and mitchellh-cli provide the abstraction; consumers must use it correctly. Is there a way to make mis-use harder?

3. **Is TUI testability a lost cause?** Fzf, k9s, lazygit all accept that terminal UI cannot be unit tested. They invest in integration tests instead. Is this the correct tradeoff for interactive applications?

4. **When does filesystem abstraction pay off?** Dive's `afero` usage is well-suited for a tool that reads Docker images (virtual filesystems). Would yq or opencode benefit from the same investment?

5. **Should HTTP abstraction be standardized?** Projects like lazygit and k9s have no HTTP abstraction. Go's standard library provides `http.RoundTripper`—why isn't this used more?

## Evidence Index

| Pattern | Evidence | Source |
|---------|----------|--------|
| IOStreams Test constructor | `pkg/iostreams/iostreams.go:551-568` | gh-cli |
| Functional options | `executor.go:541-577` | go-task |
| System interface | `internal/chezmoi/system.go:25` | chezmoi |
| FS interface | `internal/fs/interface.go:10-31` | restic |
| Backend interface | `internal/backend/backend.go:19-90` | restic |
| MockTerminal | `internal/ui/mock.go:10-53` | restic |
| SyncBuffer | `executor_test.go:146-151` | go-task |
| ClientUI callbacks | `plugin/client.go:319-337` | age |
| Test hook variable | `cmd/restic/cmd_backup.go:166` | restic |
| afero FS abstraction | `cmd/dive/cli/internal/command/adapter/exporter.go:20` | dive |
| Tests with httptest | `internal/cmd/applycmd_test.go:220-241` | chezmoi |
| ui.Terminal interface | `internal/ui/terminal.go:10-36` | restic |
| Ui interface | `ui.go:19-43` | mitchellh-cli |
| WithStdout option | `executor.go:553-564` | go-task |
| Direct os.Stderr | `cmd/age/tui.go:31` | age |
| Hardcoded os.Stdout in commands | `cmd/ls/ls.go:42` | rclone |
| Renderer interface | `src/tui/tui.go:843-914` | fzf |
| TtyIn opens /dev/tty | `src/tui/light.go:163-166` | fzf |
| tracef to os.Stderr | `cli.go:47` | urfave-cli |
| Logger os.Stderr | `pkg/yqlib/logger.go:18` | yq |
| template funcs os.Stderr | `internal/cmd/templatefuncs.go:296` | chezmoi |
| fshttp singleton | `fs/fshttp/http.go:38` | rclone |
| http.Get direct | `pkg/updates/updates.go:268` | lazygit |
| Test with bytes.Buffer | `stdout/stdout_test.go:29-39` | gdu |

---

Generated by protocol `06-io-abstraction.md`.