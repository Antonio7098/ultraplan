# Repo Analysis: chezmoi

## Testing Strategy

### Repo Info

| Field | Value |
|-------|-------|
| Name | chezmoi |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/chezmoi` |
| Group | `11-testing-strategy` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Chezmoi employs a multi-layered testing strategy combining table-driven unit tests, golden file tests via `testscript` (txtar format), and the `vfst` virtual filesystem testing library. Commands are integration-tested end-to-end via script tests that execute the actual CLI. The testing infrastructure is exceptionally well-organized with dedicated helper packages and clear separation between behavior and implementation testing.

## Rating

**9/10** — Exceptionally maintainable testing ecosystem with comprehensive coverage, excellent golden test infrastructure, well-organized mocks, and behavior-focused tests that resist brittleness during refactoring.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Test organization | Table-driven tests with subtests for `apply` command | `internal/cmd/applycmd_test.go:20-218` |
| Golden tests | `testscript` with `.txtar` files containing golden fixtures | `internal/cmd/main_test.go:64-174` |
| Golden fixtures | Inline golden data at end of `.txtar` files | `internal/cmd/testdata/scripts/unmanaged.txtar:46-70` |
| Virtual filesystem | `vfst.NewTestFS` for unit tests | `internal/chezmoitest/chezmoitest.go:86-92` |
| Test helper package | `chezmoitest` package with `WithTestFS`, `Umask`, `HomeDir` | `internal/chezmoitest/chezmoitest.go:1-101` |
| Mock persistent state | `MockPersistentState` for state isolation | `internal/chezmoi/mockpersistentstate.go:4-89` |
| Mock persistent test | `testPersistentState` helper function | `internal/chezmoi/mockpersistentstate_test.go:7-11` |
| Test config builder | `newTestConfig` with dependency injection | `internal/cmd/config_test.go:505-523` |
| Script test commands | Custom txtar commands: `mkhomedir`, `mksourcedir`, `cmp`, etc. | `internal/cmd/main_test.go:130-156` |
| Test data scripts | 180+ `.txtar` files covering all commands | `internal/cmd/testdata/scripts/` |
| Archive test helpers | `archivetest.Dir`, `archivetest.File`, `archivetest.Symlink` | `internal/archivetest/archivetest.go:1-23` |
| Unit test count | 70+ `*_test.go` files across internal packages | `internal/**/*_test.go` |

## Answers to Protocol Questions

### 1. Are commands integration tested?

**Yes.** Commands are integration tested via `testscript` using `.txtar` files in `internal/cmd/testdata/scripts/`. These tests execute the actual CLI (`chezmoi apply`, `chezmoi unmanaged`, etc.) in a controlled environment with virtual home/source directories. Example: `apply.txtar:1-72` sets up a virtual home with `mkhomedir golden` and tests `exec chezmoi apply --force` followed by assertions like `exists $HOME/.file` (`internal/cmd/testdata/scripts/apply.txtar:47-58`).

Additionally, commands have dedicated `_test.go` files using `newTestConfig` that test behavior more narrowly, e.g., `applycmd_test.go:20-218` tests the apply command with various flags using virtual filesystems.

### 2. Are golden tests used?

**Yes.** Golden tests are implemented via the `testscript` framework with inline golden data. The pattern uses `cmp stdout golden/` to compare output against expected data stored at the end of each `.txtar` file after a `--` separator. Example in `unmanaged.txtar:46-70`:

```
-- golden/unmanaged --
.local
-- golden/unmanaged-absolute --
$WORK/home/user/.dir
```

The `unmanaged.txtar:5` shows the comparison: `cmp stdout golden/unmanaged` (`internal/cmd/testdata/scripts/unmanaged.txtar:5`).

For unit tests, expected state is defined as structured data (e.g., `sourcestate_test.go:912-1577` creates expected `SourceState` objects and compares them with `assert.Equal`).

### 3. How are mocks structured?

**Well-organized in dedicated packages.** Mocks are not ad-hoc but are first-class test utilities:

- **`MockPersistentState`** (`internal/chezmoi/mockpersistentstate.go:4-89`): A full implementation of the `PersistentState` interface using in-memory maps. Used across 24+ test files to isolate tests from filesystem state.

- **`chezmoitest` package** (`internal/chezmoitest/chezmoitest.go`): Provides `WithTestFS` (using `vfst`), `HomeDir`, `Umask`, `SkipUnlessGOOS`, `AgeGenerateKey`, and `GPGGenerateKey` helpers.

- **`archivetest` package** (`internal/archivetest/archivetest.go`): Provides `Dir`, `File`, `Symlink` structs for building archive test fixtures.

- **`vfst`** (external library `github.com/twpayne/go-vfs/v5/vfst`): Used to construct virtual filesystems for tests without touching disk.

- **`testscript` custom commands** (`internal/cmd/main_test.go:130-156`): Custom commands like `mkhomedir`, `mksourcedir`, `mockcommand`, `cmp`, etc., provide controlled test infrastructure.

### 4. Is behavior tested or implementation details?

**Behavior is emphasized over implementation details.** Evidence:

- Tests use the public CLI interface (`exec chezmoi apply --force`) rather than calling internal functions directly (except in unit-specific tests).

- The `applycmd_test.go:20-218` uses `vfst.TestPath` assertions that check final filesystem state (`TestPath("/home/user/.file", vf st.TestContentsString(...))`) rather than intermediate internal state.

- Golden tests compare output/result (`cmp stdout golden/unmanaged`) not internal data structures.

- Tests include OS-specific conditions like `[unix]` and `[windows]` to ensure cross-platform behavior is verified.

- `testscript` tests can filter by regex (`*filterRegex`) to run subsets, showing tests are designed for selective execution.

## Architectural Decisions

1. **Dual testing strategy**: Unit tests in `*_test.go` files test individual components with mocks, while integration tests in `.txtar` files test the full CLI pipeline. This balances speed and coverage.

2. **Virtual filesystem isolation**: Using `vfst` instead of real temp directories enables fast, reproducible tests without filesystem cleanup issues.

3. **Inline golden data**: Golden fixtures are stored inline in `.txtar` files after `--` separators rather than in separate files, making tests self-contained and version-controlled together.

4. **Test script commands as test infrastructure**: Custom commands (`mkhomedir`, `mksourcedir`, `cmp`, etc.) abstract common test operations, keeping individual test scripts readable.

5. **`testscript` for integration**: Leverages `github.com/rogpeppe/go-internal/testscript` which provides a domain-specific language for integration testing CLI tools.

6. **`newTestConfig` for dependency injection**: The `configOption` pattern in `internal/cmd/config_test.go:505-523` allows tests to inject mock systems and options cleanly.

## Notable Patterns

- **Table-driven subtests** with descriptive names: `t.Run(tc.name, func(t *testing.T) {...})` allowing selective test execution via `go test -run TestApplyCmd/all`.

- **Virtual home directory setup**: `mkhomedir golden` and `mksourcedir` create test fixtures with standard chezmoi source layout.

- **Conditional test execution**: Tests use conditions like `[unix]`, `[windows]`, `[umask:002]`, `env:HOME_pwsh` to run platform-specific assertions.

- **Error path testing**: Negative assertions with `!` prefix (`! exists $HOME/.remove`, `! exec chezmoi ...`) test error conditions cleanly.

- **`requireEvaluateAll` helper**: In `sourcestate_test.go:563`, forces evaluation of all lazy values before assertion, ensuring tests fail fast on setup issues.

## Tradeoffs

1. **Complexity**: The dual infrastructure (unit tests + script tests + golden files) adds complexity. New contributors must understand both `vfst`/`newTestConfig` patterns and the `testscript` txtar format.

2. **Golden file maintenance**: Inline golden data makes updates straightforward (edit the file, run tests to update), but requires discipline to update when behavior intentionally changes.

3. **Test execution speed**: Full script tests (`TestScript` in `main_test.go:64`) are skipped with `-short` flag (`internal/cmd/main_test.go:65-67`), indicating awareness that integration tests can be slow.

4. **Mock persistence**: `MockPersistentState` is a simple in-memory map; if the real `PersistentState` interface changes, the mock must be updated manually.

## Failure Modes / Edge Cases

1. **Platform-specific test failures**: Tests with OS suffixes (`_unix`, `_windows`) may not catch regressions on unrun platforms.

2. **Interpreter mocking complexity**: The `findExecutableMock` in `main_test.go:91-120` is complex, handling 4 interpreter configurations. Edge cases around PATH manipulation could cause flakiness.

3. **External HTTP dependencies**: Tests like `TestIssue4927` in `applycmd_test.go:333-428` use `httptest.Server` but network timing issues could cause rare failures.

4. **Timestamp-sensitive tests**: Golden files with timestamps or ordering may fail spuriously if test execution order changes.

5. **Script test environment variables**: Tests set environment variables (`CHEZMOISOURCEDIR`, `HOME`, etc.) via `ts.Setenv`. Leftover state from previous tests could theoretically cause issues.

## Future Considerations

1. **Test coverage for encryption backends**: While `age` and `gpg` encryption are tested with `TestAgeGenerateKey`/`TestGPGGenerateKey` helpers, running these in CI requires external dependencies.

2. **Property-based testing**: Could complement the table-driven approach for edge case discovery (e.g., using `testing/quick` for path manipulation functions).

3. **Fuzzing**: The template evaluation and config parsing could benefit from fuzz testing to catch malformed input handling.

## Questions / Gaps

1. **No clear evidence found**: Are there property-based or fuzz tests? Searched for `quick` and `fuzz` patterns — none found in test files.

2. **Test performance benchmarks**: No evidence of benchmark tests (`_test.go` with `Benchmark` functions) for performance-critical paths.

3. **Test coverage reporting**: No evidence of `go test -cover` integration or coverage thresholds in CI.

4. **Mutation testing**: No evidence of mutation testing tools like `mutate` to verify test quality.

---

Generated by `study-areas/11-testing-strategy.md` against `chezmoi`.