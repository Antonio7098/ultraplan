# Repo Analysis: helm

## Project Structure & Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | helm |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/helm` |
| Group | `01-project-structure` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Helm uses a layered architecture with a thin CLI entry point (`cmd/helm/`) that delegates to `pkg/cmd/` for command definitions, which in turn invoke `pkg/action/` for business logic. The `internal/` package contains experimental/chart-v3 code that enforces private boundary. The `pkg/` directory is the public SDK surface. Dependency flow is unidirectional from CLI to business logic, with clean separation between input handling and core operations.

## Rating

**8/10** — Clean layering with understandable ownership. The `cmd/`, `pkg/cmd/`, `pkg/action/` hierarchy is disciplined. `internal/` correctly enforces experimental-code boundaries. Minor扣分 for some legacy patterns in `pkg/repo/` and chart version duplication between `pkg/chart/v2` and `internal/chart/v3`.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Entry point | `cmd/helm/helm.go` creates root command via `helmcmd.NewRootCmd` | `cmd/helm/helm.go:38` |
| CLI root | `pkg/cmd/root.go:105` builds Cobra command tree, adds subcommands | `pkg/cmd/root.go:267-303` |
| Command → Action bridge | `pkg/cmd/install.go:132` creates `action.NewInstall(cfg)` and calls `client.RunWithContext()` | `pkg/cmd/install.go:347` |
| Business logic | `pkg/action/install.go:73` defines `Install struct` with business rules | `pkg/action/install.go:73-140` |
| Storage layer | `pkg/storage/storage.go:41` embeds `driver.Driver` interface | `pkg/storage/storage.go:42` |
| internal boundary | `internal/chart/v3/` contains experimental chart v3 code | `internal/chart/v3/` |
| internal boundary | `internal/release/v2/` contains v2 release support for chart v3 | `internal/release/v2/` |
| pkg public surface | `pkg/storage/storage.go:17` package comment `// import "helm.sh/helm/v4/pkg/storage"` | `pkg/storage/storage.go:17` |
| cmd entry point | `cmd/helm/helm.go:17` declares `package main // import "helm.sh/helm/v4/cmd/helm"` | `cmd/helm/helm.go:17` |

## Answers to Protocol Questions

### 1. Why are folders organized this way?

The folder structure follows Go package conventions with explicit boundaries:
- `cmd/helm/` — Thin binary entry point, sets up logging and delegates to `pkg/cmd/`
- `pkg/cmd/` — Cobra command definitions that parse CLI flags and invoke `pkg/action/`
- `pkg/action/` — Business logic for each operation (install, upgrade, etc.)
- `pkg/` — Public SDK surface, stable APIs for external consumers
- `internal/` — Private implementation details not exposed as public API

Evidence: `cmd/helm/helm.go:38` calls `helmcmd.NewRootCmd()` which lives in `pkg/cmd/root.go:105`.

### 2. What belongs in `cmd/` vs `internal/` vs `pkg/`?

- **`cmd/`** (thin CLI layer): `cmd/helm/helm.go` — package main only, minimal wiring
- **`pkg/cmd/`** (CLI command definitions): Cobra command structs and flag handling
- **`pkg/action/`** (business logic): Core operations like `Install`, `Upgrade`, `Rollback`
- **`pkg/`** (public API): Storage, release types, chart handling, engine, registry, repo, getter
- **`internal/`** (private implementation): Experimental features like `internal/chart/v3/`, `internal/release/v2/`, plugin system internals, third-party wrappers

Go's `internal/` package name triggers Go's internal package protection — external repos cannot import `internal/` packages.

### 3. Is the CLI layer thin?

**Yes.** The CLI layer (`cmd/helm/` + `pkg/cmd/`) only:
1. Parses flags and args
2. Creates an `action.Configuration` 
3. Instantiates action structs (`action.NewInstall(cfg)`)
4. Calls the action's `Run*` method
5. Formats output

All Kubernetes interaction, chart processing, storage, and release management happens in `pkg/action/` and deeper layers.

Evidence: `pkg/cmd/install.go:347` shows `client.RunWithContext(ctx, chartRequested, vals)` being the sole business logic call.

### 4. Where does business logic actually live?

Business logic lives in `pkg/action/`:
- `pkg/action/install.go:73-993` — Full install logic including CRD handling, namespace creation, hook execution, resource adoption
- `pkg/action/upgrade.go` — Upgrade operations
- `pkg/action/rollback.go` — Rollback operations
- `pkg/storage/storage.go:41-352` — Release storage abstraction
- `pkg/engine/engine.go` — Template rendering
- `pkg/kube/` — Kubernetes client abstraction

### 5. How do they prevent package coupling?

1. **`internal/` boundary**: Go's compiler prevents external packages from importing `internal/` (`internal/chart/v3/`, `internal/release/v2/`)
2. **Unidirectional flow**: CLI (`pkg/cmd/`) imports `pkg/action/`, which imports lower-level packages. Reverse imports are forbidden by architecture.
3. **Interface abstraction**: `pkg/storage/storage.go:42` embeds `driver.Driver` interface, allowing multiple storage backends (`pkg/storage/driver/`)
4. **Configuration injection**: `pkg/action/install.go:75` holds `*Configuration` pointer rather than importing CLI packages

## Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| `cmd/` + `pkg/cmd/` split | Distinguishes binary entry point from command definitions, enabling the SDK to expose commands without running the CLI |
| `pkg/action/` for business logic | Separates operation semantics (install, upgrade) from CLI flag parsing, enabling library reuse |
| `internal/` for experimental code | Chart v3 and release v2 are under development; `internal/` prevents external consumers from depending on unstable APIs |
| `Configuration` struct | Shared across all actions via pointer injection, providing RESTClientGetter, Releases, KubeClient, Capabilities |
| Embedded driver interface in Storage | Allows pluggable storage backends (ConfigMaps, Secrets, Memory, SQL) without changing Storage API |

## Notable Patterns

- **Action pattern**: Each CLI command creates an action struct, configures it via flags, then calls `Run()` / `RunWithContext()`. See `pkg/cmd/install.go:254` → `pkg/action/install.go:275`
- **Configuration injection**: `action.Configuration` (defined in `pkg/action/configuration.go`) is shared across all actions and initialized once at startup (`pkg/cmd/root.go:106`)
- **Chart accessor abstraction**: `pkg/chart/` and `internal/chart/v3/` use accessor interfaces to hide version differences
- **Release v1/v2 split**: `pkg/release/v1/` is stable; `internal/release/v2/` supports chart v3 internally

## Tradeoffs

| Tradeoff | Description |
|----------|-------------|
| Chart v2/v3 duplication | Stable v2 charts in `pkg/chart/v2/`, experimental v3 in `internal/chart/v3/`. Duplication increases maintenance burden but protects stable API |
| Action struct embedding Configuration | Each action struct embeds `*Configuration` which grows over time as features are added, potentially violating single responsibility |
| Extensive flag handling in `pkg/cmd/` | Some commands like `install.go` have 100+ lines of flag setup, making them harder to maintain |
| `internal/third_party/` | Vendored code for Kubernetes deployment utilities adds weight to the repo |

## Failure Modes / Edge Cases

| Mode | Evidence |
|------|----------|
| Storage driver failure | `pkg/storage/storage.go:333-337` defaults to in-memory driver if nil |
| Concurrent release corruption | `pkg/storage/storage.go:171-173` comment notes "If executed concurrently, Helm's database gets corrupted" — guarded by mutex in `Install` struct |
| Failed release recording | `pkg/action/install.go:574-576` silently logs failure to record release after install succeeds |
| Expired repository deprecation | `pkg/cmd/root.go:357-402` checks for deprecated repo URLs and warns users |

## Future Considerations

- Chart v3 moving from `internal/` to `pkg/` will require careful API stability planning
- The `Configuration` struct is a potential God object; extracting dedicated clients (Registry, Storage, Kube) could improve modularity
- SQL storage driver is under development; interface already supports pluggability via `driver.Driver`

## Questions / Gaps

- **No evidence found** of explicit layer violation detection (no linting rules preventing `internal/` imports into `pkg/`)
- `pkg/gates/` and `internal/gates/` both exist — purpose of duplication unclear
- `AGENTS.md` describes the architecture but is not enforced mechanically