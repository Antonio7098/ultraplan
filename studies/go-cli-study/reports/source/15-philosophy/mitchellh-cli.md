# Repo Analysis: mitchellh-cli

## Engineering Philosophy & Tradeoffs

### Repo Info

| Field | Value |
|-------|-------|
| Name | mitchellh-cli |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/mitchellh-cli` |
| Group | `mitchellh-cli` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

A Go library for building command-line interfaces, created by Mitchell Hashimoto. It is the foundational CLI library for HashiCorp tools (Packer, Consul, Vault, Terraform, Nomad). The project prioritizes simplicity and interface-based extensibility over feature richness. It is **archived** and no longer actively maintained (`README.md:1-3`).

## Rating

**7/10** — Strong coherent engineering style with intentional philosophy

**Rationale**: The codebase exhibits disciplined simplicity with interface-based design. Decisions are consistent throughout. The tradeoff of avoiding complexity (no plugin system, no config files) while accepting complexity (nested subcommands via radix tree, multiple UI implementations, autocompletion) reflects clear engineering judgment.扣分原因：项目已归档；缺乏context支持；使用了较旧的Go模式。

## Evidence Collected

Every entry includes a file path with line numbers.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Project purpose | "cli is a library for implementing command-line interfaces in Go" | `README.md:9` |
| Powered tools | "cli is the library that powers the CLI for Packer, Consul, Vault, Terraform, Nomad" | `README.md:10-15` |
| Interface design | `Command` interface with `Help()`, `Run()`, `Synopsis()` | `command.go:14-31` |
| Factory pattern | `CommandFactory` type as factory function for deferred init | `command.go:64-67` |
| Radix tree | `armon/go-radix` used for subcommand lookup | `cli.go:16`, `cli.go:136` |
| Nested subcommands | Longest prefix matching via `commandTree.LongestPrefix()` | `cli.go:699` |
| UI interface | `Ui` interface with `Ask`, `Output`, `Error`, `Info`, `Warn` | `ui.go:19-43` |
| Thread-safe UI | `ConcurrentUi` wrapper with mutex | `ui_concurrent.go:9-12` |
| Hidden commands | `HiddenCommands` field to suppress from help/autocomplete | `cli.go:72-76` |
| Default command | Blank string key `""` in Commands map | `cli.go:57-58` |
| Help template | `text/template` with sprig functions | `cli.go:517` |
| Autocomplete | `posener/complete` library integration | `cli.go:16`, `cli.go:91-93` |
| Autocomplete install | `autocomplete-install` flag for shell integration | `cli.go:95-100` |
| CLI struct | Single struct with all config, no nested config structs | `cli.go:49-149` |
| Simple defaults | `NewCLI` sets `Autocomplete: true` | `cli.go:152-159` |
| Changelog | No dedicated changelog; Git history is the record | (git history) |

## Answers to Protocol Questions

### 1. What philosophy does this repo optimize for?

**Simplicity with interface-based extensibility.**

The library optimizes for being a thin, composable layer over raw Go for CLI applications. Evidence:
- 17 source files total across all functionality (`cli.go:1-742`, `command.go`, `ui.go`, `help.go`, `ui_*.go`)
- Minimal external dependencies (7 in `go.mod:5-17`)
- Clear interfaces that users implement: `Command`, `CommandAutocomplete`, `CommandHelpTemplate`, `Ui`
- Factory pattern ensures cheap CLI instantiation (`command.go:64-67`)

The README explicitly lists features as "easy" and "optional" (`README.md:17-40`), indicating a philosophy of providing helpers without requiring them.

### 2. What complexity is intentionally accepted?

- **Nested subcommand dispatch** via radix tree longest-prefix matching (`cli.go:336-341`, `cli.go:699-710`) — necessary for complex tool CLIs like Terraform
- **Shell autocompletion** across bash/zsh/fish via `posener/complete` (`cli.go:91-93`) — high complexity but expected in serious tools
- **Multiple UI implementations** (BasicUi, PrefixedUi, ColoredUi, ConcurrentUi) — each adds complexity but provides user choice
- **Template-based help** with sprig functions (`cli.go:517`) — enables rich help text but introduces template parsing complexity
- **Signal handling** in `BasicUi.ask()` for interruptible input (`ui.go:67-104`) — complex but necessary for good UX

### 3. What complexity is intentionally avoided?

- **Plugin system** — Not present; users extend via interfaces only
- **Configuration file parsing** — Not built in; users handle their own config
- **Advanced argument parsing** — Only basic flag recognition; no subcommand flag routing
- **Dependency injection** — No container; simple field-based initialization
- **Context support** — `context.Context` is not used anywhere; the library predates Go's context package becoming standard
- **Structured logging** — Only `log` package used in error paths (`help.go:48`)
- **Versioning/deprecation policy** — No explicit policy; library is simply archived

## Architectural Decisions

| Decision | Evidence | Rationale |
|----------|----------|-----------|
| Radix tree for commands | `cli.go:136`, `cli.go:333` | O(k) lookup where k is key length; natural fit for hierarchical commands |
| Factory functions for commands | `command.go:64-67` | Defers expensive init; `cli.go:65-69` documents this expectation |
| Single `CLI` struct with all state | `cli.go:49-149` | Simpler than nested config objects; no builder pattern needed |
| Interface-based UI | `ui.go:19-43` | Allows user to implement any output strategy; `UiWriter` bridges loggers |
| ConcurrentUi wrapper | `ui_concurrent.go:7-12` | Thread safety opt-in rather than default; avoids overhead |
| Default autocomplete enabled | `cli.go:156` | Convenience for users; can be disabled |

## Notable Patterns

1. **Double-checked locking via `sync.Once`** — Used for `init()` in `CLI` (`cli.go:134`, `cli.go:308`) and `MockUi` (`ui_mock.go:32`, `ui_mock.go:79`)

2. **Interface extension pattern** — `CommandAutocomplete` extends `Command` (`command.go:33-47`), `CommandHelpTemplate` extends `Command` (`command.go:49-62`)

3. **Radix tree for hierarchy** — Nested subcommands use `LongestPrefix` matching (`cli.go:699`)

4. **Decorator pattern for UI** — `PrefixedUi`, `ColoredUi`, `ConcurrentUi` all wrap a base `Ui` (`ui.go:130`, `ui_colored.go:30`, `ui_concurrent.go:9`)

5. **Mock pattern for testing** — `MockCommand`, `MockUi` are publicly exported (`command_mock.go:10`, `ui_mock.go:20`)

## Tradeoffs

| Accepted | Avoided | Rationale |
|----------|---------|------------|
| Autocompletion complexity | Plugin system | Autocompletion is standard expectation; plugins add coupling |
| Multiple UI implementations | Configuration parsing | Users have wildly different output needs; config is domain-specific |
| Template-based help | Strict argument validation | Flexibility for custom help formats; validation is user's responsibility |
| Global flags before subcommand | Flag routing to subcommands | Simpler dispatch; explicit in README (`cli.go:254-260`) |

## Failure Modes / Edge Cases

1. **Default command ambiguity** — If `""` key exists and user passes a subcommand, the default command receives `topFlags` only, not the subcommand name (`cli.go:718-727`)

2. **Longest-prefix matching surprises** — `./cli fooasdf` matches `foo` command with `asdf` as argument if `foo bar` exists but `fooasdf` doesn't (`cli_test.go:174-199`)

3. **Autocomplete performance** — `initAutocompleteSub` instantiates all commands to check for `CommandAutocomplete` interface (`cli.go:482-485`); noted in code comment as expensive

4. **No flag parsing** — The library does no flag parsing; commands receive raw arguments (`cli.go:262`); users must use `flag` or `pflag` packages

5. **Hidden commands and autocomplete** — If a command implements `CommandAutocomplete` but is hidden, the autocomplete setup skips it silently (`cli.go:468-471`)

## Future Considerations

- **Archived status** — The project is in maintenance-only mode; no new features
- **Go version** — `go.mod` specifies `go 1.11`; modern Go features (generics, context) are not used
- **Replacement** — For new projects, consider `spf13/cobra` or `原vlarkin/urfave/cli` which are actively maintained
- **Context gap** — No `context.Context` support means cancellation propagation is user's responsibility

## Questions / Gaps

1. **No explicit philosophy document** — Philosophy must be inferred from structure and code comments; no `ARCHITECTURE.md` or `PHILOSOPHY.md` exists

2. **No error handling policy** — Error messages use different styles (`fmt.Errorf` vs `errors.New` vs `log.Printf`)

3. **No performance benchmarks** — No evidence of performance testing for command instantiation or lookup

4. **No security policy** — No documented policy for handling sensitive input (though `AskSecret` uses `speakeasy`)

---

Generated by `study-areas/15-philosophy.md` against `mitchellh-cli`.