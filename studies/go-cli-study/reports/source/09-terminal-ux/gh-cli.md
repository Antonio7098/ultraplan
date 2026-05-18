# Repo Analysis: gh-cli

## Terminal UX & Interaction Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | gh-cli |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/gh-cli` |
| Group | `gh-cli` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

The GitHub CLI (`gh`) is a mature Go CLI with thoughtful terminal UX. It uses a layered prompting architecture with three backends (survey, huh experimental, huh accessible), a robust I/OStreams abstraction for color/pager/terminal detection, and a spinner-based progress indicator. Interruptibility is handled via CancelError and terminal.InterruptErr. The UX is highly polished with dark/light theme detection, truecolor support, and an alternate screen buffer for interactive workflows.

## Rating

**8/10** — Thoughtful and polished. The CLI handles terminal rendering, interactive flows, and progress feedback very well. The multi-select with search is exceptional. Minor deductions for survey being a legacy dependency with the experimental prompter as opt-in.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Terminal detection | `IsStdoutTTY()` checks `GH_FORCE_TTY` env var and cygwin terminals | `pkg/iostreams/iostreams.go:175-179` |
| Color scheme | `ColorScheme` struct with TrueColor, 256-color, accessible, and theme support | `pkg/iostreams/color.go:45-58` |
| Theme detection | `DetectTerminalTheme()` using `GLAMOUR_STYLE` env var override | `pkg/iostreams/iostreams.go:116-130` |
| Progress indicator | `StartProgressIndicatorWithLabel()` with spinner.CharSets[11] braille pattern | `pkg/iostreams/iostreams.go:291-328` |
| Textual fallback | `startTextualProgressIndicator()` prints "Working..." when spinner disabled | `pkg/iostreams/iostreams.go:330-346` |
| Alternate screen buffer | `StartAlternateScreenBuffer()` uses ANSI `\x1b[?1049h` | `pkg/iostreams/iostreams.go:368-387` |
| Pager | `StartPager()` sets `LESS=FRX` env var and handles EPIPE | `pkg/iostreams/iostreams.go:205-261` |
| Prompting architecture | `Prompter` interface with three implementations: survey, huh, accessible | `internal/prompter/prompter.go:16-81` |
| Prompter selection | `New()` selects experimental/accessible/standard based on flags | `internal/prompter/prompter.go:55-81` |
| MultiSelectWithSearch | Custom `multiSelectSearchField` using bubbles/spinner/tea | `internal/prompter/multi_select_with_search.go:20-50` |
| Cancellation handling | `IsUserCancellation()` checks both `CancelError` and `terminal.InterruptErr` | `pkg/cmdutil/errors.go:43-45` |
| Prompter cancellation | `huhPrompter.runForm()` maps `huh.ErrUserAborted` to `terminal.InterruptErr` | `internal/prompter/huh_prompter.go:29-39` |

## Answers to Protocol Questions

### 1. How is terminal rendering handled?

Terminal rendering is handled through the `IOStreams` struct (`pkg/iostreams/iostreams.go`) which abstracts TTY detection, color output, pager spawning, and alternate screen buffers.

- **Color rendering**: `ColorScheme` (`pkg/iostreams/color.go:45`) supports truecolor (24-bit), 256-color, and 8-bit modes. Theme-aware rendering detects dark/light terminal background via `DetectTerminalTheme()` (`iostreams/iostreams.go:116`). Uses `ansi.ColorFunc` for styling.

- **Pager support**: `StartPager()` (`iostreams/iostreams.go:205`) spawns the user's preferred pager (from `PAGER` env or `cat`), sets `LESS=FRX` for friendly defaults, and wraps `ErrClosedPagerPipe` for graceful pager exit.

- **Alternate screen buffer**: `StartAlternateScreenBuffer()` (`iostreams/iostreams.go:368`) uses ANSI escape sequences to enter alternate screen mode, with a signal handler to restore the screen on interrupt.

- **No dedicated TUI framework**: gh-cli does not use BubbleTea, tview, or other full TUI frameworks. Interactive elements are prompt-based rather than screen-based TUI.

### 2. How are loading states shown?

Loading states use a spinner from `github.com/briandowns/spinner` via `IOStreams.StartProgressIndicatorWithLabel()` (`pkg/iostreams/iostreams.go:291-328`).

- **Visual spinner**: Uses braille character set (CharSets[11]: `⣾ ⣷ ⣽ ⣻ ⡿`), 120ms tick rate, cyan color, with optional label prefix.
- **Textual fallback**: When spinner is disabled (`s.spinnerDisabled`), prints `ColorScheme().Cyan("Working...")` followed by newline (`pkg/iostreams/iostreams.go:330-346`).
- **Convenience wrapper**: `RunWithProgress(label, run)` (`iostreams/iostreams.go:361-366`) combines start/stop with a function call using defer.
- **Usage pattern**: Found in 221 locations across commands like `workflow/view`, `run/view`, `search/repos`, `repo/fork`, etc. with `defer opts.IO.StopProgressIndicator()` after `StartProgressIndicator()`.

### 3. How are prompts implemented?

Prompts use a layered architecture via the `Prompter` interface (`internal/prompter/prompter.go:16-53`):

- **Standard (survey)**: Wraps `github.com/AlecAivazis/survey/v2` via `go-gh/pkg/prompter`. Supports `Select`, `MultiSelect`, `Input`, `Password`, `Confirm`.
- **Experimental (huh)**: `huhPrompter` (`internal/prompter/huh_prompter.go`) uses `charm.land/huh/v2` for more polished forms-based input.
- **Accessible (huh)**: `accessiblePrompter` uses `huh` with `ThemeBase16` and `WithAccessible(true)` for screen reader compatibility.
- **Selection logic**: `New()` (`prompter/prompter.go:55-81`) checks `io.ExperimentalPrompterEnabled()` first, then `io.AccessiblePrompterEnabled()`, falling back to survey.
- **gh-specific prompts**: `AuthToken()` for auth tokens, `ConfirmDeletion()` requiring typed confirmation, `InputHostname()` with validation, `MarkdownEditor()` launching external editor.
- **Extended survey**: `GhEditor` (`pkg/surveyext/editor.go`) extends survey's Editor with blank-allowed support and custom prompt rendering.
- **MultiSelectWithSearch**: Custom `multiSelectSearchField` (`internal/prompter/multi_select_with_search.go`) combines search input with multi-select using bubbles components (spinner, textinput, tea).

### 4. Is the UX interruptible?

Yes, UX is fully interruptible.

- **Cancellation signals**: `CancelError` (`pkg/cmdutil/errors.go:38`) and `terminal.InterruptErr` are both treated as user cancellations via `IsUserCancellation()` (`errors.go:43-45`).
- **Signal handling**: `StartAlternateScreenBuffer()` (`iostreams/iostreams.go:376-384`) registers an interrupt signal handler that calls `StopAlternateScreenBuffer()` and exits.
- **Prompter cancellation**: `huhPrompter.runForm()` (`huh_prompter.go:29-39`) maps `huh.ErrUserAborted` to `terminal.InterruptErr` for consistent handling.
- **Graceful pager exit**: `pagerWriter` wraps EPIPE errors in `ErrClosedPagerPipe` (`iostreams.go:26-28`) to prevent broken pipe errors when pager is closed.
- **Non-blocking patterns**: `CanPrompt()` (`iostreams/iostreams.go:263-269`) checks both stdin and stdout are TTYs to avoid prompting in pipelines.

## Architectural Decisions

- **IOStreams as central abstraction**: All terminal I/O goes through `IOStreams` (`pkg/iostreams/iostreams.go`), making it easy to mock in tests and swap implementations.
- **Three-tier prompter strategy**: The survey→huh→accessible progression shows a migration path. Survey is legacy; huh is the experimental future; accessible is the accessibility path.
- **Bubbles + lipgloss for MultiSelectWithSearch**: The custom `multiSelectSearchField` builds on charm.sh's component libraries rather than a full TUI framework, giving fine-grained control over the interactive search experience.
- **Feature flags for new UX**: `ExperimentalPrompterEnabled` and `AccessiblePrompterEnabled` gates new UX behind flags, allowing gradual rollout.

## Notable Patterns

- **`RunWithProgress` pattern**: Commands wrap long-running operations with `defer io.StopProgressIndicator()` immediately after `StartProgressIndicatorWithLabel()`, ensuring cleanup even on error.
- **TTY-aware fallbacks**: Commands consistently check `CanPrompt()` before prompting and `IsStdoutTTY()` before using pager/color, with non-interactive fallbacks.
- **Prompter mock in tests**: `prompter.MockPrompter` (`internal/prompter/prompter_mock.go`) allows deterministic testing of interactive flows.
- **Color scheme as composition**: `ColorScheme` methods return styled strings rather than raw escape sequences, allowing consistent color application across output.

## Tradeoffs

- **survey as legacy**: The survey library is not actively maintained. The huh library is the modern replacement but is still experimental. This creates maintenance burden and limits access to newer UX patterns.
- **Experimental prompter off by default**: The polished huh-based prompter requires `GH_EXPERIMENTAL_PROMPTER=1` to enable, meaning most users use the legacy survey backend.
- **No streaming output support**: gh-cli does not appear to have a streaming output mechanism for long-running commands; progress is shown via spinner, not incremental output updates.
- **No full-screen TUI**: gh-cli uses prompt-based interaction rather than a full TUI with regions. This simplifies the code but limits the complexity of interactive workflows.
- **Password echo mode**: `huh` does not support proper password masking (see comment in `huh_prompter.go:203`), falling back to `EchoModeNone` which hides input but does not echo asterisks.

## Failure Modes / Edge Cases

- **Broken pipe on pager exit**: `pagerWriter.Write()` (`iostreams/iostreams.go:583-589`) swallows EPIPE errors to prevent "write: broken pipe" errors when user quits the pager early.
- **Cygwin terminal detection**: Uses `isatty.IsCygwinTerminal()` (`iostreams.go:575`) for Windows Cygwin compatibility.
- **Colorable on Windows**: `colorable.NewColorable()` (`iostreams.go:484-489`) translates ANSI sequences to console syscalls on Windows without VT support.
- **Spinner disabled in piped contexts**: When stdout/stderr are not both TTYs, `progressIndicatorEnabled` stays false (`iostreams.go:514-516`), so spinner never starts.
- **Prompter initialization failures**: `survey.AskOne()` wrapped in `fmt.Errorf("could not prompt: %w", err)` (`prompter.go:584`) to provide context on prompt failures.

## Future Considerations

- **Promote huh from experimental**: The huh-based prompter is more polished and should become the default, with survey removed once stable.
- **Consider streaming output**: Long-running commands like `gh run watch` could benefit from incremental output rather than spinner-only feedback.
- **Accessible prompter improvements**: `MultiSelectWithSearch` accessible mode is not implemented (`multi_select_with_search.go:389-391`), leaving a gap for screen reader users.

## Questions / Gaps

- **No evidence found** for streaming text handling (streaming output line-by-line as data arrives). All long operations use spinner-based progress feedback, not incremental output.
- **No evidence found** for a full-screen TUI framework (BubbleTea, tview, etc.). All interactive flows are prompt-based.
- **`MultiSelectWithSearch` accessible mode** is a stub (`RunAccessible` at `multi_select_with_search.go:389` prints a message and returns nil), leaving the search-based multi-select inaccessible to screen reader users.

---

Generated by `study-areas/09-terminal-ux.md` against `gh-cli`.