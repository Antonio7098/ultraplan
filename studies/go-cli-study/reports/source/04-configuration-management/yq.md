# Repo Analysis: yq

## Configuration Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | yq |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/yq` |
| Group | `04-configuration-management` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

yq is a portable CLI data file processor supporting YAML, JSON, XML, and other formats. Configuration is handled exclusively through CLI flags and environment variables—no config file support exists. The `yqlib` package uses global `Configured*Preferences` variables that are mutated by the command layer during initialization. Precedence is implicit: explicit CLI flags override defaults, and environment variables are only accessible at runtime via the `env()` operator (not at startup).

## Rating

**Score: 4/10**

yq works correctly but has inconsistent and implicit precedence. There is no config file support, defaults are scattered across global vars, and immutability is not enforced.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Flag definitions | `New()` registers ~25 persistent flags bound to global vars | `cmd/root.go:92-216` |
| Global config vars | ~15 `var` declarations in `cmd/constant.go` | `cmd/constant.go:3-39` |
| Env var (runtime only) | `envOperator` reads via `os.Getenv()` | `pkg/yqlib/operator_env.go:26` |
| Env var (NO_COLOR) | `forceNoColor = forceNoColor \|\| os.Getenv("NO_COLOR") != ""` | `cmd/root.go:74` |
| Security preferences | `ConfiguredSecurityPreferences` global struct | `pkg/yqlib/security_prefs.go:9-13` |
| YAML preferences | `ConfiguredYamlPreferences` global var | `pkg/yqlib/yaml.go:40` |
| XML preferences | `ConfiguredXMLPreferences` global var | `pkg/yqlib/xml.go:46` |
| CSV preferences | `ConfiguredCsvPreferences` global var | `pkg/yqlib/csv.go:22` |
| Lua preferences | `ConfiguredLuaPreferences` global var | `pkg/yqlib/lua.go:19` |
| Init sequence | `initCommand` orchestrates validation, format config, unwrap scalar | `cmd/utils.go:18-45` |
| Validation | `validateCommandFlags` checks flag consistency | `cmd/utils.go:73-91` |
| Unwrap scalar override | `configureUnwrapScalar` checks `unwrapScalarFlag.IsExplicitlySet()` | `cmd/utils.go:156-160` |
| Backwards compat | `outputToJSON` deprecated flag forces `outputFormat = "json"` | `cmd/utils.go:66-71` |

## Answers to Protocol Questions

### 1. How are flags, env vars, and config files merged?

There is **no merging**. yq has three disjoint configuration mechanisms:

- **CLI flags**: bound directly to global variables in `cmd/constant.go`
- **Environment variables**: only accessible at runtime via the `env()` expression operator (`pkg/yqlib/operator_env.go:26`), not at startup
- **Config files**: **not supported** at all

The only environment variable that affects startup is `NO_COLOR` (`cmd/root.go:74`), which is handled specially in `PersistentPreRunE`.

### 2. What precedence rules exist?

Precedence is implicit and poorly documented. Observed order (highest to lowest):

1. Explicitly-set CLI flags (checked via `unwrapScalarFlag.IsExplicitlySet()` at `cmd/utils.go:157`)
2. Deprecated compatibility flags (e.g., `outputToJSON` forces `outputFormat = "json"` at `cmd/utils.go:69`)
3. Auto-detected defaults (file extension → format, `cmd/utils.go:113-140`)

Environment variables read via `env()` are not startup config—they are runtime expression operators, so their precedence relative to flags is undefined and not relevant to startup config.

### 3. Is config immutable after startup?

**No.** The global `Configured*Preferences` variables (`ConfiguredYamlPreferences`, `ConfiguredXMLPreferences`, etc.) are modified during command execution:

- `configureEncoder()` mutates `ConfiguredYamlPreferences.Indent`, `ConfiguredYamlPreferences.UnwrapScalar`, etc. (`cmd/utils.go:201-220`)
- `configureDecoder()` sets `ConfiguredYamlPreferences.EvaluateTogether` (`cmd/utils.go:167`)

These are package-level globals, so any concurrent or sequential command execution mutates shared state. There is no immutability enforcement.

### 4. Is validation centralized?

**Partially.** Validation is centralized in `initCommand()` (`cmd/utils.go:18-45`), which calls:

- `validateCommandFlags()` — flag consistency checks (`cmd/utils.go:73-91`)
- `configureFormats()` — input/output format validation (`cmd/utils.go:93-111`)
- `configureUnwrapScalar()` — unwrap scalar flag override check (`cmd/utils.go:156-160`)

However, validation is shallow—it checks flag compatibility (e.g., `--inplace` with stdin), but does not validate values against schema. The `Configured*Preferences` structs have no validation on mutation.

## Architectural Decisions

- **No config file support by design.** yq is intentionally stateless with respect to config files; all configuration comes from CLI invocation.
- **Global mutable preferences.** The `ConfiguredYamlPreferences`, `ConfiguredXMLPreferences`, etc. globals in `pkg/yqlib/` are the canonical runtime config, mutated by the command layer.
- **Expression-based env var access.** Environment variables are not startup configuration but are available via the `env()` and `envsubst` operators at expression time, not flag-parsing time.
- **Per-format preference structs.** Each format (YAML, XML, CSV, Lua, etc.) has its own `*Preferences` struct with defaults established via `NewDefault*()` constructors.

## Notable Patterns

- **Flag → global var → preference mutation**: CLI flags write to package-level `var` globals in `cmd/constant.go`, which are then applied to the yqlib `Configured*Preferences` structs during `configureEncoder()` / `configureDecoder()`.
- **Dual-use flag pattern**: Some flags (e.g., `--xml-*`) bind directly to `yqlib.ConfiguredXMLPreferences` fields at registration time (`cmd/root.go:121-141`), bypassing the intermediate `var` globals.
- **NoOptDefVal for boolean flags**: `unwrapScalar` flag uses `NoOptDefVal = "true"` (`cmd/root.go:179`) so `-r` without a value defaults to true.

## Tradeoffs

- **Pro**: Simple for single-command use; no config file parsing complexity.
- **Con**: No config file support limits usability for complex pipelines or project-specific defaults.
- **Con**: Global mutable state means yqlib is not safe for concurrent use with different configurations.
- **Con**: No centralized validation schema; invalid values are caught only at point of use.
- **Con**: Precedence is implicit and only fully discoverable by reading the source.

## Failure Modes / Edge Cases

- Concurrent invocations with different `--indent` or `--output-format` values will race on shared `Configured*Preferences` globals.
- The `unwrapScalarFlag.IsExplicitlySet()` pattern (`cmd/utils.go:157`) is a custom mechanism; other boolean flags use standard pflag behavior and may not override config file defaults consistently if config file support were added.
- `env()` operator returns empty string if env var is unset (unless `preferences.StringValue` is set), but does not distinguish "unset" from "empty string"—this is a runtime behavior, not a config startup issue.

## Future Considerations

- Adding a config file layer (e.g., `yq.yml`) would require a design decision on precedence (flag vs. config file) and introduce the need for immutability enforcement.
- The global `Configured*Preferences` could be replaced with a context-based configuration passing pattern to enable concurrent safe usage.
- Further validation (e.g., XML strict mode validation at startup vs. on first parse) could be centralized in `initCommand()`.

## Questions / Gaps

- **No evidence found** for any config file loading or parsing (no `viper`, `gcfg`, or custom config file logic). yq explicitly does not support config files.
- **No evidence found** for environment variable bindings at startup (beyond `NO_COLOR`). All env var access is via `env()` operator at expression evaluation time.
- **No evidence found** for validation of preference values (e.g., negative indent, invalid format name) beyond `FormatFromString()` error returns.