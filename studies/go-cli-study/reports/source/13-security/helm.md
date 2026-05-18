# Repo Analysis: helm

## Security & Trust Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | helm |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/helm` |
| Group | `helm` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Helm demonstrates solid security engineering with centralized chart validation, provenance verification via PGP signatures, scrubbed authorization headers in logs, and secure password input via stdin with terminal echo disabled. Shell execution is limited to plugin subprocess invocation with environment variable expansion, though the plugin commands themselves are user-supplied code. TLS/mTLS configuration is available for registry communications. Overall, Helm exhibits good operational safety practices suitable for enterprise use.

## Rating

**8/10** — Good operational safety. Provenance verification, credential scrubbing, and centralized validation are present. Some security-relevant operations (plugin execution, environment variable expansion in commands) rely on the user's trust in plugin authors rather than explicit sandboxing.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Input validation | `sanitizeString()` removes non-printable unicode | `pkg/chart/v2/metadata.go:170-181` |
| Input validation | `Metadata.Validate()` checks name format, semver, illegal names | `pkg/chart/v2/metadata.go:86-155` |
| Input validation | `Maintainer.Validate()` sanitizes all string fields | `pkg/chart/v2/metadata.go:36-45` |
| Input validation | `Dependency.Validate()` regex check for alias | `pkg/chart/v2/dependency.go:55-70` |
| Input validation | Kubernetes label validation via `validation.IsValidLabelValue` | `pkg/storage/driver/secrets.go:127-128` |
| Shell execution | Plugin subprocess via `exec.Command` with env expansion | `internal/plugin/runtime_subprocess.go:114-133` |
| Shell execution | `PrepareCommands()` expands env vars in plugin arguments | `internal/plugin/subprocess_commands.go:80-113` |
| Credentials | Authorization header scrubbing in logs | `pkg/registry/transport.go:37-41` |
| Credentials | `readLine()` disables terminal echo for password input | `pkg/cmd/registry_login.go:136-159` |
| Credentials | Warning logged when `--password` CLI flag is used | `pkg/cmd/registry_login.go:130` |
| Credentials | `containsCredentials()` detects tokens in response bodies | `pkg/registry/transport.go:160-162` |
| Provenance | PGP signature verification via `openpgp.CheckDetachedSignature` | `pkg/provenance/sign.go:281-288` |
| Provenance | SHA256 digest verification per file | `pkg/provenance/sign.go:239-278` |
| Plugin verification | `.prov` file verification during plugin install | `internal/plugin/installer/installer.go:86-119` |
| TLS | mTLS configuration with cert/key pair loading | `internal/tlsutil/tls.go:28-65` |
| Insecure options | `InsecureSkipVerifyTLS` and `--plain-http` flags | `pkg/getter/getter.go:95-97`, `pkg/cmd/registry_login.go:84-88` |

## Answers to Protocol Questions

### 1. How are secrets stored?

Secrets are not stored by Helm; the tool processes credentials for registry authentication at runtime. Credentials are:
- Accepted via `--username`/`--password` flags (with a warning against `--password`) or `--password-stdin` for secure stdin input (`pkg/cmd/registry_login.go:93-134`)
- Passed to the registry client as `auth.Credential` struct (`pkg/registry/client.go:127-130`)
- Authorization headers are scrubbed from logs (`pkg/registry/transport.go:37-41`)
- Response bodies are redacted if they contain token strings (`pkg/registry/transport.go:136-138`)
- Stored as Kubernetes Secrets backend uses Kubernetes label validation (`pkg/storage/driver/secrets.go:127-128`)

### 2. How is shell execution sandboxed?

Shell execution is **not explicitly sandboxed**. Helm executes plugins as subprocesses using `exec.Command` (`internal/plugin/runtime_subprocess.go:116`), with environment variable expansion applied to both the command path and arguments (`internal/plugin/subprocess_commands.go:89-94`). There is no seccomp, namespaces, or resource limits applied to these subprocesses. The trust model relies on the user explicitly installing plugins they trust. Provenance verification via `.prov` files is available during plugin installation (`internal/plugin/installer/installer.go:86-119`) but is optional.

### 3. How are user inputs validated?

User input validation is **centralized** in the chart package:
- `Metadata.Validate()` (`pkg/chart/v2/metadata.go:86-155`) validates chart name format, semver version, required fields, and checks for illegal names like `.` and `..`
- `sanitizeString()` (`pkg/chart/v2/metadata.go:170-181`) removes non-printable unicode characters from all string fields
- `Dependency.Validate()` (`pkg/chart/v2/dependency.go:55-70`) validates alias names against regex
- `Maintainer.Validate()` (`pkg/chart/v2/metadata.go:36-45`) sanitizes maintainer fields
- Plugin metadata is validated via `Metadata.Validate()` (`internal/plugin/metadata.go:61-112`) with plugin name format checks

### 4. Are trust boundaries explicit?

Trust boundaries are **partially explicit**:
- Provenance verification provides a trust anchor for chart integrity (`pkg/provenance/sign.go:239-288`)
- Plugin installation supports optional verification via `.prov` files (`internal/plugin/installer/installer.go:86-119`)
- Authorization headers are explicitly scrubbed from logs (`pkg/registry/transport.go:37-41`)
- The `--insecure` and `--plain-http` flags are documented as insecure (`pkg/cmd/registry_login.go:84-88`)
- However, plugin execution operates on an implicit trust model — plugins are executed with the user's environment and have access to all user permissions
- Untrusted inputs (chart metadata from remote repositories) are validated but not sandboxed

## Architectural Decisions

- **Centralized chart validation**: All chart metadata validation is centralized in `pkg/chart/v2/`, making it easy to audit and maintain consistency
- **Optional provenance**: Provenance (.prov) files are verified when present during plugin installation, but are not required — allowing flexibility while providing security for those who want it
- **Credential isolation**: Authorization headers are explicitly redacted from all log output, preventing accidental credential exposure
- **TLS/mTLS support**: Registry communications support client certificates for mutual TLS, enabling enterprise security requirements (`internal/tlsutil/tls.go:28-65`)
- **Plugin subprocess model**: Plugins run as child processes outside Helm's address space, providing process-level isolation but not sandboxing

## Notable Patterns

- `ValidationError` custom error type (`pkg/chart/v2/errors.go:20-29`) enables structured validation error handling
- Environment variable expansion in plugin commands (`internal/plugin/subprocess_commands.go:89-94`) uses `os.Expand` with a custom mapping function
- Terminal echo disabling for password input (`pkg/cmd/registry_login.go:136-159`) uses `term.DisableEcho` from a terminal library
- Kubernetes label validation reuses the Kubernetes `validation.IsValidLabelValue` function (`pkg/storage/driver/secrets.go:127-128`)

## Tradeoffs

- **Plugin trust vs. safety**: Helm allows users to install arbitrary plugins, which are executed as subprocesses with full user permissions. This provides flexibility but means the trust boundary depends on the user's judgment, not enforcement.
- **Convenience vs. security**: The `--password` flag (which logs warnings but still functions) trades security for convenience. The secure alternative `--password-stdin` requires more setup.
- **Provenance optionality**: Making provenance verification optional enables fast iteration but means unverified charts can still be installed.
- **Environment variable expansion**: Expanding environment variables in plugin commands (`internal/plugin/runtime_subprocess.go:116`) enables powerful configuration but could be leveraged by malicious plugins.

## Failure Modes / Edge Cases

- **Malicious plugins**: A plugin could potentially perform harmful actions since subprocess execution is not sandboxed beyond process isolation
- **Credential logging**: While authorization headers are scrubbed, other sensitive data (query parameters, etc.) might be logged depending on context
- **Chart name collisions**: While validation prevents `.` and `..` as chart names, symlink attacks via relative paths in chart archives could potentially bypass validation
- **Insecure TLS**: The `--insecure` flag bypasses all certificate validation, which could enable man-in-the-middle attacks if used with untrusted registries
- **Environment variable injection**: Plugin commands expand environment variables, which could be manipulated if a plugin is invoked in a compromised environment

## Future Considerations

- Consider sandboxing plugin execution (e.g., seccomp, unprivileged namespaces) to provide defense-in-depth
- Consider requiring provenance for chart installation in a future enterprise mode
- Consider adding input validation for all environment variables consumed by plugins
- The warning for `--password` could be elevated to an error in a future major version

## Questions / Gaps

- No evidence found of runtime sandboxing (seccomp, AppArmor, SELinux) for plugin subprocesses
- No evidence found of secret rotation or temporary credential mechanisms
- No evidence found of audit logging for security-sensitive operations beyond helm's own log output
- Plugin execution environment variables are not explicitly documented as a trust boundary