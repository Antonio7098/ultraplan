# Repo Analysis: gh-cli

## Testing Strategy

### Repo Info

| Field | Value |
|-------|-------|
| Name | gh-cli |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/gh-cli` |
| Group | `gh-cli` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

The `gh` CLI demonstrates a mature, multi-layered testing strategy combining table-driven unit tests with HTTP mocking, integration tests via `testscript`, and golden-file fixtures. Tests focus on behavior over implementation details, using the `testify` library for assertions. Mock generation is standardized with `moq`. The acceptance test suite runs end-to-end workflows using `.txtar` script files.

## Rating

**8/10** — Strong unit + integration patterns. The dual-layer approach (unit tests with HTTP stubs + acceptance tests with real execution) provides good coverage without excessive coupling. Minor扣分 for some fragile regex-based output assertions.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Table-driven tests | `TestNewCmdCreate` uses struct slice with subtests | `pkg/cmd/label/create_test.go:19-84` |
| HTTP mocking | `httpmock.Registry` with `defer reg.Verify(t)` pattern | `pkg/cmd/label/create_test.go:140-155` |
| HTTP stub methods | `REST()`, `GraphQL()`, `JSONResponse()`, `FileResponse()` | `pkg/httpmock/stub.go:35-199` |
| IOStreams test helper | `iostreams.Test()` returns ios, stdin, stdout, stderr | `pkg/cmd/label/create_test.go:56` |
| Golden file fixtures | `httpmock.FileResponse("./fixtures/issueList.json")` | `pkg/cmd/issue/list/list_test.go:79` |
| Test helper package | `test.CmdOut` struct captures stdout/stderr | `test/helpers.go:9-21` |
| JSON fields test helper | `ExpectCommandToSupportJSONFields<T>()` validates --json fields | `pkg/jsonfieldstest/jsonfieldstest.go:41-46` |
| Acceptance tests | `TestMain` uses `testscript.RunMain` with `go:build acceptance` | `acceptance/acceptance_test.go:26-29` |
| Acceptance test data | `.txtar` scripts in `acceptance/testdata/{command}/` | `acceptance/testdata/label/label.txtar:1-25` |
| Generated mocks | `//go:generate moq -rm -out prompter_mock.go . Prompter` | `internal/prompter/prompter.go:16` |
| Mock implementation | `mockGitClient` satisfies `git.Client` interface via `testify/mock` | `pkg/cmd/extension/mocks.go:8-53` |
| Error path testing | `wantErr: true, errMsg: "cannot create label: name argument required"` | `pkg/cmd/label/create_test.go:28-30` |
| TTY vs non-TTY testing | `ios.SetStdoutTTY(tt.tty)` simulates terminal vs pipe mode | `pkg/cmd/label/create_test.go:147-150` |
| Stub verification | `defer reg.Verify(t)` ensures all HTTP stubs are called | `pkg/httpmock/registry.go:60-80` |
| Custom testscript commands | `replace`, `stdout2env`, `defer`, `sleep` defined in `sharedCmds` | `acceptance/acceptance_test.go:258-368` |

## Answers to Protocol Questions

### 1. Are commands integration tested?

**Yes.** The repository uses a two-tier approach:

1. **Unit-level integration tests**: Commands are tested with real HTTP transport via `httpmock.Registry`, exercising the full command execution path including API calls. See `pkg/cmd/label/create_test.go:140-168` where `createRun` is invoked with an HTTP mock.

2. **Acceptance tests via testscript**: The `acceptance/` package runs `.txtar` scripts that execute the actual `gh` binary end-to-end. See `acceptance/acceptance_test.go:32-183` which defines `TestAPI`, `TestAuth`, `TestIssues`, etc. Scripts like `acceptance/testdata/label/label.txtar` test full workflows (create repo → create label → edit → verify).

These are not pure unit tests—they test the command execution pipeline—but they do not require a live GitHub instance (the acceptance tests require `GH_ACCEPTANCE_HOST`, `GH_ACCEPTANCE_ORG`, `GH_ACCEPTANCE_TOKEN` environment variables, suggesting they run against a real GHES instance).

### 2. Are golden tests used?

**Partially.** Golden files are used for API response fixtures (e.g., `pkg/cmd/issue/list/fixtures/issueList.json`), but there is no golden-file comparison for command output.

- **Fixture files**: `httpmock.FileResponse("./fixtures/issueList.json")` (`pkg/cmd/issue/list/list_test.go:79`) loads stored API responses. These serve as golden fixtures for API parsing behavior.

- **No golden output comparison**: Tests use `assert.Equal()` for exact strings (`pkg/cmd/label/create_test.go:104`) or `test.ExpectLines()` with regex patterns (`pkg/cmd/issue/list/list_test.go:88-91`). The `ExpectLines` function is soft—not a strict golden comparison.

- **Acceptance test output**: The `.txtar` scripts use `stdout 'acceptance-test\tFirst Description'` (`acceptance/testdata/label/label.txtar:18`) for output validation, which is effectively a golden check.

**Verdict**: Fixtures for API responses are golden; output comparison uses regex or substring matching rather than strict file comparison.

### 3. How are mocks structured?

**Two patterns observed:**

1. **Interface-based generated mocks via `moq`**:
   - `//go:generate moq -rm -out prompter_mock.go . Prompter` (`internal/prompter/prompter.go:16`)
   - Generated files: `prompter_mock.go`, `searcher_mock.go`, `extension_mock.go`, etc.
   - These use `stretchr/testify/mock` under the hood.

2. **Hand-written struct mocks**:
   - `mockGitClient` in `pkg/cmd/extension/mocks.go:8-53` manually implements `git.Client`
   - Uses `mock.Mock` from `testify/mock`
   - Methods like `CheckoutBranch(branch string)` use `g.Called(branch)` to record calls

**Organization**:
- Mocks are typically co-located with the package they mock (e.g., `pkg/cmd/extension/mocks.go` for the extension package)
- Generated mocks use `moq` tool; hand-written mocks use `testify/mock`
- `pkg/httpmock/` provides HTTP stubbing, not mocks of external services

**Test isolation**: Mocks are well-organized and injected via factory pattern. The `cmdutil.Factory` receives mockable interfaces (`HttpClient`, `Config`, `BaseRepo`).

### 4. Is behavior tested or implementation details?

**Behavior is prioritized**, with some implementation detail leakage in output assertions.

**Evidence for behavior testing**:
- Commands are tested by constructing options and running `listRun`, `createRun`, etc. (`pkg/cmd/label/create_test.go:156`)
- Tests verify final output (`stdout.String()`) and API request bodies, not internal function calls
- The `Factory` pattern allows injecting mocks without touching command internals

**Evidence of implementation detail leakage**:
- `test.ExpectLines` uses regex matching against output strings, which can break with minor formatting changes
- `pkg/cmd/issue/list/list_test.go:88-91` uses regex `1[\t]+number won[\t]+label[\t]+\d+` to match output—this is somewhat fragile to formatting changes but remains behavior-focused (checking output contains expected data)

**Verdict**: Primarily behavior-focused. Tests call command run functions and verify output/API calls. Minor brittleness in regex output matching is the main deviation from pure black-box testing.

## Architectural Decisions

### 1. Factory + Options Pattern for Dependency Injection

Every command follows:
1. An `Options` struct with dependencies (`IO`, `HttpClient`, `Config`, `BaseRepo`)
2. A `NewCmdFoo(factory, runF)` constructor accepting a `runF` injection point
3. A separate `fooRun(opts)` function containing business logic

See `pkg/cmd/label/create_test.go:56-66` where the test passes a `runF` lambda to intercept execution.

### 2. Dual-Layer HTTP Mocking

The `pkg/httpmock/` package provides stub-based HTTP mocking:
- `Registry` collects stubs; `Verify(t)` ensures all stubs matched
- Matchers: `REST()`, `GraphQL()`, `QueryMatcher()`
- Responders: `JSONResponse()`, `FileResponse()`, `StatusStringResponse()`

This allows unit tests to simulate API responses without a real server.

### 3. testscript for Acceptance Testing

Acceptance tests use `github.com/rogpeppe/go-internal/testscript` with `.txtar` scripts. This provides:
- Script-based test definitions readable as documentation
- Built-in test execution, environment variable substitution, file setup
- Custom commands (`replace`, `defer`, `stdout2env`, `sleep`) for complex scenarios

Custom commands defined in `acceptance/acceptance_test.go:258-368` extend testscript with repository-specific operations.

### 4. Generated Mocks via moq

Interfaces that need mocking declare `//go:generate moq -rm -out {name}_mock.go . {Interface}`. Running `go generate ./...` regenerates mocks when interfaces change. See `internal/prompter/prompter.go:16` for the Prompter interface.

### 5. Table-Driven Tests with Subtests

Tests like `TestNewCmdCreate` (`pkg/cmd/label/create_test.go:19-84`) define a `[]struct` slice with test cases and use `t.Run(tt.name, func(t *testing.T) {...})` for subtests. This pattern is consistent across the codebase.

## Notable Patterns

1. **TTY-aware testing**: `ios.SetStdoutTTY(tt.tty)` allows testing both interactive (TTY) and non-interactive (pipe) modes. Many commands behave differently based on terminal detection.

2. **HTTP stub verification**: `defer reg.Verify(t)` at the end of each test ensures no unmatched stubs remain, catching incomplete test setup.

3. **JSON field validation**: `pkg/jsonfieldstest/jsonfieldstest.go` provides a generic `ExpectCommandToSupportJSONFields<T>()` that validates `--json` field annotations against the command's actual flag setup.

4. **Deferred cleanup in acceptance tests**: The `defer` custom command in `.txtar` scripts (`acceptance/testdata/label/label.txtar:8`) registers cleanup actions that run after the test completes.

5. **Test fixtures for GraphQL responses**: `pkg/cmd/issue/list/fixtures/issueList.json` stores full GraphQL responses for test stability.

## Tradeoffs

| Tradeoff | Description |
|----------|-------------|
| Regex output assertions | `test.ExpectLines` uses regex patterns that can break with formatting changes, but provides flexibility |
| HTTP mocking vs real API | Unit tests mock HTTP completely; acceptance tests require real GHES instance with token |
| Generated mocks maintenance | `//go:generate moq` requires running `go generate` after interface changes; generated files in VCS |
| testscript learning curve | Custom commands (`replace`, `defer`) require understanding of testscript semantics |
| TTY mode complexity | Many tests duplicate scenarios for TTY vs non-TTY, increasing test count but covering both code paths |

## Failure Modes / Edge Cases

1. **Unmatched HTTP stubs**: If a test registers an HTTP stub but never makes the request, `reg.Verify(t)` fails with a stack trace of where the stub was registered. This prevents dead stubs from silently staying in the codebase.

2. **Acceptance test environment**: Acceptance tests require `GH_ACCEPTANCE_HOST`, `GH_ACCEPTANCE_ORG`, `GH_ACCEPTANCE_TOKEN`. If unset, `testScriptEnv.fromEnv()` returns `missingEnvError`.

3. **Regex anchoring**: `ExpectLines` matches each pattern anywhere in output; a pattern like `number won` could match unrelated text.

4. **JSON field drift**: The `jsonfieldstest.ExpectCommandToSupportJSONFields` test can silently pass if both expected and actual field lists are wrong but identical in length.

5. **testscript file mode preservation**: The `replace` custom command preserves file mode (`mode := info.Mode() & 0o777`) when substituting content, but original file permissions must be set correctly initially.

## Future Considerations

1. **Replace regex assertions with structural comparison**: Using `test.ExpectLines` is flexible but fragile. Consider structured output comparison (e.g., parsing tabular output into rows and comparing cell values) for more maintainable tests.

2. **Golden file output comparison**: Add a golden-file mechanism for command output, similar to the existing API fixture pattern. This would make output format changes more visible.

3. **Table-driven test data externalization**: Some tests embed test cases inline; external YAML or JSON test data could reduce code churn for adding new test cases.

4. **Acceptance test parallelization**: Currently `testscript` runs scripts sequentially. Adding test isolation (clean environment per script) would enable parallelization.

## Questions / Gaps

1. **Coverage of error paths**: Error scenarios like network failures, timeouts, and malformed API responses appear partially covered. Investigate whether all critical error paths are tested.

2. **Integration test scope**: The acceptance tests require a real GHES instance. Are there integration tests that mock the GitHub API at a higher level than unit tests?

3. **Performance benchmarks**: No evidence found of benchmark tests or performance regression tests. Are there existing benchmarks for critical command paths?

---

Generated by `study-areas/11-testing-strategy.md` against `gh-cli`.