# Repo Analysis: yq

## Engineering Philosophy & Tradeoffs

### Repo Info

| Field | Value |
|-------|-------|
| Name | yq |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/yq` |
| Group | `15-philosophy` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

yq is a lightweight and portable command-line data file processor that borrows jq's expression syntax and extends it to handle YAML, JSON, XML, TOML, INI, CSV, TSV, properties, HCL, and Lua. The project demonstrates a clear philosophy of simplicity and extensibility through a clean operator-based architecture, with deliberate tradeoffs around format support, expression evaluation strategies, and security.

## Rating

**8/10** — Strong coherent engineering style with intentional tradeoffs and documented philosophy.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Stated purpose | "lightweight and portable command-line data file processor" | `cmd/root.go:43` |
| Syntax inspiration | Uses jq-like syntax | `README.md:6` |
| Multi-format support | YAML, JSON, XML, TOML, INI, CSV, props, HCL, Lua | `README.md:351-369` |
| Expression parser | Participle-based lexer for expression parsing | `pkg/yqlib/expression_parser.go:25` |
| Operator architecture | Handler pattern for operators | `pkg/yqlib/operators.go:11` |
| Encoder/decoder pattern | Format-specific encoders/decoders registered in `format.go` | `pkg/yqlib/format.go` |
| Security flags | `--security-disable-env-ops` and `--security-disable-file-ops` | `cmd/root.go:213-214` |
| Expression evaluation | Two modes: stream (sequence) and all-at-once | `pkg/yqlib/stream_evaluator.go:14` |
| Documentation generation | Tests drive documentation generation | `pkg/yqlib/doc/operators/*.md` |

## Answers to Protocol Questions

### 1. What philosophy does this repo optimize for?

yq optimizes for **simplicity, portability, and usability**:

- **Lightweight**: Single dependency-free binary (`README.md:350`)
- **Portable**: Works on Linux, macOS, Windows, Docker, snaps, Homebrew, and more (`README.md:76-346`)
- **jq-compatible syntax**: Familiar expression language for jq users (`README.md:6`)
- **Multi-format support**: Single tool handles YAML, JSON, XML, TOML, INI, CSV, properties, HCL, Lua
- **Ease of use**: Auto-detects formats, supports STDIN piping, in-place updates

The `agents.md` file explicitly documents the encoder/decoder architecture that enables this extensibility without modifying core data structures (`agents.md:21-26`).

### 2. What complexity is intentionally accepted?

- **Expression evaluation complexity**: Two evaluator types (stream and all-at-once) with different tradeoffs (`pkg/yqlib/stream_evaluator.go:14` vs `pkg/yqlib/all_at_once_evaluator.go`)
- **Operator precedence parsing**: Complex operator precedence handling documented in `how-it-works.md:77-131`
- **Multiple format parsers**: Each format (YAML, JSON, XML, TOML, etc.) requires separate encoder/decoder implementations
- **Comment/style preservation**: Attempting to preserve comments and whitespace when updating YAML in-place (`README.md:361`)
- **Build tag complexity**: Optional format compilation via `//go:build !yq_no<format>` directives (`agents.md:124-128`)

### 3. What complexity is intentionally avoided?

- **No plugin system**: Formats are compiled in, not dynamically loaded
- **No external dependencies**: Dependency-free binary distribution
- **No network operations**: Explicitly avoids HTTP/TLS libraries (`SECURITY.md:16`)
- **Minimal configuration**: Few global flags; preferences passed per-format
- **No significant refactors accepted**: CONTRIBUTING.md explicitly states "Significant refactors take a lot of time to understand and can have all sorts of unintended side effects" (`CONTRIBUTING.md:9`)
- **Release pipeline changes avoided**: "Release pipeline PRs are a security risk" (`CONTRIBUTING.md:10`)

## Architectural Decisions

### Operator Pattern
yq uses a functional operator handler pattern where each operator implements `operatorHandler` signature:
```go
type operatorHandler func(d *dataTreeNavigator, context Context, expressionNode *ExpressionNode) (Context, error)
```
Operators are defined in `operation.go` with precedence, registered via the lexer, and implemented in separate files. This allows adding new operators without modifying core logic (`agents.md:230-242`).

### Encoder/Decoder Interface
The format system uses factory functions registered in `format.go`. Each format implements `Encoder` and `Decoder` interfaces independently. This cleanly separates format concerns from evaluation logic (`agents.md:39-57`).

### Expression Evaluation
- **StreamEvaluator**: Processes documents one at a time, lower memory footprint, cannot process cross-document expressions (`stream_evaluator.go:14`)
- **AllAtOnceEvaluator**: Loads all documents, can process cross-document expressions, higher memory usage (`all_at_once_evaluator.go`)

### Security Model
Security flags allow disabling env and file operations for untrusted input (`cmd/root.go:213-214`):
- `--security-disable-env-ops`: Disables `env()` operator
- `--security-disable-file-ops`: Disables `load()` operator
- `--security-enable-system-operator`: Enables `system()` operator (disabled by default)

## Notable Patterns

1. **ExpressionScenario testing**: Tests use a structured scenario pattern where `skipDoc` controls whether test cases generate user documentation (`pkg/yqlib/operator_add_test.go:85-101`)

2. **Cross-function pattern**: Binary operators use `crossFunction` with `crossFunctionPreferences` for flexible evaluation strategies (`operators.go:113-172`)

3. **CandidateNode cloning**: Assignments clone the original node before modification to preserve original context (`operators.go:39-40`)

4. **Context threading**: Operator handlers receive and return `Context` objects that thread state through expression evaluation (`operators.go:11`)

5. **Format registry**: All formats registered centrally in `format.go` with factory functions (`format.go`)

## Tradeoffs

| Tradeoff | Rationale |
|----------|-----------|
| Two evaluator types vs single unified | Memory efficiency vs cross-document operations |
| In-place YAML updates with comment preservation | Tradeoff between functionality and complexity; known issues with whitespace (`README.md:476`) |
| Build tags for optional formats vs single binary | Flexibility vs distribution complexity |
| Operator precedence complexity vs intuitive syntax | Familiar jq-like behavior requires careful precedence handling |
| Accepts complexity of multiple format parsers | Enables the "one tool for many formats" value proposition |

## Failure Modes / Edge Cases

1. **Comment/whitespace preservation**: Known issues with whitespace handling when updating YAML in place (`README.md:476`)

2. **Operator precedence surprises**: Complex expressions without parentheses may evaluate differently than expected (`how-it-works.md:120-131`)

3. **TOML round-trip limitations**: Prior to v4.52.1, TOML encoder was not fully supported (`release_notes.txt:39`)

4. **Boolean parsing**: yq 1.2 behavior (yes/no as booleans) is explicitly rejected; only YAML 1.2 standard is assumed (`README.md:478`)

5. **Slice index underflow**: Fixed in v4.53.1 (`release_notes.txt:11`)

6. **Circular alias stack overflow**: Fixed in v4.53.1 (`release_notes.txt:12`)

## Future Considerations

- YAML 1.2 boolean behavior enforcement will break existing workflows
- TOML 1.0 support is relatively new and may have edge cases
- Merge anchor behavior changes pending with `--yaml-fix-merge-anchor-to-spec` flag

## Questions / Gaps

1. **No explicit design document**: No `ARCHITECTURE.md` or `DESIGN.md` file; philosophy must be inferred from code and README
2. **No stated versioning policy**: Unclear how breaking changes are communicated
3. **Limited plugin extensibility**: Cannot add custom operators or formats without recompiling
4. **Single-maintainer risk**: Project appears to have a primary maintainer (Mike Farah)

---
Generated by `study-areas/15-philosophy.md` against `yq`.