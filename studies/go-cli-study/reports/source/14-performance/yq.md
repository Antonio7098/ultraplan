# Repo Analysis: yq

## Performance & Resource Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | yq |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/yq` |
| Group | `yq` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

yq implements a pragmatic mix of streaming and full-load processing depending on the output format. The expression parser uses lazy initialization to keep startup fast, but the streaming evaluator processes documents one at a time while the all-at-once evaluator buffers everything in memory. Output uses buffered writers with default sizes. No object pooling or explicit memory management optimizations found.

## Rating

**6/10** — Acceptable performance with room for improvement. The lazy parser initialization is good for startup, but memory usage can grow significantly with large inputs in all-at-once mode. No profiling hooks or benchmark tests for validation.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Lazy parser init | ExpressionParser initialized only on first use via `InitExpressionParser()` | `pkg/yqlib/lib.go:13-19` |
| Buffered input | Uses `bufio.NewReader()` for stdin and file input with default buffer | `pkg/yqlib/utils.go:35-49` |
| Buffered output | Output wrapped in `bufio.NewWriter` with default buffer | `pkg/yqlib/printer_writer.go:20-23` |
| Stream evaluator | Processes one document at a time, releases memory after each | `pkg/yqlib/stream_evaluator.go:78-113` |
| All-at-once evaluator | Accumulates all documents in linked list before processing | `pkg/yqlib/all_at_once_evaluator.go:47-74` |
| File handle cleanup | Explicit `safelyCloseFile()` after each file processed | `pkg/yqlib/file_utils.go:61-73` |
| Temp file cleanup | Removes temp files on failure, renames on success | `pkg/yqlib/write_in_place_handler.go:46-55` |
| Lazy context variables | Variables map created on demand | `pkg/yqlib/context.go:50-54` |
| Path preallocation | TOML decoder preallocates path slice capacity | `pkg/yqlib/decoder_toml.go:524` |
| Debug flags | `-v/--verbose` and `--debug-node-info` flags | `cmd/root.go:92-93` |
| No object pooling | No `sync.Pool` usage found | — |
| No pprof | No `net/http/pprof` imports or benchmark tests | — |
| Deep copy on context clone | Variables deep-copied when creating child contexts | `pkg/yqlib/context.go:56-74` |
| Node path creation | New slice created per `GetPath()` call, no caching | `pkg/yqlib/candidate_node.go:203-213` |
| Expression parser stack | Dynamic slice growth with `append()` | `pkg/yqlib/expression_parser.go:43` |

## Answers to Protocol Questions

1. **Is startup fast?**
   Yes — the expression parser is lazily initialized (`pkg/yqlib/lib.go:13-19`) via `PersistentPreRunE` in the cobra command (`cmd/root.go:86`). This means version/help commands don't pay parsing overhead. The parser is a singleton check-then-init pattern.

2. **Is memory usage controlled?**
   Partially — the stream evaluator (`pkg/yqlib/stream_evaluator.go:78-113`) processes documents individually and releases them, keeping memory bounded. However, the all-at-once evaluator (`pkg/yqlib/all_at_once_evaluator.go:47-74`) accumulates all documents in a linked list before processing, causing linear memory growth. No object pooling (`sync.Pool`) is used for reusing `CandidateNode` instances.

3. **Is streaming used instead of buffering?**
   It depends on the evaluator mode:
   - Stream mode (`pkg/yqlib/stream_evaluator.go:78-113`): Document-by-document processing, streaming.
   - All-at-once mode (`pkg/yqlib/all_at_once_evaluator.go:47-74`): Full buffering of input before processing.
   Output always uses `bufio.Writer` with default buffer size (`pkg/yqlib/printer_writer.go:20-23`). Input uses `bufio.Reader` with default size (`pkg/yqlib/utils.go:35-49`).

4. **Are large operations incremental?**
   In stream mode, yes — each document is processed and output individually (`pkg/yqlib/stream_evaluator.go:106`). In all-at-once mode, no — all input must be loaded before any output. The `readDocuments` function (`pkg/yqlib/utils.go:61-91`) accumulates all nodes before returning.

## Architectural Decisions

| Decision | Rationale | Evidence |
|----------|-----------|----------|
| Lazy expression parser init | Keeps CLI startup fast for non-parse operations (version, help) | `pkg/yqlib/lib.go:13-19`, `cmd/root.go:86` |
| Two evaluator types | Stream mode for memory efficiency, all-at-once for formats needing complete picture | `pkg/yqlib/stream_evaluator.go`, `pkg/yqlib/all_at_once_evaluator.go` |
| Buffered readers/writers | Default bufio sizes trade off memory for reduced syscalls | `pkg/yqlib/utils.go:35-49`, `pkg/yqlib/printer_writer.go:20-23` |
| Linked list for documents | Uses `container/list` for document collection — O(1) append, but less cache-friendly than slice | `pkg/yqlib/all_at_once_evaluator.go:50` |
| Safe file cleanup | Errors logged rather than ignored, temp files removed on failure | `pkg/yqlib/file_utils.go:32-73` |
| Deep copy context cloning | Each context operation gets fresh variables — safe but allocations multiply | `pkg/yqlib/context.go:56-74` |

## Notable Patterns

1. **Singleton lazy parser**: `ExpressionParser` global var checked for nil before initialization — classic double-checked locking without the locking (single goroutine assumption).

2. **Evaluator strategy pattern**: `StreamEvaluator` and `AllAtOnceEvaluator` implement a common `Evaluator` interface with `Evaluate()` method, chosen based on output format requirements.

3. **Document-streaming loop**: Stream evaluator uses a clear pattern — init decoder, loop decode-print, explicit file close — making memory ownership explicit (`stream_evaluator.go:78-113`).

4. **Deferred cleanup**: Temp files and Lua states use `defer` for guaranteed cleanup (`decoder_lua.go:152`, `write_in_place_handler.go:46-55`).

5. **Front matter splitting**: Special handling for YAML front matter with NUL-separated output uses peek-ahead and temporary files (`front_matter.go:43-54`).

## Tradeoffs

| Tradeoff | Pro | Con |
|----------|-----|-----|
| Two evaluator types | Optimizes for different use cases | More code paths, potential inconsistency |
| Linked list for documents | O(1) append, stable while adding | Poor cache locality vs slice |
| Deep copy on context clone | Memory isolation, no shared state bugs | High allocation rate in complex expressions |
| No object pooling | Simpler code, no synchronization overhead | Higher GC pressure on complex expressions |
| Default buffer sizes | No tuning required, works for most cases | May be suboptimal for very large/small inputs |
| Stream mode by default | Memory bounded regardless of input size | Can't handle expressions needing document order context |

## Failure Modes / Edge Cases

1. **All-at-once memory blow-up**: Loading thousands of large documents via `readDocuments()` (`pkg/yqlib/utils.go:61-91`) will accumulate all `CandidateNode` objects in memory before processing begins.

2. **Path allocation on every call**: `GetPath()` (`pkg/yqlib/candidate_node.go:203-213`) allocates a new slice on each call, causing O(n²) behavior for deep nested path expressions.

3. **Expression parser stack growth**: The `stack` slice (`pkg/yqlib/expression_parser.go:43`) grows dynamically without preallocation for deeply nested expressions.

4. **No profiling hooks**: Without pprof integration or benchmark tests, performance regressions are hard to diagnose. The only debug output is via `-v/--verbose` flag.

5. **Default buffer sizes**: Using `bufio.NewReader()` and `bufio.NewWriter()` with default buffer sizes (typically 4096 bytes) may cause excessive syscalls for very large values or unnecessary memory for small outputs.

6. **Front matter temp file leftovers**: On crash during front matter handling, the temp file created at `front_matter.go:43` may not be cleaned up.

## Future Considerations

1. Add `sync.Pool` for `CandidateNode` reuse to reduce GC pressure in complex expressions.

2. Implement streaming for all-at-once formats by chunking input and outputting periodically.

3. Add pprof endpoints or benchmark tests to validate performance claims.

4. Consider preallocating expression parser stack with `make([]*ExpressionNode, 0, expectedDepth)`.

5. Cache computed paths in `CandidateNode` to avoid repeated allocations.

6. Make buffer sizes configurable for users with specific I/O patterns.

## Questions / Gaps

1. **No benchmark tests found** — cannot measure actual startup time or memory usage regressions.

2. **No pprof integration** — no way to profile in production or CI environments.

3. **No explicit memory limits** — stream evaluator is the only safeguard against OOM, and it requires user to explicitly select it.

4. **Linked list choice unclear** — `container/list` used for document storage but no justification found for why slice wasn't used (cache locality, allocation pattern).

---

Generated by `study-areas/14-performance.md` against `yq`.