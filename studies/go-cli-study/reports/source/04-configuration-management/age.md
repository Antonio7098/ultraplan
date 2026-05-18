# Repo Analysis: age

## Configuration Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | age |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/age` |
| Group | `04-configuration-management` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Age is a minimalist encryption tool with **deliberately no configuration file system**. Configuration comes only from command-line flags. Environment variables are used exclusively by the optional `age-plugin-batchpass` plugin for passphrase-based encryption. There is no config merging, no precedence layers, and no centralized validation—each plugin or command handles its own flags independently.

## Rating

**3/10** — Config is minimal and intentionally so, but this falls in the "scattered randomly" band. The design philosophy (no config files) is explicit, yet it means no layered precedence or validation system exists. This is a conscious trade-off, not a flaw.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Flag definitions | Standard Go `flag` package in `cmd/age/age.go:105-140` | `cmd/age/age.go:105-140` |
| Flag definitions | Standard Go `flag` package in `cmd/age-keygen/keygen.go:63-75` | `cmd/age-keygen/keygen.go:63-75` |
| Environment vars | `AGE_PASSPHRASE`, `AGE_PASSPHRASE_FD`, `AGE_PASSPHRASE_WORK_FACTOR`, `AGE_PASSPHRASE_MAX_WORK_FACTOR` in plugin-batchpass | `cmd/age-plugin-batchpass/plugin-batchpass.go:113-134` |
| Debug env var | `AGEDEBUG=plugin` controls debug logging | `plugin/client.go:454` |
| No config files | Explicit philosophy: "no config options" | `README.md:15` |
| No config files | Design doc confirms config-free intent | `age.go:23` |

## Answers to Protocol Questions

### 1. How are flags, env vars, and config files merged?

**They are not merged at all.** Age does not use config files. Flags are parsed via Go's standard `flag` package. Environment variables are only consulted by the optional `age-plugin-batchpass` plugin (`cmd/age-plugin-batchpass/plugin-batchpass.go:183-213`), and only for passphrase-related settings. There is no mechanism to merge multiple sources.

### 2. What precedence rules exist?

**No precedence rules exist** because there is no layering. Each command (age, age-keygen) processes only its own flags. The plugin batchpass reads env vars directly at time of use. There is no concept of defaults being overridden by env vars or flags in a predictable order—because no such system exists.

### 3. Is config immutable after startup?

**Yes**—in the sense that there is no runtime config to mutate. Flags are parsed once in `main()` at `cmd/age/age.go:140`, and no configuration data structure persists beyond that point. Identities and recipients are parsed and passed directly to the encryption/decryption functions. There is no shared config object.

### 4. Is validation centralized?

**No.** Validation is scattered:
- Flag validation is ad-hoc in `main()` (`cmd/age/age.go:179-218`)
- File overlap validation at `cmd/age/age.go:265-268`
- Identity parsing via `age.ParseIdentities()` in `cmd/age/parse.go`
- Plugin validation is plugin-specific

There is no centralized validation function or schema.

## Architectural Decisions

1. **No config files by design** — Age's philosophy explicitly rejects configuration files. Keys are small, textual, and meant to be passed as flags or read from identity files (`age.go:22-29`). This is a deliberate tradeoff prioritizing simplicity over flexibility.

2. **Flags-only CLI** — Uses Go's standard `flag` package with no wrapper or extension. No cobra, no pflag, no viper. Commands are simple and monolithic.

3. **Plugin-based env var handling** — Environment variables are only processed by `age-plugin-batchpass`, not by the core `age` command. This isolates the env-var concern to the plugin that needs it (`cmd/age-plugin-batchpass/plugin-batchpass.go:182-213`).

4. **No shared config structure** — Each command (`age`, `age-keygen`) parses its own flags and immediately executes. There is no `Config` struct, no global state, no config package.

## Notable Patterns

- **Flag multiplexing via `multiFlag`** — Custom flag types allow repeated flags (`-r`, `-R`) to accumulate values (`cmd/age/age.go:74-81`)
- **Identity order preservation** — `identityFlags` type preserves the relative order of `-i` and `-j` flags so that "agent then fallback keys" behavior works as expected (`cmd/age/age.go:87-99`)
- **Lazy file opening** — `lazyOpener` defers file creation until first write, avoiding empty output files on early failures (`cmd/age/age.go:560-585`)
- **Plugin identity routing** — Plugin identities are routed by type (`"i"` for file, `"j"` for data-less) in `encryptNotPass` and `decryptNotPass` (`cmd/age/age.go:372-391`, `cmd/age/age.go:456-471`)

## Tradeoffs

| Decision | Benefit | Cost |
|----------|---------|------|
| No config files | Simplicity, no config sprawl, users use existing tools (env vars, files) | No persistent user preferences, no project-level config |
| No env vars in core CLI | Core stays simple, predictable behavior | Users must use plugins for env-var-based automation |
| No validation framework | No abstraction overhead | Inconsistent error messages, harder to extend |
| Go flag package | No dependencies | Limited help formatting, no shell completion |

## Failure Modes / Edge Cases

1. **PowerShell redirection mangling** — Age detects files mangled by PowerShell redirection and suggests `-o` or `-a` (`cmd/age/age.go:437-493`)
2. **Duplicate flag warnings** — Duplicates are detected but only warned about, not rejected (`cmd/age/age.go:220-228`)
3. **Terminal binary output protection** — Refuses to output binary to terminal unless explicitly redirected (`cmd/age/age.go:277-303`)
4. **No identity overlap error** — `NoIdentityMatchError` doesn't distinguish between "no identities provided" and "wrong identity" (`age.go:220-240`)

## Future Considerations

1. If config file support were added, it would represent a major philosophical shift for the project—the design doc explicitly celebrates the absence of config options.
2. A validation framework could improve error messages for invalid flag combinations, but would add complexity.
3. Shell completion is not currently supported due to use of standard `flag` package.

## Questions / Gaps

1. **No config file loading mechanism exists** — Confirmed by grep for viper/pflag/cobra: none found.
2. **No centralized validation** — Validation happens ad-hoc in main functions; no evidence of a validation package or centralized error handling.
3. **No environment variable handling in core age CLI** — Only the plugin uses env vars; the main `age` command does not read any env vars.
4. **No precedence system** — Since there's only one config source (flags), there's no precedence to define.