# Source Analysis: openfga

## Testing Strategy & Reliability Engineering

### Source Info

| Field | Value |
|-------|-------|
| Name | openfga |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/openfga` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

OpenFGA employs a well-structured, multi-layered testing strategy with clear separation between unit, storage-integration, and matrix/integration tests. The project uses Go's standard testing package with `go.uber.org/mock` for mocking, `go.uber.org/goleak` for goroutine leak detection, and Docker-based testcontainers for database integration testing. The CI pipeline is split into parallel jobs (unit, storage, matrix) with coverage reporting. Test fixtures and YAML-driven matrix tests provide comprehensive coverage of authorization scenarios.

## Rating

**8/10** — Good implementation with minor issues. The testing infrastructure is mature and well-organized, but some gaps exist around deterministic time-dependent code testing and local running of integration tests without Docker.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Test directory structure | `tests/` subdirectory for integration/matrix tests; `internal/`, `pkg/` for unit tests | `tests/check/check_test.go:1`, `internal/graph/check_test.go:1` |
| Unit test naming | Files ending in `_test.go`, tests use `t.Run` for subtests | `internal/graph/check_test.go:26`, `pkg/storage/memory/memory_test.go:22` |
| Integration test harness | Docker-based testcontainers for Postgres, MySQL, SQLite | `pkg/testfixtures/storage/postgres.go:111`, `pkg/testfixtures/storage/mysql.go` |
| Test matrix approach | YAML-based test definitions embedded via `go:embed` | `tests/check/check.go:64-85`, `assets/tests/consolidated_1_1_tests.yaml` |
| Mock generation | Auto-generated mocks via `mockgen` (uber/mock) | `internal/mocks/mock_storage.go:1-7` |
| Mock implementations | `MockStorage`, `MockCache`, `MockIterator` and others | `internal/mocks/mock_storage.go:22`, `internal/mocks/mock_cache.go` |
| Memory storage for tests | In-memory datastore implementation for fast unit tests | `pkg/storage/memory/memory.go` |
| Goroutine leak detection | `goleak.VerifyNone(t)` used in tests | `tests/check/check_test.go:33`, `internal/graph/check_test.go:121` |
| Concurrent/iterator testing | `errgroup` for parallel goroutine testing of iterators | `pkg/storage/memory/memory_test.go:93-106` |
| Context cancellation testing | Tests for iterator behavior under context cancellation/deadline | `pkg/storage/memory/memory_test.go:152-251` |
| CI test parallelization | Split into `tests-unit`, `tests-storage`, `tests-matrix` jobs | `.github/workflows/pull_request.yaml:27-143` |
| Test coverage reporting | Codecov integration with per-flag coverage | `.github/workflows/pull_request.yaml:57-64` |
| Benchmark CI | Benchmark comparison against main branch on perf-sensitive changes | `.github/workflows/pull_request.yaml:238-330` |
| Testmain cleanup | `TestMain` cleanup for Postgres/MySQL containers | `tests/check/testmain_test.go:10-14` |
| Test server bootstrapping | `StartServerWithContext` helper for integration tests | `tests/tests.go:46-90` |
| Docker client for tests | Custom `DockerClient` for container management in tests | `pkg/testutils/dockerclient.go` |
| YAML matrix tests | `RunAllTests` pattern for Check, ListObjects, ListUsers | `tests/check/check.go:54-61` |
| Storage test interface | `RunAllTests` function for cross-datastore testing | `pkg/storage/test/storage.go:29-52` |
| Iterator caching tests | Tests for `IteratorCache` with mock storage | `pkg/storage/storagewrappers/iterator_cache_test.go` |
| Parallel test config | `MustDefaultConfigForParallelTests` for parallel test isolation | `pkg/testutils/testutils.go:94` |
| Context propagation | `ContextPropagationToDatastore` config for tests | `tests/tests.go:106` |

## Answers to Dimension Questions

### 1. How does the project test async, concurrent, or time-dependent code deterministically?

**Concurrent code** is tested using `golang.org/x/sync/errgroup` for structured parallel goroutine testing. In `pkg/storage/memory/memory_test.go:93-106`, the `TestStaticTupleIteratorNoRace` test launches multiple goroutines that concurrently call `iter.Next()` and `iter.Head()`, then waits for all to complete and asserts no errors.

**Context cancellation/deadline** is explicitly tested in `pkg/storage/memory/memory_test.go:152-251` with `TestStaticTupleIteratorContextCanceled` and `TestStaticTupleIteratorContextDeadlineExceeded`. These tests verify that iterators correctly return `context.Canceled` or `context.DeadlineExceeded` after context is cancelled/expired.

**Async channel-based iteration** is tested in `internal/iterator/channel_test.go` with `TestToChannel`, `TestToChannelWithContextCancellation`, and `TestChannelIterator` covering message passing, context cancellation propagation, and chaining of multiple iterators.

**Time-dependent code** has limited explicit deterministic testing. The iterator tests use `time.Sleep` to trigger deadline exceeded (`pkg/storage/memory/memory_test.go:242`), but this is not truly deterministic in the sense of controlled time advancement. No evidence of a time mocking library (like `github.com/ahmetalpbalkan/go-clock`) was found.

### 2. What is the balance between unit, integration, and e2e tests?

**Unit tests** dominate in `internal/` and `pkg/` packages, covering graph resolution, condition evaluation, storage wrappers, iterators, validators, and utilities. Examples: `internal/graph/check_test.go` (2870 lines), `internal/check/recursive_test.go` (1782 lines), `internal/iterator/*.go` tests.

**Storage integration tests** run against MySQL, PostgreSQL, SQLite, and in-memory via `pkg/storage/test/storage.go:29` (`RunAllTests`). These are in `pkg/storage/mysql/`, `pkg/storage/postgres/`, `pkg/storage/sqlite/`, and `pkg/storage/memory/`. The `tests-storage` CI job runs these at `.github/workflows/pull_request.yaml:66-103`.

**Matrix/integration tests** (`tests/check/`, `tests/listobjects/`, `tests/listusers/`, `tests/authzen/`) test the full server stack by spinning up a real OpenFGA server with a chosen datastore engine and running YAML-defined test scenarios. The `tests-matrix` CI job at `.github/workflows/pull_request.yaml:105-142` runs these.

**No clear e2e tests** were found. The `tests/functional_test.go` starts a real server but is more of an integration test than a true e2e test. The project appears to treat "matrix" tests as the highest layer.

### 3. How are external dependencies (DBs, APIs, queues) mocked or replaced in tests?

**Database mocking**: `internal/mocks/mock_storage.go` provides `MockRelationshipTupleReader`, `MockTupleBackend`, and `MockOpenFGADatastore` generated via `mockgen`. Storage implementations can be swapped for `pkg/storage/memory.New()` for fast, no-dependency tests.

**Docker-based testcontainers**: For integration testing with real databases, `pkg/testfixtures/storage/` provides `RunDatastoreTestContainer(t, engine)` which launches Docker containers for PostgreSQL (`postgres.go:111`), MySQL (`mysql.go`), and SQLite (in-process). A shared container is bootstrapped once per test suite with sync.Cond coordination.

**Mock iterators**: `internal/mocks/mock_iterator.go` provides generic mock iterators for testing iterator consumers.

**Mock cache**: `internal/mocks/mock_cache.go` provides `MockInMemoryCache` for testing caching behavior.

**Mock OIDC server**: `internal/mocks/mock_oidc_server.go` for auth testing.

**Mock tracing server**: `internal/mocks/mock_tracing_server.go` for observability testing.

### 4. How does the project prevent flaky tests from eroding trust?

**Go race detector**: All tests run with `-race` flag (see `Makefile:93`, `Makefile:108`, `Makefile:120`, `Makefile:132`), which detects data races that could cause flaky behavior.

**Goroutine leak detection**: `go.uber.org/goleak.VerifyNone(t)` is called in most integration/matrix tests (e.g., `tests/check/check_test.go:33`, `internal/graph/check_test.go:121`), ensuring goroutines are properly cleaned up.

**Parallel test isolation**: `testutils.MustDefaultConfigForParallelTests()` at `tests/tests.go:94` configures isolated ports and shared iterator settings to prevent test interference. Each `BuildClientInterface` call starts a server on random ports.

**Shared container coordination**: PostgreSQL container uses `sync.Cond` (`pkg/testfixtures/storage/postgres.go:122-147`) to ensure only one test bootstraps the container while others wait, preventing race conditions in container startup.

**YAML test shuffle**: `pkg/testutils/testutils.go:102-117` `Shuffle` function randomizes tuple order to catch ordering dependencies.

**TODO for SQLite**: `tests/check/check_test.go:54-57` shows SQLite tests are commented out with a TODO citing "write contention" issues, suggesting known flakiness.

### 5. Can integration tests run locally without cloud dependencies?

**Mostly yes** — The in-memory datastore (`pkg/storage/memory/`) requires no external dependencies and is used for fast unit tests. The `Makefile` target `test-unit` runs tests excluding storage backends, so it only needs Go.

**Partially** — Storage integration tests (`test-storage`) require Docker to be running, as they launch PostgreSQL, MySQL, and SQLite containers via `pkg/testfixtures/storage/`. This is not cloud-dependent but does require Docker locally.

**MySQL/PostgreSQL require Docker**: The testcontainers approach means local runs need Docker daemon. The `test-docker` target explicitly builds a Docker image and runs tests inside it.

**No cloud dependencies**: The tests do not rely on cloud services (AWS, GCP, etc.) — all external dependencies are either mocked or run locally via Docker.

## Architectural Decisions

- **Test suite split**: CI splits tests into `tests-unit`, `tests-storage`, `tests-matrix` for parallel execution and faster feedback (`.github/workflows/pull_request.yaml:27-143`).
- **GoMock for interface mocking**: Mocks are auto-generated via `mockgen` (`internal/mocks/mock_storage.go:1-7`) and live in `internal/mocks/`.
- **Docker testcontainers**: Database integration tests use Docker containers rather than embedded databases or cloud emulators (`pkg/testfixtures/storage/postgres.go:111`).
- **YAML matrix tests**: Authorization logic is tested via YAML-defined test cases embedded at compile time, enabling comprehensive coverage without code duplication (`tests/check/check.go:64-85`).
- **Shared container singleton**: PostgreSQL container is bootstrapped once and shared across test packages using `sync.Cond` to avoid per-test container startup overhead (`pkg/testfixtures/storage/postgres.go:119-147`).
- **Race detection always on**: `-race` flag is built into all `go test` invocations via Makefile.

## Notable Patterns

- **TestMain cleanup pattern**: Each test package with Docker containers has a `TestMain` that calls cleanup functions after tests complete (`tests/check/testmain_test.go:10-14`).
- **BootstrapFGAStore helper**: `pkg/storage/test/storage.go:57-79` provides a utility to write an FGA model and tuples to any datastore implementation, used across integration tests.
- **Iterator interface with Stop()**: All iterators implement `storage.Iterator[T]` with a `Stop()` method for clean resource release, tested for goroutine safety.
- **errgroup for concurrency testing**: Uses `golang.org/x/sync/errgroup` to test concurrent iterator access deterministically (`pkg/storage/memory/memory_test.go:93`).
- **Context propagation**: Tests configure `ContextPropagationToDatastore=true` to ensure context cancellation/deadlines propagate to storage layer (`tests/tests.go:106`).

## Tradeoffs

- **SQLite tests disabled**: The project acknowledges SQLite write contention issues and disables those tests (`tests/check/check_test.go:54-57`). This means SQLite storage is not fully validated in CI.
- **Docker required for integration tests**: While local, Docker is still a dependency. There's no lightweight alternative for storage integration testing.
- **No time mocking**: Time-dependent tests use `time.Sleep` which is non-deterministic and can cause flakiness in CI under load.
- **Mock generation step in CI**: `make generate-mocks` runs before tests (integrated into `make test`), adding build time. Mocks are checked into the repo but must be regenerated on interface changes.

## Failure Modes / Edge Cases

- **Container resource cleanup**: If a test crashes before cleanup, Docker containers may be left running. The `TestMain` pattern mitigates this but doesn't guarantee cleanup on SIGKILL.
- **Port conflicts in parallel tests**: Each test server binds to a random port via `testutils.TCPRandomPort()`, but there's potential for race conditions during port allocation if tests run too tightly.
- **PostgreSQL replication lag**: The `waitForPostgresReplicaSync` function waits up to 120 seconds for replica synchronization (`pkg/testfixtures/storage/postgres.go:388`). Tests could timeout on slow machines.
- **Iterator panics**: `internal/graph/check_test.go:66-80` shows a `mockPanicIterator` that deliberately panics to test error handling. Tests that don't properly handle panics could leak goroutines.
- **YAML test coverage gap**: Only APIs that have YAML test definitions (Check, ListObjects, ListUsers) get comprehensive scenario coverage. New APIs would need separate test infrastructure.

## Future Considerations

- **Add time mocking library**: Introduce something like `github.com/benbjohnson/clock` to make time-dependent tests truly deterministic.
- **Re-enable SQLite tests**: Investigate and fix the SQLite write contention issues to have complete storage backend coverage.
- **Lightweight storage alternatives**: Consider an embedded PostgreSQL or MySQL for CI environments where Docker is unavailable.
- **Flaky test tracking**: Implement a mechanism to track/flaky tests over time to identify degradation.
- **Expand e2e coverage**: The current highest test layer is "matrix" integration tests. True e2e tests (covering deployment, migrations, and运行时 behavior) are missing.

## Questions / Gaps

1. **No evidence of time mocking** — Time-dependent tests rely on `time.Sleep`, which is non-deterministic under load.
2. **SQLite tests disabled** — Write contention issues mean SQLite is not CI-validated.
3. **No clear e2e test layer** — The "matrix" tests are integration tests, not true e2e covering deployment scenarios.
4. **Mock regeneration coupling** — Mocks are generated via `go generate` but checked in, requiring developers to remember to regenerate when interfaces change.
5. **Limited documentation on test running** — The CONTRIBUTING.md doesn't document how to run specific test categories locally.

---

Generated by `dimensions/14-testing-strategy-reliability.md` against `openfga`.