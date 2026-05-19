# Source Analysis: openfga

## Configuration & Environment Management

### Source Info

| Field | Value |
|-------|-------|
| Name | openfga |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/openfga` |
| Language / Stack | Go (github.com/spf13/viper) |
| Analyzed | 2026-05-19 |

## Summary

OpenFGA uses a well-structured configuration system based on Viper for multi-source config loading (file, env vars, CLI flags), with a comprehensive `Config` struct hierarchy covering datastore, auth, HTTP, gRPC, logging, tracing, and experimental features. Secrets are protected via `json:"-"` tags to prevent logging. Configuration is validated at startup through a multi-layered `Verify()` approach. Experimental features are managed via a simple static flag list. The system requires restart for most config changes, with the exception of TLS certificate hot-reload via certwatcher.

## Rating

**7/10** — Good implementation with minor issues. Multi-source config composition via Viper is solid, secrets are properly isolated with `json:"-"` tags, and startup validation is comprehensive. However, config changes require full restart (no hot-reload), there is no remote config store (config only from file/env/CLI), feature flags are static (no dynamic evaluation), and missing values produce silent defaults rather than explicit errors.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Viper init with env prefix | `viper.SetEnvPrefix("OPENFGA")`, `viper.AutomaticEnv()` | `cmd/root.go:23-25` |
| Config file search paths | Searched in `/etc/openfga`, `$HOME/.openfga`, `.` | `cmd/root.go:27-30` |
| Config unmarshal | `viper.Unmarshal(config)` loads into `DefaultConfig()` | `cmd/run/run.go:388-400` |
| Main Config struct | `type Config struct` with 40+ fields | `pkg/server/config/config.go:363-484` |
| DatastoreConfig | URI/Password marked `json:"-"` to prevent logging | `pkg/server/config/config.go:128-174` |
| AuthnPresharedKeyConfig | Keys marked `json:"-"` | `pkg/server/config/config.go:230-233` |
| Config defaults | `DefaultConfig()` returns fully populated struct | `pkg/server/config/config.go:828-978` |
| Config Verify() | Entry point for all validation | `pkg/server/config/config.go:486-491` |
| VerifyServerSettings | Connection pool, deadlines, cache, throttling validation | `pkg/server/config/config.go:493-569` |
| VerifyBinarySettings | Log format/level, TLS cert paths, playground, timeouts | `pkg/server/config/config.go:571-639` |
| Experimental flags | Static list: `ExperimentalCheckOptimizations`, `ExperimentalListObjectsOptimizations`, etc. | `pkg/server/config/config.go:107-121` |
| Feature flag client | `Client` interface with `Boolean(flagName, storeID) bool` | `pkg/featureflags/client.go:3-5` |
| Experimental flag binding | `util.MustBindEnv("experimentals", "OPENFGA_EXPERIMENTALS")` | `cmd/run/flags.go:14-15` |
| Env var for datastore URI | `util.MustBindEnv("datastore.uri", "OPENFGA_DATASTORE_URI")` | `cmd/run/flags.go:98-99` |
| Env var for datastore password | `util.MustBindEnv("datastore.password", "OPENFGA_DATASTORE_PASSWORD")` | `cmd/run/flags.go:113-114` |
| TLS cert hot-reload | `certwatcher.New(certPath, keyPath)` for dynamic TLS | `cmd/run/run.go:1239-1241` |
| Config schema | JSON schema with `x-env-variable` annotations | `.config-schema.json:1-933` |
| Run command validation | `config.Verify()` called before server start | `cmd/run/run.go:411-413` |

## Answers to Dimension Questions

**1. How does the system compose config from multiple sources (file, env, remote)?**

Configuration is composed using [Viper](https://github.com/spf13/viper) with this priority order: **CLI flags > Environment variables > Config file > Defaults** (`cmd/root.go:19-38`). Viper is initialized with `SetEnvPrefix("OPENFGA")` and `AutomaticEnv()` which enables automatic binding of environment variables using the `OPENFGA_` prefix, converting dashes to underscores (`cmd/root.go:24`). The config file `config.yaml` is searched in three locations: `/etc/openfga`, `$HOME/.openfga`, and the current working directory (`cmd/root.go:27-30`). No remote config store (e.g., etcd, Consul) is used — all config is local.

**2. How are secrets managed without leaking into logs or version control?**

Secrets are protected at the struct level using Go's `json:"-"` struct tag, which instructs JSON marshallers to exclude the field from serialized output. The `DatastoreConfig` struct marks `URI`, `SecondaryURI`, `Password`, and `SecondaryPassword` with `json:"-"` (`pkg/server/config/config.go:132-137`). Similarly, `AuthnPresharedKeyConfig.Keys` is marked `json:"-"` (`pkg/server/config/config.go:232`). This ensures that even if the config struct is accidentally logged or serialized, sensitive values are omitted. Secrets are injected exclusively through environment variables (`OPENFGA_DATASTORE_PASSWORD`, `OPENFGA_AUTHN_PRESHARED_KEYS`, etc.) or CLI flags — never baked into config files.

**3. Can config be changed at runtime or does it require restart?**

Config changes require **restart**. There is no mechanism for hot-reload of general configuration. The only exception is TLS certificates, which are dynamically reloaded via `certwatcher.New()` (`cmd/run/run.go:1239-1241`) — this allows certificate rotation without restart. For all other configuration parameters, the server must be restarted. Development mode (`make dev-run`) uses `CompileDaemon` for hot binary reloading, but this is a development convenience, not a production runtime config update mechanism.

**4. How is config validated at startup vs lazily?**

Config is validated **at startup** in two phases:
1. `VerifyServerSettings()` (`pkg/server/config/config.go:493-569`) — validates server-side runtime settings: connection pool sizing (`MaxOpenConns >= MinOpenConns >= MinIdleConns`), deadline constraints (`ListObjectsDeadline`/`ListUsersDeadline` cannot exceed request timeout), gRPC message size > 0, cache TTL > 0 when enabled, dispatch throttling thresholds, and datastore ping timeouts.
2. `VerifyBinarySettings()` (`pkg/server/config/config.go:571-639`) — validates binary-level settings: log format (`text`/`json`), log level enum, playground requires HTTP enabled + authn `none`, TLS cert/key must be provided when TLS enabled, `RequestTimeout` >= 0, `ShutdownTimeout` > 0.

No lazy validation was found. If validation fails, the server `panic`s immediately at startup (`cmd/run/run.go:411-412`).

**5. How does the system handle missing or invalid configuration?**

Missing config produces **silent defaults** — Viper's `Unmarshal` merges config file and env values onto `DefaultConfig()`, which returns a fully-populated struct with all defaults (`pkg/server/config/config.go:828-978`). If a required config file is not found, Viper does not error (`cmd/run/run.go:391-396` — only returns an error if the file exists but cannot be read). Invalid config (wrong type, out-of-range value) is caught by `Verify()` which returns a descriptive error, e.g., `"config 'grpc.maxRecvMsgBytes' must be greater than 0"` (`pkg/server/config/config.go:498-500`). The server then panics with that error message. **No explicit "required config" enforcement exists** — if `datastore-uri` is not set, the default (empty string) is used, which may cause runtime failures later.

## Architectural Decisions

**Use of Viper for config management**: OpenFGA delegates all configuration sourcing to [github.com/spf13/viper](https://github.com/spf13/viper), a mature Go library supporting file, env var, and CLI flag composition. This provides a consistent, battle-tested mechanism without custom code. The tradeoff is that Viper is a somewhat opaque dependency with non-standard error handling behavior.

**Hierarchical config structs**: Rather than a flat configuration map, OpenFGA uses typed sub-config structs (`DatastoreConfig`, `GRPCConfig`, `HTTPConfig`, `AuthnConfig`, `LogConfig`, `TraceConfig`, etc.) embedded in a top-level `Config` struct (`pkg/server/config/config.go:363-484`). This provides type safety and self-documenting structure.

**Experimental feature flags as a static list**: Experimental features are defined as string constants in `pkg/server/config/config.go:107-121` (`ExperimentalCheckOptimizations`, `ExperimentalListObjectsOptimizations`, etc.) and enabled by adding their names to the `Experimentals []string` list. The feature flag `Client` interface (`pkg/featureflags/client.go:3-5`) is minimal — it only checks membership in a static map. There is no dynamic flag evaluation, percentage rollouts, or remote flag storage.

**Verification-as-startup-gate**: All config validation happens synchronously at startup before any server goroutines start. The `Verify()` method (`pkg/server/config/config.go:486-491`) returns an error which causes a panic if invalid. This prevents the server from starting in a misconfigured state.

## Notable Patterns

**`json:"-"` for secret isolation**: Sensitive fields in config structs use Go's `json:"-"` struct tag to exclude them from JSON serialization, preventing accidental secret leakage in logs or error messages (`pkg/server/config/config.go:132-137`, `pkg/server/config/config.go:232`).

**Option pattern for server construction**: Server construction in `cmd/run/run.go` uses a functional options pattern with `ServerOption` functions, allowing the server to be constructed with varying configurations for TLS, middleware, and datastore.

**Dedicated verify functions**: Rather than validating everything in one function, validation is split across `VerifyServerSettings()`, `VerifyBinarySettings()`, `VerifyDispatchThrottlingConfig()`, `VerifyDatastoreThrottlesConfig()`, `verifyDeadline()`, `verifyRequestDurationDatastoreQueryCountBuckets()`, and `verifyCacheConfig()` — each handling a specific config area.

**Config schema as documentation**: A JSON Schema file (`.config-schema.json`) serves as the authoritative reference for all configuration options, with each property annotated with `x-env-variable` showing the corresponding environment variable name.

## Tradeoffs

**Static feature flags vs. dynamic evaluation**: The feature flag system (`pkg/featureflags/client.go`) is a simple static list — flags are just strings in the `Experimentals` config array. There is no support for percentage rollouts, per-store flags, or remote flag management. This is a deliberate simplicity tradeoff suitable for an open-source project but limiting for multi-tenant SaaS use cases.

**No remote config store**: All configuration originates from local files, environment variables, or CLI flags. There is no integration with distributed config stores like etcd, Consul, or Apollo. This simplifies deployment but makes it harder to manage configuration across multiple instances in a distributed system.

**Panic on invalid config**: When `Verify()` fails, the server panics (`cmd/run/run.go:411-412`). This fails fast and prevents misconfigured servers from running, but provides no opportunity for graceful degradation or retry.

**Silent defaults for missing config**: If environment variables or config file values are not provided, Viper silently uses defaults from `DefaultConfig()`. There is no explicit enumeration of required vs. optional configuration fields, meaning a misconfigured server may start and fail only at the first runtime request (e.g., empty datastore URI).

**No TLS hot-reload for general config**: While TLS certificates can be hot-reloaded via certwatcher, all other configuration (datastore connection settings, timeouts, cache sizes, feature flags) requires server restart. There is no config reload mechanism.

## Failure Modes / Edge Cases

**Empty datastore URI**: If `datastore.uri` is not configured, the default empty string is used. The server will start but fail when it attempts to connect to the datastore. No pre-flight validation exists for valid datastore connection strings.

**Playground enabled without correct auth**: The playground requires both `http.enabled=true` and `authn.method="none"` (`pkg/server/config/config.go:596-604`). If only one is set, `VerifyBinarySettings()` returns an error.

**Datastore connection pool misconfiguration**: `VerifyServerSettings()` validates that `MaxOpenConns >= MinOpenConns >= MinIdleConns` (`pkg/server/config/config.go:548-554`). Violation causes startup panic.

**Experimental flags with typos**: If a user adds an experimental flag name with a typo (e.g., `"enable_check_optimizations"` instead of `"enable-check-optimizations"`), the flag is silently ignored — no error or warning is produced. The `defaultClient.Boolean()` method just checks map membership (`pkg/featureflags/client.go:23-26`).

**TLS cert/key mismatch**: If TLS is enabled but cert or key path is empty, `VerifyBinarySettings()` catches this at startup (`pkg/server/config/config.go:606-619`). However, if the certificate file exists but is invalid, the error surfaces at runtime during TLS handshake, not at startup validation.

**Log level "none" warning**: When `log.level` is set to `"none"`, a warning is printed to stdout at startup (`pkg/server/config/config.go:588-590`) acknowledging the security risk of disabled logging.

## Future Considerations

**Remote config store integration**: Adding support for distributed config stores (etcd, Consul) would enable central configuration management for multi-instance deployments.

**Dynamic config reload**: A mechanism to reload configuration without restart (using SIGHUP or an API endpoint) would improve operational flexibility, especially for tuning cache sizes, timeouts, and throttling thresholds in production.

**Enhanced feature flag system**: Moving from static string-based flags to a proper feature flag service (e.g., LaunchDarkly, Flagsmith) would enable percentage rollouts, per-store targeting, and A/B testing — valuable for a multi-tenant ReBAC engine.

**Required vs. optional config distinction**: Making a subset of configuration fields explicitly required with validation at startup (rather than failing at first use) would improve developer experience and fail-fast behavior.

**Secret rotation without restart**: While TLS certs support hot-reload, datastore credentials do not. Implementing credential hot-reload for database passwords would improve security posture in production environments.

## Questions / Gaps

1. **No evidence of config version tracking or migration**: As configuration schema evolves (`Config` struct in `pkg/server/config/config.go:363-484`), there is no documented mechanism for schema versioning or migration. How are breaking config changes handled across releases?

2. **No per-tenant configuration**: OpenFGA is designed as a single-tenant or multi-store system (each store has its own authorization models), but there is no per-store runtime configuration override mechanism. All global config applies uniformly.

3. **Config observability**: There is no built-in endpoint (e.g., `/config` or `/health/config`) to inspect the current configuration at runtime. Operators cannot verify what config values are actually active without restarting with verbose logging.

4. **No config change audit trail**: Changes to configuration via environment variables or config files are not explicitly logged or audited. In regulated environments, this may be a compliance gap.

---

*Generated by `dimensions/03-configuration-environment-management.md` against `openfga`.*