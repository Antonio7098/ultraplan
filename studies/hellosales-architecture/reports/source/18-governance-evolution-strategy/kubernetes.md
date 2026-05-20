# Source Analysis: kubernetes

## Governance & Evolution Strategy

### Source Info

| Field | Value |
|-------|-------|
| Name | kubernetes |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/kubernetes` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

Kubernetes implements a comprehensive, multi-layered governance and evolution strategy. The project combines structured CHANGELOGs with per-version documentation, formal Feature Gates with Alpha/Beta/GA stages, API versioning across multiple stability levels (v1, v1beta1, v1alpha1), and systematic deprecation notices embedded both in code comments and runtime warnings. Kubernetes Enhancement Proposals (KEPs) serve as the architectural decision record system, referenced in code via `kep: https://kep.k8s.io/NNN` comments. The deprecation policy is explicit: deprecated features include version information for both deprecation and removal/no-functional-time, enabling operators to plan migrations. Schema evolution is managed through versioned API directories, OpenAPI specs, and discovery files per API group/version.

## Rating

**9/10** — Excellent, exemplar implementation. Kubernetes demonstrates industry-leading practices for API evolution, deprecation timelines, and feature graduation. The combination of feature gates, versioned APIs, runtime warnings, and detailed CHANGELOGs provides multiple safety nets. Minor gap: no explicit ADR directory visible in the repo, though KEPs serve this purpose externally.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| CHANGELOG Deprecation Section | Deprecation notices for Service `.spec.externalIPs`, `metav1.FieldsV1.Raw`, `git-repo` volume plugin | `CHANGELOG/CHANGELOG-1.36.md:309-314` |
| Volume Deprecation Lifecycle | `gitRepo: deprecated in v1.11, and disabled by default in v1.33+` | `pkg/api/pod/warnings.go:148-152` |
| Deprecated Volume Type Comments | `// Deprecated: GCEPersistentDisk is deprecated. All operations for the in-tree...` | `pkg/apis/core/types.go:73` |
| Node Label Deprecations | Map of deprecated→new labels with version info | `pkg/api/node/util.go:30-36` |
| Feature Gate Definition Template | `// owner: @username` / `// kep: https://kep.k8s.io/NNN` template | `pkg/features/kube_features.go:31-40` |
| Feature Gate Version Specs | Version history per feature with Alpha/Beta/GA/Deprecated stages | `pkg/features/kube_features.go:2200-2217` |
| Feature Gate Dependencies | Dependencies map ensuring hierarchical enablement | `pkg/features/kube_features.go:2243-2399` |
| API Discovery Files | Per-version JSON discovery: `apis__apps__v1.json`, `apis__networking.k8s.io__v1.json` | `api/discovery/` |
| OpenAPI Spec Versioning | Versioned OpenAPI specs: `apis__apps__v1_openapi.json` | `api/openapi-spec/v3/` |
| API Rule Exceptions | Exception list for API rule violations, goal is to never add new ones | `api/api-rules/README.md:24` |
| CLI Deprecation Comments | `// Deprecated: no longer has any effect.` on kubelet options | `cmd/kubelet/app/options/options.go:214,315,377,380` |
| KMSv1 Deprecation | `// Deprecated: KMSv1 is deprecated in v1.28 and will only receive security updates going forward.` | `staging/src/k8s.io/kms/apis/v1beta1/v1beta1.go:18` |
| Endpoints API Deprecation | `// Deprecated: This API is deprecated in v1.33+. Use discoveryv1.EndpointSlice.` | `staging/src/k8s.io/api/core/v1/types.go:6406` |
| Deprecation Warning Tests | Test verifying deprecation warning messages with version info | `pkg/api/pod/warnings_test.go:174-256` |
| API Compatibility Rules | Rules: fields cannot be removed from stable APIs, new fields can be added with defaults | `api/api-rules/README.md` |
| Graduated Features in CHANGELOG | `ImageVolume` graduated to stable, `InPlacePodLevelResourcesVerticalScaling` to beta | `CHANGELOG/CHANGELOG-1.36.md:364-391` |

## Answers to Dimension Questions

### 1. How are architectural decisions documented and revisited?

Architectural decisions are documented through **Kubernetes Enhancement Proposals (KEPs)** — referenced in code via `kep: https://kep.k8s.io/NNN` comments in `pkg/features/kube_features.go`. Each feature gate definition includes the owner, KEP reference, and purpose. The CHANGELOG directory (`CHANGELOG/`) contains per-version files (1.5 through 1.36) documenting all changes, deprecations, and "Action Required" items. KEPs are living documents stored externally at `kep.k8s.io`, but the codebase references them directly, creating a traceable link between code and design intent.

**Evidence**: Feature gate `AllowServiceExternalIPs` at `pkg/features/kube_features.go:59-65` references `kep: https://kep.k8s.io/5707`. CHANGELOG-1.36.md documents all significant changes with SIG labels and PR links.

### 2. What is the deprecation policy for APIs and how is it communicated?

Deprecation policy follows a **version-gated lifecycle**: deprecated APIs/features are marked with version information (e.g., "deprecated in v1.11") and a removal/no-functional date (e.g., "non-functional in v1.16+"). Communication channels include:

1. **Code comments**: `// Deprecated: ...` comments on types/fields with version (`pkg/apis/core/types.go:73`)
2. **Runtime warnings**: `warnings.go` generates user-facing deprecation warnings when deprecated fields are used (`pkg/api/pod/warnings.go:145-177`)
3. **CHANGELOG**: Dedicated "Deprecation" section per version (`CHANGELOG/CHANGELOG-1.36.md:309-314`)
4. **API documentation**: OpenAPI specs include deprecation flags on fields

The policy allows **Beta APIs to be removed with notice** and **Alpha APIs can be removed anytime**. Stable APIs cannot have fields removed (structural compatibility required).

**Evidence**: Volume plugins deprecated at `pkg/api/pod/warnings.go:145-176` with exact version info. Endpoints API marked `deprecated in v1.33+` at `staging/src/k8s.io/api/core/v1/types.go:6406`.

### 3. How does the system evolve its data schema without downtime?

Schema evolution is managed through **multi-version API directories** and **versioned OpenAPI specifications**:

1. **API Versioning**: Each API group has multiple versions (e.g., `networking.k8s.io/v1`, `networking.k8s.io/v1beta1`) in `staging/src/k8s.io/api/`
2. **Discovery Files**: Per-version JSON discovery at `api/discovery/` (e.g., `apis__apps__v1.json`)
3. **OpenAPI Specs**: Versioned OpenAPI specs at `api/openapi-spec/v3/` (e.g., `apis__apps__v1_openapi.json`)
4. **Structural Compatibility**: API rules require that fields cannot be removed from stable APIs (`api/api-rules/README.md:24`)
5. **Default Values**: New fields can be added with defaults, preserving backward compatibility

The API server handles versioning at the HTTP routing level, allowing multiple versions to coexist. etcd stores data in the internal version; conversion between versions happens at the API layer.

**Evidence**: `api/discovery/` contains aggregated and per-group-version discovery JSON files. `api/openapi-spec/v3/` contains versioned OpenAPI specifications.

### 4. How are breaking changes introduced and migrated?

Breaking changes follow a **graduated release process** with explicit timelines:

1. **Feature Gates**: New features start as Alpha (experimental), graduate to Beta (enabled by default), then GA (locked). Features can be disabled via feature gates during过渡.
2. **Deprecation Timeline**: Deprecated features remain functional but emit warnings for a minimum of one release before removal (for Beta APIs; Alpha can be removed anytime).
3. **ACTION REQUIRED Sections**: CHANGELOG entries like those at `CHANGELOG/CHANGELOG-1.36.md:316-319` explicitly state what operators must do when upgrading.
4. **API Removal**: Deprecated APIs list removal version (e.g., "unavailable in v3.4+") and alternatives.

Example migration path from CHANGELOG-1.36:
- Flex-volume support: Users must migrate away; kubeadm no longer auto-mounts flex-volume directories (`CHANGELOG/CHANGELOG-1.36.md:319`)
- `etcd_bookmark_counts` metric renamed to `etcd_bookmark_total` — operators must update dashboards (`CHANGELOG/CHANGELOG-1.36.md:320`)

**Evidence**: Deprecation test at `pkg/api/pod/warnings_test.go:174-256` verifies exact warning messages including version info.

### 5. What rollout patterns are used to limit blast radius of changes?

Kubernetes uses multiple rollout patterns:

1. **Feature Gates**: Boolean flags per feature, allowing granular enable/disable without code changes. Feature gate states (Alpha/Beta/GA/Deprecated) tracked in `pkg/features/kube_features.go:2200-2679`.
2. **Versioned API Coexistence**: Multiple API versions served simultaneously, allowing clients to migrate at their own pace.
3. **Runtime Warnings**: Deprecated field usage generates warnings but doesn't fail, allowing gradual migration.
4. **Graduated Releases**: Features explicitly graduate through stages in CHANGELOG (`CHANGELOG/CHANGELOG-1.36.md:364-391`).
5. **Deprecation Warnings in CLI**: Deprecated flags output warnings when used (`cmd/kubelet/app/options/options.go:214`).

Example: `GitRepoVolumeDriver` feature gate at `pkg/features/kube_features.go:2340` controls whether the git-repo volume plugin is functional. When disabled by default in v1.33, the feature gate allowed operators to test before the auto-disable.

**Evidence**: Feature gate specification at `pkg/features/kube_features.go` shows version history for each feature with defaults per release.

## Architectural Decisions

| Decision | Rationale | Evidence |
|----------|-----------|----------|
| KEP-based ADR system | Provides structured, external documentation with version control and discussion history | `pkg/features/kube_features.go:60` (`kep: https://kep.k8s.io/5707`) |
| Versioned API directories | Enables API evolution without breaking existing clients | `staging/src/k8s.io/api/` with per-version subdirectories |
| Feature gate infrastructure | Allows incomplete features to ship, balancing innovation with stability | `pkg/features/kube_features.go:41` (template comment) |
| Exception-based API rules | Acknowledges historical violations while preventing new ones | `api/api-rules/README.md:24` |
| Runtime deprecation warnings | Shifts left — informs operators at usage time, not just at upgrade time | `pkg/api/pod/warnings.go:145-177` |

## Notable Patterns

1. **Deprecation Map Pattern**: Centralized map of deprecated node labels at `pkg/api/node/util.go:30-36` with message templates for consistent warnings.

2. **Feature Gate Version History**: Each feature gate has a `[]VersionedSpec` slice tracking its state across releases (`pkg/features/kube_features.go:2200-2217`).

3. **Volume Plugin Lifecycle Tracking**: Deprecated volume types include both deprecation version AND removal/non-functional version in warnings (`pkg/api/pod/warnings.go:145-176`).

4. **API Discovery JSON**: Machine-readable discovery files for each API group/version enable client-side version negotiation and discovery.

5. **Multi-layer Deprecation**: Deprecations appear at code level (comments), API level (OpenAPI specs), runtime level (warnings), and documentation level (CHANGELOG).

## Tradeoffs

| Tradeoff | Description |
|----------|-------------|
| Complexity of Feature Gates | 2679-line feature gate file with dependencies requires careful management; a feature gate dependency cycle could block clusters |
| API Version Proliferation | Multiple v1beta1/v1alpha1 versions create maintenance burden; deprecated APIs must be kept working longer |
| Exception File Maintenance | `violation_exceptions.list` is a historical record of mistakes; it grows but is explicitly never supposed to shrink significantly |
| External KEP References | KEPs are external documents — if a KEP is deleted or moved, code references become stale |

## Failure Modes / Edge Cases

1. **Feature Gate Dependency Cycles**: If feature A depends on feature B, and B depends on A, neither can be enabled. The dependency graph at `pkg/features/kube_features.go:2243-2399` must be validated.

2. **Deprecated Field Serialization**: Fields marked deprecated may still be serialized to etcd; removing a deprecated field requires a multi-release migration.

3. **API Version Conversion Bugs**: Conversion between v1 and v1beta1 must preserve all fields; bugs in conversion can cause data loss.

4. **Feature Gate Version Skew**: If components run different versions, a feature gate enabled in one component but not another can cause inconsistent behavior.

5. **CHANGELOG Accuracy**: CHANGELOG entries are manually maintained; human error can result in missing or incorrect deprecation notices.

## Future Considerations

1. **Graduated Features Tracking**: The `test/compatibility_lifecycle/reference/feature_list.md` file (482 entries) documents feature compatibility across versions — this could be automated from feature gate definitions.

2. **KEP Lifecycle Management**: Currently KEPs are external; integrating a summary of KEP status into the codebase would improve traceability.

3. **API Removal Automation**: As deprecated APIs approach removal version, automated tooling could identify remaining usage clusters.

4. **Feature Gate Cleanup**: Several features at `kube_features.go:2388+` have empty dependency lists; periodic cleanup of GA/locked features could reduce maintenance burden.

## Questions / Gaps

| Question | Finding |
|----------|---------|
| Where are ADRs stored? | No explicit ADR directory found in the repo. KEPs (at `kep.k8s.io`) serve as the ADR system but are external. |
| Is there a formal deprecation policy document? | No explicit policy document found. Deprecation patterns observed in code and CHANGELOG but no single canonical reference. |
| How are API conversion tests validated? | Tests exist in `staging/src/k8s.io/apiserver/pkg/endpoints/deprecation/deprecation_test.go` but full conversion test coverage is unclear. |
| What triggers feature gate removal? | Comment at `pkg/features/kube_features.go:526-545` mentions "The Feature Gate will be locked to true in +4 releases (1.38) and then removed (1.39)" — is there a documented policy? |
| How is CHANGELOG accuracy validated? | No automated validation found; relies on SIG Release process and PR review. |

---

Generated by `dimensions/18-governance-evolution-strategy.md` against `kubernetes`.