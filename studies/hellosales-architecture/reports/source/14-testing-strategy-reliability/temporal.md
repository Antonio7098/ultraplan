# Source Analysis: temporal

## Testing Strategy & Reliability Engineering

### Source Info

| Field | Value |
|-------|-------|
| Name | temporal |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/temporal` |
| Language / Stack | Go (1.26.2) |
| Analyzed | 2026-05-20 |

## Summary

Temporal implements a multi-layered testing strategy with three distinct test tiers: unit tests, integration tests (database-level), and functional tests (full cluster). The project uses `testify` suite-based testing with `require` assertions, `go.uber.org/mock` for mocks, and has built a sophisticated test infrastructure including cluster pooling, dedicated/shared cluster isolation, test sharding, flaky test reporting, and deterministic testing patterns. The primary test framework is standard Go `testing` with testify suites for functional/integration tests.

## Rating

**8/10** — Excellent implementation with minor issues. The project has mature testing infrastructure including cluster pooling for resource efficiency, test sharding for CI parallelization, flaky test detection/reporting, and comprehensive integration test coverage across multiple databases. However, widespread use of `time.Sleep` in functional tests (400+ instances) undermines deterministic testing of async/time-dependent code, and there is no evidence of a virtual clock or testable time controller for timer-based tests.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Test directory structure | `tests/` for functional tests, `common/persistence/tests/` for integration tests, `tools/*/` for tool-specific tests | `tests/workflow_test.go:1` |
| Testify usage | Suite-based tests using `require` and `suite` from `github.com/stretchr/testify` | `tests/testcore/functional_test_base.go:15-16` |
| Mock generation | `go.uber.org/mock/gomock` used via MockGen for SDK mocks | `common/testing/mocksdk/workflowrun_mock.go:17` |
| Cluster pooling | Pool-based cluster management with shared/dedicated clusters | `tests/testcore/test_cluster_pool.go:54-82` |
| Test sharding | Hash-based distribution across CI shards using `farm.Fingerprint32` | `tests/testcore/test_env.go:505-510` |
| Flaky test reporting | Dedicated flakereport tool with GitHub Actions integration | `tools/flakereport/flakereport.go:26-114` |
| Test runner with retries | Custom test-runner with max-attempts for flaky test retry | `Makefile:526` |
| Race detector | `-race` flag enabled by default in test execution | `Makefile:70` |
| Test shuffle | `-shuffle on` enabled by default for test randomization | `Makefile:71` |
| Integration tests | DB integration tests using testify suites for Cassandra, MySQL, PostgreSQL, SQLite | `common/persistence/tests/history_store.go:37-51` |
| Docker containers for integration | Docker-compose based test dependencies (Cassandra, MySQL, PostgreSQL, Elasticsearch) | `.github/workflows/run-tests.yml:116-150` |
| Fault injection testing | `functional-with-fault-injection-test` target | `Makefile:499-504` |
| Time-dependent tests | Extensive `time.Sleep` usage for async waiting (400+ occurrences) | `tests/versioning_test.go:798-3466` |
| Temporal test server | `temporaltest/server.go` provides lightweight in-process server for e2e tests | `temporaltest/server.go:19-33` |

## Answers to Dimension Questions

### 1. How does the project test async, concurrent, or time-dependent code deterministically?

**Evidence: Insufficient deterministic mechanisms.** The project uses `require.Eventually` and `require.EventuallyWithTf` for polling async conditions (`tests/update_workflow_utils.go:104`, `tests/task_queue_stats_test.go:1209`), which is better than raw `time.Sleep`. However, there is **no virtual clock or testable time controller** found. Functional tests contain 400+ `time.Sleep` calls (e.g., `tests/versioning_test.go:798`, `tests/xdc/failover_test.go:2032`, `tests/update_workflow_test.go:1465`), used to wait for timers, workflow completions, and cluster state propagation.

The project relies on:
- `require.Eventually` with configurable timeouts for async assertions
- Context-based timeouts via `setupTestTimeoutWithContext` (`tests/testcore/test_env.go:198`)
- Hardcoded sleep durations ranging from 100ms to 100+ seconds

**No evidence found** of a mock clock, frozen time provider, or time-accelerating test harness.

### 2. What is the balance between unit, integration, and e2e tests?

**Evidence: Heavily weighted toward integration/functional with minimal unit tests.**

- **Unit tests**: Excluded from functional test roots; run via `make unit-test` targeting `UNIT_TEST_DIRS` (line 129 of Makefile excludes all functional test directories)
- **Integration tests**: Database-level tests in `common/persistence/tests/` and `tools/tests/` run via `make integration-test`
- **Functional tests**: Full cluster tests in `tests/` directory (including xdc, ndc subdirectories) run via `make functional-test`
- **E2e tests**: `temporaltest/` package provides lightweight in-process server for true e2e testing

The Makefile at lines 482-497 shows clear separation:
```
unit-test:  # unit tests only
integration-test:  # integration tests (DB)
functional-test:  # functional tests (full cluster)
```

The functional test directory structure (`tests/`) is large (~200+ test files), indicating the primary testing approach is integration-level with real clusters rather than isolated unit tests. The cluster pool (line 16-51 of `test_cluster_pool.go`) supports efficient reuse of cluster resources across the large functional test suite.

### 3. How are external dependencies (DBs, APIs, queues) mocked or replaced in tests?

**Evidence: Partial mocking — DB fixtures use real databases via containers, SDK mocks exist but persistence layer uses real implementations.**

- **Databases**: Tests use real database containers (Cassandra, MySQL, PostgreSQL, SQLite, Elasticsearch) via docker-compose. Integration tests in `common/persistence/tests/` use actual persistence implementations
- **SDK mocks**: Generated mocks via `go.uber.org/mock` for SDK client interfaces (`common/testing/mocksdk/workflowrun_mock.go:20-97`)
- **gRPC mocks**: `MockServerTransportStream` in `common/testing/rpctest/transport_stream.go:12-83`
- **Proto mocks**: `protomock` matchers using proto.Equal in `common/testing/protomock/matchers.go:19-37`
- **Temporal test server**: `temporaltest/server.go` with `LiteServer` provides ephemeral in-memory server for e2e testing

No evidence found of mocking frameworks for Cassandra or database drivers — integration tests use real database connections with `testcontainers`-like container management via docker-compose in CI.

### 4. How does the project prevent flaky tests from eroding trust?

**Evidence: Multi-layered flakiness prevention.**

- **Retry mechanism**: `MAX_TEST_ATTEMPTS ?= 3` (`Makefile:62`) with custom test-runner (`Makefile:526-532`)
- **Flaky test reporting**: Dedicated `tools/flakereport/` tool analyzes test artifacts from CI runs, classifies failures as flaky, timeout, crash, or CI-breaker (`tools/flakereport/flakereport.go:292-301`)
- **Test shuffle**: `-shuffle on` enabled by default (`Makefile:67`) to detect order-dependent tests
- **Race detector**: `-race` enabled by default (`Makefile:65`) to detect data races
- **Cluster pool with recreation**: Clusters recreated after 50 tests in CI to prevent resource accumulation (`tests/testcore/test_cluster_pool.go:38-40`)
- **Dedicated cluster guard**: `WithDedicatedCluster()` prevents tests with global side effects from running on shared clusters (`tests/testcore/test_env.go:102-108`)

**Gaps**: Despite these mechanisms, 400+ `time.Sleep` calls in functional tests remain a significant source of flakiness — durations are often based on worst-case timeouts rather than deterministic conditions.

### 5. Can integration tests run locally without cloud dependencies?

**Evidence: Yes, with local docker dependencies.**

- **Docker-compose for local dev**: `./develop/docker-compose/docker-compose.yml` provides local database containers
- **`make start-dependencies`**: `docker compose up` to bring up Cassandra, MySQL, PostgreSQL, Elasticsearch locally (`Makefile:643-644`)
- **SQLite fallback**: Shared clusters use file-based SQLite for parallel test access (`tests/testcore/functional_test_base.go:298-299`)
- **No cloud dependencies**: No evidence of AWS, GCP, or Azure dependencies in test infrastructure — all databases are self-hosted via docker-compose or local files

CI uses the same docker-compose configuration (`DOCKER_COMPOSE_FILE: ./develop/github/docker-compose.yml` at line 24 of `.github/workflows/run-tests.yml`), ensuring parity between local and CI environments.

## Architectural Decisions

### Cluster Pool Architecture
Temporal uses a sophisticated cluster pooling system (`tests/testcore/test_cluster_pool.go:54-190`) that:
- Maintains separate pools for shared and dedicated clusters
- Sizes pools based on `runtime.GOMAXPROCS(0)` (shared: `N/2`, dedicated: `N`)
- Configurable via `TEMPORAL_TEST_SHARED_CLUSTERS` and `TEMPORAL_TEST_DEDICATED_CLUSTERS` environment variables
- Recreates clusters after 50 tests in CI to prevent resource leaks
- Supports dynamic config overrides without cluster sharing

### Test Environment Abstraction
The `TestEnv` abstraction (`tests/testcore/test_env.go:61-86`) wraps `FunctionalTestBase` and provides:
- Per-test namespace isolation
- Automatic namespace-scoped dynamic config for shared clusters
- Global vs namespace-scoped hook discrimination
- Metrics capture scoped to namespace or global

### Test Sharding
Tests distribute across CI shards using farm hash (`tests/testcore/test_env.go:505-510`):
```go
nameToHash := t.Name() + strings.TrimSpace(shardSalt)
testIndex := int(farm.Fingerprint32([]byte(nameToHash))) % total
```
The `shardSalt` value in `tests/testcore/shard_salt.txt` is automatically updated by the `optimize-test-sharding` workflow to balance shard distribution.

## Notable Patterns

### Suite-based Testing with Assertions
Tests use testify `suite.Suite` pattern with `require.Assertions` for failing-fast behavior:
```go
type FunctionalTestBase struct {
    suite.Suite
    *require.Assertions  // Replaces *assert.Assertions for fail-fast
    protorequire.ProtoAssertions
    historyrequire.HistoryRequire
}
```
See `tests/testcore/functional_test_base.go:56-69`.

### Test Isolation via Namespace-per-Test
Each test gets its own namespace (`tests/testcore/test_env.go:174-186`), preventing cross-test contamination. Namespaces are randomly named via `RandomizeStr()`.

### Parallel Test Execution
Test parallelization is supported at multiple levels:
- Test sharding via `TEST_TOTAL_SHARDS` / `TEST_SHARD_INDEX` environment variables
- Subtest partitioning within suites via `SetupSubTest` / `TearDownSubTest`
- Pool-based cluster sharing for resource efficiency

### Custom Test Runner
The `cmd/tools/test-runner/` tool wraps `gotestsum` with retry logic, JUnit reporting, and crash report generation (`Makefile:526-532`).

## Tradeoffs

### Determinism vs. Performance
The choice to use real clusters (Cassandra, PostgreSQL, etc.) instead of mocks provides highest confidence but introduces non-deterministic elements via network latency, disk I/O, and cluster state propagation. The 400+ `time.Sleep` calls represent accumulated engineering tradeoffs prioritizing time-to-implementation over test determinism.

### Cluster Pool Efficiency vs. Isolation
Sharing clusters between tests (shared pool) improves resource utilization and test speed but requires careful namespace and dynamic config isolation. The dedicated cluster guard mechanism (`tests/testcore/test_env.go:513-547`) attempts to prevent unsafe operations on shared clusters but relies on test authors correctly requesting dedicated clusters.

### Test Shuffling vs. Reproducibility
Enabling `-shuffle on` by default helps detect order-dependent tests but can make local debugging less reproducible. CI runs maintain reproducibility via shard assignment while still benefiting from shuffle.

## Failure Modes / Edge Cases

### Shared Cluster Misuse
Tests requiring global operations (e.g., shard manipulation via `CloseShard`) must request dedicated clusters or the `dedicatedGuard` will detect and fail the test (`tests/testcore/test_env.go:536-546`).

### Namespace Cache Refresh Timing
Namespace registration relies on cache refresh intervals with polling loops (`tests/testcore/functional_test_base.go:509-523`):
```go
namespaceCacheDeadline := time.Now().Add(5 * NamespaceCacheRefreshInterval)
ticker := time.NewTicker(NamespaceCacheRefreshInterval / 2)
```
This is timing-dependent and could fail under slow CI environments.

### Timer/Time-Based Tests
Workflow timer tests rely on actual time progression, making them inherently non-deterministic. The absence of a virtual clock means timer tests may be flaky under load or slow environments.

### Cluster Resource Exhaustion
The pool recreates clusters after 50 tests in CI, but under high parallelism or memory pressure, cluster teardown may fail or be delayed, potentially causing cascading test failures.

## Future Considerations

### Virtual Time Controller
Implementing a testable clock (like `clock.FrozenClock` or `clock.Mock`) would eliminate the 400+ `time.Sleep` calls and make timer-based tests fully deterministic.

### Enhanced Mocking for Persistence
Expanding use of interface-based persistence mocks (similar to `protomock`) would enable more unit-level testing of persistence code paths without requiring real database containers.

### Test Reliability Monitoring
The existing `flakereport` tool could be extended with dashboards tracking per-test flakiness rates over time, helping identify and prioritize flaky test remediation.

## Questions / Gaps

1. **No virtual clock found**: No evidence of `clock.FrozenClock`, `testclock`, or similar mechanism for controlling time in tests. This is the primary gap for deterministic async/time testing.

2. **Limited unit test coverage for core services**: The functional test directory is extensive (~200+ files) while unit tests appear sparse for core services (history, matching, frontend). This suggests core business logic may lack unit-level isolation.

3. **No evidence of chaos testing**: While fault injection is supported (`-enableFaultInjection=true`), no evidence of chaos testing frameworks (Chaos Monkey, etc.) for simulating node failures.

4. **Timer test flakiness**: The widespread use of `time.Sleep` for timer tests (e.g., `tests/versioning_test.go:800`: `time.Sleep(100 * time.Second)`) is a significant source of potential flakiness.

5. **Build-time code generation for mocks**: Mocks are generated at build time via `go generate` and `MockGen`, but there's no evidence of runtime mock injection for dependency substitution in tests.

---

Generated by `dimensions/14-testing-strategy-reliability.md` against `temporal`.