# Source Analysis: VictoriaMetrics

## Testing Strategy & Reliability Engineering

### Source Info

| Field | Value |
|-------|-------|
| Name | victoriametrics |
| Path | `sources/victoriametrics` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

VictoriaMetrics employs a multi-layered testing strategy with 777+ test functions across 200+ unit test files and 32 integration test files. The project uses three distinct testing layers: (1) co-located unit tests with `*_test.go` naming, (2) specialized `*_synctest_test.go` files using Go's `testing/synctest` package for deterministic concurrency testing, and (3) process-based integration tests via the `apptest` framework that spawns actual binaries and validates HTTP interactions. The integration test framework includes built-in retry mechanisms for eventual consistency issues and supports both single-server and cluster configurations.

## Rating

**8/10** — Good implementation with minor issues. The testing infrastructure is comprehensive and well-organized with clear separation between unit, concurrency, and integration tests. The `synctest` pattern for race condition testing is exemplary. Minor gaps: integration tests require pre-built binaries (`make apptest` only runs on a custom runner), and no testcontainer-style dependency management was found.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Unit test co-location | `*_test.go` files co-located with source in `lib/` and `app/` directories | `lib/storage/storage_test.go:25` |
| Synctest build tag | `//go:build synctest` tag gates concurrency tests | `lib/workingsetcache/cache_synctest_test.go:1` |
| Synctest usage | `synctest.Test(t, func(t *testing.T) {...})` for deterministic concurrency testing | `lib/workingsetcache/cache_synctest_test.go:59` |
| Synctest.Wait() | `synctest.Wait()` synchronizes concurrent test goroutines | `lib/workingsetcache/cache_synctest_test.go:67` |
| Integration test harness | `TestCase` struct with `MustStartVmsingle()`, `MustStartDefaultCluster()` helpers | `apptest/testcase.go:21`, `apptest/testcase.go:81`, `apptest/testcase.go:261` |
| Integration test client | `Client` struct with HTTP helpers (`Get`, `Post`, `PrometheusAPIV1Query`) | `apptest/client.go:24`, `apptest/client.go:44` |
| Retry mechanism | `AssertOptions` with configurable retries (default 20, 100ms period) for eventual consistency | `apptest/testcase.go:383`, `apptest/testcase.go:419-456` |
| Output capture | `outputProcessor` captures app output on test failure | `apptest/testcase.go:458-478` |
| Cluster simulation | `Vmcluster` struct with `Vminsert`, `Vmselect`, multiple `Vmstorage` replicas | `apptest/testcase.go:185-197` |
| Integration test files | 32 test files in `apptest/tests/` including `key_concepts_test.go`, `replication_test.go` | `apptest/tests/key_concepts_test.go:1` |
| Timing/benchmark tests | `*_timing_test.go` pattern for performance regression testing | `lib/timeutil/time_timing_test.go:1` |
| CI unit test matrix | Three test scenarios: `test`, `test-386`, `test-pure` | `.github/workflows/test.yml:67-71` |
| CI test commands | `go test -tags 'synctest' ./lib/... ./app/...` | `Makefile:455` |
| Race detection | `go test -tags 'synctest' -race ./lib/... ./app/...` | `Makefile:458` |
| Integration test command | `make apptest` builds binaries then runs `go test ./apptest/...` | `Makefile:472-474` |
| Build tags | `synctest` tag used for `go test -tags 'synctest'` | `Makefile:446`, `Makefile:454` |

## Answers to Dimension Questions

### 1. How does the project test async, concurrent, or time-dependent code deterministically?

VictoriaMetrics uses Go's `testing/synctest` package via `*_synctest_test.go` files. The `//go:build synctest` build tag gates these tests. The `synctest.Test(t, func(t *testing.T) {...})` function runs test bodies in a deterministic order, and `synctest.Wait()` is called at synchronization points (`lib/workingsetcache/cache_synctest_test.go:59-67`). This approach eliminates race conditions in test execution by serializing what would otherwise be concurrent operations.

For time-dependent tests, the cache tests use `time.Sleep()` with known durations (e.g., `cacheSizeCheckInterval = 2000*time.Millisecond` at line 46) followed by `synctest.Wait()` to ensure the time-dependent behavior is deterministic.

### 2. What is the balance between unit, integration, and e2e tests?

**Unit tests**: 200+ `*_test.go` files co-located with source in `lib/` and `app/` directories, containing 777+ test functions. Run via `go test ./lib/... ./app/...`.

**Concurrency tests**: Dedicated `*_synctest_test.go` files with `//go:build synctest` tag. Examples: `lib/workingsetcache/cache_synctest_test.go` (710 lines), `lib/workingsetcache/cache_synctest_test.go:152-267`. Run via `go test -tags 'synctest' ./lib/... ./app/...`.

**Integration tests**: 32 test files in `apptest/tests/`. These start actual application binaries and issue HTTP requests. Tests are named `TestSingle*` or `TestCluster*` depending on which branch binaries they require (`apptest/README.md:44-47`). Run via `make apptest`.

**Benchmarks**: `*_timing_test.go` files (e.g., `lib/timeutil/time_timing_test.go`) use Go's `testing.B` for performance testing.

**E2E**: No dedicated e2e test framework found; integration tests serve this purpose.

### 3. How are external dependencies (DBs, APIs, queues) mocked or replaced in tests?

**Process-based approach**: Rather than mocking, the integration tests spawn actual VictoriaMetrics binaries (`vmsingle`, `vmstorage`, `vminsert`, `vmselect`) as subprocesses (`apptest/testcase.go:81-156`). HTTP requests are made to real running processes.

**In-memory alternatives**: For unit tests, in-memory implementations are used. For example, `fastcache` is a pure Go in-memory cache used in tests (`lib/workingsetcache/cache_synctest_test.go:12`).

**No testcontainers**: No Docker/testcontainer-based dependency management found. Integration tests require pre-built binaries via `make all` or `make apptest` (which builds binaries first).

**Fake implementations**: `apptest/tests/prometheus_mock_storage.go` appears to provide a mock Prometheus storage for testing.

### 4. How does the project prevent flaky tests from eroding trust?

**Retry mechanism for eventual consistency**: The `AssertOptions` struct with `Retries` (default 20) and `Period` (default 100ms) at `apptest/testcase.go:383-456` handles the fact that inserted data is not immediately visible for querying. Tests can disable retry via `DoNotRetry: true`.

**Output capture on failure**: `outputProcessor` captures and displays app output when tests fail, aiding debugging (`apptest/testcase.go:458-478`).

**Directory cleanup suppression**: On test failure, the `storageDataDir` is NOT removed, allowing manual inspection (`apptest/testcase.go:66-77`).

**Race detector**: `test-race` target runs with `-race` flag (`Makefile:458`).

**Build tag isolation**: `synctest` tag prevents synctest tests from running in normal test runs, ensuring they are explicitly opted-in.

**CI concurrency control**: GitHub Actions workflow cancels in-progress runs on new pushes (`test.yml:24-26`).

### 5. Can integration tests run locally without cloud dependencies?

**Yes, partially**: Integration tests can run locally but require:
1. Pre-built binaries in `../../bin/` directory (built via `make all` or `make victoria-metrics-race vmagent-race ...`)
2. Local execution via `go test ./apptest/...`

**Limitations**: The `apptest` workflow in CI uses a custom runner (`runs-on: apptest`) and the `make apptest` target (which skips `TestCluster*` and `TestLegacy*` tests). Binaries for cluster tests can only be built from the `cluster` branch (`apptest/README.md:42-43`).

**No cloud dependencies**: Tests run binaries as local subprocesses with local filesystem storage (`-storageDataPath` flags). No external cloud services or Docker containers required for most tests.

## Architectural Decisions

**Process-based integration testing over mocking**: VictoriaMetrics starts actual application binaries as subprocesses rather than mocking internal components. This validates end-to-end behavior but requires binary pre-building. Decision visible at `apptest/testcase.go:81-109`.

**synctest for deterministic concurrency**: Using Go's `testing/synctest` package rather than ad-hoc sleep-based synchronization provides deterministic test execution. Build tag at `cache_synctest_test.go:1`.

**Test co-location**: Unit tests live alongside source files (`lib/storage/storage_test.go` alongside `lib/storage/storage.go`), following Go conventions. Integration tests are separated into `apptest/` package.

**Two binary branches**: Tests are named `TestSingle*` (master branch) or `TestCluster*` (cluster branch) because cluster binaries can only be built from the `cluster` branch (`apptest/README.md:42-47`).

**Retry-based assertion**: `Assert()` method at `testcase.go:419` retries comparisons to handle eventual consistency, with configurable `Retries` and `Period`.

## Notable Patterns

**Test naming**: `TestSingle*` for single-server tests, `TestCluster*` for cluster tests, `*_synctest_test.go` for concurrency tests, `*_timing_test.go` for benchmarks.

**Assertion helpers**: `tc.Assert()` method uses `cmp.Diff()` from `github.com/google/go-cmp` for deep comparisons with `IgnoreFields` option (`testcase.go:696-698`).

**Cleanup on success**: `tc.Stop()` removes the `storageDataDir` only if the test succeeded, preserving data for debugging failures (`testcase.go:69-77`).

**Binary location abstraction**: `MustStartVmsingleAt(instance, "../../bin/victoria-metrics-race", flags)` allows tests to specify binary path (`testcase.go:100`).

**Prometheus-compatible API testing**: Client provides `PrometheusAPIV1Query`, `PrometheusAPIV1QueryRange`, `PrometheusAPIV1ImportPrometheus` methods for standard API testing (`client.go:74-130`).

## Tradeoffs

**Pro: Real process testing catches integration bugs that mocks miss.** Process-based testing at `apptest/testcase.go:81` validates complete end-to-end behavior.

**Con: Integration tests require pre-built binaries.** Cannot run `go test ./apptest/...` directly without building binaries first (`apptest/README.md:35-40`).

**Con: Cluster tests restricted to cluster branch.** Cluster binaries only build from `cluster` branch, limiting test coverage on master (`apptest/README.md:42-43`).

**Con: No testcontainer-style isolation.** External dependencies (if any) cannot be containerized; tests rely on local subprocess execution.

**Pro: synctest provides deterministic concurrency testing.** Eliminates flakiness from goroutine scheduling non-determinism.

**Pro: Retry mechanism handles eventual consistency gracefully.** Built into `TestCase.Assert()` method.

## Failure Modes / Edge Cases

**Test failures due to eventual consistency**: Without `Assert()` retry mechanism, tests querying immediately after writes would fail. Default 20 retries x 100ms = 2s maximum wait at `testcase.go:423-425`.

**Binary mismatch**: If binaries in `../../bin/` don't match source, integration tests may fail silently or produce incorrect results.

**Parallel test interference**: `TestCase.T().Parallel()` at `testcase.go:36` enables parallel test execution, but shared resources (ports, files) could cause interference.

**Synctest-only tests not run by default**: Tests behind `//go:build synctest` are only run with `-tags 'synctest'`, so race conditions may go undetected in normal test runs.

**Time-dependent tests with long sleeps**: Cache expiration tests use `time.Sleep(35*time.Minute)` at `cache_synctest_test.go:123`, which slows test execution significantly.

## Future Considerations

**Testcontainer adoption**: Could containerize external dependencies (object storage, etc.) for more reliable integration test isolation.

**Parallel test resource isolation**: Consider namespace-per-test for port and filesystem isolation to prevent interference in parallel runs.

**Reduced long sleeps**: The 35-minute cache expiration sleep could be parameterized or mocked for faster test execution.

## Questions / Gaps

**No evidence found for**: e2e test framework, snapshot testing, mutation testing, contract testing between services, or fault injection testing.

**Search boundary**: Limited to `lib/`, `app/`, `apptest/`, `.github/`, and `Makefile`. External test infrastructure (if any) not examined.

**Coverage metrics**: While `test-full` target generates coverage reports, the coverage percentage threshold is not enforced in CI.