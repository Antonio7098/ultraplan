# Repo Analysis: restic

## Project Structure & Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | restic |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/restic` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Restic is a mature Go CLI backup tool with clear architectural separation between the CLI layer (`cmd/restic/`) and business logic (`internal/`). The structure reflects well-understood Go conventions: `cmd/` for binaries, `internal/` for private packages, and a top-level `internal/restic/` package for core domain types. The CLI layer is thin — commands act as thin wrappers that delegate to `internal/` packages.

## Rating

**8/10** — Clean layering with understandable ownership. The `internal/restic` package serves as a well-defined core domain layer, and `internal/repository` handles persistence. CLI commands in `cmd/restic/` are thin wrappers. Minor扣分: some coupling exists between `internal/global` and business logic packages.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Entry point | `main.go` in `cmd/restic/main.go:162` | `cmd/restic/main.go:162` |
| Command registration | `newRootCommand()` adds commands via `AddCommand()` at lines 77-106 | `cmd/restic/main.go:37-114` |
| CLI thinness | `cmd_backup.go:35-81` — command just parses flags and calls `runBackup()` | `cmd/restic/cmd_backup.go:35-81` |
| Core domain types | `internal/restic/` contains `Repository` interface, `Blob`, `ID`, `Lock` types | `internal/restic/repository.go:18-60` |
| Business logic | `internal/archiver/` handles backup logic, `internal/repository/` handles storage | `internal/archiver/archiver.go:1`, `internal/repository/repository.go:1` |
| Backend abstraction | `Backend` interface in `internal/backend/backend.go:19` | `internal/backend/backend.go:19` |
| Global options | `global.Options` struct holds CLI config, passed to all commands | `internal/global/global.go:46-89` |
| Internal boundary | No `pkg/` directory — all business logic lives in `internal/` | `cmd/restic/main.go:17-24` |

## Answers to Protocol Questions

### 1. Why are folders organized this way?

Restic uses a straightforward Go project layout:
- `cmd/restic/` — single binary for the CLI entry point
- `internal/` — all non-exported business logic, enforcing that no external project can import these packages
- `internal/restic/` — core domain types (Repository interface, Blob, ID, Lock, etc.)
- `internal/repository/` — repository implementation (persistence, indexing, packing)
- `internal/backend/` — backend interface and implementations (s3, azure, local, etc.)
- `internal/archiver/` — backup archiver logic
- `internal/ui/` — terminal UI components

No `pkg/` directory exists, indicating all code is internal to the project.

### 2. What belongs in `cmd/` vs `internal/` vs `pkg/`?

**`cmd/restic/`**: CLI entry point and command definitions. Contains `main.go` and one `cmd_*.go` file per command. These files are thin — they parse flags and delegate to `internal/` packages.

**`internal/`**: Private business logic. Contains:
- `restic/` — core domain (interfaces, types, constants)
- `repository/` — repository implementation
- `backend/` — storage backend interface and implementations
- `archiver/` — backup logic
- `ui/` — progress and terminal UI
- `global/` — global options and repository open/create logic

**`pkg/`**: Not used in this project.

### 3. Is the CLI layer thin?

Yes. The CLI layer in `cmd/restic/` consists of:
- `main.go:162-245` — entry point with error handling and exit code mapping
- `cmd_backup.go:35-81` — backup command definition (parses flags, calls `runBackup()`)
- Similar thin wrappers for each command

Business logic lives in `internal/archiver/`, `internal/repository/`, and `internal/backend/`. Commands do not contain backup, restore, or repository management logic — they delegate to these packages.

### 4. Where does business logic actually live?

- **Backup logic**: `internal/archiver/archiver.go` — `Archiver` struct handles file scanning and saving
- **Repository logic**: `internal/repository/repository.go` — `Repository` struct manages pack files, index, keys
- **Backend logic**: `internal/backend/` — each subdirectory (s3, azure, local, etc.) implements the `Backend` interface
- **Crypto**: `internal/crypto/` — encryption/decryption
- **Check/repair/prune**: `internal/checker/`, `internal/repository/prune.go`

### 5. How do they prevent package coupling?

1. **`internal/` boundary**: Go's `internal/` convention prevents external packages from importing these packages
2. **`internal/restic/` as domain layer**: The `Repository` interface (`internal/restic/repository.go:18`) defines the contract; `internal/repository` implements it
3. **`internal/global/` only imported by CLI**: This package bridges CLI options and business logic, but the core packages (`archiver`, `repository`, `backend`) do not import `global`
4. **Dependency direction**: `cmd/restic/` → `internal/global/` → `internal/restic/` → `internal/repository/` → `internal/backend/`

## Architectural Decisions

1. **Single binary in `cmd/restic/`**: No subcommands as separate binaries; all commands compiled into one `restic` binary. This simplifies distribution but means all commands share the same startup path.

2. **`internal/restic/` as domain layer**: Rather than a `pkg/` directory, all domain types live in `internal/restic/`. This package contains interfaces (`Repository`, `Backend`) and core types (`Blob`, `ID`, `Lock`, `Config`). This is the "core" of the application.

3. **`internal/repository/` as implementation**: The `Repository` interface is defined in `internal/restic/` but implemented in `internal/repository/`. This separation allows the domain to remain stable while implementation details change.

4. **Backend plugin system**: `internal/backend/all/` registers backends, and `location.Parse()` handles URI-like repository paths (e.g., `s3:`, `local:`). The `Backend` interface (`internal/backend/backend.go:19`) is the abstraction.

5. **`internal/global/` as composition layer**: This package contains `Options` (CLI flags), `OpenRepository()`, and `CreateRepository()`. It wires together the backend, repository, and crypto layers.

## Notable Patterns

1. **Command registration via `newRootCommand()`**: All commands created via factory functions (`newBackupCommand()`, `newCheckCommand()`, etc.) added to a Cobra command tree in `main.go:37-114`.

2. **Global options passed by reference**: `globalOptions *global.Options` is passed to every command factory, allowing `PersistentPreRunE` to modify it before command execution (`main.go:51-57`).

3. **Exit code mapping in `main()`**: `main.go:199-244` maps errors to specific exit codes (1=fatal, 3=invalid source, 10=no repo, 11=locked, 12=no key).

4. **Feature flags via `feature.Flag`**: Environment-driven feature flags applied at startup (`main.go:169-175`).

5. **Terminal UI abstraction**: `internal/ui/` provides `progress.Printer` interface and `termstatus` for terminal state, allowing consistent output across commands.

## Tradeoffs

1. **`internal/global/` creates coupling**: `global.Options` knows about repository, backend, cache, and crypto. Adding new global options requires modifying this package. However, this is contained to the CLI layer.

2. **Large `internal/backend/` package**: Backend implementations (s3, azure, gs, b2, local, sftp, etc.) live under `internal/backend/`. While the `Backend` interface is clean, the volume of implementations makes the package large.

3. **No `pkg/` for public library**: Restic is designed as a single binary, not a library. There is no public API beyond the CLI. If someone wanted to use restic as a library, they would need to import `internal/` packages directly, which is not supported.

4. **Commands in single directory**: All ~30 commands live in `cmd/restic/`. There is no further grouping (e.g., `cmd/restic/backup/`, `cmd/restic/admin/`). This works for this project size but could become unwieldy.

## Failure Modes / Edge Cases

1. **Circular dependency risk**: `internal/global/` imports `internal/repository/`, `internal/backend/`, and `internal/restic/`. If `internal/repository/` or `internal/backend/` imported `global/`, it would create a cycle. The current structure avoids this, but adding imports to `global/` must be done carefully.

2. **Repository interface drift**: As new features are added (e.g., compression modes, cache strategies), the `Repository` interface in `internal/restic/repository.go:18` grows. Interface pollution could occur if care is not taken.

3. **Backend implementation sprawl**: Adding a new backend requires adding to `internal/backend/all/` and implementing the full `Backend` interface. The interface is stable (13 methods), but the implementation burden is high.

## Future Considerations

1. **Extracting `internal/restic/` as a separate module**: If restic wanted to become a library, `internal/restic/` could be extracted to `pkg/restic/` with a public API. This would be a significant architectural change.

2. **Plugin system for backends**: Currently backends are compiled in. A plugin system could allow dynamic loading, but would add complexity.

3. **Command grouping**: As the number of commands grows, grouping related commands into subdirectories within `cmd/restic/` could improve navigability.

## Questions / Gaps

1. **Why no `pkg/` directory?** Restic has no public library API, so `internal/` is sufficient. This is a deliberate choice, not an oversight.

2. **Why `internal/global/` instead of putting this logic in `cmd/restic/`?** The `global.go` contains `OpenRepository()`, `CreateRepository()`, password handling, and backend wrapping — substantial logic that belongs in a package, not in the `cmd/` binary layer. This allows the logic to be tested and reused.

3. **No clear evidence of dependency injection framework**: Restic creates objects directly with `New()`, `Open()`, etc. No DI container is used. This keeps the code simple but requires manual wiring.

---

Generated by `study-areas/01-project-structure.md` against `restic`.