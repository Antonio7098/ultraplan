# Repo Analysis: opencode

## IO Abstraction & Testability

### Repo Info

| Field | Value |
|-------|-------|
| Name | opencode |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Opencode has **minimal IO abstraction** for testability. While some components use `io.Writer`/`io.Reader` interfaces (notably the LSP transport layer), the CLI output layer uses direct `fmt.Printf` and `os.Stdout`/`os.Stderr` throughout. Filesystem access is predominantly direct `os.*` calls. HTTP clients are injectable but created inline in constructors. Tests rely on return value assertions rather than output capture.

**Fast heuristic**: "Could I unit test commands without a real terminal?" — **No**. Direct stdout/stderr everywhere prevents output capture testing.

## Rating

**3/10** — Direct stdout/filesystem/network throughout. No IO abstraction for CLI commands. Limited testability.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Direct stdout/stderr | `format/spinner.go:72` uses `tea.WithOutput(os.Stderr)` | `internal/format/spinner.go:72` |
| Direct stdout/stderr | `spinner.go:93` uses `fmt.Fprintf(os.Stderr, ...)` | `internal/format/spinner.go:93` |
| Direct stdout/stderr | `lsp/client.go:99,102` writes `fmt.Fprintf(os.Stderr, ...)` | `internal/lsp/client.go:99,102` |
| Direct stdout/stderr | `shell.go:112` writes `fmt.Fprintf(os.Stderr, ...)` | `internal/llm/tools/shell/shell.go:112` |
| Direct stdout/stderr | `app.go:156` uses `fmt.Println(format.FormatOutput(...))` | `internal/app/app.go:156` |
| Direct stdout/stderr | `config.go:624` uses `fmt.Printf` | `internal/config/config.go:624` |
| Direct stdout/stderr | `cmd/root.go:56` uses `fmt.Println(version.Version)` | `cmd/root.go:56` |
| IO interface | LSP uses `WriteMessage(w io.Writer, msg *Message)` | `internal/lsp/transport.go:16,41` |
| IO interface | `diff.go:326` uses `SyntaxHighlight(w io.Writer, ...)` | `internal/diff/diff.go:326` |
| IO interface | `view.go:294-314` wraps `bufio.Scanner` with `io.Reader` | `internal/llm/tools/view.go:294-314` |
| strings.Builder | Used in `diff.go:613,824,841` for output building | `internal/diff/diff.go:613` |
| strings.Builder | Used in `overlay.go:82,146` for layout building | `internal/tui/layout/overlay.go:82` |
| strings.Builder | Used in `ls.go:290,301` for tree output | `internal/llm/tools/ls.go:290` |
| HTTP injectable | `fetchTool` struct has `client *http.Client` field | `internal/llm/tools/fetch.go:31` |
| HTTP injectable | `sourcegraphTool` struct has `client *http.Client` field | `internal/llm/tools/sourcegraph.go:27` |
| HTTP created inline | `NewFetchTool()` creates `&http.Client{Timeout: 30 * time.Second}` | `internal/llm/tools/fetch.go:33-36` |
| Direct filesystem | `view.go:225` uses `os.Open(filePath)` | `internal/llm/tools/view.go:225` |
| Direct filesystem | `grep.go:328` uses `os.Open(filePath)` | `internal/llm/tools/grep.go:328` |
| Direct filesystem | `logger.go:76,125` uses `os.Create`, `os.OpenFile` | `internal/logging/logger.go:76` |
| Direct filesystem | `edit.go:189` uses `os.Rename` | `internal/lsp/util/edit.go:189` |
| FS abstraction | `fileutil.go:116` uses `os.DirFS(searchPath)` returning `fs.FS` | `internal/fileutil/fileutil.go:116` |
| Test patterns | `ls_test.go` uses temp dirs/files, return assertions | `internal/llm/tools/ls_test.go` |
| No output capture | Tests don't use stdout/stderr capture helpers | `internal/llm/tools/ls_test.go:1-100` |

## Answers to Protocol Questions

### 1. Is stdout/stderr abstracted?

**No.** The CLI output layer uses direct `fmt.Printf`, `fmt.Fprintf(os.Stderr, ...)`, and `fmt.Println` throughout:

- `internal/app/app.go:156` — `fmt.Println(format.FormatOutput(...))` goes directly to stdout
- `internal/format/spinner.go:72` — spinner uses `tea.WithOutput(os.Stderr)` 
- `internal/lsp/client.go:99` — `fmt.Fprintf(os.Stderr, "LSP Server: %s\n", scanner.Text())`

The LSP transport layer (`internal/lsp/transport.go`) uses `io.Writer` interface for message writing, but this is internal to LSP protocol, not the CLI output abstraction.

### 2. Can commands be tested without a real terminal?

**No.** Because stdout/stderr are not abstracted, there is no way to capture CLI output in tests. Tests in `internal/llm/tools/ls_test.go` verify behavior by checking return values (e.g., `response.Content` strings) rather than capturing terminal output. No test helper for output capture exists.

### 3. Is filesystem access abstracted?

**No.** Filesystem access is predominantly direct `os.*` calls:

- `internal/llm/tools/view.go:225` — `os.Open(filePath)`
- `internal/llm/tools/grep.go:328` — `os.Open(filePath)`  
- `internal/logging/logger.go:76,125` — `os.Create(filename)`, `os.OpenFile(...)`
- `internal/lsp/util/edit.go:189` — `os.Rename(oldPath, newPath)`

The `internal/fileutil/fileutil.go` package provides some abstraction via `os.DirFS` returning `fs.FS` interface at line 116, but this is not used uniformly across the codebase.

### 4. Is network access mockable?

**Partially.** HTTP clients are stored as struct fields (making injection possible) but are created inline in constructors:

- `internal/llm/tools/fetch.go:31-36` — `client *http.Client` is a field, but `NewFetchTool()` creates it with `&http.Client{Timeout: 30 * time.Second}`
- `internal/llm/tools/sourcegraph.go:27-30` — same pattern

To mock network calls, you would need to modify the constructor or use a test double that replaces the client after construction.

## Architectural Decisions

1. **No IO abstraction layer for CLI output** — The project writes directly to stdout/stderr via fmt functions. This is simpler but prevents output capture testing.

2. **Interface-based LSP transport** — The LSP protocol layer uses `io.Writer`/`io.Reader` interfaces (`internal/lsp/transport.go:16,41`), which is the most testable part of the codebase.

3. **strings.Builder for in-memory output** — Some components build output in `strings.Builder` before writing (e.g., `internal/diff/diff.go:613`), which enables unit testing of formatting logic.

4. **HTTP client as struct field** — Network tools store `client *http.Client` as a field, allowing potential injection, but constructors create the client directly.

## Notable Patterns

- **LSP transport pattern** (`internal/lsp/transport.go`): Good `io.Writer`/`io.Reader` abstraction for message passing between client and server.
- **Provider interface** (`internal/llm/provider/provider.go`): Clean interface abstraction for LLM providers enabling dependency injection.
- **Service interfaces** — `message.Service`, `history.Service`, `session.Service` all have interfaces enabling dependency injection for business logic.
- **pubsub Broker** — Generic pub/sub pattern with channels, testable via subscription.

## Tradeoffs

| Aspect | Tradeoff |
|--------|----------|
| Simplicity vs Testability | Direct `fmt.Print` is simpler but prevents output capture testing |
| LSP vs CLI IO | LSP transport is well-abstracted; CLI output is not |
| HTTP injection | Struct field allows injection but constructors don't accept custom clients |
| strings.Builder | Used for formatting but not for CLI output abstraction |

## Failure Modes / Edge Cases

- **No output capture** — Cannot verify CLI output in tests without modifying the codebase
- **Integration tests required** — Many behaviors require integration tests with real filesystem
- **HTTP mock awkward** — Must construct tool then replace client field for mocking
- **Global state** — `defaultLogData`, `shellInstance` (package-level vars) complicate testing

## Future Considerations

1. **IO interface for CLI commands** — Introduce an `IO` interface with `Stdout()`, `Stderr()`, `Reader()` methods that can be injected and mocked in tests
2. **Constructor injection for HTTP** — Accept `*http.Client` as a parameter to `NewFetchTool()`, `NewSourcegraphTool()`, etc.
3. **Filesystem interface** — Create a `FileSystem` interface wrapping common operations (`Open`, `Create`, `ReadFile`, etc.) used throughout the codebase
4. **Test helpers** — Add `CaptureStdout()` / `CaptureStderr()` helpers using `io.MultiWriter` and `bytes.Buffer`

## Questions / Gaps

- No evidence found of any test helper for capturing stdout/stderr
- No evidence found of IO interface or protocol for CLI output abstraction
- No evidence found of filesystem interface abstraction used uniformly across the codebase
- Constructor injection for HTTP clients is not implemented; clients are created inline

---

Generated by `study-areas/06-io-abstraction.md` against `opencode`.