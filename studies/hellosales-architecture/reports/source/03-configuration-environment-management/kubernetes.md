# Source Analysis: kubernetes

## Configuration & Environment Management

### Source Info

| Field | Value |
|-------|-------|
| Name | kubernetes |
| Path | `sources/kubernetes` |
| Language / Stack | Go |
| Analyzed | 2026-05-19 |

## Summary

Kubernetes implements a comprehensive multi-layer configuration system. Configuration flows through three stages: (1) flag parsing via pflag, (2) file loading (JSON/YAML with schema validation), and (3) drop-in directory merging via JSON patch. Secrets are managed through dedicated Secret objects with per-pod projections, not through env var binding. Feature gates use a typed `FeatureGate` interface with versioned specs. Hot-reload is implemented via fsnotify (inotify) for file sources and per-object watches for ConfigMaps/Secrets. Validation is strict at startup with aggregated errors.

## Rating

**8/10** — Kubernetes demonstrates excellent configuration management with comprehensive validation, multi-source composition, and robust hot-reload mechanisms. Minor gaps include no native `env:` struct tag binding (relies on flag parsing), and some sensitive data handling relies on convention rather than enforced isolation.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| KubeletConfiguration struct | Internal config type with 500+ fields | `pkg/kubelet/apis/config/types.go:82-566` |
| Feature gate definition | All feature gates as constants with versioned specs | `pkg/features/kube_features.go:41-1179` |
| Feature gate interface | `Enabled(key Feature) bool` method | `staging/src/k8s.io/component-base/featuregate/feature_gate.go:145` |
| Versioned config types | v1beta1 KubeletConfiguration with JSON tags | `staging/src/k8s.io/kubelet/config/v1beta1/types.go:120-962` |
| ConfigZ HTTP endpoint | `/configz` handler for component config inspection | `staging/src/k8s.io/component-base/configz/configz.go:76-131` |
| LeaderElection flags | Flag binding pattern for cluster coordination | `staging/src/k8s.io/component-base/config/options/leaderelectionconfig.go:26-51` |
| Kubelet config loading | Multi-stage: create, file load, drop-in merge, flag precedence | `cmd/kubelet/app/server.go:148-258` |
| Drop-in merge | JSON patch merge with lexical ordering | `cmd/kubelet/app/server.go:331-400` |
| File watch (inotify) | fsnotify-based hot-reload for pod manifests | `pkg/kubelet/config/file_linux.go:67-99` |
| Pod source mux | Multi-source aggregation (File, URL, APIserver) | `pkg/kubelet/kubelet.go:368-401` |
| ConfigMap manager (watch) | Per-object reflector with field selectors | `pkg/kubelet/util/manager/watch_based_manager.go:222-257` |
| ConfigMap manager (TTL) | Caching manager with 1-minute TTL | `pkg/kubelet/configmap/configmap_manager.go:115-131` |
| Startup validation | Comprehensive validation before kubelet starts | `cmd/kubelet/app/server.go:254-258` |
| Validation logic | Feature gate merging, range checks, policy validation | `pkg/kubelet/apis/config/validation/validation.go:46-410` |
| API server validation | Aggregated errors at startup | `cmd/kube-apiserver/app/server.go:109-112` |
| Auth config reload | File watcher for authentication config | `pkg/kubeapiserver/options/authentication.go:761-820` |
| Data policy tags | `datapolicy` struct tag for sensitive data redacting | `staging/src/k8s.io/component-base/logs/datapol/datapol.go:88-91` |
| Service account token projection | Config for token attributes and annotation keys | `pkg/kubelet/apis/config/types.go:754-803` |
| Credential provider env | Exec plugins with env variable injection | `pkg/kubelet/apis/config/types.go:730` |

## Answers to Dimension Questions

### 1. How does the system compose config from multiple sources (file, env, remote)?

Kubernetes uses a **three-stage composition** in the kubelet:

1. **Base config from flags** (`options.NewKubeletConfiguration()`) at `cmd/kubelet/app/server.go:148`
2. **File loading** (if `--kubelet-config-file` specified) at lines 217-222
3. **Drop-in directory merging** (`--kubelet-dropin-config-directory`) via JSON patch at lines 224-230, 331-400 — files like `10-config.conf`, `20-config.conf` applied in lexical order
4. **Flag precedence enforcement** at lines 236-243 — command-line flags override file/drop-in configs

For pod configuration, the `PodConfig` mux aggregates three sources via channels at `pkg/kubelet/kubelet.go:368-401`:
- **File source** (static pod manifests) at `pkg/kubelet/config/file_linux.go:67-99`
- **URL source** (HTTP manifests) at `pkg/kubelet/config/http.go`
- **API Server source** (from etcd via API) at `pkg/kubelet/config/apiserver.go:32-67`

API server configuration is built via `CompletedOptions` at `cmd/kube-apiserver/app/server.go:69-145` with plugin initializers.

### 2. How are secrets managed without leaking into logs or version control?

Secrets are a **first-class Kubernetes resource type** with dedicated handling:

- **Secret objects** stored in etcd with encryption at rest (configurable)
- **Per-pod secret projection** via `VolumeSource` at `pkg/kubelet/apis/config/types.go:940-948` — tokens mounted at `/var/run/secrets/kubernetes.io/serviceaccount`
- **Service account token projection** configurable via `ServiceAccountTokenAttributes` at lines 754-803 with `RequiredServiceAccountAnnotationKeys` and `OptionalServiceAccountAnnotationKeys`
- **Credential provider plugins** receive secrets via env vars (`Env []ExecEnvVar` at line 730) injected at execution time, not stored in config
- **Image pull secrets** handled via `ImagePullSecret` struct at lines 940-948 with `CredentialHash`
- **Data policy tags** for sensitive data redacting in logs at `staging/src/k8s.io/component-base/logs/datapol/datapol.go:88-91` — uses `datapolicy:"token"` tag on `StaticPodURLHeader` at `pkg/kubelet/apis/config/types.go:107`
- **No secrets in env vars by default** — secrets mounted as volumes, not environment variables

### 3. Can config be changed at runtime or does it require restart?

**Partial hot-reload supported:**

- **Pod manifest files**: fsnotify-based watching at `pkg/kubelet/config/file_linux.go:67-99` with fallback polling at `pkg/kubelet/config/file.go:91-114` — changes detected and applied without restart
- **ConfigMaps/Secrets**: Per-object watches via `NewWatchBasedManager()` at `pkg/kubelet/util/manager/watch_based_manager.go:180-210` — changes propagated via watch events, stopped when idle (5x resync interval) at lines 99-110, 363-375
- **Authentication config file**: Dynamic reload via file watcher at `pkg/kubeapiserver/options/authentication.go:761-820`
- **Kubelet config**: NOT hot-reloadable — requires restart of kubelet process (validated at startup at `cmd/kubelet/app/server.go:254-258`)
- **API server config**: NOT hot-reloadable — validation at startup at `cmd/kube-apiserver/app/server.go:109-112`

### 4. How is config validated at startup vs lazily?

**Strict startup validation with aggregated errors:**

- **Kubelet**: `ValidateKubeletConfiguration()` at `pkg/kubelet/apis/config/validation/validation.go:46-64` — validates all fields including:
  - Feature gates merged at line 59: `localFeatureGate.SetFromMap(kc.FeatureGates)`
  - Port ranges (line 136)
  - NodeLeaseDurationSeconds > 0 (line 66)
  - CPUManagerPolicy, TopologyManagerPolicy values (lines 169-183)
  - Eviction thresholds ordering (lines 93-107)
  - Validation failure causes exit at `cmd/kubelet/app/server.go:256-258`

- **API server**: `completedOptions.Validate()` at `cmd/kube-apiserver/app/server.go:109-112` — returns aggregated errors
  - Missing service-cluster-ip-range at `cmd/kube-apiserver/app/options/validation.go:42-44`

**Lazy validation (deferred to admission time):**
- Admission plugins initialized but validation deferred to request time at `staging/src/k8s.io/apiserver/pkg/admission/plugins.go:201-205`
- Declarative validation merged with handwritten validation at `staging/src/k8s.io/apiserver/pkg/registry/rest/validate.go:42-102`

### 5. How does the system handle missing or invalid configuration?

**Strict failure on invalid config:**

- **Empty config file**: Error returned at `pkg/kubelet/kubeletconfig/configfiles/configfiles.go:65-74`
- **Non-existent path**: Emits empty update with retryable error at `pkg/kubelet/config/file_linux.go:67-76` — backoff and retry
- **Programmer error on config creation failure**: Exit at `cmd/kubelet/app/server.go:149-152`
- **File load error**: Returns error with path context at lines 219-221
- **Validation failure**: Returns formatted error with path at lines 256-258

**Error aggregation:**
- Uses `utilerrors.NewAggregate()` for multiple errors at `cmd/kube-apiserver/app/server.go:110`
- Validation collects all errors in `allErrors := []error{}` at `pkg/kubelet/apis/config/validation/validation.go:47`

## Architectural Decisions

1. **Flag-first, file-second layering**: Command-line flags always take precedence over file-loaded config, ensuring CLI overrides work predictably (`cmd/kubelet/app/server.go:236-243`)

2. **Drop-in directory for tenant/cluster overrides**: JSON patch merge in lexical order allows non-destructive config extension without modifying base config (`cmd/kubelet/app/server.go:331-400`)

3. **Per-object watches for ConfigMaps/Secrets**: Instead of watching all ConfigMaps cluster-wide, each pod's referenced ConfigMaps get individual reflectors with field selectors (`pkg/kubelet/util/manager/watch_based_manager.go:222-257`)

4. **Feature gates as versioned specs**: Each gate has version-specific defaults and pre-release states, allowing graduated rollouts (`pkg/features/kube_features.go:1191-1248`)

5. **Strict validation at startup**: All config validated before any component starts, failing fast rather than degraded operation (`cmd/kubelet/app/server.go:254-258`)

6. **Two-phase admission**: Mutating plugins run first, then validating plugins, enabling chained mutations with final validation (`pkg/kubeapiserver/options/admission.go:78-83`)

## Notable Patterns

- **Pod source mux pattern**: `config.NewPodConfig()` aggregates multiple sources via channels, allowing unified treatement of File/URL/API sources (`pkg/kubelet/config/config.go:40-71`)
- **Reflector per object**: Watch-based manager creates one reflector per unique (namespace, name) pair with field selector for efficiency (`pkg/kubelet/util/manager/watch_based_manager.go:222-257`)
- **JSON patch merge for drop-ins**: Uses `jsonpatch.MergePatch()` for non-destructive config extension (`cmd/kubelet/app/server.go:376`)
- **datapolicy struct tag**: Sensitive fields tagged for automatic redaction in log output (`staging/src/k8s.io/component-base/logs/datapol/datapol.go:88-91`)
- **ConfigZ HTTP handler**: `/configz` endpoint allows runtime inspection of component config state (`staging/src/k8s.io/component-base/configz/configz.go:76-80`)

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| No env:var struct tag binding | Simplicity — all config via flags, no magic binding. Downside: more boilerplate for env-based config |
| fsnotify + polling fallback | Relies on filesystem events; polling fallback handles edge cases (NFS, overlay) but adds overhead |
| Per-object watches | Scales well for reasonable pod counts; could be problematic with thousands of pods referencing unique ConfigMaps |
| Strict startup validation | Fail-fast is safe but prevents restarts with partial config — no degraded mode |
| JSON patch for drop-ins | Human-readable but requires JSON, not YAML; merge semantics can be surprising |

## Failure Modes / Edge Cases

1. **Inotify watcher failure**: If fsnotify events are lost (buffer overflow), polling fallback catches up at `pkg/kubelet/config/file.go:91-114`

2. **Watch-based manager idle timeout**: Reflector stops after 5x resync interval of no references at `pkg/kubelet/util/manager/watch_based_manager.go:99-110, 363-375` — next Get() restarts it, causing potential staleness window

3. **ConfigMap/Secret not found**: Per-object cache returns error on cache miss when object doesn't exist (handled in `NewObjectCache`)

4. **Drop-in merge conflicts**: Lexical ordering means later files override earlier ones silently — no conflict detection

5. **Feature gate version mismatch**: Using a gate that doesn't exist in current version returns error at `pkg/kubelet/apis/config/validation/validation.go:59`

6. **Empty config file**: Treated as error at `pkg/kubelet/kubeletconfig/configfiles/configfiles.go:65-74` — no default fallback

7. **Path doesn't exist for pod source**: Emits empty PodList to mark source as "seen", then retries with backoff at `pkg/kubelet/config/file_linux.go:67-76`

## Future Considerations

1. **Kubelet config hot-reload**: Currently requires restart; could leverage the same fsnotify pattern used for pod manifests

2. **Env var binding**: No native `env:` struct tag support — could add using spf13/viper or similar library if demand exists

3. **Validation caching**: Repeated validation of unchanged config could be optimized with content-addressed caching

4. **Watch idle timeout tuning**: Current 5x resync interval may be too aggressive or conservative depending on workload — could be configurable

5. **Drop-in conflict detection**: Warn on conflicting keys in different drop-in files rather than last-one-wins

## Questions / Gaps

1. **No evidence found** for Vault integration or external secret store binding — secrets are Kubernetes-native only
2. **No evidence found** for feature flag override via environment variables — only via config file or flag
3. **No evidence found** for configuration rollback mechanism — changes are not versioned
4. **Unclear** how encrypted etcd impacts config validation timing for API server
5. **Unclear** the full admission chain configuration API surface for dynamic plugin registration