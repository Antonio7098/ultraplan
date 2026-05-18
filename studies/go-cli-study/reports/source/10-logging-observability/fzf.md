# Repo Analysis: fzf

## Logging & Observability

### Repo Info

| Field | Value |
|-------|-------|
| Name | fzf |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/fzf` |
| Group | N/A |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

fzf uses print-style debugging with no structured logging library. Debug output is minimal, going to stdout. Error messages go to stderr via `fmt.Fprintf(os.Stderr, ...)`. Profiling hooks exist via build tags (pprof). No log levels, no debug flag, no observability framework.

## Rating

**2/10** — Print debugging only

fzf does not have a logging system. It uses `fmt.Printf` for stats (`src/core.go:325`), `fmt.Fprintf(os.Stderr, ...)` for error messages, and has no structured logs, log levels, or debug mode. The only observability is optional pprof profiling via build tag.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Error output | `fmt.Fprintln(os.Stderr, err.Error())` for errors | `main.go:46` |
| Error output | `fmt.Fprintf(os.Stderr, "fzf (become): %s\n", err.Error())` for become errors | `src/util/util_unix.go:64` |
| Error output | Same become error pattern on Windows | `src/util/util_windows.go:124` |
| Profiling | pprof integration with build tag `pprof` | `src/options_pprof.go:1-73` |
| Debug variable | `var DEBUG bool` in algo package | `src/algo/algo.go:91` |
| Debug output | `debugV2` function for fuzzy matching debugging | `src/algo/algo.go:392` |
| Stats output | `fmt.Printf` for performance stats | `src/core.go:325` |
| Test logging | `t.Log()` only in test files | `src/tui/tcell_test.go:40` |

## Answers to Protocol Questions

1. **Is logging structured?**
   No. fzf uses `fmt.Printf` and `fmt.Fprintf` with plain text strings. No structured logging library (slog, zap, logrus) is used. No evidence of JSON logging or machine-parseable output.

2. **Are debug modes supported?**
   No formal debug mode. The `DEBUG` boolean in `src/algo/algo.go:91` exists but is never set to true in normal execution—it is a compile-time debug flag for algorithm tracing, not a runtime debug option. No `--debug` flag or environment variable enables verbose output.

3. **Are logs separated from user output?**
   Partial. Errors go to stderr (`fmt.Fprintf(os.Stderr, ...)` at `src/util/util_unix.go:64`, `src/util/util_windows.go:124`, `main.go:46`). Performance stats go to stdout (`fmt.Printf` at `src/core.go:325`). The `LightRenderer` has a `stderr` method (`src/tui/light.go:44`) for rendering escape codes to stderr. No formal separation of "user output" vs "debug logs" since there are no debug logs.

4. **What observability hooks exist?**
   Only pprof profiling via build tag. The file `src/options_pprof.go` implements CPU, memory, block, and mutex profiling when built with `-tags=pprof`. No tracing, no metrics, no structured logs. Observability hooks are minimal.

## Architectural Decisions

- **No logging library**: fzf intentionally avoids dependencies and complexity. Error reporting is done via direct `fmt.Fprintf` to stderr.
- **pprof as observability**: The only first-class observability is Go's `runtime/pprof` profiler, gated behind a build tag (`src/options_no_pprof.go:10` returns error if built without tag).
- **Stats to stdout**: Performance statistics are printed to stdout during `--stat` benchmark mode (`src/core.go:325`), not to stderr.

## Notable Patterns

- Errors go to stderr via `fmt.Fprintf(os.Stderr, ...)` — direct, no abstraction
- `util.AtExit()` for cleanup registration (`src/util/atexit.go:11`)
- Light renderer has dedicated `stderr` method (`src/tui/light.go:44-89`)
- No log levels, no log categories, no structured fields

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| No logging library | Less dependencies, simpler codebase; but operators cannot enable verbose debug output |
| Print-style debug | Easy to add, always available; but not machine-parseable, no levels |
| pprof only | Standard Go tooling; but requires special build and doesn't run in normal usage |
| Stats to stdout | Visible during benchmark; mixes with user-facing output |

## Failure Modes / Edge Cases

- **No debug output in production**: Operators cannot enable debug logging to diagnose issues.
- **No visibility into internal state**: Without structured logs, diagnosing performance issues or unexpected behavior requires rebuilding with pprof tag or adding debug prints manually.
- **Error messages are terse**: `fmt.Fprintf(os.Stderr, "fzf (become): %s\n", err.Error())` at `src/util/util_unix.go:64` gives no context.

## Future Considerations

- Could add a `--debug` flag that enables structured logging to stderr
- Could integrate `log/slog` (standard library since Go 1.21) for structured output without adding dependencies
- Could expose matcher/scan statistics as metrics

## Questions / Gaps

- No evidence of any debug flag or verbose option for operators
- No evidence of log levels or log categories
- No evidence of structured log fields (no slog, zap, logrus imports)
- No evidence of tracing or telemetry integration
- The `DEBUG` bool in algo is never set to true in production code — it's dead code for debugging

---

Generated by `study-areas/10-logging-observability.md` against `fzf`.