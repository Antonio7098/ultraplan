# Source Analysis: victoriametrics

## Configuration & Environment Management

### Source Info

| Field | Value |
|-------|-------|
| Name | victoriametrics |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/victoriametrics` |
| Language / Stack | Go |
| Analyzed | 2026-05-19 |

## Summary

VictoriaMetrics implements a layered configuration system combining command-line flags, environment variables with template substitution, and YAML configuration files. Secrets are managed through a dedicated `Password` type that supports external sources (file/HTTP) and deliberately hides values from logs. Hot reload is supported via SIGHUP signals and periodic checking, with graceful fallback on reload failure. Validation occurs both at startup (fatal) and during parsing (strict YAML unmarshaling with unknown field detection).

## Rating

**7/10** — Good implementation with minor issues. The system is well-designed for a metrics server use case, but lacks a formal feature flag system, uses basic string matching for secret detection rather than explicit opt-in, and environment variable support requires opt-in via `-envflag.enable`.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Env var flag binding | `envflag.Parse()` reads env vars for unset flags, converts dots to underscores | `lib/envflag/envflag.go:24-27`, `lib/envflag/envflag.go:80-84` |
| Env template substitution | `%{ENV_VAR}` placeholder expansion in config files | `lib/envtemplate/envtemplate.go:12-16`, `lib/envtemplate/envtemplate.go:74-82` |
| Secret flag registration | `RegisterSecretFlag()` marks flags as secret, excluded from `/metrics` | `lib/flagutil/secret.go:13-16` |
| Secret detection | `IsSecretFlag()` uses string matching (pass, key, secret, token) | `lib/flagutil/secret.go:28-33` |
| Password from file/URL | `Password` type supports `file://`, `http://`, `https://` sources with periodic re-reading | `lib/flagutil/password.go:37-47`, `lib/flagutil/password.go:92-117` |
| Password logging protection | `Password.String()` returns `"secret"` to prevent accidental exposure | `lib/flagutil/password.go:88-90` |
| Config file loading (HTTP/local) | `ReadFileOrHTTP()` handles both local files and HTTP/HTTPS URLs | `lib/fs/fscore/fscore.go:27-52` |
| YAML strict parsing | `yaml.UnmarshalStrict()` for unknown field detection | `lib/promscrape/config.go:129` |
| Config hot reload | SIGHUP + ticker-based reload with `mustRestart()` comparison | `lib/promscrape/scraper.go:112-206` |
| SIGHUP signal handling | `NewSighupChan()` creates channel for SIGHUP events | `lib/procutil/signal.go:17-46` |
| Fallback on reload failure | Continues with previous config if reload fails, logs error | `lib/promscrape/scraper.go:164-169` |
| Unknown field validation | `checkOverflow()` detects extra fields in YAML | `app/vmalert/config/config.go:325-334` |
| Config struct with yaml tags | `Group` and `Config` structs with validation tags | `app/vmalert/config/config.go:25-55`, `lib/promscrape/config.go:113-121` |
| Env var enabled flag | Requires `-envflag.enable` to activate env var reading | `lib/envflag/envflag.go:12-17` |
| Env var expansion in args | `%{ENV_VAR}` placeholders substituted in command-line args | `lib/envflag/envflag.go:67-78` |

## Answers to Dimension Questions

### 1. How does the system compose config from multiple sources (file, env, remote)?

Configuration is composed from three sources:

1. **Command-line flags** — Standard Go `flag` package parsed via `envflag.Parse()` at `lib/envflag/envflag.go:24-27`
2. **Environment variables** — Read for unset flags if `-envflag.enable` is set (`lib/envflag/envflag.go:41-64`). Flag names convert dots to underscores (e.g., `promscrape.configFile` → `PMSCRAPE_CONFIGFILE`). Env vars are cached at startup in `envtemplate.envVars` map (`lib/envtemplate/envtemplate.go:34-38`).
3. **YAML config files** — Loaded via `fscore.ReadFileOrHTTP()` at `lib/fs/fscore/fscore.go:27-52`, which handles both local filesystem and HTTP/HTTPS URLs. The `envtemplate.ReplaceBytes()` substitutes `%{ENV_VAR}` placeholders before YAML parsing (`lib/promscrape/config.go:124`).

Priority: Command-line flags > Environment variables > Config file defaults.

### 2. How are secrets managed without leaking into logs or version control?

Two mechanisms exist:

1. **`Password` type** (`lib/flagutil/password.go:37-47`): A flag type that:
   - Accepts `file://path`, `http://url`, `https://url` prefixes for external secret sources
   - Re-reads secrets periodically (every 2 seconds) from the source (`lib/flagutil/password.go:64-85`)
   - Returns `"secret"` from `String()` to prevent accidental exposure in logs (`lib/flagutil/password.go:88-90`)
   - Falls back to previous value if re-read fails (`lib/flagutil/password.go:79-84`)

2. **`Secret` flag registry** (`lib/flagutil/secret.go`):
   - `RegisterSecretFlag()` marks specific flags as secret (`lib/flagutil/secret.go:13-16`)
   - `IsSecretFlag()` auto-detects secrets by name pattern (contains "pass", "key", "secret", "token") or explicit registration (`lib/flagutil/secret.go:28-33`)
   - Secret flags are excluded from the `/metrics` page (`lib/flagutil/secret.go:12`)

3. **`Secret` marshal type** (`lib/promauth/config.go:31-68`): Marshals sensitive fields to `<secret>` string in YAML output.

No evidence of Vault integration, encrypted files at rest, or centralized secret management. Secrets in config files rely on file system permissions.

### 3. Can config be changed at runtime or does it require restart?

**Hot reload is supported** via two mechanisms in `lib/promscrape/scraper.go:102-206`:

1. **SIGHUP signal** (`lib/promscrape/scraper.go:162`): When SIGHUP is received, config is reloaded and `mustRestart()` determines if scrapers need to restart.
2. **Periodic checking** (`lib/promscrape/scraper.go:152-157`): If `configCheckInterval > 0`, a ticker triggers periodic reload.

If reload fails, the previous configuration is retained (`lib/promscrape/scraper.go:164-169`):
```go
logger.Errorf("cannot read %q on SIGHUP: %s; continuing with the previous config", configFile, err)
```

For vmauth, the `authConfigReloader()` function (`app/vmauth/auth_config.go:818-852`) provides similar SIGHUP + interval-based reloading.

Note: Not all configuration can be changed at runtime. Command-line flags (except via env template expansion) typically require restart.

### 4. How is config validated at startup vs lazily?

**Startup validation**:
- Missing required flags cause fatal errors via `logger.Fatalf()` (`lib/envflag/envflag.go:34`, `lib/promscrape/config.go:118`)
- `mustInitClusterMemberID()` validates cluster configuration at startup (`lib/promscrape/config.go:91-111`)
- `dryRun` mode validates rules without starting the service (`app/vmalert/main.go:109-118`)

**Lazy/layered validation**:
- YAML strict parsing via `yaml.UnmarshalStrict()` (`lib/promscrape/config.go:129`) catches unknown fields
- `checkOverflow()` function validates no unknown fields in YAML (`app/vmalert/config/config.go:325-334`)
- `Group.Validate()` (`app/vmalert/config/config.go:77-129`) and `Rule.Validate()` (`app/vmalert/config/config.go:217-229`) validate during config parsing
- OAuth2 config validation on creation (`lib/promauth/config.go:154-168`)

Unknown field handling: Strict mode is opt-in via `-promscrape.config.strictParse` flag (`lib/promscrape/config.go:57`), which if disabled allows unknown fields silently.

### 5. How does the system handle missing or invalid configuration?

**Missing required configuration**:
- `logger.Fatalf()` terminates the process at startup (`lib/envflag/envflag.go:34`, `app/vmauth/auth_config.go:791`)
- Example: missing `-auth.config` flag causes fatal error at `app/vmauth/auth_config.go:791`

**Invalid configuration on reload**:
- Errors are logged but do not terminate the process
- Previous valid configuration is retained and continues operating (`lib/promscrape/scraper.go:164-169`)
- `configReloadErrors` metric is incremented (`lib/promscrape/scraper.go:166`)
- `configSuccess` gauge is set to 0 (`lib/promscrape/scraper.go:167`)

**Invalid YAML fields**:
- With strict mode enabled, unknown fields cause `yaml.UnmarshalStrict()` to fail (`lib/promscrape/config.go:129`)
- Error message suggests passing `-promscrape.config.strictParse=false` to ignore unknown fields
- `checkOverflow()` provides additional layer of unknown field detection (`app/vmalert/config/config.go:325-334`)

**Duplicate configuration**:
- Validates duplicate `job_name` in scrape configs (`lib/promscrape/config.go:510`)
- Skips invalid scrape configs with error logging rather than failing (`lib/promscrape/config.go:546`)

## Architectural Decisions

1. **Opt-in environment variable support**: `-envflag.enable` must be explicitly set to read from environment variables. This is a deliberate security choice to prevent accidental environment variable exposure in certain deployment scenarios.

2. **SIGHUP-first hot reload**: The system prioritizes SIGHUP signal handling registered before config loading (`lib/promscrape/scraper.go:110-113`) to handle edge cases where signal arrives during initial load.

3. **Graceful degradation on reload failure**: Instead of crashing when a config reload fails, the system continues with the previous valid configuration and logs an error. This is critical for monitoring systems where availability trumps config updates.

4. **Template substitution before YAML parsing**: `%{ENV_VAR}` placeholders are expanded in raw config bytes before YAML unmarshaling (`lib/promscrape/config.go:124`), allowing environment variables to be embedded anywhere in YAML config files.

5. **Secret auto-detection by naming convention**: `IsSecretFlag()` (`lib/flagutil/secret.go:28-33`) uses string matching to detect common secret naming patterns, supplemented by explicit `RegisterSecretFlag()` for edge cases.

## Notable Patterns

1. **Password type with lazy loading**: The `Password` struct (`lib/flagutil/password.go:37-47`) generates a random value on initialization if the source is a file/URL that doesn't exist yet, preventing unauthorized access while the secret file is being created.

2. **Recursive env var expansion**: `envtemplate.expandTemplates()` (`lib/envtemplate/envtemplate.go:55-72`) recursively expands environment variable values that themselves contain `%{ENV_VAR}` placeholders.

3. **Hot config comparison**: `mustRestart()` (`lib/promscrape/config.go:157`) compares configs and only restarts scrapers if actual changes are detected, avoiding unnecessary disruption.

4. **Inline overflow catch**: The `XXX map[string]any` field with `yaml:",inline"` tag (`app/vmalert/config/config.go:54`) catches and rejects unknown YAML fields.

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| Opt-in env var support | Prevents accidental exposure but requires explicit enablement; some users may not discover this feature |
| SIGHUP + ticker reload | More complex than just file watching, but SIGHUP is more portable across environments |
| Secret detection by naming | String matching is simple but can miss custom-named secrets; explicit registration requires developer awareness |
| Fallback on reload failure | Continues operating with stale config, which may be unexpected behavior for operators |
| Random password fallback | Prevents unauthorized access but may mask file permission issues |
| Strict mode opt-in | Unknown field detection must be explicitly enabled, allowing misconfigured configs to silently work |

## Failure Modes / Edge Cases

1. **Race condition on SIGHUP during initial load**: Handled by registering SIGHUP handler before `loadConfig()` (`lib/promscrape/scraper.go:110-113`), but there is still a small window where signal could be missed.

2. **Circular env var references**: The recursive expansion (`lib/envtemplate/envtemplate.go:55-72`) iterates up to `len(m)` times, which could theoretically loop indefinitely if there's a cycle. No explicit cycle detection found.

3. **Secret file deletion**: If a `file://` password source is deleted, the system falls back to the previous value (`lib/flagutil/password.go:79-84`) but may continue using the in-memory secret indefinitely without detecting the file is gone.

4. **HTTP secret source availability**: If an `http://`/`https://` secret source becomes unavailable, the system retries every 2 seconds but doesn't have a circuit breaker or max retry limit.

5. **Strict parse disabled by default**: If `-promscrape.config.strictParse=false` is set (the default), unknown YAML fields are silently ignored, which can lead to typos in config being silently ignored.

6. **Env var prefix collision**: With prefix support (`lib/envflag/envflag.go:16`), different services using the same prefixed env vars could collide if not carefully namespaced.

## Future Considerations

1. **Feature flag system**: VictoriaMetrics has no formal feature flag system. All features are controlled by command-line flags or YAML config options. A dedicated feature flag system would benefit multi-tenant deployments.

2. **Structured secret management**: No evidence of integration with Vault, Kubernetes secrets, AWS Secrets Manager, or similar centralized secret stores. Consider adding first-class support.

3. **Config change callbacks**: Currently, hot reload triggers a full scraper restart via `mustRestart()`. A callback/event system for config changes could enable more granular reactivity.

4. **Schema validation**: YAML schemas are enforced through strict unmarshaling and `checkOverflow()`, but there is no JSON Schema or structural schema validation beyond field presence.

5. **Config version tracking**: The `Checksum` field in `Group` (`app/vmalert/config/config.go:42`) tracks YAML content changes, but there is no formal version history or migration support.

## Questions / Gaps

1. **No evidence of environment-specific config profiles**: No mechanism found for loading environment-specific config files (e.g., `config.prod.yaml`, `config.dev.yaml`).

2. **No evidence of remote config store integration**: Configuration is loaded from local files or HTTP URLs, but there is no native integration with distributed config stores like etcd, Consul, or ZooKeeper.

3. **No evidence of config hot-reload metrics**: While `configReloads` counter and `configSuccess` gauge exist, there are no metrics tracking specific config fields that changed or validation errors on reload.

4. **No evidence of config encryption at rest**: Config files on disk are not encrypted. Secrets are only protected by filesystem permissions.

5. **Limited validation of dependent configs**: If config A references config B (e.g., remote write target), validation of A doesn't verify B's availability or validity.