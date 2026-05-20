# Source Analysis: cli

## Testing Strategy & Reliability Engineering

### Source Info

| Field | Value |
|-------|-------|
| Name | cli |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/cli` |
| Language / Stack | Go (GitHub CLI) |
| Analyzed | 2026-05-20 |

## Summary

The GitHub CLI (`gh`) implements a multi-layered testing strategy with unit tests, integration tests, and acceptance tests using `testscript`. HTTP mocking is provided via a custom `pkg/httpmock` package with stub registration and verification. Time-dependent code uses a `Now` function dependency pattern for testability. The CI pipeline runs unit/integration tests with the `-race` flag across Ubuntu, Windows, and macOS. Acceptance tests use real GitHub API calls and require environment variables, making local execution impractical without cloud credentials.

## Rating

**7** — Good implementation with minor issues. The project has solid HTTP mocking infrastructure, deterministic time handling via dependency injection, and comprehensive test coverage across unit/integration/acceptance layers. However, acceptance tests require live GitHub credentials and cannot run locally without cloud dependencies. Concurrent testing relies on `time.Sleep` in some places rather than explicit synchronization primitives.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Test directory structure | Tests colocated with implementation using `_test.go` suffix | `pkg/cmd/issue/list/list_test.go:1` |
| Test naming convention | Table-driven tests with descriptive names | `pkg/cmd/issue/list/list_test.go:73` |
| HTTP mock registry | `Registry` struct with `Register`, `Verify`, and request tracking | `pkg/httpmock/registry.go:18-30` |
| HTTP stub matchers | REST, GraphQL, QueryMatcher matchers | `pkg/httpmock/stub.go:35-107` |
| HTTP responders | JSONResponse, FileResponse, StringResponse helpers | `pkg/httpmock/stub.go:124-199` |
| IOStreams test harness | `iostreams.Test()` for TTY simulation | `pkg/cmd/issue/list/list_test.go:29` |
| Time dependency injection | `Now` field of type `func() time.Time` in options structs | `pkg/cmd/issue/list/list_test.go:47-52` |
| Test data fixtures | JSON fixtures in `fixtures/` directories per command | `pkg/cmd/issue/list/fixtures/issueList.json:1` |
| Acceptance tests | testscript-based end-to-end tests | `acceptance/acceptance_test.go:26-30` |
| Integration tests | Shell scripts calling built binary | `test/integration/attestation-cmd/run-all-tests.sh:1-30` |
| CI pipeline | Matrix across 3 OSes with race detection | `.github/workflows/go.yml:13-32` |
| Concurrent testing | `sync.WaitGroup` for goroutine convergence | `internal/telemetry/telemetry_test.go:131-153` |
| Command stubbing | `run.Stub()` for CLI command interception | `pkg/cmd/issue/list/list_test.go:224-225` |

## Answers to Dimension Questions

### 1. How does the project test async, concurrent, or time-dependent code deterministically?

**Time-dependent code**: The project uses a `Now` function dependency injected via options structs. For example, `pkg/cmd/issue/list/list.go:53` defines `Now: time.Now` as a default, and tests override it with `fakeNow := func() time.Time { return time.Date(2022, time.August, 25, 23, 50, 0, 0, time.UTC) }` (`pkg/cmd/issue/list/list_test.go:47-52`).

**Concurrent code**: The `internal/telemetry/telemetry_test.go:131-153` demonstrates explicit concurrent testing using `sync.WaitGroup` to verify that 10 goroutines converge on the same device ID. This is deterministic and race-free.

**Async patterns**: Some tests use `time.Sleep` for synchronization (e.g., `pkg/cmd/root/extension_test.go:129` and `acceptance/acceptance_test.go:366`). This is less deterministic than explicit synchronization but common in the codebase.

### 2. What is the balance between unit, integration, and e2e tests?

- **Unit tests**: Colocated `_test.go` files throughout `pkg/cmd/` and `api/`, `internal/` directories. Standard Go testing with `testing.T`.
- **Integration tests**: Located in `test/integration/` as shell scripts that execute the built binary against real services (attestation command tests). These run in CI but are distinct from unit tests.
- **Acceptance tests**: Located in `acceptance/` using `go-internal/testscript` (`acceptance/acceptance_test.go:19`). These are e2e tests written as `.txtar` scripts that test the full CLI against a real GitHub environment.

The majority of tests are unit tests with HTTP mocking. Integration and acceptance tests are fewer but cover specific end-to-end flows.

### 3. How are external dependencies (DBs, APIs, queues) mocked or replaced in tests?

**HTTP mocking**: The `pkg/httpmock` package provides `Registry` with `httpmock.REST()`, `httpmock.GraphQL()`, and `httpmock.JSONResponse()` for stubbing HTTP interactions. The registry tracks all requests and verifies all stubs were matched via `defer reg.Verify(t)` (`pkg/cmd/issue/list/list_test.go:74-75`).

**File-based fixtures**: JSON response fixtures stored in `fixtures/` directories, loaded via `httpmock.FileResponse("./fixtures/issueList.json")` (`pkg/cmd/issue/list/list_test.go:79`).

**Command stubbing**: The `run.Stub()` utility intercepts external command execution in tests (`pkg/cmd/issue/list/list_test.go:224`).

**No testcontainers or DB mocking observed**: The project does not appear to use testcontainers for database mocking. External API calls are mocked via HTTP stubs.

### 4. How does the project prevent flaky tests from eroding trust?

**Race detector**: CI runs `go test -race` (`.github/workflows/go.yml:32`) to detect data races.

**HTTP stub verification**: `Registry.Verify(t)` (`pkg/httpmock/registry.go:60-79`) fails if any registered HTTP stub was not matched, preventing tests from passing with unmet expectations.

**Require vs Assert**: The codebase prefers `require` from testify for immediate failure on errors (see `pkg/cmd/issue/list/list_test.go:248`).

**Deterministic time**: The `Now` function injection pattern prevents time-based flakiness in relative time assertions.

**OS matrix**: Tests run across Ubuntu, Windows, and macOS (`.github/workflows/go.yml:16`) to catch OS-specific issues.

**Known gaps**: Some async tests use `time.Sleep` with fixed timeouts (e.g., `pkg/iostreams/iostreams_progress_indicator_test.go:52`), which could theoretically be flaky under heavy load.

### 5. Can integration tests run locally without cloud dependencies?

**No for acceptance tests**: Acceptance tests require `GH_ACCEPTANCE_HOST`, `GH_ACCEPTANCE_ORG`, and `GH_ACCEPTANCE_TOKEN` environment variables pointing to a real GitHub instance (`acceptance/acceptance_test.go:413-417`). They explicitly refuse to run against `github` or `cli` orgs (`acceptance/acceptance_test.go:434-436`).

**Partial for integration tests**: The `test/integration/attestation-cmd/` shell scripts execute against real Sigstore/OCI infrastructure. Running them locally would require the built `gh` binary and appropriate cloud credentials.

**Unit tests are fully local**: All unit tests use HTTP mocking and require no external services.

## Architectural Decisions

**Options + Factory pattern**: Commands follow a consistent structure with `Options` structs containing dependencies (HTTP client, Config, BaseRepo, Now function). Tests inject mocks via the factory. See `pkg/cmd/issue/list/list.go` canonical example.

**HTTP mock registry**: A central `Registry` in `pkg/httpmock/registry.go` tracks all HTTP interactions and verifies stub consumption. Stubs capture their registration stack trace for debugging unmatched requests.

**testscript for acceptance**: The project uses `go-internal/testscript` for acceptance tests, allowing tests to be written as executable scripts with custom commands (`defer`, `replace`, `stdout2env`, `sleep`). This is more maintainable than shell scripts for Go projects.

**Time as dependency**: Time functions are passed as `func() time.Time` rather than interface-based clocks, reducing abstraction overhead while enabling testability.

## Notable Patterns

- **Colocated test fixtures**: JSON fixtures live next to the code they test in `fixtures/` subdirectories
- **Stub stack traces**: HTTP mock stubs capture `debug.Stack()` at registration for debugging (`pkg/httpmock/registry.go:26`)
- **Test cleanup via `defer`**: Common pattern of `defer http.Verify(t)` immediately after registry creation
- **TTY simulation**: `ios.SetStdoutTTY(true)` allows testing terminal-specific output formatting
- **Environment-gated acceptance tests**: Acceptance tests explicitly require environment variables and skip gracefully when missing

## Tradeoffs

- **HTTP mocking is in-house**: The project maintains its own `pkg/httpmock` rather than using a third-party library like `httptest`. This gives full control but adds maintenance burden.
- **Acceptance tests require live credentials**: Unlike projects that use recorded fixtures or local servers for e2e testing, acceptance tests here hit real GitHub APIs, limiting local reproducibility.
- **Sleep-based async testing**: Some tests use `time.Sleep` for timing-sensitive operations, which is simpler but less deterministic than synchronization primitives.
- **No interface-based time clocks**: The `func() time.Time` pattern works but doesn't allow easy mocking of other time operations like `time.After`.

## Failure Modes / Edge Cases

- **Unmatched HTTP stubs**: If a test registers an HTTP stub that is never called, `Verify` will report the stack trace of the unmatched registration, helping identify the issue.
- **Race conditions**: Running with `-race` flag in CI catches data races but the test suite does not have dedicated concurrency stress tests beyond the telemetry ID convergence test.
- **Flaky acceptance tests**: Tests like `workflow-list.txtar:22` use `sleep 1` to wait for workflow registration, which could fail if GitHub is slow to propagate.
- **OS-specific behavior**: The three-OS CI matrix catches platform differences but not all environment-specific issues (e.g., filesystem behavior differences).

## Future Considerations

- Consider introducing interface-based time clocks (e.g., `clock.Clock`) for more comprehensive time mocking
- Consider using recorded API responses or a local mock server for acceptance tests to enable offline execution
- Consider replacing `time.Sleep` in tests with `sync.WaitGroup` or `channel`-based synchronization for better determinism
- Consider adding dedicated concurrency stress tests beyond the existing telemetry convergence test

## Questions / Gaps

- **No evidence of database mocking**: The project does not appear to use testcontainers or similar for database integration testing. This is expected for a CLI tool that primarily makes HTTP calls, but any local state (config, credentials) is tested in a limited way.
- **No fuzz testing observed**: The codebase does not appear to use fuzzing as part of its test strategy.
- **Limited chaos testing**: No evidence of chaos engineering practices (fault injection, network simulation) beyond basic HTTP stubbing.

---

Generated by `dimensions/14-testing-strategy-reliability.md` against `cli`.