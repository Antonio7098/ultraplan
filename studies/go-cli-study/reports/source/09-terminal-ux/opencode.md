# Repo Analysis: opencode

## Terminal UX & Interaction Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | opencode |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` |
| Group | `opencode` |
| Language / Stack | Go + BubbleTea (charmbracelet/bubbletea) |
| Analyzed | 2026-05-15 |

## Summary

opencode is a terminal-based AI coding agent using the BubbleTea framework from charmbracelet. It implements a rich interactive TUI with sophisticated rendering, theme support, markdown rendering with syntax highlighting, and dialog-based interactions. The UX is highly polished with proper interruptibility, loading states, and progress feedback.

## Rating

**9/10** — Exceptional terminal experience. The project demonstrates careful attention to interactive UX patterns, with well-designed components for chat, file selection, dialogs, and streaming output. The use of BubbleTea as a foundation provides solid MVC architecture, and the custom rendering pipeline for markdown and diffs shows significant engineering investment.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| TUI Framework | BubbleTea (`tea "github.com/charmbracelet/bubbletea"`) with custom appModel as central state | `internal/tui/tui.go:9` |
| Terminal Rendering | Lipgloss for styling (`github.com/charmbracelet/lipgloss"`) | `internal/tui/tui.go:10` |
| Key Binding System | `key.NewBinding()` with help text for all shortcuts | `internal/tui/tui.go:44-81` |
| Theme System | Full theme support with 10+ built-in themes (Dracula, Monokai, Gruvbox, etc.) | `internal/tui/theme/manager.go` |
| Status Bar | Dynamic status component showing LSP diagnostics, tokens, cost, model | `internal/tui/components/core/status.go:119-179` |
| Loading States | `Spinner` struct wrapping BubbleTea spinner for non-interactive mode | `internal/format/spinner.go:13-19` |
| Spinner Model | Custom `spinnerModel` implementing tea.Model with tick/update/view | `internal/format/spinner.go:22-54` |
| Filepicker | Full interactive file picker with navigation, preview, and CWD input | `internal/tui/components/dialog/filepicker.go:79-93` |
| Markdown Rendering | Glamour-based markdown renderer with per-theme adaptive styling | `internal/tui/styles/markdown.go:18-24` |
| Syntax Highlighting | Chroma lexer for code blocks in diffs and tool output | `internal/diff/diff.go:326-532` |
| Progress Feedback | Agent events with progress messages during summarization | `internal/tui/tui.go:323-344` |
| Interruptibility | `Cancel()` method on agent with `ctrl+c` / `esc` key bindings | `internal/tui/page/chat.go:114-121` |
| Diff Rendering | Side-by-side diff with intra-line highlighting via diffmatchpatch | `internal/diff/diff.go:681-798` |
| Textarea Input | BubbleTea textarea with vim-style keybindings and external editor support | `internal/tui/components/chat/editor.go:11-13` |
| Session Management | Multi-session support with switching dialog (`ctrl+s`) | `internal/tui/components/dialog/session.go` |
| Command Palette | Command dialog with custom commands and argument substitution | `internal/tui/components/dialog/commands.go` |
| Permissions Dialog | Permission request flow with allow/deny/allow-for-session options | `internal/tui/components/dialog/permission.go` |
| Overlay System | `layout.PlaceOverlay()` for centered modal dialogs | `internal/tui/tui.go:717-723` |
| Help System | Contextual help with keybindings displayed via `?` key | `internal/tui/components/dialog/help.go` |
| Theme Dialog | Theme switcher with live preview | `internal/tui/components/dialog/theme.go` |
| Model Selection | Model picker dialog with `ctrl+o` shortcut | `internal/tui/components/dialog/complete.go` |
| Auto-compaction | Automatic session summarization when context reaches 95% capacity | `internal/tui/tui.go:335-341` |
| Compacting Overlay | Visual overlay during summarization with message display | `internal/tui/tui.go:743-764` |

## Answers to Protocol Questions

### 1. How is terminal rendering handled?

opencode uses **BubbleTea** (`github.com/charmbracelet/bubbletea`) as its TUI framework, combined with **Lipgloss** for styling. The main entry point is `appModel` in `internal/tui/tui.go:98-141` which implements the `tea.Model` interface. The architecture follows MVC with:
- **Model**: `appModel` holds all UI state (pages, dialogs, selections)
- **View**: `View()` method composes components using `lipgloss.JoinVertical/Horizontal`
- **Controller**: `Update()` method routes messages to appropriate handlers

The rendering is fully declarative: the `View()` method at `tui.go:702-899` builds the entire UI as a string by composing page views, status bar, and overlay dialogs. All styling uses Lipgloss's style system with adaptive colors that respond to terminal background detection (`internal/tui/styles/markdown.go:277-284`).

### 2. How are loading states shown?

Loading states are handled through multiple mechanisms:

**Spinner for Non-Interactive Mode** (`internal/format/spinner.go:12-102`): A dedicated `Spinner` struct wraps BubbleTea's spinner for operations outside the main TUI loop. It uses a separate `tea.Program` running in a goroutine with `context.WithCancel` for clean shutdown.

**Status Bar Messages** (`internal/tui/components/core/status.go:60-69`): The status component listens for `util.InfoMsg` messages with types `InfoTypeInfo`, `InfoTypeWarn`, `InfoTypeError`. These display in the status bar and auto-clear after a TTL (default 10s at `status.go:290`).

**Agent Progress Events** (`internal/tui/tui.go:323-344`): Agent events carry `Progress` strings that are displayed in a compacting overlay. When `isCompacting` is true, a rounded-border overlay appears centered showing "Summarizing\n" + message (`tui.go:743-764`).

**Tool Progress** (`internal/tui/components/chat/message.go:562-578`): Tool calls show contextual progress like "Building command...", "Finding files...", "Reading file..." based on tool type.

### 3. How are prompts implemented?

**Message Editor** (`internal/tui/components/chat/editor.go:26-34`): The `editorCmp` struct wraps BubbleTea's `textarea.Model` for multi-line input. Key features:
- Vim-style bindings (`enter` send, `ctrl+e` open external editor, `\` for newline continuation at `editor.go:202-211`)
- Attachment management with delete mode (`ctrl+r` to enter, number keys to delete at `editor.go:166-186`)
- External editor opens via `exec.Command` with `EDITOR` env var fallback to `nvim` (`editor.go:82-116`)

**File Picker** (`internal/tui/components/dialog/filepicker.go:79-93`): Full interactive file browser with:
- vim-style navigation (`j/k` for up/down, `h/l` for back/forward)
- `enter` to select file/directory
- `i` to manually type path with textinput
- Preview pane for image files (`filepicker.go:386-411`)

**Dialogs**: Multiple overlay dialogs (session, command, model, theme, init) all use the same overlay rendering pattern via `layout.PlaceOverlay()`.

**Command Palette** (`internal/tui/components/dialog/commands.go`): Custom commands with handlers, argument support via `$variable` substitution, and multi-argument dialog for commands that need multiple inputs.

### 4. Is the UX interruptible?

**Yes, highly interruptible.** Evidence:

1. **Cancellation** (`internal/tui/page/chat.go:114-121`): The `Cancel` keymap bound to `esc` calls `p.app.CoderAgent.Cancel(p.session.ID)` to abort in-progress generation.

2. **Quit handling** (`internal/tui/tui.go:455-476`): `ctrl+q` toggles quit dialog without force-killing; agent busy state blocks certain actions but still allows quit dialog.

3. **Dialog dismissal**: All dialogs can be dismissed with `esc` or by pressing the key again. The filepicker respects `IsCWDFocused()` to avoid capturing keys when typing paths (`tui.go:526-530`).

4. **Agent busy guard** (`internal/tui/tui.go:681-683`): Page navigation is blocked when agent is busy with message "Agent is busy, please wait...".

5. **Graceful spinner shutdown** (`internal/format/spinner.go:84-96`): Uses `context.CancelFunc` and waits for goroutine completion via `done` channel.

## Architectural Decisions

1. **BubbleTea + Lipgloss stack**: Chose charmbracelet's ecosystem for TUI. BubbleTea provides the MVC architecture with message-passing; Lipgloss handles declarative styling. Evidence: `internal/tui/tui.go:8-10` imports.

2. **Overlay-based dialog system**: All modal dialogs render as overlays centered on the main view, using `layout.PlaceOverlay()` rather than separate views. This keeps state management simpler. Evidence: `tui.go:711-896`.

3. **Theme abstraction layer**: The `Theme` interface (`internal/tui/theme/theme.go`) abstracts all color choices, with 10+ implementations. This allows runtime switching and adaptive colors. See `theme/manager.go` for theme loading.

4. **Markdown rendering via Glamour**: Markdown content (messages, tool results) is rendered through `GetMarkdownRenderer()` which creates a `glamour.TermRenderer` with theme-adaptive style configuration. Evidence: `internal/tui/styles/markdown.go:18-24`.

5. **Syntax highlighting via Chroma**: Diffs and code blocks use Chroma lexers/formatters with dynamically generated XML theme based on current theme colors. Evidence: `internal/diff/diff.go:326-532`.

6. **Split-pane layout**: Chat page uses `layout.NewSplitPane()` with left panel (messages) and bottom panel (editor). Evidence: `internal/tui/page/chat.go:232-235`.

## Notable Patterns

1. **Key binding pattern**: All key bindings follow `key.NewBinding(key.WithKeys(...), key.WithHelp(...))` pattern, providing both functionality and auto-generated help. See `tui.go:44-86`.

2. **Message routing via type switch**: The `Update()` method at `tui.go:182` uses type switches on `tea.Msg` variants, with each dialog getting its own update branch. Dialogs block key messages when open.

3. **Tea.Cmd for side effects**: Commands returned from `Update()` are batched with `tea.Batch()` and executed by BubbleTea's runtime. This includes async operations like file reading (`filepicker.go:416-427`).

4. **Adaptive color pattern**: Colors defined as `lipgloss.AdaptiveColor{Dark: "...", Light: "..."}` with runtime detection via `lipgloss.HasDarkBackground()`. See `styles/markdown.go:277-284`.

5. **Component composition**: Containers wrap components with padding/border options. Example: `internal/tui/page/chat.go:219-226` creates message and editor containers.

6. **Agent event subscription**: Components subscribe to `pubsub.Event[agent.AgentEvent]` for real-time agent updates (`tui.go:323-344`).

## Tradeoffs

1. **Complexity of custom diff rendering**: The side-by-side diff with intra-line highlighting (`internal/diff/diff.go`) is sophisticated but adds significant code. Simpler approaches (unified diff only) would be easier to maintain.

2. **Theme system overhead**: 10+ theme files with color mappings add maintenance burden. However, the abstraction pays off for user experience.

3. **Goroutine management in filepicker**: `readDir()` at `filepicker.go:413-462` uses goroutines with timeout channels. Memory management for long-running file operations could be tricky.

4. **Markdown rendering cost**: `GetMarkdownRenderer()` creates a new renderer per call (`styles/markdown.go:18-24`). Caching could improve performance for repeated renders.

5. **No streaming text**: Unlike some CLIs that stream tokens as they arrive, opencode renders complete messages. This is simpler but less responsive for long responses.

## Failure Modes / Edge Cases

1. **Editor crash**: If `EDITOR` points to a non-existent binary, `tea.ExecProcess()` at `editor.go:97` will return an error. Currently caught and reported via `util.ReportError`.

2. **Large file blocking**: The filepicker `getCurrentFileBelowCursor()` (`filepicker.go:386-411`) runs preview generation in a goroutine without cancellation. Large images could block briefly.

3. **Session cancellation race**: If `Cancel()` is called while a response is completing, the `Done` event may still fire. The compacting logic at `tui.go:332-342` handles this by checking `payload.Type`.

4. **Theme switch during render**: If theme changes mid-render (via `ThemeChangedMsg`), components may render with mixed colors until next full redraw. BubbleTea's redraw should handle this.

5. **LSP initialization timeout**: The status bar shows "Initializing LSP..." but if LSP never connects, this persists indefinitely. No timeout/failure UI.

6. **Missing completion candidates**: The completion dialog at `internal/tui/page/chat.go:106-134` shows nothing if no completions match; user must dismiss with another key press.

## Future Considerations

1. **Streaming token display**: Rendering tokens as they arrive would improve perceived responsiveness for large responses.

2. **Async file operations**: Consider adding progress for file writes/reads during tool execution.

3. **Search/filter in filepicker**: Currently only manual path entry; a search filter would improve UX.

4. **Persistent notification center**: The status bar only shows one message at a time; a notification stack could show history.

5. **Viewport scroll sync**: Message list should auto-scroll to new messages; current implementation may require manual scrolling.

6. **Mouse support**: BubbleTea supports mouse events; adding mouse interactions (click to select, scroll) could improve accessibility.

7. **Key chord support**: Some CLIs support key sequences (e.g., `gd` for "go to definition"). This could reduce keyboard travel.

## Questions / Gaps

1. **No evidence found** for terminal bell/alert sounds — could improve UX for background operations completing.

2. **No evidence found** for clipboard integration — could enhance file/path sharing workflows.

3. **No evidence found** for terminal title manipulation — could show current session context.

4. **Auto-scroll behavior unclear** — could not find explicit scroll-to-bottom logic in message list rendering.

---

Generated by `study-areas/09-terminal-ux.md` against `opencode`.