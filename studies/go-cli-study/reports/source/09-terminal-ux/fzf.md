# Repo Analysis: fzf

## Terminal UX & Interaction Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | fzf |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/fzf` |
| Group | `09-terminal-ux` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

fzf implements a dual-renderer architecture: a custom `LightRenderer` using raw ANSI escape codes for non-fullscreen mode, and a `FullscreenRenderer` wrapping the `tcell` library for fullscreen terminals. The terminal UX is exceptionally polished with rich color theme support, comprehensive keyboard/mouse event handling, streaming input processing, and well-designed interruptibility patterns.

## Rating

**9/10** — Exceptional terminal experience. fzf demonstrates professional-grade terminal UX with thoughtful details: multiple border styles, precise color control, smooth spinner animations, mouse support, bracket paste mode, and graceful interrupt handling. The dual-renderer approach intelligently balances compatibility (light renderer for basic terminals) with capability (tcell for full-featured terminals).

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Terminal library | Dual renderer: LightRenderer (ANSI escapes) + FullscreenRenderer (tcell) | `src/tui/tcell.go:1-19`, `src/tui/light.go:110-143` |
| Renderer interface | `Renderer` interface with Init, Pause, Resume, Clear, GetChar, etc. | `src/tui/tui.go:843-870` |
| Window interface | `Window` interface for drawing/printing operations | `src/tui/tui.go:872-914` |
| Event system | ~80+ event types (keyboard, mouse, resize, paste) | `src/tui/tui.go:51-232` |
| Mouse handling | CSI mouse tracking with double-click detection | `src/tui/light.go:879-950` |
| Key bindings | Default keymap with ~80+ bindings | `src/terminal.go:827-905` |
| Color themes | 5 themes: NoColor, Empty, Default16, Dark256, Light256 | `src/tui/tui.go:989-1246` |
| Border styles | 14 border shapes (rounded, sharp, bold, block, double, etc.) | `src/tui/tui.go:579-600`, `654-794` |
| Spinner | Animated spinner with unicode/ASCII variants | `src/terminal.go:926-931` |
| Loading states | Previewer struct with spinner and progress tracking | `src/terminal.go:143-163` |
| Streaming input | Reader with event-based streaming and polling | `src/reader.go:51-73` |
| Interruptibility | Ctrl+C, SIGSTOP, CancelGetChar support | `src/tui/light.go:350-351`, `399-406` |
| Bracketed paste | Bracketed paste mode enable/disable | `src/tui/light.go:982` |
| Progress bar | Scrollbar with dynamic position calculation | `src/terminal.go:1666-1678` |
| ESC delay | Configurable ESCDELAY for terminal responsiveness | `src/tui/light.go:200` |

## Answers to Protocol Questions

### 1. How is terminal rendering handled?

fzf uses a dual-renderer architecture:

- **LightRenderer** (`src/tui/light.go:110-143`): Custom renderer using raw ANSI escape sequences (CSI codes). Suitable for non-fullscreen mode and legacy terminals. Uses `golang.org/x/term` for terminal state management.

- **FullscreenRenderer** (`src/tui/tcell.go`): Wraps the `github.com/gdamore/tcell/v2` library for fullscreen terminals. Provides richer functionality including better mouse support and true color.

The `Renderer` interface (`src/tui/tui.go:843-870`) defines the contract:
- `Init()`, `Close()` for lifecycle
- `Pause()`, `Resume()` for SIGSTOP handling
- `GetChar()` for input with `cancellable` parameter
- `NewWindow()` for creating drawing surfaces

The `Window` interface (`src/tui/tui.go:872-914`) handles drawing:
- `Move()`, `Print()`, `CPrint()` for text output with colors
- `DrawBorder()`, `DrawHBorder()` for borders
- `Fill()`, `CFill()` for multi-line text with wrapping

### 2. How are loading states shown?

Loading states are handled through multiple mechanisms:

**Spinner** (`src/terminal.go:926-931`):
```go
func makeSpinner(unicode bool) []string {
    if unicode {
        return []string{`⠋`, `⠙`, `⠹`, `⠸`, `⠼`, `⠴`, `⠦`, `⠧`, `⠇`, `⠏`}
    }
    return []string{`-`, `\`, `|`, `/`, `-`, `\`, `|`, `/`}
}
```
Unicode spinner uses braille characters for visual appeal.

**Previewer struct** (`src/terminal.go:143-163`):
```go
type previewer struct {
    version    int64
    lines      []string
    offset     int
    scrollable bool
    final      bool
    following  resumableState
    spinner    string    // ← current spinner frame
    bar        []bool    // progress bar
    xw         [2]int
}
```

**Info display** (`src/terminal.go:1676`): The scrollbar position dynamically reflects the current viewing position within the total items.

**Terminal pause** (`src/tui/light.go:962-975`): The renderer can pause (e.g., when background process runs) and show a "paused" indicator.

### 3. How are prompts implemented?

Prompts are implemented through a sophisticated parsing system:

**Prompt parsing** (`src/terminal.go:1620-1660`):
- `parsePrompt()` extracts ANSI color codes and trailing whitespace handling
- Prompt is rendered via `printHighlighted()` with color pair `tui.ColPrompt`
- Supports placeholder tokens: `{q}`, `{n}`, `{f}`, `{s}`, etc.

**Prompt rendering** (`src/terminal.go:1644-1656`):
```go
output := func() {
    wrap := t.wrap
    t.wrap = false
    t.withWindow(t.inputWindow, func() {
        line := t.promptLine()
        // ... print highlighted prompt
    })
    t.wrap = wrap
}
```

**Default key bindings** (`src/terminal.go:827-905`):
- `Enter` → `actAccept` (accept selection)
- `Ctrl+C` / `Esc` / `Ctrl+G` → `actAbort` (cancel)
- `Ctrl+J/K` → `actDown/actUp` (navigate)
- `Tab` → `actToggleDown`, `ShiftTab` → `actToggleUp`
- etc.

### 4. Is the UX interruptible?

**Yes**, fzf has comprehensive interruptibility:

**Ctrl+C handling** (`src/tui/light.go:350-351`):
```go
case CtrlC.Byte():
    return Event{CtrlC, 0, nil}
```
Immediately returns `CtrlC` event which maps to `actAbort`.

**CancelGetChar** (`src/tui/light.go:399-406`):
```go
func (r *LightRenderer) CancelGetChar() {
    r.mutex.Lock()
    if r.cancel != nil {
        r.cancel()
        r.cancel = nil
    }
    r.mutex.Unlock()
}
```
Allows external cancellation of input reading.

**SIGSTOP / Ctrl+Z** (`src/terminal.go:865`):
```go
if !util.IsWindows() {
    add(tui.CtrlZ, actSigStop)
}
```
Suspends fzf to background.

**Pause/Resume** (`src/tui/light.go:962-1015`):
```go
func (r *LightRenderer) Pause(clear bool) {
    r.disableModes()
    r.restoreTerminal()
    // ... clear screen if needed
}

func (r *LightRenderer) Resume(clear bool, sigcont bool) {
    r.setupTerminal()
    // ... re-enable modes
    if sigcont && !r.fullscreen && r.mouse {
        r.disableMouse()  // Mouse offset may be stale after SIGCONT
        r.mouse = false
    }
}
```

**Background actions** (`src/terminal.go:680`):
- `actBgCancel` for cancelling background transformations
- `bgSemaphore` limits concurrent background processes (max `maxBgProcesses`)
- `bgQueue` maps actions to their completion callbacks

**Execute with timeout** (`src/terminal.go:67-69`):
```go
// execute-silent and transform* actions will block user input for this duration.
// After this duration, users can press CTRL-C to terminate the command.
const blockDuration = 1 * time.Second
```

## Architectural Decisions

1. **Dual renderer for compatibility vs capability**: LightRenderer for broad terminal compatibility, FullscreenRenderer (tcell) for feature-rich terminals. Default16/Dark256/Light256 themes adapt to terminal capabilities (`src/tui/tcell.go:120-129`).

2. **Event-driven architecture**: Rich `EventType` enum (~80 variants) unified handling for keyboard, mouse, resize, and paste events. `GetChar()` returns single `Event` regardless of input type (`src/tui/tui.go:234-249`).

3. **ANSI escape sequences for light renderer**: Direct CSI codes rather than a library. Enables fine-grained control (`src/tui/light.go:87-91`):
   ```go
   func (r *LightRenderer) csi(code string) string {
       fullcode := "\x1b[" + code
       r.stderr(fullcode)
       return fullcode
   }
   ```

4. **Color pair abstraction**: `ColorPair` struct separates fg/bg/underline colors with attribute flags, allowing complex theming (`src/tui/tui.go:372-478`).

5. **Window abstraction**: `Window` interface isolates drawing operations, enabling both renderers to share the same high-level code (`src/tui/tui.go:872-914`).

6. **Platform-specific code paths**: Windows uses winpty for pseudo-terminal emulation (`src/winpty_windows.go`), Unix uses pty (`src/proxy_unix.go`).

## Notable Patterns

1. **Unicode-aware rendering**: Uses `github.com/rivo/uniseg` for proper grapheme cluster handling, essential for complex Unicode characters (`src/tui/tui.go:1469-1510`).

2. **Double-click detection** (`src/tui/light.go:928-947`): Tracks click coordinates and timing to distinguish single vs double clicks.

3. **Escape sequence polling with configurable delay** (`src/tui/light.go:200`, `279-326`): ESCDELAY env var controls how long to wait for escape sequence completion (default 100ms).

4. **Deferred action execution**: `deferActivation()` delays UI activation until first results when `--sync` is used with start/load/result events (`src/terminal.go:1365-1367`).

5. **Streaming with progress**: Reader polls for new input with exponential backoff (`src/reader.go:51-73`), preview updates trigger `reqPreviewRefresh` events.

6. **Terminal state save/restore**: Uses `golang.org/x/term` to save/restore terminal state on init/exit (`src/tui/light.go:122`, `1063`).

## Tradeoffs

1. **Complexity of dual renderer**: Maintaining two renderer implementations increases code complexity but is necessary for broad compatibility.

2. **Light renderer lacks some features**: FullscreenRenderer (tcell) provides resize events and scrollbar redraw detection; LightRenderer does not (`src/tui/light.go:1027-1033`):
   ```go
   func (r *LightRenderer) NeedScrollbarRedraw() bool { return false }
   func (r *LightRenderer) ShouldEmitResizeEvent() bool { return false }
   ```

3. **Mouse tracking limitations**: LightRenderer mouse handling is more complex due to manual escape sequence parsing; tcell provides cleaner abstraction.

4. **Performance vs portability**: Using ANSI escape codes directly is portable but requires careful handling of edge cases (e.g., wide characters, combining characters).

## Failure Modes / Edge Cases

1. **Terminal capability detection**: If TERM=cygwin, it is cleared to improve compatibility (`src/tui/tcell.go:195-197`).

2. **Input buffer overflow** (`src/tui/light.go:318-322`): If input buffer exceeds 1MB, fzf terminates immediately:
   ```go
   if len(buffer) > maxInputBuffer {
       r.Close()
       return nil, getCharError, fmt.Errorf("input buffer overflow (%d): %v", len(buffer), buffer)
   }
   ```

3. **Mouse offset after SIGCONT** (`src/tui/light.go:1008-1014`): When resuming from SIGSTOP, mouse tracking is disabled because cursor offset is likely stale.

4. **Wide character border rendering** (`src/tui/tcell.go:1031-1054`): tcell has an issue displaying two overlapping wide runes, so line drawing stops before cap position.

5. **Preview window resize during streaming** (`src/terminal.go:4061-4066`): Preview version is reset to force full redraw on window changes.

6. **Unicode rendering assumptions** (`src/tui/tui.go:1465-1467`): Assumes `uniseg.StringWidth` correctly handles all Unicode cases.

## Future Considerations

1. **FullscreenRenderer CancelGetChar** (`src/tui/tcell.go:708-710`): Currently a TODO - cannot cancel tcell's PollEvent.

2. **Pixel dimensions** (`src/tui/tcell.go:245-249`): Not implemented for tcell renderer.

3. **Kitty/Sixel pass-through**: Initial code for pass-through graphics is commented out (`src/terminal.go:77-90`), may be completed in future.

## Questions / Gaps

1. **No evidence found** for Bubble Tea or other third-party terminal libraries — fzf uses custom implementations.

2. **No evidence found** for interactive prompt dialogs (yes/no confirmations, etc.) — fzf is primarily a selector, not an interactive installer.

3. **No evidence found** for progress percentage display during search — only spinner and scrollbar position indicate activity.

4. **No evidence found** for streaming text truncation or virtualization — all matched items may be held in memory.

---

Generated by `study-areas/09-terminal-ux.md` against `fzf`.