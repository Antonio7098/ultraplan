# Repo Analysis: go-task

## Logging & Observability

### Repo Info

| Field | Value |
|-------|-------|
| Name | go-task |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/go-task` |
| Group | `10-logging-observability` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

go-task uses a custom `Logger` struct (`internal/logger/logger.go`) rather than a standard logging library. It provides colored output with explicit stdout/stderr separation, a verbose mode (`--verbose` / `-v`), and a pluggable `DebugFunc` hook for debug message routing. However, logs are unstructured plain text, there is no formal log level hierarchy, and there is no telemetry or tracing integration.

## Rating

**5/10** — Basic logging with debug support but no structured output or observability hooks.

Rationale: go-task has a proper Logger with stdout/stderr separation and verbose mode, plus a `DebugFunc` hook for custom debug routing. However, it lacks formal log levels (DEBUG/INFO/WARN/ERROR), structured logging (JSON), and any tracing/telemetry integration. The debug output is plain text, not machine-parseable.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Logging Library | Custom `Logger` struct, not using slog/zap/logrus/zerolog | `internal/logger/logger.go:132-140` |
| Logger struct fields | `Stdout`, `Stderr`, `Verbose`, `Color` fields | `internal/logger/logger.go:132-140` |
| Verbose mode flag | `Verbose bool` field + `VerboseOutf`/`VerboseErrf` methods | `internal/logger/logger.go:136,160-164,178-183` |
| DebugFunc type | `DebugFunc func(string)` type for pluggable debug output | `taskrc/reader.go:12-13` |
| DebugFunc option | `WithDebugFunc` functional option for Reader | `taskrc/reader.go:43-57` |
| DebugFunc in taskfile reader | Same `DebugFunc` type and option for taskfile reading | `taskfile/reader.go:33-34,171-185` |
| Debug function wiring | Debug messages routed via `VerboseOutf` with magenta color | `setup.go:78-79` |
| Debug message output | `debugf` method formats and calls `debugFunc` | `taskfile/reader.go:262-266` |
| Stdout/Stderr separation | `Outf` → stdout, `Errf` → stderr, `Warnf` → stderr | `internal/logger/logger.go:143-176,185-187` |
| Verbose flag parsing | `--verbose` / `-v` flag bound to `flags.Verbose` | `internal/flags/flags.go:135` |
| Verbose in Executor | `Verbose bool` field on Executor | `executor.go:45` |
| Color handling | `Color` field with env var priority (`NO_COLOR`, `FORCE_COLOR`) | `internal/flags/flags.go:180-195` |
| Watch mode logging | Verbose logging for fsnotify events | `watch.go:79,89,106,183` |
| Task output interface | `Output` interface with `WrapWriter` for stdout/stderr routing | `internal/output/output.go:12-14` |

## Answers to Protocol Questions

### 1. Is logging structured?

**No.** go-task uses plain text logging via a custom `Logger` that outputs colored formatted strings. There is no JSON output option, no key-value pairs, and no machine-parseable format. Debug messages are plain strings passed to `DebugFunc`.

Evidence: `internal/logger/logger.go:142-157` — `FOutf` simply formats and prints with color, no structured fields.

### 2. Are debug modes supported?

**Yes.** There are two mechanisms:

1. **Verbose mode** (`--verbose` / `-v`): Enables verbose output via `Logger.VerboseOutf` and `Logger.VerboseErrf`. When enabled, debug-style messages are printed (e.g., watch events in `watch.go:79`).

2. **DebugFunc hook**: The taskfile reader accepts a `DebugFunc func(string)` via `WithDebugFunc` option (`taskfile/reader.go:171-185`). This is wired in `setup.go:78-79` to route debug messages through `Logger.VerboseOutf`.

The `--verbose` flag is parsed at `internal/flags/flags.go:135` and passed to the Executor via `WithVerbose` option (`executor.go:347-359`).

### 3. Are logs separated from user output?

**Yes.** The `Logger` struct has explicit `Stdout` and `Stderr` fields (`internal/logger/logger.go:133-135`). All logger output methods route appropriately:
- `Outf` → stdout (`internal/logger/logger.go:143-145`)
- `Errf` → stderr (`internal/logger/logger.go:167-176`)
- `Warnf` → stderr (`internal/logger/logger.go:185-187`)
- `VerboseOutf` → stdout only when verbose (`internal/logger/logger.go:160-164`)
- `VerboseErrf` → stderr only when verbose (`internal/logger/logger.go:179-183`)

Task command output is managed separately via the `Output` interface (`internal/output/output.go:12-14`) which also distinguishes stdout/stderr.

### 4. What observability hooks exist?

**Limited.** The only observability hook is `DebugFunc` which allows routing debug messages to a custom handler (e.g., `slog.Debug`). There is:
- No tracing integration
- No telemetry / metrics
- No structured log export
- No integration with OpenTelemetry or similar

The `DebugFunc` is used internally to output taskfile reading debug messages (cache hits/misses, downloads) via `taskfile/reader.go:262-266` but is not exposed as a general-purpose observability API.

## Architectural Decisions

1. **Custom Logger instead of standard library**: go-task implements its own `Logger` in `internal/logger/logger.go` rather than using `log/slog`, `zap`, or `logrus`. This gives full control over colored output and stdout/stderr routing, but requires maintaining custom code.

2. **Functional options pattern**: Both `Logger` and `Reader` use the functional options pattern (`WithVerbose`, `WithDebugFunc`, etc.) for configuration, providing flexibility without struct proliferation.

3. **Color via fatih/color**: The logger uses the `github.com/fatih/color` library for cross-platform color support, with environment variable overrides (`COLOR_*`, `NO_COLOR`, `FORCE_COLOR`).

4. **Verbose as boolean, not levels**: Instead of log levels (DEBUG/INFO/WARN/ERROR), go-task uses a single `Verbose bool` flag. When true, additional context is printed to stderr.

5. **DebugFunc as pluggable hook**: The `DebugFunc` type allows callers to inject custom debug handling. In production, it routes to `Logger.VerboseOutf`; in tests or custom integrations, it could route to a structured logger like `slog`.

## Notable Patterns

- **Output interface** (`internal/output/output.go:12-14`): Abstracts output styling (interleaved/group/prefixed) and stdout/stderr wrapping, allowing different output modes without changing core logic.

- **Color functions as types**: `Color` and `PrintFunc` are defined as types with factory functions (`Default()`, `Green()`, `Red()`, etc.) in `internal/logger/logger.go:40-101`.

- **Executor as dependency holder**: The `Executor` struct holds the `Logger` instance (`executor.go:66`) and passes it to components that need it (Compiler, Output), centralizing output configuration.

- **Environment variable priority chain**: Color detection follows explicit CLI flag > `TASK_COLOR` env > taskrc config > `NO_COLOR` > `FORCE_COLOR`/CI > auto-detect (`internal/flags/flags.go:180-195`).

## Tradeoffs

1. **Custom Logger vs standard library**: Avoids dependency on logging library but reinvents functionality. A standard library like `log/slog` would provide structured logging and log levels out of the box.

2. **Boolean verbose vs log levels**: Simple to understand and implement, but coarse-grained. Cannot enable DEBUG without also enabling INFO-level verbose messages.

3. **DebugFunc limited to taskfile reading**: Only the taskfile reader uses `DebugFunc`. Other components (executor, compiler, task execution) do not have equivalent hooks.

4. **No machine-parseable output**: Operators cannot easily parse logs programmatically. Debugging production issues requires reading colored human-readable text.

## Failure Modes / Edge Cases

1. **Verbose output to stderr can mix with task output**: In `--output=interleaved` mode, verbose debug messages (task: received watch event, etc.) go to stderr while task output goes to stdout, but the interleaved output style (`internal/output/interleaved.go`) returns the original stdout/stderr, so the mixing depends on how the terminal handles stderr.

2. **No log file rotation**: All output goes to stdout/stderr. There is no file-based logging, making it harder to diagnose issues after-the-fact.

3. **DebugFunc silently dropped**: If `debugFunc` is nil (default), debug messages are silently discarded (`taskfile/reader.go:262-266`). This is intentional but can be surprising.

4. **Color detection in CI**: The `isCI()` function (`internal/flags/flags.go:199-202`) enables colors based on `CI` env var, but this may not be set in all CI environments, potentially causing unexpected plain output.

## Future Considerations

1. **Consider adopting log/slog**: Go 1.21+ standard library `log/slog` would provide structured logging, log levels, and built-in OpenTelemetry integration without external dependencies.

2. **Add log levels**: Replace `Verbose bool` with proper log levels (DEBUG, INFO, WARN, ERROR) for more granular control over output verbosity.

3. **Add structured logging option**: A `--log-format=json` flag would enable machine-parseable output for production environments.

4. **Add tracing hooks**: OpenTelemetry integration would allow operators to trace task execution across distributed systems.

## Questions / Gaps

1. **No evidence found** for structured log output (JSON). The logger only produces plain text with optional color codes.

2. **No evidence found** for log file output or rotation. All output goes to stdout/stderr.

3. **No evidence found** for tracing or telemetry integration. The `DebugFunc` hook is the only observability mechanism, and it is only used for taskfile reading debug messages.

---

Generated by `study-areas/10-logging-observability.md` against `go-task`.