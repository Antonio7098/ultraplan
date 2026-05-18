# Repo Analysis: yq

## Dependency Injection & Wiring

### Repo Info

| Field | Value |
|-------|-------|
| Name | yq |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/yq` |
| Group | `yq` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

yq uses a hybrid DI approach with centralized construction in `cmd/` commands but relies on package-level globals in `pkg/yqlib/` for core services like the logger and expression parser. The `yqlib` package exposes clear interfaces (`Decoder`, `Printer`, `Evaluator`, `Encoder`) that enable substitution, but the singleton pattern on `ExpressionParser` and `log` at package scope undermines testability. Commands construct concrete implementations directly rather than receiving interfaces, which is pragmatic but sacrifices some flexibility.

## Rating

**6/10** — Some injection but inconsistent. The `cmd/` layer wires concrete types from `yqlib` directly. Core services like logger and expression parser use package-level singletons. Interface abstractions exist at the library boundary but are not consistently used for DI within the library itself.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Command factory | `New()` returns `*cobra.Command` | `cmd/root.go:40` |
| Logger singleton | `var log = newLogger()` | `pkg/yqlib/lib.go:21` |
| ExpressionParser singleton | `var ExpressionParser ExpressionParserInterface` | `pkg/yqlib/lib.go:13` |
| Parser init | `InitExpressionParser()` lazily initializes singleton | `pkg/yqlib/lib.go:15-19` |
| Logger access | `GetLogger()` returns global logger | `pkg/yqlib/lib.go:26-28` |
| Decoder interface | `Decoder` interface with `Init`/`Decode` | `pkg/yqlib/decoder.go:7-10` |
| Printer interface | `Printer` interface with `PrintResults` | `pkg/yqlib/printer.go:12-18` |
| Evaluator interface | `StreamEvaluator` / `Evaluator` interfaces | `pkg/yqlib/stream_evaluator.go:14-18` |
| Encoder interface | `Encoder` interface | `pkg/yqlib/encoder.go:9-14` |
| Command-level globals | Package-level vars in `cmd/constant.go` | `cmd/constant.go:1-39` |
| PersistentPreRunE init | Calls `yqlib.InitExpressionParser()`, `GetLogger().SetLevel()` | `cmd/root.go:69-88` |
| Concrete construction | `NewStreamEvaluator()`, `NewAllAtOnceEvaluator()` return concrete types | `pkg/yqlib/stream_evaluator.go:25-27` |
| DataTreeNavigator | Created fresh via `NewDataTreeNavigator()` | `pkg/yqlib/all_at_once_evaluator.go:22-24` |

## Answers to Protocol Questions

**1. Where are dependencies constructed?**

Dependencies are constructed at two levels:
- **Command level** (`cmd/`): Commands (`evaluateSequence`, `evaluateAll`) call factory functions like `yqlib.NewStreamEvaluator()` (`cmd/evaluate_sequence_command.go:121`), `configureDecoder()` (`cmd/evaluate_sequence_command.go:117`), `configureEncoder()` (`cmd/evaluate_sequence_command.go:102-105`), and `NewPrinter()` (`cmd/evaluate_sequence_command.go:107`) inline within command handlers. Configuration preferences are mutated directly on package-level vars like `yqlib.ConfiguredYamlPreferences` (`cmd/utils.go:167`).
- **Package level** (`pkg/yqlib/`): The `ExpressionParser` singleton is lazily initialized via `InitExpressionParser()` (`pkg/yqlib/lib.go:15-19`) called from `PersistentPreRunE` (`cmd/root.go:86`). The `Logger` singleton is initialized at package load time (`pkg/yqlib/lib.go:21`).

**2. How are services passed around?**

Services flow downward from command handlers to library functions via concrete type parameters:
- Commands create concrete types: `streamEvaluator := yqlib.NewStreamEvaluator()` (`cmd/evaluate_sequence_command.go:121`)
- Evaluators, decoders, printers, and encoders are passed as interface types (`StreamEvaluator`, `Decoder`, `Printer`) to evaluator methods
- However, the `DataTreeNavigator` is created fresh inside each evaluator constructor, not shared

**3. Is wiring centralized?**

No. Wiring is fragmented:
- `cmd/root.go:40-223` creates the command tree and registers flags that mutate global `yqlib.Configured*` preferences
- `cmd/utils.go:162-227` configures decoders, encoders, and printer writers per-invocation
- Individual commands (`evaluate_sequence_command.go`, `evaluate_all_command.go`) directly instantiate evaluators
- `PersistentPreRunE` (`cmd/root.go:69-88`) handles logger and parser initialization

**4. Are globals avoided?**

No. There are several globals:
- `var ExpressionParser ExpressionParserInterface` (`pkg/yqlib/lib.go:13`) — global singleton
- `var log = newLogger()` (`pkg/yqlib/lib.go:21`) — global logger
- All `Configured*` vars like `ConfiguredYamlPreferences`, `ConfiguredXMLPreferences` (`cmd/root.go:121-215`) — global configuration structs mutated via flag bindings

**5. Is initialization explicit?**

Partially. The `ExpressionParser` is explicitly initialized via `InitExpressionParser()` called in `PersistentPreRunE`. However, configuration is implicitly mutated by Cobra flag bindings (e.g., `rootCmd.PersistentFlags().StringVar(&yqlib.ConfiguredXMLPreferences.AttributePrefix, ...)` (`cmd/root.go:121`)), which means the flag parsing side-effect is the actual initialization mechanism.

## Architectural Decisions

- **Facade command pattern**: `yq.go:10` calls `command.New()` which returns a fully-wired Cobra command tree. This is the composition root.
- **Format registry pattern**: `yqlib.FormatFromString()` (`pkg/yqlib/format.go`) returns a `Format` struct with `DecoderFactory` and `EncoderFactory` function pointers. This enables format extension without DI container changes.
- **Lazy singleton for parser**: `ExpressionParser` is `nil` until first use, then cached. This avoids initialization cost for simple invocations.
- **Global config structs**: Rather than passing config through call chains, `yqlib` uses package-level `Configured*` vars that are mutated by command-line flags.

## Notable Patterns

- **Interface definitions at library boundary**: `Decoder`, `Printer`, `Evaluator`, `Encoder` are clear interfaces (`pkg/yqlib/decoder.go:7`, `pkg/yqlib/printer.go:12`, `pkg/yqlib/stream_evaluator.go:14`, `pkg/yqlib/encoder.go:9`)
- **Factory functions for evaluators**: `NewStreamEvaluator()` and `NewAllAtOnceEvaluator()` return interface types but construct concrete structs internally
- **Configuration via package-level vars**: `ConfiguredYamlPreferences`, `ConfiguredCsvPreferences`, etc. are global structs that hold runtime configuration

## Tradeoffs

- **Globals simplify wiring**: Using package-level vars for config and singletons for core services avoids passing context through every function call, keeping the CLI code relatively simple
- **Testability cost**: The global `ExpressionParser` and `log` cannot be easily substituted in tests without the lazy-initialization pattern adding complexity
- **Direct construction in commands**: Each command creates its own evaluator instance rather than reusing a shared one, which is stateless and thus harmless, but signals no unified composition strategy
- **Flag-to-global binding**: Cobra's flag binding directly mutates global structs, making it impossible to have multiple independent configurations in the same process

## Failure Modes / Edge Cases

- **Global logger state bleeds between tests**: Since `log` is a package-level var in `yqlib`, logging configuration from one test can affect subsequent tests
- **ExpressionParser initialized once**: The lazy `InitExpressionParser()` pattern means if a caller manually constructs an expression parser before `InitExpressionParser()` is called, they get a separate instance from the global one used by evaluators
- **Configuration mutations are irreversible**: The `Configured*` globals are mutated at runtime and never reset, so running yq twice in the same process with different flags could produce unexpected behavior
- **No `context.Context` for request-scoped values**: Dependencies carry no request context; all configuration flows through global vars or concrete constructor args

## Future Considerations

- Introduce a `Context` struct (backed by `context.Context`) to carry config, logger, and parser through the call chain instead of globals
- Consider a single `App` or `Engine` struct that encapsulates all `yqlib` services, constructed once at the composition root and passed to commands
- Extract interfaces for `DataTreeNavigator` and `ExpressionParser` to enable testing with mock implementations

## Questions / Gaps

- No evidence of dependency injection framework usage (no wire, fx, dig, etc.)
- No evidence of `context.Context` being passed through the evaluation chain for cancellation or timeouts
- Global `Configured*` structs are modified directly by flag bindings with no validation layer
- The `DataTreeNavigator` is created fresh in each evaluator but not shared; this is wasteful but harmless since it's stateless

---

Generated by `03-dependency-injection.md` against `yq`.