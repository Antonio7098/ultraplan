# Repo Analysis: helm

## Dependency Injection & Wiring

### Repo Info

| Field | Value |
|-------|-------|
| Name | helm |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/helm` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Helm uses a centralized composition root pattern with `action.Configuration` as the shared dependency container. Wiring is explicit and hierarchical: the root command creates the `Configuration` once, then passes it to subcommands that construct their own action structs referencing it. Environment settings (`EnvSettings`) are constructed per-command from environment variables but are passed explicitly, not accessed via globals. The pattern achieves good testability with fake clients and in-memory storage drivers.

## Rating

**8/10** — Clear composition root with explicit wiring. Dependencies flow downward from `Configuration` into action structs. Testability is excellent via dependency injection on `Configuration`. Minor扣分: some commands create their own registry clients inline rather than receiving them through `Configuration`.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Composition root | `NewRootCmd` creates `action.NewConfiguration()` | `pkg/cmd/root.go:106` |
| Composition root | `actionConfig.Init()` initializes storage, kube client | `pkg/action/action.go:664-719` |
| Configuration struct | Holds `RESTClientGetter`, `Releases`, `KubeClient`, `RegistryClient` | `pkg/action/action.go:118-146` |
| EnvSettings construction | `cli.New()` reads env vars to create `EnvSettings` | `pkg/cli/environment.go:97-149` |
| Command wiring | `newInstallCmd(cfg *action.Configuration, ...)` receives config | `pkg/cmd/install.go:132` |
| Action constructor | `NewInstall(cfg *Configuration)` stores config reference | `pkg/action/install.go:162-173` |
| Registry client injection | `actionConfig.RegistryClient` set from `newDefaultRegistryClient()` | `pkg/cmd/root.go:260-264` |
| Storage driver abstraction | `storage.Init(d driver.Driver)` accepts pluggable drivers | `pkg/storage/storage.go:333-351` |
| Kube client interface | `kube.Interface` defines `Get`, `Create`, `Delete`, `Update` | `pkg/kube/interface.go:28-78` |
| RESTClientGetter interface | `RESTClientGetter` interface for kubernetes config | `pkg/action/action.go:524-529` |
| Test fixture | `actionConfigFixture()` creates in-memory config for tests | `pkg/action/action_test.go:47-71` |
| Global var | `kube.ManagedFieldsManager` set in `main()` | `pkg/kube/client.go:71` |
| Global var | `Timestamper` variable for test overrides | `pkg/action/action.go:63` |

## Answers to Protocol Questions

### 1. Where are dependencies constructed?

**Primary composition root**: `pkg/cmd/root.go:105-122` (`NewRootCmd`) creates `action.NewConfiguration()` and `settings = cli.New()`.

**Secondary initialization**: `cobra.OnInitialize` callbacks at `pkg/cmd/root.go:111-120` call `actionConfig.Init(settings.RESTClientGetter(), settings.Namespace(), helmDriver)` to wire the storage driver, Kubernetes client, and release storage.

**Per-command construction**: Individual commands like `newInstallCmd` (`pkg/cmd/install.go:132`) construct action instances via `action.NewInstall(cfg)` which embeds a reference to the shared `Configuration`.

### 2. How are services passed around?

**Downward injection**: `Configuration` is created once at the root and passed as `*action.Configuration` to each `newXxxCmd` function. Commands do not fetch dependencies from a global registry.

**Action pattern**: Each operation (install, upgrade, etc.) has a struct (e.g., `Install`, `Upgrade`) that holds a pointer to `*Configuration` as `cfg`. These action structs are created per-command invocation via `NewXxx(cfg)` constructors.

**Registry client**: Set on `actionConfig.RegistryClient` in `newRootCmdWithConfig` (`pkg/cmd/root.go:260-264`). However, the `Install` action also constructs its own registry client in `RunE` (`pkg/cmd/install.go:146-151`) and calls `SetRegistryClient`, which is inconsistent.

### 3. Is wiring centralized?

**Yes, partially centralized.** The `Configuration.Init()` method (`pkg/action/action.go:664`) centralizes construction of:
- `kube.Client` via `kube.New(getter)`
- `*storage.Storage` with the appropriate driver (secrets, configmaps, memory, sql)
- `RESTClientGetter`

The root command's `newRootCmdWithConfig` (`pkg/cmd/root.go:150-312`) centralizes subcommand registration and wires the `actionConfig` to each command.

**Exception**: Registry client creation in `newInstallCmd` (`pkg/cmd/install.go:146-151`) creates a new registry client per-command invocation rather than using the shared `actionConfig.RegistryClient`.

### 4. Are globals avoided?

**Mostly yes.** There are two notable exceptions:

1. **`kube.ManagedFieldsManager`** (`pkg/kube/client.go:71`): Package-level `var` set in `main()` (`cmd/helm/helm.go:36`) for Kubernetes client configuration.

2. **`Timestamper`** (`pkg/action/action.go:63`): A `var Timestamper = time.Now` that can be overridden in tests for predictable timestamps.

3. **`EnvSettings`** uses a package-level variable `var settings = cli.New()` in `pkg/cmd/root.go:103`, but this is initialized once at startup and is not hidden—a caller can see exactly where it comes from.

The application-level globals are intentional and documented; they are not hidden dependencies.

### 5. Is initialization explicit?

**Yes.** The initialization chain is traceable:

1. `main()` calls `NewRootCmd(os.Stdout, os.Args[1:], SetupLogging)` (`cmd/helm/helm.go:38`)
2. `NewRootCmd` creates `actionConfig := action.NewConfiguration()` then calls `newRootCmdWithConfig(actionConfig, ...)` (`pkg/cmd/root.go:106-107`)
3. `newRootCmdWithConfig` wires `actionConfig` into subcommands via explicit constructor parameters
4. `cobra.OnInitialize` callbacks call `actionConfig.Init(...)` to finalize initialization

Each step is explicit and traceable from `main()` to the final command execution.

## Architectural Decisions

- **Composition root at `NewRootCmd`**: All shared state (`Configuration`, `EnvSettings`, `RegistryClient`) is assembled in one place before commands execute.
- **`Configuration` as shared context**: A single struct holds all services (storage, kube client, registry client), passed to all actions. This matches the "context parameters" pattern.
- **Action structs per command**: Each CLI command creates a dedicated action struct (e.g., `Install`, `Upgrade`) that holds both config reference and command-specific options. This allows action reuse and testing in isolation.
- **Pluggable storage drivers**: `storage.Init()` accepts any `driver.Driver` implementation (Secrets, ConfigMaps, Memory, SQL), enabling in-memory testing.
- **`EnvSettings` from environment**: All environment-driven configuration is encapsulated in `cli.EnvSettings` and passed explicitly to commands that need it, not accessed via global `os.Getenv` calls in business logic.

## Notable Patterns

- **Constructor injection for actions**: `NewInstall(cfg *Configuration)`, `NewUpgrade(cfg *Configuration)`, etc. — each action receives its dependencies through a constructor.
- **Configuration options pattern**: `ConfigurationOption` func type (`pkg/action/action.go:148`) allows functional options for overriding defaults, e.g., `ConfigurationSetLogger`.
- **Lazy Kubernetes client**: `lazyClient` (`pkg/action/lazyclient.go`) defers Kubernetes client creation until first use, avoiding unnecessary cluster connections in dry-run scenarios.
- **Interface abstraction for storage**: `storage.Storage` embeds `driver.Driver` interface, allowing different backends without changing storage logic.
- **Interface abstraction for Kube client**: `kube.Interface` and `kube.Waiter` are defined as interfaces, enabling `kubefake.FailingKubeClient` for tests.

## Tradeoffs

- **Registry client inconsistency**: The `Install` command creates its own registry client in `RunE` rather than using the pre-wired `actionConfig.RegistryClient`. This introduces a second code path for registry client creation and was likely added to support per-command TLS certificate configuration. It means not all dependencies flow through `Configuration`.
- **`EnvSettings` as package var**: While `settings` is effectively a global (though initialized once), it is accessed from multiple packages (`pkg/cmd/root.go`, `pkg/cmd/install.go`). This creates implicit coupling that is not visible in function signatures. Commands that use `settings` are harder to test in isolation.
- **`Timestamper` var for testing**: While pragmatic for testing, it is a global variable that alters behavior when mutated. This is a common Go pattern but represents a form of hidden state.

## Failure Modes / Edge Cases

- **SQL driver connection string from env**: `HELM_DRIVER_SQL_CONNECTION_STRING` is read via `os.Getenv` in `Configuration.Init()` (`pkg/action/action.go:701`). If the env var is not set, the SQL driver fails with a non-obvious error.
- **Memory driver namespace reset**: `loadReleasesInMemory` calls `mem.SetNamespace(settings.Namespace())` (`pkg/cmd/root.go:349`) after loading releases. If `settings.Namespace()` returns an unexpected value, releases may be in the wrong namespace.
- **Registry client per-install**: Because `newInstallCmd` creates a registry client in `RunE` with certs from command flags (`pkg/cmd/install.go:146-151`), the certs are not available during `NewInstall` construction. This splits the initialization logic and could cause subtle issues if the registry client creation fails.
- **Missing Kubernetes cluster**: If `RESTClientGetter` cannot reach a cluster, operations that need cluster access fail at runtime (in `cfg.Init()` called in `cobra.OnInitialize`). This is by design but means some errors surface only at execution time.

## Future Considerations

- **Consolidate registry client wiring**: The split between `actionConfig.RegistryClient` and per-command registry client creation should be unified, either by adding registry client options to `Configuration` or by making the registry client fully per-command and removing it from `Configuration`.
- **Pass `EnvSettings` explicitly**: Instead of using a package-level `var settings`, pass `*EnvSettings` as a parameter to commands that need it. This would make dependencies more explicit and improve testability.
- **Context-scoped dependencies**: The current pattern passes `*Configuration` to action constructors. Moving toward `context.Context`-based request scoping could allow concurrent command executions to have isolated dependency graphs.

## Questions / Gaps

- **No evidence found** for any factory pattern beyond the direct `NewXxx` constructors. There is no DI container or reflection-based injection.
- The `Configuration` struct is concrete (not an interface), which limits its utility for testing via interface substitution. However, the test fixture (`actionConfigFixture`) directly constructs a `*Configuration` with fake implementations, which achieves the same end.
- `ActionConfiguration` and `actionConfig` naming inconsistency: The type is `Configuration` in `pkg/action/action.go:119` but the variable in commands is often named `actionConfig` or `cfg`. This is a minor naming drift, not a functional issue.

---

Generated by `03-dependency-injection.md` against `helm`.