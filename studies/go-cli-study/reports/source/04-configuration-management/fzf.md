# Repo Analysis: fzf

## Configuration Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | fzf |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/fzf` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

fzf uses a well-structured three-tier configuration system: environment variables (`FZF_DEFAULT_OPTS_FILE`, `FZF_DEFAULT_OPTS`), then config file, then command-line flags. Precedence is clearly ordered: env file → env string → CLI args. Options are immutable after `ParseOptions()` returns. Validation is centralized in `validateOptions()` at `src/options.go:3573-3634`.

## Rating

**8/10** — Centralized configuration with well-defined layering and good precedence rules. Lacks a traditional config file format (e.g., TOML/YAML), relying instead on env var injection of options. Solid validation, but the approach requires users to manage options as shell strings rather than structured config.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Flag definitions | All CLI flags defined in `parseOptions()` switch statement | `src/options.go:2615-3459` |
| Flag parsing | `ParseOptions()` handles CLI args via `parseOptions()` | `src/options.go:3861-3926` |
| Env var handling | `FZF_DEFAULT_OPTS_FILE` and `FZF_DEFAULT_OPTS` processed in `ParseOptions()` | `src/options.go:3866-3893` |
| Default values | `defaultOptions()` initializes all option defaults | `src/options.go:715-807` |
| Precedence logic | Explicit ordering: file → env string → CLI | `src/options.go:3865-3899` |
| Validation | `validateOptions()` checks constraints after parsing | `src/options.go:3573-3634` |
| Immutability | Options struct populated once, passed to `fzf.Run()` | `src/options.go:3925` |
| Post-processing | `postProcessOptions()` modifies only initial state | `src/options.go:3664-3851` |

## Answers to Protocol Questions

### 1. How are flags, env vars, and config files merged?

All three sources are merged sequentially through `ParseOptions()` (`src/options.go:3861-3926`):

1. `$FZF_DEFAULT_OPTS_FILE` — path to a file containing options (one per line or space-separated), parsed via `parseShellWords()` at `src/options.go:3854-3858`
2. `$FZF_DEFAULT_OPTS` — shell-quoted string of options (e.g., `'--layout=reverse --info=inline'`)
3. CLI arguments — `os.Args[1:]` passed to `main()` in `main.go:54`

Each layer calls `parseOptions()` which modifies the same `*Options` struct. Last-one-wins within each layer for multi-value options.

### 2. What precedence rules exist?

Explicit ordering (line `src/options.go:3865-3899`):
```
1. FZF_DEFAULT_OPTS_FILE  (lowest)
2. FZF_DEFAULT_OPTS
3. Command-line arguments (highest)
```

No dynamic precedence switching. The ordering is fixed and documented in usage string at `src/options.go:242-245`.

### 3. Is config immutable after startup?

**Yes.** After `ParseOptions()` completes and returns `*Options`, the struct is passed to `fzf.Run()` and never modified. The `Options` struct contains only plain fields (channels, slices, maps, pointers) with no synchronization primitives. The `postProcessOptions()` function (`src/options.go:3664-3851`) runs only once before `fzf.Run()` and does not create any goroutines that could modify options.

### 4. Is validation centralized?

**Yes.** `validateOptions()` (`src/options.go:3573-3634`) is called exactly once in `ParseOptions()` at line `src/options.go:3921`. It checks:
- Display width of pointer/marker signs (`src/options.go:3574-3584`)
- Gutter display width (`src/options.go:3586-3589`)
- Scrollbar character count and width (`src/options.go:3591-3601`)
- Adaptive height compatibility with margins (`src/options.go:3603-3614`)
- ANSI color restrictions for nth highlighting (`src/options.go:3616-3618`)
- Inline border constraints (`src/options.go:3620-3631`)

Per-option validation also occurs during parsing (e.g., `parseSize()` at `src/options.go:2190-2221` returns errors for invalid values).

## Architectural Decisions

| Decision | Rationale | Evidence |
|----------|-----------|----------|
| Options as single struct | Single source of truth, easy to pass through call chain | `src/options.go:571-693` |
| Shell-word parsing for env/config | Allows users to use shell quoting behavior | `src/options.go:3854-3858` using `go-shellwords` |
| NO_COLOR respected in defaults | Standards compliance for color disable | `src/options.go:717-722` |
| Post-processing pass | Allows computed defaults after all inputs known | `src/options.go:3664-3851` |

## Notable Patterns

- **Flag with-optional-argument pattern**: `optionalNextString()` (`src/options.go:2546-2556`) handles flags that may or may not have following arguments
- **Clear/exiting opts**: `clearExitingOpts()` (`src/options.go:2519-2527`) resets mutually-exclusive flags (bash/zsh/fish/help/version)
- **Preset application**: `applyPreset()` (`src/options.go:3501-3564`) provides named configuration bundles (default, minimal, full)
- **Regexp-based arg parsing**: Flags with `=` are split at `src/options.go:2618-2622`

## Tradeoffs

| Tradeoff | Impact |
|----------|--------|
| No structured config file (TOML/YAML) | Users must manage options as shell strings via env vars; no native config file support |
| Options-as-struct means large struct | ~120 fields in `Options` (`src/options.go:571-693`), but keeps config centralized |
| Validation scattered during parse | Type/semantic validation happens both in parse functions (e.g., `parseSize`) and centralized `validateOptions()` |
| FZF_DEFAULT_COMMAND not part of config merge | Only used as input source in `reader.go:139`, not merged into Options struct |

## Failure Modes / Edge Cases

- **Empty FZF_DEFAULT_OPTS_FILE path**: Returns error (`src/options.go:3870`)
- **Malformed shell words in FZF_DEFAULT_OPTS**: `parseShellWords()` error propagated (`src/options.go:3886-3887`)
- **Unknown option in any layer**: First occurrence returns error and aborts (`src/options.go:3890`, `src/options.go:3898`)
- **Adaptive height + percent margin**: Incompatible combination caught by validation (`src/options.go:3603-3614`)
- **Unicode sign width validation**: `validateSign()` (`src/options.go:3566-3571`) fails on wide characters for pointer/marker

## Future Considerations

- Structured config file format (TOML/YAML) would enable per-project config with `fzf.config`
- Schema validation could be extended to catch conflicting options earlier
- Hot reload of `$FZF_DEFAULT_OPTS_FILE` during `--listen` mode not currently implemented

## Questions / Gaps

- No evidence found for configuration change notifications (e.g., SIGHUP to reload config)
- No evidence found for config include/extends mechanisms
- `$FZF_DEFAULT_OPTS_FILE` has no format documentation beyond being "options" — unclear if comments or blank lines allowed (though `parseShellWords()` with `ParseComment: true` at `src/options.go:3856` suggests yes)

---

Generated by `study-areas/04-configuration-management.md` against `fzf`.