# Repo Analysis: k9s

## Extensibility & Plugin Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | k9s |
| Path | `repos/k9s` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

k9s implements a multi-layered extensibility system: external plugins via YAML config files + shell execution, internal command/viewer registration via Go code, and dynamic resource discovery via the Kubernetes API. Extension is a first-class concern. The plugin system uses external executables rather than in-process Go plugins, which keeps the internal API boundaries clean but limits plugin sophistication.

## Rating

**7/10 — Well-designed modularity**

k9s has a thoughtfully designed plugin system that anticipates extension. The separation between external plugins (YAML-based, subprocess execution) and internal viewers (Go registration) is clean. Resource meta-discovery runs dynamically against the API server. The main limitation is that plugin API versioning is absent — no negotiation or compatibility layer exists.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Plugin config struct | `Plugin` struct with Scopes, Args, ShortCut, Command, Inputs | `internal/config/plugin.go:53-67` |
| Plugin input types | `PluginInputType` constants (string, number, bool, dropdown) | `internal/config/plugin.go:34-41` |
| Plugin validation | `Validate()` method checks duplicate names, default values | `internal/config/plugin.go:82-112` |
| Plugin loader | `Load()` loads from global config, cluster config, XDG dirs | `internal/config/plugin.go:122-148` |
| Plugin file loading | `load()` validates via JSON schema | `internal/config/plugin.go:150-207` |
| Plugin directory walking | `loadDir()` walks YAML files recursively | `internal/config/plugin.go:209-231` |
| Plugin execution | `executePlugin()` with env var substitution | `internal/view/actions.go:206-265` |
| Plugin input dialog | `ShowPluginInputs()` modal for user input collection | `internal/ui/dialog/plugin_inputs.go:28-182` |
| Command interpreter | `Interpreter` parses command input | `internal/view/cmd/interpreter.go:16-315` |
| Command execution | `Command.run()` dispatches to viewer | `internal/view/command.go:175-242` |
| Viewer registration | `loadCustomViewers()` registers all built-in viewers | `internal/view/registrar.go:10-21` |
| Core viewers registration | `coreViewers()` registers namespace, pod, svc, node, etc. | `internal/view/registrar.go:29-60` |
| Resource registry | `Meta` struct tracks GVR metadata | `internal/dao/registry.go:61-69` |
| Resource discovery | `LoadResources()` queries server preferred + CRDs | `internal/dao/registry.go:162-177` |
| Alias resolution | `Resolve()` maps command aliases to GVRs | `internal/dao/alias.go:85-107` |
| Hotkey loading | `HotKeys.Load()` loads from global + context files | `internal/config/hotkey.go:39-76` |
| JSON schema validation | Plugin schema validation ensures config structure | `internal/config/json/schemas/plugin.json:1-49` |
| Built-in plugins | 51 YAML plugin definitions in `plugins/` dir | `plugins/:1-51` |

## Answers to Protocol Questions

### 1. Can new commands be added cleanly?

**Yes, via two mechanisms:**

- **External plugins** (YAML): Drop a YAML file into `~/.config/k9s/plugins/`, `~/.local/share/k9s/plugins/`, or the cluster-context config. The plugin is loaded automatically and made available via shortcut or command. No code changes required. Evidence: `internal/config/plugin.go:122-148` shows `Load()` scanning XDG dirs.

- **Internal viewers** (Go code): Add to the appropriate `*Viewers()` function in `internal/view/registrar.go` (e.g., `coreViewers()`, `appsViewers()`). Requires a rebuild, but the registration pattern is uniform — map a GVR to a `MetaViewer{viewerFn: NewXxx}`. Evidence: `internal/view/registrar.go:29-60`.

The external plugin path is the cleanest for end users; the internal path is for core feature additions.

### 2. Is extension anticipated?

**Yes, explicitly.** The plugin directory (`plugins/`) contains 51 pre-built plugin YAML files. The `Plugin` struct (`internal/config/plugin.go:53-67`) supports scopes (which views activate the plugin), input fields (user prompting), background execution, output overwrite, and dangerous-command confirmation. The system was designed for extension from the ground up.

### 3. Are interfaces stable?

**Partially.** The YAML plugin schema has no versioning — plugins must conform to the current schema structure. Schema validation failures produce warnings but do not halt loading (`internal/config/plugin.go:158-164`), suggesting graceful degradation over breaking changes. However, there is no formal API stability contract for plugins. The internal Go interfaces (`Viewer`, `ResourceViewer`, `Component` in `internal/model/types.go` and `internal/view/types.go`) are not semver-protected; breaking changes would affect any in-tree extension code.

### 4. Are internal APIs modular?

**Yes.** The codebase is organized into focused packages: `internal/config/` (settings), `internal/dao/` (data access), `internal/view/` (UI), `internal/model/` (contracts), `internal/ui/` (dialogs/widgets), `internal/watch/` (watch factory). Key interfaces like `Viewer` (`internal/view/types.go:59-71`) and `ResourceViewer` (`internal/view/types.go:81-102`) are small and focused. `internal/` packages are not exported; only `cmd/` and top-level packages are importable externally.

## Architectural Decisions

1. **Subprocess-based plugins, not in-process Go plugins.** k9s plugins are external executables invoked via `exec.Command`. This avoids Go plugin ABI complexity and version conflicts, at the cost of not being able to call back into k9s internals from plugins directly.

2. **YAML configuration-driven extension.** Plugin definitions are data (YAML), not code (Go). This means non-developers can add functionality, but also that plugins cannot introduce new UI components — only augment existing ones with external tool invocations.

3. **Kubernetes-native resource discovery.** Rather than hardcoding all Kubernetes resource types, k9s queries the API server at startup to discover available CRDs and resources (`internal/dao/registry.go:162-177`). This makes k9s automatically compatible with new CRDs without code changes.

4. **Registration pattern for viewers.** All built-in viewers are registered via `loadCustomViewers()` in `registrar.go`, which populates a `MetaViewers` map keyed by GVR strings. This is a simple, predictable pattern — adding a new viewer is one map entry.

5. **Schema validation with graceful degradation.** Plugin YAML files are validated via JSON schema. Validation failures produce warnings but do not prevent k9s from starting (`internal/config/plugin.go:158-164`). This tolerates misconfiguration without breaking the CLI.

## Notable Patterns

- **Plugin scoping** (`internal/config/plugin.go:55`): Plugins declare `Scopes []string` to limit which views they are available in — e.g., only in "pod" view or "node" view.

- **Variable substitution in plugin args** (`internal/view/actions.go:206-265`): Plugin arguments support `$NAME`, `$NAMESPACE`, `$CONTEXT`, `$CLUSTER`, `$CURRENT`, `$FILTER`, `$SEL`, `$MARKED`, `$TIMEOUT`, and `$LLOC` — automatic environment variable injection at execution time.

- **Hotkey + plugin binding**: Actions can be bound to keyboard shortcuts (`internal/ui/action.go:32-37`), making plugins accessible via key chords as well as command names.

- **Alias system** (`internal/dao/alias.go:85-107`): Short aliases map to fully-qualified GVR strings, enabling commands like `k9s> p` for pods.

- **Composite interfaces for viewers** (`internal/model/types.go:91-99`): The `Component` interface composes `Primitive`, `Igniter`, `Hinter`, `Commander`, `Filterer`, `Viewer` — a compositional approach rather than deep inheritance.

## Tradeoffs

- **Subprocess model limits plugin power.** Plugins cannot hook into k9s internals — they cannot add new UI panels, extend the data model, or intercept events. They can only invoke external commands with injected context. This is a deliberate simplicity trade-off.

- **No plugin API versioning.** Plugin authors have no stability guarantee. Schema changes in k9s upgrades could break plugins silently (though graceful degradation softens this).

- **Dynamic resource discovery is server-dependent.** The CRD-based auto-discovery (`internal/dao/registry.go:162-177`) requires connectivity to the cluster and depends on server-side CRD availability.

- **Viewer registration requires recompilation.** New built-in viewers must be added in Go code and recompiled — no external registry for adding new Kubernetes resource type viewers.

## Failure Modes / Edge Cases

- **Invalid plugin YAML silently ignored** (`internal/config/plugin.go:158-164`): Schema validation errors produce `slog` warnings but do not fail the load. Users may not realize their plugin is misconfigured.

- **Plugin name collisions** (`internal/config/plugin.go:82-88`): `Validate()` catches duplicate input names, but duplicate plugin names across multiple files would overwrite each other in the `Plugins` map (`internal/config/plugin.go:26`).

- **Stale shortcuts**: Plugins can register shortcuts that conflict with built-in hotkeys. No conflict detection exists at load time; the last-loaded plugin wins.

- **Orphaned hotkeys**: If a plugin is removed or renamed, its associated hotkey binding remains until manually cleaned up.

- **XDG dir scanning is opt-in via `loadExtra`** (`internal/config/plugin.go:135`): By default, only the global and context-level plugin files are loaded. XDG directories require `loadExtra=true` — users may not realize plugins in `~/.local/share/k9s/plugins/` are not loading.

## Future Considerations

- **Plugin API versioning**: A `version` field in the plugin schema with compatibility negotiation would give plugin authors a stability contract.

- **In-process plugin support**: Adding a Go plugin ABI option (via `plugin.Open`) would allow plugins to provide custom viewers or extend data models, not just external commands.

- **Conflict detection**: Static analysis of shortcut collisions at load time could prevent ambiguous bindings.

- **Plugin manifest listing**: A `k9s plugin list` command to show all loaded plugins with their scopes and shortcuts would improve discoverability.

## Questions / Gaps

- **No evidence found** for a formal deprecation policy for internal APIs. The `internal/` package convention is implicit, not enforced.

- **No evidence found** for a public SDK or external API documentation for embedding or extending k9s programmatically.

- **No evidence found** for plugin lifecycle callbacks (e.g., `on-enter`, `on-exit` hooks). Plugins have `pre-`/`post-` execution context but no structured lifecycle events.

- **No evidence found** for plugin sandboxing — plugins run with the same permissions as the k9s process.

---

Generated by `study-areas/12-extensibility.md` against `k9s`.