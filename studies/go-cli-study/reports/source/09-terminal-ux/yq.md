# Repo Analysis: yq

## Terminal UX & Interaction Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | yq |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/yq` |
| Group | `yq` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

yq is a lightweight, portable YAML/JSON/XML/TOML processor. It is a data transformation tool, not an interactive terminal application. The CLI uses standard stdout/stderr streams with no interactive prompts, spinners, or streaming text rendering. Terminal output is limited to ANSI color escapes for syntax highlighting and shell completion support.

## Rating

**3/10** — Functional but rudimentary. No interactive terminal features. Output is plain text to stdout with optional ANSI color codes. No progress indicators, no streaming, no interruptible UX.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| CLI Framework | Uses `spf13/cobra` for command structure | `cmd/root.go:10` |
| Color Output | Custom colorizeAndPrint using `fatih/color` + goccy lexer | `pkg/yqlib/color_print.go:7-9` |
| Color Control | NO_COLOR env var respected, force color flags `-C`/`-M` | `cmd/root.go:74,185-186` |
| Shell Completion | Generates bash/zsh/fish/powershell completions via cobra | `cmd/completion.go:47-58` |
| Stdout Output | Single buffered writer for all output | `pkg/yqlib/printer_writer.go:20-28` |
| Error Output | Uses slog text handler to stderr | `cmd/root.go:83-84` |

## Answers to Protocol Questions

### 1. How is terminal rendering handled?

Terminal rendering is minimal. yq does not use any terminal UI libraries (no BubbleTea, tview, or similar). Output is plain text written to a buffered writer (`bufio.Writer`) via `pkg/yqlib/printer_writer.go:26-28`. The only "rendering" enhancement is optional ANSI color codes via `pkg/yqlib/color_print.go:20-66`, which colorizes YAML tokens (keys in cyan, strings in green, numbers in magenta, etc.). The `NO_COLOR` environment variable is respected (`cmd/root.go:74`).

### 2. How are loading states shown?

**No loading states are shown.** There are no spinners, progress bars, or status messages during file processing. The tool processes data silently and outputs results. Long-running operations (e.g., processing large files) provide no feedback until completion. This is a design gap for UX.

### 3. How are prompts implemented?

**No interactive prompts exist.** yq is a non-interactive, filter-style tool. It reads from stdin or files, applies an expression, and writes to stdout. There are no user prompts, confirmation dialogs, or interactive flows. Commands like `yq -i` (in-place edit) operate directly without confirmation.

### 4. Is the UX interruptible?

**Partially interruptible.** Keyboard interrupt (Ctrl+C) will terminate the process via Go's default signal handling. However, there is no graceful shutdown mechanism — the application does not drain partial results or clean up temp files on interrupt. The in-place write handler (`pkg/yqlib/write_in_place_handler.go:46-55`) only cleans up the temp file if `evaluatedSuccessfully` is true, but does not handle early termination via signal context. The stream evaluator (`pkg/yqlib/stream_evaluator.go:78-113`) reads in a tight loop with no context cancellation support.

## Architectural Decisions

1. **Output is streaming-compatible**: The `PrinterWriter` interface (`pkg/yqlib/printer_writer.go:12-13`) returns a `*bufio.Writer`, allowing incremental writes. However, actual output is buffered per-node, not truly streaming.

2. **Single output writer per execution**: Despite supporting multiple files via split-exp (`cmd/root.go:199`), yq uses a single buffered writer for all output (`pkg/yqlib/printer_writer.go:20-28`). No per-document flushing occurs.

3. **Color is a post-processing step**: Colorization happens via a separate `colorizeAndPrint` function (`pkg/yqlib/color_print.go:20`) that tokenizes the entire output YAML string and applies ANSI escapes. This is not incremental — it requires the full output to be generated first.

4. **Shell completion is first-class**: Cobra's completion framework is fully utilized (`cmd/completion.go:47-58`), providing bash, zsh, fish, and PowerShell completions. Flag completions are registered for input/output formats, indent values, etc.

## Notable Patterns

- **Filter-style architecture**: yq follows the Unix filter paradigm (stdin → process → stdout), making it composable in pipelines. This is the correct model for a data processing tool but limits interactive UX potential.
- **Expression-based processing**: All operations are expressed as yq expressions (e.g., `yq '.a.b'`), not interactive commands. This design choice is fundamental and precludes interactive flows.
- **Color via tokenization**: Rather than annotating the AST during printing, color is applied by re-tokenizing the output string (`pkg/yqlib/color_print.go:21`). This is a performance and complexity tradeoff.

## Tradeoffs

- **Simplicity vs. interactivity**: By staying true to the filter paradigm, yq remains simple and composable but lacks interactive features (prompts, progress, spinners) that would enhance UX for long-running operations.
- **Buffered output vs. streaming**: The `resultsPrinter` (`pkg/yqlib/printer.go:20-30`) buffers each document before writing. For very large documents, this could be memory-intensive.
- **Color as post-process vs. incremental**: The `colorizeAndPrint` approach (`pkg/yqlib/color_print.go:20`) cannot incrementally colorize streaming output — the full YAML must be generated first.

## Failure Modes / Edge Cases

- **Large file processing**: No progress feedback during processing of large YAML files. User has no indication that the tool is working or is hung.
- **In-place edit interruption**: If the process is interrupted during in-place edit (`-i` flag), the temp file may be left orphaned (`pkg/yqlib/write_in_place_handler.go:46-55`). The `FinishWriteInPlace` defer only runs if `cmdError == nil`.
- **Broken pipe**: If stdout is closed (e.g., piped to `head`), the tool will crash with a broken pipe error. No graceful handling.
- **NO_COLOR conflicts**: The logic at `cmd/root.go:74` sets `forceNoColor` only if `NO_COLOR` is non-empty string. This could be a bug — an empty string `NO_COLOR=""` would not disable colors.

## Future Considerations

- Add a `--progress` flag or automatic progress indicator for files with known size (via `stat`)
- Implement graceful shutdown with signal handling (SIGINT/SIGTERM) to drain partial results and clean up temp files
- Consider incremental color output for streaming scenarios
- Add `--quiet` flag to suppress stderr logs (currently logs go to stderr via slog)

## Questions / Gaps

1. **No evidence found** for any terminal rendering library (BubbleTea, tview, etc.). yq is purely a text processor.
2. **No evidence found** for interactive prompts or user confirmation dialogs.
3. **No evidence found** for progress indicators or loading states.
4. **No evidence found** for streaming text handling beyond basic buffered writes to stdout.
5. **No evidence found** for context-aware cancellation in the evaluation loop (`stream_evaluator.go:78-113`).
6. The `colorizeAndPrint` function (`pkg/yqlib/color_print.go:20`) tokenizes output post-generation — not suitable for streaming pipelines.

---

Generated by `study-areas/09-terminal-ux.md` against `yq`.