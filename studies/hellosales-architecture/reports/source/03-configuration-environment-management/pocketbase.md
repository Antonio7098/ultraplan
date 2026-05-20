# Source Analysis: pocketbase

## Configuration & Environment Management

### Source Info

| Field | Value |
|-------|-------|
| Name | pocketbase |
| Path | `sources/pocketbase` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

PocketBase implements configuration through a layered approach: CLI flags for bootstrap-time settings, environment variables for secrets, and a database-backed Settings model for runtime configuration. Settings are stored in SQLite, optionally encrypted with an env-derived key, and can be modified at runtime via admin API. Hot-reload is supported for most settings through hook mechanisms.

## Rating

**7/10** — Good implementation with minor issues

PocketBase has a solid configuration system with proper validation, encryption support for sensitive data, and runtime reload capability. However, it lacks explicit feature flags, env variable interpolation for config values, and remote configuration support.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| CLI flags | `PocketBase` struct defines `dataDirFlag`, `encryptionEnvFlag`, `queryTimeout`, `devFlag` | `pocketbase.go:36-40` |
| Config struct | `Config` struct defines defaults for `DataMaxOpenConns`, `DataMaxIdleConns`, `AuxMaxOpenConns`, `AuxMaxIdleConns`, `DBConnect` | `pocketbase.go:46-63` |
| BaseApp config | `BaseAppConfig` struct holds `DataDir`, `EncryptionEnv`, `QueryTimeout`, `IsDev`, and connection pool settings | `core/base.go:58-69` |
| Flag parsing | `eagerParseFlags()` registers `--dir`, `--encryptionEnv`, `--dev`, `--queryTimeout` flags | `pocketbase.go:219-248` |
| Settings model | `Settings` struct embeds `MetaConfig`, `SMTPConfig`, `S3Config`, `BackupsConfig`, `RateLimitsConfig`, etc. | `core/settings_model.go:122-143` |
| Default settings | `newDefaultSettings()` provides hardcoded defaults for all config sections | `core/settings_model.go:145-188` |
| Env-based encryption | `EncryptionEnv()` returns the env var name; `os.Getenv(app.EncryptionEnv())` retrieves the key | `core/base.go:587-589`, `core/settings_query.go:65` |
| Settings export/encrypt | `DBExport()` encrypts settings JSON with the encryption key before storing | `core/settings_model.go:271-283` |
| Settings load/decrypt | `loadParam()` first tries plain decode, then decrypts if plain fails | `core/settings_query.go:57-88` |
| Settings validation | `PostValidate()` uses `validation.ValidateStructWithContext` for schema validation | `core/settings_model.go:288-303` |
| SMTP validation | `SMTPConfig.Validate()` checks host, port, auth method, TLS | `core/settings_model.go:398-419` |
| S3 validation | `S3Config.Validate()` checks endpoint URL, bucket, region, access key, secret | `core/settings_model.go:450-458` |
| Runtime settings API | `PATCH /api/settings` endpoint allows modifying settings at runtime | `apis/settings.go:16` |
| Hot-reload mechanism | `OnSettingsReload()` hook triggers reinitialization of logger level, log cleanup, rate limits | `core/base.go:1496-1532` |
| Settings change hooks | `OnModelAfterCreateSuccess` and `OnModelAfterUpdateSuccess` hooks auto-reload settings on save | `core/settings_model.go:52-62` |
| Secrets masking | `MarshalJSON()` sets sensitive fields (SMTP.Password, S3.Secret, Backups.S3.Secret) to empty string | `core/settings_model.go:337-364` |
| Runtime env vars | `PB_FILES_DELETE_MAX_WORKERS`, `PB_THUMBS_MAX_WORKERS`, `PB_THUMBS_MAX_WAIT` env vars used | `core/base.go:1305`, `apis/file.go:27,32` |
| OIDC leeway env | `PB_ID_TOKEN_LEEWAY` env var for OAuth2 token validation | `tools/auth/oidc.go:31` |
| Bootstrap flow | `Bootstrap()` calls `ReloadSettings()` after DB init and migrations | `core/base.go:426` |

## Answers to Dimension Questions

### 1. How does the system compose config from multiple sources (file, env, remote)?

**Sources composed in this order:**
1. **Hardcoded defaults** — `newDefaultSettings()` in `core/settings_model.go:145-188`
2. **CLI flags** — `--dir`, `--encryptionEnv`, `--dev`, `--queryTimeout` parsed via Cobra in `pocketbase.go:219-248`
3. **Environment variables** — Only the encryption key (via `--encryptionEnv` pointing to env var name), plus internal tunables (`PB_FILES_DELETE_MAX_WORKERS`, `PB_THUMBS_MAX_WORKERS`, `PB_THUMBS_MAX_WAIT`)
4. **Database** — Settings loaded from `_params` table via `ReloadSettings()` at `core/settings_query.go:29-49`

The database settings override everything else on startup. No remote config store or feature flag service exists.

### 2. How are secrets managed without leaking into logs or version control?

**Mechanisms:**
- **Encryption at rest** — Settings stored in SQLite can be encrypted using AES encryption via the `EncryptionEnv` env var (`core/settings_model.go:271-283`, `core/settings_query.go:64-85`)
- **Masking in JSON serialization** — `MarshalJSON()` zeros out `SMTP.Password`, `S3.Secret`, and `Backups.S3.Secret` before serialization (`core/settings_model.go:337-364`)
- **No hardcoded secrets** — No secrets in code; all sensitive values come from env vars or DB
- **Version control safe** — Settings DB (`pb_data/data.db`) is outside the source tree

**Gaps:**
- The encryption key name (not value) could leak into logs if `--encryptionEnv` flag is logged
- No secret masking in memory during debugging (RWMutex protects Settings but not visibility into runtime)

### 3. Can config be changed at runtime or does it require restart?

**Runtime changes are supported** via the admin API:
- `PATCH /api/settings` endpoint modifies settings (`apis/settings.go:41-76`)
- On successful save, `OnSettingsReload()` hook triggers hot-reload of logger level, log retention settings, and other reactive settings (`core/base.go:1496-1532`)
- The Settings model is a singleton; changes propagate through the app's in-memory reference

**Restart required for:**
- `--dir` (data directory)
- `--encryptionEnv` (encryption key)
- Connection pool sizes (`DataMaxOpenConns`, etc.)
- `--dev` mode flag

### 4. How is config validated at startup vs lazily?

**Startup validation:**
- `Bootstrap()` calls `ReloadSettings()` which loads and validates settings via `PostScan()` and `PostValidate()` (`core/settings_model.go:288-303`)
- If settings table is empty, default settings are saved and immediately validated
- Each sub-config implements `validation.Validatable` interface with specific rules (SMTP host required if enabled, S3 credentials required if enabled, etc.)

**Lazy validation:**
- `Save()` triggers `OnModelValidate` hooks which call `PostValidate()` before persisting (`core/settings_model.go:288`)
- API form submissions go through `forms` package validators before reaching the model

### 5. How does the system handle missing or invalid configuration?

**Missing configuration:**
- If no settings exist in DB, `ReloadSettings()` persists default settings automatically (`core/settings_query.go:36-41`)
- If encryption key is set but data can't be decrypted, returns error: `"invalid settings db data or missing encryption key"` (`core/settings_query.go:69`)
- Settings deletion is blocked by a hook (`core/settings_model.go:64-74`)

**Invalid configuration:**
- Validation errors returned as structured `validation.Errors` map with field paths as keys (`core/settings_model.go:232`)
- API returns 400 Bad Request with detailed validation errors (`apis/settings.go:63-64`)
- Model save fails atomically — no partial writes

## Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Database-backed settings | Allows runtime modification without redeployment; avoids config file parsing complexity |
| Optional AES encryption | Protects sensitive settings at rest in multi-tenant scenarios |
| Hook-based hot-reload | Decouples settings changes from specific behaviors; allows plugins to react |
| Single Settings singleton | Simple mental model; avoids config propagation complexity |
| Validation via ozzo-validation | Schema-based validation with clear error messages |

## Notable Patterns

1. **Encryption-first load** — `loadParam()` tries plain decode first, then decrypts (`core/settings_query.go:57-88`)
2. **Secrets masking in MarshalJSON** — Custom JSON marshaler zeros sensitive fields (`core/settings_model.go:337-364`)
3. **Hook-driven reactivity** — `OnSettingsReload()` fires after every settings save, triggering dependent reconfigurations (`core/base.go:1496-1532`)
4. **Param table pattern** — Settings stored in generic `_params` key-value table with `PostValidator` interface for encryption/export hooks (`core/settings_model.go:34-114`)

## Tradeoffs

| Tradeoff | Impact |
|----------|--------|
| No env variable interpolation | Config values cannot reference `${ENV_VAR}` style placeholders; all runtime config must come from DB |
| No feature flags | New features cannot be toggled per-tenant or per-instance without custom implementation |
| No remote config store | Cannot manage config across multiple PocketBase instances from a central source |
| Encryption is all-or-nothing | If encryption is enabled, ALL settings are encrypted; cannot selectively encrypt fields |
| SQLite for settings | Single-instance storage; no built-in clustering or distributed config sync |

## Failure Modes / Edge Cases

| Scenario | Behavior |
|----------|----------|
| Missing encryption key for encrypted settings | Returns error on startup: `"missing encryption key"` |
| Corrupted encrypted settings | JSON unmarshal fails after decryption; returns decryption error |
| Concurrent settings modification | RWMutex on Settings struct; last write wins for in-memory view |
| Network partition during settings save | DB transaction ensures atomicity; retry on reconnect |
| Very large settings payload | No documented size limit; practical limit is SQLite blob size |

## Future Considerations

- **Feature flag system** — Currently absent; would require custom implementation or plugin
- **Env variable interpolation** — `${VAR}` style substitution in settings would improve 12-factor compliance
- **Remote configuration store** — Vault, etcd, or Consul integration for multi-instance deployments
- **Selective field encryption** — Currently encrypts entire settings blob; field-level encryption would be more granular

## Questions / Gaps

1. **No explicit feature flag mechanism** — How would operators enable/disable features per customer without code changes?
2. **Encryption key rotation** — No documented procedure for rotating the encryption key without losing settings
3. **Config schema migrations** — When adding new settings fields, how are defaults established for existing installations?
4. **Audit logging** — No evidence found of settings change audit trail; who changed what and when?

---

Generated by `dimensions/03-configuration-environment-management.md` against `pocketbase`.
