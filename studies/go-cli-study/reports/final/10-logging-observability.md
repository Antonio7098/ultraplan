# Logging & Observability - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Protocol | `study-areas/10-logging-observability.md` |
| Groups | `go-cli-study` |
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

This study examined logging and observability practices across 16 Go CLI projects. The primary differentiator between elite and basic implementations is structured logging combined with operator-accessible debug modes. Projects using Go's standard `log/slog` consistently scored higher (7-8/10) than those relying on `fmt.Printf` or minimal custom loggers (2-4/10). The clearest pattern: **structured logs + runtime debug control + stdout/stderr separation = operators who can debug efficiently**.

## Core Thesis

Elite Go CLIs treat logging as a design pillar, not an afterthought. They use structured logging for machine-parseable output, provide operators with runtime-controllable debug modes via flags or environment variables, and maintain strict separation between user-facing output (stdout) and diagnostic logs (stderr or files). Basic implementations treat logging as print debugging with no runtime control, making production debugging difficult or impossible without code modification.

## Rating Summary

| Repo | Score | Approach | Main Strength | Main Concern |
|------|-------|----------|---------------|--------------|
| rclone | 8/10 | slog + custom handler | Structured logs + Prometheus metrics + multi-output | No distributed tracing |
| helm | 8/10 | slog + dynamic debug | Dynamic debug toggle at log-time | No observability hooks |
| k9s | 8/10 | slog + custom keys | 50+ structured keys + file logging | No OTEL SDK integration |
| yq | 7/10 | slog + wrapper | 414 debug calls with guards | No JSON logging built-in |
| opencode | 7/10 | slog + custom wrapper | Session logging + pubsub log distribution | Incomplete stdout/stderr separation |
| dive | 7/10 | go-logger facade | Nested loggers + component tagging | Debug verbosity via clio, not direct |
| chezmoi | 6/10 | slog (text handler) | Component-tagged structured logs | Debug is binary on/off, no levels |
| lazygit | 6/10 | logrus JSON | File-based debug + log tail utility | No real-time stderr streaming |
| restic | 6/10 | Custom debug system | Filterable by func/file, goroutine tracking | Human-readable only, not machine-parseable |
| gh-cli | 5/10 | Standard log + env | IOStreams abstraction + telemetry log mode | Inconsistent debug routing |
| go-task | 5/10 | Custom Logger | Colored output + DebugFunc hook | Boolean verbose only, no levels |
| age | 4/10 | Standard log | Clean stderr/stdout separation | No structured logs, no debug mode |
| gdu | 3/10 | Logrus + log.Print | Log file output | No structured fields, no runtime level |
| urfave-cli | 3/10 | tracef only | Zero dependencies | No log levels, tracef bypasses ErrWriter |
| mitchellh-cli | 3/10 | log.Printf only | Writer separation for UI | No debug capability |
| fzf | 2/10 | Print debugging | pprof profiling via build tag | No runtime debug, no structured logs |

## Approach Models

### 1. Standard Library slog (Modern Standard Approach)

**Repos**: helm, k9s, rclone, yq, chezmoi, opencode

These projects use Go's `log/slog` (standard library since Go 1.21). They benefit from structured key-value logging, built-in log levels, and no external dependencies. They typically wrap slog with custom handlers for formatting, colors, or output routing.

**Key mechanism**: `slog.NewTextHandler(os.Stderr, ...)` with custom `WithAttr`/`WithGroup` helpers.

**Strength**: Modern, stdlib, structured, level-based.
**Tradeoff**: Text format by default (requires JSON handler for machine parsing).

### 2. Custom Logger with Facade Pattern

**Repos**: go-task, dive

go-task uses a custom `Logger` struct with `Stdout`/`Stderr` fields and verbose mode. dive uses the `github.com/anchore/go-logger` facade with a discard-by-default singleton. Both provide stdout/stderr separation but lack formal log levels.

**Key mechanism**: Custom logger struct wrapping colored output, with `DebugFunc` or `WithFields` for context.

**Strength**: Full control over formatting and output routing.
**Tradeoff**: Reinventing logging primitives; no standard levels or structured output.

### 3. Third-Party Structured Libraries

**Repos**: lazygit (logrus JSON), gdu (logrus but unstructured), age (standard log only)

lazygit uses logrus with JSON formatter for machine-parseable logs. gdu imports logrus but only uses `log.Print`, missing the structured capability. age uses standard `log` package exclusively.

**Key mechanism**: logrus `WithFields`, JSON formatter, file output with `LAZYGIT_LOG_PATH`.

**Strength**: Mature libraries with many backends.
**Tradeoff**: Additional dependencies; gdu and age don't leverage logrus' capabilities.

### 4. Custom Debug-Only Systems

**Repos**: restic

restic uses a home-grown `internal/debug` package based on `log.Logger`. Debug is opt-in via `DEBUG_LOG` env var and provides filterable output by function and file. Application output uses a `Printer` interface with verbosity levels.

**Key mechanism**: Tab-delimited debug format with goroutine tracking; `Printer` interface for stdout/stderr.

**Strength**: Rich debug filtering, goroutine awareness.
**Tradeoff**: Not structured (no JSON), human-readable only, no standard log levels.

### 5. Print Debugging / Minimal

**Repos**: fzf, mitchellh-cli, urfave-cli

These projects have no real logging system. fzf uses `fmt.Printf` for stats and `fmt.Fprintf(os.Stderr)` for errors, with pprof as the only observability. mitchellh-cli has a single `log.Printf` call. urfave-cli has `tracef` controlled by `URFAVE_CLI_TRACING` env var.

**Key mechanism**: None significant — printf-style output.

**Strength**: Zero dependencies.
**Tradeoff**: No runtime debug control, no machine-parseable output, no observability.

## Pattern Catalog

### Pattern 1: Binary Debug Toggle

**What**: Debug mode is either fully on or off, not level-based.
**Repos**: chezmoi, age, fzf, lazygit (partially)
**Evidence**: chezmoi uses `NullHandler` when debug=false (`internal/cmd/config.go:2298`); lazygit uses `io.Discard` in production (`pkg/logs/logs.go:32`)
**Why it works**: Simple UX — operators enable `--debug` and get everything
**When overkill**: Applications with many subsystems where full debug is too noisy
**When risky**: Cannot filter to just one component when debugging

### Pattern 2: Environment-Variable Debug Control

**What**: Debug enabled via env var rather than CLI flag.
**Repos**: gh-cli (`GH_DEBUG`), lazygit (`DEBUG`), restic (`DEBUG_LOG`), urfave-cli (`URFAVE_CLI_TRACING`), opencode (`OPENCODE_DEV_DEBUG`)
**Evidence**: gh-cli `utils/utils.go:10-29`, lazygit `pkg/config/app_config.go:24`
**Why it works**: Allows debug without changing command line (useful in scripts, CI)
**When overkill**: When operators always want debug, a flag is simpler
**Risk**: Environment variables are隐性 — operators may not know they exist

### Pattern 3: Structured Keys Package

**What**: Centralized constants for log field names to ensure consistency.
**Repos**: k9s (50+ keys in `internal/slogs/keys.go`), rclone (via `fs.LogValue`)
**Evidence**: k9s `internal/slogs/keys.go:6-231`
**Why it works**: Prevents typo-induced field name inconsistency across large codebases
**When overkill**: Small projects with few log calls
**Risk**: Keys can become stale if not maintained

### Pattern 4: Deferred Trace Logging

**What**: `defer log.Trace()` at function entry to log exit with parameters.
**Repos**: rclone (`fs/log/log.go:150-172`), rclone VFS (`vfs/vfs.go:435`)
**Evidence**: rclone `fs/log/log.go:150`
**Why it works**: Captures function exit automatically with return values
**When overkill**: Performance-critical hot paths (though guards prevent overhead when disabled)
**Risk**: Stack depth affects log caller accuracy

### Pattern 5: Discard-By-Default Logger

**What**: Global logger defaults to no-op, initialized later.
**Repos**: dive (`internal/log/log.go:9`: `var log = discard.New()`), opencode (logs silent until configured)
**Evidence**: dive `internal/log/log.go:9`
**Why it works**: Avoids logging before configuration; no accidental early logging
**Risk**: If `Set()` is forgotten, logs silently disappear

### Pattern 6: Output Interface Abstraction

**What**: Logger/UI uses an `Output` interface for stdout/stderr routing.
**Repos**: go-task (`internal/output/output.go:12-14`), gh-cli (`IOStreams`)
**Evidence**: go-task `internal/output/output.go:12-14`
**Why it works**: Allows different output modes (interleaved, grouped, prefixed) without changing core logic
**When overkill**: Simple CLIs with fixed output needs

### Pattern 7: Component-Tagged Loggers

**What**: Subsystems create child loggers with embedded context.
**Repos**: dive (nested loggers with `"ui"`, `"status"` tags), k9s (`slogs.CLog(subsys)`)
**Evidence**: dive `cmd/dive/cli/internal/ui/v1/view/status.go:38`
**Why it works**: All logs from a component carry identifying context automatically
**Risk**: Child logger misuse can create confusing nested context

### Pattern 8: Backend Wrapper for Observability

**What**: Wrap backend/storage implementations with logging decorator.
**Repos**: restic (`logger.Backend` in `internal/backend/logger/log.go`), helm (storage logging)
**Evidence**: restic `internal/backend/logger/log.go:22-77`
**Why it works**: Adds observability without modifying core backend implementations
**When overkill**: When backends are simple or few

## Key Differences

### Structured vs Unstructured

The clearest quality divider. Projects using slog or logrus with structured fields produce machine-parseable output; projects using `fmt.Printf` or `log.Printf` produce human-readable text that cannot be parsed programmatically.

**Converges on**: slog as the modern standard (Go 1.21+), logrus as legacy alternative.
**Diverges because**: Some projects predate slog (Go 1.21), and some intentionally avoid dependencies.

### Debug Control: Flag vs Env Var vs File

**Flag-first**: helm (`--debug`), k9s (`--logLevel`), yq (`-v`), lazygit (`--debug`)
**Env-var-first**: gh-cli (`GH_DEBUG`), restic (`DEBUG_LOG`), opencode (`OPENCODE_DEV_DEBUG`)
**File-based**: lazygit (writes to `LAZYGIT_LOG_PATH`), rclone ( `--log-file`)

**Converges on**: Some runtime mechanism to enable debug (no project requires recompilation).
**Diverges because**: CLI flag feels more discoverable; env vars suit automation/CI scenarios.

### Output Separation Strategies

**stderr for logs, stdout for data**: Most common pattern (helm, k9s, rclone, yq, age).
**File-based logs**: lazygit, rclone (optional), k9s (file required).
**Discard in prod**: chezmoi (NullHandler), dive (discard logger), lazygit (io.Discard).

**Converges on**: Separating user output from diagnostic output.
**Diverges because**: TUIs (k9s, lazygit, dive) have different separation needs than batch CLIs.

### Logging Library Choices

| Library | Repos | Score Range |
|---------|-------|-------------|
| Go stdlib `log/slog` | helm, k9s, rclone, yq, chezmoi, opencode | 6-8 |
| logrus | lazygit, gdu | 3-6 |
| go-logger facade | dive | 7 |
| Custom Logger | go-task | 5 |
| Go stdlib `log` | age, gh-cli, mitchellh-cli, fzf | 2-5 |
| Custom debug | restic | 6 |
| tracef only | urfave-cli | 3 |

## Tradeoffs

| Decision | Benefit | Cost | Best-Fit Context | Failure Mode |
|----------|---------|------|------------------|--------------|
| slog as core | Modern stdlib, structured, level-based | Go 1.21+ required | New projects, modern stacks | Backwards compatibility for older Go versions |
| Custom Logger | Full control, no deps | Maintenance burden, reinventing wheels | When stdlib lacks needed features | Fragmented logging APIs across projects |
| Logrus | Mature, many backends | Additional dependency | When logrus is organizational standard | Not leveraging structured features |
| Binary debug toggle | Simple UX | No granular control | Simple CLIs | Complex apps need subsystem filtering |
| Env var debug | CI-friendly, no CLI change |隐性, easy to forget | Automation, servers | Operators don't discover it |
| File-based logs | Good for post-mortem | No real-time streaming | Long-running daemons | Requires filesystem access |
| Discard-by-default | No early logging accidents | Silent failure if not configured | Library code | Debug logs lost if Set() forgotten |

## Decision Guide

**Choose slog when**:
- Using Go 1.21+
- Want structured logging without dependencies
- Need log levels (Debug/Info/Warn/Error)
- Planning to add JSON output for production

**Choose logrus when**:
- Need mature ecosystem with many backends
- Organizational standard requires it
- Need JSON output and field-based logging

**Choose custom Logger when**:
- Need full control over formatting/color
- slog doesn't support required features
- Willing to maintain custom code

**Use env vars for debug when**:
- Building for CI/automation
- Debug shouldn't appear in CLI help
- Supporting server-side debugging (like `GH_DEBUG=api`)

**Use CLI flags for debug when**:
- Operators need to discover debug capability via `--help`
- Debug is a normal operational mode
- Want to track debug usage via flag

**Choose file-based logs when**:
- Application runs long (daemons, servers)
- Post-mortem debugging is valuable
- Terminal output is not available

**Choose stderr-based logs when**:
- CLI is interactive
- Operators watch logs in real-time
- Simplicity is preferred

## Practical Tips

1. **Always use structured logging** — Even if you use text format, include key-value pairs. Operators can grep but also parse with log aggregation tools.

2. **Separate stdout from stderr** — User output (data, UI) goes to stdout; logs and errors go to stderr. This is the single most important operational pattern.

3. **Provide runtime debug control** — At minimum, a `--debug` flag or `DEBUG` env var. Operators cannot debug production issues if they must modify code.

4. **Use log levels, not binary toggle** — Even 3 levels (Error, Warn, Debug) beat on/off. rclone's 9-level system is excessive for most CLIs.

5. **Name your log fields consistently** — k9s's 50+ structured keys is extreme, but a shared constants package prevents `"filename"` vs `"file_name"` chaos.

6. **Gate expensive debug operations** — yq's `IsEnabledFor(LevelDebug)` guards before `NodeToString()` prevent string construction overhead.

7. **Consider the Printer pattern** — restic's `E()`/`P()`/`V()`/`VV()` interface cleanly separates error output from progressive verbose output.

8. **Add a debug file option** — rclone's `--log-file` with rotation is excellent for production debugging. Even `--log-file` without rotation helps.

9. **Use `defer log.Trace()` for function entry/exit** — rclone demonstrates this pattern well for debugging function flow.

10. **Provide a log tail utility** — lazygit's `--logs` flag with `humanlog` integration shows operator-friendly log consumption.

## Anti-Patterns / Caution Signs

1. **No debug mode** — If operators cannot enable debug without code changes, production debugging is impossible. (fzf, mitchellh-cli score 2-3/10)

2. **Debug output to stdout** — Mixing user output with debug logs makes scripting impossible. (fzf: stats to stdout at `src/core.go:325`)

3. **tracef bypassing output abstraction** — urfave-cli's `tracef` writes directly to `os.Stderr`, bypassing the `ErrWriter` abstraction (`cli.go:46`).

4. **Global logger not initialized** — If `log.Set()` is forgotten, discard-by-default silently drops all logs.

5. **Log file to /dev/null by default** — gdu defaults to `/dev/null`, discarding all logs unless `--log-file` is set.

6. **No output separation for TUIs** — k9s and lazygit are TUI apps where the concept of stdout/stderr is less relevant, but they lack alternative separation mechanisms.

7. **Debug flag parsed late** — If debug state is needed before flag parsing, dynamic checking (like helm's `DebugCheckHandler`) is needed.

8. **No log rotation** — rclone's lumberjack handles this; many projects have unbounded log file growth.

9. **Untyped log fields** — Using `log.Printf("value is %v", val)` instead of `log.Info("value", "val", val)` prevents filtering by field.

10. **Missing evidence discipline** — Several projects had no evidence of telemetry or tracing despite claiming observability.

## Notable Absences

### No OpenTelemetry Integration
Despite OpenTelemetry being the industry standard for distributed tracing, no project has implemented it. The closest was k9s (dependencies present but no SDK integration) and dive (indirect dependencies).

### No Prometheus Metrics in Most CLIs
Only rclone has first-class Prometheus metrics integration via RC server (`fs/rc/rc.go:115`). Most CLIs rely on log-based debugging.

### No Log Sampling
No project implements probabilistic log sampling for high-volume operations. This could be problematic for CLIs processing many items.

### No Structured Error Codes
No project uses structured error codes for programmatic error handling. Errors are plain text to stderr.

### No Log Aggregation Integration
No project integrates directly with ELK, Loki, or cloud logging services. Logs must be manually forwarded.

## Per-Repo Notes

**rclone** — Best-in-class observability. The lumberjack rotation, syslog/journald integration, and Prometheus metrics set the standard. Consider this the reference implementation.

**helm** — Excellent slog usage with dynamic debug checking. The `DebugCheckHandler` pattern allows toggling debug without rebuilding logger.

**k9s** — The `slogs` package with 50+ structured keys is the most comprehensive field naming strategy. File-based logging with tint coloring is operator-friendly.

**yq** — Extensive debug coverage (414 calls) with level guards prevents overhead. The `SetSlogger()` hook allows swapping to JSON output.

**opencode** — Pubsub-based log distribution to TUI is innovative. Session replay files enable post-mortem debugging.

**dive** — The go-logger facade with discard-by-default and nested loggers demonstrates good modularity.

**chezmoi** — Component-tagged logs and `InfoOrError` helper show thoughtful structured logging. Binary debug is limiting.

**lazygit** — JSON logs with `humanlog` consumption is well-designed. File-based debug with tail utility is operator-friendly.

**restic** — The `internal/debug` package with function/file filtering and goroutine tracking is powerful but human-readable only.

**gh-cli** — IOStreams abstraction is good but inconsistent application is the main problem. Telemetry "log" mode is innovative.

**go-task** — Custom Logger with colored output and DebugFunc hook shows dependency-free design. Boolean verbose is limiting.

**age** — Cleanest stdout/stderr separation despite minimal logging. The `errorf`/`warningf` wrappers are simple but effective.

**gdu** — logrus imported but only used for `log.Print`. File-based logging with `/dev/null` default is problematic.

**urfave-cli** — Zero dependencies is admirable but `tracef` bypassing `ErrWriter` is a design flaw.

**mitchellh-cli** — The Ui abstraction is sound but there's no logging to speak of.

**fzf** — pprof is the only observability. Print-style debugging with no runtime control.

## Open Questions

1. **Why do projects avoid slog's JSON handler?** Most projects using slog still use text handler. Is JSON output considered unnecessary for CLIs, or is it an implementation gap?

2. **Will OpenTelemetry ever land in CLIs?** The ecosystem seems ready (dependencies present in some projects) but no implementation exists. What is blocking adoption?

3. **What is the right default for log file destination?** rclone uses `--log-file`, k9s requires a file, lazygit uses env var, most use stderr. Is there a consensus emerging?

4. **Should CLIs have metrics?** rclone's Prometheus integration is rare. Do CLIs need metrics when they're typically short-lived?

5. **Why do some projects (gdu) import logrus but not use structured features?** Is it historical, lack of knowledge, or intentional simplicity?

## Evidence Index

Key evidence citations from per-repo reports:

- age: `cmd/age/tui.go:31` (logger init), `cmd/age/tui.go:37-40` (errorf)
- chezmoi: `internal/chezmoilog/chezmoilog.go:8` (slog), `internal/cmd/config.go:2295-2296` (debug flag)
- dive: `internal/log/log.go:9` (discard default), `cmd/dive/cli/cli.go:31` (logger set)
- fzf: `src/core.go:325` (stats to stdout), `src/options_pprof.go:1` (pprof)
- gdu: `cmd/gdu/main.go:50` (log-file flag), `cmd/gdu/main.go:240` (log.SetOutput)
- gh-cli: `pkg/iostreams/iostreams.go:52-54` (IOStreams), `utils/utils.go:10-29` (GH_DEBUG)
- go-task: `internal/logger/logger.go:132-140` (Logger struct), `taskfile/reader.go:12-13` (DebugFunc)
- helm: `internal/logging/logging.go:31-66` (DebugCheckHandler), `internal/logging/logging.go:71` (stderr handler)
- k9s: `cmd/root.go:103` (tint handler), `internal/slogs/keys.go:6-231` (50+ keys)
- lazygit: `pkg/logs/logs.go:52` (JSON formatter), `pkg/config/app_config.go:24` (debug flag)
- mitchellh-cli: `help.go:48` (log.Printf), `cli.go:119-129` (Writer separation)
- opencode: `internal/logging/logger.go:25-62` (slog wrapper), `internal/config/config.go:163-182` (dev debug)
- rclone: `fs/log/slog.go:21` (slog core), `fs/log.go:34-42` (9 levels), `fs/accounting/prometheus.go:78-108` (metrics)
- restic: `internal/debug/debug.go:13-18` (debug package), `internal/ui/progress/printer.go:15-34` (Printer interface)
- urfave-cli: `cli.go:32-59` (tracef), `cli.go:32` (env var gate)
- yq: `pkg/yqlib/logger.go:5` (slog), `cmd/root.go:76-79` (-v flag)

---

Generated by protocol `study-areas/10-logging-observability.md`.