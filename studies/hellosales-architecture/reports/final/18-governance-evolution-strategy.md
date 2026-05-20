# Governance & Evolution Strategy - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Dimension | 18-governance-evolution-strategy |
| Sources | cli, grafana, kubernetes, milvus, nats-server, openfga, pocketbase, temporal, victoriametrics |
| Date | 2026-05-20 |

## Sources Studied

| # | Source | Path |
|---|--------|------|
| 1 | cli | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/cli` |
| 2 | grafana | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/grafana` |
| 3 | kubernetes | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/kubernetes` |
| 4 | milvus | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/milvus` |
| 5 | nats-server | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/nats-server` |
| 6 | openfga | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/openfga` |
| 7 | pocketbase | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/pocketbase` |
| 8 | temporal | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/temporal` |
| 9 | victoriametrics | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/victoriametrics` |

## Executive Summary

This study examines governance and evolution strategies across nine open-source projects spanning CLI tools, databases, orchestration systems, and authorization servers. The nine sources demonstrate a spectrum of maturity: from Kubernetes's comprehensive multi-layer system (9/10) to the more basic approaches of pocketbase and victoriametrics (6/10). Three convergent patterns emerged across all sources: (1) migration-based schema evolution as the dominant paradigm, (2) informal deprecation practices except where formal policies exist, and (3) near-universal absence of Architecture Decision Records within source trees. The most significant divergence is rollout strategy—Kubernetes and Temporal invest in sophisticated feature gates and worker versioning, while others defer blast-radius control to operators or skip it entirely.

## Core Thesis

Governance and evolution capabilities scale with operational complexity. Systems that manage persistent state (databases, message brokers) invest heavily in migration infrastructure. Systems that coordinate distributed behavior (Kubernetes, Temporal) require sophisticated rollout mechanisms. Pure computation artifacts (CLI tools) can defer governance to release notes and migration guides. The absence of formal ADRs across eight of nine sources reflects a broader industry trend: architectural decision documentation is valuable but low-visibility work that competes with feature development for maintainer attention.

## Rating Summary

| Source | Score | Approach | Main Strength | Main Concern |
|--------|-------|----------|---------------|--------------|
| kubernetes | 9/10 | Feature gates + versioned APIs + runtime warnings | Multi-layer deprecation with Alpha/Beta/GA stages | KEPs external to repo |
| grafana | 8/10 | Formal deprecation policy + migration infrastructure | Grace-period-based deprecation (Large: 1-2yr, Medium: 6mo) | No gradual rollout percentages |
| cli | 7/10 | Migration-based config versioning + feature detection | GHES compatibility via runtime detection | No ADR, no internal feature flags |
| milvus | 7/10 | Design docs + proto deprecation + rolling updates | PR-to-design-doc linkage enforcement | No public CHANGELOG |
| nats-server | 7/10 | External ADR + semver + JetStream API levels | External ADR with code references | ADR not in source tree |
| openfga | 7/10 | Goose migrations + experimental flags + shadow testing | Shadow/A-B resolver pattern | No ADR |
| temporal | 7/10 | Event sourcing + worker versioning + GradualChange | Backward compatibility via event replay | No formal ADR |
| pocketbase | 6/10 | Migration system + soft-deprecation | Nested transaction migrations | No ADR, no feature flags |
| victoriametrics | 6/10 | Append-only partitions + LTS policy | RC→final release discipline | No ADR, no feature flags |

## Approach Models

### ADR-Lite with External Storage (kubernetes, nats-server)
Both projects maintain ADRs in external repositories (kep.k8s.io, nats-architecture-and-design) referenced from code via `kep:` comments. This keeps decision records version-controlled and discussion-enabled outside the main repo, but creates traceability fragility if links break. kubernetes combines this with comprehensive CHANGELOGs per release version.

### Architecture Prose (grafana, temporal, milvus)
These projects document architectural decisions in narrative prose files (architecture docs, design docs) without structured ADR templates. grafana's deprecation policy is the most formal of this group, defining size-based grace periods. milvus enforces design doc linkage via CLAUDE.md conventions. temporal uses architecture docs for workflow concepts but not for code-level decisions.

### Migration-Centric (grafana, openfga, pocketbase, milvus)
These projects prioritize schema migration infrastructure over documentation governance. grafana has 42 dashboard schema versions demonstrating versioning discipline. openfga uses Goose migrations with up/down pairs. pocketbase implements nested transaction safety for migrations. All share a common constraint: migrations cannot be rolled back once committed.

### Event-Sourced Evolution (temporal)
Temporal's event-sourcing architecture provides natural backward compatibility—workflow state reconstructs from append-only history events. This eliminates the need for traditional schema migrations in the common case. Worker versioning enables running multiple versions simultaneously, with reachability APIs determining when old versions can retire.

### Append-Only Storage (victoriametrics)
victoriametrics avoids migration complexity by never modifying stored data in place. New data lands in new monthly partitions; old partitions are dropped based on retention policy. This sidesteps migration complexity but means schema changes require indefinite compatibility layers.

## Pattern Catalog

### Feature Gate Lifecycle (Alpha → Beta → GA → Deprecated)
**Problem solved**: New features need safe exposure paths before mass adoption.
**Sources**: kubernetes (`pkg/features/kube_features.go`), grafana (`pkg/services/featuremgmt/registry.go`), nats-server (`server/feature_flags.go`)
**Why it works**: Explicit stage gates create shared vocabulary between developers and operators. Each stage implies different reliability expectations.
**When to copy**: Distributed systems with diverse client versions and long support windows.
**When overkill**: Short-lived projects, CLIs with rapid release cycles, or single-client services.
**Evidence**: kubernetes feature gates track version history per feature (`kube_features.go:2200-2217`)

### Runtime Deprecation Warnings
**Problem solved**: Operators continue using deprecated features after upgrade without realizing it.
**Sources**: kubernetes (`pkg/api/pod/warnings.go:145-177`), grafana (console warnings), nats-server (config warnings at `server/opts.go:2068`)
**Why it works**: Shifts deprecation awareness from documentation to actual usage. Warnings appear exactly when action is needed.
**When to copy**: Any system where deprecated fields/flags can persist across versions.
**When overkill**: Short-lived features where removal happens within same major version.
**Evidence**: kubernetes Endpoints API deprecated at `staging/src/k8s.io/api/core/v1/types.go:6406`

### Migration Registrar Pattern
**Problem solved**: Tracking which migrations have been applied across deployments.
**Sources**: grafana (`pkg/services/sqlstore/migrations/migrations.go:30-179`), openfga (Goose), pocketbase (`core/migrations_runner.go`)
**Why it works**: Central registration point ensures no migration is skipped or applied twice. Version floor prevents running old binaries on new schemas.
**When to copy**: Any application with persistent state that evolves over versions.
**When overkill**: Applications with no schema state or with schema managed by external tools.
**Evidence**: grafana migration guide explicitly forbids modifying committed migrations (`migrations.go:14-16`)

### Shadow/A-B Testing for Algorithm Changes
**Problem solved**: Validating new algorithms (authorization, matching) without risking incorrect results.
**Sources**: openfga (`internal/graph/builder.go:89-92`), temporal (GradualChange)
**Why it works**: Parallel execution with result comparison catches divergence before full rollout. Timeout bounds the cost of shadow execution.
**When to copy**: Authorization engines, query optimizers, matching algorithms where correctness is paramount.
**When overkill**: Simple flag toggles where wrong behavior is immediately visible.
**Evidence**: openfga ShadowResolver runs main and shadow LocalChecker instances concurrently (`builder.go:89-92`)

### Grace-Period-Based Deprecation
**Problem solved**: Balancing removal of technical debt with user migration time.
**Sources**: grafana (`contribute/deprecation-policy.md:21-28`) defines Large (1-2yr), Medium (6mo), Small (1-3mo)
**Why it works**: Size classification creates predictable planning windows. Large features (AngularJS) get years; small flags get months.
**When to copy**: Large platforms with diverse user base and long upgrade cycles.
**When overkill**: Projects with rapid release cadence where users always run latest.
**Evidence**: grafana's AngularJS deprecation had years of notice before disablement (`breaking-changes-v11-0.md:52-70`)

### Schema Version Consistency Gate
**Problem solved**: Preventing partial schema propagation windows during concurrent modifications.
**Sources**: milvus (`docs/design-docs/design_docs/20260413-drop-collection-field-design.md:534-545`), grafana (schema version migrations)
**Why it works**: Serializes schema changes through mutex or queue, preventing race conditions between proxy and worker nodes.
**When to copy**: Distributed systems where multiple nodes cache schema state.
**When overkill**: Single-node applications or read-heavy systems where schema changes are rare.
**Evidence**: milvus `alterSchemaInFlight` mutex (`sync.Map`) ensures one schema modification per collection

### Lazy Cleanup for Schema Evolution
**Problem solved**: Avoiding expensive immediate cleanup of dropped schema elements.
**Sources**: milvus (dropped field binlogs skipped until compaction), victoriametrics (partitions dropped by retentionWatcher)
**Why it works**: Bounded storage cost until natural cleanup process handles it. Avoids rollback complexity if deletion fails.
**When to copy**: Systems with background compaction or cleanup processes.
**When overkill**: Applications without background processes or where immediate space recovery is critical.
**Evidence**: milvus dropped-field binlogs remain on object storage, cleaned during compaction (`design_docs/20260413-drop-collection-field-design.md:658-667`)

### Minimum Version Floor
**Problem solved**: Preventing ancient binaries from running on newer schemas or vice versa.
**Sources**: openfga (`internal/build/build.go:18` MinimumSupportedDatastoreSchemaRevision), nats-server (`opts.go:221` minimum leafnode version), temporal (`manifest.json` CurrVersion/MinCompatibleVersion)
**Why it works**: Binary refuses to start rather than attempting unsafe operations. Clear error message guides operators.
**When to copy**: Any system where schema format has breaking changes across versions.
**When overkill**: Systems with frequent but backward-compatible schema changes.
**Evidence**: openfga `MinimumSupportedDatastoreSchemaRevision int64 = 4` enforces schema floor

### Lame Duck Graceful Shutdown
**Problem solved**: Draining connections before server shutdown to avoid request failures.
**Sources**: nats-server (`server/server.go:4390-4579`)
**Why it works**: Server sends lame duck signal via INFO protocol, waits configurable duration, then systematically closes connections.
**When to copy**: Message brokers, long-lived connections where abrupt termination causes client reconnect storms.
**When overkill**: Short-lived request-response services where clients handle connection failures.
**Evidence**: DEFAULT_LAME_DUCK_DURATION = 2 * time.Minute at `server/const.go:194-200`

### Worker Versioning with Reachability
**Problem solved**: Safely decommissioning old worker versions after traffic migration.
**Sources**: temporal (`docs/worker-versioning.md:276-298`)
**Why it works**: Reachability API reports whether old version has remaining in-flight work. Operators can confidently retire versions only when UNREACHABLE.
**When to copy**: Workflow engines where task affinity to specific worker versions matters.
**When overkill**: Stateless request handling where any worker can handle any request.
**Evidence**: temporal reachability status `CLOSED_WORKFLOWS_ONLY` or `UNREACHABLE` indicates safe decommission window

### Config Hot Reload
**Problem solved**: Applying configuration changes without service restart.
**Sources**: nats-server (`server/reload.go:38-74`)
**Why it works**: Configuration parsing and reapplication without process restart. Useful for rate limits, ACLs, monitoring.
**When to copy**: Long-running services where restart cost is high.
**When overkill**: Short-lived functions, configuration that fundamentally requires restart.
**Evidence**: nats-server reload.go handles config changes without restart

### Experimental-First Rollout
**Problem solved**: Getting new features into production for real-world testing before committing to interface.
**Sources**: openfga (`pkg/server/config/config.go:107-120`), grafana (Experimental → PublicPreview → GA)
**Why it works**: Users opt-in to experimental features, providing feedback before default enablement. Escape hatch preserves old behavior.
**When to copy**: Features with uncertain performance characteristics or user adoption patterns.
**When overkill**: Bug fixes, minor improvements that don't warrant experimental phase.
**Evidence**: openfga Experimental* constants define experimental flags (`config.go:107-120`)

### Deterministic Gradual Rollout via Consistent Hashing
**Problem solved**: Rolling out config changes to subset of keys deterministically over time.
**Sources**: temporal (`common/dynamicconfig/gradual_change.go:38-43`)
**Why it works**: farmhash fingerprinting ensures same key gets same old/new value across rollouts. Time fraction controls switchover pace.
**When to copy**: Configuration rollouts where consistency across invocations matters.
**When overkill**: Binary feature flags where any subset switch is acceptable.
**Evidence**: `farm.Fingerprint32` for consistent key assignment at `gradual_change.go:38-43`

## Key Differences

### ADR Philosophy: External vs Embedded vs Absent

kubernetes and nats-server maintain ADRs in separate repositories external to the source tree. This enables richer discussion tooling but breaks traceability when links become stale. grafana, temporal, and milvus embed architectural decisions in prose documentation without structured templates. Eight of nine sources lack embedded ADRs—a notable gap given the dimension's emphasis on evidence-driven architecture.

**Why divergence**: ADR value increases with contributor count and decision complexity. Kubernetes and NATS have large, distributed teams where decision rationale travels poorly through code comments alone. Single-maintainer projects (pocketbase) or smaller teams can rely on commit history and issues.

### Feature Flag Sophistication: Multi-Stage vs Binary

kubernetes offers Alpha/Beta/GA/Deprecated stages with version history per feature. grafana provides Experimental/PublicPreview/GeneralAvailability with expression-based evaluation. openfga supports experimental flags with shadow testing. In contrast, pocketbase, victoriametrics, and cli have no feature flags—behavior changes are all-or-nothing.

**Why divergence**: Operational complexity tolerance. Feature flags require coordination infrastructure, documentation of stages, and processes for graduation. Projects with simpler deployment models (single binary, direct upgrades) defer this complexity to operators.

### Schema Evolution Strategy: Migration vs Event Sourcing vs Append-Only

| Strategy | Sources | Tradeoff |
|----------|---------|----------|
| Migration-based | grafana, openfga, pocketbase, milvus | Requires careful up/down migration code; no rollback after commit |
| Event-sourced | temporal | Natural backward compat; complexity in event schema evolution |
| Append-only | victoriametrics | No migration complexity; indefinite compat layers required |
| Versioned APIs | kubernetes | Multiple versions coexist; maintenance burden increases |

### Rollout Pattern Investment

kubernetes and temporal invest heavily in rollout infrastructure (feature gates, worker versioning, GradualChange). nats-server provides lame duck and hot reload. grafana and openfga use simple on/off toggles. pocketbase and victoriametrics delegate entirely to operators.

**Why divergence**: Blast radius cost scales with user base and deployment distribution. Kubernetes operators span cloud providers and configurations; a bad feature gate can affect thousands of clusters. Single-binary tools can rely on rapid upgrade cycles to limit exposure.

## Tradeoffs

### Formal Deprecation Policy vs Agility

grafana's formal deprecation policy (1-2 year grace periods for large features) provides user predictability but constrains feature removal velocity. Projects without formal policies (nats-server, cli) can remove deprecated elements faster but with less user notice.

**Best-fit context**: Large platforms with long upgrade cycles benefit from formal policies. Rapid-release projects can rely on changelog communication.

**Failure mode**: Formal policies become outdated if not maintained; grafana's policy document is separate from implementation.

### Migration Rollback vs Simplicity

pocketbase's nested transaction pattern provides rollback safety within a migration run. grafana explicitly prohibits rollback ("migrations can't be rolled back"). Migration rollback capability adds complexity but limits blast radius of failed migrations.

**Best-fit context**: Critical data stores with large user bases need rollback capability. Development databases or non-critical state can skip it.

**Alternative**: Add-only migrations (openfga) sidestep rollback by never modifying existing structures.

### Feature Flags vs Operational Simplicity

Feature flags (kubernetes, grafana, nats-server, openfga) enable gradual rollout but add testing matrix (every flag × every feature interaction). Projects without feature flags have simpler testing but cannot limit blast radius of new behavior.

**Best-fit context**: Distributed systems with diverse client versions need flag-based rollout control. Homogeneous deployments can skip flags.

**Failure mode**: Flag proliferation without cleanup; kubernetes has 2679-line feature gate file requiring ongoing maintenance.

### External ADR vs Embedded ADR

External ADR repositories (kubernetes, nats-server) enable rich tooling and discussion but break code-to-decision traceability. Embedded ADRs maintain linkage but may lack tooling support.

**Best-fit context**: Large open-source projects with distributed teams benefit from external tooling. Single-organization projects may prefer embedded ADRs.

**Failure mode**: External ADR deletion or move breaks code references.

## Decision Guide

**Choose migration-based schema evolution when**: You have a relational database or structured schema that changes across versions. Use grafana's "never modify committed migrations" rule. Implement minimum version floor.

**Choose event sourcing when**: Workflow state naturally reconstructs from history. Accept the complexity of event schema evolution over time. temporal demonstrates this pattern.

**Choose append-only storage when**: You can organize data into time-based partitions. Accept that schema changes require indefinite compatibility layers. victoriametrics demonstrates this at scale.

**Choose feature gates when**: You have diverse client versions, distributed deployment, or need to disable features quickly in production. Implement Alpha/Beta/GA stages. Start simple (boolean) before adding percentages.

**Choose experimental flags when**: New features need real-world testing before default enablement. Allow opt-in for early adopters. openfga demonstrates shadow testing for correctness-critical features.

**Choose formal deprecation policy when**: You have a large user base with long upgrade cycles. Define grace periods by feature size (grafana's Large/Medium/Small classification). Document timelines explicitly.

**Choose external ADR when**: You have a large contributor base and want rich discussion tooling. Reference ADRs from code via comments. Accept that links may break if repos move.

**Skip feature flags when**: Your deployment is homogeneous (single binary, direct upgrades) or your release cycle is very rapid. Accept that all changes are immediate.

**Skip formal ADRs when**: Your team is small or decisions are straightforward. Rely on architecture docs and commit history. Accept that rationale may be harder to reconstruct later.

## Practical Tips

1. **Implement migration floor**: Set a minimum supported schema version that refuses to start if violated. openfga (`internal/build/build.go:18`), temporal (`manifest.json`), and nats-server (minimum leafnode version) all demonstrate this.

2. **Use runtime deprecation warnings**: Don't rely solely on changelog documentation. kubernetes (`pkg/api/pod/warnings.go`), grafana, and nats-server emit warnings at usage time.

3. **Version your APIs explicitly**: kubernetes uses v1/v1beta1/v1alpha1 per API group. nats-server JetStream uses integer API levels. Temporal uses proto with WIRE breaking detection via `buf`.

4. **Document breaking changes per-release**: grafana's breaking-changes guides, kubernetes's CHANGELOG ACTION REQUIRED sections, and milvus's design docs all provide migration guidance. Keep this documentation alongside code.

5. **Implement graceful shutdown**: nats-server's lame duck mode (2-minute default) provides a template. Drain connections before shutdown to prevent request failures.

6. **Use consistent versioning for rolling updates**: milvus requires `enableActiveStandby: true` and sequential coordinator-first rollout. Document version requirements explicitly.

7. **Link design docs from PRs**: milvus's CLAUDE.md convention (feat: PRs must link design doc) ensures architectural intent is captured before implementation.

8. **Implement feature flag code generation**: grafana's `make gen-feature-toggles` auto-generates constants from registry. This reduces drift between documentation and code.

## Anti-Patterns / Caution Signs

1. **Migration modifying committed state**: grafana explicitly prohibits this; violations can corrupt production data.

2. **Feature flag without cleanup plan**: kubernetes has features stuck in Beta indefinitely. Establish graduation criteria before shipping flags.

3. **Deprecated flag that still functions**: Cobra's `MarkDeprecated()` only warns; the flag continues working. Plan explicit removal timelines.

4. **Missing schema version floor**: Without a minimum version check, ancient binaries may attempt unsafe operations on newer schemas.

5. **Migration failure without fallback**: pocketbase cannot start if a system migration fails on bootstrap. Consider skip or repair modes.

6. **External ADR without code references**: nats-server and kubernetes reference ADRs from code (`kep:`, ADR-NNN). Without this linkage, external ADRs become orphaned.

7. **Soft-deprecation without timeline**: pocketbase's "soft-deprecated" has no defined support window. Define explicit minimum periods.

8. **Feature flags behind integration tests**: grafana notes migrations behind feature flags may not be caught by integration tests. Avoid this pattern.

9. **Append-only with unbounded compat layers**: victoriametrics keeps compatibility indefinitely. Periodically assess whether old formats can be retired.

10. **CHANGELOG-only deprecation**: Without runtime warnings, deprecated features may persist in production long after removal.

## Notable Absences

**Formal ADRs in source trees**: Eight of nine sources lack embedded ADRs. kubernetes and nats-server maintain external ADRs, but the dominant pattern is prose architecture docs without structured templates.

**Canary/blue-green deployment**: Only temporal explicitly documents blue-green deployment. Most projects delegate this to operators or skip it entirely.

**Automated rollback for migrations**: All migration-based systems (grafana, openfga, pocketbase, milvus) lack automated rollback on failure. The guidance is "migrations can't be rolled back."

**Feature flag percentages**: grafana and openfga have simple boolean toggles. kubernetes feature gates can be enabled/disabled but not percentage-ramped. temporal's GradualChange uses consistent hashing but for config, not features.

**Schema migration validation**: pocketbase has no post-migration validation step. grafana runs migrations against MySQL/PostgreSQL in CI but relies on transactional safety.

## Per-Source Notes

**kubernetes (9/10)**: Exemplar multi-layer system combining feature gates, versioned APIs, runtime warnings, and comprehensive CHANGELOGs. KEPs serve as ADR but are external. Minor gap: no explicit deprecation policy document; patterns observed in code and CHANGELOG rather than canonical reference.

**grafana (8/10)**: Strong deprecation policy with grace periods. Migration infrastructure handles 42 schema versions. Feature toggles are simple booleans without gradual rollout. Breaking changes moved from dedicated pages to What's New in v12—may reduce visibility.

**cli (7/10)**: GHES feature detection at runtime prevents version branching. Config migration system well-structured but lacks rollback. No internal feature flags beyond API preview headers. No formal ADR.

**milvus (7/10)**: Design doc PR linkage enforced via CLAUDE.md. Schema evolution with lazy cleanup is sophisticated. Rolling update documentation explicit about coordinator ordering and prerequisites. Notable gap: no public CHANGELOG.

**nats-server (7/10)**: External ADR repository with code references. JetStream API levels track feature compatibility separately from semver. Lame duck graceful shutdown is mature. Feature flags include peer compatibility warnings.

**openfga (7/10)**: Shadow/A-B testing for authorization algorithms is distinctive. Goose migrations with up/down pairs. Experimental flags for gradual enablement. Minimum schema version floor. No ADR.

**temporal (7/10)**: Event sourcing provides natural backward compatibility. Worker versioning with reachability API enables safe decommissioning. GradualChange config uses consistent hashing for deterministic rollout. Proto breaking detection via `buf`. No formal ADR.

**pocketbase (6/10)**: Nested transaction migrations are robust. Dual-track (SystemMigrations vs AppMigrations) separates internal from user migrations. Soft-deprecation without timeline is vague. No ADR, no feature flags, no formal rollout patterns.

**victoriametrics (6/10)**: Append-only partition design sidesteps migration complexity. RC→final release discipline and LTS support windows are solid. KISS principle explicitly rejects complex distributed patterns. No ADR, no feature flags, no application-level rollout controls.

## Open Questions

1. **ADR sustainability**: If external ADR repos (kep.k8s.io, nats-architecture-and-design) are archived or restructured, do code references become stale? Is there a process to update them?

2. **Migration testing completeness**: grafana runs migrations against MySQL/PostgreSQL in CI, but most projects rely on transactional safety without integration test coverage. Is this sufficient for complex schema changes?

3. **Feature flag governance**: kubernetes has features stuck in Beta/GA indefinitely. What processes ensure flags graduate or are removed? Is there automated flag decay tracking?

4. **Schema evolution for event-sourced systems**: temporal's event schema evolves over time. How are breaking event schema changes handled when old events must still be replayable?

5. **Operator-delegated rollout responsibility**: victoriametrics and pocketbase delegate rollout patterns to operators. Is this appropriate for self-hosted vs managed deployments differently?

6. **ADR vs architecture docs ROI**: Eight of nine sources lack embedded ADRs. Does the value of formal ADRs justify the friction in small-to-medium projects?

## Evidence Index

| Evidence | Source | File:Line |
|----------|--------|-----------|
| Semver enforcement | cli | `.github/workflows/deployment.yml:38-41` |
| Config migrations | cli | `internal/config/config.go:182-209` |
| Feature detection | cli | `internal/featuredetection/feature_detection.go:273-290` |
| Deprecation policy | grafana | `contribute/deprecation-policy.md:1-33` |
| Feature toggles | grafana | `pkg/services/featuremgmt/registry.go:17-27` |
| Database migrations | grafana | `pkg/services/sqlstore/migrations/migrations.go:14-21` |
| Feature gate template | kubernetes | `pkg/features/kube_features.go:31-40` |
| Volume deprecation lifecycle | kubernetes | `pkg/api/pod/warnings.go:148-152` |
| API discovery | kubernetes | `api/discovery/` |
| Deprecation map pattern | kubernetes | `pkg/api/node/util.go:30-36` |
| Design docs directory | milvus | `docs/design-docs/design_docs/*.md` |
| Schema evolution design | milvus | `docs/design-docs/design_docs/20260413-drop-collection-field-design.md:14-33` |
| Proto deprecation | milvus | `pkg/proto/*.proto` (43 occurrences) |
| Rolling update | milvus | `deployments/upgrade/rollingUpdate.sh:1-183` |
| ADR documentation | nats-server | `server/feature_flags.go:34` |
| JetStream API levels | nats-server | `server/jetstream_versioning.go:20` |
| Lame duck mode | nats-server | `server/server.go:4390` |
| Semver adherence | openfga | `CHANGELOG.md:5` |
| Goose migrations | openfga | `assets/migrations/postgres/*.sql` |
| Shadow resolver | openfga | `internal/graph/builder.go:89-92` |
| Experimental flags | openfga | `pkg/server/config/config.go:107-120` |
| Migration system | pocketbase | `core/migrations_runner.go:14-15` |
| Soft deprecation | pocketbase | `CHANGELOG.md:537` |
| Nested transactions | pocketbase | `core/migrations_runner.go:129-166` |
| Architecture docs | temporal | `docs/architecture/README.md:1` |
| Schema versioning | temporal | `schema/sqlite/v3/temporal/versioned/v0.11/manifest.json:1-8` |
| Proto breaking detection | temporal | `develop/buf-breaking.sh:54-74` |
| GradualChange | temporal | `common/dynamicconfig/gradual_change.go:13-52` |
| Worker versioning | temporal | `docs/worker-versioning.md:63-67` |
| Changelog structure | victoriametrics | `docs/victoriametrics/changelog/CHANGELOG.md:27` |
| Release process | victoriametrics | `docs/victoriametrics/Release-Guide.md:27-58` |
| LTS policy | victoriametrics | `docs/victoriametrics/LTS-releases.md:17-19` |
| Deprecation flag | victoriametrics | `app/vmstorage/main.go:42` |
| KISS principle | victoriametrics | `docs/victoriametrics/CONTRIBUTING.md:104-128` |

---

Generated by dimension `18-governance-evolution-strategy`.