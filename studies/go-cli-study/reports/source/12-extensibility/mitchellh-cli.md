# Repo Analysis: mitchellh-cli

## Extensibility & Plugin Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | mitchellh-cli |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/mitchellh-cli` |
| Group | `mitchellh-cli` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

mitchellh-cli is a lightweight CLI framework with command registration, nested subcommands, autocomplete, and help generation. It provides extension points through interfaces and factory functions, but lacks dynamic loading (plugins, bytecode). Extension is achieved via composition of provided interfaces (Command, Ui, HelpFunc) rather than runtime plugin loading.

## Rating

**4/10** — Some extension points via interfaces and factory functions, but no dynamic loading or plugin system. Command registration is compile-time only.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Command interface | `Command` interface with `Help()`, `Run()`, `Synopsis()` | `command.go:14-31` |
| CommandAutocomplete interface | Optional interface for arg/flag autocomplete | `command.go:33-47` |
| CommandHelpTemplate interface | Optional interface for custom help templating | `command.go:49-62` |
| CommandFactory type | Factory function type for lazy command instantiation | `command.go:64-67` |
| CLI.Commands map | `map[string]CommandFactory` for command registration | `cli.go:70` |
| HiddenCommands field | List of hidden commands excluded from help/autocomplete | `cli.go:72-76` |
| Autocomplete integration | Uses `posener/complete` library for shell autocomplete | `cli.go:412-433` |
| HelpFunc type | Function type for customizing help output | `help.go:11-13` |
| Ui interface | Interface for terminal I/O with Ask/Output/Error/Warn methods | `ui.go:16-43` |
| BasicUi implementation | Default Ui implementation with Reader/Writer fields | `ui.go:45-52` |
| PrefixedUi implementation | Ui wrapper that prefixes output lines | `ui.go:130-187` |
| ColoredUi implementation | Ui wrapper that applies color codes | `ui_colored.go:28-73` |
| ConcurrentUi wrapper | Thread-safe Ui wrapper using mutex | `ui_concurrent.go:7-54` |
| UiWriter | io.Writer that logs to Ui.Info | `ui_writer.go:3-18` |
| MockCommand | Exported mock for testing | `command_mock.go:10-63` |
| MockUi | Exported mock Ui for testing | `ui_mock.go:20-116` |

## Answers to Protocol Questions

**1. Can new commands be added cleanly?**

Yes, but only at compile time. New commands are registered by adding entries to the `CLI.Commands` map with a `CommandFactory` function. The factory pattern allows lazy initialization. Nested subcommands are supported via keys with spaces (e.g., "foo bar"). No runtime plugin loading exists.

Evidence: `cli.go:59-70` — Commands map is `map[string]CommandFactory`. Registration is static at construction time.

**2. Is extension anticipated?**

Partially. The design uses interface composition to allow extensions via:
- `CommandAutocomplete` for custom autocomplete (`command.go:33-47`)
- `CommandHelpTemplate` for custom help templates (`command.go:49-62`)
- `HelpFunc` for custom help generation (`help.go:11-13`)
- `Ui` interface for custom I/O (`ui.go:16-43`)

However, there is no plugin system or dynamic loading mechanism. Extensions must be compiled into the main binary.

**3. Are interfaces stable?**

Interfaces are simple and stable:
- `Command` has 3 methods (`Help`, `Run`, `Synopsis`) — `command.go:14-31`
- `Ui` has 6 methods (`Ask`, `AskSecret`, `Output`, `Info`, `Error`, `Warn`) — `ui.go:16-43`
- No evidence of interface evolution or versioning mechanism

**4. Are internal APIs modular?**

Internal package boundaries are clean. The package is `package cli` with all files in the same package. Internal fields are unexported (e.g., `c.commandTree`, `c.autocomplete` in `cli.go:134-141`). Mock implementations are exported for external test use (`command_mock.go:10`, `ui_mock.go:20`).

## Architectural Decisions

1. **Factory pattern for commands** (`CommandFactory` at `command.go:64-67`) — Allows lazy instantiation and avoids global state initialization.

2. **Radix tree for command lookup** (`commandTree *radix.Tree` at `cli.go:136`) — Enables efficient longest-prefix matching for nested subcommands.

3. **UI composition via interface** (`Ui` at `ui.go:16-43`) — Allows layering: `BasicUi` → `PrefixedUi` → `ColoredUi` → `ConcurrentUi`.

4. **Autocomplete via external library** (`posener/complete`) — Delegates shell completion to a dedicated library rather than building custom logic.

5. **Single package structure** — Everything in `package cli`; no internal subpackages or API boundaries beyond exported types.

## Notable Patterns

- **Decorator pattern for UI**: `ColoredUi`, `ConcurrentUi`, `PrefixedUi` all wrap a `Ui` interface and delegate after transformation.
- **Factory pattern**: `CommandFactory func() (Command, error)` enables dependency injection and lazy initialization.
- **Singleton initialization**: `sync.Once` used for `init()` to ensure single-time setup (`cli.go:134`).

## Tradeoffs

| Tradeoff | Description |
|----------|-------------|
| Compile-time extension only | Cannot load plugins/extensions at runtime; all commands must be registered at build time |
| Single package | No internal API protection; all types are in one package |
| No schema/version stability | No versioned interface contracts; interfaces could break if extended |
| No dynamic loading | No mechanism for third-party plugins, bytecode loading, or module systems |

## Failure Modes / Edge Cases

- **Missing parent command**: When registering nested commands (e.g., "foo bar"), if "foo" doesn't exist, it is auto-created as a no-op that shows help (`cli.go:343-382`).
- **Default command with empty string key**: `CLI.Commands[""]` serves as default when no subcommand is provided (`cli.go:718-727`).
- **Autocomplete name required**: `CLI.Name` must be set for autocomplete to function (`cli.go:204-207`).
- **Factory called multiple times**: `CommandFactory` may be called multiple times during help rendering and autocomplete setup (`cli.go:66` comment).

## Future Considerations

- **Plugin system**: No current mechanism for dynamic loading of third-party extensions. Users must fork and compile.
- **Interface versioning**: No semantic versioning or compatibility guarantees for the `Command` or `Ui` interfaces.
- **Subcommand aliasing**: No built-in command alias or shortcut system.
- **Configuration-driven commands**: No declarative configuration file to define commands at runtime.

## Questions / Gaps

- **No dynamic loading evidence**: No evidence found of plugin loading, bytecode injection, or module systems at `mitchellh-cli/`.
- **No version stability guarantee**: No evidence of interface deprecation policy or version tagging for API stability.
- **No external extension API**: No evidence of a public extension SDK or plugin API documentation.

---

Generated by `study-areas/12-extensibility.md` against `mitchellh-cli`.