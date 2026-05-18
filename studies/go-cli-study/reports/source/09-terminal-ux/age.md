# Repo Analysis: age

## Terminal UX & Interaction Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | age |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/age` |
| Group | `{{repo_group}}` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

age is a file encryption tool with a minimalist terminal UI philosophy. No external terminal libraries are used; instead, raw `/dev/tty` access and `golang.org/x/term` provide all terminal interaction. Prompts are ephemeral (cleared after use), output uses stderr with "age:" prefix, and interactive flows are simple but functional. The UX design prioritizes security (passphrase masking) and correctness (refusing binary output to terminals) over visual polish.

## Rating

**6/10** — Functional but rough.

age handles terminal I/O correctly and safely, but lacks progress indicators, streaming feedback, and rich interaction patterns. The UX is barebones compared to tools using BubbleTea or similar frameworks. It meets the minimum bar for usability but doesn't excel at it.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Terminal library | Uses `golang.org/x/term` for password/input reading | `internal/term/term.go:8-9` |
| Prompt implementation | `ReadSecret`, `ReadPublic`, `ReadCharacter` in term package | `internal/term/term.go:65-117` |
| Ephemeral prompts | `clearLine` clears prompt after input | `internal/term/term.go:16-36` |
| Direct /dev/tty access | `WithTerminal` opens `/dev/tty` on Unix, `CONIN$/CONOUT$` on Windows | `internal/term/term.go:41-62` |
| Progress indicators | No progress bars or spinners found | — |
| Streaming output | Stream-based chunked encryption (`EncryptWriter`, `DecryptReader`) | `internal/stream/stream.go:179-255` |
| Interruptible UX | CTRL-C supported in plugin confirm prompts | `plugin/tui.go:67-68` |
| Binary output safety | Refuses to output binary to terminal; suggests `-o -` | `cmd/age/age.go:292-301` |
| Passphrase prompt | `passphrasePromptForEncryption` for set/confirm; `passphrasePromptForDecryption` for read | `cmd/age/age.go:323-349,523-529` |

## Answers to Protocol Questions

### 1. How is terminal rendering handled?

Terminal rendering uses `golang.org/x/term` for raw terminal I/O, accessed via `/dev/tty` (Unix) or `CONIN$/CONOUT$` (Windows) to bypass stdin/stdout redirection. The `WithTerminal` function (`internal/term/term.go:41-62`) attempts three strategies: Windows console, `/dev/tty`, then falls back to stdin if it's a terminal.

No ANSI escape codes for colors or styled output are used. The `clearLine` function (`internal/term/term.go:18-36`) uses basic escape sequences (`\r\n`, `CPL`, `EL`) for line clearing when virtual terminal processing is available.

### 2. How are loading states shown?

**No explicit loading states exist.** The codebase has no progress bars, spinners, or percentage indicators. Long operations (encryption/decryption of large files) proceed silently using chunked streaming (`internal/stream/stream.go`), but the user receives no feedback until completion.

The `plugin/tui.go:74-76` shows a `WaitTimer` function that prints a waiting message, but this appears to be unimplemented or unused in the main `cmd/age` flow.

### 3. How are prompts implemented?

Three prompt types exist in `internal/term/term.go`:
- `ReadSecret` (line 65-73): reads password with no echo using `term.ReadPassword`
- `ReadPublic` (line 76-93): reads public input with echo, uses `term.MakeRaw` for raw mode
- `ReadCharacter` (line 97-117): reads single character with no echo, used for confirmations

Prompts are ephemeral—each ends with `defer clearLine(out)` to erase the prompt text after input.

Plugin prompts in `plugin/tui.go:22-73` wrap these functions with additional message formatting and CTRL-C handling.

### 4. Is the UX interruptible?

**Partially.** The plugin confirm dialog (`plugin/tui.go:67-68`) handles CTRL-C (`'\x03'`) and returns "user cancelled prompt" error. However, the main encryption/decryption loops (`io.Copy` in `cmd/age/age.go:429,516`) have no visible interruptibility— Ctrl+C will terminate the process but won't gracefully cancel the operation.

The TTY buffering for interactive input (`bufferTerminalInput` in `cmd/age/tui.go:63-74`) helps avoid interference between typing and output, but this is input buffering, not progress interruptibility.

## Architectural Decisions

1. **No external terminal libraries** — Uses only `golang.org/x/term` and raw syscall access to `/dev/tty`. This keeps dependencies minimal but requires manual implementation of all interaction patterns.

2. **Ephemeral prompts** — All prompts clear after use via `clearLine`. This prevents terminal history pollution but sacrifices the ability to review prompt content.

3. **TTY bypass for plugin UI** — Plugins receive a `ClientUI` that uses `/dev/tty` directly (`plugin/tui.go:13-15`), allowing plugins to prompt even when `age` is invoked with redirected stdin/stdout.

4. **Binary output guard** — Refuses to send binary to terminal unless explicitly requested with `-o -` (`cmd/age/age.go:286-303`). This prevents terminal corruption but can be surprising to users.

5. **Stderr-based output with prefix** — All non-prompt output goes to stderr with "age:" prefix, no periods, no capitalization (`cmd/age/tui.go:33-35`). This creates a clean separation between tool output and plugin messages.

## Notable Patterns

- **Chunked streaming**: `EncryptWriter`/`DecryptReader` in `internal/stream/stream.go:179-347` handle arbitrary-size files without loading them into memory, but provide no progress callbacks.
- **Lazy file opening**: `lazyOpener` (`cmd/age/age.go:560-585`) defers file creation until first write, enabling output to same file as input with appropriate error checks.
- **Plugin UI abstraction**: `ClientUI` interface (`plugin/tui.go:16-78`) allows plugins to request secrets and confirmations without knowing terminal implementation details.
- **Scrypt identity lazy loading**: `lazyScryptIdentity` (`cmd/age/age.go:521`) delays passphrase prompt until needed, allowing auto-detection of passphrase-encrypted files.

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| No progress bars | User has no feedback during long operations; appears frozen |
| Ephemeral prompts | Can't review what was typed; harder to correct mistakes |
| No external TUI library | Minimal dependencies but all UX patterns must be hand-rolled |
| TTY bypass for plugins | Secure plugin interaction but non-obvious when plugins prompt |
| Binary output guard | Prevents terminal corruption but requires explicit `-o -` for live output |

## Failure Modes / Edge Cases

1. **WSL2 cursor positioning bug**: The `clearLine` function (`internal/term/term.go:27-31`) uses CRLF instead of LF to work around a WSL2 bug where cursor doesn't return to line start with simple LF.

2. **PowerShell redirection corruption**: age detects mangled headers from PowerShell redirection (`cmd/age/age.go:437-493`) and provides actionable error messages.

3. **Non-seekable stdin for decryption**: If input is a TTY and output goes to TTY, input is buffered to `bufferTerminalInput` (`cmd/age/tui.go:63-74`, `cmd/age/age.go:253-262`) to allow passphrase prompt without interfering with encrypted input. This buffering is bounded by armor footer detection.

4. **Plugin timeout**: The `WaitTimer` in `plugin/tui.go:74-76` prints "waiting on X plugin..." but has no timeout or cancellation mechanism.

## Future Considerations

- Add progress indicators for large file encryption/decryption
- Consider interactive confirmation for overwrite decisions
- Explore whether BubbleTea or similar could improve UX without excessive dependencies
- Add graceful interrupt handling for long operations

## Questions / Gaps

1. **No progress feedback**: Could streaming operations expose progress to the UI layer?
2. **No spinner or loading animation**: Would users benefit from visual feedback during chunked operations?
3. **Plugin UX isolation**: Is `/dev/tty` access reliable in all container/sandbox environments?
4. **No color support**: Should terminal output include color for warnings/errors?

---

Generated by `study-areas/09-terminal-ux.md` against `age`.