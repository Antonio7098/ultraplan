# Repo Analysis: restic

## Dependency Injection & Wiring

### Repo Info

| Field | Value |
|-------|-------|
| Name | restic |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/restic` |
| Group | `03-dependency-injection` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

restic uses a **centralized composition root** in `cmd/restic/main.go` where `global.Options` is assembled and passed to each command constructor. Commands receive dependencies via struct pointers rather than global state. The `global.Options` struct carries all configuration including the backend registry, while the `repository.Repository` is opened lazily per-command via `global.OpenRepository()`. Interfaces are defined in `internal/restic/` to abstract storage operations, enabling testability. No `context.WithValue` for request-scoped DI was found.

## Rating

**8/10** — Clear composition root with explicit wiring, interface abstraction for dependencies, and good testability through concrete interface types.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Composition root | `global.Options` assembled in `main()` | `cmd/restic/main.go:181-183` |
| Command factory | `newRootCommand(globalOptions *global.Options) *cobra.Command` | `cmd/restic/main.go:37` |
| Command wiring | `newBackupCommand(globalOptions)`, `newCheckCommand(globalOptions)` etc. | `cmd/restic/main.go:77-106` |
| Global Options struct | `type Options struct { ... Backends *location.Registry ... }` | `internal/global/global.go:46-89` |
| Repository construction | `OpenRepository()` creates repo from options | `internal/global/global.go:301-338` |
| Repository interface | `type Repository interface { ... }` | `internal/restic/repository.go:18-66` |
| Backend interface | `type Backend interface { ... }` | `internal/backend/backend.go:19-90` |
| Backend wrapper pattern | Debug logging, retry, sema, cache wrapped in `wrapBackend()` | `internal/global/global.go:592-627` |
| Lock acquisition | `openWithAppendLock()`, `openWithExclusiveLock()` | `cmd/restic/lock.go:43-50` |
| Interface abstraction | `archiverRepo` requires `restic.Loader`, `restic.WithBlobUploader` | `internal/archiver/archiver.go:75-81` |
| Context usage | Context passed through `runBackup(cmd.Context(), opts, *globalOptions, ...)` | `cmd/restic/cmd_backup.go:76` |
| Global state (minor) | `var backupFSTestHook func(fs fs.FS) fs.FS` test hook | `cmd/restic/cmd_backup.go:166` |

## Answers to Protocol Questions

### 1. Where are dependencies constructed?

Dependencies are constructed in two places:

**Central assembly** (`cmd/restic/main.go:181-183`):
```go
globalOptions := global.Options{
    Backends: all.Backends(),
}
```
This creates the `global.Options` with the backend registry.

**Per-command repository opening** (`internal/global/global.go:301-338`):
```go
func OpenRepository(ctx context.Context, gopts Options, printer progress.Printer) (*repository.Repository, error)
```
Each command that needs a repository calls `OpenRepository()` which creates a `repository.Repository` from the backend, cache, encryption key, and configuration. This is done inside `runBackup()`, `runCheck()`, etc., not at startup.

### 2. How are services passed around?

Services are passed via **pointer passing** through the call chain:

1. `globalOptions *global.Options` is passed to each command constructor (`newBackupCommand(globalOptions)`)
2. Commands store a reference to `globalOptions` and pass it to their `runXxx()` function as `global.Options` (value copy of the struct, which contains pointers)
3. `globalOptions.Term` (terminal), `globalOptions.Backends` (registry), etc. flow down to `OpenRepository()`
4. The `repository.Repository` is returned and used directly within each `runXxx()` function

Example from `cmd_backup.go:76`:
```go
RunE: func(cmd *cobra.Command, args []string) error {
    return runBackup(cmd.Context(), opts, *globalOptions, globalOptions.Term, args)
},
```

And in `runBackup()` (`cmd/restic/cmd_backup.go:530`):
```go
ctx, repo, unlock, err := openWithAppendLock(ctx, gopts, opts.DryRun, printer)
```

### 3. Is wiring centralized?

**Yes** — The root command in `main.go` is the composition root. It creates `global.Options` and passes it to each command factory function. Command constructors (`newBackupCommand`, `newCheckCommand`, etc.) all receive the same `*global.Options`.

However, the `repository.Repository` is created **per-command** via `OpenRepository()` which is called inside each `runXxx()` function, not at startup. This means different commands could theoretically get different repository instances, though in practice they use the same configuration.

The backend wrapping (debug logging, retry, sema, cache) is centralized in `wrapBackend()` at `internal/global/global.go:592`.

### 4. Are globals avoided?

**Yes, largely.** There are no package-level global variables holding application state. The only notable exception is:

- `var backupFSTestHook func(fs fs.FS) fs.FS` at `cmd/restic/cmd_backup.go:166` — a test hook for mocking the filesystem

Other package-level variables are either constants (version strings, error sentinels) or lazy-initialized caches (e.g., `sync.Once` patterns in `repository.go:52-53` for encoder/decoder allocation).

The `global.Options` struct is passed explicitly, not accessed via a global.

### 5. Is initialization explicit?

**Yes.** All initialization happens through explicit function calls:

- `global.Options` fields are set in `main.go` and `PreRun()`
- `OpenRepository()` explicitly creates repository instances
- `repository.New(be, opts)` in `internal/repository/repository.go:125` for direct construction
- No hidden initialization or init() functions that bootstrap dependencies

## Architectural Decisions

### Centralized Composition Root
The `newRootCommand()` function in `main.go` acts as a factory for all commands, each receiving the same `global.Options`. This makes it clear where the app is assembled.

### Interface-Abstraction Layers
- `restic.Repository` interface (`internal/restic/repository.go:18`) abstracts storage operations
- `restic.Backend` interface (`internal/backend/backend.go:19`) abstracts the storage backend
- `archiver.archiverRepo` interface (`internal/archiver/archiver.go:75-81`) allows the archiver to work with any repository implementation

### Backend Wrapper Chain
Backends are wrapped in a chain (`internal/global/global.go:592-627`):
1. `sema.NewBackend()` — concurrency limiting
2. `logger.New()` — debug logging
3. `retry.New()` — retry with timeout
4. Optional `BackendTestHook` / `BackendInnerTestHook` for tests

This decorator pattern allows adding concerns without modifying core logic.

### Lazy Repository Opening
The repository is opened only when a command actually needs it (inside `runXxx()` functions), not at startup. This keeps startup fast and allows commands like `version` or `help` to run without a repository.

## Notable Patterns

### Constructor Functions
- `repository.New(be backend.Backend, opts Options)` at `internal/repository/repository.go:125`
- `archiver.New(repo archiverRepo, fs fs.FS, opts Options)` at `internal/archiver/archiver.go:644`
- `checker.New(repo *Repository, checkUnused bool)` at `internal/checker/checker.go:247`

### Interface-Based Abstraction
```go
type archiverRepo interface {
    restic.Loader
    restic.WithBlobUploader
    restic.SaverUnpacked[restic.WriteableFileType]
    Config() restic.Config
}
```
This allows the archiver to be tested with mock implementations.

### Options Struct Pattern
Each command has an `XxxOptions` struct (e.g., `BackupOptions`, `CheckOptions`) that holds command-specific flags, separate from `global.Options`.

## Tradeoffs

### Strengths
- **Clear dependency flow** — you can trace where any dependency comes from
- **Testability** — interfaces allow mocking repositories and backends
- **No hidden state** — no global variables with mutable state
- **Flexible backend composition** — the wrapper chain is explicit and configurable

### Weaknesses
- **Large `global.Options` struct** — carries many fields, some commands only need a subset
- **`global.Options` passed to every command** — even commands that don't need repository access still receive it (though `__complete` and `__completeNoDesc` skip `PreRun`)
- **Repository opened per-command** — if a command needs multiple repos (e.g., `copy`), it re-authenticates
- **No context-scoped DI** — context is used for cancellation/deadline, not for request-scoped values

## Failure Modes / Edge Cases

- **Password prompt timing** — `OpenRepository()` prompts for password in `decryptRepository()` at `internal/global/global.go:372-406`. If the context is cancelled during password prompt, the goroutine leaks.
- **Lock release on error** — The `unlock()` callback returned by `openWithAppendLock()` must be called defer-wise; if a command returns early without deferring, locks persist.
- **Backend test hooks** — `BackendTestHook` and `BackendInnerTestHook` in `global.Options:72` are only used for testing but modify backend behavior in production paths.

## Future Considerations

- Consider using a proper DI container (e.g., `wire`) for larger-scale composition
- The `global.Options` struct could be split into smaller option groups per command category
- Could explore `context.WithValue` for request-scoped values like the terminal or printer

## Questions / Gaps

- **No clear evidence** of struct injection patterns (where a struct's fields are injected via constructors). Dependencies are passed as parameters, not injected into struct fields.
- **Locking is at repository level**, not command level — commands share repository state once opened.
- **Cache initialization** happens inside `OpenRepository()` at `internal/global/global.go:333` — the cache is tied to the repository instance, not a separate injectable service.

---

Generated by `study-areas/03-dependency-injection.md` against `restic`.