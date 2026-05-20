# Source Analysis: cli

## Security & Multi-Tenant Isolation

### Source Info

| Field | Value |
|-------|-------|
| Name | cli |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/cli` |
| Language / Stack | Go (GitHub CLI `gh`) |
| Analyzed | 2026-05-20 |

## Summary

The `cli` source is the GitHub CLI (`gh`), a command-line tool for interacting with GitHub. It is not a multi-tenant SaaS application — it is a client that authenticates users to GitHub. Security architecture centers on: (1) OAuth-based authentication to GitHub, (2) secure token storage via OS keyring with plaintext fallback, (3) host-based isolation for multi-account support, and (4) telemetry collection with privacy-preserving design. Since authorization is delegated entirely to GitHub's API, there is no internal RBAC model. Tenant isolation here means keeping a user's tokens for different GitHub hosts/accounts separate.

## Rating

**5/10** — Basic implementation with notable gaps. The OAuth authentication flow is solid, token storage has secure keyring support with clear precedence (env var > config > keyring), and there is telemetry with privacy safeguards. However, there is no internal authorization model (delegated to GitHub), no visible audit trail with retention policies, and no encryption-at-rest for the plaintext config fallback.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| OAuth Auth Flow | OAuth client credentials and device/web flow initiation | `internal/authflow/flow.go:20-25` |
| OAuth Scopes | Minimum required scopes: `repo`, `read:org`, `gist` | `internal/authflow/flow.go:34` |
| Token Storage (Keyring) | Secure storage via `zalando/go-keyring` with 3-second timeout | `internal/keyring/keyring.go:22-34` |
| Token Storage (Config) | Plaintext config fallback when keyring unavailable, returns `insecureStorageUsed` flag | `internal/config/config.go:353-390` |
| Token Precedence | Env var > Config file > Keyring | `internal/config/config.go:237-260` |
| Multi-Account Support | Per-host, per-user token storage with `UsersForHost()` and `SwitchUser()` | `internal/config/config.go:392-424` |
| Host Isolation | Normalized lowercase hostnames for consistent lookup | `pkg/cmd/auth/login/login.go:185-187` |
| Auth Check Middleware | `CheckAuth()` and `IsAuthCheckEnabled()` for command auth verification | `pkg/cmdutil/auth_check.go:29-66` |
| HTTP Token Injection | `AddAuthTokenHeader()` adds `Authorization: token <token>` to API requests | `api/http_client.go:107-127` |
| Telemetry (Audit) | Device ID, invocation ID, OS/arch recorded per command invocation | `internal/telemetry/telemetry.go:226-233` |
| Telemetry Privacy | Telemetry sent via detached child process with stdin pipe to avoid exposing payload in args | `internal/telemetry/telemetry.go:362-415` |
| Token Masking | Tokens masked in output (e.g., `ghp_****`) | `pkg/cmd/auth/status/status.go:332-338` |
| SAML/SSO Warning | Warning surfaced when org has SAML enforcement | `pkg/cmd/status/status.go:293-295` |

## Answers to Dimension Questions

### 1. How is authentication performed and how are sessions managed?

Authentication is performed via OAuth 2.0 using the GitHub CLI OAuth application (`oauthClientID = "178c6fc778ccc68e1d6a"` at `internal/authflow/flow.go:22-24`). The `AuthFlow()` function (`internal/authflow/flow.go:30`) supports both device flow and web flow with minimum scopes `["repo", "read:org", "gist"]` (`internal/authflow/flow.go:34`). Token storage follows precedence: environment variable (`GH_TOKEN`, `GH_ENTERPRISE_TOKEN`) > plaintext config (`oauth_token`) > OS keyring (`internal/config/config.go:237-260`). Multi-account sessions are supported via per-host, per-user token storage (`internal/config/config.go:356-390`). Logout removes tokens from both keyring and config (`internal/config/config.go:428-458`).

### 2. How are authorization decisions made and enforced across API boundaries?

No internal authorization model exists. The CLI delegates all authorization decisions to GitHub's API. Commands use `AddAuthTokenHeader()` (`api/http_client.go:107-127`) to attach the token to requests; GitHub then enforces permissions based on the token's scopes and user/org permissions. There is no RBAC or permission checking within the CLI itself. The `authCheck` annotation (`pkg/cmdutil/auth_check.go:11-27`) only verifies the user is logged in, not that they have specific permissions for an operation.

### 3. How is tenant A prevented from accessing tenant B's data?

Isolation is achieved through host-based segregation. Users can be logged into multiple GitHub hosts (e.g., `github.com` and a GHES instance) simultaneously (`pkg/cmd/auth/login/login.go:176-182`). Each host has its own user accounts and tokens stored under `hostsKey/hostname/usersKey/user/key` (`internal/config/config.go:101-103`). The `UsersForHost()` function (`internal/config/config.go:493-500`) returns only users for a specific host. Commands resolve the target repository's host via `BaseRepo()` (`context/context.go:61-109`) and use the corresponding authenticated session.

### 4. What audit events are captured and how long are they retained?

A telemetry system exists (`internal/telemetry/telemetry.go`) that captures: device ID (per installation, persisted in state directory), invocation ID (per command invocation), OS, architecture, and command name (`internal/telemetry/telemetry.go:226-233`). Events are sent via a spawned child process with stdin pipe to avoid exposing payload in process arguments (`internal/telemetry/telemetry.go:362-415`). Telemetry state can be `Enabled`, `Disabled`, or `Logged` (`internal/telemetry/telemetry.go:95-101`). **No evidence found** regarding retention periods — telemetry appears to be sent immediately or logged locally without explicit retention controls. SAML enforcement warnings are surfaced to users when orgs have SAML enabled (`pkg/cmd/status/status.go:293-295`), but this is not an audit trail.

### 5. How are secrets encrypted at rest and in transit?

**In transit**: The OAuth flow uses HTTPS. Tokens are sent to GitHub's API over TLS. No evidence of mTLS or certificate pinning.

**At rest**: Two storage mechanisms exist:
1. **Keyring** (`internal/keyring/keyring.go`): Wraps `zalando/go-keyring` with 3-second timeouts. This uses the OS credential store (e.g., macOS Keychain, Windows Credential Manager, Linux libsecret).
2. **Plaintext config** (`internal/config/config.go:353-390`): When keyring is unavailable, tokens are stored in plaintext config files (`~/.config/gh/` on Unix). This is the `insecureStorageUsed` fallback.

There is no encryption of the config file contents itself. The `--insecure-storage` flag (`pkg/cmd/auth/login/login.go:162`) explicitly allows plaintext storage. **No evidence found** of at-rest encryption for config files.

## Architectural Decisions

1. **OAuth delegation**: The CLI does not implement its own auth server — it authenticates to GitHub via OAuth, making GitHub the identity provider. This is appropriate for a client tool.

2. **Token storage fallback**: Accepting plaintext config as a fallback when keyring fails (`internal/config/config.go:353-390`) prioritizes usability over security. The `insecureStorageUsed` return value allows the CLI to warn users.

3. **Host-based multi-tenancy**: Each GitHub host is treated as an isolated tenant, with separate user accounts and tokens. This is a natural model for a GitHub client.

4. **Telemetry as audit proxy**: Since there is no internal audit trail, telemetry serves as the closest analog — capturing command invocations with device and invocation IDs.

5. **No internal RBAC**: Authorization is entirely delegated to GitHub's API. The CLI does not implement permission checks beyond "are you logged in."

## Notable Patterns

- **Timeout protection on keyring**: All keyring operations have 3-second timeouts (`internal/keyring/keyring.go:31,56,72`) to prevent hanging on credential store issues.
- **Atomic device ID generation**: Device ID uses file hard-linking for atomic concurrent writes (`internal/telemetry/telemetry.go:55-85`).
- **Token masking**: Tokens are masked in output except for the prefix (`pkg/cmd/auth/status/status.go:332-338`) to prevent accidental exposure.
- **Lazy context resolution**: `BaseRepo`, `Remotes`, and `Branch` are resolved lazily inside `RunE` per AGENTS.md conventions.

## Tradeoffs

- **Security vs. usability**: The plaintext config fallback enables the CLI to work when keyring is unavailable, but exposes tokens on disk.
- **No internal authZ**: Delegating to GitHub's API means the CLI cannot enforce custom authorization rules, but also means it doesn't need to manage permissions.
- **Telemetry opt-out**: Users can disable telemetry entirely via env vars (`GH_TELEMETRY_OPTOUT`) or config, but there is no per-command opt-out.
- **No retention policy visibility**: Telemetry events are sent/logged but retention duration is not visible in the codebase.

## Failure Modes / Edge Cases

1. **Keyring timeout**: If the OS credential store is unresponsive (>3s), keyring operations fail with `TimeoutError` (`internal/keyring/keyring.go:32,57,72`).
2. **Concurrent login**: Two simultaneous `gh auth login` for the same host/user may have a race in token storage; the hard-link pattern for device ID shows awareness of this issue.
3. **Token expiry**: Tokens can expire or be revoked. The `auth status` command (`pkg/cmd/auth/status/status.go:364-413`) validates tokens on each run and suggests `gh auth refresh`.
4. **SAML force auth**: When a user's org enforces SAML, the token may become invalid for org-scoped operations. The CLI surfaces a warning but does not automatically re-authenticate (`pkg/cmd/status/status.go:293-295`).
5. **Env token masking**: When `GH_TOKEN` is set, `auth status` retrieves the username from the API since it's not stored locally (`pkg/cmd/auth/status/status.go:380-393`).

## Future Considerations

- Implement encrypted config storage (e.g., using `golang.org/x/crypto/nacl/secretbox` or similar) to eliminate the plaintext fallback.
- Add explicit audit event storage with configurable retention, separate from telemetry.
- Consider adding permission pre-checks before API calls to provide better error messages.
- Document the telemetry retention policy.

## Questions / Gaps

1. **No evidence found** of encrypted config file storage. The plaintext fallback stores tokens unencrypted at `~/.config/gh/`.
2. **No evidence found** of a formal audit trail with retention policy. Telemetry is the closest analog but lacks retention guarantees.
3. **No evidence found** of secret scanning or redaction of sensitive data in logs/outputs beyond token masking.
4. **No evidence found** of mTLS or certificate pinning for GitHub API communication.
5. **No evidence found** of a bug bounty or security disclosure policy in this source.