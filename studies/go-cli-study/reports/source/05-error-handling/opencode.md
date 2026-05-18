# Repo Analysis: opencode

## Error Handling Philosophy

### Repo Info

| Field | Value |
|-------|-------|
| Name | opencode |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

opencode implements a thorough error handling philosophy centered on contextual wrapping via `fmt.Errorf` with `%w`, sentinel errors for programmatic checking, and clear separation between user-facing errors (rendered in TUI) and operational errors (logged via structured logging). The codebase shows consistent error propagation with context at every layer.

## Rating

**8/10** — Consistent contextual error wrapping throughout. Clear separation between user-facing messages and operational log entries. Sentinel errors enable programmatic handling. Minor gap: no custom error types carrying structured data (only sentinel errors).

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Error wrapping with `%w` | 172 occurrences across codebase | `internal/llm/agent/agent.go:238` |
| Sentinel errors | `ErrRequestCancelled`, `ErrSessionBusy` defined | `internal/llm/agent/agent.go:25-26` |
| Sentinel errors | `ErrorPermissionDenied` for permission denial | `internal/permission/permission.go:14` |
| `errors.Is` checking | Used for `ErrRequestCancelled`, `context.Canceled` | `internal/llm/agent/agent.go:220` |
| `errors.Is` checking | Used for `permission.ErrorPermissionDenied` | `internal/llm/agent/agent.go:396` |
| `errors.As` checking | Used for API error type inspection | `internal/llm/provider/openai.go:339` |
| Error rendering | TUI displays "Permission denied" user message | `internal/llm/agent/agent.go:397-401` |
| Error logging | `logging.ErrorPersist` for operational errors | `internal/llm/agent/agent.go:221` |
| Panic recovery | `RecoverPanic` logs and writes panic files | `internal/logging/logger.go:67-94` |
| Context cancellation | `context.Canceled` checked via `errors.Is` | `internal/llm/agent/agent.go:286` |
| Fatal vs recoverable | Permission denied cancels remaining tool calls | `internal/llm/agent/agent.go:401-410` |
| Tool not found error | Returns error message, doesn't panic | `internal/llm/agent/agent.go:382-388` |

## Answers to Protocol Questions

### 1. Are errors wrapped with context?

**Yes.** The codebase uses `fmt.Errorf` with `%w` extensively. Every error propagating from lower layers includes actionable context. Examples:

- `fmt.Errorf("failed to list messages: %w", err)` (`internal/llm/agent/agent.go:238`)
- `fmt.Errorf("failed to process events: %w", err)` (`internal/llm/agent/agent.go:291`)
- `fmt.Errorf("error executing command: %w", err)` (`internal/llm/tools/bash.go:290`)

172 occurrences of `%w` wrapping across the codebase.

### 2. Which errors are user-facing vs operational?

**User-facing errors**: Rendered via TUI components as tool result content with `IsError: true`. Examples:
- "Tool not found: {name}" (`internal/llm/agent/agent.go:385`)
- "Permission denied" (`internal/llm/agent/agent.go:399`)
- "Command was aborted before completion" (`internal/llm/tools/bash.go:301`)
- "Exit code {code}" (`internal/llm/tools/bash.go:306`)

**Operational errors**: Logged via structured `slog` logging functions (`logging.ErrorPersist`, `logging.WarnPersist`). Examples:
- `logging.ErrorPersist(result.Error.Error())` (`internal/llm/agent/agent.go:221`) — only logs if error is NOT `ErrRequestCancelled` or `context.Canceled`
- `logging.ErrorPersist(event.Error.Error())` (`internal/llm/agent/agent.go:480`)
- Panic recovery writes to timestamped log files (`internal/logging/logger.go:73-88`)

### 3. How are fatal vs recoverable failures handled?

**Recoverable failures**: 
- Rate limit errors trigger exponential backoff with jitter (`internal/llm/provider/openai.go:354-356`)
- Retries up to `maxRetries` with `Retry-After` header respect (`internal/llm/provider/openai.go:357-359`)
- Context cancellation returns `ErrRequestCancelled` gracefully (`internal/llm/agent/agent.go:289`)

**Fatal failures**:
- Permission denial cancels all remaining tool calls in the batch (`internal/llm/agent/agent.go:401-410`)
- Panic recovery executes cleanup functions and writes stack trace to file (`internal/logging/logger.go:67-94`)
- Unrecoverable errors (e.g., session busy) return sentinel error immediately without retry (`internal/llm/agent/agent.go:204`)

### 4. Are sentinel errors used for programmatic checking?

**Yes.** The codebase defines exported sentinel errors:

```go
// internal/llm/agent/agent.go:25-26
var (
    ErrRequestCancelled = errors.New("request cancelled by user")
    ErrSessionBusy      = errors.New("session is currently processing another request")
)

// internal/permission/permission.go:14
var ErrorPermissionDenied = errors.New("permission denied")
```

These are checked via `errors.Is()`:
- `errors.Is(result.Error, agent.ErrRequestCancelled)` (`internal/app/app.go:138`)
- `errors.Is(toolErr, permission.ErrorPermissionDenied)` (`internal/llm/agent/agent.go:396`)

No custom error types (structs implementing `Error()` method) found — only sentinel errors.

## Architectural Decisions

1. **Panic recovery at top of goroutines**: Every goroutine entry point (e.g., `agent.Run` at line 212, `main` at line 9) uses `defer logging.RecoverPanic()` to catch panics, write stack trace to file, and graceful cleanup.

2. **Error events via pub/sub**: Agent emits `AgentEvent{Type: AgentEventTypeError, Error: err}` through a broker. TUI subscribes and renders appropriately.

3. **Tool call batching on permission denial**: When permission is denied mid-batch, all remaining tool calls are canceled with "Tool execution canceled by user" (`internal/llm/agent/agent.go:402-408`).

4. **Separate cancellation tracking**: Active requests stored in `sync.Map` with cancel functions for both regular and summarize requests (`internal/llm/agent/agent.go:117-132`).

## Notable Patterns

- **Error channel pattern**: `agent.Run` returns `(<-chan AgentEvent, error)` where actual results come through channel, allowing streaming of partial results.
- **Context propagation**: Context carries `SessionIDContextKey` and `MessageIDContextKey` for tool access to session metadata.
- **Persist suffix**: `logging.InfoPersist`, `logging.ErrorPersist` ensure messages survive log rotation.
- **Exponential backoff**: Rate limit retry uses `backoffMs := 2000 * (1 << (attempts - 1))` with 20% jitter.

## Tradeoffs

- **No custom error types**: Only sentinels, no structured error data. Callers cannot inspect error details beyond `errors.Is`/`errors.As`. Could be limiting for fine-grained error handling in provider layer.
- **All errors logged at Error level**: Operational errors like rate limits are `WarnPersist`, but retry exhaustion becomes error. Consistent severity classification relies on developer discipline.
- **Tool cancellation is silent**: When permission denied cancels remaining tool calls, no error event is published — just the tool results get populated with cancellation messages.

## Failure Modes / Edge Cases

- **Session busy**: Returns `ErrSessionBusy` sentinel immediately. Caller must handle.
- **Provider initialization failure**: `createAgentProvider` returns error if model/provider unsupported or disabled (`internal/llm/agent/agent.go:706-757`). App fails to start.
- **Context cancellation mid-stream**: `processEvent` checks `ctx.Done()` before processing each event (`internal/llm/agent/agent.go:344-347`). Returns `context.Canceled` which is then converted to `ErrRequestCancelled`.
- **EOF handling**: Stream completion checked via `errors.Is(err, io.EOF)` across all providers (`internal/llm/provider/openai.go:284`, `internal/llm/provider/anthropic.go:359`, etc.).

## Future Considerations

- Custom error types with structured fields (e.g., `RateLimitError{RetryAfter time.Duration}`) could replace numeric parsing from headers.
- Error wrapping chain depth should be monitored — deep chains may impact `errors.Is` performance.

## Questions / Gaps

- **No evidence found** for error aggregation (collecting multiple errors before returning). Single error propagation dominates.
- **No evidence found** for error recovery strategies beyond retry with backoff. No circuit breakers.
- **No evidence found** for error metrics or monitoring integration.

---

Generated by `study-areas/05-error-handling.md` against `opencode`.