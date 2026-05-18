# Repo Analysis: opencode

## Testing Strategy

### Repo Info

| Field | Value |
|-------|-------|
| Name | opencode |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` |
| Group | `11-testing-strategy` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Opencode is a terminal-based AI assistant for software development, built with Go using the Cobra CLI framework and Bubble Tea TUI library. The testing strategy is **sparse and primarily unit-focused**, with only 4 test files across the entire codebase covering theme registration, dialog pattern matching, the ls tool, and prompt context retrieval. There are **no golden tests**, **no mock structures**, **no integration tests**, and **no command-level tests**. The test suite uses `testify` for assertions and employs table-driven tests with subtests.

## Rating

**3/10** — Sparse unit tests with minimal coverage. Critical paths (commands, agent flow, LLM interactions) are untested. No golden files, no mocks, no integration tests.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Test files | Only 4 `*_test.go` files in codebase | N/A |
| Test packages | `internal/tui/theme/theme_test.go` | 1–89 |
| Test packages | `internal/tui/components/dialog/custom_commands_test.go` | 1–106 |
| Test packages | `internal/llm/tools/ls_test.go` | 1–457 |
| Test packages | `internal/llm/prompt/prompt_test.go` | 1–57 |
| Test framework | Uses `testify/assert` and `testify/require` | `go.mod:33` |
| Table-driven tests | Test cases slice with struct definitions | `custom_commands_test.go:9-37` |
| Subtest pattern | `t.Run()` for named subtests | `ls_test.go:70-217` |
| Golden tests | No evidence found | Searched: `**/golden/**`, `**/testdata/**` |
| Mock packages | No evidence found | Searched: `**/mocks/**` |
| Integration tests | No evidence found | Searched for "Integration" pattern |
| Command tests | No evidence found | `cmd/root.go` has no `*_test.go` |
| Agent tests | No evidence found | `internal/llm/agent/agent.go` has no `*_test.go` |
| LLM provider tests | No evidence found | `internal/llm/provider/*.go` has no tests |

## Answers to Protocol Questions

### 1. Are commands integration tested?

**No.** The `cmd/root.go` (line 1–309) defines the CLI entry point via Cobra but has no associated test file. There are no tests that execute commands or verify CLI behavior end-to-end.

### 2. Are golden tests used?

**No.** No `testdata/` directories, `golden/` directories, or output comparison tests were found. The codebase has no fixture-based snapshot testing.

### 3. How are mocks structured?

**No dedicated mock packages exist.** A `ProviderMock` model provider is defined (`internal/llm/models/models.go:34`) but is explicitly marked TODO with no implementation (`internal/llm/provider/provider.go:163-164`). Tests that need isolation rely on temp directories and in-memory resources rather than mocks (e.g., `ls_test.go:28-30` creates real temp directories instead of mocking filesystem).

### 4. Is behavior tested or implementation details?

**Behavior is partially tested** for the limited areas covered (ls tool, theme registration, dialog patterns). However, tests focus on **implementation details** in some cases — e.g., `TestThemeRegistration` (`theme_test.go:7-89`) iterates over theme names and checks registration status rather than testing visual output. The ls tool tests check output strings like `assert.Contains(t, response.Content, "dir1")` (`ls_test.go:88`) which could be fragile if output format changes.

## Architectural Decisions

1. **Minimal test surface** — Only 4 out of ~100+ Go files have tests. Core components (agent, commands, providers, LSP) are untested.
2. **No mock infrastructure** — No interfaces are mocked; tests use real implementations with temp resources.
3. **testify as testing library** — Standard `testing.T` with `testify/assert` and `testify/require` helpers.
4. **Subtest organization** — Uses `t.Run()` naming pattern for grouping related test cases.
5. **Mock provider stub** — `ProviderMock` exists in type definition but is unimplemented, suggesting testing was deprioritized.

## Notable Patterns

- **Table-driven tests** with struct slices for test cases (`custom_commands_test.go:9-37`)
- **Temp directory usage** for filesystem tests (`os.MkdirTemp`, `t.TempDir()`) — `ls_test.go:28`, `prompt_test.go:17`
- **Helper functions** — `createTestFiles()` as test helper (`prompt_test.go:42-56`)
- **Context propagation** — Tests use `context.Background()` directly (`ls_test.go:84`)
- **No setup/teardown hooks** — No `TestMain()` found for global test setup

## Tradeoffs

| Tradeoff | Description |
|----------|-------------|
| Minimal coverage vs. velocity | Sparse tests enable faster development but risk undetected regressions in core paths |
| Real resources vs. isolation | Using temp dirs/files instead of mocks is simpler but slower and less isolated |
| No golden tests | Avoids fragile snapshot maintenance but means output format changes go undetected |
| No integration tests | Agent loop and command flow are exercised only via manual use |

## Failure Modes / Edge Cases

1. **Command regressions undetected** — Changes to `cmd/root.go` could break CLI behavior without test failure
2. **Agent loop failures** — The core `agent.Run()` loop (`agent.go:242`) has panic recovery but no test coverage
3. **Provider selection bugs** — LLM provider instantiation (`provider.go:163`) has a mock placeholder that is unimplemented
4. **Theme/UI regressions** — Theme switching and dialog patterns tested superficially; visual regressions undetected
5. **Regression in prompt context** — `getContextFromPaths()` (`prompt_test.go:14-39`) tested for correct path expansion but no edge cases for permissions or symlinks

## Future Considerations

1. Add command-level tests using `cobra.Testing` or executing the CLI binary
2. Implement golden tests for structured output (e.g., LSP responses, agent messages)
3. Create mock interfaces for LLM providers to enable isolated agent tests
4. Add integration tests for the agent loop with synthetic sessions
5. Consider property-based testing for file system tools (ls, glob, grep)

## Questions / Gaps

1. **Why no command tests?** The CLI entry point at `cmd/root.go` is critical path with no coverage
2. **Why is ProviderMock unimplemented?** Line `provider.go:163-164` has a TODO suggesting mock testing was planned but never added
3. **No test for agent.Run()** — The core agent loop (`agent.go:242`) processes messages but is not exercised in any test
4. **No LSP integration tests** — LSP client/server interaction at `internal/lsp/` is untested despite being a key feature
5. **No test for permission system** — `internal/permission/permission.go` has no tests despite controlling tool execution

---

Generated by `study-areas/11-testing-strategy.md` against `opencode`.