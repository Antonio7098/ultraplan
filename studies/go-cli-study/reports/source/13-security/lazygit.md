# Repo Analysis: lazygit

## Security & Trust Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | lazygit |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/lazygit` |
| Group | `13-security` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

lazygit is a terminal UI for Git commands. It does not execute arbitrary shell commands from untrusted input, but it does allow users to configure custom commands and run shell commands through a controlled command runner. The security model is centered on: command construction via a `CmdObjBuilder` that quotes/escapes arguments, a credential prompt system for interactive password/passphrase entry, and config validation for custom commands. There is no secret storage, no shell sandboxing beyond platform-specific quoting, and trust boundaries are implicit (user is assumed to trust their own config and git repo).

## Rating

**6/10** — Basic security hygiene. The project uses Go's `os/exec` correctly, implements credential handling for git prompts, and validates custom command structure. However, there is no shell sandboxing, no secret isolation mechanism, and custom commands can execute arbitrary shell strings based on user configuration.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Command builder | `CmdObjBuilder.New()` uses `exec.Command(args[0], args[1:]...)` with explicit argument list | `pkg/commands/oscommands/cmd_obj_builder.go:38` |
| Shell quoting | `Quote()` method escapes `"`, `$`, `` ` ``, `\` on Unix; Windows uses `^` escaping | `pkg/commands/oscommands/cmd_obj_builder.go:82-99` |
| Shell execution | `NewShell()` constructs `sh -c 'command'` via platform shell, not a raw string split | `pkg/commands/oscommands/cmd_obj_builder.go:47-55` |
| Credential strategy | `CmdObj` has `credentialStrategy` field with `NONE`, `PROMPT`, `FAIL` constants | `pkg/commands/oscommands/cmd_obj.go:44-55` |
| Credential detection | `processOutput()` matches regex patterns for password/passphrase prompts | `pkg/commands/oscommands/cmd_obj_runner.go:402-443` |
| Credential flow | `runWithCredentialHandling()` sets `LANG=C`/`LC_ALL=C` for parseable output | `pkg/commands/oscommands/cmd_obj_runner.go:343` |
| Config validation | `validateCustomCommands()` checks keybinding keys and enum values | `pkg/config/user_config_validation.go:137-175` |
| Custom command quoting | `TemplateFunctionRunCommand()` validates single-line output | `pkg/commands/git_commands/custom.go:28-39` |
| File permissions | `AppendLineToFile()` creates files with `0o600` | `pkg/commands/oscommands/os.go:124` |
| No secret storage | No evidence of persistent credential or token storage | Searched: `secret\|password\|credential\|token` patterns |

## Answers to Protocol Questions

### 1. How are secrets stored?

**No clear evidence found.** Lazygit does not appear to store secrets, passwords, or API tokens. The `credentialStrategy` system handles interactive prompts (password/passphrase/PIN/token) by catching them at runtime via PTY and forwarding the user's input directly to the subprocess. There is no `~/.netrc`, keychain, or encrypted credential store. The `CopyToClipboardCmd`/`ReadFromClipboardCmd` config options could be used to integrate with system credential managers, but no such integration is built-in.

Evidence: `cmd_obj_runner.go:298-306` defines `CredentialType` constants (Password, Username, Passphrase, PIN, Token), but these are only used transiently during command execution. No persistence layer exists.

### 2. How is shell execution sandboxed?

**No sandboxing.** Shell execution is controlled but not sandboxed. The `CmdObjBuilder` builds commands as argument arrays (`exec.Command(args[0], args[1:]...)` at `cmd_obj_builder.go:38`), which prevents shell injection from arguments. However, `NewShell()` at `cmd_obj_builder.go:47-55` constructs `sh -c '<commandStr>'` where the inner string is quoted via `Quote()` but the shell itself is the OS-provided `/bin/sh`. There is no `chroot`, `seccomp`, or namespace isolation.

Custom commands specified by the user in `config.yml` run via `TemplateFunctionRunCommand()` at `custom.go:28-39`, which calls `str.ToArgv()` to parse the user's command string into arguments and passes them to `New()`. This bypasses the shell for argument parsing but the user-provided command is still executed directly.

### 3. How are user inputs validated?

**Per-field config validation.** Custom commands are validated via `validateCustomCommands()` at `user_config_validation.go:137-175`. This checks:
- Keybinding keys via `isValidKeybindingKey()` (pattern validation)
- Prompt option keys similarly
- Output enum: one of `none`, `terminal`, `log`, `logWithPty`, `popup`
- That `commandMenu` is not mixed with other fields

The `Quote()` method at `cmd_obj_builder.go:82-99` provides escaping for shell special characters when constructing shell commands, but this is applied at construction time rather than being a proactive input validation.

No evidence of path traversal prevention, symlink following restrictions, or git repo boundary enforcement.

### 4. Are trust boundaries explicit?

**No.** There are no explicit trust boundary markers. The codebase does not distinguish "untrusted" input (e.g., commit messages from remote repos, branch names from remotes) from trusted local state. Git objects (commits, refs, files) are treated as trusted because they come from the local `.git` directory. There is no sanitization of git output before display (e.g., in the commit message viewer).

Trust boundaries are implicit in the design: users control their own `config.yml`, custom commands run in the user's session, and the tool operates on the local git repo. The credential prompt system is the closest thing to a trust boundary, but it is not documented as such.

## Architectural Decisions

- **Command execution via `os/exec`:** All git and shell commands go through `CmdObjBuilder` → `CmdObj` → `ICmdObjRunner`. This centralized runner is where credential handling, output streaming, and logging are applied. The design uses explicit argument lists (`exec.Command("git", "commit", "-m", "msg")`) rather than shell strings, which is a sound security practice (`cmd_obj_builder.go:38`).
- **Credential handling via PTY:** When a command may need a password, the runner uses a pseudo-terminal (PTY) to intercept prompt patterns and forward user input. This avoids embedding passwords in command arguments (`cmd_obj_runner.go:249-252`).
- **Configurable shell functions file:** Users can specify a `shellFunctionsFile` that gets sourced before every shell command (`cmd_obj_builder.go:48-49`). This is a deliberate design choice that allows shell aliases/functions in custom commands but also means user-provided shell code runs in the command environment.
- **No secret persistence:** Credentials are never stored. Interactive prompts are the only mechanism. This is a deliberate simplification.
- **Output sanitization only:** `sanitisedCommandOutput()` at `cmd_obj_runner.go:199-210` converts error output to user-facing error messages, but does not sanitize git content displayed in the UI.

## Notable Patterns

- **Credential prompt patterns** at `cmd_obj_runner.go:404-413` use regex matching against command output to detect password/passphrase prompts. Patterns include `Password:`, `.+'s password:`, `Username\s*for\s*'.+':`, `Enter\s*passphrase\s*for\s*key\s*'.+':`, `Enter\s*PIN\s*for\s*.+\s*key\s*.+:`, and `.*2FA Token.*`.

- **PTY fallback:** If a credential request is detected and the response channel is `nil` (user declined), the PTY is closed to terminate the process (`cmd_obj_runner.go:371-379`).

- **Environment isolation for credential prompts:** When a command needs credentials, `LANG=C LC_ALL=C LC_MESSAGES=C` is added to force English output for parseability (`cmd_obj_runner.go:343`).

- **Platform-specific quoting:** Windows and Unix have separate quoting logic in `Quote()` (`cmd_obj_builder.go:82-99`), reflecting that shell metacharacters differ across platforms.

- **Template output validation:** `TemplateFunctionRunCommand()` rejects command output containing newlines (`custom.go:35-37`), preventing multi-line output from breaking templates.

## Tradeoffs

- **No shell sandboxing vs. flexibility:** Not sandboxing shells allows users to run complex shell commands via `shellFunctionsFile` and custom commands, but means a misconfigured `config.yml` could execute unintended shell code.

- **Credential PTY vs. cross-platform support:** The PTY-based credential detection (`runWithStreamAux` at `cmd_obj_runner.go:249`) only works on Unix; on Windows, credential prompts are not intercepted but are handled by Git's native credential helper or fail gracefully (the `FAIL` strategy exists for background fetch commands).

- **No secret storage vs. UX:** Not storing credentials means users re-enter passwords for every git operation requiring authentication, but avoids the complexity and security responsibility of credential storage.

## Failure Modes / Edge Cases

- **Misconfigured shell functions file:** If `ShellFunctionsFile` points to a file with syntax errors or malicious content, every shell command could fail or behave unexpectedly.

- **Custom command injection:** If a user includes template injection (e.g., `{{.Form.Branch}}` with branch names containing shell metacharacters) in a custom command, the `Quote()` method should escape them, but the escaping is applied at shell construction time, not at config parse time.

- **Background fetch hangs:** The `FAIL` credential strategy (`cmd_obj.go:212-216`) is used for background `git fetch` to prevent hangs if credentials are needed, by submitting a newline to force the command to fail. If git's credential prompt changes format, this detection could miss and the process would hang.

- **Command output logged:** Commands run via `RunWithOutputAux()` are logged via `self.log.WithField("command", cmdObj.ToString())` at `cmd_obj_runner.go:101`. While the `DontLog()` option exists to suppress this, any command that does not opt out will have its full command string (including arguments) written to the log file.

## Future Considerations

- Consider adding a "safe mode" that parses custom commands more strictly, flagging commands that use shell expansion or subshells.
- Document the credential handling design and any trust assumptions explicitly.
- Consider logging redaction for sensitive patterns (e.g., if a custom command's arguments look like they contain tokens).
- Investigate whether git's `credential-cache` or `credential-store` could be integrated for session-based credential caching, with appropriate warning in the UI.

## Questions / Gaps

- No evidence found of explicit path traversal protection (e.g., blocking `git diff /../../../etc/passwd`).
- No evidence found of git repo boundary enforcement for worktree operations.
- No evidence found of security documentation or threat modeling.
- No evidence found of audit logs for credential usage.
- No evidence found of sandboxing for custom commands beyond Go's `exec.Command` argument safety.

---

Generated by `study-areas/13-security.md` against `lazygit`.