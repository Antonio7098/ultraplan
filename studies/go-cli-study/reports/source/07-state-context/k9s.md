# Repo Analysis: k9s

## State & Context Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | k9s |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/k9s` |
| Group | `k9s` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

k9s is a Kubernetes CLI tool with a TUI that manages long-running operations, port forwards, and cluster state. It uses `context.Context` heavily for propagation but with mixed patterns: explicit context through layers for data access, but extensive use of `context.WithValue` for indirect dependency injection. Cancellation is handled via `context.WithCancel` and `context.WithTimeout` but primarily at the top level (App) rather than per-operation.

## Rating

**7/10** — Clean propagation and cancellation at the application level, but context is used as a "back door" for dependency injection via `context.WithValue` for things like factory and app references, which muddies the boundaries.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Context keys defined | 20 context keys (KeyFactory, KeyApp, KeyPath, KeyGVR, etc.) | `internal/keys.go:10-38` |
| App struct | Contains `cancelFn context.CancelFunc` | `internal/view/app.go:51` |
| Context passed to PageStack.Init | `ctx := context.WithValue(context.Background(), internal.KeyApp, a)` | `internal/view/app.go:98-99` |
| Halt/Resume for cancellation | `a.Halt()` calls `cancelFn()`; `Resume()` re-creates cancel context | `internal/view/app.go:334-359` |
| clusterUpdater loop | `select { case <-ctx.Done(): return }` pattern | `internal/view/app.go:375-376` |
| SIGHUP handling | `signal.Notify(sig, syscall.SIGHUP)` exits on SIGHUP | `internal/view/app.go:185-193` |
| Image scanner timeout | `ctx, cancel := context.WithTimeout(ctx, imgScanTimeout)` | `internal/vul/scanner.go:147-148` |
| Workload defaultContext | `context.WithValue(context.Background(), internal.KeyFactory, w.App().factory)` | `internal/view/workload.go:108-119` |
| Browser defaultContext | Same pattern for factory, GVR, path, namespace, labels | `internal/view/browser.go:594-604` |
| Table Init | Propagates HasMetrics, Styles, ViewConfig via context | `internal/view/table.go:49-52` |
| PortForward lifecycle | `ctx, x.cancelFn = context.WithCancel(ctx)` for Xray | `internal/view/xray.go:628` |
| Flash watch | `go flash.Watch(ctx, a.Flash().Channel())` using context | `internal/view/app.go:168` |
| Configurator (App state) | UI struct embeds `Configurator` which holds `*config.Config` | `internal/ui/app.go:20-31` |
| Factory per-namespace | `Factory.factories map[string]di.DynamicSharedInformerFactory` | `internal/watch/factory.go:29-35` |
| Forwarders tracked | `Forwarders map[string]Forwarder` inside Factory | `internal/watch/factory.go:54` |
| Terminate stops all | `f.forwarders.DeleteAll()` and `close(f.stopChan)` | `internal/watch/factory.go:60-72` |
| Command history | `cmdHistory *model.History`, `filterHistory *model.History` | `internal/view/app.go:53-54` |
| Xray cancelFn | `ctx, x.cancelFn = context.WithCancel(ctx)` stored per view | `internal/view/xray.go:628` |

## Answers to Protocol Questions

### 1. How is `context.Context` propagated?

Context is propagated **explicitly** through `Init` methods and **implicitly** via `context.WithValue` for cross-cutting concerns.

- **Explicit path**: Every `Component` (view) implements `Init(context.Context)` and receives the context. This flows down to child components via `inject()` at `internal/view/app.go:797-798`.
- **Value-based path**: The `internal/keys.go:10-38` defines 20 context keys. These are used to pass `factory`, `app`, `path`, `gvr`, `namespace`, `labels`, `styles`, etc. to layers that don't receive them via parameters.
- **Anti-pattern**: Using context as a "service locator" for `internal.KeyFactory` (retrieved via `ctx.Value(internal.KeyFactory).(dao.Factory)`) is widespread in `internal/model/pulse.go:44`, `internal/model/tree.go:196`, `internal/dao/` many files. This couples implementations to context rather than receiving dependencies via structs/parameters.

**Propagation through layers**:
- `cmd/root.go:run` creates `app.Init(version, rate)`; context is created inside `app.Init` at line 98 via `context.WithValue(context.Background(), internal.KeyApp, a)`
- Views propagate via `ContextFunc` callbacks — e.g., `Browser` sets `b.contextFn = browser.defaultContext` at `internal/view/browser.go:253`

### 2. How is cancellation handled?

**Cancellation is hierarchical and explicit at the application level, but inconsistent in lower-level operations.**

- **App-level Halt/Resume** (`internal/view/app.go:334-359`): `App.Halt()` calls stored `cancelFn`; `App.Resume()` creates a new `context.WithCancel`. This controls the `clusterUpdater` background loop.
- **Long-running operations use `context.WithTimeout`**:
  - Image scans: `context.WithTimeout(ctx, imgScanTimeout)` at `internal/vul/scanner.go:148`
  - Scale extender: `context.WithTimeout(context.Background(), s.App().Conn().Config().CallTimeout())` at `internal/view/scale_extender.go:122,180`
  - Restart extender: `context.WithTimeout(context.Background(), r.App().Conn().Config().CallTimeout())` at `internal/view/restart_extender.go:64`
  - Helm rollback: `context.WithTimeout(context.Background(), h.App().Conn().Config().CallTimeout())` at `internal/view/helm_history.go:109`
  - Cronjob: `context.WithTimeout(context.Background(), c.App().Conn().Config().CallTimeout())` at `internal/view/cronjob.go:154`
  - Node: `context.WithTimeout(context.Background(), n.App().Conn().Config().CallTimeout())` at `internal/view/node.go:201`
  - Image extender: `context.WithTimeout(context.Background(), s.App().Conn().Config().CallTimeout())` at `internal/view/image_extender.go:130`
- **clusterUpdater** (`internal/view/app.go:361-392`): Uses `ctx.Done()` channel in `select` loop to exit when canceled.
- **Watch loops** terminate via `close(f.stopChan)` in Factory (`internal/watch/factory.go:64-67`).
- **No per-command cancellation for interactive UI ops**: Delete, port-forward, exec operations use `context.Background()` directly rather than the stored cancel context.

### 3. Is application state centralized or per-command?

**Application state is centralized in the `App` struct (view layer) and `Config` struct, but not propagated via context — accessed via `context.WithValue` indirect retrieval.**

- `view.App` (`internal/view/app.go:45-59`) holds:
  - `factory *watch.Factory` — cluster connection factory
  - `cancelFn context.CancelFunc`
  - `clusterModel *model.ClusterInfo`
  - `cmdHistory`, `filterHistory *model.History`
  - `Content *PageStack` — navigation stack
  - `command *Command` — alias/command handling
  - All UI state via embedded `*ui.App`
- `ui.App` (`internal/ui/app.go:20-31`) holds:
  - `Configurator` (holds `*config.Config`)
  - `Main *Pages`
  - `cmdBuff *model.FishBuff`
- Access pattern: `ctx.Value(internal.KeyApp).(*App)` retrieves the App from context at `internal/view/helpers.go:172`, bypassing a struct parameter.
- Configuration is centralized in `config.Config` and `config.K9s` (`internal/config/k9s.go:36-66`).

### 4. How are sessions modeled?

**No explicit session concept exists. State is implicit in App struct fields and per-namespace Factory informers.**

- **Command history**: `cmdHistory *model.History` and `filterHistory *model.History` in `App` (`internal/view/app.go:53-54`) persist navigation history across views. MaxHistory is `model.MaxHistory`.
- **Namespace factories**: `Factory.factories map[string]di.DynamicSharedInformerFactory` (`internal/watch/factory.go:30`) tracks per-namespace informer factories, giving each namespace isolation.
- **Port forward sessions**: `Forwarders map[string]Forwarder` inside Factory tracks active port forwards with container-specific keys (`internal/watch/forwarders.go:54,98-102`).
- **No explicit session abstraction**: The codebase does not model "user session" or "connection session" as a first-class type. Context switch in config (`k9s.contextSwitch`) tracks whether user triggered a context change.
- **Per-request state**: Views like `Browser` track `namespaces map[int]string`, `accessor dao.Accessor`, `cancelFn context.CancelFunc`, `updating bool` as instance fields.

## Architectural Decisions

1. **Context as DI vehicle**: k9s uses `context.WithValue` extensively to thread `factory`, `app`, `path` through layers that have no formal parameter injection. This is a lightweight DI pattern but obscures data flow and makes testing require context setup.
2. **Top-level cancellation**: Cancel funcs are stored at `App` and `Browser`/`Xray` level, not per-operation. Long operations create their own `context.WithTimeout` rather than inheriting cancellation.
3. **Per-namespace informer factories**: Each namespace gets its own `DynamicSharedInformerFactory`, allowing namespace-isolated watching. This is clean but doesn't support cross-namespace queries without special handling.
4. **Signal handling only for SIGHUP**: Only `SIGHUP` triggers graceful exit (`internal/view/app.go:185-193`). Other signals (SIGINT, SIGTERM) are not handled; `tview.Application` default behavior handles Ctrl+C.
5. **Embedded App in ui.App**: `view.App` embeds `*ui.App` and adds `factory`, `cancelFn`, and navigation stack on top. This layering is reasonable but the field visibility (`ui.App` has exported `Configurator`) can be confusing.

## Notable Patterns

- **`ContextFunc` for context modification** (`internal/view/types.go:41`): `ContextFunc func(context.Context) context.Context` allows views to customize context before passing to children. Used by `Browser`, `Pod`, `HelmChart`, etc.
- **`defaultContext()` pattern**: Many views define a `defaultContext(ctx)` method that wraps `context.WithValue` calls to add factory/GVR/path/namespace. e.g., `internal/view/workload.go:107-119`, `internal/view/browser.go:594-604`, `internal/view/pf.go:75-81`
- **`ContextFunc` set via `SetContextFn`**: Views like `PortForward`, `Container`, `Pod` set context modifiers that are called before operations.
- **Graceful shutdown via `Terminate()`**: `Factory.Terminate()` closes the stop channel and deletes all informers/forwarders (`internal/watch/factory.go:60-72`).
- **Exponential backoff on connection failure**: `clusterUpdater` uses `model.NewExpBackOff(ctx, clusterRefresh, 2*time.Minute)` and bails out after max retries (`internal/view/app.go:372-385`).

## Tradeoffs

- **Context as service locator** (`ctx.Value(KeyFactory)`) vs constructor injection: More convenient for wiring but hides dependencies and requires type assertions. In `internal/model/pulse.go:44-46`, `ctx.Value(internal.KeyFactory).(dao.Factory)` will panic on type mismatch.
- **Per-namespace informers** allow namespace isolation but mean querying across all namespaces requires checking multiple factories (handled by `client.IsAllNamespace` checks).
- **Image scanner is a global singleton** (`var ImgScanner *imageScanner` in `internal/vul/scanner.go:34`). Cannot run multiple scans simultaneously in different contexts.
- **No structured session abstraction** means history and forwarders are managed as loose fields in App, making it harder to suspend/resume a full session state.
- **`context.Background()` in long operations**: Operations like `killCmd`, `restartCmd` use `context.Background()` directly rather than the app's cancelable context, meaning they cannot be interrupted by UI cancellation.

## Failure Modes / Edge Cases

- **Context key collisions**: If two packages use the same `ContextKey` string, values will silently override. All keys are strings in `internal/keys.go:10-38`.
- **Nil factory panic**: Many `ctx.Value(KeyFactory).(dao.Factory)` calls will panic if factory is not set. No graceful error return — see `internal/model/pulse.go:44-46`, `internal/model/tree.go:196-198`.
- **Stray informers**: If `Factory.Start()` is called multiple times, it reuses existing factories but re-starts them (`internal/watch/factory.go:53-56`). Stop channel is replaced each time.
- **Port forward orphaning**: `ValidatePortForwards()` in `internal/watch/factory.go:326-351` checks if pods still exist and kills stale forwarders, but relies on periodic polling rather than watch-based detection.
- **Cancel context not propagated to UI operations**: Operations like `pod.killCmd` use `context.Background()`, so the app's Halt() cannot interrupt a stuck delete.
- **No connection check race**: `clusterModel.Refresh()` is called without knowing if the prior refresh completed (`internal/view/app.go:440`), leading to potential concurrent refreshes.

## Future Considerations

- Consider formalizing session as a struct containing history, forwarders, and factory state to allow suspend/resume.
- Replace `context.WithValue` DI with explicit struct parameters for core data access layer — would make testing easier and error handling more explicit.
- Add `context.WithCancel` propagation to long-running UI operations (delete, port-forward, exec) so Halt() can interrupt them.
- Investigate whether `ImageScanner` could support multiple instances rather than global singleton.

## Questions / Gaps

- **No evidence found** for graceful shutdown sequence on SIGTERM (only SIGHUP handled at `internal/view/app.go:185-193`). Signal handling for SIGTERM would be important for container environments.
- **No evidence found** for context timeout on `Factory.List/Get` operations — these use wait flags but no explicit context deadline (`internal/watch/factory.go:75-138`).
- **No evidence found** for cancellation propagation to the underlying Kubernetes client-go watchers. The stop channel drives informer factories but the client-go layers don't receive the context directly.