# Repo Analysis: k9s

## Project Structure & Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | k9s |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/k9s` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

K9s is a Kubernetes CLI GUI tool organized with a thin CLI layer in `cmd/` and all business logic in `internal/`. The architecture demonstrates clear dependency direction: `main.go` → `cmd/` → `internal/`. The `internal/` package uses Go's `internal/` directory pattern to enforce encapsulation. The `view/` package is the central coordinator that orchestrates UI, K8s client, and data access.

## Rating

**8/10** — Clean layering with understandable ownership. Minor concern: `internal/view/` contains ~90 files and may be approaching excessive cohesion.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Entry point | `main.go` calls `cmd.Execute()` | `main.go:44-45` |
| CLI registration | Cobra command setup with subcommands | `cmd/root.go:41-46` |
| Thin CLI pattern | `cmd/root.go` delegates to `view.NewApp()` | `cmd/root.go:112-127` |
| Internal packages | `client/`, `config/`, `dao/`, `model/`, `render/`, `ui/`, `view/`, `watch/`, `vul/`, `xray/` | `internal/` |
| K8s client wrapper | `APIClient` struct wraps `kubernetes.Interface` | `internal/client/client.go:44-50` |
| Watch factory | `Factory` manages K8s informers | `internal/watch/factory.go:28-35` |
| DAO pattern | `dao/` files like `dp.go`, `pod.go` access K8s resources | `internal/dao/dp.go:1` |
| View coordinator | `App` struct coordinates UI and K8s operations | `internal/view/app.go:44-59` |

## Answers to Protocol Questions

### 1. Why are folders organized this way?

K9s follows Go's `internal/` convention to prevent external packages from importing internal business logic. The folder structure is organized by concern:
- `cmd/` — CLI entry points (Cobra commands, flags)
- `internal/client/` — Kubernetes API client wrappers
- `internal/config/` — Configuration loading and management
- `internal/dao/` — Data Access Objects for each K8s resource type
- `internal/model/` — Data structures used across the app
- `internal/render/` — Table row rendering for each K8s resource
- `internal/ui/` — Reusable TUI components (tables, dialogs, prompts)
- `internal/view/` — View controllers for each screen/feature
- `internal/watch/` — Kubernetes informer/watcher factory
- `plugins/` — YAML-based plugin definitions (external)

### 2. What belongs in `cmd/` vs `internal/` vs `pkg/`?

- **`cmd/`**: CLI scaffolding only. Contains `root.go` (Cobra command setup, flag definitions, config loading), `version.go`, `info.go`. No business logic.
- **`internal/`**: All business logic. Uses Go's `internal/` pattern for encapsulation.
- **`pkg/`**: Not used. K9s avoids `pkg/` entirely, preferring `internal/` for all shared code.

### 3. Is the CLI layer thin?

**Yes.** `cmd/root.go:76-128` shows the `run()` function does only:
1. Initialize log file
2. Load configuration
3. Create `view.NewApp(cfg)`
4. Call `app.Init()` and `app.Run()`

All actual work (Kubernetes interaction, UI rendering, user input handling) happens in `internal/view/` or other `internal/` packages.

### 4. Where does business logic actually live?

Business logic is distributed across `internal/` subdirectories:
- **`internal/dao/`** — Kubernetes resource CRUD operations (pods, deployments, services, etc.)
- **`internal/watch/`** — Informer factory for watching K8s resources (`internal/watch/factory.go:28-35`)
- **`internal/view/`** — Application lifecycle and view coordination (`internal/view/app.go:44-59`)
- **`internal/render/`** — Table rendering for K8s resources (e.g., `pod.go:1`)
- **`internal/client/`** — K8s API client wrapper (`internal/client/client.go:44`)
- **`internal/config/`** — User configuration management

### 5. How do they prevent package coupling?

1. **Go's `internal/` directory**: External packages cannot import `internal/` packages from other modules.
2. **No `pkg/` shared layer**: All shared code stays within `internal/` boundaries.
3. **Clear import direction**: `cmd` imports `internal/view`, `internal/config`, `internal/client`, etc. The `internal/` packages do not import `cmd`.
4. **Package-per-concern**: Each `internal/` subdirectory has a focused purpose (dao, render, view, watch, etc.).

## Architectural Decisions

| Decision | Rationale | Tradeoff |
|----------|-----------|----------|
| Use `internal/` instead of `pkg/` | Go's `internal/` pattern prevents external imports, stronger encapsulation | Cannot be imported by external tools/other modules |
| Large `view/` package (~90 files) | All view controllers for different K8s resources grouped together | High cohesion but potential for a large package |
| `dao/` per-resource files | Each K8s resource type has its own DAO file (dp.go, pod.go, svc.go) | Easy to find resource-specific code |
| `render/` separates rendering | Table row rendering is isolated from view logic | Requires coordination between `view/` and `render/` |
| `watch/` factory pattern | Centralized informer management | Factory can become a bottleneck |

## Notable Patterns

1. **DAO Pattern**: `internal/dao/` files provide a consistent interface for K8s resource operations. Each resource type (deployment, pod, service) has its own file with methods like `List()`, `Get()`, `Describe()`.

2. **Factory Pattern**: `internal/watch/factory.go:28-35` uses a `Factory` struct to manage multiple Kubernetes informer factories, one per namespace.

3. **Coordinator Pattern**: `internal/view/app.go:44-59` `App` struct acts as the central coordinator, holding references to `ui.App`, `factory`, `command`, and models.

4. **Thin CLI with Cobra**: `cmd/root.go` uses Cobra but defers all business logic to `internal/view`.

## Tradeoffs

- **Positive**: Clear separation between CLI parsing and business logic makes testing easier.
- **Positive**: `internal/` encapsulation prevents accidental cross-boundary imports.
- **Concern**: `internal/view/` contains ~90 files, suggesting it may be doing too much (combining view logic, navigation, user input handling).
- **Concern**: No `pkg/` means no reusable library for external consumption.

## Failure Modes / Edge Cases

- If `internal/watch/factory.go` informers fail to start, the app displays a connectivity warning but continues (`cmd/root.go:153-161`).
- The `dao/` layer returns errors directly; there is no centralized error handling middleware.
- Large `internal/view/` package could lead to import cycles if not careful.

## Future Considerations

- Consider splitting `internal/view/` into `internal/view/` (navigation/routing) and `internal/controller/` (business logic coordination).
- `internal/dao/` could be extracted into a separate package if sharing with other tools becomes necessary.
- The `plugins/` directory currently holds YAML files only; if Go-based plugins are added, they would need a separate location.

## Questions / Gaps

- **No evidence** of a `pkg/` shared library for reusable components — intentional or a limitation?
- **Import cycle check**: Did not verify with `go mod graph` but the structure suggests no cycles.
- **Testing coverage**: Did not investigate test files; unclear if business logic in `internal/` has comprehensive unit tests.

---

Generated by `study-areas/01-project-structure.md` against `k9s`.