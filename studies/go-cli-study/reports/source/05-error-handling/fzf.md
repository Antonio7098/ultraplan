# Repo Analysis: fzf

## Error Handling Philosophy

### Repo Info

| Field | Value |
|-------|-------|
| Name | fzf |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/fzf` |
| Group | `study-areas/05-error-handling.md` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

fzf uses simple sentinel error constants with `errors.New` for validation errors. Error wrapping with `%w` is used sparingly (only in profiling code). The project distinguishes fatal vs recoverable errors through exit codes, with user-facing errors printed to stderr. There is no custom error type hierarchy — errors are plain strings wrapped in `errors.New` or formatted via `fmt.Errorf`.

## Rating

**5/10** — Some contextual wrapping in profiling, but validation errors lack wrapping context and there's no programmatic error type hierarchy.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Sentinel errors | `ExitError = 2`, `ExitOk = 0`, `ExitNoMatch = 1`, `ExitBecome = 126`, `ExitInterrupt = 130` | `src/constants.go:72-76` |
| Error wrapping with %w | `fmt.Errorf("could not create CPU profile: %w", err)` | `src/options_pprof.go:19` |
| Error wrapping with %w | `fmt.Errorf("could not start CPU profile: %w", err)` | `src/options_pprof.go:23` |
| Error wrapping with %w | `fmt.Errorf("could not create MEM profile: %w", err)` | `src/options_pprof.go:46` |
| Error wrapping with %w | `fmt.Errorf("could not create BLOCK profile: %w", err)` | `src/options_pprof.go:58` |
| Error wrapping with %w | `fmt.Errorf("could not create MUTEX profile: %w", err)` | `src/options_pprof.go:67` |
| Sentinel via errors.New | `errors.New("FZF_API_KEY is required to allow remote access")` | `src/server.go:86` |
| Sentinel via errors.New | `errors.New("invalid history file: " + e.Error())` | `src/history.go:24` |
| Sentinel via errors.New | `errors.New("permission denied: " + path)` | `src/history.go:22` |
| errors.Is usage | `errors.Is(err, net.ErrClosed)` | `src/server.go:134` |
| fmt.Errorf without %w | `fmt.Errorf("invalid listen address: %s", address)` | `src/server.go:68` |
| fmt.Errorf without %w | `fmt.Errorf("invalid listen port: %s", portStr)` | `src/server.go:73` |
| Exit code propagation | `return ExitError, err` pattern | `src/proxy.go:65,95,143,176` |
| User-facing error output | `fmt.Fprintln(os.Stderr, err.Error())` | `main.go:46` |
| Error as program exit | `exit(fzf.ExitError, err)` | `main.go:56` |
| Validation errors | `errors.New("invalid algorithm (expected: v1 or v2)")` | `src/options.go:950` |
| Validation errors | `errors.New("invalid border style (...)")` | `src/options.go:991` |
| Error type struct | `quitSignal{ExitError, err}` passed via event box | `src/terminal.go:5875` |

## Answers to Protocol Questions

### 1. Are errors wrapped with context?

**Partially.** Wrapping with `%w` is used only in `src/options_pprof.go:19-67` for profiling errors. Most other errors use `errors.New("message")` without wrapping underlying causes. For example, `src/server.go:68` uses `fmt.Errorf` without `%w`, losing the chain.

Validation errors in `src/options.go` (e.g., lines 950, 991, 1295) return plain `errors.New` with descriptive messages but no underlying error context.

### 2. Which errors are user-facing vs operational?

**User-facing errors:** Validation errors from option parsing (e.g., `invalid algorithm`, `invalid border style`) are printed to stderr via `exit()` in `main.go:44-48` when `code == ExitError`.

**Operational errors:** Profiling errors (`options_pprof.go`) are returned as errors but not directly user-facing since profiling is a debugging feature.

**Distinction:** The project does not implement a formal separation. Errors are printed to stderr based on exit code, not error type or source.

### 3. How are fatal vs recoverable failures handled?

**Fatal failures:** Return `ExitError` (code 2) which triggers stderr output in `main.go:44-48`. Examples: option parsing failures (`src/options.go:950`), become command failures (`src/proxy.go:166`), history file errors (`src/history.go:22-24`).

**Recoverable failures:** Return `ExitOk` (code 0) or `ExitNoMatch` (code 1) — no error output. `server.go:134` uses `errors.Is(err, net.ErrClosed)` to handle closed network connections gracefully.

**become command:** Returns `ExitBecome` (126) to signal a special exit condition where fzf executes another command (`src/proxy.go:157`).

**Interrupt handling:** `ExitInterrupt` (130) is defined for SIGINT (`src/constants.go:76`), separate from general errors.

### 4. Are sentinel errors used for programmatic checking?

**Yes, but limited.** The primary sentinel pattern is exit codes (`ExitError`, `ExitOk`, `ExitNoMatch`, `ExitBecome`, `ExitInterrupt`) defined in `src/constants.go:72-76`. These are checked in `main.go:45` and `src/proxy.go:157`.

**errors.Is usage:** `src/server.go:134` checks `errors.Is(err, net.ErrClosed)` for network operations.

**No custom error types:** There are no exported error variables for comparison (e.g., `var ErrInvalidAlgo = errors.New(...)`). Error checking is done via string matching on error messages or via `*exec.ExitError` type assertion (`src/proxy.go:155`).

**Validation sentinel anti-pattern:** Each validation function returns a new `errors.New` with context — there are no shared sentinel instances that callers could check with `errors.Is`.

## Architectural Decisions

1. **Exit codes as primary error semantics.** fzf uses integer exit codes rather than typed errors to communicate outcome. This is conventional for CLI tools but provides no structured error information.

2. **Plain error messages for validation.** `src/options.go` returns `errors.New` for each validation failure with no shared sentinels, making it impossible to programmatically distinguish between error types without string matching.

3. **Event-based error propagation.** Terminal errors are passed via `quitSignal{ExitError, err}` through an event box (`src/terminal.go:5875`), decoupling error generation from handling.

4. **Build-tag gated profiling.** Profiling errors use proper `%w` wrapping (`src/options_pprof.go`) while the non-pprof build returns a static error message (`src/options_no_pprof.go:10`).

## Notable Patterns

- **`exit()` function** (`main.go:44-49`) conditionally prints error to stderr based on exit code
- **Error-only exit codes** — `ExitError` is used for all failures regardless of cause
- **No error hierarchy** — no custom error types or error interfaces
- **`fmtError` helper** in `src/history.go:20-25` transforms permission and general errors into user messages

## Tradeoffs

**Pros:**
- Simple error model aligned with Unix conventions
- Clear exit code semantics for scripting integration
- `quitSignal` struct allows error propagation through event system

**Cons:**
- No programmatic error type checking (no `errors.Is` for project-specific errors)
- Validation errors lose context when wrapping underlying causes
- All errors treated equivalently — no distinction between user mistakes vs internal failures

## Failure Modes / Edge Cases

1. **Error message stability** — Validation errors rely on exact string matching. Changing error messages could break external callers that depend on them.

2. **No error chain visibility** — `%w` wrapping is absent in non-pprof paths, making debugging difficult for nested failures.

3. **Exit code ambiguity** — `ExitError` (2) is used for both configuration errors and runtime failures. Scripts cannot distinguish failure types without parsing stderr.

4. **become command errors** — `src/proxy.go:166` returns `ExitError` for invalid become commands but the error message is plain `errors.New` with no structured data.

## Future Considerations

1. Could introduce sentinel errors for commonly-checked conditions (invalid algorithm, invalid border style) to enable `errors.Is` checks.

2. Could add a distinction between user-facing validation errors and internal errors with different rendering strategies.

3. Error wrapping could be added to `server.go` and `history.go` to preserve error chains.

## Questions / Gaps

- No evidence found of structured error types or error interfaces
- No evidence of error logging (only error output to stderr)
- No evidence of error recovery mechanisms within the core loop
- Profiling code is the only place where `%w` wrapping is used, suggesting inconsistent error context preservation