# Configuration & Environment Management - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Dimension | `03-configuration-environment-management.md` |
| Sources | cli, grafana, kubernetes, milvus, nats-server, openfga, temporal, victoriametrics |
| Date | 2026-05-20 |

## Sources Studied

| # | Source | Path |
|---|--------|------|
| 1 | cli | `sources/cli` |
| 2 | grafana | `sources/grafana` |
| 3 | kubernetes | `sources/kubernetes` |
| 4 | milvus | `sources/milvus` |
| 5 | nats-server | `sources/nats-server` |
| 6 | openfga | `sources/openfga` |
| 7 | temporal | `sources/temporal` |
| 8 | victoriametrics | `sources/victoriametrics` |

Note: pocketbase report was not found in the source directory.

## Executive Summary

Configuration and environment management approaches across these eight Go projects range from basic (cli at 7/10) to exemplary (grafana and kubernetes at 8/10). The core tension is between **operational simplicity** (restart-required config, plaintext secrets) and **operational flexibility** (hot-reload, event-driven reactivity, encrypted secrets). Projects that handle multi-tenant or distributed workloads (kubernetes, milvus, temporal) universally invest in hot-reload and source composition, while single-tenant projects (openfga, nats-server) tend toward restart-required models. No project achieves perfect secrets management — all rely primarily on OS-level file permissions with varying degrees of envelope encryption.

## Core Thesis

Configuration management in Go projects follows the operational model more than the codebase size or age. Projects designed for containerized/cloud-native deployment (kubernetes, milvus, temporal, grafana) invest heavily in multi-source composition (env vars + file + remote), hot-reload, and secrets isolation. Projects designed for single-binary server deployment (nats-server, openfga, victoriametrics) favor simplicity with restart-required config. The distinguishing factor is not the number of features but whether config changes require process restart — and this maps directly to whether the project needs to operate in environments where operators cannot restart processes freely (Kubernetes namespaces, multi-tenant SaaS, long-running sessions).

## Rating Summary

| Source | Score | Approach | Main Strength | Main Concern |
|--------|-------|----------|---------------|--------------|
| cli | 7/10 | Layered (YAML + keyring + env) | Keyring-based secret isolation with timeout protection | No hot-reload; lazy validation only on set; no schema enforcement |
| grafana | 8/10 | INI layered + GF_ env prefix | Comprehensive env var override system; OpenFeature integration | No hot-reload for most settings; legacy Cfg global being deprecated |
| kubernetes | 8/10 | Flag-first + file + drop-in directory | Strict startup validation; per-object ConfigMap/Secret watches; drop-in merge | No native env:var struct tag binding; kubelet config requires restart |
| milvus | 7/10 | Priority-based multi-source (Env/Etcd/File) | Event-driven hot-reload via etcd; callback mechanism for reactivity | Plaintext secrets in config files; no Vault integration; polling vs watch |
| nats-server | 8/10 | Custom lexer + include directives + $VAR | Hot-reload for most options via option interface; feature flag map-override | Custom config format; plaintext secrets; no remote config store |
| openfga | 7/10 | Viper-based (file/env/CLI) | json:"-" tags for secret isolation; TLS cert hot-reload | No hot-reload for general config; static feature flags; silent defaults |
| temporal | 8/10 | Layered template + dynamic config file | Static/dynamic config separation; hot-reload dynamic config; PasswordCommand | No built-in Vault; static config requires restart; limited secret masking |
| victoriametrics | 7/10 | Flags + env + YAML with %{ENV} | Password type with external source; SIGHUP hot-reload; graceful fallback | No formal feature flag; secret detection by naming; strict mode opt-in |

## Approach Models

### Model 1: Static Config with Restart Required
**Represented by: cli, openfga, nats-server**

These projects load configuration at startup and treat config changes as requiring process restart. cli uses a factory pattern returning lazy-loaded config. openfga uses Viper for multi-source binding but has no hot-reload mechanism. nats-server has extensive hot-reload for many options but not all (store_dir, JetStream limits require restart).

**What converges**: Configuration is eagerly loaded once, cached, and used for the process lifetime. Changes require restart.

**Why they diverge**: cli prioritizes testability (factory enables config mocking); openfga prioritizes simplicity (Viper handles everything); nats-server prioritizes operational flexibility (hot-reload for common options, explicit error for unsupported changes).

### Model 2: Hot-Reload via File Watching or Polling
**Represented by: kubernetes, milvus, temporal, victoriametrics**

These projects monitor configuration sources for changes and apply them without restart. kubernetes uses fsnotify with polling fallback for pod manifests and per-object watches for ConfigMaps/Secrets. milvus polls etcd on a 5s interval and dispatches events to registered callbacks. temporal uses a FileBasedClient that polls at configurable intervals and notifies subscribers. victoriametrics handles SIGHUP signals and periodic checking with graceful fallback on failure.

**What converges**: Configuration changes propagate without process restart through either filesystem events or polling intervals. All support graceful degradation when reload fails.

**Why they diverge**: kubernetes is designed for pod-level config (manifests, ConfigMaps) where watching is natural; milvus and temporal need distributed config sync across cluster nodes; victoriametrics prioritizes availability (continues with stale config on reload failure).

### Model 3: Layered Merge with Environment Priority
**Represented by: grafana, temporal (embedded template)**

These projects define a clear precedence order for configuration sources. grafana's merge order is: defaults → custom config → command-line defaults → env vars → command-line properties → variable expansion. temporal's embedded template uses Go templates with environment variable substitution as the primary container deployment mechanism.

**What converges**: Environment variables take highest precedence in both systems, enabling containerized deployments to override config without modifying files.

**Why they diverge**: grafana uses INI format with GF_ prefix for all env vars; temporal uses Go templates that render env vars directly into YAML at load time, giving more flexible templating but moving validation outside the type system.

## Pattern Catalog

### Pattern 1: Multi-Source Composition with Priority Ordering
**Problem solved**: Allows different deployment environments (local dev, CI, production) to override defaults without modifying shared config files.

**Sources**: milvus (EnvSource=50 > EtcdSource=10 > FileSource=100), grafana (defaults < custom < cmd defaults < env < cmd props), temporal (embedded template with env precedence), nats-server (CLI > env > file > defaults)

**Why it works**: Lower priority number = higher precedence in milvus; explicit ordering in grafana; template rendering in temporal. All systems handle the case where a key exists in multiple sources by applying a deterministic merge rule.

**When to copy**: When deploying to multiple environments with varying configuration needs. Environment variables should always be able to override file-based config for secrets and environment-specific values.

**When overkill**: For single-environment single-binary deployments where config rarely changes.

**Evidence**: `pkg/config/manager.go:271-291` (milvus AddSource with priority); `pkg/setting/setting.go:1255-1317` (grafana loadConfiguration); `common/config/loader.go:71-117` (temporal WithEnv, WithConfigDir, WithConfigFile)

### Pattern 2: Event-Driven Reactive Configuration
**Problem solved**: Allows components to react to configuration changes without polling or restart.

**Sources**: milvus (EventDispatcher with Register/Dispatch), temporal (NotifyingClient with Subscribe/PublishUpdates), kubernetes (ConfigMap/Secret watches with per-object reflectors)

**Why it works**: The Observer pattern decouples config sources from config consumers. When a config value changes, all registered callbacks are invoked. This enables fine-grained reactivity where only the components that care about a specific key are notified.

**When to copy**: When you have components that need to react to config changes at runtime (e.g., cache size changes, timeout adjustments, feature toggles).

**When overkill**: For simple services where all config is read once at startup and never changes. The added complexity of callback registration and cleanup is not justified.

**Evidence**: `pkg/config/event_dispatcher.go:42-71` (milvus); `common/dynamicconfig/client.go:36-41` (temporal); `pkg/kubelet/util/manager/watch_based_manager.go:222-257` (kubernetes)

### Pattern 3: Secret Isolation via Struct Tags or Custom Types
**Problem solved**: Prevents accidental secret leakage in logs, error messages, or serialized output.

**Sources**: openfga (json:"-" on DatastoreConfig.Password), temporal (MaskYaml replacing password/keyData with ******), victoriametrics (Password type returning "secret" from String()), grafana (RedactedValue() checking sensitive key patterns)

**Why it works**: By marking fields as sensitive at the type level, the serialization layer automatically excludes them. Custom types like victoriametrics' Password provide both exclusion from logs and support for external secret sources (file://, http://).

**When to copy**: When your config includes any secrets (database passwords, API keys, tokens) that could be accidentally logged or serialized.

**When overkill**: For projects with no secrets in configuration (rare for any real system).

**Evidence**: `pkg/server/config/config.go:132-137` (openfga); `common/masker/masker.go:9-14` (temporal); `lib/flagutil/password.go:88-90` (victoriametrics); `pkg/setting/setting.go:828-878` (grafana)

### Pattern 4: Hot-Reload with Graceful Degradation
**Problem solved**: Allows config updates to be applied without restart while ensuring the service remains available even if the config update fails.

**Sources**: victoriametrics (continues with previous config on SIGHUP failure), temporal (previous config remains active when dynamic config file has errors), kubernetes (file watching with polling fallback; per-object cache with idle timeout)

**Why it works**: Rather than failing the entire service when a config reload fails, the system retains the last known good configuration. This is critical for monitoring systems and long-running services where availability trumps config freshness.

**When to copy**: For any production service where downtime is costly. The pattern explicitly prioritizes availability over config accuracy during transient failures.

**When overkill**: For development tools where misconfigured config should fail fast and visibly.

**Evidence**: `lib/promscrape/scraper.go:164-169` (victoriametrics); `common/dynamicconfig/file_based_client.go:191-192` (temporal); `pkg/kubelet/config/file.go:91-114` (kubernetes polling fallback)

### Pattern 5: Startup Validation with Aggregated Errors
**Problem solved**: Catches all configuration errors at startup rather than failing on the first error, allowing users to fix all issues in one pass.

**Sources**: kubernetes (ValidateKubeletConfiguration collecting allErrors), nats-server (configErr with token position; processConfigErr bundling errors + warnings), temporal (config.Load calling validate.Validate)

**Why it works**: Error aggregation collects multiple issues before reporting, reducing the number of restart cycles needed to fix a misconfigured service. Token-position tracking enables precise error messages pointing to the exact file and line.

**When to copy**: For any config system where users might misconfigure multiple values. Single-error-at-a-time feedback is frustrating when fixing a config file.

**When overkill**: For simple CLIs where users are likely to get it right the first time and single-error feedback is acceptable.

**Evidence**: `pkg/kubelet/apis/config/validation/validation.go:47` (kubernetes allErrors); `server/opts.go:1080-1117` (nats-server error aggregation); `common/config/loader.go:213-214` (temporal validation)

### Pattern 6: Feature Flags as Static Lists with Dynamic Evaluation Option
**Problem solved**: Provides a mechanism to enable/disable features at runtime without code deployment.

**Sources**: grafana (standardFeatureFlags with IsEnabled() + OpenFeature for remote providers), kubernetes (FeatureGate with versioned specs and Enabled() method), nats-server (featureFlags map with getMergedFeatureFlags()), openfga (Experimental []string with Boolean() check), temporal (dynamic config as de facto feature flags with per-key constraints)

**Why it works**: A simple map-override pattern (default flags + user overrides = merged result) handles most cases. Projects that need more sophisticated evaluation (percentage rollouts, remote providers) extend the basic pattern with external evaluation services.

**When to copy**: For any project that needs to ship features gradually or allow operators to toggle behavior at runtime.

**When overkill**: For simple single-version projects where all users run the same version and features are shipped via code deployment.

**Evidence**: `pkg/services/featuremgmt/manager.go:15-103` (grafana); `pkg/features/kube_features.go:41-1179` (kubernetes); `server/feature_flags.go:27-77` (nats-server); `pkg/featureflags/client.go:3-26` (openfga)

### Pattern 7: Config Source File with Env Var Template Substitution
**Problem solved**: Enables configuration files to reference environment variables, allowing containerized deployments to inject config without modifying files.

**Sources**: temporal (Go templates with sprig functions: `{{ default "info" (env "LOG_LEVEL") }}`), victoriametrics (%{ENV_VAR} placeholders in YAML), grafana ($(ENV_VAR) syntax via envExpander), nats-server ($VAR syntax via lookupVariable())

**Why it works**: Template substitution happens before YAML parsing, so environment variables can be embedded anywhere in the config file structure. This decouples config file templates from specific deployment values.

**When to copy**: For containerized applications deployed via Kubernetes or similar orchestrators where environment variables are the primary configuration injection mechanism.

**When overkill**: For applications deployed via traditional config files on bare metal or VMs where direct config file editing is the norm.

**Evidence**: `common/config/config_template_embedded.yaml:4` (temporal); `lib/envtemplate/envtemplate.go:74-82` (victoriametrics); `pkg/setting/expanders.go:117-130` (grafana); `conf/parse.go:448-484` (nats-server)

## Key Differences

### Hot-Reload Capability vs. Restart Required
This is the single largest differentiator. Kubernetes, milvus, temporal, and victoriametrics support runtime config changes without restart. cli, openfga, and nats-server require restart for most config changes (nats-server has extensive hot-reload but explicitly fails for certain options like store_dir). grafana supports dynamic overrides via environment variables for some settings but not structural changes.

The pattern maps to operational need: projects managing distributed systems or long-running sessions (kubernetes pods, database clusters, stream processing) invest in hot-reload. Single-tenant services and CLIs can get away with restart-required config.

### Secrets Management Maturity
All projects handle secrets, but with varying degrees of sophistication:

- **Best**: grafana (envelope encryption with KMS providers), temporal (PasswordCommand for external secret execution)
- **Good**: openfga (json:"-" tags), victoriametrics (Password type with external source), cli (keyring with timeout wrapper)
- **Basic**: kubernetes (dedicated Secret objects but no envelope encryption for config), milvus (plaintext in YAML, no encryption), nats-server (bcrypt hashed but on disk), temporal (masking on output but not at rest)

No project has native Vault integration in the main config loading path. Secrets are primarily protected by OS-level file permissions, with higher-level encryption as an optional enhancement.

### Validation Strategy
Projects split between eager startup validation (kubernetes, nats-server, temporal) and lazy validation on access (cli, openfga). grafana and victoriametrics have layered validation: startup checks for required fields, lazy checks for structural issues.

Startup validation catches all config errors at once but requires restart to fix. Lazy validation allows partial startup but may fail at first use of a misconfigured feature.

### Configuration Format
INI (grafana), YAML (milvus, temporal, victoriametrics, openfga), custom lexer (nats-server), struct-based with flags (kubernetes, cli). No project uses JSON Schema or structured schema validation. The choice of format tends to follow the project age and operational community: INI for ops-friendly tools, YAML for cloud-native tools, custom for projects with specific needs (nats-server's include directive).

## Tradeoffs

| Decision | Benefit | Cost | Best-Fit Context | Failure Mode | Alternative |
|----------|---------|------|------------------|--------------|-------------|
| Hot-reload via polling | Simple implementation; works with any config source | Config propagation delay (5s-60s default) | Distributed systems needing config sync across nodes | Stale config window between polls | Native watches (k8s) or push-based (webhook) |
| Hot-reload via SIGHUP | Explicit trigger; works in all environments | Requires signal handling; no automatic propagation | Single-instance services; containerized apps | Signal lost during startup window | File-based watching or API endpoint |
| Keyring for secrets | OS-level protection; timeout prevents hangs | Requires OS keychain; fallback to plaintext if unavailable | Desktop apps; CLI tools | Keyring timeout causes fallback to plaintext | Envelope encryption or Vault |
| json:"-" for secret isolation | Zero-cost; compiler-enforced | Only works for JSON serialization; other formats need separate handling | Any service with JSON config | Accidental logging via other serializers (fmt.Sprintf) | Custom type with String() override |
| Startup validation | Fail-fast; all errors visible at once | May prevent starting with partial config | Production deployments | No degraded mode; must fix all errors | Lazy validation with error aggregation |
| Environment variable override | Container-friendly; no file modification needed | Can collide with other tools; prefix required | Cloud-native deployments; Kubernetes | Accidental override of intended values | Explicit config file with env var fallback |
| Feature flags as static list | Simple; no external dependency | No percentage rollouts; no targeting rules | Single-tenant OSS projects | Limited operational control | Remote feature flag service (LaunchDarkly, Flagsmith) |

## Decision Guide

**Q: Should I implement hot-reload?**

If your service runs in environments where operators cannot restart processes freely (Kubernetes, long-running sessions, multi-tenant SaaS), implement hot-reload. If your service is a single-tenant binary that can be restarted without significant cost, restart-required config is simpler and sufficient.

**Q: How should I handle secrets?**

Start with environment variables for secrets injection (never bake secrets into config files). Add json:"-" tags on sensitive struct fields to prevent logging leakage. For higher security needs, implement a Password type that can read from external sources (file://, http://) with periodic re-reading for rotation. Consider envelope encryption for stored secrets if regulatory requirements demand it.

**Q: What validation strategy should I use?**

Use startup validation for required fields and structural integrity. Use lazy validation for value-specific constraints that depend on runtime context. Always aggregate errors rather than failing on the first error.

**Q: How should I implement feature flags?**

Start with a static list (string constants or a simple map). Add dynamic evaluation via external provider when you need percentage rollouts or targeting rules. Keep the feature flag interface minimal (check name → boolean) until you need sophistication.

**Q: What configuration format should I use?**

YAML for cloud-native projects with complex nested config. INI for ops-friendly projects where humans edit config directly. Custom format only if you need specific features (like nats-server's include directive) that standard formats don't support.

## Practical Tips

1. **Use environment variable prefix conventions** (GF_ for Grafana, OPENFGA_ for OpenFGA, MILVUS_ for Milvus) to avoid collisions with system env vars and signal which env vars are intentional config inputs.

2. **Implement graceful degradation on config reload failure** — continue with previous config and log an error. This prevents transient failures (file temporarily unavailable, network blip) from causing unnecessary restarts.

3. **Use a Password type for secrets** that supports external sources (file://, http://). This enables secret rotation without config file changes and prevents secrets from appearing in logs.

4. **Aggregate all configuration errors at startup** rather than failing on the first error. Users should be able to fix all misconfigurations in one pass.

5. **Implement config source tracking** — record whether each config value came from default, file, or environment. This helps with debugging and auditing.

6. **Use the factory pattern for config access** in CLIs — this enables lazy loading (so commands like `gh version` work without config) and testability (mock config in tests).

7. **Add an HTTP endpoint for config inspection** (`/configz` in Kubernetes) — this helps operators verify what config values are actually active without restarting with verbose logging.

8. **Use struct tags for secret identification** (json:"-" in Go structs) rather than naming conventions — this provides compiler-enforced protection against accidental logging.

## Anti-Patterns / Caution Signs

1. **Missing default values causing panic**: If accessor methods call `.Unwrap()` on optional values without checking presence, missing config causes panics. cli has this issue at `internal/config/config.go:119-121`.

2. **Silent defaults for required config**: If Viper silently uses defaults when required config is missing, the service starts but fails at first use. openfga has this issue — empty datastore URI defaults to empty string, causing runtime connection failures.

3. **Hot-reload with polling but no fallback**: If the watch mechanism fails and there's no polling fallback, config changes are silently ignored. kubernetes handles this well; some projects don't.

4. **Env var override without indication**: If setting an environment variable bypasses config file values without any log message, users may be confused about why their config file changes aren't taking effect. cli has this issue noted at `internal/config/config.go:317-318`.

5. **Strict mode disabled by default**: If unknown YAML field detection is opt-in and disabled by default, typos in config files are silently ignored. victoriametrics has this issue with `-promscrape.config.strictParse` defaulting to false.

6. **No cleanup for event handlers**: If the EventDispatcher accumulates handlers without cleanup, memory grows unbounded over time. milvus has no visible cleanup mechanism in `EventDispatcher`.

7. **Config drift in distributed systems**: If each node polls independently with a 5s interval, nodes may temporarily have different config values after a change. milvus has this issue at `base_table.go:223-227`.

8. **Feature flag typos silently ignored**: If experimental flags are just strings in a list, misspelled flag names are silently ignored. openfga has this issue at `pkg/featureflags/client.go:23-26`.

## Notable Absences

1. **No project has native Vault integration** in the main config loading path. All rely on OS-level file permissions or manual secret injection.

2. **No project has config rollback or version history** except kubernetes which has etcd as a backing store (but this is etcd's native capability, not a k8s config feature).

3. **No project has structured schema validation** (JSON Schema, CUE, KCL) for configuration files. Validation is always code-based, either via struct tags or explicit validate functions.

4. **No project has per-tenant configuration isolation** in the config system itself. Multi-tenancy is handled at the application layer, not the config layer.

5. **No project has config change audit logging** — changes via environment variables or config files are not explicitly logged or audited.

## Per-Source Notes

### cli
Good keyring implementation with timeout wrapper. Factory pattern for config access enables testability. Weaknesses: no hot-reload, lazy validation only on set (not at startup), no schema enforcement, no feature flag system. Score 7/10.

### grafana
Excellent environment variable override system with GF_ prefix. Feature flags with OpenFeature integration show forward-thinking design. Legacy Cfg global being deprecated in favor of ConfigProvider interface. Weaknesses: no hot-reload, INI format lacks schema enforcement. Score 8/10.

### kubernetes
Exemplar startup validation and drop-in directory merging. Per-object watches for ConfigMaps/Secrets scale well. Feature gates with versioned specs enable graduated rollouts. Weaknesses: no env:var struct tag binding, kubelet config requires restart, no native Vault integration. Score 8/10.

### milvus
Strong event-driven reactive config with callback mechanism. Priority-based multi-source composition is well-designed. Weaknesses: plaintext secrets in YAML, no Vault integration, polling vs native watch, no config version/history. Score 7/10.

### nats-server
Custom lexer supports $VAR substitution and include directives. Hot-reload via option interface is extensive but explicit about unsupported options. Weaknesses: custom config format, plaintext secrets, no remote config store. Score 8/10.

### openfga
json:"-" tags for secret isolation are clean. Viper handles multi-source composition simply. TLS cert hot-reload via certwatcher is good. Weaknesses: no hot-reload for general config, static feature flags, silent defaults for missing required config. Score 7/10.

### temporal
Static/dynamic config separation is well-designed. FileBasedClient with Subscribe is a solid hot-reload pattern. PasswordCommand for external secrets is flexible. Weaknesses: no built-in Vault, static config requires restart, limited secret masking (only password/keyData). Score 8/10.

### victoriametrics
Password type with external source (file://, http://) and periodic re-reading is excellent. SIGHUP + graceful fallback prioritizes availability. Weaknesses: no formal feature flag system, secret detection by naming (can miss custom names), strict mode opt-in. Score 7/10.

## Open Questions

1. **How should config migration between versions be handled?** No project has a documented mechanism for migrating config schema across major versions. cli has a Migration interface but it's used for data migration, not config schema migration.

2. **Should hot-reload be push or pull based?** The projects using polling (milvus 5s, temporal 60s) have latency windows; projects using watches (kubernetes per-object) are more responsive but require more infrastructure. Push-based (webhook, gRPC) would be faster but adds complexity.

3. **How should per-tenant config isolation work in multi-tenant systems?** No project studied implements tenant-level config isolation in the config system. This is left to the application layer.

4. **What is the right balance between fail-fast and graceful degradation on invalid config?** kubernetes fails fast (exit on invalid config); victoriametrics continues with previous config on reload failure. Both approaches have merit depending on the operational context.

5. **Should secrets in config files be encrypted at rest?** Currently all projects rely on OS-level file permissions. Encrypted config files would provide defense-in-depth but add complexity for key management.

## Evidence Index

Every evidence reference in this report follows the `path/to/file.go:NN` format.

| Source | Area | Evidence | File:Line |
|--------|------|----------|-----------|
| cli | Config interface | gh.Config interface with GetOrDefault, Set, Write | `internal/gh/gh.go:32-80` |
| cli | Config implementation | NewConfig() reads from ghConfig.Read() | `internal/config/config.go:40-46` |
| cli | Keyring wrapper | Timeout-wrapped keyring operations | `internal/keyring/keyring.go:22-74` |
| cli | Auth token retrieval | ActiveToken() searches env vars, then keyring | `internal/config/config.go:237-260` |
| cli | Config validation on set | ValidateKey() and ValidateValue() | `pkg/cmd/config/set/set.go:90-129` |
| grafana | Config loading | loadConfiguration() orchestrates layered loading | `pkg/setting/setting.go:1255-1317` |
| grafana | Env var binding | applyEnvVariableOverrides() scans GF_* vars | `pkg/setting/setting.go:913-997` |
| grafana | Feature flags | FeatureManager struct with IsEnabled() | `pkg/services/featuremgmt/manager.go:15-103` |
| grafana | OpenFeature integration | InitOpenFeatureWithCfg() creates provider | `pkg/services/featuremgmt/openfeature.go:14-39` |
| grafana | Secrets redaction | RedactedValue() patterns check sensitive keys | `pkg/setting/setting.go:828-878` |
| kubernetes | Kubelet config loading | Multi-stage: create, file load, drop-in merge, flag precedence | `cmd/kubelet/app/server.go:148-258` |
| kubernetes | Drop-in merge | JSON patch merge with lexical ordering | `cmd/kubelet/app/server.go:331-400` |
| kubernetes | File watch | fsnotify-based hot-reload for pod manifests | `pkg/kubelet/config/file_linux.go:67-99` |
| kubernetes | ConfigMap manager | Per-object reflector with field selectors | `pkg/kubelet/util/manager/watch_based_manager.go:222-257` |
| kubernetes | Startup validation | ValidateKubeletConfiguration() before start | `cmd/kubelet/app/server.go:254-258` |
| kubernetes | Feature gate interface | Enabled(key Feature) bool method | `staging/src/k8s.io/component-base/featuregate/feature_gate.go:145` |
| milvus | Config Manager | Manager struct with Dispatcher, sources, overlays | `pkg/config/manager.go:86-97` |
| milvus | Multi-source loading | AddSource with priority ordering | `pkg/config/manager.go:271-291` |
| milvus | Event-driven updates | EventDispatcher.Register and Dispatch | `pkg/config/event_dispatcher.go:42-71` |
| milvus | Hot-reload refresher | Periodic polling via time.Ticker | `pkg/config/refresher.go:64-81` |
| milvus | Callback mechanism | ParamChangeCallback for config notifications | `pkg/util/paramtable/param_item.go:35` |
| nats-server | Config parsing | Custom lexer/parser for .conf format | `conf/lex.go:1`, `conf/parse.go:1` |
| nats-server | Env var support | $VAR syntax in config values | `conf/parse.go:383-398` |
| nats-server | Include directive | include 'file.conf' support | `conf/lex.go:483`, `conf/parse.go:419` |
| nats-server | Hot-reload | Server.Reload() + ReloadOptions() | `server/reload.go:1396-1485` |
| nats-server | Option interface | option interface with Apply() and change type methods | `server/reload.go:42-74` |
| nats-server | Validation | validateOptions() with 10+ sub-validators | `server/server.go:1137-1183` |
| openfga | Viper init | SetEnvPrefix("OPENFGA"), AutomaticEnv() | `cmd/root.go:23-25` |
| openfga | Config unmarshal | viper.Unmarshal(config) loads into DefaultConfig() | `cmd/run/run.go:388-400` |
| openfga | Secret isolation | json:"-" on DatastoreConfig.Password | `pkg/server/config/config.go:132-137` |
| openfga | Config Verify() | Entry point for all validation | `pkg/server/config/config.go:486-491` |
| openfga | TLS cert hot-reload | certwatcher.New() for dynamic TLS | `cmd/run/run.go:1239-1241` |
| temporal | Config struct | Config struct with yaml tags | `common/config/config.go:30-56` |
| temporal | Env var binding | Embedded template uses {{ env "VAR_NAME" }} syntax | `common/config/config_template_embedded.yaml:4` |
| temporal | Secrets masking | MaskYaml() replaces password/keyData with ****** | `common/masker/masker.go:9-14` |
| temporal | Dynamic config client | FileBasedClient polls config file | `common/dynamicconfig/file_based_client.go:133-147` |
| temporal | NotifyingClient | Subscribe() method for hot-reload | `common/dynamicconfig/client.go:36-41` |
| temporal | PasswordCommand | External command executes to fetch password | `common/config/persistence.go:301-323` |
| victoriametrics | Env var flag binding | envflag.Parse() reads env vars for unset flags | `lib/envflag/envflag.go:24-27` |
| victoriametrics | Env template substitution | %{ENV_VAR} placeholder expansion | `lib/envtemplate/envtemplate.go:12-16` |
| victoriametrics | Secret flag registration | RegisterSecretFlag() marks flags as secret | `lib/flagutil/secret.go:13-16` |
| victoriametrics | Password type | Supports file://, http://, https:// sources | `lib/flagutil/password.go:37-47` |
| victoriametrics | Config hot reload | SIGHUP + ticker-based reload | `lib/promscrape/scraper.go:112-206` |
| victoriametrics | YAML strict parsing | yaml.UnmarshalStrict() for unknown field detection | `lib/promscrape/config.go:129` |

---

Generated by dimension `03-configuration-environment-management.md`.