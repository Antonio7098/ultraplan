# Terminal UX & Interaction Design - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Protocol | `study-areas/09-terminal-ux.md` |
| Groups | All groups |
| Date | 2026-05-15 |

## Repositories Studied

| # | Repo | Path | Group |
|---|------|------|-------|
| 1 | age | `/home/antonioborgerees/coding/go-cli-study/repos/age` | age |
| 2 | chezmoi | `/home/antonioborgerees/coding/go-cli-study/repos/chezmoi` | chezmoi |
| 3 | dive | `/home/antonioborgerees/coding/go-cli-study/repos/dive` | dive |
| 4 | fzf | `/home/antonioborgerees/coding/go-cli-study/repos/fzf` | fzf |
| 5 | gdu | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` | gdu |
| 6 | gh-cli | `/home/antonioborgerees/coding/go-cli-study/repos/gh-cli` | gh-cli |
| 7 | go-task | `/home/antonioborgerees/coding/go-cli-study/repos/go-task` | go-task |
| 8 | helm | `/home/antonioborgerees/coding/go-cli-study/repos/helm` | helm |
| 9 | k9s | `/home/antonioborgerees/coding/go-cli-study/repos/k9s` | k9s |
| 10 | lazygit | `/home/antonioborgerees/coding/go-cli-study/repos/lazygit` | lazygit |
| 11 | mitchellh-cli | `/home/antonioborgerees/coding/go-cli-study/repos/mitchellh-cli` | mitchellh-cli |
| 12 | opencode | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` | opencode |
| 13 | rclone | `/home/antonioborgerees/coding/go-cli-study/repos/rclone` | rclone |
| 14 | restic | `/home/antonioborgerees/coding/go-cli-study/repos/restic` | restic |
| 15 | urfave-cli | `/home/antonioborgerees/coding/go-cli-study/repos/urfave-cli` | urfave-cli |
| 16 | yq | `/home/antonioborgerees/coding/go-cli-study/repos/yq` | yq |

## Executive Summary

Terminal UX across the 16 studied repos spans a wide spectrum from rudimentary to exceptional. Three repos achieve exceptional ratings (fzf: 9, lazygit: 9, opencode: 9), four are thoughtful and polished (chezmoi: 8, gdu: 8, gh-cli: 8, k9s: 8), two are functional but rough (age: 6, go-task: 6, rclone: 6, restic: 6), and several are basic or framework-focused. The key differentiator is not raw feature count but the coherence between the terminal rendering approach, the interactive patterns, and the product's actual needs.

## Core Thesis

Elite Go CLI terminal UX falls into three architectural archetypes: **full-screen TUI applications** (BubbleTea, tcell/tview, or custom wrappers) for complex interactive workflows; **streaming progress systems** using ANSI escape sequences for real-time feedback; and **CLI-first output** where terminal rendering is limited to colorization and help text. The most successful projects match their UX architecture to their product's interaction density. Filter-style tools (yq) and framework libraries (urfave-cli, mitchellh-cli) correctly optimize for simplicity. Applications where users spend sustained time in interactive mode (lazygit, k9s, opencode) invest in full TUI frameworks. The failure mode is CLI-first tools that attempt complex interactions without a proper rendering foundation.

## Rating Summary

| Repo | Score | Approach | Main Strength | Main Concern |
|------|-------|----------|---------------|--------------|
| fzf | 9/10 | Dual renderer (ANSI + tcell) | Comprehensive interruptibility, streaming input, polished rendering | No interactive prompts beyond selection |
| lazygit | 9/10 | Custom gocui + tcell/v3 | Progressive streaming, inline status spinners, stop-channel interruptibility | Custom library maintenance burden |
| opencode | 9/10 | BubbleTea + Lipgloss | Theme system, markdown rendering, dialog overlays, progressive loading | No streaming token display |
| chezmoi | 8/10 | BubbleTea + Lipgloss | Multiple prompt models, progress+spinner, non-TTY fallback | No streaming output for apply |
| gdu | 8/10 | tcell/tview | Progress bar widget, signal-safe exit, OSC 9;4 taskbar | Modal-centric UX, no streaming |
| gh-cli | 8/10 | Prompt-based (survey→huh) | CancelError/InterruptErr handling, multi-select with search, pager | survey is legacy; huh experimental |
| k9s | 8/10 | tcell/tview (forked) | Flash messages, command buffer, exponential backoff | Forked dependencies |
| dive | 7/10 | gocui | Multi-pane layout, filter pane, job control | No loading states, race condition workaround |
| go-task | 6/10 | BubbleTea (prompts only) + fatih/color | Good prompt implementation, signal handling | No progress bars, basic stdout wrapping |
| rclone | 6/10 | Raw VT100 + liner | Progress stats with 500ms refresh, SIGINFO | Dated UI, liner-based prompts |
| restic | 6/10 | Custom ANSI + goroutine channel | Status line, dual-mode (TTY/file), context cancellation | No interactive menus, global signal listener |
| age | 6/10 | golang.org/x/term + /dev/tty | Ephemeral prompts, binary output guard, streaming encryption | No progress bars, no spinner |
| mitchellh-cli | 4/10 | CLI framework (fatih/color) | Clean UI interface layering, interruptible Ask | No progress, minimal terminal rendering |
| helm | 4/10 | CLI-first (fatih/color) | Structured logging, kstatus watcher | No spinner/progress, basic interrupt |
| urfave-cli | 5/10 | CLI framework | Template-based help, shell completion | No terminal rendering, no prompts |
| yq | 3/10 | Filter tool (fatih/color) | Color via tokenization, NO_COLOR support | No interactive UX, no progress, basic interrupt |

## Approach Models

### Full-Screen TUI (BubbleTea)
chezmoi, go-task, opencode use BubbleTea. The Elm-inspired message-passing architecture provides clean separation of concerns. Prompts are implemented as models with Update/View methods. chezmoi uses 6 separate prompt models; opencode uses overlay dialogs; go-task uses it only for prompts while output is plain text.

### Full-Screen TUI (tcell/tview)
gdu, k9s, dive, lazygit use tcell-based libraries. tview provides widget primitives (Flex, Table, Form, Modal) that compose into complex UIs. k9s uses the forked `derailed` variants; lazygit maintains its own gocui wrapper around tcell/v3. These provide richer widget sets than BubbleTea but at the cost of tighter library coupling.

### Dual Renderer
fzf uses LightRenderer (raw ANSI) for broad terminal compatibility and FullscreenRenderer (tcell) for feature-rich terminals. This is the only repo with a systematic dual-renderer architecture, enabling excellent compatibility while retaining advanced features.

### Raw ANSI Escape Sequences
age, rclone, restic define escape code constants and use them directly. age uses `golang.org/x/term` with /dev/tty bypass. rclone uses VT100 constants in `lib/terminal/terminal.go:17-68`. restic uses ANSI codes via `internal/terminal/terminal_unix.go:14-25`. This approach minimizes dependencies but requires manual implementation of all patterns.

### CLI Framework (No Terminal Rendering)
mitchellh-cli, urfave-cli, helm, yq treat terminal UX as a secondary concern. mitchellh-cli provides UI interface layering (BasicUi → ColoredUi → PrefixedUi → ConcurrentUi). urfave-cli focuses on argument parsing. helm and yq use fatih/color only for colorization. These are correct for libraries and filter tools but limit interactive capability.

## Pattern Catalog

### Progressive Streaming with Interruptibility
**Repos**: fzf (`src/reader.go:51-73`), lazygit (`pkg/tasks/tasks.go:31-435`), restic (`internal/ui/progress/`)

Lazygit's ViewBufferManager reads lines progressively and only requests more when scrolled. fzf's Reader polls with event-based streaming. Restic uses a goroutine-based channel system for status updates. All three use stop-channel patterns for interruptibility.

**When to use**: Long-running operations with output that grows over time (git operations, file analysis, backups).
**When overkill**: Short operations or single-pass transforms.

### BubbleTea Prompt Composition
**Repos**: chezmoi (`internal/chezmoibubbles/`), opencode (`internal/tui/components/chat/editor.go`), go-task (`internal/input/input.go`)

Separate models per prompt type (Bool, String, Choice, Int, MultiChoice, Password) with consistent Cancel() interface. Uses lipgloss for styling and bubbles for components.

**When to use**: Applications with multiple interactive prompt types needing validation.
**When overkill**: Single prompt type or CLI-only tools.

### Non-TTY Fallback
**Repos**: chezmoi (`internal/cmd/prompt.go:20-256`), gh-cli (`internal/prompter/`), gdu (`ShouldRunInNonInteractiveMode`)

Every prompt checks TTY availability and falls back to line-based input. chezmoi's `--no-tty` flag bypasses all TUI. gh-cli's CanPrompt() checks both stdin and stdout.

**When to use**: Tools that must work in CI, scripts, and pipes.
**When overkill**: Applications that are always interactive.

### Progress Bar with Taskbar Integration
**Repos**: gdu (`tui/progress.go:70-82`), restic (`internal/ui/progress/`)

gdu writes OSC 9;4 sequence to update terminal taskbar progress. Restic uses atomic counters with 60fps updates.

**When to use**: Long operations where users may tab away.
**When overkill**: Operations that complete quickly or where taskbar space is precious.

### Spinner with Configurable Frames
**Repos**: chezmoi (`internal/cmd/readhttpresponse.go:25-108`), fzf (`src/terminal.go:926-931`), lazygit (`pkg/config/user_config.go:845-848`)

All three support custom spinner frames via user configuration. Lazygit's spinner is fully user-configurable with frame count and rate. fzf uses braille characters for visual appeal.

**When to use**: When users care about aesthetics or need accessibility accommodations.
**When overkill**: Internal tools or single-user applications.

### Signal-Safe Exit
**Repos**: gdu (`tui/tui.go:316-338`), go-task (`signals.go:11-31`), k9s (`internal/view/app.go:185-193`)

Signal handlers use thread-safe UI update mechanisms (gdu's QueueUpdateDraw). Three-signal force-exit pattern (go-task) ensures cleanup while allowing emergency exit.

**When to use**: Long-running operations where graceful shutdown matters.
**When overkill**: Short-lived commands.

### Cancel Returns Exit Code 0
**Repos**: chezmoi (`internal/cmd/prompt.go:351-360`)

Cancelled prompts return `chezmoi.ExitCodeError(0)` rather than an error. This treats cancellation as "user chose not to proceed" rather than a failure, which is correct for scripting and CI.

**When to use**: Tools that users pipe through scripts.
**When overkill**: Tools that are never used in automated contexts.

### Theme/Color Adaptation
**Repos**: opencode (`internal/tui/theme/manager.go`), gh-cli (`pkg/iostreams/iostreams.go:116-130`), chezmoi (`lipgloss.AdaptiveColor`)

opencode has 10+ built-in themes with runtime switching. gh-cli detects terminal background (dark/light) for color selection. chezmoi uses Lipgloss adaptive colors.

**When to use**: Applications where users have diverse terminal setups.
**When overkill**: Controlled environments or single-theme products.

## Key Differences

### BubbleTea vs. tcell/tview
BubbleTea provides Elm-style MVC with message passing, making it natural for prompt flows. tcell/tview provides widget primitives (Flex, Table, Form) that compose into complex layouts. BubbleTea is more constrained but more testable; tcell/tview is more flexible but tighter coupled. Both are valid choices for rich TUI applications.

### Streaming vs. Batch Output
fzf, lazygit, and restic handle streaming input/output gracefully—fzf through polling, lazygit through throttled line reading, restic through channel-based status. Most other repos output complete results at once. Streaming matters when operations last > 5 seconds.

### Progress Indication vs. No Progress
 chezmoi (progress bar + spinner), gdu (progress bar + taskbar), fzf (spinner + scrollbar), lazygit (inline status spinners), gh-cli (braille spinner), and restic (status line) all provide visual feedback. age, helm, yq, urfave-cli provide none. Progress feedback is essential for operations > 2 seconds.

### Interruptibility Depth
Full interruptibility means: cancellation returns clean exit code, goroutines are stopped, partial results are cleaned up. Lazygit's stop-channel pattern (`pkg/tasks/tasks.go:144`) is the gold standard. Partial interruptibility (age, rclone) means Ctrl+C works but partial state may persist.

### Framework vs. Application
mitchellh-cli, urfave-cli, and helm are frameworks or CLI-first tools where terminal UX is secondary. yq is a filter tool where terminal UX is intentionally minimal. These should not be judged against full-screen TUI applications.

## Tradeoffs

| Decision | Benefit | Cost | Best-fit Context |
|----------|---------|------|------------------|
| BubbleTea | Idiomatic Go, testable, composable | Limited widget set, less control | Prompt-heavy apps, single-focus tools |
| tcell/tview | Rich widgets, flexible layout | Tight coupling, less idiomatic Go | Complex multi-pane UIs, dashboards |
| Raw ANSI | Minimal dependencies, full control | Manual implementation, bug risk | Minimal deps priority, simple interactions |
| Dual renderer | Best compatibility + features | Code complexity (2 implementations) | Tools used across many terminals |
| Custom TUI wrapper | Full control over behavior | Maintenance burden, library migration cost | Highly specialized UX requirements |
| No TUI (CLI-first) | Simplicity, minimal deps, testable | Limited interactivity | Libraries, filters, CI-focused tools |
| Progress bars | User feedback, perceived performance | Screen real estate, complexity | Long-running operations |
| Streaming output | Immediate feedback, memory efficiency | Complexity, potential interleaving | Long-running with incremental output |

## Decision Guide

**For a tool that manages persistent state interactively** (lazygit, k9s, dive):
→ Use tcell/tview or custom gocui wrapper. The interaction model demands multi-pane layouts, persistent views, and keyboard-driven navigation.

**For a tool with many prompt types and validation** (chezmoi, opencode, gh-cli):
→ Use BubbleTea. The Elm architecture maps naturally to prompts with Update/View separation and type-safe input models.

**For a tool where compatibility is paramount** (fzf):
→ Use a dual renderer (ANSI for basic, tcell for fullscreen). This handles edge cases (cygwin, dumb terminals, legacy emulators) while enabling advanced features.

**For a filter or data processing tool** (yq):
→ Avoid terminal rendering libraries. Plain stdout with optional colorization is correct. Consider streaming output if operations are slow.

**For a library or framework** (urfave-cli, mitchellh-cli):
→ Provide UI interfaces and abstractions, not terminal rendering. Let consumers implement rendering as needed.

**For a CLI tool with rare interaction** (helm, age, restic):
→ Minimal TTY handling with golang.org/x/term is sufficient. Use ANSI escape codes for status lines. Avoid heavy dependencies.

## Practical Tips

### Do
1. **Implement --no-tty / non-interactive fallback** — chezmoi (`internal/cmd/prompt.go:124-137`), gh-cli (`CanPrompt()`) show this pattern. Scripts and CI require it.
2. **Use context cancellation for graceful shutdown** — restic (`internal/ui/progress/`), go-task (`task.go:38,468`) demonstrate proper propagation.
3. **Show progress for operations > 2 seconds** — Spinner, progress bar, or status line prevents user panic. gdu's 100ms ticker (`tui/progress.go:12-68`) is a good interval.
4. **Make cancellation return exit code 0** — chezmoi's `runCancelableModel` pattern (`internal/cmd/prompt.go:351-360`) treats cancellation as "user chose not to proceed."
5. **Use channel-based UI updates** — lazygit's ViewBufferManager (`pkg/tasks/tasks.go`) and restic's Terminal goroutine (`internal/ui/termstatus/status.go:197-205`) show thread-safe patterns.
6. **Configurable presentation** — lazygit's user-configurable spinner (`pkg/config/user_config.go:845-848`) and fzf's theme support (`src/tui/tui.go:989-1246`) show user customization.

### Don't
1. **Don't assume TTY for colored output** — Use `colorable` or check `term.IsTerminal()` like rclone (`lib/terminal/terminal.go:82-86`) and restic (`internal/terminal/terminal_unix.go:30-39`).
2. **Don't block on prompts in non-interactive mode** — helm's `promptUser()` (`pkg/action/package.go:200-208`) hangs in CI without fallback.
3. **Don't leak goroutines on cancellation** — restic notes a goroutine leak on context cancellation (`global/global.go:226`).
4. **Don't skip cleanup on interrupt** — age's encryption/decryption loops (`cmd/age/age.go:429,516`) have no visible interruptibility even though Ctrl+C terminates.
5. **Don't use os.Exit in libraries** — urfave-cli's `OsExiter` defaulting to `os.Exit` (`errors.go:11`) is not testable. Use exit code return values.

## Anti-Patterns / Caution Signs

1. **No loading states during long operations** — Users see a frozen terminal with no feedback. This appears in helm (`helm install --wait` shows nothing), yq (large file processing is silent), and age (chunked encryption has no progress).

2. **Global signal listeners** — restic's single global signal variable (`internal/ui/signals/signals.go:19-20`) means only one listener receives each signal. Limits modularity.

3. **No graceful shutdown sequence** — dive has no Teardown on interrupt. Ctrl+C terminates but doesn't clean up in-progress work.

4. **Forked dependencies for terminal libraries** — k9s uses `derailed/tcell` and `derailed/tview` forks with no documented reason. Maintenance burden and divergence from upstream.

5. **Race condition workarounds** — dive has a 100ms sleep before `gocui.NewGui()` (`cmd/dive/cli/internal/ui/v1/app/app.go:31`) to avoid a Docker init race. Acknowledged as a hack with no clear root cause.

6. **Progress disabled when output is piped** — gh-cli (`iostreams/iostreams.go:514-516`) never starts spinner when stdout/stderr are not both TTYs. This is correct but users may not expect silent failures.

7. **Color as post-processing** — yq's `colorizeAndPrint` (`pkg/yqlib/color_print.go:20`) tokenizes the entire output before colorizing. Not suitable for streaming pipelines.

## Notable Absences

1. **No bubble tea / rich TUI in most studied repos** — Only 4/16 use BubbleTea or tcell-based frameworks. Most Go CLIs are CLI-first with minimal terminal rendering.

2. **No mouse support in most TUIs** — k9s, dive, lazygit, gdu all lack comprehensive mouse interaction despite using full-screen frameworks. Keyboard-centric design dominates.

3. **No accessibility features** — No evidence of screen reader support, ARIA labels, or accessible navigation beyond gh-cli's `huh` with `ThemeBase16` and `WithAccessible(true)`.

4. **No terminal title manipulation** — Only rclone updates terminal title (`fs/accounting/stats.go:464-467`). Most tools don't use this capability.

5. **No virtual scrolling / lazy loading** — Lazygit's ViewBufferManager handles streaming but large lists are fully held. k9s has no evidence of viewport-based rendering optimization.

6. **No multi-terminal / multi-attach** — No evidence of session re-attachment like screen or tmux. All studied apps are single-session.

## Per-Repo Notes

| Repo | Notable Observation |
|------|---------------------|
| fzf | Exceptional dual-renderer architecture; streaming input processing; ~80+ event types. Gold standard for compatibility. |
| lazygit | Stop-channel interruptibility throughout; configurable spinner; streaming with throttling; custom gocui maintenance. |
| opencode | Theme system with 10+ themes; BubbleTea dialog overlays; markdown+Chroma rendering; auto-compaction. |
| chezmoi | 6 separate BubbleTea prompt models; progress+spinner for HTTP; non-TTY fallback; cancel returns exit 0. |
| gh-cli | Three-tier prompter (survey→huh→accessible); CancelError handling; multi-select with search bubbles. |
| gdu | OSC 9;4 taskbar progress; signal-safe exit; option pattern for UI; NoUI fallback. |
| k9s | Forked tcell/tview; flash messages; command buffer with suggestions; exponential backoff. |
| dive | Multi-pane gocui; filter pane; job control (SIGSTOP/SIGCONT); 100ms race workaround. |
| go-task | BubbleTea only for prompts; fatih/color for output; 3-signal force-exit. |
| rclone | Raw VT100 codes; 500ms progress ticker; liner-based prompts; SIGINFO (BSD). |
| restic | Goroutine channel terminal I/O; dual-mode TTY/file; atomic counters; global signal limitation. |
| age | /dev/tty bypass for plugins; ephemeral prompts; binary output guard; chunked streaming. |
| mitchellh-cli | UI interface layering (decorator pattern); signal-handled Ask; speakeasy for passwords. |
| helm | CLI-first; kstatus watcher for wait; debug logging as primary feedback; no progress. |
| urfave-cli | Template-based help; shell completion via go:embed; Reader for test injection. |
| yq | Filter paradigm; color as post-processing; NO_COLOR support; in-place edit temp file leak. |

## Open Questions

1. **Why do projects fork terminal libraries?** k9s uses `derailed/tcell/tview` forks without documented reason. Is this for custom modifications, different release cadence, or historical accident?

2. **Should filter tools have progress indicators?** yq processes large files silently. Is this acceptable for a filter tool, or should users expect feedback?

3. **Goroutine cleanup on cancellation** — restic documents a goroutine leak (`global/global.go:226`). Is this a known Go limitation with `term.ReadPassword` or a fixable bug?

4. **BubbleTea vs. tcell tradeoffs** — BubbleTea is more idiomatic Go and testable; tcell/tview is richer but more coupled. Which approach wins for new Go TUI projects?

5. **Accessibility baseline** — Only gh-cli's `huh` has explicit accessibility mode. Should all interactive Go CLIs provide screen reader support?

## Evidence Index

| Evidence | Source |
|----------|--------|
| chezmoi BubbleTea models | `internal/chezmoibubbles/passwordinputmodel.go:8-53` |
| chezmoi progress spinner | `internal/cmd/readhttpresponse.go:25-108` |
| chezmoi cancel returns exit 0 | `internal/cmd/prompt.go:351-360` |
| fzf dual renderer | `src/tui/tcell.go:1-19`, `src/tui/light.go:110-143` |
| fzf streaming input | `src/reader.go:51-73` |
| fzf CancelGetChar | `src/tui/light.go:399-406` |
| lazygit ViewBufferManager | `pkg/tasks/tasks.go:31-435` |
| lazygit stop-channel | `pkg/tasks/tasks.go:144` |
| lazygit configurable spinner | `pkg/config/user_config.go:845-848` |
| opencode theme system | `internal/tui/theme/manager.go` |
| opencode BubbleTea overlay | `internal/tui/tui.go:717-723` |
| opencode spinner | `internal/format/spinner.go:22-54` |
| gh-cli prompter interface | `internal/prompter/prompter.go:16-81` |
| gh-cli CancelError | `pkg/cmdutil/errors.go:43-45` |
| gdu progress bar | `tui/progressbar.go:14-107` |
| gdu OSC 9;4 | `tui/progress.go:70-82` |
| gdu signal handling | `tui/tui.go:316-338` |
| k9s flash messages | `internal/ui/flash.go:70-85` |
| k9s command buffer | `internal/model/cmd_buff.go:40-72` |
| k9s halt/resume | `internal/view/app.go:333-359` |
| dive gocui layout | `cmd/dive/cli/internal/ui/v1/app/app.go:66-78` |
| dive job control | `cmd/dive/cli/internal/ui/v1/app/job_control_unix.go:13-18` |
| go-task BubbleTea prompts | `internal/input/input.go:88-140` |
| go-task signal handling | `signals.go:11-31` |
| rclone VT100 constants | `lib/terminal/terminal.go:17-68` |
| rclone progress ticker | `cmd/progress.go:24-71` |
| rclone liner prompts | `fs/config/ui.go:48-63` |
| restic terminal interface | `internal/ui/terminal.go:10-34` |
| restic status goroutine | `internal/ui/termstatus/status.go:197-205` |
| restic global signal | `internal/ui/signals/signals.go:19-20` |
| age term package | `internal/term/term.go:8-9` |
| age ephemeral prompts | `internal/term/term.go:16-36` |
| age binary output guard | `cmd/age/age.go:292-301` |
| mitchellh-cli UI interface | `ui.go:19-43` |
| mitchellh-cli interruptible Ask | `ui.go:69-103` |
| helm kstatus watcher | `pkg/kube/statuswait.go:78-102` |
| helm signal handler | `pkg/cmd/install.go:339-345` |
| urfave-cli template help | `help.go:371-388` |
| urfave-cli shell completion | `completion.go:21-41` |
| yq colorizeAndPrint | `pkg/yqlib/color_print.go:7-9` |
| yq in-place handler | `pkg/yqlib/write_in_place_handler.go:46-55` |

---

Generated by protocol `study-areas/09-terminal-ux.md`.