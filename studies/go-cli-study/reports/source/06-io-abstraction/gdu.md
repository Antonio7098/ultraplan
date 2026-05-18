# Repo Analysis: gdu

## IO Abstraction & Testability

### Repo Info

| Field | Value |
|-------|-------|
| Name | gdu |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` |
| Group | `gdu` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

gdu demonstrates strong IO abstraction patterns. Output streams are passed as `io.Writer` interface parameters, enabling in-memory buffer testing. The codebase defines the `UI` interface (`cmd/gdu/app/app.go:30-49`) which abstracts all terminal/file operations, and device access is abstracted through `DevicesInfoGetter` interface (`pkg/device/dev.go:20-23`). Tests extensively use `bytes.Buffer` to capture stdout output. However, filesystem scanning directly uses `os.Stat` and directory iteration internally, making those paths not fully mockable via interfaces.

## Rating

**8/10** — Most side effects isolated; excellent test helper patterns. Filesystem scanning is the notable gap.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Stdout abstraction | `UI.output io.Writer` field stores injected writer | `stdout/stdout.go:23` |
| Stdout passed to UI | `CreateStdoutUI(output io.Writer, ...)` accepts writer | `stdout/stdout.go:45-58` |
| UI interface | `UI` interface defines all IO operations | `cmd/gdu/app/app.go:30-49` |
| Output via fmt.Fprintf | `fmt.Fprintf(ui.output, ...)` writes to injected writer | `stdout/stdout.go:162-163` |
| Device abstraction | `DevicesInfoGetter` interface for mount/device info | `pkg/device/dev.go:20-23` |
| Mock device getter | `DevicesInfoGetterMock` in test helper | `internal/testdev/dev.go:6-16` |
| App struct with Writer | `App.Writer io.Writer` field | `cmd/gdu/app/app.go:184` |
| Test uses bytes.Buffer | `output := bytes.NewBuffer(buff)` in tests | `stdout/stdout_test.go:30` |
| Analyzer interface | `Analyzer` interface for scanning behavior | `internal/common/analyze.go:25-35` |
| fs.Item interface | `Item` interface for filesystem entries | `pkg/fs/file.go:31-53` |
| Path checker injection | `App.PathChecker func(string) (fs.FileInfo, error)` | `cmd/gdu/app/app.go:189` |
| Export output abstraction | `exportOutput io.Writer` in report UI | `report/export.go:25-26` |
| Input file as io.Reader | `ReadAnalysis(input io.Reader)` method | `stdout/stdout.go:414` |
| DevicesInfoGetter mock usage | Tests inject mock via `testdev.DevicesInfoGetterMock{}` | `cmd/gdu/app/app_test.go:682-696` |
| Network (profiling only) | HTTP server on localhost:6060 for pprof | `cmd/gdu/app/app.go:584` |

## Answers to Protocol Questions

### 1. Is stdout/stderr abstracted?

**Yes.** The `stdout.UI` struct holds `output io.Writer` (`stdout/stdout.go:23`) which is injected via `CreateStdoutUI(output io.Writer, ...)` at line 45. All output goes through `fmt.Fprintf(ui.output, ...)` rather than `os.Stdout`. Similarly, `report.UI` has `output io.Writer` (`report/export.go:25`) and `exportOutput io.Writer` (`report/export.go:26`). The `App` struct holds `Writer io.Writer` (`cmd/gdu/app/app.go:184`) which defaults to `os.Stdout` in main (`cmd/gdu/main.go:273`) but can be replaced for testing.

### 2. Can commands be tested without a real terminal?

**Yes.** Tests create `bytes.Buffer` instances and pass them as `io.Writer` to capture output. Example in `stdout/stdout_test.go:29-39`:
```go
buff := make([]byte, 10)
output := bytes.NewBuffer(buff)
ui := CreateStdoutUI(output, false, false, false, false, false, false, false, "", 0, false, 0)
```
The `runApp` helper in `app_test.go:682-696` creates `bytes.NewBufferString("")` and passes it as `Writer`, enabling assertions on output without TTY.

### 3. Is filesystem access abstracted?

**Partially.** The `fs.Item` interface (`pkg/fs/file.go:31-53`) abstracts file/directory representation. The `Analyzer` interface (`internal/common/analyze.go:25-35`) abstracts directory scanning. However, `App.PathChecker` (`cmd/gdu/app/app.go:189`) is injected as `os.Stat` in production (`cmd/gdu/main.go:277`) but can be replaced with a mock via `testdir.MockedPathChecker` in tests. Direct filesystem calls remain in analyzer implementations (e.g., `pkg/analyze/dir_unix.go` uses `os.ReadDir` and `os.Lstat`), so full filesystem mockability is not available.

### 4. Is network access mockable?

**Network is not used for core functionality.** HTTP server appears only for profiling endpoints (`cmd/gdu/app/app.go:579-584`), started conditionally when `af.Profiling` is true. There is no network-based API or remote calls in the main code paths. Profiling endpoints could be considered mockable by not enabling the flag, but there is no interface for the HTTP client itself.

## Architectural Decisions

1. **UI interface as central abstraction** (`cmd/gdu/app/app.go:30-49`): Defines `AnalyzePath`, `ListDevices`, `ReadAnalysis`, `ReadFromStorage`, `StartUILoop` — all IO operations are method signatures on this interface. Multiple implementations: `stdout.UI`, `tui.UI`, `report.UI`.

2. **Writer injection pattern**: `App.Writer io.Writer` is injected rather than global. This enables `runApp` in tests to pass `bytes.Buffer`.

3. **Device getter abstraction**: `DevicesInfoGetter` interface (`pkg/device/dev.go:20-23`) abstracts platform-specific mount reading. Linux uses `/proc/mounts`, BSD uses `/sbin/mount`. Tests inject `testdev.DevicesInfoGetterMock{}`.

4. **Analyzer interface for scanning**: `Analyzer` interface (`internal/common/analyze.go:25-35`) allows different implementations (parallel, sequential, stored in Badger/SQLite). Created via factory functions like `analyze.CreateTopDirAnalyzer()`, `analyze.CreateAnalyzer()`.

5. **Path checker injection**: `App.PathChecker` (`cmd/gdu/app/app.go:189`) is a function type `func(string) (fs.FileInfo, error)` — allows test doubles for path existence checks.

## Notable Patterns

1. **Builder-like UI creation**: `stdout.CreateStdoutUI(output, useColors, showProgress, ...)` accepts all configuration as parameters, returning configured `*UI`. Same pattern for `report.CreateExportUI` and `tui.CreateUI`.

2. **Test helper structs**: `internal/testdev/dev.go` defines `DevicesInfoGetterMock` with compile-time interface check at line 10. `internal/testdir/` provides `CreateTestDir()` and `MockedPathChecker`.

3. **UI embedding via common.UI**: `stdout.UI` embeds `*common.UI` (`stdout/stdout.go:24`) which holds shared state like `Analyzer`, `UseColors`, `ShowProgress`.

4. **Flag-driven UI selection**: `App.createUI()` (`cmd/gdu/app/app.go:360-431`) branches on flags to create stdout, report, or TUI UI. Non-interactive mode uses stdout UI.

5. **Progress via goroutine + channel**: `updateProgress` in `stdout/stdout.go:491-535` runs in goroutine, reads from `ui.Analyzer.GetDone()` channel and `updateStatsDone` channel.

## Tradeoffs

1. **Analyzer implementations are not injectable**: While `Analyzer` is an interface, the concrete implementations (`ParallelAnalyzer`, `SequentialAnalyzer`) directly use `os.ReadDir`, `os.Lstat`. This means filesystem scanning cannot be fully mocked for integration tests.

2. **Device getter is global singleton**: `device.Getter` (`pkg/device/dev_linux.go:19`) is a package-level variable, not injected. Tests override it by setting `device.Getter = testdev.DevicesInfoGetterMock{}` directly.

3. **TUI hardcodes os.Stdout**: In `cmd/gdu/app/app.go:414`, TUI creation passes `os.Stdout` directly rather than the configurable `a.Writer`:
```go
ui = tui.CreateUI(
    a.TermApp,
    a.Screen,
    os.Stdout,  // hardcoded, not a.Writer
    ...
)
```
This is inconsistent with stdout/report UIs which use the injected writer.

4. **HTTP profiling is all-or-nothing**: Profiling HTTP server (`cmd/gdu/app/app.go:579-584`) cannot be mocked or disabled per-request. It's either on or off.

## Failure Modes / Edge Cases

1. **bytes.Buffer too small**: Many tests use `make([]byte, 10)` for buffer, relying on `bytes.Buffer` to grow dynamically. Works but could mask buffer sizing issues.

2. **Global state in color package**: `color.NoColor = true` (`stdout/stdout.go:87`) is set globally, not per-instance. Could cause test pollution if tests run in parallel.

3. **App.Istty checked at construction**: The `Istty` bool is passed at construction time based on `isatty.IsTerminal(os.Stdout.Fd())`. If stdout is redirected after construction, behavior may not match expectations.

4. **PathChecker os.Stat does not handle symlinks correctly for all cases**: `FollowSymlinks` flag is passed to analyzer, but `PathChecker` is just `os.Stat` — symlink behavior is determined by analyzer, not path checker.

## Future Considerations

1. **Inject filesystem access**: Consider adding `fs.Fs` interface (or similar) with `ReadDir`, `Lstat` methods, injected into analyzer implementations for full filesystem mockability.

2. **Make TUI output writer configurable**: Pass `a.Writer` to `tui.CreateUI` instead of hardcoding `os.Stdout`.

3. **Consider device.Getter as field**: Inject `DevicesInfoGetter` via `App.Getter` field rather than package global, enabling easier testing without global state mutation.

4. **Interface for HTTP server**: If profiling is needed in tests, consider `Profiler` interface with `Start()` and `Stop()` methods.

## Questions / Gaps

1. **No evidence found for network abstraction**: HTTP is only for profiling and is not mockable. If network features are added later, interfaces should be defined.

2. **Filesystem scanning not fully mockable**: The `Analyzer` interface abstracts the *result* of scanning but not the scanning process itself. Implementations use direct `os` calls.

3. **No evidence of interface for file content reading**: `ReadAnalysis` takes `io.Reader`, which is good, but there's no abstraction for reading file content during scanning (e.g., for git-annex detection).

---

Generated by `study-areas/06-io-abstraction.md` against `gdu`.