# Repo Analysis: go-task

## Configuration Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | go-task |
| Path | `repos/go-task` |
| Group | `go-task` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

go-task uses a layered configuration system with three tiers: CLI flags via pflag, a `taskrc` file (`.taskrc.yml`), and `Taskfile.yml` vars/env. The precedence system is consistent and well-documented: CLI flags override env vars which override taskrc config which override Taskfile defaults. Configuration is loaded in `init()` in `internal/flags/flags.go:92-178`, and validation occurs at startup via `flags.Validate()` in `internal/flags/flags.go:204-251`. The taskrc config is immutable after parsing, but Taskfile vars can be templated and merged from multiple sources.

## Rating

**8/10** — Centralized config with good layering. The system has clear precedence rules, but some complexity arises from experiment-gated flags and the two-pass flag parsing required for config-first flag resolution.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Flag definitions | All CLI flags defined via pflag in `init()` | `internal/flags/flags.go:122-178` |
| Flag validation | `Validate()` checks flag conflicts | `internal/flags/flags.go:204-251` |
| Taskrc loading | `GetConfig()` searches XDG, home, and cwd for config files | `taskrc/taskrc.go:26-96` |
| Taskrc schema | `TaskRC` struct defines all config options | `taskrc/ast/taskrc.go:12-35` |
| Env var prefix | `TASK_` prefix for all env-backed config | `internal/env/env.go:14` |
| Env var parsing | `GetTaskEnv*` functions for bool, int, duration, string, slice | `internal/env/env.go:63-125` |
| Config precedence | `getConfig<T>()` with priority: env > taskrc > fallback | `internal/flags/flags.go:314-327` |
| Taskfile vars merge | `Merge()` and `ReverseMerge()` for vars combining | `taskfile/ast/vars.go:119-163` |
| CLI vars merge | `e.Taskfile.Vars.Merge(globals, nil)` merges CLI vars first | `cmd/task/task.go:176` |
| Special vars | `ReverseMerge()` places CLI special vars first for templating | `cmd/task/task.go:183-191` |
| Dotenv loading | `readDotEnvFiles()` merges .env into Taskfile.Env | `setup.go:231-256` |

## Answers to Protocol Questions

### 1. How are flags, env vars, and config files merged?

Flags, env vars, and taskrc config are merged at startup through `getConfig<T>()` at `internal/flags/flags.go:314-327`. For each flag, the function first checks for a `TASK_*` env var, then falls back to the taskrc config field, then to a hardcoded default. For example, `--verbose` / `VERBOSE` uses:

```go
pflag.BoolVarP(&Verbose, "verbose", "v", getConfig(config, "VERBOSE", func() *bool { return config.Verbose }, false), "Enables verbose mode.")
```
(`internal/flags/flags.go:135`)

Taskfile vars are handled separately via `Merge()` at `taskfile/ast/vars.go:119-134`. CLI-provided vars like `FOO=bar` are merged via `e.Taskfile.Vars.Merge(globals, nil)` at `cmd/task/task.go:176`.

### 2. What precedence rules exist?

Precedence (highest to lowest):
1. **CLI flags** — explicitly set flags override all other sources
2. **Environment variables** (`TASK_*` prefix) — checked via `getEnvAs<T>()` in `getConfig<T>()`
3. **taskrc config** (`.taskrc.yml`, `~/.taskrc.yml`, `$XDG_CONFIG_HOME/task/taskrc.yml`)
4. **Taskfile defaults** — vars defined in `Taskfile.yml`

For color detection specifically, `cmd/task/task.go:181-195` shows: CLI flag > `TASK_COLOR` env > taskrc `Color` > `NO_COLOR` > `FORCE_COLOR`/`CI` > auto-detect.

Special CLI vars (`CLI_ARGS`, `CLI_FORCE`, `CLI_SILENT`, `CLI_VERBOSE`, `CLI_OFFLINE`, `CLI_ASSUME_YES`) are placed first in the vars order via `ReverseMerge()` at `cmd/task/task.go:183-191`, ensuring they override Taskfile-defined vars of the same name during templating.

### 3. Is config immutable after startup?

**Taskrc config is immutable** — the `TaskRC` struct at `taskrc/ast/taskrc.go:12-35` has no setters; it's parsed once and never modified.

**Taskfile vars are NOT immutable** — they are ordered maps that can be merged multiple times (`Merge()` at `taskfile/ast/vars.go:122-134`, `ReverseMerge()` at `taskfile/ast/vars.go:140-163`). The `vars.om` (ordered map) is protected by a `sync.RWMutex` (`taskfile/ast/vars.go:18`). CLI vars are explicitly merged at `cmd/task/task.go:176` after the Taskfile is read, allowing runtime override of Taskfile defaults.

**Executor options are immutable** — once `WithFlags()` at `internal/flags/flags.go:255-312` applies options to the executor, they cannot be changed.

### 4. Is validation centralized?

**Yes** — validation is centralized in `flags.Validate()` at `internal/flags/flags.go:204-251`. This function checks:
- Mutually exclusive flags (`--download` + `--offline`, `--download` + `--clear-cache`)
- `--global` + `--dir` conflict
- `--output-group-*` without `--output=group`
- `--list` + `--list-all` conflict
- `--json` requires `--list` or `--list-all`
- `--no-status` requires JSON output
- `--nested` requires JSON output
- `--cert` + `--cert-key` must be provided together

Additional validation occurs in:
- `experiments.Validate()` at `cmd/task/task.go:72-74` (warnings not errors)
- `doVersionChecks()` at `setup.go:282-316` (Taskfile schema version)
- `areTaskRequiredVarsSet()` at `task.go:154` (required vars per task)
- `areTaskRequiredVarsAllowedValuesSet()` at `task.go:193` (allowed values per task)

## Architectural Decisions

1. **Two-pass flag parsing** (`internal/flags/flags.go:92-113`) — Because taskrc config can enable experiments that add/remove flags, the code first parses only `--dir` and `--taskfile` flags to locate the config, then parses experiments, then re-parses all flags with experiment state applied.

2. **`getConfig<T>` generic accessor** (`internal/flags/flags.go:314-327`) — A single generic function handles precedence for all config types (bool, int, duration, string, string slice), avoiding repetitive code.

3. **`ReverseMerge` for special vars** (`taskfile/ast/vars.go:140-163`) — CLI-provided special vars are prepended to the vars map rather than appended, ensuring they shadow Taskfile-defined vars during template expansion without requiring the user to explicitly override them.

4. **Taskrc search hierarchy** (`taskrc/taskrc.go:26-96`) — Config files are loaded from XDG_CONFIG_HOME, HOME (if outside HOME dir), then walking upward from cwd to HOME. Child directory configs override parent configs via `slices.Reverse()` at line 74.

## Notable Patterns

- **Functional options for Reader** — `taskfile/reader.go:79-85` uses `ReaderOption` interface with `ApplyToReader()` to configure the Taskfile reader, allowing flexible composition.

- **Experiment-gated flags** — Flags like `--download`, `--offline`, `--remote-cache-dir` are only registered if the `RemoteTaskfiles` experiment is enabled (`internal/flags/flags.go:166-177`).

- **Env var with TASK_ prefix** — All environment variables for config use `TASK_` prefix (`internal/env/env.go:14`), preventing collision with other tools' env vars.

- **`Vars` as ordered map** — Uses `orderedmap.OrderedMap` with mutex protection for thread-safe ordered iteration, critical for reproducibility in task execution.

## Tradeoffs

1. **Two-pass parsing complexity** — The circular dependency between flag parsing and config file location requires double parsing of flags, increasing complexity and startup time slightly.

2. **Experiment-gated features** — Flags only exist when experiments are enabled, making CLI help context-dependent and potentially confusing for users who don't understand experiment states.

3. **Taskrc-only for global config** — Taskfile-level config (vars, env) is mutable and mergeable, but taskrc-level config is read-only after parse. There's no mechanism to set a default that taskrc could override.

4. **Mutex overhead on vars** — Every access to `Vars` (including `Get`, `Set`, `All`, `Keys`, `Values`) requires locking (`taskfile/ast/vars.go:38-96`). For high-concurrency scenarios with many tasks, this could be a bottleneck.

## Failure Modes / Edge Cases

1. **Missing taskrc directory** — If the home directory cannot be determined, `GetConfig()` silently skips home config loading (`taskrc/taskrc.go:44-58`).

2. **Permission denied walking upward** — `fsext.SearchAll()` errors are swallowed with `errors.Is(err, os.ErrPermission)` at `taskrc/taskrc.go:66-68`.

3. **Invalid env var types** — `getEnvAs<T>()` at `internal/flags/flags.go:330-355` returns zero value and false for type mismatches, silently ignoring invalid env var values instead of warning.

4. **Circular experiment dependency** — If a user sets `experiments.RemoteTaskfiles: 1` in taskrc, the `--remote-cache-dir` flag gets the fallback `env.GetTaskEnv("REMOTE_DIR")` but the `TASK_REMOTE_DIR` env var name is inconsistent with other `TASK_*` prefixed vars (`internal/flags/flags.go:173`).

## Future Considerations

1. **Env var naming inconsistency** — Some taskrc fields use `TASK_*` env vars (e.g., `TASK_VERBOSE`, `TASK_SILENT`) but remote cache dir uses `REMOTE_DIR` without `TASK_` prefix at `internal/flags/flags.go:173`. This should be normalized.

2. **Validation error messaging** — `flags.Validate()` returns generic errors. Consider adding which config source triggered the validation failure.

3. **Immutable taskrc option** — Currently taskrc has no way to declare itself immutable or restrict certain fields from being overridden by CLI flags.

## Questions / Gaps

1. **No evidence found** for centralized schema validation of taskrc files beyond existence check. The `TaskRC` struct at `taskrc/ast/taskrc.go:12-35` has typed fields but no custom validation logic.

2. **No evidence found** for runtime config hot-reload when taskrc or Taskfile changes during watch mode. Configuration is loaded once at startup.

3. **Unclear precedence** for when a Taskfile var and a taskrc field address the same setting (e.g., both Taskfile and taskrc define `version`). The taskrc only applies to CLI behavior, not Taskfile schema interpretation.

---

Generated by `study-areas/04-configuration-management.md` against `go-task`.