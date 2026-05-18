# Repo Analysis: mitchellh-cli

## Performance & Resource Management

### Repo Info

| Field | Value |
|-------|-------|
| Name | mitchellh-cli |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/mitchellh-cli` |
| Group | `mitchellh-cli` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

mitchellh-cli is a lightweight Go CLI framework by Mitchell Hashimoto. It provides command registration, argument parsing, help generation, and autocomplete support. The library is minimal and well-focused with no built-in profiling hooks, deferring most performance responsibilities to the application developer.

## Rating

**6/10 — Acceptable performance**

The library itself is lean and starts fast due to lazy initialization via `sync.Once` for `init()`. The `CommandFactory` pattern encourages cheap factories (`cli.go:65-70`). However, there are no explicit memory management mechanisms, no streaming output primitives beyond `Ui` interfaces, and no profiling/benchmark hooks built in. UI operations in `BasicUi.ask` spawn goroutines with channel communication (`ui.go:73-91`), which is lightweight but not zero-cost. At 100x scale, the lack of connection pooling, resource pooling, or chunked processing would become apparent.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Lazy init | `sync.Once` defers CLI init to first call via `c.once.Do(c.init)` | `cli.go:178`, `cli.go:134` |
| Command factory | Factories should be "as cheap as possible, ideally only allocating a struct" | `cli.go:65-70` |
| Radix tree | Command lookup via `go-radix` library, O(k) where k is key length | `cli.go:333`, `cli.go:136` |
| Concurrent UI | `ConcurrentUi` wrapper uses `sync.Mutex` for thread-safe output | `ui_concurrent.go:9-12` |
| Async ask | `BasicUi.ask` uses goroutine + channels for non-blocking input | `ui.go:73-91` |
| Buffering | `UiWriter.Write` strips trailing newline then calls `Ui.Info` per write | `ui_writer.go:10-17` |
| Signal handling | Interrupt signal registered via `signal.Notify(sigCh, os.Interrupt)` | `ui.go:69-71` |
| Help template | Uses `text/template` with `sprig.TxtFuncMap()` for help rendering | `cli.go:517` |
| No profiling hooks | No `pprof`, benchmark flags, or metrics endpoints found | — |

## Answers to Protocol Questions

### 1. Is startup fast?

**Yes.** Startup is fast because initialization is deferred via `sync.Once` (`cli.go:134`). The `init()` function — which builds the radix tree, processes args, and sets up autocomplete — only runs on the first call to `Run()`, `IsHelp()`, `IsVersion()`, `Subcommand()`, or `SubcommandArgs()`. Each call uses `c.once.Do(c.init)` so initialization happens exactly once. The radix tree insertion is O(n*k) where n is command count and k is average key length (`cli.go:333-341`), which is efficient for typical CLI command counts (hundreds at most).

### 2. Is memory usage controlled?

**Moderately.** Memory usage is reasonable but not aggressively controlled:

- The `CLI` struct holds a `commandTree` (radix tree), `commandHidden` map, and `subcommand`/`subcommandArgs` strings — all modest in size (`cli.go:134-141`).
- `HelpFunc` generates help strings on demand via closures, not pre-allocated (`help.go:17-59`).
- The library creates no long-lived goroutines except for UI input handling (which terminates after input).
- No object pooling or arena allocation is present.
- `UiWriter` creates no allocations beyond the `Ui` interface call (`ui_writer.go:10-17`).

### 3. Is streaming used instead of buffering?

**Partial.** The library provides streaming-style UI interfaces (`Ui.Output`, `Ui.Info`, `Ui.Error`) that write immediately to an `io.Writer`. However:

- `UiWriter` wraps a `Ui` and writes line-by-line but is not a true stream — it's a convenience adapter.
- Help rendering via `template.Execute` writes to an `io.Writer` but templates are parsed on every help call (`cli.go:517`) — templates could be cached but Sprig function map recreation is not avoidable without refactoring.
- There is no built-in streaming for large data processing; the library is not designed for data-heavy workflows.

### 4. Are large operations incremental?

**No.** The library does not have a model for incremental or chunked operations. It is a pure CLI argument parsing and command dispatch framework. Heavy operations are entirely the responsibility of the `Command.Run()` implementation. There are no iterator patterns, pager integrations, or batch processing helpers.

## Architectural Decisions

- **Deferred initialization via sync.Once**: The `CLI` struct uses `sync.Once` to defer `init()` until first use (`cli.go:178`). This avoids upfront cost when creating a `CLI` instance and is a effective pattern for one-time setup. It also makes the API safe for concurrent use from different goroutines (though CLI is typically not parallelized).

- **Command factory pattern**: Commands are created via `CommandFactory` function types (`command.go:64-67`). The documentation explicitly states factories "should be as cheap as possible, ideally only allocating a struct" (`cli.go:65-70`). This defers command instantiation until the subcommand is identified, avoiding the cost of building all commands at startup.

- **Radix tree for command lookup**: Commands are stored in a radix tree (`go-radix`) enabling O(k) longest-prefix matching for nested subcommands (`cli.go:333`). This is a good choice for command routing.

- **Ui abstraction layer**: The `Ui` interface (`ui.go:19-43`) abstracts terminal interaction, allowing different implementations (`BasicUi`, `PrefixedUi`, `ConcurrentUi`). The `ConcurrentUi` wrapper uses a simple mutex (`ui_concurrent.go:14-16`) which is straightforward but coarse-grained — every operation locks the entire UI.

- **Autocomplete via posener/complete**: Autocomplete is delegated to an external library (`github.com/posener/complete`) with init gated behind `c.once.Do(c.init)` (`cli.go:388`). The autocomplete init walks the entire command tree (`cli.go:501-503`) which could be expensive with hundreds of commands, but is only called when autocomplete is detected in the environment.

## Notable Patterns

- **sync.Once lazy evaluation**: All public methods (`Run`, `IsHelp`, `IsVersion`, `Subcommand`, `SubcommandArgs`) trigger `c.once.Do(c.init)` first, ensuring init runs exactly once.

- **UiWriter as log adapter**: `UiWriter` implements `io.Writer` and converts newline-terminated log lines to `Ui.Info` calls — a useful bridge for integrating logging libraries (`ui_writer.go:10-17`).

- **Goroutine-per-input for Ask/AskSecret**: `BasicUi.ask` spawns a goroutine with channel communication to handle terminal input without blocking (`ui.go:76-91`). This is a standard non-blocking input pattern but does create a goroutine per prompt.

- **Command help template customization**: Commands can implement `CommandHelpTemplate` to override the default `text/template` help format (`command.go:49-62`).

## Tradeoffs

- **Autocomplete always walks the command tree when active**: `initAutocompleteSub` recursively walks the radix tree for every autocomplete call (`cli.go:501-503`). With many commands, this could add latency to autocomplete detection on every CLI invocation.

- **Mutex-based concurrency for Ui**: `ConcurrentUi` uses a single `sync.Mutex` for all operations, meaning only one goroutine can interact with the UI at a time. For high-throughput concurrent output, this could become a bottleneck — a more granular locking strategy or channel-based serialization would be better.

- **No resource pooling**: The library creates channels and goroutines per UI prompt (`ui.go:74-75`), each of which are cleaned up via `defer signal.Stop(ch)` and channel closure. This is fine for typical interactive use but could accumulate goroutines in tight loops.

- **No built-in profiling or metrics**: There are no `pprof` endpoints, no benchmark tests, and no observability hooks. Performance debugging of applications built on this library requires external instrumentation.

- **Help template parsing per call**: `template.New("root").Funcs(sprig.TxtFuncMap()).Parse(tpl)` is called every time help is rendered (`cli.go:517`). Template parsing is relatively expensive. Caching parsed templates would improve help rendering performance.

## Failure Modes / Edge Cases

- **Goroutine leak on interrupted Ask**: If `signal.Notify` fires before the goroutine in `BasicUi.ask` completes, the goroutine will exit via the `sigCh` case (`ui.go:98-103`). However, if the signal fires after the line is read but before the select, the goroutine may still complete and send on `lineCh`. The `errCh` and `lineCh` channels are unbuffered (1 element), so the goroutine will not block indefinitely sending. No explicit cleanup timeout exists.

- **Autocomplete detection on every Run**: Even when autocomplete is not being used, `c.Autocomplete && c.autocomplete.Complete()` is checked on every `Run()` call (`cli.go:184`). The `Complete()` method from `posener/complete` reads `COMP_LINE` env var and does string analysis — a small but recurring cost.

- **Radix tree memory for large command sets**: If a CLI registers thousands of commands, the radix tree (`commandTree`) and the hidden command map (`commandHidden`) will hold them all. This is inherent to the design but could be problematic for monorepo-style CLIs with very large command inventories.

- **Empty subcommand with nested commands**: When a nested subcommand is registered (e.g., "foo bar") but only "foo" is invoked, the library creates a placeholder `MockCommand` (`cli.go:372-378`) to show help for the missing parent. This is intentional but could mask configuration errors.

## Future Considerations

- **Template caching**: Parse and cache help templates on first use per command rather than on every help call.
- **Command tree pruning**: Add an option to register only top-level commands and lazily load subcommand factories to reduce startup cost for large CLIs.
- **Profiled builds**: Provide a build tag like `profiling` that exposes `net/http/pprof` endpoints for debugging CLI performance in production.
- **Async Ui with buffered channel**: Replace the per-prompt goroutine pattern with a persistent input reader goroutine and a work-request channel to reduce goroutine churn in interactive loops.

## Questions / Gaps

- **No benchmark suite**: No `*_test.go` files with `Benchmark*` functions were found. Performance regression detection is not automated.
- **No memory profiling hooks**: No calls to `runtime.MemProfile` or integration with `pprof`.
- **No buffered IO primitives**: The library uses `fmt.Fprint` directly on `io.Writer` instances. Buffered writers (`bufio.Writer`) could reduce syscall count for high-volume output but are not provided.
- **Ui concurrency granularity**: `ConcurrentUi` uses a single mutex for all operations. More fine-grained locking (separate locks for output vs. input, or a channel-based serializing goroutine) would improve throughput in concurrent scenarios.
- **Help text generation cost**: `helpCommands` walks the radix tree prefix for every help call (`cli.go:602-610`) and instantiates every matching command factory (`cli.go:560`). This is O(n) in the number of commands and could be expensive for help-on-error paths in large CLIs.

---

Generated by `study-areas/14-performance.md` against `mitchellh-cli`.