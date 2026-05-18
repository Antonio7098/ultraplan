# Repo Analysis: lazygit

## Extensibility & Plugin Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | lazygit |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/lazygit` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Lazygit has a well-designed custom command system that allows users to extend functionality through configuration, but lacks dynamic plugin loading. Extension is a first-class design concern, with a clean separation between user-facing config and internal implementation. The system uses a structured approach to keybinding-based command invocation with support for prompts, menus, and shell command execution.

## Rating

**7/10** — Well-designed modularity with configuration-driven extensibility. No dynamic plugin loading, but the custom commands system is comprehensive and user-friendly.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Custom command config struct | `CustomCommand` struct with key, context, command, prompts, output fields | `pkg/config/user_config.go:669-692` |
| Custom commands client entry point | `CustomCommandsClient` field on `Gui` struct | `pkg/gui/gui.go:74` |
| Client initialization | `NewClient` creates handler and keybinding creators | `pkg/gui/services/custom_commands/client.go:19-37` |
| Keybinding generation | `GetCustomCommandKeybindings` iterates config and creates bindings | `pkg/gui/services/custom_commands/client.go:39-64` |
| Keybinding creator | Maps custom commands to view-specific keybindings | `pkg/gui/services/custom_commands/keybinding_creator.go:25-43` |
| Handler creator | Creates handlers with prompt resolution and command execution | `pkg/gui/services/custom_commands/handler_creator.go:47-131` |
| Command execution | Runs shell commands via `OSCommand.Cmd.NewShell` | `pkg/gui/services/custom_commands/handler_creator.go:295` |
| Config validation | Validates custom command structure and keybinding keys | `pkg/config/user_config_validation.go:137-175` |
| Per-repo config reload | `ReloadUserConfigForRepo` merges global and repo-level configs | `pkg/config/app_config.go:547-556` |
| AppConfig interface | `AppConfigurer` interface defines config access contract | `pkg/config/app_config.go:37-54` |
| Context system | `ContextKey` type for view/scoped command registration | `pkg/gui/types/common.go` |
| Integration tests | 20+ integration tests for custom commands | `pkg/integration/tests/custom_commands/*.go` |

## Answers to Protocol Questions

### 1. Can new commands be added cleanly?

**Yes.** New commands are added via the `CustomCommands` array in user config (YAML). Commands can be scoped to specific contexts (views) like `files`, `commits`, `localBranches`, or be global. The system supports:
- Simple shell commands with keybinding triggers
- Commands with prompts (input, menu, confirm, menuFromCommand)
- Commands with conditional execution based on form state
- Nested submenu structures via `commandMenu`

Evidence: `pkg/config/user_config.go:669-692`, `pkg/integration/tests/custom_commands/basic_command.go:16-22`

### 2. Is extension anticipated?

**Yes.** The VISION.md explicitly lists "Power" as a design principle and mentions "Use the custom commands system to handle the really rare complex edge-cases" (`VISION.md:65`). The system was designed from the ground up for user extensibility with:
- Full template variable resolution (`pkg/gui/services/custom_commands/resolver.go`)
- Preset suggestions (authors, branches, files, refs, remotes, tags)
- Multiple output modes (terminal, log, popup, logWithPty)

### 3. Are interfaces stable?

**Mostly.** The `CustomCommand` config struct has been stable, though migrations exist for past changes (e.g., `subprocess` → `output` enum in `pkg/config/app_config.go:383-429`). The `AppConfigurer` interface at `pkg/config/app_config.go:37-54` is well-defined and small. However, the internal package structure is more complex (20+ packages under `pkg/gui/`), suggesting some fragility in deeply internal APIs.

### 4. Are internal APIs modular?

**Yes.** The codebase maintains clear boundaries:
- `pkg/gui/services/custom_commands/` — public entry point for extension
- `pkg/gui/controllers/helpers/` — helper utilities 
- `pkg/config/` — configuration management
- `pkg/commands/git_commands/` — git command implementations

Internal helpers like `HelperCommon` (`pkg/gui/controllers/helpers/helpers.go`) are clearly separated from the public `types` package (`pkg/gui/types/common.go:17`).

## Architectural Decisions

1. **Configuration-driven, not code-driven extension.** Users extend lazygit by writing YAML config, not by writing Go code and recompiling. This prioritizes safety and ease of distribution over maximum flexibility.

2. **Keybinding-centric command invocation.** All custom commands are triggered via keybindings, which are defined in the same config. This integrates naturally with the TUI but limits extension to event-driven patterns.

3. **Shell command execution as the primitive.** Custom commands ultimately execute shell commands, giving users the full power of Unix pipes and scripts. This defers actual implementation to external scripts.

4. **Template variable system for context access.** Commands can reference current selection state via Go templates (`{{.Form.Branch}}`, `{{.SelectedRemote.Name}}`), with a resolver system at `pkg/gui/services/custom_commands/resolver.go`.

5. **No dynamic loading.** There is no plugin system that loads bytecode at runtime (no `.so` files, no Go plugin package). Extensions are purely configuration.

## Notable Patterns

- **Nested submenu pattern:** Custom commands can contain `CommandMenu` arrays for cascading menus (`keybinding_creator.go:66-110`)
- **Prompt chain pattern:** Handlers wrap themselves in reverse order to create a chain of prompts before final execution (`handler_creator.go:56-129`)
- **Context-aware binding:** Commands specify contexts where they're active, mapped to view names via `contextForContextKey()` (`keybinding_creator.go:45-76`)
- **Config migration system:** The `migrateUserConfig` function handles backward-compatibility migrations automatically (`app_config.go:219-253`)

## Tradeoffs

**Pros:**
- Safe: No ability to crash the application with bad extension code
- Distributable: Config files can be shared and version-controlled
- Simple UX: Users define commands without needing to understand Go

**Cons:**
- Limited expressiveness: Cannot add new UI panels, views, or modes
- No third-party ecosystem: Cannot distribute pre-compiled plugins
- Performance: Shell command overhead for every custom command invocation
- Security: Full shell access through user configuration

## Failure Modes / Edge Cases

1. **Invalid keybinding keys:** Validated at config load time (`user_config_validation.go:129-135`), preventing silent failures
2. **Unknown context strings:** Returns error with permitted contexts list (`keybinding_creator.go:78-84`)
3. **Missing context specification:** Returns error if context not provided (`keybinding_creator.go:86-88`)
4. **Shell command failures:** Propagated to user with error display via `WithWaitingStatus` and `Alert` (`handler_creator.go:319-324`)
5. **Template resolution failures:** Returned as errors before command execution (`handler_creator.go:290-293`)
6. **Recursive submenu depth:** Handled via recursive `showCustomCommandsMenu` (`client.go:66-110`)

## Future Considerations

1. **Plugin API:** A proper plugin system with Go interfaces could allow compiled extensions while maintaining safety
2. **WebAssembly:** Could enable true cross-language extension support
3. **gRPC service:** Running lazygit as a daemon with a gRPC API for external control
4. **Event hooks:** Triggering custom commands on git events (commit, push, etc.) rather than just keybindings

## Questions / Gaps

1. **No evidence found** for version stability guarantees on the `CustomCommand` struct. The config migration system handles breaking changes, but there's no semantic versioning or deprecation policy documented.

2. **No evidence found** for a public API for third-party packages to register extensions programmatically. The `CustomCommandsClient` is internal-only.

3. **Unclear** how the custom commands system interacts with the less-used "extras" panel system mentioned in the keybindings (`extrasMenu` at `keybindings.go:191-196`).

---

Generated by `study-areas/12-extensibility.md` against `lazygit`.