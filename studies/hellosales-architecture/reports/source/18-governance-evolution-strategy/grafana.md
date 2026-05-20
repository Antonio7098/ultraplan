# Source Analysis: grafana

## Governance & Evolution Strategy

### Source Info

| Field | Value |
|-------|-------|
| Name | grafana |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/grafana` |
| Language / Stack | Go (backend), TypeScript/React (frontend), Yarn workspaces |
| Analyzed | 2026-05-20 |

## Summary

Grafana demonstrates mature governance and evolution practices through a formal deprecation policy, extensive migration infrastructure, and a well-structured feature flag system. The project maintains database schema migrations via an ordered migration system, uses feature toggles for progressive rollout, and documents breaking changes per-release. Architectural decisions are not formally captured in ADRs but are evident in code structure and migration patterns. The project follows semver implicitly with major releases documented in dedicated breaking-changes guides.

## Rating

**8/10** — Good implementation with minor issues. Grafana excels at migration infrastructure and deprecation communication, but lacks formal ADR documentation and the feature flag system is somewhat limited to simple on/off toggles without gradual rollout capabilities.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Deprecation policy | Formal policy document with grace periods | `contribute/deprecation-policy.md:1-33` |
| Feature flags | Registry-based feature toggle system | `pkg/services/featuremgmt/registry.go:1-100` |
| Feature flag code generation | `make gen-feature-toggles` generates constants | `pkg/services/featuremgmt/toggles_gen.go:1-100` |
| Feature stages | `FeatureStageExperimental`, `FeatureStagePublicPreview`, `FeatureStageGeneralAvailability` | `pkg/services/featuremgmt/registry.go:17-27` |
| Database migrations | Ordered migration system with registrar | `pkg/services/sqlstore/migrations/migrations.go:14-21` |
| Dashboard migrations | Schema version migrations (v0-v42) | `apps/dashboard/pkg/migration/schemaversion/migrations.go:53-97` |
| Migration guidelines | "Never change a committed migration" rule | `pkg/services/sqlstore/migrations/migrations.go:14-16` |
| Breaking changes docs | Per-release breaking changes documentation | `docs/sources/breaking-changes/breaking-changes-v11-0.md:1-100` |
| API migration docs | `/api` to `/apis` migration guide | `docs/sources/shared/developers/deprecated-apis.md:1-15` |
| Angular deprecation | Large feature deprecation with years of notice | `docs/sources/breaking-changes/breaking-changes-v11-0.md:52-70` |
| Migration testing | Integration tests with MySQL/PostgreSQL | `contribute/developer-guide.md:223-241` |
| Cloud migration | CloudMigrationAssistant for instance migration | `docs/sources/administration/migration-guide/cloud-migration-assistant.md:1-50` |
| Feature toggle manager | `FeatureManager` with `IsEnabled()` API | `pkg/services/featuremgmt/manager.go:100-110` |
| OpenFeature integration | Optional OpenFeature provider support | `pkg/services/featuremgmt/openfeature.go:1-50` |
| Release notes | What's new pages for each version | `docs/sources/whatsnew/_index.md:1-50` |

## Answers to Dimension Questions

### 1. How are architectural decisions documented and revisited?

**No formal ADR system found.** Grafana does not maintain Architecture Decision Records. Instead, architectural decisions are documented through:
- **Migration comments** (`pkg/services/sqlstore/migrations/migrations.go:14-21`): Migration guide says "Never change a committed migration" and "Always add new migrations"
- **Feature stage definitions**: Feature flags are documented with stages (Experimental, PublicPreview, GeneralAvailability) in `pkg/services/featuremgmt/registry.go:17-27`
- **Breaking changes documentation** (`docs/sources/breaking-changes/_index.md:14-38`): As of v12.0, breaking changes are documented in What's New pages
- **Code structure**: The migration registrar pattern in `pkg/services/sqlstore/migrations/migrations.go:30-179` demonstrates decisions made about database evolution
- **Dashboard schema versioning**: `apps/dashboard/pkg/migration/schemaversion/migrations.go:53-97` shows 42 schema versions demonstrating long-term schema evolution thinking

The absence of a formal ADR system means decision rationale is embedded in code comments or lost to history.

### 2. What is the deprecation policy for APIs and how is it communicated?

**Formal deprecation policy** exists in `contribute/deprecation-policy.md:1-33` with defined grace periods:

| Size | Duration | Example |
|------|----------|---------|
| Large | 1-2 years | Classic alerting, AngularJS |
| Medium | 6 months | Supported database versions |
| Small | 1-3 months | OAuth token refresh changes |

**Communication mechanisms**:
- **Feature flags** with stage lifecycle (`pkg/services/featuremgmt/registry.go:17-27`): Features move through Experimental → PublicPreview → GeneralAvailability before removal
- **Documentation** in `docs/sources/shared/developers/deprecated-apis.md:1-15`: Announces `/api` to `/apis` migration starting Grafana 13
- **Breaking changes guides** (`docs/sources/breaking-changes/breaking-changes-v11-0.md:1-100`): Major releases document all breaking changes with migration paths
- **Announced deprecations table** (`contribute/deprecation-policy.md:29-33`): One tracked deprecation (MySQL 5.7)

**Specific examples**:
- AngularJS support turned off by default in v11 with migration path documented (`breaking-changes-v11-0.md:52-70`)
- Legacy alerting fully removed in v11 with prior migration window (`breaking-changes-v11-0.md:86-94`)

### 3. How does the system evolve its data schema without downtime?

**Database migration system** (`pkg/services/sqlstore/migrations/migrations.go:14-21`):
- Migrations are **never modified once committed** — new migrations are added to change/undo previous migrations
- Migration registrator pattern with ordered execution
- Explicit guidance: "Putting migrations behind feature flags is no longer recommended as broken migrations may not be caught by integration tests"

**Dashboard schema migrations** (`apps/dashboard/pkg/migration/schemaversion/migrations.go:53-97`):
- 42 schema versions (v0 through v42) demonstrating versioning discipline
- `GetMigrations()` returns a map of version → migration function
- `GetSchemaVersion()` extracts version from dashboard JSON (`apps/dashboard/pkg/migration/schemaversion/migrations.go:99-110`)
- Migrations tested via snapshot files in `apps/dashboard/pkg/migration/testdata/input/`

**Panel migrations**:
- Each panel type has its own `migrations.ts` file (e.g., `public/app/plugins/panel/table/migrations.ts`)
- Migrations include test fixtures showing input/output transformations

**No rollback mechanism** — the migration guide explicitly notes migrations "can't be rolled back" (`docs/sources/breaking-changes/_index.md:28`).

### 4. How are breaking changes introduced and migrated?

**Breaking change process**:
1. **Announcement** via deprecation policy and breaking-changes documentation
2. **Grace period** based on feature size (1-2 years for large features)
3. **Migration support** — code migration functions and documentation
4. **Feature disable before removal** — feature is disabled by default before code removal
5. **Code removal** in major release

**Examples**:
- **AngularJS** (`breaking-changes-v11-0.md:52-70`): Turned off by default in v11, full removal in next major release. Migration path: update plugins to React alternatives or use `angular_support_enabled=false` temporarily.
- **Legacy alerting** (`breaking-changes-v11-0.md:86-94`): Entirely removed in v11. v10.4.x was last version offering migration.
- **Reporting endpoints** (`breaking-changes-v11-0.md:95-100`): Deprecated endpoints and fields removed in v11.

**Database migrations**:
- Never change existing migrations — add new ones
- Migrations run automatically on server startup
- Integration tests verify migrations against MySQL and PostgreSQL (`contribute/developer-guide.md:223-241`)

### 5. What rollout patterns are used to limit blast radius of changes?

**Feature toggles** (`pkg/services/featuremgmt/registry.go`):
- **Three stages**: Experimental → PublicPreview → GeneralAvailability
- **Expression-based**: Each flag has an `Expression` field (e.g., `"true"` or `"false"`) evaluated at startup
- **Per-toggle control**: `IsEnabled(ctx, flagName)` API in `pkg/services/featuremgmt/manager.go:100-110`
- **Code generation**: `make gen-feature-toggles` generates constants in `pkg/services/featuremgmt/toggles_gen.go`

**Feature flag characteristics**:
- Simple boolean toggles — no gradual rollout (canary, percentage)
- `RequiresRestart` flag for changes needing server restart
- `RequiresDevMode` flag for development-only features
- Prometheus metrics for each toggle (`pkg/services/featuremgmt/manager.go:95`)

**OpenFeature integration** (`pkg/services/featuremgmt/openfeature.go`):
- Optional provider for external feature flag systems
- Allows integration with commercial feature flag platforms

**No blue-green or canary deployment** — the feature flag system only supports simple enable/disable, not gradual percentage-based rollouts.

**Build tags** for enterprise/features:
- `oss` (default), `enterprise`, `pro` build tags separate enterprise code

## Architectural Decisions

1. **Migration-based schema evolution**: Database and dashboard schema changes use ordered migrations that are never modified once committed. Dashboard schema has 42 versions (`apps/dashboard/pkg/migration/schemaversion/migrations.go:10-13`).

2. **Feature stage lifecycle**: Features progress through Experimental → PublicPreview → GeneralAvailability before removal, allowing gradual adoption and feedback (`pkg/services/featuremgmt/registry.go:17-27`).

3. **No feature flag percentages**: Feature toggles are simple booleans, not gradual rollouts. This limits blast radius control but simplifies implementation.

4. **Breaking changes in major releases only**: Breaking changes documented per major release with migration paths; as of v12.0, breaking changes live in What's New pages (`docs/sources/breaking-changes/_index.md:16-18`).

5. **No rollback for database migrations**: Migrations cannot be rolled back — the system relies on adding new migrations rather than reverting (`pkg/services/sqlstore/migrations/migrations.go:14-16`).

6. **Feature flags no longer recommended for migrations**: The migration guide explicitly discourages feature-flag-gated migrations as they may not be caught by integration tests (`pkg/services/sqlstore/migrations/migrations.go:18-20`).

## Notable Patterns

1. **Migration registrar**: Each domain has a `AddMigration(mg *Migrator)` method called from a central registrar (`pkg/services/sqlstore/migrations/migrations.go:30-179`)

2. **Dashboard schema versioning**: Dashboard JSON includes `schemaVersion` field; migrations are keyed by version number with test fixtures validating each migration

3. **Feature flag code generation**: `make gen-feature-toggles` auto-generates Go constants from registry definition

4. **Deprecation grace periods**: Size-based duration table (Large: 1-2 years, Medium: 6 months, Small: 1-3 months) in `contribute/deprecation-policy.md:21-28`

5. **API migration**: `/api` to `/apis` transition documented as "not breaking current setup" but `/api` routes will no longer be updated (`docs/sources/shared/developers/deprecated-apis.md:9-11`)

## Tradeoffs

1. **Simple feature toggles vs. gradual rollout**: Boolean toggles are easy to understand and implement, but cannot support percentage-based canary releases or A/B testing

2. **No database migration rollback**: Once a migration runs, it cannot be undone. This simplifies the migration system but creates risk if a migration fails mid-way

3. **No formal ADR system**: While practical for a large OSS project, lack of formal ADRs means architectural decision rationale is fragile and may be lost

4. **Feature flags not recommended for migrations**: This limits the ability to A/B test migration paths or disable problematic migrations

5. **Breaking changes in What's New**: As of v12.0, breaking changes are no longer in dedicated pages but in What's New — may reduce visibility for operators tracking changes

## Failure Modes / Edge Cases

1. **Migration failure mid-way**: If a database migration fails, the database is left in a partially migrated state. No rollback mechanism exists.

2. **Feature flag migration gaps**: Migrations behind feature flags may not be caught by integration tests, potentially allowing broken migrations to reach production (`pkg/services/sqlstore/migrations/migrations.go:18-20`)

3. **Deprecated flag still functional**: Cobra's `MarkDeprecated()` in the CLI only shows a warning — the flag continues to work. Same applies to feature toggles that are "deprecated" but not removed.

4. **Angular plugin blocking**: When AngularJS support is disabled in v11, any dashboard using AngularJS-based plugins will fail to load even if the plugin isn't actively used — requires full migration of all plugins.

5. **Schema version extraction failures**: `GetSchemaVersion()` in `apps/dashboard/pkg/migration/schemaversion/migrations.go:99-110` assumes integer schema version — malformed JSON could cause parsing failures.

## Future Considerations

1. **Gradual feature rollout**: Implement percentage-based feature rollout to limit blast radius of new features beyond simple on/off toggles

2. **Migration transaction support**: Add rollback capability for database migrations, potentially using database transactions or explicit rollback migrations

3. **Formal ADR system**: Consider adopting lightweight Architecture Decision Records for significant architectural decisions

4. **Feature flag observability**: Enhanced metrics and alerting for feature flag states to detect configuration drift

5. **Canary deployment support**: Integrate with Kubernetes or other orchestration for true canary/blue-green deployments

## Questions / Gaps

1. **No ADR directory found** — is there an external decision log orRFC process for significant architectural changes?
2. **Feature flag storage** — where are feature flag values stored in production? Is there a centralized service or local config?
3. **No rollback mechanism for migrations** — what happens if a migration fails on a production instance?
4. **Feature flag testing** — are there tests that verify feature flag behavior at boundary conditions (e.g., all flags off)?
5. **No blue-green deployment** — what is the recommended strategy for zero-downtime schema changes in production?
6. **Breaking change notification** — how are operators notified of breaking changes beyond documentation? Is there a mailing list or changelog?

---

Generated by `18-governance-evolution-strategy.md` against `grafana`.