# Repo Analysis: k9s

## Dependency Injection & Wiring

### Repo Info

| Field | Value |
|-------|-------|
| Name | k9s |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/k9s` |
| Group | `03-dependency-injection` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

K9s employs a centralized composition root in `cmd/root.go:run()` where the `App` is constructed via `view.NewApp(cfg)` (`internal/view/app.go:62`). Dependencies flow downward through explicit constructor injection. The `watch.Factory` is the primary service factory, passed via `context.Context` to child components rather than being injected directly into constructors. This hybrid approach—constructor injection at the top layer with context-based propagation to views—is a pragmatic pattern for TUI applications where the component hierarchy is deep and dynamically constructed.

## Rating

**8/10** — Clear composition root with explicit wiring. The `App` struct is the central assembly point, and the `Factory` is the primary service provider. Interface abstraction is present through the `dao.Factory` interface. However, some package-level global state (`vul.ImgScanner`, `dao.MxRecorder`) and reliance on `context.Context` for factory propagation rather than constructor injection prevents a higher score.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Composition root | `run()` in `cmd/root.go:76` calls `loadConfiguration()` then `view.NewApp(cfg)` | `cmd/root.go:112` |
| App construction | `NewApp(cfg *config.Config) *App` creates App with config | `internal/view/app.go:62` |
| Factory creation | `watch.NewFactory(a.Conn())` creates the primary service factory | `internal/view/app.go:113` |
| DAO Factory interface | `type Factory interface` defines the contract for resource factories | `internal/dao/types.go:22-46` |
| Accessor pattern | `AccessorFor(f Factory, gvr *client.GVR) (Accessor, error)` returns typed accessors | `internal/dao/accessor.go:47-56` |
| Context propagation | `context.WithValue(ctx, internal.KeyFactory, x.app.factory)` passes factory to views | `internal/view/xray.go:412` |
| Global scanner | `var ImgScanner *imageScanner` — package-level global for image scanning | `internal/vul/scanner.go:34` |
| Global recorder | `var MxRecorder *Recorder` — package-level global for metrics recording | `internal/dao/recorder.go:21` |
| Global exit status | `var ExitStatus = ""` — global UI exit status | `internal/view/app.go:35` |
| Connection abstraction | `APIClient` wraps all K8s client interactions | `internal/client/client.go:44-55` |
| Config construction | `config.NewConfig(k8sCfg)` creates the config hierarchy | `cmd/root.go:134` |
| K9s config | `NewK9s(conn, ks)` constructs K9s-specific config | `internal/config/k9s.go:69` |

## Answers to Protocol Questions

### 1. Where are dependencies constructed?

Dependencies are constructed in two places:

- **Main entry point**: `cmd/root.go:run()` (`cmd/root.go:76-128`) is the composition root. It calls `loadConfiguration()` (`cmd/root.go:130-169`) which creates the `*config.Config` and `*client.APIClient` (via `client.InitConnection` at `cmd/root.go:137`), then constructs the `*view.App` via `view.NewApp(cfg)` at `cmd/root.go:112`.

- **App initialization**: `App.Init()` (`internal/view/app.go:95-144`) creates the `watch.Factory` via `watch.NewFactory(a.Conn())` at `app.go:113`, the `*model.ClusterInfo` at `app.go:116`, and the `*Command` at `app.go:129`.

### 2. How are services passed around?

Services are passed via two mechanisms:

- **Constructor injection for the App**: The `App` struct holds its dependencies as fields (`factory`, `clusterModel`, `command`, etc.) and passes itself to child components via `context.WithValue(ctx, internal.KeyApp, a)` (`internal/view/app.go:98`, `app.go:797`). Child components extract the App from context to access services.

- **Context-based propagation**: The `watch.Factory` is stored in context via `context.WithValue(ctx, internal.KeyFactory, x.app.factory)` (`internal/view/xray.go:412`, `internal/view/browser.go:595`). Components retrieve it via `ctx.Value(internal.KeyFactory)` (`internal/dao/ds.go:72`). This avoids having to pass the factory through every constructor in the view hierarchy.

### 3. Is wiring centralized?

**Mostly yes.** The wiring is concentrated in `cmd/root.go:run()` and `App.Init()`. However, there are exceptions:

- The `accessors` map in `internal/dao/accessor.go:10-39` is a static registry that maps `GVR` types to `Accessor` implementations. This is a form of centralized registry but is initialized at package load time rather than in the composition root.

- The `watch.Factory` is shared via context, not constructor injection, making the wiring implicit in how components use context.

### 4. Are globals avoided?

**Partially.** Several globals exist:

- `vul.ImgScanner *imageScanner` (`internal/vul/scanner.go:34`) — global image scanner, set in `app.go:162` and stopped in `app.go:147`
- `dao.MxRecorder *Recorder` (`internal/dao/recorder.go:21`) — global metrics recorder
- `view.ExitStatus` (`internal/view/app.go:35`) — global exit status string
- `model.Registry` (`internal/model/registry.go:16`) — global resource metadata registry
- `client.MetricsDial` (`internal/client/metrics.go:26`) — global metrics server

The image scanner and metrics recorder are particularly problematic as they represent significant shared state that is difficult to test or replace.

### 5. Is initialization explicit?

**Yes for the main app.** The `App` struct is constructed via `NewApp(cfg)` and initialized via `app.Init(version, refreshRate)` — two distinct phases. The `watch.Factory` is similarly created via `NewFactory(clt)` and then started via `f.Start(ns)`. This separation of construction and initialization is explicit and consistent.

However, the static accessor registry (`accessors` map in `internal/dao/accessor.go`) is initialized at package import time, which is implicit.

## Architectural Decisions

### Explicit composition root
`cmd/root.go:run()` is clearly identifiable as the composition root. The app wiring is traceable: flags → config → connection → app → factory → views.

### Interface abstraction for services
The `dao.Factory` interface (`internal/dao/types.go:22-46`) abstracts the informer factory, and `dao.Accessor` (`internal/dao/types.go:67-79`) abstracts resource access. This allows for testing via mock factories.

### Context-based dependency propagation
Rather than threading the factory through every constructor, k9s uses `context.Context` as a transport mechanism. This is a pragmatic choice for a TUI with a deep, dynamic component hierarchy. Components call `ctx.Value(internal.KeyFactory)` to retrieve the factory (`internal/dao/ds.go:72`), effectively making context the DI container.

### Client as connection abstraction
`client.APIClient` (`internal/client/client.go:44-55`) wraps all Kubernetes client interactions (dynamic, discovery, metrics, authorization) behind a single interface. This is passed to `watch.Factory` as `client.Connection`.

## Notable Patterns

- **Factory pattern**: `watch.Factory` (`internal/watch/factory.go:29-35`) is a dynamic informer factory that lazily creates and caches informers per namespace.
- **Accessor registry**: `AccessorFor()` (`internal/dao/accessor.go:47-56`) uses a static map to route GVRs to typed DAO accessors, with a fallback to generic `Scaler`.
- **Two-phase initialization**: `NewApp()` + `App.Init()` separates construction from setup, allowing the app struct to be created before all dependencies are available.
- **Graceful shutdown**: `App.Halt()` / `App.Resume()` (`internal/view/app.go:334-359`) manage context cancellation for background goroutines.

## Tradeoffs

- **Context vs Constructor injection**: Using context to propagate the factory (`internal/view/xray.go:412`) is ergonomic for views but makes the dependency graph implicit. A component cannot be understood in isolation — it must be examined in context of how it receives the factory.

- **Global singletons for scanners/recorders**: `vul.ImgScanner` and `dao.MxRecorder` are global packages-level variables. This makes them accessible anywhere but difficult to replace in tests. The pattern appears in `app.go:147-163` where `ImgScanner` is initialized conditionally.

- **Static accessor registry**: The `accessors` map in `accessor.go` is initialized at package load time with `new()` constructors. While centralized, it offers no way to inject alternative implementations except through the `AccessorFor` fallback logic.

- **Config as both service and data**: `config.K9s` (`internal/config/k9s.go:36-66`) holds both application configuration and actively manages connection state (`conn client.Connection`), mixing data and service concerns.

## Failure Modes / Edge Cases

- **No factory at init**: `App.Init()` allows initialization without a valid connection (`internal/view/app.go:111`). If `a.Conn()` is nil, the factory is not created and the app falls back to a default view. This graceful degradation is intentional but means some views may fail at runtime if connection is later unavailable.

- **Context cancellation**: Since the factory is passed via context, if a view's context is cancelled, subsequent operations that depend on the factory will fail. The `podLogs` function (`internal/dao/ds.go:71-111`) explicitly checks for factory presence in context and returns an error if missing.

- **Image scanner availability**: If `ImageScans.Enable` is true but the grype library fails to initialize, `vul.ImgScanner` remains nil and `stopImgScanner()` (`internal/view/app.go:146-150`) must guard against nil.

## Future Considerations

- Consider replacing context-based factory propagation with constructor injection for view components that are instantiated in known hierarchies (e.g., `Browser`, `Table`), enabling compile-time dependency verification.
- The global `ImgScanner` and `MxRecorder` could be fields on the `App` struct, eliminating package-level state and making them testable.
- The static `accessors` map could be replaced with a functional option pattern or a factory method that accepts a `Factory` parameter, allowing test implementations.

## Questions / Gaps

- **No evidence of dependency injection frameworks** (e.g., wire, dig). The DI is manual, which increases boilerplate but maintains transparency.
- **No interface for `App` itself** — components receive `*App` directly rather than an interface, coupling views to the concrete App type. However, `App.App` is `*ui.App` which could serve as an abstraction point.
- The `config.Data` type (`internal/config/data`) was not fully explored; it may contain additional patterns.

---

Generated by `03-dependency-injection.md` against `k9s`.