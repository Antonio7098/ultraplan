# Source Analysis: nats-server

## Configuration & Environment Management

### Source Info

| Field | Value |
|-------|-------|
| Name | nats-server |
| Path | `sources/nats-server` |
| Language / Stack | Go |
| Analyzed | 2026-05-19 |

## Summary

The nats-server implements a comprehensive configuration management system with multiple composition sources (config file, environment variables via `$VAR` syntax, include directives, CLI flags), hot-reload capability for many options, and thorough validation. Configuration flows through a custom lexer/parser (`conf/` package) into typed `Options` structs with field-level validation and error reporting. Secrets are stored in config as plaintext bcrypt-hashed passwords or nkeys but are not explicitly protected beyond file permissions. Feature flags use a map-overrides-default pattern. Hot-reload is supported for many but not all options via the `option` interface pattern in `reload.go`.

## Rating

**8/10** — Good implementation with minor issues. Multi-source composition works well, hot-reload is extensive but incomplete for some critical options, and secrets management relies on file permissions without additional encryption-at-rest or Vault integration.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Config struct | `Options` struct with ~190 fields | `server/opts.go:397` |
| Config parsing | Custom lexer/parser for `.conf` format | `conf/lex.go:1`, `conf/parse.go:1` |
| Env var support | `$VAR` syntax in config values | `conf/parse.go:383-398` |
| Include directive | `include 'file.conf'` support | `conf/lex.go:483`, `conf/parse.go:419` |
| CLI override | `MergeOptions()` merges file + CLI flags | `server/opts.go:5827-5909` |
| Hot-reload | `Server.Reload()` + `ReloadOptions()` | `server/reload.go:1396-1485` |
| Option interface | `option` interface with `Apply()` and change type methods | `server/reload.go:42-74` |
| Validation | `validateOptions()` with 10+ sub-validators | `server/server.go:1137-1183` |
| Feature flags | `featureFlags` map + `getFeatureFlag()` method | `server/feature_flags.go:27-62` |
| Config file check | `config_check_test.go` tests unknown/unsupported fields | `server/config_check_test.go:23` |
| Error types | `configErr`, `unknownConfigFieldErr`, `processConfigErr` | `server/opts.go:991-1008` |
| Secrets in config | `password` field in `User` struct (bcrypt) | `server/auth.go:72-81` |

## Answers to Dimension Questions

### 1. How does the system compose config from multiple sources (file, env, remote)?

Configuration is composed from multiple sources in a specific order:

1. **Config file** is parsed via `conf.ParseFile()` into a `map[string]any` (`server/opts.go:1054`)
2. **Environment variables** are resolved via `$VAR` syntax through `lookupVariable()` which checks environment after exhausting config file scopes (`conf/parse.go:448-484`)
3. **Include directives** (`include 'file.conf'`) are resolved recursively during parsing (`conf/lex.go:558`, `conf/parse.go:419`)
4. **CLI flags** override file config via `MergeOptions(fileOpts, flagOpts)` (`server/opts.go:5827-5909`)
5. **Baseline defaults** are applied via `setBaselineOptions()` (`server/opts.go:5936`)

The precedence is: CLI flags > environment variables > config file > defaults.

### 2. How are secrets managed without leaking into logs or version control?

Passwords are stored as bcrypt-hashed strings in config files. The special prefix `2a$` (bcrypt identifier) is recognized and preserved as-is rather than being resolved as a variable reference (`conf/parse.go:449-452`).

**No evidence found** for:
- Encryption at rest for secrets in config files
- Integration with Vault, Kubernetes secrets, or cloud KMS
- Secret masking in logs — passwords appear in memory as strings
- `.gitignore` patterns specifically for `*password*` or `*secret*` files

The system relies on OS-level file permissions (`chmod 600`) to protect config files containing secrets.

### 3. Can config be changed at runtime or does it require restart?

**Hot-reload is supported** for many options but not all.

`Server.Reload()` (`server/reload.go:1396`) re-reads the config file and calls `ReloadOptions()`. The `diffOptions()` method (`server/reload.go:1581`) identifies changed options and returns an error for unsupported changes. Options that support hot-swap implement the `option` interface (`server/reload.go:42-74`).

**Supported for hot-reload**: debug, trace, log settings, TLS certificates, authorization users/permissions, cluster settings, max connections, etc.

**NOT supported for hot-reload** (returns error at `server/reload.go:1972-1974`): store_dir, jetstream memory/store limits, trusted operators/keys.

### 4. How is config validated at startup vs lazily?

**Startup validation**: `validateOptions()` (`server/server.go:1137-1183`) is called during server initialization (`server/server.go:725`) and before any reload (`server/reload.go:1525`). It performs:
- Lame duck grace period vs duration check
- Max payload vs max pending relationship
- Server name whitespace validation
- Trust configuration (`validateTrustedOperators`)
- Leaf node + gateway compatibility
- Authentication configuration
- Gateway, MQTT, JetStream, Websocket options

**Lazy validation**: Config values are validated as they are parsed in `processConfigFileLine()` with immediate error collection (`server/opts.go:1122-1125`). Type assertions and range checks happen during parsing (e.g., `server/opts.go:1131` for listen address, `server/opts.go:1143` for server name spaces).

### 5. How does the system handle missing or invalid configuration?

- **Unknown fields**: By default, an error is returned for unknown top-level fields. `NoErrOnUnknownFields(true)` can disable this (`server/opts.go:45-57`). Test at `server/config_check_test.go:23`.

- **Missing required fields**: No explicit "required" field mechanism found. Defaults are applied by `setBaselineOptions()` (`server/opts.go:5936`). For example, port defaults to `4222` if not specified (`server/opts.go:5945`).

- **Invalid values**: Errors are collected in a list with line/position information. `configErr` struct includes token position (`server/opts.go:991`). `processConfigErr` bundles errors + warnings together (`server/opts.go:1112-1117`).

- **Empty config**: Warning generated: `"config has no values or is empty"` (`server/opts.go:1084`).

## Architectural Decisions

1. **Custom lexer/parser instead of JSON/YAML/TOML**: The `conf/` package implements a custom config format that supports `#` and `//` comments, `=`/`:`/whitespace separators, nested arrays/maps, and `$VAR` environment variable substitution (`conf/lex.go:19-24`). This provides better human readability than JSON while retaining parsing simplicity.

2. **Option interface for hot-reload**: Every hot-swappable option implements `Apply(server)`, `IsLoggingChange()`, `IsAuthChange()`, etc. This allows granular control over what happens when each option changes (`server/reload.go:42-74`).

3. **Struct field reflection for diffing**: `diffOptions()` uses `reflect` to iterate over all exported fields of `Options` and compare values (`server/reload.go:1598-1640`). Unknown changes cause reload failure.

4. **Error aggregation**: All parse errors and warnings are collected before being returned, allowing users to fix multiple issues in one pass (`server/opts.go:1080-1117`).

5. **Bcrypt prefix special-casing**: The `2a$` bcrypt prefix is treated specially in variable lookup to prevent env var expansion of passwords (`conf/parse.go:449-452`).

## Notable Patterns

1. **Feature flag pattern** (`server/feature_flags.go:27-77`): Global defaults in a package-level map, user overrides in `Options.FeatureFlags`, merged on read via `getMergedFeatureFlags()`. Supports opt-in and opt-out of disabled-by-default features.

2. **Token-based error reporting**: Every parsed value carries source location (file, line, position) through the `token` interface (`server/opts.go:958-965`), enabling precise error messages.

3. **Include file isolation**: Included files share the parser context for variable resolution but have independent scoping for block-local variables.

4. **Pedantic mode**: `ParseWithChecks()` enables strict field validation that tracks which variables were actually used vs referenced, useful for catching typos.

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| Custom config format | Human-friendly but requires custom parser; not interchangeable with standard formats |
| Hot-reload via reflection | Automatic diff detection but misses some unsupported changes; relies on `default` case to fail |
| Bcrypt in config | No external secret store needed; secrets still on disk in bcrypt form |
| Error aggregation | User sees all issues at once but must parse potentially long error lists |
| No required fields | Flexible but allows misconfiguration that fails later at runtime |

## Failure Modes / Edge Cases

1. **Cycle detection for `$VAR`**: If env var A references env var B references A, `lookupVariable()` detects the cycle via `envVarReferences` map and returns error (`conf/parse.go:467-471`).

2. **TLS cert hot-reload without restart**: When TLS certs change, existing connections are not forcibly closed but new connections use new certs. Clients with pinned certs are disconnected (`server/reload.go:1343-1359`).

3. **JetStream limits cannot change at runtime**: Changing `max_memory_store` or `max_file_store` after startup returns error (`server/reload.go:1980-1985`).

4. **Store dir change requires restart**: Config reload detects this and errors (`server/reload.go:1983-1985`).

5. **Cluster name change not hot-swappable**: Changing cluster name returns error from `diffOptions()` default case.

6. **Pedantic mode catches typos**: If `max_connections` is misspelled as `max_connection`, pedantic mode (`ParseWithChecks`) returns unknown field error.

## Future Considerations

1. **Vault/consul integration**: No current evidence of external secret store integration. Future work could add `password: $VAULT_SECRET` to fetch from Vault.

2. **Structured config validation via schema**: Currently validation is scattered across `processConfigFileLine()` and `validateOptions()`. A JSON schema or Go struct tag validation could centralize this.

3. **Granular reload for all options**: The `diffOptions()` default case fails on any unknown change. A decision record is needed for which remaining options (if any) could support hot-reload.

4. **Config hot-reload via signal**: The current reload requires calling `Server.Reload()` programmatically or via SIGUSR1 (`server/signal.go`), but there's no CLI command to trigger reload remotely.

## Questions / Gaps

1. **No evidence found** for runtime config validation after startup for things like TLS cert expiry (beyond OCSP stapling). Periodic re-validation could be added.

2. **No evidence found** for configuration diff output on reload (like `git diff`). Users see only "reloaded" in logs, making it hard to audit what changed.

3. **No evidence found** for multi-tenant or per-account configuration overrides beyond the multi-account `Accounts` block. A hierarchical config (server > account > user) is not implemented.

4. **No evidence found** for config version history or rollback capability. If a bad config is reloaded, the previous working config is not preserved on disk.

5. **Unknown if config file locking** is used to prevent concurrent reads during reload. This could be a race condition if multiple reload signals arrive simultaneously.

---

Generated by `dimensions/03-configuration-environment-management.md` against `nats-server`.