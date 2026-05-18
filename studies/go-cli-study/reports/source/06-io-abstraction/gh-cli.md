# Repo Analysis: gh-cli

## IO Abstraction & Testability

### Repo Info

| Field | Value |
|-------|-------|
| Name | gh-cli |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/gh-cli` |
| Group | `gh-cli` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

The `gh` CLI demonstrates elite IO abstraction for testability. The `iostreams` package (`pkg/iostreams/iostreams.go`) provides a central IO contract with both production and test constructors. Commands receive IO via a `Factory` struct that injects `*iostreams.IOStreams`, making output capture trivial. HTTP mocking is first-class via `httpmock.Registry`. Prompter is abstracted behind an interface with generated mocks.

## Rating

**8/10** — Most side effects isolated with clean IO contracts. The `iostreams.Test()` helper and `httpmock.Registry` enable comprehensive unit testing without real terminals or network. Minor扣分: some direct `os.Open`/`os.ReadFile` calls in command implementations (e.g., `pkg/cmd/variable/set/set.go:237`), but these are limited and testable via tempfile overrides.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| IOStreams type | `IOStreams` struct with `In`, `Out`, `ErrOut` fields | `pkg/iostreams/iostreams.go:49-54` |
| System IO | `System()` returns real stdout/stderr/stdin | `pkg/iostreams/iostreams.go:478-523` |
| Test IO | `Test()` returns in-memory buffers for all streams | `pkg/iostreams/iostreams.go:551-568` |
| Factory injection | `Factory.IOStreams` propagated to all commands | `pkg/cmdutil/factory.go:24` |
| Command Options | `ListOptions.IO *iostreams.IOStreams` received by commands | `pkg/cmd/issue/list/list.go:28` |
| Prompter interface | `Prompter` interface with generated mock | `internal/prompter/prompter.go:17-53` |
| Prompter mock generation | `//go:generate moq -rm -out prompter_mock.go . Prompter` | `internal/prompter/prompter.go:16` |
| HTTP mock registry | `Registry` implements `http.RoundTripper` | `pkg/httpmock/registry.go:18-22` |
| HTTP stub matching | `REST()`, `GraphQL()` matchers for test stubs | `pkg/httpmock/stub.go:35-61` |
| HTTP transport replacement | `ReplaceTripper()` swaps client transport | `pkg/httpmock/registry.go:14-16` |
| TTY override | `SetStdoutTTY()`, `SetStderrTTY()` for test control | `pkg/iostreams/iostreams.go:165-194` |
| Test helper usage | `iostreams.Test()` in issue list tests | `pkg/cmd/issue/list/list_test.go:29-31` |
| HTTP mock verification | `defer reg.Verify(t)` ensures all stubs called | `pkg/cmd/issue/list/list_test.go:75` |
| File input helper | `ReadFile()` wrapper for test-friendly file reading | `pkg/cmdutil/file_input.go:15` |
| TempFile override | `TempFileOverride *os.File` in IOStreams for tests | `pkg/iostreams/iostreams.go:86` |

## Answers to Protocol Questions

### 1. Is stdout/stderr abstracted?

**Yes.** The `IOStreams` struct (`pkg/iostreams/iostreams.go:49-54`) holds `Out` and `ErrOut` as `fileWriter` interface fields (not concrete `*os.File`). The `System()` function creates real IO (`pkg/iostreams/iostreams.go:478-523`), while `Test()` creates in-memory `bytes.Buffer` for both (`pkg/iostreams/iostreams.go:551-568`). Commands never reference `os.Stdout` or `os.Stderr` directly.

### 2. Can commands be tested without a real terminal?

**Yes.** The `iostreams.Test()` function returns `(io *IOStreams, in *bytes.Buffer, out *bytes.Buffer, errOut *bytes.Buffer)`. Tests capture stdout/stderr in memory and override TTY detection:

```go
ios, stdin, stdout, stderr := iostreams.Test()
ios.SetStdoutTTY(false)  // or true to simulate terminal
```

This pattern is used throughout: `pkg/cmd/issue/list/list_test.go:29-31` shows complete test isolation.

### 3. Is filesystem access abstracted?

**Partial.** The `IOStreams` struct has `TempFileOverride *os.File` (`pkg/iostreams/iostreams.go:86`) and `ReadUserFile()` method (`pkg/iostreams/iostreams.go:432-445`) for abstracted file reading. However, some commands use direct `os.Open`/`os.ReadFile` (e.g., `pkg/cmd/secret/set/set.go:385`, `pkg/cmd/variable/set/set.go:237`). These are generally testable via temp files since the test framework creates temp directories. The `pkg/cmdutil/file_input.go:15` provides a `ReadFile` helper.

### 4. Is network access mockable?

**Yes.** HTTP clients are injected via `Factory.HttpClient func() (*http.Client, error)` (`pkg/cmdutil/factory.go:37`). The `httpmock.Registry` (`pkg/httpmock/registry.go`) implements `http.RoundTripper` and provides matchers (`REST`, `GraphQL`) and responders (`JSONResponse`, `FileResponse`). Tests use `ReplaceTripper()` to swap the transport:

```go
reg := &httpmock.Registry{}
defer reg.Verify(t)
client := &http.Client{Transport: reg}
```

The `api` package (`api/client.go`) accepts an `*http.Client` directly, making network fully mockable.

## Architectural Decisions

1. **IOStreams as the central IO contract** — All commands receive `*iostreams.IOStreams` which encapsulates stdout, stderr, stdin, TTY detection, color scheme, pager, and progress indicators. This single struct replaces all global side-effect access.

2. **Factory pattern for dependency injection** — Commands receive a `*cmdutil.Factory` that provides `IOStreams`, `HttpClient`, `Config`, `BaseRepo`, `Branch`, `Prompter`, etc. This makes every dependency replaceable in tests.

3. **`Test()` constructor for in-memory IO** — The `iostreams.Test()` function (`pkg/iostreams/iostreams.go:551-568`) is the canonical way to create test IO. It returns buffers that tests read to assert output.

4. **Prompter interface with code generation** — The `Prompter` interface (`internal/prompter/prompter.go:17-53`) is mocked via `moq` (`prompter_mock.go`). This allows tests to simulate user input without real terminals.

5. **HTTP mock registry with verification** — `httpmock.Registry.Verify(t)` ensures all registered stubs are called, preventing tests that silently skip HTTP calls.

## Notable Patterns

- **runF injection point**: Commands like `NewCmdList(f *cmdutil.Factory, runF func(*ListOptions) error)` (`pkg/cmd/issue/list/list.go:47`) accept a test callback, allowing tests to inject behavior without running the actual command logic.
- **TTY override methods**: `ios.SetStdoutTTY(isTTY)` simulates terminal conditions for tests.
- **Deferred HTTP verification**: `defer reg.Verify(t)` at the start of each test ensures no stubbed HTTP calls are missed.
- **Options struct per command**: Each command has an `Options` struct (e.g., `ListOptions` at `pkg/cmd/issue/list/list.go:25-45`) that holds all dependencies, making construction explicit and testable.

## Tradeoffs

- **Prompter abstraction is complex**: Three implementations exist (huh, accessible, survey) selected at runtime based on `io.ExperimentalPrompterEnabled()` or `io.AccessiblePrompterEnabled()`. This adds complexity but ensures accessibility and feature flags.
- **Some direct filesystem usage**: Commands like `variable/set` (`pkg/cmd/variable/set/set.go:237`) use `os.Open` directly rather than going through an abstraction. However, these are testable via the standard Go temp file pattern.
- **Pager adds complexity**: The pager machinery (`StartPager`, `StopPager`, `pagerWriter`) wraps stdout, which can cause subtle test failures if output assertions don't account for pager buffering.

## Failure Modes / Edge Cases

- **EPIPE errors swallowed**: `pagerWriter.Write()` (`pkg/iostreams/iostreams.go:583-589`) wraps EPIPE errors in `ErrClosedPagerPipe`, which is silently ignored by callers in some cases.
- **HTTP stubs must be exhausted**: If a test registers an HTTP stub but the code path doesn't call it, `reg.Verify(t)` fails. This is correct behavior but can surprise new contributors.
- **TTY detection relies on file descriptors**: `IsStdoutTTY()` (`pkg/iostreams/iostreams.go:170-180`) checks `os.Stdout` only if `Out` is an `*os.File`. In tests, `Out` may be a `*bytes.Buffer`, making TTY detection always return false unless overridden.
- **Progress indicator tests are timing-sensitive**: `StartProgressIndicatorWithLabel()` (`pkg/iostreams/iostreams.go:291-328`) involves goroutines and time.Sleep, making tests that assert on progress output potentially flaky.

## Future Considerations

- Consider abstracting filesystem access behind an interface (e.g., `FileSystem`) to fully eliminate direct `os` calls in commands.
- The `prompter` could be further decoupled from `iostreams` by accepting `io.Reader`/`io.Writer` directly rather than `*iostreams.IOStreams`.
- `httpmock` could support websocket mocking for real-time API tests.

## Questions / Gaps

- **No evidence found** for network layer abstraction beyond HTTP (e.g., DNS, lower-level sockets). The `api` package uses standard `net/http` exclusively.
- **No evidence found** for cross-platform filesystem abstraction. Direct `os` calls are used throughout; no `fs.FS` interface usage detected.

---

Generated by `study-areas/06-io-abstraction.md` against `gh-cli`.