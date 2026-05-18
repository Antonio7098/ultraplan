# Repo Analysis: gdu

## Testing Strategy

### Repo Info

| Field | Value |
|-------|-------|
| Name | gdu |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` |
| Group | `11-testing-strategy` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

gdu has comprehensive test coverage with 63 test files across the codebase. Tests use `testify/assert` and focus on behavior rather than implementation details. The project uses internal test helper packages (`testdir`, `testapp`, `testdev`) for mock organization. No golden file tests are used. Commands are integration tested via `app_test.go` with a `runApp` helper. Tests are generally behavior-focused but some TUI tests assert on exact screen output.

## Rating

7/10 — Strong unit + integration patterns

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Test organization | 63 `*_test.go` files across `tui/`, `pkg/analyze/`, `pkg/device/`, `pkg/remove/`, `internal/test*/` | Multiple |
| Internal test helpers | `testdir.CreateTestDir()` creates real temp directory structure | `internal/testdir/test_dir.go:9` |
| Mock packages | `DevicesInfoGetterMock` implements `device.DevicesInfoGetter` interface | `internal/testdev/dev.go:6` |
| Mock packages | `MockedApp` implements `common.TermApplication` interface | `internal/testapp/app.go:28` |
| Integration test | `runApp()` helper executes full app with mocked dependencies | `cmd/gdu/app/app_test.go:682` |
| Integration test | `zipdir_integration_test.go` tests archive browsing with real zip files | `pkg/analyze/zipdir_integration_test.go:13` |
| Compile-time interface checks | `var _ device.DevicesInfoGetter = DevicesInfoGetterMock{}` | `internal/testdev/dev_test.go:11` |
| Testify usage | `github.com/stretchr/testify/assert` used across all tests | Multiple |
| Subtests | `t.Run` pattern in some tests e.g. `dir_linux_test.go:34` | `pkg/analyze/dir_linux_test.go:34` |
| Platform-specific tests | `*_linux_test.go`, `*_freebsd_darwin_test.go` for OS-specific behavior | Multiple |
| Testdata | JSON files for testing analysis serialization | `internal/testdata/test.json` |

## Answers to Protocol Questions

### 1. Are commands integration tested?

Yes. The `cmd/gdu/app/app_test.go:682` defines a `runApp()` helper that constructs a full `App` instance with mocked dependencies (`testdev.DevicesInfoGetterMock{}`, `testapp.CreateMockedApp()`, `testdir.MockedPathChecker`) and exercises the complete `app.Run()` workflow. Tests cover flags (`TestAnalyzePath`, `TestSequentialScanning`, `TestFollowSymlinks`), error paths (`TestAnalyzePathWithErr`), and GUI/non-interactive modes. However, these are not true end-to-end CLI tests since they don't invoke the `main` package via `os.Args`.

The `cmd/gdu/main_test.go` tests flag registration and config file parsing but doesn't test actual command execution end-to-end.

### 2. Are golden tests used?

No golden file tests are used. No `*.golden` files exist in the repo. The `zipdir_integration_test.go` creates real zip files at runtime rather than loading from fixtures.

### 3. How are mocks structured?

Mocks are well-organized in dedicated internal packages under `internal/`:

- `internal/testdev/dev.go` — `DevicesInfoGetterMock` with compile-time interface check (`internal/testdev/dev_test.go:11`)
- `internal/testapp/app.go` — `MockedApp` implementing `common.TermApplication` with compile-time check (`internal/testapp/app_test.go:14`)
- `internal/testdir/test_dir.go` — `CreateTestDir()` creates real filesystem structure, `MockedPathChecker` returns fake `os.Stat`

These are intentional design (compile-time interface verification) rather than ad-hoc mocks.

### 4. Is behavior tested or implementation details?

Predominantly behavior-tested. Tests assert on:
- Output strings (`assert.Contains(t, out, "nested")` at `cmd/gdu/app/app_test.go:81`)
- Error messages (`assert.ErrorContains(t, err, "--interactive and --non-interactive cannot be used at once")` at `cmd/gdu/app/app_test.go:67`)
- Return values and state transitions

Some TUI tests in `tui/tui_test.go:28` assert on exact screen output character-by-character which is more implementation-coupled. The `TestFooter` test at line 28 checks specific screen cell contents.

## Architectural Decisions

- **Internal test packages**: Test helpers are placed in `internal/` to prevent external import while allowing cross-package testing within the module
- **Compile-time interface checks**: Mock structs explicitly implement interfaces via `var _ Interface = MockStruct{}` pattern
- **Functional options for analyzer config**: Analyzer configuration uses setter methods tested via direct unit tests
- **Platform-specific test files**: `*_linux_test.go`, `*_freebsd_darwin_test.go` isolate OS-specific behavior

## Notable Patterns

1. **Table-like tests via slice of structs**: Sort tests in `pkg/analyze/sort_test.go` use anonymous structs for test cases
2. **Defer-based cleanup**: `testdir.CreateTestDir()` returns a cleanup func deferred by callers
3. **Test initialization logging suppression**: `log.SetLevel(log.WarnLevel)` in test `init()` functions
4. **Coverage test variants**: `*_coverage_test.go` files test edge cases (e.g., `pkg/analyze/zipdir_coverage_test.go`)
5. **Integration test variants**: `*_integration_test.go` files test with real files (`pkg/analyze/zipdir_integration_test.go`)

## Tradeoffs

- **Real filesystem vs mocks**: `testdir.CreateTestDir()` creates actual temp directory structure — more realistic but slower than pure mocks
- **Integration vs unit boundary**: `runApp` tests full app but doesn't exercise CLI argument parsing end-to-end
- **No golden files**: Output comparison tests would be more robust but the project has chosen not to use them
- **TUI screen output testing**: Character-by-character screen assertions (`tui/tui_test.go:64`) are brittle to font/terminal changes

## Failure Modes / Edge Cases

- Tests that create temp directories with `testdir.CreateTestDir()` will leak if `defer fin()` is omitted
- `MockedPathChecker` in `internal/testdir/test_dir.go:28` always returns `(nil, nil)` — callers must ensure this is safe for their test scenario
- Platform-specific tests (`*_linux_test.go`) skip on other platforms via build tags or runtime checks
- `t.TempDir()` used in some tests (`pkg/analyze/zipdir_integration_test.go:15`) vs `testdir.CreateTestDir()` for directory structure

## Future Considerations

- Consider adding golden file tests for structured output (JSON export in `report/`)
- Consider end-to-end CLI tests using `github.com/spf13/cobra/testing` or similar
- The character-exact TUI output tests could be made more robust with fuzzy matching

## Questions / Gaps

- No evidence of benchmarking tests (no `*_bench_test.go` files)
- No evidence of mutation/fuzz testing
- No evidence of test containers or integration test frameworks