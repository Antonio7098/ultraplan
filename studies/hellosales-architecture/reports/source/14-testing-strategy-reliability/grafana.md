# Source Analysis: grafana

## Testing Strategy & Reliability Engineering

### Source Info

| Field | Value |
|-------|-------|
| Name | grafana |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/grafana` |
| Language / Stack | Go (backend), TypeScript/React (frontend), Playwright (e2e) |
| Analyzed | 2026-05-20 |

## Summary

Grafana employs a comprehensive multi-layered testing strategy spanning unit tests, integration tests, and end-to-end tests. The backend uses Go's native testing package with `go test`, sharded across 8 parallel jobs in CI. The frontend uses Jest with jsdom, sharded across 16 parallel jobs. E2E testing uses Playwright with extensive project configurations. Integration tests start a full Grafana server via `testinfra.StartGrafana()`, using SQLite by default with optional Postgres/MySQL support via `devenv`. Mocking is achieved through interface-based fakes and `stretchr/testify/mock`.

## Rating

**8/10** — Excellent implementation with minor issues. Grafana demonstrates mature testing infrastructure with strong CI integration, sharding, and deterministic testing patterns. Some external dependencies (Postgres, MySQL) require `devenv` to run locally, and async/time-dependent code testing relies on `t.Parallel()` without a dedicated concurrency testing framework.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Jest config | `testEnvironment: jsdom`, `TZ = 'Pacific/Easter'`, 30s timeout, `jest-setup.ts` and `setupTests.ts` | `jest.config.js:4,42,55-56,58` |
| Frontend unit test execution | `yarn test:ci` runs jest with sharding and JUnit reporter | `package.json:42` |
| Playwright e2e config | `fullyParallel: true`, `retries: CI ? 1 : 0`, 30+ project configs | `playwright.config.ts:24-26,64-211` |
| Backend test sharding | 8 shards via `SHARD` env var, `SHARDS` env var for parallelization | `.github/workflows/backend-unit-tests.yml:45-48,78-81` |
| Frontend test sharding | 16 shards via `TEST_SHARD`/`TEST_SHARD_TOTAL` env vars | `.github/workflows/pr-frontend-unit-tests.yml:79,114` |
| Integration test harness | `StartGrafanaEnvWithDB()` spins up full server with test DB | `pkg/tests/testinfra/testinfra.go:75` |
| Test DB setup | SQLite default, `sqlutil.GetTestDB()` for Postgres/MySQL via `GRAFANA_TEST_DB` | `pkg/tests/testinfra/testinfra.go:128` |
| FakeDB for unit tests | `FakeDB` struct implementing `db.DB` interface for mocking | `pkg/infra/db/dbtest/dbtest.go:15-66` |
| Test utility interface | `testutil.T` interface for testing.T abstraction | `pkg/util/testutil/testutil.go:16-22` |
| Integration test skip | `SkipIntegrationTestInShortMode()` validates `TestIntegration` prefix | `pkg/util/testutil/testutil.go:36-43` |
| Concurrent tests | `t.Parallel()` used in scheduler, ring, queue, xorm tests | `pkg/util/scheduler/scheduler_test.go:17,20` |
| Concurrent integration tests | Concurrent repo creation stress test with error tracking | `pkg/tests/apis/provisioning/repository/repository_test.go:2582-2683` |
| Test infra DB init | `db.InitTestDB()` and `db.InitTestDBWithCfg()` | `pkg/infra/db/db.go:58-64` |
| Mock framework (Go) | `stretchr/testify/mock` used throughout | Multiple `_test.go` files |
| Jest global mocks | Mocks for workers, images, styles, datasource_srv, navModel, etc. | `public/test/mocks/*.ts` |
| Fail-on-console | `jest-fail-on-console` configured in CI or when `frontend_dev_fail_tests_on_console` set | `public/test/setupTests.ts:17-23` |
| Mocked APIs | Mocked `DashboardAPIVersionResolver`, `folder/v1beta1` API version | `public/test/setupTests.ts:36-47` |
| ResizeObserver mock | Custom mock with callback-based observation | `public/test/jest-setup.ts:81-128` |
| MessageChannel mock | Custom implementation avoiding open handles | `public/test/jest-setup.ts:133-149` |
| Decoupled plugin tests | Separate CI job for plugin workspace tests | `.github/workflows/pr-frontend-unit-tests.yml:144-160` |

## Answers to Dimension Questions

### 1. How does the project test async, concurrent, or time-dependent code deterministically?

**Go backend**: The project uses `t.Parallel()` extensively in unit tests (739 matches across `*_test.go` files). Concurrent code is tested with dedicated concurrent test cases — e.g., `pkg/tests/apis/provisioning/repository/repository_test.go:2570-2683` creates multiple repositories concurrently and verifies no deadlocks occur. Time-dependent code relies on standard Go testing patterns; there's no evidence of a dedicated time-faking mechanism like a virtual clock.

**Frontend**: Jest's `jest.useFakeTimers()` is available but evidence of its usage for deterministic testing of time-dependent code was not directly found in the sampled tests. The test setup mocks `window.performance` methods (`public/test/setupTests.ts:71-109`) and provides a `ResizeObserver` mock that immediately invokes callbacks synchronously (`public/test/jest-setup.ts:106-118`), which aids deterministic behavior.

### 2. What is the balance between unit, integration, and e2e tests?

- **Unit tests**: Extensive — thousands of `*_test.ts` files for frontend, thousands of `*_test.go` files for backend. Frontend uses Jest (jsdom environment); backend uses standard Go testing.
- **Integration tests**: `TestIntegration*` prefixed tests in Go that start a full Grafana instance via `pkg/tests/testinfra/testinfra.go`. These are run with `make test-go-integration` and in the `pr-test-integration.yml` workflow (sharded across SQLite, Postgres, MySQL).
- **E2E tests**: Playwright-based, located in `e2e-playwright/` with 30+ project configurations (`playwright.config.ts:64-211`). Run in `pr-e2e-tests.yml` workflow.

The project has strong coverage at all three layers, with CI sharding across 8 backend shards and 16 frontend shards.

### 3. How are external dependencies (DBs, APIs, queues) mocked or replaced in tests?

- **Database**: `pkg/infra/db/dbtest/dbtest.go:15` provides `FakeDB` — a struct with `ExpectedError` field that implements the `db.DB` interface for unit testing. For integration tests, `db.InitTestDB()` creates an SQLite store by default. `sqlutil.GetTestDB(sqlutil.GetTestDBType())` selects the DB type based on `GRAFANA_TEST_DB` env var (`pkg/tests/testinfra/testinfra.go:128`).
- **External APIs**: Frontend mocks via `jest.mock()` in individual test files. Pre-mocked modules include `workers.ts`, `images.ts`, `style.ts`, `nearMembraneDom.ts`, `datasource_srv.ts`, `navModel.ts`, `assistant.ts`, and `augurs.ts` in `public/test/mocks/`.
- **Go mocks**: Interface-based approach using `stretchr/testify/mock`. Generated mocks via `//go:generate mockery` (e.g., `pkg/util/testutil/mocks/T.go:1`).

### 4. How does the project prevent flaky tests from eroding trust?

- **Flakiness prevention**:
  - E2E Playwright tests retry once on CI (`retries: process.env.CI ? 1 : 0` in `playwright.config.ts:26`).
  - Frontend tests fail on console errors in CI via `jest-fail-on-console` (`public/test/setupTests.ts:17-23`).
  - `fail-fast: false` on CI shard matrices ensures one shard failure doesn't cancel other shards.
  - Backend unit tests use `-short` flag to skip long-running tests in quick runs.
  - `continue-on-error: true` on fork PR tests allows enterprise tests to run even if OSS fails.
- **No dedicated flaky test tracking mechanism** was found in the codebase.

### 5. Can integration tests run locally without cloud dependencies?

**Mostly yes** — SQLite is used by default for local integration tests. The test harness in `pkg/tests/testinfra/testinfra.go:128` uses `sqlutil.GetTestDB()` which defaults to SQLite (`db.IsTestDbSQLite()`). This means `make test-go-integration` runs without external services.

However, Postgres and MySQL integration tests require `devenv` to be running with `postgres_tests` or `mysql_tests` docker blocks. The Makefile targets `devenv-postgres` and `devenv-mysql` must be started first (`Makefile:589-598`). Database-specific tests like `pkg/tsdb/mysql/mysql_test.go:26` explicitly document: "Use the docker/blocks/mysql_tests/docker-compose.yaml to spin up a..." — confirming cloud dependencies are needed for those specific tests.

## Architectural Decisions

1. **SQLite as default test DB**: The `testinfra.StartGrafanaEnv()` uses SQLite unless `GRAFANA_TEST_DB` is set, enabling local integration tests without docker.
2. **Embedded test server**: Integration tests start a full Grafana server via `server.InitializeForTest()` rather than mocking HTTP layers, providing high-fidelity testing.
3. **TZ-enforced timezone**: Jest config sets `TZ = 'Pacific/Easter'` consistently across all tests to prevent timezone-dependent behavior from masking bugs (`jest.config.js:4`).
4. **Interface-based fakes**: Go uses `FakeDB` implementing `db.DB` interface rather than heavy mocking, enabling targeted error injection.
5. **Sharded CI for parallelism**: Backend (8 shards) and frontend (16 shards) tests run in parallel, reducing total CI time.
6. **E2E authentication via cookie**: Playwright auth uses stored `admin.json` cookies (`playwright.config.ts:17`) rather than logging in per test, speeding up test execution.

## Notable Patterns

1. **Test isolation via `jest.isolateModulesAsync()`** (`public/test/jest-setup.ts:9`) — modules are isolated per test to prevent state leakage.
2. **Global test setup files** (`jest-setup.ts`, `setupTests.ts`) provide consistent mocks across all frontend tests.
3. **Generated mocks** via `//go:generate mockery` (`pkg/util/testutil/testutil.go:13`) for type-safe mock generation.
4. **Codeowners-based test coverage** (`scripts/test-coverage-by-codeowner.js`) tracks test coverage by code ownership areas.
5. **Testinfra options pattern** (`GrafanaOpts` struct in `pkg/tests/testinfra/testinfra.go:939-1020`) provides 50+ configuration options for fine-tuning test server behavior.
6. **`t.Parallel()` everywhere** — Go tests use subtest parallelism extensively for speed.

## Tradeoffs

1. **SQLite default vs production Postgres**: Integration tests run on SQLite but production uses Postgres. Edge cases in dialect-specific SQL (e.g., `pkg/tsdb/mysql/mysql_test.go` or `pkg/tsdb/grafana-postgresql-datasource/postgres_test.go`) require actual Postgres, which must be provisioned via `devenv`.
2. **jsdom limitations**: Frontend tests run in jsdom, which doesn't fully simulate browser environments. Workers, `ResizeObserver`, `MessageChannel`, and other browser APIs are manually mocked — this is maintenance overhead and can diverge from real behavior.
3. **E2E test maintenance**: 30+ Playwright project configurations in `playwright.config.ts` create significant configuration surface area and potential for test fragility.
4. **Decoupled plugin test isolation**: Plugins are tested separately (`yarn plugin:test:ci`) but share the same `node_modules`, which can cause dependency conflicts.

## Failure Modes / Edge Cases

1. **Timezone-dependent tests**: If a developer runs tests in a different timezone than `Pacific/Easter`, timezone-dependent code may behave differently — though setting `TZ` enforces consistency.
2. **Concurrent test race conditions**: While `t.Parallel()` is used extensively, concurrent writes to shared resources in integration tests (e.g., concurrent repo creation) could still produce non-deterministic results if synchronization primitives fail.
3. **ResourceVersion conflicts**: Integration tests with concurrent updates rely on k8s-style `resourceVersion` optimistic locking (`pkg/tests/apis/provisioning/repository/pending_delete_test.go:169`). Stale reads can cause test flakiness.
4. **Open handles in Jest**: The original `MessageChannel` implementation caused open handles (`public/test/jest-setup.ts:132`), requiring a custom Proxy-based solution.
5. **DB connection limits**: `testinfra` sets `max_open_conn: 2` (`pkg/tests/testinfra/testinfra.go:910`) — low for high-concurrency scenarios, intentionally to catch connection leaks.

## Future Considerations

1. **Virtual time for async testing**: Consider adding a virtual clock mechanism (like `sinon.useFakeTimers()`) for frontend time-dependent tests to ensure deterministic behavior regardless of actual elapsed time.
2. **Dedicated concurrency testing framework**: While `t.Parallel()` is used, a structured concurrency testing library (like `tempmock` or Go's `go test -race`) could provide better guarantees for concurrent code correctness.
3. **Flaky test tracking**: Implementing a mechanism to detect and track flaky tests over time would help maintain confidence in the test suite.
4. **Expanded msw usage**: Currently frontend tests use `jest.mock()` heavily. Adopting MSW (Mock Service Worker) more broadly could provide more realistic API mocking.
5. **Test containerization**: Moving more integration tests to use testcontainers (instead of requiring `devenv`) would improve local developer experience and CI consistency.

## Questions / Gaps

1. **No evidence found** of a formal time-faking mechanism for deterministic testing of time-dependent frontend code (e.g., `setTimeout`, `Date.now` faking). The project relies on jsdom mocks and `jest.useFakeTimers()` implicitly.
2. **No evidence found** of a dedicated concurrency testing library or framework for Go beyond `t.Parallel()`.
3. **Flaky test tracking** mechanism was not found — no evidence of dashboards, reports, or tooling to monitor flaky test rates over time.
4. **Testcontainer usage** — while `devenv/docker/blocks/` exists with docker-compose files, the actual tests reference these manually rather than using `testcontainers-go`.
5. **Frontend e2e isolation** — Playwright tests share the same Grafana server state; whether tests are properly isolated from each other depends on test author discipline rather than enforced cleanup.

---

Generated by `dimensions/14-testing-strategy-reliability.md` against `grafana`.