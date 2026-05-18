# Repo Analysis: go-task

## Terminal UX & Interaction Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | go-task |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/go-task` |
| Group | `go-task` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

go-task uses the BubbleTea (Charm) framework for interactive prompts and basic terminal detection. Output rendering uses custom `Output` interface with three modes (interleaved, prefixed, group) plus a `Logger` with color support. Signal handling provides graceful interruption. Overall, the UX is functional and thoughtful but lacks advanced terminal features like progress bars or spinner animations.

## Rating

**6/10** — Functional but rough. Excellent interactive prompt implementation via BubbleTea, but output rendering is basic stdout/stderr wrapping without real-time streaming indicators or progress feedback.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Terminal detection | `IsTerminal()` checks both stdin and stdout FDs | `internal/term/term.go:9-10` |
| Interactive prompts | BubbleTea `textinput.Model` for text input, `selectModel` for selection | `internal/input/input.go:88-140, 142-211` |
| Prompt rendering | Uses `lipgloss.Style` for styling (cyan bold for prompts, green for selections) | `internal/input/input.go:18-21` |
| BubbleTea program | `tea.NewProgram()` with custom models and input/output writers | `internal/input/input.go:35-40, 61-66` |
| Prompt cancellation | ESC or ctrl+c cancels with `ErrCancelled` | `internal/input/input.go:116-120, 167-170` |
| Color logging | `Logger` struct with `Outf`, `Errf`, `Warnf` using `fatih/color` | `internal/logger/logger.go:130-176` |
| Color configuration | Environment variable overrides via `envColor()` | `internal/logger/logger.go:103-128` |
| Output interface | `Output` interface with `WrapWriter()` returning wrapped stdout/stderr | `internal/output/output.go:12-14` |
| Prefixed output | `prefixWriter` adds task prefix with cycling color sequence | `internal/output/prefixed.go:43-114` |
| Group output | `groupWriter` buffers output and wraps with begin/end strings | `internal/output/group.go:37-59` |
| Interleaved output | Pass-through writer with no modifications | `internal/output/interleaved.go:11-12` |
| Signal handling | Graceful SIGINT/SIGTERM interception with 3-signal force-exit | `signals.go:11-31` |
| Watch mode | fsnotify-based file watcher with debouncing | `watch.go:59-66, 71-127` |
| Interactive flag | `Executor.Interactive` enables prompt mode, `AssumeYes` auto-accepts | `executor.go:48-50, 389-399` |
| Task execution output | Output wrapper applied per-task at `runCommand()` | `task.go:403-426` |

## Answers to Protocol Questions

### 1. How is terminal rendering handled?

go-task does not use a full terminal rendering library (like tview or termbox). Instead, it relies on:

- **Basic stdout/stderr wrapping** via the `Output` interface (`internal/output/output.go:12-14`)
- **Colorized output** via `fatih/color` (not ANSI escape sequences directly)
- **BubbleTea** (`charm.land/bubbletea/v2`) only for interactive variable prompts, not for general rendering

The `prefixed` output mode adds task-name prefixes with cycling colors (`internal/output/prefixed.go:77-80`) but does not provide real-time updates or progress bars.

### 2. How are loading states shown?

**No explicit loading states or progress indicators found.** There is no spinner, progress bar, or percentage display for long-running operations.

Evidence:
- `Logger.Warnf` at `internal/logger/logger.go:185` for warnings
- `Logger.VerboseOutf` at `internal/logger/logger.go:160` for verbose task start/finish
- No progress bar implementation in `internal/output/`
- Watch mode shows task completion messages (`watch.go:42, 111`) but no animated indicators

### 3. How are prompts implemented?

Excellent implementation using **BubbleTea**:

- **Text input**: `textModel` struct (`internal/input/input.go:88-94`) wraps `textinput.Model` from `bubbles/v2`
- **Selection**: `selectModel` struct (`internal/input/input.go:142-149`) with keyboard navigation (↑/↓/enter/esc)
- **Styling**: Uses `lipgloss` for styled text with cyan prompts, green selections, gray hints
- **Program**: `tea.NewProgram()` runs the TUI event loop (`internal/input/input.go:35-40, 61-66`)
- **Cancellation**: ESC or ctrl+c returns `ErrCancelled`

Simple prompts in Taskfiles are handled via `Logger.Prompt()` (`internal/logger/logger.go:189-217`) using `bufio.Reader` for yes/no confirmations.

### 4. Is the UX interruptible?

**Yes, with caveats:**

- **Signal handling**: `InterceptInterruptSignals()` at `signals.go:16-31` catches SIGINT, SIGTERM, SIGHUP
- **Graceful shutdown**: After first signal, task continues; second signal shows warning; third forces exit
- **Watch mode**: `closeOnInterrupt()` at `watch.go:155-163` closes watcher and exits on interrupt
- **Context cancellation**: Tasks use `context.Context` for cancellation propagation (`task.go:38, 468`)
- **Prompt cancellation**: Interactive prompts respond to ESC/ctrl+c immediately

However, there is **no way to interrupt a running command mid-execution** — only the task runner can be interrupted, not the underlying shell command.

## Architectural Decisions

1. **BubbleTea for prompts, not rendering**: The Charm ecosystem (bubbles, lipgloss, tea) is used only for interactive variable input. Output is plain text with prefixes.
2. **Output abstraction**: Three output modes (interleaved, prefixed, group) via a common `Output` interface allowing task-level customization.
3. **Color via fatih/color**: Environment-driven color configuration allows users to customize ANSI colors.
4. **Signal chaining**: Graceful degradation on repeated interrupts (3 strikes) ensures cleanup while allowing force-exit.

## Notable Patterns

- **Output wrapper per task**: `WrapWriter()` is called at `task.go:412` with task-specific prefix and templater cache
- **Color cycling**: `PrefixColorSequence` at `internal/output/prefixed.go:77-80` cycles through 12 colors for task differentiation
- **Buffer line-by-line**: `prefixWriter.writeOutputLines()` at `internal/output/prefixed.go:56-75` reads line-by-line from buffer to avoid partial line output
- **Concurrent watch with debounce**: `fsnotifyext.Deduper` at `watch.go:66-67` reduces event frequency with configurable interval

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| BubbleTea only for prompts | Limits TUI capabilities — no menus, spinners, or complex layouts |
| No progress bars | Long operations show no feedback — user must watch stdout |
| Prefix-based output | Good for parallel tasks but noisy for sequential single-task runs |
| Signal interception | Clean shutdown but cannot interrupt individual running commands |

## Failure Modes / Edge Cases

- **No terminal detected**: `Logger.Prompt()` returns `ErrNoTerminal` if `term.IsTerminal()` fails (`internal/logger/logger.go:195-196`)
- **Prompt cancelled**: Returns `ErrPromptCancelled` which propagates to `TaskCancelledByUserError` (`task.go:255-256`)
- **Interactive disabled**: When `Interactive=false` and required vars missing, task fails with clear error (`task.go:153-156`)
- **Pipe output**: When stdout is not a terminal, color codes may leak into pipe output if `Color` flag is true
- **fsnotify overflow**: Watch mode logs errors but continues (`watch.go:117-124`) — events may be dropped under heavy load

## Future Considerations

- Add spinner/progress bar using `charm.land/bubbles/v2/spinner`
- Real-time streaming output with cursor positioning
- Interactive task selection menu via BubbleTea
- Better handling of non-terminal environments (CI, scripts)

## Questions / Gaps

- No evidence found for handling terminal resize events
- No evidence for alternative output formats (JSON structured output)
- No evidence for interactive task selection (list and pick)
- Color scheme customization only via environment variables, not CLI flag

---

Generated by `study-areas/09-terminal-ux.md` against `go-task`.