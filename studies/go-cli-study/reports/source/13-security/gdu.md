# Repo Analysis: gdu

## Security & Trust Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | gdu |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` |
| Group | `13-security` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

gdu is a disk usage analyzer with a TUI interface. It scans directories and reports storage consumption. The security model centers on read-only filesystem traversal with optional delete operations and an optional shell spawn feature. No secrets or credentials are handled.

## Rating

**5/10** — Basic security hygiene

gdu provides a `--no-spawn-shell` flag to disable shell access and uses flag-based access control for delete/view operations. However, shell spawning is enabled by default, no input path validation exists beyond basic ignore mechanisms, and there is no credential handling model (which is appropriate for this tool's scope).

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Shell spawning control | `NoSpawnShell` flag and `SetNoSpawnShell()` method | `cmd/gdu/app/app.go:85`, `tui/tui.go:355-358` |
| Shell spawning implementation | `spawnShell()` using user's `$SHELL` or `/bin/bash` | `tui/exec_other.go:11-34` |
| Shell execution via exec.Command | `Execute()` runs arbitrary arguments | `tui/exec.go:8-17` |
| Open item handler | Uses `exec.Command(openBinary, selectedFile.GetPath())` | `tui/actions.go:343` |
| Delete protection | `SetNoDelete()` flag with confirmation dialogs | `tui/tui.go:350-353`, `tui/actions.go:489-527` |
| View file protection | `SetNoViewFile()` flag | `tui/tui.go:360-362` |
| Input path ignore patterns | `CreateIgnorePattern()` with regex | `internal/common/ignore.go:16-37` |
| Type-based filtering | Extension-based include/ignore for files | `internal/common/ignore.go:91-184` |
| Config file loading | YAML unmarshaling into Flags struct | `cmd/gdu/main.go:119-125` |
| Log file permissions | Log files created with `0o600` | `cmd/gdu/main.go:229` |
| Output file permissions | Output files created with `0o600` | `cmd/gdu/app/app.go:370` |

## Answers to Protocol Questions

### 1. How are secrets stored?

**No evidence found.** gdu does not handle secrets, credentials, or tokens. The grep search for `password|secret|credential|token|auth` returned no matches in application code (only CI/CD workflow files). This is appropriate for a disk usage analyzer.

### 2. How is shell execution sandboxed?

Shell execution is **NOT sandboxed**. The `--no-spawn-shell` flag (`tui/tui.go:355-358`) provides an opt-out mechanism, but when enabled:
- `spawnShell()` at `tui/exec_other.go:19-34` calls `os.Chdir(ui.currentDirPath)` then executes the user's shell via `getShellBin()` (defaults to `/bin/bash`)
- The `Execute()` function at `tui/exec.go:8-17` passes argv/argv/envv without restrictions
- File opening at `tui/actions.go:343` uses `exec.Command(openBinary, selectedFile.GetPath())` where `openBinary` is `xdg-open`/`open`/`explorer` based on OS

Shell spawning is enabled by default with no sandboxing (no namespace, no seccomp, no cgroups).

### 3. How are user inputs validated?

**Minimal validation.** Path inputs are passed through ignore pattern matching via regex (`internal/common/ignore.go:16-37`). The ignore system allows:
- Exact path ignores: `/proc`, `/dev`, `/sys`, `/run` by default (`cmd/gdu/main.go:59`)
- Regex patterns via `--ignore-dirs-pattern`
- File-based ignore lists via `--ignore-from`
- File type filters by extension (`internal/common/ignore.go:136-184`)

No path traversal attack prevention (e.g., `../../etc/passwd`) was found. No canonicalization before comparison.

### 4. Are trust boundaries explicit?

**No.** There are no explicit trust boundary markers. The TUI code differentiates between "normal" and "archive" contexts (`tui/actions.go:425-434`), disabling shell/delete/view when inside archives (`tui/keys.go:186,245-259`), but this is not a security boundary—it is a functional constraint.

## Architectural Decisions

- **Flag-based access control**: Security features (`NoDelete`, `NoViewFile`, `NoSpawnShell`) are boolean flags set via command-line options (`cmd/gdu/main.go:100-102`)
- **Default-allow shell access**: Shell spawning is enabled by default; users must explicitly opt out with `--no-spawn-shell`
- **No privilege separation**: All operations run in the same process context
- **Config via YAML files**: Settings are loaded from `/etc/gdu.yaml` and `~/.gdu.yaml`, parsed into the `Flags` struct via unmarshaling (`cmd/gdu/main.go:119-144`)

## Notable Patterns

- **Signal handling**: Graceful shutdown via signal notification (`tui/tui.go:316-338`) — receives SIGHUP, SIGINT, SIGQUIT, SIGILL, SIGTRAP, SIGABRT, SIGPIPE, SIGTERM
- **Progress updates**: Channel-based progress communication between analyzer and TUI (`pkg/analyze/analyzer.go:10-26`)
- **Concurrent scanning**: Parallel directory processing with `GOMAXPROCS` control (`cmd/gdu/app/app.go:319-328`)
- **Deletion workers**: Background delete queue with configurable worker count (`tui/tui.go:385-392`)

## Tradeoffs

- Shell access enabled by default trades convenience for security; enterprises may not trust this default
- Path validation is minimal — relies on the ignore pattern system rather than canonicalization
- No security documentation or threat model visible in source
- The `--follow-symlinks` flag (`cmd/gdu/main.go:67-69`) could lead to symlink traversal if not carefully ignored

## Failure Modes / Edge Cases

- **Symlink traversal**: If `--follow-symlinks` is used with insufficient ignore paths, the analyzer could traverse into unintended directories
- **Archive escape**: When browsing archives (`--archive-browsing`), shell access is blocked but file view is not checked against the archive boundary
- **Config injection**: The YAML config unmarshaling (`cmd/gdu/main.go:124`) could be affected by malicious config files if permissions are misconfigured
- **Delete without confirmation**: If `askBeforeDelete` is disabled, bulk deletion proceeds without prompts (`tui/tui.go:551`)

## Future Considerations

- Consider making `--no-spawn-shell` the default for enterprise deployments
- Add path canonicalization before ignore pattern matching to prevent traversal attacks
- Document security model and trust boundaries
- Consider adding audit logging for delete operations

## Questions / Gaps

- No evidence of security audit or penetration testing
- No explicit threat model
- No documentation of trust boundaries for users deploying in multi-tenant environments
- The CI/CD workflows reference secrets (`WINGET_TOKEN`, `CODECOV_TOKEN`), but these are GitHub Actions secrets, not application secrets

---

Generated by `study-areas/13-security.md` against `gdu`.