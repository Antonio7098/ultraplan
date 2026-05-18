# Repo Analysis: mitchellh-cli

## Configuration Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | mitchellh-cli |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/mitchellh-cli` |
| Group | `mitchellh-cli` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

mitchellh-cli is a minimal command-dispatch framework for Go. It handles command-line flag parsing and subcommand routing, but provides no built-in support for environment variables or configuration files. Configuration is limited to CLI struct fields set at initialization time; there is no layered/precedence-based config system.

## Rating

**4/10** — Works but very limited config scope. Only command-line flags are supported. No env vars, no config files, no validation framework, no immutability guarantees.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Flag parsing | `processArgs()` iterates raw `os.Args`-equivalent, looking for `-h`, `-help`, `--help`, `-v`, `-version`, `--version`, and autocomplete flags | `cli.go:632-728` |
| Help flag detection | Detected in `processArgs()` — sets `c.isHelp` boolean | `cli.go:638-642` |
| Version flag detection | Detected in `processArgs()` — sets `c.isVersion` boolean | `cli.go:658-662` |
| Default values | `NewCLI()` sets `Name`, `Version`, `HelpFunc: BasicHelpFunc(app)`, `Autocomplete: true` | `cli.go:152-159` |
| CLI struct fields | `Name`, `Version`, `Autocomplete`, `HelpFunc`, `HelpWriter`, `ErrorWriter` — all public fields set at init | `cli.go:49-129` |
| Subcommand routing | `processArgs()` identifies subcommand by first non-flag arg, remaining args passed to `command.Run(args)` | `cli.go:672-715` |
| Flag validation | Flags before subcommand are tracked in `topFlags` and cause error exit code 1 if any subcommand is found | `cli.go:254-260` |
| No env var support | No evidence of `os.Getenv`, `os.LookupEnv`, or any env var reading anywhere in the codebase | (searched entire codebase) |
| No config file support | No evidence of file reading, JSON/YAML/toml parsing, or config file loading | (searched entire codebase) |
| No centralized validation | Each command's `Run()` method is solely responsible for validating its own arguments | `command.go:14-31` (interface definition) |

## Answers to Protocol Questions

### 1. How are flags, env vars, and config files merged?

**They are not merged — only flags are supported.** The library parses raw command-line arguments in `processArgs()` (`cli.go:632-728`). There is no environment variable handling and no configuration file loading. The `CLI` struct holds config as plain public fields (`Name`, `Version`, `Commands`, etc.) that are set directly by the caller before calling `Run()`.

### 2. What precedence rules exist?

**No formal precedence rules exist.** Since only one config source (flags) is implemented, precedence is trivial: flags are parsed in order. The only ordering constraint is that "top flags" (flags appearing before the subcommand name) are treated as errors if a subcommand is subsequently found (`cli.go:254-260`).

### 3. Is config immutable after startup?

**Partially.** The `CLI` struct fields are set before `Run()` is called and are not mutated during execution except for:
- `isHelp`, `isVersion`, `isAutocompleteInstall`, `isAutocompleteUninstall` booleans (set during `init()` / `processArgs()` at `cli.go:145-148`)
- `subcommand` and `subcommandArgs` (set during `processArgs()` at `cli.go:139-140`)
- `topFlags` (accumulated during `processArgs()` at `cli.go:141`)

However, individual command implementations receive `[]string` args and may do anything with them. The library itself imposes no immutability contract on the args slice.

### 4. Is validation centralized?

**No.** Validation is entirely the responsibility of each command's `Run()` method. The `Command` interface (`command.go:14-31`) defines `Run(args []string) int` with no validation hook or middleware. There is no centralized config validation at startup.

## Architectural Decisions

- **Minimal design**: The library intentionally stays narrow — just subcommand dispatch, argument parsing, help generation, and autocomplete. Config is intentionally NOT a concern of this library.
- **Factory pattern for commands**: `CommandFactory func() (Command, error)` (`command.go:64-67`) allows cheap command instantiation and enables the autocomplete system to instantiate commands without side effects.
- **One-time init**: `sync.Once` (`cli.go:134`) ensures `init()` and `processArgs()` run exactly once per `Run()` call, preventing re-parsing.
- **Longest-prefix matching for nested subcommands**: Uses a radix tree (`autocomplete.go:16`, `command.go:136`) for efficient subcommand lookup with nested command support.

## Notable Patterns

- **`sync.Once` for deferred initialization**: `c.once.Do(c.init)` in `IsHelp()`, `IsVersion()`, `Subcommand()`, `SubcommandArgs()` (`cli.go:164-167`, `171-174`, `276-278`, `283-285`) ensures args are parsed before being queried.
- **Radix tree for command lookup**: `github.com/armon/go-radix` at `cli.go:15` for O(k) longest-prefix subcommand matching.
- **CommandAutocomplete interface**: Optional interface (`command.go:33-47`) allows per-command fine-grained autocomplete for args and flags.
- **Default command via empty string key**: Register `""` as a command key to handle the case where no subcommand is given (`cli.go:720-727`).

## Tradeoffs

- **No config file/env var support**: Appropriate for the library's scope as a thin CLI framework, but means any project needing layered config must build it externally or use a different library.
- **No validation framework**: Each command is responsible for its own validation, leading to inconsistent error handling across commands.
- **No config immutability guarantees**: While the CLI struct fields don't change after init, commands receive mutable `[]string` args with no constraints.
- **Flag parsing is ad-hoc**: Flag parsing is manual string matching in `processArgs()` rather than using a battle-tested library like `flag` or `pflag`. No support for flag types, flag aliases, or flag descriptions.

## Failure Modes / Edge Cases

- **Flags before subcommand**: If a user runs `./cli -v foo` where `foo` is a subcommand, `-v` is treated as a version flag (not an error) per `cli.go:658-662`. However, arbitrary flags before a subcommand (stored in `topFlags`) cause an error at `cli.go:254-260`.
- **Unknown subcommand**: Returns exit code 127 and prints help (`cli.go:237-240`).
- **Default command collision**: If both `""` (default) and a named subcommand key match, the named subcommand wins because it's found first in the radix tree.
- **Autocomplete + autocomplete install/uninstall**: Both install and uninstall flags together cause an error (`cli.go:209-214`).

## Future Considerations

- Adding env var support via `os.LookupEnv` in `processArgs()` would be straightforward but requires a naming convention.
- A config file layer (e.g., JSON/YAML in `~/.apprc`) could be loaded in `NewCLI()` or `init()` before flag parsing, with flags overriding file values.
- A validation middleware or `Validate() error` method on the `Command` interface would centralize error handling.

## Questions / Gaps

- **No evidence of config file support**: Searched for `ioutil.ReadFile`, `os.Open`, `json.Unmarshal`, `yaml.Unmarshal` — none found.
- **No evidence of environment variable support**: Searched for `os.Getenv`, `os.LookupEnv` — none found.
- **No evidence of centralized validation**: No `Validate()` method on `Command` interface, no validation helpers found.
- **No evidence of config immutability**: No use of `sync.RWMutex` or copy-on-write patterns for config fields.

---

Generated by `study-areas/04-configuration-management.md` against `mitchellh-cli`.