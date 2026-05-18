# Repo Analysis: lazygit

## Error Handling Philosophy

### Repo Info

| Field | Value |
|-------|-------|
| Name | lazygit |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/lazygit` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

lazygit employs a pragmatic layered error handling strategy. It wraps errors for stack trace context using the `go-errors/errors` package, distinguishes between user-facing errors (shown in GUI panels via `DisabledReason.ShowErrorInPanel`) and operational errors (logged internally), and uses sentinel errors for control flow (e.g., `gocui.ErrQuit`). Custom typed errors like `ErrKeybindingNotHandled` implement the `Unwrap()` interface for composition. The overall approach is mid-range: consistent error wrapping exists in config parsing and migration paths, but many code paths still log errors at `Error` level without structured user-facing alternatives.

## Rating

**6/10** — Some wrapping and contextual errors, with clear separation between operational logging and user-facing feedback. However, many git operations fail silently in the GUI (errors logged but not surfaced), and sentinel error usage is limited to control-flow cases. The custom error types are few but well-implemented.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Error wrapping with `%w` | `fmt.Errorf("The config at `%s` couldn't be parsed, please inspect it before opening up an issue.\n%w", path, err)` | `pkg/config/app_config.go:196` |
| Error wrapping with `%w` | `fmt.Errorf("The config at `%s` has a validation error.\n%w", path, err)` | `pkg/config/app_config.go:202` |
| Error wrapping with `%w` | Migration error chains: `fmt.Errorf("Couldn't migrate config file at `%s` for key %s: %w", ...)` | `pkg/config/app_config.go:282` |
| Sentinel error | `var ErrInvalidCommitIndex = errors.New("invalid commit index")` | `pkg/commands/git_commands/commit.go:11` |
| Sentinel error | `ErrQuit = standardErrors.New("quit")` | `pkg/gocui/gui.go:35` |
| Sentinel error | `ErrKeybindingNotHandled = standardErrors.New("keybinding not handled")` | `pkg/gocui/gui.go:38` |
| Sentinel error | `ErrUnknownView = standardErrors.New("unknown view")` | `pkg/gocui/gui.go:32` |
| Custom typed error | `type ErrKeybindingNotHandled struct { DisabledReason *DisabledReason }` with `Unwrap()` | `pkg/gui/types/keybindings.go:81-91` |
| `errors.Is` usage | `if errors.Is(err, gocui.ErrQuit)` | `pkg/integration/clients/tui.go:217` |
| `errors.Is` usage | `if errors.Is(err, gocui.ErrUnknownView)` | `pkg/gui/views.go:83` |
| `errors.As` usage | `var notHandledError *types.ErrKeybindingNotHandled` then `errors.As(err, &notHandledError)` | `pkg/gui/popup/popup_handler.go:85` |
| Error type differentiation | `ToastKindError` vs `ToastKindStatus` for user notification | `pkg/gui/types/common.go:152-153` |
| Error logging | `self.Log.Errorf("failed to check if worktree path `%s` exists\n%v", path, err)` | `pkg/commands/git_commands/worktree_loader.go:151` |
| Error stack wrapper | `utils.WrapError(err)` uses `go-errors/errors.Wrap` for stack traces | `pkg/utils/errors.go:13` |
| `go-errors` usage | `github.com/go-errors/errors` imported in `pkg/utils/errors.go:3` | `pkg/utils/errors.go:3` |
| `go-errors` usage | `errors.New("unexpected git output")` in `pkg/commands/git_commands/commit.go:201` | `pkg/commands/git_commands/commit.go:201` |
| User-facing error struct | `type DisabledReason struct { Text string; ShowErrorInPanel bool }` | `pkg/gui/types/common.go:218-220` |
| Error panel display | `return &types.DisabledReason{Text: err.Error(), ShowErrorInPanel: true}` | `pkg/gui/controllers/local_commits_controller.go:1390` |
| Logging vs returning | `if err != nil { self.Log.Error(err); return err }` pattern | `pkg/commands/git_commands/file_loader.go:52` |

## Answers to Protocol Questions

### 1. Are errors wrapped with context?

**Partial.** Error wrapping with `%w` is used consistently in the config/loading subsystem (e.g., `pkg/config/app_config.go:196-202`), providing context about which file failed to parse. However, in the main git command execution layer, errors from git commands are often passed through without wrapping, returning raw errors from command execution. The `utils.WrapError` function wraps errors with stack traces using the `go-errors` package, but it's only applied in specific places (e.g., `pkg/commands/oscommands/os.go:174`).

Evidence of context-rich wrapping:
- `pkg/config/app_config.go:196`: `fmt.Errorf("The config at `%s` couldn't be parsed, please inspect it before opening up an issue.\n%w", path, err)`
- `pkg/config/app_config.go:282`: `fmt.Errorf("Couldn't migrate config file at `%s` for key %s: %w", path, strings.Join(pathToReplace.oldPath, "."), err)`

Evidence of missing wrapping:
- `pkg/commands/git_commands/commit.go:196`: `return Author{}, err` — error returned without context

### 2. Which errors are user-facing vs operational?

**Clear separation exists for some cases.** User-facing errors are communicated via `DisabledReason` structs with `ShowErrorInPanel: true` (e.g., `pkg/gui/controllers/local_commits_controller.go:1390`). Operational errors (e.g., failed git status calls) are logged via `self.Log.Error(err)` and not surfaced to the user directly in the GUI.

- User-facing: `types.DisabledReason{Text: err.Error(), ShowErrorInPanel: true}` at `pkg/gui/controllers/local_commits_controller.go:1390`
- User-facing: `types.DisabledReason{Text: self.c.Tr.CannotMoveCommitsFromDetachedHead, ShowErrorInPanel: true}` at `pkg/gui/controllers/helpers/refs_helper.go:576`
- Operational (logged only): `self.Log.Error(err)` at `pkg/commands/git_commands/file_loader.go:52`

However, many git operation failures result in errors being logged but not shown to users. The GUI continues running but the operation fails silently from the user's perspective.

### 3. How are fatal vs recoverable failures handled?

**Limited distinction.** The codebase does not have a systematic way to mark certain errors as fatal vs recoverable. The main control flow sentinel `gocui.ErrQuit` is used to gracefully exit the main loop (`pkg/integration/clients/tui.go:217-218`). For other errors, there is no structured "fatal" classification. Errors in config parsing cause the app to exit via `log.Fatalf` (`pkg/app/app.go:59`), but most other errors are either logged or surfaced as disabled reasons.

- Graceful quit handling: `pkg/gocui/gui.go:714` — `finish` returns `ErrQuit`
- Fatal config error: `pkg/app/app.go:59` — `log.Fatalf("%s: %s\n\n%s", common.Tr.ErrorOccurred, constants.Links.Issues, stackTrace)`
- Non-fatal errors: `if err != nil { self.Log.Error(err) }` pattern used throughout

### 4. Are sentinel errors used for programmatic checking?

**Yes, for control flow.** Sentinels like `gocui.ErrQuit`, `gocui.ErrUnknownView`, and `ErrKeybindingNotHandled` are checked via `errors.Is`. The `ErrInvalidCommitIndex` at `pkg/commands/git_commands/commit.go:11` is a true programmatic sentinel used in `pkg/gui/controllers/commit_message_controller.go:163`.

- `errors.Is(err, gocui.ErrQuit)` at `pkg/integration/clients/tui.go:217`
- `errors.Is(err, gocui.ErrUnknownView)` at `pkg/gui/views.go:83`
- `errors.Is(err, git_commands.ErrInvalidCommitIndex)` at `pkg/gui/controllers/commit_message_controller.go:163`
- Custom `ErrKeybindingNotHandled` with `Unwrap()` at `pkg/gui/types/keybindings.go:89-90`

However, many errors are not wrapped in custom sentinels, making granular programmatic checking impossible.

## Architectural Decisions

1. **Uses `go-errors/errors` for stack-trace-wrapped errors** (`pkg/utils/errors.go:8-13`) instead of standard library, providing stack traces at the top level for debugging. This is a deliberate choice to aid debugging of CLI issues.

2. **Sentinel errors for control flow** — `gocui.ErrQuit`, `ErrUnknownView`, and `ErrKeybindingNotHandled` are used to control application flow (exit, view assertions, keybinding dispatch chaining), following Go idioms with `errors.Is` checks.

3. **`DisabledReason` pattern for user-facing errors** — Actions that cannot be performed are represented as `DisabledReason` structs with `ShowErrorInPanel: true`, surfacing errors in the GUI without throwing exceptions. This separates "this action is disabled" from "an error occurred."

4. **Toast notifications with `ToastKindError`** — Errors that are not critical enough for a panel are shown as toasts (`pkg/gui/status/status_manager.go:95` uses `gocui.ColorRed` for `ToastKindError`), giving users transient feedback without blocking.

5. **Errors from git commands are often untyped** — Most git command errors are propagated as raw `exec.Run()` errors without custom error types or wrapping, making it difficult for callers to programmatically handle specific failure modes.

## Notable Patterns

- **`DisabledReason{ShowErrorInPanel: true}`** — Used to surface errors in a panel when an action is disabled. Prevalent across controllers. See `pkg/gui/controllers/helpers/refs_helper.go:576-585` for multiple examples.

- **`errors.Is` / `errors.As` chain** — `ErrKeybindingNotHandled` implements `Unwrap()` to chain to `gocui.ErrKeybindingNotHandled` (`pkg/gui/types/keybindings.go:89-90`), enabling callers to check at either level.

- **`go-errors/errors.Wrap` for stack traces** — `pkg/utils/errors.go:13` wraps errors with stack traces, used in OS command layer (`pkg/commands/oscommands/os.go:174`).

- **Toast-based error feedback** — `ToastKindError` with 4-second display (vs 2 seconds for status toasts) at `pkg/gui/status/status_manager.go:63`, used for transient errors via `ErrorToast`.

## Tradeoffs

1. **Stack trace overhead** — Using `go-errors/errors` adds overhead for every wrapped error. The `WrapError` function at `pkg/utils/errors.go:8-13` is applied selectively (file operations), not universally, suggesting awareness of this cost.

2. **Inconsistent error surfacing** — Some errors (config parsing) are surfaced clearly with context; others (git command failures in file loader at `pkg/commands/git_commands/file_loader.go:52`) are only logged. Users may not know something went wrong.

3. **No typed errors for git failures** — Git command errors are all returning the same `exec.Run()` error type. Callers cannot distinguish "git not found" from "repository doesn't exist" without parsing error messages.

4. **Silent failure in some operations** — The pattern `if err != nil { self.Log.Error(err) }` without returning means operations fail silently in the GUI. See `pkg/commands/git_commands/file_loader.go:52-53` where the error is logged but execution continues.

## Failure Modes / Edge Cases

- **Config file corruption** — Errors are caught and wrapped with context at `pkg/config/app_config.go:196-202`, but the application still exits. The error message tells users to inspect the file before opening an issue.

- **Git not installed** — Would surface as a generic error from `exec.LookPath` or `exec.Run`, not a custom sentinel. Users see `log.Fatalf` with stack trace.

- **Worktree path doesn't exist** — Handled gracefully with `errors.Is(err, iofs.ErrNotExist)` check at `pkg/commands/git_commands/worktree_loader.go:148`, returning `false` rather than propagating the error.

- **Keybinding conflicts** — When a keybinding is not handled, returns `ErrKeybindingNotHandled` (`pkg/gui/types/keybindings.go:81`) which can be chained via `Unwrap()`. The GUI checks `errors.Is` at multiple levels to decide whether to fall through to default bindings (`pkg/gocui/gui.go:1555`).

## Future Considerations

1. **Typed git errors** — Introduce custom error types for common git failure modes (not found, not a repo, dirty working tree) to enable programmatic recovery.

2. **Consistent error surfacing** — Audit `self.Log.Error(err)` calls that don't surface to the user and consider adding `DisabledReason` or toast feedback for operation failures that affect user intent.

3. **Context propagation in command layer** — Wrap errors in `pkg/commands/git_commands/*.go` with operation context (e.g., "loading commits", "reading rebase-todo") before returning, similar to what's done in config parsing.

## Questions / Gaps

1. **Why use `go-errors/errors` package instead of standard library + `%+v`?** The custom stack trace wrapping adds debugging value, but it's an external dependency. What specific debugging scenario motivated this choice?

2. **Is the silent failure pattern in file loader intentional?** At `pkg/commands/git_commands/file_loader.go:52-53`, errors are logged but execution continues with potentially incomplete data. Was this a deliberate choice for availability over correctness?

3. **Is there a strategy for i18n of error messages?** The `DisabledReason.Text` uses translation keys (e.g., `self.c.Tr.CannotMoveCommitsFromDetachedHead`). If errors are wrapped with user messages, how are those messages translated?

---

Generated by `study-areas/05-error-handling.md` against `lazygit`.