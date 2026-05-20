# Source Analysis: milvus

## Testing Strategy & Reliability Engineering

### Source Info

| Field | Value |
|-------|-------|
| Name | milvus |
| Path | `sources/milvus` |
| Language / Stack | Go + C++ (internal/core/) + Rust (tantivy) |
| Analyzed | 2026-05-20 |

## Summary

Milvus employs a multi-layered testing strategy across Go unit tests, C++ unit tests, Go integration tests, and Go client tests. The project demonstrates mature testing infrastructure with a custom MiniCluster test harness for integration testing, extensive mock generation via `mockery`, `testify` for assertions, and `gotestsum` for improved test output. External dependencies (etcd, Pulsar, MinIO) are containerized via `docker-compose.yml` for local testing. The CI pipeline runs unit tests and integration tests in separate jobs with coverage reporting. Time-dependent and concurrent code uses patterns like `Eventually` helpers and explicit timing assertions, though some TSO tests rely on actual sleep durations. Mock interfaces are auto-generated across all major internal components.

## Rating

**8/10** — Good implementation with minor issues. The test infrastructure is comprehensive with MiniCluster harnesses, auto-generated mocks, and layered test organization. However, flakiness management is informal (e.g., some TSO tests use `time.Sleep`), and no formal test categorization (unit/integration/e2e) is enforced beyond directory structure.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Test directory structure | Go tests colocated with source as `*_test.go`, integration tests in `tests/integration/`, Go client tests in `tests/go_client/` | `internal/rootcoord/scheduler_test.go:1`, `tests/integration/suite.go:1`, `tests/go_client/testcases/main_test.go:1` |
| Test naming convention | Unit tests use `*_test.go` pattern; integration tests use `Test*` function names with `suite.Run` pattern | `internal/tso/global_allocator_test.go:35`, `tests/integration/hellomilvus/hello_milvus_test.go:220` |
| MiniCluster test harness | `MiniClusterV3` struct manages in-process milvus components (mixcoord, proxy, datanode, querynode, streamingnode) with lifecycle management | `tests/integration/cluster/cluster.go:108-142` |
| Integration test suite base | `MiniClusterSuite` embeds `suite.Suite` from testify, provides `SetupSuite`/`TearDownSuite` with cluster lifecycle | `tests/integration/suite.go:43-50` |
| Testcontainers via docker-compose | Services: etcd, Pulsar, MinIO, Azurite, fake-gcs-server for local testing | `docker-compose.yml:96-148` |
| Integration test execution | `run_intergration_test.sh` runs `go test` with `-tags dynamic,test`, `-race`, `-caseTimeout=20m`, `-timeout=60m` | `scripts/run_intergration_test.sh:36-51` |
| Unit test execution | `run_go_unittest.sh` runs tests per module with `-gcflags="all=-N -l" -race -cover -tags dynamic,test` | `scripts/run_go_unittest.sh:63-65` |
| Mock generation | `mockery` v2.53.3 auto-generates mocks from interfaces, configured via `.mockery.yaml` | `internal/.mockery.yaml:1-122`, `Makefile:76-78` |
| Mock interfaces | Generated mocks for `ChunkManager`, `RootCoord`, `DataCoord`, `QueryCoord`, `DataNode`, `Proxy`, `MixCoord`, gRPC clients | `internal/mocks/mock_chunk_manager.go:1`, `internal/mocks/mock_rootcoord_client.go:1` |
| Eventually helper | `Eventually` function for async assertions with configurable timeout and polling interval | `tests/integration/util_query.go:138` |
| Time-dependent testing | TSO allocator tests use explicit timing assertions with `time.Sleep` | `internal/tso/global_allocator_test.go:53`, `internal/tso/global_allocator_test.go:225` |
| Concurrent scheduler testing | Tests use `sync.Mutex`, `atomic.Int32`, and channel-based task execution | `internal/util/searchutil/scheduler/concurrent_safe_scheduler_test.go:55`, `internal/util/searchutil/scheduler/concurrent_safe_scheduler_test.go:119` |
| CI pipeline — unit tests | GitHub Actions job `UT-Go` runs `make codecov-go-without-build` after Build | `.github/workflows/main.yaml:168-218` |
| CI pipeline — integration tests | GitHub Actions job `integration-test` runs `make build-go && make integration-test` | `.github/workflows/main.yaml:220-269` |
| CI pipeline — coverage | Separate `codecov` job uploads coverage to Codecov | `.github/workflows/main.yaml:271-313` |
| Coverage reporting | Uses `gotestsum` with `-coverprofile`, `-covermode=atomic` | `scripts/run_intergration_test.sh:46-47` |
| Flakiness mitigation | Integration tests use `caseTimeout` flag (default 10 minutes) to prevent indefinite hangs | `tests/integration/suite.go:36-39` |
| Build tags required | Tests require `-tags dynamic,test` and `-gcflags="all=-N -l"` to compile correctly | `AGENTS.md:1` |
| Go client e2e tests | Separate test suite in `tests/go_client/` using testify suite pattern | `tests/go_client/testcases/main_test.go:1` |

## Answers to Dimension Questions

### 1. How does the project test async, concurrent, or time-dependent code deterministically?

Milvus uses multiple strategies:
- **Eventually polling**: `MiniClusterSuite` provides `Eventually(func() bool, timeout, interval)` for async assertions (`tests/integration/util_query.go:138`). This is the primary pattern for waiting on cluster state changes like load completion (`util_query.go:101-109`) and cache release (`util_query.go:138-164`).
- **Explicit timing assertions**: TSO tests verify timestamp monotonicity by checking physical and logical components of generated timestamps (`internal/tso/global_allocator_test.go:62-70`). However, some tests use `time.Sleep` directly (e.g., `global_allocator_test.go:53`).
- **Scheduler concurrency tests**: The scheduler test suite uses mock tasks with controlled execution cost, `atomic.Int32` for counting, and verifies task completion counts after fixed delays (`internal/util/searchutil/scheduler/concurrent_safe_scheduler_test.go:55-104`).
- **Context cancellation**: Many async operations support `ctx.Done()` checking with `FailNow` on timeout (`util_query.go:80-85`).

### 2. What is the balance between unit, integration, and e2e tests?

Milvus organizes tests into three distinct layers:
- **Unit tests**: Co-located with source as `*_test.go` within `internal/` and `pkg/` directories. Run via `make unittest` → `scripts/run_go_unittest.sh` which invokes module-specific test functions (proxy, querynode, datanode, rootcoord, querycoord, datacoord, kv, mq, storage, allocator, tso, util, pkg, metastore, cmd, streaming, mixcoord, cdc) at `scripts/run_go_unittest.sh:179-199`.
- **Integration tests**: Located in `tests/integration/` with a `MiniClusterSuite` that bootstraps a full Milvus cluster in-process. The `tests/integration/` directory contains 30+ subdirectories covering domain areas (hellomilvus, search, querynode, datanode, compaction, etc.). Run via `make integration-test` → `scripts/run_intergration_test.sh`.
- **Go client e2e tests**: Located in `tests/go_client/` with test cases for the Go client SDK. These tests connect to a running Milvus instance (not in-process) and test the client API surface.

The CI pipeline runs unit tests and integration tests in parallel jobs (UT-Go and integration-test) after the Build job.

### 3. How are external dependencies (DBs, APIs, queues) mocked or replaced in tests?

Milvus uses multiple strategies for handling external dependencies:
- **MiniCluster with real components**: Integration tests spawn actual Milvus components (mixcoord, proxy, datanode, querynode, streamingnode) as subprocesses within the test process, with real etcd and MinIO backends (`tests/integration/cluster/cluster.go:144-187`). This is NOT mocked — external services are real.
- **Docker-compose for local dev**: `docker-compose.yml` defines etcd, Pulsar, MinIO, Azurite, and fake-gcs-server containers for local testing (`docker-compose.yml:96-148`). Integration tests connect to these services.
- **Auto-generated interface mocks**: `mockery` generates mock implementations for internal interfaces (RootCoord, DataCoord, QueryCoord, ChunkManager, etc.) defined in `internal/.mockery.yaml` and per-module `.mockery.yaml` files. These are used in unit tests to isolate components.
- **gRPC client mocks**: Generated mocks for `GrpcClient` and client interfaces (`internal/mocks/mock_grpc_client.go:1`).
- **EtcdKv for TSO testing**: TSO tests use real etcd with `tsoutil.NewTSOKVBase` to persist timestamp allocator state (`internal/tso/global_allocator_test.go:45`).

### 4. How does the project prevent flaky tests from eroding trust?

Milvus has informal flakiness mitigation rather than a formal system:
- **Case timeout**: Integration tests use a `-caseTimeout` flag (default 10 minutes per test case) to prevent individual tests from hanging indefinitely (`tests/integration/suite.go:36-39`).
- **Failfast**: Unit and integration test runners use `-failfast` to stop on first failure, preventing cascade of failures from a single bad test (`scripts/run_intergration_test.sh:43`, `scripts/run_go_unittest.sh:63`).
- **Polling with Eventually**: For async operations, tests poll with a timeout rather than using fixed sleeps, reducing timing sensitivity (`util_query.go:101-109`).
- **Race detector**: Tests run with `-race` flag enabled (`scripts/run_intergration_test.sh:39`), catching data races that could cause flaky behavior.
- **Build caching**: CI uses cache-restore/save actions for C++ and Go build artifacts to ensure consistent builds.
- **No evidence found**: No visible retry mechanisms, test stabilization periods, or flakiness detection/reporting infrastructure.

### 5. Can integration tests run locally without cloud dependencies?

**Yes, with docker-compose**: Integration tests can run locally using `docker-compose.yml` which provides:
- etcd (line 97)
- Pulsar (line 111)
- MinIO (line 124)
- Azurite (line 136)
- fake-gcs-server (line 143)

The workflow in `AGENTS.md` shows `scripts/start_standalone.sh` for local standalone mode. The `Makefile` includes `make integration-test` which runs `scripts/run_intergration_test.sh`. The CI workflow shows that integration tests expect these services at `localhost:2379` etcd and `localhost:9000` minio endpoints (via environment variables set in docker-compose).

However, the TSO tests specifically require a running etcd instance — they read `ETCD_ENDPOINTS` from environment and default to `localhost:2379` if not set (`internal/tso/global_allocator_test.go:36-40`). This means TSO unit tests are not fully self-contained.

## Architectural Decisions

- **In-process cluster testing**: The `MiniClusterV3` harness runs actual Milvus server components as subprocesses within the test binary, rather than containerizing each component separately. This provides faster test execution than testcontainers while still testing full integration. Components are spawned via `process.NewMixCoordProcess`, `process.NewProxyProcess`, etc. (`tests/integration/cluster/cluster.go:513, 532, 592, 559, 612`).

- **Test tags requirement**: Go tests MUST use `-tags dynamic,test` and `-gcflags="all=-N -l"` to compile due to monkey-patching in the codebase (`AGENTS.md:1`). This is enforced in all test scripts.

- **Mockery-based mock generation**: All interface mocks are auto-generated via `mockery` v2.53.3, configured via YAML files (`.mockery.yaml`, `internal/.mockery.yaml`). Generated mocks are checked into `internal/mocks/`.

- **Testify as assertion library**: The project uses `github.com/stretchr/testify` for both `suite` (test suite base) and `assert`/`require` assertions.

- **Separate coverage reporting**: Unit test coverage (`go_coverage.txt`) and integration test coverage (`it_coverage.txt`) are reported separately and uploaded independently to Codecov.

## Notable Patterns

- **Suite-based test organization**: Integration tests use testify `suite.Suite` with `SetupSuite`/`TearDownSuite` for cluster lifecycle management (`tests/integration/suite.go:81-134`).
- **Test option pattern**: `WithDropAllCollectionsWhenTestTearDown` and `WithoutResetDeploymentWhenTestTearDown` options configure test suite behavior (`tests/integration/suite_options.go:11-22`).
- **EtcdMetaWatcher for introspection**: Tests can inspect cluster state (sessions, segments, replicas) via `EtcdMetaWatcher` which reads from etcd (`tests/integration/cluster/meta_watcher.go:50-65`).
- **Config modification guard**: `MustModifyMilvusConfig` returns a revert function for temporary config changes during tests (`tests/integration/cluster/cluster.go:239-261`).
- **Module-separated go.mod**: The `pkg/` directory has its own `go.mod` (module: `github.com/milvus-io/milvus/pkg/v3`), requiring separate `go get` operations for dependencies.

## Tradeoffs

- **Real etcd/MinIO vs mocks**: Integration tests use real external services rather than embedded or mocked alternatives. This provides high fidelity but means tests require docker-compose running and may be affected by external service behavior.
- **TSO tests with sleep timing**: Some TSO tests rely on `time.Sleep` for timing (e.g., `global_allocator_test.go:53, 225`) rather than mock clocks, making them potentially timing-sensitive.
- **No formal test categorization**: There is no enforced naming or tagging convention to distinguish unit vs integration vs e2e tests beyond directory location. This could lead to tests in `tests/integration/` that don't actually require the full cluster.
- **Monolithic test execution**: The `run_go_unittest.sh` script runs all unit tests sequentially per module without parallelization at the module level (though `go test` itself may parallelize within a module).

## Failure Modes / Edge Cases

- **Etcd dependency for TSO tests**: TSO unit tests (`internal/tso/global_allocator_test.go`) require a running etcd instance, defaulting to `localhost:2379`. Without it, tests will fail immediately.
- **Build tag compilation**: If tests are compiled without `-tags dynamic,test` and `-gcflags="all=-N -l"`, they will fail to compile due to CGO bindings and monkey patching.
- **Port conflicts**: MiniCluster binds to fixed ports (e.g., proxy to `localhost:19530`), which can conflict if multiple test instances run simultaneously.
- **Config refresh delay**: `MustModifyMilvusConfig` uses a fixed 100ms sleep multiplier (`cluster.go:250, 260`) to wait for config propagation, which may be insufficient under load.
- **Resource consumption**: The in-process MiniCluster with multiple components can consume significant memory/CPU, potentially affecting test execution speed on resource-constrained CI runners.

## Future Considerations

- **Mock clock for TSO**: Replace `time.Sleep` in TSO tests with a controlled clock interface to eliminate timing dependencies.
- **Flakiness detection**: Implement automated flakiness monitoring (e.g., Test Flakiness Detector) to identify and track flaky tests over time.
- **Test parallelization**: Consider parallelizing unit test execution across modules to reduce total test time.
- **Embedded etcd/MinIO**: Consider using embedded etcd and MinIO for unit tests to eliminate external dependencies.
- **Formal test categorization**: Introduce tags or naming conventions to formally categorize tests and prevent integration tests from accidentally depending on full cluster when they should be unit tests.

## Questions / Gaps

- **No evidence found** for a formal test flakiness reporting or tracking system (e.g., issue tracker labels, bot comments).
- **No evidence found** for test stabilization or retry mechanisms for known-flaky tests.
- **No evidence found** for snapshot testing, golden file testing, or property-based testing approaches.
- **No evidence found** for contract testing between components.
- **No evidence found** for chaos testing or fault injection in the test suite.

---

Generated by `dimensions/14-testing-strategy-reliability.md` against `milvus`.