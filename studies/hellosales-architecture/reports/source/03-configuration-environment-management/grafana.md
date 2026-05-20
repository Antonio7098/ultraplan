# Source Analysis: grafana

## Configuration & Environment Management

### Source Info

| Field | Value |
|-------|-------|
| Name | grafana |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/grafana` |
| Language / Stack | Go (backend) + TypeScript/React (frontend) |
| Analyzed | 2026-05-19 |

## Summary

Grafana implements a comprehensive multi-source configuration system using INI files as the primary format, with layered overrides from environment variables, command-line arguments, and runtime expansion mechanisms. Configuration is loaded at startup through a defined merge order: defaults → custom config → environment variables → command-line properties → variable expansion. Feature toggles support both static configuration and remote providers via OpenFeature. Secrets management uses envelope encryption with support for multiple KMS providers. Hot-reload of configuration is not supported; most changes require a restart.

## Rating

**8/10** — Good implementation with minor issues

Grafana demonstrates a well-structured configuration system with clear separation of concerns, comprehensive environment variable binding, and a feature toggle system that supports both static and remote providers. However, it lacks runtime configuration reactivity (no hot-reload), and the legacy `Cfg` global state is being phased out in favor of the `ConfigProvider` interface. The INI format provides limited schema enforcement.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Config loading | `loadConfiguration()` orchestrates the layered loading sequence | `pkg/setting/setting.go:1255-1317` |
| Config defaults | `conf/defaults.ini` defines all default configuration | `conf/defaults.ini:1-200` |
| Env var binding | `applyEnvVariableOverrides()` scans `GF_*` vars and applies them | `pkg/setting/setting.go:913-997` |
| Secrets redaction | `RedactedValue()` patterns check sensitive key names | `pkg/setting/setting.go:828-878` |
| Feature flags | `FeatureManager` struct with `IsEnabled()` method | `pkg/services/featuremgmt/manager.go:15-103` |
| Feature flag registry | `standardFeatureFlags` slice with all toggles | `pkg/services/featuremgmt/registry.go:17-1320` |
| OpenFeature integration | `InitOpenFeatureWithCfg()` creates provider based on config | `pkg/services/featuremgmt/openfeature.go:14-39` |
| Env expander | `envExpander.Expand()` reads env vars for `$(ENV_VAR)` syntax | `pkg/setting/expanders.go:117-130` |
| File expander | `fileExpander.Expand()` reads file contents for `$(file:/path)` syntax | `pkg/setting/expanders.go:132-153` |
| DynamicSection | `Key()` method reads env vars at access time | `pkg/setting/setting.go:1882-1895` |
| Secrets manager settings | `SecretsManagerSettings` struct with KMS providers | `pkg/setting/setting_secrets_manager.go:13-67` |
| ConfigProvider interface | `ConfigProvider` interface with `Get()` method | `pkg/configprovider/configprovider.go:10-12` |
| Feature toggle env overrides | `applyFeatureToggleEnvOverrides()` handles `GF_FEATURE_TOGGLES_*` | `pkg/setting/setting_feature_toggles.go:24-81` |
| Feature toggle command overrides | `applyFeatureToggleCmdOverrides()` handles `cfg:feature_toggles.*` | `pkg/setting/setting_feature_toggles.go:83-117` |

## Answers to Dimension Questions

### 1. How does the system compose config from multiple sources (file, env, remote)?

Grafana uses a layered configuration merge strategy defined in `loadConfiguration()` at `pkg/setting/setting.go:1255-1317`:

1. **Defaults** (`conf/defaults.ini`) — loaded first as the base configuration
2. **Custom config file** (`conf/custom.ini` or path specified via `-config` flag) — merged on top
3. **Command-line default properties** (`cfg:default.section.key=value`) — applied before custom file
4. **Environment variable overrides** (`GF_SECTION_KEY=value`) — applied via `applyEnvVariableOverrides()` at `pkg/setting/setting.go:913-997`
5. **Command-line properties** (`cfg:section.key=value`) — applied last via `applyCommandLineProperties()` at `pkg/setting/setting.go:1170-1185`
6. **Variable expansion** — `$(ENV_VAR)` and `$(file:/path)` syntax resolved via expanders at `pkg/setting/expanders.go:52-79`

The `SectionWithEnvOverrides()` method at `pkg/setting/setting.go:1882-1895` provides dynamic access to config keys that can be overridden by environment variables at runtime.

### 2. How are secrets managed without leaking into logs or version control?

Secrets are handled through multiple mechanisms:

1. **Redaction on load**: `RedactedValue()` function at `pkg/setting/setting.go:828-878` checks for sensitive key patterns (PASSWORD, SECRET, PRIVATE_KEY, etc.) and returns `*********` instead of actual values. Applied when logging applied config sources at `pkg/setting/setting.go:1852-1863`.

2. **Secrets management system**: The `SecretsManagerSettings` struct at `pkg/setting/setting_secrets_manager.go:13-67` supports envelope encryption with configurable KMS providers. In OSS, only `secret_key` provider is available; Enterprise adds AWS KMS, Azure KeyVault, Google KMS, and HashiCorp Vault.

3. **Data key caching**: Supports both in-memory and Redis cache for encrypted data keys with configurable TTL and encryption key. When Redis is enabled, `DataKeysCacheEncryptionKey` must be set for HA mode.

4. **No secrets in version control**: Database passwords and secrets are never stored in config files but rather passed via environment variables or obtained from secrets managers.

### 3. Can config be changed at runtime or does it require restart?

**Config changes require a restart for most settings.** Evidence:

- The `parseINIFile()` method at `pkg/setting/setting.go:1459-1756` is called only once during `Load()` at `pkg/setting/setting.go:1432-1456`.
- Configuration is parsed into the `Cfg` struct which is then frozen.
- Feature toggles with `RequiresRestart: true` in the registry at `pkg/services/featuremgmt/registry.go` (e.g., `datasourceAPIServers` at line 220) explicitly require restart.

However, **dynamic runtime overrides exist for some values**:

- `DynamicSection.Key()` at `pkg/setting/setting.go:1882-1895` reads from environment variables at access time, allowing certain config values to be changed without restart by modifying `GF_*` environment variables.
- The `[feature_toggles.openfeature]` section supports runtime evaluation via OpenFeature providers.

### 4. How is config validated at startup vs lazily?

**Startup validation is limited:**

- The `MustBool()`, `MustString()`, `MustDuration()` methods on ini keys provide default values but no schema validation.
- Some specific settings have explicit validation (e.g., annotation tag length at `pkg/setting/setting.go:1036-1044`).
- The `parseINIFile()` at `pkg/setting/setting.go:1459` does not have comprehensive schema validation.

**Lazy validation patterns exist:**

- Feature flag evaluation via `FeatureManager.IsEnabled()` at `pkg/services/featuremgmt/manager.go:101-103` checks runtime state.
- OpenFeature provider evaluation at `pkg/services/featuremgmt/openfeature.go:14-39` happens at access time.
- The expander system at `pkg/setting/expanders.go:52-79` validates on first access.

**No structural validation**: There is no JSON Schema or similar validation for config files; malformed values silently use defaults.

### 5. How does the system handle missing or invalid configuration?

1. **Missing config file**: `loadSpecifiedConfigFile()` at `pkg/setting/setting.go:1214-1253` returns without error if custom config doesn't exist.

2. **Missing defaults**: `loadConfiguration()` at `pkg/setting/setting.go:1261-1264` calls `os.Exit(1)` if `defaults.ini` is not found.

3. **Invalid INI**: `ini.Load()` at `pkg/setting/setting.go:1223-1226` returns error which causes server exit.

4. **Missing env vars**: `os.Getenv()` returns empty string; `MustString()` provides defaults.

5. **Feature toggle parsing errors**: `ParseFlag()` at `pkg/setting/setting_feature_toggles.go:177-194` falls back to string type if value cannot be parsed as bool/int/float/object.

6. **DynamicSection**: `Key()` at `pkg/setting/setting.go:1882-1895` returns the original key value if env var is not set.

## Architectural Decisions

1. **INI-based configuration**: Chose INI format over YAML/JSON for simplicity and familiarity in ops community. Drawback: no schema validation, limited nesting.

2. **Global `Cfg` struct**: The legacy `Cfg` struct at `pkg/setting/setting.go:100-767` is a large global object. Deprecated in favor of `ConfigProvider` interface at `pkg/configprovider/configprovider.go:10-12`.

3. **Environment variable prefix `GF_`**: All config env vars prefixed with `GF_` to avoid collisions. See `EnvKey()` at `pkg/setting/setting.go:1151-1153`.

4. **Layered override system**: Clear priority order prevents ambiguity about which source takes precedence.

5. **Feature flag decoupling**: Feature flags defined in `pkg/services/featuremgmt/registry.go` separate from config parsing, allowing code generation (`make gen-feature-toggles`) and type-safe access.

## Notable Patterns

1. **Variable expansion syntax**: `$(VAR_NAME)` for env vars, `$(file:/path/to/file)` for file contents — `pkg/setting/expanders.go:45-50`

2. **DynamicSection for env-aware config access**: `pkg/setting/setting.go:1874-1906` provides runtime env override without restart for specific config sections.

3. **Feature flag expression evaluation**: Flags can be boolean, integer, float, string, or object types — `pkg/services/featuremgmt/types.go:5-32`

4. **OpenFeature integration**: Remote feature flag providers (OFREP protocol) can be configured — `pkg/setting/setting_openfeature.go:23-94`

5. **Secrets management with GC worker**: Background cleanup of expired secure values — `pkg/setting/setting_secrets_manager.go:44-55`

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| INI format | Human-editable but no schema validation, limited data types |
| Global Cfg struct | Easy access but creates coupling, hard to test |
| No hot-reload | Simpler implementation but requires restart for config changes |
| Envelope encryption | Strong security but added complexity for secret operations |
| Feature flag registry | Type-safe but requires code generation for changes |

## Failure Modes / Edge Cases

1. **Missing `defaults.ini`**: Server exits with no graceful error handling — `pkg/setting/setting.go:1261-1264`

2. **Malformed INI**: Server exits rather than logging warning and continuing with defaults

3. **Circular env var references**: If `$(HOSTNAME)` is empty, falls back to `os.Hostname()` — `pkg/setting/expanders.go:124-127`

4. **Redis cache encryption key**: If `DataKeysCacheUseRedis` is true but `DataKeysCacheEncryptionKey` is empty, falls back to in-memory cache — `pkg/setting/setting_secrets_manager.go:103-106`

5. **Feature flag parsing fallback**: Invalid flag values silently become string type — `pkg/setting/setting_feature_toggles.go:186-193`

6. **Env var override for non-existent keys**: `applyEnvVariableOverrides()` only creates new keys if a section exists; standalone env vars without matching sections may be ignored — `pkg/setting/setting.go:931-993`

## Future Considerations

1. **Remove legacy `Cfg` global**: The deprecation notice at `pkg/setting/setting.go:97-99` indicates migration to `ConfigProvider` interface is ongoing.

2. **Schema validation**: Adding JSON Schema or CUE validation for config files would improve reliability.

3. **Hot-reload support**: Implementing file watcher for config changes without restart would improve operational flexibility.

4. **OpenFeature maturation**: As remote feature flags become more primary, the dual system (static flags + OpenFeature) may simplify.

## Questions / Gaps

1. **No evidence found** for configuration migration between major versions (e.g., what happens when upgrading Grafana with old config format).

2. **No evidence found** for per-user/tenant configuration overrides in the OSS version (only stack-level config in Grafana Cloud).

3. **No evidence found** for config rollback or history mechanism.

4. **Unclear** how feature flags interact with the legacy `IsFeatureToggleEnabled` function when OpenFeature is also enabled — see deprecation notice at `pkg/setting/setting_feature_toggles.go:119`.

---

Generated by `dimensions/03-configuration-environment-management.md` against `grafana`.