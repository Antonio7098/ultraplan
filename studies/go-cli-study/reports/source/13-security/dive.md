# Repo Analysis: dive

## Security & Trust Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | dive |
| Path | `repos/dive` |
| Group | `13-security` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

dive is a Docker/Podman image analysis tool. It does not handle secrets or credentials; its security surface is limited to shell execution of Docker/Podman commands and input validation on CI rule thresholds. The tool delegates all image fetching to external container runtimes, inheriting their security model.

## Rating

**4/10 — Basic security hygiene**

Rationale: dive performs threshold validation via a well-structured CI rules system with input parsing and range checks, but shell execution of Docker/Podman commands is unrestricted. No credential handling exists (relies on external runtime auth). Trust boundaries are implicit rather than explicit.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Shell execution | `exec.Command("docker", allArgs...)` for Docker CLI | `dive/image/docker/cli.go:24` |
| Shell execution | `exec.Command("podman", allArgs...)` for Podman CLI | `dive/image/podman/cli.go:26` |
| Shell availability check | `isDockerClientBinaryAvailable()` via `exec.LookPath` | `dive/image/docker/cli.go:34-36` |
| Shell availability check | `isPodmanClientBinaryAvailable()` via `exec.LookPath` | `dive/image/podman/cli.go:60-62` |
| Argument sanitization | `CleanArgs()` only trims whitespace | `internal/utils/format.go:8-15` |
| CI threshold validation | Range checks on efficiency (0-1), wasted bytes, wasted percent | `cmd/dive/cli/internal/command/ci/rules.go:105-108`, `cmd/dive/cli/internal/command/ci/rules.go:170-173` |
| CI rule parsing | `humanize.ParseBytes` for wasted bytes, `strconv.ParseFloat` for others | `cmd/dive/cli/internal/command/ci/rules.go:99`, `cmd/dive/cli/internal/command/ci/rules.go:134`, `cmd/dive/cli/internal/command/ci/rules.go:164` |
| Credential helpers | `docker-credential-helpers` in go.mod (indirect) | `go.mod:49` |
| Image source parsing | Scheme-based image source derivation (`docker://`, `podman://`, `docker-archive://`) | `dive/get_image_resolver.go:42-60` |

## Answers to Protocol Questions

### 1. How are secrets stored?

No evidence of secret or credential storage within dive. The tool does not handle credentials directly — it relies on Docker/Podman authentication, which is managed externally by the container runtime. The `docker-credential-helpers` dependency (`go.mod:49`) is an indirect dependency brought in by other libraries; there is no direct usage in the codebase. Secrets for release automation (e.g., `TAP_GITHUB_TOKEN`, `DOCKER_PASSWORD`) exist only in GitHub Actions workflow files (`.github/workflows/release.yaml`), not in the application code.

### 2. How is shell execution sandboxed?

**It is not sandboxed.** Shell execution occurs via `os/exec` calling `docker` or `podman` binaries with user-supplied arguments. The only controls are:

1. Binary availability check via `exec.LookPath` (`dive/image/docker/cli.go:34-36`, `dive/image/podman/cli.go:60-62`)
2. Whitespace trimming via `CleanArgs()` (`internal/utils/format.go:8-15`) — this is not a security control, merely argument normalization

There is no input validation on the arguments passed to Docker/Podman, no use of `syscall.SysProcAttr` for process isolation, no seccomp/AppArmor profiles, and no restriction on which Docker/Podman subcommands can be invoked. The `build` command uses `DisableFlagParsing: true` (`cmd/dive/cli/internal/command/build.go:25`), passing all arguments directly to the container runtime.

### 3. How are user inputs validated?

User input validation is present **only for CI rule configuration values**, which are numeric thresholds. The validation includes:

- **Efficiency threshold**: parsed as float64, must be in range [0, 1] (`cmd/dive/cli/internal/command/ci/rules.go:105-108`)
- **Wasted bytes threshold**: parsed via `humanize.ParseBytes` (supports human-readable sizes like "50kB") (`cmd/dive/cli/internal/command/ci/rules.go:134-138`)
- **Wasted percent threshold**: parsed as float64, must be in range [0, 1] (`cmd/dive/cli/internal/command/ci/rules.go:170-173`)
- **Disabled detection**: string comparison against `["", "disabled", "off", "false"]` (`cmd/dive/cli/internal/command/ci/rules.go:193-195`)

There is **no input validation on the Docker/Podman image name/identifier** passed as the main argument. The image string is passed directly to the container runtime resolver without sanitization. The only image source parsing is scheme-based (`docker://`, `podman://`, etc.) in `dive/get_image_resolver.go:42-60`, which splits on known schemes but does not validate the identifier itself.

### 4. Are trust boundaries explicit?

**No.** Trust boundaries are not explicitly marked. The codebase contains no security documentation, no trust boundary markers or comments, and no separation between "trusted" (CLI-provided values) and "untrusted" (user-supplied image identifiers) data. The architecture treats the Docker/Podman runtime as a trusted external service, but this is implicit rather than declared.

## Architectural Decisions

- **External runtime delegation**: dive offloads all image fetching to Docker/Podman, meaning security is largely inherited from the container runtime's authentication model. This is a pragmatic design choice for a visualization tool.
- **No secret management**: Since dive is a read-only analysis tool, it does not need to store or transmit secrets. Authentication is delegated to the runtime.
- **CI rules as the primary validation surface**: The only structured input validation is for CI rule thresholds, which makes sense given the tool's CI-focused use case. This is a narrow but well-implemented validation surface.
- **Build command passthrough**: The `dive build` command uses `DisableFlagParsing: true`, passing all arguments directly to `docker build`. This is explicitly a thin wrapper (`cmd/dive/cli/internal/command/build.go:24`) — a design trade-off prioritizing flexibility over safety.

## Notable Patterns

- **CI rule validation pattern**: Rules implement a `Rule` interface with `Key()`, `Configuration()`, and `Evaluate()` methods. Validation errors are collected and returned together via `errors.Join()` (`cmd/dive/cli/internal/command/ci/rules.go:40`). This is a clean, extensible rule evaluation pattern.
- **Scheme-based image source routing**: Image sources are derived from URI-like prefixes (`docker://`, `podman://`) rather than argument position, enabling flexible image specification.
- **Environment-aware CI enabling**: CI mode can be enabled via `--ci` flag or `CI=true` environment variable (`cmd/dive/cli/internal/options/ci.go:43-46`), supporting seamless CI integration.
- **Test for misconfigurations**: The test suite includes explicit negative test cases for invalid rule configurations (`cmd/dive/cli/internal/command/ci/evaluator_test.go:107-176`), covering format errors, range violations, and disabled states.

## Tradeoffs

- **Shell execution without sandboxing**: Choosing not to sandbox Docker/Podman execution simplifies the implementation but places full trust on the container runtime. An attacker with control over the image name could potentially exploit vulnerabilities in the container runtime.
- **No image name validation**: Accepting any string as an image identifier and passing it to Docker/Podman is a calculated trade-off. Validating image names against security-sensitive patterns would be complex and likely still insufficient.
- **Build command passthrough**: Using `DisableFlagParsing: true` for the build command is the most flexible approach but bypasses all Go-internal flag parsing safety nets.

## Failure Modes / Edge Cases

- **Missing Docker/Podman binary**: The tool checks binary availability via `exec.LookPath` before invoking, returning a clear error message (`dive/image/docker/cli.go:15-17`).
- **Invalid CI rule values**: Parsing errors in CI rule configuration are detected and returned as errors, preventing silent misconfiguration. The test suite explicitly covers invalid formats and out-of-range values.
- **Empty arguments**: `CleanArgs()` filters out empty strings, preventing issues with empty arguments (`internal/utils/format.go:11`).
- **Unknown image source**: If the image scheme is unrecognized, `GetImageResolver` returns an error (`dive/get_image_resolver.go:71-72`).
- **CI evaluation failures**: The evaluator uses a tally pattern (pass/fail/warn/skip) that gracefully handles mixed results (`cmd/dive/cli/internal/command/ci/evaluator.go:136-150`).

## Future Considerations

- Add explicit image identifier validation (e.g.,禁止 null bytes, length limits, character allowlist)
- Consider adding a `--no-sandbox` flag for environments where Docker/Podman execution is itself sandboxed
- Document trust boundaries and external runtime assumptions
- Consider adding audit logging for image fetch operations in CI mode

## Questions / Gaps

- **No evidence of security audit or penetration testing**: No security documentation, CVE tracking, or security policy file found.
- **No evidence of secret scanning in CI**: The codebase does not include tools like `trivy` or `gosec` in its test/CI pipeline.
- **No explicit trust boundary documentation**: The assumption that Docker/Podman runtimes are trusted external services is not documented.
- **Credential helper usage unclear**: While `docker-credential-helpers` appears as an indirect dependency, its usage path through the dependency tree is not evident from the source.

---

Generated by `study-areas/13-security.md` against `dive`.