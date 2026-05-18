# Repo Analysis: restic

## Logging & Observability

### Repo Info

| Field | Value |
|-------|-------|
| Name | restic |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/restic` |
| Group | `10-logging-observability` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

restic uses a home-grown debug logging system via `internal/debug` rather than a standard structured logging library. Debug logging is disabled by default and activated via environment variables (`DEBUG_LOG`, `DEBUG_FUNCS`, `DEBUG_FILES`). User-facing output uses a multi-level verbosity system (`--quiet`/`--verbose`) with clear separation between stdout (user output) and stderr (errors/debug). JSON output mode is supported for machine consumption.

## Rating

**6/10** — Basic logging with structured debug system and multi-level verbosity. Debug logging is sophisticated (filterable by function/file, goroutine info, stack traces) but opt-in and not structured in the standard sense (no JSON, no levels like INFO/WARN/ERROR). User output is well-separated via the `Printer` interface. Score reflects: not using a mainstream structured logger (slog/zap), no built-in log levels for application logs, debug output is human-readable but not machine-parseable by default.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Debug logging library | Custom `internal/debug` package using standard `log.Logger` writing to file or stderr | `internal/debug/debug.go:13-18` |
| Debug activation | `DEBUG_LOG` env var enables debug, writes to file; `DEBUG_FUNCS`/`DEBUG_FILES` for filtering | `internal/debug/debug.go:40-46`, `internal/debug/debug.go:113-116` |
| Debug Log function | `debug.Log()` function with position tracking, goroutine number, filterable output | `internal/debug/debug.go:163-207` |
| Verbosity levels | `Options.Verbosity` uint with 0 (quiet), 1 (default), 2 (verbose), 3 (debug) | `internal/global/global.go:74-79`, `internal/global/global.go:153-166` |
| Debug mode implementation | Build-tag gated profiling via `global_debug.go` (`debug` or `profile` build tags) | `internal/global/global_debug.go:1` |
| Output separation | `Printer` interface with `E()` (stderr), `S/P/PT/V/VV` (stdout-based with verbosity gates) | `internal/ui/progress/printer.go:15-34` |
| JSON output | `--json` flag triggers JSON mode for backup and other commands | `internal/global/global.go:102` |
| HTTP debug tracing | `loggingRoundTripper` dumps HTTP requests/responses (with redaction) via debug.Log | `internal/debug/round_tripper.go:85-114` |
| Backend debug logging | `logger.Backend` wrapper logs all backend operations via `debug.Log` | `internal/backend/logger/log.go:22-77` |

## Answers to Protocol Questions

**1. Is logging structured?**

No — restic does not use a structured logging library (no slog, zap, logrus, zerolog). The `debug.Log` function writes human-readable text to a file or stderr in tab-delimited format: `dir/file.go:line	function	goroutine-id	message`. This is parseable but not structured (no key-value pairs, no JSON). Application logs use `fmt.Fprintf` to stdout/stderr via the `Printer` interface. Evidence: `internal/debug/debug.go:186-188` shows format string: `"%s\t%s\t%d\t%s"` (pos, fn, goroutine, f).

**2. Are debug modes supported?**

Yes — debug mode is supported via three environment variables:
- `DEBUG_LOG=<file>` — enables debug logging to the specified file (`internal/debug/debug.go:40`)
- `DEBUG_FUNCS=<pattern>` — filter debug by function name pattern (`internal/debug/debug.go:114`)
- `DEBUG_FILES=<pattern>` — filter debug by file path pattern (`internal/debug/debug.go:115`)

Additionally, build-tag gated profiling is available via `--listen-profile`, `--mem-profile`, `--cpu-profile`, `--trace-profile`, `--block-profile` flags when built with `debug` or `profile` build tags (`internal/global/global_debug.go:19-40`, `internal/global/global_debug.go:58-65`).

**3. Are logs separated from user output?**

Yes — the `Printer` interface (`internal/ui/progress/printer.go`) explicitly separates:
- `E()` — always goes to stderr (errors)
- `S()` — stdout, printed even in quiet mode (critical messages)
- `P()` — stdout at verbosity >= 1 (normal output)
- `PT()` — stdout at verbosity >= 1, terminal-only
- `V()` — stdout at verbosity >= 2 (verbose)
- `VV()` — stdout at verbosity >= 3 (debug-level)
- `VV()` uses `--verbose=2` equivalent for the most detailed debug messages

The `--json` flag switches to JSON output mode for machine consumption.

**4. What observability hooks exist?**

- **Debug logs**: HTTP request/response tracing via `loggingRoundTripper` (`internal/debug/round_tripper.go:85-114`) with header redaction
- **Backend instrumentation**: All backend operations logged through `logger.Backend` wrapper (`internal/backend/logger/log.go`)
- **Progress reporting**: Structured JSON progress output (`internal/ui/backup/json.go:42-64`) with status, error, verbose_status, and summary message types
- **Profiling**: CPU, memory, block, and trace profiling via `github.com/pkg/profile` (`internal/global/global_debug.go:105-111`)
- **EOF detection**: Round tripper detects undrained response bodies (`internal/debug/round_tripper.go:22-49`)

No OpenTelemetry, no distributed tracing, no metrics (Prometheus etc.).

## Architectural Decisions

- **Custom debug package over structured logger**: restic developed `internal/debug` early (standard library `log.Logger`), before Go 1.21's `slog`. Debug output is a development aid, not application logging.
- **Environment-variable-driven debug**: Debug is configured via env vars rather than flags, keeping CLI surface clean for users who don't need debug.
- **Backend wrapper pattern**: `logger.Backend` is a decorator that wraps any backend and logs all operations — a clean separation that adds observability without changing backend implementations.
- **Verbosity as CLI flags**: `--quiet`/`--verbose` flags map to a 4-level verbosity system (`internal/global/global.go:153-166`) controlling stdout output volume.

## Notable Patterns

- **Build-tag gating for profiling**: Profiling code lives in `global_debug.go` with `//go:build debug || profile`, ensuring it compiles out of release builds (`internal/global/global_debug.go:1`).
- **Two debug round trippers**: `round_tripper_debug.go` and `round_tripper_release.go` are functionally identical — both check `opts.isEnabled` — but the debug build tag variant uses the `isEnabled` variable directly while the release build avoids importing the profile package (`internal/debug/round_tripper_debug.go:9-15`, `internal/debug/round_tripper_release.go:9-14`).
- **Filter pattern with +/- prefixes**: DEBUG_FUNCS/DEBUG_FILES support `+func`, `-func`, `+file`, `-file` prefixes to enable/disable specific patterns (`internal/debug/debug.go:67-74`).
- **Shortener interface for ID formatting**: The `debug.Log` function converts types implementing `Str()` interface to strings to avoid allocation during formatting (`internal/debug/debug.go:176-184`).

## Tradeoffs

- **No structured app logging**: Application uses `fmt.Fprintf` through Printer interface — operators cannot pipe logs to log aggregation systems (ELK, Loki) in a structured way.
- **Debug by default is off**: Debug logging is opt-in via environment, so production issues require restarting the process with `DEBUG_LOG` set — no dynamic reconfiguration.
- **Human-readable debug format**: The tab-delimited debug output (`internal/debug/debug.go:188`) is easy for humans to read but requires custom parsing for machine consumption.
- **No log levels for application code**: The Printer interface controls verbosity of user-facing output but there's no `LogLevel` concept — all non-error output is either printed or not based on verbosity.

## Failure Modes / Edge Cases

- **Debug file permissions**: `DEBUG_LOG` file is created with `0600` permissions (`internal/debug/debug.go:47`) — if the process runs as a different user, it may fail to write.
- **Silent failures on debug init**: If `initDebugLogger()` fails to open the debug log file, it calls `os.Exit(2)` (`internal/debug/debug.go:50`) — this is an abrupt failure for what is essentially a development aid.
- **Goroutine ID extraction**: `goroutineNum()` parses `runtime.Stack` output (`internal/debug/debug.go:119-126`) — this could theoretically break if Go runtime stack format changes.
- **Response body not drained**: The `eofDetectReader` detects if HTTP response bodies are not fully read and logs a warning (`internal/debug/round_tripper.go:32-47`) — this is a safety net but could indicate bugs in the calling code.

## Future Considerations

- Adopt `slog` (Go 1.21+) for structured application logging — would provide machine-parseable logs with levels.
- Add OpenTelemetry tracing integration for distributed backup/restore observability.
- Consider dynamic log level configuration (flag or signal) for production debugging without restart.

## Questions / Gaps

- **No evidence of log rotation**: `DEBUG_LOG` file is opened with `O_APPEND` but no rotation mechanism — long-running processes could produce large debug files.
- **No structured error logging**: Errors are printed via `E()` but not captured in a structured error log — operators rely on stderr capture.
- **No metrics/telemetry**: No Prometheus metrics or similar observability for backup throughput, cache hit rates, or operation latency.
- **JSON output not complete**: JSON mode exists for backup (`internal/ui/backup/json.go`) but it's unclear if all commands support it consistently.