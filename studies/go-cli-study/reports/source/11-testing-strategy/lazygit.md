# Repo Analysis: lazygit

## Testing Strategy

### Repo Info

| Field | Value |
|-------|-------|
| Name | lazygit |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/lazygit` |
| Group | `11-testing-strategy` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

lazygit employs a three-tier testing strategy: extensive unit tests with `FakeCmdObjRunner` for git command isolation, integration tests via a custom `TestDriver` that drives the GUI headlessly using a PTY, and demonstration tests marked with `IsDemo`. Unit tests use table-driven scenarios with testify assertions. Integration tests validate UI behavior end-to-end by spawning lazygit as a subprocess and simulating user interaction. No golden file output comparison is used.

## Rating

**8/10** — Strong unit + integration patterns. The `FakeCmdObjRunner` provides well-organized mock isolation for git commands. Integration tests are comprehensive and use a purpose-built driver. Minor扣分 for lack of golden tests and some coupling to implementation details in a few unit tests.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Unit test organization | Table-driven tests with `scenarios` slice pattern | `pkg/commands/git_commands/commit_test.go:18-31` |
| Mock runner | `FakeCmdObjRunner` for git command mocking | `pkg/commands/oscommands/fake_cmd_obj_runner.go:17-26` |
| Mock usage pattern | `ExpectGitArgs` for asserting git argument sequences | `pkg/commands/git_commands/commit_test.go:21` |
| Mock verification | `CheckForMissingCalls()` to ensure all expected commands were invoked | `pkg/commands/git_commands/commit_test.go:37` |
| Integration test structure | `IntegrationTest` struct with `SetupRepo`, `SetupConfig`, `Run` fields | `pkg/integration/components/test.go:26-42` |
| Integration test driver | `TestDriver` wraps `GuiDriver` with `Press`, `Wait`, `ExpectPopup` | `pkg/integration/components/test_driver.go:12-18` |
| Integration test execution | PTY-based headless runner in `go_test.go:81` | `pkg/integration/clients/go_test.go:81` |
| Test naming from file path | `TestNameFromFilePath` derives test name from file location | `pkg/integration/components/test.go:231-235` |
| Test retries for flakiness | `MaxAttempts: 2` for integration tests | `pkg/integration/clients/go_test.go:59` |
| Demo tests | `IsDemo` flag to mark tests for documentation | `pkg/integration/components/test.go:68` |
| Parallel test execution | `PARALLEL_TOTAL` / `PARALLEL_INDEX` env vars | `pkg/integration/clients/go_test.go:28-29` |
| Skip short tests | `testing.Short()` skips integration tests | `pkg/integration/clients/go_test.go:24-26` |
| Git version restrictions | `GitVersionRestriction` with `AtLeast`, `Before`, `Includes` | `pkg/integration/components/test.go:71-90` |
| Test category organization | Tests grouped in subdirs: `branch/`, `worktree/`, `undo/`, `ui/`, etc. | `pkg/integration/tests/` |

## Answers to Protocol Questions

### 1. Are commands integration tested?

**Yes.** Commands are integration tested via the `TestDriver` in `pkg/integration/`. Tests spawn lazygit as a subprocess and interact with it through key presses and view assertions. Example: `pkg/integration/tests/branch/delete.go:46-229` demonstrates extensive branch deletion testing including confirmation dialogs, remote branch deletion, and force-delete warnings. The test drives the GUI via `t.Views().Branches().Focus()`, `Press(keys.Universal.Remove)`, `ExpectPopup().Confirmation()`, etc.

### 2. Are golden tests used?

**No.** No `.golden` files or golden test patterns found in the codebase. Output comparison is done via assertion matchers like `Contains()`, `Equals()`, `DoesNotContain()` in the `TextMatcher` system (`pkg/integration/components/text_matcher.go`). Tests assert UI state directly rather than comparing against stored fixtures.

### 3. How are mocks structured?

**Well-organized fake runner pattern.** Mocks are centralized in `FakeCmdObjRunner` (`pkg/commands/oscommands/fake_cmd_obj_runner.go:17`). This is not an ad-hoc mock but a structured fake implementing `ICmdObjRunner` interface. Tests use a fluent builder pattern:
- `NewFakeRunner(t)` creates the fake
- `.ExpectGitArgs([]string{...}, output, err)` registers expected calls
- `.CheckForMissingCalls()` verifies all expected calls were made

The fake supports concurrent command matching (line 19-26) and can match commands out-of-order. It uses `CmdObjMatcher` with flexible predicate matching (line 28-37) rather than rigid argument matching.

### 4. Is behavior tested or implementation details?

**Predominantly behavior.** Unit tests like `commit_test.go` test that `RewordLastCommit` calls `git commit --amend --only -m` with correct arguments — this is behavior testing at the git command interface level. The `FakeCmdObjRunner` captures the command arguments but doesn't inspect internal state. Integration tests like `branch/delete.go` test UI-visible behavior: which branches appear, which confirmation dialogs appear, which toasts are shown. Some unit tests in `commit_test.go:251-347` (e.g., `TestCommitShowCmdObj`) test configuration-to-argument mapping which could be considered implementation detail, but the overall approach favors behavior over internal implementation.

## Architectural Decisions

1. **Fake over mock:** Uses `FakeCmdObjRunner` implementing `ICmdObjRunner` interface, not generated mock files. This provides type safety and allows the fake to implement `RunWithOutput`, `RunAndProcessLines` semantics needed for tests.

2. **Headless GUI testing via PTY:** Integration tests spawn lazygit in a PTY (`pkg/integration/clients/go_test.go:81`), allowing full TUI testing without X11 or a display server.

3. **Test naming from file paths:** `TestNameFromCurrentFilePath()` (`pkg/integration/components/test.go:226-229`) auto-derives test names from file location, eliminating a separate test registry step but requiring `go generate` to validate completeness (`tests.go:57-59`).

4. **Test categories via directory structure:** Integration tests are organized by feature area (`branch/`, `worktree/`, `undo/`, `ui/`, `tag/`, `bisect/`) rather than all in one flat directory.

5. **Input delay for demo mode:** `InputDelay()` env var (`pkg/integration/components/test.go:239-250`) slows down key presses for human-readable demo recordings.

## Notable Patterns

- **Fluent integration test assertions:** Tests chain methods like `t.Views().Branches().Focus().Lines(Contains("branch-one").IsSelected()).Press(keys.Universal.Remove)` (`pkg/integration/tests/branch/delete.go:46-59`)
- **Parallel integration test execution:** `PARALLEL_TOTAL` / `PARALLEL_INDEX` allows splitting tests across multiple machines or cores (`go_test.go:28-29`)
- **Git version constraints on tests:** `GitVersionRestriction` allows marking tests to skip on certain git versions (e.g., features only available in git 2.38+)
- **Test retry for flakiness:** `MaxAttempts: 2` (`go_test.go:59`) allows transient failures to be retried without marking the test as failed
- **Sentinel value for unit test detection:** Uses `"test test"` as a sentinel value to detect when integration test description is used in a unit test context (`test.go:19`)

## Tradeoffs

1. **No golden files:** Without golden files, large output comparisons require inline assertions. This is manageable for the structured UI testing lazygit does, but could be unwieldy for more text-heavy output.

2. **Go generate coupling:** Test names are derived from file paths, requiring a `go generate` step to verify all tests are registered. This adds a build step but catches missing tests at generate time.

3. **PTY dependency:** Integration tests require a PTY, which works on Linux/macOS but the build tag `//go:build !windows` (`go_test.go:1`) indicates Windows is not supported for integration tests.

4. **Subprocess spawning overhead:** Each integration test spawns a new lazygit process, which is slower than in-process unit tests. The parallel execution option mitigates this.

## Failure Modes / Edge Cases

1. **Flaky GUI tests:** The `MaxAttempts: 2` retry suggests known flakiness, particularly around UI timing. `InputDelay()` env var helps debug but slows test execution.

2. **Git version compatibility:** Tests with `GitVersionRestriction` may silently skip on older git versions, potentially missing regressions.

3. **Missing test registration:** If a test file is added but not added to `test_list.go`, the `GetTests` function panics at startup with a clear message (`tests.go:57-59`).

4. **Concurrent command matching:** `FakeCmdObjRunner` allows commands to match out of order (`fake_cmd_obj_runner.go:65-74`), which can hide ordering bugs if commands are expected to run sequentially but don't.

## Future Considerations

1. Consider adding golden file support for snapshot-testing rendered output (e.g., complex diff views, patch formatting).

2. The `CheckForMissingCalls()` pattern could be enhanced with better error messages showing which commands were expected vs. invoked.

3. Explore adding `skip` logic for tests that require specific git features beyond version (e.g., `git worktree` subcommand availability).

4. The parallel execution could be extended to support sharding across machines for faster CI feedback.

## Questions / Gaps

1. **No golden file evidence found** — The codebase does not appear to use golden files for output comparison. Is this a deliberate choice or a planned enhancement?

2. **Mock interface stability** — `FakeCmdObjRunner` mocks the `ICmdObjRunner` interface. How is interface stability maintained when adding new methods?

3. **Test coverage of error paths in integration tests** — While unit tests cover many error scenarios with `FakeCmdObjRunner` returning errors, integration tests seem to focus on happy paths. Are error-path integration tests planned?

---

Generated by `study-areas/11-testing-strategy.md` against `lazygit`.