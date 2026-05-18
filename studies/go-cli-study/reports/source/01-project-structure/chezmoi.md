# Repo Analysis: chezmoi

## Project Structure & Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | chezmoi |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/chezmoi` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

chezmoi uses a disciplined two-layer architecture: a thin `main.go` entry point that delegates entirely to `internal/cmd`, and a pure core library in `internal/chezmoi` that has zero knowledge of the CLI. The `internal/` boundary is enforced by Go's own package visibility rules. Command files in `internal/cmd` follow a flat, one-file-per-command pattern using Cobra, while the core package owns all business logic — source state parsing, encryption, templating, and state management. This results in clean layering with unidirectional dependency flow from CLI → core, enabling excellent testability and modularity.

## Rating

**8 / 10** — Clean layering and clear ownership with a thin CLI, but the monolithic 3425-line `config.go` and absence of a `pkg/` export layer for external reuse prevent a higher score.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Entry point | `main.go` imports only `internal/cmd` | `main.go:16` |
| CLI layer | Thin `main.go` delegates to `cmd.Main`, 34 lines total | `main.go:26-34` |
| Command registration | Cobra-based commands in `internal/cmd`, one file per command | `internal/cmd/addcmd.go:1` |
| Core package | `internal/chezmoi` contains all business logic, zero `internal/cmd` imports | `internal/chezmoi/chezmoi.go:1-2` |
| Core imports | `internal/chezmoi` imports only stdlib and third-party libs | `internal/chezmoi/chezmoi.go:4-25` |
| CLI imports core | `internal/cmd` imports `chezmoi` core package | `internal/cmd/addcmd.go:13` |
| Boundary enforcement | No `internal/cmd` references in `internal/chezmoi` (verified by grep) | — |
| `internal/` packages | `chezmoi`, `chezmoierrors`, `chezmoigit`, `chezmoilog`, `chezmoiset`, `chezmoitest`, `chezmoiassert`, `archivetest`, `cmds` | `internal/:` |
| Config monolith | Single `config.go` at 3425 lines | `internal/cmd/config.go:1` |
| `cmds/` subcommands | Tool subcommands for generate, lint, etc. | `internal/cmds/execute-template/main.go` |
| Dependency direction | `cmd → chezmoi` only; no reverse import | — |

## Answers to Protocol Questions

### 1. Why are folders organized this way?

The top-level structure is minimal by design — only `main.go` at root, with all logic pushed into `internal/`. This leverages Go's `internal/` package restriction to prevent external consumers from importing packages they shouldn't depend on. The split between `internal/cmd` (CLI layer) and `internal/chezmoi` (business logic) reflects the key architectural tension in CLI tools: parsing user input and invoking core operations. The `internal/cmds/` subdirectory holds standalone tool binaries (e.g., `generate-helps`, `lint-commit-messages`) that are built separately and invoked as subprocesses or code generators.

### 2. What belongs in `cmd/` vs `internal/` vs `pkg/`?

chezmoi doesn't use `cmd/` or `pkg/` at the top level. Instead:
- **`internal/cmd/`**: All CLI command implementations (Cobra commands, flag handling, config struct, I/O). Each file is roughly one command or a related group (e.g., `addcmd.go`, `applycmd.go`, `templatefuncs.go` for template functions exposed as CLI commands).
- **`internal/chezmoi/`**: Pure business logic with no CLI knowledge — source state parsing (`sourcestate.go`, 3117 lines), encryption abstraction (`encryption.go`), template engine, VFS abstraction, persistent state management, and all entry type handling.
- **`internal/cmds/`**: Separate `main.go`-containing binaries for development/build tooling (not part of the main `chezmoi` binary).
- **No `pkg/`**: The project doesn't export a public library. This is a deliberate choice — `chezmoi` is an application, not a library, so `pkg/` would add indirection without benefit.

### 3. Is the CLI layer thin?

Yes, very thin. `main.go` is 34 lines and contains only version variable declarations and a single call to `cmd.Main`. The `cmd.Main` function (`internal/cmd/cmd.go:52`) handles only top-level concerns: reading `CHEZMOIDEV` env vars, constructing the config, and executing commands. The `config.go` file at 3425 lines is the exception — it's a large monolith that houses the `Config` struct, all dependency injection, and the `execute` method that routes to subcommands. However, the command implementations themselves (`addcmd.go`, `applycmd.go`, etc.) are focused and small, typically 100–300 lines each.

### 4. Where does business logic actually live?

In `internal/chezmoi/`, specifically:
- **`sourcestate.go`** (3117 lines): parsing and managing the source directory (the `.chezmoi` folder with templates)
- **`encryption.go`**: pluggable encryption strategy (Age, GPG, etc.)
- **`template.go`**: template parsing and execution
- **`system.go`** and `realsystem.go`/`dryrunsystem.go`: VFS abstraction for file operations
- **`persistentstate.go`**: bolt DB-backed persistent state
- **`targetstateentry.go`**, **`actualstateentry.go`**: modeling desired vs actual filesystem state
- **`archive.go`**, **`archivereadersystem.go`**: archive handling

The `internal/cmd` layer acts as a consumer of `internal/chezmoi`, calling into the core to perform operations and formatting output.

### 5. How do they prevent package coupling?

Three mechanisms:
1. **Go's `internal/` restriction**: Packages under `internal/` cannot be imported by packages outside the module's subtree, preventing accidental coupling from external tools.
2. **Unidirectional imports**: `internal/chezmoi` has zero imports of `internal/cmd`. Verified by grep — no `internal/cmd` references anywhere in the `chezmoi` package files.
3. **Flat command file layout**: Rather than nesting commands in sub-packages (which would require cross-package imports), all commands live in `internal/cmd` as top-level files. This avoids circular dependency risks.

## Architectural Decisions

| Decision | Rationale | Tradeoff |
|----------|-----------|----------|
| `internal/` only, no `cmd/` | Go's internal package restriction enforces architectural boundaries automatically | External tools cannot import chezmoi packages, which is fine since it's an app not a library |
| One file per command | Easy to locate and review each command in isolation | Can make it harder to share code between related commands without creating utility files |
| `config.go` as monolith | Centralizes all config state and dependency injection in one place | At 3425 lines it becomes a navigation challenge; could be split into `config_*.go` slices |
| `internal/cmds/` for dev tools | Keeps build-time tooling separate from runtime commands | Slight inconsistency — `generate-helps` is a Go program that modifies source |
| No `pkg/` export layer | Project is an application, not a library | Cannot be used as a module by other projects |

## Notable Patterns

- **File-per-command pattern**: `addcmd.go`, `agecmd.go`, `applycmd.go` — each command is a separate file with its own `*CmdConfig` struct for per-command options. This makes command logic easy to find and review.
- **Centralized config with `execute` routing**: `Config.execute(args)` in `config.go:217` dispatches to subcommand handlers, keeping all wiring in one place.
- **Generated help and license files**: `helps.gen.go` and `license.gen.go` are generated at build time via `//go:generate` directives in `main.go`, keeping generated data out of hand-written code.
- **Plugin fallback via `exec.LookPath`**: When an unknown command is encountered, `cmd.Main` (`cmd.go:222-249`) looks for `chezmoi-{command}` in `$PATH` and execs it — a graceful extension mechanism that avoids adding a plugin system to the core.

## Tradeoffs

1. **Config monolith vs. modularity**: `config.go` at 3425 lines is the largest file by far. While it centralizes wiring, it also means understanding the full config requires reading one very large file. Splitting into `config_*.go` files (e.g., `config_apply.go`, `config_add.go`) could improve navigability.
2. **No public library export**: By staying entirely in `internal/`, chezmoi cannot be used as a library. This is a deliberate choice but means the substantial work in `internal/chezmoi` (templating, VFS, encryption) cannot be reused by downstream projects.
3. **Flat `internal/cmd` namespace**: All commands live at the same level with no subdirectory organization (e.g., no `cmd/daily/` or `cmd/encryption/`). For a project with 60+ command files, this creates a flat list that requires searching or grepping to locate relevant commands.

## Failure Modes / Edge Cases

- **`config.go` merge conflicts**: With all config state in one file, team members working on different commands may have concurrent edits to `config.go`, increasing merge conflict risk.
- **`internal/` restricts testing from outside**: The `internal/` boundary means external test packages cannot import `chezmoi` internals. chezmoi handles this by having a `chezmoitest` package in `internal/` that provides testing utilities.
- **`//go:generate` build dependency**: Generated files (`helps.gen.go`, `license.gen.go`) are checked in but rebuilt on demand. If generation logic changes, stale generated files could cause build issues.

## Future Considerations

- **Split `config.go`**: Consider breaking `config.go` into focused `config_*.go` files by command group or by concern (config struct, execute method, dependency injection).
- **Subdirectory grouping in `cmd/`**: Consider organizing commands into subdirectories by category (e.g., `cmd/daily/`, `cmd/encryption/`) to reduce the flat 100+ file listing in `internal/cmd/`.
- **Optional `pkg/` export layer**: If there's ever a desire to expose `chezmoi` as a library (e.g., for tools that reuse the template or VFS engine), a `pkg/` layer could be introduced alongside `internal/` for public APIs.

## Questions / Gaps

- No clear evidence found for whether the project uses `pkg/` for any public API — it does not, by design.
- The `internal/cmds/` directory houses Go programs that are built as separate binaries. The relationship between these tools and the main `chezmoi` binary is not documented in the project structure itself — requires tracing `Makefile` targets to understand.

---

Generated by `01-project-structure.md` against `chezmoi`.