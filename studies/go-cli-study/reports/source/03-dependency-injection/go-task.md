# Repo Analysis: go-task

## Dependency Injection & Wiring

### Repo Info

| Field | Value |
|-------|-------|
| Name | go-task |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/go-task` |
| Group | `03-dependency-injection` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

go-task employs a functional options pattern centered around an `Executor` struct as the composition root. Dependencies are explicitly wired through `NewExecutor()`, `ExecutorOption` interfaces, and an `Executor.Setup()` method that orchestrates initialization of Logger, Output, Compiler, TempDir, and concurrency state. The design is largely explicit and avoids package-level globals, though CLI flags are parsed into package-level variables in `internal/flags/flags.go:46-90` before being applied to the Executor.

## Rating

**7/10** — Clear composition root with functional options, explicit wiring through `Setup()`, and reasonable separation of concerns. Docked points for package-level flag globals that must be explicitly applied via `WithFlags()`.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Functional options pattern | `ExecutorOption` interface with `ApplyToExecutor` method | `executor.go:22-24` |
| NewExecutor constructor | `NewExecutor(opts ...ExecutorOption) *Executor` | `executor.go:93-114` |
| Logger construction | Logger created in `setupLogger()` with stdin/stdout/stderr | `setup.go:189-199` |
| Output interface | `Output` interface with `WrapWriter` method | `internal/output/output.go:12-14` |
| Output construction | `BuildFor()` factory creates Output implementations | `internal/output/output.go:19-40` |
| Compiler construction | Compiler set up via `setupCompiler()` | `setup.go:211-229` |
| Executor.Setup orchestration | Sequential setup calls: logger, node, tempdir, taskfile, stdout, output, compiler, dotenv, version, defaults, concurrency | `setup.go:26-54` |
| Context usage | `ctx context.Context` passed through Run, RunTask, readTaskfile | `task.go:42,128`, `setup.go:76` |
| Interface for services | `StatusCheckable`, `SourcesCheckable` interfaces | `internal/fingerprint/checker.go:9-19` |
| Package-level flag state | All CLI flags declared as package vars | `internal/flags/flags.go:46-90` |
| Flags applied to Executor | `WithFlags()` creates `flagsOption` that calls `e.Options(...)` | `internal/flags/flags.go:255-312` |
| Reader functional options | `ReaderOption` interface mirrors Executor pattern | `taskfile/reader.go:37-40` |
| No global service registry | Services stored as Executor fields, not globals | `executor.go:27-84` |

## Answers to Protocol Questions

### 1. Where are dependencies constructed?

Dependencies are constructed in two places:
- **`NewExecutor()`** (`executor.go:93-114`): Creates the Executor struct with defaults (Stdin=os.Stdin, Stdout=os.Stdout, Stderr=os.Stderr, Timeout=10s, default TaskSorter)
- **`Executor.Setup()`** (`setup.go:26-54`): Initializes logger, temp directories, reads taskfile, sets up stdout/stderr, output, compiler, dotenv files, version checks, defaults, and concurrency state

The Executor serves as the composition root.

### 2. How are services passed around?

Services are passed via:
- **Functional options** (`ExecutorOption` interface at `executor.go:22-24`): Options like `WithDir()`, `WithEntrypoint()`, `WithForce()` are applied via `Options()` method
- **Direct method calls on Executor**: `e.Setup()`, `e.Run(ctx, calls...)`, `e.Status(ctx, calls...)`
- **Internal field access**: `e.Logger`, `e.Compiler`, `e.Output`, `e.Taskfile` are fields accessed internally

No service locator or global registry is used.

### 3. Is wiring centralized?

Yes, wiring is centralized at `Executor.Setup()` (`setup.go:26-54`). The method orchestrates initialization in a specific order:
```
setupLogger → getRootNode → setupTempDir → readTaskfile → setupStdFiles → setupOutput → setupCompiler → readDotEnvFiles → doVersionChecks → setupDefaults → setupConcurrencyState
```

This deterministic initialization order makes the wiring explicit and traceable.

### 4. Are globals avoided?

**Mostly**. The codebase avoids global service registries and package-level service instances. However, CLI flags are parsed into package-level variables in `internal/flags/flags.go:46-90`. These are not service dependencies but configuration state that must be explicitly passed to the Executor via `WithFlags()` (`internal/flags/flags.go:255-312`).

No global `sync.Map` or package-level `Executor` instance was found.

### 5. Is initialization explicit?

**Yes**. All initialization flows through `Executor.Setup()` or the functional options applied via `Options()`. The `setupLogger()` method at `setup.go:189-199` explicitly creates the Logger with all dependencies injected:

```go
e.Logger = &logger.Logger{
    Stdin:      e.Stdin,
    Stdout:     e.Stdout,
    Stderr:     e.Stderr,
    Verbose:    e.Verbose,
    Color:      e.Color,
    AssumeYes:  e.AssumeYes,
    AssumeTerm: e.AssumeTerm,
}
```

## Architectural Decisions

1. **Functional Options Pattern**: The `ExecutorOption` interface (`executor.go:22-24`) allows flexible, testable configuration. Over 20 option types exist (WithDir, WithEntrypoint, WithForce, etc.).

2. **Executor as Composition Root**: All services (`Logger`, `Compiler`, `Output`, `Taskfile`, `TaskSorter`) are fields on the `Executor` struct (`executor.go:27-84`). This centralizes the object graph.

3. **Output Interface**: The `Output` interface (`internal/output/output.go:12-14`) allows different output strategies (Interleaved, Group, Prefixed) to be injected. `BuildFor()` (`internal/output/output.go:19-40`) acts as a factory.

4. **Fingerprint Interfaces**: `StatusCheckable` and `SourcesCheckable` interfaces (`internal/fingerprint/checker.go:9-19`) allow different fingerprinting strategies to be swapped.

5. **Context Propagation**: `context.Context` is passed through `Run()`, `RunTask()`, `readTaskfile()`, and used in `execext.RunCommand()` for cancellation and timeouts.

## Notable Patterns

1. **Builder/Options Pattern**: `NewExecutor()` accepts functional options, `Options()` applies additional options post-construction
2. **Two-phase initialization**: `NewExecutor()` creates the struct, `Setup()` initializes it
3. **Interface abstraction for swappable behaviors**: `Output` interface, `StatusCheckable`, `SourcesCheckable`
4. **Error aggregation**: Uses `errgroup.Group` for parallel task execution with fail-fast support
5. **Functional options on Reader**: `taskfile.Reader` also uses `ReaderOption` pattern (`taskfile/reader.go:37-40`)

## Tradeoffs

| Aspect | Tradeoff |
|--------|----------|
| Package-level CLI flags | Requires explicit `WithFlags()` call to wire; flags can't be injected for testing without the package import |
| Two-phase init (NewExecutor + Setup) | Setup must be called after construction; forgetting it is a runtime error |
| No interface for Executor | Cannot easily mock the Executor in tests; tests must use real Executor |
| Global flag state | `internal/flags/flags.go` parses into package vars at `init()` time; makes parallel testing of different flag combinations difficult |

## Failure Modes / Edge Cases

1. **Forgetting `Setup()`**: If `e.Setup()` is not called before `e.Run()`, the Executor will have nil Logger, Compiler, and Output fields causing panics
2. **Flag parse order dependencies**: The double-parse in `flags.init()` (`flags.go:92-106`) to handle experiments before full flag parsing is complex and could break if flag definitions change
3. **Context cancellation**: If context is cancelled during `readTaskfile()`, the operation may leave partial state in the Reader's graph
4. **Concurrent access to Executor fields**: Multiple goroutines access `e.Taskfile` and `e.Logger` during parallel task execution; these are protected by locks where necessary but the design relies on single-threaded setup

## Future Considerations

1. **Interface for Executor**: Consider extracting a `TaskRunner` interface to allow mocking in tests
2. **DI container**: A simple container could centralize option-to-dependency mapping, reducing the 20+ `With*` functions
3. **Context in Executor fields**: Instead of passing ctx through method calls, store request-scoped context in Executor

## Questions / Gaps

1. **How are experiments integrated?** The experiment system at `experiments/experiment.go` is parsed early in `flags.init()` with circular dependency handling—can this be simplified?
2. **No evidence found**: No explicit interface for the `Compiler` struct—could it benefit from interface abstraction like `Output`?
3. **Testing strategy**: Without an Executor interface, how are integration tests structured? Evidence suggests heavy use of `WithIO()` option for test IO capture

---

Generated by `03-dependency-injection.md` against `go-task`.