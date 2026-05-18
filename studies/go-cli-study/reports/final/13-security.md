# Security & Trust Boundaries - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Protocol | `study-areas/13-security.md` |
| Groups | 13-security, helm, go-task, mitchellh-cli, opencode, urfave-cli, yq |
| Date | 2026-05-15 |

## Repositories Studied

| # | Repo | Path | Group |
|---|------|------|-------|
| 1 | age | `/home/antonioborgerees/coding/go-cli-study/repos/age` | 13-security |
| 2 | chezmoi | `/home/antonioborgerees/coding/go-cli-study/repos/chezmoi` | 13-security |
| 3 | dive | `/home/antonioborgerees/coding/go-cli-study/repos/dive` | 13-security |
| 4 | fzf | `/home/antonioborgerees/coding/go-cli-study/repos/fzf` | 13-security |
| 5 | gdu | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` | 13-security |
| 6 | gh-cli | `/home/antonioborgerees/coding/go-cli-study/repos/gh-cli` | 13-security |
| 7 | go-task | `/home/antonioborgerees/coding/go-cli-study/repos/go-task` | 13-security |
| 8 | helm | `/home/antonioborgerees/coding/go-cli-study/repos/helm` | 13-security |
| 9 | k9s | `/home/antonioborgerees/coding/go-cli-study/repos/k9s` | 13-security |
| 10 | lazygit | `/home/antonioborgerees/coding/go-cli-study/repos/lazygit` | 13-security |
| 11 | mitchellh-cli | `/home/antonioborgerees/coding/go-cli-study/repos/mitchellh-cli` | 13-security |
| 12 | opencode | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` | 13-security |
| 13 | rclone | `/home/antonioborgerees/coding/go-cli-study/repos/rclone` | 13-security |
| 14 | restic | `/home/antonioborgerees/coding/go-cli-study/repos/restic` | 13-security |
| 15 | urfave-cli | `/home/antonioborgerees/coding/go-cli-study/repos/urfave-cli` | 13-security |
| 16 | yq | `/home/antonioborgerees/coding/go-cli-study/repos/yq` | 13-security |

## Executive Summary

This study examines 16 Go CLI projects across the dimension of Security & Trust Boundaries — how elite projects handle input validation, shell execution sandboxing, secret handling, and trust boundary enforcement. The overall distribution reflects three tiers: tools designed around security (age at 9/10, go-task/helm/restic/opencode at 8/10) demonstrate explicit trust boundaries and defensive engineering; mid-tier tools (chezmoi/fzf/gh-cli/k9s at 7/10, lazygit/rclone/urfave-cli/yq at 6/10) show good hygiene but with gaps; and foundational tools (dive at 4/10, gdu at 5/10, mitchellh-cli at 3/10) handle limited attack surfaces but lack robustness for sensitive workloads. No repo in this group scored below 3, reflecting that even minimally-functional CLIs implement some security consideration.

## Core Thesis

**Security posture in Go CLI tools maps to tool purpose, not tooling quality.** Encryption tools (age), backup systems (restic), and task runners that execute untrusted workflow definitions (go-task) invest heavily in sandboxing because their threat models require it. UI tools and viewers (dive, gdu, lazygit) treat the shell as an implementation detail and prioritize convenience. Framework libraries (mitchellh-cli, urfave-cli) explicitly delegate security to consumers, creating a ceiling on their standalone security posture.

The key differentiator between "basic hygiene" (4–6) and "good operational safety" (7–8) is whether the tool's design acknowledges that *some inputs are untrusted*. Tools that distinguish between trusted internal state and untrusted external input — through explicit flags (k9s `readOnly`), permission dialogs (opencode), or sandboxed execution environments (go-task) — consistently score higher than those that treat all input as equally trusted.

## Rating Summary

| Repo | Score | Approach | Main Strength | Main Concern |
|------|-------|----------|---------------|--------------|
| age | 9/10 | Encryption-centric | Explicit trust boundaries, MAC verification, plugin isolation | No encrypted keyring |
| go-task | 8/10 | Pure-Go shell sandbox | `mvdan.sh/v3` interpreter eliminates shell injection entirely | Dotenv variable bleed |
| helm | 8/10 | Provenance-first | PGP signature verification, credential scrubbing | Plugin trust model implicit |
| opencode | 8/10 | Permission-driven | Interactive allowlisting with banned commands | Temp file predictability |
| restic | 8/10 | Defense-in-depth | Quote-aware shell splitting, `SecretString` type, MAC-before-decrypt | Hardcoded PGP key for updates |
| chezmoi | 7/10 | Secret-scanning | `betterleaks` detection, age/GPG encryption, private temp dirs | Pager/hook shell execution unrestricted |
| fzf | 7/10 | Shell-aware UI | Process group isolation, OpenBSD pledge, constant-time API key compare | No secret vault |
| gh-cli | 7/10 | Keyring-layered | OS keyring integration, `safeexec`, token source tracking | Fallback to plaintext config |
| k9s | 7/10 | Schema-validated | JSON schema validation, `Dangerous` plugin flag, `readOnly` mode | Node shell uses privileged pod |
| lazygit | 6/10 | Credential-intercept | PTY-based credential prompt handling | No shell sandboxing |
| rclone | 6/10 | Cloud-credential-store | nacl/secretbox config encryption, token refresh | `--password-command` not sandboxed |
| urfave-cli | 6/10 | Validation-primitive | Per-flag `Validator` functions, value source isolation | No secret handling |
| yq | 6/10 | Flag-gated ops | Security flags disable env/file/system operations | Opt-out model (enabled by default) |
| gdu | 5/10 | Shell-spawn opt-out | `--no-spawn-shell` flag, delete confirmation | Shell spawning default-on |
| dive | 4/10 | Runtime-delegated | CI threshold validation | Docker/Podman execution unrestricted |
| mitchellh-cli | 3/10 | Framework-delegation | Secure terminal input via `speakeasy` | No input validation, no secret storage |

## Approach Models

### Encryption-Centric (age, restic)

These tools treat cryptographic verification as the primary trust mechanism. age encrypts files with X25519/ML-KEM-768 and verifies MAC before decryption (`age/age.go:367-370`). restic uses AES-256-CTR with Poly1305-AES MAC and derives keys via scrypt with controlled memory/time (`internal/repository/key.go:46-56`). Both enforce explicit trust boundaries at crypto operations rather than at the shell or file level.

**Convergence**: Both use MAC-then-decrypt patterns. Both reject suspiciously large work factors (age caps scrypt at max 2^22; restic uses 500ms/60MB limits).

**Divergence**: age has no keyring — identities are stored as line-oriented files. restic uses a `SecretString` type for backend configs that redacts in output (`internal/options/secret_string.go:15-20`). age prioritizes file format simplicity; restic prioritizes defense-in-depth.

### Pure-Interpreter Sandbox (go-task)

go-task uses `mvdan.sh/v3` pure Go shell interpreter instead of `os/exec` (`internal/execext/exec.go:59-66`). This eliminates shell injection entirely because user-defined commands never touch the OS shell layer. The interpreter's open handler only allows `/dev/null` (`internal/execext/exec.go:152-157`). This is the strongest sandbox implementation observed across all 16 repos.

**Convergence**: None of the other 15 repos use a pure-Go interpreter. This remains a distinctive approach.

**Divergence**: go-task's sandbox doesn't prevent the Taskfile author from being malicious — it prevents the *tool* from being exploited to run arbitrary commands on the host. This is a design philosophy that trusts the Taskfile source but hardens the execution environment.

### Provenance-Verified (helm)

helm verifies chart integrity via PGP signatures (`pkg/provenance/sign.go:281-288`) and SHA256 digests per file (`pkg/provenance/sign.go:239-278`). Plugin installation supports optional `.prov` file verification (`internal/plugin/installer/installer.go:86-119`). Authorization headers are scrubbed from logs (`pkg/registry/transport.go:37-41`).

**Convergence**: Similar verification patterns exist in restic (hardcoded PGP key for self-update at `internal/selfupdate/verify.go:10-169`) but helm's provenance is more central to the trust model.

**Divergence**: helm's plugin execution trusts the plugin author without sandboxing. The provenance verification is for the *chart*, not for the plugin subprocess's actions.

### Permission-Dialog (opencode)

opencode implements interactive permission requests with session-based approval (`internal/permission/permission.go:44-108`). Commands are filtered through a banned list (curl, wget, nc, telnet) and a safe-read-only allowlist (git read ops, go commands) at `internal/llm/tools/bash.go:41-55`. Non-listed commands trigger a blocking dialog.

**Convergence**: No other repo uses interactive permission dialogs. This is a distinctive pattern for agent-style tools.

**Divergence**: opencode's permissions are in-memory only (sessionPermissions list never persisted at `permission.go:47`), meaning trust decisions don't survive restarts. k9s uses a similar `Dangerous` flag concept but without interactive prompts.

### Schema-Validated (k9s, yq)

k9s validates all plugin/alias/hotkey configs against JSON schemas (`internal/config/json/validator.go:146`) before loading. yq uses expression-based operations gated behind a `SecurityPreferences` struct (`pkg/yqlib/security_prefs.go:3-7`). Both enforce that user-provided configuration is structurally valid before execution.

**Convergence**: Both use structural validation as a trust boundary mechanism. k9s is more comprehensive (schemas for multiple config types); yq's validation is limited to operator entry points.

**Divergence**: k9s's schemas prevent malformed configs from loading; yq's security flags prevent specific operations from executing. k9s is preventive; yq is opt-out.

### Credential-Intercept (lazygit, gh-cli, helm)

These tools intercept credential prompts from subprocesses rather than storing credentials. lazygit uses PTY-based regex matching for password/passphrase prompts (`pkg/commands/oscommands/cmd_obj_runner.go:404-413`). gh-cli uses OS keyring (`internal/keyring/keyring.go:22-73`) with token source tracking. helm reads passwords via `term.DisableEcho` (`pkg/cmd/registry_login.go:136-159`).

**Convergence**: All three avoid storing credentials in plaintext. All three provide secure input mechanisms (no echo).

**Divergence**: lazygit has no persistent credential storage at all — every operation re-prompts. gh-cli stores in OS keyring or plaintext config as fallback. helm passes credentials to the registry client without persistent storage.

## Pattern Catalog

### 1. Shell-Safe Argument Construction

**What**: Using `exec.Command(args[0], args[1:]...)` with explicit argument arrays rather than string-based shell invocation.

**Repos**: lazygit (`cmd_obj_builder.go:38`), gh-cli (`safeexec.LookPath`), fzf (argument escaping), rclone (SFTP/rclone backends check `exec.ErrDot`), restic (`SplitShellStrings()`).

**Why it works**: Argument arrays prevent shell injection because metacharacters in arguments are passed as data, not evaluated.

**When to copy**: Any CLI that invokes external commands. The explicit argument array pattern is the baseline expectation.

**When overkill**: Tools that never invoke external commands (age, mitchellh-cli, urfave-cli) don't need this, but still benefit from the discipline.

### 2. Secret Redaction Type

**What**: A dedicated type (e.g., `SecretString`) that implements `String()` to return `"***"` and prevents accidental logging.

**Repos**: restic (`internal/options/secret_string.go:15-20`), opencode (truncation at `bash.go:329-340`), chezmoi (`firstFewBytesHelper` truncates to 64 bytes at `chezmoilog.go:238-244`).

**Why it works**: Go's type system enforces that secrets flow through a type that knows how to hide itself. Callers can't accidentally print the value.

**When to copy**: Any tool that handles credentials, API keys, or tokens. Particularly useful in error messages and debug logs.

**When overkill**: Tools that never handle secrets (gdu, dive) don't need this.

### 3. Permission Request Flow

**What**: Interactive dialog requiring user approval before executing a potentially dangerous operation.

**Repos**: opencode (`permissionService.Request()` at `permission.go:74-108`), k9s (`ShouldConfirm()` at `plugin.go:74-80`).

**Why it works**: Shifts trust from "tool decides" to "user decides at runtime". Creates an explicit interrupt point for security-sensitive operations.

**When to copy**: Agent-style tools (opencode) or tools executing user-provided code (k9s plugins). Less useful for routine CLI operations where prompts would hinder usability.

### 4. Banned + Allowlist Command Filtering

**What**: A two-tier filter: banned commands (always blocked) and safe-read-only commands (always allowed) with permission-required for everything else.

**Repos**: opencode (`bash.go:41-55`).

**Why it works**: Practical compromise between security and usability. Common safe operations don't prompt; dangerous operations always prompt; unknown operations prompt once per session.

**When to copy**: Agent-style tools. Not needed for tools with controlled command sets.

### 5. Pure-Go Shell Interpreter

**What**: Using a pure-Go shell parser/interpreter instead of OS-level `/bin/sh`.

**Repos**: go-task (`mvdan.sh/v3` at `internal/execext/exec.go:59-66`).

**Why it works**: Eliminates shell injection entirely because there is no shell process to inject into. The interpreter is controlled and audited.

**When to copy**: Tools that execute user-defined shell commands and require strong sandboxing. The tradeoff is losing POSIX compatibility for some shell features.

### 6. MAC-Before-Decrypt

**What**: Verifying message authentication before attempting decryption.

**Repos**: age (`age/age.go:367-370`), restic (`internal/crypto/crypto.go:309-311`).

**Why it works**: Rejects tampered ciphertext immediately without performing expensive decryption. Prevents padding oracle and similar attacks.

**When to copy**: Any tool that decrypts untrusted data. Particularly important for file format parsers.

### 7. Private Temp Directory

**What**: Creating temp directories with restrictive permissions (0o700) for sensitive operations.

**Repos**: chezmoi (`withPrivateTempDir` at `gpgencryption.go:151-165`), age (plugin working directory set to `os.TempDir()` at `client.go:463`).

**Why it works**: Ensures plaintext files (GPG decrypted content, plugin communication) never touch a world-readable temp location.

**When to copy**: Tools that decrypt files to disk or invoke plugins that write temp files.

### 8. Credential Scrubbing in Logs

**What**: Stripping Authorization headers and tokens from log output before writing.

**Repos**: helm (`pkg/registry/transport.go:37-41`), gh-cli (`maskToken()` at `status.go:332-338`), restic (`StripPassword()` at `config.go:48-66`).

**Why it works**: Prevents accidental credential exposure in logs, which are often written to world-readable files or centralized logging systems.

**When to copy**: Any tool that makes HTTP requests with Authorization headers or stores tokens.

### 9. Terminal Echo Disable

**What**: Using terminal libraries to disable echo while reading passwords.

**Repos**: age (`term.ReadSecret` at `term.go:65-73`), restic (`ReadPassword` at `password.go:15-54`), helm (`readLine` with echo disabled at `registry_login.go:136-159`), gh-cli (via keyring's terminal behavior).

**Why it works**: Passwords are not visible on screen during entry, preventing shoulder surfing.

**When to copy**: Any tool that prompts for passwords interactively.

### 10. Schema-Based Config Validation

**What**: Validating user-provided configuration files against JSON schemas before parsing.

**Repos**: k9s (`validator.go:146`).

**Why it works**: Catches structural errors and unknown fields before they cause runtime issues. Makes validation consistent across all config types.

**When to copy**: Tools with complex, user-authored configuration files that support plugins or extensions.

## Key Differences

### Shell Execution Philosophy

**Three distinct approaches**:

1. **No shell execution** (age, urfave-cli, mitchellh-cli): The tool doesn't invoke external commands. Zero shell attack surface.

2. **Controlled exec.Command with argument arrays** (gh-cli, lazygit, rclone, restic): Invokes binaries with explicit arguments, no shell interpretation. Prevents injection but relies on OS-level permissions.

3. **Pure interpreter sandbox** (go-task): Interprets shell syntax without OS shell process. Provides injection protection plus controlled file/network access.

4. **Interactive permission with banned list** (opencode): Commands are blocked by default and require user approval, plus a banned command list prevents specific dangerous operations.

The difference between gh-cli's `safeexec` and go-task's `mvdan.sh/v3` is fundamental: `safeexec` prevents shell interpretation but still runs real system binaries; `mvdan.sh/v3` replaces the shell entirely with a controlled interpreter.

### Secret Storage Strategy

**Four patterns**:

1. **No storage** (dive, gdu, lazygit): Credentials are handled by external runtimes (docker auth, kubeconfig) or prompted each time.

2. **OS keyring** (gh-cli): Delegates to OS keychain (Linux/Windows: zalando/go-keyring, macOS: Keychain).

3. **Encrypted config file** (rclone with nacl/secretbox, restic with AES-256-CTR): Secrets at rest are encrypted with a user-provided password.

4. **File-based identities** (age): Plain text key files with 0600 permissions. No central store.

No repo uses hardware tokens (YubiKey, HSM) or cloud secret managers (Vault, AWS Secrets Manager). This is expected for standalone CLI tools but is a gap for enterprise use cases.

### Input Validation Centralization

**Two patterns**:

1. **Centralized validation** (k9s JSON schemas, helm chart metadata validation, yq operator entry points): All untrusted input goes through a single validation layer.

2. **Per-command validation** (gh-cli, lazygit, chezmoi): Each command validates its own inputs. More flexible but risk of inconsistency.

Centralized validation consistently scores higher because it's harder to miss a validation case. Per-command validation is acceptable for smaller codebases with disciplined teams.

### Trust Boundary Visibility

**Three levels**:

1. **Explicit** (age: MAC verification, scrypt caps, stanza type allowlist; k9s: `readOnly` mode, `Dangerous` flag, `scopes`; opencode: permission dialogs): Trust boundaries are visible in code and documented.

2. **Partially explicit** (gh-cli: token source tracking, env vs stored distinction; helm: provenance verification, auth header scrubbing; go-task: remote Taskfile prompts, checksum verification): Some boundaries are explicit, others are implicit.

3. **Implicit** (dive, gdu, lazygit, mitchellh-cli): Trust boundaries not marked. Implicit trust that Docker/Podman runtimes are safe, user config is trusted, etc.

Tools with explicit trust boundaries consistently score 7–9. Tools with implicit boundaries score 3–6.

## Tradeoffs

| Decision | Benefit | Cost | Best-fit Context | Failure Mode | Alternative |
|----------|---------|------|------------------|--------------|-------------|
| Pure-Go shell interpreter (go-task) | Eliminates shell injection, reproducible behavior | Loses POSIX compatibility, may not support all shell features | Task runners executing untrusted workflow definitions | Some legitimate commands won't work | `safeexec` + argument arrays (gh-cli) |
| OS keyring for secrets (gh-cli) | OS-level protection, biometric unlock | Platform-specific, fallback to plaintext on failure | Desktop-focused CLIs with frequent auth | Keyring service hangs → 3s timeout fallback | File-based encrypted store (rclone) |
| Interactive permission dialogs (opencode) | User makes informed decisions | Blocks agent loop, slows automation | Agent tools with untrusted prompts | User habituates to "allow" without reading | Banned list auto-deny (opencode pattern) |
| Config encryption with password (rclone, restic) | Secrets protected at rest | Password becomes a target; weak password = weak protection | Tools that store config locally | Password reused across systems | OS keyring (gh-cli) |
| Default-allow security flags (yq) | Works out of the box for local use | Insecure for untrusted input | Local data processing | User processes untrusted YAML with file access enabled | Default-deny (go-task remote Taskfile model) |
| Plugin subprocess model (helm, k9s) | Extensible without core changes | Trust delegated to plugin author | Tools with trusted plugin ecosystem | Malicious or compromised plugin runs with user permissions | Pure interpreter (go-task) |
| No secret storage (dive, gdu) | No secret management complexity | Credential re-prompt on every operation | Read-only analysis tools | User friction in CI environments | Credential caching (lazygit PTY model) |
| Schema-based config validation (k9s) | Catches errors before runtime, consistent across config types | Schema maintenance burden | Tools with complex user-authored configs | Schema drift from code | Per-command validation (gh-cli) |

## Decision Guide

**Q: Should I use `os/exec` or a pure-Go interpreter?**

- Use `os/exec` with explicit argument arrays if: the tool runs known binaries (git, docker), shell compatibility matters, and the threat model doesn't require sandboxing against injected commands.
- Use a pure-Go interpreter (e.g., `mvdan.sh/v3`) if: the tool executes user-provided shell commands, the threat model includes injection attacks, and POSIX compatibility can be traded for safety.

**Q: Where should I store credentials?**

- No storage if: the tool delegates auth to external runtimes (docker, kubeconfig).
- OS keyring if: cross-platform support needed and biometrics are desired.
- Encrypted config if: the tool must work in headless/CI environments without keyring access.
- Plain text with 0600 permissions if: the tool is single-user and keyring is unavailable.

**Q: How should I validate input?**

- Centralized validation (JSON schemas, operator entry points) for: tools with complex user-provided configs that have multiple config types.
- Per-command validation for: simpler tools or when validation logic is command-specific.
- Never skip validation: even read-only tools should validate inputs to prevent DoS (path traversal, excessive memory allocation).

**Q: What trust boundary markers should I use?**

- Explicit flags for read-only/dangerous operations (`k9s.readOnly`, `yq.DisableFileOps`).
- Interactive prompts for operations with high consequence (opencode permission system).
- Type wrappers (`SecretString`) for secrets to prevent accidental logging.
- Comments or types marking "untrusted input" boundaries for code review clarity.

## Practical Tips

1. **Start with argument arrays**: Always use `exec.Command(cmd, arg1, arg2, ...)` instead of `exec.Command("sh", "-c", cmdString)`. This alone prevents most shell injection vulnerabilities.

2. **Use `safeexec.LookPath`** instead of `exec.LookPath` to prevent PATH hijacking. This is a one-line change that eliminates an entire class of attacks.

3. **Implement a `SecretString` type** if handling credentials. Even a simple wrapper that returns `"***"` in `String()` prevents accidental exposure in error messages.

4. **Scrub Authorization headers from logs**: Use a transport wrapper that redacts auth headers before logging. This is often a 5-line addition that prevents credential leaks.

5. **Use `exec.ErrDot` checks** in backend code that invokes external tools. Both restic and rclone use this pattern to prevent PATH hijacking in SFTP/rclone backends.

6. **Add a `--no-spawn-shell` flag** if the tool has an interactive mode. This gives security-conscious users an opt-out without disabling the feature for those who want it.

7. **Validate YAML/JSON config structure before parsing content**: Schema validation catches structural errors early and prevents malformed configs from causing runtime panics.

8. **Set restrictive temp file permissions**: Use `os.MkdirTemp` with restrictive permissions (0o700) for any temporary files containing plaintext secrets or sensitive data.

9. **Disable terminal echo for password input**: Use `golang.org/x/term` to disable echo before reading passwords. Register a signal handler to restore terminal state on interrupt.

10. **Consider a pure-Go shell interpreter** if building a task runner or workflow tool that executes user-provided shell commands.

## Anti-Patterns / Caution Signs

**Anti-patterns observed in this study**:

1. **Unrestricted shell execution with `DisableFlagParsing: true`** (dive build command at `cmd/dive/cli/internal/command/build.go:25`): Passes all arguments directly to docker without validation. This is explicitly a thin wrapper — a known trade-off but one that should be documented.

2. **Default-allow dangerous operations** (yq's `DisableEnvOps`/`DisableFileOps` default to false): By default, env and file operations are enabled, making the tool insecure for untrusted input. The secure-by-default version would flip these flags.

3. **Fallback to plaintext storage without warning** (gh-cli's keyring fallback at `config.go:368-372`): When keyring Set() fails, tokens fall back to plaintext config with only a log warning. Security-conscious users may not notice.

4. **In-memory secret caching without TTL** (chezmoi's secret template func caching at `secrettemplatefuncs.go:31-51`): Secrets retrieved from password managers are cached for the process lifetime. No invalidation mechanism.

5. **No path canonicalization before comparison** (gdu's ignore patterns at `internal/common/ignore.go:16-37`): Regex patterns match against raw paths without canonicalization, potentially allowing traversal attacks if patterns are insufficiently strict.

**Caution signs that indicate the security design is becoming brittle**:

- Shell commands constructed via string concatenation of user input
- Credential storage without key derivation (plaintext passwords as encryption keys)
- No input validation on file paths passed to `os.Open` or `os.ReadFile`
- Trust boundaries that exist only as comments, not enforced in code
- `//nolint:gosec` comments that acknowledge risks without addressing them
- Secrets logged at debug level (even if disabled by default)
- No timeout on external command execution

## Notable Absences

The following patterns were absent across all 16 repos:

1. **Hardware security module (HSM) or hardware token support**: No evidence of YubiKey, smart card, or similar integration for key storage. age's plugin system could support this but no built-in plugin exists.

2. **Memory locking for secrets**: No use of `mlock()` to prevent secrets from being swapped to disk. Go's GC handles secrets but doesn't prevent swapping.

3. **Audit logging for security-sensitive operations**: No repo implements structured audit logs for credential access, command execution, or configuration changes. Logs are primarily for debugging, not security auditing.

4. **Forward secrecy**: age files encrypted to a recipient key can be decrypted indefinitely. No key rotation mechanism. Similar limitation in rclone's token storage.

5. **Rate limiting on authentication attempts**: No evidence of lockout mechanisms for repeated failed auth attempts. restic has `ErrMaxKeysReached` but no time-based rate limiting.

6. **Network egress controls**: opencode has banned commands (curl, wget) but no general network isolation. No repo implements firewall-like controls or DNS rebinding protection.

7. **Explicit taint tracking**: No repo uses types like `UntrustedInput` to make trust boundary crossings visible in the type system. All input is treated as potentially trusted without annotation.

## Per-Repo Notes

**age**: The standout for explicit trust boundaries. MAC verification, stanza type allowlist, plugin name validation, and scrypt work factor caps all demonstrate security-first thinking. The lack of a keyring is by design, not an oversight.

**go-task**: The pure-Go interpreter is the strongest shell sandbox in this study. Remote Taskfile trust infrastructure (checksum pinning, prompts, host allowlisting) is comprehensive. Gap: dotenv variable bleed between Taskfiles.

**helm**: Provenance verification and credential scrubbing are well-implemented. Plugin trust is the weak point — plugins execute with the user's full environment without sandboxing.

**opencode**: Permission system is the most explicit interactive trust boundary. Banned command list and safe read-only allowlist provide practical security. Gap: predictable temp file names and session permissions not persisted.

**restic**: Defense-in-depth is evident in quote-aware shell splitting, `SecretString` type, MAC-before-decrypt, and key iteration limits. Hardcoded PGP key for self-update is a single trust anchor that cannot be rotated.

**chezmoi**: Secret scanning with `betterleaks` and encryption at rest (age/GPG) are solid. Pager/hook shell execution is a gap — not sandboxed and relies on user trust in configuration.

**fzf**: Process group isolation, history file permissions (0600), and OpenBSD pledge are good. No dedicated secret store limits applicability for credential-handling use cases.

**gh-cli**: Keyring integration and `safeexec` are industry-standard patterns. Token source tracking and env vs. stored distinction are well-designed. Fallback to plaintext is the main gap.

**k9s**: JSON schema validation and `Dangerous` plugin flag are excellent patterns. `readOnly` mode is explicit and enforced. Node shell privileged pod is a known trade-off for functionality.

**lazygit**: PTY-based credential handling is well-designed. Command builder with explicit argument arrays prevents injection. No secret storage means repeated prompts in CI.

**rclone**: nacl/secretbox config encryption is solid. Token refresh pattern is sound. `--password-command` not sandboxed is the main gap; the RC server auto-generated credentials are strong but logged to stderr.

**yq**: Security flags provide opt-out control but default-enabling dangerous operations is the wrong default for untrusted input. Path traversal not protected in load operator.

**gdu**: `--no-spawn-shell` flag is good opt-out mechanism. Shell spawning default-on is a concern for enterprise deployment. No path canonicalization.

**dive**: CI threshold validation is well-implemented. Unrestricted Docker/Podman execution is the trade-off for a thin wrapper design.

**mitchellh-cli**: Framework correctly delegates security to consumers. `speakeasy` for terminal input is sound. No input validation by design — ceiling is imposed by the framework model.

**urfave-cli**: Per-flag `Validator` is a good primitive. No secret handling by design. Security ceiling imposed by framework model.

## Open Questions

1. **Why do no repos use explicit taint types?** Despite Go's type system ability to express `UntrustedInput`, no repo annotates untrusted data this way. Is this a tooling gap, a cultural gap, or a performance concern?

2. **What is the right trust model for CLI plugins?** helm and k9s both execute plugins as subprocesses with the user's full environment. Is there a practical middle ground between "full trust" and "containerized isolation" that doesn't require container infrastructure?

3. **Should shell execution be opt-in or opt-out by default?** yq defaults to allowing dangerous operations; go-task's remote Taskfiles prompt by default. Which model is more appropriate for which tool categories?

4. **Is the keyring fallback pattern in gh-cli a security risk or a pragmatic妥协?** Storing tokens in plaintext when keyring fails enables usability but weakens security for users who don't notice the fallback.

5. **How should CLIs handle secrets in CI environments?** Many of the patterns studied (PTY prompts, keyring, terminal echo disable) assume interactive use. What's the equivalent security model for non-interactive CI?

6. **Why do no repos implement audit logging for security-sensitive operations?** This seems like a gap for enterprise adoption, but perhaps CI/logging infrastructure handles this outside the tool.

## Evidence Index

Key evidence supporting major findings (all references from per-repo reports):

- age plugin isolation: `plugin/client.go:433,463`, `plugin/client.go:430-431`
- go-task pure interpreter: `internal/execext/exec.go:59-66`, `internal/execext/exec.go:152-157`
- helm provenance: `pkg/provenance/sign.go:281-288`, `pkg/provenance/sign.go:239-278`
- helm credential scrubbing: `pkg/registry/transport.go:37-41`
- opencode permission system: `internal/permission/permission.go:44-108`, `internal/llm/tools/bash.go:41-55`
- restic SecretString: `internal/options/secret_string.go:15-20`
- restic MAC-before-decrypt: `internal/crypto/crypto.go:309-311`
- restic shell splitting: `internal/backend/shell_split.go:45-76`
- k9s schema validation: `internal/config/json/validator.go:146`
- k9s Dangerous flag: `internal/config/plugin.go:64`, `internal/view/actions.go:142`
- gh-cli safeexec: `pkg/surveyext/editor_manual.go:23`, `pkg/iostreams/iostreams.go:228`
- gh-cli keyring: `internal/keyring/keyring.go:22-73`
- lazygit credential intercept: `cmd_obj_runner.go:404-413`
- chezmoi secret scanning: `internal/cmd/addcmd.go:106-116`
- chezmoi private temp: `gpgencryption.go:151-165`
- fzf process isolation: `src/util/util_unix.go:51-54`, `src/protector/protector_openbsd.go:8-10`
- yq security flags: `pkg/yqlib/security_prefs.go:3-7`, `cmd/root.go:213-215`
- rclone config encryption: `fs/config/crypt.go:17`, `fs/config/crypt.go:278-283`
- dive DisableFlagParsing: `cmd/dive/cli/internal/command/build.go:25`
- mitchellh-cli secure input: `ui.go:79-80`

---

Generated by protocol `study-areas/13-security.md`.