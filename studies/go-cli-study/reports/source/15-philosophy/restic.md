# Repo Analysis: restic

## Engineering Philosophy & Tradeoffs

### Repo Info

| Field | Value |
|-------|-------|
| Name | restic |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/restic` |
| Group | `15-philosophy` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Restic is a backup program that prioritizes **security, simplicity, and data integrity** above all else. It implements a clean layered architecture with `cmd/` for CLI, `internal/` for library code, and a well-defined `Backend` interface enabling multiple storage backends. The project demonstrates strong intentionality in what it accepts and rejects — favoring cryptographic rigor, reproducible builds, and operational safety over feature richness.

## Rating

**8/10** — Strong coherent engineering style with disciplined tradeoffs. The project feels designed, not accumulated. Every complexity decision traces to documented rationale.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Stated principles | README lists Easy, Fast, Verifiable, Secure, Efficient | `README.md:56-85` |
| Architecture | Clear cmd/internal separation, internal packages not importable | `doc.go:5-10` |
| Backend interface | Backend interface defines all storage operations | `internal/backend/backend.go:19-90` |
| Security design | AES-256-CTR + Poly1305-AES encryption, scrypt KDF | `doc/design.rst:309-382` |
| Reproducible builds | Binary releases are reproducible from v0.6.1 | `README.md:86-92` |
| Governance | BDFL model with @fd0 as benevolent dictator | `GOVERNANCE.md:16-17` |
| Linting config | golangci-lint with depguard enforcing layer separation | `.golangci.yml:29-42` |
| Chunker security | Security fix for Rabin fingerprint attack in 0.18.0 | `CHANGELOG.md:149,184-200` |
| Code review culture | CONTRIBUTING emphasizes active code review | `CONTRIBUTING.md:224-238` |
| No plugin system | Deliberate choice to avoid plugin extensibility | `CHANGELOG.md:5287` (implicit in core-only approach) |

## Answers to Protocol Questions

### 1. What philosophy does this repo optimize for?

**Primary: Data security and operational safety.** Restic explicitly optimizes for:

- **Confidentiality and integrity** — AES-256-CTR encryption with Poly1305-AES MAC on every stored item, cache included (`doc/design.rst:309-324`)
- **Verifiability** — "Much more important than backup is restore" (`README.md:72-73`)
- **Operational simplicity** — "Doing backups should be a frictionless process" (`README.md:61-64`)
- **Deduplication and efficiency** — Content-defined chunking via Rabin Fingerprints with random polynomial per repository (`doc/design.rst:695-701`)

The project uses a **BDFL governance model** (`GOVERNANCE.md:6-17`) with @fd0 as singular decision-maker, which enforces coherent vision. The `golangci.yml` enforces architectural layer separation via `depguard` rules preventing `internal/backend` from importing `internal/restic` or `internal/repository` (`.golangci.yml:29-42`).

### 2. What complexity is intentionally accepted?

Restic accepts complexity in these areas:

- **Multiple backend support** — 10+ backend implementations (local, sftp, s3, azure, b2, gs, swift, rest, rclone, mem) each with custom config and transport logic. Evidence: `internal/backend/*/` directories and `cmd/restic/cmd_backup.go:36-77`
- **Cryptographic complexity** — Full encryption stack with scrypt KDF, AES-256-CTR, Poly1305-AES, and a threat model documented across 60+ lines (`doc/design.rst:710-827`)
- **Repository format versioning** — v1 and v2 formats with compression, migration paths, and backward compatibility (`doc/design.rst:831-834`)
- **Parallel operations** — Worker goroutines, packer managers, async blob upload (`internal/repository/repository.go:44-55`)
- **Content-defined chunking** — Rabin fingerprint CDC algorithm with security hardening against polynomial recovery attacks (`CHANGELOG.md:184-200`)

### 3. What complexity is intentionally avoided?

Restic deliberately rejects:

- **Plugin/extension system** — No plugin architecture. All functionality is built-in. This is a stated non-goal inferred from the monolithic `cmd/restic` package structure and the fact that `internal/` packages cannot be imported externally (`doc.go:5-10`)
- **Runtime configuration flexibility** — Compile-time constants for pack sizes (`internal/repository/repository.go:29-31`) rather than dynamic tuning
- **External library dependencies** — Minimal dependencies; uses only stdlib + a small set of well-vetted deps (see `go.mod:11-46`)
- **GUI or TUI** — Pure CLI tool, no interactive UI beyond terminal colors/status (`internal/ui/`)
- **Agent/daemon mode** — Single-invocation model; no background service

## Architectural Decisions

1. **Backend interface abstraction** — All storage operations go through `Backend` interface (`internal/backend/backend.go:19-90`) enabling testability and swappable storage. Backend implementations are in `internal/backend/{backend}/`.

2. **Internal-only packages** — All library code resides in `internal/` and cannot be imported by external programs by Go's import rules (`doc.go:5-10`). This preserves restic as a tool, not a library.

3. **Command grouping** — Commands are grouped into "default" and "advanced" (`cmd/restic/main.go:34-68`) with explicit group IDs, reducing CLI surface complexity for casual users.

4. **No global state in repository** — Repository is constructed with explicit backend and options (`internal/repository/repository.go:125-147`), making it testable and reusable.

5. **Feature flags** — Experimental features gated via `RESTIC_FEATURES` environment variable (`cmd/restic/main.go:169-175`) without recompilation.

## Notable Patterns

- **Structured exit codes** — Different exit codes for different failure modes (1=fatal, 3=incomplete data, 10=no repo, 11=locked, 12=wrong password) in `cmd/restic/main.go:221-239`
- **JSON output mode** — Global `--json` flag affects all command output formatting (`cmd/restic/main.go:137-159`)
- **Password lazy evaluation** — `needsPassword()` function avoids prompting for password unless needed (`cmd/restic/main.go:119-126`)
- **Lock management** — Exclusive and shared locks with 30-minute stale detection (`internal/restic/lock.go`)
- **Async blob saving** — Blob upload workers with async callbacks (`internal/restic/repository.go:178-182`)

## Tradeoffs

| Accepted Tradeoff | Reason |
|-------------------|--------|
| Multiple backend code duplication | Enables native optimized implementations per cloud provider (Azure, B2, GCS, S3, Swift) rather than lowest-common-denominator HTTP wrapper |
| Cryptographic complexity | Necessary for the "untrusted environment" threat model; scrypt + AES-256-CTR + Poly1305 is industry-standard and well-vetted |
| Two repository format versions | Enables progress (compression in v2) while maintaining backward compatibility |
| In-memory index | Performance for large repositories; tradeoff is memory usage which is mitigated by `--max-pack-size` and cache |

## Failure Modes / Edge Cases

- **Key loss = data loss** — No key revocation without re-encryption; documented in threat model (`doc/design.rst:728-730`)
- **Append-only mode vulnerability** — An attacker with append-only access could manipulate forget to delete legitimate snapshots (`doc/design.rst:803-816`)
- **Chunking attack mitigation** — 0.18.0 mitigated polynomial recovery by randomizing chunk-to-pack assignment (`CHANGELOG.md:184-200`)
- **Concurrent write coordination** — File-based locks with 30-minute stale timeout; network partition during write can leave repository in inconsistent state until lock expires

## Future Considerations

- The project shows no signs of becoming a general-purpose library; the `internal/` restriction appears permanent
- Recent versions (0.17+) show gradual addition of JSON output for scripting (`CHANGELOG.md:166`) and improved statistics (`CHANGELOG.md:165`)
- Cold storage support added in 0.18.0 (`CHANGELOG.md:177`) showing willingness to expand backend capabilities when justified

## Questions / Gaps

- **No explicit design document beyond `design.rst`** — No separate ARCHITECTURE.md or PHILOSOPHY.md; the philosophy is inferred from README, design doc, and code structure
- **No formal specification** — Repository format is documented in prose (`doc/design.rst`) rather than machine-readable schema, which could allow drift between docs and implementation
- **Feature flag mechanism is undocumented in user docs** — Only appears in source (`cmd/restic/main.go:169`); users must discover via environment variable

---

Generated by `study-areas/15-philosophy.md` against `restic`.