# Repo Analysis: restic

## Security & Trust Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | restic |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/restic` |
| Group | `13-security` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

restic demonstrates strong security engineering for a backup tool. It implements defense-in-depth through centralized input validation, shell-safe command parsing, cryptographic key hardening, and explicit trust boundary enforcement. The project treats untrusted input carefully and provides multiple layers of protection against credential leakage and injection attacks.

## Rating

**8/10** — Good operational safety. The codebase shows careful handling of passwords, shell execution, and secrets. Enterprise trust is reasonable, though the hardcoded PGP key for self-update and lack of explicit "untrusted input" markers prevent a higher score.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Shell splitting | `SplitShellStrings()` parses commands safely with quote awareness | `internal/backend/shell_split.go:45-76` |
| Password command exec | `resolvePassword()` executes password commands via `exec.Command` | `internal/global/global.go:185-212` |
| SFTP shell exec | SFTP client launched via `exec.Command` with `exec.ErrDot` protection | `internal/backend/sftp/sftp.go:54-94` |
| Rclone shell exec | Rclone process started via `exec.Command` with `exec.ErrDot` protection | `internal/backend/rclone/backend.go:47-111` |
| Password file reading | `LoadPasswordFromFile()` strips BOM, trims whitespace | `internal/global/global.go:214-222` |
| Terminal password | `ReadPassword()` with context cancellation and terminal restore | `internal/terminal/password.go:15-54` |
| KDF hardening | Scrypt with 500ms timeout and 60MB memory limit | `internal/repository/key.go:46-56` |
| Key decryption | `OpenKey()` validates KDF type, derives key, decrypts master key | `internal/repository/key.go:64-109` |
| MAC verification | `crypto.Open()` returns `ErrUnauthenticated` before decryption on MAC failure | `internal/crypto/crypto.go:309-311` |
| Secret redaction | `SecretString` type redacts secrets in output via `String()` method | `internal/options/secret_string.go:15-20` |
| Password stripping | `StripPassword()` removes credentials from URLs in error messages | `internal/backend/rest/config.go:48-66` |
| Pattern validation | `ValidatePatterns()` checks exclude/include pattern syntax | `internal/filter/filter.go:231-253` |
| Empty password reject | Empty passwords rejected unless `--insecure-no-password` flag set | `internal/global/global.go:244-246` |
| Self-update verify | Hardcoded PGP public key for update signature verification | `internal/selfupdate/verify.go:10-169` |
| Backend env vars | Environment variables read via `ApplyEnvironment()` per backend | `internal/backend/azure/config.go:66-86` |

## Answers to Protocol Questions

### 1. How are secrets stored?

Secrets are never stored in plaintext. Passwords are used to derive master keys via scrypt KDF (`internal/repository/key.go:58-62`), then the derived key encrypts repository master keys using AES-256-CTR with Poly1305-AES128 MAC (`internal/crypto/crypto.go:236-273`). Master keys are stored encrypted in the repository's `config` file. The `SecretString` type (`internal/options/secret_string.go:3-5`) wraps sensitive strings to redact them during output/logging. Backend credentials (S3, Azure, B2, Swift, GS) use `options.SecretString` in their config structs to prevent accidental exposure in error messages or debug output.

### 2. How is shell execution sandboxed?

Shell execution is controlled, not unrestricted. Three separate mechanisms are used:

1. **Shell string splitting** (`internal/backend/shell_split.go:45-76`): Before any command execution, strings are parsed using `SplitShellStrings()` which handles quoting properly and rejects unterminated quotes or empty commands. This prevents argument injection.

2. **No shell invocation**: All `exec.Command()` calls pass arguments directly without invoking `/bin/sh`, preventing shell interpretation of special characters.

3. **Relative executable blocking** (`internal/backend/sftp/sftp.go:88-94` and `internal/backend/rclone/backend.go:86-102`): Both SFTP and rclone backends check for `exec.ErrDot` and refuse to run executables from the current directory, preventing PATH hijacking attacks.

### 3. How are user inputs validated?

Validation is centralized where possible:

- **Pattern validation** (`internal/filter/filter.go:231-253`): Exclude/include patterns validated via `filepath.Match()` before use in backup/restore commands.
- **Bucket name validation** (`internal/backend/b2/config.go:36-58`): B2 bucket names restricted to 6-50 alphanumeric characters and dashes.
- **Repository version validation** (`internal/global/global.go:465-467`): Repository version must be within `restic.MinRepoVersion` and `restic.MaxRepoVersion`.
- **Options parsing** (`internal/options/options.go:93-122`): `key=value` option pairs parsed with duplicate key detection.
- **Empty password rejection** (`internal/global/global.go:244-246`): Empty passwords are rejected outright.

### 4. Are trust boundaries explicit?

Trust boundaries are partially explicit. Environment variables clearly mark untrusted input sources (e.g., `RESTIC_PASSWORD_FILE`, `RESTIC_PASSWORD_COMMAND`, backend-specific vars like `AWS_ACCESS_KEY_ID`, `B2_ACCOUNT_KEY`). The `StripPassword()` function (`internal/backend/rest/config.go:48-66`) is used in error messages to prevent credential leakage.

However, the codebase does not use explicit markers like "untrusted" comments or distinct types for external input. The hardcoded PGP key in `internal/selfupdate/verify.go:10-169` represents a trust anchor that could be documented more explicitly. The `SecretString` type provides implicit boundary enforcement by preventing accidental logging.

## Architectural Decisions

- **Separation of key derivation and use**: Key derivation uses scrypt with controlled memory/time (`internal/repository/key.go:52-55`). Master key operations use AES-256-CTR with Poly1305 authentication, separating confidentiality from integrity.
- **Backend-agnostic design**: All backends implement a common interface (`internal/backend/backend.go`), with environment-based configuration centralized per backend type. This allows consistent security patterns across storage providers.
- **Command-based password retrieval**: Rather than requiring passwords on the command line (which would appear in process lists), restic supports `RESTIC_PASSWORD_COMMAND` to fetch passwords from external commands, with proper shell-safe parsing.

## Notable Patterns

- **Quote-aware shell splitting** (`internal/backend/shell_split.go:16-42`): Parses shell-quoted strings to safely extract arguments without shell interpretation.
- **Terminal state preservation** (`internal/terminal/password.go:16-20`): Saves terminal state before password reading, restores on context cancellation.
- **Fail-fast authentication** (`internal/crypto/crypto.go:309-311`): MAC verification occurs before decryption to reject tampered ciphertexts immediately.
- **Key iteration with limits** (`internal/repository/key.go:111-177`): `SearchKey()` tries all repository keys with password, with `ErrMaxKeysReached` preventing unbounded iteration.
- **BOM stripping** (`internal/global/global.go:214-222`): Password files are processed to strip UTF-8 BOM before use.

## Tradeoffs

- **Hardcoded PGP key for self-update**: The update verification uses a hardcoded public key (`internal/selfupdate/verify.go:10-169`). This is a single point of trust that cannot be rotated without a software update.
- **No memory locking**: Secrets in Go are not locked in memory, potentially allowing swapping to disk. Go's `crypto` package handles sensitive data but doesn't explicitly prevent swapping.
- **Context cancellation during password read**: If context is cancelled during terminal password read, restore happens in a goroutine (`internal/terminal/password.go:40-44`), which could theoretically race with other terminal operations.
- **Environment variable visibility**: Environment variables are inherited by child processes (password commands). While necessary for the feature, this means passwords via `RESTIC_PASSWORD_COMMAND` are visible in `/proc/*/environ` for the lifetime of the process.

## Failure Modes / Edge Cases

- **Empty password files**: `LoadPasswordFromFile()` (`internal/global/global.go:214-222`) trims whitespace but if file contains only whitespace, results in empty password which is rejected at `global.go:244-246`.
- **Quote parsing edge cases**: `isSplitChar()` (`internal/backend/shell_split.go:16-42`) may have edge cases with nested quotes or escaped characters within quoted strings.
- **KDF timing side channels**: The scrypt KDF timeout is applied globally (`internal/repository/key.go:52-55`), but individual key operations could leak timing information about whether a password prefix is correct.
- **Self-update key compromise**: If the hardcoded PGP key (`internal/selfupdate/verify.go:10-169`) is compromised, update verification becomes meaningless.
- **Stderr inheritance**: Password commands inherit stderr (`internal/global/global.go:195`), which means password prompt messages may appear in logs or terminal even when password itself is captured correctly.

## Future Considerations

- Add explicit "untrusted input" type wrappers to clarify trust boundaries at the type system level.
- Consider memory locking for sensitive data using `mlock()` on supported platforms.
- Document the trust model for self-update more explicitly, including how key rotation would work.
- Add explicit input validation callbacks for third-party backend plugins.
- Consider supporting hardware security modules (HSMs) for master key storage.

## Questions / Gaps

- **No evidence found** for explicit sandboxing of child processes beyond `exec.ErrDot` checks. Processes spawned for SFTP/rclone have full system access.
- **No evidence found** for audit logging of credential access or failed authentication attempts. Failed key attempts are tracked in-memory but not persistently logged.
- **No evidence found** for rate limiting on password attempts. While `SearchKey()` has a max key limit, there's no rate limiting per time window.
- The `SecretString` type (`internal/options/secret_string.go`) is used for backend configs but the actual crypto keys (`internal/crypto/crypto.go:36-48`) are not wrapped in secret types, relying on Go's GC instead.

---

Generated by `study-areas/13-security.md` against `restic`.