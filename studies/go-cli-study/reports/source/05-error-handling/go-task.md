# Repo Analysis: go-task

## Error Handling Philosophy

### Repo Info

| Field | Value |
|-------|-------|
| Name | go-task |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/go-task` |
| Group | `05-error-handling` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

go-task implements a comprehensive error handling system with typed errors, sentinel errors, contextual wrapping via `fmt.Errorf %w`, and a clear separation between user-facing and operational errors. Error codes map to exit codes, enabling programmatic handling. The design is consistent across taskfiles, TaskRC, and task execution contexts.

## Rating

**8/10** — Consistent contextual error wrapping with distinct types for task, taskfile, and TaskRC errors. User-facing messages are clear and actionable. `errors.Is`/`errors.As` are used properly. Minor gap: not all operational errors are sentinel-wrapped for comparison.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| `fmt.Errorf %w` wrapping | `fmt.Errorf("task: failed to get variables: %w", err)` | `task.go:410` |
| `fmt.Errorf %w` wrapping | `fmt.Errorf("context cancelled while waiting for repository lock: %w", err)` | `taskfile/node_git.go:141` |
| `fmt.Errorf %w` wrapping | `fmt.Errorf("error reading env file %s: %w", dotEnvPath, err)` | `taskfile/dotenv.go:31` |
| `TaskError` interface | `type TaskError interface { error; Code() int }` | `errors/errors.go:47-50` |
| Typed error - `TaskRunError` | `type TaskRunError struct { TaskName string; Err error }` with `Unwrap()` | `errors/errors_task.go:36-59` |
| Typed error - `TaskNotFoundError` | `type TaskNotFoundError struct { TaskName string; DidYouMean string }` | `errors/errors_task.go:13-32` |
| Typed error - `TaskfileNotFoundError` | `type TaskfileNotFoundError struct { URI string; Walk bool; ... }` | `errors/errors_taskfile.go:14-36` |
| Typed error - `TaskfileDecodeError` | `type TaskfileDecodeError struct { Message, Location, Line, Column, Tag, Snippet string; Err error }` | `errors/error_taskfile_decode.go:15-24` |
| `errors.Is` usage | `errors.Is(err, context.Canceled) \|\| errors.Is(err, context.DeadlineExceeded)` | `watch.go:152` |
| `errors.Is` usage | `errors.Is(err, graph.ErrEdgeCreatesCycle)` | `taskfile/reader.go:393` |
| `errors.Is` usage | `errors.Is(err, os.ErrPermission)` | `taskfile/node_file.go:30` |
| `errors.As` usage | `errors.As(err, &exit)` to extract exit status | `errors/errors_task.go:51` |
| Sentinel error | `ErrPreconditionFailed = errors.New("task: precondition not met")` | `precondition.go:14` |
| Sentinel error | `ErrPromptCancelled = errors.New("prompt cancelled")` | `internal/logger/logger.go:20` |
| Sentinel error | `ErrCancelled = errors.New("prompt cancelled")` | `internal/input/input.go:15` |
| Exit code mapping | `CodeTaskRunError = iota + 200` → `os.Exit(err.Code())` | `errors/errors.go:34-35`, `cmd/task/task.go:39` |
| User-facing error rendering | `l.Errf(logger.Red, "%v\n", err)` with color | `cmd/task/task.go:33` |
| CI annotation | `fmt.Fprintf(os.Stdout, "::error title=Task '%s' failed::%v\n", ...)` | `cmd/task/task.go:54` |

## Answers to Protocol Questions

### 1. Are errors wrapped with context?

Yes. go-task uses `fmt.Errorf` with `%w` throughout for error wrapping:

- `task.go:410`: `fmt.Errorf("task: failed to get variables: %w", err)` wraps variable compilation errors with task context.
- `taskfile/node_git.go:141`: `fmt.Errorf("context cancelled while waiting for repository lock: %w", err)` wraps lock acquisition errors.
- `taskfile/dotenv.go:31`: `fmt.Errorf("error reading env file %s: %w", dotEnvPath, err)` wraps file read errors with path context.

Typed errors also carry structured context fields (e.g., `TaskNotFoundError.TaskName`, `TaskfileNotFoundError.URI`) that are rendered in `Error()` methods.

### 2. Which errors are user-facing vs operational?

**User-facing errors** produce colored, human-readable messages via `logger.Errf` in `cmd/task/task.go:33` and error type `Error()` methods. Examples:
- `TaskNotFoundError` (`errors/errors_task.go:18-28`) — includes "Did you mean?" suggestions.
- `TaskfileNotFoundError` (`errors/errors_taskfile.go:21-32`) — suggests `task --init`.
- `TaskCancelledByUserError` (`errors/errors_task.go:126-128`) — explains prompt cancellation.

**Operational errors** are wrapped but primarily useful for debugging:
- `TaskRunError` (`errors/errors_task.go:41-43`) — wraps shell command errors including exit codes.
- Network/timeout errors (`errors/errors_taskfile.go:165-179`) — carries URI and timeout for diagnostics.
- Decode errors (`errors/error_taskfile_decode.go:40-66`) — renders YAML line/column/snippet for users.

The separation is implicit via the `TaskError` interface code method, which drives exit codes. All errors are rendered to the user; operational vs user-facing distinction is not explicitly categorized.

### 3. How are fatal vs recoverable failures handled?

go-task does not have an explicit fatal/recoverable distinction. However:

- **Recoverable**: Most errors (file not found, network timeout) return error values that cause task skip or retry logic. The `TaskRunError.Unwrap()` (`errors/errors_task.go:57-59`) allows callers to inspect underlying shell errors.
- **Fatal-ish**: `TaskInternalError` (`errors/errors_task.go:61-72`) marks internal tasks as non-runnable, which is treated as a hard failure.
- **Cyclic dep guard**: `TaskCalledTooManyTimesError` (`errors/errors_task.go:104-119`) prevents infinite loops by hard-limiting task call depth to 1000 (`task.go:31`).
- Context cancellation (`watch.go:147-152`) uses `errors.Is` to detect `context.Canceled`/`DeadlineExceeded` and treat them as non-error completion paths in watch mode.

No explicit `panic` recovery exists in the core executor; errors propagate through the call stack.

### 4. Are sentinel errors used for programmatic checking?

Partially. Sentinel errors exist but are not the primary pattern:

- `ErrPreconditionFailed` (`precondition.go:14`) — checked via `errors.Is` in `precondition.go:24`.
- `ErrPromptCancelled` (`internal/logger/logger.go:20`) — checked via `errors.Is` in `task.go:255`.
- `ErrCancelled` (`internal/input/input.go:15`) — checked via `errors.Is` in `requires.go:86,125`.
- `ErrNoTerminal` (`internal/logger/logger.go:21`) — checked via `errors.Is` in `task.go:253`.

However, the dominant pattern is typed errors (structs implementing `TaskError`) checked via `errors.As` or type assertions (`cmd/task/task.go:31,36`). Sentinel errors are used for simple conditions (user cancellation, precondition failure); typed errors handle complex scenarios (task not found, parse errors).

## Architectural Decisions

1. **Exit code as error type code**: The `TaskError` interface requires a `Code()` method (`errors/errors.go:47-50`) that maps to process exit codes. This enables CI systems to distinguish error types without parsing stderr (`cmd/task/task.go:31-43`).

2. **Structured decode errors**: `TaskfileDecodeError` (`errors/error_taskfile_decode.go:15-24`) carries location, line, column, tag, and snippet — allowing rich error rendering with YAML source context (`Error()` method, lines 40-66).

3. **Error wrapping via private wrapper types**: Instead of exporting wrapper types, go-task wraps via `fmt.Errorf %w` and exposes underlying errors through `Unwrap()` methods on typed errors (`TaskRunError.Unwrap()` at `errors/errors_task.go:57-59`).

4. **"Did you mean?" suggestions**: `TaskNotFoundError` (`errors/errors_task.go:13-16`) carries a `DidYouMean` field populated by fuzzy matching in `executor.go`, providing actionable user guidance.

## Notable Patterns

- **Colorized terminal output**: Errors render in red via `logger.Errf(logger.Red, ...)` (`cmd/task/task.go:33`).
- **CI annotation**: GitHub Actions `::error` annotations emitted via `emitCIErrorAnnotation` (`cmd/task/task.go:48-58`).
- **Fuzzy matching for error recovery**: `TaskNotFoundError.DidYouMean` populated from fuzzy suggestions (`executor.go` pattern).
- **Offline/cache graceful fallback**: `TaskfileCacheNotFoundError` (`errors/errors_taskfile.go:120-133`) provides user guidance when offline.

## Tradeoffs

- **Typed errors vs sentinels**: Preference for typed errors over sentinels makes programmatic error handling more powerful (structured data) but requires `errors.As` rather than simple `errors.Is` comparison.
- **No fatal vs recoverable enum**: No explicit severity classification; all errors are treated similarly at the top-level. Cyclic dep protection is hard-coded, not generalized.
- **Error message language**: All messages are English, with "task:" prefix indicating CLI origin. No i18n mechanism exists.

## Failure Modes / Edge Cases

- **Cyclic includes**: Detected via `graph.ErrEdgeCreatesCycle` check (`taskfile/reader.go:393`) producing `TaskfileCycleError` with source/destination paths.
- **Infinite task loops**: Prevented by `MaximumTaskCall = 1000` counter (`task.go:31`); produces `TaskCalledTooManyTimesError` (`errors/errors_task.go:104-119`).
- **Missing required vars**: `TaskMissingRequiredVarsError` (`errors/errors_task.go:156-182`) lists all missing vars, not just the first.
- **Invalid var values**: `TaskNotAllowedVarsError` (`errors/errors_task.go:190-207`) shows which vars have invalid values and allowed enum lists.
- **Non-terminal prompt**: `TaskCancelledNoTerminalError` (`errors/errors_task.go:134-148`) distinguishes missing terminal from user rejection.
- **Shell exit code propagation**: `TaskRunError.TaskExitCode()` (`errors/errors_task.go:49-55`) extracts `interp.ExitStatus` from shell errors, preserving exit codes for CI.

## Future Considerations

- Export sentinel errors for all `TaskError` subtypes so callers can use `errors.Is` uniformly.
- Consider adding error severity levels (fatal/recoverable/warning) to guide error handling strategy.
- Add structured logging (JSON) option for operational errors in addition to user-facing colorized output.

## Questions / Gaps

- No evidence of error retry logic for transient failures (network, file locks).
- No evidence of error aggregation (multiple errors collected and reported together).
- No evidence of error bus or event-driven error dispatch.
- `errors.Is` usage is limited to `context.Canceled`, `context.DeadlineExceeded`, `os.ErrPermission`, `os.ErrNotExist`, `graph.ErrEdgeCreatesCycle`, and logger sentinels — not used with custom task errors.

---

Generated by `study-areas/05-error-handling.md` against `go-task`.