# Source Analysis: cli

## Extensibility & Plugin Architecture

### Source Info

| Field | Value |
|-------|-------|
| Name | cli |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/cli` |
| Language / Stack | Go (github.com/cli/cli/v2) |
| Analyzed | 2026-05-20 |

## Summary

The `cli` source is the **GitHub CLI (`gh`)**, a command-line tool for GitHub. It has two distinct extension systems:

1. **Shell Extensions** (`gh extension`) — exec-based subprocess extensions that wrap arbitrary binaries. No plugin API, no lifecycle hooks, no isolation beyond OS process boundaries. Extensions are discovered from a flat directory scan and dispatched via `exec.Command`.

2. **Agent Skills** (`gh skill`) — a declarative skill installation system for AI agents (GitHub Copilot, Claude Code, Cursor, etc.). Skills are markdown files discovered from GitHub repositories using the agentskills.io convention. Skills are installed to agent-specific directories and tracked in a lock file. No runtime execution hook, no SDK, no isolation beyond file copy.

Neither system provides a proper plugin API, lifecycle hooks, permission system, or process isolation. The extension model is "run any binary" with directory-based discovery.

## Rating

**3 / 10** — Minimal implementation with significant gaps

Both extension systems lack: runtime lifecycle hooks (init/start/stop/health), plugin API versioning, isolation beyond subprocess/filesystem, and debugging/observability for plugin execution. The "extension" interface in `pkg/extensions/extension.go:18` is a read-only metadata interface with no capability to contribute behavior.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Extension interface | `Extension` interface with `Name()`, `Path()`, `URL()`, `CurrentVersion()`, `IsPinned()`, `IsBinary()`, `IsLocal()`, `Owner()` | `pkg/extensions/extension.go:18-29` |
| Extension manager interface | `ExtensionManager` interface: `List()`, `Install()`, `InstallLocal()`, `Upgrade()`, `Remove()`, `Dispatch()`, `Create()`, `EnableDryRunMode()` | `pkg/extensions/extension.go:32-42` |
| Extension discovery | `Manager.list()` scans `$DATA_DIR/extensions/gh-*` directories | `pkg/cmd/extension/manager.go:145-194` |
| Extension dispatch | `Manager.Dispatch()` runs extension binary via `exec.Command.Run()` | `pkg/cmd/extension/manager.go:91-134` |
| Extension registration | `NewCmdExtension()` wraps extension in cobra command with PreRun (update check), RunE (dispatch), PostRun (update notice) | `pkg/cmd/root/extension.go:22-92` |
| Extension kinds | `GitKind`, `BinaryKind`, `LocalKind` — determined by presence of `manifest.yml` or symlink | `pkg/cmd/extension/extension.go:19-25` |
| Binary manifest | `binManifest` struct: `Owner`, `Name`, `Host`, `Tag`, `IsPinned`, `Path` | `pkg/cmd/extension/manager.go:238-246` |
| Official extension registry | `OfficialExtensions` list with `gh-aw` and `gh-stack` | `pkg/extensions/official.go:25-28` |
| Official extension check | `IsOfficial()` checks name + owner (case-insensitive) against registry | `pkg/extensions/official.go:43-53` |
| Skills command | `NewCmdSkills()` registers install, preview, publish, search, update subcommands | `pkg/cmd/skills/skills.go:16-57` |
| Agent registry | `Agents` slice with 40+ agents (GitHub Copilot, Claude Code, Cursor, etc.) | `internal/skills/registry/registry.go:45-319` |
| Skill discovery | `DiscoverSkillsWithOptions()` traverses repo tree looking for SKILL.md files | `internal/skills/discovery/discovery.go:531-598` |
| Skill conventions | Matches `skills/*/SKILL.md`, `skills/{ns}/*/SKILL.md`, `plugins/{ns}/skills/*/SKILL.md`, root `*/SKILL.md`, hidden-dir `.claude/skills/*/SKILL.md` | `internal/skills/discovery/discovery.go:393-499` |
| Skill installation | `Install()` fetches blobs and writes to target directory with safepaths protection | `internal/skills/installer/installer.go:251-305` |
| Lockfile for skills | `RecordInstall()` uses file-based lock to record skill source with version pinning | `internal/skills/lockfile/lockfile.go:97-137` |
| Skill version resolution | `ResolveRef()` prioritizes: explicit version → latest release tag → default branch | `internal/skills/discovery/discovery.go:201-221` |
| Skills support multiple agents | `Install()` accepts `AgentHost` and writes to per-agent directories | `internal/skills/installer/installer.go:56-142` |
| No lifecycle hooks | Extension `RunE` directly calls `em.Dispatch()` with no pre/post lifecycle | `pkg/cmd/root/extension.go:43-52` |
| No plugin API contract | Extension `Extension` interface is read-only metadata; no capability interface | `pkg/extensions/extension.go:18-29` |
| No versioned API | No `ExtensionAPI` version or contract versioning mechanism | N/A |
| Telemetry disabled for extensions | `DisableTelemetry()` called for non-official extensions | `pkg/cmd/root/extension.go:87-89` |

## Answers to Dimension Questions

### 1. How are plugins discovered, loaded, and verified?

**Discovery:** `Manager.list()` at `pkg/cmd/extension/manager.go:145-194` scans `$DATA_DIR/extensions/` (typically `~/.config/gh/extensions/` or similar) for entries prefixed with `gh-`. Directories containing `manifest.yml` are `BinaryKind`; git-cloned directories are `GitKind`; symlinks are `LocalKind`. No registry, no signature verification.

**Loading:** `Manager.Dispatch()` at `pkg/cmd/extension/manager.go:91-134` finds the extension by name, then runs the executable directly via `exec.Command(exe, forwardArgs...).Run()`. No loading API, no initialization hook.

**Verification:** No verification. Binary extensions check for platform compatibility during install (`possibleDists()` at `manager.go:794-842`), but no cryptographic signature or hash verification. Local symlink extensions have no verification at all.

### 2. What extension points exist for custom business logic?

**No structured extension points.** Extensions are bare executables that receive command-line arguments and operate independently. There are no:
- Hook points in auth flows
- Hook points in data processing
- Workflow step extensions
- Custom business logic registration API

The only way to extend behavior is to write a standalone executable that wraps `gh` or calls GitHub APIs directly.

**Skills** (`gh skill`) are not executable logic — they are markdown files installed to agent-specific directories (e.g., `.claude/skills/`, `.copilot/skills/`). They are consumed by external AI agents, not by `gh` itself.

### 3. How does the system prevent a misbehaving plugin from bringing down the host?

**No isolation mechanism.** Extensions run as child processes via `exec.Command.Run()` (`manager.go:133`). A crashing or looping extension process exits and returns an error to the CLI, but there is:
- No resource limits (CPU, memory, file descriptors)
- No timeout on extension execution
- No goroutine-level isolation (process boundary only)
- No watchdog or restart policy

The only mitigation is that extension failure returns an error and the CLI exits with a non-zero code. The host process itself is protected by process boundaries, but the user experience is abrupt failure with no graceful degradation.

### 4. How are plugin APIs versioned to prevent breakage on upgrade?

**No plugin API versioning.** The `Extension` interface (`pkg/extensions/extension.go:18-29`) is a read-only metadata interface — it reports `Name()`, `Path()`, `Version()`, etc., but defines no capability or version contract that a plugin must implement. There is no `ExtensionAPI` version, no capability negotiation, and no compatibility shim.

Extension authors have no stable interface to implement beyond being executables that accept arguments. When `gh` changes how it invokes extensions, there is no migration path or version compatibility guarantee.

The `Skills` system has no runtime API at all — skills are static markdown files.

### 5. What debugging and observability exists for plugin execution?

**Minimal.** Only:
- `GH_DEBUG=api` for HTTP debugging
- `GH_DEBUG=hooks` for webhook debugging (in specific contexts)
- Extension update check failures are logged to stderr when `DEBUG` is enabled (`pkg/cmd/root/extension.go:37-39`)
- No per-extension execution tracing, no timing metrics, no structured logs for extension lifecycle

Extensions are black boxes. If an extension hangs, there is no diagnostic mechanism within `gh` to identify it or terminate it.

## Architectural Decisions

1. **Subprocess over in-process plugin model**: Extensions are OS processes invoked via `exec.Command`, not loaded as libraries or plugins. This provides process isolation at the cost of serialization overhead and no shared-memory communication.

2. **Directory-based discovery with manifest files**: Binary extensions are identified by `manifest.yml` in their directory. This avoids requiring extensions to self-report their type via executable probing, but means the manifest format is tightly coupled to `gh` internals.

3. **Skills are files, not executables**: Agent skills are markdown files that AI agents read and interpret. `gh` only installs them to filesystem locations; it does not execute, validate, or interpret them. This cleanly separates `gh` (a GitHub API client) from the AI agent runtime.

4. **Flat namespace for extensions**: Extensions must have a unique name across all installed extensions. There is no scoping, no namespacing by owner, and no conflict resolution beyond the installation step rejecting duplicates.

5. **Official extension stub commands**: When a user invokes `gh aw` and `github/gh-aw` is not installed, `gh` shows a stub suggesting installation. This allows GitHub to own the `gh aw` command name without shipping the extension in the `gh` binary.

## Notable Patterns

- **ExtTemplateType constants** for scaffolding: `GitTemplateType`, `GoBinTemplateType`, `OtherBinTemplateType` (`pkg/extensions/extension.go:9-15`) — controls which template is used when creating new extensions via `gh extension create`.

- **Dispatch passthrough**: `Manager.Dispatch()` passes all args directly to the extension binary with stdin/stdout/stderr redirected. This is transparent to the extension author but means `gh` has no visibility into or control over the extension's behavior once launched.

- **Update check in PreRun**: Extension commands check for updates asynchronously in a goroutine launched in `PreRun`, with the result consumed in `PostRun` (`pkg/cmd/root/extension.go:34-76`). This avoids delaying command execution for the update check, but means update notices are best-effort and non-blocking.

- **Skill provenance tracking**: Skills store source metadata (`github-repo`, `github-ref`) in frontmatter (`internal/skills/frontmatter/frontmatter.go`). The install system detects re-published skills and can redirect to the upstream source (`install.go:1221-1297`).

- **File-based lock for concurrent installs**: The skills lockfile uses `flock.TryLock()` with 30 retries at 100ms intervals (`lockfile.go:151-177`) to handle concurrent installation from multiple processes.

- **safepaths for path traversal protection**: Both local and remote skill installations use `safepaths.ParseAbsolute()` + `safeSkillDir.Join()` to prevent path traversal attacks when extracting skill files to disk (`installer.go:195-226`).

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| Subprocess extension model | Simple to implement and debug; no shared memory, no complex lifecycle management; extensions can use any language |
| No plugin API contract | Extensions have no stable interface to target; `gh` can change invocation behavior with no warning |
| Skills as markdown files | Decouples `gh` from AI agent runtime; `gh` cannot enforce skill quality or validate behavior |
| Directory-based extension discovery | No registration, no signature, no capability declaration — all extensions look the same to the system |
| No lifecycle hooks | Extensions cannot participate in auth, data processing, or workflow events; they are pure passthrough commands |
| Agent registry as static list | Adding new agents requires code changes in `internal/skills/registry/registry.go`; no plugin registry for agents |

## Failure Modes / Edge Cases

1. **Missing executable**: `Manager.Dispatch()` returns error if extension binary not found (`manager.go:109-111`). Error is propagated but there is no retry or fallback mechanism.

2. **Extension panic/crash**: `externalCmd.Run()` returns an `*exec.ExitError` which is wrapped in `ExternalCommandExitError` (`pkg/cmd/root/extension.go:18-20,47-49`). The CLI exits with the extension's exit code. No panic recovery, no graceful degradation.

3. **Symlink to deleted file**: `Manager.list()` at line 176 checks `isSymlink(f.Type())` but if the symlink target no longer exists, `filepath.Join(dir, f.Name(), f.Name())` may produce a non-existent path. `Dispatch()` at line 106 then uses this path directly in `exec.Command`.

4. **Manifest.yaml corruption**: `loadManifest()` at `pkg/cmd/extension/extension.go:224-237` silently returns empty `binManifest{}` on parse failure, causing version and owner to be empty strings.

5. **TreeTooLarge during skill discovery**: Large repositories hit the GitHub API tree truncation limit. `DiscoverSkillsWithOptions()` returns `TreeTooLargeError` (`discovery.go:541`). The user sees an error suggesting path-based install instead.

6. **Concurrent lockfile writes**: `RecordInstall()` retries 30 times with 100ms delay to acquire `flock`. If the lock cannot be acquired after 30 attempts (3 seconds), the install continues without lockfile record and a warning is returned (`installer.go:79-81`).

7. **Extension name collision**: `install.go:837-843` detects name collisions among selected skills before installation, but does not prevent a separately-installed skill from colliding with a new one post-install.

## Future Considerations

- A proper plugin API would define a versioned `Plugin` interface with `Init()`, `Execute()`, `Health()` lifecycle methods, and a capability declaration map.
- Extension lifecycle hooks (init, start, stop) would allow extensions to initialize state, register for events, and clean up resources.
- Process-level isolation (separate uid, reduced privileges, memory limits) would prevent malicious extensions from affecting the host.
- Structured logging and tracing for extension execution would enable debugging and performance analysis.
- The agent skills system could benefit from a validation step that parses SKILL.md and checks for known prompt injection patterns.

## Questions / Gaps

| Question | Answer |
|----------|--------|
| Is there a plugin API? | **No** — extensions are bare executables with no Go interface to implement |
| Are there lifecycle hooks? | **No** — no init/start/stop/health hooks for extensions |
| Is there process isolation? | **Partial** — process boundary exists but no resource limits, no sandbox |
| Is there plugin API versioning? | **No** — no versioned contract for extensions to target |
| Is there permission system? | **No** — extensions run with full `gh` permissions (OAuth tokens, config access) |
| Is there debugging for plugin execution? | **No** — no per-extension tracing, timing, or structured logs |
| Are there hook points in critical paths? | **No** — no hooks in auth, data processing, or workflow steps |
| Are there first-party plugin examples? | **Yes** — `gh-aw` (GitHub workflow automation) and `gh-stack` (stack management) are official GitHub extensions |

---

Generated by `dimensions/13-extensibility-plugin-architecture.md` against `cli`.