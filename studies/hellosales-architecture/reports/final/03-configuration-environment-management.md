# Configuration & Environment Management - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Dimension | `03-configuration-environment-management` |
| Sources | cli, kubernetes, milvus, openfga, temporal, victoriametrics |
| Date | 2026-05-19 |

## Sources Studied

| # | Source | Path |
|---|--------|------|
| 1 | cli | `sources/cli` |
| 2 | kubernetes | `sources/kubernetes` |
| 3 | milvus | `sources/milvus` |
| 4 | openfga | `sources/openfga` |
| 5 | temporal | `sources/temporal` |
| 6 | victoriametrics | `sources/victoriametrics` |

## Executive Summary

All six sources implement layered configuration systems with distinct approaches shaped by their operational contexts. Three patterns dominate: (1) multi-source composition via priority ordering, (2) secrets isolation via struct tags or external stores, and (3) startup-only vs runtime-reactive validation. Kubernetes and Temporal demonstrate the most sophisticated config management with hot-reload and event-driven reactivity. CLI and OpenFGA rely on restart-required approaches with simpler secret handling. No source implements remote config stores (etcd, Vault) natively in the main path; Milvus comes closest with etcd support but uses polling rather than watches.

## Core Thesis

Configuration management is a dimension where operational context strongly shapes architecture. Infrastructure-level systems (Kubernetes, VictoriaMetrics) prioritize hot-reload and observability. Application-level systems (OpenFGA, Temporal) prioritize startup validation and type safety. The GitHub CLI prioritizes developer ergonomics with lazy loading at the cost of runtime flexibility. Secrets management is universally immature — no source implements encryption-at-rest for config secrets, and secret isolation relies on naming conventions, struct tags, or OS keychain rather than dedicated secret stores.

## Rating Summary

| Source | Score | Approach | Main Strength | Main Concern |
|--------|-------|----------|---------------|--------------|
| cli | 7/10 | Interface/implementation separation + keyring | Clean abstraction with testable factory pattern | No hot-reload, lazy validation only |
| kubernetes | 8/10 | Multi-stage composition + per-object watches | Comprehensive validation, fsnotify hot-reload, drop-in layering | No native env:var binding, secrets rely on convention |
| milvus | 7/10 | Priority-based source merging + event dispatcher | Event-driven reactivity via etcd with callback mechanism | No encryption for config secrets, polling-based reload |
| openfga | 7/10 | Viper-based multi-source + json:"-" tags | Mature battle-tested library, comprehensive startup validation | No hot-reload (except TLS), silent defaults for missing config |
| temporal | 8/10 | Template-based embedded + dynamic config separation | Hot-reload via file polling + subscriptions, YAML masking | No Vault integration, legacy loader deprecated |
| victoriametrics | 7/10 | SIGHUP + periodic reload + Password type | Graceful degradation on reload failure, secret auto-detection | Opt-in env var support, strict mode disabled by default |

## Approach Models

### Layered Priority Composition (Kubernetes, Milvus, OpenFGA, Temporal)
Sources apply config values through a defined precedence order rather than a single flat source. Kubernetes uses flag > file > drop-in directory. Milvus uses EnvSource > EtcdSource > FileSource with explicit priority numbers. OpenFGA uses CLI flags > env vars > config file > defaults via Viper. Temporal supports embedded template > single file > legacy hierarchical directory.

### Factory/Lazy Loading (cli, Temporal)
CLI uses a `Factory.Config` returning `func() (gh.Config, error)` for lazy initialization, enabling commands like `gh version` to run without config. Temporal uses embed for template-in-binary with environment variable substitution at load time.

### Event-Driven Reactivity (Milvus, Kubernetes, Temporal)
Milvus implements Observer pattern via `EventDispatcher` with prefix-based registrations and callbacks. Kubernetes uses per-object reflectors watching ConfigMaps/Secrets. Temporal uses `NotifyingClient` with `Subscribe()` per-key callbacks.

### Struct-Tagged Secrets Isolation (OpenFGA, Temporal, VictoriaMetrics)
OpenFGA uses `json:"-"` tags on sensitive fields. Temporal uses a dedicated `MaskYaml()` function replacing `password` and `keyData`. VictoriaMetrics uses explicit `RegisterSecretFlag()` and auto-detection by naming convention.

### OS Keyring Integration (cli)
GitHub CLI stores tokens in OS-native keychain (macOS Keychain, Windows Credential Manager, Linux libsecret) via `zalando/go-keyring` with a 3-second timeout wrapper.

### Password Type with External Sources (VictoriaMetrics)
VictoriaMetrics `Password` type accepts `file://`, `http://`, `https://` prefixes, periodically re-reading secrets from external sources without restarting.

## Pattern Catalog

### Pattern: Multi-Source Priority Ordering
**Problem**: Different deployment environments need different config sources — files for development, env vars for containerization, remote stores for production.

**Sources**: Kubernetes (`cmd/kubelet/app/server.go:148-258`), Milvus (`pkg/config/manager.go:86-97`), OpenFGA (`cmd/root.go:19-38`), Temporal (`common/config/loader.go:71-117`)

**Why it works**: Explicit priority makes behavior predictable. CLI flags always win in Kubernetes; env vars always win in Milvus; last-defined wins in OpenFGA via Viper. Operators understand precedence intuitively.

**When to copy**: When the system runs in multiple deployment contexts (dev, containerized, on-prem).

**When overkill**: Single-context applications with fixed config sources.

### Pattern: Secrets Isolation via Struct Tags
**Problem**: Config structs may be accidentally logged or serialized to output, exposing credentials.

**Sources**: OpenFGA (`pkg/server/config/config.go:132-137`), Temporal (`common/config/masker/masker.go:9-14`), VictoriaMetrics (`lib/flagutil/secret.go:13-16`)

**Why it works**: `json:"-"` is zero-cost at runtime — it's a compile-time annotation. Masking at output time is surgical and doesn't require encrypting at rest.

**When to copy**: When config structs may appear in logs, error messages, or API responses.

**When overkill**: Systems where config never leaves a private in-memory struct.

### Pattern: Hot-Reload with Graceful Degradation
**Problem**: Config changes should propagate without full restart, but reload failures should not crash the service.

**Sources**: VictoriaMetrics (`lib/promscrape/scraper.go:164-169`), Kubernetes (`pkg/kubelet/config/file.go:91-114`), Milvus (`pkg/config/manager.go:146`)

**Why it works**: Availability trumps config updates. Logging an error and continuing with stale config keeps the system operational. VictoriaMetrics explicitly retains previous config on SIGHUP reload failure.

**When to copy**: Long-running services where availability is critical (metrics, APIs, databases).

**When overkill**: Short-lived processes or systems where stale config is worse than no config.

### Pattern: Event-Driven Config Callbacks
**Problem**: Components need to react when specific config keys change, without polling.

**Sources**: Milvus (`pkg/config/event_dispatcher.go:42-58`), Temporal (`common/dynamicconfig/client_subscriptions.go:42-54`), Kubernetes (`pkg/kubelet/util/manager/watch_based_manager.go:222-257`)

**Why it works**: Decouples config change detection from reaction logic. Components register interest once and get notified on change.

**When to copy**: Large distributed systems where multiple components care about specific config keys.

**When overkill**: Small applications where config changes are infrequent and polling is acceptable.

### Pattern: Password Type with External Source Loading
**Problem**: Secrets should not be baked into config files, but file-based deployment is still needed.

**Sources**: VictoriaMetrics (`lib/flagutil/password.go:37-47`), Temporal (`common/config/persistence.go:301-323`)

**Why it works**: `file://path` or `http://url` patterns allow operators to put secrets in separate files or fetch from secret stores. Re-reading on interval enables rotation without restart.

**When to copy**: When secrets need to be managed externally but the config system is file-based.

**When overkill**: When orchestration platform (Kubernetes, Docker) handles secret injection via env vars or mounted volumes.

### Pattern: Strict Startup Validation with Aggregated Errors
**Problem**: Configuration errors should fail fast at startup, not at first use.

**Sources**: Kubernetes (`pkg/kubelet/apis/config/validation/validation.go:46-64`), OpenFGA (`pkg/server/config/config.go:486-491`), Temporal (`common/config/loader.go:213-214`)

**Why it works**: Fail-fast prevents running in a misconfigured state. Aggregated errors show all problems at once rather than one-at-a-time.

**When to copy**: Production services where misconfiguration causes cascading failures later.

**When overkill**: Development tools where fast startup and flexibility matter more than strict enforcement.

### Pattern: Opt-In Environment Variable Support
**Problem**: Environment variables can accidentally expose config in certain deployment scenarios.

**Sources**: VictoriaMetrics (`lib/envflag/envflag.go:12-17`)

**Why it works**: Explicit opt-in via `-envflag.enable` prevents accidental exposure. Operators choose whether to enable it based on deployment context.

**When to copy**: Security-sensitive deployments or when env var handling has performance implications.

**When overkill**: When env vars are the primary config source and opt-in adds friction.

## Key Differences

### Hot-Reload Strategy
**Reactive systems** (Kubernetes pod manifests via fsnotify, Temporal dynamic config via file polling, Milvus via etcd polling + callbacks, VictoriaMetrics via SIGHUP + periodic) support runtime config changes without restart. **Restart-required systems** (cli, OpenFGA for general config) require full restart for config changes. This difference reflects product shape: infrastructure components (kubelet, metrics scrapers) must handle config updates from external sources (ConfigMaps, config files), while application servers (API servers, CLIs) treat config as static after startup.

### Secret Storage Mechanism
**Keychain approach** (cli): OS-native credential storage with fallback to plaintext config. **Struct tag approach** (OpenFGA, Temporal masking): Compile-time annotation prevents serialization of sensitive fields. **Password type approach** (VictoriaMetrics): Separate type handles external secret sources with automatic re-reading. **Kubernetes-native approach** (Kubernetes): Secrets are a dedicated resource type with per-pod projection, not env var binding. No source implements Vault or encrypted config files.

### Validation Timing
**Startup-only** (OpenFGA, Kubernetes for kubelet config): All validation happens before component starts. **Lazy-only** (cli): Validation happens when specific config keys are accessed via `.Unwrap()`. **Split** (Temporal for static vs dynamic config, VictoriaMetrics for strict mode): Startup validation catches structural errors, lazy validation during parsing catches field-level errors. **Event-driven** (Milvus): Validation deferred to access time with CAS-based type safety.

### Feature Flags
**Static list with string constants** (OpenFGA `pkg/server/config/config.go:107-121`): Experimental features are just strings in an array, checked via map membership. **Typed feature gates** (Kubernetes `pkg/features/kube_features.go:41-1179`): Each gate has versioned specs and pre-release states. **Dynamic config with constraints** (Temporal `common/dynamicconfig/client.go:56-59`): Per-namespace, per-taskQueue constraints serve feature-flag-like behavior. **No formal feature flag system** (cli, Milvus, VictoriaMetrics): Boolean config options or struct tags serve as implicit toggles.

## Tradeoffs

| Decision | Benefit | Cost | Best-Fit Context | Failure Mode | Alternative |
|----------|---------|------|-------------------|--------------|-------------|
| Multi-source priority composition | Predictable overrides across environments | Complexity in debugging which source won | Multi-environment deployments | Silent overrides if priority order is misunderstood | Flat config with single source |
| Keyring for secrets | OS-level security, no plaintext | Keyring unavailability requires fallback; no rotation mechanism | Desktop CLI tools with user-level auth | Fallback to plaintext if keyring fails | Vault, encrypted files |
| Struct-tag secret isolation | Zero runtime cost, compile-time enforced | Only works for JSON serialization; easy to forget | When config structs leak to logs/APIs | Accidental logging via other methods (fmt.Sprint, etc) | Encryption, secret stores |
| Hot-reload via polling | Simple implementation, works with any file source | Latency up to poll interval; wasted cycles | File-based config without infrastructure | Stale config windows; high load with frequent polls | File watches, etcd watches |
| Hot-reload via SIGHUP | Portable across environments; explicit signal | Requires signal handler setup; signal delivery not guaranteed | Long-running processes | Signal missed during startup window | File-based watches |
| Event-driven callbacks | Fine-grained reactivity, no polling | Memory leak risk if handlers not cleaned up; coupling via event types | Large systems with multiple config consumers | Handler errors can cascade | Polling, centralized config service |
| Graceful degradation on reload failure | Availability over config updates | Stale config may cause unexpected behavior | Critical infrastructure services | Operators don't know config is stale | Fail-fast on any reload error |
| Startup-only validation | Fail-fast, clean startup | Full restart required to fix config error | Production services | Disruptive in development | Lazy validation, gradual degradation |
| Password type with external sources | Secrets not in config files; supports rotation | Additional file/URL dependency; timeout on fetch | When secrets are managed externally | Fetch failure leaves system without secret | Env var injection, mounted secrets |

## Decision Guide

**Use hot-reload when**: The service runs for extended periods (days/weeks), config changes come from external sources (ConfigMaps, remote files), or restart is disruptive to clients. Not needed for short-lived tools or CLI commands that run once.

**Use startup-only validation when**: The cost of misconfiguration is high (databases, API servers), config changes are infrequent, or restart is acceptable. Consider relaxed validation for development tools.

**Use keyring/secret store when**: User-facing desktop application with per-user credentials, or production service requiring centralized secret audit logs and rotation. Use env vars when running in containers/orchestration that already handles secrets.

**Use struct-tag isolation when**: Config structs are serialized to JSON/YAML for logging, APIs, or persistence. Use encryption when structs are stored at rest.

**Use polling over watches when**: File-based config without infrastructure support, or when cross-environment portability is needed (SIGHUP works across more environments than inotify). Use watches when low latency is critical and infrastructure supports it.

**Use event callbacks over polling when**: Multiple components need fine-grained reactivity to specific keys, or when polling overhead is unacceptable. Use polling when config changes are infrequent or coarse-grained.

## Practical Tips

1. **Always validate at startup for production services** — even if lazy validation exists, add startup validation to catch errors early. Kubernetes and OpenFGA demonstrate this well.

2. **Mask secrets at serialization, not at storage** — Temporal's `MaskYaml()` and VictoriaMetrics' `Password.String()` returning `"secret"` are good models. Encrypting at rest adds complexity without solving the log-leakage problem.

3. **Implement graceful degradation for hot-reload** — VictoriaMetrics' approach of logging an error and continuing with previous config is the right default. Failsafe over fails-fast for non-critical config.

4. **Use explicit priority ordering in multi-source systems** — Kubernetes' drop-in directory with lexical ordering and Milvus' priority numbers are clear and debuggable. Avoid magic merging rules.

5. **Consider the `Option[T]` pattern for missing config** — cli uses `o.Option[T]` from go-gh, avoiding nil-pointer gymnastics and making source tracking explicit.

6. **Password type with external source is worth copying** — VictoriaMetrics' `Password` type is the most complete secret management pattern found: supports file/http sources, periodic re-reading, fallback on failure, and `String()` returns `"secret"`.

7. **Use feature gates for gradual rollouts** — Kubernetes' versioned feature gates are the gold standard. Even simple string-based flags (OpenFGA) beat no feature flag system.

8. **Add a `/configz` endpoint for observability** — Kubernetes' `/configz` handler and Temporal's approach of allowing config inspection via dynamic config both help operators understand active configuration.

## Anti-Patterns / Caution Signs

1. **Silent defaults for required config** — OpenFGA's `DefaultConfig()` returning fully-populated struct means missing `datastore-uri` silently uses empty string. The server starts and fails later at first connection attempt.

2. **No validation on missing required fields** — If `PanicIfEmpty` is not set and no default exists, accessor methods may panic on access (cli's `AccessibleColors()` at `internal/config/config.go:119-121`).

3. **Hot-reload without version/state tracking** — If reload updates are not atomic, readers may see partial updates. Always use atomic swap operations.

4. **Memory growth from registered callbacks** — Milvus' `EventDispatcher` accumulates handlers without visible cleanup. Monitor handler registration in long-running processes.

5. **Keyring fallback to plaintext without warning** — cli falls back to storing token in plaintext `hosts.yml` if keyring fails, without clear indication this is less secure.

6. **Strict mode disabled by default** — VictoriaMetrics' `yaml.UnmarshalStrict()` is opt-in via `-promscrape.config.strictParse`, allowing typos to silently pass.

7. **Experimental flags with no typo detection** — OpenFGA silently ignores unknown experimental flag names, making typos in `Experimentals` config array undetectable.

8. **No config change audit trail** — Across all sources, no built-in mechanism exists to track who changed what config and when. This is a compliance gap for regulated environments.

## Notable Absences

1. **No source implements Vault or external secret store integration** in the main config loading path. Secrets are handled via env vars, keyring, or plaintext files.

2. **No source implements config encryption at rest** for config files themselves. Secrets in config files rely on filesystem permissions.

3. **No source implements config rollback** — changes are not versioned and cannot be rolled back without manual intervention.

4. **No source implements per-tenant configuration isolation** — multi-tenant deployments would need to layer tenant-specific config on top of the systems studied.

5. **No source implements structured config schema enforcement** beyond YAML strict parsing (JSON Schema, CUE, KCL are not used).

## Per-Source Notes

### cli
Clean interface/implementation separation (`gh.Config` interface in `internal/gh/gh.go:32-80`). Factory pattern enables lazy loading but means `gh version` works without config. Keyring integration is solid but unavailability causes plaintext fallback. No hot-reload is a known design issue per `pkg/cmdutil/factory.go:29-35`. Future: hot-reload via file watcher.

### kubernetes
Most comprehensive system studied. Multi-stage composition (flags → file → drop-ins) is explicit and debuggable. Per-object watches for ConfigMaps/Secrets scale well. fsnotify + polling fallback handles edge cases. `datapolicy` struct tags for log redaction are elegant. Future: kubelet config hot-reload, env:var binding.

### milvus
Event-driven approach with `EventDispatcher` and callbacks is sophisticated. Priority-based source merging (Env > Etcd > File) is clear. CAS-cached values handle concurrency. Secrets in plaintext YAML is a security gap. `CipherConfig` for KMS appears dormant. Future: Vault integration, native etcd watches, config schema validation.

### openfga
Viper is a battle-tested choice but somewhat opaque. `json:"-"` tags cleanly isolate secrets. Multi-layered `Verify()` functions are well-organized. Silent defaults are the main concern — required fields should be explicitly required. Future: dynamic config reload, enhanced feature flags, required vs optional config distinction.

### temporal
Template embedding with Go templates is powerful for containerized deployments. Separation of static (startup) and dynamic (runtime) config is architecturally clean. YAML masking with `MaskYaml()` is a good pattern. `PasswordCommand` for external secrets is elegant but underdocumented. Future: push-based dynamic config, Vault integration, structured schema validation.

### victoriametrics
SIGHUP + periodic reload is the most operationally robust hot-reload pattern found. Graceful degradation on reload failure is correct for monitoring systems. `Password` type with external sources is the best secret management pattern studied. Opt-in env var support is a deliberate security choice. Future: feature flag system, structured secret management, config change callbacks.

## Open Questions

1. **How do systems handle config schema evolution?** No source documents a migration mechanism for breaking config changes across versions. How does OpenFGA handle schema changes to `Config` struct? How does Kubernetes handle deprecated kubelet config keys?

2. **What is the operational story for config observability?** No source provides a complete audit trail for config changes. How do operators know what config is actually active without restarting with verbose logging?

3. **How should secret rotation work in production?** All sources either use static secrets or support re-reading from files. None demonstrate a rotation lifecycle with key versioning and rollout.

4. **When is multi-source composition overkill?** OpenFGA and VictoriaMetrics achieve good results with simpler single-source approaches. When does the complexity of multi-source composition pay off?

5. **How do multi-tenant deployments handle config isolation?** All sources are designed for single-tenant or cluster-wide config. Per-tenant override mechanisms are not addressed.

## Evidence Index

| Source | Area | Evidence | File:Line |
|--------|------|----------|-----------|
| cli | Config interface | `gh.Config` interface with `GetOrDefault`, `Set`, `Write` | `internal/gh/gh.go:32-80` |
| cli | Config implementation | `NewConfig()` reads from `ghConfig.Read()` | `internal/config/config.go:40-46` |
| cli | Default config | `defaultConfigStr` YAML with schema version and defaults | `internal/config/config.go:554-585` |
| cli | Keyring wrapper | Timeout-wrapped keyring via `zalando/go-keyring` | `internal/keyring/keyring.go:22-74` |
| cli | Auth token priority | `ActiveToken()` searches env vars, then keyring | `internal/config/config.go:237-260` |
| kubernetes | Multi-stage composition | flags → file → drop-in → flag precedence | `cmd/kubelet/app/server.go:148-258` |
| kubernetes | Drop-in merge | JSON patch merge in lexical order | `cmd/kubelet/app/server.go:331-400` |
| kubernetes | File watch | fsnotify with polling fallback | `pkg/kubelet/config/file_linux.go:67-99` |
| kubernetes | Per-object watches | Reflector per (namespace, name) pair | `pkg/kubelet/util/manager/watch_based_manager.go:222-257` |
| kubernetes | Startup validation | `ValidateKubeletConfiguration()` before start | `cmd/kubelet/app/server.go:254-258` |
| kubernetes | Feature gates | All gates as constants with versioned specs | `pkg/features/kube_features.go:41-1179` |
| milvus | Config Manager | `Manager` with `Dispatcher`, `sources`, `overlays` | `pkg/config/manager.go:86-97` |
| milvus | Priority ordering | EnvSource=50, EtcdSource=10, FileSource=100 | `pkg/config/env_source.go:87` |
| milvus | Event dispatcher | `EventDispatcher.Register` and `Dispatch` | `pkg/config/event_dispatcher.go:42-58` |
| milvus | Hot-reload via etcd | Periodic polling with event firing | `pkg/config/refresher.go:64-81` |
| milvus | Callback mechanism | `ParamChangeCallback` registration | `pkg/util/paramtable/param_item.go:35` |
| openfga | Viper init | `SetEnvPrefix("OPENFGA")`, `AutomaticEnv()` | `cmd/root.go:23-25` |
| openfga | Config struct | `type Config struct` with 40+ fields | `pkg/server/config/config.go:363-484` |
| openfga | Secrets isolation | `json:"-"` on Password, URI fields | `pkg/server/config/config.go:132-137` |
| openfga | Config Verify | Entry point for all validation | `pkg/server/config/config.go:486-491` |
| openfga | Experimental flags | Static list of flag strings | `pkg/server/config/config.go:107-121` |
| temporal | Embedded template | `{{ env "VAR_NAME" }}` syntax | `common/config/config_template_embedded.yaml:4` |
| temporal | Secrets masking | `MaskYaml()` replaces `password`, `keyData` | `common/masker/masker.go:9-14` |
| temporal | Dynamic config client | `NotifyingClient` with `Subscribe()` | `common/dynamicconfig/client.go:36-41` |
| temporal | Hot-reload | File polling + `PublishUpdates()` | `common/dynamicconfig/file_based_client.go:133-147` |
| temporal | PasswordCommand | External command for password fetch | `common/config/persistence.go:301-323` |
| victoriametrics | Env var binding | `envflag.Parse()` reads env vars | `lib/envflag/envflag.go:24-27` |
| victoriametrics | Password type | `file://`, `http://` sources, periodic re-read | `lib/flagutil/password.go:37-47` |
| victoriametrics | Secret flag registry | `RegisterSecretFlag()` + auto-detection | `lib/flagutil/secret.go:13-33` |
| victoriametrics | Hot reload | SIGHUP + ticker with graceful fallback | `lib/promscrape/scraper.go:112-206` |
| victoriametrics | Strict YAML parsing | `yaml.UnmarshalStrict()` for unknown fields | `lib/promscrape/config.go:129` |

---

Generated by dimension `03-configuration-environment-management.md`.