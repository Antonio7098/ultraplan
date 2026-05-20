# Source Analysis: pocketbase

## Testing Strategy & Reliability Engineering

### Source Info

| Field | Value |
|-------|-------|
| Name | pocketbase |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/pocketbase` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

PocketBase employs a comprehensive testing strategy centered on a dedicated `tests` package that provides test fixtures, mock implementations, and a scenario-based API testing framework. The project uses SQLite for all testing (no external DB dependencies), enabling local integration testing. The `TestApp` wrapper provides full app bootstrapping with cloned test data, event call tracking, and a mock mailer. API tests use the `ApiScenario` struct for declarative HTTP testing. Concurrent/async code is tested using explicit delays, goroutine synchronization with `sync.WaitGroup`, and event verification. The CI pipeline runs `go test ./...` without visible parallelization or flaky test retry logic.

## Rating

**7/10** — Good implementation with minor issues. The testing infrastructure is well-designed with `TestApp`, `ApiScenario`, and mock utilities. However, there is no visible flaky test mitigation, no test parallelization configuration, and deterministic testing of concurrent code relies on `time.Sleep` and `sync.WaitGroup` rather than more sophisticated approaches.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Test directory structure | Tests colocated with source as `*_test.go` files; `tests/` package for shared utilities | `tests/app.go:1` |
| TestApp wrapper | `TestApp` struct wraps `core.BaseApp`, provides `Cleanup()`, `ResetEventCalls()` | `tests/app.go:18-29` |
| TestMailer mock | `TestMailer` implements `mailer.Mailer` interface, captures messages in memory | `tests/mailer.go:10-25` |
| API testing framework | `ApiScenario` struct defines HTTP test scenarios with expectations | `tests/api.go:21-95` |
| ApiScenario.Test() | Main test execution loop with request/response verification | `tests/api.go:121-125` |
| Temp dir cloning | `TempDirClone()` creates isolated test data directory copies | `tests/app.go:816-828` |
| Event call tracking | `TestApp.EventCalls` map tracks hook event invocations | `tests/app.go:24-26` |
| Deterministic async | `Delay` field in ApiScenario allows waiting for goroutines | `tests/api.go:43-44` |
| Concurrent testing | `sync.WaitGroup` pattern for goroutine synchronization | `apis/realtime_test.go:999-1052` |
| Time-dependent testing | Explicit `time.Sleep()` with documented ms delays for rate limit tests | `apis/middlewares_rate_limit_test.go:88-95` |
| Test data fixtures | Pre-populated SQLite databases in `tests/data/` | `tests/data/data.db` |
| CI pipeline | GitHub Actions runs `go test ./...` | `.github/workflows/release.yaml:46-47` |

## Answers to Dimension Questions

### 1. How does the project test async, concurrent, or time-dependent code deterministically?

**Evidence**: The project uses multiple strategies:

- **`Delay` field in `ApiScenario`**: Allows tests to wait for goroutines to complete before assertions (`tests/api.go:43-44` and `tests/api.go:252-254`)
- **`sync.WaitGroup` for goroutine synchronization**: In `apis/realtime_test.go:999-1052`, realtime tests wait for goroutines to complete before verifying results
- **Event call tracking**: `TestApp.EventCalls` map allows verifying that async hooks were called the expected number of times (`tests/app.go:24-26`)
- **Explicit sleep times for rate limiting**: Rate limit tests use precise `time.Sleep()` durations to test sliding/ffixed window algorithms (`apis/middlewares_rate_limit_test.go:88-95`, line 150)

**Limitations**: Time-dependent tests rely on `time.Sleep()` rather than mock clocks, which can introduce flakiness.

### 2. What is the balance between unit, integration, and e2e tests?

**Evidence**:

- **Unit tests**: Found throughout as `*_test.go` files (e.g., `tools/subscriptions/broker_test.go`, `tools/mailer/mailer_test.go`)
- **Integration tests**: `TestApp` bootstraps full application with real SQLite database (`tests/app.go:74-108`)
- **API tests**: `ApiScenario` provides HTTP-level integration testing (`tests/api.go`)

**Observations**:
- Most tests are at the API/integration level (see `apis/` directory with ~90 test files)
- The `tests/data/` directory contains pre-populated SQLite databases for integration testing
- Tests mix unit-level verification (e.g., `broker_test.go`) with full app bootstrapping

### 3. How are external dependencies (DBs, APIs, queues) mocked or replaced in tests?

**Evidence**:

- **Database**: Uses SQLite exclusively; no external DB mocking. Tests clone pre-populated `tests/data/` directory (`tests/app.go:101`)
- **Mailer**: `TestMailer` mock captures emails in memory instead of sending (`tests/mailer.go:13-81`)
- **Subscriptions**: Uses real `subscriptions.Client` with in-memory broker for testing
- **S3/filesystem**: `forms/test_s3_filesystem_test.go` likely tests S3 form upload

**Key pattern** (`tests/app.go:500-510`):
```go
t.OnMailerSend().Bind(&hook.Handler[*core.MailerEvent]{
    Func: func(e *core.MailerEvent) error {
        if t.TestMailer == nil {
            t.TestMailer = &TestMailer{}
        }
        e.Mailer = t.TestMailer
        t.registerEventCall("OnMailerSend")
        return e.Next()
    },
    Priority: -99999,
})
```

### 4. How does the project prevent flaky tests from eroding trust?

**Evidence**: **No visible flaky test mitigation strategy found.**

- No test retry logic
- No random seed control for deterministic test ordering
- No visible test timeout configuration beyond Go's default
- CI runs with default `go test ./...` without parallelization (`golangci.yml:3` shows lint concurrency, not test)

**Observations**:
- The `golangci.yml` configures `concurrency: 4` for linting but tests run sequentially
- Go's `-race` flag is not visible in CI, though it could be added separately
- Flaky tests could erode trust over time without retry or quarantine mechanisms

### 5. Can integration tests run locally without cloud dependencies?

**Evidence**: **Yes, fully local.**

- Uses SQLite databases in `tests/data/` (pre-populated `data.db`, `auxiliary.db`)
- No Docker containers, no external services
- `TempDirClone()` creates isolated copies for each test (`tests/app.go:816-828`)
- Makefile target: `make test` runs `go test ./... -v --cover`

## Architectural Decisions

1. **Single `tests` package for shared utilities**: All test helpers live in `tests/` package rather than being scattered, providing consistency (`tests/app.go:1`)

2. **SQLite-only testing with pre-populated data**: The decision to use SQLite and clone a pre-configured test data directory allows fast, reproducible integration tests without external dependencies (`tests/data/`)

3. **`TestApp` wrapper with event tracking**: The `TestApp` wraps `core.BaseApp` and tracks all hook event calls, enabling verification of event ordering and frequency (`tests/app.go:24-26`)

4. **`ApiScenario` for declarative API testing**: Instead of ad-hoc HTTP test functions, `ApiScenario` provides a structured way to define test cases with expected status, content, and events (`tests/api.go:21-95`)

5. **Hook-based mock injection**: External dependencies (mailer) are replaced via the hook system rather than interface injection, maintaining the production code path (`tests/app.go:500-510`)

## Notable Patterns

1. **Scenario-based API tests**: `ApiScenario` struct allows defining multiple test cases per endpoint with different inputs, expectations, and before/after hooks (`apis/record_auth_with_password_test.go:42-763`)

2. **Event call verification**: Tests verify correct event firing order and count using `ExpectedEvents` map (`tests/api.go:78-87`)

3. **Test data isolation via directory cloning**: Each `TestApp` gets its own temp directory copy of the test database, ensuring complete isolation (`tests/app.go:101-107`)

4. **Concurrent realtime testing with WaitGroup**: Realtime subscription tests use `sync.WaitGroup` to wait for goroutines before assertions (`apis/realtime_test.go:999-1052`)

5. **Mock multipart data helper**: `MockMultipartData()` creates test file uploads without real files (`tests/request.go:20-62`)

## Tradeoffs

1. **SQLite-only testing**: While enabling local testing without cloud dependencies, this means the project doesn't test against the actual production database backend (PostgreSQL, MySQL, etc.)

2. **No test parallelization**: Running tests sequentially via `go test ./...` may become slow as the codebase grows. The `golangci.yml` shows `concurrency: 4` for linting but not for tests

3. **Hook-based mocking limits unit testing**: Replacing the mailer via hooks means tests must go through the full app bootstrap to use the mock, reducing true unit test isolation

4. **Time.Sleep for deterministic async testing**: Using `time.Sleep()` for waiting on goroutines is simple but can be flaky on slow systems or under load

## Failure Modes / Edge Cases

1. **Database state leakage between tests**: While `TempDirClone` provides isolation, tests within the same `TestApp` instance share state unless proper cleanup occurs

2. **Race conditions in concurrent tests**: Realtime tests use channel-based communication with explicit delays; under load, the 250ms timeout (`apis/realtime_test.go:1021`) could be insufficient

3. **Pre-populated test data brittleness**: Tests depend on specific data in `tests/data/`; schema changes require updating the fixture files

4. **Event call tracking with async goroutines**: The `Delay` field helps but `time.Sleep()` doesn't guarantee all goroutines complete, especially under CI load

## Future Considerations

1. **Add test parallelization**: Configure `go test ./... -parallel` to speed up test execution as the codebase grows

2. **Introduce mock clock for time-dependent tests**: Replace `time.Sleep()` with a controlled clock interface for deterministic time-based testing

3. **Add race detector to CI**: Include `-race` flag in test runs to catch data races before they reach production

4. **Consider test retry for flaky tests**: Add retry logic for known flaky tests (e.g., realtime tests with goroutine timing)

5. **Document test data schema**: Add comments or a schema file explaining the pre-populated test data for maintainability

## Questions / Gaps

1. **No evidence of test coverage goals**: The project runs `go test ./... -v --cover` but no coverage threshold is enforced

2. **No visible benchmark CI**: While `ApiScenario.Benchmark()` exists (`tests/api.go:127-157`), no evidence of regular benchmark comparisons

3. **No visible test documentation**: No `TESTING.md` or similar documenting testing philosophy, running tests, or adding new tests

4. **No evidence of integration with external test services**: No Sentry for test failure tracking, no Codecov integration visible

5. **Limited visibility into CI test output**: CI runs `go test ./...` but no artifact upload or detailed failure reporting visible

---

Generated by `14-testing-strategy-reliability.md` against `pocketbase`.
