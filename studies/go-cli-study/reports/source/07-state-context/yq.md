# Repo Analysis: yq

## State & Context Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | yq |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/yq` |
| Group | `07-state-context` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

yq does not use Go's `context.Context` at all. Instead, it implements a custom `Context` struct that manages evaluation state (variables, matching nodes, datetime layout) without any lifecycle or cancellation semantics. The tool is a simple stream processor with no concurrency, no signal handling, and no concept of sessions or application-wide state beyond a handful of global configuration objects.

## Rating

**3 / 10** — Shared mutable chaos

yq has no `context.Context` usage, no cancellation propagation, and relies on global mutable state (`Configured*` vars, `ExpressionParser` singleton). This is appropriate for a single-threaded CLI tool but offers no discipline for cancellation, graceful shutdown, or concurrent operations.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Custom Context struct | `Context` struct with `MatchingNodes`, `Variables`, `DontAutoCreate`, `datetimeLayout` | `pkg/yqlib/context.go:10-15` |
| No `context.Context` usage | Searched entire repo — zero imports of `"context"` package | No evidence found |
| Global configuration | `ConfiguredYamlPreferences`, `ConfiguredXMLPreferences`, `ConfiguredCsvPreferences`, etc. | `pkg/yqlib/yaml.go:40`, `pkg/yqlib/xml.go:46`, etc. |
| Singleton parser | `ExpressionParser` global var initialized once via `InitExpressionParser()` | `pkg/yqlib/lib.go:13-18` |
| Global logger | `log` var in `pkg/yqlib/lib.go:21` | `pkg/yqlib/lib.go:21` |
| Global filename aliases | `filenameAliases` map in `pkg/yqlib/utils.go:15` | `pkg/yqlib/utils.go:15` |
| Stream evaluation | `StreamEvaluator` processes files sequentially, no concurrency | `pkg/yqlib/stream_evaluator.go:20-27` |
| File handle cleanup | `safelyCloseFile` called per file in stream evaluation | `pkg/yqlib/stream_evaluator.go:64-66` |
| Write-in-place handler | `writeInPlaceHandlerImpl` manages temp file lifecycle | `pkg/yqlib/write_in_place_handler.go:12` |
| No signal handling | No `os/signal` or `interrupt` handling found | No evidence found |
| No cancellation | No `context.WithCancel`, `context.WithTimeout`, or `context.WithDeadline` found | No evidence found |

## Answers to Protocol Questions

### 1. How is `context.Context` propagated?

**It is not used at all.** yq does not import or use Go's `context` package. Instead it has a custom `Context` struct (`pkg/yqlib/context.go:10-15`) used during expression evaluation to track matching nodes, variables, and datetime layout. This custom context is passed through the tree navigator and operator handlers, but it carries no cancellation, deadline, or lifecycle semantics.

### 2. How is cancellation handled?

**No cancellation mechanism exists.** There is no `context.Context`, no signal handling, no graceful shutdown. The stream evaluator loops (`pkg/yqlib/stream_evaluator.go:78-112`) reads and processes documents until EOF or error. If the process receives SIGINT/SIGTERM, it terminates immediately with no cleanup beyond deferred file closes.

### 3. Is application state centralized or per-command?

**Global mutable singletons.** yq uses a pattern of package-level `var Configured* = NewDefault*()` globals (e.g., `ConfiguredYamlPreferences` at `pkg/yqlib/yaml.go:40`, `ConfiguredXMLPreferences` at `pkg/yqlib/xml.go:46`, `ConfiguredSecurityPreferences` at `pkg/yqlib/security_prefs.go:9`). These are modified via Cobra flags in `cmd/root.go`. The `ExpressionParser` is also a lazy-initialized singleton (`pkg/yqlib/lib.go:13`). The custom `Context` is created per-evaluation and passed through but is not the primary state vessel.

### 4. How are sessions modeled?

**No session concept.** yq is a stateless filter tool. There is no session, no user identity, no request scope. The closest analogs are: (a) the `Context` struct tracks per-evaluation variable bindings and matching nodes during expression evaluation, and (b) the write-in-place handler (`pkg/yqlib/write_in_place_handler.go`) manages a temp file per invocation.

## Architectural Decisions

- **Custom evaluation context over `context.Context`**: yq's `Context` struct pre-dates widespread `context.Context` adoption in some ecosystems or intentionally avoids it for simplicity. It focuses on expression evaluation state rather than lifecycle/cancellation.
- **Global configuration singletons**: Preferences are global `var Configured*` objects modified by CLI flags. This is a straightforward approach for a single-threaded CLI but prevents concurrent invocations within the same process.
- **Lazy parser initialization**: `ExpressionParser` is initialized on first use via `InitExpressionParser()` (`pkg/yqlib/lib.go:15-18`), called from `cmd/root.go:86` in `PersistentPreRunE`.

## Notable Patterns

- **Operator handler dispatch**: `DataTreeNavigator.GetMatchingNodes` (`pkg/yqlib/data_tree_navigator.go:51-68`) dispatches to operator handlers via `expressionNode.Operation.OperationType.Handler`, a function pointer set during expression parsing.
- **Child context propagation**: `Context.ChildContext()` (`pkg/yqlib/context.go:56-74`) clones the context (with variable copy-on-write) for each branch of evaluation, creating isolated evaluation scopes.
- **Stream and all-at-once evaluation**: Two evaluator strategies — `StreamEvaluator` for memory-efficient sequential processing (`pkg/yqlib/stream_evaluator.go`), and `AllAtOnceEvaluator` for in-memory cross-document operations (`pkg/yqlib/all_at_once_evaluator.go`).
- **Readback via `cmd.Find`**: `yq.go:14` calls `cmd.Find(args)` before `cmd.Execute()` to allow the "eval" default command fallback behavior.

## Tradeoffs

- **Simplicity over robustness**: No `context.Context` means no standardized cancellation propagation, but also no cognitive overhead of context chains. Appropriate for a single-purpose filter tool.
- **Global mutable state**: The `Configured*` globals are not thread-safe but the tool is single-threaded. This is a pragmatic tradeoff that simplifies flag handling.
- **No graceful shutdown**: Long-running yq operations (e.g., reading from a pipe) cannot be gracefully interrupted. This is a limitation for use in scripts where cancellation matters.
- **No concurrent file processing**: `StreamEvaluator` processes files sequentially in a single thread. Parallelization would require refactoring the global state model.

## Failure Modes / Edge Cases

- **Interrupted pipe reads**: If yq is reading from STDIN and the upstream process dies, there is no signal handler to clean up gracefully — the process exits with whatever read state exists.
- **Corrupt temp files**: The write-in-place handler (`pkg/yqlib/write_in_place_handler.go`) creates temp files but if the process is killed mid-write, the original file could be lost (depends on OS temp file guarantees).
- **Expression parser singleton race**: `InitExpressionParser()` at `pkg/yqlib/lib.go:15-18` has a check-then-init race if called concurrently from multiple goroutines (though yq doesn't spawn goroutines currently).
- **Memory pressure with large files**: The all-at-once evaluator loads all documents into memory (`pkg/yqlib/all_at_once_evaluator.go:50-63`). For very large inputs, this could cause OOM.

## Future Considerations

- Consider adopting `context.Context` for cancellation of long-running operations, especially if supporting streaming from slow sources.
- If goroutine concurrency is ever added, the global `Configured*` state and `ExpressionParser` singleton would need to become thread-safe or per-request state passed via context.
- Signal handling (`os/signal.Notify`) could enable graceful interruption and cleanup of write-in-place temp files.

## Questions / Gaps

- **No evidence found** for `context.Context`, `context.WithCancel`, `context.WithTimeout`, or `context.WithValue` anywhere in the repo.
- **No evidence found** for signal handling (`os/signal`, `syscall.SIGINT`, etc.).
- **No evidence found** for concurrency primitives (`sync.Mutex`, `sync.RWMutex`, `atomic`, `chan`).
- The repo's design is intentionally simple and single-threaded — it does not aim to solve problems that would require these patterns.

---

Generated by `study-areas/07-state-context.md` against `yq`.