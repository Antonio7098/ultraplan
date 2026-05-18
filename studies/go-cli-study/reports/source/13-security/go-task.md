# Repo Analysis: go-task

## Security & Trust Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | go-task |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/go-task` |
| Group | `go-task` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

go-task is a task runner/build tool that uses YAML Taskfiles to define and execute tasks. It implements a sandboxed shell execution environment using the `mvdan.sh/v3` interpreter (a pure Go shell parser and interpreter) rather than spawning OS-level shell processes. This is a significant security decision that provides strong guarantees against shell injection attacks. Remote Taskfiles are fetched over HTTPS with optional certificate validation, checksum verification, and user prompts before execution from untrusted sources.

## Rating

**8/10** — Good operational safety. The shell sandboxing is excellent, using a pure Go interpreter rather than os/exec. Remote Taskfile fetching has multiple trust layers (HTTPS enforcement, checksum pinning, user prompts, trusted hosts allowlisting). However, dotenv handling trusts local `.env` files without sanitization, variable templating could be a vector for injection if variables are untrusted, and there is no explicit "untrusted input" boundary labeling.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Shell sandboxing | Uses `mvdan.sh/v3` pure Go interpreter via `execext.RunCommand` | `internal/execext/exec.go:35-91` |
| Shell sandboxing | Set `-e` (errexit) by default | `internal/execext/exec.go:41` |
| Shell sandboxing | Restricted open handler allows only `/dev/null` | `internal/execext/exec.go:152-157` |
| Shell sandboxing | No `os/exec` usage found — only the Go shell interpreter | `internal/execext/exec.go:59-66` |
| Input validation | Template expansion is string-based, not shell evaluation | `internal/templater/templater.go:91-105` |
| Input validation | Checks if string contains `{{` before template parsing | `internal/templater/templater.go:73-76` |
| Secret handling | `.env` files are read into variables, not exported to shell directly | `taskfile/dotenv.go:29-36` |
| Secret handling | Env vars are passed to shell interpreter, not to OS level | `internal/env/env.go:36-51` |
| Secret handling | `godotenv` library used for parsing | `taskfile/dotenv.go:7` |
| Trust boundaries | HTTP scheme rejected unless `--insecure` flag set | `taskfile/node_http.go:84-86` |
| Trust boundaries | User prompt required before executing remote Taskfile | `taskfile/reader.go:548-558` |
| Trust boundaries | `TrustedHosts` allowlist bypasses prompts | `taskfile/reader.go:275-289` |
| Trust boundaries | Checksum verification for remote Taskfiles | `taskfile/reader.go:537-543` |
| Trust boundaries | Cache timestamp + expiry controls staleness | `taskfile/reader.go:476-478` |
| Trust boundaries | TLS certificate configuration (CACert, Cert, CertKey) | `taskfile/node_http.go:29-71` |
| Credential isolation | Credentials passed to HTTP client only, never logged | `taskfile/node_http.go:58-64` |
| Credential isolation | Taskfile location redacted in `Location()` method | `taskfile/node_http.go:101` |
| Credential isolation | `isTrusted` uses exact host match including port | `taskfile/reader.go:289` |
| Preconditions | Preconditions run as shell commands via sandbox | `precondition.go:16-32` |
| Precondition sandbox | Preconditions use same `execext.RunCommand` as tasks | `precondition.go:18-22` |
| Command validation | `ignore_error` flag controls error handling per command | `taskfile/ast/cmd.go:20,113` |
| Command validation | Platform-specific commands filtered by OS/Arch | `task.go:390-393,606-615` |
| Max task calls | Loop prevention via `MaximumTaskCall = 1000` | `task.go:31` |
| Directory creation | Task dir creation is mutex-protected | `task.go:301-316` |

## Answers to Protocol Questions

### 1. How are secrets stored?

**No dedicated secret store exists.** Secrets flow through several mechanisms:

- **Environment variables** (`TASK_*` prefixed) are read via `env.GetTaskEnv*` functions in `internal/env/env.go:63-125`. These are used for internal configuration (e.g., `TEMP_DIR`, `REMOTE_DIR`, `COLOR`, experiment toggles).

- **Dotenv files** are read using `joho/godotenv` library (`taskfile/dotenv.go:29`). Values are stored in `ast.Vars` and merged into the task's environment. This means `.env` files effectively become variables accessible within Taskfile templates.

- **CLI variables** (passed as `FOO=bar` arguments) are merged into `e.Taskfile.Vars` in `cmd/task/task.go:176`, taking priority over Taskfile defaults.

- **Remote Taskfile credentials** (CACert, client Cert/Key) are stored as string paths in the `Executor` struct (`executor.go:41-43`) and passed to the HTTP client for TLS mutual authentication (`taskfile/node_http.go:58-64`). These are not logged or exposed.

- **Secret isolation**: Credentials for remote fetching are isolated to the HTTP transport layer. The URL is redacted when stored/location is reported (`taskfile/node_http.go:101`). No secrets are written to logs or debug output.

**Gap**: There is no mechanism to mark a variable as "sensitive" to prevent it from being logged or echoed. If a user writes `echo $SECRET` in a task, the secret value could appear in output.

### 2. How is shell execution sandboxed?

**Excellent sandboxing via pure Go interpreter:**

go-task does **not** use `os/exec` or spawn an OS shell process. Instead, it uses `mvdan.sh/v3`, a pure Go shell parser and interpreter (`internal/execext/exec.go:59-66`):

```go
r, err := interp.New(
    interp.Params(params...),
    interp.Env(expand.ListEnviron(environ...)),
    interp.ExecHandlers(execHandlers()...),
    interp.OpenHandler(openHandler),
    ...
)
```

**Sandbox enforcement mechanisms:**

1. **`/dev/null` only for file opens** (`internal/execext/exec.go:152-157`):
   ```go
   func openHandler(ctx context.Context, path string, flag int, perm os.FileMode) (io.ReadWriteCloser, error) {
       if path == "/dev/null" {
           return devNull{}, nil
       }
       return interp.DefaultOpenHandler()(ctx, path, flag, perm)
   }
   ```
   Other file opens go through the default handler which respects the interpreter's access controls.

2. **`-e` (errexit) set by default** (`internal/execext/exec.go:41`): Commands fail fast on errors.

3. **Coreutils emulation via Go** (`internal/execext/coreutils.go`): When enabled, provides `echo`, `pwd`, `mkdir`, etc. as pure Go implementations rather than spawning external processes.

4. **No subprocess spawning**: The `execHandlers()` function in `internal/execext/exec.go:145-150` only adds the coreutils handler if `useGoCoreUtils` is set, otherwise no external commands can be executed.

5. **Environment is controlled**: The shell interpreter receives a controlled environment via `expand.ListEnviron(environ...)` (`internal/execext/exec.go:61`), not the raw OS environment.

**What the sandbox cannot prevent:**
- Since Taskfiles are typically authored by the user (or a trusted party), malicious Taskfile content is a trust issue, not a security bug. However, a user who fetches a remote Taskfile from an untrusted source is prompted before execution (`taskfile/reader.go:548-558`).
- Shell expansion in variables could still execute commands within the sandbox, but only within the controlled interpreter environment.

### 3. How are user inputs validated?

**Validation is distributed across layers:**

1. **Template variable expansion** (`internal/templater/templater.go:61-112`):
   - Strings are scanned for `{{` before attempting template parsing (optimization + guard)
   - Uses `go-task/template` (custom fork of Go's `text/template`) with custom functions
   - If template parsing fails, the error is captured and propagation is controlled
   - No direct shell evaluation in template expansion

2. **Taskfile YAML decoding** (`taskfile/reader.go:407-447`):
   - Raw YAML is unmarshaled into `ast.Taskfile` struct
   - Version check ensures supported schema (`taskfile/reader.go:429-431`)
   - Invalid YAML results in `TaskfileDecodeError` with file context

3. **Command-level validation**:
   - `cmd.For` loops validate that the loop variable is a supported type (string, list, map) (`variables.go:399-421`)
   - `cmd.IgnoreError` flag is validated as boolean in YAML decode (`taskfile/ast/cmd.go:65`)
   - Platform filtering checks `runtime.GOOS` and `runtime.GOARCH` before execution (`task.go:606-615`)

4. **Precondition validation** (`precondition.go:16-32`):
   - Preconditions are shell commands executed via the sandboxed interpreter
   - If precondition fails, task is skipped with message from `p.Msg`

5. **Input sanitization for paths**:
   - `filepathext.SmartJoin` is used to resolve relative paths (`taskfile/dotenv.go:23`, `variables.go:151`)
   - Directory existence is checked before use (`task.go:310-314`)

6. **Missing**: No centralized input validation for untrusted user content. The `AssumeYes` flag (`executor.go:48`) can automatically accept prompts, which could be risky if interactive prompts are used for security decisions.

### 4. Are trust boundaries explicit?

**Partially explicit:**

**Explicit trust boundaries:**
1. **Remote Taskfile prompts** (`taskfile/reader.go:24-29`): Constants defined for trust-related prompts:
   ```go
   const taskfileUntrustedPrompt = `The task you are attempting to run depends on the remote Taskfile at %q.
   --- Make sure you trust the source of this Taskfile before continuing ---
   Continue?`
   ```
   This is shown when fetching from a new remote URL.

2. **Checksum mismatch rejection** (`taskfile/reader.go:537-543`): If a pinned checksum doesn't match, execution is halted.

3. **HTTP rejected by default** (`taskfile/node_http.go:84-86`):
   ```go
   if url.Scheme == "http" && !insecure {
       return nil, &errors.TaskfileNotSecureError{URI: url.Redacted()}
   }
   ```

4. **TrustedHosts allowlist** (`taskfile/reader.go:275-289`): Hosts in this list bypass the trust prompt. Config is read from `taskrc` or `--trusted-hosts` flag.

5. **Remote cache with expiry** (`taskfile/reader.go:476-478`): Cached remote Taskfiles expire, forcing re-validation.

6. **Version checks** (`setup.go:282-315`): Taskfiles below schema v3 are rejected; Taskfiles with future versions are rejected.

**Implicit/weak trust boundaries:**
1. **Dotenv files**: Read from disk and merged into environment, but no warning about sensitive values in `.env` files.

2. **No "untrusted input" marker**: User-provided variables (via CLI `FOO=bar`) flow into templates without any labeling that they are untrusted.

3. **`Insecure` flag**: When set, allows HTTP and disables TLS verification, but this is not highlighted as a trust boundary weakening.

4. **`AssumeYes` flag**: Automatically accepts all prompts including security-related ones, yet this is not flagged as a trust-related option.

5. **Taskfile inclusion**: When a Taskfile includes another (local path), there is no warning about the included file potentially containing malicious commands.

## Architectural Decisions

1. **Pure Go shell execution** (`internal/execext/exec.go`):go-task made a deliberate choice to use `mvdan.sh/v3` instead of `os/exec`. This eliminates entire classes of shell injection vulnerabilities because user-defined commands never touch the OS shell layer. This is the most significant security architectural decision in the project.

2. **Remote Taskfile as a first-class concept**: The system was designed with remote Taskfile fetching as a core feature (not an afterthought), leading to explicit trust infrastructure: checksum pinning, user prompts, host allowlisting, TLS configuration.

3. **Functional options pattern** for executor configuration (`executor.go:21-619`): This allows security-sensitive options like `WithInsecure`, `WithTrustedHosts`, `WithCACert` to be composed without adding fields to the core struct.

4. **Environment variable layering** (`internal/env/env.go:36-51`): Environment variables from Taskfile `env:` block are merged with OS environment, with experiment-controlled precedence. This is a pragmatic choice that could expose secrets if Taskfiles are not trusted.

5. **No dedicated secrets vault**: Secrets are expected to come from environment variables, dotenv files, or CLI arguments. There is no encrypted secrets store or integration with secret managers (HashiCorp Vault, AWS Secrets Manager, etc.).

## Notable Patterns

1. **`ignore_error` per-command** (`taskfile/ast/cmd.go:20`): Each command can independently request that errors be suppressed, rather than a global error handling policy.

2. **Platform-specific commands** (`task.go:390-393,606-615`): Commands can declare `platforms:` to specify OS/arch constraints. This is validated before execution.

3. **Deferred commands** (`task.go:270-273`): Commands marked with `defer:` execute regardless of whether the task succeeds or fails, similar to Go's `defer` pattern. This could have security implications if deferred commands access sensitive resources.

4. **Task call count limiting** (`task.go:31,197-202`): Maximum 1000 calls per task to prevent infinite loops. This is a loop protection mechanism, not a security boundary.

5. **Concurrency limiting** (`executor.go:79,267-279`): Optional semaphore limits parallel task execution. This is primarily for resource control, not security.

6. **Watch mode** (`watch.go`): Background task monitoring with deduplicated events. Not directly security-related.

## Tradeoffs

| Decision | Benefit | Risk |
|----------|---------|------|
| Pure Go shell interpreter | Eliminates shell injection, reproducible behavior | Less POSIX compatibility, may not support all shell features |
| Remote Taskfile fetching | Distributed task definitions, DRY across projects | Remote code execution risk, mitigated but not eliminated by prompts/checksums |
| Template variables in shell commands | Powerful flexibility (e.g., `echo {{var}}`) | If variables are user-controlled and untrusted, potential for information disclosure |
| Dotenv file loading | Convenient secret management | Developers may accidentally commit `.env` files, exposing secrets |
| `Insecure` flag for HTTPS | Debugging local HTTP endpoints | Disables TLS verification entirely, man-in-the-middle attack possible |
| `AssumeYes` for prompts | Batch/CI-friendly | Skips security prompts including trust warnings for remote Taskfiles |
| `TrustedHosts` allowlist | Reduces prompt fatigue for known-good hosts | If compromised, remote Taskfile execution is automatic |

## Failure Modes / Edge Cases

1. **Checksum collision**: Remote Taskfile checksums use SHA256 (via standard `checksum` function in `taskfile/reader.go:461`). While SHA256 is secure against collision attacks, if the checksum is transmitted over the same channel as the Taskfile (e.g., in a redirect), the trust guarantee weakens.

2. **Trusted host subdomain attack**: `isTrusted` (`taskfile/reader.go:289`) uses exact host matching. A trusted host `example.com` does not implicitly trust `subdomain.example.com` or `example.com.malicious-actor.com`. This is correct behavior.

3. **Dotenv variable bleed**: When multiple Taskfiles are included, dotenv values from one can leak into another via the merged environment. If Taskfile A sets `SECRET=foo` and Taskfile B includes A, B's shell commands also have access to `SECRET`. This may be unexpected.

4. **Template injection via variables**: If a user variable (from CLI `FOO=bar` or dotenv) contains template syntax like `{{.Var}}` or shell commands, it will be evaluated by the template engine. While this doesn't escape the sandbox, it could leak variable values or cause unexpected behavior.

5. **Deferred command secrets**: Deferred commands (`task.go:340-360`) have access to `EXIT_CODE` and all task variables. If a deferred command fails and the error is ignored, this may not be visible.

6. **No network isolation for preconditions**: Preconditions run on the same network as the executor. If a precondition checks an internal service, it could be used to enumerate internal resources.

7. **Cache staleness**: Remote Taskfile cache expires based on `CacheExpiryDuration`. A compromised remote host could serve different content after the cache expires, but the new content would be checksum-validated (if pinned) or trigger a new trust prompt.

8. **Exit code masking via `ignore_error`**: When `ignore_error: true` is set, the task continues and the error is only logged verbosely. In CI/automation contexts, this could mask failures.

## Future Considerations

1. **Secret masking in output**: Add a `sensitive` flag to variables that would cause them to be redacted from any output (logs, `task --dry`, etc.).

2. **Include integrity verification**: When a Taskfile includes another via `includes:`, there is no checksum pinning mechanism for the included file (unlike remote Taskfiles which support `checksum:`).

3. **Audit trail**: No logging of which Taskfile (and its origin URL if remote) was executed. Adding structured audit logs would help security-conscious deployments.

4. **Sandbox escape detection**: The current sandbox prevents OS-level command execution, but a malicious Taskfile could still consume resources (CPU, memory, disk) or perform denial-of-service on the host via infinite loops.

5. **Variable provenance tracking**: Track whether a variable came from a trusted source (local Taskfile) or untrusted source (CLI argument, remote included Taskfile), and surface this in template evaluation to enable warning or rejection of untrusted variable usage in sensitive contexts.

## Questions / Gaps

1. **No evidence found** for integration with external secret managers (HashiCorp Vault, AWS SSM, GCP Secret Manager). If such integration exists, it is not in the main executor code.

2. **No evidence found** for security documentation in the repository. A `SECURITY.md` file was not present in the repo root to guide researchers or users on responsible disclosure or security practices.

3. **No evidence found** for automated security testing (SAST, dependency scanning) in the codebase. The CI configuration was not inspected, but no security-specific tooling was identified in the source.

4. **Unclear** how sensitive variables are handled in `task --dry` output. Dry mode still evaluates templates and prints commands; if a variable contains a secret, it may be echoed to stdout.

5. **Unclear** how `include:` with remote paths handles trust when the parent Taskfile is local. If a local Taskfile includes a remote one, is the same trust prompt shown?

---

Generated by `study-areas/13-security.md` against `go-task`.