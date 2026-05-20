# Source Analysis: temporal

## Governance & Evolution Strategy

### Source Info

| Field | Value |
|-------|-------|
| Name | temporal |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/temporal` |
| Language / Stack | Go (server), Protocol Buffers (API) |
| Analyzed | 2026-05-20 |

## Summary

Temporal is an open-source workflow orchestration engine that implements sophisticated governance and evolution patterns. The system demonstrates strong backward compatibility guarantees through event-sourcing architecture, gradual rollout mechanisms via worker versioning, and schema migration tools for database evolution. Architectural decisions are documented in prose within `docs/architecture/`, while deprecation is handled through explicit code comments and configuration warnings. Proto breaking changes are enforced via `buf` tool CI checks.

## Rating

**7/10** — Good implementation with minor issues. Temporal has well-designed evolution mechanisms (event sourcing, worker versioning, GradualChange config) but lacks formal ADR documentation, has no explicit deprecation policy communicated to users, and relies on code comments rather than formal governance records.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| ADR Documentation | Architecture docs in `docs/architecture/` (workflow-update, workflow-lifecycle, etc.) | `docs/architecture/README.md:1` |
| Schema Migration | Versioned schema directories with manifest.json containing CurrVersion/MinCompatibleVersion | `schema/sqlite/v3/temporal/versioned/v0.11/manifest.json:1-8` |
| Schema Tooling | Version normalization using semver parsing | `tools/common/schema/version.go:8-15` |
| Proto Breaking Detection | buf breaking change detection script comparing PR merge base vs main | `develop/buf-breaking.sh:54-74` |
| Proto Versioning | buf.yaml with WIRE breaking change detection for internal protos | `proto/internal/buf.yaml:9-11` |
| Gradual Config | `GradualChange[T]` struct for time-based controlled rollout of config values | `common/dynamicconfig/gradual_change.go:13-52` |
| Worker Versioning | Blue-green deployment strategy with assignment rules and percentage ramping | `docs/worker-versioning.md:63-67,128-157` |
| Backward Compatibility | Comment on workflow history clean approach for compatibility | `service/worker/workerdeployment/workflow.go:59-63` |
| Backward Compatibility | "backwards and forwards compatibility" reference | `service/worker/workerdeployment/workflow.go:61` |
| Backward Compatibility | `temporaltest` package explicitly maintains Go API backwards compatibility per semver | `temporaltest/README.md:5` |
| Version Sets | Version set compatibility logic for compatible version tracking | `service/matching/version_sets.go:48,146-162,208-237` |
| Deprecation Warning | Deprecated cluster config warning message | `temporal/cluster_metadata_loader.go:61` |
| Deprecation Comment | `//nolint:staticcheck // deprecated stuff will be cleaned` | `service/worker/workerdeployment/workflow.go:789` |
| Release Tooling | GoReleaser v2 config with SNAPSHOT versioning | `.goreleaser.yml:9` |

## Answers to Dimension Questions

### 1. How are architectural decisions documented and revisited?

Architectural decisions are documented in prose within `docs/architecture/` directory (`docs/architecture/README.md:1-82`). Files like `workflow-update.md`, `workflow-lifecycle.md`, `worker-commands.md`, `speculative-workflow-task.md`, `nexus.md`, `message-protocol.md` describe system design. However, **no formal ADR format** (like YYYY-MM-DD-numbered files or structured decision templates) was found. Decisions are embedded in narrative documentation rather than captured as explicit decision records with context, alternatives, and consequences.

### 2. What is the deprecation policy for APIs and how is it communicated?

**No explicit deprecation policy found.** Deprecation is handled informally:
- Code comments: `//nolint:staticcheck // deprecated stuff will be cleaned` at `service/worker/workerdeployment/workflow.go:789`
- Config warnings: `"ClusterInformation in static config is deprecated. Please use TCTL tool..."` at `temporal/cluster_metadata_loader.go:61`
- Test skips: `s.T().Skip("Skipping test since rules based versioning is soon to be deprecated")` at `tests/versioning_test.go:738`

The `temporaltest` package explicitly commits to Go API backwards compatibility per semver (`temporaltest/README.md:5`), but no broader API deprecation policy exists.

### 3. How does the system evolve its data schema without downtime?

Temporal uses a **versioned schema migration system** with `CurrVersion` and `MinCompatibleVersion` tracking:
- Schema directories exist for SQLite (`schema/sqlite/v3/temporal/versioned/`), Cassandra (`schema/cassandra/temporal/versioned/`), PostgreSQL (`schema/postgresql/v12/`)
- Each version has a `manifest.json` (e.g., `schema/sqlite/v3/temporal/versioned/v0.11/manifest.json:1-8`) defining the current version and minimum compatible version
- Schema tool at `tools/common/schema/version.go:8-15` provides semver-based version normalization

**No explicit zero-downtime migration strategy** found in documentation — migrations appear to rely on standard database migration tooling rather than online schema change patterns.

### 4. How are breaking changes introduced and migrated?

**Proto breaking changes** are detected via `buf` tool in CI (`develop/buf-breaking.sh:54-74`):
- Compares against PR merge base and main branch
- Uses `WIRE` breaking detection in `proto/internal/buf.yaml:9-11`

**Worker versioning** enables gradual migration of worker code:
- Blue-green deployment strategy documented at `docs/worker-versioning.md:63-67`
- Assignment rules with percentage ramping at lines 128-157
- `commit-build-id` command atomically completes rollout (lines 193-195)
- Redirect rules for moving long-running workflows (lines 261-274)

**Workflow history** compatibility is maintained by keeping history clean — workflow always does Continue-as-New after adding events to keep a single workflow task in steady state (`service/worker/workerdeployment/workflow.go:59-63`).

### 5. What rollout patterns are used to limit blast radius of changes?

**GradualChange config** (`common/dynamicconfig/gradual_change.go:13-52`):
- Time-based controlled value changes
- Uses consistent hashing (`farm.Fingerprint32`) to determine which keys switch when
- `SubscribeGradualChange` helper for time-based callbacks

**Worker Versioning** (`docs/worker-versioning.md`):
- Blue-green deployments (line 67)
- Percentage-based assignment rules for gradual traffic shift (line 131)
- Reachability API to determine when old versions can be decommissioned (lines 276-298)

**No explicit feature flags** system found beyond dynamic config entries like `EnableReplicationTaskBatching` (`common/dynamicconfig/constants.go:2713`).

## Architectural Decisions

1. **Event sourcing as evolution foundation**: Workflow state is reconstructed from append-only history events (`docs/architecture/README.md:32`). This provides natural backward compatibility — old events are replayed, not migrated.

2. **Workflow continue-as-new for compatibility**: Deployment workflows always CaN after adding events to keep history clean (`service/worker/workerdeployment/workflow.go:59-63`), reducing compatibility concerns between versions.

3. **Proto breaking change enforcement via buf**: Wire-level breaking detection in CI (`develop/buf-breaking.sh`, `proto/internal/buf.yaml:9-11`) prevents incompatible API changes.

4. **Version sets for backward compatibility**: Compatible version sets tracked in code (`service/matching/version_sets.go:208-237`) to ensure new versions can process histories from older versions.

5. **Gradual config rollout**: Deterministic gradual changes using consistent hashing (`common/dynamicconfig/gradual_change.go:38-43`) enable controlled rollout of configuration changes.

## Notable Patterns

- **Semver for Go API compatibility**: `temporaltest/README.md:5` explicitly commits to not breaking Go API backwards compatibility per semantic versioning
- **Deterministic gradual rollout**: `GradualChange.Value()` uses farmhash fingerprinting to consistently assign keys to old/new values based on time fraction (`common/dynamicconfig/gradual_change.go:38-43`)
- **Assignment rules with percentage**: Worker versioning uses percentage-based assignment rules that can be atomically committed via `commit-build-id` (`docs/worker-versioning.md:145-160`)
- **Reachability-based decommissioning**: Workers can safely retire when reachability status is `CLOSED_WORKFLOWS_ONLY` or `UNREACHABLE` (`docs/worker-versioning.md:280-298`)

## Tradeoffs

1. **No formal ADR format**: Architectural decisions are prose documentation, making it difficult to trace the "why" behind specific choices. Future maintainers must read narrative docs rather than structured records.

2. **No explicit deprecation policy**: Breaking API changes may not be communicated clearly to users; deprecation is scattered through code comments and config warnings.

3. **Schema migration tooling**: While versioned schemas exist, no zero-downtime migration strategy was found — schema evolution may require downtime or coordinated deployments.

4. **Worker versioning complexity**: The system handles multiple worker versions simultaneously, adding operational complexity for users managing deployments.

5. **Pre-release worker versioning**: Documentation states worker versioning is still pre-release and may have breaking changes (`docs/worker-versioning.md:14`), limiting production confidence.

## Failure Modes / Edge Cases

1. **Backward compatibility with older SDKs**: Code explicitly handles backward compat with older matching services (`service/matching/matching_engine.go:3136`) and older SDKs (`service/matching/matching_engine.go:2512-2515`).

2. **Version set chain handling**: Redirect rules can be chained (`docs/worker-versioning.md:274`) but cannot redirect from version sets to versioning rules, limiting migration paths.

3. **Reachability timing delays**: Caveats note reachability status may take minutes to converge (`docs/worker-versioning.md:291-292`), potentially causing premature decommissioning if relied upon too heavily.

4. **Inherited Build ID not tracked for reachability**: Activities, child workflows, and Continue-as-New that inherit Build ID but not Task Queue are not accounted for in reachability (`docs/worker-versioning.md:294-298`).

5. **Schema version rollback**: `MinCompatibleVersion` in manifest.json constrains which prior versions can upgrade, but no evidence of automatic rollback on failed migration.

## Future Considerations

1. **Formal ADR documentation**: Consider adopting a lightweight ADR format (e.g., numbered files in `docs/decisions/`) to capture architectural decisions with context and alternatives considered.

2. **Explicit deprecation policy**: Document the policy for API deprecation, including minimum notice periods and migration paths for users.

3. **Zero-downtime schema migration**: Evaluate online schema change tools or patterns for databases that don't support DDL in transactions.

4. **Feature flag framework**: Consider formalizing the gradual config pattern into a proper feature flag system with per-flag targeting and audit trails.

## Questions / Gaps

1. **No ADR directory found** — Searched for `ADR*.md`, `decision*.md`, `decisions/` directory with no results.
2. **No explicit deprecation policy** — No documented policy for how API deprecation is handled, only scattered code comments.
3. **Schema migration strategy unclear** — No evidence of zero-downtime migration strategy or rollback mechanisms for failed migrations.
4. **Worker versioning still pre-release** — `docs/worker-versioning.md:14` states not recommended for production, limiting reliance on its rollout patterns.
5. **GoReleaser changelog disabled** — `.goreleaser.yml:92-93` disables changelog generation, making release notes less accessible.

---

Generated by `dimensions/18-governance-evolution-strategy.md` against `temporal`.