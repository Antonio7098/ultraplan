# Repo Analysis: yq

## Security & Trust Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | yq |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/yq` |
| Group | `yq` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

yq is a portable CLI data file processor supporting YAML, JSON, XML, CSV, and other formats. It uses expression-based queries to transform and process structured data. Security is implemented via a centralized `SecurityPreferences` struct with flags that gate dangerous operations.

## Rating

**6/10** — Basic security hygiene with opt-out model for dangerous operations.

yq provides three security flags that disable env ops, file ops, and system command execution. The shell execution (via `exec.Command`) is gated behind `EnableSystemOps` which is disabled by default. However, by default env and file operations are enabled, and there is no path traversal protection in the load operator.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Security config struct | `SecurityPreferences` struct with `DisableEnvOps`, `DisableFileOps`, `EnableSystemOps` bools | `pkg/yqlib/security_prefs.go:3-7` |
| Default security config | Global `ConfiguredSecurityPreferences` with all flags `false` (operations enabled) | `pkg/yqlib/security_prefs.go:9-12` |
| Env operator gate | Checks `DisableEnvOps` and returns error if disabled | `pkg/yqlib/operator_env.go:20-22` |
| Env operator implementation | Reads from `os.Getenv(envName)` directly | `pkg/yqlib/operator_env.go:26` |
| File ops gate | Checks `DisableFileOps` and returns error if disabled | `pkg/yqlib/operator_load.go:66-68`, `pkg/yqlib/operator_load.go:100-102` |
| Shell execution gate | Checks `EnableSystemOps` and returns error if disabled | `pkg/yqlib/operator_system.go:62-64` |
| Shell execution | Uses `exec.Command(command, args...)` with nosec comment | `pkg/yqlib/operator_system.go:121` |
| Shell nosec annotation | `#nosec G204 - intentional: user must explicitly enable this operator` | `pkg/yqlib/operator_system.go:120` |
| CLI security flags | Three persistent flags for the three security preferences | `cmd/root.go:213-215` |
| File read | `os.ReadFile(filename)` with `#nosec` annotation | `pkg/yqlib/operator_load.go:25` |
| File open | `os.Open(filename)` with `#nosec` annotation | `pkg/yqlib/operator_load.go:38` |
| NO_COLOR support | Uses `os.Getenv("NO_COLOR")` for color output control | `cmd/root.go:74` |

## Answers to Protocol Questions

### 1. How are secrets stored?

**No evidence found.** yq does not implement any secret storage mechanism. The `env()` operator reads environment variables via `os.Getenv()` at `pkg/yqlib/operator_env.go:26`, but there is no credential isolation, secret vault integration, or masking of sensitive values in output. Debug logging at `pkg/yqlib/operator_env.go:53` logs the raw env value, which could leak secrets if debug logging is enabled.

### 2. How is shell execution sandboxed?

Shell execution is controlled via `EnableSystemOps` flag at `pkg/yqlib/operator_system.go:62`. When disabled (default), attempting to use the `|` (system) operator fails with an error. When enabled, it executes the command via `exec.Command` at line 121, passing the YAML candidate as stdin. The nosec annotation at line 120 acknowledges the intentional use of shell execution. There is no process isolation, resource limits, or network sandboxing.

### 3. How are user inputs validated?

Input validation is **not centralized**. The expression parser (`pkg/yqlib/expression_parser.go:28`) tokenises and parses expressions but does not validate user data. The load operator reads files directly via `os.ReadFile` and `os.Open` with nosec annotations acknowledging CWE-22 concerns at `pkg/yqlib/operator_load.go:22-23`. Filenames are taken directly from expression results at `pkg/yqlib/operator_load.go:84` without path traversal checks. The system operator at `pkg/yqlib/operator_system.go:44-59` validates that command and args are non-null scalars, but does not restrict the command itself.

### 4. Are trust boundaries explicit?

**Partially.** The three security flags (`--security-disable-env-ops`, `--security-disable-file-ops`, `--security-enable-system-operator`) at `cmd/root.go:213-215` serve as explicit trust boundary markers. However, by default env and file operations are enabled, making the tool insecure by default for untrusted input scenarios. The documentation does not appear to explicitly document trust boundary semantics. There is no marking of untrusted vs trusted data flows within the codebase.

## Architectural Decisions

1. **Opt-out security model**: Dangerous operations (env, file I/O, shell execution) are enabled by default and can be disabled via flags. This prioritizes convenience over safety.

2. **Global security preferences**: `ConfiguredSecurityPreferences` at `pkg/yqlib/security_prefs.go:9` is a package-level global, meaning the security state is global and not per-invocation or per-expression.

3. **Security-as-flag architecture**: Each security dimension has its own boolean flag, allowing fine-grained control but also requiring users to know which flags to set.

4. **Nosec annotations for known risks**: Several file operations carry `#nosec` comments acknowledging the security tradeoffs, indicating awareness of the risks.

## Notable Patterns

- **Expression-based query model**: yq processes expressions that combine operators (env, load, system) with data transformation logic. Security checks are co-located with operator implementations.
- **Security checks at operator entry points**: Each potentially dangerous operator (env, load, system) checks the relevant security flag before proceeding.
- **Error-based denial**: When a security preference disables an operation, the operator returns an error with a descriptive message, providing clear feedback to users.

## Tradeoffs

1. **Convenience vs safety**: Default-enabling env and file ops means yq works immediately with environment variables and file access, but exposes users to risks when processing untrusted input.

2. **No path traversal protection**: The load operator does not validate or sanitize file paths, relying on the OS filesystem permissions and the opt-out flag for protection.

3. **Shell execution is opt-in**: Unlike env and file ops, shell execution is disabled by default, acknowledging the greater danger of arbitrary command execution.

4. **No logging sanitization**: Debug logs output raw env values (`pkg/yqlib/operator_env.go:53`), which could leak secrets if debug logging is enabled in production.

## Failure Modes / Edge Cases

1. **Path traversal**: If a user-controlled expression provides a filename like `../../etc/passwd`, the load operator will read it without validation.

2. **Env var injection**: Since `env()` accepts arbitrary env var names and passes them directly to `os.Getenv()`, malicious input could potentially access unexpected environment variables.

3. **Shell injection via system operator**: When `EnableSystemOps` is true, the system operator accepts arbitrary command strings from expression results at `pkg/yqlib/operator_system.go:44-59`, enabling arbitrary command execution if the expression is user-controlled.

4. **Secret exposure via debug logging**: Enabling verbose mode (`-v`) causes debug logs to print raw env values, which could expose secrets to logs.

5. **Nosec bypass**: The `#nosec` annotations on file operations at `pkg/yqlib/operator_load.go:25` and `pkg/yqlib/operator_load.go:38` suppress gosec warnings, relying on the `DisableFileOps` flag as the safeguard.

## Future Considerations

1. Implement path traversal validation in load operators to prevent directory escape.
2. Add an option to redact env values from debug logs.
3. Consider secure-by-default mode where `DisableFileOps` and `DisableEnvOps` are true by default, with a `--allow-unsafe-operations` flag to restore current behavior.
4. Add timeout and resource limits for shell execution (e.g., via `exec.CommandContext`).

## Questions / Gaps

- No evidence found for secret storage mechanisms.
- No evidence found for input sanitization or validation of file paths.
- No evidence found for audit logging of security-sensitive operations.
- No evidence found for integration with secret vaults or credential managers.
- No evidence found for process isolation or sandboxing of shell execution beyond the opt-in flag.

---

Generated by `study-areas/13-security.md` against `yq`.