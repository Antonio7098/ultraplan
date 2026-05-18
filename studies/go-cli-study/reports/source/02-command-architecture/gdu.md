# Repo Analysis: gdu

## Command Architecture

### Repo Info

| Field | Value |
|-------|-------|
| Name | gdu |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` |
| Group | `gdu` |
| Language / Stack | Go / Cobra |
| Analyzed | 2026-05-15 |

## Summary

Gdu uses a **single root command with flag-driven branching** (no subcommands). Commands are defined imperatively via Cobra, with flag initialization in `init()` and business logic delegated to an `App` struct. The `RunE` function acts as a thin orchestrator that creates an `App` and calls `App.Run()`.

## Rating

**4/10** — Commands are somewhat organized but logic is mixed in the root command's `RunE` function. The architecture does not scale well beyond the single-command pattern (no subcommand composition available).

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Root command definition | `var rootCmd = &cobra.Command{...}` | `cmd/gdu/main.go:32` |
| RunE signature | `func runE(command *cobra.Command, args []string) error` | `cmd/gdu/main.go:200` |
| Flag initialization | `flags := rootCmd.Flags()` with 40+ flags | `cmd/gdu/main.go:46-115` |
| App struct definition | `type App struct {...}` with all dependencies | `cmd/gdu/app/app.go:182-192` |
| App.Run method | `func (a *App) Run() error` — main orchestration | `cmd/gdu/app/app.go:201-310` |
| No PreRunE/PostRunE hooks | Not used anywhere in codebase | N/A |
| No AddCommand/AddSubcommand | No subcommand composition pattern | N/A |
| UI interface | `type UI interface {...}` defining all UI operations | `cmd/gdu/app/app.go:30-49` |
| Flags struct | `type Flags struct {...}` with 50+ fields | `cmd/gdu/app/app.go:51-106` |

## Answers to Protocol Questions

### 1. How are subcommands registered?

**No subcommands exist.** Gdu has only a single root command (`rootCmd`) with no child commands. All functionality is accessed via flags on the root command (e.g., `--show-disks`, `--output-file`, `--input-file`). Subcommand registration calls (`AddCommand`, `AddSubcommand`) do not appear in the codebase.

### 2. How is command discovery handled?

**Flag-based branching within a single command.** Since there are no subcommands, discovery is implicit — all flags are registered on `rootCmd` and the `runE` function branches on which flags are set using if/switch statements in `app.go:588-622`. There is no command hierarchy to discover.

### 3. Are commands declarative or imperative?

**Imperative.** Commands are defined through direct Cobra API calls in `main.go:init()` and `main.go:runE()`. There is no declarative configuration (e.g., no command definition files, no builder patterns beyond standard Cobra struct initialization).

### 4. How do parent/child commands communicate?

**Not applicable.** There is no parent/child hierarchy. The root command communicates with business logic via the `App` struct created in `runE()` and passed to `App.Run()`. The `Flags` struct is passed as a pointer, and all state flows through this struct.

### 5. How much logic exists directly in commands?

**Moderate amount in RunE.** The `runE` function (`main.go:200-280`) handles:
- Config file loading and writing (lines 207-218)
- Log file setup (lines 221-240)
- Screen initialization for TUI (lines 253-267)
- App struct creation and initialization (lines 269-279)

The `App.Run()` method (`app.go:201-310`) is much larger (~110 lines) and contains substantial branching logic for UI creation, analyzer setup, and action dispatching.

## Architectural Decisions

1. **Single command with flag-driven mode selection** — Rather than subcommands, gdu uses flags like `--show-disks`, `--input-file`, `--output-file` to select different operating modes. This is simpler for users (single entry point) but does not scale for command families.

2. **App struct as central coordinator** — All business logic is aggregated in `App` which holds flags, dependencies (device.Getter, PathChecker), and UI. The `App.Run()` method dispatches to different UI implementations (TUI, stdout, export) based on flags.

3. **UI interface for abstraction** — The `UI` interface (`app.go:30-49`) abstracts terminal UI vs stdout UI vs export UI, allowing the same command logic to produce different outputs.

4. **Config file precedence** — System config (`/etc/gdu.yaml`) loaded first, then user config overwrites it (`main.go:127-144`).

## Notable Patterns

- **Flag functional options for UI styling** — `getOptions()` in `app.go:434-561` uses functional options pattern to configure TUI styling conditionally
- **Device getter abstraction** — `device.Getter` interface allows different implementations for Linux vs BSD vs Windows (`pkg/device/dev.go`)
- **Analyzer interface** — `SetAnalyzer()` on UI allows different analysis backends (stored, sqlite, sequential) to be injected

## Tradeoffs

| Tradeoff | Impact |
|----------|--------|
| Single command with many flags | Simple UX for basic usage but flag bloat for advanced features; `--help` output is overwhelming |
| No subcommand hierarchy | Cannot group related operations; all flags compete in single namespace |
| RunE delegates to App.Run() | Thin command layer but two layers of orchestration |
| No pre/post run hooks | Cannot share initialization logic across commands (not applicable since no subcommands) |

## Failure Modes / Edge Cases

- **Flag conflicts** — Mutual exclusivity checks like `--no-prefix --si` (`app.go:213-215`) and `--interactive --non-interactive` (`app.go:217-219`) are handled in `App.Run()` rather than at flag parsing level
- **Config file errors** — Non-fatal errors stored in `configErr` variable and logged later (`main.go:242-244`)
- **Windows/Plan9 limitations** — `ShowApparentSize` forced to true on Windows and Plan9 (`main.go:248-251`) since full analysis is not supported

## Future Considerations

- **Subcommand extraction** — If more commands were added, the flag-driven branching would become unwieldy; moving to subcommands would require significant refactoring
- **Command grouping** — Currently no way to group related operations (e.g., `gdu analyze`, `gdu report`, `gdu config`)

## Questions / Gaps

- **No evidence found** for lifecycle hooks (PreRunE, PostRunE) — not used in this codebase
- **No evidence found** for command composition — single command only, no composition possible
- **No evidence found** for command factories or builders — direct struct initialization only

---

Generated by `study-areas/02-command-architecture.md` against `gdu`.