# Repo Analysis: chezmoi

## Security & Trust Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | chezmoi |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/chezmoi` |
| Group | `13-security` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

chezmoi is a dotfile manager that manages machine-home directory synchronization. Its security model centers on: (1) encryption at rest for secret files (age, GPG), (2) secret scanning on unencrypted files during `add`, (3) template-based secret retrieval from password managers via external commands, and (4) path isolation through an internal `AbsPath` type. Shell execution is controlled — no shell is invoked by default for arbitrary commands, though pager and hook commands can spawn user shells under specific conditions. Trust boundaries are partially explicit: the `--no-tty` flag handles headless environments, encrypted files are marked with a suffix, and secrets scanning is configurable.

## Rating

**7 / 10** — Good operational safety. Encryption at rest is solid (age/GPG with private temp dirs). Secrets scanning via `betterleaks` catches accidental unencrypted secret inclusion. Template functions delegate secret retrieval to external commands, keeping credentials out of the source state. However, shell execution for pager and hook scripts is permitted in specific cases, and the codebase does not use `gosec` or formal taint tracking. The `exec.Command` calls for password manager integration are user-configured but not sandboxed beyond file permission controls on temp directories.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Encryption (age) | `AgeEncryption` struct with `builtinDecrypt`/`builtinEncrypt` using `filippo.io/age` | `internal/chezmoi/ageencryption.go:35-139` |
| Encryption (GPG) | `GPGEncryption` with private temp dir (`0o700`) for all file operations | `internal/chezmoi/gpgencryption.go:27-58, 151-165` |
| Secret scanning | `betterleaksDetector.DetectString` in `defaultPreAddFunc` | `internal/cmd/addcmd.go:106-116` |
| Secret scanning config | `secrets` choice flag: `ignore`, `warning`, `error` | `internal/cmd/addcmd.go:31,75-76` |
| Secret handling (external) | `secretTemplateFunc` caches output with null-byte join key | `internal/cmd/secrettemplatefuncs.go:20-52` |
| Shell execution (template) | `execTemplateFunc` calls `exec.Command` directly — no shell involvement | `internal/cmd/templatefuncs.go:132-143` |
| Shell execution (pager) | Only spawns user shell when pager contains whitespace and not on Windows | `internal/cmd/config.go:1571-1577` |
| Shell execution (hook) | Hooks execute scripts via interpreter lookup or direct execution | `internal/cmd/config.go:2756-2778` |
| Path type | `AbsPath` wraps all paths; `filepath.Clean` applied on construction | `internal/chezmoi/abspath.go:74,82` |
| Command logging | `chezmoilog.LogCmdOutput` truncates output to 64 bytes via `firstFewBytesHelper` | `internal/chezmoilog/chezmoilog.go:158-170, 238-244` |
| TTY gating | `--no-tty` flag prevents TTY-dependent prompts in headless contexts | `internal/cmd/config.go:207, 1921` |
| HTTP user-agent | User-Agent header set to `chezmoi.io/{version}` on all requests | `internal/cmd/config.go:1645` |

## Answers to Protocol Questions

### 1. How are secrets stored?

Secrets are stored **at rest via encryption** (age or GPG) or **outside the source directory** in a password manager. Files with the encrypted suffix (e.g., `encrypted_`) are AES-encrypted on disk (`internal/chezmoi/ageencryption.go:35-44`, `internal/chezmoi/gpgencryption.go:25-45`). GPG operations use private temp directories with `0o700` permissions (`internal/chezmoi/gpgencryption.go:151-165`). For password manager integration (1Password, Bitwarden, Pass, etc.), secrets are retrieved at template execution time via user-specified external commands and **cached in memory** with a `map[string][]byte` keyed by `strings.Join(args, "\x00")` (`internal/cmd/secrettemplatefuncs.go:31-51`). Cache entries are not isolated per-call-site.

No evidence of secrets written to logs — `chezmoilog.LogCmdOutput` uses `firstFewBytesHelper` which truncates output to 64 bytes (`internal/chezmoilog/chezmoilog.go:238-244`).

### 2. How is shell execution sandboxed?

Shell execution is **not sandboxed** but is **restricted in scope**:

- Template functions `exec`, `output`, `outputList` call `exec.Command` directly with no shell involvement (`internal/cmd/templatefuncs.go:132-143, 373-381`).
- Pager commands spawn a user shell **only** when the pager string contains whitespace (indicating a compound command) and only on non-Windows (`internal/cmd/config.go:1571-1577`). The shell command is obtained from `$SHELL` or equivalent.
- Hook scripts (pre/post apply) execute either a configured `command` (direct `exec.Command`) or a `script` via an interpreter lookup by extension (`internal/cmd/config.go:2756-2778`). No shell is used unless the script filename requires one.
- There is **no `RunAs` dropping, no seccomp, no namespace isolation**, and no explicit sandboxing for external password manager commands.

### 3. How are user inputs validated?

Validation is **per-command and centralized in `Config`**.

- The `secrets` choice flag is validated in `runAddCmd` — only `ignore`, `warning`, `error` are accepted (`internal/cmd/addcmd.go:195-201`).
- Path inputs go through `AbsPath` which applies `filepath.Clean` and uses forward-slash conversion (`internal/chezmoi/abspath.go:14, 74, 82`).
- Template arguments use Go's standard `text/template` with no explicit taint tracking. The `betterleaks` secret scanner is the only semantic scanner for accidental secrets in file content.
- `--no-tty` gates TTY-dependent prompts; `stdinIsATTYTemplateFunc` checks `golang.org/x/term.IsTerminal` (`internal/cmd/templatefuncs.go:502-511`).

### 4. Are trust boundaries explicit?

Trust boundaries are **partially explicit**:

- **Explicit**: The encrypted suffix (`encrypted_`) clearly marks untrusted data. Files marked `private` are excluded from diffs. The `secrets` config flag (`--secrets=error`) creates a hard boundary for unencrypted secret inclusion.
- **Implicit**: User-provided template data flows into `text/template` without taint propagation. Password manager commands are user-configured and execute with the same UID as chezmoi. No documentation marks which template functions accept untrusted input vs. internal-only.
- **No explicit untrusted-input markers** (e.g., no `//taint` annotations or `//go:unsafe` equivalents for specific functions). The phrase "untrusted" or "trust boundary" does not appear in the codebase (`internal/cmd/upgradecmd_unix.go:142` has `--allow-untrusted` but it's for `apk` package installation, not a general trust boundary marker).

## Architectural Decisions

1. **Encryption abstraction via interface** (`Encryption` interface in `internal/chezmoi/encryption.go:4-9`) allows age, GPG, or no-encryption with `TransparentEncryption` as a no-op pass-through. This decouples the core logic from specific crypto implementations.

2. **Secret retrieval via external commands** instead of native SDKs. This keeps chezmoi lightweight and avoids vendor SDK dependencies, but shifts trust to the external command's security. Each password manager integration (Bitwarden, 1Password, Pass, etc.) is a separate template function calling `exec.Command` with user-configured commands.

3. **Private temp directory for GPG** (`withPrivateTempDir` at `internal/chezmoi/gpgencryption.go:151-165`) ensures plaintext never touches a world-readable temp location. Age encryption uses in-memory `bytes.Buffer` and does not use temp files.

4. **`AbsPath` type** for all internal path representation enforces consistent path handling across OSes and prevents path traversal confusion. Construction applies `filepath.Clean` and slash normalization.

## Notable Patterns

- **`firstFewBytesHelper`** — Output from all command executions is truncated to 64 bytes in logs (`internal/chezmoilog/chezmoilog.go:238-244`), limiting secret leakage in log files.
- **Secret scanning with configurable severity** — `betterleaks` scans unencrypted file content at `add` time with `ignore/warning/error` levels (`internal/cmd/addcmd.go:95-116`).
- **`--no-tty` as a headless environment signal** — Forces non-interactive mode and skips terminal-dependent template functions like `stdinIsATTYTemplateFunc`.
- **Template function caching** — Secret retrieval outputs are cached by a composite key to avoid repeated external command invocations.

## Tradeoffs

- **Delegating secret retrieval to external CLIs** means security depends on those tools' implementations. chezmoi cannot audit their memory handling or credential caching.
- **No shell sandboxing** for pager and hook scripts. Any user who can configure the pager or hooks effectively has code execution in the chezmoi process context.
- **In-memory secret caching** (even with short keys) means secrets remain in heap memory for the life of the process, potentially across multiple `apply` invocations.
- **`filepath.Join` used for path construction** in some places (`internal/chezmoi/abspath.go:74`), which is safer than string concatenation but does not resolve symlinks — symlink traversal is handled by `baseSystem.RawPath` which is OS-specific.

## Failure Modes / Edge Cases

- If the configured secret command (e.g., `pass`, `bw`, `op`) is compromised or produces unexpected output, secrets could be retrieved by an attacker with local access.
- The `noTTY` flag is advisory — if a password manager command prompts for a password and `noTTY` is set, the prompt may fail or hang silently depending on the tool.
- Cache key is `strings.Join(args, "\x00")` — collisions are unlikely but not prevented; a malicious config could cause cache poisoning if the same key maps to different secrets across different calls.
- GPG temp directory permissions (`0o700`) are only set on Unix; on Windows the temp dir inherits default permissions (`internal/chezmoi/gpgencryption.go:159-163`).

## Future Considerations

- Consider adding explicit taint tracking for template functions that process untrusted source content.
- Shell execution for pager/hook scripts could be replaced with a strict allowlist of interpreter paths.
- Secret cache entries could be invalidated after a TTL or per-operation to limit exposure duration.
- Consider adding `gosec` to CI to catch common insecure patterns (e.g., `exec.Command` with string concatenation of user input).

## Questions / Gaps

- **No evidence of memory zeroing** for secrets after use — Go's GC may keep secret bytes in heap longer than necessary.
- **No formal threat model** document found in the repo. The security design is evident from code but not formally documented.
- **`--allow-untrusted` in upgrade command** (`internal/cmd/upgradecmd_unix.go:142`) relates to Alpine package manager trust, not general trust boundary enforcement, but its presence suggests a pattern of handling untrusted input that could be more systematically documented.