# Repo Analysis: helm

## Extensibility & Plugin Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | helm |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/helm` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Helm demonstrates a mature, well-designed plugin architecture supporting multiple plugin types (CLI, getter, postrenderer) across two runtimes (subprocess and WebAssembly/Extism). The `internal/plugin` package provides clean interface boundaries with versioned APIs. New commands can be added via plugins without modifying core code. Extension is a first-class concern with formal plugin types, well-defined metadata schemas, and clear separation between public (`pkg/`) and internal (`internal/`) packages.

## Rating

**8/10** — Well-designed modularity. The plugin system is intentional, versioned, and supports multiple plugin types and runtimes. Clean separation between public SDK and internal implementation. Some limitation: extension primarily through plugins rather than composable modules within the core codebase.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Plugin interface | `Plugin` interface defines `Dir()`, `Metadata()`, `Invoke()`, `PluginHook` for hooks | `internal/plugin/plugin.go:27-50` |
| Runtime interface | `Runtime` interface for creating plugins (`CreatePlugin`) | `internal/plugin/runtime.go:28-34` |
| Plugin loader | `LoadDir` loads plugin from directory by reading `plugin.yaml` | `internal/plugin/loader.go:143-160` |
| CLI plugin loading | `loadCLIPlugins` discovers and adds CLI plugins to cobra command tree | `pkg/cmd/load_plugins.go:55-157` |
| Plugin metadata v1 | `MetadataV1` struct for v1 plugin format with name, type, runtime, version | `internal/plugin/metadata_v1.go:24-48` |
| Subprocess runtime | `RuntimeSubprocess` executes plugins as child processes | `internal/plugin/runtime_subprocess.go:65-79` |
| Extism/WASM runtime | `RuntimeExtismV1` runs plugins as WebAssembly via Extism SDK | `internal/plugin/runtime_extismv1.go:94-122` |
| Plugin types | Plugin type registry (`PluginTypeRegistry`) for type validation | `internal/plugin/plugin_type_registry.go:1-50` |
| Storage driver interface | `Driver` interface with `Creator`, `Updator`, `Deletor`, `Queryor` | `pkg/storage/driver/driver.go:57-105` |
| Postrenderer interface | `PostRenderer` interface for post-render plugins | `pkg/postrenderer/postrenderer.go:30-35` |
| Command registration | `cmd.AddCommand()` registers subcommands in root cmd | `pkg/cmd/root.go:267-303` |
| Action configuration | `Configuration` struct for dependency injection | `pkg/action/action.go:118-146` |
| Internal package boundary | `internal/` contains private implementations; `pkg/` contains public API | `AGENTS.md:1-30` |

## Answers to Protocol Questions

### 1. Can new commands be added cleanly?

**Yes.** CLI plugins are discovered at runtime from `$HELM_PLUGINS` directory and dynamically added to the command tree via `loadCLIPlugins()` in `pkg/cmd/load_plugins.go:55-157`. Plugins implement the `Plugin` interface and are invoked via `plug.Invoke()` with a `Input` message. This happens without any core code modification—the root command at `pkg/cmd/root.go:305-306` calls `loadCLIPlugins(cmd, out)` to integrate plugins.

### 2. Is extension anticipated?

**Yes.** Helm's architecture explicitly anticipates extension through:
- **Plugin types**: `cli/v1`, `getter/v1`, `postrenderer/v1` with formal schemas in `internal/plugin/schema/`
- **Multiple runtimes**: subprocess (legacy-compatible) and WebAssembly/Extism (`internal/plugin/runtime_extismv1.go`)
- **Formal metadata**: `plugin.yaml` with versioned `apiVersion` ("v1" or legacy) parsed by `loadMetadata()` in `internal/plugin/loader.go:91-105`
- **Host functions**: Extism plugins can call back into Helm via declared `HostFunctions` (`internal/plugin/runtime_extismv1.go:80`)
- **Storage extensibility**: `Driver` interface allows alternative backends (`pkg/storage/driver/driver.go:99-105`)

### 3. Are interfaces stable?

**Yes.** Helm maintains backward compatibility as stated in HIP-0004 (referenced in `AGENTS.md`). The `pkg/` directory contains the public API where signatures should not change. The plugin system uses versioned `apiVersion` ("legacy" vs "v1") with conversion functions (`fromMetadataLegacy`, `fromMetadataV1` in `internal/plugin/metadata.go`). Plugin types (`cli/v1`, `getter/v1`, `postrenderer/v1`) provide stable contract points.

### 4. Are internal APIs modular?

**Yes.** Clear `internal/` vs `pkg/` boundary (documented in `AGENTS.md`):
- `internal/plugin/` — private plugin implementation
- `internal/chart/v3/` — next-gen chart format (internal)
- `pkg/action/` — public actions API
- `pkg/cmd/` — CLI command implementations (bridges CLI to actions)
- `pkg/storage/driver/` — pluggable storage drivers

The plugin loader's `prototypePluginManager` (`internal/plugin/loader.go:107-140`) shows modular runtime registration: `RegisterRuntime()` allows adding new runtimes.

## Architectural Decisions

1. **Dual runtime support**: Subprocess (legacy-compatible shell execution) and Extism/WASM (sandboxed). This is a deliberate tradeoff: subprocess is simpler but less isolated; WASM provides security and portability at the cost of complexity.

2. **Plugin type system**:而不是简单的一个插件类型，Helm defines formal plugin types (`cli/v1`, `getter/v1`, `postrenderer/v1`) each with specific input/output message schemas in `internal/plugin/schema/`. This allows type-safe plugin invocations.

3. **Metadata versioning**: The `apiVersion` field in `plugin.yaml` allows backwards compatibility. Legacy plugins are converted to the internal `Metadata` format via `fromMetadataLegacy()` (`internal/plugin/metadata.go:114-130`).

4. **Storage driver abstraction**: The `Driver` interface (`pkg/storage/driver/driver.go:99-105`) allows different backends (Secrets, ConfigMaps, Memory, SQL) to be swapped via `$HELM_DRIVER` environment variable (`pkg/action/action.go:674-711`).

5. **Configuration injection**: Actions receive a `Configuration` struct (dependency injection pattern) rather than global state, enabling testability and alternative configurations (`pkg/action/action.go:118-146`).

## Notable Patterns

- **Request/response plugin invocation**: `Plugin.Invoke(ctx, input)` followed by `output.Message` type-asserted to the expected type—similar to `http.RoundTripper` (`internal/plugin/plugin.go:40-44`)
- **Prototype plugin manager**: `prototypePluginManager` holds a map of runtime factories, registered via `RegisterRuntime()` (`internal/plugin/loader.go:107-131`)
- **Environment variable propagation**: Plugins receive environment via `input.Env` which is merged with Helm's environment (`internal/plugin/runtime_subprocess.go:201-205`)
- **Post-render strategies**: Three strategies (`combined`, `separate`, `nohooks`) handle how hooks and manifests are sent to post-renderers (`pkg/action/action.go:91-116`)
- **Error filter pattern**: `LoadAllDir` accepts an `ErrorFilterFunc` to handle plugin load failures gracefully (`internal/plugin/loader.go:170-200`)

## Tradeoffs

1. **Plugin isolation vs simplicity**: Subprocess plugins are simple but can access the full system; Extism/WASM plugins are sandboxed but require WASM compilation.

2. **Extension vs complexity**: Formal plugin type system adds rigor but increases implementation complexity compared to simple command plugins.

3. **Internal access vs stability**: Despite `internal/` boundary, some plugins may need internal access (e.g., custom chart loaders). The `internal/chart/v3/` package suggests future chart APIs may live internally.

4. **Version compatibility burden**: Supporting legacy plugin format requires conversion code (`fromMetadataLegacy`) and conditional logic throughout the plugin loader.

## Failure Modes / Edge Cases

1. **Plugin naming collisions**: `detectDuplicates()` in `internal/plugin/loader.go:273-289` fails if two plugins claim the same name.

2. **WASM compilation cache**: The wazero compilation cache (`internal/plugin/loader.go:113`) requires filesystem access; cache failures are non-fatal but may degrade performance.

3. **Subprocess termination**: If a subprocess plugin hangs, there is no built-in timeout for the `subprocess` runtime (contrast with `extism/v1` which has a configurable `timeout` in `RuntimeConfigExtismV1`).

4. **Shell expansion in hooks**: Legacy hook commands use `sh -c` expansion which can introduce unexpected behavior (`internal/plugin/metadata.go:177`).

5. **Dynamic completion security**: `pluginDynamicComp()` in `pkg/cmd/load_plugins.go:335-403` executes `plugin.complete` from disk—this is marked as optional but runs with Helm's environment.

## Future Considerations

1. **Extism host function SDK**: Currently limited set of host functions; may expand to allow plugins deeper access to Helm internals.

2. **Chart v3 API stability**: The `internal/chart/v3/` package is under development; its eventual promotion to `pkg/chart/v3/` would be a significant API change.

3. **Plugin signing and verification**: `plugin_verify.go` exists but the signing infrastructure (`internal/plugin/sign.go`, `internal/plugin/verify.go`) suggests future plugin security features.

4. **SQL driver maturity**: The SQL storage driver (`pkg/storage/driver/sql.go`) is available but less battle-tested than Secrets/ConfigMaps drivers.

## Questions / Gaps

1. **No evidence of plugin lifecycle events**: While `PluginHook` interface exists for hooks, there is no evidence of `install`, `upgrade` hooks being called by the action framework (hooks are called in `pkg/action/hooks.go` but plugin hooks are only called from `runHook()` in `pkg/cmd/plugin.go:48-54`).

2. **Completion for non-subprocess plugins**: `pluginDynamicComp()` only supports subprocess plugins (`pkg/cmd/load_plugins.go:338-342`).

3. **Plugin update mechanism**: `newPluginUpdateCmd()` exists but evidence not found for how plugin updates are actually performed (download + replace).

4. **Registry-based plugin distribution**: OCI plugin pull (`pkg/registry/plugin.go`) is implemented but not integrated into the install command flow.

---

Generated by `study-areas/12-extensibility.md` against `helm`.