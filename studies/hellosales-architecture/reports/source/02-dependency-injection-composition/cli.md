# Source Analysis: cli

## Dependency Injection & Composition

### Source Info

| Field | Value |
|-------|-------|
| Name | cli |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/cli` |
| Language / Stack | Go |
| Analyzed | 2026-05-19 |

## Summary

The GitHub CLI (`gh`) uses **pure manual wiring with a Factory pattern** — no DI container. Dependencies are composed in `internal/ghcmd/cmd.go` and `pkg/cmd/factory/default.go`. Services are created once at startup and used for command duration, with lazy-evaluated function references for costly resources like HTTP clients and Git remotes. Constructor injection is achieved by passing a `*cmdutil.Factory` to command constructors. Lifecycle management is minimal — only pager output, telemetry flush, and update-check cancellation have cleanup handlers. Testing seams exist through mock implementations and `httpmock.Registry`.

## Rating

**6/10** — Basic implementation with notable gaps. Manual wiring is clean and explicit but lacks formal lifecycle management. No startup ordering guarantees beyond sequential initialization. No dependency injection container means complex scenarios require manual assembly.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Composition Root | `Main()` function wires cfg, factory, telemetry, rootCmd | `internal/ghcmd/cmd.go:52-175` |
| Factory Definition | Struct holding interface fields (Browser, GitClient, IOStreams, Prompter, etc.) | `pkg/cmdutil/factory.go:16-43` |
| Factory Wiring | `New()` assembles factory with lazy functions | `pkg/cmd/factory/default.go:26-46` |
| Constructor Injection | Commands receive `*cmdutil.Factory` and extract dependencies | `pkg/cmdutil/factory.go:16` |
| Lazy Initialization | HttpClient, Config, BaseRepo, Remotes, Branch are func()-typed fields | `pkg/cmdutil/factory.go:20-26` |
| Pager Lifecycle | `StartPager()` / `StopPager()` manage pager process | `pkg/iostreams/iostreams.go:205,252` |
| Telemetry Flush | `defer telemetryService.Flush()` at end of command | `internal/ghcmd/cmd.go:130` |
| Update Cancellation | `updateCancel()` cancels background goroutine | `internal/ghcmd/cmd.go:253` |
| Domain Interfaces | `Config`, `AuthConfig`, `AliasConfig`, `Migration` interfaces | `internal/gh/gh.go:32,105,174,93` |
| HTTP Mocking | `Registry` implementing `http.RoundTripper` for test stubbing | `pkg/httpmock/registry.go:18` |
| IOStreams Test Helper | `Test()` returns mock IOStreams and buffers | `pkg/iostreams/iostreams.go:551` |
| Browser Interface | `Browser` interface defined in `internal/browser/browser.go:9-11` | `internal/browser/browser.go:9-11` |
| Prompter Interface | `Prompter` interface with all prompting methods | `internal/prompter/prompter.go:17-53` |
| Remote Resolver | `remoteResolver` with caching logic | `pkg/cmd/factory/remote_resolver.go:28-32` |

## Answers to Dimension Questions

### 1. How does the project wire its dependency graph without global state or init() hell?

**Manual Factory wiring, no globals.** The composition root `internal/ghcmd/cmd.go:52-175` creates `config.NewConfig()`, `newIOStreams()`, constructs a telemetry service, then calls `factory.New()` (`pkg/cmd/factory/default.go:26-46`) which directly assigns dependencies to a `Factory` struct. There is no DI container, no `wire` code generation, and no `init()` functions. Each dependency is explicitly passed. The `Factory` itself is passed to every command constructor, which extracts what it needs.

**Lazy references** (`pkg/cmdutil/factory.go:20-26`) defer costly operations into functions — `HttpClient`, `Config`, `BaseRepo`, `Remotes`, `Branch` — so they are not resolved until first use, avoiding init() hell by spreading cost across execution.

### 2. Are interfaces defined by consumers or producers?

**Interfaces defined by consumers in `internal/` packages.** The `Factory` struct in `pkg/cmdutil/factory.go:16-43` declares interface fields (`Browser`, `Prompter`, `ExtensionManager`). The `Searcher` interface is in `pkg/search/searcher.go:29` and `Exporter` in `pkg/cmdutil/json_flags.go:198`. Implementations live in appropriate packages (e.g., `browser.New()` returns a concrete `ghBrowser.Browser`). Domain interfaces (`Config`, `AuthConfig`) live in `internal/gh/gh.go` and are implemented by `internal/config/config.go`.

### 3. How is startup ordering managed when services depend on each other?

**Sequential initialization order with no formal ordering system.** `cmd/gh/main.go:1-12` calls `ghcmd.Main()`. Inside `Main()` (`internal/ghcmd/cmd.go:52-175`), dependencies are initialized in strict sequence: config → IOStreams → telemetry → factory → config migration → update checker goroutine → root command → execute. If `config.NewConfig()` fails at line 57, execution continues with `cfgErr` set but no service fails gracefully.

Services that depend on each other (e.g., `remoteResolver` uses `GitClient`) are composed inside `default.go:34-43` in a single function with no cycles. There is no topological sort or dependency injection container — ordering is guaranteed by code sequence alone.

### 4. What happens during graceful shutdown — is ordering guaranteed?

**No formal shutdown ordering.** Three cleanup actions exist:

1. **Telemetry flush** (`internal/ghcmd/cmd.go:130`): `defer telemetryService.Flush()` — runs at end of `Main()`, guaranteed by Go's defer
2. **Pager stop** (`pkg/iostreams/iostreams.go:252`): `StopPager()` closes pipes and waits for pager process
3. **Update cancellation** (`internal/ghcmd/cmd.go:253`): `updateCancel()` cancels a goroutine via `context.CancelFunc`

These are not coordinated through any lifecycle interface. Ordering is not explicitly guaranteed beyond Go's defer stack. Services with inter-dependencies (e.g., a service wrapping a pager subprocess) have no shutdown protocol.

### 5. Can individual services be tested without booting the entire system?

**Yes, through interfaces and test helpers.** Mock implementations exist for major interfaces:
- `pkg/httpmock/registry.go:18` — `Registry` implements `http.RoundTripper`, can replace HTTP transport
- `internal/prompter/prompter_mock.go` — generated mock for `Prompter`
- `pkg/extensions/manager_mock.go` — mock for `ExtensionManager`
- `pkg/iostreams/iostreams.go:551` — `Test()` returns buffered mock IOStreams

Commands can be tested by passing a manually constructed `Factory` with mocked dependencies. However, since `Factory` fields are mostly function-typed lazy references, tests must either construct these functions correctly or accept lazy-evaluation behavior. There is no DI container to auto-inject mocks — tests manually assemble dependencies.

## Architectural Decisions

**Factory Pattern over DI Container.** The codebase uses a `*cmdutil.Factory` passed to every command, which is a straightforw `interface{}` bag of dependencies. This is explicit, readable, and requires no code generation. The tradeoff is that new dependencies require changes to the `Factory` struct and its wiring in `default.go`.

**Function-typed lazy references.** Fields like `HttpClient func() (*http.Client, error)` in `pkg/cmdutil/factory.go:20` defer initialization. This avoids computing expensive resources until needed but means failures can occur mid-command rather than at startup. It also makes testing harder since tests must provide correct lazy functions.

**No formal lifecycle interface.** Services like `IOStreams` and `Telemetry` have independent `Start`/`Stop` or `Flush` methods rather than implementing a common `Startable`/`Stoppable` interface. This means lifecycle operations cannot be coordinated through a central mechanism.

## Notable Patterns

| Pattern | Location | Description |
|---------|----------|-------------|
| Factory composition | `pkg/cmd/factory/default.go:26-46` | `New()` wires all factory dependencies |
| Lazy function references | `pkg/cmdutil/factory.go:20-26` | Dependencies are `func() (T, error)` fields |
| Options struct + command constructor | `pkg/cmd/issue/list/list.go` | Commands use `NewCmdList(f *cmdutil.Factory, runF func(*ListOptions) error)` |
| HTTP mock registry | `pkg/httpmock/registry.go:18` | `ReplaceTripper()` swaps transport for tests |
| Remote caching | `pkg/cmd/factory/remote_resolver.go:28-32` | Remotes resolver caches results to avoid repeated Git calls |

## Tradeoffs

| Decision | Benefit | Cost |
|----------|---------|------|
| No DI container | No external dependency, explicit wiring, simple mental model | Boilerplate in `Factory` struct and `default.go` wiring |
| Lazy function references | Avoids startup cost for unused features | Failures occur mid-execution, harder to test |
| No lifecycle interface | Services choose their own cleanup methods | Cannot batch-start or batch-stop services; shutdown ordering unclear |
| Manual mock assembly | Mocks are explicit and version-controlled | Adding a new dependency to Factory requires updating all test assemblies |

## Failure Modes / Edge Cases

1. **Mid-command lazy init failures.** When `HttpClient` or `BaseRepo` functions fail on first call, the error surfaces during command execution rather than at startup. Commands may produce partial output before failing.
2. **Missing shutdown coordination.** If a service wraps a resource (e.g., pager subprocess) and the application is interrupted (SIGINT), there is no guaranteed shutdown order — the pager process may outlive the application.
3. **Factory growth.** Adding a new shared dependency requires touching `pkg/cmdutil/factory.go`, `pkg/cmd/factory/default.go`, and potentially updating every test that manually constructs a `Factory`.
4. **Circular dependency risk.** As a flat Factory struct, circular dependencies are not structurally prevented. A future change could introduce a cycle that causes startup to hang or panic.
5. **Config migration runs after factory.** `internal/ghcmd/cmd.go:134-140` runs config migration after factory creation — if migration depends on factory services, ordering is inverted.

## Future Considerations

1. **Introduce a lifecycle interface** (`Start() error`, `Stop() error`) for services that manage resources, allowing coordinated startup/shutdown.
2. **Consider a lightweight DI container** (e.g., `dig`, `fx`, or `wire`) if the Factory wiring in `default.go` grows beyond ~10 dependencies.
3. **Evaluate lazy init vs eager init** tradeoffs — the function-typed fields make testing harder and failures less predictable.
4. **Add integration test scaffolding** that boots the minimum set of services (config + IOStreams + factory) for end-to-end command tests.

## Questions / Gaps

1. **No evidence of a DI container** — the codebase uses pure manual wiring. Is this a deliberate choice or historical artifact?
2. **Lazy init error handling** — is there a pattern for graceful recovery when lazy functions fail, or do commands just propagate errors?
3. **Shutdown ordering** — beyond `defer telemetryService.Flush()`, is there any documented or tested shutdown contract?
4. **Interface ownership** — while interfaces appear consumer-owned in `internal/`, is there an explicit policy that `pkg/` packages cannot define their own interfaces for cross-package dependencies?

---

Generated by `02-dependency-injection-composition.md` against `cli`.