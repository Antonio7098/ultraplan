# Repo Analysis: urfave-cli

## Logging & Observability

### Repo Info

| Field | Value |
|-------|-------|
| Name | urfave-cli |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/urfave-cli` |
| Group | `urfave-cli` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

urfave-cli v3 is a Go CLI framework that provides a `tracef` debugging function controlled by the `URFAVE_CLI_TRACING=on` environment variable. It does not use a structured logging library (no slog, zap, logrus). Output separation is implemented via configurable `Writer` (stdout) and `ErrWriter` (stderr) on the `Command` struct. Logs are plain-text printf-style traces sent to stderr. There are no log levels, no debug flags built into the library itself, and no telemetry or tracing hooks.

## Rating

**3/10** — Print debugging only

The library has no built-in logging library. Debugging is entirely via the `tracef` function which outputs to stderr when `URFAVE_CLI_TRACING=on` is set. There are no log levels, no structured log fields, no debug flag API, and no observability hooks.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Trace function | `tracef` uses `runtime.Caller` and `fmt.Fprintf(os.Stderr, ...)` when `URFAVE_CLI_TRACING=on` | `cli.go:32-59` |
| Trace toggle | `isTracingOn = os.Getenv("URFAVE_CLI_TRACING") == "on"` — single env var gate | `cli.go:32` |
| Trace output | Writes to `os.Stderr` with caller file:line prefix | `cli.go:46-59` |
| Stdout writer | `cmd.Writer` defaults to `os.Stdout`; used for help/version output | `command_setup.go:53-55` |
| Stderr writer | `cmd.ErrWriter` defaults to `os.Stderr`; used for errors | `command_setup.go:58-60` |
| Global ErrWriter | Package-level `var ErrWriter io.Writer = os.Stderr` | `errors.go:13-15` |
| Debug flag tests | Tests show `--debug` / `--verbose` flags, but these are user-defined flags in test cases, not library features | `flag_test.go:168-187, 1756-1768` |
| Error output | `HandleExitCoder` writes to `ErrWriter` | `errors.go:155-157` |
| Usage errors | `command_run.go:181` writes "Incorrect Usage" to `cmd.Root().ErrWriter` | `command_run.go:181` |
| Template errors | `CLI_TEMPLATE_ERROR_DEBUG` env var enables template parse error output | `help.go:356-357` |
| No log levels | No evidence of log level handling | — |
| No structured logs | No evidence of JSON, key-value, or machine-parseable logs | — |
| No telemetry | No evidence of OpenTelemetry, metrics, or tracing integration | — |

## Answers to Protocol Questions

**1. Is logging structured?**

No. The `tracef` function outputs plain-text printf-style messages to stderr. There is no structured logging library in the dependencies (`go.mod` has only `testify` and `yaml`). Logs are human-readable text with a file:line prefix. `go.mod:1-11`

**2. Are debug modes supported?**

Yes, but limited. Debugging is enabled via the `URFAVE_CLI_TRACING=on` environment variable. When enabled, `tracef` calls write to stderr. There is no programmatic API to enable/disable tracing — it is purely env-driven. `cli.go:32-34`

**3. Are logs separated from user output?**

Yes. The library maintains clear separation between:
- `cmd.Writer` (defaults to `os.Stdout`) — used for help output, version output, command suggestions (`command_setup.go:53-55`)
- `cmd.ErrWriter` (defaults to `os.Stderr`) — used for error messages, usage errors (`command_setup.go:58-60`)
- `tracef` output goes to `os.Stderr` directly (`cli.go:46`)

**4. What observability hooks exist?**

None. There are no telemetry integration points, no tracing hooks, no metric endpoints, and no observer pattern for log handling. The `tracef` function is the only debugging mechanism and it writes directly to `os.Stderr`.

## Architectural Decisions

- **No logging library**: urfave-cli v3 intentionally avoids external logging dependencies. Debugging relies entirely on the ad-hoc `tracef` function.
- **Env-driven tracing**: The sole control for debug output is `URFAVE_CLI_TRACING=on`. There is no API to set a logger or configure tracing from within Go code.
- **Writer separation**: The `Command` struct exposes `Writer` and `ErrWriter` as `io.Writer` fields, allowing applications to redirect output. This is the primary mechanism for output separation.
- **tracef in every file**: The `tracef` function is called throughout the codebase (178 references) for internal debugging during development, but is not a general-purpose logging API for application authors.

## Notable Patterns

- **`tracef` as the sole debug mechanism**: Every trace call includes caller location (file:line) and function name (`cli.go:43-44`). When tracing is off, calls become no-ops.
- **Per-command output streams**: Each `Command` can have its own `Writer` and `ErrWriter`, enabling testability and flexible output routing.
- **Template error debug flag**: A dedicated env var `CLI_TEMPLATE_ERROR_DEBUG` controls whether template parse errors are shown to the user (`help.go:356-357`).
- **`handleExitCoder` as error output**: The `HandleExitCoder` function routes errors through `ErrWriter` and supports custom exit codes (`errors.go:147-169`).

## Tradeoffs

- **Pro**: Zero external dependencies for logging; minimal footprint.
- **Pro**: Clear stdout/stderr separation via configurable writers.
- **Con**: No log levels — operators cannot increase verbosity at runtime.
- **Con**: No structured logs — log output cannot be parsed or routed to log aggregation systems.
- **Con**: `tracef` output goes directly to `os.Stderr` (bypasses `ErrWriter`), meaning debug output cannot be redirected separately from error output by the application.
- **Con**: No observability hooks — applications cannot plug in OpenTelemetry, Prometheus metrics, or distributed tracing.

## Failure Modes / Edge Cases

- **`URFAVE_CLI_TRACING` typo**: If the env var is misspelled or set to a different value, all tracing silently no-ops.
- **tracef to os.Stderr bypasses ErrWriter**: Debug traces are hardcoded to `os.Stderr` (`cli.go:46`) while errors use `cmd.Root().ErrWriter`. Applications cannot redirect debug traces independently.
- **No log rotation**: Plain stderr output has no built-in rotation or file-based destination.
- **Large trace volume**: With tracing on, `tracef` is called extensively (178+ call sites) and can produce verbose output.

## Future Considerations

- Introduce a `Logger` interface or field on `Command` to allow applications to inject a structured logger (e.g., slog, zap).
- Add log levels (Debug, Info, Warn, Error) with runtime configuration via flag or env var.
- Provide an observability hook interface to allow OpenTelemetry or Prometheus integration.
- Route `tracef` output through `ErrWriter` or a dedicated trace writer on `Command` instead of `os.Stderr` directly.

## Questions / Gaps

- No evidence of any logging library in `go.mod` — the library is intentionally dependency-light.
- No evidence of runtime-configurable log levels.
- No evidence of telemetry, tracing, or metric integration.
- `tracef` is used extensively in the library itself (178 call sites) but is not a public API intended for application authors.

---

Generated by `study-areas/10-logging-observability.md` against `urfave-cli`.