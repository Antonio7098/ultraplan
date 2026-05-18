# Repo Analysis: gdu

## Dependency Injection & Wiring

### Repo Info

| Field | Value |
|-------|-------|
| Name | gdu |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` |
| Group | `gdu` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Gdu uses a clearly defined composition root at `cmd/gdu/main.go:269-278` where the `App` struct is assembled and dependencies are passed explicitly. The `App` struct acts as a central coordinator that creates UI instances via factory functions (`createUI()` at `cmd/gdu/app/app.go:360-431`). Dependencies flow downward from `App` → UI implementations. Interfaces are used for key abstractions (e.g., `device.DevicesInfoGetter` at `pkg/device/dev.go:20`, `common.Analyzer` at `internal/common/analyze.go:25`). Global state is minimal (package-level `af` and `configErr` at `cmd/gdu/main.go:27-30`). The project demonstrates good DI discipline with explicit construction and testability via mock implementations in `internal/testdev/`, `internal/testapp/`, and `internal/testdir/`.

## Rating

**8/10** — Clear composition root and explicit wiring. Dependency flow is well-defined with interfaces for abstraction. Limited to a minor point deduction due to the global `af` and `configErr` variables in main.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Composition root | `App` struct assembled in `runE()` with explicit field initialization | `cmd/gdu/main.go:269-278` |
| Interface abstraction | `DevicesInfoGetter` interface for device querying | `pkg/device/dev.go:20-23` |
| Interface abstraction | `Analyzer` interface for directory analysis | `internal/common/analyze.go:25-35` |
| Interface abstraction | `UI` interface (30 methods) for terminal/text output | `cmd/gdu/app/app.go:31-49` |
| Constructor pattern | `CreateStdoutUI()`, `CreateUI()` (TUI), `CreateExportUI()` factory functions | `stdout/stdout.go:45-91`, `tui/tui.go:116-214`, `report/export.go` |
| Explicit wiring | `App.createUI()` decides which UI to instantiate based on flags | `cmd/gdu/app/app.go:360-431` |
| Mock implementations | `DevicesInfoGetterMock` for testing | `internal/testdev/dev.go:6-18` |
| Mock implementations | `MockedApp` for testing | `internal/testapp/app.go:28-105` |
| Global state | Package vars `af` and `configErr` | `cmd/gdu/main.go:27-30` |
| Path checker injection | `PathChecker` field in `App` set to `os.Stat` | `cmd/gdu/main.go:277` |
| Device getter injection | `Getter` field in `App` set to `device.Getter` | `cmd/gdu/main.go:276` |
| TermApp injection | `TermApp` field in `App` set to `tview.NewApplication()` or nil | `cmd/gdu/main.go:261-262`, `cmd/gdu/app/app.go:185` |
| Analyzer injection | `SetAnalyzer()` called on UI after creation based on flags | `cmd/gdu/app/app.go:232-253` |
| Config initialization | Config loaded from files in `initConfig()` at `main.go:127-144` | `cmd/gdu/main.go:127-144` |
| Option pattern | `Option` func type for UI customization | `tui/tui.go:113-114` |

## Answers to Protocol Questions

### 1. Where are dependencies constructed?

Dependencies are constructed in multiple places:
- **Global flags**: `cmd/gdu/main.go:46-47` initializes `af = &app.Flags{...}` in `init()`.
- **Config loading**: `cmd/gdu/main.go:119-125` (`loadConfig()`) populates `af` from YAML files.
- **App struct**: `cmd/gdu/main.go:269-278` constructs the `App` with explicit field assignments.
- **UI factories**: `cmd/gdu/app/app.go:360-431` (`createUI()`) instantiates UI implementations based on flags — `stdout.CreateStdoutUI()`, `tui.CreateUI()`, or `report.CreateExportUI()`.
- **Analyzer factories**: `cmd/gdu/app/app.go:242-252` creates specialized analyzers (`CreateStoredAnalyzer`, `CreateSqliteAnalyzer`, `CreateSeqAnalyzer`) based on flag conditions.
- **Device getter**: `cmd/gdu/main.go:276` assigns `device.Getter` (a package-level variable, see `pkg/device/dev_linux.go:14`).

### 2. How are services passed around?

Services are passed via struct fields and interface methods:
- **`App` struct** (`cmd/gdu/app/app.go:183-192`) holds all top-level dependencies: `Writer`, `TermApp`, `Screen`, `Getter`, `Flags`, `PathChecker`, `Args`, `Istty`.
- **UI implementations** receive dependencies at construction time via factory function parameters.
- **`common.UI`** (`internal/common/ui.go:11-23`) is embedded in both `stdout.UI` and `tui.UI` and holds `Analyzer` (interface), `IgnoreDirPaths`, `IgnoreDirPathPatterns`, and filter settings.
- The `UI` interface (30 methods at `cmd/gdu/app/app.go:31-49`) is the primary abstraction for output behaviors.

### 3. Is wiring centralized?

**Yes, with one exception.** The `runE()` function in `cmd/gdu/main.go:200-279` serves as the composition root. It:
1. Initializes flags and config.
2. Creates the `App` struct with all dependencies.
3. Calls `app.Run()` which internally calls `createUI()` to instantiate the appropriate UI.

The single exception is the global `device.Getter` at `cmd/gdu/main.go:276`. This is a package-level variable that holds a platform-specific implementation (`LinuxDevicesInfoGetter`, `BSDDevicesInfoGetter`, etc.). While it's injected into `App.Getter`, the getter itself is not constructed at the composition root — it's a package-level singleton.

### 4. Are globals avoided?

**Mostly.** The code avoids most forms of global state, but two package-level variables exist:

- `cmd/gdu/main.go:27-30`:
```go
var (
    af        *app.Flags
    configErr error
)
```
These are used to share state between `init()` and `runE()`. This is a common Go pattern for flag initialization but technically violates strict DI principles.

- `pkg/device/dev_linux.go:14` and similar platform files define `var Getter DevicesInfoGetter` as a package-level variable that returns platform-specific device info.

No other package-level state was observed. The `http.DefaultServeMux` at `cmd/gdu/app/app.go:194-196` is a global in the standard library, not the application's problem.

### 5. Is initialization explicit?

**Yes.** All initialization is explicit:
- Flag defaults are set in `setDefaults()` at `cmd/gdu/main.go:146-168`.
- Config files are loaded via `loadConfig()` at `cmd/gdu/main.go:119-125`.
- Style defaults are applied in `setDefaults()` if not set in config.
- UI options are applied via the `Option` functional options pattern at `tui/tui.go:113-114` and `getOptions()` at `cmd/gdu/app/app.go:434-561`.
- Analyzer selection is explicit based on flag conditions at `cmd/gdu/app/app.go:232-253`.

## Architectural Decisions

1. **UI interface as the central abstraction** (`cmd/gdu/app/app.go:31-49`): 30-method interface decoupling the `App` from specific UI implementations (TUI, stdout, export). This allows the same `App.Run()` logic to produce different outputs.

2. **Analyzer interface** (`internal/common/analyze.go:25-35`): Abstracts directory traversal and analysis, enabling different implementations (sequential, parallel, stored/SQLite, badger).

3. **Functional options pattern** for UI configuration (`tui/tui.go:113-114`): Allows flexible UI customization without breaking constructors. Used extensively in `getOptions()` at `cmd/gdu/app/app.go:434-561`.

4. **DevicesInfoGetter interface** (`pkg/device/dev.go:20-23`): Abstracts platform-specific device enumeration, with platform-specific implementations (`dev_linux.go`, `dev_bsd.go`, etc.).

5. **Global config state via package vars**: The use of `af *app.Flags` shared between `init()` and `runE()` is a pragmatic trade-off for Go's flag package, but it creates hidden dependency on initialization order.

## Notable Patterns

- **Factory functions** for UI creation: `CreateStdoutUI()`, `CreateUI()`, `CreateExportUI()`.
- **Mock packages** under `internal/` (`testdev`, `testapp`, `testdir`) for testing without real IO.
- **Embedded struct** `*common.UI` in both `stdout.UI` and `tui.UI` for shared state.
- **Signal handling** in `tui.UI.StartUILoop()` at `tui/tui.go:314-338` for graceful shutdown.
- **Worker pool** pattern for background deletion at `tui/tui.go:385-391`.

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| Global `af` and `configErr` in `main.go:27-30` | Simplifies flag/config access but creates hidden global state that makes testing of `init()` difficult. |
| `device.Getter` as package-level singleton | Avoids passing another dependency through the call chain but makes it harder to substitute in tests. |
| `common.UI` embedded in both stdout and TUI UIs | Shares implementation but creates coupling to the `common.UI` struct layout. |
| 30-method `UI` interface | Provides flexibility but requires implementing all methods even for trivial UI variants. |

## Failure Modes / Edge Cases

- **Config file errors** are logged but not fatal (`cmd/gdu/main.go:242-244`), which can mask configuration problems.
- **Path checker** (`os.Stat`) is injected but always the real `os.Stat` in production; only mocked in tests via `testdir.MockedPathChecker`.
- **Device getter** is a package-level variable; on some platforms (e.g., `dev_openbsd.go`) it may return errors that bubble up as "not supported" in tests.
- **Signal handling** in TUI assumes the process will exit cleanly after receiving signals, but goroutines spawned for profiling (`cmd/gdu/app/app.go:578-585`) or deletion workers may not drain before exit.

## Future Considerations

- Consider extracting `device.Getter` to be constructed in `runE()` and passed to `App` to eliminate the package-level variable.
- Consider whether the `UI` interface could be split into smaller roles (e.g., `AnalyzerUI`, `ExporterUI`) to reduce the implementation burden.
- The global `af` and `configErr` pattern is common in Go CLIs but could be refactored to pass config as a function argument to `runE()`.

## Questions / Gaps

- No evidence of `context.Context` usage for request-scoped values. All passing of cancellation/timeout is done via direct function parameters or global logger.
- No evidence of dependency injection containers or frameworks (no wire, dig, fx usage).
- The `init()` function in `main.go` has side effects (loading config, setting defaults) that are not testable without the full binary.

---

Generated by `study-areas/03-dependency-injection.md` against `gdu`.