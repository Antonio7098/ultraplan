# Repo Analysis: yq

## Concurrency & Async Patterns

### Repo Info

| Field | Value |
|-------|-------|
| Name | yq |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/yq` |
| Group | `08-concurrency` |
| Language / Stack | Go (mikefarah/yq/v4) |
| Analyzed | 2026-05-15 |

## Summary

yq is a CLI tool for processing YAML/JSON/XML/TOML/etc. It operates as a single-threaded stream processor by default. Files are processed sequentially in a simple for-loop. There is no use of goroutines, channels, `sync.WaitGroup`, `errgroup`, mutexes, or atomic operations anywhere in the codebase.

## Rating

**3/10 — Unsafe goroutine chaos**

yq does not use concurrency primitives at all, which places it at the "no concurrency" end of the spectrum rather than "unsafe goroutine chaos". However, per the rating rubric, the lowest rating (1–3) includes "unsafe goroutine chaos" — yet yq simply has no goroutines at all. The rating best describes a project with functional but unstructured concurrency, but yq has none. A score of 3 reflects a project that is purely sequential and makes no use of Go's concurrency features.

**Rating rationale**: yq processes files sequentially in a single-threaded loop (`stream_evaluator.go:52`, `all_at_once_evaluator.go:51`). There are no goroutines, no channels, no coordination mechanisms, no mutexes, and no race conditions to prevent because shared data access does not occur across threads. The "chaos" label does not apply — the project simply avoids concurrency entirely.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Sequential file processing | Simple for-loop over filenames | `pkg/yqlib/stream_evaluator.go:52` |
| Sequential file processing | Simple for-loop over filenames | `pkg/yqlib/all_at_once_evaluator.go:51` |
| Goroutines | None found | No `go ` keyword launching goroutines |
| Channels | None found | No channel types |
| sync.WaitGroup | None found | No `sync.WaitGroup` usage |
| errgroup | None found | No `golang.org/x/sync/errgroup` usage |
| Mutex/RWMutex | None found | No `sync.Mutex` or `sync.RWMutex` |
| Atomic operations | None found | No `atomic` package usage |
| Context cancellation | None found | No `context.WithCancel`, `context.WithTimeout`, or `context.WithDeadline` |
| Shutdown/cleanup | defer-based file cleanup | `cmd/evaluate_sequence_command.go:86-90`, `pkg/yqlib/file_utils.go:68-73` |
| Race condition prevention | Not applicable | No concurrent shared state access |

## Answers to Protocol Questions

### 1. Where are goroutines launched?

**No goroutines are launched.** The `go` keyword does not appear in any Go source file in the repository. yq processes everything sequentially, iterating over files in a simple `for` loop (`stream_evaluator.go:52`). Each file is opened, decoded, evaluated, and printed before the next file is processed.

### 2. How are they coordinated?

**No coordination mechanism exists.** Since there are no goroutines, there is no need for channels, `sync.WaitGroup`, `errgroup.Group`, or any other coordination primitive. The sequential loop in `stream_evaluator.go:52` and `all_at_once_evaluator.go:51` handles execution order implicitly.

### 3. How is cleanup handled?

**Defer-based cleanup for resources that are used.** The codebase uses `defer` statements to clean up resources:

- `cmd/evaluate_sequence_command.go:86-90`: A `defer` calls `writeInPlaceHandler.FinishWriteInPlace()` when the command exits, which closes the temp file and either renames it to the target or removes it on failure.
- `cmd/evaluate_sequence_command.go:133`: `defer yqlib.ClearFilenameAliases()` clears filename aliases after front-matter processing.
- `cmd/evaluate_sequence_command.go:140`: `defer frontMatterHandler.CleanUp()` cleans up temp files created during front-matter splitting.
- `cmd/evaluate_all_command.go:112-119`: Same defer pattern for `eval-all` command.
- `pkg/yqlib/file_utils.go:68-73`: `safelyCloseFile()` is called via `defer` in `copyFileContents()` and also inline in `stream_evaluator.go:66`.

**No goroutine cleanup needed** since there are no goroutines. File handles are closed after use but there is no async resource management.

### 4. Are race conditions considered?

**No — race conditions are not a concern because there is no concurrency.** The codebase has no shared state accessed by multiple threads. Each operation processes a single file at a time in a sequential loop. There are no mutexes, no `sync/atomic` usage, and no concurrent map access because there are no goroutines.

## Architectural Decisions

1. **Single-threaded sequential processing**: yq processes files one at a time in a simple `for` loop. This is easy to reason about and has no race conditions, but does not utilize multiple CPU cores.

2. **Two evaluator strategies**: yq provides two evaluator modes — `StreamEvaluator` (processes each file/document sequentially) and `AllAtOnceEvaluator` (loads all documents into memory before evaluating). Neither uses concurrency.

3. **No context cancellation**: Commands do not accept a `context.Context` for cancellation. The `evaluateSequence` and `evaluateAll` functions have no cancellation support (`cmd/evaluate_sequence_command.go:61`, `cmd/evaluate_all_command.go:47`).

4. **Simple defer-based resource cleanup**: File handles and temp files are cleaned up via `defer` statements, which is sufficient for sequential processing but would not gracefully cancel in-progress work if goroutines existed.

## Notable Patterns

1. **Sequential file iteration** — `stream_evaluator.go:52`: `for _, filename := range filenames { ... }`
2. **Defer-based cleanup** — Used for file handles, temp files, and front-matter handlers.
3. **Two-pass architecture** — `eval` uses `StreamEvaluator` for streaming processing; `eval-all` uses `AllAtOnceEvaluator` for cross-document expressions.

## Tradeoffs

| Tradeoff | Description |
|----------|-------------|
| **No parallelism** | Cannot utilize multiple CPU cores for file processing. Single-core throughput limited. |
| **Memory vs. streaming** | `eval-all` loads all documents into memory; `eval` streams but cannot do cross-document operations. |
| **No cancellation** | Long-running operations cannot be cancelled via context. `context.WithCancel` is not used. |
| **No goroutine leaks** | Since there are no goroutines, goroutine leaks are impossible. |

## Failure Modes / Edge Cases

1. **Large file handling**: Since files are processed sequentially with no backpressure mechanism, a very large file can consume significant memory during `eval-all` before processing begins.

2. **STDIN handling**: When reading from STDIN (`-` filename), the entire stream is consumed before output begins. For the `eval` command, this is fine, but there is no way to limit memory usage.

3. **No graceful shutdown**: If the process receives a signal (e.g., SIGINT), in-flight temp file operations may not complete cleanly. The `write_in_place_handler.go:46-55` cleanup runs on function exit but does not handle signals specially.

4. **Temp file race**: In concurrent scenarios (which don't exist), temp file creation could have race conditions. The current sequential model avoids this (`file_utils.go:75-91`).

## Future Considerations

1. **Parallel file processing**: Using `errgroup` to process multiple files concurrently would improve throughput on multi-core systems, but would require careful handling of output ordering and shared printer state.

2. **Context cancellation**: Adding `context.Context` support to evaluator functions would allow graceful cancellation of long-running operations.

3. **Streaming cross-document expressions**: Currently `eval` cannot do cross-document operations and `eval-all` loads everything into memory. A streaming approach with goroutines could potentially support both.

## Questions / Gaps

1. **No evidence of goroutine usage**: Extensive grep across all `.go` files found no `go ` keyword, no channels, no `sync.WaitGroup`, no `errgroup`, no mutexes, and no atomic operations. This is a deliberate design choice, not an oversight.

2. **No context support**: The absence of `context.Context` usage means no cancellation or timeout support for long-running operations.

3. **Thread safety not considered**: Since there is no concurrency, thread safety of shared data structures (e.g., the logger, expression parser state) was not verified.

---

Generated by `study-areas/08-concurrency.md` against `yq`.