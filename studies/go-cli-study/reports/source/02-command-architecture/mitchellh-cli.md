# Repo Analysis: mitchellh-cli

## Command Architecture

### Repo Info

| Field | Value |
|-------|-------|
| Name | mitchellh-cli |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/mitchellh-cli` |
| Group | `mitchellh-cli` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

mitchellh-cli is a thin command-line infrastructure library (~740 LOC in `cli.go`) that provides routing, help generation, and autocomplete for Go CLIs. Commands are pure interfaces — no struct embedding, no base types, no functional options. The `CLI` struct holds all state and routes to `CommandFactory` functions that produce `Command` implementations on demand. This is a declarative but minimal pattern: commands are discovered via a `map[string]CommandFactory`, and nesting is achieved by spacing key names (e.g., `"foo bar"`).

## Rating

**6/10** — Commands are somewhat organized and the interface is clean, but logic frequently lives in `Run` functions. The pattern works well for small-to-medium CLIs but lacks lifecycle hooks, reusable scaffolding, and command composition. It cannot scale elegantly to 100+ commands without significant辅助 infrastructure.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Command interface | `Command` interface with `Help()`, `Run([]string) int`, `Synopsis()` | `command.go:14-31` |
| CommandAutocomplete interface | Extends Command with `AutocompleteArgs()` and `AutocompleteFlags()` | `command.go:37-47` |
| CommandHelpTemplate interface | Extends Command with `HelpTemplate()` for custom templates | `command.go:49-62` |
| CommandFactory type | `type CommandFactory func() (Command, error)` — factory pattern for lazy init | `command.go:64-67` |
| CLI.Commands field | `Commands map[string]CommandFactory` — flat map, nesting via spaced keys | `cli.go:56-70` |
| CLI.Run() routing | Lookup via radix tree (`c.commandTree.Get`), then factory call, then `command.Run()` | `cli.go:236-269` |
| Nested subcommand detection | Keys with spaces (`strings.ContainsRune(k, ' ')`) trigger nested mode | `cli.go:334-341` |
| Longest-prefix matching | `c.commandTree.LongestPrefix(searchKey)` for ambiguous prefix resolution | `cli.go:699` |
| Parent auto-creation | Missing parent commands auto-created as `MockCommand` with `RunResultHelp` | `cli.go:373-381` |
| Help generation | Template-based in `commandHelp()`, uses `CommandHelpTemplate` if available | `cli.go:506-591` |
| Autocomplete setup | `initAutocompleteSub()` recursively builds `complete.Command` tree | `cli.go:439-504` |
| HelpFunc type | `type HelpFunc func(map[string]CommandFactory) string` — pluggable help renderer | `help.go:11-13` |
| BasicHelpFunc | Default help renderer, sorts keys, instantiates each command to get Synopsis | `help.go:15-59` |
| FilteredHelpFunc | Wraps another HelpFunc to filter which commands appear in help | `help.go:61-79` |
| RunResultHelp constant | `-18511` sentinel value for `Run` to trigger help display | `command.go:7-11` |
| MockCommand | Test double implementing Command with settable `RunResult` and `HelpText` | `command_mock.go:10-34` |

## Answers to Protocol Questions

### 1. How are subcommands registered?

Subcommands are registered by adding entries to `CLI.Commands`, a `map[string]CommandFactory`. The key is the command name; spacing in the key (e.g., `"foo bar"`) creates nesting. Registration is imperative — you build the map yourself and assign it to `c.Commands`. There is no declarative struct tag or builder pattern.

```go
// cli.go:56-70
Commands map[string]CommandFactory
```

### 2. How is command discovery handled?

Discovery is handled by a radix tree (`github.com/armon/go-radix`) built at init time from the `Commands` map. The `CLI.Run()` method does a lookup on the parsed subcommand name. For nested commands, longest-prefix matching is used. The tree is walked for help output and autocomplete generation.

```go
// cli.go:333-341
c.commandTree = radix.New()
c.commandNested = false
for k, v := range c.Commands {
    k = strings.TrimSpace(k)
    c.commandTree.Insert(k, v)
    if strings.ContainsRune(k, ' ') {
        c.commandNested = true
    }
}
```

### 3. Are commands declarative or imperative?

Imperative. The `Command` interface is the only contract. There are no base structs, no struct embedding helpers, no functional options for configuring common command behavior. Each command implementation is a fresh struct/class that independently implements `Help()`, `Run([]string) int`, and `Synopsis()`. The library provides `MockCommand` for tests, but no reusable scaffolding for production commands.

```go
// command.go:14-31 — Command is just an interface, no base implementation
type Command interface {
    Help() string
    Run(args []string) int
    Synopsis() string
}
```

### 4. How do parent/child commands communicate?

Indirectly. The `CLI` struct holds the parsed `subcommand` and `subcommandArgs` which are passed to the child's `Run` method. The child has no direct reference to the parent `CLI` instance — it only receives args. Parent commands that don't exist are auto-created as no-op `MockCommand` instances that return `RunResultHelp` to trigger help display.

```go
// cli.go:262 — command.Run receives only the subcommand args
code := command.Run(c.SubcommandArgs())
```

### 5. How much logic exists directly in commands?

The library itself keeps logic out of commands — `CLI.Run()` handles routing, help, version, and autocomplete. The `Run` method is intentionally thin. However, the design places no constraints on what implementers put in their `Run` methods: there are no pre/post hooks, no middleware, no flag parsing infrastructure. Command authors own all flag parsing and business logic within `Run`.

```go
// cli.go:262 — CLI is a thin router, logic is in command implementation
code := command.Run(c.SubcommandArgs())
```

## Architectural Decisions

1. **Interface-only commands** — No base struct or embedding pattern. Commands must implement `Help()`, `Run([]string) int`, and `Synopsis()`. This is simple but forces repetition across all command implementations.

2. **Factory-driven instantiation** — `CommandFactory func() (Command, error)` allows lazy init and potential error during construction. The comment notes factories should be "as cheap as possible" and expensive init should be deferred.

3. **Radix tree for routing** — Uses `github.com/armon/go-radix` for O(k) lookup where k is key length. Enables longest-prefix matching for nested subcommands without additional data structures.

4. **Space-in-key naming for nesting** — `"foo bar"` as a key automatically creates `"foo"` as a parent. Parent auto-creation (`cli.go:344-382`) fills in missing parents as no-op commands.

5. **Special return codes** — `RunResultHelp = -18511` is a sentinel. The CLI treats this specially to render help and return exit code 1. This is a non-standard pattern.

6. **Autocomplete via `posener/complete`** — Shell autocompletion is a first-class feature, integrated through `CommandAutocomplete` interface and `initAutocompleteSub()` which recursively builds the completion tree.

## Notable Patterns

- **Command interface** — Minimal 3-method interface. Extensible via `CommandAutocomplete` and `CommandHelpTemplate` optional interfaces.
- **Factory pattern** — `CommandFactory` allows command construction to fail and defers init until needed.
- **Radix tree routing** — Clean longest-prefix matching for nested subcommands.
- **Auto-parent creation** — Registers missing intermediate parents automatically as `MockCommand` with `RunResultHelp`.
- **Special help sentinel** — `RunResultHelp` return value from `Run()` triggers help display.
- **Template-based help** — Uses `text/template` with Sprig functions, customizable via `CommandHelpTemplate`.

## Tradeoffs

| Decision | Benefit | Cost |
|----------|---------|------|
| No base command struct | Simplicity, no inheritance depth | Repetitive `Help()`/`Synopsis()` implementations across every command |
| No lifecycle hooks | Simplicity, no hidden behavior | No way to run code before/after all commands without manual wrapping each factory |
| Space-key nesting | Zero config nesting | Implicit structure is hard to discover; naming convention is fragile |
| Special `RunResultHelp` | Simple help trigger | Non-standard return value semantics, easy to misuse |
| Factory per command | Lazy init, error on construct | Every command must be a factory; can't share state between commands easily |
| Radix tree routing | Fast prefix matching | Key ordering matters; `"foo bar"` vs `"foo"` interaction is complex |

## Failure Modes / Edge Cases

1. **Commands with spaces in args** — Quoted args with spaces are treated as subcommand tokens. `cli foo "bar baz"` is invalid; the space in `"bar baz"` triggers subcommand parsing. Verified in `TestCLIRun_nestedBlankArg` (`cli_test.go:430-459`).

2. **Prefix collision** — If you register `"foobar"` and `"foo bar"`, running `cli foobar` will match `"foo"` first (longest prefix of `"foobar"` within the tree is `"foo"`), then pass `"bar"` as arg. This is documented but surprising. Test at `cli_test.go:143-172`.

3. **Factory errors** — If a `CommandFactory` returns an error, execution halts with exit code 1. No recovery mechanism.

4. **`RunResultHelp` collision** — If a command legitimately wants to exit with code `-18511`, behavior is wrong. Unlikely but possible.

5. **Parent auto-creation creates empty commands** — Auto-created parent commands (`MockCommand` with `RunResultHelp`) can't be distinguished from intentionally registered parent commands.

6. **No flag parsing infrastructure** — The library does not wrap `flag` or provide any flag parsing. Each `Run` implementation must do its own. This is by design but creates inconsistency across commands.

## Future Considerations

- A base `Command` struct with common fields (name, synopsis, help text) and embedded methods would reduce boilerplate.
- Lifecycle hooks (`BeforeRun`, `AfterRun`) could be added via interface extension or base struct.
- A `CommandBuilder` with functional options could provide declarative command definition with common configuration.
- Flag parsing integration (either built-in or a recommended library pattern) would reduce per-command inconsistency.

## Questions / Gaps

1. **No evidence found** for command grouping/clusters — commands are a flat map with no explicit grouping mechanism beyond the spaced-key naming convention.
2. **No evidence found** for pre-run or post-run hooks in the library itself; these would need to be implemented by each command author.
3. **No evidence found** for a flag parsing abstraction — each command is responsible for its own flag handling in the `Run` method.
4. **No evidence found** for command inheritance or composition — commands cannot be composed from other commands.

---

Generated by `study-areas/02-command-architecture.md` against `mitchellh-cli`.