# Repo Analysis: restic

## Extensibility & Plugin Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | restic |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/restic` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

restic is a backup CLI with a deliberately closed extension model. New commands cannot be added without modifying source code. The primary extension mechanisms are: (1) compile-time backend registration via `location.Factory` interface (`internal/backend/location/registry.go:32-38`), (2) runtime option injection via struct tags and reflection (`internal/options/options.go:146-219`), and (3) feature flags for staged API evolution (`internal/feature/registry.go:7-26`). There is no plugin loader, no dynamic loading, and no public third-party extension API. The codebase is well-modularized internally with clear internal/exported boundaries, but external extensibility is intentionally limited.

## Rating

**4 / 10** — Some extension points (backend factory registry, option system, feature flags), but no plugin architecture or dynamic loading. Third parties cannot extend the CLI without forking.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Backend Factory interface | `type Factory interface { Scheme(), ParseConfig(), StripPassword(), Create(), Open() }` | `internal/backend/location/registry.go:32-38` |
| Backend registration | `backends.Register(azure.NewFactory())` etc. | `internal/backend/all/all.go:18-26` |
| Option registration | `options.Register("s3", Config{})` pattern | `internal/backend/s3/config.go:55` |
| Option parsing and application | Reflection-based `Options.Apply()` | `internal/options/options.go:146-219` |
| Feature flag system | `Flag.Enabled()`, `Flag.SetFlags()` with Alpha/Beta/Stable states | `internal/feature/features.go:60-113` |
| Feature flag definitions | 7 named flags with type and description | `internal/feature/registry.go:7-26` |
| Command registration | `cmd.AddCommand(newBackupCommand(...), ...)` in `newRootCommand()` | `cmd/restic/main.go:77-106` |
| Command groups | `cmdGroupDefault`, `cmdGroupAdvanced` with `GroupID` | `cmd/restic/main.go:34-35,73` |
| Extended options listing | `options.List()` command output | `cmd/restic/cmd_options.go:27-38` |
| Shell completion generation | `cmdRoot.GenBashCompletion()`, `GenZshCompletion()` etc. | `cmd/restic/cmd_generate.go:135-159` |
| Debug commands (build-tag gated) | `registerDebugCommand()` with `//go:build debug` | `cmd/restic/cmd_debug.go:1,35-39` |
| Mount/FUSE subsystem | Separate `internal/fuse/` package | `internal/fuse/dir.go` (dir listing) |
| Cobra command pattern | Every command is a `func newXxxCommand(*global.Options) *cobra.Command` | `cmd/restic/cmd_backup.go:35` |
| Backend wrapper mechanism | `BackendWrapper func(r backend.Backend) (backend.Backend, error)` | `internal/global/global.go:43` |
| Unwrapper interface | `type Unwrapper interface { Unwrap() Backend }` | `internal/backend/backend.go:104-107` |
| BackendAs type-safe cast | `func AsBackend[B Backend](b Backend) B` generic | `internal/backend/backend.go:109-124` |
| FreezeBackend interface | `Freeze()`/`Unfreeze()` for maintenance windows | `internal/backend/backend.go:126-132` |
| ApplyEnvironmenter interface | `ApplyEnvironment(prefix string)` for config from env | `internal/backend/backend.go:140-143` |

## Answers to Protocol Questions

### 1. Can new commands be added cleanly?

**No.** Commands are added by writing a new `cmd_restic/cmd_*.go` file with a `func newXxxCommand(*global.Options) *cobra.Command` and adding it to the `cmd.AddCommand(...)` call in `main.go:77-106`. There is no plugin or registry mechanism — the command list is statically compiled. A third party would need to fork and modify `main.go` to add commands.

### 2. Is extension anticipated?

**Minimally.** The codebase shows no evidence of a plugin system or dynamic loading. Extension is an afterthought rather than a first-class concern. The evidence is:
- No `plugin` or `extension` packages exist
- No dynamic symbol loading (`dlopen`, `plugin` package)
- No external script hooks (only internal test hooks in `internal/global/global.go:591-617`)
- The only "extension points" are the backend factory registry and the option system, both internal

### 3. Are interfaces stable?

**Partially.** The `Backend` interface (`internal/backend/backend.go:19-90`) is stable and well-documented, but there is no formal versioning guarantee. Feature flags use Alpha/Beta/Stable states (`internal/feature/features.go:13-22`) to gate incomplete features. The `Factory` interface at `internal/backend/location/registry.go:32-38` is used internally but not exposed as a stable public API. The option system uses struct tags and reflection (`internal/options/options.go:146`) which is brittle for external adoption.

### 4. Are internal APIs modular?

**Yes.** The codebase has clear internal package boundaries enforced by Go's internal package rule. Key modular elements:
- `internal/backend/` — self-contained backend interface + implementations (s3, azure, local, etc.)
- `internal/repository/` — repository logic separate from backend
- `internal/restic/` — core types and interfaces
- `cmd/restic/` — CLI layer with all commands
- The `Unwrapper` interface (`internal/backend/backend.go:104-107`) and `AsBackend[B]` generic (`internal/backend/backend.go:109-124`) allow layered wrapper backends (retry, logging, limiter) without the core knowing

## Architectural Decisions

1. **No plugin architecture** — restic opts for a monolith with compile-time backend selection. This simplifies distribution but prevents third-party extension.

2. **Backend factory registry** — `location.Registry` with `Register()`/`Lookup()` provides a registry pattern for backends (`internal/backend/location/registry.go:11-30`), but it is used only for built-in backends, not third-party plugins.

3. **Generic factory pattern** — `genericBackendFactory[C, T]` (`internal/backend/location/registry.go:40-66`) uses Go generics to reduce boilerplate for backend implementations.

4. **Feature flags with lifecycle states** — `Alpha`/`Beta`/`Stable`/`Deprecated` states (`internal/feature/features.go:13-22`) allow staged rollout of behavior changes without interface versioning.

5. **Option injection via struct tags** — `option` struct tags + reflection in `Options.Apply()` (`internal/options/options.go:146-219`) provide a uniform mechanism for `-o` flag parsing across all config structs.

6. **Command grouping** — Cobra groups `cmdGroupDefault` and `cmdGroupAdvanced` (`cmd/restic/main.go:34-35`) separate basic from advanced commands.

7. **Debug build tag** — Debug commands are gated behind `//go:build debug` (`cmd/restic/cmd_debug.go:1`) so they are excluded from release builds.

8. **Wrapper backends** — Multiple wrapper layers (retry, limiter, logger, sema) wrap the underlying backend via the `Unwrapper` interface, creating a decorator chain.

## Notable Patterns

- **Decorator/Wrapper pattern** for backends: `retry/backend_retry.go`, `backend/limiter/`, `backend/logger/`, `backend/sema/`, each wrapping via `Unwrapper`
- **Compile-time feature selection** via build tags (e.g., `cmd_mount_disabled.go`, `cmd_self_update_disabled.go`)
- **Structured error types** with `errors.IsFatal()`, `errors.Is()` for error chain inspection (`internal/errors/`)
- **Backend test hooks** `BackendTestHook` and `BackendInnerTestHook` in `global.Options` (`internal/global/global.go:72`) allow test injection without plugin architecture

## Tradeoffs

- **Pro**: Clean internal modularity with well-defined interfaces
- **Pro**: Stable `Backend` interface enables consistent behavior across all storage backends
- **Con**: No plugin system means third parties cannot extend without forking
- **Con**: Backend registration is compile-time only — no runtime discovery
- **Con**: Option system relies on struct tags and reflection, making it fragile for external consumers

## Failure Modes / Edge Cases

1. **Panic on duplicate backend registration** — `Registry.Register()` panics with "duplicate backend" if the same scheme is registered twice (`internal/backend/location/registry.go:22-24`)
2. **Feature flag panic on unknown flag** — `Flag.Enabled()` panics if given an unknown flag name (`internal/feature/features.go:106-112`)
3. **Option key collision panics** — `Options.Apply()` panics if the same `option` tag appears twice in a struct (`internal/options/options.go:162-163`)
4. **No rollback for feature flags** — Once a feature is set via `RESTIC_FEATURES` env var, it cannot be undone within a process

## Future Considerations

1. A plugin architecture would require a loader, plugin manifest schema, and API stability guarantees that do not currently exist
2. The `Factory` interface could theoretically be exposed for third-party backends, but there is no evidence this is planned
3. The option system could be refactored to use code generation instead of reflection for type safety

## Questions / Gaps

1. No evidence of any dynamic loading mechanism (no `dlopen`, `plugin` package usage, no bytecode loading)
2. No evidence of a formal deprecation policy for the `Backend` interface
3. No evidence of a public Go API for external tools to use restic as a library (only internal `repository.Repository`)
4. No evidence of a migration path for third-party backends if the `Factory` interface changes
5. The `feature.Flag` system is global and single-use within a process — no per-command or per-repo feature toggles