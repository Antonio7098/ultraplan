# Repo Analysis: helm

## Command Architecture

### Repo Info

| Field | Value |
|-------|-------|
| Name | helm |
| Path | `repos/helm` |
| Group | `go-cli-study` |
| Language / Stack | Go / Cobra |
| Analyzed | 2026-05-15 |

## Summary

Helm uses a clean, layered command architecture with Cobra. Commands in `pkg/cmd/` are thin wrappers that delegate to `pkg/action/` for business logic. Subcommands are registered imperatively via `cmd.AddCommand()`. The pattern scales well—50+ commands with consistent structure.

## Rating

**8/10** — Thin commands with reusable patterns. Commands stay lean by delegating to action package. Some larger commands (install.go:378 lines) show mixed concerns but overall well-organized.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Root command creation | `NewRootCmd()` returns configured `*cobra.Command` | `pkg/cmd/root.go:105` |
| Subcommand registration | `cmd.AddCommand(...)` with 20+ commands | `pkg/cmd/root.go:267-303` |
| Parent-child communication | `action.Configuration` passed to factory functions | `pkg/cmd/install.go:132` |
| Command factory pattern | `newInstallCmd(cfg *action.Configuration, out io.Writer)` | `pkg/cmd/install.go:132` |
| Action layer delegation | `client := action.NewInstall(cfg)` | `pkg/cmd/install.go:133` |
| Lifecycle hooks | `PersistentPreRun`/`PersistentPostRun` on root | `pkg/cmd/root.go:156-165` |
| Flag binding helpers | `addInstallFlags()`, `bindOutputFlag()` | `pkg/cmd/install.go:174`, `pkg/cmd/flags.go:121` |
| Argument validators | `require.MinimumNArgs()`, `require.NoArgs()` | `pkg/cmd/require/args.go:68`, `pkg/cmd/require/args.go:25` |
| Plugin loading | `loadCLIPlugins(cmd, out)` at root setup | `pkg/cmd/load_plugins.go:55` |
| RunE signature | `RunE: func(cmd *cobra.Command, args []string) error` | `pkg/cmd/install.go:145` |
| Subcommand composition | `cmd.AddCommand(newGetAllCmd(...), newGetValuesCmd(...), ...)` | `pkg/cmd/get.go:47-52` |

## Answers to Protocol Questions

**1. How are subcommands registered?**

Subcommands are registered imperatively via `cmd.AddCommand()` calls in parent command factory functions. The root command aggregates all subcommands in `newRootCmdWithConfig()` at `pkg/cmd/root.go:267-303`. Each subcommand has its own factory function (e.g., `newInstallCmd`, `newGetCmd`) that returns a `*cobra.Command`.

**2. How is command discovery handled?**

No automatic discovery for built-in commands—all are explicitly registered in `newRootCmdWithConfig()`. Plugin commands are discovered dynamically via `loadCLIPlugins()` (`pkg/cmd/load_plugins.go:55`) which scans plugin directories and loads plugins conforming to the `cli/v1` schema. Completion uses `ValidArgsFunction` on each command for shell completion hints.

**3. Are commands declarative or imperative?**

Imperative. Each command factory function directly constructs a `cobra.Command` struct with fields set inline. No external DSL or configuration file defines commands. However, the pattern is consistent enough that it feels declarative in practice.

**4. How do parent/child commands communicate?**

Via the `action.Configuration` struct which is created once at root and passed through to each factory function. The `action.Configuration` holds shared state (Kubernetes client, storage driver, registry client). Child commands access it via closure or explicit parameter passing. See `pkg/cmd/install.go:132` where `cfg *action.Configuration` is the first parameter.

**5. How much logic exists directly in commands?**

Commands are intentionally thin. The `RunE` function in `pkg/cmd/install.go:145-171` does minimal work: creates a registry client, parses flags, calls `runInstall()`, formats output. The bulk of logic lives in `pkg/action/` (e.g., `action.NewInstall(cfg)` at `pkg/action/install.go:74`). Some commands have longer `RunE` blocks but still delegate heavily. `runInstall()` at `pkg/cmd/install.go:254` contains substantial setup logic (chart location, dependency checking, signal handling), suggesting some business logic still lives in the cmd layer.

## Architectural Decisions

- **Separation of concerns**: `pkg/cmd/` handles CLI wiring (flags, output formatting); `pkg/action/` handles business logic
- **Configuration injection**: `action.Configuration` is the shared context passed to all commands
- **Output abstraction**: `output.Format` interface with `WriteTable/WriteJSON/WriteYAML` methods decouples output logic
- **Plugin extensibility**: Plugins loaded dynamically via `loadCLIPlugins()`, with optional `completion.yaml` and `plugin.complete` for shell completion

## Notable Patterns

- **Factory functions**: Each command has a `newXxxCmd(cfg *action.Configuration, out io.Writer) *cobra.Command` function
- **Flag helpers**: Shared flag binding functions in `flags.go` like `addValueOptionsFlags()`, `addChartPathOptionsFlags()`, `bindOutputFlag()`
- **Argument validators**: Composable validators in `pkg/cmd/require/args.go`
- **Lifecycle hooks**: Global `PersistentPreRun`/`PersistentPostRun` on root command for profiling (`pkg/cmd/root.go:156-165`)
- **Release output formatting**: `statusPrinter` struct implements multiple output interfaces (`pkg/cmd/install.go:164`)

## Tradeoffs

- **Pros**: Clean separation enables testing action logic without CLI overhead; consistent patterns across all 50+ commands
- **Cons**: Some commands (install.go:378 lines) are still quite large with mixed concerns; `runInstall()` at 100 lines shows business logic leakage into cmd layer; no built-in pre/post run hooks per command (only global PersistentPreRun/PostRun)
- **Plugin system**: Full plugin extensibility at cost of complexity in `load_plugins.go:404 lines`

## Failure Modes / Edge Cases

- **Expired repo warnings**: `checkForExpiredRepos()` at `pkg/cmd/root.go:357` prints warnings to stderr but continues execution
- **Memory driver loading**: `loadReleasesInMemory()` silently skips on unexpected driver type (`pkg/cmd/root.go:324`)
- **Flag parsing errors**: Unknown flags allowed at parse time but caught later (`pkg/cmd/root.go:177`)
- **Plugin name conflicts**: `loadCLIPlugins()` logs error and skips conflicting plugin names (`pkg/cmd/load_plugins.go:138-141`)

## Future Considerations

- Could extract `runInstall()` and similar into `pkg/action/` to fully externalize business logic
- Pre/post run hooks per-command (not just global) would improve composability
- Command grouping via Cobra command groups not visibly used—could organize 50+ commands into logical clusters

## Questions / Gaps

- **Command grouping**: No evidence of Cobra command groups being used to organize related commands
- **Per-command lifecycle hooks**: No evidence of `PersistentPreRun`/`PersistentPostRun` being used on subcommands, only on root
- **Shared scaffolding base types**: No evidence of a base command type—each factory starts fresh with `&cobra.Command{}`

---

Generated by `02-command-architecture.md` against `helm`.