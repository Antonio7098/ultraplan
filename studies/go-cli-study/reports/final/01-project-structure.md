# Project Structure & Boundaries - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Protocol | `study-areas/01-project-structure.md` |
| Groups | All repos (age, chezmoi, dive, fzf, gdu, gh-cli, go-task, helm, k9s, lazygit, mitchellh-cli, opencode, rclone, restic, urfave-cli, yq) |
| Date | 2026-05-15 |

## Repositories Studied

| # | Repo | Path | Group |
|---|------|------|-------|
| 1 | age | `/home/antonioborgerees/coding/go-cli-study/repos/age` | go-cli-study |
| 2 | chezmoi | `/home/antonioborgerees/coding/go-cli-study/repos/chezmoi` | go-cli-study |
| 3 | dive | `/home/antonioborgerees/coding/go-cli-study/repos/dive` | dive |
| 4 | fzf | `/home/antonioborgerees/coding/go-cli-study/repos/fzf` | 01-project-structure |
| 5 | gdu | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` | 01-project-structure |
| 6 | gh-cli | `/home/antonioborgerees/coding/go-cli-study/repos/gh-cli` | gh-cli |
| 7 | go-task | `/home/antonioborgerees/coding/go-cli-study/repos/go-task` | go-task |
| 8 | helm | `/home/antonioborgerees/coding/go-cli-study/repos/helm` | 01-project-structure |
| 9 | k9s | `/home/antonioborgerees/coding/go-cli-study/repos/k9s` | go-cli-study |
| 10 | lazygit | `/home/antonioborgerees/coding/go-cli-study/repos/lazygit` | go-cli-study |
| 11 | mitchellh-cli | `/home/antonioborgerees/coding/go-cli-study/repos/mitchellh-cli` | mitchellh-cli |
| 12 | opencode | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` | opencode |
| 13 | rclone | `/home/antonioborgerees/coding/go-cli-study/repos/rclone` | go-cli-study |
| 14 | restic | `/home/antonioborgerees/coding/go-cli-study/repos/restic` | go-cli-study |
| 15 | urfave-cli | `/home/antonioborgerees/coding/go-cli-study/repos/urfave-cli` | go-cli-study |
| 16 | yq | `/home/antonioborgerees/coding/go-cli-study/repos/yq` | go-cli-study |

## Executive Summary

All 14 application-style CLI projects (excluding the 2 library-only projects) share a common structural pattern: a thin CLI entry point that delegates all substantive work to a business logic layer. The `cmd/` directory convention is the dominant approach for entry points, though some projects use a flat `main.go` at root with business logic in `src/` or `pkg/`. The choice between `internal/` and `pkg/` is the central architectural decision, with `internal/` used when the intent is encapsulation and `pkg/` used when the code is intended as a public library. Go's `internal/` package protection is the primary mechanism for enforcing architectural boundaries.

## Core Thesis

Elite Go CLI projects achieve clean separation through a consistent pattern: **thin CLI at the boundary, business logic in the interior**. The CLI layer (`cmd/` or `main.go`) handles only flag parsing, dependency construction, and delegation. Business logic lives in a protected layer (`internal/`, `pkg/`, or a domain-named package like `fs/` or `commands/`) that the CLI imports but never reciprocally imports. This pattern appears consistently across projects of different sizes and ages, suggesting it is a stable architectural choice rather than a stylistic preference.

The central tension is `internal/` vs `pkg/`: projects that want to be usable as libraries export via `pkg/` (yq, gh-cli, helm); projects that are pure applications use `internal/` (chezmoi, k9s, opencode, restic). A smaller group uses `lib/` as an alternative to `internal/` (rclone). These are not quality distinctions but constraint responses: library projects need public APIs; application projects benefit from enforced encapsulation.

## Rating Summary

| Repo | Score | Approach | Main Strength | Main Concern |
|------|-------|----------|---------------|--------------|
| age | 8/10 | Library-at-root + internal/ | Clean library/application split with Go-enforced boundaries (`internal/format/format.go:6`, `internal/stream/stream.go`) | Root-level files like `pq.go` could live in `internal/` |
| chezmoi | 8/10 | internal/ only (no cmd/, no pkg/) | Strict layering: `main.go` → `internal/cmd` → `internal/chezmoi` with zero reverse imports (`main.go:16`, `internal/chezmoi/chezmoi.go:1-2`) | 3425-line `config.go` monolith (`internal/cmd/config.go:1`) |
| dive | 8/10 | cmd/ + internal/ + domain pkg/ | Domain package (`dive/`) importable separately from CLI (`dive/image/resolver.go:5-13`) | Nested `internal/` in CLI (`cmd/dive/cli/internal/`) mirrors top-level pattern |
| fzf | 8/10 | Flat main.go + src/ subpackages | Subpackage isolation (`src/algo/`, `src/tui/`, `src/util/`) with event-driven decoupling (`src/util/eventbox.go:1-1960`) | No `internal/` protection; all packages importable |
| gdu | 8/10 | cmd/ + pkg/ + internal/common/ | UI interface abstraction allows TUI/stdout/report swapping (`cmd/gdu/app/app.go:30-49`) | `internal/common/ui.go` couples analyzer to UI state |
| gh-cli | 8/10 | cmd/ + internal/ + pkg/cmd/ | Factory dependency injection keeps commands decoupled (`pkg/cmdutil/factory.go`) | 24 packages under `internal/` spreads related code |
| go-task | 8/10 | cmd/ + root package + internal/ (22 packages) | Functional options pattern for Executor (`executor.go:22-24`) | `args` package at root is ambiguously scoped |
| helm | 8/10 | cmd/ + pkg/cmd/ + pkg/action/ + pkg/ | Action pattern: CLI creates action struct, calls `RunWithContext()` (`pkg/cmd/install.go:347`, `pkg/action/install.go:73-140`) | Chart v2/v3 duplication across `pkg/chart/v2/` and `internal/chart/v3/` |
| k9s | 8/10 | cmd/ + internal/ (10+ subpackages) | DAO pattern per K8s resource type (`internal/dao/dp.go:1`) | `internal/view/` ~90 files may be excessive cohesion |
| lazygit | 8/10 | pkg/ (no internal/) | Facade pattern (`GitCommand` composes all git operations (`pkg/commands/git.go:18-44`)) | No `internal/` means no Go-enforced boundary |
| mitchellh-cli | 6/10 | Flat single-package library | Interface-based abstraction (CLI, Command, Ui) (`cli.go:70`, `command.go:14`, `ui.go:19`) | Single flat package provides no internal encapsulation |
| opencode | 8/10 | cmd/ + internal/ (16 subpackages) | Service architecture with pub/sub event system (`internal/pubsub/`, `cmd/root.go:255-259`) | 980-line `internal/config/config.go` (`internal/config/config.go:1`) may need splitting |
| rclone | 8/10 | cmd/ + fs/ + lib/ + backend/ | Plugin-style backend self-registration via `init()` (`backend/local/local.go:63-68`) | Global config via `fs.GetConfig(ctx)` creates implicit coupling |
| restic | 8/10 | cmd/restic/ + internal/ | Domain interface/implementation split (`internal/restic/repository.go:18` defines interface, `internal/repository/repository.go:1` implements) | `internal/global/` creates coupling to business logic |
| urfave-cli | 6/10 | Flat single-package framework | Single-package simplicity for consumers | CLI framework IS business logic—no separation; no internal boundary |
| yq | 8/10 | cmd/ + pkg/yqlib/ | Strict unidirectional imports: `cmd/` → `pkg/yqlib/` only (`cmd/root.go:9`, `cmd/evaluate_sequence_command.go:7`) | Global logger and expression parser (`pkg/yqlib/lib.go:13-21`) create initialization order dependency |

## Approach Models

### Model 1: Standard Application Layout (cmd/ + internal/)

**Repos**: chezmoi, dive, gh-cli, helm, k9s, opencode, restic, gdu (partially), go-task

The dominant pattern in this study. The `cmd/` directory holds one or more entry point packages (each with its own `main.go`). Business logic lives entirely in `internal/`, protected from external import by Go's `internal/` package restriction. The CLI layer (`cmd/`) imports `internal/` packages; `internal/` packages never import `cmd/`.

**Evidence**: chezmoi's `internal/chezmoi` has zero imports from `internal/cmd` (verified by grep across `internal/chezmoi/` files). k9s `cmd/root.go:112-127` delegates to `view.NewApp()` in `internal/view/`, never the reverse. restic's `cmd/restic/` → `internal/global/` → `internal/restic/` → `internal/repository/` dependency chain is strictly acyclic (`cmd/restic/main.go:37-114`, `internal/restic/repository.go:18`).

**When appropriate**: For pure CLI applications with no public library API. The `internal/` boundary provides automatic enforcement without linting rules.

### Model 2: Public Library Layout (cmd/ + pkg/)

**Repos**: yq, gh-cli (for non-cmd packages), helm (pkg/ is public SDK surface)

The `pkg/` directory signals code intended for external consumption. The CLI layer (`cmd/`) imports and uses the `pkg/` library but the relationship is consumer-to-library rather than application-to-internals.

**Evidence**: yq's `pkg/yqlib/` is importable by other Go programs (`pkg/yqlib/lib.go:1-11` imports only stdlib and external deps). helm's `pkg/storage/storage.go:17` explicitly documents its public import path. gh-cli's `pkg/iostreams`, `pkg/httpmock`, `pkg/jsoncolor` could theoretically be extracted as standalone libraries.

**When appropriate**: When the project needs to be usable as a library, or when there is a public SDK surface separate from internal implementation. The tradeoff is that `pkg/` code cannot use Go's `internal/` protection.

### Model 3: Domain Package Layout (domain-named package rather than generic internal/pkg)

**Repos**: fzf (src/), dive (dive/), rclone (fs/), lazygit (pkg/commands/), go-task (root task package)

Instead of `internal/` or `pkg/`, the business logic lives in a package named after the project's domain purpose. This groups domain logic under a meaningful namespace rather than a generic "internal" label.

**Evidence**: rclone's `fs.Fs` interface (`fs/fs.go:1-113`) is the core abstraction; `backend/` implements it. fzf's `src/fzf` package is the entry point; `src/algo/`, `src/tui/`, `src/util/` are subpackages. lazygit's `pkg/commands/git_commands/` contains 50+ files for git operations.

**When appropriate**: When the domain is well-defined and distinct. This pattern works well for single-binary tools where the "domain package" is the primary deliverable.

### Model 4: Library-Only (Flat Package)

**Repos**: mitchellh-cli, urfave-cli

These are frameworks/libraries, not applications. There is no `cmd/` directory because consumers provide their own entry point. All code lives in a single package or flat structure.

**Evidence**: mitchellh-cli's `cli.go:152` is the `NewCLI()` constructor; all code in `package cli`. urfave-cli's `command_run.go:92` is the `Command.Run()` entry point; all in `github.com/urfave/cli/v3`.

**When appropriate**: For reusable CLI frameworks where consumers need a single import path and there is no application-specific business logic to protect.

### Model 5: Alternative Naming (lib/ instead of internal/)

**Repos**: rclone

Rclone uses `lib/` for utilities that would otherwise live in `internal/`, and reserves `backend/` for storage implementations. The naming reflects the project's age and conventions rather than Go standard practice.

**Evidence**: `lib/terminal`, `lib/http`, `lib/oauthutil`, `lib/pacer` are utilities. `backend/local/`, `backend/s3/` are storage backends.

**When appropriate**: Historical projects that predated Go's `internal/` convention, or projects that prefer `lib/` semantics for their utility packages.

## Pattern Catalog

### Pattern 1: Thin CLI Entry Point

**Problem**: Bloated CLI layers make testing hard, obscure business logic, and create merge conflicts.

**Solution**: The entry point (`cmd/*/main.go` or root `main.go`) does only: flag parsing, dependency construction, and delegation to business logic. No business rules live in the CLI layer.

**Repos demonstrating**: All 14 application repos. chezmoi's `main.go` is 34 lines (`main.go:26-34`). fzf's `main.go` is 104 lines handling only option parsing, shell script printing, and man page display (`main.go:51-103`). gh-cli's `cmd/gh/main.go` is 12 lines.

**Mechanism**: CLI files import business logic packages and call high-level functions. Commands are thin wrappers around domain operations.

**When to use**: Always, for any CLI project of non-trivial size.

**When overkill**: Trivial scripts or single-file utilities where the entire logic fits in `main()`.

### Pattern 2: internal/ Package Protection

**Problem**: Without enforced boundaries, internal packages get imported by external consumers, creating coupling that blocks refactoring.

**Solution**: Place private implementation details under `internal/`. Go's compiler prevents packages outside the module from importing these.

**Repos demonstrating**: chezmoi (`internal/chezmoi/chezmoi.go:1-2` has no imports from `internal/cmd`). k9s (`internal/view/`, `internal/dao/`, `internal/client/`). restic (`internal/restic/`). helm (`internal/chart/v3/`). opencode (`internal/app/`, `internal/llm/`, `internal/db/`).

**Mechanism**: Go's `internal/` path restriction. Any package with `internal/` in its path can only be imported by packages whose path starts with the same prefix.

**When to use**: For application-specific business logic that should not be exposed as a public API.

**When overkill**: Library projects that need to export all packages publicly.

### Pattern 3: Domain Package as Public API

**Problem**: Generic `internal/` or `pkg/` names obscure the project's purpose.

**Solution**: Name the business logic package after the domain (e.g., `fs/`, `dive/`, `commands/`).

**Repos demonstrating**: rclone (`fs/` for filesystem operations). dive (`dive/` for image analysis). lazygit (`pkg/commands/` for git operations). fzf (`src/` as the core package).

**Mechanism**: The domain package forms the primary namespace for the project's functionality. It may be importable as a library (dive's `github.com/wagoodman/dive/dive`) or serve as the internal anchor.

**When to use**: When the project has a clear, singular domain. Works best for single-purpose tools.

**Caution**: If the project has multiple unrelated domains, prefer `internal/` subdirectories per domain.

### Pattern 4: Unidirectional Dependency Flow

**Problem**: Bidirectional imports between CLI and business logic create circular dependencies and tight coupling.

**Solution**: Enforce that imports flow in one direction: CLI → business logic. The business logic layer never imports the CLI layer.

**Repos demonstrating**: chezmoi (verified no `internal/cmd` imports in `internal/chezmoi`). yq (`cmd/` imports `pkg/yqlib/`; `pkg/yqlib/` has no `cmd/` imports). helm (`pkg/cmd/` imports `pkg/action/`; never the reverse). rclone (`cmd/` imports `fs/`; `fs/` does not import `cmd/`).

**Mechanism**: Convention-based (verify with `go mod graph` or import checking). Go's `internal/` protects the direction for packages under `internal/`.

**When to use**: Always.

**When overkill**: Small scripts where the entire codebase is one package.

### Pattern 5: Command-per-File Organization

**Problem**: Large command files with many subcommands are hard to navigate and create merge conflicts in teams.

**Solution**: One file per command (e.g., `addcmd.go`, `applycmd.go` in chezmoi's `internal/cmd/`). Each file contains the command struct, flag definitions, and run logic.

**Repos demonstrating**: chezmoi (`addcmd.go`, `agecmd.go`, `applycmd.go`). gh-cli (`pkg/cmd/issue/list/`, `pkg/cmd/pr/create/`). helm (`pkg/cmd/install.go`, `pkg/cmd/upgrade.go`). go-task (`cmd/task/task.go`).

**Mechanism**: File name reflects command name. Related commands may share utility files.

**When to use**: For CLIs with more than 5-10 commands.

**Caution**: For very large command counts (50+), consider subdirectory grouping by category.

### Pattern 6: UI Interface Abstraction

**Problem**: The UI layer is tightly coupled to the application, making it hard to test or swap output modes.

**Solution**: Define a `UI` interface in a shared package; implement it for TUI, stdout, JSON export, etc.

**Repos demonstrating**: gdu (`UI` interface at `cmd/gdu/app/app.go:30-49`; implementations in `tui/`, `stdout/`, `report/`). dive (adapter pattern in `cmd/dive/cli/internal/command/adapter/`). k9s (`internal/ui/` for reusable TUI components).

**Mechanism**: Factory functions return the appropriate UI implementation based on flags or configuration.

**When to use**: For CLI tools that need both interactive TUI and non-interactive (stdout, JSON) output modes.

### Pattern 7: Domain Interface/Implementation Split

**Problem**: Business logic implementations are mixed with data structure definitions, making it hard to swap implementations.

**Solution**: Define interfaces in one package (domain), implement in another (implementation).

**Repos demonstrating**: restic (`internal/restic/repository.go:18` defines `Repository` interface; `internal/repository/repository.go:1` implements it). helm (`pkg/action/` implements operations defined by command structures). rclone (`fs.Fs` interface in `fs/fs.go`; `backend/` implements it).

**Mechanism**: The interface package has no dependencies on implementation packages.

**When to use**: When there are multiple implementations (e.g., storage backends, cloud providers) or when testing requires mock implementations.

### Pattern 8: Global Configuration Registry

**Problem**: Passing configuration through every function call pollutes signatures.

**Solution**: Use a package-level configuration accessor function.

**Repos demonstrating**: rclone (`fs.GetConfig(ctx)`). yq (`pkg/yqlib/lib.go:13-18` global `ExpressionParser`). opencode (`internal/config/config.go` via `config.Get()`). dive (`internal/bus/bus.go:5` global bus).

**Mechanism**: Package-level var or function returns a global or context-local config struct.

**When to use**: For application-wide configuration accessed from many packages.

**Caution**: Creates implicit coupling and makes testing harder. Prefer dependency injection where feasible.

## Key Differences

### Why repos diverge on internal/ vs pkg/

The choice between `internal/` and `pkg/` is fundamentally a question about export intent:

- **`internal/`**: "This code is for internal use only. External consumers should not depend on it." Go enforces this automatically.
- **`pkg/`**: "This code is a public library. External consumers are welcome to depend on it."

Repos that use `internal/` for their main business logic (chezmoi, k9s, opencode, restic) are saying: "our business logic is not meant to be a library." They may extract sub-packages to `pkg/` later if demand emerges (e.g., helm's `pkg/storage` was extracted for the SDK).

Repos that use `pkg/` for business logic (yq, helm's `pkg/action/`, gh-cli's `pkg/cmd/`) are saying: "this code is valuable as a standalone library." yq's `pkg/yqlib` is a general-purpose YAML processor extractable from the CLI. helm's `pkg/action` enables programmatic use of Helm as a library.

rclone uses `lib/` instead of `internal/` — this appears to be historical (rclone predates widespread `internal/` adoption) rather than a deliberate choice.

### Why some repos have no cmd/ directory

fzf, lazygit, and mitchellh-cli don't use `cmd/` directories:

- **fzf**: Single binary with a 104-line `main.go`. The entire CLI layer fits at root. The convention would be `cmd/fzf/`, but for a single binary the benefit is marginal.
- **lazygit**: Single binary. `main.go` at root is 24 lines. Uses `pkg/` for all production code.
- **mitchellh-cli**: Library, not application. Consumers provide their own `main.go`.

The `cmd/` convention exists to make multi-binary projects manageable. For single-binary projects, a root `main.go` is acceptable.

### Why some repos avoid internal/

lazygit and rclone avoid `internal/`:

- **lazygit**: The maintainer may value testability and the ability to import packages from external test files. `internal/` would block this.
- **rclone**: Uses `lib/` instead, likely for historical reasons.

This is a tradeoff: `internal/` prevents unwanted external imports but also prevents external test packages. For projects that want to be testable from outside, `pkg/` with convention-based boundaries is the alternative.

### Why some repos use flat main.go vs cmd/ subdirectory

Two styles exist for the entry point:

1. **Root `main.go`** (fzf, lazygit, yq): `main.go` at module root imports the business logic package and calls its `Run()` function.
2. **`cmd/*/main.go`** (chezmoi, gh-cli, helm, k9s, restic): Each binary has its own `cmd/*/main.go`.

The `cmd/` style scales better for multi-binary projects (helm has `cmd/helm/` and `cmd/gen-docs/`). The root style is simpler for single binaries.

## Tradeoffs

| Pattern | Benefit | Cost | Best Fit | Failure Mode |
|---------|---------|------|----------|--------------|
| `internal/` for business logic | Go-enforced encapsulation; blocks external import | Cannot be imported by external test packages | Pure CLI applications | If library API is needed later, must refactor to `pkg/` |
| `pkg/` for public library | Exportable to external consumers | No Go-enforced boundary; relies on convention | Projects needing SDK/public API | Internal details visible; harder to refactor |
| Thin CLI in `cmd/` | Testable, merge-conflict-free, clear ownership | Additional indirection | All non-trivial CLIs | CLI becomes a "mini-framework" if not kept thin |
| `main.go` at root | Simpler for single binaries | Less discoverable; doesn't scale | Single-binary tools < 200 lines | Becomes a mess if CLI logic grows |
| Domain-named package | Meaningful namespace; self-documenting | Less conventional; may not fit multi-domain projects | Single-purpose tools with clear domain | Collapses under multiple unrelated domains |
| Global config registry | Convenient access; simple signatures | Hidden coupling; hard to test; initialization order issues | Small-to-medium apps with simple config | Subtle bugs from config mutation; test isolation failures |
| UI interface abstraction | Swappable outputs (TUI/stdout/JSON); testable | Indirection; more types to maintain | Tools with multiple output modes | Interface becomes a God interface if too many methods |

## Decision Guide

**Q: Should I use `cmd/` or a root `main.go`?**

Use `cmd/<name>/main.go` if:
- The project has or may have multiple binaries
- The CLI logic is complex enough to warrant sub-packages
- You want explicit discoverability of entry points

Use root `main.go` if:
- The project is a single binary with < 200 lines of CLI logic
- The project is a library, not an application

**Q: Should I use `internal/` or `pkg/` for business logic?**

Use `internal/` if:
- The project is a pure application with no public library intent
- You want Go-enforced encapsulation
- You accept that external packages (including test packages) cannot import these packages

Use `pkg/` if:
- The business logic should be importable by other projects
- You need a public SDK surface (like helm's `pkg/action`)
- You want consumers to be able to use pieces of the functionality without the CLI

**Q: How do I prevent package coupling?**

1. Use `internal/` for private packages — Go enforces the boundary
2. For `pkg/`, use unidirectional import rules: `pkg/` imports `internal/` or other `pkg/`; never the reverse
3. Verify with `go mod graph` or automated import-cycle checking in CI
4. Keep interfaces in the "inner" layer, implementations in "outer" layers

**Q: When should business logic be a domain-named package vs `internal/`?**

Use a domain name (e.g., `fs/`, `dive/`, `commands/`) if:
- The project has one clear, well-defined purpose
- The domain name adds meaning over generic "internal" or "pkg"

Use `internal/` subdirectories if:
- The project has multiple domains (e.g., both git operations and UI in lazygit)
- The domains are implementation details, not public API

## Practical Tips

1. **Keep `cmd/*/main.go` under 50 lines.** If it's longer, extract command registration or flag handling to a sub-package.

2. **Use `internal/` for anything that shouldn't be a public API.** This includes domain models, business logic, and utility packages that might change.

3. **Use `pkg/` for genuinely public libraries.** If `pkg/` contains code that you would not want external consumers to depend on, it belongs in `internal/`.

4. **Name domain packages meaningfully.** `fs/`, `commands/`, `dive/`, `yqlib/` are better than `internal/pkg/` or `internal/util/`.

5. **Use one file per command.** This makes command logic easy to locate and reduces merge conflicts.

6. **Define interfaces in the business logic layer, not the CLI layer.** This allows business logic to be tested without CLI wiring.

7. **Use `init()` registration sparingly.** rclone's backend `init()` registration is convenient but creates hidden coupling. Consider factory functions instead.

8. **Keep `global` packages thin.** `internal/global/` or similar packages that bridge CLI and business logic should contain minimal logic — mostly dependency wiring.

## Anti-Patterns / Caution Signs

**Large entry point files**: If `cmd/*/main.go` or `main.go` exceeds 200 lines, the CLI layer is accumulating logic that belongs in business logic packages. chezmoi's 3425-line `config.go` (`internal/cmd/config.go:1`) is a known concern.

**Bidirectional imports**: If `internal/cmd` imports `internal/chezmoi` AND `internal/chezmoi` imports `internal/cmd`, you have a circular dependency. Verify with `go mod graph`.

**Monolithic packages**: `internal/view/` with 90 files (k9s) or `src/terminal.go` with 8209 lines (fzf) indicate packages doing too much. Split by concern.

**Global state without documentation**: Package-level vars for config, logger, or parsers create hidden coupling. Document initialization order dependencies and prefer dependency injection.

**No `internal/` or `pkg/` boundary**: Projects like mitchellh-cli and urfave-cli have flat single-package structures. This is acceptable for small focused libraries but creates coupling as the codebase grows.

**Mixing CLI and business logic in the same file**: If `cmd/` files contain business rules (not just delegation), the layering is violated.

## Notable Absences

**No `go.mod` / multi-module repos in this study**: All repos are single modules. Multi-module repos (where `cmd/` and `pkg/` are separate modules) would add additional architectural considerations.

**No evidence of `internal/` import linting**: Only Go's compiler enforces `internal/` boundaries. No repo mentioned using tools like `revive` or custom linters to detect `internal/` imports from unexpected locations.

**No evidence of layered testing strategies**: This study focused on structure, not testing. How repos test across layer boundaries (integration tests, mocking strategies) was not examined.

**No evidence of architectural decision records (ADRs)**: No repo documented architectural decisions in code. Choices like "why `pkg/` instead of `internal/`" appear to be convention or personal preference rather than documented tradeoffs.

## Per-Repo Notes

| Repo | Structure | Notable |
|------|-----------|---------|
| age | `cmd/` + root library + `internal/` | Library at root; `internal/` for private implementation; plugin architecture |
| chezmoi | `main.go` + `internal/` only | Strict internal-only discipline; 3425-line config.go is the monolith risk |
| dive | `cmd/` + `dive/` + `internal/` | Domain package `dive/` is separately importable |
| fzf | Root `main.go` + `src/` | No `internal/`; event-driven via `EventBox`; 8209-line terminal.go |
| gdu | `cmd/` + `pkg/` + `tui/`/`stdout/`/`report/` + `internal/common/` | UI interface abstraction; analyzer as interface |
| gh-cli | `cmd/` + `pkg/cmd/` + `internal/` + `api/` | Factory pattern; feature detection for API compatibility |
| go-task | `cmd/task/` + root `task` + `internal/` (22 packages) | Executor pattern; functional options |
| helm | `cmd/helm/` + `pkg/cmd/` + `pkg/action/` + `pkg/` + `internal/` | Action pattern; chart v2/v3 split |
| k9s | `cmd/` + `internal/` (10+ subpackages) | DAO pattern per K8s resource; 90-file view package |
| lazygit | Root `main.go` + `pkg/` | Functional layering (gui/commands separation); no `internal/` |
| mitchellh-cli | Flat single-package library | Framework, not app; no boundary enforcement |
| opencode | `cmd/` + `internal/` (16 packages) | Service architecture; pub/sub; 980-line config.go |
| rclone | `cmd/` + `fs/` + `lib/` + `backend/` + `vfs/` | Alternative naming (`lib/` not `internal/`); global config |
| restic | `cmd/restic/` + `internal/` | Domain interface/implementation split; `internal/global/` coupling |
| urfave-cli | Flat single-package framework | Library; CLI framework IS the product |
| yq | `yq.go` + `cmd/` + `pkg/yqlib/` | Strict unidirectional imports; global parser/logger |

## Open Questions

1. **Why do some projects use `lib/` instead of `internal/`?** rclone is the primary example. Is this historical, or do maintainers perceive a benefit to `lib/` naming?

2. **How do projects evolve from `pkg/` to `internal/` (or vice versa)?** No evidence found of repos changing this boundary post-initial design. Is there a migration cost?

3. **What testing patterns cross layer boundaries?** This study examined structure only. How do repos test CLI-to-business-logic integration without breaking `internal/` boundaries?

4. **Do `internal/` boundaries ever cause real problems?** Projects like lazygit avoid `internal/` because it blocks external test imports. Is there a documented case where `internal/` caused enough pain to justify the risk of external coupling?

5. **How do plugin systems interact with package structure?** k9s has YAML-based plugins; helm has a plugin model; age has a plugin protocol. How does plugin architecture influence package boundaries?

## Evidence Index

| Evidence | Source Repo |
|----------|-------------|
| `cmd/age/age.go:105` (thin CLI) | age |
| `internal/format/format.go:6` (internal boundary) | age |
| `internal/stream/stream.go` (internal boundary) | age |
| `main.go:16` (chezmoi entry) | chezmoi |
| `internal/chezmoi/chezmoi.go:1-2` (zero cmd imports) | chezmoi |
| `internal/cmd/config.go:1` (3425-line monolith) | chezmoi |
| `cmd/dive/main.go:43-54` (entry point) | dive |
| `dive/image/resolver.go:5-13` (domain interface) | dive |
| `internal/bus/bus.go:5-18` (global bus) | dive |
| `main.go:1-104` (fzf entry) | fzf |
| `src/util/eventbox.go:1-1960` (event system) | fzf |
| `src/terminal.go` (8209 lines) | fzf |
| `cmd/gdu/main.go:32-43` (entry point) | gdu |
| `cmd/gdu/app/app.go:30-49` (UI interface) | gdu |
| `cmd/gh/main.go:6` (entry) | gh-cli |
| `pkg/cmdutil/factory.go` (factory pattern) | gh-cli |
| `cmd/task/task.go:23-203` (CLI entry) | go-task |
| `executor.go:22-24` (functional options) | go-task |
| `cmd/helm/helm.go:38` (entry) | helm |
| `pkg/cmd/root.go:105` (Cobra root) | helm |
| `pkg/action/install.go:73-140` (action struct) | helm |
| `main.go:44-45` (k9s entry) | k9s |
| `cmd/root.go:112-127` (thin CLI) | k9s |
| `internal/dao/dp.go:1` (DAO pattern) | k9s |
| `main.go:23` (lazygit entry) | lazygit |
| `pkg/commands/git.go:18-44` (facade) | lazygit |
| `cli.go:70` (Commands map) | mitchellh-cli |
| `command.go:14-31` (Command interface) | mitchellh-cli |
| `main.go:13` (opencode entry) | opencode |
| `cmd/root.go:24-309` (Cobra root) | opencode |
| `internal/pubsub/` (event system) | opencode |
| `internal/config/config.go:1` (980 lines) | opencode |
| `rclone.go:14` (entry) | rclone |
| `fs/fs.go:1-113` (Fs interface) | rclone |
| `backend/local/local.go:63-68` (self-registration) | rclone |
| `cmd/restic/main.go:162` (entry) | restic |
| `internal/restic/repository.go:18` (Repository interface) | restic |
| `internal/global/global.go:46-89` (global options) | restic |
| `command_run.go:92` (Command.Run) | urfave-cli |
| `yq.go:9-10` (entry) | yq |
| `cmd/root.go:9` (cmd imports yqlib) | yq |
| `cmd/evaluate_sequence_command.go:7` (unidirectional) | yq |
| `pkg/yqlib/lib.go:13-21` (global parser) | yq |

---

Generated by protocol `study-areas/01-project-structure.md`.