# Command Architecture - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Protocol | `study-areas/02-command-architecture.md` |
| Groups | `go-cli-study` |
| Date | 2026-05-15 |

## Repositories Studied

| # | Repo | Path | Group |
|---|------|------|-------|
| 1 | age | `repos/age` | go-cli-study |
| 2 | chezmoi | `repos/chezmoi` | 02-command-architecture |
| 3 | dive | `repos/dive` | 02-command-architecture |
| 4 | fzf | `repos/fzf` | fzf |
| 5 | gdu | `repos/gdu` | gdu |
| 6 | gh-cli | `repos/gh-cli` | 02-command-architecture |
| 7 | go-task | `repos/go-task` | go-cli-study |
| 8 | helm | `repos/helm` | go-cli-study |
| 9 | k9s | `repos/k9s` | k9s |
| 10 | lazygit | `repos/lazygit` | lazygit |
| 11 | mitchellh-cli | `repos/mitchellh-cli` | mitchellh-cli |
| 12 | opencode | `repos/opencode` | opencode |
| 13 | rclone | `repos/rclone` | rclone |
| 14 | restic | `repos/restic` | 02-command-architecture |
| 15 | urfave-cli | `repos/urfave-cli` | go-cli-study |
| 16 | yq | `repos/yq` | yq |

## Executive Summary

The 16 studied repositories exhibit four distinct architectural approaches to CLI command structure, ranging from single-binary flat flags to sophisticated hierarchical command trees with lifecycle hooks. Projects scoring 7-8/10 (chezmoi, dive, gh-cli, helm, rclone, urfave-cli) consistently demonstrate that **thin command wrappers delegating to reusable business logic** produce maintainable architectures. Projects scoring 3-6/10 tend to either lack command hierarchies entirely (age, fzf, lazygit, gdu) or concentrate too much logic in command handlers (opencode, yq, k9s). The most effective pattern combines factory-function command creation, a shared configuration/context object, and explicit delegation to a separate business-logic package.

## Core Thesis

Elite Go CLI projects separate **command wiring** (flag definitions, output formatting, error handling) from **business logic** (encryption, file operations, git operations). Commands should be thin orchestration layers that receive dependencies and call library functions. The evidence strongly supports this: chezmoi, helm, gh-cli, and rclone all achieve high ratings by delegating to packages like `internal/cmd/config.go` → `sourceState`, `pkg/action/`, `pkg/cmdutil/factory.go`, and `fs/operations/`. The opposite pattern—commands as monolithic `RunE` functions containing all logic—is a strong indicator of architectural weakness (age, fzf, yq).

## Rating Summary

| Repo | Score | Approach | Main Strength | Main Concern |
|------|-------|----------|---------------|--------------|
| age | 4 | Multi-binary, imperative | Minimal dependencies | No command hierarchy, code duplication |
| chezmoi | 8 | Declarative, cobra, annotations | Sophisticated lifecycle via annotations | Large Config struct coupling |
| dive | 8 | Thin commands, adapter pattern | Clean delegation via adapters | Limited to 2 commands |
| fzf | 3 | Single-command, flat flags | Simple for single-purpose tool | Cannot scale beyond one command |
| gdu | 4 | Single root, flag-driven branching | Simple UI abstraction (App struct) | No subcommand composition |
| gh-cli | 8 | Declarative, Factory DI | Consistent structure, testable | Some PreRunE accumulation |
| go-task | 6 | Flat flags + YAML Taskfiles | User-friendly declarative tasks | No CLI subcommand hierarchy |
| helm | 8 | Thin cmd/action layering | Clean cmd/action separation | Some cmd layer logic leakage |
| k9s | 6 | Bifurcated CLI/TUI + interpreter | Dynamic alias resolution | Interpreter scales poorly |
| lazygit | 3 | TUI app, flaggy parser | Focused single-purpose design | No command architecture applicable |
| mitchellh-cli | 6 | Interface-only, radix routing | Simple routing via radix tree | No lifecycle hooks, repetitive |
| opencode | 5 | Single command, imperative | Clean business logic separation | RunE is a 130-line monolith |
| rclone | 8 | Declarative, init-based registration | cmd.Run wrapper for lifecycle | Complex commands have logic in cmd layer |
| restic | 7 | Factory pattern, global.Options | Consistent factory signature | Some large runXxx() functions |
| urfave-cli | 8 | Declarative struct, functional options | Lifecycle hooks (Before/After) well-designed | DefaultCommand is string-based |
| yq | 6 | Imperative RunE, global flags | Library delegation to yqlib | Global state, RunE too long |

## Approach Models

### 1. Thin-Delegate Pattern (chezmoi, gh-cli, helm, rclone, restic)

These projects achieve 7-8/10 by strictly separating command wiring from business logic:

- **Command layer** (`cmd/`): Flag definitions, cobra.Command construction, output formatting, error wrapping
- **Business logic layer** (`pkg/action/`, `internal/cmd/`, `fs/`, `yqlib/`): Pure functions with no Cobra dependencies

The `newXxxCmd()` factory function is the universal pattern, consistently returning `*cobra.Command`. Commands call `cmd.Run()` wrappers or directly invoke business logic functions. PersistentPreRunE on the root command handles shared initialization (auth, config loading, repo setup).

Evidence: `pkg/cmd/install.go:132-145` (helm), `pkg/cmdutil/factory.go:16-43` (gh-cli), `internal/cmd/config.go:1833-1845` (chezmoi).

### 2. Adapter/Delegate Pattern (dive)

Rather than delegating to a library package, dive uses an **adapter pattern** within the command layer:

- `adapter/resolver.go:17` wraps `image.Resolver` with logging/monitoring
- `adapter/exporter.go:23` returns `jsonExporter` interface
- `adapter/analyzer.go:21` returns `analysisActionObserver`

Commands (`root.go:41-59`, `build.go:26-44`) are thin orchestrators calling adapter factories. This scales well if the adapter interface is stable, but adding new adapter types requires touching the adapter package.

### 3. Flat-Flag Single-Entry Pattern (age, fzf, go-task, lazygit)

These tools reject subcommand hierarchies entirely:

- **age**: Multi-binary approach with separate `age`, `age-keygen`, `age-inspect` entry points
- **fzf**: Single `Options` struct with 120+ fields, `ParseOptions()` + `Run()` pattern
- **go-task**: CLI flags + YAML Taskfiles where "commands" are user-defined tasks
- **lazygit**: TUI where commands are keybindings, not CLI subcommands

This approach suits single-purpose tools but cannot scale to 100+ operations.

### 4. Bifurcated CLI/TUI Pattern (k9s, opencode)

k9s and opencode use Cobra only as an entry point; all meaningful interaction happens inside a TUI:

- **k9s** (`cmd/root.go:76`): `run()` is ~50 lines of TUI bootstrapping. Real commands live in `internal/view/command.go:176` via an interpreter pattern.
- **opencode** (`cmd/root.go:49`): 130-line `RunE` that initializes app, DB, MCP tools, and subscriptions before dispatching to TUI.

The limitation is that CLI commands remain thin wrappers; the real command system is invisible to CLI scripting.

### 5. Interface-Only Framework Pattern (mitchellh-cli, urfave-cli)

These are library/framework projects, not applications:

- **mitchellh-cli**: `Command` interface (`command.go:14-31`) with `Help()`, `Run([]string) int`, `Synopsis()`. No base implementation, no lifecycle hooks. Commands implement the interface from scratch.
- **urfave-cli v3**: `Command` struct with functional options. `Before`/`After` hooks run in chain. `setupDefaults()` auto-injects help and completion commands.

mitchellh-cli is more minimal; urfave-cli is more feature-complete but still doesn't provide command scaffolding for composition.

## Pattern Catalog

### Pattern 1: Factory Function Command Creation

**Problem**: How to consistently construct commands with dependencies.

**Solution**: Every command has a `newXxxCmd(cfg *Config) *cobra.Command` factory function.

**Evidence**:
- `chezmoi`: `newAddCmd()`, `newApplyCmd()` at `internal/cmd/addcmd.go:45`
- `gh-cli`: `NewCmdList(f *cmdutil.Factory)` at `pkg/cmd/issue/list/list.go:47`
- `helm`: `newInstallCmd(cfg *action.Configuration)` at `pkg/cmd/install.go:132`
- `restic`: `newBackupCommand(gopts *global.Options)` at `cmd/restic/cmd_backup.go:35`

**When to use**: Any project with more than 3 commands.

**When overkill**: Single-command tools with no shared dependencies.

### Pattern 2: Options Struct + AddFlags Method

**Problem**: How to organize command-specific flag definitions.

**Solution**: Each command has an `XxxOptions` struct with an `AddFlags(*pflag.FlagSet)` method.

**Evidence**:
- `restic`: `BackupOptions` struct with `AddFlags()` at `cmd/restic/cmd_backup.go:84-115`
- `gh-cli`: `ListOptions` struct at `pkg/cmd/issue/list/list.go:25-45`

**Benefit**: Separates flag definition from flag binding, testable.

### Pattern 3: Central Config/Context Object

**Problem**: How to share state across commands without global variables.

**Solution**: Single `Config` or `Options` struct holding all dependencies, passed to each command factory.

**Evidence**:
- `chezmoi`: `Config` struct at `internal/cmd/config.go:193-291` with 50+ fields
- `gh-cli`: `Factory` struct at `pkg/cmdutil/factory.go:16-43`
- `helm`: `action.Configuration` passed to all command factories
- `opencode`: `app.New(ctx, conn)` at `cmd/root.go:100` created in RunE

**Risk**: The central object can become a god object (chezmoi's `Config` has ~50 fields).

### Pattern 4: Lifecycle Hooks via PersistentPreRunE/PostRunE

**Problem**: How to run shared initialization before every command.

**Solution**: Root command `PersistentPreRunE` loads config, establishes connections, sets up state. Child commands inherit automatically.

**Evidence**:
- `chezmoi`: `persistentPreRunRootE` at `internal/cmd/config.go:2236`
- `gh-cli`: `PersistentPreRunE` at `pkg/cmd/root/root.go:82-95` for auth check
- `helm`: `PersistentPreRun`/`PersistentPostRun` at `pkg/cmd/root.go:156-165`
- `restic`: `PersistentPreRunE` at `cmd/restic/main.go:51-57` for global options init

**Benefit**: Commands don't repeat init logic. Child commands automatically get parent's hooks.

### Pattern 5: cmd.Run() Wrapper for Cross-Cutting Concerns

**Problem**: How to add retry logic, stats, error reporting consistently.

**Solution**: `cmd.Run()` function wraps every command's actual logic.

**Evidence**:
- `rclone`: `cmd.Run()` at `cmd/cmd.go:240-340` handles retry, stats, error counting
- `helm`: Uses similar pattern via `cmdutil.NewRunner()` with `resettable`

**Benefit**: Each command's RunE only contains business logic; cross-cutting handled centrally.

### Pattern 6: Annotation-Driven Command Behavior

**Problem**: How to declaratively specify command characteristics without cluttering logic.

**Solution**: Commands have `Annotations` map with behavioral flags interpreted at runtime.

**Evidence**:
- `chezmoi`: `modifiesSourceDirectory`, `persistentStateModeReadWrite` annotations at `internal/cmd/annotation.go:8-21`, interpreted by `persistentPreRunRootE` at `internal/cmd/config.go:2320-2392`
- `rclone`: `Annotations: map[string]string{"groups": "Sync,Copy,Filter"}` at `cmd/sync/sync.go:84-86`

**Benefit**: Command characteristics are declarative and centralized in the annotation system.

### Pattern 7: Adapter Pattern for Reusable Orchestration

**Problem**: How to add cross-cutting concerns (logging, monitoring) without polluting business logic.

**Solution**: Adapter structs wrap interfaces and add behavior.

**Evidence**:
- `dive`: `ImageResolver()` at `adapter/resolver.go:17` wraps `image.Resolver` with `imageActionObserver`
- `dive`: `NewExporter()` at `adapter/exporter.go:23` returns `jsonExporter` interface

**When to use**: When multiple commands need the same augmentation (logging, metrics, caching).

### Pattern 8: Command Grouping via GroupID

**Problem**: How to organize help output for 50+ commands.

**Solution**: `GroupID` field on commands, `AddGroup()` helper creates visual groupings.

**Evidence**:
- `chezmoi`: 8 groups defined at `internal/cmd/config.go:81-90`
- `gh-cli`: `cmdutil.AddGroup()` at `pkg/cmdutil/cmdgroup.go:5-14`
- `restic`: `cmdGroupDefault` and `cmdGroupAdvanced` at `cmd/restic/main.go:34-69`
- `rclone`: Uses Cobra annotations for groups

### Pattern 9: Radix Tree Routing for Nested Commands

**Problem**: How to handle nested subcommands without explicit parent pointers.

**Solution**: Space-in-key naming (`"foo bar"`) triggers nested mode; radix tree enables longest-prefix matching.

**Evidence**:
- `mitchellh-cli`: `c.commandTree` via `github.com/armon/go-radix` at `cli.go:236-269`
- Parent auto-creation at `cli.go:344-382` fills in missing intermediates as `MockCommand`

**Tradeoff**: Implicit structure is hard to discover; prefix collisions are surprising.

## Key Differences

### Framework Choice

| Framework | Repos | Strength | Weakness |
|-----------|-------|----------|----------|
| spf13/cobra | chezmoi, gh-cli, helm, k9s, opencode, rclone, restic, yq | Mature, battle-tested, rich features | Verbose boilerplate |
| urfave-cli | urfave-cli (itself) | Declarative struct, lifecycle hooks | Less mature ecosystem |
| flag | age | Minimal deps | No help generation, no subcommands |
| flaggy | lazygit | Simple | No subcommand support |
| pflag (via cobra) | Most cobra users | Posix-compliant flags | Part of cobra ecosystem |
| No framework | fzf, go-task | Minimal complexity | Reinventing wheel |

### Registration Mechanism

- **init() side-effects** (rclone, restic): `cmd.Root.AddCommand(cmdVar)` in each package's `init()`. Enables clean separation but relies on blank imports.
- **Factory functions in NewRootCmd** (chezmoi, gh-cli, helm, yq): All commands enumerated in root command setup. Centralized but grows linearly.
- **Map-based** (mitchellh-cli): `Commands map[string]CommandFactory`. Flexible but no hierarchical structure.

### Business Logic Location

- **Separate `pkg/action/` or `internal/` package** (helm, gh-cli, rclone): Business logic has no Cobra imports, making it testable without CLI overhead.
- **Inside command package** (yq, restic's complex commands): `runBackup()` at 220 lines demonstrates logic leakage.
- **Adapter pattern** (dive): Business logic wrapped in adapters at same layer as commands.

### Command Hierarchy Depth

- **1 level** (dive, gdu, yq): Only root + children. Simple but flat.
- **2-3 levels** (chezmoi, gh-cli, helm, rclone, restic): `root → group → subcommand` pattern.
- **Interpreter-based** (k9s): Flat CLI, in-app command interpreter handles depth dynamically.
- **No hierarchy** (age, fzf, go-task, lazygit): Single entry point or multi-binary.

## Tradeoffs

### Thin Commands vs. Self-Contained Commands

| Approach | Benefit | Cost | Best Fit |
|----------|---------|------|----------|
| Thin commands delegate to `pkg/action/` | Testable without CLI, reusable across callers | Requires package discipline | 50+ command tools (gh-cli, helm, rclone) |
| Commands contain business logic | Simple, single-package deployment | Hard to test, no reuse | 3-10 command tools (yq, restic's simpler commands) |

### Static vs. Dynamic Registration

| Approach | Benefit | Cost | Best Fit |
|----------|---------|------|----------|
| Static (explicit AddCommand) | Type-safe, compile-time validation | All commands must be known at compile | Most tools |
| init() side-effect | Clean package separation | Implicit, relies on blank imports | Large command count (rclone's 80+) |
| Dynamic (plugins) | Extensible by users | Complexity, API stability | Tools needing user extensibility (helm, k9s) |

### Lifecycle Hooks

| Approach | Benefit | Cost | Best Fit |
|----------|---------|------|----------|
| PersistentPreRunE on root | Shared init for all commands | All commands pay init cost even if unused | Tools with required auth/config |
| Per-command hooks | Fine-grained control | Inconsistent, verbose | Few commands with varied needs |
| No hooks | Simplicity | Repetitive init code | Simple tools |

### Global Config vs. Dependency Injection

| Approach | Benefit | Cost | Best Fit |
|----------|---------|------|----------|
| Central Config struct | Easy access, simple DI | God object,隐式耦合 | Medium CLIs |
| Factory + context | Explicit dependencies, testable | More boilerplate | Large CLIs |
| Global package vars | Simplest | Hard to test, thread-unsafe | Scripts, simple tools |

## Decision Guide

**Q: Should I use a subcommand hierarchy?**

If your tool has more than 5 distinct operations that users might chain or script, use subcommands. If it's a single-purpose filter or viewer, flat flags suffice.

**Q: Where should business logic live?**

In a separate package (`pkg/action/`, `internal/cmd/`). Commands should only: (1) parse flags, (2) construct dependencies, (3) call library functions, (4) format output. If your `RunE` is over 50 lines, consider extracting.

**Q: How do I handle shared initialization?**

Use `PersistentPreRunE` on the root command. It runs before every child command and is inherited automatically.

**Q: What about plugins?**

For internal extension (helm plugins, k9s YAML plugins), use a separate discovery mechanism. For user-contributed commands, design a stable plugin interface but keep it isolated from core command registration.

**Q: How do I organize 50+ commands?**

Use command grouping (GroupID), factory functions with consistent signatures (`newXxxCmd(cfg *Config) *cobra.Command`), and a `cmd.Run()` wrapper for cross-cutting concerns. Consider blank-import registration for auto-discovery.

## Practical Tips

1. **Start with factory functions**: `newXxxCmd(cfg *Config) *cobra.Command` for every command. This makes testing and dependency injection trivial.

2. **Use PersistentPreRunE for auth/config**: All studied elite CLIs (chezmoi, gh-cli, helm, restic) use this pattern. Don't make each command call `EnsureAuth()`.

3. **Delegate to library packages, not command packages**: helm's `pkg/action/`, gh-cli's `pkg/cmdutil/`, chezmoi's `internal/chezmoi/` — these packages have no Cobra imports.

4. **Wrap command execution for cross-cutting concerns**: rclone's `cmd.Run()` handles retry, stats, error counting. This avoids duplicating this logic across 80+ commands.

5. **Use annotations for behavioral metadata**: chezmoi's `modifiesSourceDirectory` annotation is elegant — runtime interpretation of declarative metadata keeps command logic clean.

6. **Consider functional options for complex configuration**: go-task's `ExecutorOption` interface at `executor.go:19-24` allows flexible configuration without embedding struct fields.

7. **Use command grouping for help readability**: chezmoi's 8 groups, gh-cli's `AddGroup`, restic's default/advanced split — these make `git diff`-style help tractable.

## Anti-Patterns / Caution Signs

1. **RunE functions over 100 lines**: yq's `evaluateSequence()` is 161 lines. restic's `runBackup()` is 222 lines. This is logic that should be in a library.

2. **Global package variables for configuration**: yq's `cmd/constant.go:1-39` stores flag values as package-level vars. This makes testing harder and introduces thread-safety concerns.

3. **No separation between cmd and lib layers**: age's `cmd/age/age.go:105-321` (604-line `main()`) contains all logic in one function. Cannot test business logic in isolation.

4. **Multi-binary for related operations**: age ships `age`, `age-keygen`, `age-inspect` as separate binaries. This avoids the framework problem but creates code duplication (separate `Version`, `usage`, flag parsing in each).

5. **Flat command structure when hierarchy is needed**: gdu uses flags (`--show-disks`, `--input-file`) for mode selection. For a disk analyzer with `analyze`, `report`, `config` operations, subcommands would scale better.

6. **Implicit parent-child via spacing**: mitchellh-cli's `"foo bar"` naming creates parents implicitly. This is clever but fragile — `foobar` vs `foo bar` prefix collisions cause surprising behavior.

7. **Bifurcated CLI/TUI hiding real commands**: k9s' real commands are in `internal/view/command.go:176` (211 lines) via an interpreter, invisible to CLI scripting. Users expecting `k9s get pods` will find it only works inside the TUI.

## Notable Absences

1. **No command composition mechanism found**: No repo demonstrated composing a new command from existing ones. chezmoi delegates to reusable `Config` methods, but this is method reuse, not command composition.

2. **No formal middleware chain**: Despite `Before`/`After` hooks in urfave-cli and chezmoi, no repo had a formal middleware/chain-of-responsibility pattern for cross-cutting concerns like logging, metrics, or tracing.

3. **No compile-time command graph validation**: urfave-cli's `DefaultCommand` is a string resolved at runtime. No repo had a static analysis tool to validate command references at compile time.

4. **No repo had both (a) command composition and (b) lifecycle hooks**:要么是像mitchellh-cli这样的最小框架没有hooks，要么是像urfave-cli这样有hooks但没有composition机制。

## Per-Repo Notes

- **age (4/10)**: Multi-binary approach is a valid choice for security-sensitive tools (reduced attack surface), but the code duplication is real. Could benefit from a shared `main.go` scaffolding package.

- **chezmoi (8/10)**: The annotation system (`annotation.go:8-21`) is the standout pattern. `makeRunEWithSourceState` at `config.go:1833` cleanly separates source state acquisition from command execution.

- **dive (8/10)**: Only 2 commands but the adapter pattern is exemplary. The `DisableFlagParsing: true` on build command (`build.go:25`) is a红灯 flag — necessary for docker build compatibility but disconnects from cobra's help system.

- **fzf (3/10)**: Single-command design is appropriate for a filter program. The 120+ field `Options` struct is the main concern for maintainability.

- **gdu (4/10)**: The single-command + flag approach works for gdu's focused use case. The `App` struct with `UI` interface shows good abstraction for output modes.

- **gh-cli (8/10)**: The Factory pattern is the standout feature. `pkg/cmdutil/factory.go:16-43` provides clean dependency injection. Command structure is highly consistent.

- **go-task (6/10)**: YAML Taskfiles as the "command definition language" is innovative. The `Executor` with functional options shows good internal design, but the CLI layer is thin flags.

- **helm (8/10)**: The `pkg/cmd/` + `pkg/action/` separation is the gold standard. `pkg/cmd/root.go:267-303` shows clean command enumeration. Plugin system adds complexity but is well-integrated.

- **k9s (6/10)**: The interpreter pattern for in-app commands is interesting but doesn't scale. `internal/view/command.go:270-313` grows linearly with new built-in commands.

- **lazygit (3/10)**: Not applicable to command architecture study. The TUI is the product, not the CLI.

- **mitchellh-cli (6/10)**: Interface-only design is clean but lacks scaffolding. No lifecycle hooks is a significant omission for production CLIs.

- **opencode (5/10)**: 130-line `RunE` at `cmd/root.go:49-183` is the main issue. The business logic separation is good, but orchestration is not DRY.

- **rclone (8/10)**: The `cmd.Run()` wrapper at `cmd/cmd.go:240` handles retry, stats, error counting — the standout lifecycle pattern. The `init()`-based registration scales to 80+ commands.

- **restic (7/10)**: Consistent factory pattern across all commands. `runBackup()` at 222 lines is the main concern. The locking helpers at `lock.go:38-50` are a good shared pattern.

- **urfave-cli (8/10)**: The lifecycle hook chain (`Before`/`After`) is well-designed. `ensureHelp()` at `command_setup.go:192-223` auto-injects help command is slightly magical. The `DefaultCommand` string-based lookup loses compile-time safety.

- **yq (6/10)**: Library delegation to `yqlib` is correct. The `cmd/constant.go` global variables and 150+ line RunE functions are the main concerns.

## Open Questions

1. **When does a central Config struct become a maintenance burden?** chezmoi's `Config` has ~50 fields. At what scale does this become problematic, and what are the alternatives?

2. **Is the `init()`-based registration worth the implicitness?** rclone relies on blank imports in `cmd/all/all.go` to trigger registration. Is this better or worse than explicit enumeration?

3. **How should complex commands be structured?** restic's `runBackup()` at 222 lines and yq's `evaluateSequence()` at 161 lines are borderline. What's the recommended extraction threshold?

4. **Should TUI-based tools have CLI subcommands?** k9s and opencode bifurcate CLI (entry point only) from TUI (real interaction). Is this a valid architectural choice or a missed opportunity for CLI scripting?

5. **When is a multi-binary approach appropriate?** age uses 4 separate binaries. Is this superior to a single binary with subcommands for security, simplicity, or distribution reasons?

## Evidence Index

- `chezmoi internal/cmd/config.go:193-291` — Config struct with 50+ fields
- `chezmoi internal/cmd/config.go:1833-1845` — makeRunEWithSourceState wrapper
- `chezmoi internal/cmd/config.go:2236-2454` — persistentPreRunRootE lifecycle hook
- `chezmoi internal/cmd/annotation.go:8-21` — Annotation system for behavioral flags
- `dive cmd/dive/cli/internal/command/root.go:41-59` — Thin RunE orchestrating adapters
- `dive cmd/dive/cli/internal/command/adapter/resolver.go:17-21` — Observer adapter pattern
- `gh-cli pkg/cmd/root/root.go:63-260` — NewCmdRoot wiring all top-level commands
- `gh-cli pkg/cmdutil/factory.go:16-43` — Factory struct with all dependencies
- `gh-cli pkg/cmd/issue/list/list.go:47-118` — NewCmdList constructor pattern
- `helm pkg/cmd/root.go:105` — NewRootCmd factory
- `helm pkg/cmd/root.go:267-303` — Subcommand registration loop
- `helm pkg/cmd/install.go:132-145` — Thin RunE delegating to action.NewInstall
- `k9s cmd/root.go:76` — run function bootstrapping TUI
- `k9s internal/view/command.go:176` — Command.run() interpreter dispatch
- `k9s internal/view/cmd/interpreter.go:62-86` — Interpreter.grok() parsing
- `mitchellh-cli command.go:14-31` — Command interface definition
- `mitchellh-cli cli.go:236-269` — CLI.Run() radix tree routing
- `opencode cmd/root.go:49-183` — 130-line RunE monolithic orchestrator
- `rclone cmd/cmd.go:240-340` — cmd.Run() wrapper with retry/stats
- `rclone cmd/help.go:26-40` — Root command definition
- `rclone cmd/sync/sync.go:30-108` — Command definition var pattern
- `restic cmd/restic/main.go:37-114` — newRootCommand factory
- `restic cmd/restic/cmd_backup.go:84-115` — BackupOptions.AddFlags pattern
- `restic internal/global/global.go:46-89` — global.Options struct
- `urfave-cli command.go:23-166` — Command struct with lifecycle fields
- `urfave-cli command_run.go:89-95` — Run() entry delegating to run()
- `yq cmd/root.go:40-90` — Root command factory with inline struct
- `yq cmd/evaluate_sequence_command.go:152` — evaluateSequence delegating to yqlib

---

Generated by protocol `study-areas/02-command-architecture.md`.