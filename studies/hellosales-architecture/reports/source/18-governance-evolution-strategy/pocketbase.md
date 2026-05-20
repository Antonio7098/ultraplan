# Source Analysis: pocketbase

## Governance & Evolution Strategy

### Source Info

| Field | Value |
|-------|-------|
| Name | pocketbase |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/pocketbase` |
| Language / Stack | Go (v1.25.0) |
| Analyzed | 2026-05-20 |

## Summary

PocketBase employs a migration-first approach to schema evolution with a well-structured `core.SystemMigrations` and `core.AppMigrations` dual-track system. The framework uses timestamped migration files, supports both up/down migrations, and provides an automigrate plugin that captures collection changes as migration snapshots. Deprecation is communicated via CHANGELOG entries with "soft-deprecated" markers, but there is no formal ADR process or feature flag infrastructure. Breaking changes are documented per-release with migration guides. The system has no canary or blue-green rollout mechanisms — version upgrades are handled purely at the binary level.

## Rating

**6/10** — Basic implementation with gaps. The migration system is solid and well-tested, but governance is informal (no ADR), deprecation is changelog-only, and there are no feature flags or staged rollout mechanisms to limit blast radius.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Migration system | `SystemMigrations` and `AppMigrations` dual lists | `core/migrations_runner.go:14-15` |
| Migration runner | `MigrationsRunner` struct with Up/Down/Run commands | `core/migrations_runner.go:19-20` |
| Migration registration | `Register` function with auto filename detection | `core/migrations_list.go:61-83` |
| Reapply condition | `ReapplyCondition` hook for conditional re-migration | `core/migrations_list.go:13` |
| Reapply implementation | Checks if `_logs` table exists before reapplying | `migrations/1640988000_aux_init.go:30-34` |
| Automigrate plugin | Binds to collection CRUD request events | `plugins/migratecmd/migratecmd.go:83-86` |
| Auto-diff generation | `automigrateOnCollectionChange` generates diff templates | `plugins/migratecmd/automigrate.go:18-96` |
| Version variable | `Version` set via ldflags in release | `pocketbase.go:27` |
| Goreleaser config | Version injected via `-X github.com/pocketbase/pocketbase.Version={{ .Version }}` | `.goreleaser.yaml:16` |
| Soft deprecation | Soft-deprecated `GetFile` in favor of `GetReader` | `CHANGELOG.md:537` |
| Soft deprecation example | `Record.GetUploadedFiles` deprecated in favor of `GetUnsavedFiles` | `CHANGELOG.md:768` |
| Breaking change docs | v0.23 upgrade guide links in CHANGELOG | `CHANGELOG.md:970-971` |
| Migration history table | `_migrations` table with file+applied timestamp | `core/migrations_runner.go:252-256` |
| Transactional migrations | Nested transaction pattern for migration safety | `core/migrations_runner.go:129-166` |

## Answers to Dimension Questions

### 1. How are architectural decisions documented and revisited?

**No formal ADR process found.** Architectural decisions are documented exclusively in the CHANGELOG, typically as release-level narrative descriptions. For example, v0.23's major refactor is described in CHANGELOG.md:975-1005 with bullet points explaining the "why" behind the redesign (merged `daos`, replaced `echo` with new router, converted admins to `_superusers`). There is no `docs/adr/` directory or similar ADR tracking system. When decisions need to be revisited (e.g., reverting a change), the mechanism is the `ReapplyCondition` hook on individual migrations — not a structured decision log.

### 2. What is the deprecation policy for APIs and how is it communicated?

**Soft-deprecation via CHANGELOG with no version guarantee.** PocketBase uses "soft-deprecated" terminology in CHANGELOG.md (e.g., CHANGELOG.md:537, 768, 606). When an API is soft-deprecated, the old version typically continues working for at least one minor release, accompanied by a console warning. For example, `filesystem.System.GetFile(fileKey)` was soft-deprecated in favor of `GetReader(fileKey)` with the note that "the old method will still continue to work for at least until v0.29.0." There is no formal deprecation timeline policy or `// @deprecated` annotation standard in the codebase (though some JSVM types do use JSDoc `@deprecated`). No formal sunset schedule exists.

### 3. How does the system evolve its data schema without downtime?

**Migration-based with transaction wrapping and conditional reapply.** Schema evolution is handled entirely through the migration system. Migrations run inside nested transactions (`core/migrations_runner.go:129-166`) so a failure rolls back completely. The `ReapplyCondition` mechanism (`core/migrations_list.go:13`) allows migrations to check whether reapplication is needed — for example, `1640988000_aux_init.go:30-34` re-applies only if the `_logs` table doesn't exist. System migrations (like the initial schema creation in `migrations/1640988000_init.go`) run as part of bootstrap (`core/base.go:784-786`). Automigrate can auto-generate collection change migrations on create/update/delete events (`plugins/migratecmd/automigrate.go:18-96`).

### 4. How are breaking changes introduced and migrated?

**Documented per-release with upgrade guides, but no automated migration tools for user code.** Major breaking changes are flagged with "⚠️" in CHANGELOG and accompanied by migration documentation links (e.g., CHANGELOG.md:970 for v0.23 upgrade guides). The codebase itself uses proper up/down migration pairs — the v0.23 migration (`migrations/1717233556_v0.23_migrate.go`) transforms old `_admins` table to `_superusers`, renames columns, migrates settings, etc. However, for user-defined hooks and SDK code, no automated transformation exists — the burden is on the user to read upgrade guides. The CHANGELOG explicitly notes for v0.23: "Existing `pb_data` will be automatically upgraded with the start of the new executable, but custom Go or JSVM (`pb_hooks`, `pb_migrations`) and JS/Dart SDK code will have to be migrated manually" (`CHANGELOG.md:967-968`).

### 5. What rollout patterns are used to limit blast radius of changes?

**No formal rollout patterns.** There are no feature flags, canary deployments, or blue-green rollout mechanisms in the PocketBase codebase. The release artifact is a single binary built via goreleaser (`.goreleaser.yaml`). Version is injected at build time via ldflags (`-X github.com/pocketbase/pocketbase.Version={{ .Version }}`). The closest thing to blast radius limitation is the automigrate plugin's ability to generate diff-based migration files before applying them, giving operators a chance to review changes before they hit the database. The `history-sync` command (`migrations_runner.go:107-113`) allows syncing the migrations table with available files. No progressive exposure or A/B testing infrastructure exists.

## Architectural Decisions

- **Dual-track migrations**: `core.SystemMigrations` (internal, runs on bootstrap) vs `core.AppMigrations` (user-defined, runs separately). This separates core schema evolution from user code changes (`core/migrations_runner.go:14-15`, `pocketbase.go:21`).
- **Timestamped filenames**: Migration files use Unix timestamps as prefixes (e.g., `1640988000_init.go`, `1717233556_v0.23_migrate.go`) for automatic sorting — no explicit version numbering beyond the filename.
- **Conditional reapplication**: The `ReapplyCondition` hook allows migrations to be re-applied under specific conditions (e.g., table missing), enabling safe idempotent schema repair without manual intervention (`core/migrations_list.go:13`).
- **No formal API versioning**: The REST API does not have versioned endpoints (e.g., `/api/v1/`). Breaking changes are handled at the release level with migration documentation.
- **Soft-deprecation over hard removal**: Newer APIs replace older ones with a "soft-deprecated" period where the old API continues working with a console warning, before eventual removal in a future major version.

## Notable Patterns

- **Nested transaction migration execution**: Migrations run inside `AuxRunInTransaction` containing `RunInTransaction`, providing dual-rollback safety (`core/migrations_runner.go:129-166`).
- **Microsecond-precision applied timestamps**: Migration apply time is stored as `time.Now().UnixMicro()` to handle rapid successive migrations without collisions (`core/migrations_runner.go:280-281`).
- **Auto-diff migration generation**: The automigrate plugin hooks into collection create/update/delete events, compares old vs new collection schemas, and generates corresponding Go or JS migration files (`plugins/migratecmd/automigrate.go:18-96`).
- **Migration template generation**: The CLI supports `migrate create` and `migrate collections` to scaffold migration files, with templates available in both Go and JS languages (`plugins/migratecmd/migratecmd.go:96-144`).
- **Backward compatibility comments**: Throughout the codebase, comments explicitly note when code is preserved for backward compatibility, e.g., `apis/api_error_aliases.go:5` — "ApiError aliases to minimize the breaking changes with earlier versions."

## Tradeoffs

- **No ADR process**: While the CHANGELOG is thorough, the lack of a formal Architecture Decision Record process means reasoning about "why" a particular decision was made requires reading commit history and issues rather than a structured document. This is acceptable for a single-maintainer project but creates governance debt for multi-contributor scenarios.
- **No feature flags**: Without feature flags, all changes are all-or-nothing at the binary level. This is fine for a self-contained binary but makes it impossible to stage feature rollouts or do A/B testing of new behavior.
- **Single-file migration execution**: Migrations execute sequentially by filename sort, with no parallelization or per-collection migration isolation. For large schemas with many collections, this is a bottleneck but ensures ordering consistency.
- **CHANGELOG-only deprecation**: No formal policy ensures deprecated APIs have a minimum support window. "Soft-deprecated" is vague — it could mean one release or many, depending on maintainer discretion.
- **No schema migration validation**: While migrations run in transactions, there is no schema validation step after migration completion to ensure the resulting schema matches expected state — the system trusts the migration code.

## Failure Modes / Edge Cases

- **Migration failure on bootstrap**: If a system migration fails during bootstrap, the application cannot start. There is no fallback or "skip migrations" mode — the migration must succeed or the app is non-functional.
- **ReapplyCondition could be misused**: The `ReapplyCondition` hook could be implemented incorrectly, causing migrations to re-apply incorrectly or in a loop if the condition check has side effects.
- **Orphaned migration entries**: If a migration file is deleted after being applied, the `_migrations` table still has the entry but the file no longer exists. The `history-sync` command exists to handle this (`core/migrations_runner.go:231-244`), but it must be manually invoked.
- **Automigrate race conditions**: If two admins modify the same collection simultaneously via the UI, the automigrate system could generate conflicting migration files with the same timestamp. No file collision detection exists.
- **No rollback on partial collection migration**: If automigrate generates a migration for a collection update and the migration file save succeeds but the DB insert fails, the migration file exists on disk but isn't recorded in `_migrations` — it could be re-applied on next startup.

## Future Considerations

- **ADR documentation**: Consider adopting a lightweight ADR process (e.g., `docs/adr/`) for significant architectural decisions. This would help future maintainers understand the reasoning behind design choices.
- **Formal deprecation policy**: Define a minimum support period for soft-deprecated APIs (e.g., "at least 2 minor releases") with a formal `// @deprecated` JSDoc standard in the JSVM.
- **Feature flag infrastructure**: If staged rollouts become important (e.g., for SaaS multi-tenant deployments), consider adding a runtime flag system to toggle new behavior pertenant or per-instance.
- **Schema validation post-migration**: After running migrations, run a validation step that asserts expected table/column existence to catch migration errors early.
- **Migration conflict detection for automigrate**: Add a check to detect concurrent automigrate file generation and either serialize or warn.

## Questions / Gaps

- **No ADR directory**: Searches for `ADR`, `decisions/`, `architecture/` yielded no formal decision documentation. This is a gap for governance transparency.
- **No versioned API endpoints**: The REST API has no `/api/v1/` style versioning, making it harder to evolve APIs without breaking existing clients.
- **No rollback testing**: The migration test file (`core/migrations_runner_test.go`) tests up/down functionality, but it is unclear if there are integration tests verifying that down-migrations actually restore the prior state correctly.
- **No formal breaking change policy**: There's no documented policy on what constitutes a "breaking change" and how it should be communicated (beyond the ad-hoc CHANGELOG approach).
- **Soft-deprecation is vague**: The term "soft-deprecated" appears frequently but no formal definition exists — how long is "soft"? Until which version? The ambiguity creates uncertainty for API consumers.

---

Generated by `dimensions/18-governance-evolution-strategy.md` against `pocketbase`.