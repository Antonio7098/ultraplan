# Source Analysis: temporal

## Configuration & Environment Management

### Source Info

| Field | Value |
|-------|-------|
| Name | temporal |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/temporal` |
| Language / Stack | Go |
| Analyzed | 2026-05-19 |

## Summary

Temporal uses a layered configuration system with three loading mechanisms: (1) an embedded template with environment variable substitution for containerized deployments, (2) a single config file path override, and (3) a legacy hierarchical directory loader. Static config is validated at load time. Dynamic config is provided via a file-based client that polls at intervals and supports real-time subscriptions for runtime updates. Secrets can be injected via environment variables or through an external command execution pattern. YAML masking prevents sensitive values from leaking into logs.

## Rating

**8/10** — Good implementation with minor issues. The config system is comprehensive, supports multiple loading strategies, has a robust dynamic config subsystem with hot-reload, and takes care to mask sensitive values. Gaps include no built-in Vault integration and the legacy config loader being marked deprecated.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Config struct definitions | `Config` struct with yaml tags for all major subsystems | `common/config/config.go:30-56` |
| Environment variable binding | Embedded template uses `{{ env "VAR_NAME" }}` syntax | `common/config/config_template_embedded.yaml:4` |
| Config loader entry point | `Load()` function with multiple load options | `common/config/loader.go:129-141` |
| Config validation | `validate.Validate(config)` called after unmarshaling | `common/config/loader.go:213-214` |
| Validator definition | Custom validator with `persistence_custom_search_attributes` func | `common/config/validator.go:10-14` |
| Secrets masking | `MaskYaml()` replaces `password` and `keyData` fields with `******` | `common/masker/masker.go:9-14` |
| Masking applied to config output | `maskedYaml, _ := masker.MaskYaml(...)` in `Config.String()` | `common/config/config.go:701` |
| PasswordCommand mechanism | External command executes to fetch password, stdout used | `common/config/persistence.go:301-323` |
| Dynamic config client interface | `Client` interface with `GetValue()` method | `common/dynamicconfig/client.go:12-32` |
| NotifyingClient for hot-reload | `NotifyingClient` interface with `Subscribe()` method | `common/dynamicconfig/client.go:36-41` |
| File-based dynamic config | `FileBasedClient` polls config file and calls `Update()` | `common/dynamicconfig/file_based_client.go:133-147` |
| Subscription-based notifications | `NotifyingClientImpl.PublishUpdates()` notifies subscribers | `common/dynamicconfig/client_subscriptions.go:42-54` |
| Dynamic config YAML loader | `LoadYamlFile()` parses YAML into `ConfigValueMap` | `common/dynamicconfig/yaml_loader.go:36-41` |
| YAML config file example | Dynamic config uses namespace/taskQueue constraints | `config/dynamicconfig/development-sql.yaml:45-75` |
| Config loading options | `WithEnv`, `WithConfigDir`, `WithZone`, `WithConfigFile`, `WithEmbedded` | `common/config/loader.go:71-117` |
| Template processing | Go template engine with sprig functions enabled | `common/config/loader.go:240` |

## Answers to Dimension Questions

### 1. How does the system compose config from multiple sources (file, env, remote)?

Temporal supports three composition strategies:

**a) Embedded template with environment variables** (`WithEmbedded()`) — The `config_template_embedded.yaml` file is compiled into the binary as a Go embed. It uses Go templates with sprig functions to substitute values from environment variables: `{{ default "info" (env "LOG_LEVEL") }}`. This is the primary mechanism for containerized deployments (`common/config/config_template_embedded.yaml:4`).

**b) Single config file** (`WithConfigFile()`) — When a config file path is provided, only that file is loaded and unmarshaled. Validation follows. This bypasses the legacy hierarchical loading (`common/config/loader.go:150-156`).

**c) Legacy hierarchical config directory** (`WithConfigDir`, `WithEnv`, `WithZone`) — Files are loaded in hierarchy order: `base.yaml` → `env.yaml` → `env_az.yaml`. Later files override earlier ones. This loader is marked deprecated (`common/config/loader.go:178-215`).

No built-in remote config store (e.g., Vault, etcd) was found in the main config loading path. Remote configuration is limited to the dynamic config file path specified in `dynamicConfigClient.filepath`.

### 2. How are secrets managed without leaking into logs or version control?

**Masking on output**: The `Config.String()` method at `common/config/config.go:696-703` calls `masker.MaskYaml()` with `DefaultYAMLFieldNames = ["password", "keyData"]`. This replaces all password and keyData values with `******` before returning the YAML string, preventing accidental log leakage.

**Masking implementation**: The `maskMap()` function in `common/masker/masker.go:73-83` recursively traverses the parsed YAML map and substitutes values whose keys match the mask field names.

**Environment variable approach**: For embedded/template config, secrets are passed via environment variables (e.g., `CASSANDRA_PASSWORD`, `MYSQL_PWD`, `POSTGRES_PWD`) which are never written to config files or logs. The template renders them directly into the YAML at load time.

**PasswordCommand for external secrets**: The `SQL` config supports a `PasswordCommand` field (`common/config/config.go:427`) that executes an external command and uses its stdout as the password. This allows integration with secret stores without hardcoding secrets. The implementation at `common/config/persistence.go:301-323` executes the command with a 30-second default timeout and captures stderr for error reporting.

**Version control**: Config files checked into source (under `config/`) use environment variable references in templates rather than literal secrets. The `development-*.yaml` files in `config/` are example configurations without real credentials.

**Gap**: There is no automatic masking for other potentially sensitive fields beyond `Password` and `KeyData`. For example, AWS secret keys in Elasticsearch config are not masked (`common/persistence/visibility/store/elasticsearch/client/config.go:61` stores `SecretAccessKey` without masking).

### 3. Can config be changed at runtime or does it require restart?

**Static config (main config)**: Requires restart. The `Config` object is loaded once at startup via `config.Load()` in `temporal/server_options.go:98-122`. There is no mechanism to reload the static config without restarting the process.

**Dynamic config: Hot-reload supported**. The `FileBasedClient` (`common/dynamicconfig/file_based_client.go`) polls the config file at `PollInterval` (default 60s, minimum 5s). When the file's modification time changes, it re-reads, re-parses, and swaps the values atomically via `fc.values.Swap()`. Changes are published to subscribers via `PublishUpdates()`.

**Dynamic config subscriptions**: The `NotifyingClient` interface (`common/dynamicconfig/client.go:36-41`) allows callers to subscribe to config changes. The `Collection` struct (`common/dynamicconfig/collection.go:31-51`) manages subscriptions per key. When `FileBasedClient.Update()` detects changes, it calls `PublishUpdates()` which invokes all registered callbacks.

**Evidence of subscription usage**: The `subscriptionLock` and `subscriptions` map in `Collection` (`common/dynamicconfig/collection.go:38-40`) show a per-key subscription system. The `subscription[T]` struct (`common/dynamicconfig/collection.go:53-61`) stores the callback function `f func(T)` and the last raw value for comparison.

### 4. How is config validated at startup vs lazily?

**Startup validation**: The `config.Load()` function calls `validate.Validate(config)` at `common/config/loader.go:213-214` after unmarshaling all YAML files. The validator at `common/config/validator.go:10-14` uses the `go.ozro/validator.v2` library and registers a custom validation function `persistence_custom_search_attributes`.

**Validation coverage**: The `Config.Validate()` method (`common/config/config.go:672-693`) validates:
- Persistence config via `c.Persistence.Validate()`
- Archival config via `c.Archival.Validate()`
- PublicClient constraints (cannot be set with internal-frontend)

The `Persistence.Validate()` method (`common/config/persistence.go:35-96`) validates:
- Required stores are present
- Visibility store configuration consistency
- Datastore types are valid

**Lazy validation**: For dynamic config, individual settings have a `Validate()` method called during YAML parsing at `common/dynamicconfig/yaml_loader.go:99-103`. Validation errors are logged as warnings but do not block loading. The comment at line 101 says "TODO: raise this to error level", indicating this is a known gap.

### 5. How does the system handle missing or invalid configuration?

**Missing required fields**: The `validate` tag on struct fields (e.g., `validate:"nonzero"`) enforces presence. For example, `Persistence.NumHistoryShards` at `common/config/config.go:266` has the `nonzero` validation tag. If validation fails, `config.Load()` returns an error.

**Invalid YAML**: If `yaml.Unmarshal()` fails at `common/config/loader.go:207` or `common/config/loader.go:260`, the error is returned immediately, preventing the server from starting with invalid config.

**Dynamic config parsing errors**: The `YamlLoader` (`common/dynamicconfig/yaml_loader.go:24-28`) collects both `Errors` and `Warnings`. If there are parsing errors, `Update()` returns an error at `common/dynamicconfig/file_based_client.go:191-192`. For validation warnings, the config still loads but logs a warning.

**File-based client error handling**: When the dynamic config file cannot be read, `Update()` returns an error but the previous valid config remains active. The `retryOnErr` flag at `file_based_client.go:156` prevents retrying deterministically failing parsing errors.

**Missing config directory**: `getConfigFiles()` at `common/config/loader.go:283-310` returns `ErrConfigFilesNotFound` if no config files exist in the specified directory. This error bubbles up and prevents server startup.

## Architectural Decisions

**Layered config loading with precedence**: The decision to support three loading mechanisms (embedded template, single file, legacy hierarchical) reflects the evolution from a development-friendly file-per-environment approach to a container-optimized environment-variable-only approach. The legacy loader is explicitly marked deprecated (`common/config/loader.go:164-165`).

**Template engine for environment variable binding**: Using Go templates with sprig functions (`common/config/loader.go:240`) provides flexibility for complex config generation while keeping the template embeddable in the binary. The `enable-template` comment in the first 1KB acts as an opt-in safety mechanism.

**Separation of static and dynamic config**: Temporal explicitly separates static config (loaded once at startup, defines structure) from dynamic config (periodically reloaded from file, defines runtime behavior). This separation allows runtime tuning without restart but keeps critical structural decisions locked.

**Atomic value swapping in dynamic config**: `FileBasedClient` uses `sync/atomic.Value.Swap()` at `common/dynamicconfig/file_based_client.go:195` to atomically replace the entire config map. This prevents readers from seeing partial updates.

**Masking at output rather than input**: Secrets are masked when converting config to string for logging (`common/config/config.go:696-703`) rather than being encrypted at rest. This works because secrets arrive via env vars or external commands and are used directly.

**No built-in Vault/secret store integration**: Secrets are intended to be injected via environment variables or the `PasswordCommand` external command pattern. There is no native integration with Vault, AWS Secrets Manager, or similar. This defers secret management to the orchestration layer (Kubernetes, Docker).

## Notable Patterns

**Config struct as single source of truth**: All config fields have YAML tags and are directly unmarshaled from YAML. The `Config` struct at `common/config/config.go:30-56` is the canonical schema definition.

**Dynamic config keys as typed singletons**: Dynamic config keys are defined as package-level `var` variables in `common/dynamicconfig/constants.go` using generated constructors like `NewGlobalBoolSetting()`, `NewNamespaceFloatSetting()`. This provides type safety and self-documenting keys.

**Constraint-based dynamic config values**: Dynamic config `ConstrainedValue` structs (`common/dynamicconfig/client.go:56-59`) contain both a value and a `Constraints` struct. The `Constraints` struct (`common/dynamicconfig/client.go:87-96`) supports namespace, task queue, and other dimensions for per-tenant or per-workload tuning.

**Gradual change support**: The `gradual_change.go` file suggests a mechanism for gradual config changes, which may help avoid thundering herd issues when config changes affect large numbers of workers.

**fx dependency injection**: The `common/config/fx.go` file suggests the config package is integrated with the fx dependency injection framework for providing config to services.

## Tradeoffs

**YAML templating vs type safety**: The Go template approach allows flexible config generation but moves validation outside of Go's type system. Template errors are only caught at runtime when the template is rendered.

**File-based dynamic config vs centralized**: Using filesystem files for dynamic config is simple and operationally visible (e.g., via `kubectl exec cat`), but does not scale to multi-cluster deployments without additional tooling. A centralized config service would be harder to operate but more consistent.

**Polling vs push-based updates**: The `FileBasedClient` polls at intervals (`common/dynamicconfig/file_based_client.go:134`), which introduces a delay between config change and application. The minimum poll interval of 5 seconds (`common/dynamicconfig/file_based_client.go:20`) limits how fast updates can propagate. A push-based model would be faster but more complex.

**Validation on load vs on use**: Static config is fully validated at load time, which catches errors early but means the entire server must restart to fix a config error. Lazy validation for dynamic config allows partial deployment but can cause runtime failures.

**No secret encryption at rest**: Secrets passed via env vars or `PasswordCommand` are only protected by OS-level isolation. If the config file is compromised, secrets may be exposed. There is no envelope encryption or secret management system built in.

## Failure Modes / Edge Cases

**Missing dynamic config file on startup**: If `dynamicConfigClient.filepath` points to a non-existent file, `FileBasedClient` initialization fails at `common/dynamicconfig/file_based_client.go:208-209` because `GetModTime()` returns an error. The server fails to start even if dynamic config is optional.

**Invalid dynamic config YAML**: Parsing errors in the dynamic config YAML cause `Update()` to return an error but do not crash the server. The previous valid config continues to be used. The `retryOnErr = false` flag at `common/dynamicconfig/file_based_client.go:190` means the file is not retried until modified again.

**PasswordCommand timeout**: If `PasswordCommand` hangs, it blocks the connection pool initialization. The timeout defaults to 30 seconds (`common/config/persistence.go:295`), after which the password resolution fails with an error.

**Template rendering failure**: If the embedded template fails to render (e.g., due to invalid environment variable values), `config.Load()` returns an error and the server fails to start. There is no fallback to defaults for individual fields.

**Config directory with no matching files**: If `configDir` contains no files matching `base.yaml` or `{env}.yaml`, `getConfigFiles()` returns `ErrConfigFilesNotFound` at `common/config/loader.go:306`, failing startup.

**TLS cert files not present**: If TLS is configured with file paths but the files do not exist, the TLS setup will fail at the connection level (not at config load), producing harder-to-diagnose errors.

## Future Considerations

**Secret store integration**: Native support for Vault, AWS Secrets Manager, or GCP Secret Manager would provide centralized secret management with audit logs, automatic rotation, and encryption at rest.

**Dynamic config push model**: Replacing file polling with a push-based model (e.g., webhook, gRPC watch API) would eliminate the polling delay and reduce load for infrequently changing configs.

**Structured config validation at load**: Moving from generic `validator.v2` tags to a structured schema (e.g., using CUE, KCL, or JsonSchema) would provide better error messages and IDE support for config authors.

**Feature flag system**: While dynamic config serves a similar purpose, a dedicated feature flag system with percentage rollouts, A/B testing support, and targeting rules would be a higher-level abstraction on top of the current per-key constraint model.

**Config versioning and rollback**: The current dynamic config system has no concept of version history or rollback. Adding this would make config changes safer and support progressive delivery.

**Observability for config changes**: Adding structured audit logs for who changed what config and when, along with metrics on config propagation latency, would improve operational visibility.

## Questions / Gaps

**No evidence found** for the following:

- Integration with external secret stores (Vault, AWS Secrets Manager, GCP Secret Manager) — only `PasswordCommand` pattern exists.
- Multi-cluster dynamic config synchronization — each node reads its own file independently.
- Config hot-reload for static config — static config requires restart per design.
- Built-in feature flag system with targeting rules — dynamic config provides per-key constraints but no higher-level flag management.
- Schema enforcement for dynamic config keys — unknown keys are logged as warnings but not rejected (`yaml_loader.go:83`).
- Centralized remote config store — no etcd, Consul, or ZooKeeper integration found in the main config loading path.

---

Generated by `dimensions/03-configuration-environment-management.md` against `temporal`.