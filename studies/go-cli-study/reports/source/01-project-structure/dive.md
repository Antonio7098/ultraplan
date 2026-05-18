# Repo Analysis: dive

## Project Structure & Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | dive |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/dive` |
| Group | `dive` |
| Language / Stack | Go 1.24 |
| Analyzed | 2026-05-15 |

## Summary

dive uses a clean layered architecture with thin CLI entry point (`cmd/dive/`), business logic in `dive/` subpackage, and shared utilities in `internal/`. The CLI layer handles only argument parsing and UI coordination, delegating all image analysis to the `dive/` package. The `internal/` package holds cross-cutting concerns (bus, log, utils) accessible only from `cmd/dive/cli/`.

## Rating

**8/10** — Clean layering with understandable ownership. CLI layer is thin, business logic is isolated in `dive/`, and `internal/` provides proper boundary for shared utilities. Minor扣分: `cmd/dive/cli/` has a nested `internal/` that mirrors the top-level `internal/` pattern but is not clearly distinguished.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Entry point | `main.go` delegates to `cli.Application()` | `cmd/dive/main.go:43-54` |
| CLI layer | `cli.go` creates app, adds commands, wires bus/log | `cmd/dive/cli/cli.go:22-52` |
| CLI commands | Root command defined in `command/root.go` | `cmd/dive/cli/internal/command/root.go:25-61` |
| Business logic | `dive/get_image_resolver.go` selects image source | `dive/get_image_resolver.go:62-73` |
| Domain models | `image.Image`, `image.Resolver` interfaces | `dive/image/resolver.go:5-13` |
| File tree | `filetree/file_tree.go` implements tree structure | `dive/filetree/file_tree.go:1-1` |
| Event bus | Global publisher in `internal/bus/bus.go` | `internal/bus/bus.go:5-18` |
| Layering direction | `cmd/dive/cli/internal/command/root.go:46` calls `dive.GetImageResolver()` | `cmd/dive/cli/internal/command/root.go:46` |

## Answers to Protocol Questions

### 1. Why are folders organized this way?

The structure follows a standard Go CLI layout: `cmd/` for entry points, `internal/` for private packages, and a top-level `dive/` subpackage for domain-specific code. The `cmd/dive/cli/internal/` nesting isolates CLI-specific commands and UI from the rest of the codebase. This separation allows the `dive/` package to be imported by external tools without pulling in CLI dependencies.

### 2. What belongs in `cmd/` vs `internal/` vs `pkg/`?

- **`cmd/dive/`**: Application entry point and CLI wiring. Contains `main.go` and the `cli` package that uses `anchore/clio` to bootstrap the application.
- **`cmd/dive/cli/internal/`**: Command definitions (`command/`), UI components (`ui/`), and CLI options (`options/`). These are CLI-specific and not meant for reuse.
- **`internal/`**: Shared utilities with no domain knowledge: `bus` (event publishing), `log` (logging), `utils` (helpers).
- **`dive/`**: Domain logic for image analysis, file tree building, and image source resolution. This is the core business logic that could theoretically be used as a library.
- **No `pkg/`**: The project does not use `pkg/` for public library code—everything intended for reuse lives in `dive/` or `internal/`.

### 3. Is the CLI layer thin?

Yes. The CLI layer (`cmd/dive/cli/`) handles only:
- Application setup via `anchore/clio` (`cli.go:22-52`)
- Command registration and argument parsing (`command/root.go`)
- UI initialization (`ui/` directory)
- Wiring global dependencies (bus, log) via initializers (`cli.go:29-36`)

All actual work—image fetching, analysis, file tree building—is delegated to `dive/` or `internal/` packages.

### 4. Where does business logic actually live?

Business logic lives in the `dive/` subpackage:
- Image source resolution and fetching: `dive/get_image_resolver.go`, `dive/image/docker/`, `dive/image/podman/`
- Image analysis: `dive/image/analysis.go`
- File tree construction: `dive/filetree/file_tree.go:1`
- Efficiency calculation: `dive/filetree/efficiency.go`

The `cmd/dive/cli/internal/command/root.go:74-98` shows the flow: CLI receives image name → `dive.GetImageResolver()` picks the right resolver → `adapter.NewAnalyzer().Analyze()` performs analysis → results are exported, evaluated for CI, or sent to UI via `bus.ExploreAnalysis()`.

### 5. How do they prevent package coupling?

- **`internal/` boundary**: Go's `internal/` package restriction prevents external imports (enforced by the linker at build time).
- **No circular dependencies**: The dependency graph is acyclic: `cmd/dive/main.go` → `cli` → `command/` → `dive/` → `image/` subpackages.
- **Adapter pattern**: `cmd/dive/cli/internal/command/adapter/` wraps domain types for CLI consumption, decoupling CLI from domain interfaces.
- **Global state via bus**: `internal/bus/bus.go:5` provides a global publisher, but it's a thin wrapper around `go-partybus`, avoiding deep coupling.

## Architectural Decisions

1. **Embedded domain package**: The `dive/` directory is not a standard import path (it's `github.com/wagoodman/dive/dive`). This groups the domain under the module name, making clear that everything in `dive/` is part of the project's core purpose. This is a conscious choice to avoid `pkg/` for internal domain logic.

2. **CLI framework via anchore/clio**: Rather than building Cobra commands from scratch, `cli.go:23-26` uses `clio.NewSetupConfig` with options for global config, logging flags, and UI. This standardizes CLI behavior across anchore projects.

3. **Global bus for event distribution**: `internal/bus/bus.go` provides a package-level publisher. Commands and UI components publish events through this bus rather than direct method calls, decoupling event producers from consumers.

4. **Adapter layer for domain/CLI boundary**: `cmd/dive/cli/internal/command/adapter/` contains `image_resolver.go`, `analyzer.go`, `exporter.go`, `evaluator.go`—each wrapping a domain type to present a CLI-friendly interface.

## Notable Patterns

- **Image source abstraction** (`dive/get_image_resolver.go:62-73`): Factory function returns `image.Resolver` interface, supporting Docker, Podman, and archive sources without CLI knowledge of which to use.
- **Event-driven UI updates**: `bus.ExploreAnalysis()` at `cmd/dive/cli/internal/command/root.go:96` sends analysis events to the UI layer via the bus, decoupling analysis from rendering.
- **Strategy pattern in filetree**: `filetree/order_strategy.go` allows different tree traversal orders.

## Tradeoffs

- **Single binary focus**: No `pkg/` for library export—the project is designed solely as a CLI. The `dive/` subpackage could theoretically be extracted to a separate module but is not structured for that.
- **`internal/` nesting in CLI**: `cmd/dive/cli/internal/` mirrors the top-level `internal/` pattern but is specific to CLI concerns. This is conventional but creates two `internal/` directories at different depths.
- **Global bus singleton**: `internal/bus.Get()` at `cmd/dive/cli/internal/command/root.go:96` uses a global, which simplifies event flow but makes testing of event consumers harder.

## Failure Modes / Edge Cases

- **Image source detection**: `dive/get_image_resolver.go:42-60` uses string prefix matching (`docker://`, `podman://`). Malformed image strings return `SourceUnknown`, which propagates as an error at `root.go:47-49`.
- **Layer fetch failures**: `dive/image/docker/engine_resolver.go` fetches layers from Docker engine. Network errors or permission issues surface as opaque errors from the Docker client.
- **Archive parsing**: `dive/image/docker/image_archive.go` handles tar archives. Corrupted archives may cause panics in the docker library rather than graceful error handling.

## Future Considerations

- Extract `dive/` as a standalone library with separate module for programmatic use.
- Add structured error types in `dive/` to replace string-based error messages.
- Consider interface contracts for `image.Resolver` to allow third-party implementations.

## Questions / Gaps

- No evidence found of `pkg/` usage—the project is purely CLI-focused with no library export intention.
- No evidence of integration tests spanning CLI and domain layers (only unit tests in `dive/filetree/` and `cli/`).
- The `internal/utils/` directory contents not inspected; may contain additional layering patterns.

---

Generated by `study-areas/01-project-structure.md` against `dive`.