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

## Executive Summary

Configuration and environment management across the eight studied sources reveals two convergent themes: multi-source composition is universal (file + env + CLI), and secrets isolation via struct tags or dedicated types is the dominant pattern. Significant divergence exists in three areas: hot-reload capability (ranging from none to etcd-watch-based), validation timing (startup-only vs. lazy), and feature flag sophistication (static lists vs. OpenFeature-based remote providers). No source achieves a perfect score; all have observable gaps in secrets encryption-at-rest, remote config stores, or config change auditability.

## Core Thesis

The studied sources cluster into two distinct approaches to configuration: **static config with restart** (cli, grafana, openfga) and **reactive config with hot-reload** (kubernetes, milvus, nats-server, temporal, victoriametrics). The first group prioritizes simplicity and fail-fast behavior; the second prioritizes operational continuity. Neither approach is superior — the choice reflects product shape (standalone tool vs. distributed system), deployment model (single-instance vs. orchestrated), and user expectations (devops-friendly vs. app-developer-friendly).

## Rating Summary

| Source | Score | Approach | Main Strength | Main Concern |
|--------|-------|----------|---------------|--------------|
| kubernetes | 8/10 | Hot-reload via watches | Multi-stage composition, per-object ConfigMap watches | No env:var struct tag binding |
| nats-server | 8/10 | Hot-reload via option interface | Comprehensive hot-reload coverage, custom lexer/parser | Secrets plaintext in config files |
| temporal | 8/10 | Static + dynamic config split | Dynamic config with subscription-based hot-reload | No Vault integration, legacy loader deprecated |
| grafana | 8/10 | Layered INI overrides | Feature flags with OpenFeature, env expander | No hot-reload for most config |
| milvus | 7/10 | Priority-based multi-source | Event-driven reactive config via etcd | Secrets in plaintext YAML files |
| openfga | 7/10 | Viper-based composition | `json:"-"` secret isolation, comprehensive Verify() | No hot-reload, no remote config store |
| victoriametrics | 7/10 | SIGHUP + periodic reload | Password type with external sources, graceful degradation | Opt-in env var support, no feature flag system |
| cli | 7/10 | Layered config with keyring | Source tracking, keyring with timeout wrapper | No hot-reload, lazy validation only |

## Approach Models

### Static Config with Restart

This model (cli, grafana, openfga) loads configuration at startup and does not support runtime changes. Config is validated at startup with fail-fast behavior. Secrets are injected via environment variables or external stores at startup.

**Archetypal implementations:**
- **grafana**: INI-based layered loading (`loadConfiguration()` at `pkg/setting/setting.go:1255-1317`) with `GF_` prefix env overrides. Feature flags defined in `standardFeatureFlags` slice (`pkg/services/featuremgmt/registry.go:17-1320`) with `RequiresRestart` semantics.
- **openfga**: Viper-based multi-source composition with `SetEnvPrefix("OPENFGA")` and `AutomaticEnv()` (`cmd/root.go:23-25`). `Verify()` methods for startup validation (`pkg/server/config/config.go:486-491`). Secrets isolated via `json:"-"` struct tags (`pkg/server/config/config.go:132-137`).
- **cli**: Factory-based lazy loading (`pkg/cmdutil/factory.go:36`) with `Option[T]` pattern for missing values. Keyring for secrets (`internal/keyring/keyring.go:22-74`).

### Reactive Config with Hot-Reload

This model (kubernetes, milvus, nats-server, temporal, victoriametrics) supports runtime configuration changes through file watching, signal handling, or periodic polling.

**Archetypal implementations:**
- **kubernetes**: fsnotify-based pod manifest watching (`pkg/kubelet/config/file_linux.go:67-99`), per-object ConfigMap/Secret watches via `NewWatchBasedManager()` (`pkg/kubelet/util/manager/watch_based_manager.go:180-210`). Strict startup validation via `ValidateKubeletConfiguration()` (`pkg/kubelet/apis/config/validation/validation.go:46-64`).
- **milvus**: `config.Manager` with `EventDispatcher` for reactive updates (`pkg/config/event_dispatcher.go:42-58`). etcd source with periodic polling (5s default) at `pkg/config/refresher.go:64-81`. CAS-based cache updates (`pkg/config/manager.go:124-140`).
- **nats-server**: `option` interface pattern (`server/reload.go:42-74`) for granular hot-swap. `diffOptions()` uses reflection to detect changes (`server/reload.go:1581`). Custom lexer/parser supports `$VAR` env substitution (`conf/parse.go:383-398`).
- **temporal**: `FileBasedClient` polls dynamic config file at interval (`common/dynamicconfig/file_based_client.go:133-147`). `NotifyingClient` with `Subscribe()` for runtime updates (`common/dynamicconfig/client.go:36-41`). `PasswordCommand` for external secret fetching (`common/config/persistence.go:301-323`).
- **victoriametrics**: SIGHUP + ticker-based reload (`lib/promscrape/scraper.go:112-206`). Graceful fallback on reload failure. `Password` type with `file://`/`http://` sources (`lib/flagutil/password.go:37-47`).

## Pattern Catalog

### Pattern 1: Multi-Source Priority Ordering

**Problem**: How to compose configuration from file, environment variables, and CLI flags with predictable precedence.

**Solution**: Define explicit priority order and merge sequentially. Most sources use CLI > Env > File > Defaults.

**Sources demonstrating**:
- nats-server: CLI > env vars > config file > defaults (`server/opts.go:5827-5909`)
- grafana: defaults.ini > custom.ini > cmdline defaults > env vars > CLI properties (`pkg/setting/setting.go:1255-1317`)
- openfga: CLI flags > env vars > config file > defaults (`cmd/root.go:19-38`)
- kubernetes: flags > file > drop-ins (`cmd/kubelet/app/server.go:236-243`)

**When to copy**: Any application that supports multiple config sources.

**When overkill**: Single-source applications with no env/CLI override needs.

### Pattern 2: Secrets Isolation via Struct Tags

**Problem**: Preventing accidental secret leakage in logs, error messages, or serialized output.

**Solution**: Use `json:"-"` struct tag on sensitive fields to exclude from JSON/YAML serialization.

**Sources demonstrating**:
- openfga: `DatastoreConfig` URI/Password marked `json:"-"` (`pkg/server/config/config.go:132-137`)
- temporal: `MaskYaml()` replaces `password`/`keyData` fields with `******` (`common/masker/masker.go:9-14`)

**When to copy**: Any service handling credentials, API keys, or tokens.

**When overkill**: Services without sensitive configuration values.

### Pattern 3: Hot-Reload via Signal or File Watch

**Problem**: Allowing configuration changes without process restart.

**Solution**: Register signal handler (SIGHUP) or file watcher, reload config on trigger, compare against running config to decide restart behavior.

**Sources demonstrating**:
- victoriametrics: SIGHUP handler + periodic ticker (`lib/promscrape/scraper.go:110-162`)
- nats-server: `option.Apply()` interface for granular changes (`server/reload.go:42-74`)
- kubernetes: fsnotify for pod manifests, per-object watches for ConfigMaps (`pkg/kubelet/util/manager/watch_based_manager.go:180-210`)

**When to copy**: Long-running services where restart is disruptive.

**When overkill**: Short-lived tools, sidecar processes, or cases where restart is acceptable.

### Pattern 4: Feature Flag Registry

**Problem**: Managing gradual rollouts, experimental features, and runtime toggles.

**Solution**: Central registry with typed flags, `IsEnabled()` checks, and per-flag metadata (stable/beta, requires-restart).

**Sources demonstrating**:
- grafana: `FeatureManager` with `standardFeatureFlags` slice (`pkg/services/featuremgmt/registry.go:17-1320`), OpenFeature integration (`pkg/services/featuremgmt/openfeature.go:14-39`)
- kubernetes: `FeatureGate` interface with versioned specs (`pkg/features/kube_features.go:41-1179`)

**When to copy**: Services needing progressive delivery, A/B testing, or kill-switch capability.

**When overkill**: Simple single-tenant services with infrequent configuration changes.

### Pattern 5: Event-Driven Reactive Config

**Problem**: Propagating configuration changes to multiple subscribers without polling.

**Solution**: Central dispatcher with prefix-based registration, callbacks fired on config change events.

**Sources demonstrating**:
- milvus: `EventDispatcher.Register` with key prefix support (`pkg/config/event_dispatcher.go:42-71`), `ParamItem.RegisterCallback` (`pkg/util/paramtable/param_item.go:81-83`)

**When to copy**: Distributed systems with multiple components needing config awareness.

**When overkill**: Monolithic single-process applications.

### Pattern 6: Env Var Template Substitution

**Problem**: Embedding environment variable values anywhere in configuration files.

**Solution**: Parse config file as template, expand `$(VAR)` or `%{VAR}` placeholders before YAML/JSON parsing.

**Sources demonstrating**:
- grafana: `$(ENV_VAR)` and `$(file:/path)` syntax via expander system (`pkg/setting/expanders.go:52-79`)
- nats-server: `$VAR` syntax in config values (`conf/parse.go:383-398`)
- victoriametrics: `%{ENV_VAR}` placeholders in config files (`lib/envtemplate/envtemplate.go:12-16`)
- temporal: `{{ env "VAR_NAME" }}` in embedded template (`common/config/config_template_embedded.yaml:4`)

**When to copy**: Containerized deployments where config is generated from environment.

**When overkill**: Development environments where direct file editing is preferred.

## Key Differences

### Secrets Management Approaches

**Keyring-based (cli)**: Authentication tokens stored in OS-native keychain via `zalando/go-keyring` with 3-second timeout wrapper (`internal/keyring/keyring.go:22-74`). Fallback to plaintext `hosts.yml` if keyring unavailable.

**Struct tag-based (openfga, temporal)**: Sensitive fields marked with `json:"-"` to exclude from serialization. Temporal additionally calls `MaskYaml()` on config output (`common/config/config.go:696-703`).

**Dedicated Password type (victoriametrics)**: `Password` struct accepts `file://`, `http://`, `https://` sources with periodic re-reading. `String()` returns `"secret"` to prevent log exposure (`lib/flagutil/password.go:88-90`).

**Plaintext with file permissions (nats-server, milvus)**: Secrets stored as bcrypt-hashed strings in config files. No envelope encryption or secret store integration.

### Hot-Reload Scope

**Full hot-reload (nats-server, victoriametrics)**: Many options support runtime changes via signal or periodic checking. nats-server uses `option` interface pattern; victoriametrics uses SIGHUP + ticker.

**Partial hot-reload (kubernetes, milvus, temporal)**: Only specific config areas reload. Kubernetes: pod manifests + ConfigMaps/Secrets via watches. Milvus: etcd-sourced config via polling. Temporal: dynamic config file via polling.

**No hot-reload (cli, grafana, openfga)**: All config changes require process restart. This is a deliberate simplification.

### Validation Strategy

**Startup-only with fail-fast (openfga, grafana)**: `Verify()` methods called before server start; invalid config causes panic. openfga splits validation into `VerifyServerSettings()` and `VerifyBinarySettings()` (`pkg/server/config/config.go:486-639`).

**Startup + lazy (kubernetes, temporal)**: Strict validation at startup; deferred validation at admission/runtime for some fields.

**Lazy-only (cli)**: No schema validation at `NewConfig()` time. Validation only occurs when values are set via `gh config set` command (`pkg/cmd/config/set/set.go:90-129`). Accessors like `AccessibleColors()` call `.Unwrap()` which panics on missing value (`internal/config/config.go:119-121`).

## Tradeoffs

| Decision | Benefit | Cost | Best-fit Context | Failure Mode | Alternative |
|----------|---------|------|------------------|--------------|-------------|
| No hot-reload | Simpler implementation, fail-fast behavior | Requires restart for all changes | CLI tools, single-tenant services | Disrupts long-running sessions | Hot-reload via signal/watches |
| Hot-reload via polling | Portability across environments | Config propagation delay (5s-60s typical) | Distributed systems, orchestration | Stale config window after changes | Native watches where supported |
| Plaintext secrets in config | No external dependency | Exposed if file permissions broken | Single-node deployments, dev | Credentials in version control risk | Keyring, Vault, KMS |
| Lazy validation only | Fast startup | Invalid config detected late | Development tooling | Runtime panics on missing required values | Strict startup validation |
| Viper dependency (openfga) | Battle-tested, multi-source support | Opaque behavior, non-standard errors | Rapid development | Vendor lock-in to Viper patterns | Custom parser (nats-server) |

## Decision Guide

**Choose no hot-reload when**:
- Application restarts are cheap (CLI tools, short-lived processes)
- Configuration changes are infrequent
- Fail-fast on misconfiguration is acceptable

**Choose hot-reload via signal when**:
- Process restart is disruptive (long-running servers, distributed systems)
- Configuration changes happen via file system (Kubernetes ConfigMaps, config files edited in-place)
- Portability across environments is important

**Choose hot-reload via etcd/watch when**:
- Centralized configuration management is needed
- Multi-node consistency is required
- Config propagation latency under 10s is acceptable

**Choose keyring for secrets when**:
- OS-native credential store is available (desktop apps, CLI tools)
- Secrets are per-user rather than per-deployment
- Timeout handling is needed for unavailable keychain

**Choose struct tag isolation when**:
- Application is Go-based with JSON/YAML config serialization
- Secrets appear in structured config structs
- Accidental logging of config is a risk

## Practical Tips

1. **Implement source tracking** — Know whether a config value came from env var, config file, or default. cli does this via `ConfigEntry` struct (`internal/gh/gh.go:24-27`).

2. **Use explicit priority ordering** — Document and enforce config source precedence. grafana's layered approach (`pkg/setting/setting.go:1255-1317`) makes precedence explicit.

3. **Fail fast on critical config** — Require essential config at startup via `PanicIfEmpty` (milvus) or `validate:"nonzero"` tags (temporal).

4. **Support graceful degradation on reload failure** — victoriametrics continues with previous config if reload fails (`lib/promscrape/scraper.go:164-169`); this prevents momentary unavailability.

5. **Use CAS for concurrent config access** — milvus uses `sync/atomic.Value.Swap()` to atomically replace config (`manager.go:195`).

6. **Tag sensitive fields explicitly** — Don't rely on naming conventions alone. openfga uses `json:"-"` (`pkg/server/config/config.go:132`); victoriametrics uses `RegisterSecretFlag()` (`lib/flagutil/secret.go:13-16`).

7. **Implement config change callbacks** — milvus's `EventDispatcher` allows components to react to config changes without polling (`pkg/config/event_dispatcher.go:42-58`).

## Anti-Patterns / Caution Signs

**Caution: Panic on missing config at access time** — cli accessor methods like `AccessibleColors()` call `.Unwrap()` which panics if no value exists (`internal/config/config.go:119-121`). Prefer returning errors or defaults.

**Caution: Silent defaults for missing required config** — openfga's `DefaultConfig()` returns fully populated struct; if `datastore.uri` is not set, empty string is used and runtime fails later. No pre-flight validation for valid connection strings.

**Caution: Env var override without indication** — cli's `ActiveToken()` checks `GH_TOKEN` env var first but users may not realize config is being bypassed (`internal/config/config.go:317-318`).

**Caution: Hot-reload with polling fallback** — kubernetes fsnotify can lose events; fallback polling handles edge cases but adds overhead. Config propagation may lag up to resync interval.

**Caution: No config rollback mechanism** — Most sources (nats-server, openfga, victoriametrics) have no version history for config changes. Bad config reload loses previous working state.

**Caution: Validation only on known keys** — nats-server's `diffOptions()` uses reflection; if a new field is added to `Options` struct without implementing hot-reload, the default case returns error rather than succeeding silently.

**Caution: Memory growth from event handlers** — milvus's `EventDispatcher` accumulates handlers via `Register` without visible cleanup mechanism. Long-running processes may leak memory.

## Notable Absences

1. **Vault or external secrets store integration** — No source integrates with HashiCorp Vault, AWS Secrets Manager, or GCP Secret Manager. All secrets management is local (keyring, plaintext files, or env vars).

2. **Config encryption at rest** — Only grafana (Enterprise) has envelope encryption for secrets. All OSS projects store config plaintext on disk.

3. **Feature flag targeting rules** — Only grafana supports remote feature flag providers via OpenFeature. Others use static lists or simple maps.

4. **Config change audit trail** — No source logs who changed what config and when. This is a compliance gap for regulated environments.

5. **Per-tenant configuration isolation** — Most sources manage global config. Multi-tenant deployments lack namespace isolation for tenant-specific settings.

6. **Configuration rollback** — No source preserves previous config state for rollback after bad reload.

7. **Structured schema validation** — Most sources validate individual values but lack JSON Schema or CUE validation for config structure.

## Per-Source Notes

### cli (7/10)
Well-architected interface/implementation separation (`internal/gh/gh.go:32` / `internal/config/config.go:40`). Factory pattern for lazy loading enables `gh version` without config. Keyring with timeout wrapper is robust. Main gaps: no hot-reload, lazy-only validation that can panic.

### grafana (8/10)
INI format is familiar to ops community. `GF_` prefix avoids collisions. Layered override system is explicit. Feature flags with OpenFeature integration is sophisticated. Main gaps: no hot-reload for most config, global `Cfg` struct being deprecated.

### kubernetes (8/10)
Three-stage composition (flag → file → drop-in) is thorough. Per-object watches for ConfigMaps scale well. `datapolicy` struct tags for log redaction. Strict startup validation with aggregated errors. Main gap: no env:var struct tag binding, relies on flag parsing only.

### milvus (7/10)
Event-driven reactive config via etcd is well-architected. `EventDispatcher` with prefix support enables fine-grained watchers. CAS caching for thread safety. Main gaps: secrets in plaintext YAML, cipher plugin unused.

### nats-server (8/10)
Custom lexer/parser is powerful (comments, `$VAR`, include directives). `option` interface for granular hot-reload is clean. Bcrypt prefix special-casing protects passwords. Main gap: secrets plaintext in config files, no external secret store.

### openfga (7/10)
Viper is battle-tested. `json:"-"` for secret isolation is explicit. `Verify()` methods are comprehensive. JSON Schema as documentation. Main gaps: no hot-reload, no remote config store, silent defaults for missing required config.

### temporal (8/10)
Static/dynamic config split is principled. `NotifyingClient` with subscriptions enables reactive updates. `PasswordCommand` for external secrets. `MaskYaml()` prevents log leakage. Main gaps: no Vault integration, legacy loader deprecated, polling delay.

### victoriametrics (7/10)
`Password` type with external sources is innovative. SIGHUP + graceful degradation is robust. `checkOverflow()` for unknown field detection. Main gaps: opt-in env var support (users may miss), no feature flag system, strict parse disabled by default.

## Open Questions

1. **Why do most sources lack Vault integration?** — All eight sources rely on env vars, plaintext files, or OS keyrings for secrets. None integrate with centralized secret stores. Is this a complexity concern, a "not invented here" attitude, or delegation to orchestration layer?

2. **How should config schema evolution be handled?** — No source has a documented mechanism for schema versioning or migration between major versions. cli has `Migration` interface but only for config-to-config migrations, not schema changes.

3. **What is the right granularity for hot-reload?** — Some options require restart (store_dir in nats-server), others don't. How should this boundary be decided? Is there a principle or just historical accident?

4. **How should per-tenant config isolation work in multi-tenant systems?** — None of the studied sources implement tenant-specific config overrides beyond the multi-account support in nats-server. What patterns exist for this?

5. **When does config validation belong at startup vs. at runtime?** — kubernetes validates everything at startup (fail-fast). temporal validates static config at startup but dynamic config lazily. What's the principled boundary?

## Evidence Index

| Source | Evidence | File:Line |
|--------|----------|-----------|
| cli | Config interface | `internal/gh/gh.go:32-80` |
| cli | Config implementation | `internal/config/config.go:40-46` |
| cli | Keyring wrapper | `internal/keyring/keyring.go:22-74` |
| cli | Config validation on set | `pkg/cmd/config/set/set.go:90-129` |
| cli | ActiveToken priority | `internal/config/config.go:237-260` |
| grafana | Config loading sequence | `pkg/setting/setting.go:1255-1317` |
| grafana | Env var overrides | `pkg/setting/setting.go:913-997` |
| grafana | Feature flag registry | `pkg/services/featuremgmt/registry.go:17-1320` |
| grafana | OpenFeature integration | `pkg/services/featuremgmt/openfeature.go:14-39` |
| grafana | Secrets redaction | `pkg/setting/setting.go:828-878` |
| kubernetes | Kubelet config loading | `cmd/kubelet/app/server.go:148-258` |
| kubernetes | Drop-in merge | `cmd/kubelet/app/server.go:331-400` |
| kubernetes | File watch | `pkg/kubelet/config/file_linux.go:67-99` |
| kubernetes | ConfigMap manager | `pkg/kubelet/util/manager/watch_based_manager.go:222-257` |
| kubernetes | Startup validation | `cmd/kubelet/app/server.go:254-258` |
| kubernetes | Datapolicy tags | `staging/src/k8s.io/component-base/logs/datapol/datapol.go:88-91` |
| milvus | Config Manager | `pkg/config/manager.go:86-97` |
| milvus | Event dispatcher | `pkg/config/event_dispatcher.go:42-58` |
| milvus | Hot-reload refresher | `pkg/config/refresher.go:64-81` |
| milvus | Etcd source | `pkg/config/etcd_source.go:168-184` |
| milvus | CAS cache | `pkg/config/manager.go:124-140` |
| nats-server | Config parsing | `conf/parse.go:383-398` |
| nats-server | Hot-reload | `server/reload.go:1396-1485` |
| nats-server | Option interface | `server/reload.go:42-74` |
| nats-server | Validation | `server/server.go:1137-1183` |
| nats-server | Feature flags | `server/feature_flags.go:27-77` |
| openfga | Viper init | `cmd/root.go:23-25` |
| openfga | Config Verify | `pkg/server/config/config.go:486-491` |
| openfga | Secret isolation | `pkg/server/config/config.go:132-137` |
| openfga | TLS hot-reload | `cmd/run/run.go:1239-1241` |
| temporal | Config template | `common/config/config_template_embedded.yaml:4` |
| temporal | MaskYaml | `common/masker/masker.go:9-14` |
| temporal | Dynamic config client | `common/dynamicconfig/client.go:12-41` |
| temporal | FileBasedClient | `common/dynamicconfig/file_based_client.go:133-147` |
| temporal | PasswordCommand | `common/config/persistence.go:301-323` |
| victoriametrics | Env flag binding | `lib/envflag/envflag.go:24-27` |
| victoriametrics | Password type | `lib/flagutil/password.go:37-47` |
| victoriametrics | Secret detection | `lib/flagutil/secret.go:28-33` |
| victoriametrics | Hot reload | `lib/promscrape/scraper.go:112-206` |
| victoriametrics | Strict YAML parsing | `lib/promscrape/config.go:129` |

---

Generated by dimension `03-configuration-environment-management.md`.