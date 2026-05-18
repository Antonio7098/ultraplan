# Repo Analysis: yq

## Command Architecture

### Repo Info

| Field | Value |
|-------|-------|
| Name | yq |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/yq` |
| Group | `yq` |
| Language / Stack | Go / spf13/cobra |
| Analyzed | 2026-05-15 |

## Summary

yq uses spf13/cobra for command architecture with two subcommands (`eval`/`e` and `eval-all`/`ea`) plus a `completion` command. Commands are defined via factory functions that return `*cobra.Command` structs. The root command provides shared flag definitions and `PersistentPreRunE` hook for initialization. Both evaluate commands share a common `initCommand()` helper and delegate heavy lifting to the `yqlib` package's evaluator and decoder/encoder factories.

## Rating

**6/10** — Commands are somewhat organized with clear delegation to yqlib library, but RunE functions contain mixed initialization, validation, and processing logic that could be more cleanly separated.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Root command definition | `New()` returns `*cobra.Command` with inline struct literal | `cmd/root.go:40-90` |
| Subcommand registration | `rootCmd.AddCommand(createEvaluateSequenceCommand(), createEvaluateAllCommand(), completionCmd)` | `cmd/root.go:217-221` |
| PersistentPreRunE hook | Sets up logging, reads NO_COLOR env var, initializes expression parser | `cmd/root.go:69-89` |
| eval command factory | `createEvaluateSequenceCommand()` returns `*cobra.Command` | `cmd/evaluate_sequence_command.go:11-49` |
| eval-all command factory | `createEvaluateAllCommand()` returns `*cobra.Command` | `cmd/evaluate_all_command.go:10-46` |
| Shared init helper | `initCommand()` processes args, validates flags, configures formats | `cmd/utils.go:18-45` |
| Flag definitions | 40+ flags defined on root command via `PersistentFlags()` | `cmd/root.go:92-216` |
| RunE delegates | `evaluateSequence()` calls `streamEvaluator.EvaluateFiles()` | `cmd/evaluate_sequence_command.go:152` |
| Decoder factory pattern | `configureDecoder()` calls `format.DecoderFactory()` | `cmd/utils.go:162-177` |
| Encoder factory pattern | `configureEncoder()` calls `format.EncoderFactory()` | `cmd/utils.go:196-227` |
| Custom flag type | `unwrapScalarFlagStrc` implements `pflag.Value` interface | `cmd/unwrap_flag.go:15-46` |
| Command constants | Package-level variables for flag values | `cmd/constant.go:1-39` |

## Answers to Protocol Questions

**1. How are subcommands registered?**

Subcommands are registered via `rootCmd.AddCommand()` with factory functions that return `*cobra.Command` instances (`cmd/root.go:217-221`). The pattern is:
- `createEvaluateSequenceCommand()` creates the `eval` command
- `createEvaluateAllCommand()` creates the `eval-all` command
- `completionCmd` is a pre-existing command variable

**2. How is command discovery handled?**

Cobra handles command discovery automatically via its `AddCommand()` tree. Shell completion for arguments is provided via `ValidArgsFunction` on each command (`cmd/evaluate_sequence_command.go:16-21`, `cmd/evaluate_all_command.go:15-20`). Flag completions are registered via `RegisterFlagCompletionFunc()`.

**3. Are commands declarative or imperative?**

Predominantly **imperative**. While command definitions use Cobra's declarative struct fields (Use, Short, Long, Example), the `RunE` functions contain substantial procedural code for:
- Argument processing (`initCommand()`)
- File handling (in-place writing via `WriteInPlaceHandler`)
- Front matter splitting
- Format auto-detection
- Conditional logic based on argument count

**4. How do parent/child commands communicate?**

- **Flag inheritance**: Child commands inherit all `PersistentFlags` from root
- **Shared state**: Package-level variables in `cmd/constant.go` store flag values (e.g., `outputFormat`, `inputFormat`, `writeInplace`)
- **PreRunE hook**: `PersistentPreRunE` on root runs before any child command's execution (`cmd/root.go:69-89`)
- **cmd.Context**: Cobra passes `*cobra.Command` and `args` to RunE functions

**5. How much logic exists directly in commands?**

Significant logic resides in command RunE functions:
- `evaluateSequence()`: 161 lines with full file processing pipeline
- `evaluateAll()`: 143 lines similar pipeline
- `initCommand()`: 27 lines of shared initialization
- `configureDecoder/Encoder()`: ~35 lines each for format setup
- Front matter handling duplicated in both commands (`cmd/evaluate_sequence_command.go:123-141`, `cmd/evaluate_all_command.go:103-120`)

However, actual data processing (parsing, expression evaluation, encoding) is delegated to `yqlib` package.

## Architectural Decisions

- **Factory pattern for commands**: Each command created via `createXxxCommand()` function returning `*cobra.Command`
- **Global flag variables**: All flag values stored as package-level vars in `constant.go` rather than passed via context/struct
- **Library delegation**: Heavy lifting (parsing, evaluation, encoding) pushed to `pkg/yqlib` package
- **Format factory pattern**: `yqlib.Format` struct with `DecoderFactory`/`EncoderFactory` function pointers enables plugin-like format support
- **Shared initialization**: Both evaluate commands share `initCommand()` and `configureDecoder/Encoder()` helpers

## Notable Patterns

1. **Cobra with spf13/pflag**: Standard Cobra patterns for flags and commands
2. **Conditional Pretty Print**: `processExpression()` wraps expressions with pretty print filter when enabled (`cmd/evaluate_sequence_command.go:51-59`)
3. **Custom Flag Type**: `unwrapScalarFlagStrc` for boolean flag that tracks explicit setting vs default
4. **Deferred Cleanup**: Write in place uses `defer` for cleanup (`cmd/evaluate_sequence_command.go:86-90`)
5. **Backwards Compatibility**: Multiple compatibility layers in `handleBackwardsCompatibility()` and format detection (`cmd/utils.go:66-71`, `cmd/utils.go:113-140`)

## Tradeoffs

- **Pro**: Thin command handlers that delegate to reusable yqlib library
- **Pro**: Centralized flag definition on root command with inheritance
- **Pro**: Factory pattern enables easy command composition
- **Con**: Global package-level variables for flags make testing harder and stateful
- **Con**: Duplicated front-matter and in-place writing logic across both commands
- **Con**: RunE functions are too long (~150+ lines each) with mixed concerns

## Failure Modes / Edge Cases

- **Stdin detection**: `processStdInArgs()` in `cmd/utils.go:249-274` has complex edge case handling for Github Actions piping
- **Expression vs file ambiguity**: `maybeFile()` and `processArgs()` try to auto-detect whether first arg is expression or filename
- **Format auto-detection**: Defaults to YAML when format unknown, but only after attempting detection (`cmd/utils.go:113-140`)
- **In-place write with no matches**: Exit status behavior when `exitStatus` flag set but nothing matches (`cmd/evaluate_sequence_command.go:156-158`)

## Future Considerations

- Extract duplicated front-matter handling into shared helper
- Extract in-place write logic into reusable handler
- Consider functional options pattern for decoder/encoder configuration to replace global `Configured*Preferences` vars
- Move more flag validation into Cobra's `ValidateRequiredFlags` or `_POSITIONAL` validation

## Questions / Gaps

- **No command clustering**: All commands registered directly on root, no intermediate command groups (e.g., `yq eval` vs `yq format convert`). May not scale to 100+ commands cleanly.
- **No pre/post run hooks per command**: Only `PersistentPreRunE` on root; individual commands have no lifecycle hooks
- **Limited evidence of command scaffolding**: No base command type or helper functions for creating new commands beyond the factory function pattern
- **Global preferences pattern**: `yqlib.ConfiguredYamlPreferences`, `yqlib.ConfiguredXMLPreferences` etc. are global vars - potential thread-safety concerns

---

Generated by `study-areas/02-command-architecture.md` against `yq`.