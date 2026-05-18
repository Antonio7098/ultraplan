# State & Context Management - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Protocol | `study-areas/07-state-context.md` |
| Groups | go-cli-study |
| Date | 2026-05-15 |

## Repositories Studied

| # | Repo | Path | Group |
|---|------|------|-------|
| 1 | age | `/home/antonioborgerees/coding/go-cli-study/repos/age` | 07-state-context |
| 2 | chezmoi | `/home/antonioborgerees/coding/go-cli-study/repos/chezmoi` | go-cli-study |
| 3 | dive | `/home/antonioborgerees/coding/go-cli-study/repos/dive` | 07-state-context |
| 4 | fzf | `/home/antonioborgerees/coding/go-cli-study/repos/fzf` | 07-state-context |
| 5 | gdu | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` | gdu |
| 6 | gh-cli | `/home/antonioborgerees/coding/go-cli-study/repos/gh-cli` | gh-cli |
| 7 | go-task | `/home/antonioborgerees/coding/go-cli-study/repos/go-task` | 07-state-context |
| 8 | helm | `/home/antonioborgerees/coding/go-cli-study/repos/helm` | helm |
| 9 | k9s | `/home/antonioborgerees/coding/go-cli-study/repos/k9s` | k9s |
| 10 | lazygit | `/home/antonioborgerees/coding/go-cli-study/repos/lazygit` | go-cli-study |
| 11 | mitchellh-cli | `/home/antonioborgerees/coding/go-cli-study/repos/mitchellh-cli` | mitchellh-cli |
| 12 | opencode | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` | opencode |
| 13 | rclone | `/home/antonioborgerees/coding/go-cli-study/repos/rclone` | rclone |
| 14 | restic | `/home/antonioborgerees/coding/go-cli-study/repos/restic` | go-cli-study |
| 15 | urfave-cli | `/home/antonioborgerees/coding/go-cli-study/repos/urfave-cli` | go-cli-study |
| 16 | yq | `/home/antonioborgerees/coding/go-cli-study/repos/yq` | 07-state-context |

## Executive Summary

State and context management in Go CLI projects falls into three distinct tiers:

**Tier 1 (Scores 7-8)**: Projects that treat `context.Context` as a first-class parameter and propagate it systematically through all layers. These projects handle cancellation predictably and centralize application state cleanly. Represented by: gh-cli, go-task, helm, k9s, opencode, rclone, restic, urfave-cli.

**Tier 2 (Scores 4-6)**: Projects with mixed or custom patterns—either using `context.Context` narrowly, implementing custom alternatives (EventBox, SignalGroup, custom context stacks), or having significant gaps in propagation. Represented by: chezmoi, dive, fzf, lazygit, mitchellh-cli.

**Tier 3 (Scores 2-3)**: Projects with no `context.Context` usage—either predating it or deliberately avoiding it—relying on stateless designs, direct parameter passing, or custom signal mechanisms. Represented by: age, gdu, yq.

The primary differentiator is not whether a project uses `context.Context` but whether cancellation propagates predictably through long-running operations. Projects that score 7+ all have explicit cancellation wiring to their primary workload; projects that score below 5 either lack cancellation entirely or have it only in isolated locations.

## Core Thesis

**Context discipline correlates with operational maturity.** The highest-scoring projects (gh-cli, go-task, helm, k9s, opencode, rclone, restic) share a common pattern: they create a root context at application entry, optionally wrap it with cancellation on signal, and pass it through every layer that performs I/O or long work. Lower-scoring projects either avoid `context.Context` entirely (age, gdu, yq, mitchellh-cli) or use it inconsistently (dive's Analyze accepts but ignores context; chezmoi's walk function doesn't receive context; fzf uses custom EventBox instead).

The session modeling dimension reveals a different pattern: few projects implement explicit session abstractions. Instead, they model state through: (a) centralized config/state structs (helm's `Configuration`, opencode's `App`, restic's `global.Options`), (b) lock-based coordination for multi-process access (restic), or (c) job/operation tracking (rclone's `Job`, opencode's `Session`, go-task's `Executor`). The absence of a "session" concept in most projects is not a gap—it's a deliberate simplification for single-invocation CLI tools.

## Rating Summary

| Repo | Score | Approach | Main Strength | Main Concern |
|------|-------|----------|---------------|--------------|
| age | 2 | Stateless | Predictable fire-and-forget | No cancellation possible |
| chezmoi | 7 | Centralized Config + BoltDB | Persistent state across runs | Walk function not context-aware |
| dive | 5 | Adapter + Options | Context through fetch chain | Not propagated to TUI loop |
| fzf | 6 | Custom EventBox | High-frequency event coordination | Bypasses standard cancellation |
| gdu | 3 | SignalGroup | Simple signal handling | Cannot interrupt blocking I/O |
| gh-cli | 8 | Factory + Cobra ExecuteContextC | Clean propagation to all commands | Lazy funcs use context.Background() |
| go-task | 8 | Executor + errgroup | Structured parallel cancellation | Deferred uses fresh context |
| helm | 7 | Configuration + action.RunWithContext | Kubernetes client cancellation | No context to storage driver |
| k9s | 7 | Context as DI vehicle | 20 context keys for decoupling | Service locator anti-pattern |
| lazygit | 7 | Custom Context stack | Explicit focus lifecycle | No stdlib context propagation |
| mitchellh-cli | 4 | CLI struct + exit codes | Simple and predictable | No context, no cancellation |
| opencode | 8 | App struct + explicit Session | Parent-child session hierarchy | Some context.Background() in bg ops |
| rclone | 8 | Global defaults + context overrides | 3,685+ context usages | Global fallback hides state |
| restic | 8 | global.Options + errgroup | Lock refresh goroutines | context.TODO() in lock refresh |
| urfave-cli | 7 | Context-first callbacks | All funcs receive context | Caller owns cancellation |
| yq | 3 | Custom Context struct | Simple evaluation state | No lifecycle/cancellation semantics |

## Approach Models

### Model A: Stateless Fire-and-Forget (Score 2-3)
Projects: age, yq, gdu (partially), mitchellh-cli (partially)

These projects treat CLI invocation as a single, non-cancellable operation. No `context.Context` is used. State flows through function parameters. Cancellation is either absent or limited to signal handling that terminates the process.

- **age** (`cmd/age/age.go`): Encrypt/decrypt operates on `io.Reader`/`io.Writer` with no context support. Plugin protocol (`plugin/client.go`) uses synchronous stdin/stdout with no timeout.
- **yq** (`pkg/yqlib/context.go`): Custom `Context` struct tracks evaluation state but carries no cancellation semantics. Stream evaluator processes sequentially.
- **gdu** (`internal/common/signal.go`): Custom `SignalGroup` channel type instead of context. Signal handling exists but cannot interrupt `os.ReadDir`.

Appropriate for: Single-purpose tools that complete quickly and don't need composability with Go's standard library patterns.

### Model B: Centralized Config + Context Propagation (Score 7-8)
Projects: chezmoi, gh-cli, go-task, helm, opencode, rclone, restic, urfave-cli

These projects pass `context.Context` through all layers. Application state is centralized in a config struct passed as a receiver or parameter. Cancellation propagates from signal handlers or explicit `WithCancel`/`WithTimeout` calls.

- **gh-cli** (`internal/ghcmd/cmd.go:142`): `context.Background()` created at startup, passed via `rootCmd.ExecuteContextC(ctx)`. Factory functions lazily initialize but some use `context.Background()` internally.
- **go-task** (`task.go:89`): `errgroup.WithContext(ctx)` propagates cancellation to parallel tasks. Watch mode creates fresh contexts on each file change.
- **helm** (`pkg/cmd/install.go:333-347`): SIGTERM handler calls `cancel()`. Actions use `RunWithContext(ctx, ...)` methods.
- **rclone** (`fs/config.go:793-802`): `GetConfig(ctx)` retrieves per-command config overrides from context, falling back to global singleton.

Appropriate for: Long-running tools, tools that interact with remote services, tools that need composable cancellation.

### Model C: Custom Coordination Patterns (Score 5-7)
Projects: dive, fzf, k9s, lazygit

These projects use `context.Context` in some layers but bypass it for their primary coordination mechanism. They employ custom patterns that predate or intentionally avoid standard context propagation.

- **fzf** (`src/util/eventbox.go`): `sync.Cond`-based pub/sub for inter-goroutine communication. Custom `AtomicBool` for scan cancellation. Context used only for preview timeouts and signal goroutine.
- **k9s** (`internal/keys.go:10-38`): 20 context keys for dependency injection via `context.WithValue`. Uses context as "service locator" which muddies boundaries.
- **lazygit** (`pkg/gui/context.go:17`): Custom `ContextMgr` with explicit stack management for UI focus lifecycle. `stopChan chan struct{}` for background routine termination.

Appropriate for: Interactive TUI tools with complex state coordination needs that `context.Context` wasn't designed to solve.

### Model D: Framework-Level Context (Score 7)
Projects: urfave-cli, chezmoi (partially)

These projects provide context-aware callback interfaces but delegate cancellation management to application code.

- **urfave-cli** (`funcs.go:6-37`): All callback types (`ActionFunc`, `BeforeFunc`, etc.) receive `context.Context` as first param. Library never calls `cancel()` internally—caller manages lifecycle.
- **chezmoi** (`internal/cmd/config.go:660`): `applyArgs` accepts `ctx context.Context`. `SourceState.Read` uses context in directory walks. Template functions create isolated `context.Background()`.

Appropriate for: Library/framework authors who want to pass context through but let applications control cancellation.

## Pattern Catalog

### Pattern 1: Signal-Context Wiring
**What**: Create root context with `WithCancel`, wire signal handlers to call cancel.
**Repos**: helm (`pkg/cmd/install.go:333-347`), go-task (`signals.go:16`), restic (`cmd/restic/cleanup.go:24-38`), k9s (`internal/view/app.go:185-193`)
**Why it works**: Graceful shutdown without leaking goroutines. Signal arrives → cancel called → context.Done() fires → operations observe cancellation.
**When overkill**: Short-running tools that exit quickly regardless.

### Pattern 2: errgroup for Structured Concurrency
**What**: Use `errgroup.WithContext(ctx)` to manage parallel operations. When one fails, all siblings are cancelled.
**Repos**: go-task (`task.go:89, 321`), restic (`cmd/restic/cmd_backup.go:627`)
**Why it works**: Automatic cancellation propagation without manual tracking. Error in one subtask cancels all others.
**When overkill**: Sequential operations where fan-out isn't needed.

### Pattern 3: Context as Config Carrier
**What**: Use `context.WithValue` to thread config/environment through layers without modifying function signatures.
**Repos**: rclone (`fs/config.go:820-826`), k9s (`internal/keys.go:10-38`)
**Why it works**: Reduces parameter explosion for cross-cutting concerns.
**Risk**: String key collisions. Type safety lost without custom key types.

### Pattern 4: Custom Context Stack (UI Focus Management)
**What**: Implement domain-specific `Context` interface with `HandleFocus`, `HandleQuit` lifecycle hooks.
**Repos**: lazygit (`pkg/gui/types/context.go:111-120`)
**Why it works**: Type-safe, UI-specific lifecycle management beyond what stdlib context provides.
**When overkill**: Non-interactive tools or tools without complex focus navigation.

### Pattern 5: Centralized Application State
**What**: Collect all application state in a single `Config`/`App`/`Executor` struct, passed to all operations.
**Repos**: helm (`pkg/action/action.go:119-146`), opencode (`internal/app/app.go:25-40`), go-task (`executor.go:27-84`), restic (`internal/global/global.go:46-89`)
**Why it works**: Simple data flow, easy to mock for testing, clear ownership.
**Risk**: Can become a "god object" if over-used.

### Pattern 6: Lock-Based Session Modeling
**What**: Model multi-process coordination via explicit `Lock` type with background refresh.
**Repos**: restic (`internal/restic/lock.go:105`), rclone (Job.Stop func)
**Why it works**: Enables safe concurrent access to shared resources (repositories).
**When overkill**: Single-process tools, tools without shared resources.

### Pattern 7: Execution Deduplication via Context Map
**What**: Store in-flight operation contexts in a map keyed by content hash to prevent duplicate work.
**Repos**: go-task (`executor.go:81`, `task.go:438-469`)
**Why it works**: Other tasks with same hash wait on `otherExecutionCtx.Done()` rather than running concurrently.
**Risk**: Map entries not cleaned up if task panics.

### Pattern 8: Global Defaults + Context Overrides
**What**: Access global singleton unless context carries override via `WithValue`.
**Repos**: rclone (`fs/config.go:793-802`), k9s (context keys)
**Why it works**: Convenient for simple cases, powerful for testing or command-specific overrides.
**Risk**: Silent fallback to global state can hide bugs.

## Key Differences

### Context Usage vs. Custom Patterns
Projects like fzf and lazygit use custom coordination patterns (EventBox, custom Context stack) because they predate widespread `context.Context` adoption or because `context.Context` doesn't solve their specific problem (high-frequency UI events, explicit focus lifecycle). These projects score in the 6-7 range not because they're poorly designed but because they optimized for different constraints.

### Cancellation Breadth
The difference between a score of 7 and 8 often comes down to whether cancellation reaches all operations. For example:
- **helm**: Context propagates to Kubernetes client calls but NOT to storage driver operations (`pkg/storage/storage.go` methods don't accept context)
- **restic**: Context propagates everywhere except lock refresh which uses `context.TODO()`
- **opencode**: Most operations respect cancellation but some background operations (title generation) use `context.Background()`

### Global State Design
The highest-scoring projects use one of two patterns:
1. **Pass-by-pointer**: `global.Options` in restic, `Config` in helm — state flows through call chain, no global variables
2. **Context-scoped globals**: rclone's `GetConfig(ctx)` — global fallback with context override capability

Lower-scoring projects either use true global variables (yq's `Configured*` vars, age's minimal singletons) or no state management at all (stateless design).

### Session Concept Presence
Only opencode and restic model sessions explicitly. Most projects treat "session" as synonymous with "CLI invocation" and don't need a distinct abstraction. This is a valid design choice—explicit session modeling adds complexity that most CLI tools don't need.

## Tradeoffs

| Pattern | Benefit | Cost | Best Fit | Failure Mode |
|---------|---------|------|----------|--------------|
| No context.Context | Simplicity, no cognitive overhead | Can't cancel long operations | Short-running stateless filters | Hung on slow I/O |
| Context as DI via WithValue | Reduces parameter explosion | Hides dependencies, type unsafe | Cross-cutting concerns | Key collisions, nil panics |
| Centralized Config | Clear ownership, easy testing | Can become god object | Medium-complexity CLIs | Over-coupling |
| Custom EventBox | High performance, type-safe events | Bypasses stdlib patterns | Interactive TUIs | Custom cancellation logic needed |
| Signal + context wiring | Graceful shutdown | Complexity in setup | Long-running operations | Signal during init unhandled |
| errgroup | Automatic sibling cancellation | Implicit coupling | Parallel task execution | Panics don't recover cleanly |

## Decision Guide

**Choose standard `context.Context` propagation when:**
- Operations may exceed a few seconds
- Network I/O is involved (APIs, Kubernetes, Docker)
- Multiple parallel operations need coordinated cancellation
- Integration with Go ecosystem (HTTP clients, database drivers) is needed
- Testability requires ability to mock/cancel operations

**Choose custom patterns when:**
- Primary coordination is high-frequency events (key presses, progress updates)
- UI focus lifecycle management is needed
- Project predates context package adoption and refactor cost exceeds benefit
- Context semantics don't match domain (e.g., evaluation state vs. lifecycle)

**Choose stateless design when:**
- Tool operates on a single input and completes quickly
- No composability with other tools is needed
- No long-running operations exist

**Add explicit session modeling when:**
- Multi-process coordination is required
- State needs to persist across CLI invocations
- Parent-child task relationships need tracking

## Practical Tips

1. **Wire signal to context early**: Create `context.Background()`, wrap with `WithCancel`, pass to signal handler goroutine. This pattern (`pkg/cmd/install.go:333-347`) appears in most 7+ score projects.

2. **Use errgroup for fan-out**: When running parallel operations, `errgroup.WithContext(ctx)` saves explicit cancellation tracking. Works especially well for task dependency graphs.

3. **Pass context to all I/O operations**: Even if you don't check `ctx.Err()` today, passing it enables future cancellation and integrates with timeout-capable libraries.

4. **Store session as explicit struct, not implicit in state**: opencode's `Session` struct (`internal/session/session.go:12-23`) with parent-child hierarchy is more maintainable than ad-hoc session-like fields scattered across structs.

5. **Use typed context keys**: k9s's string-based keys (`"workspaceWatcher"`) risk collisions. Use custom types like opencode's `SessionIDContextKey`.

6. **Separate cleanup context from work context**: restic's `delayedCancelContext()` (`internal/restic/lock.go:290-305`) allows cleanup to complete even after main cancellation.

7. **Check ctx.Done() in loops**: Long-running loops (file traversal, polling) should check `ctx.Err()` or select on `ctx.Done()` to remain responsive to cancellation.

## Anti-Patterns / Caution Signs

1. **`context.Background()` in long operations**: If `Analyze` accepts context but ignores it (`dive/image/analysis.go:20`), the signature is misleading.

2. **No cancellation check in wait loops**: Operations that poll or wait without observing context will hang even when cancellation is requested elsewhere.

3. **Global mutable state without context fallback**: yq's `Configured*` globals and rclone's `globalConfig` work until you need per-command overrides or test isolation.

4. **Template functions spawning isolated contexts**: chezmoi's GitHub template functions create `context.Background()` (`internal/cmd/templatefuncs.go:215`), meaning those operations cannot be cancelled with the command.

5. **Service locator via context.WithValue**: k9s's `ctx.Value(internal.KeyFactory).(dao.Factory)` will panic if factory is not set—silent failure mode.

6. **Deferred commands using fresh context**: go-task's `runDeferred` uses `context.Background()` at `task.go:341`, meaning cleanup cannot be cancelled along with task.

7. **Context stored in struct fields**: dive's controller stores context (`cmd/dive/cli/internal/ui/v1/app/controller.go:18`) with a TODO comment—acknowledged anti-pattern.

## Notable Absences

### No use of `context.WithDeadline`
None of the studied repos use `context.WithDeadline` for operation-level timeouts. Timeouts are implemented via `WithTimeout` or via external mechanisms (kill timers, polling with exit).

### No distributed session coordination
All session/lock coordination is local. No project implements session migration, distributed locking, or cross-node coordination.

### No graceful upgrade patterns
No project implements graceful upgrade or rolling update coordination via session mechanisms.

### No session persistence beyond restart
Only restic's lock persistence (via repository storage) and lazygit's AppState (recent repos) survive process restart. Most CLIs start fresh each invocation.

## Per-Repo Notes

| Repo | Notable Strength | Notable Gap |
|------|------------------|-------------|
| age | Stateless simplicity | No cancellation anywhere |
| chezmoi | BoltDB persistence for cross-run state | Walk function not context-aware |
| dive | Context through fetch/analyze chain | Not propagated to TUI loop |
| fzf | EventBox for high-frequency coordination | Bypasses stdlib context entirely |
| gdu | Simple SignalGroup for CLI | Cannot interrupt os.ReadDir |
| gh-cli | Clean ExecuteContextC propagation | Lazy funcs use context.Background() |
| go-task | errgroup for parallel cancellation | Deferred uses fresh context |
| helm | RunWithContext for K8s ops | No context to storage driver |
| k9s | 20 context keys for DI | Service locator anti-pattern |
| lazygit | Explicit focus lifecycle hooks | No stdlib context propagation |
| mitchellh-cli | Simple and predictable | No context, no cancellation |
| opencode | Explicit Session with parent-child | Some context.Background() in bg |
| rclone | 3,685+ context usages | Global fallback hides state |
| restic | Lock refresh goroutines | context.TODO() in refresh |
| urfave-cli | All callbacks context-aware | Caller owns cancellation |
| yq | Custom evaluation context | No lifecycle semantics |

## Open Questions

1. **Why do some projects (fzf, lazygit) use custom patterns over context?** The EventBox and custom context stack predate widespread context adoption. For fzf, the high-frequency event nature (key presses every 100ms) may have driven the custom solution. For lazygit, the UI-specific lifecycle (focus gained/lost) doesn't map cleanly to stdlib context semantics.

2. **Is context as DI (k9s pattern) an anti-pattern?** The service locator pattern via `ctx.Value(KeyFactory)` is widespread in k9s but violates the principle that context should carry request-scoped values, not application services. The trade-off is convenience vs. explicit dependency injection.

3. **Should deferred commands inherit parent context?** go-task's `runDeferred` using `context.Background()` is deliberate (cleanup should not be cancelled when task is cancelled), but creates inconsistency in context lifecycle discipline.

4. **Why no context.WithDeadline usage?** Projects use `WithTimeout` (which creates a deadline) but not `WithDeadline` directly. This may be because `WithTimeout` is more ergonomic for CLI operations where you want "cancel after X duration" rather than "cancel at absolute time."

## Evidence Index

Key evidence citations by repository:

- **age**: No `context.Context` found—grep returned empty. Plugin sync I/O at `plugin/client.go:78-103`.
- **chezmoi**: `applyArgs` at `internal/cmd/config.go:660`, `SourceState.Read` at `internal/chezmoi/sourcestate.go:998`, `Config` struct at `internal/cmd/config.go:194-291`, `BoltPersistentState` at `internal/chezmoi/boltpersistentstate.go:26-31`.
- **dive**: Context from cobra at `cmd/dive/cli/internal/command/root.go:51`, adapter pattern at `cmd/dive/cli/internal/command/adapter/resolver.go:49`, controller context at `cmd/dive/cli/internal/ui/v1/app/controller.go:18`.
- **fzf**: Signal context at `src/terminal.go:5837`, preview timeout at `src/terminal.go:5455`, EventBox at `src/util/eventbox.go:12-24`, AtomicBool at `src/matcher.go:50`.
- **gdu**: Zero context imports. `SignalGroup` at `internal/common/signal.go:5`, signal handling at `tui/tui.go:317-328`, `App` struct at `cmd/gdu/app/app.go:182-192`.
- **gh-cli**: Root context at `internal/ghcmd/cmd.go:142`, `ExecuteContextC` at `internal/ghcmd/cmd.go:194`, Factory at `pkg/cmdutil/factory.go:16`, CancelError at `pkg/cmdutil/errors.go:38`.
- **go-task**: `Executor.Run` at `task.go:42`, `errgroup.WithContext` at `task.go:89`, signal handling at `signals.go:18`, `Executor` struct at `executor.go:27-84`.
- **helm**: Signal-context wiring at `pkg/cmd/install.go:333-347`, `RunWithContext` at `pkg/action/install.go:284`, `Configuration` struct at `pkg/action/action.go:119-146`.
- **k9s**: Context keys at `internal/keys.go:10-38`, App struct at `internal/view/app.go:51`, Halt/Resume at `internal/view/app.go:334-359`, `defaultContext` pattern at `internal/view/workload.go:107-119`.
- **lazygit**: `ContextMgr` at `pkg/gui/context.go:17`, `stopChan` at `pkg/gui/gui.go:89`, `GuiRepoState` at `pkg/gui/gui.go:231-258`, `Context` interface at `pkg/gui/types/context.go:111-120`.
- **mitchellh-cli**: No context usage. `CLI` struct at `cli.go:49-149`, `Command.Run` at `command.go:26`, signal handling at `ui.go:62-104`.
- **opencode**: Context creation at `cmd/root.go:97-98`, `App` struct at `internal/app/app.go:25-40`, `Session` struct at `internal/session/session.go:12-23`, cancellation via sync.Map at `internal/llm/agent/agent.go:117-133`.
- **rclone**: `GetConfig` at `fs/config.go:793-802`, context creation at `cmd/cmd.go:241`, sync cancellation at `fs/sync/sync.go:204-218`, `Job` struct at `fs/rc/jobs/job.go:34-52`.
- **restic**: Global context at `cmd/restic/cleanup.go:14-22`, signal handler at `cmd/restic/cleanup.go:24-38`, `global.Options` at `internal/global/global.go:46-89`, `Lock` struct at `internal/restic/lock.go:105`, `delayedCancelContext` at `internal/restic/lock.go:290-305`.
- **urfave-cli**: All callback types at `funcs.go:6-37`, `Command.Run` at `command_run.go:92-94`, command in context at `command_run.go:135`.
- **yq**: No `context` imports. Custom `Context` at `pkg/yqlib/context.go:10-15`, `StreamEvaluator` at `pkg/yqlib/stream_evaluator.go:20-27`, global `Configured*` at `pkg/yqlib/yaml.go:40`.

---

Generated by protocol `study-areas/07-state-context.md`.