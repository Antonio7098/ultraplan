# Repo Analysis: restic

## Command Architecture Protocol

### Repo Info

| Field | Value |
|-------|-------|
| Name | restic |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/restic` |
| Group | `02-command-architecture` |
| Language / Stack | Go (using spf13/cobra) |
| Analyzed | 2026-05-15 |

## Summary

restic uses a clean, factory-function-based command architecture built on cobra. Commands are defined as thin wrappers around `RunE` functions that delegate to internal library packages. Subcommands are registered imperatively via `cmd.AddCommand()` with explicit `newXxxCommand()` factory functions. The architecture is moderately declarative—commands describe themselves but logic lives in standalone functions that receive pre-constructed dependencies. Command grouping uses cobra's `GroupID` mechanism. Global options are passed by pointer reference and accessed via `PersistentPreRunE`.

## Rating

**7 out of 10** — Thin commands with reusable patterns, but some commands contain substantial logic directly in `RunE` (e.g., `cmd_backup.go:486-707` is ~220 lines). The pattern scales reasonably well to 100+ commands but could benefit from more abstraction for complex commands.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Root command factory | `newRootCommand()` creates root cobra.Command, adds command groups, registers subcommands | `cmd/restic/main.go:37-114` |
| Command grouping | Two groups: `cmdGroupDefault` ("Available Commands") and `cmdGroupAdvanced` ("Advanced Options") | `cmd/restic/main.go:34-69` |
| Subcommand registration | Each command calls `cmd.AddCommand(...)` with factory functions | `cmd/restic/main.go:77-106` |
| Command factory pattern | All commands use `newXxxCommand(globalOptions *global.Options) *cobra.Command` signature | `cmd/restic/cmd_backup.go:35`, `cmd/restic/cmd_check.go:27`, etc. |
| Options struct + AddFlags | Each command has an `XxxOptions` struct with `AddFlags(*pflag.FlagSet)` method | `cmd/restic/cmd_backup.go:84-115`, `cmd/restic/cmd_check.go:70-77` |
| RunE function pattern | `RunE: func(cmd *cobra.Command, args []string) error { return runXxx(...) }` | `cmd/restic/cmd_backup.go:75-77`, `cmd/restic/cmd_check.go:50-60` |
| PreRunE hooks | Backup command uses `PreRunE` for environment variable handling | `cmd/restic/cmd_backup.go:55-72` |
| PersistentPreRunE | Root command uses `PersistentPreRunE` to initialize global options (password, etc.) | `cmd/restic/main.go:51-57` |
| Parent/child communication | `globalOptions` passed by pointer to all commands, allowing parent to propagate state | `cmd/restic/main.go:77-106` |
| Locking helpers | Shared `openWithReadLock`, `openWithAppendLock`, `openWithExclusiveLock` for parent/child coordination | `cmd/restic/lock.go:38-50` |
| Global options struct | `global.Options` holds repo, password, verbosity, JSON mode, cache settings, backends | `internal/global/global.go:46-89` |
| Parent command | Parent `key` command has no `RunE`, only groups subcommands | `cmd/restic/cmd_key.go:8-27` |
| Command lifecycle | No explicit pre/post hooks beyond cobra's built-in `PreRunE`/`PostRunE` | N/A |

## Answers to Protocol Questions

### 1. How are subcommands registered?

Subcommands are registered via `cmd.AddCommand()` calls in `main.go:77-106`. Each factory function (e.g., `newBackupCommand`, `newCheckCommand`) returns a `*cobra.Command` which is then added to the root command. Subcommands can also be nested: `key` command (`cmd_key.go:20-25`) registers `add`, `list`, `passwd`, and `remove` as children via `cmd.AddCommand()`.

Registration is fully imperative—no declarative tag or attribute system is used.

### 2. How is command discovery handled?

Command discovery is implicit through the `newRootCommand()` function's `cmd.AddCommand(...)` call with ~30 commands listed directly. There is no dynamic discovery via file globbing or package scanning. All commands are known at compile time in `main.go`.

### 3. Are commands declarative or imperative?

The command *structure* is declarative (cobra.Command struct with fields like `Use`, `Short`, `RunE`), but command *registration* is imperative (explicit `AddCommand()` calls). The command *logic* is also imperative—all actual work happens in named functions like `runBackup()`, `runCheck()`, `runStats()`, etc., not in configuration.

### 4. How do parent/child commands communicate?

Communication happens through the `global.Options` pointer passed to every `newXxxCommand()` factory function. This shared struct contains repository location, password, verbosity settings, terminal interface, and backend registry. Child commands access it via the `*globalOptions` parameter and can modify shared state (e.g., `PersistentPreRunE` sets password from environment).

### 5. How much logic exists directly in commands?

Moderate amount. The pattern is:
- `newXxxCommand()` — 20-50 lines, defines cobra.Command struct and options
- `runXxx()` — actual implementation, often 50-200+ lines
- `XxxOptions` struct — holds all configuration

`cmd_backup.go:486-707` shows `runBackup()` at 222 lines with substantial logic inline. `cmd_check.go:225-419` shows `runCheck()` at ~200 lines. This is where the "somewhat organized but mixed with logic" (score 4-6) concern applies to some commands.

## Architectural Decisions

1. **Factory function pattern**: Every command uses `newXxxCommand(globalOptions *global.Options) *cobra.Command`. This ensures all commands receive the shared global options pointer and can access repository, password, verbosity, and terminal.

2. **Options struct with AddFlags method**: Each command has a dedicated `XxxOptions` struct containing all flags and a `AddFlags(*pflag.FlagSet)` method. This separates flag definition from command construction (`cmd_backup.go:84-164`, `cmd_check.go:70-91`).

3. **Separate run functions**: `newXxxCommand` sets `RunE: func(...) error { return runXxx(...) }`, delegating to a standalone function. This allows the run logic to be tested independently and reused if needed.

4. **Command grouping**: Uses cobra's `AddGroup()` and `GroupID` to divide commands into "Available Commands" and "Advanced Options" (`main.go:60-69`).

5. **Locking abstraction**: All repository locking goes through `openWithReadLock`, `openWithAppendLock`, `openWithExclusiveLock` helpers in `lock.go:38-50`, shared across all commands that need repository access.

## Notable Patterns

- **`newXxxCommand(globalOptions *global.Options) *cobra.Command`**: Universal factory signature across all commands
- **`XxxOptions` struct + `AddFlags(*pflag.FlagSet)`**: Standard pattern for command configuration (`cmd_backup.go:84-115`, `cmd_stats.go:80-91`)
- **`globalOptions` passed by reference**: Allows `PersistentPreRunE` to modify state that commands later read
- **`runXxx(ctx, opts, gopts, term, args) error`**: Separate run functions for testability and reuse
- **cobra `GroupID` for command organization**: Divides commands into default and advanced groups
- **`initMultiSnapshotFilter()`**: Shared helper for commands that operate on snapshot selections

## Tradeoffs

**Strengths:**
- Clean separation of command definition ( cobra struct) from execution logic (runXxx functions)
- Consistent factory pattern makes it predictable to add new commands
- Shared locking helpers ensure consistent repository access patterns
- `globalOptions` pointer propagation allows parent to set up context for all children

**Weaknesses:**
- Commands with complex logic (e.g., `runBackup` at 222 lines) become somewhat large
- No built-in lifecycle hooks beyond cobra's basic PreRunE/PostRunE
- No abstraction for common command patterns (snapshot filtering, progress reporting) beyond shared helper functions
- ~30 commands registered in one place (`main.go:77-106`) makes it a potential bottleneck for large-scale addition

## Failure Modes / Edge Cases

1. **Missing `globalOptions` pointer handling**: If a command's `runXxx` doesn't properly receive the `globalOptions` copy, it may operate on stale settings (password, repository location, etc.)

2. **Lock contention**: Multiple commands using `openWithAppendLock` or `openWithExclusiveLock` could conflict. The retry mechanism (`gopts.RetryLock`) handles some cases but there's no command-level coordination for operations that need multiple lock types (e.g., `cmd_rewrite.go:313-315` uses both).

3. **Options struct pollution**: As commands add more flags, `XxxOptions` structs grow large (e.g., `BackupOptions` has 25+ fields). This could become harder to maintain.

4. **Environment variable handling in PreRunE**: Commands like `cmd_backup.go:55-72` handle env vars in `PreRunE` which works but creates multiple code paths for the same option.

## Future Considerations

1. **Command composition**: Would benefit from a base command type or interface that encapsulates common patterns (snapshot filtering, progress printing, locking)
2. **Lifecycle hooks**: Formalized pre/post hooks beyond just `PreRunE` could help organize complex commands
3. **Run function extraction**: Some commands like `runBackup` (222 lines) could be further decomposed into sub-helpers for better organization

## Questions / Gaps

- **No evidence found** for dynamic command discovery—all commands are registered statically in `main.go:77-106`
- **No evidence found** for command-level error recovery or retry beyond repository locking
- **No evidence found** for command-level transaction or rollback handling
- **No evidence found** for command clustering beyond the two fixed groups (default/advanced)

---

Generated by `study-areas/02-command-architecture.md` against `restic`.