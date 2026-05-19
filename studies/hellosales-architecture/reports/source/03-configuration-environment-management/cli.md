# Source Analysis: cli

## Configuration & Environment Management

### Source Info

| Field | Value |
|-------|-------|
| Name | cli |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/cli` |
| Language / Stack | Go (github.com/cli/cli/v2) |
| Analyzed | 2026-05-19 |

## Summary

The GitHub CLI (`gh`) implements a layered configuration system that sources settings from: (1) environment variables, (2) YAML config files (`config.yml`, `hosts.yml`), and (3) encrypted keyring storage for secrets. Configuration is centrally managed through the `gh.Config` interface defined in `internal/gh/gh.go:32` with a concrete implementation in `internal/config/config.go:40`. Secrets (authentication tokens) are stored in the system keyring via `zalando/go-keyring` with a timeout wrapper in `internal/keyring/keyring.go`. The system uses the `go-gh` library (`github.com/cli/go-gh/v2/pkg/config`) for underlying config file parsing and writing. Configuration validation occurs at runtime when values are set via `gh config set` command, and the system supports config migration via a `Migration` interface.

## Rating

**7/10** — Good implementation with minor issues

The configuration system is well-architected with clear separation of concerns (interface in `internal/gh/gh.go`, implementation in `internal/config/config.go`, secrets via keyring). However, there is no hot-reload capability (config changes require restart), limited schema validation at startup (only validated when set via CLI), and no dedicated feature flag system beyond boolean config options.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Config interface definition | `gh.Config` interface with `GetOrDefault`, `Set`, `Write`, and domain-specific accessors | `internal/gh/gh.go:32-80` |
| Config implementation | `NewConfig()` reads from `ghConfig.Read()` with fallback to default config | `internal/config/config.go:40-46` |
| Default config values | Hardcoded YAML string `defaultConfigStr` with schema version and defaults | `internal/config/config.go:554-585` |
| Config options with allowed values | `Options` slice with `AllowedValues` for enum validation | `internal/config/config.go:595-700` |
| Config validation on set | `ValidateKey()` and `ValidateValue()` functions check against `Options` | `pkg/cmd/config/set/set.go:90-129` |
| Keyring wrapper | Timeout-wrapped `keyring.Set/Get/Delete` using `zalando/go-keyring` | `internal/keyring/keyring.go:22-74` |
| Auth token retrieval | `ActiveToken()` searches env vars, then keyring, with fallback | `internal/config/config.go:237-260` |
| Environment variable token | `ghauth.TokenFromEnvOrConfig()` from `go-gh` for env-based auth | `internal/config/config.go:241` |
| Config source tracking | `ConfigEntry` struct with `Value` and `Source` (`default` or `user`) | `internal/gh/gh.go:24-27` |
| Config file format | YAML files: `config.yml` for general config, `hosts.yml` for auth | `internal/config/stub.go:137` |
| Config migration | `Migration` interface with `PreVersion()`, `PostVersion()`, `Do()` | `internal/gh/gh.go:83-100` |
| Multi-account migration | `MultiAccount` migration example with version `""` to `"1"` | `internal/config/migration/multi_account.go:76-84` |
| Environment variable parsing | Multiple `os.Getenv`/`os.LookupEnv` calls for runtime env vars | `internal/ghcmd/cmd.go:352-484` |
| Factory pattern | `Factory.Config` returns `func() (gh.Config, error)` for lazy loading | `pkg/cmdutil/factory.go:36` |

## Answers to Dimension Questions

### 1. How does the system compose config from multiple sources (file, env, remote)?

The system uses a layered approach with precedence order for authentication tokens specifically. For general config values, the priority is:
1. User-provided config file values (`config.yml`, `hosts.yml`)
2. Default values (hardcoded in `defaultConfigStr` at `internal/config/config.go:554-585`)

For authentication tokens specifically (`ActiveToken()` at `internal/config/config.go:237-260`):
1. **Environment variables** first — checked via `ghauth.TokenFromEnvOrConfig()` from `go-gh`
2. **Keyring** (encrypted storage) second — via `TokenFromKeyring()` or `TokenFromKeyringForUser()`
3. Falls back gracefully with source tracking (`"env"`, `"keyring"`, `"oauth_token"`)

The config is stored in YAML format under `~/.config/gh/` (Linux) or equivalent, split into `config.yml` (general settings) and `hosts.yml` (authentication).

### 2. How are secrets managed without leaking into logs or version control?

Secrets (authentication tokens) are managed through a **keyring system** (`internal/keyring/keyring.go`):

- **Encrypted storage**: Uses `zalando/go-keyring` (OS-native keychain: Keychain on macOS, Credential Manager on Windows, libsecret on Linux)
- **Timeout wrapper**: All keyring operations have a 3-second timeout to prevent hanging (`internal/keyring/keyring.go:28-32`, `50-57`, `68-73`)
- **Service naming**: Tokens stored with service name `"gh:" + hostname` (e.g., `gh:github.com`) — see `keyringServiceName()` at `internal/config/config.go:514-516`
- **No logging of secrets**: No evidence of secret values being written to logs
- **Not in version control**: Config files (`config.yml`, `hosts.yml`) are user-specific and not committed; keyring storage is external to the repo

For fallback, tokens can be stored in `hosts.yml` as `oauth_token`, but this is clearly marked as insecure and the system prefers keyring storage when available.

### 3. Can config be changed at runtime or does it require restart?

**Config requires restart** — there is no hot-reload mechanism.

- Config is loaded eagerly at startup via `NewConfig()` (`internal/config/config.go:40-46`) which calls `ghConfig.Read(fallbackConfig())`
- The `ghConfig` from `go-gh` uses `sync.Once` for initialization (noted in test stub at `internal/config/stub.go:111-118`)
- Each command that needs config gets it via `f.Config()` factory function (`pkg/cmdutil/factory.go:36`) which may return a cached instance
- Changes made via `gh config set` take effect on next command invocation
- The comment at `pkg/cmdutil/factory.go:29-35` explicitly notes this design issue: "It would be nice if Config were just loaded once at startup and an error were returned, but this would prevent commands like 'gh version' from running"

### 4. How is config validated at startup vs lazily?

**Lazy validation only** — no schema validation at startup.

- **Startup**: No validation occurs when `NewConfig()` is called. The `ghConfig.Read()` from `go-gh` simply parses YAML.
- **On `gh config set`**: `ValidateKey()` checks if key exists in `config.Options` (`pkg/cmd/config/set/set.go:90-98`). `ValidateValue()` checks if value is in `AllowedValues` slice for that key (`pkg/cmd/config/set/set.go:108-129`).
- **Runtime accessors**: Many methods use `.Unwrap()` directly which will panic if value is missing and no default exists (e.g., `AccessibleColors()` at `internal/config/config.go:119-121`)

The `Options` slice at `internal/config/config.go:595-700` defines the schema with:
- `Key` — configuration key name
- `Description` — human-readable description  
- `DefaultValue` — fallback value
- `AllowedValues` — enum constraints (e.g., `["https", "ssh"]` for `git_protocol`)

### 5. How does the system handle missing or invalid configuration?

**Missing keys**: Uses the `Option[T]` pattern (from `github.com/cli/go-gh/pkg/option`) for graceful fallback.

- `GetOrDefault()` method (`internal/config/config.go:69-81`) returns `o.Option[ConfigEntry]` 
- If no value exists, checks `defaultFor()` which looks up in `Options` slice
- Returns `o.None[T]()` if neither user value nor default exists
- Calling code uses `.Unwrap()` or `.UnwrapOrZero()` or `.IsSome()` to handle

**Invalid keys on set**: `ValidateKey()` at `pkg/cmd/config/set/set.go:90-98` returns error for unknown keys, but only logs a warning (not blocking):
```go
warningIcon := opts.IO.ColorScheme().WarningIcon()
fmt.Fprintf(opts.IO.ErrOut, "%s warning: '%s' is not a known configuration key\n", warningIcon, opts.Key)
```

**Invalid values on set**: `ValidateValue()` returns `InvalidValueError` with `ValidValues` list, blocking the set operation.

**Migration failures**: The `MultiAccount` migration (`internal/config/migration/multi_account.go`) uses `CowardlyRefusalError` to halt migration if it cannot complete safely, preserving existing config.

## Architectural Decisions

1. **Interface/Implementation separation**: The `gh.Config` interface in `internal/gh/gh.go` defines the contract while `internal/config/config.go` provides the implementation. This allows mocking in tests via `ghmock.ConfigMock`.

2. **go-gh dependency**: The CLI delegates YAML parsing and file I/O to `github.com/cli/go-gh/v2/pkg/config`, creating a boundary between CLI logic and config mechanics. This is evident in imports like `ghConfig "github.com/cli/go-gh/v2/pkg/config"` at `internal/config/config.go:14`.

3. **Per-host configuration**: Config keys can be scoped to hosts (`hostsKey` = `"hosts"`) with fallback to global values — implemented in `get()` method at `internal/config/config.go:53-67`.

4. **Token priority chain**: Authentication uses a specific priority chain (env var → keyring → config file) documented in `AuthConfig.ActiveToken()` at `internal/config/config.go:237`.

5. **Migration versioning**: Config schema has a version (`versionKey` = `"version"` at `internal/config/config.go:37`) tracked in `config.yml`. Migrations implement `Migration` interface to transform config between versions.

## Notable Patterns

1. **Factory pattern for config access**: Commands don't hold config directly; they receive `func() (gh.Config, error)` via factory (`pkg/cmdutil/factory.go:36`), enabling lazy initialization and testability.

2. **Option type for optional values**: Uses `o.Option[T]` from go-gh's option package instead of pointer returns or error-based handling for missing values.

3. **Source tracking**: `ConfigEntry` struct tracks whether a value came from `"default"` or `"user"` source, allowing UI to indicate provenance.

4. **Test isolation with stubbing**: `NewIsolatedTestConfig()` at `internal/config/stub.go:105-129` uses `GH_CONFIG_DIR` env var and keyring mocking to isolate tests.

5. **Keyring timeout wrapper**: Custom `TimeoutError` type in `internal/keyring/keyring.go:13-19` wraps keyring operations to prevent indefinite blocking.

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| No hot-reload | Simple implementation, but requires restart for config changes |
| Keyring vs config file | Secure storage depends on OS keychain availability; fallback to plaintext if keyring fails |
| go-gh dependency | Reduces code duplication but couples CLI to go-gh's config format |
| Lazy config loading via factory | Enables `gh version` to work without config, but can cause confusing errors later |
| Warning instead of error for unknown config keys | Allows forward compatibility but silently ignores typos |
| No startup schema validation | Fast startup, but invalid config only detected when specific key is accessed |

## Failure Modes / Edge Cases

1. **Keyring unavailable**: If keyring operations timeout (3s) or fail, login falls back to storing token in plaintext `hosts.yml` (`internal/config/config.go:367-372`)

2. **Config file corruption**: YAML parse failure from `ghConfig.Read()` propagates as error; no backup or recovery mechanism observed

3. **Missing default values**: Accessor methods like `AccessibleColors()` call `.Unwrap()` which **panics** if no value or default exists — programmer error rather than user-facing error (`internal/config/config.go:119-121`)

4. **Concurrent config writes**: `ghConfig.Write()` uses go-gh's implementation; no file locking observed in cli code

5. **Environment variable override without indication**: Setting `GH_TOKEN` env var works but users may not realize config is being bypassed (noted in comments at `internal/config/config.go:317-318`)

6. **Migration failures**: `CowardlyRefusalError` halts but leaves config in partially migrated state; requires manual intervention

## Future Considerations

1. **Hot reload**: Implement file watcher to reload config on change without restart
2. **Startup validation**: Add schema validation at `NewConfig()` time to catch configuration errors early
3. **Feature flag system**: Current boolean config options (e.g., `spinner`, `prompt`) serve as feature toggles; a dedicated flag system would be more explicit
4. **Secret rotation**: No observed mechanism for rotating keyring tokens or re-encrypting
5. **Remote config**: No evidence of remote configuration store (e.g., Vault, etcd) support

## Questions / Gaps

1. **Remote config stores**: No evidence found of integration with Vault, Consul, or other remote config/secrets stores. All config is file-based or OS keyring.

2. **Feature flags as distinct concept**: No dedicated feature flag system; boolean config options serve this purpose implicitly.

3. **Config file watching**: No file watcher implementation observed for hot reload.

4. **Schema validation library**: No use of JSON Schema, CUE, or similar for config schema enforcement beyond the `Options` slice.

5. **Backup/recovery**: No config backup mechanism observed when migrations run or config is overwritten.

---

Generated by `03-configuration-environment-management.md` against `cli`.
