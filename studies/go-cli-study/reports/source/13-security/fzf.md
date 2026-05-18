# Repo Analysis: fzf

## Security & Trust Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | fzf |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/fzf` |
| Group | `13-security` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

fzf is a mature, widely-deployed fuzzy finder. Its security model reflects its role as a local UI tool that spawns external commands. It implements shell escaping for command arguments, process group isolation, and OpenBSD pledge on that platform. However, secrets are not explicitly managed—the tool processes filenames and user input, and relies on the shell's own escaping for command execution. The HTTP server (--listen) uses API key authentication with constant-time comparison.

## Rating

**7/10** — Good operational safety. Shell execution is properly escaped, process group isolation exists, and the HTTP server has basic auth. However, no dedicated secret vault, no input sanitization beyond escaping, and trust boundaries are implicit rather than explicitly marked.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Shell escaping | `escapeSingleQuote` wraps args in single quotes with proper escaping | `src/proxy.go:22-24` |
| Shell escaping (Unix) | `Executor` uses shell-specific replacer for fish vs sh/bash | `src/util/util_unix.go:35-44` |
| Shell escaping (Windows) | `escapeArg` for cmd.exe, PowerShell escaping | `src/util/util_windows.go:136-186` |
| Process isolation | `Setpgid` on exec.Cmd for process group | `src/util/util_unix.go:51-54` |
| Process kill | `KillCommand` uses `syscall.Kill(-cmd.Process.Pid, SIGKILL)` | `src/util/util_unix.go:73-75` |
| OpenBSD pledge | `Protect()` calls `unix.PledgePromises` on OpenBSD | `src/protector/protector_openbsd.go:8-10` |
| HTTP API key | `FZF_API_KEY` env var with `subtle.ConstantTimeCompare` | `src/server.go:84-86,225-227` |
| HTTP server binding | Local-only binding by default (`localhost`, `.sock`) | `src/server.go:52-56` |
| History file permissions | History files created with `0600` permissions | `src/history.go:33,64` |
| Option validation | `validateOptions` checks display widths and sizes | `src/options.go:3573-3614` |
| Temp file handling | FIFOs created in `/tmp` with restricted permissions | `src/proxy.go:52-60` |
| Become mechanism | `executor.Become` uses `syscall.Exec` to replace process | `src/util/util_unix.go:61-70` |

## Answers to Protocol Questions

### 1. How are secrets stored?

**No explicit secret storage.** fzf does not implement a credential vault. It processes filenames and text input from the user. The only "secret" is the `FZF_API_KEY` environment variable used for the HTTP server, which is checked via constant-time comparison (`src/server.go:225`). No logging of secrets is observed, but there is no formal isolation mechanism either.

### 2. How is shell execution sandboxed?

**Partial sandboxing.** fzf escapes command arguments before passing them to the shell:
- `escapeSingleQuote` (`src/proxy.go:22-24`) wraps args in single quotes
- Unix executor uses shell-specific replacers (`src/util/util_unix.go:35-44`) 
- Windows uses `escapeArg` for cmd.exe or PowerShell quoting (`src/util/util_windows.go:136-186`)
- Process group isolation via `Setpgid` (`src/util/util_unix.go:51-54`)
- OpenBSD pledge promises (`src/protector/protector_openbsd.go:8-10`)

However, there is **no seccomp, no landlock, no namespace isolation**, and the tool runs as the full user. Shell execution is controlled through escaping but not sandboxed in the container sense.

### 3. How are user inputs validated?

**Minimal validation.** Input validation is not centralized. Shell arguments are escaped rather than validated. The primary validation is:
- `validateOptions` (`src/options.go:3573`) checks display widths for `--pointer` and `--marker`
- The placeholder regex in `terminal.go:72` acts as a lenient syntax validator for template strings
- HTTP server validates `Content-Length` and parses params (`src/server.go:211-214,258-275`)
- No sanitization of user-provided filenames or paths

### 4. Are trust boundaries explicit?

**No.** There are no explicit trust boundary markers. The codebase does not annotate untrusted inputs with comments or types. The implicit trust boundary is the shell command execution boundary, but this is not formally documented or enforced beyond escaping. The closest approximations are:
- The `FZF_API_KEY` requirement for non-local HTTP listeners (`src/server.go:85-87`)
- The local-only binding default (`src/server.go:52-56`)
- The OpenBSD pledge declarations (`src/protector/protector_openbsd.go:8-10`)

## Architectural Decisions

1. **Shell-based command execution**: fzf deliberately delegates shell command execution to `sh -c`, relying on POSIX shell quoting rather than implementing its own subprocess management. This is pragmatic but means security depends on the shell.

2. **No dedicated secret management**: The tool is designed for interactive local use, not credential management. This simplifies the threat model but means any secret appearing in command arguments or filenames is exposed.

3. **Minimalist HTTP server**: A custom HTTP server (not `net/http`) is used to keep binary size small (`src/server.go:147-152`). The server is local-only by default and requires an API key for remote access.

4. **Cross-platform shell escaping**: Shell-specific escaping is implemented for sh/bash, fish, cmd.exe, and PowerShell (`src/util/util_unix.go:35-44`, `src/util/util_windows.go:136-186`).

## Notable Patterns

1. **Shell-specific escaper selection** (`src/util/util_unix.go:35-44`): The escaper is chosen based on the shell basename, with fish having different escape semantics than POSIX shells.

2. **Become pattern** (`src/util/util_unix.go:61-70`): fzf can replace itself with a shell using `syscall.Exec`, passing the original stdin and environment. This is used for the `:become` action in vim.

3. **Process group kill with negative PID** (`src/util/util_unix.go:73-75`): `KillCommand` sends SIGKILL to `-cmd.Process.Pid`, which kills the entire process group, not just the process.

4. **Constant-time API key comparison** (`src/server.go:225`): Uses `subtle.ConstantTimeCompare` to prevent timing attacks on the API key.

## Tradeoffs

- **Shell trust**: By executing commands through `$SHELL -c`, fzf inherits shell semantics. Malicious shell aliases or functions in the user's environment could affect preview/execute commands.
- **No sandboxing beyond OpenBSD**: On non-OpenBSD systems, fzf has no OS-level syscall filtering. A compromise of the fzf process yields full user access.
- **FIFO in /tmp**: Proxy communication uses FIFOs created in the system temp directory (`src/proxy.go:52-60`). While permissions are restricted (0600), the parent directory may be world-accessible.

## Failure Modes / Edge Cases

1. **Shell injection via malformed quotes**: If shell escaping has edge cases (e.g., certain Unicode or null bytes), argument injection may be possible. The `escapeSingleQuote` implementation (`src/proxy.go:22-24`) is straightforward but may not handle all edge cases in all shells.

2. **Become and environment inheritance**: The `:become` action (`src/util/util_unix.go:61-70`) inherits all environment variables, potentially leaking secrets.

3. **Preview command and filenames with special characters**: While arguments are escaped, running `fzf --preview "command {}"` on a filename with shell metacharacters could lead to unintended command execution if the escaping fails.

4. **tmux/Zellij popup environment**: The proxy mechanism (`src/proxy.go:62-187`) nullifies `FZF_DEFAULT_*` variables but passes through other environment variables, which could include injected content.

## Future Considerations

1. **Landlock/seccomp on Linux**: Adding Linux-specific syscall filtering would improve the sandbox without OpenBSD dependency.
2. **Secret redaction**: Logging and error messages could explicitly redact sensitive-looking values.
3. **Explicit trust boundary annotations**: Comments or types marking untrusted inputs would improve code review.
4. **Argon2 or similar for API key derivation**: Current API key is a flat env var; key derivation for longer secrets would improve usability.

## Questions / Gaps

- No evidence of formal threat modeling or security audit documentation beyond `SECURITY.md`
- No explicit handling of path traversal in preview commands
- No isolation between multiple fzf instances sharing the same temp directory
- No evidence of fuzzing or automated security testing for input parsing

---

Generated by `study-areas/13-security.md` against `fzf`.