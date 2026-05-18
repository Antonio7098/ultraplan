# Repo Analysis: fzf

## Extensibility & Plugin Design

### Repo Info

| Field | Value |
|-------|-------|
| Name | fzf |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/fzf` |
| Group | `12-extensibility` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

fzf is an interactive Unix filter program with a rich extensibility model centered on its `--bind` action system and `--listen` HTTP server. While it lacks a traditional plugin system with dynamic loading, it provides extensive customization through key bindings, dynamic reloading, preview commands, and a remote execution API. The architecture is modular with separated `tui`, `util`, and `algo` packages, but extension is primarily achieved through external process execution rather than internal module substitution.

## Rating

**7/10** — Well-designed modularity

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| `--bind` action parsing | Action type constants and parsing logic | `src/options.go:2027-2172` |
| Action execution types | Enum of action types: `actExecute`, `actReload`, `actPreview`, etc. | `src/options.go:975-980` |
| Keymap structure | `map[tui.Event][]*action` for bound actions | `src/options.go:644` |
| HTTP server for remote execution | Custom HTTP server implementation | `src/server.go:40-145` |
| Action channel mechanism | Actions dispatched via `chan []*action` | `src/server.go:42` |
| Options struct (public API) | Complete configuration options | `src/options.go:571-693` |
| Internal package structure | `tui`, `util`, `algo` subpackages | `src/tui/`, `src/util/`, `src/algo/` |
| EventBox for inter-component communication | EventPubSub pattern | `src/util/eventbox.go` |
| Pattern builder for extensibility | `patternBuilder` function closure | `src/core.go:246-253` |
| Preview command execution | `previewOpts` struct with command string | `src/options.go:368-383` |

## Answers to Protocol Questions

### 1. Can new commands be added cleanly?

**YES** — via the `--bind` option with `execute`, `execute-multi`, `reload`, `reload-sync`, and `become` actions.

- `--bind='ctrl-r:execute(ps -ef)'` executes arbitrary commands
- `--bind='ctrl-r:reload(date; ps -ef)'` dynamically updates the candidate list
- `--bind='enter:become(vim {1})'` replaces fzf with another process

Evidence: `src/options.go:2027-2172` defines `isExecuteAction()` parsing, and `src/options.go:2088-2093` shows action type constants.

### 2. Is extension anticipated?

**YES** — Extension is a first-class design concern.

- **Key binding system**: `--bind` supports 100+ actions (`src/options.go:994-1300`)
- **Preview system**: `--preview=COMMAND` with `{...}` placeholders (`src/options.go:159-174`)
- **HTTP server**: `--listen` for remote process execution (`src/server.go:81-145`)
- **Environment variables**: `FZF_DEFAULT_COMMAND`, `FZF_DEFAULT_OPTS`, `FZF_API_KEY`
- **Shell integration**: `--bash`, `--zsh`, `--fish` print setup scripts

Evidence: `src/server.go:17-21` shows the custom HTTP server implementation (not using net/http to reduce binary size).

### 3. Are interfaces stable?

**PARTIAL** — The `Options` struct (`src/options.go:571-693`) is well-defined, but there is no semantic versioning or stability guarantee.

- CLI flags are documented in `Usage` constant (`src/options.go:22-247`)
- Internal APIs (`util`, `tui`, `algo` packages) have no exported interfaces for external consumption
- The revision system in `core.go:23-39` manages internal state compatibility, but this is not exposed as a public API

### 4. Are internal APIs modular?

**YES** — The codebase is organized into distinct packages:

- `src/tui/` — Terminal UI abstraction (tcell, light, dummy renderers)
- `src/util/` — Utility functions (EventBox, chars, atomicbool, slab)
- `src/algo/` — Fuzzy matching algorithms with SIMD implementations
- `src/` — Core application logic

Evidence: `src/core.go:1-13` shows package imports, and `src/options.go:571-693` shows the `Options` struct as the main configuration point.

## Architectural Decisions

1. **Custom HTTP server without net/http**: Implemented to keep binary size small (2.8MB vs 5.7MB with net/http) (`src/server.go:147-152`)

2. **Action-based extensibility over plugin system**: Instead of dynamic library loading, fzf uses external process execution for extensions. This provides process isolation and security but limits deep integration.

3. **EventBox for internal pub/sub**: Components communicate via `util.EventBox` (`src/util/eventbox.go`), decoupled from direct function calls.

4. **Revision-based state management**: Internal state uses major/minor revision numbers for compatibility checking (`src/core.go:23-39`).

## Notable Patterns

1. **Action parsing pipeline**: String action names → `actionType` enum → `[]*action` struct → executed via `util.Executor`
2. **Placeholder template system**: `--preview`, `--bind` use `{n}`, `{q}`, `{f}` placeholders parsed by `placeholder` regex (`src/terminal.go:54-91`)
3. **Deferred action execution**: Actions like `execute-silent` and `transform*` block user input for `blockDuration` (1 second) then allow SIGINT to terminate (`src/terminal.go:67-69`)
4. **Watcher pattern for input sources**: `Reader` → `EvtReadNew/EvtReadFin` events → `Matcher` restart cycle (`src/core.go:16-21`)

## Tradeoffs

| Decision | Benefit | Cost |
|----------|---------|------|
| Custom HTTP server (no net/http) | Smaller binary (3.3MB vs 5.7MB) | Limited HTTP feature set |
| External process execution for extensions | Security through isolation, easy scripting | No in-process plugins, no deep integration |
| Action-based binding system | Declarative, composable | Limited to predefined action set |
| No formal plugin interface | Simplicity, stability | Cannot extend core matching behavior |

## Failure Modes / Edge Cases

1. **Action parsing errors**: Invalid `--bind` syntax returns error at parse time (`src/options.go:2043-2044`)
2. **Command timeout**: HTTP server uses 10-second read timeout (`src/server.go:34`), actions channel uses 2-second timeout (`src/server.go:35`)
3. **Reload during scan**: `matcher.CancelScan()` / `matcher.ResumeScan()` handle mutation during search (`src/core.go:516-535`)
4. **Placeholder validation**: Invalid placeholders silently fail or cause undefined behavior
5. **Socket file race**: `--listen` checks for existing socket but has TOCTOU window (`src/server.go:92-98`)

## Future Considerations

1. **No plugin API**: Third parties cannot add new matching algorithms or rendering backends without modifying source
2. **No semantic versioning**: Users cannot rely on interface stability across versions
3. **HTTP server limitations**: Custom implementation lacks WebSocket, HTTP/2, TLS support

## Questions / Gaps

1. **No evidence found** for formal extension interface or plugin API documentation
2. **No evidence found** for internal API stability guarantees or deprecation policy
3. **No evidence found** for dynamic module loading (plugin, bytecode, or CGO)

---

Generated by `study-areas/12-extensibility.md` against `fzf`.