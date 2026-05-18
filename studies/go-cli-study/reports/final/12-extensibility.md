# Extensibility & Plugin Design - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Protocol | `study-areas/12-extensibility.md` |
| Groups | go-cli-study |
| Date | 2026-05-15 |

## Repositories Studied

| # | Repo | Path | Group |
|---|------|------|-------|
| 1 | age | `/home/antonioborgerees/coding/go-cli-study/repos/age` | go-cli-study |
| 2 | chezmoi | `/home/antonioborgerees/coding/go-cli-study/repos/chezmoi` | go-cli-study |
| 3 | dive | `/home/antonioborgerees/coding/go-cli-study/repos/dive` | go-cli-study |
| 4 | fzf | `/home/antonioborgerees/coding/go-cli-study/repos/fzf` | go-cli-study |
| 5 | gdu | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` | go-cli-study |
| 6 | gh-cli | `/home/antonioborgerees/coding/go-cli-study/repos/gh-cli` | go-cli-study |
| 7 | go-task | `/home/antonioborgerees/coding/go-cli-study/repos/go-task` | go-cli-study |
| 8 | helm | `/home/antonioborgerees/coding/go-cli-study/repos/helm` | go-cli-study |
| 9 | k9s | `/home/antonioborgerees/coding/go-cli-study/repos/k9s` | go-cli-study |
| 10 | lazygit | `/home/antonioborgerees/coding/go-cli-study/repos/lazygit` | go-cli-study |
| 11 | mitchellh-cli | `/home/antonioborgerees/coding/go-cli-study/repos/mitchellh-cli` | go-cli-study |
| 12 | opencode | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` | go-cli-study |
| 13 | rclone | `/home/antonioborgerees/coding/go-cli-study/repos/rclone` | go-cli-study |
| 14 | restic | `/home/antonioborgerees/coding/go-cli-study/repos/restic` | go-cli-study |
| 15 | urfave-cli | `/home/antonioborgerees/coding/go-cli-study/repos/urfave-cli` | go-cli-study |
| 16 | yq | `/home/antonioborgerees/coding/go-cli-study/repos/yq` | go-cli-study |

## Executive Summary

The 16 studied Go CLI projects exhibit a broad spectrum of extensibility models, ranging from deliberately closed monoliths (dive, restic) to mature plugin ecosystems (helm, rclone). No project achieves maximum extensibility — all involve tradeoffs between simplicity, stability, security, and ecosystem openness. The dominant pattern is **external subprocess execution** for plugins, not in-process Go plugin loading. The field is roughly split between projects that treat extension as a first-class concern (gh-cli, helm, k9s, rclone, opencode, fzf) and those that treat it as secondary or absent (dive, restic, mitchellh-cli, yq).

## Core Thesis

Go CLI extensibility falls into three broad philosophical camps:

1. **Open ecosystem** — Extension is a first-class goal with formal plugin types, versioned APIs, and runtime loading (helm, rclone, gh-cli, k9s)
2. **Configuration-driven extension** — Extension via data files, templates, or config rather than code (chezmoi, lazygit, go-task, fzf)
3. **Closed monolith** — Extension not supported; codebase is a single-purpose tool (dive, restic, mitchellh-cli, yq, gdu, age)

The choice correlates strongly with project maturity, user base size, and operational scope. Projects managing complex domains (cloud storage, Kubernetes, GitHub APIs) invest in plugin systems; single-purpose tools prioritize simplicity.

## Rating Summary

| Repo | Score | Approach | Main Strength | Main Concern |
|------|-------|----------|---------------|--------------|
| age | 8 | Plugin ecosystem via external process | Well-designed v1 plugin protocol with stanza-based communication | No command extension; limited to crypto recipients/identities |
| chezmoi | 5 | External plugins via PATH fallback + template functions | Clean Encryption interface; functional options for SourceState | Monolithic core; PATH fallback is fallback not design |
| dive | 3 | Hardcoded interfaces | Adapter pattern isolates CLI from core | No plugin system; internal package boundary enforced |
| fzf | 7 | Action-binding system + HTTP server | Rich `--bind` action system; first-class extension via external commands | No internal module substitution; custom HTTP server |
| gdu | 4 | Internal interfaces (UI, Analyzer) | Clean UI and Analyzer interfaces | No plugin loader; hardcoded command structure |
| gh-cli | 7 | Extension manager with git/binary/local types | Mature extension system with three types; clean ExtensionManager interface | Static core command tree; no plugin registration API for core commands |
| go-task | 6 | Taskfile inclusion + functional options | Well-designed DAG-based taskfile merging; functional options pattern | No dynamic loading; YAML-only tasks |
| helm | 8 | Dual-runtime (subprocess + WASM/Extism) plugin system | Formal plugin types (cli/v1, getter/v1, postrenderer/v1); versioned metadata | Legacy format conversion burden; complex plugin type system |
| k9s | 7 | YAML-based external plugins + internal viewer registration | 51 built-in YAML plugins; Kubernetes-native CRD discovery; variable substitution | No plugin API versioning; schema validation failures produce warnings only |
| lazygit | 7 | Configuration-driven custom commands | Full template variable resolution; keybinding-centric invocation; config migrations | No new UI panels; no compiled plugins; shell execution overhead |
| mitchellh-cli | 4 | Interface composition at compile time | Factory pattern for lazy instantiation; Ui decorator pattern | No dynamic loading; single package; no schema stability |
| opencode | 7 | MCP-based tool extension | Formal BaseTool interface; MCP client with stdio/SSE; permission layer | Tool-centric limits CLI discoverability; MCP caching requires restart |
| rclone | 8 | Backend plugin via init() + RC HTTP API + Go .so loader | ~75 backend implementations via fs.Register; RC registry; Go plugin loader | Go plugin constraints (same Go version required); large single binary |
| restic | 4 | Backend factory registry + feature flags | Stable Backend interface; decorator/wrapper pattern; feature flag lifecycle | No plugin architecture; compile-time backend registration only |
| urfave-cli | 6 | Interface composition + ValueSource abstraction | ValueSource chain; generic FlagBase template; command tree composition | No dynamic loading; single package exposes internals; no versioning |
| yq | 5 | Format registration via factory functions | Decoder/Encoder interfaces; ExpressionParser interface; StreamEvaluator | No plugin system; command extension requires recompilation |

## Approach Models

### Plugin Ecosystem (First-Class Extension)

**helm** and **rclone** represent the most mature plugin architectures. Both use versioned plugin metadata, multiple runtime support, and registry patterns:
- **helm**: `internal/plugin/plugin.go:27-50` defines `Plugin` interface; `internal/plugin/runtime_subprocess.go:65-79` and `internal/plugin/runtime_extismv1.go:94-122` provide dual runtimes; plugin types are formally validated via `PluginTypeRegistry`
- **rclone**: `fs/registry.go:22` holds `fs.Registry` slice; `fs.Register()` at `fs/registry.go:407` is the primary extension mechanism; `lib/plugin/plugin.go:13-39` loads `.so` files from `$RCLONE_PLUGIN_PATH`; RC API at `fs/rc/registry.go:17-78` provides HTTP-based runtime extensibility

**gh-cli** is close behind: `pkg/extensions/extension.go:18-42` defines `Extension` and `ExtensionManager` interfaces; `pkg/cmd/extension/manager.go:44-56` implements three extension types (git, binary, local); `pkg/cmd/root/root.go:192-203` merges extensions into command tree after core commands.

**k9s** adds YAML-based plugin definitions with scoping and variable substitution: `internal/config/plugin.go:53-67` defines `Plugin` struct; `internal/view/actions.go:206-265` executes plugins with env injection; 51 built-in plugins demonstrate the system's maturity.

### Configuration-Driven Extension

**lazygit**, **go-task**, and **fzf** extend via configuration rather than plugins:

- **lazygit**: `pkg/config/user_config.go:669-692` defines `CustomCommand` struct; commands are triggered via keybindings with template variable resolution (`pkg/gui/services/custom_commands/resolver.go`)
- **go-task**: Taskfiles form a DAG via includes (`taskfile/ast/include.go:14-28`); `ExecutorOption` interface (`executor.go:20-24`) provides functional options for programmatic extension
- **fzf**: `--bind` action system (`src/options.go:2027-2172`) with 100+ action types; `--preview` with placeholder templates; `--listen` HTTP server for remote execution

**chezmoi** uses both PATH fallback (`internal/cmd/cmd.go:224`) and template functions (`internal/cmd/config.go:493-592`), but the PATH fallback is a fallback mechanism rather than a designed extension point.

### Interface-Based Extension (No Dynamic Loading)

**urfave-cli**, **mitchellh-cli**, **yq**, and **opencode** provide extension through Go interfaces and composition without dynamic loading:

- **urfave-cli**: `ValueSource` interface (`value_source.go:11-18`) enables pluggable value resolution; `Flag` interface (`flag.go:91-112`) is the central extension point; `FlagBase[T,C,VC]` generic reduces boilerplate
- **opencode**: `BaseTool` interface (`internal/llm/tools/tools.go:69-72`) is the primary extension mechanism; MCP (`internal/llm/agent/mcp-tools.go:106-129`) provides external tool integration; `Provider` factory pattern (`internal/llm/provider/provider.go:86-168`)
- **yq**: `Format` struct (`pkg/yqlib/format.go:10-112`) holds encoder/decoder factories; `Decoder`/`Encoder` interfaces; `Formats` slice contains all registered formats

### Closed Monoliths

**dive**, **restic**, **gdu**, **mitchellh-cli**, and **age** (for commands) are deliberately closed:

- **dive**: Hardcoded command tree (`cmd/dive/cli/cli.go:46-50`); internal interfaces (`image.Resolver`, `OrderStrategy`) exist but are not extension points
- **restic**: Backend factory registry (`internal/backend/location/registry.go:32-38`) exists but is internal; feature flags provide staged evolution; `cmd/restic/main.go:77-106` is the static command list
- **age**: Plugin system is well-designed (`plugin.Plugin` at `plugin/plugin.go:29-118`) but scoped to recipients/identities only; CLI is monolithic (`cmd/age/age.go:105-321`)

## Pattern Catalog

### Pattern: Subprocess Plugin Isolation

**What**: Plugins are external executables invoked via `exec.Command`, communicating via stdin/stdout or a wire protocol.

**Repos**: age, chezmoi, gh-cli, helm, k9s, lazygit, rclone (partial)

**Why it works**: Process isolation prevents plugin crashes from corrupting host state; enables polyglot plugins; avoids Go plugin ABI constraints.

**When to copy**: When plugin security/isolation matters more than deep integration.

**When overkill**: When plugins need direct access to internal data structures; when startup latency is critical.

**Evidence**: `helm/internal/plugin/runtime_subprocess.go:65-79`; `gh-cli/pkg/cmd/extension/manager.go:113-133`; `k9s/internal/view/actions.go:206-265`

### Pattern: init() Registration

**What**: Backend packages register themselves via `func init()` that calls a central `Register()` function.

**Repos**: rclone, go-task

**Why it works**: Automatic discovery without central registry editing; no explicit enumeration needed.

**When to copy**: When you control all implementations (in-tree only); when lazy loading is not needed.

**When overkill**: When third-party extension is desired; Go's plugin package constraints make this impractical for out-of-tree backends.

**Evidence**: `rclone/fs/registry.go:407`; `rclone/backend/local/local.go:63`; `go-task/taskfile/reader.go:249-405`

### Pattern: Functional Options

**What**: Configuration uses an `Option` interface with `Apply()` methods rather than constructor parameters.

**Repos**: go-task, gdu, opencode

**Why it works**: Additive, backward-compatible API evolution; no breaking constructor signatures; easy to test via `With*` functions.

**When to copy**: When API stability matters; when callers need custom configuration.

**Evidence**: `go-task/executor.go:20-24,91-122`; `gdu/tui/tui.go:113-114`; `opencode/internal/llm/provider/provider.go:74`

### Pattern: Registry Pattern with Global Map

**What**: A package-level `var registry = make(map[string]Factory)` protected by a mutex, populated via `init()` or at startup.

**Repos**: rclone (fs.Registry, rc.Calls), helm (plugin types), gh-cli (extensions), k9s (viewers)

**Why it works**: Simple, thread-safe with mutex protection; late registration supported; easy to enumerate.

**When to copy**: When you need a central lookup with multiple implementers.

**Failure mode**: Silent overwrites on key collision (rclone's `rc.Calls` at `fs/rc/registry.go:47`); no conflict detection.

**Evidence**: `rclone/fs/registry.go:22`; `rclone/fs/rc/registry.go:41-48`; `k9s/internal/view/registrar.go:10-21`

### Pattern: Versioned Schema/Metadata

**What**: Plugin metadata includes an explicit `apiVersion` field; loader handles multiple versions via conversion functions.

**Repos**: helm (v1 vs legacy), age (recipient-v1/identity-v1), go-task (Taskfile semver)

**Why it works**: Backwards compatibility without conditional mess; clear upgrade path; graceful degradation.

**Evidence**: `helm/internal/plugin/metadata_v1.go:24-48`; `helm/internal/plugin/metadata.go:114-130`; `age/plugin/plugin.go:159-167`; `go-task/setup.go:282-316`

### Pattern: Configuration-Driven Extension Without Code

**What**: Users extend functionality by writing config files, not Go code.

**Repos**: lazygit (CustomCommands YAML), go-task (Taskfile YAML), k9s (YAML plugins), fzf (--bind actions)

**Why it works**: Non-developers can extend; config is version-controllable; no recompilation; safe (no code execution).

**Cons**: Cannot add new UI components; limited to predefined extension points.

**Evidence**: `lazygit/pkg/config/user_config.go:669-692`; `k9s/internal/config/plugin.go:53-67`; `fzf/src/options.go:2027-2172`

### Pattern: Adapter/Wrapper Pattern

**What**: A thin wrapper/adapter isolates internal implementations from external consumers.

**Repos**: dive (adapter pattern at `cmd/dive/cli/internal/command/adapter/*.go`), rclone (wrapper backends), mitchellh-cli (Ui decorators)

**Why it works**: Stable CLI-facing API over changing internals; enables testing via mock adapters.

**Evidence**: `dive/cmd/dive/cli/internal/command/adapter/analyzer.go:13-15`; `rclone/fs/fs.go:825-839`

### Pattern: Optional Interface Detection

**What**: Rather than a flat boolean capability map, the codebase defines optional interfaces. `Features.Fill()` detects implementations via type assertion.

**Repos**: rclone

**Why it works**: Clean capability advertising; no nil pointer checks; each backend declares only what it supports.

**Cost**: Adding a new optional interface requires modifying `Features.Fill()`.

**Evidence**: `rclone/fs/features.go:294-370`; `rclone/fs/features.go:505-811`

### Pattern: Dependency Injection via Factory

**What**: Commands receive a `Factory` struct (or `*cmdutil.Factory`) rather than global state.

**Repos**: gh-cli, opencode, helm, restic

**Why it works**: Enables testability; loose coupling; alternative configurations.

**Evidence**: `gh-cli/pkg/cmdutil/factory.go:16-43`; `opencode/internal/app/app.go:25-40`; `helm/pkg/action/action.go:118-146`; `restic/internal/global/global.go:43`

### Pattern: Template Variable Substitution

**What**: Plugin/plugin arguments support placeholders (`$NAME`, `{1}`, `{{.SelectedBranch}}`) that are resolved at execution time.

**Repos**: k9s, lazygit, fzf, go-task

**Why it works**: Plugins receive current context without needing to query the host application; reduces plugin complexity.

**Evidence**: `k9s/internal/view/actions.go:206-265`; `lazygit/pkg/gui/services/custom_commands/resolver.go`; `fzf/src/terminal.go:54-91`; `go-task/internal/templater/templater.go:65-112`

## Key Differences

### Closed vs Open Extension Models

**dive, restic, mitchellh-cli, yq, gdu** are closed: they provide internal interfaces but no mechanism for third-party extension without recompilation. This is a deliberate choice prioritizing simplicity and debuggability over ecosystem openness.

**age, chezmoi** are partially open: plugins exist but are scoped (age: crypto only; chezmoi: PATH fallback is fallback, not design).

**helm, rclone, gh-cli, k9s** are open: formal plugin types, metadata schemas, and runtime loading mechanisms enable community extension.

### Subprocess vs In-Process Extension

Only **rclone** uses Go's native `plugin` package for `.so` loading (`lib/plugin/plugin.go:13-39`), but this is constrained by Go's requirement that plugins match the host's Go version exactly.

All other projects using subprocess execution: **age, chezmoi, gh-cli, helm, k9s, lazygit**. This is the dominant pattern because:
- Process isolation and security
- Language neutrality (plugins can be in any language)
- Avoids Go plugin ABI constraints

**helm** uniquely supports both subprocess and WebAssembly/Extism runtimes (`internal/plugin/runtime_extismv1.go:94-122`).

### Configuration vs Code Extension

**lazygit, go-task, k9s, fzf** extend via configuration (YAML, keybindings, action strings). This is accessible to non-developers but limited to predefined extension points.

**helm, rclone, gh-cli** extend via plugins (binary executables with metadata). This is more powerful but requires more work from plugin authors.

### Versioning Approaches

**helm** has the most rigorous approach: `apiVersion` in metadata, conversion functions, `PluginTypeRegistry` validation, and explicit backwards compatibility stated in HIP-0004.

**age** uses protocol versioning (`recipient-v1`, `identity-v1`) in the stanza format.

**go-task** versions Taskfiles via semver and enforces bounds at setup time.

Most other projects have **no formal versioning**: interfaces could change without notice, and there is no deprecation policy documented in code.

### Command Extension vs Capability Extension

Most projects that support extension only extend **capabilities** (new formats, new backends, new tools) — not **command structure** (new CLI subcommands).

Only **helm** and **k9s** allow adding new CLI subcommands via plugins without modifying core code. Most other projects have static command trees where new subcommands require recompilation.

## Tradeoffs

### Subprocess Isolation vs Integration Depth

| Decision | Benefit | Cost | Best-fit context |
|----------|---------|------|-----------------|
| Subprocess plugins | Security isolation; polyglot; simple implementation | No direct API calls; serialisation overhead; no shared memory | When plugins don't need deep integration; when security matters |
| In-process Go plugins | Direct function calls; zero serialisation | Go version coupling; ABI instability; complexity | Rarely practical today due to Go plugin constraints |

### Formal Plugin Types vs Simple Command Execution

| Decision | Benefit | Cost |
|----------|---------|------|
| Formal plugin types (helm) | Type-safe invocation; versioned contracts; multiple runtimes | Complexity; more code to maintain; conversion burden for legacy |
| Simple command execution (chezmoi, lazygit) | Simple; flexible | No typed contracts; limited discoverability; schema drift risk |

### Configuration-Driven vs Code-Driven Extension

| Decision | Benefit | Cost |
|----------|---------|------|
| Config-driven | Non-developers can extend; version controllable; no recompilation | Limited to predefined points; cannot add new UI |
| Code-driven | Full flexibility; new capabilities | Requires Go knowledge; recompilation; potential for crashes |

### Large Single Binary vs Modular

| Decision | Benefit | Cost |
|----------|---------|------|
| Single binary with all backends | Simple distribution; no dependency management | Large binary size (~50-100MB for rclone); longer compile times |
| Plugin-loadable | Smaller initial download; on-demand loading | Complex plugin lifecycle; discovery issues; distribution fragmentation |

## Decision Guide

**Choose subprocess plugin model when**: You need security isolation; you want language-agnostic plugins; you don't need deep internal access from plugins.

**Choose configuration-driven extension when**: Your users are operators/admins not developers; the extension points are bounded; you want safety over flexibility.

**Choose interface-based extension (no dynamic loading) when**: You control all implementations; you're building a framework; you prioritize API stability over ecosystem openness.

**Avoid Go's plugin package unless**: You control the full build toolchain; you can guarantee Go version alignment; you only target Linux/macOS.

**Use init() registration when**: All backends are in-tree; you don't need lazy loading; you don't need third-party extension.

**Use registry pattern when**: Multiple packages contribute implementations; you need enumeration; you want late registration support.

## Practical Tips

### Patterns to Copy

1. **Functional options for API stability**: Use the `ExecutorOption` pattern (`executor.go:20-24`) for any API that may need configuration expansion. It's the most backward-compatible way to add options.

2. **Subprocess plugin pattern**: For most CLIs, external executables via `exec.Command` with a wire protocol (JSON-RPC, stanza-based, or simple line protocol) is simpler and more robust than in-process plugins. See `helm/internal/plugin/runtime_subprocess.go:65-79` for a mature implementation.

3. **Versioned metadata with conversion functions**: If supporting multiple API versions, use an explicit `apiVersion` field and conversion functions. See `helm/internal/plugin/metadata.go:114-130` for the pattern.

4. **Template variable substitution for context injection**: Plugins that need access to host state benefit from variable substitution. See `k9s/internal/view/actions.go:206-265` for a comprehensive implementation.

5. **Registry pattern with mutex protection**: A package-level `var registry = make(map[string]T)` with `sync.RWMutex` is the simplest thread-safe registry. See `rclone/fs/rc/registry.go:41-48`.

6. **Optional interface detection**: Use type assertions to detect optional capabilities rather than boolean flags. See `rclone/fs/features.go:294-370`.

### Patterns to Avoid or Delay

1. **Go plugin package (lib/plugin)**: The Go plugin system is effectively abandoned. It only works on Linux/macOS, requires matching Go versions, and has known ABI issues. Use subprocess plugins instead.

2. **No schema validation on plugin config**: k9s validates plugin YAML but continues on failure with just a warning. For production systems, failing fast with clear errors prevents user confusion.

3. **Global singleton state in registries**: rclone's RC registry silently overwrites on collision. Use an explicit error-on-duplicate policy.

4. **PATH fallback as primary extension mechanism**: chezmoi's `exec.LookPath("chezmoi-" + name)` is a fallback, not a designed extension point. If you support PATH-based extension, design it as a first-class feature with a manifest.

5. **Monolithic single-package structure**: urfave-cli's single `package cli` exposes all internals. Even if you don't use `internal/`, use type aliases and interface exports to define a clear public API boundary.

### Decision Rules

**"Can third parties extend this cleanly?"** — If the answer is no, you may be limiting your ecosystem. Consider whether extension would benefit your users.

**"Do plugins need deep internal access?"** — If yes, subprocess plugins may be too limiting. Consider a library API with stability guarantees instead.

**"Are interfaces versioned?"** — If not, document your stability guarantees or lack thereof. Extension authors need to know what they can rely on.

**"Does the project need to stay small?"** — If binary size matters, avoid large single-binary-with-all-backends approach. Consider plugin loading for optional features.

**"Do users want to extend without coding?"** — If yes, configuration-driven extension (YAML, keybindings) is more accessible than code-driven extension.

## Anti-Patterns / Caution Signs

1. **No error on plugin name collision**: rclone's `rc.Calls` registry silently overwrites. k9s's `Validate()` catches duplicate input names but not duplicate plugin names across files. Duplicate detection with explicit errors prevents silent failures.

2. **Schema validation failures produce warnings only**: k9s plugin YAML validation errors at `internal/config/plugin.go:158-164` log warnings but don't prevent loading. This can leave users confused about why their plugin isn't working.

3. **Internal packages directly imported by cmd/**: yq has `cmd/root.go:9` importing `github.com/mikefarah/yq/v4/pkg/yqlib` directly. This bypasses any public API layer and couples cmd to internal implementation details.

4. **No timeout for plugin execution**: helm's subprocess runtime (`internal/plugin/runtime_subprocess.go`) has no built-in timeout, unlike the Extism runtime which has a configurable timeout. Long-running or hanging plugins can block the host indefinitely.

5. **Feature flags with no rollback**: restic's `internal/feature/features.go` sets flags globally with no per-command or per-repo toggle and no rollback within a process. Once set, always set.

6. **Global default storage singletons**: gdu's `DefaultStorage` singleton at `pkg/analyze/stored.go:216-217` creates coupling and potential race conditions.

7. **Incomplete abstractions with panics**: gdu's `ParentDir` type at `pkg/analyze/stored.go:413-437` implements `fs.Item` but panics on all methods — an incomplete abstraction that will surprise callers.

8. **No conflict detection for hotkeys**: k9s's last-loaded plugin wins on shortcut collision with no warning.

9. **Plugin load failures silently ignored**: rclone's `lib/plugin/plugin.go:34-38` continues execution even when a `.so` plugin fails to load. A broken plugin should produce a clear error, not a silent continuation.

## Notable Absences

### No Evidence Found

- **No project uses RPC-based plugin invocation** (gRPC, net/rpc) — all use either subprocess execution or direct Go interface calls
- **No project implements hot-reload for plugins** — MCP tools in opencode are cached at startup; new MCP servers require restart
- **No project has formal deprecation policies** for extension APIs documented in code
- **No project has plugin signature/authentication mechanisms** — plugins are trusted based on installation method only
- **No project has plugin resource limits** (memory, time, CPU) — all plugins run with full host privileges
- **No project uses WebAssembly for extension** except helm (via Extism), which is still experimental
- **No project has a plugin SDK/distribution ecosystem** with community tooling — only informal patterns

### Patterns Not Observed

- **No CI/CD pipeline-based extension** — no project extends via CI config (unlike e.g., GitHub Actions)
- **No database-backed plugin state** — no project stores plugin data in a shared DB
- **No event-sourced plugin architecture** — plugins don't receive application events
- **No remote plugin execution** — plugins always run locally (except fzf's `--listen` HTTP API)

## Per-Repo Notes

| Repo | Key Insight |
|------|-------------|
| age | Plugin protocol is well-designed but scope-limited to crypto. CLI is monolithic. |
| chezmoi | Encryption interface is a clean extension point. PATH fallback is pragmatic but not designed. |
| dive | Adapter pattern is good; internal modularity is reasonable. No plugin system. |
| fzf | Action system is underappreciated as extensibility. --listen HTTP server is unique. |
| gdu | Clean interfaces internally but closed. No plugin loader. |
| gh-cli | Extension manager is mature. Static core command tree is the main limitation. |
| go-task | Taskfile DAG is elegant. Functional options are well-done. YAML-only limits extension. |
| helm | Most complete plugin architecture. Dual runtime (subprocess + WASM) is forward-looking. |
| k9s | YAML plugins + Kubernetes discovery is a strong combination. No API versioning is gap. |
| lazygit | Custom commands system is surprisingly powerful. Config-driven is the right choice for a TUI. |
| mitchellh-cli | Simple and focused. No dynamic loading. Single package structure. |
| opencode | MCP as extension model is modern and ecosystem-compatible. Tool-centric limits CLI discoverability. |
| rclone | Most mature backend plugin system. Go plugin loader is constrained. RC API is underrated. |
| restic | Backend interface is stable. Feature flags are well-designed. Closed otherwise. |
| urfave-cli | ValueSource chain is the most genuinely extensible part. Single package exposes internals. |
| yq | Format registration via factory is clean. No command extension without recompilation. |

## Open Questions

1. **Will helm's WASM/Extism runtime gain adoption?** The subprocess model dominates. WASM provides isolation without Go version constraints, but requires compilation to WASM.

2. **Should Go re-imagine the plugin package?** Go's original plugin system is effectively dead. A new approach (perhaps using WASM as the target) could enable in-process extension without subprocess overhead.

3. **Is there a market for CLI plugin SDKs?** Projects like helm, rclone, and kubectl have plugin ecosystems. Most CLIs don't. What separates CLIs that attract plugins from those that don't?

4. **Configuration-driven vs code-driven extension** — which is the future? The trend toward Kubernetes operators and GitOps suggests declarative, data-driven extension will dominate, but complex tools may always need code-driven extension.

5. **Plugin security without signatures?** All projects trust plugins based on installation method. No project implements code signing or provenance verification.

## Evidence Index

| File:Line | Evidence |
|-----------|----------|
| `age/age.go:65-86` | Recipient and Identity interfaces |
| `age/plugin/plugin.go:29-118` | Plugin struct with HandleRecipient, HandleIdentity callbacks |
| `age/plugin/client.go:426-433` | Client spawns age-plugin-{name} binary |
| `chezmoi/internal/cmd/cmd.go:224` | External command lookup via exec.LookPath |
| `chezmoi/internal/cmd/config.go:493-592` | Template functions registration |
| `dive/cmd/dive/cli/cli.go:46-50` | rootCmd.AddCommand hardcodes all subcommands |
| `dive/dive/image/resolver.go:5-14` | image.Resolver interface |
| `fzf/src/options.go:2027-2172` | Action parsing logic |
| `fzf/src/server.go:40-145` | Custom HTTP server implementation |
| `gdu/cmd/gdu/app/app.go:30-49` | UI interface |
| `gdu/internal/common/analyze.go:25-35` | Analyzer interface |
| `gh-cli/pkg/extensions/extension.go:18-42` | Extension and ExtensionManager interfaces |
| `gh-cli/pkg/cmd/extension/manager.go:44-56` | Three extension types |
| `gh-cli/pkg/cmd/root/root.go:192-203` | Extension loading into command tree |
| `go-task/executor.go:20-24,91-122` | ExecutorOption interface and Options() method |
| `go-task/taskfile/ast/include.go:14-28` | Include struct |
| `helm/internal/plugin/plugin.go:27-50` | Plugin interface |
| `helm/internal/plugin/runtime_subprocess.go:65-79` | Subprocess runtime |
| `helm/internal/plugin/runtime_extismv1.go:94-122` | Extism/WASM runtime |
| `helm/internal/plugin/metadata_v1.go:24-48` | MetadataV1 struct |
| `k9s/internal/config/plugin.go:53-67` | Plugin struct |
| `k9s/internal/view/actions.go:206-265` | Plugin execution with variable substitution |
| `k9s/internal/view/registrar.go:10-21` | Viewer registration |
| `lazygit/pkg/config/user_config.go:669-692` | CustomCommand struct |
| `lazygit/pkg/gui/services/custom_commands/resolver.go` | Template variable resolution |
| `mitchellh-cli/command.go:14-31` | Command interface |
| `mitchellh-cli/cli.go:70` | Commands map |
| `opencode/internal/llm/tools/tools.go:69-72` | BaseTool interface |
| `opencode/internal/llm/agent/mcp-tools.go:106-129` | MCP client implementations |
| `opencode/internal/config/config.go:27-35` | MCPServer struct |
| `rclone/fs/registry.go:22` | fs.Registry slice |
| `rclone/fs/registry.go:407` | fs.Register function |
| `rclone/lib/plugin/plugin.go:13-39` | Go plugin loader |
| `rclone/fs/rc/registry.go:17-78` | RC registry |
| `restic/internal/backend/location/registry.go:32-38` | Factory interface |
| `restic/internal/feature/features.go:60-113` | Feature flag system |
| `restic/cmd/restic/main.go:77-106` | Static command list |
| `urfave-cli/flag.go:91-112` | Flag interface |
| `urfave-cli/value_source.go:11-18` | ValueSource interface |
| `yq/pkg/yqlib/format.go:10-112` | Format struct with factory functions |
| `yq/pkg/yqlib/decoder.go:7-9` | Decoder interface |

---

Generated by protocol `study-areas/12-extensibility.md`.