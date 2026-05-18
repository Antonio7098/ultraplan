# Repo Analysis: go-task

## Project Structure & Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | go-task |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/go-task` |
| Group | `go-task` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Go-task uses a well-layered structure with a thin CLI entry point (`cmd/task/task.go`), business logic in the root `task` package, and a rich set of internal utility packages under `internal/`. The `taskfile/` package provides data structures for Taskfile representation, while `taskrc/` handles configuration. Dependency direction flows cleanly from CLI → business logic → internal utilities.

## Rating

**8/10** — Clean layering with understandable ownership. The CLI layer is thin, business logic is well-contained in the root `task` package, and internal packages are properly separated. Minor扣分: the `args` package at root level could arguably live elsewhere.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Main entry point | CLI entry point thin, delegates to Executor | `cmd/task/task.go:23-203` |
| Executor struct | Core business logic container | `executor.go:27-84` |
| Internal utilities | 22 subpackages under `internal/` | `internal/` directory |
| Taskfile AST | Data structures for Taskfile parsing | `taskfile/ast/task.go:1-90` |
| Command registration | Flags parsed via pflag, Executor created | `cmd/task/task.go:129-132` |
| CLI → business flow | `task.NewExecutor()` then `e.Setup()` then `e.Run()` | `cmd/task/task.go:129,133,202` |
| Package cohesion | Taskfile-related code grouped in `taskfile/` | `taskfile/` directory |
| Release tool | Separate `cmd/release/main.go` for release mgmt | `cmd/release/main.go:1-137` |

## Answers to Protocol Questions

### 1. Why are folders organized this way?

The repo uses Go's standard layering conventions:
- `cmd/` for standalone CLI tools (`task`, `sleepit`, `release`)
- Root-level `task` package for core business logic
- `internal/` for implementation details invisible to external consumers
- `taskfile/` and `taskrc/` for domain-specific data structures

This follows idiomatic Go project layout with clear separation between input handling (CLI), core logic, and supporting utilities.

### 2. What belongs in `cmd/` vs `internal/` vs `pkg/`?

**`cmd/`**: Main entry points for executables. `cmd/task/task.go` is the primary CLI tool; `cmd/sleepit/` and `cmd/release/` are auxiliary tools.

**`internal/`**: Implementation details. Contains 22 packages (`flags`, `logger`, `output`, `fingerprint`, `templater`, `execext`, etc.) providing pure utilities without business logic.

**Root `task` package**: Core business logic — `Executor`, `Compiler`, task execution, variable handling, etc.

**`taskfile/`**: Domain model for Taskfiles (not generic utilities), contains `ast/` subpackage for data structures.

**`taskrc/`**: Domain model for .taskrc configuration files.

Note: No `pkg/` directory exists — public library code intended for external reuse appears to live at root level in the `task` package.

### 3. Is the CLI layer thin?

**Yes.** `cmd/task/task.go` (203 lines) performs only:
- Flag parsing and validation (`flags.go:1-355`)
- Logger setup
- Executor creation and `Setup()` call
- Delegating to `e.Run()` for actual work

The CLI layer does not contain any task execution logic — it merely constructs and configures the `Executor`, then invokes it.

### 4. Where does business logic actually live?

Business logic lives in the root `task` package:
- `task.go:42` — `Run()` method orchestrates task execution
- `executor.go:27-84` — `Executor` struct holds all state and configuration
- `setup.go:26-54` — `Setup()` initializes Executor from Taskfile
- `compiler.go` — compiles Taskfile to internal representation
- `executor.go:91-619` — task execution methods
- `variables.go` — variable handling and expansion
- `call.go` — call parsing
- `signals.go` — signal handling for watch mode

### 5. How do they prevent package coupling?

- **`internal/` visibility**: Go's `internal/` directory pattern prevents external packages from importing these utilities
- **Clear domain boundaries**: `taskfile/` handles Taskfile parsing; `taskrc/` handles config; `task` package orchestrates
- **Functional options pattern**: `ExecutorOption` interface (`executor.go:22-24`) allows decoupled configuration
- **No circular dependencies**: Evidence from import structure — `task` imports `internal/` packages; `internal/` packages are leaf nodes with no task-specific imports

## Architectural Decisions

1. **Thin CLI via Executor pattern**: CLI creates an `Executor` instance and delegates to it, keeping command-handling logic minimal (`cmd/task/task.go:129-202`).

2. **Domain model separation**: `taskfile/ast/` and `taskrc/ast/` separate data structure definitions from business logic, allowing the Taskfile model to evolve independently.

3. **Internal utility packages**: 22 packages under `internal/` provide focused utilities (logging, output formatting, file extensions, fingerprinting, etc.) that are used throughout but hidden from external consumers.

4. **Functional options for configuration**: `ExecutorOption` interface (`executor.go:22-24`) with `ApplyToExecutor` method allows flexible, composable Executor configuration withouttelephone-style setters.

5. **Single module with multiple binaries**: The Go module at root contains both the library (`task` package) and multiple binaries (`cmd/task`, `cmd/sleepit`, `cmd/release`).

## Notable Patterns

- **Executor as centerpiece**: `Executor` struct (`executor.go:27-84`) is the main facade, containing all configuration, state, and methods for task execution.

- **Option functions for initialization**: `NewExecutor(opts ...ExecutorOption)` (`executor.go:93`) uses functional options pattern for clean API.

- **Nested package groups**: `taskfile/ast/`, `taskrc/ast/` use subpackage naming for domain model types.

- **Separation of I/O and logic**: `internal/logger/` and `internal/output/` separate output concerns from task execution logic.

## Tradeoffs

**Pros:**
- Clean layering with clear ownership boundaries
- `internal/` visibility protection prevents external misuse of utilities
- Thin CLI makes testing and embedding easier
- Well-organized domain models (`taskfile/`, `taskrc/`)

**Cons:**
- `args` package at root level (`args/args.go:1-59`) is neither clearly CLI nor internal utility — could cause confusion about its intended use
- No `pkg/` for public library code — the `task` package serves dual purpose as both application and library
- Some internal packages (`deepcopy/`, `filepathext/`) are small utilities that could arguably be external dependencies

## Failure Modes / Edge Cases

- **Cyclic task dependencies**: Handled via `MaximumTaskCall` constant (`task.go:31` = 1000) to prevent infinite loops
- **Missing Taskfile**: `setup.go:56-73` catches `TaskfileNotFoundError` and offers to create one via init
- **Version conflicts**: `setup.go:48-50` performs version checks before execution

## Future Considerations

- Could extract `args` package into `internal/args/` or `cmd/task/args/` for clarity
- `pkg/` could be introduced if library API surface grows significantly
- Some internal packages may be candidates for external extraction (e.g., `fingerprint`, `templater`)

## Questions / Gaps

- **Why no `pkg/` directory?** The project uses root `task` package for library code. If the library API grows, introducing `pkg/` for public APIs may be warranted.
- **Release tooling location**: `cmd/release/main.go` is a build-time tool, not shipped with the CLI. Its placement is appropriate but notable.

---

Generated by `study-areas/01-project-structure.md` against `go-task`.