# Repo Analysis: gdu

## Project Structure & Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | gdu |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` |
| Group | `01-project-structure` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Gdu is a disk usage analyzer with a well-separated architecture. The CLI layer (`cmd/gdu/`) is thin—flag parsing and delegation only. Business logic lives in `pkg/` packages (`analyze`, `fs`, `device`, `remove`, `timefilter`, `annex`, `path`). The UI layer is split into `tui/` (interactive), `stdout/` (non-interactive text), and `report/` (JSON import/export). Shared interfaces are consolidated in `internal/common/`. Dependency flow is unidirectional: CLI → App → UI implementations → analyzer → filesystem types.

## Rating

**8/10** — Clean layering with understandable ownership. The `internal/common` package is slightly unusual (interfaces shared across UI and analyzer) but works. Minor inconsistency: `tui`, `stdout`, and `report` are top-level packages rather than under `pkg/`, but they are clearly UI-layer concerns.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Entry point | `rootCmd` defined, `runE` calls `app.Run()` | `cmd/gdu/main.go:32-43` |
| Entry point | `rootCmd.Execute()` in `main()` | `cmd/gdu/main.go:283` |
| App orchestration | `App.Run()` dispatches to UI based on flags | `cmd/gdu/app/app.go:201-310` |
| App struct definition | `App` struct holds `Flags`, `TermApp`, `Getter`, `PathChecker` | `cmd/gdu/app/app.go:183-192` |
| CLI layer thinness | `main.go` only parses flags, config, logging | `cmd/gdu/main.go:46-115` |
| Analyzer interface | `Analyzer` interface defined | `internal/common/analyze.go:25-35` |
| Filesystem interface | `Item` interface for files/dirs | `pkg/fs/file.go:31-53` |
| UI interface | `UI` interface for all output modes | `cmd/gdu/app/app.go:30-49` |
| TUI implementation | `tui.UI` struct embeds `*common.UI` | `tui/tui.go:26-33` |
| stdout implementation | `CreateStdoutUI()` factory | `stdout/stdout.go:387-407` |
| report/export | `CreateExportUI()` factory | `report/export.go:375-381` |
| Device pkg | `device.Getter` interface | `pkg/device/dev.go` |
| `internal/common` usage | Imported by `cmd/gdu/app/app.go`, `tui/tui.go`, `pkg/analyze/analyzer.go` | `cmd/gdu/app/app.go:20` |
| `pkg/analyze` structure | `BaseAnalyzer`, `File`, `Dir` types | `pkg/analyze/analyzer.go:11-26` |
| `pkg/fs` structure | `Item` interface, sorters | `pkg/fs/file.go:31-177` |
| Build info | Version/Time/User constants | `build/build.go` |

## Answers to Protocol Questions

### 1. Why are folders organized this way?

Gdu uses a **layered architecture** with clear separation:
- **`cmd/gdu/`** — Application entry point and CLI flag parsing
- **`cmd/gdu/app/`** — Application orchestration (mode selection, UI creation, flag application)
- **`tui/`**, **`stdout/`**, **`report/`** — Output/presentation layers, each independently testable
- **`pkg/`** — Business logic packages that are reusable (analyzer, filesystem types, device info, time filtering, path handling)
- **`internal/common/`** — Shared interfaces (`Analyzer`, `UI`, `TermApplication`) used across layers

The separation enables:
- TUI, stdout, and report exporters to be swapped without touching business logic
- The analyzer to be tested independently of any UI
- Clear dependency flow: CLI → App → UI → Analyzer → Filesystem types

### 2. What belongs in `cmd/` vs `internal/` vs `pkg/`?

| Directory | Purpose | Examples |
|----------|---------|----------|
| `cmd/gdu/` | CLI entry point, flag definitions, main execution | `main.go`, `app/app.go` |
| `pkg/` | Public business logic, reusable packages | `analyze/`, `fs/`, `device/`, `remove/` |
| `internal/` | Shared internal interfaces/types used by multiple packages | `internal/common/` ( Analyzer, UI, TermApplication interfaces) |
| `tui/`, `stdout/`, `report/` | Output/presentation | TUI display, text output, JSON export |

The `internal/` directory contains test helpers (`testdir`, `testdev`, `testapp`, `testanalyze`, `testdata`) which are properly scoped testing utilities.

### 3. Is the CLI layer thin?

**Yes.** `cmd/gdu/main.go` (286 lines) only:
- Defines cobra command and ~40 flags (`cmd/gdu/main.go:46-111`)
- Handles config file loading (`cmd/gdu/main.go:119-144`)
- Sets defaults and log file (`cmd/gdu/main.go:146-168`, `200-240`)
- Creates `App` struct and calls `a.Run()` (`cmd/gdu/main.go:269-279`)

All business logic—path analysis, UI rendering, device listing—is delegated to `cmd/gdu/app/app.go` or lower layers.

### 4. Where does business logic actually live?

**`pkg/analyze/`** — Directory scanning, file size calculation, progress tracking, storage backends (SQLite, BadgerDB).

**`pkg/fs/`** — Filesystem item interface (`Item`), sorting logic, hard-link tracking.

**`pkg/device/`** — Mount point detection per OS (`dev_linux.go`, `dev_freebsd_darwin_other.go`, etc.).

**`pkg/annex/`** — Git-annex file size handling.

**`pkg/remove/`** — File deletion logic.

**`pkg/timefilter/`** — Time-based file filtering by mtime.

**`pkg/path/`** — Path manipulation.

### 5. How do they prevent package coupling?

1. **Interfaces in `internal/common/`** — `Analyzer`, `UI`, `TermApplication` are defined once and implemented by multiple packages. This breaks circular dependencies.

2. **UI interface in `app/app.go`** — The `UI` interface (`cmd/gdu/app/app.go:30-49`) defines what the app expects from any UI implementation. TUI, stdout, and report all implement this same interface.

3. **Dependency injection** — `App` struct receives `Getter device.DevicesInfoGetter` and `PathChecker func(string) (fs.FileInfo, error)` as fields (`cmd/gdu/app/app.go:187-189`), allowing easy mocking.

4. **No cross-repo access** — This analysis only accessed files within `/repos/gdu/`.

## Architectural Decisions

| Decision | Rationale | Tradeoff |
|----------|-----------|----------|
| UI interface abstraction (`cmd/gdu/app/app.go:30-49`) | Allows TUI, stdout, and report to be swapped; enables testing with mock UIs | Extra indirection; requires maintaining interface compatibility |
| `internal/common/` for shared interfaces | Go's `internal` package restricts visibility; shared types avoid duplication | `internal/common` imports `pkg/fs` which could create pressure to move more into `internal` |
| Analyzer as interface (`internal/common/analyze.go:25-35`) | Enables multiple implementations (stored, sequential, parallel) | Requires interface method calls rather than direct function calls |
| `tui/`, `stdout/`, `report/` as top-level packages | UI layers are large and clearly scoped; not "reusable library" code | Deviates from `pkg/ui` convention some Go projects use |
| `device.Getter` interface | Platform-specific mount detection abstracted; testable on all platforms | Requires interface method calls |

## Notable Patterns

1. **Factory pattern for UIs** — `tui.CreateUI()`, `stdout.CreateStdoutUI()`, `report.CreateExportUI()` all return `UI` interface. Selection happens in `app.createUI()` (`cmd/gdu/app/app.go:360-431`).

2. **BaseAnalyzer struct with embedded progress channels** (`pkg/analyze/analyzer.go:11-26`) — Common progress tracking logic reused by all analyzer variants (stored, sequential, parallel).

3. **Option functions for TUI configuration** (`cmd/gdu/app/app.go:434-561`) — `getOptions()` returns `[]tui.Option` func closures for incremental TUI configuration, avoiding massive constructor.

4. **SignalGroup for graceful shutdown** (`internal/common/signal.go`) — Cooperative goroutine signaling.

## Tradeoffs

- **Interface-heavy design** adds indirection but enables testability and multiple implementations. The `Analyzer` interface at `internal/common/analyze.go:25` is implemented by `BaseAnalyzer` (`pkg/analyze/analyzer.go`), `stored.go`, `sequential.go`, `parallel.go`.
- **`internal/common/ui.go`** mixes UI configuration (colors, filters) with the `Analyzer` reference. This couples analyzer lifecycle to UI state somewhat.
- **`tui/` imports `pkg/analyze`** but also has its own event handling, key bindings, and display logic. The package is large (35+ files) but cohesive.
- **`build/build.go`** only contains version metadata—not a substantial package, but correctly scoped.

## Failure Modes / Edge Cases

- **Config file permission errors** are logged but don't stop execution (`cmd/gdu/main.go:242-244`).
- **Missing path** is checked via `PathChecker` before analysis (`cmd/gdu/app/app.go:613-616`).
- **Windows/Plan9 limitations** force `ShowApparentSize=true` (`cmd/gdu/app/app.go:249-251`).
- **Empty analyzer** (no storage or scanning) would cause `ui.Analyzer` to be nil if not properly set; the `UI` interface assumes analyzer is always set.
- **Time filter** requires both flag parsing AND `setTimeFilters()` call—order matters.

## Future Considerations

- The `internal/common/ui.go` struct embeds `Analyzer` directly. If analyzer needed to be swapped at runtime (e.g., switching from parallel to sequential), this would require careful state management.
- The `tui/` package is the largest at ~35 files. If the project grows, it could merit splitting into `tui/views/`, `tui/events/`, etc.
- No evidence of plugin/extension system. Current architecture would support adding new `pkg/` packages but not runtime extension.

## Questions / Gaps

- **`build/build.go`** is minimal (3 constants). Is this sufficient for version reporting, or should it include git commit SHA?
- **`report/import.go`** reads JSON but no evidence of validation against a schema. malformed input could cause panics?
- **`pkg/device/`** uses different implementations per OS but the interface is narrow (`DevicesInfoGetter`). Could more device properties be abstracted?
- **`internal/common/const.go`** not examined; may contain constants that should be documented.

---

Generated by `study-areas/01-project-structure.md` against `gdu`.