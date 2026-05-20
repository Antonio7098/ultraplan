# Source Analysis: kubernetes

## Testing Strategy & Reliability Engineering

### Source Info

| Field | Value |
|-------|-------|
| Name | kubernetes |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/kubernetes` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

Kubernetes implements a comprehensive multi-layered testing strategy spanning unit tests co-located with source, integration tests with real etcd/apiserver, and e2e tests via Ginkgo. The project demonstrates mature practices for deterministic async/concurrent testing using fake clocks, extensive fake/mock implementations for external dependencies, and systematic flakiness management. Integration tests can run locally without cloud dependencies by spawning their own etcd instance.

## Rating

**8/10** — Good implementation with minor issues. Kubernetes has an extensive, well-organized testing infrastructure with strong patterns for deterministic testing and flakiness management. The primary limitation is that full e2e tests require a real cluster, and the CI configuration is external (Prow-based) rather than visible in the repository.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Test directory structure | Unit tests co-located as `*_test.go` alongside source; integration tests in `test/integration/`; e2e tests in `test/e2e/` and `test/e2e_node/` | `hack/make-rules/test.sh:36-56` |
| Test runner | `gotestsum` runs tests with JSON output, junit reporting, parallel execution | `hack/make-rules/test.sh:214-222` |
| Race detection | Enabled by default (`KUBE_RACE="-race"`), configurable | `hack/make-rules/test.sh:87` |
| Integration test etcd setup | Starts real etcd process, can reuse existing or create new | `test/integration/framework/etcd.go:61-81` |
| Integration test server | Spawns kube-apiserver for integration tests | `test/integration/framework/test_server.go:78-100` |
| Goroutine leak detection | `goleak` integration with retry and known ignores | `test/integration/framework/goleak.go:43-72` |
| Fake clock for time testing | `testingclock.FakeClock` used to control time in tests | `test/integration/serviceaccount/legacy_service_account_token_clean_up_test.go:119` |
| Fake runtime | `pkg/kubelet/container/testing/fake_runtime.go` for kubelet testing | `pkg/kubelet/container/testing/fake_runtime.go` |
| Flake reporting | `FlakeReport` struct tracks non-critical errors as flakes | `test/e2e/framework/flake_reporting_util.go:26-65` |
| Flaky test reporting | Issue template for CI flaking tests | `.github/ISSUE_TEMPLATE/flaking-test.yaml:1-10` |
| Timeout management | `TimeoutContext` with configurable durations for e2e tests | `test/e2e/framework/timeouts.go:21-43` |
| E2E test framework | Ginkgo v2-based framework with provider abstraction | `test/e2e/framework/framework.go:17-21` |
| Fake kubelet manager | `pkg/kubelet/kuberuntime/fake_kuberuntime_manager.go` | `pkg/kubelet/kuberuntime/fake_kuberuntime_manager.go` |
| Fake DNS | `test/utils/fakedns/fakedns.go` for DNS testing | `test/utils/fakedns/fakedns.go` |
| Test context | `TestContextType` manages e2e test configuration | `test/e2e/framework/test_context.go:71-80` |
| Ktesting package | Context-aware testing with cancellation support | `test/utils/ktesting/tcontext.go:89-95` |
| Test parallelism | Configurable via `-p` flag, default auto-detected | `hack/make-rules/test.sh:118-127` |
| Cache mutation detector | Enabled by default for catching data races | `hack/make-rules/test.sh:27-29` |
| Test fixtures | Embedded via `//go:embed` in `test/fixtures/embed.go` | `test/fixtures/README.md:5-18` |

## Answers to Dimension Questions

### 1. How does the project test async, concurrent, or time-dependent code deterministically?

Kubernetes uses `k8s.io/utils/clock/testing.FakeClock` to control time in tests. The pattern is evident throughout the codebase:

- `test/integration/serviceaccount/legacy_service_account_token_clean_up_test.go:119` — `fakeClock := testingclock.NewFakeClock(time.Now())`
- `test/integration/serviceaccount/legacy_service_account_token_clean_up_test.go:169` — `fakeClock.Step(cleanUpPeriod + 24*time.Hour)` to advance time deterministically
- `test/integration/scheduler/eventhandler/eventhandler_test.go:151` — fake clock with `fakeClock.Step(2 * testBackoff)`
- `staging/src/k8s.io/client-go/util/workqueue/delay_queue_test.go:31` — `fakeClock := testingclock.NewFakeClock(time.Now())` with `fakeClock.Step(60 * time.Millisecond)`

The `test/utils/ktesting/` package (`tcontext.go:1-100`) provides context-aware testing with cancellation support for managing async operations.

For goroutine leaks, `goleak` integration detects leaked goroutines with a 600-second retry timeout (`test/integration/framework/goleak.go:57-72`).

### 2. What is the balance between unit, integration, and e2e tests?

Unit tests are co-located with source as `*_test.go` files. Integration tests live in `test/integration/` with 66 subdirectories covering every major component (scheduler, kubelet, apiserver, etc.). E2e tests use Ginkgo in `test/e2e/` and `test/e2e_node/`.

The Makefile (`Makefile:186-216`) explicitly separates test types:
- `make test` / `make check` — unit tests via `hack/make-rules/test.sh`
- `make test-integration` — integration tests via `hack/make-rules/test-integration.sh`
- `make test-e2e-node` — node e2e tests via `hack/make-rules/test-e2e-node.sh`
- `make test-cmd` — command-line tests

Unit tests run by default when running `make test`; integration, e2e, and e2e_node tests are explicitly excluded (`hack/make-rules/test.sh:48-55`).

### 3. How are external dependencies (DBs, APIs, queues) mocked or replaced in tests?

**etcd**: Integration tests spawn a real etcd process via `test/integration/framework/etcd.go:61-81`. The `startEtcd()` function either connects to an existing `KUBE_INTEGRATION_ETCD_URL` or creates a new temporary instance. Integration tests can run without cloud dependencies.

**Container runtime**: `pkg/kubelet/container/testing/fake_runtime.go` provides a `FakeRuntime` struct implementing the runtime interface with configurable responses.

**Kubelet runtime manager**: `pkg/kubelet/kuberuntime/fake_kuberuntime_manager.go` provides a fake implementation.

**DNS**: `test/utils/fakedns/fakedns.go` provides fake DNS for testing.

**External APIs**: Client-go fake clients are used extensively. Fake implementations for specific components exist throughout `pkg/` and `staging/src/k8s.io/`.

**Fake clocks**: `vendor/k8s.io/utils/clock/testing/fake_clock.go` replaces real time for deterministic testing.

### 4. How does the project prevent flaky tests from eroding trust?

**FlakeReport utility** (`test/e2e/framework/flake_reporting_util.go:26-65`) records non-critical errors as flakes rather than failures:

```go
func (f *FlakeReport) RecordFlakeIfError(err error, optionalDescription ...interface{})
```

**Flaky test annotations**: Tests can be marked `[Flaky]` to be tracked separately.

**Timeout management** (`test/e2e/framework/timeouts.go:21-43`): 5-minute namespace cleanup timeout (`namespaceCleanupTimeout = 15 * time.Minute` in `test/e2e/e2e.go:59-65`) handles long-lived cluster cleanup.

**Race detector**: Enabled by default (`hack/make-rules/test.sh:87`).

**Cache mutation detector**: Enabled by default (`KUBE_CACHE_MUTATION_DETECTOR="true"` at `hack/make-rules/test.sh:28`).

**Goroutine leak detection**: Via `goleak` with known-ignores for known safe leaks (`test/integration/framework/goleak.go:262-281`).

**Issue templates**: `.github/ISSUE_TEMPLATE/flaking-test.yaml` provides structured flaking test reporting.

### 5. Can integration tests run locally without cloud dependencies?

**Yes**. The integration test framework spawns its own etcd (`test/integration/framework/etcd.go:61-81`) and kube-apiserver (`test/integration/framework/test_server.go:78-100`). Running `hack/install-etcd.sh` installs etcd to `third_party/`, after which `make test-integration` works without cloud access.

`KUBE_INTEGRATION_ETCD_URL` env var allows connecting to an existing etcd or uses a new one if not set.

## Architectural Decisions

1. **Test runner separation**: Unit tests use standard Go test with gotestsum; integration tests use a custom framework with real servers; e2e uses Ginkgo with provider abstraction. This separation enables each layer to test realistic scenarios while keeping unit tests fast.

2. **Embedded fixtures**: Test fixtures use Go's `//go:embed` directive (`test/fixtures/embed.go`) rather than external files, ensuring fixtures are available in all test environments.

3. **Fake-heavy approach**: Kubernetes prefers fake implementations over testcontainers for most cases, with real etcd only for integration tests that specifically need it.

4. **Goroutine leak detection as default**: Integration tests use `goleak` to catch goroutine leaks that would otherwise cause subtle test pollution.

## Notable Patterns

- **Fake clocks** for time control: `testingclock.FakeClock` with `.Step()` to advance time
- **FlakeReport** for tracking non-critical failures separately from test results
- **TestServerSetup** with `ModifyServerRunOptions` and `ModifyServerConfig` callbacks for customization
- **Provider abstraction** in e2e framework for cloud-provider agnostic tests
- **TContext** for context-aware testing with cancellation

## Tradeoffs

- E2e tests require a real cluster, limiting local execution
- CI configuration is external (Prow-based), not visible in the repository
- Integration tests spawn real processes (etcd, apiserver), which can be heavy
- Flaky test management relies on annotations rather than automatic retry infrastructure

## Failure Modes / Edge Cases

- **Flaky network tests**: E2e tests marked `[Flaky]` when they depend on timing-sensitive operations
- **Goroutine leaks**: Known-safe leaks from lumberjack and spdy are explicitly ignored (`test/integration/framework/goleak.go:262-281`)
- **Namespace cleanup failures**: 15-minute timeout for namespace deletion handles orphaned resources
- **Cache mutation**: `KUBE_CACHE_MUTATION_DETECTOR` panics on cache modification during testing

## Future Considerations

- Test distribution and parallelization could be more visible in the repo
- A unified test dashboard/reporting mechanism would improve flakiness tracking
- More integration tests could adopt the `ktesting` context pattern for cancellation-aware testing

## Questions / Gaps

- CI workflows are not visible in the repository (Prow-based), making it hard to assess CI test parallelization
- No evidence of test retry infrastructure within the codebase itself
- Flaky test tracking relies on annotations and external tooling rather than automated retry

---

Generated by `dimensions/14-testing-strategy-reliability.md` against `kubernetes`.
