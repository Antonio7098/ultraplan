# Configuration Management - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Protocol | `study-areas/04-configuration-management.md` |
| Groups | go-cli-study |
| Date | 2026-05-15 |

## Repositories Studied

| # | Repo | Path | Group |
|---|------|------|-------|
| 1 | age | `repos/age` | go-cli-study |
| 2 | chezmoi | `repos/chezmoi` | go-cli-study |
| 3 | dive | `repos/dive` | go-cli-study |
| 4 | fzf | `repos/fzf` | go-cli-study |
| 5 | gdu | `repos/gdu` | go-cli-study |
| 6 | gh-cli | `repos/gh-cli` | go-cli-study |
| 7 | go-task | `repos/go-task` | go-cli-study |
| 8 | helm | `repos/helm` | go-cli-study |
| 9 | k9s | `repos/k9s` | go-cli-study |
| 10 | lazygit | `repos/lazygit` | go-cli-study |
| 11 | mitchellh-cli | `repos/mitchellh-cli` | go-cli-study |
| 12 | opencode | `repos/opencode` | go-cli-study |
| 13 | rclone | `repos/rclone` | go-cli-study |
| 14 | restic | `repos/restic` | go-cli-study |
| 15 | urfave-cli | `repos/urfave-cli` | go-cli-study |
| 16 | yq | `repos/yq` | go-cli-study |

## Executive Summary

Configuration management across elite Go CLIs falls into three tiers: flags, environment variables, and config files. Precedence is the dominant concern—most issues arise when precedence is implicit, inconsistent, or poorly documented. Eight of sixteen repos achieve ratings of 8/10, indicating that layered configuration with clear precedence is a solved problem for Go CLIs. The remaining repos split between minimal approaches (age, mitchellh-cli, yq) that intentionally reject config files, and mid-tier repos (gdu, k9s, urfave-cli) with solid foundations but specific gaps.

## Core Thesis

Elite Go CLI projects converge on a three-tier configuration model (flags, env vars, config files) with an explicit, consistently-applied precedence hierarchy. The primary differentiator is not whether to use layered config, but how defaults are established, where validation occurs, and whether config is immutable after initialization. Projects that score lower do so not from complexity but from inconsistency or incompleteness in their precedence logic.

## Rating Summary

| Repo | Score | Approach | Main Strength | Main Concern |
|------|-------|----------|---------------|--------------|
| age | 3 | Minimal flags-only | Simplicity, no config sprawl | No layered precedence, no validation |
| chezmoi | 8 | XDG + multi-format config + flag restore | Clear precedence, template support, multi-format | Flag-restore mechanism is intricate |
| dive | 8 | clio framework + PostLoad validation | Self-validating option structs | Incomplete env var coverage |
| fzf | 8 | Env-file + env-string + CLI args | Explicit fixed ordering, centralized validation | No structured config file format |
| gdu | 6 | YAML config + Cobra flags | Write-config self-documents options | Flag defaults shadow config values |
| gh-cli | 8 | go-gh + Factory pattern | Clear layering, host-scoped config | Eager config loading, ad-hoc env handling |
| go-task | 8 | taskrc + pflag + env prefix | Two-pass parsing for experiments, generic accessor | Experiment-gated flags add complexity |
| helm | 8 | EnvSettings + value file merging | Recursive map merge for values, env-first design | No global config file, scattered validation |
| k9s | 7 | JSON schema + manual override fields | Hot-reload, context-specific configs | manual* fields add complexity |
| lazygit | 8 | flaggy + migrations + hot-reload | Config migrations, XDG compliance | Env vars not fully integrated into precedence |
| mitchellh-cli | 4 | Flags-only dispatch | Minimal design | No env vars, no config files, no validation |
| opencode | 8 | Viper + local/global config merge | Provider auto-detection, schema validation | Direct os.Getenv bypasses viper in some places |
| rclone | 8 | configmap.Map with priorities | Priority-based getters, context-local config | High complexity, lazy loading |
| restic | 8 | Global options + ApplyEnvironmenter | Flag.Changed tracking, backend-specific env | No dedicated config file format |
| urfave-cli | 7 | ValueSourceChain abstraction | Clean separation of concerns | No built-in config file parsing |
| yq | 4 | Flags-only + runtime env() | Simple for single commands | Global mutable state, no config file support |

## Approach Models

### Tier 1: Explicit Three-Layer Systems (8 repos rated 8/10)

**chezmoi, dive, fzf, gh-cli, go-task, helm, lazygit, rclone, restic, opencode**

These repos implement flags + env vars + config files with clearly documented precedence. Common characteristics:

1. **Centralized config struct or package** that holds all configuration
2. **Explicit precedence functions** that iterate sources in order
3. **Validation at a defined point** (usually after all sources merged)
4. **Immutability after initialization** enforced through architecture

**Example pattern** (chezmoi's flag-restore at `internal/cmd/config.go:2253-2287`):
```go
// 1. Save CLI flags to changedFlags map
// 2. Load config file (overwrites defaults)
// 3. Restore CLI flags, overriding config file values
```

### Tier 2: Two-Layer Systems (3 repos: gdu 6/10, k9s 7/10, urfave-cli 7/10)

These have solid foundations but specific gaps:

- **gdu**: Config file + flags but flag defaults set via Cobra binding shadow config values
- **k9s**: Excellent layering but `manual*` fields complicate precedence logic
- **urfave-cli**: Clean abstraction but no built-in config file parsing

### Tier 3: Intentional Minimals (3 repos: age 3/10, mitchellh-cli 4/10, yq 4/10)

These intentionally reject layered config for simplicity:

- **age**: Explicit "no config options" philosophy (`README.md:15`)
- **mitchellh-cli**: Thin dispatch library, config intentionally out of scope
- **yq**: Stateless processor, all config via CLI invocation

### Tier 4: Framework Itself (1 repo: urfave-cli 7/10)

urfave-cli is a library, not an application. Its ValueSourceChain is the most elegant abstraction but intentionally defers config file format to users.

## Pattern Catalog

### Pattern 1: Flag-Then-Config-Then-Restore

**What**: Save CLI flags before config load, restore them after. This ensures CLI flags always win over config files.

**Repos**: chezmoi (`internal/cmd/config.go:2253-2287`), opencode (`internal/config/config.go:218-227`)

**Why it works**: The Go `flag` package doesn't natively support config file integration. This workaround ensures explicit user input (CLI) always takes precedence over stored preferences (config).

**When to copy**: When using standard `flag` package with a config file layer.

**When overkill**: When using Viper or similar that handles precedence natively.

### Pattern 2: Generic Config Accessor with Precedence

**What**: A single generic function handles precedence for all config types.

**Repos**: go-task (`internal/flags/flags.go:314-327`), rclone (`fs/configmap/configmap.go:14-22`)

```go
func getConfig[T](config, "ENV_VAR_NAME", func() *T { return config.Field }, defaultValue) *T
```

**Why it works**: Eliminates repetitive precedence logic for each field. One place to reason about precedence.

**When to copy**: When config struct has many fields with identical precedence needs.

### Pattern 3: PostLoad Validation Hook

**What**: Each config struct implements a `PostLoad()` or `PostParse()` method called after all sources merged.

**Repos**: dive (`cmd/dive/cli/internal/options/analysis.go:48-53`), urfave-cli (`flag_impl.go:128-149`)

**Why it works**: Validation runs after all config sources are combined, catching invalid combinations that single-source validation cannot.

**When to copy**: When config structs are self-describing and validation is domain-specific per struct.

### Pattern 4: Environment Variable Prefix Convention

**What**: All config-related env vars use a consistent prefix (e.g., `TASK_*`, `FZF_*`, `HELM_*`).

**Repos**: go-task (`internal/env/env.go:14`), fzf (`src/options.go:3866`), helm (`pkg/cli/environment.go:97-149`)

**Why it works**: Prevents collision with other tools' env vars. Makes auto-completion and documentation clearer.

**When to copy**: Always.

### Pattern 5: Manual Override Fields for CLI Persistence

**What**: Track CLI-driven changes in separate `manual*` fields that take precedence over config file values.

**Repos**: k9s (`internal/config/k9s.go:317-337`)

```go
if k9sFlags.RefreshRate != nil && *k9sFlags.RefreshRate != DefaultRefreshRate {
    k.manualRefreshRate = float32(*k9sFlags.RefreshRate)
}
```

**Why it works**: Distinguishes "user set via CLI" from "user set via config file" without modifying the original config.

**When to copy**: When CLI flags should persist for session duration even if config file changes.

**Risk**: Adds complexity to config struct. Consider if the session-persistence behavior is actually needed.

### Pattern 6: Config File Template with Migration

**What**: Support config file regeneration from template plus automatic migration of old config keys.

**Repos**: chezmoi (`internal/cmd/config.go:865-936`, `internal/cmd/config.go:256-330`)

**Why it works**: Reduces friction for users upgrading across versions. Migration layer decouples schema changes from user experience.

**When to copy**: For long-lived CLIs with complex configuration that users may not touch for months.

### Pattern 7: Provider Auto-Detection from Credentials

**What**: Check available API credentials and set sensible defaults without explicit config.

**Repos**: opencode (`internal/config/config.go:253-386`)

**Why it works**: Zero-configuration setup for most users. Only shows advanced options when defaults are insufficient.

**When to copy**: For tools that integrate with multiple external services.

## Key Differences

### Config File Format

| Format | Repos |
|--------|-------|
| YAML | chezmoi, dive, gdu, k9s, lazygit, helm |
| JSON | opencode |
| TOML | (none directly; age uses identity files) |
| INI | rclone |
| Multi-format | chezmoi (TOML/YAML/JSON auto-detection) |
| None | age, mitchellh-cli, yq, restic (flags/env only) |

### Immutability After Startup

| Immutability | Repos |
|--------------|-------|
| Enforced | chezmoi, dive, fzf, helm, lazygit, opencode, rclone, restic, urfave-cli |
| Partial/mutable | gh-cli, go-task, k9s, gdu |
| None | age, mitchellh-cli, yq |

### Validation Centralization

| Validation | Repos |
|------------|-------|
| Centralized single function | chezmoi (`validateOptions()` at `src/options.go:3573-3634`), k9s (`K9s.Validate()` at `internal/config/k9s.go:423-451`), opencode (`Validate()` at `internal/config/config.go:609-641`) |
| Distributed with hook | dive (PostLoad per struct), urfave-cli (Validator per flag) |
| Scattered | age, gdu, helm, mitchellh-cli, yq |

### Hot Reload

Only k9s (`internal/ui/config.go:134-190`) and lazygit (`pkg/config/app_config.go:559-581`) implement runtime config file watching. Most CLIs treat config as immutable after startup.

## Tradeoffs

### Config File Support vs. Simplicity

**Tradeoff**: Config files enable persistent preferences but add parsing, migration, and precedence complexity.

| Decision | Benefit | Cost |
|----------|---------|------|
| Add config file support (chezmoi, k9s, lazygit, opencode) | Persistent user preferences, project-level overrides | Config file parsing, schema validation, migration support |
| Flags + env vars only (age, restic, yq) | Simpler code, no config file management | Repetitive CLI arguments, no persistent preferences |

**Best-fit**: User-facing tools that benefit from personalization (lazygit, k9s, gh-cli). Stateless tools or those designed for scripting (yq, age, restic).

### Centralized vs. Distributed Validation

| Approach | Benefit | Cost |
|----------|---------|------|
| Centralized (k9s, opencode) | Single place to understand validation rules | May require cross-field validation logic |
| Distributed (dive, urfave-cli) | Self-contained config units | Validation logic spread across files |

### Explicit vs. Implicit Precedence

| Approach | Benefit | Cost |
|----------|---------|------|
| Explicit ordering (chezmoi, fzf, go-task) | Easy to reason about, self-documenting | Requires careful implementation |
| Priority system (rclone, urfave-cli) | Extensible, flexible | Less obvious than fixed ordering |

## Decision Guide

**Q: Should I add config file support?**

- Yes, if: Tool has >5 configuration options, users benefit from persistence, tool is used interactively
- No, if: Tool is stateless (yq), designed for piping (age), or intentionally minimal (mitchellh-cli)

**Q: What precedence should I implement?**

The consensus across 8/10-rated repos: **CLI flags > env vars > config file > defaults**

Deviation from this requires explicit documentation. fzf is the exception with env file < env string < CLI, which works because its "config file" is actually a shell-words file (not structured config).

**Q: Centralized or distributed validation?**

Centralized is preferred for catching cross-field issues (e.g., `--output=json` requires `--list`). Distributed works when config units are independent (dive's Analysis, CI, UI are truly separate).

**Q: Immutable or mutable after startup?**

Immutable is simpler to reason about but prevents runtime config updates. k9s and lazygit demonstrate that hot-reload is valuable for long-running TUI applications. For one-shot CLI invocations, immutability is the right default.

## Practical Tips

1. **Use a config struct, not global vars** — Makes testing easier and precedence logic clearer (see `gh-cli/internal/config/config.go:49-51`)

2. **Track whether flags were explicitly set** — Use pflag's `Changed` or custom tracking to distinguish "user passed `--flag`" from "flag has default value" (see restic at `internal/global/global.go:139,147`)

3. **Validate after merge, not during** — Collect all sources first, then validate the merged result (see k9s `K9s.Validate()` at `internal/config/k9s.go:423-451`)

4. **Document precedence in --help output** — Users shouldn't need to read source to understand what wins (see helm's documented precedence at `pkg/cmd/install.go:79-97`)

5. **Use env var prefix** — Prevents collision: `TASK_*`, `FZF_*`, `HELM_*`, `OPENCODE_*`

6. **XDG compliance for config file location** — Check `XDG_CONFIG_HOME` first, then `~/.config/<appname>` (see chezmoi at `internal/cmd/config.go:981-1034`)

7. **Provide --write-config** — Self-documents config format and defaults (see gdu at `cmd/gdu/main.go:103,207-218`)

## Anti-Patterns / Caution Signs

1. **Flag defaults set via binding shadow config file** — When Cobra's `StringVar` binds at init before config loads, the binding's default can win over config file. gdu suffers this at `cmd/gdu/main.go:46-112`.

2. **Direct os.Getenv bypassing config layer** — When some code uses viper and other code uses `os.Getenv`, precedence becomes unpredictable. opencode has this issue at `internal/config/config.go:163`.

3. **Silent config error handling** — gdu's `configErr` is logged but doesn't prevent execution (`cmd/gdu/main.go:242-244`), allowing silent misconfiguration.

4. **Empty env var treated as "not set"** — urfave-cli's `PostParse()` checks non-empty (`flag_impl.go:133`), so `FOO=` sets value. This may surprise users.

5. **Mutable global config state** — yq's `ConfiguredYamlPreferences` globals (`pkg/yqlib/yaml.go:40`) are modified during execution, making concurrent use unsafe.

6. **No validation of config file values** — Some repos (gdu, yq) don't validate config file contents against schema, allowing silent misconfiguration.

7. **Two-pass parsing complexity** — go-task's experiment-gated flags require parsing `--dir` and `--taskfile` first, then re-parsing with experiments enabled (`internal/flags/flags.go:92-113`). This is powerful but adds startup complexity.

## Notable Absences

1. **No repo implements SIGHUP config reload** — Even rclone's `vfs/sighup.go` is a stub on non-Unix platforms. k9s and lazygit use fsnotify instead.

2. **No repo implements config file includes/imports** — chezmoi mentioned this as a future consideration. All multi-file config is handled via directory merging (k9s context dirs) or separate loading (lazygit repo-level config).

3. **No centralized schema validation for config files** — k9s uses JSON schema (`internal/config/json/validator.go:1-187`) but most repos rely on struct unmarshaling with no schema enforcement.

4. **No formal config versioning** — Most repos have no `config_version` field. chezmoi handles this via migrations but others may break on schema changes.

5. **XDG_CONFIG_DIRS rarely fully implemented** — Most repos check `XDG_CONFIG_HOME` but not `XDG_CONFIG_DIRS` for multiple config file locations.

## Per-Repo Notes

| Repo | Key Insight |
|------|-------------|
| **age** | Intentional design choice—encryption tools should have minimal attack surface. No config file is a feature, not a gap. |
| **chezmoi** | Flag-restore mechanism is the correct way to handle spf13/pflag + config file precedence. Complex but works. |
| **dive** | PostLoad pattern scales well—each option struct owns its validation. Easy to add new options. |
| **fzf** | Shell-words parsing for config is clever but means no structured config format. Works because fzf's options are all strings. |
| **gdu** | The `--write-config` flag is underused—it's the best way to self-document config format. |
| **gh-cli** | Factory pattern for config loading is clean but eager loading causes issues for `gh version`. |
| **go-task** | `getConfig<T>` generic is the cleanest precedence implementation in the study. |
| **helm** | `EnvSettings` as single struct for all env-derived config is excellent architecture. |
| **k9s** | Hot-reload via fsnotify is the right answer for TUI apps. `manual*` fields solve CLI persistence correctly. |
| **lazygit** | Config migrations as first-class concept is underappreciated. Reduces upgrade friction significantly. |
| **mitchellh-cli** | Minimalism is a valid design goal for a library. Intentionally out of scope. |
| **opencode** | Provider auto-detection is the future—credentials exist, tool should use them without config. |
| **rclone** | Priority-based configmap is the most extensible pattern. Higher complexity pays off for complex backends. |
| **restic** | No config file is a deliberate choice. Works because `--repository-file` covers the main use case. |
| **urfave-cli** | ValueSourceChain is the best abstraction for config precedence. Worth studying even if not using the library. |
| **yq** | Global mutable state is the real problem, not missing config file. Would be 8/10 with context-based config. |

## Open Questions

1. **Should CLI flags persist for session duration?** k9s says yes (manual* fields). Most others say no (config loaded once). The answer depends on tool type—TUI vs. one-shot invocation.

2. **When should validation fail vs. correct?** opencode corrects invalid values. k9s fails validation. chezmoi fails on invalid config. No consensus on best UX.

3. **Is hot-reload worth the complexity?** k9s and lazygit implement it. Others don't. For long-running tools it matters; for one-shot invocations it's irrelevant.

4. **Should env vars be able to disable config file options?** For example, `NO_COLOR=true` overriding a config file's `color: true`. Only helm and fzf handle this explicitly. Most repos don't address this interaction.

## Evidence Index

- `chezmoi/internal/cmd/config.go:2253-2287` — Flag save-restore precedence
- `dive/cmd/dive/cli/internal/options/analysis.go:48-53` — PostLoad validation
- `fzf/src/options.go:3865-3899` — Explicit precedence ordering
- `go-task/internal/flags/flags.go:314-327` — Generic getConfig accessor
- `helm/pkg/cli/environment.go:97-149` — EnvSettings loading
- `k9s/internal/config/k9s.go:317-337` — Manual override fields
- `k9s/internal/config/json/validator.go:1-187` — JSON schema validation
- `lazygit/pkg/config/app_config.go:256-330` — Config migrations
- `opencode/internal/config/config.go:609-641` — Centralized validation
- `rclone/fs/config/configmap/configmap.go:14-22` — Priority-based configmap
- `restic/internal/global/global.go:139,147` — Flag.Changed tracking
- `urfave-cli/value_source.go:94-102` — ValueSourceChain first-match lookup

---

Generated by protocol `study-areas/04-configuration-management.md`.