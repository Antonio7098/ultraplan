# Source Analysis: openfga

## Governance & Evolution Strategy

### Source Info

| Field | Value |
|-------|-------|
| Name | openfga |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/openfga` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

OpenFGA demonstrates solid governance and evolution practices through its adherence to Semantic Versioning, formal deprecation policies, structured database migrations using Goose, and a mature experimental feature flag system that enables safe rollout of new capabilities. Shadow/resolver-based A/B testing patterns allow controlled validation of new algorithms. The project publishes detailed changelogs and maintains a written versioning policy document.

## Rating

**7** — Good implementation with minor issues. The project lacks formal Architecture Decision Records (ADRs), instead relying on changelog entries and code comments to document decisions. The deprecation policy is well-defined for the Playground feature but not generalized. The experimental feature flag system is well-engineered, and schema migrations support zero-downtime upgrades.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Semver adherence | CHANGELOG.md states "adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)" | CHANGELOG.md:5 |
| Versioning policy | RELEASES.md defines major.minor.patch versioning with breaking change policy | RELEASES.md:21-28 |
| Version injection | Build ldflags inject Version, Commit, Date at build time | .goreleaser.yaml:19-24 |
| Minimum supported schema | `MinimumSupportedDatastoreSchemaRevision int64 = 4` defines lowest runnable schema | internal/build/build.go:18 |
| Deprecation markers | `PlaygroundConfig` marked `// Deprecated:` with removal notice | pkg/server/config/config.go:267 |
| Deprecation communication | CHANGELOG.md documents deprecation with migration guidance | CHANGELOG.md:73-77 |
| Migration system | Goose-based migrations with Up/Down for all datastore engines | assets/migrations/postgres/*.sql |
| Migration runner | `RunMigrations` function supports embedding, versioned upgrades | pkg/storage/migrate/migrate.go:40 |
| Feature flag system | `Experimental*` constants define all experimental flags | pkg/server/config/config.go:107-120 |
| Feature flag client | `Client` interface with `Boolean(flagName, storeID)` method | pkg/featureflags/client.go:3-5 |
| Shadow/A-B testing | `ShadowResolver` wraps main and shadow `LocalChecker` for parallel evaluation | internal/graph/builder.go:89-92 |
| Shadow timeout config | `DefaultShadowCheckResolverTimeout = 1 * time.Second` | pkg/server/config/config.go:61 |
| Release automation | GoReleaser produces multi-arch images, SBOMs, Homebrew, cosign signatures | .goreleaser.yaml |
| Changelog format | Keep a Changelog format with Added/Changed/Fixed/Security/Deprecated sections | CHANGELOG.md:1-7 |
| Dependencies policy | Written policy for consuming third-party packages | docs/dependencies-policy.md |
| Security tooling | Dependabot, Snyk, Socket, OSSF Scorecard for vulnerability management | .github/SECURITY-INSIGHTS.yml:98-137 |

## Answers to Dimension Questions

### 1. How are architectural decisions documented and revisited?

**Evidence**: No formal ADR (Architecture Decision Record) directory was found in the repository. Architectural decisions are documented through:
- **CHANGELOG.md** — Detailed per-release changelog with categorized changes (Added, Changed, Fixed, Deprecated, Security)
- **RELEASES.md** — Documents versioning policy, release requirements, roles (Release Manager), and artifact production
- **Code comments** — Deprecation markers in config (`pkg/server/config/config.go:267`)
- **SECURITY-INSIGHTS.yml** — Lists governance, review policy, and security champions

The absence of a dedicated ADR directory means decision rationale is not centralized. Engineers must infer intent from PR discussions or code history.

### 2. What is the deprecation policy for APIs and how is it communicated?

**Evidence**: The Playground feature demonstrates a well-documented deprecation:
- **CHANGELOG.md:76-77** states: "The built-in OpenFGA Playground is intended for development purposes only and is deprecated. It will be removed entirely in a future release."
- **Config deprecation** at `pkg/server/config/config.go:267`: `// Deprecated: The built in FGA Playground is deprecated and will be removed in a subsequent release.`
- **Run-time warning** at `cmd/run/run.go:839`: `s.Logger.Warn("⚠️ Please note that the built-in Playground is deprecated and will be removed in a future release")`
- Flag rename deprecation at `cmd/run/flags.go:251` warns about `--check-query-cache-limit` → `--check-cache-limit`

The policy is: mark deprecated in code with `// Deprecated:` comment, document in CHANGELOG under "Deprecated" section, log runtime warnings. No formal policy document exists beyond the Playground example.

### 3. How does the system evolve its data schema without downtime?

**Evidence**: 
- **Goose migrations** with sequential numbered migrations (`001_initialize_schema.sql` through `007_*.sql`) in `assets/migrations/{postgres,mysql,sqlite}/`
- **MinimumSupportedDatastoreSchemaRevision** (`internal/build/build.go:18`) = 4 enforces a floor version below which the binary will not run
- **Add-only migrations** — Migrations add columns (e.g., `005_add_conditions_to_tuples.sql` adds nullable `condition_name TEXT` and `condition_context BYTEA` columns) rather than destructive operations
- **Backward-compatible columns** — New columns are added as nullable or with defaults to avoid requiring immediate backfills
- **Multi-engine migrations** — Each datastore (Postgres, MySQL, SQLite) has its own migration sequence, allowing engine-specific optimizations

No explicit zero-downtime migration strategy document was found. The add-only approach and minimum schema version check are the primary mechanisms.

### 4. How are breaking changes introduced and migrated?

**Evidence**:
- **RELEASES.md:23-24** explicitly states: "Changes in the major and minor version components...may include breaking changes requiring those integrating OpenFGA in their project to make changes in their use of OpenFGA"
- **CHANGELOG.md** marks breaking changes with `**[BREAKING]**` tag (e.g., `CHANGELOG.md:72`: "The Playground now only supports the `none` authentication method...")
- **Feature flags as escape hatch** — Experimental features like `ExperimentalCheckOptimizations`, `ExperimentalListObjectsOptimizations` allow users to opt into behavior before it becomes default, reducing blast radius
- **Patch versions remain backward compatible** per RELEASES.md:27

No explicit migration guide or codemod tooling was found in the repository for guiding users through breaking changes.

### 5. What rollout patterns are used to limit blast radius of changes?

**Evidence**:
- **Experimental feature flags** (`pkg/server/config/config.go:107-120`) — New features disabled by default; users explicitly opt-in via `--experimentals` CLI flag or `OPENFGA_EXPERIMENTALS` env var
- **Shadow/A-B testing** (`internal/graph/builder.go:89-92`) — `ShadowResolver` runs two `LocalChecker` instances in parallel (main + shadow), comparing results. Enabled via `ExperimentalShadowCheck = "shadow_check"` and `ExperimentalShadowWeightedGraphCheck`
- **Shadow list objects** (`pkg/server/commands/list_objects_shadow.go`) — `ShadowedListObjectsQuery` executes pipeline and non-pipeline algorithms concurrently with configurable timeout (`DefaultShadowListObjectsQueryTimeout = 1 * time.Second`) and delta item limit
- **Configurable dispatch throttling** (`DefaultCheckDispatchThrottlingEnabled = false`) allows gradual enablement of dispatch throttling
- **Multi-arch multi-tag images** via GoReleaser (`openfga/openfga:latest`, `v{Major}`, `v{Major}.{Minor}`, `v{Version}`) enabling gradual rollout via image tag updates

## Architectural Decisions

| Decision | Evidence |
|----------|----------|
| Semantic Versioning | CHANGELOG.md:5, RELEASES.md:21-28 |
| Keep a Changelog format | CHANGELOG.md:4 |
| Goose for migrations | pkg/storage/migrate/migrate.go:11 (imports `github.com/pressly/goose/v3`) |
| GoReleaser for release automation | .goreleaser.yaml (full CI/CD pipeline) |
| Static feature flags (no external service) | pkg/featureflags/client.go — `defaultClient` uses in-memory map |
| Shadow/A-B resolver pattern | internal/graph/builder.go:89-92 |
| Minimum schema version floor | internal/build/build.go:18 |
| Breaking changes in major/minor only | RELEASES.md:23-24 |

## Notable Patterns

1. **ShadowResolver circular linked list** — Resolvers compose as a circular linked list where the last resolver delegates back to the first. Shadow mode wraps two `LocalChecker` instances, running them in parallel and comparing outputs (`internal/graph/builder.go:89-92`).

2. **Experimental flag naming convention** — Documented policy in `pkg/server/config/config.go:111-113`: no `enable-`/`disable-` prefixes; only numbers, letters, and underscores.

3. **Goose migration up/down** — Each migration has `+goose Up` and `+goose Down` sections enabling rollback capability (`assets/migrations/postgres/005_add_conditions_to_tuples.sql:1-6`).

4. **Multi-arch image tags** — GoReleaser produces `latest`, `v{Major}`, `v{Major}.{Minor}`, `v{Major}.{Minor}.{Patch}` tags enabling canary via tag selection.

5. **Experimental-first rollout** — Features ship behind experimental flags, graduated to default in subsequent releases (e.g., `ExperimentalPipelineListObjects` became default in v1.11.6 per CHANGELOG.md:127).

## Tradeoffs

| Tradeoff | Evidence |
|----------|----------|
| No ADR directory | Architectural rationale not formally documented; must rely on PR history and code comments |
| Static feature flags (no external service) | Simple and reliable but lacks per-user/tenant override; no real-time toggle |
| Shadow testing doubles compute | ShadowResolver executes both main and shadow paths, doubling latency and resource usage under shadow mode |
| In-memory flag map on restart | Feature flags are compile-time constants passed at startup; no dynamic propagation without process restart |
| Migration add-only strategy | Constraints schema evolution to additive changes; restructuring existing columns requires multi-step migration |

## Failure Modes / Edge Cases

1. **Schema version mismatch** — If a deployment skips migrations or has an older schema than `MinimumSupportedDatastoreSchemaRevision` (`internal/build/build.go:18`), the binary refuses to start rather than attempting a potentially unsafe migration.

2. **Shadow timeout silent fallback** — When shadow query exceeds `shadowTimeout` (default 1 second), its result is discarded and the main result used. This means silent divergence can occur if shadow is slower but more correct (`pkg/server/commands/list_objects_shadow.go:27`).

3. **Experimental flags with no graceful degradation** — Some experimental features (e.g., `authzen`) return `codes.Unimplemented` if the flag is absent, rather than falling back to equivalent functionality (`pkg/server/authzen.go:95`).

4. **Goose Down migrations untested in production** — While up/down migrations exist, down migrations are rarely run in production. The `+goose Down` blocks in migration files could contain bugs given infrequent use.

5. **Feature flag proliferation** — The `Experimentals` slice is appended to without a registry. New experimental flags could conflict with future ones or be misspelled silently.

## Future Considerations

1. **Formal ADR process** — Adopt a lightweight ADR format (e.g., MADR) to document significant architectural decisions with context, options considered, and consequences. This would improve long-term maintainability.

2. **Generalized deprecation policy** — Extend the Playground deprecation pattern into a formal `DEPRECATED.md` or deprecation policy document that applies to all API surfaces.

3. **Migration documentation** — For each breaking schema change, provide a migration guide in `docs/migrations/` explaining the upgrade path and any required data backfills.

4. **External feature flag service** — Consider integrating with a proper feature flag service (e.g., LaunchDarkly, Unleash) for per-tenant flag overrides and real-time toggling without restart.

5. **Schema evolution governance** — Establish conventions that schema migrations must be additive (no column drops in same major version), with explicit policy on when column deprecation and removal occurs.

## Questions / Gaps

| Question | Status |
|----------|--------|
| Where are architectural decisions formally recorded? | **No evidence** — No ADR directory found |
| Is there a formal deprecation policy document? | **Partial** — Playground deprecation is documented, but no generalized policy |
| Are down migrations tested in CI? | **No evidence found** — No test coverage for `+goose Down` blocks |
| How are breaking API changes communicated beyond changelog? | **No evidence found** — No migration guides or upgrade guides in docs/ |
| Is there a schema compatibility matrix (e.g., v1.x binary with v1.y schema)? | **No evidence found** — Only `MinimumSupportedDatastoreSchemaRevision` floor is enforced |

---

Generated by `dimensions/18-governance-evolution-strategy.md` against `openfga`.
