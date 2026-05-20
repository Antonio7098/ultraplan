# Testing Strategy & Reliability Engineering - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Dimension | `14-testing-strategy-reliability` |
| Sources | cli, grafana, kubernetes, milvus, nats-server, openfga, pocketbase, temporal, victoriametrics |
| Date | 2026-05-20 |

## Sources Studied

| # | Source | Path |
|---|--------|------|
| 1 | cli | `sources/cli` |
| 2 | grafana | `sources/grafana` |
| 3 | kubernetes | `sources/kubernetes` |
| 4 | milvus | `sources/milvus` |
| 5 | nats-server | `sources/nats-server` |
| 6 | openfga | `sources/openfga` |
| 7 | pocketbase | `sources/pocketbase` |
| 8 | temporal | `sources/temporal` |
| 9 | victoriametrics | `sources/victoriametrics` |

## Executive Summary

Testing strategy and reliability engineering is one of the most mature dimensions across the nine sources, with scores clustering tightly between 7 and 8. All sources have multi-layered test strategies spanning unit, integration, and either e2e or functional tests. The primary differentiators are: (1) whether integration tests can run locally without cloud/Docker dependencies, (2) how deterministic async/concurrent/time-dependent code testing is, and (3) whether flakiness prevention mechanisms are formal or informal.

Three convergent findings emerge: (1) `go test` with colocated `*_test.go` files is universal for unit testing across all Go-based sources. (2) Fake clocks and polling-based async assertion patterns (rather than mock clocks) are the dominant approach for time-dependent testing. (3) All sources with scores of 8 share at least one of: cluster pooling, test sharding, or dedicated concurrency testing frameworks.

The most significant gap is deterministic time control: only Kubernetes (via `testingclock.FakeClock`) and VictoriaMetrics (via `testing/synctest`) have explicit clock advancement mechanisms. Temporal, Milvus, and Pocketbase rely heavily on `time.Sleep` for async waiting, creating potential flakiness under load.

## Core Thesis

Testing infrastructure maturity correlates strongly with operational sophistication rather than code size or age. The difference between a 7 and an 8 in this dimension is not test coverage percentage but rather the presence of: (1) infrastructure that enables local test execution without external dependencies, (2) explicit concurrency testing patterns, and (3) flakiness management rather than merely flakiness detection.

Sources that score 8 demonstrate that testing strategy is an architectural concern, not a tactical one. Temporal's cluster pooling, VictoriaMetrics's `synctest`, Kubernetes's `goleak`, and OpenFGA's testcontainers each represent architectural decisions that make tests faster, more reliable, and more parallelizable. The sources that score 7 tend to have strong individual testing layers but lack the infrastructure glue that ties them into a cohesive system.

## Rating Summary

| Source | Score | Approach | Main Strength | Main Concern |
|--------|-------|----------|---------------|--------------|
| cli | 7/10 | HTTP mock registry + testscript acceptance | In-house HTTP mocking with stub verification, time dependency injection | Acceptance tests require live GitHub credentials; async testing via time.Sleep |
| grafana | 8/10 | SQLite default + embedded server + CI sharding | Local integration testing without Docker, TZ-enforced consistency, 16-way frontend sharding | jsdom mocking overhead, limited deterministic time control |
| kubernetes | 8/10 | Fake clock + goleak + etcd spawning | FakeClock for time control, goroutine leak detection, full local integration | E2e requires real cluster, CI invisible (Prow-based) |
| milvus | 8/10 | MiniCluster + containerized deps + mockery | In-process cluster testing, auto-generated mocks, test option patterns | TSO tests require real etcd; time.Sleep for timing; no formal time mocking |
| nats-server | 8/10 | Real server spawning + NoRace tests + checkFor polling | Protocol-level testing, 20+ CI parallel jobs, no mocking overhead | NoRace tests skip race detector; sequential -p=1 per job |
| openfga | 8/10 | Testcontainers + YAML matrix + errgroup concurrency | Docker-based storage testing, concurrent iterator testing, YAML-driven test scenarios | Docker required for integration tests; no time mocking |
| pocketbase | 7/10 | TestApp wrapper + ApiScenario + SQLite fixture cloning | Full app bootstrapping, scenario-based API testing, event call tracking | No test parallelization, time.Sleep for async, no race detector in CI |
| temporal | 8/10 | Cluster pooling + test sharding + flaky test reporting | Cluster pool for efficiency, test shuffle for order detection, dedicated flakereport tool | 400+ time.Sleep calls undermine determinism; no virtual clock |
| victoriametrics | 8/10 | synctest + apptest + retry assertion | Go's testing/synctest for deterministic concurrency, process-based integration, retry mechanism | Integration tests require pre-built binaries; long cache expiration sleeps |

## Approach Models

### Real-Server Integration (nats-server, milvus, VictoriaMetrics)
These sources spawn actual server binaries as subprocesses or goroutines rather than mocking internals. nats-server's `RunServer()` (`server/server_test.go:80`) starts a real NATS server in a goroutine; milvus's `MiniClusterV3` (`tests/integration/cluster/cluster.go:108`) spawns actual Milvus components; VictoriaMetrics's `apptest` (`apptest/testcase.go:81`) starts `vmsingle` or `vmstorage` binaries. This approach maximizes fidelity but requires careful port management and sequential execution within test jobs.

### Embedded Test Harness (Grafana, Pocketbase)
These sources start a full application instance within the test process via a test-specific entry point. Grafana's `testinfra.StartGrafana()` (`pkg/tests/testinfra/testinfra.go:75`) initializes a complete Grafana server with test database. PocketBase's `TestApp` (`tests/app.go:18`) wraps the full app with cloned temp directories. This provides high integration fidelity without OS-level process management.

### Containerized Dependencies (OpenFGA, Kubernetes, Milvus)
These sources use Docker containers or spawned processes for external dependencies (etcd, Postgres, MySQL). OpenFGA's `RunDatastoreTestContainer()` (`pkg/testfixtures/storage/postgres.go:111`) launches PostgreSQL via Docker. Kubernetes's `startEtcd()` (`test/integration/framework/etcd.go:61`) spawns a real etcd process. Milvus's docker-compose (`docker-compose.yml:96`) provides etcd, Pulsar, MinIO. This approach provides production-like testing but requires Docker availability.

### Test Scripting (cli, nats-server)
These sources use executable test scripts for acceptance/e2e testing. cli uses `go-internal/testscript` with `.txtar` scripts (`acceptance/acceptance_test.go:19`). nats-server uses build-tag-gated test files (`server/norace_1_test.go:14`). This approach enables tests to be written as documentation-like scripts with custom commands.

## Pattern Catalog

### Pattern 1: Polling-Based Async Assertion (checkFor / Eventually)
**What**: A helper function that polls a condition with timeout and interval until it succeeds or times out.
**Sources**: nats-server (`server/server_test.go:57-64`, 1074+ usages), temporal (`require.Eventually`, `require.EventuallyWithTf` at `tests/update_workflow_utils.go:104`), milvus (`Eventually` at `tests/integration/util_query.go:138`), kubernetes (`checkFor`-like patterns throughout).
**Why it works**: Replaces `time.Sleep` with bounded, interruptible waiting. Fails fast on persistent failures while tolerating transient latency.
**When to copy**: Any async operation that takes variable time (cluster state propagation, background task completion, cache invalidation).
**When overkill**: Operations with hard latency guarantees where polling overhead matters.
**Risk**: Polling interval too large masks real slowness; too small causes CPU waste.

### Pattern 2: Fake Clock for Time Control
**What**: A test clock implementation that can be advanced programmatically to test time-dependent behavior.
**Sources**: Kubernetes (`testingclock.FakeClock` at `test/integration/serviceaccount/legacy_service_account_token_clean_up_test.go:119`), VictoriaMetrics (`testing/synctest` at `lib/workingsetcache/cache_synctest_test.go:59`).
**Why it works**: Eliminates `time.Sleep` flakiness by making time advancement deterministic and instantaneous.
**When to copy**: Tests for token expiration, cache TTL, rate limit window resets, timeout handling.
**Gap**: Only 2 of 9 sources have this. Temporal, milvus, pocketbase, openfga all rely on `time.Sleep`.

### Pattern 3: Goroutine Leak Detection
**What**: Integration test infrastructure that verifies all goroutines are cleaned up after each test.
**Sources**: Kubernetes (`goleak` at `test/integration/framework/goleak.go:43-72`), OpenFGA (`goleak.VerifyNone(t)` at `tests/check/check_test.go:33`), Temporal (`goleak` integration).
**Why it works**: Goroutine leaks cause test pollution where one test's goroutines interfere with subsequent tests. `goleak` catches this reliably with retry logic.
**When to copy**: Any project with significant goroutine usage (async handlers, background workers, watchers).
**Evidence**: Kubernetes has 600-second retry timeout with known-safe ignores (`goleak.go:57-72`).

### Pattern 4: Cluster Pooling for Test Resource Efficiency
**What**: A pool of pre-booted test clusters shared across many test cases to avoid per-test cluster startup cost.
**Sources**: Temporal (`tests/testcore/test_cluster_pool.go:54-82`, sizing based on `GOMAXPROCS`), VictoriaMetrics (`TestCase` reuse pattern at `apptest/testcase.go:81`).
**Why it works**: Cluster startup is expensive (5-30 seconds). Pooling reduces average test cost to milliseconds. Shared pools use namespace isolation; dedicated pools for tests with global side effects.
**When to copy**: Projects with functional/integration tests requiring full cluster boot.
**Tradeoff**: Shared clusters risk cross-test contamination; dedicated clusters waste resources.

### Pattern 5: CI Test Sharding
**What**: Hash-based distribution of tests across parallel CI jobs to balance runtime.
**Sources**: Temporal (`farm.Fingerprint32` at `tests/testcore/test_env.go:505-510`), Grafana (8 backend shards, 16 frontend shards), Kubernetes (`SHARD` env var at `hack/make-rules/test.sh:45-48`).
**Why it works**: Uneven test duration distribution causes slow jobs to dominate total time. Sharding with consistent hash ensures even distribution across runs.
**When to copy**: Test suites exceeding 5 minutes total runtime.
**Evidence**: Temporal's `shardSalt.txt` is auto-updated by `optimize-test-sharding` workflow.

### Pattern 6: Retry-Based Eventually Consistent Assertions
**What**: Assertion helpers that retry comparisons against eventual consistency windows.
**Sources**: VictoriaMetrics (`AssertOptions` with `Retries: 20, Period: 100ms` at `apptest/testcase.go:383`), temporal (`require.EventuallyWithTf`).
**Why it works**: Data store writes are not immediately visible for reads due to replication, indexing, or caching. Retry handles this without artificial delays.
**When to copy**: Any test against eventually consistent systems (databases with replicas, search indexes, caches).
**Evidence**: VictoriaMetrics default 20 retries x 100ms = 2s maximum wait.

### Pattern 7: Testcontainers for External Dependencies
**What**: Docker-based container spawning for databases, message queues, and other external services.
**Sources**: OpenFGA (`RunDatastoreTestContainer` at `pkg/testfixtures/storage/postgres.go:111`), Milvus (`docker-compose.yml:96`), Temporal (`docker-compose` at `.github/workflows/run-tests.yml:116`).
**Why it works**: Provides production-like external dependencies without manual setup. Containers are reproducible and isolable.
**When to copy**: Integration tests needing MySQL, PostgreSQL, Redis, etc.
**Gap**: CLI, PocketBase, VictoriaMetrics use in-process or embedded alternatives instead.

### Pattern 8: HTTP Mock Registry with Verification
**What**: A central registry that tracks registered HTTP stubs and verifies all were matched on test completion.
**Sources**: cli (`Registry` at `pkg/httpmock/registry.go:18-30` with `Verify(t)` at `registry.go:60-79`), OpenFGA (mock storage interfaces), Grafana (mock HTTP in frontend).
**Why it works**: Unmatched stubs indicate test incompleteness. The registry fails the test rather than passing with unmet expectations.
**When to copy**: Projects with complex HTTP interaction sequences.
**Evidence**: cli stub registration captures `debug.Stack()` at registration for debugging (`registry.go:26`).

### Pattern 9: Suite-Based Test Organization
**What**: Test suites embedding testify's `suite.Suite` with `SetupSuite`/`TearDownSuite` lifecycle methods.
**Sources**: Temporal (`FunctionalTestBase` at `tests/testcore/functional_test_base.go:15-16`), Milvus (`MiniClusterSuite` at `tests/integration/suite.go:43-50`), OpenFGA (`RunAllTests` at `pkg/storage/test/storage.go:29-52`).
**Why it works**: Reduces boilerplate per test case. Shared setup/teardown per suite.
**When to copy**: Large integration test suites with common setup requirements.

### Pattern 10: NoRace Tests for Race-Condition-Immune Testing
**What**: Test files gated by build tags that test inherently racy behavior without the race detector.
**Sources**: nats-server (`server/norace_1_test.go:14-58` with `//go:build !race`), VictoriaMetrics (`//go:build synctest` at `lib/workingsetcache/cache_synctest_test.go:1`).
**Why it works**: The race detector cannot be used for tests that intentionally race (e.g., memory usage under concurrent load). Build tags separate these.
**Tradeoff**: NoRace tests don't get race detection, creating a potential blind spot.
**Evidence**: nats-server NoRace tests use `time.Sleep` to trigger race conditions deliberately.

## Key Differences

### Mock-Heavy vs Real-Server Testing
nats-server and VictoriaMetrics prefer real server spawning with no mocking. OpenFGA, Kubernetes, and Milvus use mocks extensively. Grafana and PocketBase use interface-based fakes. cli uses HTTP stubs but not full server mocking. The choice impacts fidelity vs speed tradeoffs. Real-server tests catch integration bugs mocks miss; mock-heavy tests run faster and are easier to parallelize.

### Deterministic Time Control
Only 2 of 9 sources (Kubernetes, VictoriaMetrics) have explicit clock advancement for time-dependent testing. The other 7 rely on `time.Sleep` with various timeout durations. Temporal's 400+ `time.Sleep` calls (`tests/versioning_test.go:798-3466`) represent accumulated engineering tradeoffs prioritizing implementation speed over test determinism. This is the primary gap in the study.

### Local Cloud-Dependency-Free Testing
Four sources (cli, PocketBase, nats-server, VictoriaMetrics) can run integration tests fully locally without Docker. Four sources (OpenFGA, Kubernetes, Milvus, Temporal) require Docker or external processes (etcd, Postgres) for integration tests. Grafana achieves local testing via SQLite default, avoiding Docker for the default case.

### Flakiness Management Formalization
Temporal has the most formal flakiness infrastructure: dedicated `flakereport` tool, `MAX_TEST_ATTEMPTS=3` retry, `test shuffle` for order detection. Kubernetes, OpenFGA, and VictoriaMetrics have moderate infrastructure (goleak, retry). cli, Grafana, Milvus, nats-server, PocketBase have informal or minimal flakiness management.

### Concurrency Testing Depth
VictoriaMetrics's `synctest` (`lib/workingsetcache/cache_synctest_test.go:59`) provides the most rigorous concurrency testing, serializing concurrent operations for deterministic execution. Kubernetes's `FakeClock` with `fakeClock.Step()` provides explicit time control. Most other sources rely on `t.Parallel()` and `-race` flag, which detect races but don't make tests deterministic.

## Tradeoffs

| Decision | Benefit | Cost | Best-Fit Context | Failure Mode | Alternative |
|----------|---------|------|-----------------|-------------|-------------|
| Real server over mocks | High fidelity, catches integration bugs | Slow startup, port conflicts, sequential execution | Protocol-level correctness, complex async sequences | Flaky due to timing, resource leaks | Interface mocks |
| Testcontainers for DBs | Production-like, reproducible | Docker required, slower startup | Multi-database compatibility testing | Container cleanup failures, resource consumption | Embedded DB, in-memory |
| Fake clock for time control | Deterministic, fast time advancement | Additional abstraction, not universally adopted | Token expiration, cache TTL, rate limit tests | Clock advances but callbacks don't fire | time.Sleep |
| Cluster pooling | Fast per-test execution, resource efficiency | Cross-test contamination risk, complex pool management | Large functional test suites | Pool exhaustion, namespace collision | Per-test cluster creation |
| NoRace tests | Tests inherently racy behavior without race false positives | No race detection on those code paths | Memory/performance under concurrent load | Missed data races | Separate race-testable rewrite |
| test.shuffle on | Detects order-dependent tests | Less reproducible local debugging | Large test suites, CI | Debugging harder when order matters | Fixed order in CI, shuffled locally |

## Decision Guide

**Should you use real servers or mocks for integration tests?**
Use real servers when: protocol correctness matters, complex async sequences, high-value tests.
Use mocks when: speed critical, external services unavailable, isolated component testing.
Hybrid approach (real for integration, mocks for unit) is most common and effective.

**Should you add a fake clock or virtual time controller?**
Yes, if: time-dependent tests (token expiration, cache TTL, rate limits) appear frequently.
No, if: tests are primarily at async completion level (most event-driven systems work fine with polling).
The gap is significant — only Kubernetes and VictoriaMetrics have this; consider adopting `testingclock.FakeClock` or `testing/synctest`.

**Should you implement testcontainers or use embedded alternatives?**
Use testcontainers if: need multi-database coverage (Postgres, MySQL, SQLite), production parity critical.
Use embedded/in-process if: speed is critical, single database, local-first developer experience.
SQLite as default (Grafana) provides best of both worlds when production also uses SQLite.

**Should you pool test clusters?**
Yes, if: functional tests take >30 seconds to boot a cluster.
No, if: tests are isolated and fast, pool management overhead exceeds per-test creation cost.
Start with shared pools, add dedicated pools only for tests with global side effects.

**Should you run tests with `-shuffle on`?**
Yes, by default in CI for catching order dependencies.
Consider `off` for local debugging of specific test ordering issues.

## Practical Tips

1. **Use polling helpers over fixed sleeps**: `checkFor`, `Eventually`, or `require.Eventually` provide bounded, interruptible waiting. Replace `time.Sleep` with polling wherever async completion is involved.

2. **Add fake clocks for time-dependent code**: Kubernetes's `testingclock.FakeClock` (`test/integration/serviceaccount/legacy_service_account_token_clean_up_test.go:119`) pattern works well. Advance time explicitly with `fakeClock.Step()`.

3. **Enable `-race` in CI**: Most sources do this, but PocketBase and some others don't. The performance cost is worth it for catching data races.

4. **Use goleak in integration tests**: Integration tests that start goroutines (servers, watchers, handlers) should verify goroutine cleanup. Kubernetes's implementation with known-ignores is exemplary.

5. **Test shuffle in CI**: `go test -shuffle on` catches order-dependent tests early. Temporal's approach of shuffling in CI but allowing fixed-seed reproduction is balanced.

6. **Consider test retries for flaky CI**: Temporal's `MAX_TEST_ATTEMPTS=3` with custom test-runner catches transient failures without developer intervention. Even simple retry logic significantly reduces noise.

7. **Use suite-based organization for integration tests**: `suite.Suite` with `SetupSuite`/`TearDownSuite` reduces per-test boilerplate for tests with common setup (cluster boot, database seed).

8. **Prefer testify require over assert**: Fail-fast behavior prevents cascade failures from eroding signal. cli uses `require` at `pkg/cmd/issue/list/list_test.go:248`.

9. **Use YAML or script-based tests for acceptance testing**: cli's testscript approach (`acceptance/acceptance_test.go:19`) produces readable, maintainable acceptance tests compared to imperative test code.

10. **Instrument test timing**: VictoriaMetrics's `*_timing_test.go` pattern catches performance regressions. Even simple benchmark comparisons catch significant regressions.

## Anti-Patterns / Caution Signs

1. **time.Sleep for async assertions**: 400+ instances in Temporal is a liability. Replace with `require.Eventually` or fake clock advancement.

2. **No race detection in CI**: PocketBase doesn't show `-race` in CI. Data races are subtle and devastating in production.

3. **Integration tests requiring cloud credentials**: cli's acceptance tests require `GH_ACCEPTANCE_TOKEN` environment variables. This prevents local reproducibility.

4. **No goroutine leak detection in integration tests**: Sources that start goroutine-based servers without verifying cleanup will accumulate leaked goroutines over test runs.

5. **Sequential test execution without parallelization**: PocketBase runs `go test ./...` without `-parallel`. This wastes CI resources as test count grows.

6. **No test categorization enforcement**: milvus has no formal naming/tagging convention to distinguish unit vs integration vs e2e beyond directory structure. This can lead to accidental integration test dependencies in unit test contexts.

7. **SQLite-only integration testing**: PocketBase only tests with SQLite, but production uses PostgreSQL/MySQL. Dialect-specific bugs won't be caught locally.

8. **No flakiness tracking**: Most sources lack flakiness dashboards or reporting. Temporal's `flakereport` tool is the exception. Without tracking, flakiness erodes trust silently.

9. **Pre-built binary requirement for integration tests**: VictoriaMetrics's `apptest` requires binaries pre-built via `make all`. This breaks the `go test ./apptest/...` workflow.

10. **No time mocking leading to 100+ second sleeps**: Temporal's `tests/versioning_test.go:800` has `time.Sleep(100 * time.Second)` for timer tests. This is an extreme example of the time-sleep anti-pattern.

## Notable Absences

1. **Fuzz testing**: Only nats-server has dedicated fuzz tests (`server/server_fuzz_test.go`, `server/parser_fuzz_test.go`). No other source implements property-based or fuzz testing.

2. **Contract testing**: No source demonstrates Pact or similar contract testing between services. Integration is tested holistically rather than at interface boundaries.

3. **Chaos engineering**: No source has fault injection frameworks (Chaos Monkey, etc.) for testing resilience. Only Temporal has `functional-with-fault-injection-test` target.

4. **Virtual clock adoption**: Only 2 of 9 sources (Kubernetes, VictoriaMetrics) have explicit clock advancement mechanisms despite `time.Sleep` being a known source of flakiness.

5. **Formal test documentation**: No source has a `TESTING.md` or equivalent documenting testing philosophy, running tests, or adding new tests. CONTRIBUTING.md files don't cover testing workflow.

6. **Test coverage enforcement**: Only a few sources enforce coverage thresholds. Most run coverage but don't gate on it.

7. **Benchmark CI**: Only OpenFGA shows benchmark comparison against main branch on PRs. Performance regression detection is rare.

## Per-Source Notes

### cli
HTTP mocking infrastructure (`pkg/httpmock`) is the standout strength. Stub verification via `defer reg.Verify(t)` (`pkg/cmd/issue/list/list_test.go:74`) is excellent practice. `Now` function injection for time control (`list_test.go:47-52`) is a lightweight alternative to fake clocks. Gap: acceptance tests require live GitHub credentials, limiting local reproducibility.

### grafana
SQLite default for integration tests (`pkg/tests/testinfra/testinfra.go:128`) is exemplary — local testing without Docker. TZ-enforced consistency (`jest.config.js:4`) prevents timezone-dependent bugs. 16-way frontend test sharding and 8-way backend sharding demonstrate mature CI infrastructure. Gap: no fake clock, jsdom mocking overhead.

### kubernetes
`testingclock.FakeClock` (`test/integration/serviceaccount/legacy_service_account_token_clean_up_test.go:119`) is best-in-class for time control. `goleak` integration with known ignores (`test/integration/framework/goleak.go:43-72`) is the right model for goroutine leak detection. CI is Prow-based and invisible in the repo, limiting assessment. Fake implementations (fake runtime, fake DNS, fake kubelet) are comprehensive.

### milvus
MiniCluster approach (`tests/integration/cluster/cluster.go:108`) provides fast in-process integration testing. Auto-generated mocks via `mockery` are thorough. Test option patterns (`WithDropAllCollectionsWhenTestTearDown`) provide flexibility. Gap: TSO tests require real etcd at `localhost:2379`, time.Sleep used for timing, no virtual clock.

### nats-server
Real server testing without mocks provides highest fidelity. `checkFor` polling pattern used 1074+ times demonstrates mature async testing. NoRace tests for race-immune testing is well-designed. `slowProxy` for network simulation (`test/test_test.go:47-126`) is innovative. Gap: NoRace tests skip `-race` flag, sequential `-p=1` execution per job.

### openfga
Testcontainers for database integration testing is well-implemented (`pkg/testfixtures/storage/postgres.go:111`). YAML matrix tests (`tests/check/check.go:64-85`) enable comprehensive scenario coverage. errgroup for concurrent iterator testing (`pkg/storage/memory/memory_test.go:93`) is correct. Gap: no time mocking, Docker required for integration tests.

### pocketbase
`TestApp` wrapper and `ApiScenario` provide excellent testing infrastructure for API testing. Cloned temp directories (`TempDirClone` at `tests/app.go:816`) provide good isolation. Event call tracking (`EventCalls` at `tests/app.go:24`) is useful for async hook verification. Gap: no `-race` in CI, no test parallelization, time.Sleep for async.

### temporal
Cluster pooling (`tests/testcore/test_cluster_pool.go:54`) is the most sophisticated test resource management in the study. Flakereport tool and `MAX_TEST_ATTEMPTS=3` demonstrate mature flakiness handling. Test shuffle by default is correct. Gap: 400+ `time.Sleep` calls undermine determinism, no virtual clock.

### victoriametrics
`testing/synctest` (`lib/workingsetcache/cache_synctest_test.go:59`) provides the most rigorous concurrency testing in the study. `apptest` process-based integration testing is high-fidelity. Retry-based `Assert` (`apptest/testcase.go:419`) handles eventual consistency well. Gap: integration tests require pre-built binaries, long cache expiration sleeps.

## Open Questions

1. **Why is fake clock adoption so low?** Only 2 of 9 sources have explicit clock advancement for time-dependent testing, despite `time.Sleep` being a known source of flakiness. Is this a knowledge gap, a perceived overhead, or a deliberate tradeoff?

2. **Should testcontainers be the default for database integration?** OpenFGA, Kubernetes, and Milvus use Docker containers; Grafana and PocketBase use embedded or in-process alternatives. Which approach provides better balance of fidelity, speed, and developer experience?

3. **How should projects balance real-server vs mock-heavy integration testing?** nats-server and VictoriaMetrics avoid mocking entirely; OpenFGA and Kubernetes use extensive mocks. What are the decision rules for choosing between these approaches?

4. **Is cluster pooling worth the complexity?** Temporal's cluster pool is sophisticated but complex. VictoriaMetrics's simpler `TestCase` reuse pattern may be sufficient for smaller projects. What is the right threshold for investing in cluster pooling?

5. **How should flaky test tracking be implemented?** Only Temporal has a dedicated flakereport tool. Should this be a standard part of CI infrastructure for any project with >100 integration tests?

6. **What is the right balance between test shuffle and reproducibility?** Temporal shuffles by default but allows seed-based reproduction. Is this the right default, or should shuffle be opt-in?

## Evidence Index

Every evidence reference uses format `path/to/file.ts:NN` from the source repository.

### cli
- `pkg/cmd/issue/list/list_test.go:47-52` — Now function injection for time control
- `pkg/httpmock/registry.go:18-30` — HTTP mock registry
- `pkg/httpmock/registry.go:60-79` — Verify(t) for stub verification
- `acceptance/acceptance_test.go:19` — testscript entry point
- `.github/workflows/go.yml:32` — race detection in CI

### grafana
- `jest.config.js:4` — TZ='Pacific/Easter' for consistency
- `pkg/tests/testinfra/testinfra.go:75` — StartGrafanaEnvWithDB
- `pkg/tests/testinfra/testinfra.go:128` — sqlutil.GetTestDB (SQLite default)
- `.github/workflows/backend-unit-tests.yml:45-48` — 8 shard parallelization
- `public/test/setupTests.ts:17-23` — jest-fail-on-console

### kubernetes
- `test/integration/serviceaccount/legacy_service_account_token_clean_up_test.go:119` — FakeClock usage
- `test/integration/framework/goleak.go:43-72` — goleak integration with known ignores
- `test/integration/framework/etcd.go:61-81` — etcd spawning for integration tests
- `hack/make-rules/test.sh:87` — KUBE_RACE="-race"
- `test/utils/ktesting/tcontext.go:89-95` — context-aware testing

### milvus
- `tests/integration/cluster/cluster.go:108-142` — MiniClusterV3 struct
- `tests/integration/suite.go:43-50` — MiniClusterSuite base
- `internal/.mockery.yaml:1-122` — mock generation config
- `tests/integration/util_query.go:138` — Eventually helper
- `scripts/run_go_unittest.sh:63` — -failfast usage

### nats-server
- `server/server_test.go:57-64` — checkFor polling helper
- `server/server_test.go:80-108` — RunServer() helper
- `server/norace_1_test.go:14-58` — NoRace test build tags
- `test/test_test.go:47-126` — slowProxy for network simulation
- `.github/workflows/tests.yaml:12` — RACE env var conditional

### openfga
- `pkg/testfixtures/storage/postgres.go:111` — RunDatastoreTestContainer
- `tests/check/check_test.go:33` — goleak.VerifyNone
- `pkg/storage/memory/memory_test.go:93` — errgroup concurrent testing
- `tests/check/check.go:64-85` — YAML matrix test embedding
- `.github/workflows/pull_request.yaml:27-143` — test job parallelization

### pocketbase
- `tests/app.go:18-29` — TestApp wrapper
- `tests/api.go:21-95` — ApiScenario struct
- `tests/app.go:816-828` — TempDirClone for isolation
- `tests/app.go:24-26` — EventCalls tracking
- `.github/workflows/release.yaml:46-47` — go test ./... in CI

### temporal
- `tests/testcore/test_cluster_pool.go:54-82` — cluster pool architecture
- `tests/testcore/test_env.go:505-510` — hash-based test sharding
- `tools/flakereport/flakereport.go:26-114` — flakereport tool
- `Makefile:62` — MAX_TEST_ATTEMPTS=3
- `tests/update_workflow_utils.go:104` — require.Eventually usage

### victoriametrics
- `lib/workingsetcache/cache_synctest_test.go:59` — synctest.Wait usage
- `lib/workingsetcache/cache_synctest_test.go:1` — //go:build synctest
- `apptest/testcase.go:81-156` — MustStartVmsingle
- `apptest/testcase.go:419-456` — Assert with retry
- `Makefile:458` — test-race target with -race

---

Generated by dimension `14-testing-strategy-reliability.md`.