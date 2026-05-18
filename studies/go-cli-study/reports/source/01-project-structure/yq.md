# Repo Analysis: yq

## Project Structure & Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | yq |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/yq` |
| Group | `go-cli-study` |
| Language / Stack | Go (Cobra CLI) |
| Analyzed | 2026-05-15 |

## Summary

yq is a command-line YAML processor (and supports JSON, XML, CSV, TOML, etc.) using a clean two-layer architecture: a thin CLI layer in `cmd/` and business logic in `pkg/yqlib/`. The entry point at `yq.go:9-24` delegates immediately to `cmd.New()`, which creates the Cobra command tree. Commands are minimal; they configure decoders/encoders and delegate execution to `pkg/yqlib/` evaluators. Dependency direction is strictly unidirectional: `cmd/` imports `pkg/yqlib/`, never the reverse.

## Rating

**8/10** — Clean layering with understandable ownership. The CLI layer is genuinely thin (mostly flag handling and command wiring), and all business logic lives in `pkg/yqlib/`. The separation is consistent and well-disciplined.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Entry point | `main()` delegates to `cmd.New()` | `yq.go:9-10` |
| Command creation | `New()` function creates and configures Cobra root command | `cmd/root.go:40-222` |
| Default command wiring | If no subcommand matches, defaults to `eval` | `yq.go:14-20` |
| Command registration | `createEvaluateSequenceCommand()`, `createEvaluateAllCommand()`, `completionCmd` added | `cmd/root.go:217-221` |
| Business logic entry | `StreamEvaluator` and `Printer` created in command handlers | `cmd/evaluate_sequence_command.go:107-121` |
| CLI→biz imports | `cmd/` imports `github.com/mikefarah/yq/v4/pkg/yqlib` | `cmd/root.go:9`, `cmd/evaluate_sequence_command.go:7` |
| Thin CLI evidence | `evaluateSequence` mostly glues together yqlib components | `cmd/evaluate_sequence_command.go:61-161` |
| Format configuration | `configureDecoder()`, `configureEncoder()` in `cmd/utils.go:162-227` | `cmd/utils.go:162-227` |
| No reverse import | `pkg/yqlib/` has no imports from `cmd/` (verified via structure scan) | `pkg/yqlib/lib.go:1-12` |
| Available formats | `GetAvailableInputFormats()` / `GetAvailableOutputFormats()` exposed by yqlib | `cmd/root.go:103-114` |
| Expression parser | `InitExpressionParser()` called at startup | `cmd/root.go:86` |
| Configuration preferences | XML, CSV, TSV, Lua, Properties, Shell preferences all live in yqlib | `cmd/root.go:121-166` |

## Answers to Protocol Questions

### 1. Why are folders organized this way?

The structure follows Go convention for CLI tools: `cmd/` holds executable entry points (the CLI layer), `pkg/` holds reusable library code. yq's `pkg/yqlib/` is the business logic library that could theoretically be imported by other Go programs. The top-level `yq.go` is a thin bootstrap file that lives at the module root per Go convention.

Evidence: `yq.go:6-7` imports `command "github.com/mikefarah/yq/v4/cmd"`, showing the root package exists solely to delegate.

### 2. What belongs in `cmd/` vs `internal/` vs `pkg/`?

yq uses `cmd/` for CLI (command definitions, flag handling, argument processing) and `pkg/yqlib/` for the core processing library. Notably, they don't use `internal/` — they use `pkg/` to expose the library for external use (the module path is `github.com/mikefarah/yq/v4`). The `pkg/` naming signals this is a published library package.

- **`cmd/`**: Commands (`root.go`, `evaluate_sequence_command.go`, `evaluate_all_command.go`, `completion.go`), utilities (`utils.go`, `constant.go`, `unwrap_flag.go`), and version (`version.go`). All CLI-specific concerns.
- **`pkg/yqlib/`**: Decoders, encoders, operators, expression parsing, data structures, evaluation logic. The actual business logic.

### 3. Is the CLI layer thin?

Yes. The `cmd/` files are primarily:
- Flag definitions and parsing (`cmd/root.go:92-212`)
- Command creation and wiring (`cmd/root.go:40-222`)
- Configuration of yqlib components (`cmd/utils.go:93-227`)
- Delegation to yqlib evaluators (`cmd/evaluate_sequence_command.go:107-161`)

The `evaluateSequence` function at `cmd/evaluate_sequence_command.go:61-161` is ~100 lines but mostly error handling and configuration of yqlib components, not business logic.

### 4. Where does business logic actually live?

In `pkg/yqlib/`, specifically:
- `lib.go` — public API (`StreamEvaluator`, `NewPrinter`, `InitExpressionParser`)
- `stream_evaluator.go`, `string_evaluator.go` — evaluation orchestration
- `operator_*.go` (~60 files) — expression operators
- `decoder_*.go`, `encoder_*.go` — format handling (yaml, json, xml, toml, etc.)
- `lexer*.go`, `expression_parser.go` — expression parsing
- `printer.go`, `printer_writer.go` — output formatting

### 5. How do they prevent package coupling?

Unidirectional imports: `cmd/` imports `pkg/yqlib/` but `pkg/yqlib/` has no knowledge of `cmd/`. The CLI layer is purely a consumer of the yqlib library. This means:
- yqlib can be imported and used in other Go programs
- yqlib is not contaminated by CLI concerns
- Testing can target yqlib directly without CLI wiring

Evidence: `pkg/yqlib/lib.go:1-11` imports only standard library + external deps (goccy/go-yaml, alecthomas/participle), no internal cross-package imports visible.

## Architectural Decisions

1. **Default command fallback** (`yq.go:14-20`): If no subcommand matches, yq defaults to `eval` instead of showing help. This makes the tool more approachable for ad-hoc usage.

2. **Global logger via package-level var** (`pkg/yqlib/lib.go:21`): `var log = newLogger()`. Configuration happens in `cmd/root.go:81-84` via `yqlib.GetLogger().SetLevel()` and `SetSlogger()`. This is a pragmatic choice but creates hidden coupling via global state.

3. **Global expression parser** (`pkg/yqlib/lib.go:13-18`): `var ExpressionParser ExpressionParserInterface` initialized lazily via `InitExpressionParser()`. Called from `cmd/root.go:86`. Another global, but avoids parsing overhead for non-expression commands.

4. **Format registry pattern**: `pkg/yqlib/format.go` provides `FormatFromString()` which returns `*Format` with `DecoderFactory` and `EncoderFactory` function fields. This allows runtime registration of formats (yaml, json, xml, toml, csv, etc.) without a central registry file.

## Notable Patterns

1. **Factory pattern for decoders/encoders**: `cmd/utils.go:162-177` calls `format.DecoderFactory()` and `format.EncoderFactory()` to create the appropriate handler based on input/output format.

2. **Stream evaluation**: `pkg/yqlib/stream_evaluator.go` processes files document-by-document without loading entire file into memory, appropriate for large YAML files.

3. **CandidateNode as core data structure**: `pkg/yqlib/candidate_node.go` defines the AST-like structure used throughout the evaluation. Uses YAML-native concepts (Kind, Tag, Content for children).

4. **Flag configuration delegates to yqlib preferences**: `cmd/root.go:121-166` directly sets fields on `yqlib.ConfiguredXMLPreferences`, `yqlib.ConfiguredCsvPreferences`, etc., rather than passing configuration through constructor calls.

## Tradeoffs

1. **Global state for logger and expression parser** (lib.go:13-21): Makes initialization order dependent. The `InitExpressionParser()` call in `cmd/root.go:86` must happen before any expression evaluation. Global var is pragmatic but can cause subtle bugs in testing or if the library is used directly.

2. **Preferences are package-level vars** in yqlib (e.g., `ConfiguredXmlPreferences` in `decoder_xml.go`): Configuration is global, which works for a single CLI but would be problematic for embedding yqlib as a library in a larger application that needs multiple independent configurations.

3. **No `internal/` package** — the `pkg/yqlib` is exposed as a public library. This is intentional (others import yq for its library), but it means the CLI layer cannot use unexported internal helpers that might be inappropriate for a public API.

4. **CLI layer does significant configuration work**: Commands wire together many yqlib components (`cmd/evaluate_sequence_command.go:93-121`). If the number of format options grows, this configuration burden in `cmd/` will grow.

## Failure Modes / Edge Cases

1. **Expression parser initialization race** — If `InitExpressionParser()` is not called before expression evaluation, `ExpressionParser` will be nil (`pkg/yqlib/lib.go:15-18`). Call site at `cmd/root.go:86` ensures this happens before any command runs.

2. **Global logger with different configured levels** — If yqlib is used as a library and logger is reconfigured, the global `log` var is shared. Any tests or concurrent use could see race conditions on log level configuration.

3. **Format auto-detection relies on file extension** (`cmd/utils.go:113-139`): Unknown extensions default to YAML. If a file has `.yml` extension but contains JSON, the auto-detection will misidentify it.

4. **Backwards compatibility hacks** — `cmd/utils.go:66-71` handles `--tojson` flag deprecated in favor of `-o=json`. Such compatibility code in the CLI layer adds complexity over time.

## Future Considerations

1. The global preference pattern (`ConfiguredYamlPreferences`, etc.) would benefit from dependency injection if yqlib is ever used as a library in multi-tenant contexts.

2. The `cmd/utils.go` configuration functions (`configureDecoder`, `configureEncoder`) are 60+ lines each and mix flag-handling concerns with yqlib configuration. Extracting a configuration builder in yqlib could simplify the CLI layer.

3. `internal/` could be used to share utilities between `cmd/` and `pkg/yqlib/` without exposing them publicly, though current structure doesn't require this.

## Questions / Gaps

1. No evidence found for explicit package boundary enforcement (e.g., no `internal/` to prevent `pkg/yqlib/` imports into `cmd/`). The boundary is convention-based.

2. Testing approach for yqlib: not examined if there's a separate test strategy for the library vs CLI.

---

Generated by `study-areas/01-project-structure.md` against `yq`.