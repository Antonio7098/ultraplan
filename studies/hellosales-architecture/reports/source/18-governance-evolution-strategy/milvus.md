# Source Analysis: milvus

## Governance & Evolution Strategy

### Source Info

| Field | Value |
|-------|-------|
| Name | milvus |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/milvus` |
| Language / Stack | Go + C++ (internal/core/) + Rust (tantivy) |
| Analyzed | 2026-05-20 |

## Summary

Milvus demonstrates a well-structured governance and evolution strategy with comprehensive design documentation, formal PR conventions linking features to design docs, explicit deprecation policies via proto annotations and Go comments, and semver-based versioning with mixed-version cluster support. The schema evolution system enables non-disruptive field dropping with lazy cleanup and field ID monotonicity. Rolling updates are supported via kubectl rollout patterns with explicit coordinator ordering. The messaging layer carries explicit version constants for backward compatibility. Key gaps include the absence of a public changelog file and limited evidence of formal feature flags beyond configuration parameters.

## Rating

**7/10** — Good implementation with minor issues. Milvus has comprehensive design documentation, formal PR-to-design-doc linkage, deprecation annotations in proto and Go code, semver-based compatibility checking, and rolling update support with mixed-version awareness. However, there is no public CHANGELOG file, deprecation warnings are not surfaced in client SDKs, and the rollout pattern relies on hard-coded sequential ordering rather than sophisticated canary/blue-green strategies.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Design docs directory | 36+ dated design docs in `YYYYMMDD-feature-name.md` format | `docs/design-docs/design_docs/*.md` |
| PR convention requiring design docs | `feat:` PRs must link design doc under `docs/design-docs` | `CLAUDE.md:69-70` |
| Proto deprecation | `deprecated = true` annotations on proto fields across worker.proto, streaming.proto, query_coord.proto, etc. | `pkg/proto/*.proto` (43 occurrences) |
| Go deprecation comments | `// Deprecated: Since 2.x.x` in component_param.go:2613-2617, 2623, 2662 | `pkg/util/paramtable/component_param.go:2613-2667` |
| Schema evolution design | Explicit schema evolution strategy with lazy cleanup, field ID monotonicity | `docs/design-docs/design_docs/20260413-drop-collection-field-design.md:14-33` |
| Storage version policy | StorageV2/V3 versioning for compaction upgrades | `internal/datacoord/compaction_policy_storage_version.go:67-73` |
| Message version compatibility | VersionOld/V1/V2 constants for streaming message compatibility | `pkg/streaming/util/message/version.go:6-8` |
| Semver library usage | Uses `github.com/blang/semver/v4` for version parsing and range checks | `pkg/common/version.go:3-9` |
| Migration version constants | Version210/220/230 constants for migration ranges | `cmd/tools/migration/versions/version.go:6-9` |
| Migration validation | `Validate()` ensures target >= source; `CheckCompatible()` for pre-migration checks | `cmd/tools/migration/migration/runner.go:104-128` |
| Rolling update script | kubectl rollout-based sequential deployment with status monitoring | `deployments/upgrade/rollingUpdate.sh:1-183` |
| Rolling update documentation | README notes version requirements, Helm-only limitation, RocksMQ incompatibility | `deployments/upgrade/README.md:5-12` |
| Mixed-version cluster support | Comments about old QueryNode behavior during rolling upgrades | `internal/querycoordv2/checkers/segment_checker.go:340` |
| Session-based version checks | `WatchServicesWithVersionRange()` and version parsing in session_util.go | `internal/util/sessionutil/session_util.go:170-854` |
| API version update automation | `make update-milvus-api` updates all 4 go.mod files | `UPDATE_MILVUS_API.md:7-12` |
| Build version extraction | `git describe --exact-match --tags --match 'v*'` for MilvusVersion | `Makefile:265` |
| Backward compatibility comments | `// backward compatibility for rolling upgrade` in meta_table.go:536,847,873 | `internal/rootcoord/meta_table.go:536-1540` |
| Storage version semver check | `semver.Parse()` and `MustParseRange()` for version requirement checks | `internal/datacoord/server.go:491-1248` |

## Answers to Dimension Questions

### 1. How are architectural decisions documented and revisited?

Architectural decisions are documented through **dated design documents** stored in `docs/design-docs/design_docs/` with the naming convention `YYYYMMDD-feature-name.md`. As of the studied source, there are 36+ design documents covering features like `20260413-drop-collection-field-design.md`, `20230418-querynode_v2.md`, `20211227-milvus_create_index.md`, etc.

The **CLAUDE.md** file (lines 64-73) codifies the linkage between PRs and design documentation:
- `feat:` PRs **must** link a design doc under `docs/design-docs`
- "Every Milvus feature should have a related design doc under `docs/design-docs`; submit the doc in this repository and link it from the Milvus feature PR" (`CLAUDE.md:70`)

There is no evidence of a formal ADR review or revisit process (e.g., time-bounded ADR reviews or explicit "revisit in vX.Y" clauses). Design docs appear to be created once at feature inception, with no automated process for re-evaluating decisions in subsequent releases.

### 2. What is the deprecation policy for APIs and how is it communicated?

**Proto-level deprecation**: Proto files use `deprecated = true` annotations on deprecated fields. Evidence found across 43+ proto field declarations in `pkg/proto/worker.proto`, `pkg/proto/streaming.proto`, `pkg/proto/query_coord.proto`, `pkg/proto/data_coord.proto`, etc. For example: `pkg/proto/worker.proto:239` marks `index_store_version` as deprecated.

**Go-level deprecation**: Parameter configs use `// Deprecated: Since 2.x.x` comments. Evidence in `pkg/util/paramtable/component_param.go:2613-2617`:
- `RetryNum`: `// Deprecated: Since 2.2.0`
- `RetryInterval`: `// Deprecated: Since 2.2.0`
- `AutoHandoff`: `// Deprecated: Since 2.2.2`

**Error code deprecation**: `pkg/util/merr/errors.go:73,165,195` marks error codes with `// Deprecated, keep it only for reserving the error code`.

**Communication mechanism**: Deprecations are communicated through:
1. Proto annotations (`deprecated = true`)
2. Go comments with version since-note (`// Deprecated: Since 2.x.x`)
3. No client SDK warnings or formal deprecation notices in release notes were found

**Notable gap**: There is no evidence of a public CHANGELOG file documenting API deprecations across releases. The `UPDATE_MILVUS_API.md` file shows how to update milvus-proto across go.mod files but does not itself serve as a deprecation notice.

### 3. How does the system evolve its data schema without downtime?

The system employs a **schema evolution design** documented in `docs/design-docs/design_docs/20260413-drop-collection-field-design.md`. Key mechanisms:

**Non-disruptive field drop via `AlterCollectionSchema` with `DropRequest` action**:
- Uses existing `AlterCollectionSchema` RPC rather than a new dedicated RPC (`docs/design-docs/design_docs/20260413-drop-collection-field-design.md:100-104`)
- Validates constraints: not PK, not partition key, not last vector field (`docs/design-docs/design_docs/20260413-drop-collection-field-design.md:216-229`)

**Lazy cleanup strategy** (`docs/design-docs/design_docs/20260413-drop-collection-field-design.md:658-667`):
- Dropped-field binlogs remain on object storage; they are skipped during segment loading
- Binlogs are naturally cleaned up during compaction
- Avoids complex rollback logic if deletion fails

**Field ID monotonicity** (`docs/design-docs/design_docs/20260413-drop-collection-field-design.md:346-379`):
- `max_field_id` is persisted in collection properties to prevent field ID reuse
- `nextFieldID()` reads from three sources: current fields, struct array sub-fields, and persisted `max_field_id`

**Schema-driven filtering in C++ segcore** (`docs/design-docs/design_docs/20260413-drop-collection-field-design.md:460-485`):
- All C++ components use the **latest schema** to determine field visibility
- `has_field(FieldId field_id)` gates all data access: `ComputeDiffBinlogs`, `ComputeDiffIndexes`, `ComputeDiffColumnGroups`

**Concurrency controls** (`docs/design-docs/design_docs/20260413-drop-collection-field-design.md:534-545`):
- `alterSchemaInFlight` mutex (`sync.Map`): only one schema modification per collection
- DDL queue serial execution
- Schema version consistency gate before allowing changes

**Storage version upgrades** (`internal/datacoord/compaction_policy_storage_version.go:67-73`):
- `targetVersion()` determines storage format (V2 or V3) based on `UseLoonFFI` config
- TEXT fields require V3 manifest storage and cannot be downgraded (`internal/datacoord/compaction_policy_storage_version.go:144-158`)

### 4. How are breaking changes introduced and migrated?

**Migration tool** (`cmd/tools/migration/migration/runner.go`):
- `Validate()` ensures target version >= source version using semver (`runner.go:104-118`)
- `CheckCompatible()` returns `true` if target < v2.2.0 (pre-migration compatibility check) (`runner.go:121-128`)
- `CheckSessions()` verifies no live sessions during migration (`runner.go:154-163`)
- `Backup()`, `Migrate()`, `Rollback()` methods with idempotent operations

**Version constants for migration ranges** (`cmd/tools/migration/versions/version.go`):
```go
version210Str = "2.1.0"
version220Str = "2.2.0"
version230Str = "2.3.0"
```

**Rolling upgrade with mixed-version awareness** (`internal/querycoordv2/utils/util.go:131`):
- Comments reference "old node in mixed-version rollout"
- `DataVersion` field nullable to handle old nodes that don't report it (`internal/querycoordv2/meta/segment_dist_manager.go:132`)
- `GetSessionsWithVersionRange()` and `WatchServicesWithVersionRange()` for version-aware session watching (`internal/util/sessionutil/session_util.go:699,854`)

**Message version compatibility** (`pkg/streaming/util/message/version.go:6-8`):
```go
VersionOld Version = 0 // old version before streamingnode, keep in 2.6 and will be removed from 3.0.
VersionV1  Version = 1 // The message marshal unmarshal still use msgstream.
VersionV2  Version = 2 // The message marshal unmarshal never rely on msgstream.
```

**API version automation** (`UPDATE_MILVUS_API.md`):
- `make update-milvus-api PROTO_API_VERSION=v2.3.0-dev.1` updates all 4 go.mod files
- Updates go.mod, client/go.mod, pkg/go.mod, tests/go_client/go.mod

**Gaps in breaking change handling**:
- No formal breaking change policy or migration guide documentation found
- No evident version-specific API deprecation warnings in client SDKs
- No automated schema migration for dropping fields (lazy cleanup only)

### 5. What rollout patterns are used to limit blast radius of changes?

**Rolling update via kubectl** (`deployments/upgrade/rollingUpdate.sh`):
- Uses `kubectl rollout status deployment` for deployment monitoring (`rollingUpdate.sh:97`)
- Sequential deployment order: rootcoord → datacoord → indexcoord → querycoord → indexnode → datanode → querynode → proxy (`rollingUpdate.sh:122`)
- Waits 30 seconds (`minReadySeconds`) after coordinator updates before proceeding (`rollingUpdate.sh:66`)
- `check_rollout_status` verifies all deployments successful before continuing (`rollingUpdate.sh:101-118`)

**Prerequisites enforced** (`deployments/upgrade/README.md:8-12`):
- Version must be after 2.2.0
- Helm installation only (not Milvus Operator)
- RocksMQ standalone not supported for rolling updates
- Requires `enableActiveStandby: true` on coordinators (`rollingUpdate.sh:82`)

**Mixed-version cluster handling** (`internal/querycoordv2/checkers/segment_checker.go:340`):
- Comments about "old QueryNode in mixed-version rollout"
- `DataVersion` nil check for old nodes (`internal/querycoordv2/utils/util.go:131`)
- Version requirement checks before triggering storage version compaction (`internal/datacoord/compaction_policy_storage_version.go:83-87`)

**Session-based coordination** (`internal/util/sessionutil/session_util.go`):
- `WatchServicesWithVersionRange()` for version-aware service watching
- Session-based migration coordination with TTL and retry logic (`session_util.go:90-101`)

**Gaps in rollout patterns**:
- No evidence of canary deployments or progressive percentage-based rollouts
- No feature flags found beyond configuration parameters (`StorageVersionCompactionEnabled` etc.)
- No blue-green deployment patterns
- No automated rollback beyond `kubectl rollout history`

## Architectural Decisions

| Decision | Rationale | Evidence |
|----------|-----------|----------|
| Design docs with `YYYYMMDD-feature-name.md` naming | Provides chronological traceability and明确了 feature development timeline | `docs/design-docs/design_docs/*.md` |
| `feat:` PR must link design doc | Ensures architectural intent is captured before implementation | `CLAUDE.md:69-70` |
| Schema evolution via `AlterCollectionSchema` unified entry point | Reuses existing concurrency controls rather than building new ones | `docs/design-docs/design_docs/20260413-drop-collection-field-design.md:688-697` |
| Lazy binlog cleanup (no immediate deletion) | Avoids expensive scans, compaction naturally removes stale data, bounded storage cost | `docs/design-docs/design_docs/20260413-drop-collection-field-design.md:658-667` |
| Persistent `max_field_id` in collection properties | Prevents field ID reuse which would cause data corruption | `docs/design-docs/design_docs/20260413-drop-collection-field-design.md:346-379` |
| Inline cascade via ack callback (not separate RPC) | Prevents deadlock since `broadcastAlterCollectionSchema` holds the broadcast lock | `docs/design-docs/design_docs/20260413-drop-collection-field-design.md:668-677` |
| `enableActiveStandby: true` required for rolling update | Active-standby mode enables coordinators to handle requests during upgrade | `deployments/upgrade/rollingUpdate.sh:82` |
| Sequential coordinator-first update order | Ensures metadata coordination is available before worker nodes are updated | `deployments/upgrade/rollingUpdate.sh:122` |

## Notable Patterns

1. **Proto deprecation via `deprecated = true`** — Standard proto3 pattern across 43+ fields, with `deprecated` comment in Go code for config parameters
2. **Semver range checks for version compatibility** — Uses `blang/semver/v4` with `MustParseRange()` for node version validation before feature activation
3. **Schema version consistency gate** — Proxy queries DataCoord for segment statistics before allowing schema changes, preventing partial propagation windows
4. **Ack callback idempotency** — Both `meta.AlterCollection` and `MarkIndexAsDeleted` are idempotent, enabling exponential-backoff retry
5. **Message version constants for streaming** — Explicit `VersionOld/V1/V2` int constants for compatibility across message formats

## Tradeoffs

| Tradeoff | Evidence | Impact |
|----------|----------|--------|
| Lazy binlog cleanup | Binlogs of dropped fields are not deleted immediately | Storage cost is bounded but non-zero until compaction; no immediate space recovery |
| Sequential rolling update | Deployments update one-by-one in hard-coded order | Slower updates but ensures coordinator availability throughout |
| No public CHANGELOG | No evidence of a CHANGELOG.md or equivalent | Users cannot easily track API deprecations across versions |
| Mixed-version support complexity | Codebase has `// old node in mixed-version rollout` checks throughout | Additional conditional logic in query path, potential for subtle compatibility bugs |
| Rolling update limited to Helm | Not supported for Milvus Operator deployments | Limits adoption for Kubernetes-native users |

## Failure Modes / Edge Cases

1. **SDK cache staleness after field drop**: If a client caches schema, drops a field, then re-adds a same-named field with different type, the cached schema returns the old type causing search failures. The design doc notes this requires cache invalidation in SDK (`docs/design-docs/design_docs/20260413-drop-collection-field-design.md:597-601`).

2. **Cross-version query race**: If a query is in-flight when a field is dropped, there is a narrow window where the proxy has stale schema but the QueryNode has reloaded with new schema. The design classifies outcomes and notes both return clear errors (not data corruption) (`docs/design-docs/design_docs/20260413-drop-collection-field-design.md:586-595`).

3. **Cascade intermediate window**: Between `meta.AlterCollection` and `cascadeDropFieldIndexesInline`, `DescribeCollection` shows field gone but `ListIndexes` still shows indexes on the dropped field. This is transient and self-healing via ack callback retry (`docs/design-docs/design_docs/20260413-drop-collection-field-design.md:553-567`).

4. **TEXT field V3 storage requirement**: Collections with TEXT fields cannot be downgraded below V3 storage version once upgraded. The policy explicitly skips such collections rather than silently handling (`internal/datacoord/compaction_policy_storage_version.go:144-158`).

5. **Storage version compaction rate limiting**: The `StorageVersionCompactionRateLimitTokens` config bounds the number of concurrent storage version upgrades, preventing resource exhaustion during mass upgrades (`internal/datacoord/compaction_policy_storage_version.go:96-102`).

## Future Considerations

1. **Physical binlog cleanup GC task**: The design doc (`docs/design-docs/design_docs/20260413-drop-collection-field-design.md:747-749`) explicitly calls for a future background GC task to scan object storage and remove binlogs for dropped fields.

2. **Batch drop support**: Future enhancement to drop multiple fields/functions in a single `AlterCollectionSchema` request (`docs/design-docs/design_docs/20260413-drop-collection-field-design.md:751-753`).

3. **Field rename with data migration**: Future support for dropping a field while migrating its data to another field (`docs/design-docs/design_docs/20260413-drop-collection-field-design.md:755-757`).

4. **VersionOld removal in 3.0**: The `pkg/streaming/util/message/version.go:6` comment indicates `VersionOld` will be removed from 3.0, implying a future breaking change in the streaming message format.

## Questions / Gaps

| Question | Status | Evidence |
|----------|--------|----------|
| Is there a formal ADR process for revisiting architectural decisions? | **No evidence found** | Searched for ADR patterns; only design docs with no revisit mechanism |
| Is there a public CHANGELOG documenting API deprecations? | **No evidence found** | No CHANGELOG or similar file found in repo root or docs |
| How are breaking changes communicated to API clients? | **Limited evidence** | Proto annotations exist but no client SDK deprecation warnings found |
| Is there a formal feature flag system for progressive rollouts? | **No evidence found** | Only configuration-based toggles like `StorageVersionCompactionEnabled` |
| Is there automated rollback for failed rolling updates? | **Partial evidence** | `kubectl rollout history` exists but no automated rollback to prior version |
| How does the system handle database schema migrations for metadata? | **Limited evidence** | Migration tool exists but no schema migration scripts visible |
| Is there a formal semver policy with explicit major.minor.patch rules? | **No evidence found** | Version constants exist but no documented semver policy |

---

Generated by `dimensions/18-governance-evolution-strategy.md` against `milvus`.