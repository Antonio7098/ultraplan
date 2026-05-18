# Repo Analysis: restic

## Configuration Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | restic |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/restic` |
| Group | `04-configuration-management` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

restic uses a layered configuration system with clear precedence: CLI flags override environment variables, which are initialized from env vars at startup (`global.Options.AddFlags` at `internal/global/global.go:91-136`). Repository location supports multiple sources (flag, env var, file). Password resolution follows a strict order: password-file → password-command → env var → interactive prompt. Backend configs implement `backend.ApplyEnvironmenter` (`internal/backend/backend.go:140-142`) to populate credentials from environment. Validation is centralized in `PreRun` and in `repository.New()` which validates compression mode and pack size. Extended options use a reflection-based `Options.Apply()` at `internal/options/options.go:148`.

## Rating

**8/10** — Centralized global options with clear layering. CLI flag precedence over env vars is consistently implemented. However, config sources are limited to flags/env vars/files (no dedicated config file format); each backend's config is parsed separately without a unified schema.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Global Options struct | `Options` struct with Repo, Password, Compression, PackSize fields | `internal/global/global.go:46-89` |
| Flag definitions | All global flags registered via `AddFlags` | `internal/global/global.go:91-119` |
| Env var initialization | Env vars read into options in `AddFlags` | `internal/global/global.go:121-135` |
| PreRun validation | `PreRun` validates PackSize, Compression env values | `internal/global/global.go:138-183` |
| Password resolution order | `resolvePassword` checks password-file, password-command, then env var | `internal/global/global.go:186-212` |
| Precedence logic | `packSizeFlag.Changed` and `compressionFlag.Changed` detect if CLI flag was set | `internal/global/global.go:139,147` |
| ApplyEnvironmenter interface | Backend configs implement `ApplyEnvironment` for env var population | `internal/backend/backend.go:140-142` |
| S3 ApplyEnvironment | S3 config fills AWS region from env | `internal/backend/s3/config.go:112-116` |
| CompressionMode validation | `CompressionInvalid` caught in `repository.New()` | `internal/repository/repository.go:126-128` |
| PackSize validation | Pack size bounds checked in `repository.New()` | `internal/repository/repository.go:130-137` |
| Extended options parsing | Reflection-based option application | `internal/options/options.go:148-219` |
| Backend config parsing | `parseConfig` applies env to backend config via `ApplyEnvironment` | `internal/global/global.go:533-534` |
| Feature flags | RESTIC_FEATURES env var processed at startup | `cmd/restic/main.go:169-175` |

## Answers to Protocol Questions

### 1. How are flags, env vars, and config files merged?

CLI flags are bound via `pflag.Var` calls in `AddFlags` (`internal/global/global.go:91-119`). Environment variables are read into option fields *after* flag registration (`internal/global/global.go:121-135`), just before the cobra command executes. There is no dedicated config file format; instead, `--repository-file` reads a file containing the repository URL (e.g., `local:/path/to/repo`). Extended options (`-o ns.key=value`) are parsed via reflection and applied to backend configs in `parseConfig` (`internal/global/global.go:526-545`).

**Precedence**: CLI flag (explicitly checked via `packSizeFlag.Changed`) > env var > default.

### 2. What precedence rules exist?

For most options: **flag > env var > default**.

For `PackSize` and `Compression`, env vars are only applied if the flag was NOT set (`!opts.packSizeFlag.Changed` at `internal/global/global.go:139`, `!opts.compressionFlag.Changed` at `internal/global/global.go:147`). This means if a user passes `--pack-size=64`, the `RESTIC_PACK_SIZE` env var is ignored.

For password: **password-file > password-command > RESTIC_PASSWORD env var > interactive prompt** (checked in `resolvePassword` at `internal/global/global.go:186-212`).

For repository location: **`-r`/`--repo` flag > `--repository-file` flag > `$RESTIC_REPOSITORY` env var** (`readRepo` at `internal/global/global.go:273-296`).

### 3. Is config immutable after startup?

**Mostly yes**. Once `PreRun` completes and the repository is opened, the `global.Options` struct is not modified. Password is stored in `opts.Password` after resolution (`internal/global/global.go:181`). The `Options` map used for extended options is also immutable after `PreRun`. However, the `Options` struct uses embedded `options.Options` (`internal/global/global.go:83`) which is a plain `map[string]string` — no immutability enforcement.

### 4. Is validation centralized?

**Partially**. Validation of `PackSize` and `Compression` env values happens in `PreRun` (`internal/global/global.go:138-183`). Repository-level validation (compression mode invalid, pack size bounds) happens in `repository.New()` (`internal/repository/repository.go:126-137`). However, pattern validation for include/exclude happens in command-specific PreRun functions (e.g., `internal/filter/filter.go:231` used in `cmd/restic/cmd_backup.go:56-72`). There is no single validation entry point; it's distributed across command pre-run hooks and repository initialization.

## Architectural Decisions

- **Centralized global options**: All commands share the same `global.Options` struct, passed by reference to allow `PersistentPreRunE` to modify it (`cmd/restic/main.go:76`). This provides consistent config across all subcommands.
- **Flag/env var precedence via pflag tracking**: The `packSizeFlag` and `compressionFlag` pointers (`internal/global/global.go:87-88`) track whether a flag was explicitly set on the command line. This allows env vars to provide defaults while still letting CLI flags take precedence.
- **Backend-specific env var application**: Each backend config implements `ApplyEnvironmenter` to populate credentials from environment (e.g., `AWS_DEFAULT_REGION` for S3 at `internal/backend/s3/config.go:113-116`). This keeps backend-specific env vars decoupled from global options.
- **No config file format**: restic does not use JSON/TOML/YAML config files. Repository location can be read from a file via `--repository-file`, but all other configuration comes from flags and env vars. This simplifies deployment but limits expressiveness.

## Notable Patterns

- **`ApplyEnvironmenter` interface** (`internal/backend/backend.go:140-142`): Each backend config struct implements `ApplyEnvironment(prefix)` to read backend-specific env vars (AWS, RESTIC\_*, etc.).
- **`pflag.Flag.Changed` tracking**: Used to detect CLI flag usage without custom parsing (`internal/global/global.go:139,147`).
- **Reflection-based extended options**: `Options.Apply()` uses struct tags (`option:"key"`) to set fields via reflection (`internal/options/options.go:148-219`).
- **ErrorFatal wrapper**: Uses `errors.Fatalf` for startup validation failures that should terminate immediately (`internal/global/global.go:143`).

## Tradeoffs

- **No dedicated config file**: Users cannot persist complex configuration (compression level, pack size, backends) to a file. Every setting must be passed via flag or env var on each invocation.
- **Limited env var coverage**: Only select env vars (`RESTIC_REPOSITORY`, `RESTIC_PASSWORD`, `RESTIC_COMPRESSION`, `RESTIC_PACK_SIZE`, etc.) are read. Backend-specific credentials (AWS\_*) must use the `ApplyEnvironment` mechanism and are not validated centrally.
- **Validation scattered**: Compression and pack size are validated centrally, but pattern validation happens per-command. A future refactor could consolidate all startup validation.
- **No schema for extended options**: Extended options (`-o`) use a generic key=value map applied via reflection. There's no compile-time safety or documentation schema.

## Failure Modes / Edge Cases

- **Conflicting password sources**: If both `--password-file` and `--password-command` are set, `resolvePassword` returns a fatal error (`internal/global/global.go:187-188`).
- **Invalid env var values**: `RESTIC_PACK_SIZE` and `RESTIC_COMPRESSION` env values are validated in `PreRun` and cause fatal errors if malformed (`internal/global/global.go:143,149`).
- **Repository not found**: `hasRepositoryConfig` checks the config file exists and is non-empty before proceeding (`internal/global/global.go:340-356`).
- **Pack size out of bounds**: `repository.New()` rejects pack sizes outside `[MinPackSize, MaxPackSize]` (`internal/repository/repository.go:133-137`).
- **Invalid compression mode**: `CompressionInvalid` is caught in `repository.New()` (`internal/repository/repository.go:126-128`).

## Future Considerations

- Add a dedicated config file format (TOML/YAML) for persisting complex configuration across invocations.
- Consolidate all startup validation into a single `Validate()` method on `Options`.
- Add schema/type validation for extended options at registration time (instead of only at reflection Apply time).
- Enforce immutability of `Options` after `PreRun` completes (use a frozen/copy-on-write pattern).

## Questions / Gaps

- **No evidence** that XDG config directories are consulted for defaults (e.g., `~/.config/restic/`). This is a gap compared to modern CLI best practices.
- **No evidence** of validation for `--repo` URL format at startup — parsing is deferred to `location.Parse`.
- **No evidence** of schema documentation for extended options beyond the runtime `options` command listing (`cmd/restic/cmd_options.go:27-38`).