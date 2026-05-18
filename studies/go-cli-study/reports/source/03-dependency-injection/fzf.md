# Repo Analysis: fzf

## Dependency Injection & Wiring

### Repo Info

| Field | Value |
|-------|-------|
| Name | fzf |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/fzf` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

fzf has a single composition root in `core.Run()` that constructs all major components explicitly. Dependencies flow downward through constructor parameters. However, a package-level variable `sortCriteria` (result.go:121) is set as a side effect from `opts.Criteria` (core.go:82), representing hidden global state that breaks the explicit wiring pattern. The codebase uses interface abstraction for the TUI layer (`tui.Renderer` at tui/tui.go:843, `tui.Window` at tui/tui.go:872), but the core matching logic has no interface abstractions, limiting testability.

## Rating

**6/10** — Some injection but inconsistent. Clear composition root, but globals and lack of core interfaces reduce testability.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Composition root | `Run()` function constructs Terminal, Reader, Matcher | `src/core.go:54` |
| Event coordination | `util.EventBox` used as central event bus | `src/util/eventbox.go:12` |
| Terminal construction | `NewTerminal(opts, eventBox, executor)` | `src/terminal.go:948` |
| Reader construction | `NewReader(pusher, eventBox, executor, ...)` | `src/reader.go:36` |
| Matcher construction | `NewMatcher(cache, patternBuilder, sort, ...)` | `src/matcher.go:59` |
| TUI interface | `Renderer` and `Window` interfaces | `src/tui/tui.go:843` |
| Global state | `sortCriteria` package-level variable | `src/result.go:121` |
| Global state | `ttyin` package-level file handle | `src/terminal.go:60` |
| Constructor pattern | Options struct with all configuration | `src/options.go:571` |

## Answers to Protocol Questions

### 1. Where are dependencies constructed?

All dependencies are constructed in the `Run()` function (`src/core.go:54-640`), which serves as the composition root:

- Line 85: `eventBox := util.NewEventBox()`
- Line 116: `cache := NewChunkCache()`
- Line 178: `executor := util.NewExecutor(opts.WithShell)`
- Line 186: `terminal, err = NewTerminal(opts, eventBox, executor)`
- Line 203-205: `reader = NewReader(...)`
- Line 254: `matcher := NewMatcher(...)`

### 2. How are services passed around?

Services are passed via constructor parameters:

- `NewTerminal(opts, eventBox, executor)` at terminal.go:948
- `NewReader(pusher, eventBox, executor, ...)` at reader.go:36
- `NewMatcher(cache, patternBuilder, sort, tac, eventBox, revision, threads)` at matcher.go:59

Components communicate via the `util.EventBox` event bus (`src/util/eventbox.go:12`), which is passed to Terminal, Reader, and Matcher.

### 3. Is wiring centralized?

Yes. The `Run()` function in `src/core.go:54` is the single composition root where all components are created and wired together. This is a clear and explicit pattern.

### 4. Are globals avoided?

**No.** There are notable exceptions:

- `sortCriteria []criterion` at result.go:121 is a package-level variable set in core.go:82
- `ttyin *os.File` at terminal.go:60 is a package-level file handle
- Several regex patterns (`placeholder`, `whiteSuffix`, etc.) at terminal.go:54-59 are package-level

The `sortCriteria` global is particularly problematic as it is modified during `Run()` but read in sorting logic (`src/result.go:59`).

### 5. Is initialization explicit?

Mostly yes. All major components are constructed in `Run()`. However, `sortCriteria` is set as a side effect rather than being passed directly, creating an implicit dependency.

## Architectural Decisions

1. **Single Run() composition root** — All wiring happens in one function (`src/core.go:54`), making the app structure traceable.

2. **Event-based coordination** — `util.EventBox` (`src/util/eventbox.go:12`) is the central bus for async events between Reader, Matcher, and Terminal.

3. **TUI interface abstraction** — The `tui.Renderer` interface (`src/tui/tui.go:843`) allows swapping fullscreen vs light renderers, enabling some testability.

4. **No interface for core components** — Matcher, Reader, and Terminal have no interfaces, making them difficult to mock for testing.

## Notable Patterns

- **Functional options in constructors** — `NewMatcher` takes a `patternBuilder` function, demonstrating a form of DI
- **Inline ANSI processor** — The `ansiProcessor` function is created inline in `Run()` at core.go:88-113
- **Event coordination via EventBox** — Components coordinate through a sync.Cond-based event box (`src/util/eventbox.go:27`)
- **Inline item transformation** — `transformItem` function created inline at core.go:121-152

## Tradeoffs

1. **Global sortCriteria** — Setting a package-level variable for sorting criteria (result.go:121, set at core.go:82) is a classic global state pattern that makes the sorting behavior depend on call order rather than explicit injection.

2. **No interfaces for core components** — Matcher, Terminal, and Reader have no interfaces, preventing mock-based unit testing without the full event loop.

3. **Heavy inline composition** — The `Run()` function is 640 lines with inline closures (ansiProcessor, transformItem, patternBuilder), making it difficult to isolate components for testing.

4. **ttyin global handle** — The package-level `ttyin` file handle at terminal.go:60 persists across invocations when run as a library, which can cause issues in long-running processes.

## Failure Modes / Edge Cases

- `sortCriteria` race condition: If `Run()` is called concurrently with different sort criteria, the global `sortCriteria` variable will cause non-deterministic results
- ttyin handle leak: The global `ttyin` at terminal.go:60 is nil-checked but never closed, potentially holding file descriptors
- Matcher cannot be tested in isolation: Without an interface, `NewMatcher` creates a Matcher bound to a specific eventBox, preventing standalone testing
- EventBox blocking: `util.EventBox.Wait()` at eventbox.go:27 uses sync.Cond.Wait() which can mask coordination issues under load

## Future Considerations

1. Extract `sortCriteria` as a parameter to `Run()` or store it in a context struct
2. Add interfaces for Matcher, Reader, and Terminal to enable mock-based testing
3. Move `ttyin` to a closeable resource managed by the composition root
4. Consider separating the inline closures (ansiProcessor, transformItem) into named factory functions for better testability

## Questions / Gaps

- No evidence of `context.Context` usage for request-scoped values — search found no matches
- No factory pattern beyond direct constructors — components are created with `NewX` functions but not through a DI container or builder
- No structural dependency injection framework — wiring is manual in `Run()`

---

Generated by `study-areas/03-dependency-injection.md` against `fzf`.