# Repo Analysis: k9s

## Configuration Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | k9s |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/k9s` |
| Group | k9s |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

k9s implements a layered configuration system with clear precedence: defaults → config file → context-specific config → CLI flags. It uses manual override fields to track CLI-driven changes that persist for the session. Configuration is not fully immutable — it uses `fsnotify` to hot-reload config files at runtime. Validation is centralized in `K9s.Validate()` and distributed across domain-specific structs (Context, Namespace, Threshold, Logger, ShellPod).

## Rating

**7/10** — Centralized config with good layering. Precedence is well-defined via `manual*` fields and `getActiveConfig()`. Some inconsistency in how different config areas handle overrides. Hot-reload is a bonus but CLI flag persistence makes session behavior complex.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Flag definitions | `initK9sFlags()` and `initK8sFlags()` define all CLI flags | `cmd/root.go:184-265`, `cmd/root.go:267-316` |
| Flags struct | `Flags` struct with RefreshRate, LogLevel, Headless, etc. | `internal/config/flags.go:17-32` |
| Default values | Constants for DefaultRefreshRate, DefaultLogLevel, DefaultCommand | `internal/config/flags.go:6-15` |
| Env var: config dir | `K9S_CONFIG_DIR` override for config directory | `internal/config/files.go:19-24` |
| Env var: logs dir | `K9S_LOG_DIR` override for logs directory | `internal/config/files.go:19-24` |
| Env var: port forward | `K9S_DEFAULT_PF_ADDRESS` for port forward default | `internal/config/helpers.go:16` |
| Env var: node shell | `K9S_FEATURE_GATE_NODE_SHELL` for feature gate | `internal/config/data/helpers.go:17` |
| Env var: skin | `K9S_SKIN` for skin override | `internal/ui/config.go:198` |
| Config file loading | `Config.Load()` with JSON schema validation | `internal/config/config.go:258-281` |
| Context config loading | `AppContextDir()` computes per-context config path | `internal/config/files.go:214-216` |
| Config merge | `c.Merge(&cfg)` merges file config into receiver | `internal/config/config.go:258-281` |
| CLI override | `k9sCfg.K9s.Override(k9sFlags)` applies CLI flags | `cmd/root.go:146` |
| Precedence logic | `IsReadOnly()` checks default → context → manual | `internal/config/k9s.go:410-421` |
| Precedence logic | `GetRefreshRate()` checks default → manual override | `internal/config/k9s.go:384-403` |
| Override pattern | `manual*` fields track CLI-driven changes | `internal/config/k9s.go:317-337` |
| Main validation | `K9s.Validate()` calls all domain validators | `internal/config/k9s.go:423-451` |
| Context validation | `Context.Validate()` validates ns, view, feature gates | `internal/config/data/context.go:70-89` |
| JSON schema validation | Uses `gojsonschema` against embedded schemas | `internal/config/json/validator.go:1-187` |
| Config hot-reload | `fsnotify.NewWatcher()` watches config files | `internal/ui/config.go:134-190` |
| Config watcher | `ConfigWatcher()` reloads on Create/Write events | `internal/ui/config.go:134-190` |
| Active config retrieval | `getActiveConfig()` returns current context config | `internal/config/k9s.go:380-382` |

## Answers to Protocol Questions

### 1. How are flags, env vars, and config files merged?

Flags, env vars, and config files are merged through a multi-stage process in `loadConfiguration()` (`cmd/root.go:130-169`):

1. **Defaults** — Hard-coded in struct field initialization (e.g., `DefaultRefreshRate = 2.0` in `internal/config/flags.go:6`)
2. **Config file** — Loaded via `k9sCfg.Load(config.AppConfigFile, false)` which unmarshals YAML and merges via `c.Merge(&cfg)` (`internal/config/config.go:258-281`)
3. **Context config** — Loaded when context is activated via `AppContextDir()` (`internal/config/files.go:214-216`)
4. **CLI flags** — Applied via `k9sCfg.K9s.Override(k9sFlags)` (`cmd/root.go:146`) which sets `manual*` fields in the K9s struct

Environment variables like `K9S_CONFIG_DIR`, `K9S_LOGS_DIR`, `K9S_DEFAULT_PF_ADDRESS`, `K9S_FEATURE_GATE_NODE_SHELL`, and `K9S_SKIN` are checked at various points:
- `K9S_CONFIG_DIR`/`K9S_LOGS_DIR` in `files.go:19-24`
- `K9S_DEFAULT_PF_ADDRESS` in `k9s.go:423-451` (during validation)
- `K9S_SKIN` in `internal/ui/config.go:198`

### 2. What precedence rules exist?

Precedence is: **CLI flags (highest) → Context config → Config file → Defaults**

The `IsReadOnly()` function (`internal/config/k9s.go:410-421`) demonstrates this clearly:
```go
ro := k.ReadOnly                    // 1. Default/file config
if cfg := k.getActiveConfig(); cfg != nil && cfg.Context.ReadOnly != nil {
    ro = *cfg.Context.ReadOnly     // 2. Context-specific config
}
if k.manualReadOnly != nil {
    ro = *k.manualReadOnly          // 3. CLI flags (highest priority)
}
return ro
```

Similarly, `GetRefreshRate()` (`internal/config/k9s.go:384-403`) checks `k.RefreshRate` first, then `k.manualRefreshRate` if non-zero.

The `Override()` function (`internal/config/k9s.go:317-337`) only sets a manual override if the flag differs from the default:
```go
if k9sFlags.RefreshRate != nil && *k9sFlags.RefreshRate != DefaultRefreshRate {
    k.manualRefreshRate = float32(*k9sFlags.RefreshRate)
}
```

### 3. Is config immutable after startup?

**No** — k9s uses `fsnotify` to watch config files and hot-reload them at runtime. The `ConfigWatcher()` (`internal/ui/config.go:134-190`) monitors:
- Main config file (`AppConfigFile`) — calls `c.Config.Load(evt.Name, false)`
- Context config files — calls `c.Config.K9s.Reload()`

However, **CLI flag overrides are persistent** — they set `manual*` fields that take precedence over file-based settings for the session duration.

Settings hot-reloaded at runtime:
- Main k9s config
- Context-specific config
- Custom views (`CustomViewsWatcher`)
- Skin files (`SkinsDirWatcher`)

### 4. Is validation centralized?

**Yes** — Primary validation entry point is `K9s.Validate()` (`internal/config/k9s.go:423-451`) which orchestrates:
- `k.ShellPod.Validate()` — validates pod shell configuration (`internal/config/shell_pod.go:45-53`)
- `k.Logger.Validate()` — validates logger settings (`internal/config/logger.go:37-53`)
- `k.Thresholds.Validate()` — validates CPU/MEM thresholds (`internal/config/threshold.go:63-75`)
- `cfg.Validate(c, contextName, clusterName)` — validates context config

Additional validation in:
- `Context.Validate()` (`internal/config/data/context.go:70-89`) — validates namespace, view, feature gates
- `Namespace.Validate()` (`internal/config/data/ns.go:61-80`) — validates active namespace and favorites

JSON schema validation (`internal/config/json/validator.go:1-187`) is applied during `Config.Load()` at `internal/config/config.go:270` using embedded JSON schemas.

## Architectural Decisions

1. **Manual override fields** — k9s uses `manual*` fields (e.g., `manualRefreshRate`, `manualHeadless`, `manualReadOnly`) to track CLI-driven changes. This allows distinguishing "user set via CLI" from "user set via config file".

2. **Hot-reload via fsnotify** — Config files are watched and reloaded at runtime, allowing changes without restart. This is balanced by CLI overrides persisting for the session.

3. **Context-specific configs** — Per-cluster/context configs stored in `~/.local/share/k9s/clusters/<cluster>/<context>/config.yaml` allow isolation of cluster-specific settings.

4. **Layered defaults** — `DefaultRefreshRate`, `defaultMaxConnRetry`, `defaultPFAddress()`, etc. provide safe fallbacks at multiple levels.

## Notable Patterns

1. **Override pattern** — `K9s.Override()` only sets manual overrides when flag differs from default, preventing accidental override of config file values.

2. **Active config retrieval** — `getActiveConfig()` (`internal/config/k9s.go:380-382`) centralizes context config access for precedence checks.

3. **Distributed validation** — Each domain struct (ShellPod, Logger, Threshold, Context, Namespace) has its own `Validate()` method, called from centralized `K9s.Validate()`.

4. **Schema validation** — JSON schema validation using `gojsonschema` provides structured validation before YAML unmarshaling.

5. **Feature gates via env vars** — `K9S_FEATURE_GATE_NODE_SHELL` demonstrates env-var-driven feature flags.

## Tradeoffs

1. **Hot-reload vs. CLI persistence** — File changes are respected at runtime, but CLI flags take precedence and persist. This can lead to confusion when a user edits the config file but their CLI flags still override.

2. **Context config isolation** — Per-context configs in separate directories provide clean isolation but make global settings harder to manage.

3. **Manual override tracking** — The `manual*` fields provide fine-grained precedence but add complexity to the `K9s` struct.

4. **Validation complexity** — Distributed `Validate()` methods are clean but require coordination through the central `K9s.Validate()` orchestrator.

## Failure Modes / Edge Cases

1. **Missing context config** — If context config doesn't exist, `AppContextDir()` (`internal/config/files.go:214-216`) generates a default, but the parent directory may not exist.

2. **Schema mismatch** — If YAML doesn't match the embedded JSON schema, validation fails in `Config.Load()` at `internal/config/config.go:270`.

3. **Circular precedence** — If both CLI flags and context config set the same value, the precedence is clear but may surprise users who expect the "last write wins" behavior.

4. **Hot-reload race conditions** — If config file changes rapidly during `fsnotify` events, concurrent reloads could cause issues (though the single goroutine watching reduces this risk).

5. **Env var shadowing** — `K9S_DEFAULT_PF_ADDRESS` is applied during validation (`k9s.go:423-451`) after the config file is loaded, potentially surprising users who expect their config file value to take precedence.

## Future Considerations

1. **Immutable config option** — A flag to disable hot-reload and treat config as truly immutable after startup would simplify reasoning about state.

2. **Precedence documentation** — The precedence rules are encoded in functions like `IsReadOnly()` and `GetRefreshRate()` but not documented as a first-class concept.

3. **Unified config structure** — Moving all `manual*` fields into a dedicated `CLIOverrides` struct could improve maintainability.

4. **Validation error aggregation** — Currently validation fails on first error; collecting all validation errors before reporting would improve UX.

## Questions / Gaps

1. **What happens if `K9S_CONFIG_DIR` points to a non-existent directory?** — The config directory initialization may fail silently or create the directory, depending on the `os.MkdirAll` behavior.

2. **How are conflicts between context config and main config resolved?** — The `getActiveConfig()` returns the context config, but it's unclear if/when the main config is merged with context config.

3. **Is there a maximum reload frequency?** — Rapid file changes could trigger excessive reloads; is there debouncing?

---

Generated by `study-areas/04-configuration-management.md` against `k9s`.