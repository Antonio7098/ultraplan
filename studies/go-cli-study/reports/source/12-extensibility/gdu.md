# Repo Analysis: gdu

## Extensibility & Plugin Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | gdu |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` |
| Group | `12-extensibility` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Gdu is a disk usage analyzer with a hardcoded command structure and no plugin system. Extension is achieved through configuration files, import/export of analysis data (JSON), and database storage backends. The UI is modular with three distinct implementations (TUI, stdout, export) sharing a common interface, but all reside in the same binary. No dynamic loading, no external extension APIs.

## Rating

**4/10** — Some extension points exist (analyzer interface, UI interface), but extension is not a first-class concern. No plugin loader, no command registration API, no versioned interfaces for external consumers. Third parties cannot extend gdu without forking.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| UI interface | `UI` interface defines all common UI operations | `cmd/gdu/app/app.go:30-49` |
| Analyzer interface | `Analyzer` interface defines directory analysis contract | `internal/common/analyze.go:25-35` |
| DevicesInfoGetter interface | Interface for platform-specific device listing | `pkg/device/dev.go:20-23` |
| Item interface | File system item abstraction | `pkg/fs/file.go:31-53` |
| TermApplication interface | Terminal application abstraction | `internal/common/app.go:10-23` |
| Flag configuration | YAML-based configuration with struct embedding | `cmd/gdu/app/app.go:52-106` |
| JSON export/import | Analysis data can be exported to and imported from JSON | `report/export.go`, `report/import.go` |
| Database storage backends | SQLite and BadgerDB storage implementations | `pkg/analyze/stored.go`, `pkg/analyze/sqlite.go` |
| Archive browsing | Zip/tar archive handling as extension point | `pkg/analyze/zipdir.go`, `pkg/analyze/tardir.go` |
| Option pattern for UI | Functional options for UI configuration | `tui/tui.go:113-114` |

## Answers to Protocol Questions

### 1. Can new commands be added cleanly?

**No.** New commands require modifying `cmd/gdu/main.go:32-43` where `rootCmd` is defined via Cobra. The command structure is hardcoded with no registry or plugin mechanism. Adding a new command means editing the main binary.

### 2. Is extension anticipated?

**No.** Evidence:
- No plugin system (`grep -r "plugin"` yields nothing relevant)
- No external extension API
- No dynamic loading mechanisms (no `plugin` package usage, no bytecode loading)
- Configuration is purely file-based (YAML), not programmatic

### 3. Are interfaces stable?

**Partially.** Internal interfaces like `Analyzer` (`internal/common/analyze.go:25-35`) and `UI` (`cmd/gdu/app/app.go:30-49`) exist and are used across multiple implementations. However:
- No versioning scheme for interfaces
- No public API guarantees for external consumers
- Interfaces are internal (under `internal/common/`), not exported for third-party use

### 4. Are internal APIs modular?

**Moderately.** The codebase shows good separation of concerns:
- `pkg/analyze/` — directory analysis implementations
- `pkg/device/` — device listing with platform-specific implementations
- `pkg/fs/` — file system item abstractions
- `tui/` — terminal UI implementation
- `stdout/` — non-interactive stdout UI
- `report/` — export/import functionality

However, the `internal/` packages are not intended for external use, and all code lives in a single repository with no public library API.

## Architectural Decisions

1. **UI interface pattern** (`cmd/gdu/app/app.go:30-49`): Gdu defines a `UI` interface with methods like `AnalyzePath`, `ListDevices`, `ReadAnalysis`, etc. Three implementations exist: TUI (`tui/tui.go`), stdout (`stdout/stdout.go`), and export (`report/export.go`). This is a well-designed internal extension point.

2. **Analyzer interface pattern** (`internal/common/analyze.go:25-35`): Multiple analyzer implementations share a common interface. `ParallelAnalyzer` (`pkg/analyze/parallel.go`), `SequentialAnalyzer` (`pkg/analyze/sequential.go`), and `StoredAnalyzer` (`pkg/analyze/stored.go`) all implement `Analyzer`. This allows swapping analyzers via `SetAnalyzer` on the UI.

3. **Functional options for UI configuration** (`tui/tui.go:113-114`): The `Option` type and `CreateUI` with variadic `...Option` pattern allows flexible UI configuration without breaking the interface.

4. **No plugin system**: Gdu is distributed as a single binary with no plugin loader, dynamic library loading, or external API. Extension is limited to configuration file, JSON import/export, and database backends.

5. **Flag-based configuration** (`cmd/gdu/app/app.go:52-106`): All user-facing options are encoded in a `Flags` struct with YAML tags, allowing configuration via config file.

## Notable Patterns

1. **Dependency injection in App** (`cmd/gdu/app/app.go:183-192`): The `App` struct receives dependencies (`Getter`, `PathChecker`, `TermApp`, etc.) via fields rather than hardcoding, enabling testability.

2. **Storage backend abstraction**: `StoredAnalyzer` and `SQLite` implementations allow persistent caching of analysis results, though this is an internal optimization rather than an extension mechanism.

3. **Platform-specific implementations**: Device listing (`pkg/device/dev_linux.go`, `pkg/device/dev_freebsd_darwin_other.go`) uses platform-specific code with shared interface.

## Tradeoffs

1. **Single-binary simplicity vs. extensibility**: Gdu prioritizes single-binary distribution over plugin extensibility. Users cannot add custom commands or behaviors without modifying source.

2. **Internal interfaces vs. public API**: Interfaces like `Analyzer` and `UI` are internal, not exported. This gives implementers freedom to change without compatibility guarantees, but prevents third-party extension.

3. **Configuration-driven vs. programmatic extension**: All user-facing behavior is controlled via flags and YAML config. No programmatic API for external consumers.

4. **No external plugin ecosystem**: Unlike extensible tools (e.g., kubectl with plugins, docker with plugins), gdu has no community extension mechanism.

## Failure Modes / Edge Cases

1. **Analyzer panic** (`pkg/analyze/stored.go:413-437`): `ParentDir` type implements `fs.Item` but panics on all methods, indicating incomplete abstraction when files have no parent directory context.

2. **Config file parsing errors** (`cmd/gdu/main.go:119-125`): Unrecoverable errors in config file cause silent failures with `configErr` logged but not preventing startup.

3. **Global default storage** (`pkg/analyze/stored.go:216-217`): Uses `DefaultStorage` singleton, which creates coupling and potential race conditions in concurrent access scenarios.

4. **No version stability**: No semantic versioning of internal interfaces, making it risky for external consumers to depend on internal packages.

## Future Considerations

1. **Plugin system**: A proper plugin system (similar to kubectl or docker) could enable community contributions without forking.

2. **Public library API**: Exporting key interfaces (`Analyzer`, `Item`, `UI`) with version stability would allow gdu to be used as a library for other tools.

3. **Command registration**: A command registry with built-in discovery could replace hardcoded Cobra commands.

## Questions / Gaps

1. **Why no plugin system?** Given gdu's clean internal abstractions (UI, Analyzer, Item), adding a plugin system would be architecturally straightforward. The decision appears deliberate — prioritizing simplicity over extensibility.

2. **No evidence of external contributors extending functionality**: The codebase shows no evidence of third-party extensions, scripts, or community plugins. This may indicate the tool is sufficiently feature-complete for its scope.

3. **Version stability**: No evidence of deprecation policies, semantic versioning for internal APIs, or breaking change notifications. Internal interfaces could change without notice.

---

Generated by `study-areas/12-extensibility.md` against `gdu`.