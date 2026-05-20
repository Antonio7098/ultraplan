# Source Analysis: victoriametrics

## Governance & Evolution Strategy

### Source Info

| Field | Value |
|-------|-------|
| Name | victoriametrics |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/victoriametrics` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

VictoriaMetrics is a time-series database written in Go, released under Apache 2.0. Governance and evolution are primarily document-driven via a structured CHANGELOG with yearly segmentation, a formal Release Guide with RC-to-final two-step process, and an Enterprise LTS policy providing 12-month support windows. Architectural decisions are not formalized as ADRs but are implicitly captured in commit history, changelog entries, and the CONTRIBUTING.md's KISS principle guidelines. Deprecation is communicated via code comments and changelog warnings, with flag deprecation achieved through Go's flag system (deprecated flags logged and still accepted). Schema evolution for the storage layer relies on partition-based rolling with automatic cleanup; indexDB rotation is time-based with a configurable timezone offset. No formal semantic versioning is declared in code (version injected via `-ldflags`). No evidence of feature flags, canary releases, or blue-green deployment patterns in the codebase itself.

## Rating

**6/10** — Good implementation with gaps

VictoriaMetrics demonstrates solid release engineering practices (RC process, LTS support, changelog discipline) and clear deprecation signals in code. However, formal ADR documentation is absent, semantic versioning is not enforced in code, schema evolution strategies lack explicit migration tooling, and rollout patterns (blue-green, canary) are not implemented at the application level — these are left to operators/deployers.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Changelog structure | Yearly changelog files (`CHANGELOG_2025.md`, `CHANGELOG_2026.md`) with tip section for unreleased changes | `docs/victoriametrics/changelog/CHANGELOG.md:27` |
| Release process | Two-step RC→final release documented in Release-Guide.md | `docs/victoriametrics/Release-Guide.md:27-58` |
| LTS policy | Enterprise LTS lines maintained for 12 months; new lines every 6 months | `docs/victoriametrics/LTS-releases.md:17-19` |
| Deprecation flag | Deprecated flag still registered but does nothing; warning logged | `app/vmstorage/main.go:42` |
| Deprecation flag | `-remoteWrite.retryMaxTime` deprecated in favor of `-remoteWrite.retryMaxInterval` | `app/vmagent/remotewrite/remotewrite.go:290` |
| JWT deprecation | Multiple JWT fields deprecated for compatibility; code comments explicitly state "Deprecated" | `lib/jwt/jwt.go:385-399` |
| Version build info | Version injected via `-ldflags`; `ShortVersion()` strips build metadata via regex | `lib/buildinfo/version.go:13-20` |
| IndexDB rotation | `legacyNextRetentionDeadlineSeconds` calculates rotation time per retention period | `lib/storage/storage_legacy.go:210-224` |
| Storage migration cleanup | Post-upgrade cleanup of `txn` and `tmp` dirs left from versions before v1.90.0 | `lib/storage/partition.go:1941-1944` |
| Retention enforcement | `retentionWatcher()` drops partitions older than retention period | `lib/storage/table.go:428-475` |
| Snapshots for backup | `MustCreateSnapshot` creates consistent point-in-time snapshot of all storage layers | `lib/storage/table.go:136-165` |
| Changelog per-year files | `CHANGELOG_2020.md` through `CHANGELOG_2026.md` provide versioned history | `docs/victoriametrics/changelog/` |
| Contributing guidelines | PR checklist requires changelog entry, tests, docs update, signed commits | `docs/victoriametrics/CONTRIBUTING.md:56-86` |
| KISS principle | Explicit rejection of complex distributed patterns (gossip, Paxos, auto-reshuffling) | `docs/victoriametrics/CONTRIBUTING.md:104-128` |
| Backward compat flag | `-snapshotCreateTimeout` deprecated but still accepted (no-op) | `app/vmstorage/main.go:42` |
| Remote write version header | `X-VictoriaMetrics-Remote-Write-Version: 1` and `X-Prometheus-Remote-Write-Version: 0.1.0` sent | `app/vmagent/remotewrite/client.go:398-401` |
| InfluxDB version header | `X-Influxdb-Version: 1.8.0` returned for compatibility | `app/vminsert/main.go:394` |
| Prometheus API version | Hardcoded `"version":"2.24.0"` returned at `/api/v1/status/config` for Grafana compatibility | `app/vmselect/main.go:602` |

## Answers to Dimension Questions

### 1. How are architectural decisions documented and revisited?

No formal ADR (Architecture Decision Record) system was found. Decisions are implicitly documented through:
- **CONTRIBUTING.md** (`docs/victoriametrics/CONTRIBUTING.md:104-128`) encodes the KISS principle as architectural philosophy — explicitly rejecting gossip protocols, Paxos, automatic reshuffling, and auto-discovery.
- **Changelog entries** capture what changed and why, but not the alternative considered.
- **Commit history and PR descriptions** serve as the decision log, but there is no structured ADR format.
- The **Release-Guide.md** (`docs/victoriametrics/Release-Guide.md:1-59`) documents the release process but not design decisions.

**No evidence found** of a dedicated ADR directory or lightweight ADR tooling (e.g., adr-tools, MADR).

### 2. What is the deprecation policy for APIs and how is it communicated?

Deprecation is handled ad hoc through:
- **Flag deprecation**: Deprecated flags remain registered but become no-ops, with a warning logged at startup. Example: `-snapshotCreateTimeout` at `app/vmstorage/main.go:42`, `-remoteWrite.retryMaxTime` at `app/vmagent/remotewrite/remotewrite.go:290`.
- **Code comments**: Fields are marked `// Deprecated` in comments (e.g., `lib/jwt/jwt.go:385-399`).
- **Changelog**: Breaking or significant changes are mentioned in the CHANGELOG, but there is no standard deprecation notice format.
- **Documentation**: Deprecation of configuration options is documented inline in flag descriptions.

No formal deprecation policy document was found. The COMMUNITY does not have a standard time window for deprecated API support.

### 3. How does the system evolve its data schema without downtime?

Schema evolution relies on:
- **Partition-based storage**: Data is organized into monthly partitions (`lib/storage/table.go:554`). New partitions are created automatically as time advances.
- **IndexDB rotation**: The legacy indexDB rotates on a configurable schedule (`lib/storage/storage_legacy.go:210`). The rotation uses a timezone offset (`-retentionTimezoneOffset` flag at `app/vmstorage/main.go:53-55`) to shift rotation time.
- **Pre-fill strategy**: Next partition's indexDB is pre-populated before rotation to avoid query gaps (`lib/storage/storage.go:2160-2165`).
- **Retention-based cleanup**: Old partitions are automatically dropped by `retentionWatcher()` (`lib/storage/table.go:428-475`).
- **Snapshots**: `MustCreateSnapshot` (`lib/storage/table.go:136-165`) provides point-in-time consistency for backups without downtime.

No explicit schema migration scripts or zero-downtime migration tooling was found. The system relies on append-only partition semantics to avoid in-place schema changes.

### 4. How are breaking changes introduced and migrated?

- **Breaking changes are rare** by design — the KISS principle (`CONTRIBUTING.md:104`) favors simplicity and avoiding features that require migrations.
- **Upgrades from pre-v1.90.0**: Special cleanup code removes `txn` and `tmp` directories left after upgrade (`lib/storage/partition.go:1941-1944`).
- **Version headers**: Clients can probe protocol version via headers (`X-VictoriaMetrics-Remote-Write-Version`, `X-Prometheus-Remote-Write-Version` at `app/vmagent/remotewrite/client.go:398-401`).
- **No formal migration guides** were found in the repository; users are directed to CHANGELOG and upgrade instructions in docs.

Breaking changes are communicated through changelog entries referencing the version they were introduced (e.g., "Regression was introduced in v1.130.0" at `docs/victoriametrics/changelog/CHANGELOG.md:41`).

### 5. What rollout patterns are used to limit blast radius of changes?

**No evidence found** of:
- Feature flags (no `featureFlag` or `feature.*flag` patterns in codebase)
- Canary releases (no canary-specific code or configuration)
- Blue-green deployment (no traffic splitting or routing logic for zero-downtime switchovers)
- Rollback automation (no `rollback` or `Rollback` patterns found in Go code)

Rollout patterns are delegated entirely to the operator:
- **Release candidates**: The Release-Guide (`docs/victoriametrics/Release-Guide.md:31-45`) describes an RC phase deployed to a sandbox before final release, which is a form of manual canary.
- **LTS lines**: Enterprise users can stay on a supported LTS line to limit exposure to bleeding-edge changes.
- **Backups via snapshots**: `vmbackup`/`vmrestore` provide data recovery options, but not automated rollback.

Blast radius mitigation is primarily achieved through the RC→final release process and LTS support windows, not through application-level rollout controls.

## Architectural Decisions

1. **No formal ADR system** — Design decisions are captured in commit messages, CHANGELOG entries, and CONTRIBUTING.md guidelines rather than structured ADR documents.
2. **KISS-first architecture** — Explicit rejection of complex distributed patterns (gossip, Paxos, auto-reshuffling) as documented in CONTRIBUTING.md:120-128. This simplifies reasoning about system evolution.
3. **Append-only partition storage** — Schema evolution is avoided by never modifying stored data in place; new data goes to new partitions, old data is retained or deleted based on retention policy.
4. **IndexDB rotation with timezone control** — Rotation schedule is configurable via `-retentionTimezoneOffset`, allowing operators to align rotation with low-traffic periods without code changes.
5. **Deprecated flags as no-ops** — Deprecated configuration flags remain registered but become functional no-ops, allowing clients to upgrade without immediate configuration changes while still warning about usage.

## Notable Patterns

1. **Yearly changelog segmentation** — `CHANGELOG_2020.md` through `CHANGELOG_2026.md` provide maintainable historical lookup; current tip changes tracked separately in `CHANGELOG.md`.
2. **Two-step release process** — RC deployed to sandbox for real-environment validation before final release (`Release-Guide.md:31-45`).
3. **LTS lines with 6-month cadence** — New LTS line every 6 months, each supported for 12 months, giving 6-month migration windows (`LTS-releases.md:17-19`).
4. **Enterprise-only LTS** — Long-term support releases are an Enterprise feature, with bugfixes also available in latest release for non-enterprise users.
5. **RetentionWatcher background process** — Dedicated goroutine monitors and drops outdated partitions (`lib/storage/table.go:428`).
6. **Pre-fill before indexDB rotation** — Next partition's indexDB pre-populated in the hour before rotation to prevent query gaps during transition.
7. **Deprecated flag warning on init** — Deprecated flags log a warning at startup but continue to function as no-ops, avoiding breaking configuration changes.
8. **Version headers for protocol compatibility** — `X-VictoriaMetrics-Remote-Write-Version` and `X-Prometheus-Remote-Write-Version` allow clients to probe supported protocol levels.

## Tradeoffs

1. **No formal ADR tooling** vs. **fast decision velocity** — Avoiding formal ADR process lowers friction for contributions but makes historical context harder to retrieve.
2. **Append-only partitions** vs. **schema change complexity** — Never modifying stored data avoids migration complexity but means schema changes require compatibility layers indefinitely.
3. **Enterprise LTS model** vs. **community fragmentation** — LTS creates a two-tier user base; enterprise users have supported upgrade paths while community users ride the latest.
4. **Flag deprecation as no-ops** vs. **configuration entropy** — Keeping deprecated flags as no-ops avoids breaking configurations but can mask missing functionality.
5. **No application-level rollout controls** vs. **operational simplicity** — Delegating rollout to operators keeps the application simple but puts blast radius control in operator hands, not developers.

## Failure Modes / Edge Cases

1. **Orphaned `txn`/`tmp` dirs after unclean upgrade** — Pre-v1.90.0 upgrades could leave `txn` and `tmp` directories that cause issues; cleanup code at `lib/storage/partition.go:1941-1944` handles this.
2. **Missing partition on disk** — If a partition listed in `partsFile` is missing on disk, the system panics with a clear message directing user to restore from backup (`lib/storage/partition.go:1956-1959`).
3. **Stale snapshots not deleted** — `snapshotsMaxAge` auto-deletes old snapshots, but if backup process takes longer than expected, snapshot could be deleted mid-backup (`app/vmstorage/main.go:41`).
4. **Churn rate exceeds cardinality limits** — `maxHourlySeries` and `maxDailySeries` limits drop excess series, which could silently lose data if misconfigured.
5. **Version regression in Grafana compatibility** — Hardcoded Prometheus version `"2.24.0"` at `app/vmselect/main.go:602` could break if newer Grafana features depend on a newer API version.
6. **IndexDB rotation timing** — If system clock or timezone offset is misconfigured, rotation could occur during peak traffic, impacting query performance.

## Future Considerations

1. **ADR tooling adoption** — Consider introducing lightweight ADR process (e.g., Markdown-based ADR under `docs/adr/`) to capture architectural decisions with context and alternatives considered.
2. **Formal deprecation policy** — Document minimum support window for deprecated APIs, e.g., "deprecated flags supported for at least 2 major releases."
3. **Migration tooling** — For schema changes that require it (e.g., metric name renormalization), provide migration scripts or documentation.
4. **Feature flag framework** — If experimental features are added, a lightweight flag system would allow gradual rollout with quick rollback.
5. **Canary/blue-green documentation** — Document recommended deployment patterns for operators since the application has no built-in rollout controls.
6. **Semantic versioning commitment** — Formally adopt semver in code (currently version is injected via `-ldflags` with no enforcement), making upgrade paths clearer for downstream consumers.

## Questions / Gaps

1. **No ADR directory found** — Searched for `ADR*`, `*decision*`, `*architecture*` patterns in docs; nothing found. Is there a decision log elsewhere?
2. **Deprecation window not specified** — How long are deprecated flags guaranteed to work? No policy document found.
3. **Schema migration path unclear** — If a breaking schema change were needed, what is the documented migration path? Append-only design avoids this but may not scale to all cases.
4. **No feature flag infrastructure** — How would the project handle experimental features that need gradual rollout?
5. **Rollback automation absent** — If a bad release is deployed, what is the recommended rollback path? No automated rollback mechanism in code.
6. **LTS backport process not in repo** — The CONTRIBUTING.md mentions cherry-picking to LTS branches but the criteria and process are not documented in the repository.