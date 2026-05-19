# Source Analysis: pocketbase

## Dependency Injection & Composition

### Source Info

| Field | Value |
|-------|-------|
| Name | pocketbase |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/pocketbase` |
| Language / Stack | Go (golang) |
| Analyzed | 2026-05-19 |

## Summary

PocketBase uses a **manual composition pattern** with a large `core.App` interface and embed-based inheritance, not a DI container. Dependencies are created via factory methods on `BaseApp` (e.g., `NewMailClient()`, `NewFilesystem()`), and lifecycle is managed through event hooks (`OnBootstrap`, `OnServe`, `OnTerminate`). Startup ordering is explicit and deterministic within the `Bootstrap()` method. Shutdown ordering is managed via hook priority, though with no transactional guarantee across services.

## Rating

**7/10** — Good implementation with minor issues. The hook-based lifecycle is well-designed, but the monolithic `core.App` interface creates implicit coupling, and the lack of a DI container means service discovery and testing in isolation requires manual construction. The lack of explicit shutdown ordering guarantees is a gap.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| DI Container / Wiring | No DI container. Manual `NewBaseApp(config)` + `Bootstrap()` pattern | `core/base.go:199-232` |
| App Interface | 60+ method `core.App` interface | `core/app.go:28-714` |
| BaseApp struct | Holds all service references as fields | `core/base.go:75-193` |
| Constructor injection | Config passed to `NewBaseApp(BaseAppConfig)` | `core/base.go:199` |
| Service factory methods | `NewMailClient()`, `NewFilesystem()`, `NewBackupsFilesystem()` | `core/base.go:618-699` |
| Bootstrap lifecycle | Explicit init sequence in `Bootstrap()` method | `core/base.go:391-443` |
| Hook system | Generic `Hook[T]` with `Bind`/`Trigger` | `tools/hook/hook.go:54` |
| Event types | `BootstrapEvent`, `TerminateEvent`, `ServeEvent` | `core/events.go:86-137` |
| OnTerminate hook | `OnTerminate() *hook.Hook[*TerminateEvent]` | `core/base.go:817` |
| Serve graceful shutdown | HTTP server shutdown via `OnTerminate` hook priority -9999 | `apis/serve.go:171-195` |
| ResetBootstrapState | Closes DB connections, stops cron | `core/base.go:451-480` |
| Test support | `TestApp` wrapper with `NewTestAppWithConfig()` | `tests/app.go:18-164` |
| UnsafeWithoutHooks | Shallow copy without hooks | `core/base.go:348-355` |
| Transaction support | `RunInTransaction(fn func(txApp App) error)` | `core/app.go:363` |

## Answers to Dimension Questions

### 1. How does the project wire its dependency graph without global state or init() hell?

**No global state.** The entry point is `pocketbase.New()` or `NewWithConfig(Config)` which creates a `PocketBase` struct embedding `core.BaseApp` (`pocketbase.go:101-114`). Configuration flows through `BaseAppConfig` struct (`core/base.go:59-69`) passed to `NewBaseApp(config)` (`core/base.go:199`). All services are fields on `BaseApp` (`core/base.go:75-193`) initialized in `NewBaseApp()` (`core/base.go:200-232`). The `Bootstrap()` method at `core/base.go:391-443` is the single initialization sequence with explicit ordering, but it is invoked lazily (on `Execute()`) unless manually called earlier.

### 2. Are interfaces defined by consumers or producers?

**Interfaces defined by producers (framework).** The `core.App` interface (`core/app.go:28-714`) is a large interface (60+ methods) defined in the core framework. Implementations: `core.BaseApp` (`core/base.go:72`). The interface explicitly states "not intended to be implemented manually by users" (`core/app.go:22-23`). Consumer-defined interfaces exist locally (e.g., `Model` at `core/db_model.go:6`, `FilesManager` at `core/base.go:50`, `mailer.Mailer`).

### 3. How is startup ordering managed when services depend on each other?

**Explicit sequential code in `Bootstrap()`.** The bootstrap sequence is hardcoded in `core/base.go:395-433`:
1. `ResetBootstrapState()` (line 397) — clear previous state
2. `os.MkdirAll(app.DataDir())` (line 402)
3. `initDataDB()` (line 406)
4. `initAuxDB()` (line 410)
5. `initLogger()` (line 414)
6. `RunSystemMigrations()` (line 418)
7. `ReloadCachedCollections()` (line 422)
8. `ReloadSettings()` (line 426)
9. Cleanup temp dir (line 431)

This is deterministic and explicit, not computed from a dependency graph.

### 4. What happens during graceful shutdown — is ordering guaranteed?

**Hook-based with priority ordering, but no transactional guarantees.** The `OnTerminate` hook (`core/base.go:817`) is triggered in `pocketbase.go:212` via `pb.OnTerminate().Trigger(event, ...)`. Handlers are sorted by `Priority` field (`tools/hook/hook.go:99-101`). The graceful shutdown hook in `apis/serve.go:171-195` has priority `-9999` (lowest), cancelling the base context, then calling `server.Shutdown()` with 1 second timeout. `ResetBootstrapState()` at `core/base.go:451` stops the cron and closes DB connections, but runs as part of the same `OnTerminate` chain. No explicit ordering guarantee between services exists beyond priority numbers.

### 5. Can individual services be tested without booting the entire system?

**Partially.** `core.NewBaseApp(config)` creates an app without bootstrapping (`core/base.go:199`). The `tests.TestApp` (`tests/app.go:18`) wraps `BaseApp` and `NewTestAppWithConfig()` (`tests/app.go:94`) bootstraps it for tests. Services like `mailer.Mailer` have test stubs (`tests/mailer.go`). However, since all services are tied to the monolithic `core.App` interface, mocking individual services requires either using `UnsafeWithoutHooks()` (`core/base.go:348`) or constructing a full `TestApp`. Factory methods like `NewMailClient()` create real instances, not mocks, unless overridden via settings.

## Architectural Decisions

1. **Monolithic interface approach** — `core.App` is a 60+ method interface that couples database, cache, mailer, filesystem, cron, subscriptions, and settings. This makes the App boundary explicit but heavy.

2. **Hook-based lifecycle** — Event hooks (`OnBootstrap`, `OnServe`, `OnTerminate`) allow users to intercept and modify behavior without subclassing. Hooks are generic (`Hook[T]`) and support priority-based ordering.

3. **Lazy initialization** — `Bootstrap()` is not called during construction; it is called either explicitly or via `Execute()`. This allows configuration validation before DB connections are opened.

4. **Embed-based composition** — `PocketBase` embeds `core.App` via `BaseApp` (`pocketbase.go:34`), allowing extension without interface implementation.

5. **Config struct pattern** — `BaseAppConfig` (`core/base.go:59`) is the single configuration entry point, with defaults applied in `NewBaseApp()` (`core/base.go:208-226`).

## Notable Patterns

- **Factory methods for service creation** — `NewMailClient()`, `NewFilesystem()`, `NewBackupsFilesystem()` return fresh instances based on current settings (`core/base.go:618-699`)
- **Tagged hooks for filtering** — `OnModelCreate(tags ...string)` uses `hook.TaggedHook` to scope hook execution to specific models/collections (`core/base.go:831-881`)
- **Dual DB pool** — Separate concurrent and non-concurrent DB pools for read/write optimization (`core/base.go:83-86`, `482-578`)
- **Shallow copy for hook isolation** — `UnsafeWithoutHooks()` creates a clone with reset hooks (`core/base.go:348-355`)
- **Event chain with Next()** — Each hook handler must call `e.Next()` to continue the chain (`tools/hook/event.go:30-35`)

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| Monolithic `core.App` interface | Simplifies app instance passing; all services available on one object. But creates implicit coupling — any service that needs the app has access to everything. |
| No DI container | Simple to understand; no reflection magic. But requires manual construction and wiring for tests or custom builds. |
| Hook-based lifecycle | Extensible without inheritance; users can intercept at any phase. But hook ordering via priority can be surprising if not explicitly managed. |
| Lazy `Bootstrap()` | Allows CLI to parse flags before initializing DB. But means the app is only partially initialized after `New()`. |
| SQLite with dual pool | Good performance for single-server deployments. But aux DB is not used for general queries, limiting horizontal scaling. |

## Failure Modes / Edge Cases

1. **Missing `e.Next()` in bootstrap hook** — If a user forgets to call `e.Next()` in an `OnBootstrap` handler, `IsBootstrapped()` returns false even though no error was returned (`core/base.go:438-440`).

2. **Shutdown timeout too short** — The 1-second shutdown timeout in `apis/serve.go:176` may be insufficient for large file uploads or slow database writes.

3. **Hook priority collisions** — Multiple handlers with the same priority have undefined ordering (`tools/hook/hook.go:99-101` uses `sort.SliceStable`).

4. **No rollback on failed migrations** — `RunSystemMigrations()` at `core/base.go:418` runs migrations but there is no rollback mechanism if a later step fails.

5. **Settings reload during operation** — `ReloadSettings()` at `core/app.go:108` can change SMTP config at runtime, affecting in-flight mailer clients.

6. **Temp dir cleanup on Bootstrap** — The temp dir is deleted at the end of `Bootstrap()` (`core/base.go:431`), which could fail silently if permissions are restricted.

## Future Considerations

- Consider a proper DI container (e.g., `wire`, `fx`) for managing service lifecycles in larger deployments.
- Add explicit shutdown ordering with a `Closer` interface pattern.
- Split `core.App` into smaller focused interfaces (e.g., `DatabaseProvider`, `MailerProvider`) to reduce coupling.
- Add timeout configuration for graceful shutdown.

## Questions / Gaps

1. **No evidence found** for module-level initialization order between the `apis` and `core` packages — both are imported directly by `pocketbase.go`.

2. **No evidence found** for a `Close()` / `Shutdown()` method on `BaseApp` itself — `ResetBootstrapState()` is the closest but it doesn't implement any `io.Closer` or similar interface.

3. **No evidence found** for service health checks — the `health` API endpoint (`apis/health.go`) only checks DB connectivity, not the state of mailer, filesystem, or subscriptions.

4. **No evidence found** for background job abstraction — cron is used (`core/base.go:83`) but there is no job queue or worker pool pattern.

---

Generated by `dimensions/02-dependency-injection-composition.md` against `pocketbase`.