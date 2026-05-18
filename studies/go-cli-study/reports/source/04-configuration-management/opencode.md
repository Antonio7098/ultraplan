# Repo Analysis: opencode

## Configuration Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | opencode |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

opencode implements a sophisticated, centralized configuration system using spf13/viper for multi-source configuration (flags, environment variables, config files) with clear precedence rules, comprehensive validation, and immutability after initialization. The system excels at provider auto-detection and defaults based on available credentials.

## Rating

**8/10** — Centralized config with good layering. The configuration system is well-architected with clear separation of concerns, but minor inconsistencies (some direct `os.Getenv` calls bypassing viper) prevent a higher score.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Flag definitions | Cobra flags: `--debug`, `--cwd`, `--prompt`, `--output-format`, `--quiet` | `cmd/root.go:292-303` |
| Viper configuration | `SetEnvPrefix("opencode")`, `AutomaticEnv()` for env binding | `internal/config/config.go:225-226` |
| Config file paths | Searches `$HOME`, `$XDG_CONFIG_HOME/opencode`, `$HOME/.config/opencode` | `internal/config/config.go:222-224` |
| Local config merge | `mergeLocalConfig()` merges working dir config last (higher precedence) | `internal/config/config.go:451-460` |
| Provider env defaults | API keys from env: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc. | `internal/config/config.go:258-285` |
| Model defaults by provider | Provider detection order: copilot → anthropic → openai → gemini → groq → openrouter → xai → bedrock → azure → vertexai | `internal/config/config.go:298-386` |
| Config validation | `Validate()` function checks agents, providers, LSP configs | `internal/config/config.go:609-641` |
| Immutability | Global `cfg` var set once in `Load()`; updates go through `updateCfgFile()` | `internal/config/config.go:123,819-863` |
| Config schema | JSON Schema defines all config fields with constraints | `opencode-schema.json:1-425` |

## Answers to Protocol Questions

### 1. How are flags, env vars, and config files merged?

The system uses **viper** as the central configuration hub with a layered merge strategy:

1. **Viper setup** (`internal/config/config.go:218-227`): Config name set to `.opencode`, type JSON, paths configured, env prefix `OPENCODE` set, `AutomaticEnv()` enables env binding.

2. **Defaults set first** (`internal/config/config.go:230-251`): Hard-coded defaults for data directory, context paths, theme, autoCompact, shell path, debug mode.

3. **Global config read** (`internal/config/config.go:144-146`): Viper reads config from search paths (`$HOME`, `$XDG_CONFIG_HOME/opencode`, `$HOME/.config/opencode`).

4. **Local config merged** (`internal/config/config.go:451-460`): A second viper instance reads `.opencode.json` from the working directory and merges its settings into the first via `viper.MergeConfigMap()`. This means **local config overrides global config**.

5. **Provider defaults from env** (`internal/config/config.go:253-386`): After config file parsing, the system checks environment variables (`ANTHROPIC_API_KEY`, etc.) and sets defaults for agents/providers if the config file didn't specify them.

6. **Final unmarshal** (`internal/config/config.go:154`): `viper.Unmarshal(cfg)` applies all gathered values to the Config struct.

### 2. What precedence rules exist?

Based on code flow in `internal/config/config.go:128-216`, the effective precedence is (highest to lowest):

1. **Local config file** (`.opencode.json` in working directory) — merged last via `mergeLocalConfig()`
2. **Global config file** (`.opencode.json` in `$HOME`, `$XDG_CONFIG_HOME/opencode`, or `~/.config/opencode`)
3. **Environment variables** — used by `setProviderDefaults()` to set defaults for API keys and model selection, but these are defaults (config file can override)
4. **Hard-coded defaults** — set via `viper.SetDefault()`

Note: There's an inconsistency — some code uses direct `os.Getenv()` instead of viper (e.g., `internal/config/config.go:163` for `OPENCODE_DEV_DEBUG`, `internal/llm/tools/shell/shell.go:75` for `SHELL`).

### 3. Is config immutable after startup?

**Yes, with caveats.** The global `cfg` variable (`internal/config/config.go:123`) is set once during `Load()` and not directly modified thereafter. However:

- Runtime updates use `updateCfgFile()` (`internal/config/config.go:819-863`) which writes changes to disk and then updates memory
- `UpdateTheme()` (`internal/config/config.go:917-930`) and `UpdateAgentModel()` (`internal/config/config.go:879-915`) follow this pattern
- The `Validate()` function (`internal/config/config.go:609-641`) runs at startup and may modify values (e.g., marking providers disabled, adjusting max tokens) before the config is considered immutable

### 4. Is validation centralized?

**Yes.** The `Validate()` function at `internal/config/config.go:609-641` is the central validation entry point called at the end of `Load()`. It validates:

- **Agent models** (`validateAgent()` at `internal/config/config.go:475-606`): Checks model exists in `SupportedModels`, provider is configured, max tokens are reasonable (≤ context window/2), reasoning effort is valid
- **Providers** (`internal/config/config.go:622-629`): Flags providers with empty API keys as disabled
- **LSP configs** (`internal/config/config.go:632-638`): Flags LSP configs with empty commands as disabled

Validation is comprehensive but implicit — invalid values are corrected rather than causing errors (e.g., unsupported models revert to defaults).

## Architectural Decisions

1. **Viper as central config hub**: All configuration flows through viper, enabling env variable binding and config file merging without custom code
2. **Provider auto-detection**: The system detects available API providers and sets sensible defaults without user configuration (`setProviderDefaults()` at `internal/config/config.go:253-386`)
3. **Hierarchical config paths**: Config searched in multiple locations with local (project) overrides
4. **Singleton pattern**: Global `cfg` var ensures config is loaded once and accessed via `Get()`
5. **Deferred validation**: Validation happens at Load() end, correcting invalid values rather than failing

## Notable Patterns

1. **Provider priority chain**: Models default based on provider availability in a specific order (copilot > anthropic > openai > ...) — see `setProviderDefaults()` lines 298-386
2. **Lazy initialization guard**: `Load()` returns existing config if already loaded (`internal/config/config.go:129-131`)
3. **Config file auto-creation**: `updateCfgFile()` creates the config file if it doesn't exist (`internal/config/config.go:827-834`)
4. **GitHub token loading**: Special handling for GitHub Copilot token from config files (`LoadGitHubToken()` at `internal/config/config.go:933-979`)
5. **AWS/Vertex credentials detection**: Separate functions check for cloud credentials (`hasAWSCredentials()` at `internal/config/config.go:390-413`, `hasVertexAICredentials()` at `internal/config/config.go:416-426`)

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| Viper for all config | Adds dependency; some edge cases in precedence handling |
| Env prefix `OPENCODE_` | All env vars must be prefixed; some code bypasses this with direct `os.Getenv` |
| Validation corrects not fails | User may not realize their config was modified |
| Provider auto-detection | Magic behavior may confuse users expecting explicit config |
| Local config merge | User may not realize local `.opencode.json` overrides global |

## Failure Modes / Edge Cases

1. **No config file**: App works with defaults; user may not realize they're using fallback values
2. **Invalid model in config**: Validation reverts to provider-default model; may not match user intent
3. **Multiple providers with API keys**: First detected provider wins (priority order fixed)
4. **Config file write permissions**: `updateCfgFile()` will fail if can't write to config file
5. **Working directory config overrides global**: Users with both may be confused about which applies

## Future Considerations

- Consider adding a `--print-config` flag to show effective configuration with source of each value
- The `OPENCODE_DEV_DEBUG` env var bypasses viper (`internal/config/config.go:163`); could be integrated
- Some tool config (like `EDITOR` in `internal/tui/components/chat/editor.go:83`) uses direct `os.Getenv`; could be unified

## Questions / Gaps

1. No evidence found of config hot-reload mechanism — config changes after startup require restart
2. No evidence found of config migration handling for schema version changes
3. The `SHELL` environment variable is read directly (`internal/llm/tools/shell/shell.go:75`) rather than through viper, inconsistent with rest of config

---

Generated by `study-areas/04-configuration-management.md` against `opencode`.