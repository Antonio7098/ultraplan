# Repo Analysis: dive

## Dependency Injection & Wiring

### Repo Info

| Field | Value |
|-------|-------|
| Name | dive |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/dive` |
| Group | `dive` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Dive uses a hybrid DI approach: it leverages the `clio` library (from Anchore) as a composition root for app-wide wiring, but relies on package-level global singletons for the bus and logger. Dependencies like image resolvers are constructed locally in commands via factory functions, and interfaces are used at key boundaries (Resolver, ContentReader, Analyzer, Exporter, Evaluator). However, the global `bus` and `log` packages violate the "no globals" ideal.

## Rating

**6/10** — Some injection but inconsistent. The clio framework provides a centralized composition point, but internal packages use global singletons (bus, log) that are set via initializers rather than passed explicitly.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Global bus singleton | `publisher partybus.Publisher` set via `Set()` | `internal/bus/bus.go:5` |
| Global log singleton | `var log = discard.New()` set via `Set()` | `internal/log/log.go:9` |
| clio initializer wiring | `WithInitializers` sets bus and log | `cmd/dive/cli/cli.go:28-36` |
| Resolver interface | `type Resolver interface { Name(), Fetch(), Build(), ContentReader }` | `dive/image/resolver.go:5-10` |
| ContentReader interface | `type ContentReader interface { Extract() }` | `dive/image/resolver.go:12-13` |
| Image resolver factory | `GetImageResolver()` returns concrete impl by source type | `dive/get_image_resolver.go:62-72` |
| Analyzer interface | `type Analyzer interface { Analyze() }` | `cmd/dive/cli/internal/command/adapter/analyzer.go:13-14` |
| Exporter interface | `type Exporter interface { ExportTo() }` | `cmd/dive/cli/internal/command/adapter/exporter.go:15-16` |
| Evaluator interface | `type Evaluator interface { Evaluate() }` | `cmd/dive/cli/internal/command/adapter/evaluator.go:13-14` |
| Application config struct | `Application` aggregates Analysis, CI, Export, UI options | `cmd/dive/cli/internal/options/application.go:7-12` |
| UI App struct | `type app struct { gui, controller, layout }` | `cmd/dive/cli/internal/ui/v1/app/app.go:16-20` |
| Controller struct | `type controller struct { gui, views, config, ctx }` | `cmd/dive/cli/internal/ui/v1/app/controller.go:14-18` |
| V1 Config struct | `type Config struct { Analysis, Content, Preferences }` | `cmd/dive/cli/internal/ui/v1/config.go:13-17` |
| Context propagation | `ctx` stored in controller, passed through Run/Analyze | `cmd/dive/cli/internal/ui/v1/app/controller.go:18` |
| Build command DI | `opts.Application` constructed via `options.DefaultApplication()` | `cmd/dive/cli/internal/command/build.go:19-21` |

## Answers to Protocol Questions

### 1. Where are dependencies constructed?

The primary composition root is in `cmd/dive/cli/cli.go:22-52` via `clio.New()` with `WithInitializers`. The initializer at lines 29-36 sets the global `bus` and `log` singletons. Concrete dependencies like image resolvers are constructed locally in commands via `dive.GetImageResolver()` (`dive/get_image_resolver.go:62-72`). The `app.Run()` entry point constructs the full UI stack (`cmd/dive/cli/internal/ui/v1/app/app.go:23-53`).

### 2. How are services passed around?

Services flow downward through function calls rather than being injected via constructors. The `clio.Application` is passed to command factories (`command.Root(app)`, `command.Build(app)`) but most internal services use the global bus for event communication. UI components receive `v1.Config` structs directly at `app.Run()` (`cmd/dive/cli/internal/ui/v1/app/app.go:148-156`). The controller receives a `context.Context` and the `gocui.Gui` directly in `newController()`.

### 3. Is wiring centralized?

Yes and no. The `clio` library acts as a centralized framework for app setup, but internal packages (`bus`, `log`) use global setters rather than injected dependencies. The `cli.go:28-36` initializer pattern is a form of centralized wiring, but once set, these globals are accessed via package-level `Get()` functions throughout the codebase.

### 4. Are globals avoided?

**No.** The `internal/bus/bus.go:5` and `internal/log/log.go:9` both use package-level variables set via setters. These are effectively globals. The rationale appears to be convenience for event bus communication across disparate packages, but it creates hidden dependencies. The TODO at `cmd/dive/cli/internal/ui/v1/app/controller.go:18` acknowledges that storing context in the controller "is not ideal."

### 5. Is initialization explicit?

Partially. The clio framework's initializer pattern (`cmd/dive/cli/cli.go:28-36`) makes initial setup explicit. However, the use of global singletons for bus and log means that any package can call `bus.Get()` or `log.Get()` without the caller explicitly receiving these as dependencies.

## Architectural Decisions

- **Framework composition root**: Dive delegates app setup to the `clio` library, which handles CLI flag parsing, config loading, and state management (`cmd/dive/cli/cli.go:12-15`).
- **Event bus for cross-cutting concerns**: A package-level bus (`internal/bus/bus.go`) distributes tasks, notifications, and UI events. This decouples image fetching, analysis, and UI rendering.
- **Interface abstraction at boundaries**: Key abstractions are `Resolver` (`dive/image/resolver.go:5-10`), `ContentReader` (`dive/image/resolver.go:12-13`), `Analyzer` (`cmd/dive/cli/internal/command/adapter/analyzer.go:13-14`), and `Exporter` (`cmd/dive/cli/internal/command/adapter/exporter.go:15-16`).
- **Factory for image resolver**: `dive.GetImageResolver()` (`dive/get_image_resolver.go:62-72`) acts as a simple factory, dispatching to docker, podman, or archive backends based on image source string.

## Notable Patterns

- **Decorator pattern**: `adapter.ImageResolver()` wraps a resolver with logging and progress monitoring (`cmd/dive/cli/internal/command/adapter/resolver.go:17-21`).
- **Adapter pattern**: `adapter.NewAnalyzer()`, `adapter.NewEvaluator()`, `adapter.NewExporter()` wrap core functions with instrumentation (bus events, logging).
- **Options pattern**: `options.Application` is a struct of sub-config structs (`Analysis`, `CI`, `Export`, `UI`) with `Default*()` constructors and `PostLoad()` lifecycle hooks (`cmd/dive/cli/internal/options/application.go`).
- **Config struct for UI**: `v1.Config` (`cmd/dive/cli/internal/ui/v1/config.go:13-17`) holds the required inputs (`Analysis`, `Content`, `Preferences`) for the UI.

## Tradeoffs

- **Global bus/log vs. testability**: The global bus and logger are convenient for decoupling but make unit testing harder — any package that calls `bus.Publish()` or `log.Info()` implicitly depends on the global being set. Tests in `cli_test.go`, `cli_build_test.go`, etc. likely rely on integration-level setup via `clio`'s test helpers.
- **clio framework lock-in**: By delegating composition to `clio`, Dive gains a well-tested CLI scaffold but surrenders control over how dependencies are wired and lifecycle hooks run.
- **Context stored in struct**: The controller stores `ctx context.Context` directly (`cmd/dive/cli/internal/ui/v1/app/controller.go:18`) rather than deriving it per-operation, which can lead to context leaks if the struct escapes the expected lifecycle.

## Failure Modes / Edge Cases

- **Bus not set**: If `WithInitializers` fails or runs out of order, `bus.Get()` returns nil and `bus.Publish()` silently no-ops (`internal/bus/bus.go:16-18`).
- **Logger not configured**: If `log.Set()` is not called, the `discard.New()` singleton is used, silencing all logs (`internal/log/log.go:9`).
- **Resolver resolution failure**: `GetImageResolver()` returns an error for unknown sources (`dive/get_image_resolver.go:72`), but the error message is not actionable.
- **Context cancellation**: `adapter.ImageResolver.Fetch()` uses `context.WithCancel` internally (`cmd/dive/cli/internal/command/adapter/resolver.go:53-54`), but the cancel is deferred — if the caller never cancels, resources may not be released promptly.

## Future Considerations

- Replace global `bus` and `log` singletons with explicitly passed dependencies or a proper DI container (e.g., `wire`, `fx`, or manual constructor injection).
- Extract the `ContentReader` interface into a shared location (currently defined in both `dive/image/resolver.go:12` and `cmd/dive/cli/internal/ui/v1/config.go:65`).
- Use struct embedding for `rootOptions` and `buildOptions` (currently using `mapstructure:",squash"` but could be simplified).

## Questions / Gaps

- No evidence of integration test coverage for the full DI wiring (only unit tests for `cli`, `build`, `ci`).
- The `image.Resolver` interface conflates `Fetch`, `Build`, and `ContentReader` — this may violate Interface Segregation Principle (ISP), making mocking harder.
- Unclear if the `clio` framework's state management can be extended or replaced if Dive outgrows it.

---

Generated by `study-areas/03-dependency-injection.md` against `dive`.