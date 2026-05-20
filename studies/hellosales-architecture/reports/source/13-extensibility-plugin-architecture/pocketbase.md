# Source Analysis: pocketbase

## Extensibility & Plugin Architecture

### Source Info

| Field | Value |
|-------|-------|
| Name | pocketbase |
| Path | `sources/pocketbase` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

PocketBase implements extensibility primarily through a **hook-based event system** rather than a traditional plugin architecture. There is no formal plugin discovery, loading, or verification mechanism. Extensions are registered directly via function calls (e.g., `jsvm.MustRegister(app, config)`) during application initialization. The system provides rich hook points throughout the application lifecycle (bootstrap, serve, terminate, model CRUD, HTTP requests, auth, realtime, mailer) but lacks process isolation, sandboxing, and explicit API versioning for third-party extensions.

## Rating

**6/10** — Basic implementation with gaps

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Hook System | `Hook[T]` struct with `Bind`, `BindFunc`, `Trigger` methods | `tools/hook/hook.go:54` |
| Handler Structure | `Handler[T]` with `Func`, `Id`, `Priority` fields | `tools/hook/hook.go:13-32` |
| Tagged Hooks | `TaggedHook[T]` for collection-specific hooks | `tools/hook/tagged.go:30` |
| Event Resolver | `Event` struct with `Next()` chain execution | `tools/hook/event.go:25-35` |
| App Interface | `App` interface with all hook definitions | `core/app.go:28-1200+` |
| Bootstrap Hook | `OnBootstrap() *hook.Hook[*BootstrapEvent]` | `core/app.go:714` |
| Serve Hook | `OnServe() *hook.Hook[*ServeEvent]` | `core/app.go:719` |
| Terminate Hook | `OnTerminate() *hook.Hook[*TerminateEvent]` | `core/app.go:725` |
| Model Lifecycle | `OnModelCreate`, `OnModelUpdate`, `OnModelDelete` hooks | `core/app.go:752-982` |
| Record Lifecycle | `OnRecordCreate`, `OnRecordUpdate`, `OnRecordDelete` proxy hooks | `core/app.go:1021-1107` |
| HTTP API Hooks | `OnRecordCreateRequest`, `OnRecordViewRequest`, etc. | `core/app.go:177-190` |
| JSVM Plugin | `jsvm.Register()` with `HooksDir`, `MigrationsDir` config | `plugins/jsvm/jsvm.go:128-175` |
| JSVM Pool | `vmsPool` with VM reuse for concurrent execution | `plugins/jsvm/pool.go:15-73` |
| MigrateCmd Plugin | Hooks into collection change events for automigrate | `plugins/migratecmd/migratecmd.go:82-86` |
| Panic Recovery | `recover()` in JS hook loader | `plugins/jsvm/jsvm.go:330-340` |
| No Sandbox | Explicit statement about absence of sandbox | `CHANGELOG_16_22.md:321` |

## Answers to Dimension Questions

### 1. How are plugins discovered, loaded, and verified?

**No formal plugin discovery mechanism exists.** Extensions are loaded by direct function call during application initialization:

```go
jsvm.MustRegister(app, jsvm.Config{
    HooksDir: "/path/to/hooks",
    HooksWatch: true,
})
```

- JS hooks are loaded from configurable directories (`pb_hooks` by default) via file pattern matching (`^.*(\.pb\.js|\.pb\.ts)$`)
- Go migrations are loaded via `core.AppMigrations.Register(up, down, file)`
- **No verification** — hooks are loaded and executed without signature checks or code signing
- File watching for auto-reload exists in dev mode (`HooksWatch` config) at `plugins/jsvm/jsvm.go:262-458`

### 2. What extension points exist for custom business logic?

**Extensive hook points** at `core/app.go:709-1200+`:

| Category | Hooks |
|----------|-------|
| App Lifecycle | `OnBootstrap`, `OnServe`, `OnTerminate`, `OnBackupCreate`, `OnBackupRestore` |
| Model Lifecycle | `OnModelValidate`, `OnModelCreate`, `OnModelUpdate`, `OnModelDelete` (with `Execute`, `AfterSuccess`, `AfterError` variants) |
| Record Lifecycle | `OnRecordValidate`, `OnRecordCreate`, `OnRecordUpdate`, `OnRecordDelete` (collection-tagged proxies) |
| Collection Lifecycle | `OnCollectionValidate`, `OnCollectionCreate`, `OnCollectionUpdate`, `OnCollectionDelete` |
| Auth | `OnRecordAuthRequest`, `OnRecordAuthWithPasswordRequest`, `OnRecordAuthWithOAuth2Request`, `OnRecordAuthRefreshRequest`, etc. |
| HTTP API | `OnRecordsListRequest`, `OnRecordViewRequest`, `OnRecordCreateRequest`, `OnRecordUpdateRequest`, `OnRecordDeleteRequest` |
| File Operations | `OnFileDownloadRequest`, `OnFileTokenRequest` |
| Realtime | `OnRealtimeConnectRequest`, `OnRealtimeMessageSend`, `OnRealtimeSubscribeRequest` |
| Mailer | `OnMailerSend`, `OnMailerRecordPasswordResetSend`, etc. |
| Settings | `OnSettingsListRequest`, `OnSettingsUpdateRequest` |

JSVM plugin (`plugins/jsvm/binds.go`) exposes: `$app`, `$dbx`, `$security`, `$os`, `$http`, `$filesystem`, `$filepath`, `$mails`, `$apis`, `$template`, plus `routerAdd`, `routerUse`, `cronAdd`, `cronRemove`.

### 3. How does the system prevent a misbehaving plugin from bringing down the host?

**Minimal isolation — no process or memory sandboxing.**

Evidence:
- Panic recovery in JS hook loader (`plugins/jsvm/jsvm.go:330-340`) catches panics from individual hook files:
```go
defer func() {
    if err := recover(); err != nil {
        fmtErr := fmt.Errorf("failed to execute %s:\n - %v", file, err)
        if p.config.HooksWatch {
            color.Red("%v", fmtErr)
        } else {
            panic(fmtErr)
        }
    }
}()
```
- CHANGELOG explicitly states: "there is no builtin 'sandbox' for what the PocketBase process can execute" (`CHANGELOG_16_22.md:321`)
- JS VM pool (`pool.go`) provides concurrency but no memory isolation
- A misbehaving Go plugin could crash the entire process
- Same-process goroutines share memory with core system

### 4. How are plugin APIs versioned to prevent breakage on upgrade?

**No explicit API versioning mechanism.**

- `core.App` interface is the extension contract but it is **not versioned**
- TypeScript declarations are auto-generated in jsvm (`plugins/jsvm/internal/types/generated/types.d.ts`)
- Breaking changes in the App interface affect all extensions on upgrade
- The hook system relies on type safety rather than semantic versioning
- Migration files are versioned by filename convention (timestamp prefix)

### 5. What debugging and observability exists for plugin execution?

- **Logger integration**: `app.Logger()` accessible in hooks, with error logging at `plugins/jsvm/binds.go:115-119`:
```go
app.Logger().Error(
    "[cronAdd] failed to execute cron job",
    slog.String("jobId", jobId),
    slog.String("error", err.Error()),
)
```
- **Colored output** for JS errors during development (`plugins/jsvm/jsvm.go:335`)
- **HooksWatch** mode watches for file changes and reports errors without restart on Windows
- **No request tracing** or distributed tracing hooks found
- **No metrics** hooks for plugin execution duration/frequency
- **No dedicated debug interface** for inspecting registered hooks

## Architectural Decisions

1. **Hook-based vs. Plugin-based**: PocketBase chose hooks over a plugin architecture. Extensions attach to specific events rather than loading as independent modules. This simplifies the model but shifts burden to extension authors.

2. **Same-process execution**: All JS code runs in the same process via goja (pure Go JS runtime). This enables tight integration but provides no fault isolation.

3. **VM pooling**: The jsvm plugin uses a pool of pre-warmed goja VMs (`plugins/jsvm/pool.go`) rather than creating new VMs per execution. This trades memory for startup latency.

4. **Tagged hooks for filtering**: Rather than different hook types, the same hook serves multiple collections with tag-based filtering (`tools/hook/tagged.go`).

5. **Chain-based hook execution**: Each handler must call `e.Next()` to continue the chain (`tools/hook/event.go`). This allows pre/post hooks and early termination but requires handler authors to follow the contract.

## Notable Patterns

- **Reflective hook binding**: `hooksBinds` at `plugins/jsvm/binds.go:42-102` uses reflection to iterate all `On*` methods on `core.App` and expose them to JavaScript
- **Event proxy pattern**: Record hooks (`OnRecordCreate`) are proxies to model hooks (`OnModelCreate`) with type conversion (`core/events.go:266-296`)
- **Transaction-aware hooks**: `OnModelAfterCreateSuccess` delays execution until transaction commit (`core/app.go:798-812`)
- **Graceful shutdown via hooks**: `OnTerminate` is triggered on SIGTERM (`pocketbase.go:212`)

## Tradeoffs

| Aspect | Tradeoff |
|--------|----------|
| Hooks vs. Plugins | Hooks are simpler but extensions can't ship independent state or background workers easily |
| Same-process JS | Tight integration enables direct app access, but buggy JS can corrupt app state |
| No sandbox | Simplifies implementation, but no protection against malicious or buggy extensions |
| Tagged hooks | Reduces API surface but adds complexity to hook matching |
| Chain execution | Flexible but requires handlers to properly call `e.Next()` |
| No API versioning | Developers can iterate fast, but upgrades may break extensions without warning |

## Failure Modes / Edge Cases

1. **Missing `e.Next()` call**: A hook handler that doesn't call `e.Next()` will silently stop the hook chain, causing requests to hang or data to not persist
2. **Panic in Go plugin**: Since there's no isolation, a panic in a Go plugin crashes the entire PocketBase process
3. **Infinite loop in hooks**: A recursive hook or cron job with short interval can livelock the app
4. **Memory leaks in JS VM**: The VM pool (`pool.go`) pre-warms VMs but doesn't limit total memory usage
5. **Transaction rollback**: If a transaction rolls back after `OnModelAfterCreateSuccess` hooks fired, hooks may have acted on uncommitted data
6. **Race conditions**: Hooks registered during `OnServe` run concurrently with request handling
7. **HooksWatch restart failure**: On Windows, file changes require manual restart; if restart fails silently, state may be inconsistent

## Future Considerations

1. **Plugin API versioning**: Semantic versioning with deprecation cycles would help third-party extensions survive upgrades
2. **Process isolation**: WASM or separate processes for untrusted extensions would improve safety
3. **Signature verification**: Code signing for hook files would prevent tampering
4. **Observability primitives**: Hook execution timing, count metrics, and distributed tracing support
5. **Extension manifest**: A `pocketbase.json` for extensions to declare dependencies and capabilities
6. **Background job API**: Formalized async task system beyond the cron bindings

## Questions / Gaps

- **No formal plugin loading API**: How should external developers distribute extensions?
- **No permission model**: Do JS hooks have access to all app capabilities or is there scoping?
- **No upgrade migration path**: When `core.App` changes, how do extensions migrate?
- **No testing utilities**: Are there testing helpers for extension authors?
- **No isolation for multi-tenant scenarios**: In a multi-tenant deployment, can tenant A's hooks access tenant B's data?

---

Generated by `dimensions/13-extensibility-plugin-architecture.md` against `pocketbase`.
