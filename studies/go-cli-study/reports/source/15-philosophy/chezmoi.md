# Repo Analysis: chezmoi

## Engineering Philosophy & Tradeoffs

### Repo Info

| Field | Value |
|-------|-------|
| Name | chezmoi |
| Path | `repos/chezmoi` |
| Group | `15-philosophy` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

chezmoi is a dotfile manager that optimizes for **simplicity, security, and cross-platform correctness** through disciplined tradeoffs. It uses a single source of truth (one git repo, one branch), filename-encoded metadata, and a clean System abstraction layer. The project explicitly rejects symlink-first paradigms and multiple source directories, choosing instead to generate regular files from templates.

## Rating

**8/10** — Strong coherent engineering style with clear, documented tradeoffs. The architecture demonstrates intentional design with a clean separation between core logic (`internal/chezmoi/`) and commands (`internal/cmd/`), a well-defined System interface enabling debug/dry-run wrappers, and filename-encoded metadata avoiding config file complexity. Some complexity in the source state parsing (1000+ line sourcestate.go) and extensive prefix conventions reflect accepted trade-offs for user-facing simplicity.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Single source of truth | Docs explicitly reject multiple source directories | `assets/chezmoi.io/docs/user-guide/frequently-asked-questions/design.md:215-217` |
| System interface abstraction | `System` interface with `RealSystem`, `DebugSystem`, `DryRunSystem` wrappers | `internal/chezmoi/system.go:25-45` |
| Filename-encoded metadata | Prefix constants defined in `chezmoi.go`: `encryptedPrefix`, `executablePrefix`, etc. | `internal/chezmoi/chezmoi.go:36-58` |
| Encryption abstraction | `Encryption` interface with AGE and GPG implementations | `internal/chezmoi/encryption.go:4-9` |
| Cross-platform path handling | `AbsPath` and `RelPath` type separation | `internal/chezmoi/abspath.go` |
| Script execution | `RunScriptOptions` with `Interpreter` and `Condition` | `internal/chezmoi/system.go:17-21` |
| Persistent state | Two-level key-value store with `PersistentState` interface | `internal/chezmoi/system.go:134-140` |
| Template execution | Uses Sprig library with `missingkey=error` default | `internal/chezmoi/chezmoi.go:28-29` |
| Binary distribution | Single statically-linked binary, no dependencies | `assets/chezmoi.io/docs/why-use-chezmoi.md:149-154` |
| Architecture documentation | Developer guide architecture doc | `assets/chezmoi.io/docs/developer-guide/architecture.md` |

## Answers to Protocol Questions

### 1. What philosophy does this repo optimize for?

**Operational simplicity with correctness guarantees.** chezmoi optimizes for:
- **Single source of truth**: One git repo, one branch, one command (`chezmoi apply`) works everywhere (`assets/chezmoi.io/docs/user-guide/frequently-asked-questions/design.md:215-217`)
- **Idempotency**: All operations can be run multiple times safely (`internal/chezmoi/system.go:45-46` - "idempotent commands")
- **Cross-platform correctness**: Case-sensitive internally, no case-preserving hacks, explicit path type separation (`AbsPath` vs `RelPath` vs `SourceRelPath`) (`internal/chezmoi/abspath.go:1-40`, `internal/chezmoi/path_unix.go:1-16`)
- **Security by default**: Private files with `0o600`, secrets in password managers or encrypted, never stored in plain text
- **User control**: Dry-run (`--dry-run`), diff mode, verify mode all available before applying changes
- **Simplicity of installation**: Single static binary with no dependencies (`assets/chezmoi.io/docs/why-use-chezmoi.md:149`)

### 2. What complexity is intentionally accepted?

- **Filename-encoded metadata**: Long prefixes like `encrypted_`, `executable_`, `private_`, `readonly_`, `dot_`, `run_once_`, `run_onchange_` — complexity in naming accepted to avoid config file proliferation (`internal/chezmoi/chezmoi.go:36-58`)
- **Template system**: Full Go text/template with Sprig functions — complexity accepted to handle machine-to-machine differences in a single file (`internal/chezmoi/template.go:1-50`)
- **Large `sourcestate.go`**: At 1000+ lines, the source state parsing is complex but encapsulates all the prefix parsing logic in one place (`internal/chezmoi/sourcestate.go:1-100`)
- **Encryption abstraction layer**: `Encryption` interface with multiple implementations (AGE, GPG, no encryption, debug) adds indirection but enables testing and flexibility (`internal/chezmoi/encryption.go:4-9`)
- **System wrapper pattern**: Multiple System implementations (Real, Debug, DryRun, Dump, ErrorOnWrite, ReadOnly) add code but enable comprehensive testing and debugging

### 3. What complexity is intentionally avoided?

- **Symlink-first paradigm**: Explicitly rejected GNU Stow-style symlink approach — "chezmoi generates the dotfile as a regular file" rather than symlink indirection (`assets/chezmoi.io/docs/user-guide/frequently-asked-questions/design.md:44-56`)
- **Multiple source directories**: Rejected because "the mapping between source and target states is no longer bidirectional nor unambiguous" (`assets/chezmoi.io/docs/user-guide/frequently-asked-questions/design.md:166-178`)
- **Per-file config metadata**: Rejected in favor of filename prefixes — "changes to any file would require updates to the common configuration file" (`assets/chezmoi.io/docs/user-guide/frequently-asked-questions/design.md:133-138`)
- **Whole-system configuration tools**: Explicitly positioned as simpler than Ansible/Chef/Puppet (`assets/chezmoi.io/docs/user-guide/frequently-asked-questions/design.md:293-311`)
- **External runtime dependencies**: Single static binary, no Python/Ruby/Perl needed (`assets/chezmoi.io/docs/why-use-chezmoi.md:145-148`)

## Architectural Decisions

1. **Source → Target → Actual state model**: Clean separation between what user wants (source), what should be on disk (target), and what is actually on disk (actual). This enables precise diffing and minimal apply operations (`assets/chezmoi.io/docs/developer-guide/architecture.md:86-96`)

2. **System interface abstraction**: All OS interactions go through `System` interface, enabling wrappers for debug logging, dry-run mode, and testing. The `RealSystem` wraps `github.com/twpayne/go-vfs/v5` (`internal/chezmoi/system.go:25-45`, `internal/chezmoi/realsystem.go:1-50`)

3. **Filename prefix encoding**: Metadata (encrypted, executable, private, template, etc.) encoded in filename prefixes rather than sidecar config files. This ensures each file is self-contained and changes are isolated (`internal/chezmoi/chezmoi.go:36-82`)

4. **Persistent state with SHA256 tracking**: Uses bbolt database to track what was previously applied, detecting third-party changes by comparing stored SHA256 against actual file contents (`internal/chezmoi/entrystate.go:1-50`, `internal/chezmoi/boltpersistentstate.go`)

5. **Command structure**: All commands are methods on a large `Config` struct that holds all configuration. Commands grouped by category (daily, advanced, encryption, etc.) with explicit group IDs for help text organization (`internal/cmd/config.go:70-90`)

## Notable Patterns

- **Decorator/wrapper pattern** for System: `DebugSystem`, `DryRunSystem`, `ReadOnlySystem`, `ErrorOnWriteSystem` all wrap a base system
- **Lazy initialization**: Many components use `sync.Once` or similar patterns for expensive operations
- **Type-safe path handling**: Separate types for `AbsPath`, `RelPath`, `SourceRelPath` prevent path concatenation errors
- **TestScript framework**: End-to-end tests use `github.com/rogpeppe/go-internal/testscript` with `.txtar` files (`internal/cmd/testdata/scripts/`)

## Tradeoffs

| Accepted | Rejected |
|----------|----------|
| Verbose filenames with prefixes | Per-file config that requires reading before understanding |
| Complex template system | Multiple source directories with merge ambiguity |
| Single binary with embedded assets | Plugin system requiring external installations |
| Filename encoding limits (can't have `encrypted_` in actual filename) | Symlinks that complicate encryption/executable handling |
| Large Config struct (3400+ lines) | Configuration file per application |

## Failure Modes / Edge Cases

- **Template errors**: If template execution fails, apply fails — no partial application
- **Third-party changes**: If a file is modified externally after chezmoi apply, chezmoi detects it but user must resolve manually (or use `--force`)
- **Encryption key loss**: If age private key is lost, encrypted files are unrecoverable (by design)
- **Path conflicts**: `.chezmoiroot` file allows directory redirection but adds complexity
- **Script interpreter availability**: Scripts requiring specific interpreters fail if interpreter not installed

## Future Considerations

- Symlink mode exists but limited: cannot symlink encrypted, executable, private, or templated files (`assets/chezmoi.io/docs/user-guide/frequently-asked-questions/design.md:76-99`)
- The issue tracker shows interest in automation for symlink mode (issue #886)
- Externals feature uses git submodules concept but implemented differently

## Questions / Gaps

- No evidence found of formal API stability guarantees — no API versioning doc
- The `concurrentWalkSourceDir` function shows parallel directory walking, but no evidence of parallel apply (would be useful for large source states)
- Plugin system is a "bit of a hack" (noted in `internal/cmd/cmd.go:223-249`) — not a first-class extension mechanism
- No evidence of plugin API stability — plugins are just executables named `chezmoi-*`

---

Generated by `study-areas/15-philosophy.md` against `chezmoi`.