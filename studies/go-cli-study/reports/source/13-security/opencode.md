# Repo Analysis: opencode

## Security & Trust Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | opencode |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` |
| Group | `opencode` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

OpenCode implements a multi-layered security model for a CLI agent that executes shell commands and processes files. The architecture includes: (1) a permission system with interactive approval dialogs, (2) command allowlisting with banned command lists, (3) sandboxed shell execution via a persistent shell with timeout enforcement, (4) session-based trust storage, and (5) credential handling through environment variables and config files. The design prioritizes user control through explicit permission prompts while providing safety mechanisms like command filtering and output truncation.

## Rating

**8/10** — Good operational safety with explicit trust boundaries and defensive engineering. The permission system creates clear trust boundaries with interactive user approval for sensitive operations. Shell execution is sandboxed through a persistent shell model with timeout controls and child process cleanup. Credential handling leverages environment variables rather than storing secrets directly.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Permission system | `permissionService` struct implements `Grant`, `Deny`, `GrantPersistant` for session-based trust | `internal/permission/permission.go:44-72` |
| Permission request flow | `Request()` method checks session permissions, publishes events, and waits synchronously for user response | `internal/permission/permission.go:74-108` |
| Command allowlisting | `bannedCommands` list with curl, wget, nc, telnet, etc. prevents network exfiltration | `internal/llm/tools/bash.go:41-45` |
| Safe read-only commands | `safeReadOnlyCommands` list permits git read ops, go commands without permission prompt | `internal/llm/tools/bash.go:47-55` |
| Shell sandboxing | `PersistentShell` wraps shell with timeout, uses temp files for stdout/stderr/cwd capture | `internal/llm/tools/shell/shell.go:139-244` |
| Shell child process cleanup | `killChildren()` uses `pgrep -P` to find and SIGTERM child processes on timeout | `internal/llm/tools/shell/shell.go:246-269` |
| Output truncation | `MaxOutputLength = 30000` prevents large output dumping | `internal/llm/tools/bash.go:38` |
| Permission dialog UI | `permissionDialogCmp` renders command details and prompts user for Allow/Deny/AllowSession | `internal/tui/components/dialog/permission.go:83-516` |
| Shell quoting | `shellQuote()` escapes single quotes to prevent injection | `internal/llm/tools/shell/shell.go:304-306` |
| API key env vars | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GITHUB_TOKEN` loaded from environment | `internal/config/config.go:258-285` |
| GitHub token loading | `LoadGitHubToken()` searches XDG config dirs for `hosts.json` and `apps.json` | `internal/config/config.go:933-980` |
| Session logging | `MessageDir` stores LLM interactions when `OPENCODE_DEV_DEBUG=true` | `internal/logging/logger.go:98-207` |
| Config validation | `Validate()` checks provider API keys and LSP configs | `internal/config/config.go:608-641` |
| Editor exec | Uses `exec.Command` for EDITOR with `//nolint:gosec` | `internal/tui/components/chat/editor.go:93` |

## Answers to Protocol Questions

### 1. How are secrets stored?

**No direct secret storage.** API keys are loaded exclusively from environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc. at `internal/config/config.go:258-285`). GitHub tokens are loaded from standard config directories (`~/.config/github-copilot/hosts.json`) via `LoadGitHubToken()` at `config.go:933-980`. No plaintext secrets are written to config files—the `Provider.APIKey` field is populated at runtime from env vars or credential checks (AWS/Bedrock uses `"aws-credentials-available"` as a sentinel at `config.go:660`).

### 2. How is shell execution sandboxed?

**Persistent shell with isolation and timeout controls.** The `PersistentShell` in `internal/llm/tools/shell/shell.go` runs commands through a long-lived shell process. Command execution writes to stdin pipe with eval wrapping (`shell.go:164-175`), using temp files for stdout/stderr capture. Timeouts are enforced via polling on a status file (`shell.go:190-217`) with `killChildren()` (`shell.go:246-269`) sending SIGTERM to all child processes via `pgrep -P`. Shell state persists across commands (`shell.go:101-129`). The shell inherits the user's full environment via `os.Environ()` (`shell.go:94`).

### 3. How are user inputs validated?

**Banned command list + safe read-only allowlist + permission requests.** `bash.go:41-45` defines `bannedCommands` (alias, curl, wget, nc, telnet, chrome, etc.). `bash.go:47-55` defines `safeReadOnlyCommands` (ls, git read ops, go commands). Non-banned, non-read-only commands trigger a permission request via `b.permissions.Request()` at `bash.go:270-285`. The permission request includes the full command string for user inspection. JSON params are unmarshaled with error checking at `bash.go:232-233`. The `grep` tool escapes regex special characters via `escapeRegexPattern()` at `grep.go:113-122`.

### 4. Are trust boundaries explicit?

**Yes, through interactive permission dialogs.** The `permissionService` (`permission.go:44-119`) manages a `sessionPermissions` list that persists approval for the session duration. The TUI renders a `permissionDialogCmp` (`permission.go:83-516`) showing the tool name, action, path, and command details. Users can "Allow", "Deny", or "Allow for Session". The `AutoApproveSession()` method at `permission.go:110-112` enables batch approval. The permission broker uses pubsub for event-driven UI updates (`pubsub.CreatedEvent` at `permission.go:103`).

## Architectural Decisions

1. **Interactive permission model over silent allowlisting.** Every non-read-only command triggers a permission request. This creates explicit trust boundaries but requires user attention. The `safeReadOnlyCommands` list provides a safety valve for common read-only operations.

2. **Persistent shell over process-per-command.** Commands share a shell session to preserve state (env vars, cwd, virtualenvs). This is efficient but means shell state from one command affects the next. The `shellQuote()` function (`shell.go:304-306`) prevents injection between commands in the same session.

3. **Environment-variable-based credential loading.** API keys are never stored in config files. The `setProviderDefaults()` function (`config.go:255-387`) reads from env vars and sets model defaults based on available providers. This keeps credentials out of the config file entirely.

4. **Session-scoped trust storage.** Permissions granted during a session are stored in `sessionPermissions` list (`permission.go:47`) and checked on subsequent requests (`permission.go:92-96`). This enables "Allow for Session" without re-prompting.

5. **Temp file capture for shell output.** Commands write stdout/stderr to temp files rather than being captured directly. This isolates output and enables truncation (`truncateOutput()` at `bash.go:329-340`), but temp files are created in `os.TempDir()` with predictable names (`shell.go:151-155`).

## Notable Patterns

- **Permission request-then-wait model**: `Request()` blocks on a channel until user approves/denies via TUI (`permission.go:98-107`)
- **Banned + safe list filtering**: First checks banned, then checks safe read-only, else requires permission (`bash.go:246-263`)
- **Credential provider cascade**: Tries multiple env vars in priority order to find any available API key (`config.go:288-387`)
- **Child process tree killing**: Uses `pgrep -P <pid>` to find all children, then SIGTERM each (`shell.go:251-268`)
- **Session prefix logging**: Session logs stored under `MessageDir/{session_prefix}/` using first 8 chars of session ID (`logger.go:100-139`)

## Tradeoffs

1. **Security vs. convenience**: Banned commands like `curl` prevent network exfiltration but also block legitimate uses. The safe read-only list is narrow—`npm` and `pip` are not included.

2. **Shell state persistence**: Sharing a shell session between commands is efficient but can lead to unexpected behavior if prior commands modify environment state.

3. **Blocking permission model**: `Request()` blocks the agent loop synchronously. A slow user response delays all agent processing.

4. **No command-level isolation**: Unlike containerized execution, the shell runs with the user's full environment. Malicious prompt injection could potentially access credentials in the environment.

5. **Temp file security**: Predictable temp file names in `os.TempDir()` could be targeted by a concurrent local user for output manipulation.

## Failure Modes / Edge Cases

1. **Editor command injection** (`editor.go:93`): Uses `exec.Command(editor, tmpfile.Name())` with EDITOR from env. The `//nolint:gosec` comment acknowledges the risk—user's EDITOR could be malicious. No path validation.

2. **MCP tool permission drift**: MCP tools (`mcp-tools.go:86-104`) request permissions with `config.WorkingDirectory()` as the path, not the actual tool's target path. Trust boundary based on working dir only.

3. **Shell escape via timeout interruption**: When command times out, `interrupted=true` is set and stderr gets appended with "Command was aborted before completion" (`bash.go:297-301`). But the partial output is still returned.

4. **Session permission storage in memory**: `sessionPermissions` list is never persisted. App restart clears all session approvals. No disk-based trust store.

5. **GitHub token file permissions**: `LoadGitHubToken()` reads config files from XDG directories but doesn't validate file permissions. World-readable token files could be extracted by other local users.

## Future Considerations

1. **Command path validation**: Currently only checks the base command name (`strings.Fields(params.Command)[0]`). Full path-based allowlisting would prevent `/usr/bin/curl` bypassing the ban.

2. **Containerized shell execution**: Running commands in a minimal container would limit environment access and contain damage from malicious commands.

3. **Persistent trust store**: Session permissions could be written to a file (encrypted) to survive restarts, with per-repo or per-user configuration.

4. **Secret scanning in output**: Command stdout/stderr could be scanned for patterns resembling API keys or tokens before display/logging.

5. **MCP tool path scoping**: MCP tool permissions should capture the actual target path, not just `WorkingDirectory()`.

## Questions / Gaps

- **No evidence found** for network egress controls beyond banned commands. There's no firewall-like isolation or DNS rebinding protection.

- **No evidence found** for secure temp file handling. Temp files use predictable names in `os.TempDir()` without explicit permissions (0o600) or O_EXCL creation.

- **No evidence found** for input size limits on command strings beyond Go's natural string limits. Very long commands could cause issues.

- **No evidence found** for rate limiting on permission requests. A malicious prompt could spam permission dialogs.

---

Generated by `study-areas/13-security.md` against `opencode`.