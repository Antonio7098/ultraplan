# Repo Analysis: dive

## State & Context Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | dive |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/dive` |
| Group | `07-state-context` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Dive is a Docker image analysis CLI. Context propagation is present through the resolver/analyzer/adapter chain, but cancellation handling is minimal—only the `Fetch` operation uses `context.WithCancel`, and the UI layer stores context in a struct field marked as TODO. Application state is passed through functional options rather than centralized, and there is no explicit session concept.

## Rating

**5/10** — Basic context handling with some propagation but incomplete lifecycle management.

The context is passed through the critical image-fetch path but is not propagated into the UI's event-driven loop. Cancellation exists at fetch time but not during the long-running TUI operation.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Context propagation | `cmd/dive/cli/internal/command/root.go:51` gets context from cobra command | `cmd/dive/cli/internal/command/root.go:51` |
| Context propagation | Context passed to `Fetch`, `Build`, `Analyze` adapters | `cmd/dive/cli/internal/command/adapter/resolver.go:49`, `cmd/dive/cli/internal/command/adapter/resolver.go:84` |
| Context propagation | `Analyze` accepts context but does not use it | `dive/image/analysis.go:20` |
| Context propagation | Controller stores context in struct field | `cmd/dive/cli/internal/ui/v1/app/controller.go:18` |
| WithCancel usage | Only in `Fetch` adapter | `cmd/dive/cli/internal/command/adapter/resolver.go:53` |
| WithValue usage | Progress monitor stored in context | `internal/bus/event/payload/generic.go:11` |
| Global state | Bus and log use package-level globals via `Set`/`Get` | `internal/bus/bus.go:5-8`, `internal/log/log.go` |
| Application state | Options struct passed through command chain, not centralized | `cmd/dive/cli/internal/options/application.go:7-12` |

## Answers to Protocol Questions

### 1. How is `context.Context` propagated?

Context originates from `cmd/dive/cli/internal/command/root.go:51` via `cmd.Context()`. It flows through the adapter layer: `Fetch` → `imageActionObserver.Fetch` (`cmd/dive/cli/internal/command/adapter/resolver.go:49`) and `Build` → `imageActionObserver.Build` (`cmd/dive/cli/internal/command/adapter/resolver.go:23`). The resolver implementations (`docker/engine_resolver.go:34`, `docker/archive_resolver.go:22`) receive and use the context for Docker API calls. However, the `Analyze` function accepts context but never uses it (`dive/image/analysis.go:20`). In the UI layer, context is passed to `app.Run` (`cmd/dive/cli/internal/ui/v1/app/app.go:23`) and stored in the controller (`cmd/dive/cli/internal/ui/v1/app/controller.go:18`), but the gocui event loop does not receive or observe it.

### 2. How is cancellation handled?

Cancellation is limited. In `cmd/dive/cli/internal/command/adapter/resolver.go:53-54`, `context.WithCancel` is called in `Fetch`, but only the `cancel` function is deferred—the context is not otherwise observed for early exit. The `docker/engine_resolver.go` passes context to Docker API calls (`dockerClient.ImageInspect`, `dockerClient.ImageSave`), which would honor cancellation. No cancellation mechanism exists in the UI layer: the gocui main loop (`cmd/dive/cli/internal/ui/v1/app/app.go:49`) runs until `gocui.ErrQuit` and does not check context. There is no signal handler for SIGINT/SIGTERM.

### 3. Is application state centralized or per-command?

Per-command state. The `options.Application` struct (`cmd/dive/cli/internal/options/application.go:7`) contains sub-structs for Analysis, CI, Export, and UI preferences. This is passed to each command handler in `root.go:58` and forwarded to adapters. The UI layer creates a fresh `v1.Config` from these options (`cmd/dive/cli/internal/ui/v1/config.go`). Global singletons exist for the bus and logger (set via `cli.create` initializers in `cmd/dive/cli/cli.go:29-36`) but application-specific state is not centralized—each component receives what it needs through dependency injection.

### 4. How are sessions modeled?

No explicit session concept exists. The image fetch + analysis flow operates as a single logical session, but nothing encapsulates that lifecycle as a named entity. The closest proxy is the `Analysis` struct (`dive/image/analysis.go:8-18`), which holds results (image tree, efficiency metrics). The bus event system (`internal/bus/bus.go`) publishes progress events but does not model a session entity.

## Architectural Decisions

- **Context origin**: Context comes from cobra's command context (`cmd.Context()`) rather than being created fresh with `context.Background()` or `context.WithCancel`. This allows cobra's built-in cancellation on timeout or interrupt to propagate.
- **Global bus**: The partybus publisher is a package-level singleton (`internal/bus/bus.go:5`), initialized in the CLI initializer. This decouples components but creates implicit global state.
- **Adapter pattern for context**: The `imageActionObserver` adapter (`cmd/dive/cli/internal/command/adapter/resolver.go`) wraps resolvers to inject progress monitoring into context via `SetGenericProgressToContext`. This is the only case where context values carry structured data.
- **TODO comment on context in controller**: The controller storing context (`controller.go:18`) is acknowledged as suboptimal, indicating the authors recognize the anti-pattern but have not yet addressed it.

## Notable Patterns

- **Context chain in image operations**: `Resolver.Fetch(ctx, id)` → `dockerClient.ImageSave(ctx, []string{id})` passes context directly to Docker client, honoring cancellation and timeouts at the transport layer.
- **Context value for progress**: `SetGenericProgressToContext` / `GetGenericProgressFromContext` (`internal/bus/event/payload/generic.go:10-14`) use Go's context value mechanism to thread progress monitors through layers without explicit dependency injection.
- **Package-level globals for infrastructure**: Bus (`internal/bus/bus.go:5`) and logger are global singletons accessed via `Set`/`Get` rather than passed as parameters.

## Tradeoffs

- **Pro**: Context propagation through the fetch/analyze chain enables Docker API cancellation.
- **Con**: Context is not propagated into the TUI event loop, so cancellation cannot interrupt the UI.
- **Con**: `Analyze` accepts but ignores context, indicating incomplete lifecycle awareness at that layer.
- **Con**: Storing context in the controller struct (`controller.go:18`) couples the controller to a specific context lifecycle; the TODO comment acknowledges this smell.
- **Con**: No signal handling means Ctrl+C during the UI will terminate via gocui's internal handling, not graceful context cancellation.

## Failure Modes / Edge Cases

- If Docker API calls hang, context timeout (if set upstream) will not reach them because only `Fetch` creates a cancelable context; `Build` does not (`resolver.go:48`).
- The 3-second warning goroutine in `resolver.go:70-82` leaks slightly: it checks `ctx.Err()` but the goroutine will exit on next send to `time.After`, not on cancellation.
- Progress context values (`GenericProgress`) are tied to context lineage but no cleanup or error handling exists if the progress monitor is absent from context.

## Future Considerations

- Propagate context into the gocui main loop for true cancellation of UI operations.
- Add signal handlers (SIGINT/SIGTERM) that call cancel on the root context.
- Use `context.WithTimeout` for Docker API calls to bound retry loops.
- Remove the stored context from controller (`controller.go:18`) in favor of explicit parameter passing or a context-aware component architecture.

## Questions / Gaps

- No evidence of `context.WithDeadline` usage anywhere in the codebase.
- No evidence of context being used for request-scoped values beyond progress monitoring.
- The CI evaluator (`cmd/dive/cli/internal/command/ci/evaluator.go:79`) accepts context but never uses it.
- The `Analyze` function signature includes context but the implementation ignores it entirely (`dive/image/analysis.go:20`).

---

Generated by `study-areas/07-state-context.md` against `dive`.