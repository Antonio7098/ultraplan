# Repo Analysis: k9s

## Terminal UX & Interaction Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | k9s |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/k9s` |
| Group | `09-terminal-ux` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

k9s is a Kubernetes CLI that provides a full-screen terminal UI for cluster management. It uses `tview` and `tcell` for terminal rendering, implementing a sophisticated multi-component UI with prompts, tables, logs, dialogs, and flash notifications. The UX is highly interactive with extensive keyboard shortcuts, command buffering with fuzzy suggestions, and graceful handling of streaming data and interrupts.

## Rating

**8/10** — Thoughtful and polished terminal experience with comprehensive interactive features. The UX is feature-rich with good interruptibility, though it relies on forked versions of terminal libraries rather than upstream.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Terminal library | `github.com/derailed/tview v0.8.5` dependency | `go.mod:13` |
| Terminal library | `github.com/derailed/tcell/v2 v2.3.1-rc.4` dependency | `go.mod:12` |
| Flex layout | App main layout using `tview.NewFlex().SetDirection(tview.FlexRow)` | `internal/view/app.go:170` |
| TextView usage | Log viewer uses `tview.NewTextView()` | `internal/view/log.go:41` |
| Form dialogs | Confirmation dialogs using `tview.NewForm()` | `internal/ui/dialog/confirm.go:19` |
| Modal forms | Modal confirmation using `tview.NewModalForm()` | `internal/ui/dialog/confirm.go:58` |
| Table view | Table extends `ui.Table` which wraps `tview.Table` | `internal/view/table.go:24` |
| Prompt component | Prompt struct using `tview.TextView` | `internal/ui/prompt.go:79-90` |
| Prompt keyboard | Keyboard input handling with escape sequence filtering | `internal/ui/prompt.go:144-193` |
| Command buffer | CmdBuff manages command state with suggestions | `internal/model/cmd_buff.go:40-72` |
| Flash messages | Flash display with emoji and color coding | `internal/ui/flash.go:70-85` |
| Status indicator | StatusIndicator shows cluster info (CPU, memory, context) | `internal/ui/indicator.go:18-25` |
| Flash model | Flash model with auto-clear delay | `internal/model/flash.go:57-71` |
| Cluster refresh | Exponential backoff for cluster connectivity checks | `internal/view/app.go:372-391` |
| Log streaming | Log viewer with ANSI writer for colored output | `internal/view/log.go:96` |
| Auto-scroll toggle | Toggle auto-scroll in log viewer | `internal/view/log.go:505-516` |
| Log flush timeout | Configurable flush timeout for log buffering | `internal/view/log.go:36` |
| Interrupt handling | SIGHUP signal handling for graceful exit | `internal/view/app.go:185-193` |
| Ctrl+C handling | Quit command with optional no-exit on Ctrl+C | `internal/view/app.go:695-709` |
| Component halt | Halt/Resume pattern for stopping components | `internal/view/app.go:333-359` |
| Context cancel | Context cancellation for log operations | `internal/model/log.go:49` |
| Dialog dismissal | DoneFunc callback for dialog dismissal | `internal/ui/dialog/confirm.go:61-64` |
| Suggestion nav | Up/Down arrows for suggestion navigation | `internal/ui/prompt.go:175-183` |
| Tab completion | Tab/Right/Ctrl+F for autocomplete | `internal/ui/prompt.go:185-189` |
| Input validation | Filter escape sequences and control characters | `internal/ui/prompt.go:158-162` |

## Answers to Protocol Questions

### 1. How is terminal rendering handled?

k9s uses `github.com/derailed/tview` and `github.com/derailed/tcell` (forked from the original `github.com/gdamore/tcell` and `rivo/tview`) for terminal rendering. The main app layout (`internal/view/app.go:170`) is built with `tview.NewFlex()` arranged in a vertical row:

```go
main := tview.NewFlex().SetDirection(tview.FlexRow)
main.AddItem(a.statusIndicator(), 1, 1, false)
main.AddItem(a.Content, 0, 10, true)
main.AddItem(flash, 1, 1, false)
```

The `App` struct (`internal/view/app.go:44-59`) maintains a `Content *PageStack` for view management and uses `ui.NewApp(cfg, ...)` from the `ui` package. Views are composed of primitives like `tview.Flex`, `tview.TextView`, `tview.Table`, `tview.Form`, and `tview.TreeNode` for different components.

Skins/theming are supported via `config.Styles` with dynamic color changes - styles can be reloaded at runtime via `ReloadStyles()` (`internal/view/app.go:77-80`).

### 2. How are loading states shown?

**Flash Messages**: The `Flash` component (`internal/ui/flash.go`) displays temporary messages with emoji indicators:
- Info: `😎` with aqua color
- Warning: `😗` with orange color
- Error: `😡` with orange-red color

Flash messages auto-clear after a configurable delay (default 6 seconds) via `Flash.refresh()` (`internal/model/flash.go:140-150`).

**StatusIndicator**: When the header is collapsed, a compact status indicator (`internal/ui/indicator.go`) shows:
- K9s version
- Cluster context and name
- Kubernetes version
- CPU and memory usage with delta indicators

**Connection State**: The app tracks connectivity state with `conRetry` counter. When connection fails, it shows "Dial K8s Toast [n/m]" messages (`internal/view/app.go:426`). After max retries, it bails out with `ExitStatus` set.

**Cluster Refresh**: Uses exponential backoff (`model.NewExpBackOff`) for periodic cluster info refreshes (`internal/view/app.go:372`).

**Splash Screen**: A splash page is shown on startup for 1 second (configurable) (`internal/view/app.go:38, 180-182, 551-561`).

### 3. How are prompts implemented?

**Prompt Component**: The `Prompt` struct (`internal/ui/prompt.go:78-90`) wraps `tview.TextView` and manages user command input. It uses a `PromptModel` interface backed by `FishBuff` (`internal/model/fish_buff.go`).

**Command Mode Detection**: `InCmdMode()` (`internal/ui/prompt.go:202-208`) returns true when the model is active and has text. This is used throughout the app to detect when to route keyboard events to the command buffer vs. the current view.

**Keyboard Handling**: The prompt captures keyboard input (`internal/ui/prompt.go:144-193`) with specific handling for:
- Backspace/Delete: removes characters
- Escape: clears and deactivates
- Enter/Ctrl+E: submits command
- Up/Down arrows: navigate suggestions
- Tab/Right/Ctrl+F: autocomplete current suggestion

**Input Validation**: `isValidInputRune()` (`internal/ui/prompt.go:303-313`) filters out terminal escape sequences and control characters (except Tab, Newline, Return) to prevent cursor position reports (e.g., `[7;15R`) from being added to the command buffer.

**Command Buffer**: `CmdBuff` (`internal/model/cmd_buff.go`) manages the command state with:
- Debounced input completion (100ms after typing, 800ms after delete)
- Listener pattern for notifying views of buffer changes
- Support for command and filter buffer kinds

**Suggestions**: The `Suggester` interface (`internal/ui/prompt.go:28-40`) provides fuzzy matching suggestions via `CurrentSuggestion()`, `NextSuggestion()`, `PrevSuggestion()`. The app's `suggestCommand()` (`internal/view/app.go:195-227`) provides command and namespace suggestions.

### 4. Is the UX interruptible?

**Yes, comprehensively.**

**Signal Handling**: `initSignals()` (`internal/view/app.go:185-193`) catches `SIGHUP` for graceful exit:

```go
func (*App) initSignals() {
    sig := make(chan os.Signal, 1)
    signal.Notify(sig, syscall.SIGHUP)
    go func(sig chan os.Signal) {
        <-sig
        os.Exit(0)
    }(sig)
}
```

**Ctrl+C Handling**: The `quitCmd` (`internal/view/app.go:695-709`) checks if in command mode and whether `noExit` is configured. If `NoExitOnCtrlC` is set, Ctrl+C in command mode returns the event unchanged rather than quitting.

**Component Lifecycle**: The `Halt()`/`Resume()` pattern (`internal/view/app.go:333-359`) allows stopping and restarting background operations:
- Cancels the context via `cancelFn`
- Restarts cluster updater goroutine
- Reinitializes config/skin/view watchers

**Log Interruptibility**: The `Log` viewer (`internal/view/log.go`) supports:
- `LogStop()` / `LogResume()` for pausing updates (`internal/view/log.go:125-140`)
- Cancel context via `cancelFn`
- Toggle auto-scroll, fullscreen, timestamps, wrapping at runtime

**Dialog Interruptibility**: All dialogs have keyboard handling for dismissal (e.g., `SetDoneFunc` in `confirm.go:61-64`). The `Escape` key generally dismisses dialogs.

**Context Cancellation**: The app uses `context.WithCancel` extensively for cancelling background operations (logs, cluster updates, watchers).

## Architectural Decisions

1. **Forked terminal libraries**: k9s uses `github.com/derailed/tcell` and `github.com/derailed/tview` rather than upstream, suggesting custom modifications or a different release cadence.

2. **Component-based architecture**: Views implement a `Component` interface with `Init()`, `Start()`, `Stop()`, `Name()`, `InCmdMode()`, and `Hints()` methods, providing consistent lifecycle management.

3. **Model-View separation**: UI state is managed in `internal/model` packages (`CmdBuff`, `Flash`, `Log`, `ClusterInfo`) while rendering happens in `internal/view` and `internal/ui`.

4. **Listener pattern**: Heavy use of listener interfaces (`BuffWatcher`, `LogsListener`, `FlashListener`, `ClusterListener`) for decoupled communication between models and views.

5. **Skin/theming system**: Dynamic styles that can be reloaded at runtime via skin files, with change notification to all listening components.

## Notable Patterns

1. **Queue-based UI updates**: `app.QueueUpdateDraw()` for thread-safe UI updates from goroutines (`internal/view/app.go:122`).

2. **Debounced input**: Command buffer uses timeouts to debounce input completion, avoiding excessive model updates while typing.

3. **Exponential backoff**: Connection retry uses exponential backoff with a 2-minute max delay.

4. **Flexible layouts**: `PageStack` allows pushing/popping views, supporting navigation history.

5. **Action map**: `ui.KeyMap` maps keyboard events to named actions with enable conditions.

## Tradeoffs

1. **Forked dependencies**: Using `derailed/tcell` and `derailed/tview` forks means potential maintenance burden and divergence from upstream bug fixes.

2. **Complexity**: The component system, while powerful, adds complexity. Understanding the lifecycle (Init → Start → Stop) requires tracing through multiple files.

3. **No built-in progress bars**: Long operations show flash messages rather than progress bars. The cluster refresh uses a simple indicator rather than percentage progress.

4. **Memory buffering for logs**: Log viewer buffers lines with a configurable `BufferSize` (`internal/view/log.go:94`), which could be memory-intensive for very large logs.

## Failure Modes / Edge Cases

1. **Connection loss**: If Kubernetes connectivity is lost, k9s shows warning flashes, stops view refreshes, and eventually bails out after `MaxConnRetry` (default 3) attempts.

2. **Escape sequence pollution**: Prompt filters control characters but could still have edge cases with unusual terminal emulators.

3. **Log buffer overflow**: With `BufferSize` limit, oldest log lines are dropped when buffer is full.

4. **Context switching**: When switching contexts, the `Halt()`/`Resume()` pattern ensures clean shutdown/startup but could lose in-flight operations.

5. **Skin file errors**: Invalid skin files are caught at reload time with warning logs, but could leave UI in an inconsistent state temporarily.

## Future Considerations

1. **Upstream library migration**: Consider migrating to upstream `github.com/rivo/tview` if all needed features are available.

2. **Progress indicators**: Add proper progress bars for long-running operations like container log retrieval or scaling operations.

3. **Streaming optimization**: Consider lazy loading or virtual scrolling for very large log outputs.

4. **Configuration hot-reload**: Already partially implemented with `ConfigWatcher`, `SkinsDirWatcher`, `CustomViewsWatcher`, but could be more comprehensive.

## Questions / Gaps

1. **Why forked libraries?** The commit history or documentation doesn't explain why `derailed/tcell` and `derailed/tview` forks are used rather than upstream.

2. **No evidence found** for mouse interaction handling. While k9s is keyboard-focused, mouse support could enhance some interactions (e.g., table selection).

3. **Limited evidence found** for screen reader/accessibility support. The `noIcons` option suggests awareness of accessibility, but no screen reader announcements or aria labels.

---

Generated by `study-areas/09-terminal-ux.md` against `k9s`.