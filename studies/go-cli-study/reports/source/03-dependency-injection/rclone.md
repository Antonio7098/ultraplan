# Repo Analysis: rclone

## Dependency Injection & Wiring

### Repo Info

| Field | Value |
|-------|-------|
| Name | rclone |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/rclone` |
| Group | rclone |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

rclone uses a hybrid DI approach with a central composition root in `cmd/cmd.go`, but relies heavily on global singletons and package-level helper functions rather than constructor injection. Dependencies flow through context values for config and logger, but commands receive filesystem instances via package-level cache lookups. The design prioritizes simplicity and backward compatibility over testability.

## Rating

**4/10** — Some injection but inconsistent. Global state is prevalent, making isolated unit testing difficult. Context-based DI exists for config and logger, but commands themselves receive dependencies through package-level functions accessing globals rather than through explicit injection.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Main entry point | `func main()` calls `cmd.Main()` | `rclone.go:1-2` |
| App composition | `Root.Execute()` after `setupRootCommand()` | `cmd/cmd.go:535-546` |
| Config initialization | `cobra.OnInitialize(initConfig)` runs at startup | `cmd/cmd.go:191` |
| Global config | `var globalConfig *ConfigInfo` with getter fallback | `fs/config.go:14-51` |
| Context-based config | `GetConfig(ctx)` returns from context or global | `fs/config.go:793` |
| Config modification | `AddConfig(ctx)` creates mutable copy in new context | `fs/config.go:820` |
| Global stats | `var globalStats = "global_stats"` constant | `fs/accounting/stats_groups.go:13` |
| Stats retrieval | `GlobalStats()` returns global group stats | `fs/accounting/stats_groups.go:298-301` |
| Cache global | `once`, `c`, `mu` package-level vars | `fs/cache/cache.go:16-21` |
| RC server options | `var Opt Options` global | `fs/rc/rc.go:124` |
| Backend registry | `var Registry []*RegInfo` global | `fs/registry.go:22` |
| Storage interface | `Storage` interface with Get/Set/Delete methods | `fs/config/config.go:71-109` |
| Config function pointers | `ConfigFileGet`, `ConfigFileSet` function pointers | `fs/config.go:20-37` |
| Fs interface | `Fs` interface with List/Put/Mkdir methods | `fs/types.go:16-59` |
| Logger interface | `LoggerFn func(ctx context.Context, sigil Sigil, ...)` | `fs/operations/logger.go:67-70` |
| Logger context | `WithLogger(ctx, logger)` stores in context | `fs/operations/logger.go:147-155` |
| Command helpers | `NewFsFile()`, `NewFsSrc()`, `NewFsDir()` | `cmd/cmd.go:85-176` |
| Command Run functions | `Run:` fields use package-level helpers | `cmd/cmd.go:237-326` |
| Stats construction | `NewStats(ctx)` creates per-request stats | `fs/accounting/stats.go:84-98` |
| Account initialization | `Start(ctx)` sets up token bucket and error counter | `fs/accounting/accounting.go:33-51` |

## Answers to Protocol Questions

### 1. Where are dependencies constructed?

Dependencies are constructed in multiple scattered locations:
- **Global config**: `fs/config.go:14` — `var globalConfig *ConfigInfo` initialized once via `initConfig()` (`cmd/cmd.go:382-482`)
- **Filesystem cache**: `fs/cache/cache.go:16-21` — lazy singleton with `once.Do()` pattern
- **RC server**: `fs/rc/rcserver/rcserver.go:36-47` — `Start()` creates server if enabled
- **Per-command**: Commands call `cmd.NewFsFile()`, `cmd.NewFsSrc()` etc. which invoke `cache.Get(ctx, remote)` to get or create Fs instances (`cmd/cmd.go:85-176`)

### 2. How are services passed around?

Services are passed via:
- **Context values**: `GetConfig(ctx)`, `Stats(ctx)`, `Logger(ctx)` — context carries config, stats, logger
- **Package-level helper functions**: Commands call `cmd.NewFsSrcDst(args)` which internally calls cache lookup
- **Direct package access**: `fs.CountError`, `fs.GlobalStats()` — commands access globals directly

### 3. Is wiring centralized?

**Partially.** The main initialization is in `cmd/cmd.go:initConfig()` which sets up:
- Global config (`fs/config.go:382-482`)
- Logging (`cmd/cmd.go:450-457`)
- Accounting/Stats (`fs/accounting/accounting.go:33-51`)
- RC server (`fs/rc/rcserver/rcserver.go:36-47`)

However, commands themselves wire their own dependencies by calling package-level helpers, not through constructor injection.

### 4. Are globals avoided?

**No.** Globals are prevalent:
- `globalConfig` (`fs/config.go:14`)
- `globalStats` (`fs/accounting/stats_groups.go:13`)
- `fs.Cache` singleton (`fs/cache/cache.go:16-21`)
- `fs.Registry` (`fs/registry.go:22`)
- `fs.Opt` RC options (`fs/rc/rc.go:124`)
- Function pointers `ConfigFileGet`, `ConfigFileSet` (`fs/config.go:20-37`)

### 5. Is initialization explicit?

**Mostly yes.** The `initConfig()` function at `cmd/cmd.go:382-482` explicitly initializes:
- Config file reading
- Logging setup
- Stats accounting
- RC server

However, the `init()` functions in backend packages (`fs/registry.go` line uses register pattern) and the global cache singleton use lazy initialization that is less explicit.

## Architectural Decisions

1. **Global fallback for config**: `GetConfig(ctx)` returns globalConfig when ctx has no config value — this makes context optional but hides dependencies (`fs/config.go:793`)
2. **Function pointers for config storage**: Swappable `ConfigFileGet`/`ConfigFileSet` allow mocking but are package-level globals (`fs/config.go:20-37`)
3. **Cache as singleton**: Fs cache uses `sync.Once` singleton pattern, making it hard to replace in tests (`fs/cache/cache.go:16-21`)
4. **Command helpers instead of injection**: Commands call `cmd.NewFsSrc()` etc. rather than receiving Fs instances — simpler but less testable (`cmd/cmd.go:85-176`)

## Notable Patterns

- **Context propagation for config**: `AddConfig(ctx)` creates copy with different config, propagating down call stack (`fs/config.go:820`)
- **Logger injection via context**: `WithLogger(ctx, logger)` allows per-request logger override (`fs/operations/logger.go:147-155`)
- **Registry pattern**: Backends register via `fs.Register(NewFs, Name)` called from `init()` in each backend package (`fs/registry.go:32-56`)
- **Package-level command construction**: Cobra `Run:` functions invoke package-level helpers rather than using constructor injection

## Tradeoffs

| Aspect | Tradeoff |
|--------|----------|
| Global state | Simpler access, harder to test; hard to replace singletons |
| Context config | Flexible but `GetConfig(ctx)` fallback to global obscures dependencies |
| Package helpers | Commands are simple but tightly coupled to package globals |
| Function pointers | Allows config storage mocking but creates hidden global API |
| Cache singleton | Efficient but unreplaceable in tests |

## Failure Modes / Edge Cases

1. **Test ordering dependency**: `init()` functions in backend packages register themselves; tests may fail if run in wrong order
2. **Global state bleed**: `GlobalStats()` always returns the same global instance; tests can't isolate stats per test
3. **Cache pollution**: Fs cache persists across tests, causing stale filesystem references
4. **Context shadowing**: Code that calls `GetConfig(nil)` silently gets global config instead of error — may hide configuration errors
5. **Config race**: Global config is modified during `initConfig()` but read concurrently by commands without synchronization

## Future Considerations

1. **DI container**: Introduce a composition root with explicit constructor injection for commands
2. **Scoped contexts**: Replace global `globalConfig` with context-only config propagation
3. **Interface injection**: Replace `cmd.NewFsSrc()` helpers with command constructors taking `Fs` interface
4. **Test fixtures**: Provide factory functions that create isolated caches/stats for testing

## Questions / Gaps

1. **No evidence found** for constructor injection pattern — commands don't receive dependencies through constructors
2. **No evidence found** for explicit DI container or factory pattern — composition is implicit in `initConfig()`
3. **Unclear** how backends are tested — do they use real storage or mocks? Evidence suggests heavy reliance on integration tests

---

Generated by `study-areas/03-dependency-injection.md` against `rclone`.