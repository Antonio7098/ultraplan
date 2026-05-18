# Repo Analysis: gdu

## Error Handling Philosophy

### Repo Info

| Field | Value |
|-------|-------|
| Name | gdu |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` |
| Group | `gdu` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

gdu implements error wrapping with `%w` throughout but lacks a structured error type hierarchy. Sentinel errors exist via `errors.New` but are not used with `errors.Is`/`errors.As`. The project uses panic for "not implemented" stub methods in internal data structures but otherwise returns errors up the call chain. User-facing errors are rendered via modal dialog in TUI mode.

## Rating

**5/10** — Some wrapping/context. Errors are consistently wrapped with context via `%w`, and user-facing errors display in a modal. However, no custom error types, no `errors.Is`/`errors.As` usage, and panic used for stub methods.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Error wrapping with %w | `fmt.Errorf("invalid --since value: %w", err)` | `pkg/timefilter/timefilter.go:36` |
| Error wrapping with %w | `fmt.Errorf("creating sqlite analyzer: %w", err)` | `cmd/gdu/app/app.go:246` |
| Error wrapping with %w | `fmt.Errorf("scanning dir: %w", err)` | `cmd/gdu/app/app.go:620` |
| Sentinel errors (errors.New) | `errors.New("JSON file does not contain top level array")` | `report/import.go:28` |
| Sentinel errors (errors.New) | `errors.New("exporting devices list is not supported")` | `report/export.go:71` |
| Sentinel errors (errors.New) | `errors.New("Only Linux platform is supported for listing devices")` | `pkg/device/dev_other.go:15` |
| User-facing error rendering | `showErr` displays modal with text + err.Error() | `tui/show.go:313-331` |
| Log-level error handling | `log.Errorf("failed to rollback transaction: %v", rollbackErr)` | `pkg/analyze/sqlite.go:131` |
| Panic for stub methods | `panic("not implemented")` | `pkg/analyze/top_dir.go:67` |
| No errors.Is/As usage | No matches found in codebase | — |

## Answers to Protocol Questions

1. **Are errors wrapped with context?**
   Yes. The codebase uses `fmt.Errorf` with `%w` throughout for error wrapping. Examples include `pkg/timefilter/timefilter.go:36-68` (4 instances for time filter validation), `cmd/gdu/app/app.go:246` (sqlite analyzer creation), and `cmd/gdu/app/app.go:620` (directory scanning). Contextual information is added at each wrap site (e.g., "invalid --since value", "creating sqlite analyzer", "scanning dir").

2. **Which errors are user-facing vs operational?**
   User-facing errors are rendered via the `showErr` function in `tui/show.go:313-331`, which creates a modal dialog with the error message. These include errors from file operations (show_file.go:41,46,63,68,81), device listing (keys.go:361), and directory analysis (keys.go:388). Operational errors are logged via `log.Printf` and `log.Errorf` throughout, such as in `pkg/analyze/sqlite.go:131` for transaction rollback failures. No explicit error type hierarchy distinguishes between the two categories.

3. **How are fatal vs recoverable failures handled?**
   Recoverable errors are returned up the call chain and either displayed to the user or logged. Fatal failures manifest as panics in two contexts: (1) stub methods for internal data structures like `SimpleDir` and `ParentDir` that are documented as "not implemented" (`pkg/analyze/top_dir.go:67-78`, `pkg/analyze/stored.go:413-437`), and (2) a config file close error at `cmd/gdu/main.go:236`. The codebase does not use a distinct fatal/recoverable error type pattern.

4. **Are sentinel errors used for programmatic checking?**
   Sentinel errors exist via `errors.New` in `report/import.go:28-54` (JSON parsing), `report/export.go:71,76` (unsupported features), `pkg/device/dev_other.go:15,20` (platform not supported), and `pkg/device/dev_bsd.go:54` (mount parsing). However, there is no usage of `errors.Is` or `errors.As` anywhere in the codebase to check against these sentinels. The sentinels appear to be used only as return values, not for programmatic error handling.

## Architectural Decisions

- **Error wrapping granularity**: Each function that propagates errors wraps them with context relevant to that layer (e.g., "scanning dir" at app.go:620, "creating sqlite analyzer" at app.go:246). This creates a traceable error chain.
- **No custom error types**: Errors are plain `error` interface values. No struct types implementing `error` interface with additional context fields.
- **Panic for internal invariants**: Stub methods on internal data structures (`SimpleDir`, `ParentDir`) use panic to enforce that they are never called. This is a deliberate design choice for placeholder implementations.

## Notable Patterns

- **Consistent %w wrapping**: All error returns in the analyzed files use `fmt.Errorf` with `%w` for wrapping, not `errors.Wrap` (which doesn't exist in standard library).
- **Modal error display**: TUI uses `showErr` to render errors as modal dialogs with user-friendly formatting (`tui/show.go:313-331`).
- **Platform-specific sentinels**: Device detection uses `errors.New` for platform-unsupported conditions (`pkg/device/dev_other.go:15,20`).
- **Silent logging of operational errors**: Database transaction failures log via `log.Errorf` but don't interrupt flow (e.g., `pkg/analyze/sqlite.go:131`).

## Tradeoffs

- **No error type hierarchy**: Using only plain errors makes the code simple but prevents structured error categories that could be programmatically handled (e.g., distinguishing transient from permanent failures).
- **No errors.Is/As usage**: Without programmatic error checking, sentinels exist but cannot be used for recovery logic. Error handling is limited to logging and display.
- **Panic for internal stubs**: While panics in stub methods are intentional for internal invariants, they could cause uncaught crashes if these methods are accidentally invoked in production.

## Failure Modes / Edge Cases

- **Database transaction failures**: SQLite operations log rollback errors (`pkg/analyze/sqlite.go:131,143,156`) but continue execution. This could lead to inconsistent state if transactions fail mid-operation.
- **Config file permission errors**: Errors reading config files are logged but only stored in `configErr` variable; the application continues with defaults (`cmd/gdu/main.go:242-244`).
- **JSON import parsing**: `report/import.go` returns specific sentinel errors for malformed JSON files (lines 28-54), but these are displayed to user rather than handled programmatically.

## Future Considerations

- Introduce custom error types for distinct error categories (e.g., `ErrPlatformNotSupported`, `ErrAnalysisIncomplete`) to enable `errors.Is` checks.
- Add structured logging with error codes for operational errors to improve production debugging.
- Consider replacing panics in stub methods with returned errors for safer extensibility.

## Questions / Gaps

- **No evidence found** of `errors.Is` or `errors.As` usage for sentinel error checking. All sentinel errors are returned but never checked against.
- **No evidence found** of error type hierarchies or custom error structs with additional context fields.
- **No evidence found** of retry logic or recovery mechanisms for transient failures.

---

Generated by `study-areas/05-error-handling.md` against `gdu`.