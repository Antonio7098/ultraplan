# Repo Analysis: fzf

## Command Architecture

### Repo Info

| Field | Value |
|-------|-------|
| Name | fzf |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/fzf` |
| Group | `fzf` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

fzf does not use cobra or any subcommand library. It is a single-command program with flat flag-based options. Commands are defined purely via flag/option registration on a single `Options` struct, and there are no parent/child command relationships. The "command architecture" is essentially nonexistent — fzf is a monolithic filter program.

## Rating

**3/10**

fzf is a single-command tool with all options flattened into one level. There is no command hierarchy, no subcommand composition, and no lifecycle hooks beyond simple pre-processing. The `Run` function (`src/core.go:54`) is a large procedural function handling all modes (interactive, filter, benchmark). This design cannot scale beyond a single command scope.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Entry point | `main` calls `fzf.ParseOptions` then `fzf.Run` | `main.go:54`, `main.go:102` |
| Options struct | 120+ fields on single `Options` struct | `src/options.go:571-693` |
| ParseOptions | Single-level option parsing, no command tree | `src/options.go:3861-3926` |
| Run function | Single `Run` function handles all modes | `src/core.go:54` |
| No subcommands | No parent/child command registry found | `src/options.go` (entire file) |
| Flag-based help | `Usage` string used for `--help` | `src/options.go:22-247` |
| Shell integration | Print scripts via boolean flags (--bash, --zsh, --fish) | `main.go:59-73` |
| Mode selection | Mode determined by boolean flags on Options | `src/options.go:571-580` |

## Answers to Protocol Questions

**1. How are subcommands registered?**

No subcommand registration exists. fzf has no parent/child command structure. All functionality is accessed via flags on a single command. Evidence: `main.go:54` calls `ParseOptions` which processes args as flat flags; `main.go:59-100` checks boolean flags (`options.Bash`, `options.Zsh`, `options.Fish`, `options.Help`, `options.Version`, `options.Man`) to determine mode of operation.

**2. How is command discovery handled?**

There is no command discovery. The binary accepts a flat set of flags. Help is provided via the `Usage` global string (`src/options.go:22-247`) printed when `--help` is passed.

**3. Are commands declarative or imperative?**

Imperative. The `Options` struct (`src/options.go:571-693`) is mutable state built up by `ParseOptions`. There is no declarative command definition — just a large struct with 120+ fields and a monolithic `Run` function.

**4. How do parent/child commands communicate?**

No parent/child relationship exists. Communication between components happens through:
- Shared `*Options` struct passed to `Run` (`src/core.go:54`)
- Event channel (`eventBox`) for inter-goroutine communication (`src/core.go:85`)
- Channels on `Options` (`Input`, `Output`) for input/output streaming (`src/options.go:572-573`)

**5. How much logic exists directly in commands?**

All logic lives in `Run` (`src/core.go:54-640`), approximately 640 lines of procedural code handling:
- Interactive mode (`src/core.go:356-638`)
- Filter mode (`src/core.go:257-348`)
- Benchmark mode (`src/core.go:296-333`)
- Event coordination via switch on `util.Events`

## Architectural Decisions

- **Single struct options pattern**: All configuration lives in `Options` struct (`src/options.go:571`), which is passed to all components. This is a simple but non-extensible approach.
- **Event-based coordination**: `util.EventBox` (`src/util/eventbox.go`) coordinates between reader, matcher, and terminal via events (`EvtReadNew`, `EvtSearchFin`, etc.). See comment in `src/core.go:15-21`.
- **No plugin/extension system**: Functionality cannot be extended via commands; only via `--bind` flag for key handling.

## Notable Patterns

- **Boolean flag dispatch** (`main.go:59-100`): Shell integration modes selected via boolean flags (Bash, Zsh, Fish, Man, Help, Version). Not true subcommands.
- **Functional option helpers**: `nthTransformer` (`src/options.go:847`) and `delimiterRegexp` (`src/options.go:911`) return functions for late evaluation.
- **Post-processing validation**: `postProcessOptions` called in `core.go:68` to validate/normalize options after parsing.

## Tradeoffs

**Limited extensibility**: Adding a new subcommand (e.g., `fzf config`, `fzf preview`) would require significant refactoring. The current flat structure works for a single-purpose tool but would not scale.

**Monolithic `Run` function**: `src/core.go:54` handles all execution modes. This makes the code difficult to test in isolation and creates implicit coupling between interactive, filter, and benchmark modes.

**No command grouping**: Options are logically grouped by the `Usage` string documentation, but not enforced programmatically. There is no `CommandGroup` or similar clustering mechanism.

## Failure Modes / Edge Cases

- **Option conflicts**: Some flag combinations are invalid but only caught at runtime via `validateOptions` (`src/options.go:3921`).
- **Large option struct**: 120+ fields on `Options` creates maintenance burden and increases cognitive load.
- **No rollback on parse error**: If `ParseOptions` fails partway, partial state may exist (mitigated by creating new `Options` each call).

## Future Considerations

- Extract `Run` into smaller mode-specific functions (interactive, filter, benchmark) to improve testability.
- Consider command-tree pattern if CLI gains subcommands.
- The event coordination system is well-designed for concurrent components but is internal to `core.go`.

## Questions / Gaps

- No evidence of lifecycle hooks (pre-run, post-run). The only hook is `protector.Protect()` in `main.go:52` for security.
- No command factory or scaffolding patterns found.
- No subcommand registration mechanism exists — confirmed by absence of any `AddCommand`, `AddSubcommand`, or similar patterns across the codebase.
- Help generation is string-based (`Usage` constant) rather than generated from struct tags or command definitions.

---

Generated by `study-areas/02-command-architecture.md` against `fzf`.