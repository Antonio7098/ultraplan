# Source Analysis: nats-server

## Governance & Evolution Strategy

### Source Info

| Field | Value |
|-------|-------|
| Name | nats-server |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/nats-server` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

The nats-server project demonstrates a mature governance and evolution strategy with semantic versioning, formal ADR process (hosted externally), structured deprecation via error code system, JetStream API level versioning, feature flags for controlled rollouts, and graceful shutdown via lame duck mode. The project follows a 6-month release cycle and maintains backward compatibility through minimum version enforcement and hot reload capability. Governance is delegated to the NATS-io organization governance document.

## Rating

**7/10** — Good implementation with minor issues. The system has strong versioning and deprecation mechanisms, but ADR documentation is external to the source tree, making it harder to trace architectural decisions from code alone. Rollout patterns are present but limited to feature flags and lame duck — no canary or blue-green deployment infrastructure.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| ADR Documentation | ADR documents moved to separate repository; ADR-15 and ADR-42 referenced in code | `server/feature_flags.go:34`, `server/consumer.go:529`, `doc/README.md:3` |
| Semantic Versioning | SemVer regexp validation and VERSION constant | `server/const.go:43`, `server/const.go:69` |
| Deprecation Policy | Error deprecation system with "deprecates" field in errors.json | `server/jetstream_errors.go:72`, `server/errors.json:110` |
| Config Deprecation | Config field deprecation warnings | `server/opts.go:2068` |
| JetStream API Levels | API level versioning with metadata tracking | `server/jetstream_versioning.go:20`, `server/jetstream_versioning.go:90` |
| Schema Versioning | Full state file version tracking for filestore | `server/filestore.go:11584-11590` |
| Feature Flags | Feature flag system for controlled rollouts | `server/feature_flags.go:22-47`, `server/feature_flags.go:53-62` |
| Lame Duck Mode | Graceful shutdown mechanism | `server/server.go:4390`, `server/server.go:4416` |
| Hot Reload | Configuration hot reload system | `server/reload.go:38-74` |
| Minimum Version | Minimum version enforcement for leafnodes | `server/opts.go:221`, `server/leafnode.go:66` |
| Migration Tracking | JetStream migration monitoring | `server/jetstream_cluster.go:3220`, `server/jetstream_cluster.go:6470` |

## Answers to Dimension Questions

### 1. How are architectural decisions documented and revisited?

**Evidence**: ADR documents are maintained in a separate repository (`https://github.com/nats-io/nats-architecture-and-design/`) per `doc/README.md:3`. Code references ADR-15 (feature_flags.go:34) for ACK format versioning and ADR-42 (consumer.go:529) for consumer details. The GOVERNANCE.md references the NATS project governance but provides no internal ADR directory.

**Finding**: No ADR directory exists within the source repository. Architectural decisions are externalized to `nats-architecture-and-design` repository. Code references to ADRs serve as pointers but require external access to review decisions.

### 2. What is the deprecation policy for APIs and how is it communicated?

**Evidence**: Error codes have a formal `deprecates` field in `errors.json:110` and `jetstream_errors.go:72`. The template `errors_gen.go:46-48` generates deprecated error constants with comments. Configuration deprecation is communicated via warnings: `opts.go:2068` warns that "permissions" within cluster authorization block is deprecated. Monitor deprecation exists at `monitor.go:3530`.

**Finding**: Deprecation is formally tracked for error codes via JSON schema. Configuration deprecation uses warnings. No formal deprecation timeline or migration guide was found in the source.

### 3. How does the system evolve its data schema without downtime?

**Evidence**: JetStream uses API level versioning (`jetstream_versioning.go:20` - `JSApiLevel = 4`). Stream metadata tracks required API levels via `JSRequiredLevelMetadataKey` (`jetstream_versioning.go:22`). The `supportsRequiredApiLevel()` function validates compatibility (`jetstream_versioning.go:36-42`). File store uses versioned full state format (`filestore.go:11584-11590`) with `fullStateMinVersion = 1` for backward parsing.

**Finding**: JetStream implements API level versioning that allows servers to reject requests requiring higher levels. File store has versioned format with backward compatibility for parsing older versions.

### 4. How are breaking changes introduced and migrated?

**Evidence**: Minimum version enforcement for leafnodes (`opts.go:221`, `leafnode.go:66`) allows administrators to require minimum versions for connections. JetStream migration tracking (`jetstream_cluster.go:3220`, `jetstream_cluster.go:6470`) monitors peer count vs replica count to detect ongoing migrations. Feature flags (`feature_flags.go:22-47`) allow gradual enablement with both v1 and v2 support noted for `js_ack_fc_v2`.

**Finding**: Breaking changes are gated via minimum version requirements and feature flags that support running with both old and new formats simultaneously. Migration tracking detects when stream/consumer replica counts differ from configured values.

### 5. What rollout patterns are used to limit blast radius of changes?

**Evidence**: Lame duck mode (`server.go:4390-4579`) enables graceful client drainage before shutdown with configurable duration (`DEFAULT_LAME_DUCK_DURATION = 2 * time.Minute` at `const.go:194-200`). Hot reload (`reload.go`) allows config changes without restart. Feature flags (`feature_flags.go`) support opt-in or opt-out patterns per flag. JetStream leadership migration (`jetstream_cluster.go:3724-3729`) moves leaders away before server changes.

**Finding**: Rollout patterns include lame duck graceful shutdown, hot reload for config, feature flags for gradual enablement, and JetStream leader migration. No canary or blue-green deployment patterns found.

## Architectural Decisions

1. **External ADR Repository**: Architectural Decision Records are maintained in `github.com/nats-io/nats-architecture-and-design` rather than in the source repository, per `doc/README.md:3`.

2. **Semantic Versioning**: The project adheres to semver (`RELEASES.md:4`) with version validation regex at `const.go:43`. Internal APIs explicitly state they are not subject to SemVer protections (`subject_transform.go:73`).

3. **API Level System for JetStream**: JetStream uses integer API levels (`JSApiLevel = 4` at `jetstream_versioning.go:20`) rather than SemVer for feature compatibility, with metadata tracking required levels on streams and consumers.

4. **6-Month Release Cycle**: As stated in `RELEASES.md:3`, with current and previous minor series supported for bug fixes and security patches.

## Notable Patterns

1. **Error Deprecation Template**: The `errors_gen.go` template generates deprecated error constants from `errors.json`, creating consistent documentation of superseded errors (`errors_gen.go:46-48`).

2. **Feature Flag Pattern**: Feature flags include introduction version, enablement status, and warnings about peer compatibility (`feature_flags.go:28-46`).

3. **Lame Duck Graceful Shutdown**: Server signals lame duck mode to clients via INFO protocol (`server.go:4556`), waits for grace period, then systematically closes connections (`server.go:4425-4466`).

4. **Stream Metadata Versioning**: Static metadata (required API level) is stored with stream configs; dynamic metadata (server version) is added at response time and stripped before storage (`jetstream_versioning.go:46-108`).

## Tradeoffs

- **External ADR location**: Makes it harder to trace decision context from code alone; requires cross-referencing external repository.
- **API level vs SemVer**: Using integer API levels for JetStream provides more granular feature tracking than SemVer but requires custom implementation.
- **Feature flag warnings**: `js_raft_delete_range` flag warns it may panic older peers — this is a known risk documented in code (`feature_flags.go:43-45`).
- **Lame duck duration**: 2-minute default may delay critical updates in time-sensitive scenarios.

## Failure Modes / Edge Cases

1. **Unknown feature flags**: Unsupported feature flags are logged but ignored (`feature_flags.go:92-99`), potentially leading to silent misconfiguration.

2. **API level rejection**: If a stream requires a higher API level than a server supports, requests are rejected (`jetstream_versioning.go:239-246`). No automatic migration path.

3. **Minimum version enforcement**: Leafnode connections below minimum version are rejected and will reconnect repeatedly (`leafnode.go:3461`), creating potential log spam until resolved.

4. **Migration state loss**: If a server crashes during migration, the migration tracking may not properly complete (`jetstream_cluster.go:3534-3535`).

## Future Considerations

1. **ADR documentation integration**: Consider adding ADR references or summaries within code when decisions are made to improve traceability.

2. **Deprecation timeline**: No formal timeline for deprecated feature removal found. Consider adding expected end-of-life dates to deprecation warnings.

3. **Rollout observability**: Feature flag state is logged at startup but not exposed via monitoring endpoints.

## Questions / Gaps

1. **Where is the formal deprecation policy documented?** No evidence found of a written policy for how deprecated items are communicated and removed.

2. **How are breaking changes announced?** No evidence of deprecation notices in release notes or version-specific migration guides within the source.

3. **Is there a schema migration tool for JetStream?** Evidence shows API level tracking but no explicit migration tooling for schema updates.

4. **What is the canary deployment strategy?** No evidence found of canary rollout infrastructure; lame duck is the primary mechanism for reducing blast radius.

---

Generated by `dimensions/18-governance-evolution-strategy.md` against `nats-server`.