# Repo Analysis: gh-cli

## Security & Trust Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | gh-cli |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/gh-cli` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

The GitHub CLI (`gh`) is a mature Go CLI tool for interacting with GitHub from the terminal. It demonstrates good security hygiene with encrypted credential storage via keyring, shell command sandboxing via `safeexec`, and input sanitization for diffs and URLs. Trust boundaries are partially explicit—environment tokens are distinguished from stored credentials, and secret scanning warnings exist for skills publishing. However, some areas lack explicit boundary enforcement.

## Rating

**7/10** — Good operational safety

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Keyring secret storage | Wrapper around `zalando/go-keyring` with 3s timeouts to prevent hangs | `internal/keyring/keyring.go:22-73` |
| Token storage hierarchy | Env vars (GH_TOKEN, GITHUB_TOKEN) checked first, then keyring, then plaintext config | `internal/config/config.go:237-260` |
| Token masking | Tokens displayed with `maskToken()` replacing chars after `_` with `*` | `pkg/cmd/auth/status/status.go:332-338` |
| Shell sandboxing | Uses `safeexec.LookPath` instead of direct `exec.LookPath` to avoid shell injection | `pkg/surveyext/editor_manual.go:23` |
| Editor command splitting | Uses `shellquote.Split()` for safe shell argument parsing | `pkg/surveyext/editor_manual.go:75` |
| Diff output sanitization | Custom `sanitizer` replaces non-printable characters in diff output | `pkg/cmd/pr/diff/diff.go:335-369` |
| URL path escaping | `escapePath()` uses `url.PathEscape` preserving slashes | `pkg/cmd/browse/browse.go:297-300` |
| Secret scanning warnings | Warns if repo lacks secret scanning before publishing skills | `pkg/cmd/skills/publish/publish.go:780-792` |
| ASCII sanitizer for logs | Uses `go-gh/pkg/asciisanitizer` to strip ANSI escape sequences from logs | `pkg/cmd/workflow/shared/shared.go:18` |
| Token source tracking | `authTokenWriteable()` distinguishes env tokens from stored credentials | `pkg/cmd/auth/status/status.go:415-417` |

## Answers to Protocol Questions

### 1. How are secrets stored?

**Primary storage**: Encrypted via OS keyring (Linux/Windows: `zalando/go-keyring` backend; macOS: Keychain). The keyring wrapper in `internal/keyring/keyring.go:22-73` adds 3-second timeouts to prevent indefinite hangs during keyring operations.

**Fallback storage**: Plaintext in `~/.config/gh/hosts.yml` under `users.{username}.oauth_token` when:
- Keyring is unavailable or fails
- User opts out of secure storage with `gh auth login --insecure-storage`

**Token precedence** (from `internal/config/config.go:237-260`):
1. Environment variables: `GH_TOKEN`, `GITHUB_TOKEN` (for github.com), `GH_ENTERPRISE_TOKEN`, `GITHUB_ENTERPRISE_TOKEN` (for GHES)
2. Active user's keyring token
3. Plaintext `oauth_token` in config file

Keyring service name format: `gh:{hostname}` (e.g., `gh:github.com`) per `internal/config/config.go:514-516`.

### 2. How is shell execution sandboxed?

**Safe executable lookup**: The `safeexec` package (`github.com/cli/safeexec v1.0.1`) is used universally instead of `os/exec.LookPath`. This library avoids invoking shell interpretation, preventing command injection through PATH manipulation or special characters.

**Evidence of safeexec usage**:
- `pkg/surveyext/editor_manual.go:23` — editor launch
- `pkg/iostreams/iostreams.go:228` — pager process
- `pkg/ssh/ssh_keys.go:107,110` — ssh-keygen and git lookup
- `git/client.go:897` — git binary lookup
- `pkg/cmd/extension/manager.go:64` — extension commands

**Shell argument splitting**: When invoking editors with arguments, `shellquote.Split()` (`github.com/kballard/go-shellquote`) is used to safely split the command string without shell evaluation (`pkg/surveyext/editor_manual.go:75`).

**No unrestricted shell**: The CLI does not construct or execute shell scripts. All external commands are spawned via `exec.Command()` with explicit argument arrays.

### 3. How are user inputs validated?

**Per-command validation**: Each command validates its own flags and arguments using Cobra's built-in validation (`cobra.ExactArgs`, `cobra.NoArgs`) plus custom validation functions.

**Diff output sanitization**: Non-printable characters in diff output are replaced with `\u{XX}` escape sequences via a custom `sanitizer` transform (`pkg/cmd/pr/diff/diff.go:335-369`). This prevents terminal escape sequence injection.

**URL path sanitization**: File paths in `gh browse` are URL-encoded via `url.PathEscape` with slashes preserved (`pkg/cmd/browse/browse.go:297-300`).

**Skill name validation**: Names are validated for filesystem safety in `internal/skills/discovery/discovery.go:1005-1020` using a regex that allows alphanumeric, hyphens, and underscores only.

**ASCII sanitization for workflow logs**: Uses `go-gh/pkg/asciisanitizer` to strip ANSI escape sequences from log content (`pkg/cmd/workflow/shared/shared.go:18`, `pkg/cmd/run/view/view.go:25`).

**Job name sanitization for log filenames**: Special characters `/` and `:` are stripped from job names before use in log filenames (`pkg/cmd/run/view/logs.go:252-254`).

### 4. Are trust boundaries explicit?

**Partially explicit boundaries**:

- **Environment vs. stored tokens**: The `authTokenWriteable()` function at `pkg/cmd/auth/status/status.go:415-417` returns `false` when the token source ends with `_TOKEN`, distinguishing environment-sourced tokens from writable stored credentials. This prevents accidental overwriting of env tokens.

- **Token source tracking**: Every auth entry records its source (`GH_TOKEN`, `keyring`, `oauth_token`, `GH_ENTERPRISE_TOKEN`) making provenance traceable.

- **Read-only env tokens**: When `GH_TOKEN` is in use, `auth status` shows a warning if the user attempts `auth switch` since env tokens cannot be switched via the CLI (`internal/config/config.go:398-401`).

- **Secret scanning warnings**: Before publishing skills, the CLI warns if secret scanning or push protection is not enabled on the target repo (`pkg/cmd/skills/publish/publish.go:780-792`), creating an explicit boundary for credential exposure risk.

- **No trust boundary markers**: There are no explicit code comments or types marking "untrusted" input boundaries. User-provided strings (filepaths, editor commands, search queries) flow through the system without explicit taint tracking.

## Architectural Decisions

1. **Token hierarchy with env precedence**: Env vars take precedence over stored credentials, enabling both interactive use and CI/automation without code changes. Rationale: GH Actions workflow integration requires env-based auth.

2. **Keyring abstraction with timeout**: The keyring wrapper adds 3-second timeouts to prevent CLI hangs when the OS keyring service is unresponsive. This is a defensive measure for networked or slow keyring backends.

3. **Dual storage fallback**: If keyring Set() fails during `gh auth login --secure-storage`, tokens fall back to plaintext config. This maintains usability at the cost of security opt-out, likely to handle edge cases where keyring access fails.

4. **safeexec for all external commands**: All subprocess invocations use `safeexec.LookPath` rather than direct `exec.LookPath`, preventing PATH injection attacks where a malicious binary could be substituted in a directory preceding the intended binary.

5. **Per-command input validation**: No centralized validation framework—each command validates its own inputs. This keeps validation logic co-located with command implementation but creates inconsistency risk.

## Notable Patterns

- **Options + Factory pattern**: Commands receive a `*cmdutil.Factory` providing centralized access to config, HTTP clients, and IO streams. Secrets flow through this factory without special treatment.

- **Token source as first-class concept**: The `tokenSource` string is tracked through the auth system, enabling UI to show "Logged in via GH_TOKEN" vs. stored credentials.

- **Shellquote for editor commands**: Editor invocations use `shellquote.Split()` to parse user-provided editor strings without shell evaluation (`pkg/surveyext/editor_manual.go:75`).

- **Transform readers for sanitization**: Diff content passes through `transform.NewReader` with custom `sanitizer` implementing `Transformer` interface, enabling stream-based sanitization without buffering full output.

## Tradeoffs

1. **Fallback to plaintext**: When keyring operations fail during `Login()`, tokens are stored in plaintext config (`internal/config/config.go:368-372`). This sacrifices security for availability but logs a warning.

2. **No taint tracking**: User inputs are not explicitly marked as untrusted. A future refactor could introduce types like `UntrustedInput` to make boundary crossing visible.

3. **Secrets in keyring without PIN**: On macOS, the keychain entry may be accessible without additional authentication after initial unlock, meaning laptop theft could expose tokens if the laptop is unlocked.

4. **OAuth token in config**: Users who don't specify `--secure-storage` have tokens in plaintext `hosts.yml`. While file permissions restrict access, the tokens are not encrypted at rest.

5. **Environment token masking ambiguity**: `maskToken()` in `pkg/cmd/auth/status/status.go:332-338` only masks characters after the last `_`, so tokens like `ghp_xxxxx` show as `ghp_********` which is reasonable but prefix leakage occurs.

## Failure Modes / Edge Cases

1. **Keyring timeout**: If keyring is slow/unresponsive, 3-second timeout kicks in and login falls back to plaintext storage, potentially surprising security-conscious users.

2. **Env token overwrite attempt**: If a user with `GH_TOKEN` set tries to `gh auth switch`, it fails with "currently active token for %s is from GH_TOKEN" since env tokens cannot be switched (`internal/config/config.go:398-401`).

3. **Split-token tokens masked differently**: Token types have different prefixes (`ghp_` for PATs, `gho_` for OAuth apps). The `maskToken()` function preserves the prefix, so type inference is still possible from masked output.

4. **Editor command injection via arguments**: While `safeexec` prevents PATH attacks, the `shellquote.Split()` function could misparse edge cases in user editor strings, potentially leading to argument injection.

5. **ASCII sanitization only for specific outputs**: Not all command output passes through sanitization—only diffs, workflow logs, and ASCII sanitizer targets. Other output channels could potentially leak escape sequences.

6. **No input size limits observed**: Path or argument lengths don't appear to have explicit limits in the code paths examined. Very long inputs could potentially cause issues in downstream systems.

## Future Considerations

1. **Centralized input validation framework**: Introduce a validation package with composable validators (length limits, character allowlists, path traversal detection) used consistently across commands.

2. **Explicit taint types**: Consider `type UntrustedInput string` wrappers to make trust boundary crossings explicit in the type system.

3. **Keyring without fallback**: For high-security environments, consider adding a mode that refuses plaintext storage and fails cleanly if keyring is unavailable.

4. **Token lifecycle events**: Consider emitting lifecycle events (token stored, token retrieved, token used) for audit logging in enterprise deployments.

5. **Content Security Policy for markdown rendering**: If rendering user-provided markdown content, consider stripping script tags and dangerous attributes to prevent XSS.

## Questions / Gaps

1. **No evidence found** for rate limit handling that could expose credential exhaustion to attackers (e.g., lockout via repeated failed auth attempts).

2. **No evidence found** for HSM or hardware key support for token storage—this is expected for a general-purpose CLI but worth noting.

3. **No evidence found** for secret scanning of CLI output when displaying diffs or logs containing potential secrets from the repository—this would require content-aware detection beyond the ASCII sanitizer.

4. **No evidence found** for secure memory handling (e.g., `crypto/subtle` for token comparison, zeroing memory after use). Tokens are stored in Go strings which are subject to Go's memory management.

---

Generated by `study-areas/13-security.md` against `gh-cli`.