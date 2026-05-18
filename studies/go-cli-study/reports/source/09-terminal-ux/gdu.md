# Repo Analysis: gdu

## Terminal UX & Interaction Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | gdu |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` |
| Group | `gdu` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

gdu (Go Disk Usage) is a terminal-based disk usage analyzer with a full TUI built on **tview** and **tcell**. It offers three output modes: interactive TUI, non-interactive stdout, and JSON export. The TUI provides keyboard navigation, mouse support, real-time progress updates, and background deletion workers. The implementation is well-structured with clear separation between the TUI package and the non-interactive stdout package.

## Rating

**8/10** — Thoughtful and polished. The TUI is feature-rich with keyboard shortcuts, progress feedback, and interruptibility. Minor deductions for lack of streaming text handling in non-TUI mode and no熊builtin interactive prompts beyond confirmation modals.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Terminal library | Uses `tcell/v2` and `rivo/tview` | `tui/tui.go:21-22` |
| Custom ProgressBar | Custom `ProgressBar` struct rendering Unicode block chars | `tui/progressbar.go:14-107` |
| Progress updates | `updateProgress` goroutine with 100ms ticker | `tui/progress.go:12-68` |
| Terminal tab progress | OSC 9;4 sequence for taskbar progress | `tui/progress.go:70-82` |
| Signal handling | Full signal trapping (SIGINT, SIGTERM, etc.) | `tui/tui.go:316-338` |
| Key handling | `keyPressed` function routing all input | `tui/keys.go:17-77` |
| Help overlay | Formatted help text with dynamic color adaptation | `tui/show.go:16-51,340-401` |
| Mouse support | Mouse capture and event handling | `tui/tui.go:172` |
| Background deletion | Worker pool with `deleteWorkersCount` goroutines | `tui/background.go:18-29` |
| Non-TUI progress | Spinning progress runes `⠇⠏⠋⠙⠹⠸⠼⠴⠦⠧⠇` | `stdout/stdout.go:39` |
| Confirmation modals | `tview.NewModal` for deletion confirmations | `tui/tui.go:539-567` |
| Filtering UX | Tab-triggered filter input with live results | `tui/filter.go` |
| Color theming | Extensive color customization via `Style` config | `cmd/gdu/app/app.go:134-180` |

## Answers to Protocol Questions

### 1. How is terminal rendering handled?

gdu uses the **tcell** and **tview** libraries for terminal rendering. The `UI` struct in `tui/tui.go:26-100` holds all UI primitives: `*tview.Grid`, `*tview.TextView`, `*tview.Table`, `*tview.InputField`, and a custom `*ProgressBar`. Rendering is event-driven via tview's `SetBeforeDrawFunc` (`tui/tui.go:166-169`). The main layout is built in `createGrid()` (`tui/tui.go:216-230`) which assembles header, current directory label, table, and footer into a grid. Screen clearing happens on every draw cycle to handle terminal resizing.

### 2. How are loading states shown?

During directory analysis, `updateProgress` in `tui/progress.go:12-68` runs a goroutine that polls the analyzer every 100ms and updates the progress text view via `QueueUpdateDraw`. It shows: item count, total size, elapsed time, and current item path. For disk-level scans with `showDiskProgressBar` enabled, it writes an OSC 9;4 sequence to stderr to update the terminal taskbar progress (`tui/progress.go:75-77`). The custom `ProgressBar` primitive (`tui/progressbar.go`) renders a segmented bar using Unicode block elements `░` and `█`.

In non-interactive stdout mode, `updateProgress` in `stdout/stdout.go:491-535` uses spinning Unicode characters (`⠇⠏⠋⠙⠹⠸⠼⠴⠦⠧`) in a 100ms tick loop.

### 3. How are prompts implemented?

Prompts are implemented as **tview modal pages**. The `confirmDeletionSelected` function (`tui/tui.go:530-567`) creates a modal with "no", "yes", "don't ask me again" buttons. The `showErr` function (`tui/show.go:313-332`) shows an error modal. The help overlay (`tui/show.go:340-367`) is a scrollable text view in a centered flex layout. All modals use `tview.NewModal` or `tview.NewFlex` and are added to the `pages` stack. Keyboard input during modals is routed through `handleConfirmation` (`tui/keys.go:95-103`) which maps h/l to left/right arrow keys.

### 4. Is the UX interruptible?

Yes. `StartUILoop` (`tui/tui.go:314-338`) sets up signal handlers for SIGINT, SIGTERM, and other signals. When a signal arrives, it prints marked paths and stops the application cleanly. Ctrl+Z is handled via `handleCtrlZ` (`tui/keys.go:134-151`) which suspends the process using job control. The `q` key quits immediately, while `Q` quits and prints the current directory path. Background deletion (`SetDeleteInBackground`) runs workers that can be interrupted when the app exits. The `ui.done` channel signals workers to terminate (`tui/background.go:68-70`).

## Architectural Decisions

- **Two UI stacks**: TUI (`tui/`) and stdout (`stdout/`) are separate packages with a shared `common.UI` embedded in both. The `app/app.go:30-49` defines a `UI` interface abstracting both implementations.
- **Three output modes**: The app decides at runtime whether to show TUI, stdout, or export UI based on flags and TTY detection (`ShouldRunInNonInteractiveMode` at `cmd/gdu/app/app.go:110-131`).
- **Option pattern for TUI customization**: `CreateUI` accepts variadic `Option` functions (`tui/tui.go:114`) to configure colors, progress bars, and behaviors without breaking the constructor.
- **Color mode fallback**: The UI adapts to `NoColor` by setting `color.NoColor = true` (`stdout/stdout.go:87`) and using gray backgrounds for modals (`tui/tui.go:560`).

## Notable Patterns

- **Progress bar widget**: Custom `ProgressBar` struct (`tui/progressbar.go:14-107`) extending `tview.Box` with thread-safe progress state and Unicode block character rendering.
- **Signal-safe exit**: Signal handlers use `QueueUpdateDraw` to safely update UI state from the signal goroutine (`tui/tui.go:331-334`).
- **Worker pool for deletion**: Background deletion uses a bounded queue (`deleteQueue` channel with capacity 1000) and `3 * runtime.GOMAXPROCS(0)` workers (`tui/tui.go:157-158`).
- **Graceful degradation**: When features are disabled (e.g., `noDelete`), help text is patched to show "(disabled)" suffixes (`tui/show.go:384-397`).

## Tradeoffs

- **tview dependency**: Using tview provides rich widgets but couples the TUI to a specific rendering model. There is no support for other TUI libraries like BubbleTea.
- **No streaming text**: The stdout UI prints complete results only after analysis finishes. There is no line-by-line streaming output.
- **Modal-centric UX**: All interactions (confirmation, help, errors) use modal overlays. While functional, this prevents concurrent visibility of help and directory content.
- **Progress only during analysis**: Once analysis completes and the user is browsing, no progress indication exists for rescan operations.

## Failure Modes / Edge Cases

- **Panic recovery in workers**: `deleteWorker` (`tui/background.go:18-29`) recovers from panics and stops the app, preventing orphaned goroutines.
- **Nil currentDir guard**: `fileItemSelected` (`tui/tui.go:408-418`) checks for nil `currentDir` before processing selection.
- **Device selection on non-Linux**: Mount point handling uses platform-specific code in `pkg/device/` with fallbacks for BSD and other OSes.
- **Ignore patterns**: `SetIgnoreDirPatterns` and `SetIgnoreFromFile` can fail with invalid regex patterns, returning errors that bubble up to the caller.

## Future Considerations

- Consider adopting a more modular approach to allow swapping terminal rendering backends (e.g., BubbleTea compatibility).
- Streaming output mode for stdout UI could improve UX for very deep directory trees.
- Terminal tab progress (OSC 9;4) could be extended to other operations beyond disk scanning.

## Questions / Gaps

- No evidence found of interactive prompts for things like "should I follow symlinks?" — these are CLI flags only.
- No clear evidence of terminal window resize handling beyond the `SetBeforeDrawFunc` clearing the screen.
- The stdout UI's progress animation cannot be interrupted; it runs to completion once started.