# Repo Analysis: restic

## Terminal UX & Interaction Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | restic |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/restic` |
| Group | `study-areas/09-terminal-ux.md` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

restic implements a layered terminal UX system with dedicated packages for progress tracking (`internal/ui/progress`), status line rendering (`internal/ui/termstatus`), terminal capability detection (`internal/terminal`), and password input (`internal/terminal/password.go`). No third-party TUI libraries (BubbleTea, tview, etc.) are used—all terminal rendering is custom-built using ANSI escape sequences. The UX is functional and thoughtful, with signal handling for interruptibility and support for both interactive and non-interactive (file redirected) modes.

## Rating

**6/10** — Functional but rough. Progress feedback is good in interactive mode, but the UI lacks polish compared to modern TUI libraries. No interactive menus or multi-step prompts; only password prompts and status lines.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Terminal interface abstraction | `Terminal` interface defines Print, Error, SetStatus, ReadPassword, OutputWriter | `internal/ui/terminal.go:10-34` |
| Status line implementation | `Terminal` struct with channels for messages and status updates | `internal/ui/termstatus/status.go:21-44` |
| ANSI escape sequences | Cursor movement and line clearing functions for POSIX terminals | `internal/terminal/terminal_unix.go:14-25` |
| Terminal capability detection | `CanUpdateStatus` checks `term.IsTerminal()` and `TERM != "dumb"` | `internal/terminal/terminal_unix.go:30-39` |
| Password reading | `ReadPassword` uses `golang.org/x/term` with context cancellation | `internal/terminal/password.go:15-53` |
| Progress counter | `Counter` struct with atomic value/max and updater goroutine | `internal/ui/progress/counter.go:18-34` |
| Progress interval config | `CalculateProgressInterval` returns 60fps for interactive, 0 for non-interactive | `internal/ui/progress.go:15-26` |
| Progress printer interface | `Printer` interface with E/S/PT/P/V/VV message levels | `internal/ui/progress/printer.go:8-35` |
| Signal handling | Global signal channel with `sync.Once` initialization | `internal/ui/signals/signals.go:10-24` |
| Text backup progress | `TextProgress` with runtime, file count, byte count, ETA | `internal/ui/backup/text.go:35-73` |
| JSON progress output | JSON progress format as alternative to text | `internal/ui/backup/json.go` |
| Foreground process handling | `StartForeground` switches process group for child commands | `internal/terminal/foreground.go:17-28` |
| Output writer with line buffering | `newLineWriter` defers output until newline | `internal/ui/termstatus/status.go:173-179` |

## Answers to Protocol Questions

### 1. How is terminal rendering handled?

Terminal rendering is handled through a custom abstraction. The `Terminal` interface in `internal/ui/terminal.go:10` defines the contract. Concrete implementation is `termstatus.Terminal` in `internal/ui/termstatus/status.go` which:
- Runs a dedicated goroutine that listens on `msg` and `status` channels (`status.go:197-205`)
- Clears current line and rewrites status using ANSI escape sequences (`status.go:228-255`)
- Falls back to non-status mode when output is redirected to file (`status.go:322-358`)
- Detects terminal capabilities via `terminal.CanUpdateStatus(fd)` which checks `term.IsTerminal()` and `TERM != "dumb"` (`terminal_unix.go:30-39`)

No third-party TUI library is used.

### 2. How are loading states shown?

Loading states are shown via the progress package:

- `newProgressMax` in `internal/ui/progress.go:30-53` creates `progress.Counter` with a callback that formats status strings like `[00:05:23] 45.2%  1234 / 5000 files`
- `CalculateProgressInterval` in `internal/ui/progress.go:15-26` returns 0 (disabled) for non-interactive terminals or when `--quiet` is set; otherwise 60fps
- `Counter` struct in `internal/ui/progress/counter.go:18-34` uses atomic operations for concurrency-safe updates
- The status line is set via `term.SetStatus([]string{status})` which updates in-place on capable terminals

For backup operations specifically, `TextProgress.Update` in `internal/ui/backup/text.go:35-73` shows file count, byte count, errors, and ETA.

Progress is only shown when verbosity > 0 and not in quiet/json mode (`progress.go:73-77`).

### 3. How are prompts implemented?

Password prompts use `terminal.ReadPassword` in `internal/terminal/password.go:15-53`:
- Uses `golang.org/x/term.ReadPassword` to read without echo
- Prints prompt to output writer before reading (`password.go:27`)
- Supports context cancellation that restores terminal state (`password.go:38-47`)

The prompt is triggered through `gopts.Term.ReadPassword(ctx, prompt)` at `global/global.go:239`.

No interactive menus or multi-step prompts exist. The only "prompt" is the password input. There is noConfirmation prompts for destructive actions—those use `--yes` flags or fail.

### 4. Is the UX interruptible?

**Partially**. Signal handling exists:
- `GetProgressChannel()` in `internal/ui/signals/signals.go:10-24` sets up a global signal listener (SIGINT, SIGTERM, etc.) using `sync.Once`
- Counter callbacks are invoked on SIGUSR1/SIGINFO (`internal/ui/progress/counter.go:17`)
- `Terminal.Run` respects context cancellation and clears status lines on exit (`status.go:197-215`)
- When context is cancelled, status lines are removed before shutdown (`status.go:213-215`)

However, the global signal channel has a design comment at `signals.go:19-20`: "XXX The fact that signals is a single global variable means that only one listener receives each incoming signal."

No Ctrl+C during password prompt cleanly exits—context cancellation during `ReadPassword` restores terminal state (`password.go:40`) but may leak the goroutine.

## Architectural Decisions

1. **No third-party TUI library** — All terminal rendering is custom-built using ANSI escape sequences via `internal/terminal` package. This keeps dependencies minimal but requires more code.

2. **Goroutine-based terminal update loop** — `Terminal.Run` in `status.go:197` runs a dedicated goroutine with channels for messages and status, ensuring thread-safe concurrent access.

3. **Dual-mode status rendering** — Terminal detects if output is redirected (file vs. TTY) and switches between in-place updates (`run`) vs. line-by-line printing (`runWithoutStatus`) at `status.go:199-205`.

4. **Progress counters are nil when disabled** — `NewCounter` returns nil if `show` is false (`progress.go:31-33`), avoiding unnecessary goroutines.

5. **Layered printer interface** — `Printer` interface at `progress/printer.go:8-35` has 7 log levels (E/S/PT/P/V/VV) to control what prints in quiet/verbose/json modes.

## Notable Patterns

- **Channel-based terminal I/O** — All terminal output goes through channels (`msg`, `status`) to the dedicated goroutine, preventing interleaved writes
- **Flush barrier pattern** — `message{barrier: ch}` at `status.go:365` synchronizes output before critical sections
- **Conditional rendering** — `NewCounterTerminalOnly` only creates counters when stdout is a terminal (`progress.go:65-67`)
- **Unchanged line optimization** — `findUnchangedLines` at `status.go:310-320` skips re-printing identical status lines
- **BOM stripping for password files** — `LoadPasswordFromFile` handles UTF-8 BOM at `global/global.go:216`

## Tradeoffs

- **Custom TUI vs. BubbleTea/tview**: Less functionality, more code to maintain, but fewer dependencies and no abstraction gap
- **Global signal listener**: Only one listener can receive signals, limiting modularity (`signals.go:19-20`)
- **Progress disabled by default for non-interactive**: Good for log files but can confuse users expecting output in scripts
- **No interactive menus**: All choices are CLI flags; no arrow-key navigation or ncurses-style interfaces

## Failure Modes / Edge Cases

- **Password goroutine leak**: Comment at `global/global.go:226` states "If the context is canceled, the function leaks the password reading goroutine"
- **TERM="dumb" falls back to non-status mode**: Users with unusual terminals get degraded UX
- **Background process detection**: `IsProcessBackground` check at `status.go:224,249` suppresses all output when in background, which may hide errors
- **Pipe/redirect detection is fd-based**: If stdout is wrapped in another writer, `CanUpdateStatus` may incorrectly report capability

## Future Considerations

- Consider adding interactive confirmation prompts (yes/no) for destructive operations instead of requiring `--yes`
- Signal handler could support multiple listeners via broadcast channel instead of single global
- Password goroutine leak could be fixed with proper cancellation using `syscall.Shutdown`
- Progress counters could support more granular phases (scanning, backing up, finalizing)

## Questions / Gaps

- No evidence found of interactive menus or multi-step wizard-style interfaces
- No evidence of terminal resize handling
- No evidence of color scheme customization or themes
- No evidence of terminal title/tab updates
- JSON mode (`--json`) exists but lacks machine-readable progress streaming for long operations