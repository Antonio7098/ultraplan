# Repo Analysis: restic

## Testing Strategy

### Repo Info

| Field | Value |
|-------|-------|
| Name | restic |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/restic` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

restic employs a comprehensive multi-layered testing strategy with strong separation between unit tests, golden file tests, and integration tests. Commands are integration-tested using a dedicated test environment helper system with tar fixtures. Golden files are used for snapshot policy results and blob finding. Mocks are structured as intentional stub implementations with functional fields, not interface-based injection. Tests focus on behavior (output, exit codes, data integrity) rather than implementation details.

## Rating

**8/10** — Strong unit + integration patterns with well-organized golden tests and mock structures.扣分点：golden tests使用较少，主要集中在data包；mock通过struct + func fields实现，非标准interface mock方式。

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Integration test helpers | `withTestEnvironment()` creates temp dirs, repos, testdata | `cmd/restic/integration_helpers_test.go:188-235` |
| Integration test helpers | `testSetupBackupData()` extracts tar fixtures | `cmd/restic/integration_helpers_test.go:237-242` |
| Integration test helpers | `dirStats()` walks directory for comparison | `cmd/restic/integration_helpers_test.go:152-169` |
| Integration test helpers | `directoriesContentsDiff()` compares directory contents | `cmd/restic/integration_helpers_test.go:90-140` |
| Golden file loading | `loadGoldenFile()` unmarshals JSON golden files | `internal/data/snapshot_policy_test.go:64-76` |
| Golden file saving | `saveGoldenFile()` marshals and writes golden files | `internal/data/snapshot_policy_test.go:78-92` |
| Golden file update flag | `-update` flag controls golden file regeneration | `internal/data/snapshot_policy_test.go:270` |
| Golden fixtures | 50+ policy_keep_snapshots_N and filter_snapshots_N files | `internal/data/testdata/policy_keep_snapshots_*` |
| Golden fixtures | used_blobs_snapshot files for find tests | `internal/data/testdata/used_blobs_snapshot*` |
| Test helpers package | `Assert()`, `OK()`, `Equals()` helpers | `internal/test/helpers.go:19-67` |
| Test helpers package | `SetupTarTestFixture()` extracts tar.gz test fixtures | `internal/test/helpers.go:101-136` |
| Test helpers package | `TempDir()` creates cleanup-managed temp dirs | `internal/test/helpers.go:207-223` |
| Test helpers package | `Chdir()` manages directory changes in tests | `internal/test/helpers.go:227-249` |
| Test config variables | `RunIntegrationTest`, `TestPassword`, `TestTempDir` | `internal/test/vars.go:10-22` |
| Mock backend | Functional fields for each Backend method | `internal/backend/mock/backend.go:14-26` |
| Mock terminal | MockTerminal collects Output/Errors | `internal/ui/mock.go:10-53` |
| Backup integration tests | Full backup/restore cycle with diff verification | `cmd/restic/cmd_backup_integration_test.go:38-94` |
| Backend test hook | `BackendTestHook` for wrapping backends in tests | `cmd/restic/integration_helpers_test.go:221` |

## Answers to Protocol Questions

### 1. Are commands integration tested?

**Yes.** Every command has dedicated integration tests (e.g., `cmd_backup_integration_test.go`, `cmd_restore_integration_test.go`, `cmd_stats_test.go`). The test environment is set up via `withTestEnvironment()` which creates temporary directories, initializes repos, and extracts tar fixtures (`cmd/restic/integration_helpers_test.go:188-235`). Tests verify end-to-end behavior: snapshots are created, `testRunCheck()` validates repo integrity, and restore results are compared against original data via `directoriesContentsDiff()` (`cmd/restic/integration_helpers_test.go:90-140`).

### 2. Are golden tests used?

**Yes, selectively.** Golden files are used in `internal/data/snapshot_policy_test.go` for testing snapshot retention policy calculations. The `loadGoldenFile()` function reads JSON fixtures from `testdata/policy_keep_snapshots_*` files (`internal/data/snapshot_policy_test.go:64-76`). Similarly, `internal/data/find_test.go` uses `used_blobs_snapshot*` golden files for blob finding tests (`internal/data/find_test.go:116-117`). An `-update` flag allows regenerating golden files when behavior intentionally changes (`internal/data/snapshot_policy_test.go:270`). Golden tests are NOT used for command output comparison; CLI output is tested via integration test assertions.

### 3. How are mocks structured?

**Two patterns observed:**

**Pattern A: Functional field mocks** (`internal/backend/mock/backend.go:13-27`) — The `Backend` struct uses function fields (`SaveFn`, `ListFn`, `RemoveFn`, etc.) that default to returning errors. Each method checks if its function is nil before calling it. This allows tests to inject behavior by setting the function field. Verification interface compliance via `var _ backend.Backend = &Backend{}` at line 166.

**Pattern B: Embedded struct mocks** (`internal/ui/mock.go:10-53`) — `MockTerminal` embeds no interface but implements `Terminal` interface by providing all method implementations. Output and errors are accumulated in `[]string` slices. No interface injection; tests use `ui.Terminal` directly.

No use of `gomock` or `testify/mock`. Mocks are hand-written and intentional.

### 4. Is behavior tested or implementation details?

**Behavior is tested.** Integration tests verify outputs (`testListSnapshots()`, `testRunCheck()`), compare directory contents after restore (`directoriesContentsDiff()`), and check error conditions. Unit tests like `TestApplyPolicy` test the snapshot retention algorithm's output (which snapshots would be kept) against golden files — not the internal iteration logic. The backup integration test restores snapshots and compares file-by-file contents (`cmd/restic/cmd_backup_integration_test.go:85-91`). Tests use `rtest.Equals()` for value comparison rather than checking internal state.

## Architectural Decisions

1. **Test package separation**: A dedicated `internal/test` package provides shared helpers (`Assert`, `OK`, `Equals`, `SetupTarTestFixture`, `TempDir`) used across all tests. This avoids duplicating assertion helpers and provides consistent test behavior.

2. **Tar fixture system**: Integration tests use pre-packaged `.tar.gz` fixtures (e.g., `testdata/backup-data.tar.gz`, `testdata/small-repo.tar.gz`) extracted at test setup. This allows reproducible repository state without embedding large binary data in source.

3. **Backend wrapping for testing**: The `BackendTestHook` (`cmd/restic/integration_helpers_test.go:221`) allows tests to wrap the real backend with test-specific behavior (e.g., `listOnceBackend` to test eventual consistency issues). This enables testing subtle edge cases without mock complexity.

4. **Integration tests gated by environment variable**: `RunIntegrationTest` (`internal/test/vars.go:14`) defaults to true but can be disabled, allowing unit-only test runs.

## Notable Patterns

1. **Table-driven tests with golden comparison**: In `snapshot_policy_test.go`, policies are defined as table entries and compared against serialized golden files. The `-update` flag allows regenerating expected outputs when the policy logic intentionally changes.

2. **Test environment cleanup**: `TempDir()` uses `t.Cleanup()` for automatic temp directory removal unless `TestCleanupTempDirs` is false — useful for debugging test failures.

3. **Backend interface compliance via compile-time check**: `var _ backend.Backend = &Backend{}` in mock/backend.go ensures the mock implements the interface at compile time.

4. **Context propagation in integration tests**: `withTermStatus()` wraps tests with proper terminal status handling and context cancellation, ensuring UI code paths are exercised.

5. **Cross-platform test files**: OS-specific tests use `_unix_test.go` and `_windows_test.go` suffixes (e.g., `integration_helpers_unix_test.go`) following Go conventions.

## Tradeoffs

1. **Functional field mocks vs interface-based mocks**: The functional field pattern in `mock/backend.go` is verbose but explicit — each method has a clear default behavior (return error "not implemented" or nil). However, it requires more boilerplate than interface-based injection and doesn't support strict verification of call order or arguments.

2. **Golden files for algorithm output vs property-based testing**: Golden files for snapshot policy work well because the policy is deterministic and complex, but they require manual update when behavior intentionally changes. The `-update` flag mitigates this but introduces risk of inadvertent golden file updates.

3. **Tar fixtures for integration tests**: While reproducible, tar fixtures add maintenance burden — any change to the test repository structure requires regenerating all tar files. The fixtures are large (6MB `old-index-repo.tar.gz`).

## Failure Modes / Edge Cases

1. **Flaky tests on eventual-consistent backends**: The `listOnceBackend` wrapper tests S3-like eventual consistency but the test infrastructure doesn't guarantee deterministic failure — it depends on backend behavior.

2. **Golden file divergence**: If a developer runs tests with `-update` locally and commits accidentally-modified golden files, the test suite will pass but contain incorrect expected outputs.

3. **Temp directory cleanup on Windows**: Windows file locking can prevent temp directory removal; `RemoveAll()` handles `os.ErrNotExist` but may leave temp directories behind on other failures.

4. **Integration test environment variables**: `RESTIC_TEST_INTEGRATION=false` will skip integration tests silently, potentially leaving untested code paths in CI if not explicitly overridden.

## Future Considerations

1. Consider adopting `gomock` or `automock` for interface-based mocking to reduce boilerplate and enable argument verification in more tests.

2. Golden file tests could be extended to cover more CLI output scenarios (currently only data package algorithms use them).

3. Property-based testing could complement golden files for snapshot policy, testing random valid inputs against reference implementation.

## Questions / Gaps

1. **No evidence of fuzz testing in main test suite** — `internal/repository/fuzz_test.go` exists but is a standalone fuzz target, not integrated into regular unit/integration test runs.

2. **Limited benchmark tests** — Only `internal/restic/parallel_test.go` shows benchmarks; no systematic benchmark suite for critical paths (backup, restore, prune).

3. **No test coverage reports** — No evidence of coverage enforcement; `*.internal_test.go` files suggest internal testing but no visible coverage thresholds.

4. **No integration test parallelization** — Tests run sequentially; no evidence of `t.Parallel()` usage in integration tests, which could speed up test suite.

---

Generated by `study-areas/11-testing-strategy.md` against `restic`.