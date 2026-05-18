# Repo Analysis: lazygit

## Dependency Injection & Wiring

### Repo Info

| Field | Value |
|-------|-------|
| Name | lazygit |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/lazygit` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

lazygit employs a centralized composition root in `pkg/app/app.go` (`NewApp` function, line 95) where all major dependencies are constructed and wired together. The app follows a clear DI pattern with interfaces used extensively for abstraction, particularly through `AppConfigurer` (`pkg/config/app_config.go:37`), `IGuiCommon` (`pkg/gui/types/common.go:26`), and `IController` (`pkg/gui/types/context.go:271`). Services flow downward from composition root to GUI and commands. The use of functional options and struct embedding makes the codebase flexible for testing and future extension.

## Rating

**8/10** — Clear composition root with explicit wiring. Interfaces are used well for abstraction. Some helper creation in `NewGui` (`pkg/gui/gui.go:721`) could be more structured, but the overall DI discipline is strong.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Composition root | App struct assembled in `NewApp` | `pkg/app/app.go:95` |
| App struct fields | App embeds `*common.Common`, has `Config`, `OSCommand`, `Gui` | `pkg/app/app.go:32-38` |
| AppConfigurer interface | Interface defines all config access methods | `pkg/config/app_config.go:37-54` |
| NewCommon | Creates Common with log, translations, appState, fs | `pkg/app/app.go:63-80` |
| OSCommand construction | `NewOSCommand(common, config, platform, guiIO)` | `pkg/app/app.go:102` |
| GitCommand construction | `NewGitCommand` accepts common, version, osCommand, gitConfig, pagerConfig | `pkg/commands/git.go:58-83` |
| GitCommand sub-commands | Massive DI via constructor calls to individual command structs | `pkg/commands/git.go:100-128` |
| Gui construction | `NewGui(common, config, gitVersion, updater, ...)` | `pkg/app/app.go:136` |
| Gui struct fields | Gui has `*common.Common`, `git`, `os`, `Updater`, `Config`, etc. | `pkg/gui/gui.go:62-100` |
| IGuiCommon interface | Defines GUI access contract for helpers | `pkg/gui/types/common.go:26` |
| IController interface | Controllers expose themselves via this interface | `pkg/gui/types/context.go:271` |
| HelperCommon | Passed to all helpers for common access | `pkg/gui/controllers/helpers/helpers.go:15` |
| Integration test interface | `IntegrationTest` passed through to configure test mode | `pkg/gui/gui.go:728` |
| No context.Context | Go context not used for request-scoped DI | N/A |
| Package-level vars | `OverlappingEdges` at package level (constant, not state) | `pkg/gui/gui.go:57` |
| Global vars | No global mutable state found in main app code | N/A |
| Functional options | PopupHandler uses callback functions for deferred execution | `pkg/gui/gui.go:753-769` |

## Answers to Protocol Questions

**1. Where are dependencies constructed?**

The composition root is `NewApp` in `pkg/app/app.go:95-141`. Key construction happens:
- `NewCommon` (`pkg/app/app.go:63`) creates the `Common` struct with log, translations, appState, and filesystem
- `oscommands.NewOSCommand` (`pkg/app/app.go:102`) creates the OS command handler
- `NewGitCommand` (`pkg/commands/git.go:58`) creates the git command hub with all sub-commands
- `gui.NewGui` (`pkg/gui/gui.go:721`) creates the GUI with helpers

**2. How are services passed around?**

Services are passed via struct fields and constructor parameters:
- `App` struct holds `Config`, `OSCommand`, `Gui` as fields (`pkg/app/app.go:36-38`)
- `Gui` struct holds `*common.Common`, `*commands.GitCommand`, `*oscommands.OSCommand` (`pkg/gui/gui.go:64-67`)
- `HelperCommon` is passed to all helpers (`pkg/gui/controllers/helpers/helpers.go:15-16`)
- `GitCommand` is passed to `Gui` and held as a field

**3. Is wiring centralized?**

Yes. All major wiring happens in `NewApp` (`pkg/app/app.go:95`) with construction delegated to:
- `NewCommon` for shared services
- `oscommands.NewOSCommand` for OS operations
- `NewGitCommand` for git operations
- `gui.NewGui` for GUI and helpers

Sub-commands of `GitCommand` are further centralized in `NewGitCommandAux` (`pkg/commands/git.go:85-175`) which constructs all 20+ sub-command objects.

**4. Are globals avoided?**

Yes. There is no global mutable state in the application code:
- All state is held in structs (`App`, `Gui`, `Common`, etc.)
- Package-level vars like `OverlappingEdges` (`pkg/gui/gui.go:57`) are constants, not state
- The code uses dependency injection throughout
- Integration tests use `IntegrationTest` interface to inject test implementations

**5. Is initialization explicit?**

Yes. Every component is explicitly constructed via constructors:
- `NewApp`, `NewCommon`, `NewGui`, `NewGitCommand`, `NewOSCommand`, `NewGitCommandAux`
- No hidden initialization or singletons
- Test injection via `IntegrationTest` interface is explicit (`pkg/gui/gui.go:728`)

## Architectural Decisions

- **Centralized composition root**: All DI happens in `NewApp` which acts as a factory
- **Interface abstraction**: `AppConfigurer` (`pkg/config/app_config.go:37`), `IGuiCommon` (`pkg/gui/types/common.go:26`), `IController` (`pkg/gui/types/context.go:271`), and many other interfaces decouple implementation from usage
- **Nested composition**: `GitCommand` uses a hub pattern where it composes 20+ sub-command objects (`pkg/commands/git.go:139-174`)
- **Struct embedding for inheritance**: `App` embeds `*common.Common`; `GitCommand` embeds service structs; allows passing common dependencies without explicit forwarding
- **Factory pattern for contexts**: Contexts are created via factory-like functions in `contextTree()` (`pkg/gui/context_config.go:8-25`)

## Notable Patterns

- **Hub pattern**: `GitCommand` is a hub that composes many sub-commands, each handling a specific git domain
- **Constructor DI**: All dependencies passed via constructors, no service locators
- **Interface segregation**: Many small interfaces like `IGuiCommon`, `IStateAccessor`, `IRepoStateAccessor` allow flexible mocking
- **Functional options callbacks**: Popup handler uses callbacks (`func(context.Context, ...)`) for deferred execution (`pkg/gui/popup/popup_handler.go:16`)
- **HelperCommon pattern**: A single `HelperCommon` struct passed to helpers provides unified access to GUI state and common services

## Tradeoffs

- **GitCommand complexity**: The `GitCommand` struct (`pkg/commands/git.go:17-44`) holds 20+ sub-command fields. While organized, the constructor (`NewGitCommandAux`, lines 85-175) is verbose with 90+ lines of wiring.
- **Embedding vs explicit fields**: Heavy use of struct embedding (e.g., `*common.Common` in many structs) makes it harder to see what's actually a dependency vs. inherited behavior.
- **Testing requires interface extraction**: Since many concrete types are used directly (e.g., `*oscommands.OSCommand`), mocking for unit tests requires either interfaces or the `fakes` package (`pkg/fakes/`).
- **No request-scoped DI**: Go's `context.Context` is not used for request-scoped values; the GUI is long-lived and doesn't have the same request pattern as HTTP servers.

## Failure Modes / Edge Cases

- **Repository switching**: When switching repos via `setupRepo` (`pkg/app/app.go:182-274`), state like `RepoStateMap` is preserved but no DI re-wiring occurs — state is reset, not dependencies rebuilt.
- **Daemon mode**: `daemon.Handle(common)` (`pkg/app/entry_point.go:163`) passes `Common` directly without full app construction; this is a separate entry path that may bypass some DI.
- **Integration test injection**: The `IntegrationTest` interface (`pkg/integration/types/types.go:13`) is passed to `NewGui` but if a test doesn't properly implement all methods, failures appear at runtime rather than compile time (no compile-time interface check on `IntegrationTest` implementation).

## Future Considerations

- Consider using a DI container library if the project grows more complex
- The `context.Context` pattern could be explored for scoped values if async operations need cancellation propagation
- Consider extracting more interfaces from concrete types (e.g., `*oscommands.OSCommand`) to improve testability

## Questions / Gaps

- No evidence of `context.Context` usage for request-scoped values — this is by design (GUI is long-lived) but worth noting
- The `daemon` mode (`pkg/app/daemon/daemon.go`) passes `*common.Common` directly, bypassing some DI — need to verify if this is intentional or a gap
- How do custom commands (`custom_commands.Client` at `pkg/gui/gui.go:74`) get their dependencies? Further investigation of that package would clarify

---

Generated by `study-areas/03-dependency-injection.md` against `lazygit`.