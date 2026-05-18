# Repo Analysis: yq

## Error Handling Philosophy

### Repo Info

| Field | Value |
|-------|-------|
| Name | yq |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/yq` |
| Group | `study-areas/05-error-handling.md` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

yq employs consistent error wrapping with `fmt.Errorf` using `%w` to preserve error chains. The project uses `errors.Is` to check for sentinel conditions like `io.EOF`, enabling proper flow control. No custom error types are defined — all errors are plain strings or standard library errors. Fatal vs recoverable errors are not explicitly distinguished; the CLI exits with code 1 on any error from `cmd.Execute()` at `yq.go:22-23`.

## Rating

**7/10** — Consistent contextual error wrapping throughout the codebase. `errors.Is` is used appropriately for sentinel checks. However, there are no custom error types for programmatic handling, and the fatal/recoverable distinction is implicit rather than explicit. The single `os.Exit(1)` in the entry point (`yq.go:23`) treats all errors identically.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Error wrapping | `fmt.Errorf("bad file '%v': %w", filename, errorReading)` wraps the underlying error | `pkg/yqlib/stream_evaluator.go:93` |
| Error wrapping | `fmt.Errorf("failed to load %v: %w", filename, err)` | `pkg/yqlib/operator_load.go:88` |
| Error wrapping | `fmt.Errorf("bad split document expression: %w", err)` | `cmd/utils.go:187` |
| Sentinel errors | `errors.New("no matches found")` for flow control | `cmd/evaluate_sequence_command.go:157` |
| Sentinel errors | `errors.New("no support for input format")` for unsupported format | `pkg/yqlib/operator_encoder_decoder.go:106` |
| errors.Is usage | `errors.Is(errorReading, io.EOF)` to detect end of stream | `pkg/yqlib/stream_evaluator.go:89` |
| errors.Is usage | `errors.Is(errReading, io.EOF)` with negation for error paths | `pkg/yqlib/encoder.go:80` |
| User-facing errors | `errors.New("must provide a date time format string...")` as user error message | `pkg/yqlib/operator_datetime.go:33` |
| Fatal exit | `os.Exit(1)` on any cmd.Execute() error | `yq.go:22-23` |
| Logger integration | `log/slog` for structured debug/error logging | `pkg/yqlib/logger.go` |

## Answers to Protocol Questions

### 1. Are errors wrapped with context?

**Yes.** yq wraps errors with `fmt.Errorf` and `%w` throughout. Examples include:
- `pkg/yqlib/stream_evaluator.go:93` — wraps file read errors with filename context
- `pkg/yqlib/operator_load.go:88,127` — wraps file load errors with filename
- `pkg/yqlib/operator_datetime.go:77,117,174` — wraps datetime parse errors with value and layout context
- `pkg/yqlib/decoder_hcl.go:118` — wraps HCL parse errors

Context includes actionable information like filenames, values, and operation names.

### 2. Which errors are user-facing vs operational?

**User-facing errors** are returned directly from command handlers and displayed by Cobra:
- `errors.New("no matches found")` (`cmd/evaluate_sequence_command.go:157`, `cmd/evaluate_all_command.go:139`) — returned when `exitStatus` is true and no results match
- Format validation errors like `"no support for input format"` (`pkg/yqlib/operator_encoder_decoder.go:106`) — returned when format is unsupported

**Operational errors** (I/O, parsing) are wrapped and propagated:
- File read failures wrapped at `pkg/yqlib/stream_evaluator.go:93` and `pkg/yqlib/utils.go:80`
- Decoder errors wrapped with context before propagation

There is no explicit separation mechanism — user-facing vs operational is implicit based on error message content.

### 3. How are fatal vs recoverable failures handled?

**No explicit distinction.** All errors returned from `cmd.Execute()` result in `os.Exit(1)` at `yq.go:22-23`. The `RunE` functions (`cmd/root.go:61-68`) return errors directly without classification. There is no:
- Custom error type for fatal vs recoverable
- Log-and-continue vs log-and-fail distinction
- Panic recovery mechanism

The only "recoverable" behavior is the `io.EOF` check at `stream_evaluator.go:89` which terminates a file read loop normally rather than erroring.

### 4. Are sentinel errors used for programmatic checking?

**Yes, but limited.** `io.EOF` is checked via `errors.Is()` throughout:
- `pkg/yqlib/stream_evaluator.go:89` — exits read loop on EOF
- `pkg/yqlib/utils.go:73` — skips EOF in document reading
- `pkg/yqlib/decoder_yaml.go:47,51,71,90,100,145,149` — various EOF checks in YAML decoder
- `pkg/yqlib/encoder.go:53,80` — EOF handling in encoder

There are **no custom sentinel errors** exported for external users. The `errors.New("no matches found")` pattern at `cmd/evaluate_sequence_command.go:157` is a sentinel, but not exported or documented for programmatic use. `errors.Is` is never used with a custom sentinel in the codebase.

## Architectural Decisions

1. **Error wrapping with `%w` preserved throughout** — all file I/O and parsing errors include contextual information via wrapped errors
2. **No custom error types** — yq relies on plain `error` interface and string-based errors, avoiding type hierarchies
3. **EOF as flow control** — `errors.Is(err, io.EOF)` used extensively to distinguish normal stream termination from actual errors
4. **Single exit point** — `os.Exit(1)` at entry point treats all errors uniformly

## Notable Patterns

- **Error context includes filename**: `fmt.Errorf("bad file '%v': %w", filename, errorReading)` at `pkg/yqlib/stream_evaluator.go:93`
- **Wrapped parsing errors**: HCL, datetime, path parsing all wrap underlying errors
- **Logger integration via structured slog**: Debug/errors routed to stderr via `slog.HandlerOptions`
- **Command-level error handling**: Cobra's `RunE` returns errors that propagate to `cmd.Execute()`
- **In-place file handling with defer**: Error during write triggers rollback via deferred cleanup (`cmd/evaluate_sequence_command.go:86-90`)

## Tradeoffs

| Tradeoff | Impact |
|----------|--------|
| No custom error types | Simplicity, but external consumers cannot use `errors.As` to distinguish error categories |
| `os.Exit(1)` for all errors | Makes yq hard to script around — can't distinguish parse errors from I/O errors by exit code |
| EOF as control flow | Clean stream processing but conflates "end of data" with "no more data expected" |
| No fatal vs recoverable distinction | Hard to implement graceful degradation or partial result reporting |

## Failure Modes / Edge Cases

1. **File read errors include filename**: `stream_evaluator.go:93` wraps file errors with the filename, helping users identify which file caused problems in multi-file processing
2. **Empty files**: YAML decoder handles `io.EOF` on empty input at `decoder_yaml.go:145-149`, returning empty result rather than error
3. **Expression parse errors**: Returned directly from `ExpressionParser.ParseExpression` without wrapping, losing file context
4. **Format detection failures**: Fall back to YAML silently (`cmd/utils.go:121-124`), which may surprise users expecting JSON/XML behavior
5. **Write-in-place failures**: Deferred cleanup at `cmd/evaluate_sequence_command.go:86-90` only executes if `cmdError == nil`, so write errors may not trigger rollback

## Future Considerations

1. Export sentinel errors for `errors.Is` checks (e.g., `var ErrNoMatches = errors.New("no matches found")`)
2. Consider distinct exit codes for different error categories (parse error=1, I/O error=2, usage error=3)
3. Add custom error types for `ParseError`, `IoError`, `FormatError` categories if external consumers need programmatic error handling
4. Wrap expression parse errors with context about which expression failed

## Questions / Gaps

- **Custom error types**: None found. All errors are plain `errors.New` or `fmt.Errorf` wrapped. No `type` definitions implementing `error` interface.
- **Error documentation**: No exported error variables or constants that users can import and check against
- **Error recovery**: No `recover()` usage or panic handling
- **Error testing**: No evidence of table-driven error tests or error scenario coverage

---
Generated by `study-areas/05-error-handling.md` against `yq`.