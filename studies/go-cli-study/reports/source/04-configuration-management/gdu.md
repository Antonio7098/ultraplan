# Repo Analysis: gdu

## Configuration Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | gdu |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` |
| Group | `04-configuration-management` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Gdu uses a layered configuration system with three sources: YAML config files (system-wide at `/etc/gdu.yaml` and user at `~/.gdu.yaml` or `~/.config/gdu/gdu.yaml`), and command-line flags. Environment variables are not used as a general configuration source—only one hardcoded exception exists for `GDU_ALLOW_DELETE_WITH_FILTER`. The config is loaded at init time, defaults are applied after, and flag bindings overwrite config file values. Precedence is: system config → user config → defaults → flags.

## Rating

**6/10** — Works but inconsistent precedence. Flags are bound via Cobra at init before config file loading, which means flag defaults can inadvertently shadow config file values. No centralized validation exists; errors are scattered in `Run()` and log-reported.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Flag definitions | `StringVar`, `BoolVar`, `IntVar`, `StringSliceVar` bindings in `init()` | `cmd/gdu/main.go:46-112` |
| Config file loading (system) | Loads `/etc/gdu.yaml` first, skipped on Windows/Plan9 | `cmd/gdu/main.go:117,129-134` |
| Config file loading (user) | Loads user config after system config | `cmd/gdu/main.go:136-144` |
| Default config path resolution | Checks `~/.config/gdu/gdu.yaml` first, then `~/.gdu.yaml` | `cmd/gdu/main.go:184-198` |
| Defaults application | Sets color defaults after config load | `cmd/gdu/main.go:146-168` |
| Flags struct | All flags defined in `Flags` struct with `yaml:` tags | `cmd/gdu/app/app.go:52-106` |
| Time filter validation | Validates time filter in `NewTimeFilter()` | `pkg/timefilter/timefilter.go:29-75` |
| Mutually exclusive flag validation | Validates `--no-prefix`/`--si` and `--interactive`/`--non-interactive` conflicts | `cmd/gdu/app/app.go:213-219` |
| Env var override | Single env var `GDU_ALLOW_DELETE_WITH_FILTER` for delete safety | `tui/tui.go:605-607` |

## Answers to Protocol Questions

### 1. How are flags, env vars, and config files merged?

**No general env var support.** Gdu has one hardcoded env var `GDU_ALLOW_DELETE_WITH_FILTER` (`tui/tui.go:606`). All other configuration comes from two sources:

- **Config files** (YAML): loaded in `initConfig()` (`cmd/gdu/main.go:127-144`). System config at `/etc/gdu.yaml` is loaded first, then user config at `~/.gdu.yaml` or `~/.config/gdu/gdu.yaml`. User config values overwrite system config.
- **Flags**: Bound via Cobra's `flags.StringVar/BoolVar/IntVar/StringSliceVar` in `init()` (`cmd/gdu/main.go:48-112`). These bind directly to the `af` pointer.

**Critical issue**: Because flags are bound at init before config loading, and the flag binding sets the default value, the flag default can shadow config file values. For example, `--max-cores` defaults to `runtime.NumCPU()` (`cmd/gdu/main.go:53`). If the config file sets `max-cores: 1` but the user doesn't pass `--max-cores`, the flag default (`runtime.NumCPU()`) wins. The `setDefaults()` function (`cmd/gdu/main.go:146-168`) only fills in color defaults, not the general flags.

### 2. What precedence rules exist?

Precedence order (implicit, from code):
1. System config (`/etc/gdu.yaml`) — loaded first (`cmd/gdu/main.go:129-134`)
2. User config (`~/.config/gdu/gdu.yaml` or `~/.gdu.yaml`) — overwrites system config (`cmd/gdu/main.go:136-143`)
3. Code defaults (hardcoded in `Flags` struct field declarations or `setDefaults()`) — applied after config load (`cmd/gdu/main.go:146-168`)
4. Flags — should win, but flag defaults set via Cobra binding can shadow config if user doesn't pass the flag (`cmd/gdu/main.go:46-112`)

**No explicit precedence enforcement.** The code relies on load order. The `--config-file` flag is parsed from `os.Args` via regex (`cmd/gdu/main.go:170-182`) before config loading, but this is fragile.

### 3. Is config immutable after startup?

**No.** The `Flags` struct (`cmd/gdu/app/app.go:52-106`) is a plain struct with no locking or immutability guarantees. While most fields are only read after init, the struct itself is mutable. There is no defensive copying.

### 4. Is validation centralized?

**No.** There is no centralized validation function. Validation is scattered:
- Time filter validation: `NewTimeFilter()` in `pkg/timefilter/timefilter.go:29-75` returns errors for invalid time formats
- Mutual exclusivity: `app.Run()` at `cmd/gdu/app/app.go:213-219` checks `--no-prefix`+`--si` and `--interactive`+`--non-interactive`
- Config file errors: stored in `configErr` variable (`cmd/gdu/main.go:29`) and only logged at `cmd/gdu/main.go:242-244`, not treated as fatal
- Mount point loading: errors returned from `a.Getter.GetMounts()` in `cmd/gdu/app/app.go:565-568`

## Architectural Decisions

- **Config struct is public and used directly** — `Flags` struct (`cmd/gdu/app/app.go:52`) is exported, used directly by `App.Run()`, and has `yaml:` tags for serialization
- **YAML for config files** — Uses `gopkg.in/yaml.v3` for parsing (`cmd/gdu/main.go:16`), with `yaml.Unmarshal` directly into `&af` (`cmd/gdu/main.go:124`)
- **Config path resolution is stringly-typed** — Uses regex on `os.Args` string to detect `--config-file` flag (`cmd/gdu/main.go:170-182`), which is fragile
- **No environment variable abstraction** — Env vars are checked inline where needed (`tui/tui.go:606`)

## Notable Patterns

- **Regex-based flag detection for config path**: `setConfigFilePath()` (`cmd/gdu/main.go:170-182`) parses `os.Args` as a string to find `--config-file` before proper flag parsing occurs, because the config file path is needed before `loadConfig()` is called
- **Write config with `--write-config`**: The `--write-config` flag (`cmd/gdu/main.go:103`) causes the app to serialize current `af` to YAML and exit, providing a self-documenting config generation mechanism (`cmd/gdu/main.go:207-218`)
- **Style defaults applied post-load**: `setDefaults()` (`cmd/gdu/main.go:146-168`) only fills in missing color defaults, ensuring config file values for colors are preserved when set

## Tradeoffs

- **Flag binding happens at init, before config load**: Cobra flag bindings set initial values on `af`. When config files load afterward, they overwrite these values only if present in the YAML. If a flag has a non-empty default (like `max-cores`), the config file cannot override it unless the user explicitly passes the flag or the config file value wins—but since binding happens at init, the config file must set the value to win.
- **Single env var for safety**: Only one env var (`GDU_ALLOW_DELETE_WITH_FILTER`) exists, and it's for a safety override. This avoids env var sprawl but means there's no standard pattern for users who prefer env var configuration.
- **Config errors are non-fatal**: `configErr` is logged but doesn't prevent execution (`cmd/gdu/main.go:242-244`). This could lead to silent misconfiguration.

## Failure Modes / Edge Cases

- **Config file with wrong permissions**: YAML unmarshal will silently use zero values for missing fields, potentially overwriting intentional defaults
- **Invalid YAML in config file**: `yaml.Unmarshal` errors are stored in `configErr` but only logged, allowing execution to continue with unexpected state
- **Regex parsing of `--config-file` fails**: The regex `--config-file[= ]([^ ]+)` (`cmd/gdu/main.go:173`) would fail on `--config-file "path with spaces"` or `--config-file=value` with `=` immediately followed by space
- **No validation of paths in `ignore-dirs`**: Paths like `/nonexistent` are accepted without error

## Future Considerations

- Consider using Viper or similar for proper config precedence (flag > env > config > default)
- Add centralized validation function for all config options
- Consider making `Flags` immutable after initialization
- Env var support for common options (e.g., `GDU_MAX_CORES`, `GDU_IGNORE_DIRS`)

## Questions / Gaps

- No evidence of config immutability mechanisms (no `sync.Once`, no copies)
- No evidence of centralized validation for all config options
- No evidence of env var support for standard config options
- Config error handling is non-fatal, which could hide misconfiguration