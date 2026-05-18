# Repo Analysis: lazygit

## Project Structure & Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | lazygit |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/lazygit` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

lazygit uses a clean layered architecture with a thin CLI entry point, a central `app` package for bootstrapping, `gui` package for the TUI layer, and `commands` package for business logic (git operations). The `pkg/` directory contains all production code with clear namespace separation. Dependencies flow unidirectionally from CLI → gui → commands → common.

## Rating

**8/10** — Clean layering with understandable ownership. The architecture is evident and consistent. Minor扣分: some large packages (e.g., `gui`) could be further split.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Entry point | `main.go` delegates to `app.Start()` | `main.go:23` |
| App struct | `App` struct bootstraps and holds all dependencies | `pkg/app/app.go:32-38` |
| Thin CLI layer | `main.go` is 24 lines, only sets up build info | `main.go:1-24` |
| GUI layer | `Gui` struct wraps gocui and manages TUI state | `pkg/gui/gui.go:61-100` |
| Git commands | `GitCommand` struct holds all git sub-commands as fields | `pkg/commands/git.go:18-44` |
| Common struct | Shared logging, i18n, config passed via dependency injection | `pkg/common/common.go:13-22` |
| git_commands namespace | 50+ files in `pkg/commands/git_commands/` for git operations | `pkg/commands/git_commands/` |
| Controllers | ~60 controller files for GUI event handling | `pkg/gui/controllers/` |
| No `internal/` | All production code lives under `pkg/` | `pkg/` |

## Answers to Protocol Questions

### 1. Why are folders organized this way?

The organization follows a **functional layering** rather than a raw `cmd/internal/pkg` Go idiom:
- `pkg/app/` — Application bootstrap and entry point wiring
- `pkg/gui/` — Terminal UI rendering and user interaction (MVC controllers, views, presentation)
- `pkg/commands/` — Business logic split into `git_commands/` (git domain), `oscommands/` (OS abstraction)
- `pkg/config/`, `pkg/i18n/`, `pkg/utils/`, `pkg/theme/`, `pkg/logs/` — Cross-cutting concerns

This reflects the architecture: the GUI is the core product, and git operations are a distinct domain. The folders map to runtime concerns rather than pure package mechanics.

### 2. What belongs in `cmd/` vs `internal/` vs `pkg/`?

- **`cmd/`** — Empty except for `cmd/i18n/` (translation generation) and `cmd/integration_test/`. No binary entry points here; `main.go` is at the repo root.
- **`pkg/`** — All production code. The real boundary is between `gui/` (UI layer) and `commands/` (business logic), enforced by convention not Go's `internal/` visibility.
- **`internal/`** — Not used. The project predates Go 1.4 `internal/` adoption or the maintainer chose `pkg/` for its exportability.

The `cmd/` directory is underused; it contains only a single `cmd/i18n` tool for generating translations, not application entry points.

### 3. Is the CLI layer thin?

**Yes.** `main.go` is 24 lines: it creates a `BuildInfo` struct and calls `app.Start()`. Zero CLI argument parsing, zero command registration, zero business logic. All bootstrapping happens in `pkg/app/app.go`.

The `app.Start()` function (`pkg/app/app.go:40-61`) handles known error formatting, logging, and delegates to `app.Run()`. The GUI layer (`gui.Gui`) is created in `NewApp()` (`pkg/app/app.go:136`), not in main.

### 4. Where does business logic actually live?

Business logic lives in **`pkg/commands/git_commands/`** — 50+ files implementing git operations (branch, commit, rebase, stash, etc.).

The `GitCommand` struct (`pkg/commands/git.go:18-44`) acts as a facade, composing all sub-commands:
```go
type GitCommand struct {
    Blame      *git_commands.BlameCommands
    Branch     *git_commands.BranchCommands
    Commit     *git_commands.CommitCommands
    // ...
}
```

Each sub-command struct (e.g., `BranchCommands`) is created via `NewGitCommon()` (`pkg/commands/git_commands/common.go:9-17`) which holds the shared dependencies (`Common`, `ICmdObjBuilder`, `OSCommand`, `RepoPaths`, `ConfigCommands`).

The `Gui` struct (`pkg/gui/gui.go:62-100`) holds a `git *commands.GitCommand` field, giving the UI layer access to business logic via dependency injection.

### 5. How do they prevent package coupling?

**Mechanisms:**

1. **`common.Common` struct** (`pkg/common/common.go:13-22`) — Shared "commonly used things" (Log, Tr, AppState, Debug, Fs) passed to most constructors. This is a convenience pattern, not a true decoupling mechanism.

2. **Facade pattern** — `GitCommand` composes all git operations; `Gui` composes all controllers. Callers interact with facades, not individual implementations.

3. **Interface segregation** — `AppConfigurer` interface (`pkg/config/app_config.go:37-54`) abstracts config access. `OSCommand` uses `ICmdObjBuilder` interface (`pkg/commands/oscommands/`, `pkg/commands/git_cmd_obj_builder.go`).

4. **No circular dependencies** — The import graph is acyclic: `main.go` → `pkg/app` → `pkg/gui` + `pkg/commands` → `pkg/common`/`pkg/config`/`pkg/utils`.

5. **Go's package-level visibility** — Packages outside `pkg/` cannot access unexported symbols. The `pkg/` prefix is a soft namespace convention since they don't use `internal/`.

## Architectural Decisions

| Decision | Rationale | Tradeoff |
|----------|-----------|----------|
| `pkg/` over `internal/` | Allows importing packages for testing or external use | Exposes internals to external consumption |
| `Common` struct | Reduces parameter count when passing shared deps | Creates implicit coupling through shared state |
| Facade over git commands | Groups related git operations | `GitCommand` becomes a large struct (40+ fields) |
| Controllers in `gui/` | UI logic separated from rendering | Many small files (60+ controllers) |
| `afero.Fs` abstraction | Enables filesystem mocking in tests | Additional abstraction layer |

## Notable Patterns

- **Dependency injection throughout** — Constructor functions (`NewApp`, `NewGitCommand`, `NewGui`) accept all dependencies as parameters, enabling testing with fakes.
- **Loader pattern** — `pkg/commands/git_commands/` has separate `*Loader` structs (e.g., `BranchLoader`, `CommitLoader`) that populate model data asynchronously.
- **Controller pattern in GUI** — Each panel/screen has a dedicated controller implementing shared `IController` interface.
- **Atomic config updates** — `Common.userConfig` uses `atomic.Pointer` for thread-safe config reloading (`pkg/common/common.go:16`).
- **Build info via LDFLAGS** — Version, commit, date injected at build time (`main.go:8-13`).

## Tradeoffs

| Tradeoff | Impact |
|----------|--------|
| Large `Gui` struct (1200+ lines in `gui.go`) | Single large file harder to navigate; compensated by controller-per-file pattern |
| `Common` struct shared everywhere | Easy to pass shared deps, but implicit coupling reduces encapsulation |
| No `internal/` package | Simpler external testing; but no Go-enforced boundary for internal packages |
| `git_commands/` flat structure | 50+ files in one directory; no subdirectories for categorization |

## Failure Modes / Edge Cases

- **Git version check** (`pkg/app/app.go:149-163`) — Hard minimum git version (2.32.0). Users on older systems get a clear error.
- **Repo detection** (`pkg/app/app.go:165-180`) — Handles being opened outside a git repo gracefully with options to init, open recent, or quit.
- **Bare repo detection** (`pkg/app/app.go:255-271`) — Prompts user when opening a bare repo.
- **Config reload** — `AppConfigurer.ReloadUserConfigForRepo()` allows hot-reloading user config without restart.

## Future Considerations

- **Move `pkg/` to `internal/`** — Would enforce encapsulation but break external test imports (though lazygit doesn't seem to have external consumers).
- **Split `gui/gui.go`** — At 1200+ lines, splitting into `gui/gui.go` + `gui/gui_state.go` + `gui/gui_init.go` would improve navigability.
- **Subdivide `git_commands/`** — Could group into `git_commands/branch/`, `git_commands/commit/`, etc. if the flat structure becomes unwieldy.

## Questions / Gaps

- **Why `pkg/` instead of `internal/`?** The maintainer may value testability and external package access over strict encapsulation. No explicit documentation found for this choice.
- **Why no `cmd/` entry point binary separation?** The thin `main.go` approach works for single-binary CLIs, but if lazygit ever needed multiple binaries (e.g., `lazygit daemon`), the structure would need refactoring.

---

Generated by `study-areas/01-project-structure.md` against `lazygit`.