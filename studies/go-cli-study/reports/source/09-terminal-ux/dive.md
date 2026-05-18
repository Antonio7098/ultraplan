# Repo Analysis: dive

## Terminal UX & Interaction Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | dive |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/dive` |
| Group | `dive` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

dive is a Docker image layer analysis tool with a full terminal UI built on `gocui`. The UI features a multi-pane layout with layer selection, file tree navigation, filtering, and image details. The project uses a layered architecture with clear separation between views, viewmodels, and controller logic. Color formatting is handled via `fatih/color` with Unicode box-drawing characters for pane borders.

## Rating

**7/10** — Thoughtful and polished TUI with clear keybinding architecture and responsive layout management. The UX is functional and well-organized with good feedback mechanisms (selected pane highlighting, layer comparison bars, status bar with context-sensitive help). The filter pane provides real-time file tree filtering. Minor扣分: no streaming output handling, no progress indicators for long operations, and no graceful interrupt mechanism beyond Ctrl+C (SIGINT) and Ctrl+Z (SIGSTOP job control).

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Terminal library | gocui v1.1.0 imported and used | `go.mod:8` |
| GUI initialization | `gocui.NewGui(gocui.OutputNormal, true)` creates output mode | `cmd/dive/cli/internal/ui/v1/app/app.go:33` |
| Main event loop | `g.MainLoop()` with `gocui.ErrQuit` handling | `cmd/dive/cli/internal/ui/v1/app/app.go:49` |
| Job control (Unix) | SIGSTOP/SIGCONT via `handle_ctrl_z` for backgrounding | `cmd/dive/cli/internal/ui/v1/app/job_control_unix.go:13-18` |
| Layout manager | `layout.Manager` coordinates multiple view positions | `cmd/dive/cli/internal/ui/v1/app/app.go:66-78` |
| View interface | `Renderer` interface with `Update()`, `Render()`, `IsVisible()` | `cmd/dive/cli/internal/ui/v1/view/renderer.go:4-8` |
| Filter view | Real-time regex filtering via `Edit()` intercept | `cmd/dive/cli/internal/ui/v1/view/filter.go:109-128` |
| Color formatting | `fatih/color` wrapper functions for selected/normal states | `cmd/dive/cli/internal/ui/v1/format/format.go:40-68` |
| Unicode box-drawing | Box characters for pane borders and headers | `cmd/dive/cli/internal/ui/v1/format/format.go:28-38` |
| Layer comparison bars | `renderCompareBar()` shows top/bottom layer indicators | `cmd/dive/cli/internal/ui/v1/view/layer.go:256-269` |
| Key binding generation | `Binding` struct with selection-aware rendering | `cmd/dive/cli/internal/ui/v1/key/binding.go:19-24` |
| NoUI fallback | `ui.NoUI` type implements `clio.UI` for non-interactive runs | `cmd/dive/cli/internal/ui/no_ui.go:11-30` |
| Pane cycling | `NextPane()` / `PrevPane()` cycle focus | `cmd/dive/cli/internal/ui/v1/app/controller.go:153-198` |
| VT cleanup | `vtclean` used to compute visible string length | `cmd/dive/cli/internal/ui/v1/format/format.go:80,90` |

## Answers to Protocol Questions

### 1. How is terminal rendering handled?

Rendering is handled via the `gocui` library. Each view (Layer, FileTree, Status, Filter, LayerDetails, ImageDetails) implements the `Renderer` interface (`cmd/dive/cli/internal/ui/v1/view/renderer.go:4-8`). The controller coordinates updates by calling `Update()` then `Render()` on all visible renderers (`cmd/dive/cli/internal/ui/v1/app/controller.go:115-151`). Views use `gui.Update()` to safely mutate the UI from the main loop goroutine (`cmd/dive/cli/internal/ui/v1/view/status.go:89`). Layout is managed by a `layout.Manager` that positions panes using `g.SetView()` and `g.SetManagerFunc()` (`cmd/dive/cli/internal/ui/v1/app/app.go:78`). The layout is responsive: when viewport width < 60 cols, the file tree enters a constrained mode (`cmd/dive/cli/internal/ui/v1/view/filetree.go:466-470`).

### 2. How are loading states shown?

No explicit loading state or progress indicator found. The 100ms sleep in `app.go:31` is a race condition workaround, not UX feedback. There is no spinner, progress bar, or streaming text display during image analysis. The UI simply appears when the analysis is complete. The `no_ui.go` provides a non-interactive fallback but has no progress output mechanism.

### 3. How are prompts implemented?

There are no interactive prompts (yes/no confirmation dialogs, etc.). The UI is entirely driven by keybindings and a filter text input pane. The filter pane intercepts keystrokes via the `Edit()` method (`cmd/dive/cli/internal/ui/v1/view/filter.go:109-128`) and notifies listeners on each keystroke. There is no interactive confirmation or multi-step wizard UX.

### 4. Is the UX interruptible?

Partially. Ctrl+C (SIGINT) is handled by `gocui` as `gocui.ErrQuit` (`cmd/dive/cli/internal/ui/v1/app/app.go:49`). On Unix, Ctrl+Z triggers SIGSTOP via `handle_ctrl_z` (`cmd/dive/cli/internal/ui/v1/app/job_control_unix.go:13-18`), suspending the process and returning to the shell; `gocui.Resume()` restores the TUI on fg. The Windows stub (`job_control_other.go`) does not implement job control. However, there is no graceful shutdown sequence (no Teardown cleanup on interrupt), no way to cancel an in-progress image analysis, and no streaming output that could be interrupted mid-flight.

## Architectural Decisions

- **gocui as the sole TUI framework**: All terminal rendering flows through `gocui.View` objects managed by a single `*gocui.Gui` instance (`app.go:33`). No abstraction layer over gocui; views are tightly coupled to the library.
- **View/ViewModel separation**: Each view has a corresponding viewmodel (e.g., `LayerSetState`, `FileTreeViewModel`) that holds state and produces strings for rendering. This keeps the gocui-specific code isolated from business logic.
- **Controller as coordinator**: The `controller` (`controller.go:14`) mediates between views via event listeners (layer change → update tree, filter edit → update tree). No central event bus for UI; cross-view communication is direct callback.
- **Format package for styling**: A dedicated `format` package (`format/format.go`) wraps `fatih/color` formatters and provides Unicode box-drawing helpers. This centralizes theming but is mixed into every view file.

## Notable Patterns

- **Layout constraint pattern**: Views check available space and adjust rendering accordingly (`filetree.go:466-470`, `layer.go:314-328`). This provides basic responsiveness but is coarse (single threshold at 60 cols).
- **Listener chain**: Layer selection notifies tree, tree option changes notify status, filter edits notify tree. A chain of `[]func() error` listeners propagates state changes across views.
- **Binding registration loop**: Keybindings are declared as `[]BindingInfo` structs with `Config`, `OnAction`, `IsSelected`, and `Display` fields, then generatively converted to `[]*Binding` via `key.GenerateBindings()` (`binding.go:26-47`). This keeps binding declarations centralized and consistent.
- **NoUI interface**: The `clio.UI` interface is implemented by `NoUI` for CI/non-interactive runs, allowing the same application binary to run with or without a TUI (`no_ui.go:11-30`).

## Tradeoffs

- **No streaming/interruptible UX**: Image analysis is a blocking operation; the TUI does not appear until analysis completes. There is no progress feedback and no way to cancel mid-analysis.
- **Direct gocui coupling**: Views inherit `*gocui.Gui` and `*gocui.View` fields directly, making the code difficult to unit test without a terminal.
- **No loading states**: The absence of progress indicators means long-running operations (large image analysis) appear frozen with no user feedback.
- **Windows job control gap**: The `job_control_other.go` stub provides no suspend/resume on Windows, making the UX feel incomplete on that platform.

## Failure Modes / Edge Cases

- **Race condition on Docker init**: A 100ms sleep is inserted before `gocui.NewGui()` to avoid a race condition when running as the first process in a Docker container (`app.go:31`). This is acknowledged as a hack with no clear root cause.
- **View nil panic**: `controller.NextPane()` panics if `CurrentView()` returns nil (`controller.go:157`). This suggests the UI assumptions about view focus may not hold in all states.
- **Filter length cap**: Filter input is capped at 200 characters (`filter.go:63`), silently truncating longer patterns.
- **Constrained layout cliff**: The layout switches abruptly at 60 columns, with no intermediate states or graceful degradation.

## Future Considerations

- Add a progress indicator or streaming text display during image analysis to provide UX feedback for long-running operations.
- Implement a graceful shutdown sequence so that Ctrl+C cleanly terminates in-progress work.
- Consider an abstraction layer over `gocui` to improve testability of view rendering.
- Add an intermediate layout state between "full" and "constrained" (60 cols) for better responsiveness on mid-size terminals.
- Investigate the Docker init race condition more thoroughly to remove the 100ms sleep hack.

## Questions / Gaps

- **No evidence found** for streaming text handling. The analysis output is a complete block; there is no chunked or incremental rendering.
- **No evidence found** for interactive prompts (yes/no dialogs, confirmation flows). The UX is keybinding-driven with no modal interactions.
- **No evidence found** for explicit progress indicators (spinners, progress bars, percentage displays). Loading state is implicit in the absence of the TUI window.
- The job control feature is Unix-only; Windows behavior is undocumented and effectively a no-op.

---

Generated by `study-areas/09-terminal-ux.md` against `dive`.