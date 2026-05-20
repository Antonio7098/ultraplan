# Source Analysis: nats-server

## Testing Strategy & Reliability Engineering

### Source Info

| Field | Value |
|-------|-------|
| Name | nats-server |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/nats-server` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

nats-server employs a comprehensive, multi-layered testing strategy that prioritizes integration testing using real servers over mocking. Tests are organized by build tags and run in a parallelized CI matrix. The project uses a deterministic polling pattern (`checkFor`) for async assertions, separate "NoRace" tests for data race detection, and has fuzz testing infrastructure. External dependencies are minimized—tests use real servers spawned in Go routines with config files, not containers or external services.

## Rating

**8/10** — Excellent implementation with minor issues. The approach is thorough, well-organized, and leverages Go's race detector. However, there is no evidence of testcontainers or Docker-based integration tests, and the "NoRace" tests cannot run with `-race` flag, meaning concurrent code is not race-checked in those specific tests.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Test harness entry point | `RunServer()` starts real server in goroutine, waits for `ReadyForConnections` | `server/server_test.go:80-108` |
| Test utilities | `checkFor()` polls until timeout for async assertions | `server/server_test.go:57-64` |
| Test utilities | `checkFor()` in test package for integration test helpers | `test/test_test.go:30-44` |
| Deterministic async testing | `checkClusterFormed()` polls routes until cluster stabilizes | `test/cluster_test.go:29-40` |
| NoRace test isolation | `TestNoRace*` tests use build tags `!race && !skip_no_race_1_tests` | `server/norace_1_test.go:14-58` |
| Slow proxy for network simulation | `slowProxy` struct introduces RTT and bandwidth constraints | `test/test_test.go:47-126` |
| Build tag test partitioning | `./scripts/runTestsOnTravis.sh` uses tags like `skip_js_cluster_tests` to split test suites | `scripts/runTestsOnTravis.sh:1-138` |
| CI parallelization | `tests.yaml` defines 20+ jobs running `-p=1` (serial per job) | `.github/workflows/tests.yaml:1-412` |
| Race detection in CI | `RACE` env var set to `-race` for PRs, skipped for main/release branches | `.github/workflows/tests.yaml:12` |
| Fuzz testing | `server_fuzz_test.go` and `parser_fuzz_test.go` exist | `server/server_fuzz_test.go:1`, `server/parser_fuzz_test.go:1` |
| Formal property testing | Antithesis SDK integration with `AssertUnreachable` for reachability properties | `internal/antithesis/test_assert.go:1-111` |
| Test configs | Real config files in `test/configs/` for integration test scenarios | `test/configs/cluster.conf:1-25` |
| Memory leak testing | `TestNoRaceDynamicResponsePermsMemory` uses `runtime.GC()` and memstats polling | `test/norace_test.go:231-293` |
| Large cluster testing | `TestNoRaceLargeClusterMem` creates 15-server cluster and checks memory bounds | `test/norace_test.go:295-344` |
| Server test helpers | `RunServer()`, `RunServerWithConfig()`, `DefaultOptions()`, `LoadConfig()` | `server/server_test.go:66-125` |
| Client test helpers | `createClientConn()`, `setupConn()`, `sendCommand()`, `expectCommand()` | `test/test.go:193-337` |
| Test naming convention | Tests prefixed by feature: `TestJetStream*`, `TestNoRace*`, `TestMQTT*`, `TestMsgTrace*` | Multiple files |
| Code coverage | `./scripts/cov.sh` uses `gocovmerge` to aggregate coverage per package | `scripts/cov.sh:1-62` |

## Answers to Dimension Questions

### 1. How does the project test async, concurrent, or time-dependent code deterministically?

The project uses a **polling-based deterministic waiting pattern** via the `checkFor()` helper function (`server/server_test.go:57-64`, `test/test_test.go:30-44`). This function polls a condition with a specified total wait time and sleep interval until it succeeds or times out. For example, `checkClusterFormed()` polls `s.NumRoutes()` until it reaches the expected count (`test/cluster_test.go:29-40`).

**NoRace tests** (`server/norace_1_test.go:14-58`) are separate test files that run *without* the `-race` flag because they test behavior that is inherently racy (e.g., memory usage under concurrent load). These are prefixed `TestNoRace*` and can be selected specifically via `go test -run=TestNoRace`.

**Time-dependent tests** use explicit sleep + polling, e.g., `TestNoRaceSlowProxy` introduces RTT via `slowProxy` with configurable delay and bandwidth limits (`test/test_test.go:47-126`).

The project does **not** use mock time (like `httptest.NewServer`); all async testing is done with real servers and real networking.

### 2. What is the balance between unit, integration, and e2e tests?

The project does **not** have a clear distinction between unit and integration tests—all tests in the `server/` and `test/` packages spawn real NATS servers. There is **no mocking framework** in use.

- **Unit-like tests**: Some tests (e.g., `server/sublist_test.go`) test data structures in isolation without full server startup.
- **Integration tests**: The vast majority of tests start real servers via `RunServer()` or `RunServerWithConfig()` and test behavior across multiple servers,集群, or clients.
- **E2E tests**: The `test/` package tests raw protocol messages over real TCP connections, functioning as E2E tests at the protocol level.

Build tags partition tests by area: `TestJetStream*` (JetStream), `TestMQTT*` (MQTT), `TestNoRace*` (race-free concurrent tests), `TestNRG*` (Raft consensus). This creates logical test categories without separate packages.

### 3. How are external dependencies (DBs, APIs, queues) mocked or replaced in tests?

**No external dependencies are mocked.** Tests run entirely self-contained:
- No Docker/testcontainers for databases—the server uses in-memory stores (`memstore`) or file-based stores (`filestore`) created in temp directories.
- No external API mocking—all tests use in-process NATS servers.
- No message queue mocking—the NATS server *is* the message queue being tested.

The `slowProxy` (`test/test_test.go:47-126`) is a local TCP proxy that simulates network latency and bandwidth constraints, acting as a proxy for "the network" rather than an external dependency.

The project does use the real NATS client library (`github.com/nats-io/nats.go`) for integration tests, but the server under test is always a real in-process server.

### 4. How does the project prevent flaky tests from eroding trust?

Flakiness mitigation strategies observed:

1. **`checkFor` polling with explicit timeouts**: All async assertions use bounded polling with clear failure messages.
2. **`-failfast` in CI**: The test runner scripts (`runTestsOnTravis.sh`) use `-failfast` to stop on first failure, preventing cascading failures from eroding signal.
3. **Build tag isolation**: Tests that are inherently racy are tagged to run separately without the `-race` flag, preventing false-positive race detector failures from masking real issues.
4. **Sequential test execution per job**: CI jobs use `-p=1` (single parallelism) to prevent port/socket conflicts between tests.
5. **Long timeout per job**: 30-minute timeout per CI job allows tests to complete without artificial time pressure.
6. **`RACE` flag control**: The `RACE` environment variable (`tests.yaml:12`) is conditionally set to `-race` for PRs but not main/release, balancing race detection with performance.

**No evidence found** of test retry/flaky detection infrastructure (like Buildkite's flaky test handling or Test flakiness detection tooling).

### 5. Can integration tests run locally without cloud dependencies?

**Yes, completely.** All tests are self-contained:
- Tests use `os.CreateTemp` for temp directories (no external file services).
- No cloud credentials required—TLS certs are bundled in `test/configs/certs/`.
- Test config files are local (`test/configs/*.conf`).
- The `golangci-lint` linter runs locally via the same script used in CI.
- All test commands are documented in `./scripts/runTestsOnTravis.sh`.

To run tests locally:
```bash
./scripts/runTestsOnTravis.sh store_tests      # Run store tests
./scripts/runTestsOnTravis.sh js_tests         # Run JetStream tests
./scripts/runTestsOnTravis.sh no_race_1_tests  # Run no-race tests
```

## Architectural Decisions

1. **Real servers over mocks**: The project spawns real `server.Server` instances in Go routines rather than mocking the server. This provides high confidence but requires careful port management and sequential test execution within jobs.

2. **Build tags for test partitioning**: Instead of package-based test separation, the project uses Go build tags (`skip_js_cluster_tests`, `skip_no_race_1_tests`, etc.) to selectively include/exclude tests. This allows all tests to live in the same package but be split across CI jobs.

3. **NoRace tests are second-class**: Because the NoRace tests cannot run with `-race`, they are isolated to a separate test pass. This means data race conditions in those specific tests are not caught by the race detector.

4. **Test helpers in two packages**: `server/` package has `RunServer()` in `server_test.go`, while `test/` package has `RunServer()` in `test.go`. This duplication allows the `test/` package to test the server as a "black box" using raw TCP sockets, while `server/` package tests can inspect internal state.

5. **Config-driven test setup**: Many tests use configuration files (`test/configs/srv_a.conf`, `test/configs/cluster.conf`) rather than programmatic configuration, making it easier to reproduce failures and align test setup with production deployment patterns.

## Notable Patterns

- **`checkFor(t, totalWait, sleepDur, func() error)`**: Polling helper used 1074+ times across the codebase for deterministic async testing.
- **`slowProxy`**: In-process TCP proxy for simulating network conditions (RTT, bandwidth limits).
- **Build tag test partitioning**: `//go:build !race && !skip_no_race_tests && !skip_no_race_1_tests` gates NoRace tests.
- **Raw protocol testing**: `test/test.go` contains helpers (`sendProto`, `expectResult`, regex patterns for `INFO`, `MSG`, `PING`, `PONG` etc.) that send and receive wire-format protocol messages over TCP.
- **Goroutine leak detection**: `TestProperServerWithRoutesShutdown` checks `runtime.NumGoroutine()` before and after to detect goroutine leaks (`test/cluster_test.go:124-138`).
- **Memory bound testing**: NoRace tests poll `runtime.MemStats` to assert memory usage stays below thresholds (`test/norace_test.go:231-293`).

## Tradeoffs

- **Pros**: High confidence in integration behavior; no mocking overhead; tests match production behavior closely.
- **Cons**: Tests are slow (real server startup per test, sequential execution); port conflicts possible; cannot test certain edge cases that mock-heavy approaches could easily control; NoRace tests don't get race detection.
- **CI resource intensity**: 20+ CI jobs with 30-minute timeouts each; full test suite takes significant time.
- **Test isolation is process-level, not package-level**: Tests in the same package can conflict with each other if they don't properly isolate server ports.

## Failure Modes / Edge Cases

1. **Port collision**: If two tests pick the same random port (`Port: -1`), they can conflict. The project mitigates this via `nextServerOpts()` which increments ports sequentially (`test/test.go:645-651`).
2. **NoRace tests missing race detection**: Since NoRace tests skip the `-race` flag, legitimate data races in those code paths go undetected by the race detector.
3. **Slow test feedback**: Sequential execution (`-p=1`) within each CI job means a single slow test blocks the entire job.
4. **Temp directory cleanup**: Tests use `t.TempDir()` which is cleaned up automatically, but any test that leaks goroutines or open files can cause issues on Windows.

## Future Considerations

1. **Fuzz test coverage**: `server_fuzz_test.go` and `parser_fuzz_test.go` exist but appear limited. Expanding fuzz testing could find protocol parsing edge cases.
2. **Property-based testing**: The Antithesis SDK integration is present but not actively running in CI (it's gated by `enable_antithesis_sdk` build tag). Formal property-based testing could complement existing test cases.
3. **Testcontainers adoption**: If the project ever adds external dependencies (e.g., KeyValue stores, external auth servers), testcontainers could provide consistent integration test environments without requiring Docker at test author time.

## Questions / Gaps

1. **No evidence of test flakiness monitoring**: The project does not appear to have tooling to detect, track, or retry flaky tests. This could erode trust over time.
2. **No structured unit test isolation**: All tests are effectively integration tests. Some code paths may be under-tested at the unit level because testing them requires a full server.
3. **Limited mock usage**: Without mocks, certain failure injection scenarios (e.g., disk full, network partition) are harder to test systematically.
4. **No explicit test documentation**: While `CONTRIBUTING.md` exists, there is no `TESTING.md` or similar document explaining how to write tests, use `checkFor`, or run specific test suites.

---

Generated by `dimensions/14-testing-strategy-reliability.md` against `nats-server`.