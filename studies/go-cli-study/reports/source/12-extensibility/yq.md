# Repo Analysis: yq

## Extensibility & Plugin Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | yq |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/yq` |
| Group | `yq` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

yq is a YAML/JSON/INI/XML processor with a modular decoder/encoder architecture and an expression-based query language. Extensibility is achieved through source code modification (adding Format entries, Decoder/Encoder implementations, or new operators) rather than runtime plugin loading. The architecture is clean and well-separated between CLI (`cmd/`) and library (`pkg/yqlib/`), but there is no plugin system for third-party extensions.

## Rating

**5/10** — Some extension points exist, but extension requires recompilation. No dynamic plugin loading.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Decoder interface | `Decoder` interface with `Init(reader io.Reader)` and `Decode() (*CandidateNode, error)` | `pkg/yqlib/decoder.go:7-9` |
| Encoder interface | `Encoder` interface with `Encode`, `PrintDocumentSeparator`, `PrintLeadingContent`, `CanHandleAliases` | `pkg/yqlib/encoder.go:12-17` |
| Format registration | `Format` struct with `EncoderFactory` and `DecoderFactory` function types; `Formats` slice containing all formats | `pkg/yqlib/format.go:10-112` |
| ExpressionParser interface | `ExpressionParserInterface` with `ParseExpression` method | `pkg/yqlib/expression_parser.go:15-17` |
| StreamEvaluator interface | `StreamEvaluator` interface for per-document evaluation | `pkg/yqlib/stream_evaluator.go:14-18` |
| Evaluator interface | `Evaluator` interface (all-at-once) with `EvaluateFiles`, `EvaluateNodes`, `EvaluateCandidateNodes` | `pkg/yqlib/all_at_once_evaluator.go:8-16` |
| Command registration | `rootCmd.AddCommand(...)` to register subcommands | `cmd/root.go:217-221` |
| DataTreeNavigator | Core navigation engine handling expression tree evaluation | `pkg/yqlib/data_tree_navigator.go` |
| Operator registration | Operators registered via `operationType` struct with handler functions | `pkg/yqlib/operators.go:11` |

## Answers to Protocol Questions

### 1. Can new commands be added cleanly?

**Partially.** New commands can be added by:
1. Creating a new command function (e.g., `createEvaluateSequenceCommand()`)
2. Registering it via `rootCmd.AddCommand(...)` in `cmd/root.go:217-221`

However, there is no external plugin mechanism—commands must be compiled into the binary. The command structure is simple (Cobra-based), but adding a new command requires modifying the `cmd/` package.

### 2. Is extension anticipated?

**Limited.** Extension is designed around:
- **Format extensibility**: Adding a new format requires creating a Decoder/Encoder pair and adding an entry to the `Formats` slice (`pkg/yqlib/format.go:96-112`)
- **Expression operator extensibility**: Operators are implemented as functions and registered in the lexer (`pkg/yqlib/lexer_participle.go`)

No runtime extension points. Users cannot add plugins without recompiling. The README and docs do not discuss extension scenarios.

### 3. Are interfaces stable?

**Moderately.** Key interfaces:
- `Decoder` (`pkg/yqlib/decoder.go:7-9`) — small, stable
- `Encoder` (`pkg/yqlib/encoder.go:12-17`) — stable
- `ExpressionParserInterface` (`pkg/yqlib/expression_parser.go:15-17`) — stable

No formal versioning or stability guarantees. Interfaces are not explicitly documented as stable/unstable. Internal packages (`yqlib`) are accessed directly by `cmd/` package (`cmd/root.go:9`).

### 4. Are internal APIs modular?

**Yes.** The codebase has clear boundaries:
- `cmd/` — CLI layer (Cobra commands)
- `pkg/yqlib/` — Core processing library

The library exposes well-defined interfaces (`Decoder`, `Encoder`, `StreamEvaluator`, `Evaluator`). The `Format` struct encapsulates encoder/decoder factory functions, allowing new formats to be added without modifying core logic. Expression parsing is isolated in `expression_parser.go` and uses an internal `ExpressionNode` tree structure.

## Architectural Decisions

1. **Decoder/Encoder as extension mechanism**: Rather than a plugin system, yq uses a simple interface-based approach for adding format support. Each format (YAML, JSON, XML, etc.) implements `Decoder` and/or `Encoder`.

2. **Expression language as primary extensibility**: The query/filter language (`.a.b`, `select(...)`, etc.) is the main way users extend behavior. Operators are implemented in Go and registered in the lexer, not as external plugins.

3. **Two evaluator strategies**: `StreamEvaluator` (per-document, lower memory) vs `allAtOnceEvaluator` (all documents at once, enables cross-document operations). This is an interesting architectural split.

4. **No dynamic loading**: No use of `plugin` package, `go/build`, or bytecode loading. All formats must be registered at compile time in `Formats` slice.

5. **Global expression parser**: `ExpressionParser` is a package-level singleton (`pkg/yqlib/lib.go:13`) initialized via `InitExpressionParser()` during CLI startup (`cmd/root.go:86`).

## Notable Patterns

- **Factory pattern for formats**: `Format` struct holds factory functions for creating encoders/decoders (`pkg/yqlib/format.go:13-18`)
- **Expression tree evaluation**: Expressions are parsed into an `ExpressionNode` tree and evaluated by `DataTreeNavigator` traversing the tree
- **Operator composition**: Complex operations (like multiply-assign) are composed from simpler operators (`pkg/yqlib/operator_multiply.go:17`)
- **Context propagation**: `Context` struct carries state through evaluation, with `ChildContext()` for creating child contexts

## Tradeoffs

1. **Compile-time extension vs runtime flexibility**: Adding format support requires code changes and recompilation, but results in a single static binary with no dependencies.

2. **No plugin isolation**: Without dynamic loading, there's no isolation between extensions—a buggy encoder cannot crash the main process differently than a buggy native one.

3. **Singleton expression parser**: Single global parser simplifies usage but prevents multiple independent parser instances.

4. **Operator implementation in Go**: Operators are Go functions, which is efficient but requires contributors to write Go code rather than a simpler extension DSL.

## Failure Modes / Edge Cases

- **Missing format**: If `FormatFromString()` doesn't match a format, returns error with available formats list (`pkg/yqlib/format.go:140-149`)
- **Expression parse failure**: `ParseExpression` returns errors for invalid syntax, with helpful messages
- **Encoder/decoder mismatch**: Some formats only have encoder (e.g., `ShellVariablesFormat` has nil `DecoderFactory` at `pkg/yqlib/format.go:81-84`)
- **File read errors**: Handled per-file in evaluators; `readStream()` returns errors that propagate up

## Future Considerations

1. **Plugin system**: A proper plugin architecture could allow third-party format support without recompiling yq itself. This would require defining stable interfaces for `Plugin`, `Decoder`, and `Encoder contracts.

2. **Versioned interfaces**: If plugins are added, explicit stability guarantees would be needed for plugin authors.

3. **Extension API documentation**: The library (`pkg/yqlib/`) could be documented as a usable API for embedding yq in other Go programs.

## Questions / Gaps

- **No evidence of versioning policy for interfaces** — Are `Decoder`/`Encoder` considered stable APIs?
- **No third-party extension documentation** — Does the project want external contributors to add formats?
- **No runtime extension mechanism** — Is there a plan or desire for a plugin system?
- **Internal package access** — `cmd/` directly imports `github.com/mikefarah/yq/v4/pkg/yqlib` without a public API layer; is this intentional?

---

Generated by `study-areas/12-extensibility.md` against `yq`.