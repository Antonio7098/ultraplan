# Source Analysis: cli

## Governance & Evolution Strategy

### Source Info

| Field | Value |
|-------|-------|
| Name | cli |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/cli` |
| Language / Stack | Go (v1.26.0) |
| Analyzed | 2026-05-20 |

## Summary

GitHub CLI (`gh`) is a mature open-source CLI tool that demonstrates solid governance and evolution practices. It enforces semver via workflow validation (`deployment.yml:38-41`), uses a migration-based config versioning system (`internal/config/migration/`), supports multiple GHES versions via feature detection (`internal/featuredetection/feature_detection.go`), and communicates deprecations through standard Go flag mechanisms. The project lacks a formal ADR system but has extensive release documentation and a comprehensive deployment workflow.

## Rating

**7/10** — Good implementation with minor issues. The project excels at GHES compatibility handling and migration-based config evolution, but lacks formal ADR documentation, has no feature flags beyond API preview headers, and the deprecation policy is implicit rather than documented.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Semver enforcement | Tag validation in deployment workflow | `.github/workflows/deployment.yml:38-41` |
| Config migrations | Migration-based versioning system | `internal/config/config.go:182-209` |
| Multi-account migration | Config migration example | `internal/config/migration/multi_account.go:31-84` |
| Feature detection | GHES version-based capability detection | `internal/featuredetection/feature_detection.go:273-290` |
| API preview flags | `--preview` flag for feature-flagged APIs | `pkg/cmd/api/api.go:90-95` |
| Flag deprecation | `MarkDeprecated()` for flag deprecation | `pkg/cmd/repo/delete/delete.go:82` |
| Deprecation testing | Tests for deprecation warnings | `pkg/cmd/pr/view/view_test.go:878-880` |
| Release process | Detailed release documentation | `docs/release-process-deep-dive.md:1-679` |
| GoReleaser config | Binary build configuration | `.goreleaser.yml:1-113` |
| Backward compatibility | SSH key backward compat handling | `pkg/cmd/codespace/ssh.go:423` |

## Answers to Dimension Questions

### 1. How are architectural decisions documented and revisited?

**No formal ADR system found.** The project does not maintain Architecture Decision Records. Instead, architectural decisions are documented in:
- The extensive `docs/release-process-deep-dive.md` which details the release workflow
- Code comments with `// TODO <identifier>` patterns for future changes (e.g., `// TODO projectsV1Deprecation` in `pkg/cmd/pr/view/view.go:26`)
- The `AGENTS.md` file documents architecture, testing patterns, and code conventions

The lack of formal ADR documentation means decision rationale is embedded in code comments or lost to history.

### 2. What is the deprecation policy for APIs and how is it communicated?

**Flag deprecation** is handled via Cobra's built-in `MarkDeprecated()` and `MarkShorthandDeprecated()` methods:
- `pkg/cmd/repo/delete/delete.go:82`: `_ = cmd.Flags().MarkDeprecated("confirm", "use `--yes` instead")`
- `pkg/cmd/codespace/common.go:243`: `cmd.Flags().MarkShorthandDeprecated("repo-deprecated", "use `-R` instead")`

**API deprecation** is communicated via GitHub's standard `Deprecation` and `Sunset` headers which the project acknowledges in `.github/workflows/scripts/spam-detection/eval-prompts.yml:849`.

**Project deprecation** uses Cobra's `Deprecated` field on commands (`internal/docs/docs_test.go:71`).

No formal deprecation policy document was found.

### 3. How does the system evolve its data schema without downtime?

**Config migration system** in `internal/config/config.go:182-209`:
- Migrations have `PreVersion()` and `PostVersion()` to track applied migrations
- The system validates pre-version matches before applying
- Prevents re-applying already-applied migrations
- Example: `multi_account.go:76-84` defines PreVersion="" and PostVersion="1"

**No database schema** — this is a CLI tool, not a server application, so schema evolution concerns are limited to config files.

The config migration system is well-structured with proper version tracking, but there's no provision for rollback if a migration fails mid-way.

### 4. How are breaking changes introduced and migrated?

**Config breaking changes**: Handled via migration system. Example in `docs/multiple-accounts.md:126-136` discusses maintaining forward compatibility for `go-gh` users while migrating `gh`'s config schema.

**API breaking changes**: Not explicitly documented. The feature detection system (`internal/featuredetection/feature_detection.go`) handles GHES version differences, but there's no documented process for introducing breaking API changes.

**CLI breaking changes**: The `docs/releasing.md:45-46` notes "Breaking releases should bump up the major version number. These should generally be rare."

**No explicit breaking change migration guide** was found in the codebase.

### 5. What rollout patterns are used to limit blast radius of changes?

**Feature detection at runtime** (`internal/featuredetection/feature_detection.go:157-165`):
- Queries the GitHub API schema to detect available features
- Falls back to legacy behavior for older GHES versions
- Examples: `ProjectsV1()` checks GHES version against `enterpriseProjectsV1Removed = "3.17.0"` (line 274)

**API preview flags** (`pkg/cmd/api/api.go:90-95`):
- Uses `-p/--preview` flag to opt into feature-flagged APIs
- GitHub API preview headers are explicitly documented

**No feature flags for CLI behavior** — the CLI does not have internal feature flags beyond API preview headers. This means behavioral changes cannot be rolled out gradually to users.

**Build-time platform selection** — `script/release --platform` allows building for specific OSes independently (`docs/release-process-deep-dive.md:28-30`).

## Architectural Decisions

1. **Migration-based config versioning**: Uses a version key in config to track applied migrations, preventing re-application and ensuring compatibility (`internal/config/config.go:182-209`)

2. **Feature detection over version branching**: Detects API capabilities at runtime rather than maintaining separate code paths for different GHES versions (`internal/featuredetection/feature_detection.go:14-23`)

3. **GoReleaser for builds**: Standardized build pipeline across all platforms using GoReleaser (`.goreleaser.yml`)

4. **No ADR system**: Architectural decisions are not formally documented as ADRs — rationale exists only in code comments and GitHub PRs

## Notable Patterns

1. **Cobra deprecation pattern**: Standard Go Cobra `MarkDeprecated()` and `MarkShorthandDeprecated()` for CLI flag deprecation with user-facing messages

2. **Config migration pattern**: `PreVersion()` / `PostVersion()` pattern for tracking migration state with forward compatibility comments (`internal/config/migration/multi_account.go:66-69`)

3. **Feature detection with TODO cleanup**: Comments like `// TODO someFeatureCleanup` mark code awaiting GHES version cutoff (`internal/featuredetection/feature_detection.go:162-163`)

4. **Backward compatibility for SSH keys**: Renames old keypair files to new names on first use (`pkg/cmd/codespace/ssh.go:423`)

## Tradeoffs

1. **No feature flags beyond preview headers**: The CLI cannot gradually roll out new behaviors to subsets of users — all changes are immediate

2. **Migration cannot rollback**: If a config migration fails, the error is returned but partial state may exist. The migration system has no rollback mechanism (`internal/config/config.go:204-205`)

3. **No formal ADR system**: While practical for a CLI tool, the lack of ADRs means knowledge of architectural decisions is fragile and dependent on code comments surviving

4. **GHES version coupling**: The feature detection system requires ongoing maintenance as new GHES versions are released — version constants like `enterpriseProjectsV1Removed = "3.17.0"` (`feature_detection.go:274`) must be updated manually

## Failure Modes / Edge Cases

1. **Config migration failure**: If `Write()` fails after `m.Do()` succeeds, the config is left in a partially migrated state (`internal/config/config.go:197-205`)

2. **GHES version detection failure**: If `resolveEnterpriseVersion()` fails, feature detection falls back to conservative defaults, potentially disabling features that are actually available (`internal/featuredetection/feature_detection.go:282-289`)

3. **Deprecated flag still works**: Cobra's `MarkDeprecated()` only shows a warning — the flag continues to function, which may hide broken functionality from users until the flag is fully removed

4. **Forward compatibility exclusion**: The `multi_account` migration comment notes one known case using `--insecure-storage` where complete compatibility is not maintained (`docs/multiple-accounts.md:138`)

## Future Considerations

1. **Formal ADR system**: Consider adopting a lightweight ADR process for significant architectural decisions

2. **Rollback mechanism for migrations**: Add transaction-like behavior or explicit rollback support for config migrations

3. **Internal feature flags**: Implement a feature flag system for gradual CLI behavior rollout (beyond just API preview headers)

4. **Deprecation policy document**: Create a formal deprecation policy explaining timelines and communication methods

## Questions / Gaps

1. **No formal ADR directory found** — is there a decision log elsewhere?
2. **No changelog file** — how are users informed of changes between versions? (Release notes are generated from GitHub PRs)
3. **No schema evolution documentation for config** — is the config migration system documented beyond the code?
4. **No semantic versioning policy document** — the `docs/releasing.md` mentions bumping major for breaking changes but no formal policy
5. **Feature detection version constants are manually updated** — is there automation or reminders for GHES version cutoffs?

---

Generated by `18-governance-evolution-strategy.md` against `cli`.