# Source Analysis: milvus

## Extensibility & Plugin Architecture

### Source Info

| Field | Value |
|-------|-------|
| Name | milvus |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/milvus` |
| Language / Stack | Go + C++ (internal/core/) + Rust (tantivy) |
| Analyzed | 2026-05-20 |

## Summary

Milvus implements a **Go-plugin-based extensibility system** for hooks (authentication, request interception) and a **separate cipher plugin system** for encryption. The architecture uses Go's `plugin.Open()` with a global mutex to load `.so` files at runtime, exposing `hook.Hook`, `hook.Extension`, and `hook.Cipher` interfaces. WAL builders use a compile-time registry pattern. The system supports dynamic configuration reload and panic-on-failure behavior, but lacks sandboxing — plugins share the host process with minimal isolation beyond Go's plugin mutex serialization.

## Rating

**5/10** — Basic implementation with significant gaps. The plugin system exists and is functional for the defined use cases (auth hooks, encryption), but it has no true process isolation, limited debugging tooling, and no formal API versioning scheme. The Go plugin mechanism is inherently fragile and not recommended for production plugins by Go's own maintainers.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Plugin loading | `LoadPlugin[T any]()` uses `plugin.Open()` serialized via `sync.Mutex` | `internal/util/hookutil/plugin.go:18-44` |
| Hook singleton | `GetHook()` / `GetExtension()` via `sync.Once` initialization | `internal/util/hookutil/hook.go:118-141` |
| Default hook | `DefaultHook` struct implements `hook.Hook` with no-op methods | `internal/util/hookutil/default.go:29-53` |
| Default extension | `DefaultExtension` struct implements `hook.Extension` | `internal/util/hookutil/default.go:55-65` |
| Panic on plugin failure | `PanicWhenPluginFail` config controls whether init failure panics | `pkg/util/paramtable/component_param.go:1196-1202` |
| SoPath config for proxy | `proxyConfig.SoPath` ParamItem — path to hook `.so` | `pkg/util/paramtable/component_param.go:1998,2254-2259` |
| Cipher plugin (Go) | `SoPathGo` ParamItem for Go cipher plugin | `pkg/util/paramtable/cipher_config.go:12,26-30` |
| Cipher plugin (C++) | `SoPathCpp` ParamItem for C++ segcore plugin loader | `pkg/util/paramtable/cipher_config.go:13,32-36` |
| Cipher init | `LoadPlugin[hook.Cipher](pathGo, "CipherPlugin")` | `internal/util/hookutil/cipher.go:429` |
| C++ plugin loader init | `C.InitPluginLoader(cSoPath)` for segcore | `internal/util/initcore/init_core.go:780-783` |
| Hook config reload | `WatchHookWithPrefix` registers config change callback | `pkg/util/paramtable/hook_config.go:37-39` |
| WAL builder registry | `builders ConcurrentMap` with `RegisterBuilder()` at init | `pkg/streaming/walimpls/registry/registry.go:10-21` |
| Hook interceptor | `UnaryHookInterceptor` calls `hook.Before()` / `hook.After()` | `internal/proxy/hook_interceptor.go:26` |
| Hook before/after | `hook.Before()`, `hook.After()`, `hook.Mock()` lifecycle | `internal/util/hookutil/default.go:41-51` |

## Answers to Dimension Questions

### 1. How are plugins discovered, loaded, and verified?

Plugins are loaded via **file path** configured in YAML (`proxy.soPath` for hooks, `cipherPlugin.soPathGo`/`cipherPlugin.soPathCpp` for encryption). There is **no automatic discovery** — paths must be explicitly set.

Loading uses Go's `plugin.Open()` (`internal/util/hookutil/plugin.go:29`), which resolves the `.so` file and looks up a named symbol (e.g., `"MilvusHook"`, `"MilvusExtension"`, `"CipherPlugin"`). The returned symbol is **type-asserted** to verify it implements the expected interface (`internal/util/hookutil/plugin.go:39-41`).

A **global mutex** (`pluginMutex`) serializes all plugin loading to prevent "empty pluginpath" panics from concurrent `plugin.Open()` calls (`internal/util/hookutil/plugin.go:13,26-27`).

No cryptographic verification or signature checking exists.

### 2. What extension points exist for custom business logic?

Three extension interfaces are defined in `github.com/milvus-io/milvus-proto/go-api/v3/hook` (external proto package):

- **`hook.Hook`**: `VerifyAPIKey()`, `Init()`, `Mock()`, `Before()`, `After()`, `Release()`. Used for **authentication** (`internal/proxy/authentication_interceptor.go`) and **request interception** (`internal/proxy/hook_interceptor.go`).
- **`hook.Extension`**: `Report()`, `ReportAction()`. Used for **observability/reporting** — called at various points including RESTful responses (`internal/proxy/accesslog/util.go:63`), gRPC method completions (`internal/proxy/impl.go:2835`), etc.
- **`hook.Cipher`**: `Init()`, `GetEncryptor()`, `GetDecryptor()`, `GetUnsafeKey()`. Used for **encryption key management** — manages Encryption Zones (EZ) for CMEK.

Additionally, the **WAL registry** (`pkg/streaming/walimpls/registry/registry.go`) allows compile-time registration of WAL (Write-Ahead Log) builders via `RegisterBuilder()` in `init()` functions.

No public SDK or user-facing plugin authoring story exists beyond implementing the proto interfaces.

### 3. How does the system prevent a misbehaving plugin from bringing down the host?

**Minimal isolation.** Plugins run in the **same Go process** as the host. A panicking plugin will crash the entire Milvus process unless caught.

The only guard is the `PanicWhenPluginFail` config (`pkg/util/paramtable/component_param.go:1196-1202`) — if `true`, a plugin init failure triggers `log.Panic()`. If `false`, it logs a warning and continues with defaults.

The **Go plugin package itself is deprecated** and not recommended for production use. There is no memory isolation, no resource limits, no subprocess separation.

### 4. How are plugin APIs versioned to prevent breakage on upgrade?

**No formal API versioning.** The `hook.Hook`, `hook.Extension`, and `hook.Cipher` interfaces are defined in an external proto package (`github.com/milvus-io/milvus-proto`) but there is no version field or compatibility guarantee in the interface itself. Interface changes are not versioned.

The config system has a `Version` field on `ParamItem` (`pkg/util/paramtable/component_param.go`), but this applies to configuration parameters, not the plugin interface contract.

### 5. What debugging and observability exists for plugin execution?

- **Logging**: `log.Info("loading plugin", ...)` in `internal/util/hookutil/plugin.go:24`; `log.Info("receive the hook refresh event", ...)` on config reload (`internal/util/hookutil/hook.go:88`); `log.Warn("fail to init hook", ...)` on failure (`internal/util/hookutil/hook.go:126`).
- **No per-plugin metrics**: No Prometheus counters, histograms, or traces specific to plugin execution.
- **No plugin health checks**: No mechanism to detect a plugin that has deadlocked or is consuming excessive resources.
- **Atomic singleton storage**: Hooks/extensions are stored in `atomic.Value` containers (`internal/util/hookutil/hook.go:35-36`), preventing safe dynamic updates but also making runtime state inspection difficult.

## Architectural Decisions

| Decision | Rationale | Tradeoff |
|----------|-----------|----------|
| Go `plugin.Open()` for runtime loading | Allows loading custom hooks without recompiling Milvus | Go plugins are deprecated, no isolation, platform-dependent |
| Global `pluginMutex` serializes all loads | Prevents "empty pluginpath" panic from concurrent `plugin.Open()` | Single mutex becomes bottleneck if many plugins loaded |
| `sync.Once` for singleton initialization | Ensures hook/cipher loaded exactly once | Cannot reload plugins without process restart |
| Separate Go + C++ cipher plugins | C++ segcore needs its own plugin via FFI (`InitPluginLoader`) | Two plugin loads must be coordinated |
| Default no-op implementations | `DefaultHook` / `DefaultExtension` provide fallback | Silent failures mask plugin loading problems |
| Configurable panic-on-failure | Allows production resilience vs development verbosity | Inconsistent behavior across deployments |

## Notable Patterns

**Singleton pattern with atomic storage**: Hooks and extensions are stored in `atomic.Value` via container types (`hookContainer`, `extensionContainer`) to avoid type panic when storing different concrete types. Initialization is guarded by `sync.Once`.

**Hook lifecycle**: `Init()` → runtime `Before()`/`After()` calls per request → `Release()`. The `Mock()` method allows short-circuiting requests entirely.

**Encryption Zone (EZ) abstraction**: `hook.Cipher` manages encryption at the database/collection level, abstracting KMS details from the core. Cipher config uses special keys like `CipherConfigCreateEZ`, `CipherConfigRemoveEZ`.

**WAL builder registry**: Compile-time registration via `init()` functions with panic on duplicate names. Uses `typeutil.ConcurrentMap` for thread-safe access.

## Tradeoffs

1. **No process isolation** — A buggy or malicious plugin can corrupt Milvus memory, crash the process, or exhaust resources. Go plugins provide no sandboxing.
2. **No plugin lifecycle management** — Once loaded, plugins cannot be unloaded or updated without restarting the entire Milvus process.
3. **Go plugin deprecation** — The Go team has effectively abandoned the plugin package; it lacks cross-platform support and has known issues.
4. **No observability beyond logs** — No structured metrics or tracing for plugin performance impact.
5. **Interface versioning absent** — Upgrading Milvus can break custom plugins if `hook.Hook` interface changes.
6. **Mutex serialization** — All plugin loads block on a single mutex, preventing parallel plugin initialization.

## Failure Modes / Edge Cases

| Failure | Behavior |
|---------|----------|
| Plugin file doesn't exist | `plugin.Open()` returns error; if `PanicWhenPluginFail=true`, process panics, else logs warning |
| Plugin missing expected symbol | `p.Lookup(symbol)` fails → `fmt.Errorf` returned; panic or warning per config |
| Symbol doesn't implement interface | Type assertion fails → error returned |
| Plugin init returns error | `fail to init configs for the hook, error: %s`; panic or warning per config |
| Cipher plugin missing during encryption | `ErrCipherPluginMissing` returned at DB creation time (`internal/util/hookutil/cipher.go:216`) |
| Concurrent plugin loads | `pluginMutex.Lock()` serializes → no crash, but serialized |
| C++ plugin load failure | `HandleCStatus(&status, "InitPluginLoader failed")` → returns error to Go caller |

## Future Considerations

1. **Replace Go plugins** with a more robust mechanism (WASM, subprocess gRPC, or built-in compiled extensions) given Go's plugin deprecation.
2. **Add plugin isolation** via separate processes or WASM to prevent plugin bugs from crashing Milvus.
3. **Implement API versioning** for `hook.Hook` / `hook.Extension` / `hook.Cipher` interfaces with compatibility guarantees.
4. **Add plugin health monitoring** — periodic checks that plugins are still responsive, with automatic unload on failure.
5. **Structured observability** — Prometheus metrics for plugin latency, error rates, and resource usage.

## Questions / Gaps

1. **No evidence found** of a formal plugin SDK or documentation for third-party plugin development beyond implementing the proto interfaces.
2. **No evidence found** of plugin uninstall/reload mechanism — once loaded, plugins appear permanent for the process lifetime.
3. **No evidence found** of plugin permission system or capability-based access control.
4. **No evidence found** of integration tests for the plugin loading mechanism beyond unit tests for `LoadPlugin` and `initHook`.
5. **No evidence found** of a plugin marketplace, catalog, or first-party plugin distribution mechanism.
6. **No evidence found** of graceful plugin degradation — if a plugin fails mid-request, there is no guaranteed recovery path (only panic or warning per config).

---

Generated by `dimensions/13-extensibility-plugin-architecture.md` against `milvus`.