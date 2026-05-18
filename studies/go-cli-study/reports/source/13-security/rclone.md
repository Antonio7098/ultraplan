# Repo Analysis: rclone

## Security & Trust Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | rclone |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/rclone` |
| Group | 13-security |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

rclone is a mature Go CLI for cloud storage sync with extensive backend support. It implements config encryption via nacl/secretbox, terminal password reading without echo, OAuth token management, and a remote control (RC) server. However, `--password-command` invokes user-supplied commands without sandboxing, and the RC server's default behavior allows auto-generated credentials which could be risky if exposed on non-localhost interfaces.

## Rating

**6/10** — Basic security hygiene with good encryption and password handling, but shell execution via `--password-command` is not sandboxed and RC server network exposure defaults warrant caution.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Config encryption | nacl/secretbox for config encryption with V0 format | `fs/config/crypt.go:17` |
| Config encryption | SetConfigPassword uses SHA256 of password | `fs/config/crypt.go:278-283` |
| Password input | ReadPassword uses golang.org/x/term without echo | `lib/terminal/terminal_normal.go:30-32` |
| Password input | ReadPassword falls back to ReadLine if not a TTY | `fs/config/config_read_password.go:17-27` |
| Obscure utility | AES-CTR obscure for config values | `fs/config/obscure/obscure.go:50-63` |
| Obscure reveal | Reveal with base64 decode + AES-CTR | `fs/config/obscure/obscure.go:76-90` |
| Token storage | oauth2.Token stored as JSON string in config | `lib/oauthutil/oauthutil.go:176-181` |
| Token refresh | TokenSource with expiry timer refresh | `lib/oauthutil/oauthutil.go:229-236` |
| Password command | exec.Command for --password-command | `fs/config/crypt.go:193` |
| RC server auth | Auth required unless --rc-no-auth | `fs/rc/rcserver/rcserver.go:268-271` |
| RC auto-creds | Random 128-char password generated for WebGUI | `fs/rc/rcserver/rcserver.go:87-92` |
| JSON validation | Charset validation (utf-8 only) for JSON input | `fs/rc/rcserver/rcserver.go:249-252` |
| JSON parsing | Error on malformed JSON | `fs/rc/rcserver/rcserver.go:254-258` |
| Path sanitization | sanitizePath uses path.Clean and encoding | `backend/protondrive/protondrive.go:280-287` |
| Path validation | validateSegment rejects empty/whitespace and '/' in transform | `lib/transform/transform.go:308-316` |
| Destination check | CheckValidDestination validates archive dst | `cmd/archive/create/create.go:267-287` |

## Answers to Protocol Questions

### 1. How are secrets stored?

Secrets are stored in the rclone config file, encrypted with nacl/secretbox using AES-CTR (`fs/config/crypt.go:17`). The config password is hashed with SHA256 into a 32-byte key (`fs/config/crypt.go:278-283`). OAuth tokens are serialized as JSON and stored via `PutToken` (`lib/oauthutil/oauthutil.go:210`), with base64 encoding for transport. Environment variable `RCLONE_CONFIG_PASS` can supply the password non-interactively (`fs/config/crypt.go:104-116`). The `--password-command` flag allows fetching the config password from an external command (`fs/config/crypt.go:181-213`).

**Evidence**: `fs/config/crypt.go:193` — `cmd := exec.Command(ci.PasswordCommand[0], ci.PasswordCommand[1:]...)`

### 2. How is shell execution sandboxed?

**No sandboxing found.** The `--password-command` feature uses `os/exec.Command` directly (`fs/config/crypt.go:193`) with user-supplied arguments. There is no cgroup, seccomp, or namespace isolation. The command inherits stdin/stdout/stderr from the parent process (`fs/config/crypt.go:195-197`).

The RC server binds to addresses determined by `--rc-addr` and serves HTTP. If `--rc-allow-origin` is set, CORS headers are emitted. No command execution sandbox exists beyond OS-level permissions.

### 3. How are user inputs validated?

**Per-context validation:**
- Path segments: `validateSegment()` at `lib/transform/transform.go:308-316` rejects empty, whitespace-only, or '/'-containing segments
- Archive destination: `CheckValidDestination()` at `cmd/archive/create/create.go:267-287` verifies the destination is a file (not directory) and readable
- RC JSON: charset validated as utf-8 only (`fs/rc/rcserver/rcserver.go:249-252`), JSON decode errors return 400 Bad Request (`fs/rc/rcserver/rcserver.go:254-258`)
- Path sanitization in proton drive backend uses `path.Clean()` and encoding (`backend/protondrive/protondrive.go:280-287`)

**Not centralized**: Input validation is scattered across backends and commands. No single validation framework enforces constraints consistently.

### 4. Are trust boundaries explicit?

**Partially.** The RC server has an explicit `noAuth` check at `fs/rc/rcserver/rcserver.go:268` that blocks calls requiring auth when neither server auth nor `--rc-no-auth` is set. Config encryption creates a clear boundary between encrypted (at-rest) and plaintext (in-memory) config. Password prompt occurs via terminal without echo (`lib/terminal/terminal_normal.go:30`).

However, default RC binding to localhost with auto-generated credentials (`fs/rc/rcserver/rcserver.go:87-92`) may lead to unintended network exposure if users change `--rc-addr` without setting proper auth. The comment at `fs/rc/rcserver/rcserver.go:80` notes "It is recommended to use web gui with auth" when `--rc-no-auth` is in effect, but this is a log message, not enforcement.

## Architectural Decisions

1. **Config encryption using nacl/secretbox** — A well-vetted library for symmetric encryption. The V0 format uses a fixed key derived from the config password via SHA256. This is appropriate for local config protection but does not protect against determined attackers with the config file.

2. **OAuth token persistence** — Tokens are stored as JSON strings in the config file, encrypted at rest. The `TokenSource` struct manages refresh on expiry with a background timer (`lib/oauthutil/oauthutil.go:229-236`). This is a sound pattern for long-running CLI operations.

3. **`--password-command` for external password retrieval** — Allows integration with secret stores (e.g., `pass`, keychain). Execution via `os/exec` without sandboxing is the primary security concern; the user is trusted to provide a safe command.

4. **RC server optional authentication** — Auth is not forced. The server warns when no auth is set (`fs/rc/rcserver/rcserver.go:80`), but does not enforce. Auto-generated credentials use 128-char random passwords which is good practice.

## Notable Patterns

- **Password-from-command pattern**: `GetPasswordCommand()` at `fs/config/crypt.go:184-213` executes a user-specified command to retrieve the config password. This enables integration with secret management tools but introduces command injection risk if the command arguments are not properly validated elsewhere.

- **Token refresh pattern**: `Renew` struct at `lib/oauthutil/renew.go:13-21` monitors token expiry and triggers refresh when uploads are in progress. This prevents upload failures due to expired tokens.

- **Auto-generated WebGUI credentials**: When no password is set for the RC WebGUI, rclone generates a 128-character random password (`fs/rc/rcserver/rcserver.go:87-92`). This is strong but logged to stderr, potentially exposure if stderr is captured.

## Tradeoffs

1. **Convenience vs security**: `--password-command` enables secure secret retrieval but relies on the user's command being trustworthy. No sandboxing means any compromise of the command is a direct compromise of rclone.

2. **RC server flexibility**: Defaulting to localhost binding with optional auth enables easy local usage but users may unknowingly expose the RC server on all interfaces with weak auto-generated credentials.

3. **Config encryption scope**: Encryption covers stored secrets but not the in-memory representation. Once decrypted, credentials remain in memory for the session duration.

## Failure Modes / Edge Cases

- **Password command returns empty**: `fs/config/crypt.go:208-211` returns an error if `--password-command` returns an empty string, preventing silent auth failures.

- **Token refresh during inactivity**: `lib/oauthutil/renew.go:54-57` skips token refresh when no uploads are in progress, which could lead to expired tokens if the CLI is idle but the session is long.

- **Config decryption with wrong password**: `fs/config/crypt.go:175-177` retries decryption in a loop until successful or user cancels, logging errors on each attempt.

- **JSON charset confusion**: `fs/rc/rcserver/rcserver.go:249-252` rejects non-utf-8 charsets with 400 Bad Request, preventing some injection vectors but not addressing all encoding issues.

- **Auto-credentials logged**: The random WebGUI password is logged to stderr (`fs/rc/rcserver/rcserver.go:92`), which may end up in shell history or logs if users redirect stderr.

## Future Considerations

- Consider sandboxing `--password-command` execution with limited environment variables and no network access.
- Add `--rc-enforce-auth` flag to make RC auth mandatory rather than optional.
- Mask auto-generated credentials in logs, only show on first launch.
- Implement centralized input validation for path parameters across all backends.

## Questions / Gaps

- **No evidence found** of cgroup/seccomp/AppArmor sandboxing for subprocess execution.
- **No evidence found** of security-focused test suite for authentication/authorization paths.
- **Unclear** how backends handle credential caching in memory — no evidence of credential scrubbing after use.
- **No evidence found** of audit logging for RC server access (who accessed what).

---

Generated by `study-areas/13-security.md` against `rclone`.