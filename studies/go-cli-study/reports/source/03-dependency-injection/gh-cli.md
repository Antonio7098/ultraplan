# Repo Analysis: gh-cli

## Dependency Injection & Wiring

### Repo Info

| Field | Value |
|-------|-------|
| Name | gh-cli |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/gh-cli` |
| Group | `gh-cli` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

gh-cli employs a centralized composition root in `internal/ghcmd/cmd.go:Main()` where all application dependencies are constructed and then wired into a `*cmdutil.Factory` that serves as the dependency provider for all commands. Commands receive the factory and extract their specific dependencies from it. The design uses interface abstraction for testability and avoids global state except for a small number of intentionally module-level variables.

## Rating

**8/10** — Clear composition root with explicit wiring. The factory pattern is consistently applied and enables testability. Minor扣分 for some package-level state that could be better scoped.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Composition root | `ghcmd.Main()` constructs config, IOStreams, telemetry, and factory | `internal/ghcmd/cmd.go:52-132` |
| Factory initialization | `factory.New()` wires all dependencies into `*cmdutil.Factory` | `pkg/cmd/factory/default.go:26-46` |
| Factory struct | `cmdutil.Factory` holds all dependencies as fields or lazy functions | `pkg/cmdutil/factory.go:16-43` |
| Command wiring | Commands receive `*cmdutil.Factory` and extract dependencies | `pkg/cmd/issue/list/list.go:47-54` |
| Interface abstraction | `gh.Config` interface defines config contract | `internal/gh/gh.go:32-80` |
| Auth abstraction | `gh.AuthConfig` interface for authentication | `internal/gh/gh.go:105-171` |
| Prompter interface | `prompter.Prompter` interface with mock generated | `internal/prompter/prompter.go:17-53` |
| Browser abstraction | `browser.Browser` interface | `pkg/cmdutil/factory.go:21` |
| Git client | `*git.Client` struct with interface for testing | `git/client.go:52-62` |
| HTTP client | HTTP client created lazily via factory function | `pkg/cmd/factory/default.go:187-208` |
| Remotes resolution | Lazy function for remote resolution | `pkg/cmd/factory/default.go:177-185` |
| BaseRepo resolution | Lazy function for base repo resolution | `pkg/cmd/factory/default.go:73-81` |

## Answers to Protocol Questions

### 1. Where are dependencies constructed?

**Centralized in `internal/ghcmd/cmd.go:Main()`** (lines 52-132):

- `config.NewConfig()` creates the configuration at line 57
- `newIOStreams(cfg)` creates IOStreams at lines 63-68
- `telemetry.NewService()` or `&telemetry.NoOpService{}` created at lines 86-129
- `factory.New()` at line 132 wires everything together
- `root.NewCmdRoot()` at line 175 builds the command tree with the factory

The `pkg/cmd/factory/default.go:26-46` shows the factory constructing:
- `HttpClient` via `HttpClientFunc()`
- `PlainHttpClient` via `plainHttpClientFunc()`
- `GitClient` via `newGitClient()`
- `Remotes` via `remotesFunc()`
- `BaseRepo` via `BaseRepoFunc()`
- `Prompter` via `newPrompter()`
- `Browser` via `newBrowser()`
- `ExtensionManager` via `extensionManager()`
- `Branch` via `branchFunc()`

### 2. How are services passed around?

**Through the `*cmdutil.Factory` struct** (`pkg/cmdutil/factory.go:16-43`):

- Commands receive `*cmdutil.Factory` as the first argument in their constructor (`NewCmdFoo(f *cmdutil.Factory, ...)`)
- Commands extract specific dependencies: `f.IOStreams`, `f.HttpClient`, `f.Config`, `f.BaseRepo`, `f.Browser`, `f.Prompter`
- Example from `pkg/cmd/issue/list/list.go:47-54`:
  ```go
  opts := &ListOptions{
      IO:         f.IOStreams,
      HttpClient: f.HttpClient,
      Config:     f.Config,
      Browser:    f.Browser,
  }
  ```

### 3. Is wiring centralized?

**Yes** — the composition root is clearly in `internal/ghcmd/cmd.go:Main()`:

1. Config creation (line 57)
2. IOStreams creation (lines 63-68)
3. Telemetry service creation (lines 85-129)
4. Factory creation at line 132
5. Root command creation at line 175

Each command subtree is then registered in `pkg/cmd/root/root.go` with the factory passed to constructors.

### 4. Are globals avoided?

**Mostly yes, with some exceptions**:

**Well-scoped:**
- `cmdutil.Factory` is passed explicitly, not accessed globally
- No global service locator pattern
- Interfaces like `gh.Config` abstract the source of configuration

**Exceptions (minor):**
- `pkg/cmd/factory/default.go:23-24`: `var ssoHeader string` and `var ssoURLRE = regexp.MustCompile(...)` are package-level variables in the factory package
- `utils/utils.go:31`: `var TerminalSize = func(...)` — a function variable for testability
- `internal/build/build.go:9-12`: `var Version = "DEV"` and `var Date = ""` — build-time injection
- `git/client.go:26`: `var remoteRE = regexp.MustCompile(...)` — compiled regex at package level

These are intentional design choices for special cases (regex compilation caching, build info, test hooks) and not hidden dependencies that undermine testability.

### 5. Is initialization explicit?

**Yes** — the initialization flow is traceable:

1. `cmd/gh/main.go:10` calls `ghcmd.Main()`
2. `internal/ghcmd/cmd.go:52-132` explicitly constructs each dependency
3. `pkg/cmd/factory/default.go:26-46` shows the `factory.New()` clearly wiring dependencies
4. Each command's `NewCmdFoo()` function explicitly receives and uses the factory

The `Config` is intentionally a function `func() (gh.Config, error)` rather than a concrete value to handle initialization errors gracefully (`pkg/cmdutil/factory.go:36` comment explains this).

## Architectural Decisions

### Composition Root Location
The `Main()` function in `internal/ghcmd/cmd.go` serves as the composition root. This is a strong architectural choice that makes the application's dependency graph visible and explicit. Any developer can read this file to understand how the application is assembled.

### Factory as DI Container
The `cmdutil.Factory` struct acts as a lightweight DI container, but unlike heavy frameworks, it simply holds references to concrete types and functions that create them. This avoids the complexity of reflection-based DI while maintaining testability.

### Lazy Resolution for Expensive Operations
Dependencies like `BaseRepo`, `Remotes`, `Branch`, and `HttpClient` are represented as functions (`func() (T, error)`) rather than values. This defers expensive operations (git remote resolution, HTTP client creation) until they are actually needed, and allows commands to work without a git repository (e.g., `gh version`).

### Interface Definition in Domain Package
Interfaces like `gh.Config`, `gh.AuthConfig`, `prompter.Prompter`, and `browser.Browser` are defined in domain-specific packages rather than at the consumer side. This follows Interface Segregation Principle and enables interface replacement without modifying the consuming code.

### Options Struct Pattern
Commands use an `Options` struct (e.g., `ListOptions` in `pkg/cmd/issue/list/list.go`) that receives dependencies at construction time and is passed to the run function. This separates command construction from command execution, improving testability.

## Notable Patterns

### Constructor with Run Function Injection
Commands like `NewCmdList(f *cmdutil.Factory, runF func(*ListOptions) error)` accept an optional `runF` function for test injection (`pkg/cmd/issue/list/list.go:47`). This is the primary test hook.

### Command Group Factory Override
In `pkg/cmd/root/root.go:162-177`, certain commands receive a modified factory with `SmartBaseRepoFunc` instead of `BaseRepoFunc`:
```go
repoResolvingCmdFactory := *f
repoResolvingCmdFactory.BaseRepo = factory.SmartBaseRepoFunc(f)
```
This allows intelligent repo resolution for commands like `pr`, `issue`, `repo` while keeping simpler resolution for others.

### Mock Generation
Interfaces are annotated with `//go:generate moq -rm -out prompter_mock.go . Prompter` (`internal/prompter/prompter.go:16`) and `//go:generate moq -rm -pkg ghmock -out mock/config.go . Config` (`internal/gh/gh.go:31`) enabling test mocks.

### HTTP Client Variation
Two HTTP clients are provided: `HttpClient` (with auth headers) and `PlainHttpClient` (without automatic auth) for situations where the command needs to set its own headers (`pkg/cmdutil/factory.go:37-41`, `pkg/cmd/factory/default.go:187-227`).

## Tradeoffs

### Lazy Config Loading
The `Config` is a function that can return errors, allowing `gh version` to work without authentication. However, this means every command that uses config must handle the error, leading to repeated error handling code.

### Factory Function Fields
Using `func() (T, error)` for dependencies like `HttpClient` and `Remotes` is flexible but means error handling is deferred to call site. A more opinionated approach would catch these errors at construction time.

### Package-Level Regex Compilation
`remoteRE` and `commitLogRE` in `git/client.go` are compiled at package init time. While this is efficient, it means regex compilation happens even if those code paths are never executed. This is a minor performance trade-off for code simplicity.

### SmartBaseRepo vs BaseRepo
Two different repo resolution strategies exist (`BaseRepoFunc` and `SmartBaseRepoFunc`) based on whether the command needs API-based resolution. This creates two classes of commands but adds complexity to the root command wiring.

## Failure Modes / Edge Cases

### Config Loading Failure
If `config.NewConfig()` fails in `internal/ghcmd/cmd.go:57`, the application creates a fallback IOStreams and continues with `cfgErr` stored. This allows commands to run with degraded functionality, but the error handling path is complex.

### Branch Detection Without Git Directory
`branchFunc()` in `pkg/cmd/factory/default.go:251-258` returns an error if not in a git directory. Commands that depend on branch information will fail with a less helpful error if run outside a git repo.

### Authentication Check
Most commands require authentication via `PersistentPreRunE` in `pkg/cmd/root/root.go:82-95`. This check happens at the command level, but the error message suggests running `gh auth login` even for commands that might not need authentication.

### Extension Command Conflicts
In `pkg/cmd/root/root.go:192-203`, extensions are registered after core commands, so extensions can override built-in commands. This could cause confusion when debugging behavior differences.

## Future Considerations

### Context Propagation
No evidence of `context.Context` being used for request-scoped dependency injection. All dependencies flow through the factory struct. If concurrent command execution were needed, context-based DI would need to be introduced.

### Structured Error Types
While `cmdutil` has specific error types (`SilentError`, `CancelError`, `PendingError`), the error handling in `ghcmd.Main()` is complex with multiple type assertions (`internal/ghcmd/cmd.go:195-247`). A unified error handling approach might simplify this.

### Factory Interface
Currently `*cmdutil.Factory` is concrete. An interface for the factory could enable better testing of command composition without requiring all factory methods.

## Questions / Gaps

### No evidence found for context-scoped DI
The codebase does not use `context.Context` for request-scoped values. All dependencies are long-lived and attached to the factory struct. If gh ever needs to support concurrent requests or cancellation, this would need architectural changes.

### Limited information on extension DI
Extensions are loaded from the extension manager and added to the command tree, but it's unclear how extensions would access the factory. This is likely by design (extensions run as separate processes via `gh extension`).

### Prompter initialization order
The prompter is created in `factory.New()` using `newPrompter()` which calls `cmdutil.DetermineEditor()`. If editor detection is expensive, this could be a startup performance concern.

---
*Rating scale: 1-3 globals everywhere, hidden dependencies; 4-6 some injection but inconsistent; 7-8 clear composition root and explicit wiring; 9-10 extremely testable and disciplined dependency flow*

Generated by `study-areas/03-dependency-injection.md` against `gh-cli`.