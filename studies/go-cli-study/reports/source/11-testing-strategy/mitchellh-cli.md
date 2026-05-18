# Repo Analysis: mitchellh-cli

## Testing Strategy

### Repo Info

| Field | Value |
|-------|-------|
| Name | mitchellh-cli |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/mitchellh-cli` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

The mitchellh-cli library is a Go CLI framework with moderate test coverage. Tests focus on the core `CLI` struct, UI components, and command parsing. The repo uses table-driven tests extensively and includes mock implementations for `Command` and `Ui` interfaces. However, golden tests are absent, integration tests are minimal, and test isolation relies on the simplicity of the library rather than formal patterns.

## Rating

**5/10** — Decent coverage with consistent table-driven patterns, but tests are narrowly scoped to library internals. Commands themselves are not integration tested, mocks are well-structured but limited in scope, and golden tests are entirely absent.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Table-driven tests | `TestCLIIsHelp` and `TestCLIIsVersion` use test case slices with `for _, tc := range tc` pattern | `cli_test.go:21-51`, `cli_test.go:53-83` |
| MockCommand struct | `MockCommand` implements `Command` interface with `RunCalled` and `RunArgs` tracking | `command_mock.go:10-34` |
| MockCommandAutocomplete | Extends `MockCommand` with autocomplete predictor fields | `command_mock.go:36-51` |
| MockUi struct | Thread-safe mock UI with `syncBuffer` for concurrent writes | `ui_mock.go:27-33`, `ui_mock.go:84-116` |
| Test helper | `testAutocomplete()` sets up COMP_LINE env and stdout/stderr pipes for shell autocomplete simulation | `cli_test.go:1554-1584` |
| Subtests | `t.Run(tc.Last, func(t *testing.T)` pattern used for named subtests | `cli_test.go:1216-1217` |
| Golden strings (inline) | Expected output strings stored as `const` values at bottom of `cli_test.go` (not separate files) | `cli_test.go:1586-1614` |
| Interface checks | Compile-time interface verification: `var _ Command = new(MockCommand)` | `command_mock_test.go:7-8` |
| UiWriter test | Tests `UiWriter` as `io.Writer` implementation | `ui_writer_test.go:8-24` |

## Answers to Protocol Questions

### 1. Are commands integration tested?

**No.** The library tests its own `CLI` parsing and routing logic by injecting `MockCommand` instances as implementations. No tests execute real commands end-to-end. Commands are treated as black-boxes via the `Command` interface; actual command behavior is not exercised.

Evidence: `cli_test.go:85-112` — `TestCLIRun` creates a `MockCommand`, passes it as a `CommandFactory`, and verifies the CLI correctly calls `Run()` and propagates exit codes. The test never exercises a real command's logic.

### 2. Are golden tests used?

**No.** The repo stores expected output strings as `const` literals at the bottom of `cli_test.go` (e.g., `testCommandHelpSubcommandsOutput`, `testCommandHelpSubcommandsHiddenOutput`). These are inline string comparisons, not file-based golden tests. There are no `testdata/` directories or external fixture files.

Evidence: `cli_test.go:1586-1614` — Output expectations are hard-coded constants within the test file. Example: `const testCommandHelpSubcommandsOutput = "donuts\n\nSubcommands:\n    banana    hi!\n..."`

### 3. How are mocks structured?

**Well-organized, interface-based mocks.** The library defines `MockCommand`, `MockCommandAutocomplete`, and `MockCommandHelpTemplate` in `command_mock.go` (exported), and `MockUi` with a thread-safe `syncBuffer` in `ui_mock.go`. Mocks track call state (`RunCalled`, `RunArgs`) and allow configurable return values (`RunResult`, `HelpText`, `SynopsisText`). Interface compliance is verified at compile time.

Evidence: `command_mock.go:10-34` — `MockCommand` with `RunCalled bool` and `RunArgs []string` fields. `ui_mock.go:84-116` — `syncBuffer` using `sync.RWMutex` for concurrent safety.

### 4. Is behavior tested or implementation details?

**Behavior is tested** for the CLI framework itself (argument parsing, subcommand routing, help output, autocomplete). The tests verify return codes, output content, and call arguments. However, this is limited to library internals — actual application commands using this framework are not tested.

Evidence: `cli_test.go:85-112` — Tests verify `exitCode == command.RunResult` and `reflect.DeepEqual(command.RunArgs, expected)`. The tests check the contract of `CLI.Run()` rather than internal radix tree implementation.

## Architectural Decisions

- **Single package tests**: All test files reside in the same `cli` package as the code under test, enabling direct access to unexported fields like `command.RunCalled` and `cli.subcommand`.
- **Factory pattern for commands**: `CommandFactory func() (Command, error)` allows lazy instantiation and dependency injection, which facilitates testing.
- **Inline golden constants**: Instead of golden files, expected output is stored as package-level `const` strings in `cli_test.go`. This keeps fixtures visible during test authorship but adds cognitive load.
- **MockUi with syncBuffer**: `MockUi` uses a custom `syncBuffer` type with a `sync.RWMutex` to make the mock thread-safe for `ConcurrentUi` wrapper testing.

## Notable Patterns

- **Table-driven tests with subtests**: Many test functions define a slice of test cases and iterate with `t.Run(tc.name, func(t *testing.T)` for named subtest execution (`cli_test.go:1216`).
- **Compile-time interface verification**: `var _ Command = new(MockCommand)` assertions ensure mocks implement interfaces without runtime checks.
- **Pipe-based input simulation**: `io.Pipe()` is used in UI tests to simulate stdin input for `Ask()` methods (`ui_test.go:25-27`).
- **Environment variable patching**: `testAutocomplete()` patches `COMP_LINE` env var and stdout/stderr for autocomplete testing (`cli_test.go:1554-1584`).

## Tradeoffs

- **Inline fixtures vs. golden files**: Storing expected strings as `const` values keeps them version-controlled alongside test code but makes large output changes harder to review. Golden files would separate concerns but add file I/O.
- **No integration tests**: Tests are confined to the library's own components. Applications built on this library have no guidance on how to write integration tests for their commands.
- **MockCommand simplicity**: `MockCommand.Run()` only tracks call state — it cannot simulate slow responses, errors during execution, or side effects. This limits test scenarios.
- **Same-package tests**: While convenient for accessing internals, this tight coupling means tests cannot run as external test packages without modification.

## Failure Modes / Edge Cases

- **Nested subcommand edge cases**: Tests cover longest-prefix matching (`TestCLIRun_prefix`, `TestCLIRun_subcommandSuffix`), quoted args (`TestCLIRun_nestedQuotedCommand`, `TestCLIRun_nestedQuotedArg`), and missing parent command handling (`TestCLIRun_nestedMissingParent`).
- **Autocomplete tab simulation**: `testAutocomplete()` uses a deferred closure to restore env and stdout/stderr — if a test panics before the deferred call runs, global state could be corrupted.
- **Double initialization guard**: `sync.Once` is used in `MockUi.init()` to handle lazy initialization, but direct instantiation via `new(MockUi)` will panic on first write (`ui_mock.go:26`). The constructor `NewMockUi()` must be used.

## Future Considerations

- Add a `testdata/` golden file approach for help output tests to enable non-developer review of fixture changes.
- Document integration test patterns for applications using this library, since the library itself only tests its own internals.
- Consider adding property-based testing (e.g., `testing/quick`) for argument parsing edge cases.

## Questions / Gaps

- No evidence of fuzz testing for argument parsing.
- No tests for concurrent execution of multiple commands via `ConcurrentUi`.
- No tests for error paths in command factory creation (e.g., factory returning an error).
- The `autocompleteInstaller` interface (`autocompleteInstaller`) is mocked but its behavior under installation failures is not tested.

---

Generated by `study-areas/11-testing-strategy.md` against `mitchellh-cli`.