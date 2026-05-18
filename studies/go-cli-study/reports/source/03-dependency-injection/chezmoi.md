# Repo Analysis: chezmoi

## Dependency Injection & Wiring

### Repo Info

| Field | Value |
|-------|-------|
| Name | chezmoi |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/chezmoi` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

chezmoi uses a centralized composition root pattern. All dependencies are assembled in `newConfig()` (`internal/cmd/config.go:362`) and passed to commands via a single `*Config` struct that implements `cobra.Command` runner functions as methods. This is a disciplined approach that avoids global state and enables testability.

## Rating

**8/10** — Clear composition root and explicit wiring. The `*Config` struct acts as a central DI container, but some internal packages receive dependencies through package-level functions rather than strict constructor injection.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Centralized Config construction | `newConfig()` in `config.go:362` assembles all dependencies | `internal/cmd/config.go:362` |
| Config struct as DI container | `Config` struct holds all services and is passed to commands | `internal/cmd/config.go:193-291` |
| Command factory methods | `newApplyCmd()`, `newAddCmd()` etc. are methods on `*Config` | `internal/cmd/applycmd.go:16` |
| Interface abstraction for System | `chezmoi.System` interface abstracts filesystem operations | `internal/chezmoi/system.go:25` |
| Interface abstraction for Encryption | `chezmoi.Encryption` interface abstracts encryption backends | `internal/chezmoi/encryption.go:4` |
| context.Context propagation | `applyArgs` and `getSourceState` accept `context.Context` | `internal/cmd/config.go:661, 1679` |
| Lazy HTTP client | `getHTTPClient()` returns lazily-initialized `*http.Client` | `internal/cmd/config.go:1629` |
| Lazy SourceState | `getSourceState()` caches `*chezmoi.SourceState` | `internal/cmd/config.go:1679` |
| Per-command config structs | `applyCmdConfig`, `addCmdConfig` etc. embedded in `Config` | `internal/cmd/applycmd.go:9` |
| No global variables (app code) | `chezmoiDev` map in `cmd.go:31` is the only package-level map | `internal/cmd/cmd.go:31` |
| Version info passed explicitly | `VersionInfo` struct passed from `main.go` to `cmd.Main()` | `main.go:27` |

## Answers to Protocol Questions

### 1. Where are dependencies constructed?

**Centralized in `newConfig()`** (`internal/cmd/config.go:362-621`). The function creates the `*Config` struct, which acts as the DI container. It instantiates:
- `vfs.OSFS` as `fileSystem` (`config.go:460`)
- `*xdg.BaseDirectorySpecification` via `xdg.NewBaseDirectorySpecification()` (`config.go:373`)
- `*slog.Logger` via `slog.Default()` (`config.go:378`)
- Default command configs for each subcommand (e.g., `applyCmdConfig` at `config.go:389-392`)
- Template function map via sprig + customizations (`config.go:386-592`)

### 2. How are services passed around?

**Commands receive `*Config` as their receiver**. Since commands are defined as methods on `*Config` (e.g., `func (c *Config) newApplyCmd() *cobra.Command`), they have direct access to all fields. Run functions like `runApplyCmd` are also methods on `*Config` (`internal/cmd/applycmd.go:41`), so dependencies flow downward from `Config` to command implementations.

### 3. Is wiring centralized?

**Yes**. The `newConfig()` function is the only place where the `Config` struct is constructed. All command factories (`newApplyCmd`, `newAddCmd`, etc.) are called from `newRootCmd()` (`config.go:1949-2006`) which is itself called from `newConfig.execute()` (`config.go:1391`). There is no scattered wire-up across the codebase.

### 4. Are globals avoided?

**Yes, mostly**. The only package-level variables in the cmd package are:
- `chezmoiDev = make(map[string]string)` at `cmd.go:31` — a development-only feature controlled by `CHEZMOIDEV` env var
- Various `var` declarations for flag value slices and regexes (e.g., `archiveFormatValues`, `severityValues`) — these are constants, not mutable state

No global service instances or singleton caches exist. The `Config` struct is created fresh per invocation.

### 5. Is initialization explicit?

**Yes**. The `Config` struct fields are populated directly in `newConfig()`. Lazy initialization is used for expensive resources (HTTP client at `config.go:1629`, SourceState at `config.go:1679`) but is triggered explicitly via getter methods rather than hidden behind package-level `init()` functions.

## Architectural Decisions

### Centralized Composition Root
The `*Config` struct serves as the primary composition root. It holds all mutable state and services. This is a strong pattern that makes dependencies explicit and traceable. Commands are method-based, so they always access dependencies through the receiver.

### Interface Abstraction for Core Services
Two key interfaces abstract core functionality:
- `chezmoi.System` (`system.go:25`) — abstracts filesystem, script execution, and state
- `chezmoi.Encryption` (`encryption.go:4`) — abstracts encryption backends (Age, GPG, transparent)

This enables decoration (e.g., `DebugSystem`, `DebugEncryption` wrapping real implementations) and testing with mock implementations.

### Decorator Pattern for Debug/Verbose Modes
Systems are wrapped conditionally:
- `DebugSystem` wraps `baseSystem` when `c.debug` is set (`config.go:2314-2316`)
- `DebugEncryption` wraps `encryption` when `c.debug` is set (`config.go:2880-2882`)
- `DebugPersistentState` wraps `persistentState` when `c.debug` is set (`config.go:2375-2377`)
- `DebugPersistentState` wraps `persistentState` when debug mode is on

This avoids polluting the core logic with debug checks.

### Annotations-Based Command Classification
Commands use Cobra annotations (`modifiesDestinationDirectory`, `persistentStateModeReadWrite`, etc.) defined in `annotation.go`. The `persistentPreRunRootE` function (`config.go:2235`) reads these annotations to conditionally set up systems and persistent state. This moves configuration logic out of individual commands and into a central handler.

### Per-Command Configuration Structs
Each command has a `*CmdConfig` struct embedded in `Config` (e.g., `apply applyCmdConfig` at `config.go:221`). Default values are set in `newConfig()`, command-line flags bind to these structs, and the structs are passed to command runners. This avoids global flag state.

### Lazy Resource Initialization
Several expensive resources are lazily initialized:
- `httpClient` via `getHTTPClient()` (`config.go:1629`)
- `sourceState` via `getSourceState()` (`config.go:1679`)
- `templateData` via `getTemplateData()` (`config.go:1688`)
- `betterleaksDetector` via `getBetterleaksDetector()` (`config.go:1595`)

## Notable Patterns

- **Option functional constructors**: `newConfig(options ...configOption)` allows callers to modify config before it's finalized (`config.go:363`)
- **Cobra annotations**: Commands declare their requirements via annotations, enabling infrastructure to auto-configure based on declaration rather than imperative logic
- **System/Encryption interfaces**: Core I/O and security are abstracted behind interfaces, enabling testing and debug wrappers
- **Template function registry**: ~90 template functions are registered on `c.templateFuncs` map in `newConfig()` (`config.go:493-592`), each backed by a method on `*Config`
- **RealSystemWithSafe/WithScriptTempDir**: `RealSystem` is configured with options rather than being a raw implementation

## Tradeoffs

- **Large `*Config` struct**: The `Config` struct (~300 lines of field declarations) is a large DI container. Any change to the struct affects many files. This is a common tradeoff for centralized composition.

- **Commands as methods on `*Config`**: This means commands are tightly coupled to `Config`. However, since `Config` is the composition root, this is acceptable — the coupling is to the assembly, not the internals.

- **Some internal packages use package-level defaults**: Packages like `interpreters.go` have `var DefaultInterpreters = NewDefaultInterpreters(chezmoi.FindExecutable)` — this is a minor escape from the DI discipline, though it's used only for defaults that can be overridden via config.

- **Template functions are registered by method closure**: Each template function (e.g., `bitwardenTemplateFunc` at `config.go:498`) captures `c` (the `*Config` receiver). This is a common pattern but means template functions are not independently testable without a `Config` instance.

## Failure Modes / Edge Cases

- **Circular dependencies**: Not possible given the top-down construction in `newConfig()` and method-based commands
- **Config mutation during command execution**: The `Config` struct is used as a receiver for command methods that may mutate it. This is expected but means concurrent command execution from a single `Config` would not be safe (though in practice, CLI tools are single-shot)
- **Missing encryption configuration**: `setEncryption()` (`config.go:2830`) auto-detects encryption based on config file contents, which could lead to surprising behavior if a user expects Age but gets GPG
- **Source state caching**: `getSourceState()` caches the source state (`config.go:1680`). If the source directory changes between commands in the same process, the cached state won't reflect those changes

## Future Considerations

- **Separating interface from implementation**: The `chezmoi.System` and `chezmoi.Encryption` interfaces could be moved to a separate `interfaces.go` to make the contract explicit and reduce import cycles
- **Functional options for command construction**: Rather than embedding `*CmdConfig` structs, commands could receive their config via functional options, reducing coupling between `Config` and command field names
- **Extracting the DI container**: The `Config` struct could be extracted into a dedicated `App` or `Container` struct, with the current `Config` renamed to `RootConfig`, making the distinction between the CLI layer and the core library clearer

## Questions / Gaps

- **No evidence of constructor injection for internal packages**: While `newConfig()` constructs `*Config`, packages like `chezmoigit` are instantiated via `chezmoigit.ParseStatusPorcelainV()` which is a plain function call returning a value, not a service retrieved from the DI container. This is fine for stateless utility packages but suggests not all components follow the same DI pattern.
- **Template function testability**: The ~90 template functions on `Config` are methods that capture the receiver. Testing them in isolation requires a `*Config` instance, which is heavyweight. Consider if any of these could be pure functions with dependencies passed in.
- **No explicit interface for Config**: The `Config` struct is concrete, not an interface. Commands depend directly on `*Config` rather than an interface. This reduces flexibility but is acceptable given the centralized construction.

---

Generated by `03-dependency-injection.md` against `chezmoi`.