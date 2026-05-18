# Repo Analysis: mitchellh-cli

## Dependency Injection & Wiring

### Repo Info

| Field | Value |
|-------|-------|
| Name | mitchellh-cli |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/mitchellh-cli` |
| Group | `mitchellh-cli` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

The mitchellh-cli library is a framework for building command-line interfaces in Go. It employs a factory pattern for command creation via `CommandFactory` functions registered in a map. Dependencies are injected through struct fields and constructor parameters. The library provides interface abstractions for UI (`Ui`) and command extensions (`CommandAutocomplete`, `CommandHelpTemplate`), enabling testability and decoration. However, the framework itself does not implement a centralized composition root—each application is responsible for constructing and wiring dependencies.

## Rating

**7/10** — Clear composition model with factory pattern and interface abstractions, but wiring responsibility is delegated to the consumer application. No context.Context usage for request-scoped values. The framework is testable via mock implementations but doesn't enforce a DI container or explicit initialization graph.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Command factory | `CommandFactory` function type: `func() (Command, error)` | `command.go:64-67` |
| Command interface | `Command` interface with `Help()`, `Run(args []string) int`, `Synopsis()` | `command.go:14-31` |
| CLI struct | `Commands map[string]CommandFactory` field for registration | `cli.go:70` |
| UI interface | `Ui` interface with `Ask`, `AskSecret`, `Output`, `Info`, `Error`, `Warn` | `ui.go:19-43` |
| BasicUi | `BasicUi` struct with `Reader`, `Writer`, `ErrorWriter` io fields | `ui.go:48-52` |
| MockUi | `MockUi` with thread-safe `syncBuffer` for testing | `ui_mock.go:27-33` |
| MockCommand | `MockCommand` for test substitution | `command_mock.go:10-19` |
| ConcurrentUi | `ConcurrentUi` wrapper for thread-safe UI | `ui_concurrent.go:9-12` |
| ColoredUi | `ColoredUi` decorator wrapping another `Ui` | `ui_colored.go:30-36` |
| PrefixedUi | `PrefixedUi` decorator for message prefixes | `ui.go:131-139` |
| Command extensions | `CommandAutocomplete` and `CommandHelpTemplate` interfaces | `command.go:33-62` |

## Answers to Protocol Questions

**1. Where are dependencies constructed?**

Dependencies are constructed by the **consumer application**, not within the framework. The `CLI` struct holds a `Commands map[string]CommandFactory` where the application registers factory functions. Each factory is responsible for constructing its own command and any dependencies it needs. The framework itself (`cli.go:242`) only calls `raw.(CommandFactory)()` to instantiate commands.

Example pattern from tests (`cli_test.go:89-93`):
```go
Commands: map[string]CommandFactory{
    "foo": func() (Command, error) {
        return command, nil
    },
},
```

**2. How are services passed around?**

Services are passed through **direct struct embedding and constructor injection**. The `CLI` struct is populated by the consumer with `Commands`, `HelpFunc`, `HelpWriter`, `ErrorWriter`, etc. Commands receive only `[]string` args in their `Run` method—no context, no struct parameter for dependencies.

For UI services, the `Ui` interface allows decorator chaining:
- `BasicUi` implements `Ui` directly (`ui.go:48`)
- `ConcurrentUi` wraps a `Ui` interface (`ui_concurrent.go:9-12`)
- `ColoredUi` wraps a `Ui` interface (`ui_colored.go:30-36`)
- `PrefixedUi` wraps a `Ui` interface (`ui.go:131-139`)

**3. Is wiring centralized?**

**No.** The wiring is decentralized. The framework provides the structure (`Commands` map, `CommandFactory` type) but each consumer must wire their own commands and dependencies. There is no composition root within the library. The library does not enforce any particular wiring pattern beyond the factory function registration.

**4. Are globals avoided?**

**Yes.** There are no global variables or package-level state in this library. All state is held in struct fields:
- `CLI` struct fields are instance-specific (`cli.go:49-149`)
- `BasicUi`, `MockUi`, `ConcurrentUi`, `ColoredUi`, `PrefixedUi` all hold state in fields
- The only package-level state is const values and the `UiColor` variables which are constants (`ui_colored.go:17-26`)

**5. Is initialization explicit?**

**Partially.** The `CLI` struct uses `sync.Once` for lazy initialization (`cli.go:134`), which defers some setup to first use (`c.once.Do(c.init)` at `cli.go:165,172,178`). This is implicit initialization. The UI types use a similar pattern (`MockUi` uses `sync.Once` at `ui_mock.go:32`). Command factories themselves are called on each execution, making initialization explicit at the factory level.

## Architectural Decisions

1. **Factory pattern for commands**: The `CommandFactory func() (Command, error)` at `command.go:64-67` allows expensive initialization to be deferred and enables test substitution via mock commands.

2. **Interface segregation for UI**: The `Ui` interface at `ui.go:19-43` is small and focused (7 methods), enabling easy mocking and decorator composition.

3. **Decorator pattern for UI**: `ConcurrentUi`, `ColoredUi`, and `PrefixedUi` all wrap another `Ui` interface, allowing orthogonal concerns (concurrency, color, prefixes) to be composed without inheritance.

4. **No context.Context**: The framework does not use `context.Context` for request-scoped values. This simplifies the API but means cancellation and deadlines must be handled differently.

5. **Map-based command registration**: Commands are registered in a `map[string]CommandFactory` which provides no ordering guarantees and makes command initialization less visible.

## Notable Patterns

- **Decorator composition**: UI decorators wrap interfaces (`ui_concurrent.go`, `ui_colored.go`, `ui.go:PrefixedUi`)
- **Thread-safe mocks**: `MockUi` uses `syncBuffer` with mutex protection (`ui_mock.go:84-116`)
- **Lazy initialization**: `sync.Once` used in `CLI.init()` and `MockUi.init()` to defer buffer setup
- **Extension interfaces**: Optional interfaces (`CommandAutocomplete`, `CommandHelpTemplate`) extend base `Command` without forcing implementation

## Tradeoffs

| Decision | Benefit | Cost |
|----------|---------|------|
| Factory functions | Cheap to register, enables mocks | No compile-time guarantees, indirect instantiation |
| No composition root | Consumer controls all wiring | No enforced best-practice wiring |
| No context.Context | Simple API, no ctx propagation | Cannot cancel commands or pass request-scoped values |
| Map-based commands | Simple, flexible registration | No ordering, hidden initialization sequence |
| `sync.Once` lazy init | Avoids upfront cost | Debugging harder, first call pays cost |

## Failure Modes / Edge Cases

1. **Missing command**: If a subcommand is not found, the CLI outputs help and returns exit code 127 (`cli.go:239`). No error object is returned to the caller.

2. **Factory errors**: If a `CommandFactory` returns an error, it propagates immediately as a Go error from `CLI.Run()` (`cli.go:243-244`).

3. **Concurrent UI race**: Without `ConcurrentUi`, concurrent writes to `BasicUi.Writer` would race. The library provides `ConcurrentUi` but does not enforce its use.

4. **Empty command map**: If `Commands` map is empty, the CLI silently exits 0 on `Run()` unless a default command `""` is registered (`cli.go:720-727`).

5. **Double init protection**: `sync.Once` ensures `init()` runs exactly once, but if initialization fails, subsequent calls will not retry.

## Future Considerations

- A builder or options pattern for `CLI` construction could make initialization more explicit
- Adding `context.Context` support to `Run` method signature would enable cancellation and request-scoped values
- A `Commands` slice with ordering metadata could replace the map for deterministic initialization

## Questions / Gaps

- **No evidence of DI container**: This is a library, not an application, so no DI container is expected. Consumer code would wire dependencies themselves.
- **No init error tracking**: If `c.once.Do(c.init)` in `Run()` fails, the error is not stored or returned—subsequent calls just re-run init. This could mask initialization errors (`cli.go:178`).
- **No graceful shutdown**: No mechanism for graceful command shutdown or resource cleanup after `Run()` completes.

---

Generated by `study-areas/03-dependency-injection.md` against `mitchellh-cli`.