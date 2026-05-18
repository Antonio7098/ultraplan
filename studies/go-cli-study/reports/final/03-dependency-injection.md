# Dependency Injection & Wiring - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Protocol | `03-dependency-injection.md` |
| Groups | go-cli-study, dive, gdu, gh-cli, 03-dependency-injection, mitchellh-cli, opencode, rclone, urfave-cli, yq |
| Date | 2026-05-15 |

## Repositories Studied

| # | Repo | Path | Group |
|---|------|------|-------|
| 1 | age | `/home/antonioborgerees/coding/go-cli-study/repos/age` | go-cli-study |
| 2 | chezmoi | `/home/antonioborgerees/coding/go-cli-study/repos/chezmoi` | go-cli-study |
| 3 | dive | `/home/antonioborgerees/coding/go-cli-study/repos/dive` | dive |
| 4 | fzf | `/home/antonioborgerees/coding/go-cli-study/repos/fzf` | go-cli-study |
| 5 | gdu | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` | gdu |
| 6 | gh-cli | `/home/antonioborgerees/coding/go-cli-study/repos/gh-cli` | gh-cli |
| 7 | go-task | `/home/antonioborgerees/coding/go-cli-study/repos/go-task` | 03-dependency-injection |
| 8 | helm | `/home/antonioborgerees/coding/go-cli-study/repos/helm` | go-cli-study |
| 9 | k9s | `/home/antonioborgerees/coding/go-cli-study/repos/k9s` | 03-dependency-injection |
| 10 | lazygit | `/home/antonioborgerees/coding/go-cli-study/repos/lazygit` | go-cli-study |
| 11 | mitchellh-cli | `/home/antonioborgerees/coding/go-cli-study/repos/mitchellh-cli` | mitchellh-cli |
| 12 | opencode | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` | opencode |
| 13 | rclone | `/home/antonioborgerees/coding/go-cli-study/repos/rclone` | rclone |
| 14 | restic | `/home/antonioborgerees/coding/go-cli-study/repos/restic` | 03-dependency-injection |
| 15 | urfave-cli | `/home/antonioborgerees/coding/go-cli-study/repos/urfave-cli` | urfave-cli |
| 16 | yq | `/home/antonioborgerees/coding/go-cli-study/repos/yq` | yq |

## Executive Summary

This study examined dependency injection patterns across 16 Go CLI projects ranging from focused single-purpose tools (age, yq) to complex multi-subsystem applications (helm, k9s, lazygit). The central question: **How do elite Go CLI projects construct and pass around dependencies, and does it enable testability?**

**Key findings:**

- **Centralized composition roots dominate** (10/16 repos score 7+). Most projects with high scores have a clear `NewApp()`, `NewConfig()`, or `Run()` function that assembles the application.

- **Global state is the primary differentiator** between high and low scores. Even well-designed projects like k9s, opencode, and restic carry 2-3 package-level globals, but projects like rclone (4/10) have globals pervading the architecture.

- **Interface abstraction correlates with testability**. Projects like chezmoi, gh-cli, helm, and lazygit define interfaces for core services (System, Config, Backend) enabling mock substitution. Projects like fzf have no interfaces for core components, limiting unit test isolation.

- **Functional options and factory patterns** are the dominant DI idioms. No project uses a DI framework (wire, fx, dig); all manual composition.

- **context.Context is underused** for DI—only k9s propagates services via context. Most CLIs are synchronous and short-lived, reducing the need for request-scoped DI.

## Core Thesis

Go CLI projects cluster into three DI maturity tiers:

1. **Disciplined (7-8/10)**: Central composition root, explicit wiring, interface abstraction, minimal globals. Examples: chezmoi, gh-cli, helm, k9s, lazygit, opencode, restic.

2. **Pragmatic (6-7/10)**: Central composition root exists but globals leak, or wiring is centralized but interfaces are thin. Examples: age, dive, fzf, gdu, go-task, mitchellh-cli, urfave-cli, yq.

3. **Globals-heavy (4-5/10)**: Architecture built around package-level state. Example: rclone.

The gap between tiers is not code size or complexity—restic (8/10) and rclone (4/10) are both large, mature projects—but architectural discipline around explicit construction and avoidance of package-level mutable state.

## Rating Summary

| Repo | Score | Approach | Main Strength | Main Concern |
|------|-------|----------|---------------|--------------|
| age | 7/10 | Decentralized inline construction | Clean Identity/Recipient interfaces | No centralized composition root |
| chezmoi | 8/10 | Centralized Config composition root | Clear wiring, decorator pattern | Large Config struct, template closures |
| dive | 6/10 | Framework-based (clio) + globals | Event bus decoupling | Global bus/log singletons |
| fzf | 6/10 | Single Run() composition root | Centralized construction | Global sortCriteria, no core interfaces |
| gdu | 8/10 | App struct composition root | Clear DI, mock packages | Global af/configErr, device.Getter singleton |
| gh-cli | 8/10 | Factory pattern with composition root | Consistent factory, lazy resolution | Package-level regex compilation |
| go-task | 7/10 | Functional options + Executor root | Explicit Setup() orchestration | Package-level flag globals |
| helm | 8/10 | Configuration as composition root | Action pattern, pluggable storage | Registry client per-command inconsistency |
| k9s | 8/10 | App composition + context propagation | Explicit root, Factory interface | Context-based propagation, globals |
| lazygit | 8/10 | NewApp composition root | Extensive interfaces, hub pattern | GitCommand constructor complexity |
| mitchellh-cli | 7/10 | Framework library pattern | Factory pattern, UI decorators | No app-level composition root |
| opencode | 8/10 | Centralized app.New() composition | Service interfaces, pub/sub broker | Global config singleton |
| rclone | 4/10 | Hybrid with heavy globals | Context-based config propagation | Global state everywhere |
| restic | 8/10 | Centralized global.Options composition | Clear DI, interface abstraction | Per-command repository opening |
| urfave-cli | 6/10 | Structural Command composition | Function callbacks, context lineage | Global flags, lazy initialization |
| yq | 6/10 | Hybrid with package singletons | Interface definitions at boundary | Global ExpressionParser and log |

## Approach Models

### 1. Centralized Composition Root (10 repos)

The dominant pattern: a single function (`NewApp()`, `newConfig()`, `Main()`) constructs all top-level dependencies and passes them through struct fields or constructor parameters.

**Variants:**

- **Config struct as DI container** (chezmoi, gh-cli): A large struct holds all services, passed to command methods as receiver or parameter. Example: `newConfig()` at `internal/cmd/config.go:362` assembles chezmoi's Config.

- **Executor as root** (go-task): The `Executor` struct holds Logger, Compiler, Output, Taskfile as fields. `Executor.Setup()` orchestrates initialization.

- **App struct as root** (gdu, k9s, lazygit, opencode): A central `App` struct is the composition point. `App` fields hold services; child components receive `*App` or extract services from it.

- **global.Options as root** (restic, helm): A shared `Options` struct carries backend registry, config, and terminal. Passed to each command constructor.

### 2. Framework-Delegated (2 repos)

Projects that delegate composition to a library:

- **dive**: Uses `clio.New()` with `WithInitializers` as composition root (`cmd/dive/cli/cli.go:28-36`). The framework owns initialization.

- **urfave-cli**: The `Command` struct is the root aggregate; the library owns composition but user constructs commands. No app-level composition root.

### 3. Decentralized / Inline (2 repos)

- **age**: Each command (`age`, `age-keygen`, `age-inspect`) independently constructs dependencies inline. No shared composition root.

- **mitchellh-cli**: Framework provides `CommandFactory` pattern; consumer application is responsible for wiring. No composition root within the library.

### 4. Hybrid with Globals (2 repos)

- **rclone**: Centralized init in `initConfig()` but commands call package-level helpers (`cmd.NewFsSrc()`) that access globals (`fs.Cache`, `globalConfig`).

- **yq**: Command layer (`cmd/root.go`) creates command tree, but core services (`ExpressionParser`, `log`) are package-level singletons initialized in `PersistentPreRunE`.

## Pattern Catalog

### Pattern 1: Constructor Injection with Factory Function

**Problem**: How to create service instances with their dependencies without a DI container?

**Solution**: Factory functions (`NewX()`, `NewXyz()`) accept dependencies as parameters and return interface types.

**Examples**:
- `cmdutil.Factory` in gh-cli (`pkg/cmdutil/factory.go:16-43`) holds lazy functions for HttpClient, Config, Prompter
- `action.NewInstall(cfg *Configuration)` in helm (`pkg/action/install.go:162`)
- `watch.NewFactory(a.Conn())` in k9s (`internal/view/app.go:113`)

**When to use**: Default choice for Go DI. Works well when all dependencies are known at construction time.

**When overkill**: Small commands with no shared services; projects where commands are truly independent.

### Pattern 2: Functional Options

**Problem**: How to configure services with many optional dependencies?

**Solution**: `Option` func type with `ApplyToX()` method allows flexible configuration without constructor bloat.

**Examples**:
- `ExecutorOption` interface in go-task (`executor.go:22-24`) with 20+ options (WithDir, WithForce, etc.)
- `Option` func type in gdu (`tui/tui.go:113-114`)
- `ConfigurationOption` in helm (`pkg/action/action.go:148`) for logger, storage override

**When to use**: When a struct has many configuration knobs that users may or may not need. Enables test injection without modifying production code.

**When overkill**: Structs with 3 or fewer dependencies; when all dependencies are required.

### Pattern 3: Context-Based Service Propagation

**Problem**: Deep component hierarchies (TUI) require passing the same service through many constructors.

**Solution**: Store service in `context.WithValue()`, retrieve via `ctx.Value(Key)`.

**Examples**:
- k9s stores `watch.Factory` in context (`internal/view/xray.go:412`) retrieved via `ctx.Value(internal.KeyFactory)` (`internal/dao/ds.go:72`)
- rclone propagates Config, Stats, Logger via context (`fs/config.go:793`, `fs/operations/logger.go:147`)

**When to use**: TUI applications with dynamic, deep view hierarchies; services that need to be accessible from many call sites.

**When overkill**: Shallow hierarchies; services used by only 2-3 components; when compile-time verification matters.

### Pattern 4: Interface Abstraction for Core Services

**Problem**: How to enable testing and decoration without coupling to concrete implementations?

**Solution**: Define interfaces for core services (Storage, Backend, Config, UI) in domain packages.

**Examples**:
- `chezmoi.System` (`internal/chezmoi/system.go:25`), `chezmoi.Encryption` (`internal/chezmoi/encryption.go:4`)
- `gh.Config` (`internal/gh/gh.go:32-80`), `gh.AuthConfig` (`internal/gh/gh.go:105-171`)
- `restic.Backend` (`internal/backend/backend.go:19-90`), `restic.Repository` (`internal/restic/repository.go:18-66`)
- `k9s.dao.Factory` (`internal/dao/types.go:22-46`)

**When to use**: Core services with multiple implementations; services that need decoration (debug, logging); when testing requires mock substitution.

**When overkill**: Transient utilities; services with only one implementation; when interface fidelity is low (large interfaces).

### Pattern 5: Decorator Pattern for Cross-Cutting Concerns

**Problem**: How to add logging, retry, metrics without modifying core logic?

**Solution**: Wrap implementations in decorator structs that implement the same interface.

**Examples**:
- chezmoi's `DebugSystem`, `DebugEncryption` (`config.go:2314-2316`, `config.go:2880-2882`)
- helm's backend wrapper chain: sema → logger → retry (`internal/global/global.go:592-627`)
- mitchellh-cli's `ConcurrentUi`, `ColoredUi`, `PrefixedUi` (`ui_concurrent.go`, `ui_colored.go`)
- dive's adapter pattern for resolver, analyzer, exporter (`cmd/dive/cli/internal/command/adapter/resolver.go:17-21`)

**When to use**: Debug/verbose modes; retry logic; metrics collection; any orthogonal concern that should not appear in business logic.

**When overkill**: Simple wrappers; when decorator chains become complex; when the same decorator is used everywhere.

### Pattern 6: Hub Pattern for Sub-Command Composition

**Problem**: Large command systems (git, OS operations) have many sub-commands sharing common infrastructure.

**Solution**: A hub struct composes all sub-command objects, constructed once and passed around.

**Examples**:
- lazygit's `GitCommand` (`pkg/commands/git.go:17-44`) composing 20+ sub-commands via `NewGitCommandAux` (`pkg/commands/git.go:85-175`)
- gh-cli's command tree wired from `root.NewCmdRoot()` (`pkg/cmd/root/root.go`)

**When to use**: Domain areas with many related operations; when sub-commands share config, connections, or state.

**When overkill**: Commands that don't share infrastructure; when sub-command count is small (<5).

### Pattern 7: Lazy Initialization for Expensive Resources

**Problem**: Startup time matters; not all resources are needed on every invocation.

**Solution**: Represent dependencies as functions returning values, or use `sync.Once` for lazy singletons.

**Examples**:
- gh-cli's factory fields are `func() (T, error)` for HttpClient, BaseRepo, Remotes (`pkg/cmd/factory/default.go:26-46`)
- k9s's `watch.Factory` is lazily created via `watch.NewFactory(a.Conn())` (`internal/view/app.go:113`)
- yq's `ExpressionParser` lazily initialized via `InitExpressionParser()` (`pkg/yqlib/lib.go:15-19`)

**When to use**: Resources that are expensive to create (HTTP clients, database connections, Kubernetes clients); commands that may not need certain services (e.g., `version` command).

**When overkill**: Cheap resources; when lazy initialization obscures error handling; when tests need deterministic initialization.

### Pattern 8: Two-Phase Initialization (Constructor + Setup)

**Problem**: Some dependencies need to be created before configuration is fully loaded.

**Solution**: Separate object creation (`NewX()`) from initialization (`x.Setup()`), allowing configuration to be modified between phases.

**Examples**:
- go-task's `NewExecutor()` creates struct, `Executor.Setup()` initializes (`executor.go:93-114`, `setup.go:26-54`)
- k9s's `NewApp(cfg)` + `App.Init()` (`internal/view/app.go:62`, `app.go:95-144`)
- opencode's `app.New()` + async LSP initialization (`internal/app/app.go:42-81`, `app.go:59-60`)

**When to use**: Async initialization; when configuration must be finalized after object creation; when initialization may fail and needs explicit error handling.

**When overkill**: Simple synchronous initialization; when Setup() is always called immediately after New.

## Key Differences

### Composition Root Location

| Location | Repos | Implication |
|----------|-------|-------------|
| `main()` direct | gdu, helm, restic | Composition happens in entry point; easiest to trace |
| Dedicated `NewApp()` / `NewConfig()` | chezmoi, lazygit, opencode | Clear separation of construction from logic |
| Framework method | dive (clio), urfave-cli | Composition delegated; harder to see full graph |
| Per-command inline | age, mitchellh-cli | No shared composition; each command owns wiring |
| Package-level globals | rclone, yq | Hidden composition; state drives behavior |

### Global State Spectrum

**Minimal globals (score 8+)**: chezmoi, gdu (partial), gh-cli (partial), helm (justified), k9s (justified), lazygit, opencode (justified), restic

**Moderate globals (score 6-7)**: age (test hooks), dive (bus/log), fzf (sortCriteria, ttyin), go-task (flags), mitchellh-cli (none), urfave-cli (flags, exiter), yq (parser, log)

**Heavy globals (score 4-5)**: rclone (globalConfig, cache, registry, stats, function pointers)

### Interface Usage Intensity

**High interface count** (>5 interfaces for core services):
- chezmoi: System, Encryption, SystemViewer, PersistentState,...
- gh-cli: Config, AuthConfig, Prompter, Browser, GitClient
- helm: Configuration, Storage, Backend, KubeClient, RESTClientGetter
- lazygit: AppConfigurer, IGuiCommon, IController, IRepoStateAccessor,...

**Low interface count** (<3 interfaces for core):
- fzf: only TUI layer has interfaces (Renderer, Window); core matching has none
- rclone: context-based config but no interface abstraction for services
- yq: Decoder, Printer, Evaluator, Encoder at library boundary but not internally

### Test Hook Mechanisms

| Mechanism | Repos |
|-----------|-------|
| Package-level var for testing | age (testOnlyConfigureScryptIdentity), go-task (flags.init), helm (Timestamper) |
| Functional options for test IO | go-task (WithIO option), gh-cli (runF injection) |
| Mock packages | gdu (testdev, testapp, testdir), gh-cli (moq-generated) |
| Integration test interface | lazygit (IntegrationTest interface at `pkg/integration/types/types.go:13`) |
| Fake implementations | helm (in-memory driver), dive (clio test helpers) |

## Tradeoffs

### Centralized vs Decentralized Wiring

| Aspect | Centralized | Decentralized |
|--------|-------------|---------------|
| Consistency | All deps follow same pattern | Different commands may use different patterns |
| Traceability | Single place to see full graph | Must understand each command independently |
| Coupling | Commands couple to composition root | Commands are more isolated |
| Scaling | Grows with app complexity | Simple for small tools |
| Examples | chezmoi, gh-cli, helm, k9s | age, mitchellh-cli |

**Verdict**: Centralized wiring wins for maintainability. Even small projects (age at 7/10) show that decentralized wiring is acceptable only when commands are truly independent and simple.

### Interface vs Concrete Type Injection

| Aspect | Interface Injection | Concrete Type Injection |
|--------|---------------------|------------------------|
| Flexibility | High — can substitute implementations | Low — coupled to concrete type |
| Testability | High — easy to mock | Lower — requires test doubles |
| Compile-time safety | Lower — interfaces are implicit contracts | Higher — concrete types verified at compile |
| Discovery | Interface defines contract clearly | Must examine constructor to understand deps |
| Examples | chezmoi, gh-cli, helm, lazygit | age, rclone (partially), yq (partially) |

**Verdict**: Interface injection is worth the extra definition effort for core services. For leaf utilities (file utils, string helpers), concrete types are acceptable.

### Context-Based vs Constructor-Based Propagation

| Aspect | Context Propagation | Constructor Injection |
|--------|---------------------|------------------------|
| Ergonomics | Good for deep hierarchies | Verbose for deep hierarchies |
| Traceability | Implicit — must find context stores | Explicit — dependencies visible in signatures |
| Compile-time safety | None — runtime only | Full — compiler verifies |
| Lifecycle | Context-aware | Struct field lifetime |
| Examples | k9s (factory propagation), rclone (config/stats) | chezmoi, gh-cli, helm, lazygit |

**Verdict**: Constructor injection is preferred for explicit wiring. Context propagation is acceptable for TUI hierarchies where the same service (factory, app) needs to be accessible from many call sites, but it trades type safety for ergonomics.

### Global State Usage

| Pattern | Benefit | Cost | Acceptable? |
|---------|---------|------|-------------|
| Test hooks (`testOnly*`, `Timestamper`) | Enables deterministic testing | Modifies behavior globally | Yes, if narrowly scoped |
| Build-time vars (`Version`, `Date`) | Link-time injection | Not testable at runtime | Yes, immutable |
| Platform singletons (`device.Getter`) | Simplifies platform-specific code | Hard to substitute in tests | Acceptable if justified |
| Config singletons (`cfg *Config`) | Simple access | Hidden dependency, pollutes namespace | No |
| Service singletons (`bus`, `log`) | Global availability | Implicit coupling, test contamination | No |

## Decision Guide

### Choosing a Composition Root Strategy

**Start here**: Do you have a clear place where the application is assembled?

1. **Yes — single binary with multiple commands**: Use a centralized composition root (`NewApp()`, `newConfig()`, or `Main()` wiring). Example: chezmoi, gdu, helm.

2. **Yes — library consumed by other apps**: Provide factory functions and interface abstractions. The consumer is responsible for composition. Example: mitchellh-cli, urfave-cli.

3. **No — commands are independent**: Decentralized wiring is acceptable if commands don't share state. Example: age.

4. **No — using a framework**: Delegate composition to the framework's composition point. Example: dive (clio), urfave-cli.

### Choosing an Injection Mechanism

**Default**: Constructor injection with factory functions.

**When you have many optional parameters**: Add functional options (`Option` func type).

**When you have deep hierarchies (TUI)**: Consider context-based propagation for a few key services (factory, app), but use constructor injection for everything else.

**When you have expensive resources**: Use lazy initialization (func fields or sync.Once), but make the lazy aspect explicit.

### Avoiding Global State

**Test hooks**: Use package-level vars with `testOnly` naming prefix. Keep them mutable but scoped.

**Build info**: Use link-time vars (`-X` flag) for version, date. These are effectively immutable.

**Platform singletons**: If you need platform-specific implementations, define a package-level var but provide a way to override it in tests (e.g., `device.Getter = mockGetter`).

**Config singletons**: Avoid. Pass config as a parameter or store in a struct that is explicitly constructed and passed.

**Service singletons (bus, log)**: Avoid. Pass these as constructor parameters or store in a central struct.

## Practical Tips

### For New CLI Projects

1. **Define a composition root early**. Even if your CLI is simple, have a `NewApp()` or `runE()` that constructs dependencies. This makes the architecture traceable.

2. **Use interfaces for core services**. Identify 3-5 services that have multiple implementations or need decoration (Config, Storage, UI, Logger, HTTP Client). Define interfaces in domain packages, not at consumer side.

3. **Pass dependencies, don't access globals**. If a function needs a config, receive it as a parameter. If a function needs a logger, receive it as a parameter.

4. **Use functional options for configuration**. When a struct has many fields with defaults, use `Option` func types to allow selective override without constructor bloat.

5. **Isolate test hooks**. Package-level vars for testing should be clearly named (`testOnly*`) and documented.

### For Existing Projects with Globals

1. **Audit globals by purpose**. Categorize: (a) test hooks, (b) build-time injection, (c) justified singletons, (d) hidden dependencies.

2. **Eliminate category (d) first**. These are the globals that make testing hard. Introduce a composition root and pass dependencies explicitly.

3. **Justify category (c) with comments**. If a global is a justified singleton (e.g., platform-specific device getter), document why and provide a setter for testing.

4. **Consider extract interfaces**. If a global implements an interface, extracting the interface enables mock substitution.

### For Framework/Library Authors

1. **Make the composition point visible**. If your library has an opinionated way to assemble applications, document it clearly.

2. **Provide test hooks**. Package-level vars that can be overridden for testing (like `OsExiter` in urfave-cli) are valuable even if they violate strict DI principles.

3. **Design for composition**. Don't bake global state into library types; let consumers inject what they need.

## Anti-Patterns / Caution Signs

### Hidden Dependency on Initialization Order

**Symptom**: Code fails if `init()` functions run in wrong order.

**Example**: rclone's backend registry (`fs/registry.go`) relies on `init()` registration. Tests may fail if run in wrong order.

**Mitigation**: Avoid `init()` for registration that has side effects. Use explicit registration in composition root instead.

### Global Config That Can't Be Overridden

**Symptom**: Tests can't run with different configurations because config is a package-level global.

**Example**: yq's `ConfiguredYamlPreferences` mutated by flags (`cmd/root.go:121`). Two tests in same process can't use different configurations.

**Mitigation**: Pass config as a parameter or use a `Config` struct that can be instantiated per-test.

### Singleton Cache Pollution

**Symptom**: Tests share state because caches are singletons.

**Example**: rclone's `fs.Cache` (`fs/cache/cache.go:16-21`) persists across tests, causing stale filesystem references.

**Mitigation**: Provide factory functions that create fresh instances, or add `Reset()` methods for testing.

### Implicit Initialization in `Run()`

**Symptom**: Defaults are applied inside `Run()` method, not during construction.

**Example**: urfave-cli's `setupDefaults()` (`command_setup.go:11`) called on first `Run()`, not during `Command` construction.

**Mitigation**: Separate construction from initialization. Have a `Build()` or `Setup()` step that is explicitly called.

### Context Shadowing

**Symptom**: `GetConfig(nil)` returns global config instead of error.

**Example**: rclone's `GetConfig(ctx)` falls back to globalConfig when ctx is nil (`fs/config.go:793`). This masks configuration errors.

**Mitigation**: Don't provide fallback to global when context is nil; require explicit context.

## Notable Absences

### No DI Frameworks

None of the 16 repos use wire, fx, dig, or similar DI frameworks. All manual composition. This aligns with Go idiom preferring explicit construction over reflection-based injection.

### No Request-Scoped DI via context.Context

Only k9s uses `context.WithValue` for service propagation. Others use context for cancellation/deadline only. This is appropriate since most CLIs are short-lived and synchronous.

### No Constructor Factory Interfaces

Most repos use plain function types (`func() (T, error)`) for lazy initialization, not interface types like `Factory`. This is simpler and sufficient.

### No Structured Error Types for DI Failures

Error handling in composition is ad-hoc. No repo defines specific error types for DI failures (e.g., "missing required dependency X").

## Per-Repo Notes

| Repo | Key DI Insight |
|------|---------------|
| age | Decentralized wiring is acceptable for focused tools; interface abstraction (Identity/Recipient) enables testability |
| chezmoi | Large Config struct is a smell; consider extracting DI container vs. command runner |
| dive | clio framework provides composition but surrenders control; global bus/log are the price |
| fzf | 640-line Run() is hard to test; extract inline closures to named factories |
| gdu | Mock packages under `internal/` are excellent for testability; device.Getter singleton is minor |
| gh-cli | Factory pattern with lazy funcs is excellent; SmartBaseRepoFunc vs BaseRepoFunc split is complexity cost |
| go-task | Functional options pattern is clean; package-level flags need explicit `WithFlags()` call |
| helm | Action pattern (NewInstall, NewUpgrade) is excellent; registry client per-install inconsistency is technical debt |
| k9s | Context propagation trades type safety for ergonomics; globals (ImgScanner, MxRecorder) are technical debt |
| lazygit | Hub pattern for GitCommand is powerful; heavy struct embedding makes dependency tracing harder |
| mitchellh-cli | Framework delegates composition to consumer; factory pattern enables test substitution |
| opencode | Service interfaces with Broker[T] pub/sub is elegant; global config singleton is technical debt |
| rclone | Global state pervades architecture; context-based config is half-measure that falls short of true DI |
| restic | global.Options as composition root is clean; per-command repository opening could cause auth repetition |
| urfave-cli | Global flags (HelpFlag, VersionFlag) are significant testability cost; lazy setupDefaults is implicit |
| yq | Global ExpressionParser and log undermine otherwise clean interface definitions |

## Open Questions

1. **Is the large `Config` struct an anti-pattern?** chezmoi's Config has ~300 lines of field declarations. This centralized container makes dependencies traceable but creates coupling. Is there a better way to group services without a mega-struct?

2. **When is context-based propagation justified?** k9s uses context for factory propagation, trading type safety for ergonomics. Is this appropriate for TUIs, or would constructor injection with a common `*App` receiver be better?

3. **How to test hub-pattern structs?** lazygit's `GitCommand` with 20+ sub-commands is constructed in one place but the constructor is 90+ lines. What's the best way to test such a hub without constructing the full thing?

4. **Should CLIs use DI containers?** All 16 repos use manual DI. Would a lightweight container (like `wire`) help or add unnecessary complexity for CLI-scale projects?

5. **How to migrate from globals to explicit DI?** Projects like rclone have globals deeply embedded. Is there a gradual migration path, or must it be a big-bang refactor?

## Evidence Index

### age
- `Identity` interface: `age.go:65-73`
- `Recipient` interface: `age.go:82-86`
- Scrypt recipient constructor: `cmd/age/age.go:401`
- X25519 identity generation: `cmd/age-keygen/keygen.go:140-146`
- Test hook: `cmd/age/age.go:409`
- stdinInUse global: `cmd/age/age.go:72`

### chezmoi
- newConfig composition root: `internal/cmd/config.go:362`
- Config struct DI container: `internal/cmd/config.go:193-291`
- System interface: `internal/chezmoi/system.go:25`
- Encryption interface: `internal/chezmoi/encryption.go:4`
- DebugSystem decorator: `config.go:2314-2316`
- DebugEncryption decorator: `config.go:2880-2882`

### dive
- Global bus singleton: `internal/bus/bus.go:5`
- Global log singleton: `internal/log/log.go:9`
- clio initializer: `cmd/dive/cli/cli.go:28-36`
- Resolver interface: `dive/image/resolver.go:5-10`
- GetImageResolver factory: `dive/get_image_resolver.go:62-72`

### fzf
- Run() composition root: `src/core.go:54`
- EventBox: `src/util/eventbox.go:12`
- NewTerminal: `src/terminal.go:948`
- NewReader: `src/reader.go:36`
- NewMatcher: `src/matcher.go:59`
- sortCriteria global: `src/result.go:121`

### gdu
- App composition root: `cmd/gdu/main.go:269-278`
- DevicesInfoGetter interface: `pkg/device/dev.go:20-23`
- Analyzer interface: `internal/common/analyze.go:25-35`
- UI interface: `cmd/gdu/app/app.go:31-49`
- createUI factory: `cmd/gdu/app/app.go:360-431`
- Global af: `cmd/gdu/main.go:27-30`

### gh-cli
- ghcmd.Main composition root: `internal/ghcmd/cmd.go:52-132`
- factory.New wiring: `pkg/cmd/factory/default.go:26-46`
- cmdutil.Factory struct: `pkg/cmdutil/factory.go:16-43`
- Config interface: `internal/gh/gh.go:32-80`
- Prompter interface: `internal/prompter/prompter.go:17-53`
- SmartBaseRepoFunc: `pkg/cmd/root/root.go:162-177`

### go-task
- Executor composition root: `executor.go:93-114`
- ExecutorOption interface: `executor.go:22-24`
- Executor.Setup: `setup.go:26-54`
- Output interface: `internal/output/output.go:12-14`
- BuildFor factory: `internal/output/output.go:19-40`
- Package-level flags: `internal/flags/flags.go:46-90`

### helm
- NewRootCmd composition: `pkg/cmd/root.go:106`
- action.NewConfiguration: `pkg/action/action.go:118-146`
- actionConfig.Init: `pkg/action/action.go:664-719`
- EnvSettings construction: `pkg/cli/environment.go:97-149`
- Registry client injection: `pkg/cmd/root.go:260-264`
- Timestamper global: `pkg/action/action.go:63`

### k9s
- App composition root: `cmd/root.go:76-128`
- view.NewApp: `internal/view/app.go:62`
- watch.Factory: `internal/watch/factory.go:29-35`
- dao.Factory interface: `internal/dao/types.go:22-46`
- Context factory propagation: `internal/view/xray.go:412`
- ImgScanner global: `internal/vul/scanner.go:34`
- MxRecorder global: `internal/dao/recorder.go:21`

### lazygit
- NewApp composition: `pkg/app/app.go:95`
- AppConfigurer interface: `pkg/config/app_config.go:37-54`
- IGuiCommon interface: `pkg/gui/types/common.go:26`
- IController interface: `pkg/gui/types/context.go:271`
- NewGitCommand: `pkg/commands/git.go:58-83`
- NewGitCommandAux: `pkg/commands/git.go:85-175`

### mitchellh-cli
- CommandFactory type: `command.go:64-67`
- Command interface: `command.go:14-31`
- CLI struct: `cli.go:70`
- Ui interface: `ui.go:19-43`
- MockUi: `ui_mock.go:27-33`
- ConcurrentUi decorator: `ui_concurrent.go:9-12`

### opencode
- app.New composition root: `internal/app/app.go:42-81`
- Service interface: `internal/session/session.go:25-34`
- Broker[T] pub/sub: `internal/pubsub/broker.go:10-16`
- CoderAgentTools: `internal/llm/agent/tools.go:14-41`
- globalManager theme: `internal/tui/theme/manager.go:23`
- cfg global: `internal/config/config.go:123`

### rclone
- Global config: `fs/config.go:14-51`
- GetConfig fallback: `fs/config.go:793`
- Cache singleton: `fs/cache/cache.go:16-21`
- Backend registry: `fs/registry.go:22`
- RC options global: `fs/rc/rc.go:124`
- NewFsSrc helper: `cmd/cmd.go:85-176`

### restic
- global.Options assembly: `cmd/restic/main.go:181-183`
- newRootCommand: `cmd/restic/main.go:37`
- OpenRepository: `internal/global/global.go:301-338`
- Repository interface: `internal/restic/repository.go:18-66`
- Backend interface: `internal/backend/backend.go:19-90`
- wrapBackend chain: `internal/global/global.go:592-627`

### urfave-cli
- Command struct: `command.go:23-166`
- Reader/Writer fields: `command.go:83-87`
- Global HelpFlag: `flag.go:39`
- Global OsExiter: `errors.go:11`
- setupDefaults: `command_setup.go:11`
- Command.Lineage: `command.go:549-557`

### yq
- New() factory: `cmd/root.go:40`
- ExpressionParser singleton: `pkg/yqlib/lib.go:13`
- Logger singleton: `pkg/yqlib/lib.go:21`
- Decoder interface: `pkg/yqlib/decoder.go:7-10`
- Printer interface: `pkg/yqlib/printer.go:12-18`
- StreamEvaluator interface: `pkg/yqlib/stream_evaluator.go:14-18`
- PersistentPreRunE init: `cmd/root.go:69-88`

---

Generated by protocol `03-dependency-injection.md`.