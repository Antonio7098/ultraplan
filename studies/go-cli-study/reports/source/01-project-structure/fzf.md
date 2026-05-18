# Repo Analysis: fzf

## Project Structure & Boundaries

### Repo Info

| Field | Value |
|-------|-------|
| Name | fzf |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/fzf` |
| Group | `01-project-structure` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

fzf is a mature, single-binary fuzzy finder with a clean two-layer architecture: a thin `main.go` entry point that handles CLI concerns (option parsing, shell integration scripts, man page display) and delegates to the `src/` package for all business logic. The source is organized into focused subpackages (`algo/`, `tui/`, `util/`, `protector/`) with clear dependency direction flowing inward. No `cmd/`, `internal/`, or `pkg/` directories are used—business logic lives directly in `src/` with fine-grained sub-package separation.

## Rating

**8/10** — Clean layering with understandable ownership. The CLI layer in `main.go` is thin and focused on input handling and output formatting (shell scripts, man page). Business logic is well-separated in `src/` with logical sub-package boundaries. Minor扣分: flat structure without `cmd/` convention makes the entry point less discoverable, and the entire codebase lives in a single module without `internal/` protection.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Entry point | `main.go` only 104 lines; imports `fzf` and `protector` packages only | `main.go:1-104` |
| CLI layer thinness | `main.go` handles: option parsing, shell script printing, man page display, version flag, tmux integration | `main.go:51-103` |
| Business logic entry | `fzf.Run(options)` is the main business logic entry | `main.go:102` |
| Package structure | `src/` contains core logic; subpackages: `algo/`, `tui/`, `util/`, `protector/` | `src/` directory |
| Import direction | `src/core.go` imports `tui` and `util`; terminal imports `tui` and `util` | `src/core.go:11-13`, `src/terminal.go:28-30` |
| No internal/ usage | All packages are importable; `internal/` not used | N/A |
| Dependency flow | CLI (`main`) → `src/fzf` → `src/tui`, `src/util`, `src/algo` | `main.go:10-11` |
| Algo package | Search algorithms (fuzzy matching) isolated in `src/algo/` | `src/algo/algo.go:1` |
| TUI package | Terminal UI rendering isolated in `src/tui/` | `src/tui/tui.go:1` |
| Util package | Shared utilities (events, chars, slab allocation) in `src/util/` | `src/util/util.go:1` |
| Protector package | OS-specific security hardening (pledge on OpenBSD) | `src/protector/protector.go:1-6` |
| Options parsing | `ParseOptions` handles all CLI argument parsing | `src/options.go:22-3953` |
| Terminal rendering | `Terminal` struct and `Loop()` method in `src/terminal.go` | `src/terminal.go:93-8209` |
| Matcher | `Matcher` performs search operations, isolated in `src/matcher.go` | `src/matcher.go:36-271` |
| Reader | `Reader` handles input ingestion from stdin/files/commands | `src/reader.go:20-413` |
| Pattern | `Pattern` represents search patterns, built by `BuildPattern` | `src/pattern.go:47-501` |

## Answers to Protocol Questions

### 1. Why are folders organized this way?

fzf uses a flat directory structure with no top-level `cmd/` or `internal/` separation. All source code lives in `src/` as a single Go module. This is likely for simplicity and because the project doesn't need multi-binary support—the CLI is a single binary. Subpackages within `src/` (`algo/`, `tui/`, `util/`, `protector/`) provide logical grouping of related functionality.

**Evidence**: Top-level shows `main.go` and `src/` only; `src/` has flat structure with subdirectories for algo, tui, util, protector (`ls -la src/` output shows these subdirs alongside Go files).

### 2. What belongs in `cmd/` vs `internal/` vs `pkg/`?

fzf does **not use** `cmd/`, `internal/`, or `pkg/` conventions. Instead:
- **`main.go`** at root: Entry point handling CLI concerns (option parsing, script printing, man page display)
- **`src/`**: All business logic (pattern matching, terminal UI, input reading, algorithms)
- **`src/algo/`**: Fuzzy matching algorithms
- **`src/tui/`**: Terminal UI rendering (light mode, tcell mode)
- **`src/util/`**: Event system, character handling, slab allocation
- **`src/protector/`**: OS-specific security (pledge on OpenBSD)

This is a valid (if unconventional) approach for single-binary CLI tools where the "CLI layer" is thin enough to fit in `main.go` without a separate `cmd/fzf/` package.

**Evidence**: `main.go:51-103` shows CLI handling; `src/core.go:53-639` shows `Run()` function as business logic entry.

### 3. Is the CLI layer thin?

**Yes.** `main.go` is only 104 lines and handles:
- Option parsing via `fzf.ParseOptions()` (`main.go:54`)
- Shell script printing (bash, zsh, fish completions, key bindings) via embedded files (`main.go:17-33`)
- Man page display (`main.go:86-100`)
- Version display (`main.go:78-85`)
- Delegation to `fzf.Run(options)` for actual work (`main.go:102`)

**Evidence**: `main.go:1-104` is the complete CLI layer; `src/core.go:54-639` shows `Run()` which orchestrates all business logic.

### 4. Where does business logic actually live?

Business logic lives in `src/` package, specifically in:
- **`src/core.go`**: `Run()` function orchestrates Reader, Matcher, Terminal, and event coordination (`src/core.go:54-639`)
- **`src/matcher.go`**: `Matcher` performs fuzzy search (`src/matcher.go:36-271`)
- **`src/reader.go`**: `Reader` ingests input from stdin, files, or commands (`src/reader.go:20-413`)
- **`src/terminal.go`**: `Terminal` handles all terminal I/O and user interaction (`src/terminal.go:1-8209`)
- **`src/pattern.go`**: `Pattern` represents search patterns with various term types (`src/pattern.go:47-501`)
- **`src/algo/`**: Algorithm implementations for fuzzy matching (`src/algo/algo.go:1-28229`)
- **`src/tui/`**: UI rendering implementations (light, tcell) (`src/tui/tui.go:1-1510`)

**Evidence**: `main.go:10` imports `github.com/junegunn/fzf/src` for `fzf` package; `main.go:102` calls `fzf.Run(options)`.

### 5. How do they prevent package coupling?

fzf uses several mechanisms to prevent coupling:
1. **Sub-package isolation**: `algo/`, `tui/`, `util/` are separate packages with clear interfaces
2. **Event-driven decoupling**: Components communicate via `util.EventBox` (`src/util/eventbox.go:1-1960`), not direct calls
3. **No circular dependencies**: `src/core.go` imports `tui` and `util`; `tui` imports `util`; `util` has no imports from `src`
4. **Interface-based design**: Components like `Matcher`, `Reader`, `Terminal` communicate through well-defined types (`MatchRequest`, `MatchResult` in `src/matcher.go:14-26`)

**Evidence**: `src/core.go:85` creates `eventBox` for inter-component communication; `src/core.go:214-254` builds `Matcher` with `patternBuilder` function; import graph shows clean direction: `main` → `src/fzf` → `src/tui`, `src/util`, `src/algo`.

## Architectural Decisions

1. **Single module with flat structure**: No `cmd/` or `internal/` directories. All source in `src/` as one module. This simplifies build but means the entry point isn't protected from importing internal packages.

2. **Embedded assets via go:embed**: Shell scripts (bash, zsh, fish completions/key bindings) and man page are embedded at compile time (`main.go:17-36`). This removes the need for runtime file lookup and makes the binary self-contained.

3. **Event-driven architecture**: Core components (Reader, Matcher, Terminal) communicate via an EventBox (`src/util/eventbox.go`). This allows loose coupling and asynchronous coordination.

4. **TUI abstraction**: The TUI is abstracted behind a `tui` interface with two implementations: `light` (basic terminal) and `tcell` (full terminal library). This allows fallback for limited terminals.

5. **Platform-specific code**: `protector/` package provides OS-specific security hardening (pledge on OpenBSD). Platform-specific files exist for unix/windows in reader, terminal, result, etc.

6. **Algorithm isolation**: The fuzzy matching algorithm is completely isolated in `src/algo/` and is performance-critical (includes SIMD implementations for x86_64 and ARM64).

## Notable Patterns

1. **Coordinator pattern**: `src/core.go` (`Run()` function, lines 54-639) acts as a coordinator that wires together Reader, Matcher, Terminal, and Executor via an EventBox.

2. **Streaming-friendly design**: Reader supports streaming input, ChunkList manages memory-bounded item storage, Matcher can operate in streaming mode for filter mode (`src/core.go:257-348`).

3. **Deferred execution**: `util.RunAtExitFuncs()` (`src/core.go:72`) allows registration of cleanup functions to run at program exit.

4. **State machine in Terminal**: Terminal handles many state transitions via `EvtSearchNew`, `EvtSearchFin`, etc. (`src/terminal.go` event handling).

5. **Revision-based caching**: Pattern caching uses revision numbers to invalidate cache when input changes (`src/core.go:231-253`).

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| No `cmd/` directory | Simpler structure but entry point is less discoverable; `main.go` imports directly into business logic package |
| No `internal/` packages | Any package in the module can import any other, reducing enforced boundaries |
| Single module | No multi-module complexity, but no separate `internal` protection |
| Flat `src/` structure | Easy to navigate for a small codebase, but could become unwieldy if project grew |
| Platform-specific subpackages | Files like `reader_unix.go`, `terminal_windows.go` are scattered; platform-specific code in `src/protector/` is minimal |

## Failure Modes / Edge Cases

1. **Memory pressure**: ChunkList has a `--tail` option to limit memory, but unbounded input could cause high memory usage (`src/chunklist.go:1-3737`).

2. **Streaming filter edge cases**: Not compatible with `--tail`, `--sort` must be disabled (`src/core.go:199`).

3. **ANSI state across lines**: The `ansiState` tracking across lines (`src/core.go:92-112`) must handle reset correctly when lines have partial ANSI codes.

4. **Height unknown mode**: When `--height` is auto, fzf must determine height based on input, which can cause delay before first render (`src/core.go:363-394`).

5. **Denylist-based pruning**: Pattern cache invalidation on denylist changes (`src/core.go:236-243`) must be thread-safe.

## Future Considerations

1. **Consider `cmd/fzf/` structure** if the project grows more CLI commands or entry points.
2. **Consider `internal/` for packages that shouldn't be imported externally** (e.g., algo internals, tui implementation details).
3. **Modularize `src/terminal.go`** which at 8209 lines is the largest and most complex file.

## Questions / Gaps

1. **Why no `cmd/` directory?** For a project with only one binary, this is reasonable, but `cmd/fzf/` would make the CLI layer more explicit and discoverable.

2. **No evidence found for plugin system** beyond shell integration scripts. The `plugin/` directory at top level is empty (just a symlink placeholder in some installs).

3. **No evidence of `internal/` package protection** - all `src/` packages are importable by external users of the module.

---

Generated by `study-areas/01-project-structure.md` against `fzf`.