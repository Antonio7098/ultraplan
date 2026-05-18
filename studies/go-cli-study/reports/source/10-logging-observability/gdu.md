# Repo Analysis: gdu

## Logging & Observability

### Repo Info

| Field | Value |
|-------|-------|
| Name | gdu |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` |
| Group | `gdu` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

gdu uses logrus for logging but relies on unstructured `log.Print`/`log.Printf` calls. There is no runtime-configurable log level, no debug mode flag, and no structured field logging. Logs are redirected to a file via `--log-file` flag rather than stderr. User output goes to stdout. Some TUI progress indicators use stderr for terminal escape codes.

## Rating

**3/10** — Print debugging only

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Logging library | Uses `github.com/sirupsen/logrus` | `cmd/gdu/main.go:14` |
| Log level configuration | No runtime level config; tests set `log.WarnLevel` | `tui/tui_test.go:25` |
| Debug mode | No `--debug` or `--verbose` flag exists | `cmd/gdu/main.go:46-115` (all flags) |
| Log file redirection | `--log-file` flag redirects all logs to file | `cmd/gdu/main.go:50` |
| Log output setup | `log.SetOutput(f)` redirects to log file | `cmd/gdu/main.go:240` |
| User output | Uses `os.Stdout` via Writer field | `cmd/gdu/app/app.go:273` |
| Progress to stderr | Terminal escape sequences write to `os.Stderr` | `tui/progress.go:76,81` |
| Command execution | Uses both `os.Stdout` and `os.Stderr` | `tui/exec.go:12-13` |
| Runtime flags logged | `log.Printf("Runtime flags: %+v", *a.Flags)` | `cmd/gdu/app/app.go:211` |
| Path analysis logged | `log.Printf("Analyzing path: %s", path)` | `cmd/gdu/app/app.go:618` |
| Error logging | Uses `log.Print(err.Error())` and `log.Printf(...)` | `pkg/analyze/stored.go:75,127,134` |

## Answers to Protocol Questions

**1. Is logging structured?**

No. The codebase uses logrus but only calls `log.Print()` and `log.Printf()` with plain strings. No structured fields (key-value pairs) are used. Example: `pkg/analyze/stored.go:75` — `log.Print(err.Error())`.

**2. Are debug modes supported?**

No debug mode flag exists. The only observability options are:
- `--log-file` to redirect logs to a file
- `--enable-profiling` to enable pprof endpoints on localhost:6060

No `--debug` or `--verbose` flag. No way to increase verbosity at runtime.

**3. Are logs separated from user output?**

Partially. User output goes to `os.Stdout` via the `Writer` field (`cmd/gdu/app/app.go:273`). Logs by default go to a file specified by `--log-file`. Some TUI components write terminal control sequences to `os.Stderr` (`tui/progress.go:76,81`). However, logrus output is not sent to stderr by default — it's sent to the log file.

**4. What observability hooks exist?**

- pprof HTTP endpoints when `--enable-profiling` is set (`cmd/gdu/app/app.go:579-584`)
- Log file output via `--log-file`
- No tracing or metrics integration

## Architectural Decisions

1. **File-based logging**: Logs are redirected to a file rather than stderr, controlled by `--log-file` flag (`cmd/gdu/main.go:50,240`).

2. **No runtime log level**: Log level is hardcoded to WarnLevel in tests but never changed at runtime. There's no flag to adjust verbosity.

3. **TUI uses stderr for terminal controls**: The progress bar implementation writes escape sequences directly to stderr to work around TUI stdout takeover (`tui/progress.go:73-81`).

## Notable Patterns

- All `log.Print`/`log.Printf` calls use plain unstructured text
- No logrus fields or structured context
- App logs runtime flags on startup (`cmd/gdu/app/app.go:211`)
- Error paths log via `log.Print(err.Error())` with no stack traces
- Config errors log but don't fail the app (`cmd/gdu/main.go:243`)

## Tradeoffs

- **Con**: Operators cannot enable debug logging at runtime; must pre-configure log file
- **Con**: No structured logs makes log parsing/dashboarding difficult
- **Con**: No log level control means verbose output cannot be enabled on demand
- **Pro**: pprof integration allows CPU/memory profiling for performance debugging
- **Pro**: Log file separation keeps user output clean when logging to file

## Failure Modes / Edge Cases

- If `--log-file` points to a non-writable location, logging silently fails and errors go nowhere
- Without a debug mode, operators cannot get additional context when the tool behaves unexpectedly
- Log file defaults to `/dev/null` on Unix, meaning all logs are discarded unless explicitly redirected

## Future Considerations

- Add `--debug` or `-d` flag to set logrus level to DebugLevel
- Add structured logging with key-value fields (e.g., `log.WithField("path", path).Debug("analyzing")`)
- Route debug output to stderr for on-demand visibility without file setup

## Questions / Gaps

- Why is there no log level configuration at runtime despite using logrus?
- Could the log file default be changed from `/dev/null` to stderr for development convenience?
- Is there a plan to add structured logging or metrics (e.g., OpenTelemetry)?

---

Generated by `study-areas/10-logging-observability.md` against `gdu`.