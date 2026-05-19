# Source Analysis: milvus

## Configuration & Environment Management

### Source Info

| Field | Value |
|-------|-------|
| Name | milvus |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/milvus` |
| Language / Stack | Go (with C++ core and Rust tantivy) |
| Analyzed | 2026-05-19 |

## Summary

Milvus implements a sophisticated multi-source configuration system with environment variable support, YAML file loading, and etcd-based remote configuration with hot-reload capabilities. Configuration flows through a `config.Manager` that merges sources with priority ordering (Env > Etcd > File). The system supports runtime config updates via etcd with event-driven reactivity. Secrets management relies on plaintext config files and environment variables, with optional KMS integration through a cipher plugin. The system demonstrates strong reactive config patterns with event dispatchers and callback mechanisms, though secrets handling shows no evidence of encryption-at-rest or Vault integration.

## Rating

**7/10** — Good implementation with minor issues. The multi-source config system with hot-reload and event callbacks is well-architected. However, secrets management is limited to plaintext files/env vars and the cipher plugin appears unused.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Config Manager | `Manager` struct with `Dispatcher`, `sources`, `overlays`, `forbiddenKeys`, `immutableKeys` | `pkg/config/manager.go:86-97` |
| Multi-source loading | `AddSource` accepts multiple sources (EnvSource, FileSource, EtcdSource) with priority | `pkg/config/manager.go:271-291` |
| Priority ordering | EnvSource=NormalPriority(50), EtcdSource=HighPriority(10), FileSource=LowPriority(100) | `pkg/config/env_source.go:87`, `pkg/config/etcd_source.go:106`, `pkg/config/file_source.go:83` |
| Hot-reload refresher | `refresher` struct with periodic polling via `time.Ticker` | `pkg/config/refresher.go:64-81` |
| Event-driven updates | `EventDispatcher.Register` and `Dispatch` with key prefix support | `pkg/config/event_dispatcher.go:42-58`, `pkg/config/event_dispatcher.go:61-71` |
| Config source file | YAML-based config with nested structure for all components | `configs/milvus.yaml:1-200` |
| ParamItem struct | Core config parameter with `Key`, `DefaultValue`, `Formatter`, `PanicIfEmpty`, `Forbidden`, `Immutable` | `pkg/util/paramtable/param_item.go:37-57` |
| BaseTable init | Initializes from local files, env, and remote etcd | `pkg/util/paramtable/base_table.go:138-166` |
| EtcdConfig | Stores etcd endpoints, rootPath, auth credentials, SSL settings | `pkg/util/paramtable/service_param.go:93-121` |
| MinioConfig | AccessKeyID, SecretAccessKey with env var override support | `pkg/util/paramtable/service_param.go:1522-1534` |
| Runtime config updates | `SetConfig`, `DeleteConfig`, `ResetConfig` with event firing | `pkg/util/paramtable/base_table.go:301-357` |
| Callback mechanism | `ParamChangeCallback` for config change notifications | `pkg/util/paramtable/param_item.go:35` |
| Config refresh interval | `refreshInterval` with `MILVUS_CONFIG_REFRESH_INTERVAL` env override | `pkg/util/paramtable/runtime.go:32`, `pkg/util/paramtable/base_table.go:124` |
| ForbidUpdate | Keys can be marked forbidden preventing runtime changes | `pkg/config/manager.go:314-316` |
| ImmutableUpdate | Keys marked immutable cannot be changed after startup | `pkg/config/manager.go:318-320`, `pkg/config/manager.go:324-326` |
| CipherConfig | KMS integration for disk encryption with AWS role ARN, external ID | `pkg/util/paramtable/cipher_config.go:9-20` |
| Etcd auth credentials | Username and password stored in config, validated at init | `pkg/util/paramtable/service_param.go:325-349` |
| Dynamic config test | Integration test for config hot-reload via etcd | `tests/integration/refreshconfig/refresh_config_test.go:42-68` |

## Answers to Dimension Questions

### 1. How does the system compose config from multiple sources (file, env, remote)?

Milvus uses a `config.Manager` (`pkg/config/manager.go:86-97`) that accepts multiple `Source` implementations via `AddSource`. The priority ordering is:
- **EnvSource** (priority 50, NormalPriority) — loaded first in `base_table.go:156`
- **FileSource** (priority 100, LowPriority) — loaded from `milvus.yaml` in `base_table.go:168-192`
- **EtcdSource** (priority 10, HighPriority) — remote config loaded last in `base_table.go:194-228`

When multiple sources provide the same key, the lower priority number wins. The `keySourceMap` (`pkg/config/manager.go:89`) tracks which source owns each key. Env vars are normalized via formatter that strips `milvus.` prefix and converts to lowercase (`base_table.go:139-146`). Env vars with `MILVUS_CONF_` prefix also override unprefixed versions (`pkg/config/env_source.go:53-59`).

### 2. How are secrets managed without leaking into logs or version control?

Evidence shows **no special handling** for secrets. Secrets appear in plaintext in:
- `configs/milvus.yaml:65` — etcd password: `password: etcdadmin`
- `configs/milvus.yaml:108-114` — MinIO credentials: `accessKeyID: minioadmin`, `secretAccessKey: minioadmin`
- Environment variables (documented in yaml comments) for `ETCD_ENDPOINTS`, `MINIO_ADDRESS`, `MINIO_ACCESS_KEY_ID`, `MINIO_SECRET_ACCESS_KEY`

The `cipherConfig` (`pkg/util/paramtable/cipher_config.go`) provides KMS integration for disk encryption (AWS role ARN, external ID, rotation period), but this applies to data-at-rest encryption, not config secrets. The hook.yaml file for cipher config is empty. No evidence of:
- Vault integration
- Encrypted config files
- Secrets masking in logs
- .gitignore patterns for config files (`.env` file is tracked in git per `.gitignore` inspection)

### 3. Can config be changed at runtime or does it require restart?

**Yes, runtime config changes are supported** with hot-reload via etcd. The mechanism:

1. Config stored in etcd under `{rootPath}/config/` prefix (`etcd_source.go:168-184`)
2. `EtcdSource.refreshConfigurations()` polls etcd periodically (default 5s via `refresher.go:66`)
3. Changes trigger `Event` dispatch through `EventDispatcher` (`pkg/config/event_dispatcher.go:42-58`)
4. `ParamItem` registers handlers for specific keys (`param_item.go:71-78`)
5. Callbacks execute on config change (`param_item.go:89-119`)

Evidence from integration tests: `tests/integration/refreshconfig/refresh_config_test.go:42-68` writes to etcd and verifies `minpasswordlength` config updates propagate within 20 seconds.

Some configs are marked `refreshable:"false"` in struct tags (e.g., `service_param.go:95` `Endpoints ParamItem refreshable:"false"`), meaning those do not reload. Keys can also be marked `Forbidden` or `Immutable` to prevent runtime changes.

### 4. How is config validated at startup vs lazily?

**At startup validation:**
- `PanicIfEmpty: true` triggers panic if required config is empty (`param_item.go:162-163`)
- Type coercion functions (`getAsBool`, `getAsInt`, `getAsFloat`) return defaults on parse failure (`param_item.go:433-476`)
- etcd auth validation at init: `service_param.go:343-349` panics if auth enabled but credentials empty

**Lazy validation:**
- `GetAs*` methods use cached values first, falling back to manager lookup (`param_item.go:184-319`)
- CAS-based cache update ensures type safety (`manager.go:124-140`)
- Formatter functions transform values on access, not at load time (`param_item.go:159-160`)

The `EnableConfigParamTypeCheck` param (`component_param.go:1363-1370`) controls whether type checking is enabled.

### 5. How does the system handle missing or invalid configuration?

- **Missing keys**: Falls back to `FallbackKeys` if primary key not found (`param_item.go:144-151`), then to `DefaultValue` (`param_item.go:154-155`)
- **Invalid values**: Type conversion functions return defaults on parse error (`param_item.go:470-476`)
- **Empty with PanicIfEmpty**: Panics at access time, not initialization (`param_item.go:162-163`)
- **Etcd unreachable**: Returns gracefully, logs warning, continues with local configs (`base_table.go:223-227`)
- **File not found**: Skipped silently in multi-file loading (`base_table.go:174-181`)
- **All files missing**: Returns error (`file_source.go:155-157`)

## Architectural Decisions

1. **Priority-based source merging**: Lower priority number = higher precedence. Env (50) > Etcd (10) > File (100). This allows runtime overrides via etcd to take precedence over file while env vars can always override for local development.

2. **Event-driven reactive config**: Uses Observer pattern with `EventDispatcher` supporting both exact-key and prefix-based registrations. Allows fine-grained watchers for specific config changes without polling.

3. **CAS cached values**: Config values are cached with Compare-And-Swap semantics to prevent stale reads during concurrent updates.

4. **Refreshable vs static params**: Each `ParamItem` has a `refreshable` tag indicating whether it can be updated at runtime. Static params (like endpoints) are fetched once at startup.

5. **Separate hook config**: `hook.yaml` loaded separately via `NewBaseTableFromYamlOnly` for cipher/KMS plugin config, isolated from main config.

6. **Config key normalization**: All keys lowercased, `milvus.` prefix stripped, `/` and `_` and `.` normalized for consistent lookup across sources.

## Notable Patterns

1. **Singleton ComponentParam**: `Get()` function returns global singleton (`runtime.go:71-74`), initialized once via `sync.Once`.

2. **Formatter functions**: Transform raw config values on access (e.g., `chanNamePrefix` formatter in `component_param.go:375-381`).

3. **Callback registration**: `ParamItem.RegisterCallback` allows reactive behavior when config changes (`param_item.go:81-83`), used for derived state like `VarCharLengthAvg` updating `typeutil` global (`component_param.go:961-963`).

4. **Etcd txn for atomic updates**: `AlterConfigsInEtcd` uses etcd transactions for atomic multi-key updates (`manager.go:592-637`).

5. **Linearizable reads after writes**: `RefreshConfigurationsLinearizable()` ensures post-write consistency via etcd ReadIndex (`etcd_source.go:155-163`).

6. **Immutable config persistence**: `ProcessImmutableConfigs` saves immutable configs to etcd on first startup if not present, ensuring persistence across restarts (`manager.go:508-557`).

## Tradeoffs

1. **Polling vs watch**: Etcd source uses periodic polling (default 5s) rather than native etcd watches. This adds latency for config propagation but avoids requiring watch API support.

2. **No encryption for config secrets**: Secrets stored in plaintext YAML/env vars. While KMS exists for disk encryption, config secrets lack encryption-at-rest.

3. **Global singleton state**: `ComponentParam` is a global singleton, making testing harder but ensures consistent config access across components.

4. **Panic on missing required config**: `PanicIfEmpty` causes hard failure at startup for required configs. May be disruptive in some deployment scenarios.

5. **Cache invalidation on any config change**: `EvictCachedValue` clears entire cache on any config update (`manager.go:146`), not just the changed key. Conservative but may cause performance spikes.

## Failure Modes / Edge Cases

1. **Etcd unavailable at startup**: If `EtcdSource` fails to initialize, `initConfigsFromRemote()` logs warning and returns — system continues with local file/env configs (`base_table.go:223-227`). But if critical configs (like `etcd.endpoints`) are missing, `PanicIfEmpty` triggers.

2. **Race between config refresh and access**: CAS-based caching (`CASCachedValue`) handles concurrent access, but the pattern requires careful key ordering.

3. **Memory growth from event handlers**: `EventDispatcher` accumulates handlers via `Register` without cleanup mechanism visible in the codebase.

4. **Config drift between nodes**: In distributed mode, each node polls etcd independently. With 5s default interval, nodes may temporarily have different config values after a change.

5. **Cipher plugin unloaded**: `hook.yaml` is empty, and `cipherConfig` initialization logs but doesn't fail if plugin missing. The KMS integration appears dormant.

## Future Considerations

1. **Add Vault/secrets manager integration**: Current secrets in plaintext is a security gap. Consider integrating HashiCorp Vault or AWS Secrets Manager for sensitive config values.

2. **Native etcd watches**: Replace polling with etcd watch API for faster config propagation and reduced load.

3. **Config schemas with validation**: Add JSON schema validation for config files to catch errors early.

4. **Structured secret rotation**: Implement proper secret rotation lifecycle for credentials stored in config.

5. **Per-tenant config isolation**: The current system manages cluster-wide config. Multi-tenant deployments would need namespace isolation for tenant-specific settings.

## Questions / Gaps

1. **No evidence of config encryption at rest**: Where are secrets like `etcd.password` protected? The `.env` file is tracked in git.
2. **hook.yaml usage unclear**: The cipher config system initializes from `hook.yaml` but the file is empty — is this feature production-ready?
3. **What happens when Forbidden key is updated via etcd directly?**: The code checks `forbiddenKeys` in `OnEvent`, but someone could write directly to etcd.
4. **No config version/history tracking**: How do operators audit config changes? No evidence of versioned config or change audit trail.
5. **Memory pressure from large config maps**: `GetConfigs()` returns entire config map — what happens with thousands of keys?

---

Generated by `dimensions/03-configuration-environment-management.md` against `milvus`.