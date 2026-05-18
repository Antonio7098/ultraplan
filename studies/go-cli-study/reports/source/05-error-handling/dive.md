# Repo Analysis: dive

## Error Handling Philosophy

### Repo Info

| Field | Value |
|-------|-------|
| Name | dive |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/dive` |
| Group | `dive` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Dive uses a layered error strategy: consistent `fmt.Errorf` wrapping with `%w` for propagation, structured logging via `github.com/anchore/go-logger`, and a custom `PathError` type. However, the project relies heavily on `panic` for unrecoverable conditions (manifest/config parsing failures, programmer errors), and lacks exported sentinel errors for programmatic error checking. User-facing errors are returned through the command chain while internal operational errors are logged.

## Rating

**6/10** — Some contextual error wrapping, but inconsistent use of panics for what appear to be operational errors (e.g., unmarshaling failures). No exported sentinel errors for callers to use with `errors.Is`.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Error wrapping with `%w` | `fmt.Errorf("failed to get docker connection helper: %w", err)` | `dive/image/docker/engine_resolver.go:84` |
| Error wrapping with `%w` | `fmt.Errorf("cannot load image: %w", err)` | `cmd/dive/cli/internal/command/root.go:55` |
| Error wrapping with `%w` | `fmt.Errorf("cannot marshal export payload: %w", err)` | `cmd/dive/cli/internal/command/adapter/exporter.go:47` |
| Custom error type | `type PathError struct { Path string; Action FileAction; Err error }` | `dive/filetree/path_error.go:23` |
| `errors.Is` usage | `errors.Is(err, gocui.ErrUnknownView)` | `internal/utils/view.go:15` |
| `errors.Is` usage | `errors.Is(err, gocui.ErrQuit)` | `cmd/dive/cli/internal/ui/v1/app/app.go:49` |
| `errors.New` usage | `errors.New("unable to move the cursor, empty line")` | `cmd/dive/cli/internal/ui/v1/view/cursor.go:29` |
| `errors.New` usage | `errors.New("evaluation failed")` | `cmd/dive/cli/internal/command/root.go:91` |
| Panic for unmarshal failure | `panic(fmt.Errorf("failed to unmarshal manifest: %w", err))` | `dive/image/docker/manifest.go:18` |
| Panic for config failure | `panic(fmt.Errorf("failed to unmarshal docker config: %w", err))` | `dive/image/docker/config.go:31` |
| Panic for file read | `panic(fmt.Errorf("unable to read file: %w", err))` | `dive/filetree/file_info.go:130` |
| Structured logging | `log.WithFields("error", err).Debug("unable to propagate tree")` | `dive/filetree/efficiency.go:68` |
| Structured logging | `log.WithFields("cmd", fullCmd).Trace("executing")` | `dive/image/docker/cli.go:22` |
| Log helper wrapper | `log.Errorf`, `log.Debug`, `log.Warn` | `internal/log/log.go:22-68` |
| Nested log context | `log.Nested("ui", "filetree")` | `cmd/dive/cli/internal/ui/v1/view/filetree.go:44` |
| CI panic (programming error) | `panic(fmt.Errorf("CI rule result recorded twice: %s", rule.Key()))` | `cmd/dive/cli/internal/command/ci/evaluator.go:119` |
| CI panic (invalid state) | `panic(fmt.Errorf("unknown test status (rule='%v'): %v", rule, result.status))` | `cmd/dive/cli/internal/command/ci/evaluator.go:148` |
| Controller panic | `panic("CurrentView is nil")` | `cmd/dive/cli/internal/ui/v1/app/controller.go:157` |
| Cursor panic | `panic("comparing mismatched nodes")` | `dive/filetree/file_node.go:350` |
| Silent log discard | `var log = discard.New()` (default) | `internal/log/log.go:9` |

## Answers to Protocol Questions

### 1. Are errors wrapped with context?

**Yes, but inconsistently.** Most command-layer errors use `fmt.Errorf` with `%w` for contextual wrapping (`cmd/dive/cli/internal/command/root.go:43-82`). However, the project uses `panic` for unmarshaling failures at the data layer (e.g., `dive/image/docker/manifest.go:18`, `dive/image/docker/config.go:31`), treating them as unrecoverable rather than wrapping and propagating.

### 2. Which errors are user-facing vs operational?

**User-facing errors** flow through the command `RunE` chain via returned errors with context (e.g., "cannot load image", "cannot analyze image"). These reach the CLI user via cobra's error handling.

**Operational errors** are logged at Debug/Trace level (e.g., `dive/filetree/efficiency.go:68`, `dive/image/docker/cli.go:22`) and are not surfaced to users by default.

The split is functional but implicit — there is no formal separation via distinct error types or rendering paths.

### 3. How are fatal vs recoverable failures handled?

**Recoverable errors**: Returned as `error` from functions, wrapped with `%w`, propagated up the call chain.

**Fatal errors**: Handled via `panic` in several cases:
- Manifest/config unmarshaling failures (`dive/image/docker/manifest.go:18`, `dive/image/docker/config.go:31`)
- File read/write operations (`dive/filetree/file_info.go:130`, `138`)
- Programming errors in CI evaluator (`cmd/dive/cli/internal/command/ci/evaluator.go:119`, `148`)
- UI controller invariants (`cmd/dive/cli/internal/ui/v1/app/controller.go:157`, `181`)

The panic strategy suggests the team treats certain failures as "cannot continue" rather than gracefully degrading.

### 4. Are sentinel errors used for programmatic checking?

**No.** There are no exported `var ErrX = errors.New("...")` sentinel variables. The only `errors.New` call is at `cmd/dive/cli/internal/ui/v1/view/cursor.go:29` (an unexported error). The `PathError` type (`dive/filetree/path_error.go:23`) is used locally but not exported for external error inspection. Callers cannot use `errors.Is` against project-specific sentinels.

## Architectural Decisions

1. **Centralized logger wrapper**: All logging goes through `internal/log/log.go:9` which defaults to a discard logger and can be replaced via `log.Set()`. This abstracts the underlying logger (github.com/anchore/go-logger) and allows structured field-based logging.

2. **Command-chain error propagation**: Errors from the main `RunE` function in `cmd/dive/cli/internal/command/root.go:41-59` are wrapped at each step and returned to cobra, which renders them to the user.

3. **Panic for parse errors**: Manifest and config unmarshaling uses panic (`dive/image/docker/manifest.go:18`, `dive/image/docker/config.go:31`) rather than returning errors, treating malformed input as fatal application errors rather than recoverable conditions.

4. **Nested log contexts**: UI components use `log.Nested("ui", "filetree")` to create component-specific loggers with pre-attached fields (`cmd/dive/cli/internal/ui/v1/view/filetree.go:44`), enabling differentiated log streams per UI component.

## Notable Patterns

- **Field-based structured logging**: `log.WithFields("path", path).Debug("...")` used extensively for correlation (`dive/filetree/efficiency.go:68`, `dive/image/docker/cli.go:22`).
- **Error-chain wrapping**: Consistent use of `fmt.Errorf("context: %w", err)` at command/adapter layers.
- **Task progress bus**: Errors during long-running tasks are captured via `mon.SetError(err)` before being wrapped (`cmd/dive/cli/internal/command/adapter/exporter.go:46-47`).
- **CI evaluator state machine**: The evaluator uses a `RuleStatus` enum (defined in `cmd/dive/cli/internal/command/ci/rule.go:7-15`) to track rule states, but invalid transitions cause panics.

## Tradeoffs

**Positive**:
- Consistent wrapping at command layer provides actionable context for users.
- Structured logging allows post-mortem debugging from production logs.
- Separating logging (internal) from error return (user-facing) keeps concerns distinct.

**Negative**:
- Panics for parse errors make the tool brittle — a single corrupted image layer causes the entire process to abort rather than reporting partial results.
- No exported sentinel errors prevents callers from programmatically distinguishing specific error conditions.
- The log/discard default (`internal/log/log.go:9`) means errors during early startup may be silently lost if `log.Set` is not called.

## Failure Modes / Edge Cases

1. **Corrupt Docker manifest**: `panic` at `dive/image/docker/manifest.go:18` aborts the entire process with no graceful degradation.
2. **Corrupt image config**: Similar panic at `dive/image/docker/config.go:31`.
3. **File system read errors**: Panics at `dive/filetree/file_info.go:130-138` abort traversal rather than skipping the file.
4. **Log not initialized**: If `log.Set` is not called before use, all logs silently go to `/dev/null` via the discard logger.
5. **Cursor on empty view**: Returns `errors.New` at `cmd/dive/cli/internal/ui/v1/view/cursor.go:29` — recoverable, but only because it's a UI-level constraint rather than data corruption.
6. **CI rule double-execution**: Panics at `cmd/dive/cli/internal/command/ci/evaluator.go:119` — indicates a programming error in rule evaluation order.

## Future Considerations

1. Replace panics in manifest/config parsing with returned errors to allow graceful degradation and partial analysis.
2. Export sentinel errors (e.g., `ErrImageNotFound`, `ErrBuildFailed`) so callers can use `errors.Is` for programmatic recovery.
3. Add structured error rendering for user-facing errors that includes context (which layer, which file, which operation) without exposing internal stack traces.
4. Consider adding a fatal-error handler that can be customized (e.g., for testing) instead of raw `panic`.

## Questions / Gaps

1. **Why panic for manifest unmarshaling but not for image fetch?** The same class of "data may be corrupted" error is handled differently at different layers — manifest config uses panic (`dive/image/docker/manifest.go:18`) while image fetch uses error return (`dive/image/docker/engine_resolver.go:84`). No clear rationale for the inconsistency.

2. **No evidence of `errors.As` usage** for typed error inspection. The `PathError` struct (`dive/filetree/path_error.go:23`) is never checked via `errors.As`.

3. **No exported error variables** for external packages to import and compare against.

---

Generated by `study-areas/05-error-handling.md` against `dive`.