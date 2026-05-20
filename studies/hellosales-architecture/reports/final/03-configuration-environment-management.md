# Configuration & Environment Management - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Dimension | `03-configuration-environment-management` |
| Sources | cli, grafana, kubernetes, milvus, nats-server, openfga, temporal, victoriametrics |
| Date | 2026-05-20 |

## Sources Studied

| # | Source | Path |
|---|--------|------|
| 1 | cli | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/cli` |
| 2 | grafana | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/grafana` |
| 3 | kubernetes | `sources/kubernetes` |
| 4 | milvus | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/milvus` |
| 5 | nats-server | `sources/nats-server` |
| 6 | openfga | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/openfga` |
| 7 | temporal | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/temporal` |
| 8 | victoriametrics | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/victoriametrics` |

Note: pocketbase source analysis was not available at `reports/source/03-configuration-environment-management/pocketbase.md`.

## Executive Summary

All eight studied sources implement configuration systems with layered sourcing, but they diverge sharply on four axes: **hot-reload capability** (full support in k8s/nats/milvus/temporal/victoriametrics; absent in cli/openfga/grafana), **secret isolation mechanism** (keyring, `json:"-"`, bcrypt, masking, Password type), **validation strategy** (strict startup vs lazy/runtime), and **remote config store integration** (only milvus uses etcd; all others are local-file/env-only). No source implements Vault, and no source has a production-ready feature flag system with dynamic evaluation.

## Core Thesis

Configuration management in production Go systems typically follows one of three architectural models: **static-eager** (load once at startup, validate thoroughly, require restart for changes — cli, openfga), **static-with-hot-reload** (load at startup but watch for changes and apply selectively — nats-server, temporal, victoriametrics, kubernetes), or **reactive-event-driven** (multi-source with event dispatch on change — milvus). The choice is driven by the system's operational context: developer tools like CLI prioritize simplicity and cross-platform consistency; infrastructure components like k8s and nats require operational flexibility; AI/data systems like milvus prioritize runtime adaptability. Regardless of model, all systems treat secrets differently from general config, and the gap between "secrets on disk in plaintext" and "secrets from Vault" remains wide across all sources.

## Rating Summary

| Source | Score | Approach | Main Strength | Main Concern |
|--------|-------|----------|---------------|--------------|
| cli | 7/10 | Static-eager with keyring | Clean interface/implementation separation, factory pattern | No hot-reload, lazy validation only |
| grafana | 8/10 | Static-eager with env-override | Layered override system, feature toggle registry | Legacy Cfg global state, no hot-reload |
| kubernetes | 8/10 | Static-with-hot-reload + event-driven | Per-object watches, drop-in merge, feature gates | No env:var struct binding, no native Vault |
| milvus | 7/10 | Reactive-event-driven | Event dispatcher, etcd hot-reload, callback pattern | Secrets in plaintext, polling vs watch |
| nats-server | 8/10 | Static-with-hot-reload | Option interface pattern, reflection-based diff | Custom format, no remote store |
| openfga | 7/10 | Static-eager with Viper | Hierarchical typed config structs, json:"-" secrets | No hot-reload, silent defaults, static flags |
| temporal | 8/10 | Static-eager + dynamic-config | Separation of static/dynamic, PasswordCommand, masking | No Vault, static config requires restart |
| victoriametrics | 7/10 | Static-with-hot-reload | Password type, SIGHUP graceful fallback, opt-in env | No formal feature flags, secret detection by naming |

## Approach Models

### 1. Static-Eager (cli, openfga, grafana)

Configuration is loaded once at startup from file/env sources. Validation occurs at load time or on specific access. Changes require process restart. Secrets are isolated via OS keyring (cli), `json:"-"` struct tags (openfga), or redaction patterns (grafana). This model is simplest to implement and reason about, but forces operators to restart for any config change.

### 2. Static-With-Hot-Reload (nats-server, temporal, victoriametrics)

Configuration loads at startup, but a reload mechanism watches for file changes or listens for signals (SIGHUP). Not all config keys support hot-reload — only those explicitly designed as hot-swappable. This model balances safety (defaults applied once) with operational flexibility (certain values tunable without restart).

### 3. Reactive-Event-Driven (milvus)

Configuration flows through a Manager that accepts multiple Source implementations (Env, File, Etcd) with priority ordering. Changes in etcd trigger events through a Dispatcher, which notifies registered callbacks. This model enables fine-grained reactive behavior where components can subscribe to specific config keys and respond to changes without polling.

### 4. Hybrid-Multi-Stage (kubernetes)

Configuration composed in stages: flag parsing → file loading → drop-in directory merge. Hot-reload works per-object for ConfigMaps/Secrets via watches, but the kubelet config itself requires restart. Feature gates are versioned specs with separate enabled/disabled tracking.

## Pattern Catalog

### Pattern 1: Layered Config Composition with Priority

**Problem**: How to combine defaults, config files, environment variables, and CLI flags without ambiguity.

**Solution**: Define a fixed precedence order and apply sources in that sequence. Kubernetes uses 4-stage: defaults → file → drop-ins → flags. Grafana uses defaults.ini → custom.ini → env vars → cmd properties. Temporal uses embedded template → config dir → legacy hierarchy.

**Sources**: grafana (`pkg/setting/setting.go:1255-1317`), kubernetes (`cmd/kubelet/app/server.go:148-258`), temporal (`common/config/loader.go:71-117`)

**When to copy**: Any system with multiple config sources needs explicit precedence to prevent operator confusion.

**When overkill**: Single-source systems (file-only or env-only) don't need layered composition.

### Pattern 2: Secret Isolation via Output Masking

**Problem**: Config structs may contain sensitive values that could leak into logs if serialized accidentally.

**Solution**: Replace sensitive field values with `******` before returning string representations. Temporal's `MaskYaml()` in `common/masker/masker.go:9-14` masks `password` and `keyData` fields. VictoriaMetrics' `Password.String()` returns `"secret"` (`lib/flagutil/password.go:88-90`). OpenFGA uses `json:"-"` struct tags (`pkg/server/config/config.go:132-137`).

**Sources**: temporal, victoriametrics, openfga

**When to copy**: Any system where config structs are logged or serialized — which is most production systems.

**When overkill**: Systems where config never appears in logs or where secrets are already isolated in external stores.

### Pattern 3: Hot-Reload via File Watching or Signal

**Problem**: Config changes require process restart, disrupting long-running services.

**Solution**: Watch config files for changes (SIGHUP, fsnotify, polling) and re-apply selectively. VictoriaMetrics uses SIGHUP + ticker (`lib/promscrape/scraper.go:112-206`). NATS uses `Server.Reload()` + `diffOptions()` (`server/reload.go:1396`). Kubernetes uses fsnotify for pod manifests (`pkg/kubelet/config/file_linux.go:67-99`) and per-object watches for ConfigMaps (`pkg/kubelet/util/manager/watch_based_manager.go:180-210`).

**Sources**: kubernetes, nats-server, temporal, victoriametrics

**When to copy**: Long-running server processes where operators need to change behavior without full restart.

**When overkill**: Short-lived processes (CLI tools, batch jobs) where restart cost is low.

### Pattern 4: Event-Driven Reactive Config

**Problem**: Multiple components need to react to config changes without polling or restart.

**Solution**: Dispatch events on config change and let subscribers register callbacks. Milvus' `EventDispatcher` supports exact-key and prefix-based registration (`pkg/config/event_dispatcher.go:42-71`). Temporal's `NotifyingClient` with `Subscribe()` allows runtime updates to propagate (`common/dynamicconfig/client.go:36-41`).

**Sources**: milvus, temporal

**When to copy**: Complex systems with many components that need to adapt to config changes — especially AI/ML pipelines where data processing parameters affect multiple stages.

**When overkill**: Simple services where config is read once at startup and rarely changes.

### Pattern 5: Feature Flag Registry with Type-Safe Access

**Problem**: Feature toggles need to be controlled at runtime without recompilation.

**Solution**: Define flags in a registry with typed accessors. Grafana's `standardFeatureFlags` slice in `pkg/services/featuremgmt/registry.go:17-1320` enumerates all flags with metadata. Kubernetes uses `FeatureGate` interface with versioned specs (`pkg/features/kube_features.go:41-1179`).

**Sources**: grafana, kubernetes, openfga (static list in `pkg/server/config/config.go:107-121`)

**When to copy**: Systems that need to progressively enable features, A/B test, or gate experimental functionality.

**When overkill**: Single-tenant or simple systems where all features are always enabled or compile-time toggles suffice.

### Pattern 6: Remote Config Store Integration

**Problem**: Centralized config management across multiple deployment instances.

**Solution**: Store config in etcd (milvus) with periodic polling and event-based updates. All other sources are local-file/env-only.

**Sources**: milvus (`pkg/config/etcd_source.go:106`)

**When to copy**: Distributed systems requiring consistent config across nodes — especially multi-tenant AI systems.

**When overkill**: Single-instance deployments or systems where config changes are infrequent.

### Pattern 7: Secret Injection via External Command

**Problem**: Secrets should not be stored in config files but fetched dynamically at startup.

**Solution**: Execute an external command and capture its stdout as the secret value. Temporal's `PasswordCommand` in `common/config/persistence.go:301-323` runs a command with 30-second timeout. VictoriaMetrics' `Password` type supports `file://`, `http://`, `https://` sources with periodic re-reading (`lib/flagutil/password.go:37-47`).

**Sources**: temporal, victoriametrics

**When to copy**: Systems integrating with secret stores that don't support direct SDK integration (Vault, AWS Secrets Manager via shell wrapper).

**When overkill**: Systems with native Vault/KMS integration or where secrets are provided via environment variables already.

## Key Differences

### Hot-Reload Capability

**Full hot-reload**: kubernetes (ConfigMap/Secret watches, pod manifest fsnotify), nats-server (option interface with diff detection), temporal (dynamic config file polling with subscriptions), victoriametrics (SIGHUP + ticker), milvus (etcd event-driven)

**Partial hot-reload**: grafana (DynamicSection reads env vars at access time, but no file watching; TLS cert hot-reload in openfga)

**No hot-reload**: cli (config loaded once via factory), openfga (TLS certs only)

The divide correlates with operational context: infrastructure components (k8s, nats, VM) prioritize operational flexibility; application layers (cli, openfga) prioritize simplicity and predictability.

### Secrets Management Strategy

| Source | Mechanism | Encryption at Rest |
|--------|-----------|-------------------|
| cli | OS keyring (zalando/go-keyring) | Yes (via keychain) |
| grafana | Envelope encryption with KMS providers | Yes (enterprise) |
| kubernetes | Secret objects in etcd, per-pod projection | Yes (etcd encryption) |
| milvus | Plaintext in YAML/env | No |
| nats-server | Bcrypt-hashed in config file | No |
| openfga | json:"-" tags, env var injection | No |
| temporal | PasswordCommand, MaskYaml | No |
| victoriametrics | Password type, file/http sources | No |

Only kubernetes and grafana (enterprise) implement encryption at rest for secrets. All others rely on OS file permissions. This is a significant gap for multi-tenant deployments.

### Config Format Choices

- **INI** (grafana): Familiar in ops community, but no schema validation
- **YAML** (milvus, temporal, openfga, victoriametrics): Structured, supports complex types
- **Custom .conf** (nats-server): Human-friendly with comments, but custom parser
- **Struct tags + flags** (kubernetes): Type-safe but no native env:var binding
- **Viper** (openfga): Mature library, but opaque behavior

### Validation Strategy

**Startup-only strict**: kubernetes (ValidateKubeletConfiguration at `pkg/kubelet/apis/config/validation/validation.go:46-64`), openfga (Verify() at `pkg/server/config/config.go:486-491`), temporal (Validate() at `common/config/loader.go:213-214`)

**Startup + lazy**: grafana (MustBool/MustString provide defaults but no schema), cli (ValidateKey/ValidateValue only on `gh config set`)

**Event-driven validation**: milvus (PanicIfEmpty at access time, CAS caching)

## Tradeoffs

| Decision | Benefit | Cost | Best Fit | Failure Mode | Alternative |
|-----------|---------|------|----------|--------------|-------------|
| No hot-reload | Simpler implementation, predictable behavior | Requires restart for any change | CLI tools, batch systems | Downtime for config changes | SIGHUP-based reload |
| Env var opt-in (VictoriaMetrics) | Prevents accidental exposure | Requires explicit enablement | Security-sensitive deployments | Some users don't discover it | Always-on env binding |
| Keyring for secrets (cli) | OS-native security | Keychain availability varies | Desktop CLI tools | Fallback to plaintext if keyring fails | Vault integration |
| Polling vs etcd watches (milvus) | Works without watch API support | 5s latency on config propagation | Embedded deployments | Config drift between nodes | Native etcd watches |
| Lazy validation (cli, grafana) | Fast startup | Errors surface late | Development tools | Runtime panics on missing config | Strict startup validation |
| Custom config format (nats-server) | Human-friendly, comments supported | Custom parser maintenance | Messaging infrastructure | Not interchangeable with standard formats | YAML/JSON |

## Decision Guide

**Q: Should I implement hot-reload?**
- Yes, if your process runs longer than typical deployment frequency (> hours) and config changes happen in production
- No, if your process is short-lived (CLI, batch jobs) or config never changes after startup

**Q: How should I handle secrets?**
- Environment variables for simple cases (inject at runtime, not stored on disk)
- OS keyring for desktop tools (cli uses this pattern)
- `json:"-"` or output masking for any config that might be logged
- Vault/KMS integration for production multi-tenant deployments (none of the sources did this natively)

**Q: Should I use Viper?**
- Viper provides multi-source composition out of the box (openfga uses it)
- The tradeoff is opacity — error handling is non-standard and debugging config issues can be hard
- For simple cases, standard `encoding/json` or `gopkg.in/yaml.v3` with manual env var binding is more transparent

**Q: Feature flags — static list or dynamic evaluation?**
- Static list (grafana registry, openfga experimental) is simpler and sufficient for OSS projects
- Dynamic evaluation with remote providers (Grafana's OpenFeature integration) enables percentage rollouts and A/B testing
- If you need per-tenant targeting or gradual rollouts, consider a dedicated flag system

**Q: Validation — strict startup or lazy?**
- Strict startup validation (kubernetes, openfga, temporal) catches errors before the system starts — better for production
- Lazy validation (cli, grafana) allows faster startup but risks runtime failures
- The best approach: validate at startup for required fields, lazily for optional overrides

## Practical Tips

1. **Always track config source provenance**: cli tracks `ConfigEntry.Source` ("default" vs "user"), allowing UI to indicate where values came from

2. **Use structured config types over flat maps**: openfga's `Config` struct with typed sub-structs (`DatastoreConfig`, `GRPCConfig`, etc.) provides self-documenting structure and type safety

3. **Hot-reload partial, not all**: nats-server's `option` interface pattern allows granular control over which changes are hot-swappable and which require restart

4. **Graceful degradation on reload failure**: VictoriaMetrics continues with previous config if SIGHUP reload fails — critical for availability-sensitive services

5. **Secret detection by naming is fragile**: VictoriaMetrics uses string matching (pass, key, secret, token) which can miss custom-named secrets; explicit registration is more reliable

6. **Event callbacks for reactive behavior**: milvus' `EventDispatcher` with prefix-based registration enables components to subscribe to specific config areas without polling

7. **Config migration via versioned transforms**: cli uses `Migration` interface with `PreVersion()`/`PostVersion()`/`Do()` for schema evolution

8. **PasswordCommand pattern for external secrets**: temporal's external command execution allows integration with secret stores without native SDK support

## Anti-Patterns / Caution Signs

- **Panic on missing required config** (milvus' `PanicIfEmpty`): Hard failure at startup can prevent containerized deployments from starting with incomplete config — prefer graceful error returns
- **Silent defaults for missing config** (openfga): When `datastore.uri` is not set, empty string is used and runtime fails later — explicit required field enforcement is better
- **Global Cfg struct** (grafana's legacy `Cfg`): Creates coupling and hard-to-test dependencies — prefer dependency injection
- **No config change audit trail** (all sources): None of the studied systems log who changed what config and when — compliance gap for regulated environments
- **Feature flag typos silently ignored** (openfga): `ExperimentalListObjectsOptimizations` vs `experimental_list_objects_optimizations` — validate flag names at startup
- **Memory growth from event handlers** (milvus): `EventDispatcher` accumulates handlers via `Register` without cleanup — need deregistration mechanism
- **Strict parse disabled by default** (victoriametrics): Unknown YAML fields silently ignored unless `-promscrape.config.strictParse` is set — typos go unnoticed

## Notable Absences

1. **No source implements Vault integration natively** — all secrets are either plaintext on disk, OS keyring, or env-injected
2. **No source has production-ready dynamic feature flag system** with targeting rules, percentage rollouts, and per-tenant configuration
3. **No source has config version history or rollback** — changes are not preserved or recoverable
4. **No source has config change audit logging** — who changed what and when is not tracked
5. **No source has per-tenant runtime configuration overrides** — all config applies uniformly across tenants/users

## Per-Source Notes

### cli (7/10)
Interface/implementation separation via `gh.Config` in `internal/gh/gh.go:32`. Keyring with timeout wrapper. Factory pattern for lazy loading. No hot-reload — config loaded once via `sync.Once`. Option type pattern for graceful fallback on missing values. Source tracking enables provenance UI.

### grafana (8/10)
INI-based layered config with `GF_` env prefix. `applyEnvVariableOverrides()` at `pkg/setting/setting.go:913-997` enables runtime env overrides via `DynamicSection`. Feature toggle registry with code generation (`make gen-feature-toggles`). OpenFeature integration for remote flags. Legacy `Cfg` global being deprecated in favor of `ConfigProvider` interface.

### kubernetes (8/10)
Three-stage composition: flag → file → drop-in merge via JSON patch. fsnotify for pod manifest hot-reload. Per-object watch for ConfigMaps/Secrets with field selectors. Feature gates as versioned specs. Strict startup validation with aggregated errors. `datapolicy` struct tag for sensitive data redaction.

### milvus (7/10)
Reactive event-driven model with `EventDispatcher`. Priority-based multi-source: Env(50) > Etcd(10) > File(100). Event-driven hot-reload via etcd polling. `ParamItem` with callback registration. CAS cached values for concurrent access. Secrets in plaintext YAML/env — no encryption at rest.

### nats-server (8/10)
Custom lexer/parser for `.conf` format with `$VAR` env substitution. `option` interface pattern for granular hot-reload control. `diffOptions()` via reflection identifies unsupported changes. Bcrypt prefix special-cased in variable lookup to prevent expansion. `NoErrOnUnknownFields(true)` for forward compatibility.

### openfga (7/10)
Viper-based multi-source config with `SetEnvPrefix("OPENFGA")` and `AutomaticEnv()`. Hierarchical typed config structs. `json:"-"` tags for secret isolation. Two-phase verification: `VerifyServerSettings()` then `VerifyBinarySettings()`. TLS cert hot-reload via certwatcher. Static experimental feature flags.

### temporal (8/10)
Separation of static config (loaded once, validated at startup) and dynamic config (polled from file, supports subscriptions). `PasswordCommand` for external secret fetching. `MaskYaml()` prevents password leakage in logs. `FileBasedClient` with `Update()` atomically swaps config via `sync/atomic.Value.Swap()`. Embedded template with Go template + sprig functions for container deployments.

### victoriametrics (7/10)
Opt-in env var support via `-envflag.enable`. `%{ENV_VAR}` template substitution before YAML parsing. `Password` type with `file://`/`http://` sources and periodic re-reading. `RegisterSecretFlag()` + auto-detection by naming. SIGHUP + ticker hot-reload with graceful fallback. `yaml.UnmarshalStrict()` for unknown field detection.

## Open Questions

1. **Why no Vault integration across any source?** The operational complexity of Vault may outweigh benefits for many teams. Is there a gap in the ecosystem for simpler secret injection patterns?

2. **Why no production feature flag system in any source?** Open-source projects may not need dynamic evaluation, but multi-tenant SaaS products would benefit. Is this an artifact of the studied sources or a real gap in the Go ecosystem?

3. **Config format proliferation**: Eight sources use five different config formats (INI, YAML, custom .conf, struct tags+flags, Viper). Is there a need for a standard Go config format with built-in validation, hot-reload, and secret management?

4. **The hot-reload boundary**: Most systems have some config that requires restart. What's the right mental model for which config should be hot-reloadable vs static?

## Evidence Index

Every evidence reference in this report follows the `path/to/file.go:NN` or similar format from per-source reports.

### cli
- `internal/gh/gh.go:32` — Config interface definition
- `internal/config/config.go:40-46` — Config implementation
- `internal/config/config.go:554-585` — Default config values
- `internal/keyring/keyring.go:22-74` — Keyring wrapper with timeout
- `pkg/cmdutil/factory.go:36` — Factory pattern

### grafana
- `pkg/setting/setting.go:1255-1317` — Config loading sequence
- `pkg/setting/setting.go:913-997` — Env var overrides
- `pkg/setting/setting.go:828-878` — RedactedValue for secrets
- `pkg/services/featuremgmt/manager.go:15-103` — FeatureManager
- `pkg/services/featuremgmt/registry.go:17-1320` — Feature flag registry

### kubernetes
- `cmd/kubelet/app/server.go:148-258` — Kubelet config loading
- `cmd/kubelet/app/server.go:331-400` — Drop-in merge
- `pkg/kubelet/config/file_linux.go:67-99` — File watch (inotify)
- `pkg/kubelet/util/manager/watch_based_manager.go:180-210` — ConfigMap watch
- `pkg/features/kube_features.go:41-1179` — Feature gate definitions

### milvus
- `pkg/config/manager.go:86-97` — Config Manager struct
- `pkg/config/event_dispatcher.go:42-71` — Event dispatcher
- `pkg/util/paramtable/base_table.go:138-166` — BaseTable init
- `pkg/util/paramtable/param_item.go:37-57` — ParamItem struct

### nats-server
- `conf/parse.go:383-398` — Env var support (`$VAR` syntax)
- `server/reload.go:42-74` — Option interface
- `server/reload.go:1396-1485` — Server.Reload()
- `server/opts.go:5827-5909` — MergeOptions for CLI override

### openfga
- `cmd/root.go:23-25` — Viper init with env prefix
- `pkg/server/config/config.go:132-137` — DatastoreConfig with json:"-"
- `pkg/server/config/config.go:486-491` — Config.Verify()
- `pkg/featureflags/client.go:3-5` — Feature flag client interface

### temporal
- `common/config/config.go:30-56` — Config struct
- `common/config/loader.go:71-117` — Loading options
- `common/masker/masker.go:9-14` — MaskYaml function
- `common/dynamicconfig/client.go:36-41` — NotifyingClient interface
- `common/dynamicconfig/file_based_client.go:133-147` — FileBasedClient polling

### victoriametrics
- `lib/envflag/envflag.go:24-27` — Env var flag binding
- `lib/flagutil/password.go:37-47` — Password type
- `lib/flagutil/secret.go:13-16` — RegisterSecretFlag
- `lib/promscrape/scraper.go:112-206` — Hot reload with SIGHUP

---

Generated by dimension `03-configuration-environment-management.md`.