# Repo Analysis: rclone

## Terminal UX & Interaction Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | rclone |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/rclone` |
| Group | `rclone` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

rclone implements terminal UX through a combination of raw VT100 escape codes and the `liner` library for interactive input. Progress display is implemented via periodic stats printing with cursor movement tricks. The project does not use modern TUI frameworks like BubbleTea or tcell (except in `ncdu` which uses tcell). The UX is functional but utilitarian, prioritizing correctness over visual polish.

## Rating

**6/10** — Functional but rough

rclone's terminal UX works reliably but lacks the polish of modern CLI frameworks. The progress bar uses basic VT100 escape sequences for cursor manipulation rather than a dedicated TUI library. The config system presents interactive prompts via line-by-line input without menu-based navigation. While interruptibility is present (Ctrl+C aborts liner prompts, SIGINFO support on BSD), the overall experience feels dated compared to tools using BubbleTea or similar frameworks.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Terminal escape codes | VT100 constants (EraseLine, MoveUp, MoveToStartOfLine, colors) | `lib/terminal/terminal.go:17-68` |
| Terminal initialization | `Start()` uses `colorable` for cross-platform color support | `lib/terminal/terminal.go:76-97` |
| Progress bar implementation | `startProgress()` intercepts `SyncPrintf` and logs, prints stats every 500ms | `cmd/progress.go:24-71` |
| Progress rendering | `printProgress()` uses VT100 escape sequences for in-place updates | `cmd/progress.go:78-119` |
| Stats string formatting | `String()` method formats transfer stats with ETA, speed, percentages | `fs/accounting/stats.go:412-529` |
| Progress flag definition | `--progress` / `-P` flag shows progress during transfer | `fs/config.go:401-404` |
| Terminal title update | Writes ETA to terminal title when `progress_terminal_title` enabled | `fs/accounting/stats.go:464-467` |
| Readline-style input | Uses `liner.NewLiner()` with multi-line mode and Ctrl+C aborts | `fs/config/ui.go:48-63` |
| Password reading | `ReadPassword()` reads without local echo via terminal package | `lib/terminal/terminal_normal.go:27-34` |
| Interactive prompts | `CommandDefault`, `Confirm`, `Choose`, `Enter` functions for config UI | `fs/config/ui.go:80-231` |
| NCDU TUI | Uses `tcell.Screen` from `github.com/gdamore/tcell/v2` | `cmd/ncdu/ncdu.go:128` |
| NCDU rendering | `Print`, `Printf`, `Line`, `Box` methods for screen output | `cmd/ncdu/ncdu.go:182-311` |
| SIGINFO handler | BSD platforms handle SIGINFO to print stats on demand | `cmd/siginfo_bsd.go:15-22` |
| Non-interactive fallback | Reads from `bufio.Reader` when not a terminal | `fs/config/ui.go:36-46` |

## Answers to Protocol Questions

### 1. How is terminal rendering handled?

rclone uses raw VT100 escape codes defined in `lib/terminal/terminal.go:17-68`. Constants like `EraseLine` (`"\x1b[2K"`), `MoveUp` (`"\x1b[1A"`), and `MoveToStartOfLine` (`"\x1b[1G"`) are used directly in `cmd/progress.go:78-119` to implement in-place progress updates.

The `terminal.Start()` function (`lib/terminal/terminal.go:76-97`) initializes the output writer using the `colorable` library (`github.com/mattn/go-colorable`) to handle cross-platform color support, including Windows console virtual terminal processing.

The one exception is `ncdu` which uses the `tcell` library (`github.com/gdamore/tcell/v2`) for a proper screen-based TUI (`cmd/ncdu/ncdu.go:17`). This provides keyboard handling, screen content management, and styled text rendering. However, the main rclone commands (copy, sync, etc.) do not use tcell.

### 2. How are loading states shown?

Loading/transfer progress is shown via the `--progress` flag (`fs/config.go:401-404`). When enabled, `cmd/progress.go:24-71` starts a goroutine that prints stats every 500ms (configurable via `--stats` interval).

The `printProgress()` function (`cmd/progress.go:78-119`) uses VT100 escape sequences to:
1. Move cursor up to the start of the previous stats block
2. Erase all previous lines
3. Write new stats in the same location

Stats are formatted by `StatsInfo.String()` (`fs/accounting/stats.go:412-529`) which shows:
- Transferred bytes / total bytes with percentage
- Transfer speed (bytes/sec or bits/sec based on `DataRateUnit`)
- ETA (estimated time remaining)
- Error counts, check/transfer queue sizes

The progress bar is text-based, not graphical. It displays numeric stats rather than visual progress indicators like `[=====>    ]`.

### 3. How are prompts implemented?

Interactive prompts are implemented in `fs/config/ui.go` using the `liner` library (`github.com/peterh/liner`):

- `ReadLine()` (`fs/config/ui.go:36-64`): Reads a line with prompt, supports multi-line input (`SetMultiLineMode(true)`) and Ctrl+C aborts (`SetCtrlCAborts(true)`). Falls back to `bufio.Reader` if not a terminal.

- `CommandDefault()` (`fs/config/ui.go:80-109`): Presents a list of single-character choices (e.g., "yYes", "nNo"), prompts for input, validates and returns selected character.

- `Confirm()` (`fs/config/ui.go:117-125`): Yes/No prompt using `CommandDefault`.

- `Choose()` (`fs/config/ui.go:128-207`): Numbered menu selection with optional help text, supports default values and custom input.

- `Enter()` (`fs/config/ui.go:209-231`): Free-form text input with type-specific prompts.

- `ChoosePassword()` (`fs/config/ui.go:233-275`): Offers options to type, generate, or skip password with strength selection.

Passwords are read via `ReadPassword()` (`lib/terminal/terminal_normal.go:27-34`) which disables local echo.

### 4. Is the UX interruptible?

Yes, with limitations:

- **Line editing interrupt**: `liner.SetCtrlCAborts(true)` (`fs/config/ui.go:53`) means Ctrl+C aborts the current line input and returns control to the caller.

- **SIGINFO support** (BSD only): `cmd/siginfo_bsd.go:15-22` catches `SIGINFO` and prints current stats via `fs.Printf(nil, "%v\n", accounting.GlobalStats())`. Non-BSD platforms have an empty `SigInfoHandler()` in `cmd/siginfo_others.go:6`.

- **Graceful shutdown**: Context cancellation is used throughout for cancelling uploads, transfers, and operations. The VFS cache writeback system has explicit `cancelUpload()` functionality (`vfs/vfscache/writeback/writeback.go:414-419`).

- **Progress interruption**: `cmd/progress.go:67-70` returns a cleanup function that closes the stop channel and waits for the goroutine to finish, then resets output interceptors.

Limitations:
- Long operations (like large file deletes in `ncdu`) block the UI synchronously (`cmd/ncdu/ncdu.go:75-76`)
- No universal key binding for stats interruption (SIGINFO is BSD-only)
- No progress bar pause/resume capability

## Architectural Decisions

1. **No heavy TUI framework for main commands**: rclone uses raw VT100 codes for progress display rather than BubbleTea or tview. This keeps dependencies minimal but limits interactivity.

2. **Liner for config prompts**: The `liner` library provides readline-like behavior for interactive configuration. This is a pragmatic choice for line-based input.

3. **tcell only for ncdu**: The `ncdu` command uses `tcell` for screen-based TUI because it needs interactive directory navigation, which is impractical with line-by-line prompts.

4. **Stats aggregation before display**: All transfer state flows through `StatsInfo` (`fs/accounting/stats.go:34-71`) which aggregates bytes, errors, checks, transfers, etc. The `String()` method formats this for display.

5. **Separate progress vs logging**: `cmd/progress.go` intercepts `operations.SyncPrintf` and log output during progress mode to integrate them into the progress display area.

## Notable Patterns

- **VT100 escape code constants**: Defined as string constants in `lib/terminal/terminal.go:17-68` for cursor movement and colors.

- **Periodic refresh**: Progress updates use `time.NewTicker` with configurable interval (default 500ms, overridable via `--stats`).

- **Multi-line support in liner**: Config prompts support multi-line input via `l.SetMultiLineMode(true)`.

- **Color mode handling**: Three modes (Never, Always, auto-detect) controlled by `ci.TerminalColorMode` (`lib/terminal/terminal.go:82-95`).

- **Context cancellation for cleanup**: All background operations accept `context.Context` for cancellation.

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| Raw VT100 vs TUI framework | Fewer dependencies, smaller binary, but less interactive UI |
| Line-based config prompts vs menu TUI | Simple to implement, works over SSH, but no cursor movement or dynamic updates |
| Stats refresh every 500ms | Responsive enough for most uses, but no visual progress bar |
| SIGINFO BSD-only | Relevant for macOS/BSD users, irrelevant elsewhere |
| Global `SyncPrintf` interception | Simple to implement, but couples progress display to output functions |

## Failure Modes / Edge Cases

1. **Non-TTY output**: When stdout is not a terminal, `terminal.Start()` (`lib/terminal/terminal.go:82-86`) uses `colorable.NewNonColorable` to strip colors. Progress bar still works via line-based output.

2. **Pipe saturation**: `operations.SyncPrintf` can print faster than terminal can display, potentially causing interleaved output. The mutex (`operations.StdoutMutex`) in `cmd/progress.go:80-81` attempts to serialize output.

3. **Deadlock with `--interactive --progress`**: Comment in `fs/config/ui.go:79` notes this combination can cause deadlock, addressed by not logging during `CommandDefault`.

4. **Progress after completion**: When transfers complete, `cmd/progress.go:62` prints a final newline to position cursor after the stats block.

5. **Terminal resize**: No explicit resize handling — `terminal.GetSize()` is called each print but results are only used for line truncation.

## Future Considerations

1. **BubbleTea migration**: Migrating main commands to BubbleTea could provide better progress bars with keybindings, menus, and forms without adding significant complexity.

2. **SIGINFO on all platforms**: Implementing stats interrupt for non-BSD platforms via different signal (e.g., `SIGUSR1`).

3. **Visual progress indicators**: Replace numeric stats with graphical progress bars using block characters.

4. **Resize handling**: Add terminal resize listener to recalculate available width.

## Questions / Gaps

- **No evidence found** for interactive confirmations during file operations (e.g., overwrite prompts) — the `--interactive` flag affects `dedupe` behavior but not general file operations.
- **No evidence found** for spinner animations or ASCII art progress indicators — only text-based stats.
- **No evidence found** for terminal alternate screen usage — progress bar reuses the same screen area rather than switching to a dedicated buffer.

---

Generated by `study-areas/09-terminal-ux.md` against `rclone`.