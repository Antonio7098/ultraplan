# Repo Analysis: helm

## Testing Strategy

### Repo Info

| Field | Value |
|-------|-------|
| Name | helm |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/helm` |
| Group | `11-testing-strategy` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

Helm employs a mature, multi-layered testing strategy with strong separation between unit and integration concerns. Commands use golden-file output comparison against fixtures stored in `pkg/cmd/testdata/output/`. Mocks are centralized in `pkg/kube/fake/` and `pkg/storage/driver/` with embedded Kubernetes interface mocks. Action tests use `actionConfigFixture()` to inject fake storage and kube clients. The overall approach tests behavior rather than implementation details, though some tests rely on specific internal structures.

## Rating

**8/10** — Strong unit + integration patterns. The golden test infrastructure, mock hierarchy, and table-driven test organization are well-developed. Minor gaps in some command tests that don't fully exercise error paths.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Golden file test helper | `AssertGoldenString()` in `internal/test/test.go:43` | `internal/test/test.go:43` |
| Golden file update flag | `-update` flag allows rewriting golden files | `internal/test/test.go:28` |
| cmdTestCase struct | Defines `name`, `cmd`, `golden`, `wantError`, `rels` for table-driven tests | `pkg/cmd/helpers_test.go:131-141` |
| runTestCmd function | Executes commands and checks golden output | `pkg/cmd/helpers_test.go:50-77` |
| executeActionCommandC | Runs CLI command with storage fixture | `pkg/cmd/helpers_test.go:83-128` |
| PrintingKubeClient | Fake KubeClient that prints instead of applying | `pkg/kube/fake/printer.go:32-37` |
| FailingKubeClient | Extends PrintingKubeClient to simulate failures | `pkg/kube/fake/failing_kube_client.go:35` |
| MockConfigMapsInterface | In-memory Kubernetes ConfigMap mock | `pkg/storage/driver/mock_test.go:96-171` |
| MockSecretsInterface | In-memory Kubernetes Secrets mock | `pkg/storage/driver/mock_test.go:184-259` |
| Memory driver | In-memory storage driver for tests | `pkg/storage/driver/memory_test.go` |
| repotest.NewTempServer | Creates HTTP test server with chart fixtures | `pkg/repo/v1/repotest/server.go:91-106` |
| OCIServer | OCI registry test server | `pkg/repo/v1/repotest/server.go:141-214` |
| cmdTestCase struct for install | 30+ test cases covering happy paths and errors | `pkg/cmd/install_test.go:48-277` |
| actionConfigFixture | Creates Configuration with fake storage and kube | `pkg/action/action_test.go:47-71` |
| makeMeSomeReleases | Creates test release data | `pkg/action/action_test.go:140-160` |

## Answers to Protocol Questions

### 1. Are commands integration tested?

**Yes.** Commands in `pkg/cmd/` are integration-tested using `repotest.NewTempServer` which spins up an HTTP server with real chart archives. Tests in `install_test.go:30-44` set up a temp server with chart source glob and basic auth middleware. The `runTestCmd()` helper (`pkg/cmd/helpers_test.go:50`) executes full command flows with storage fixture, not mocked at the action level.

### 2. Are golden tests used?

**Yes.** Helm uses golden files extensively for command output comparison. The `AssertGoldenString()` function in `internal/test/test.go:43` compares actual output against stored fixtures in `pkg/cmd/testdata/output/`. The `update` flag (`internal/test/test.go:28`) allows regenerating golden files. Test cases like "basic install" reference `golden: "output/install.txt"` (`pkg/cmd/install_test.go:54`).

### 3. How are mocks structured?

**Centralized and layered.** Kubernetes client mocks live in `pkg/kube/fake/`:
- `PrintingKubeClient` (`pkg/kube/fake/printer.go:32`) — prints what would be created, always succeeds
- `FailingKubeClient` (`pkg/kube/fake/failing_kube_client.go:35`) — wraps PrintingKubeClient to simulate failures

Storage driver mocks in `pkg/storage/driver/`:
- `MockConfigMapsInterface` (`pkg/storage/driver/mock_test.go:96`) — in-memory ConfigMap store
- `MockSecretsInterface` (`pkg/storage/driver/mock_test.go:184`) — in-memory Secrets store

Both implement real k8s interfaces by embedding them and overriding methods with test implementations.

### 4. Is behavior tested or implementation details?

**Primarily behavior.** Tests use `cmdTestCase{cmd: "...", golden: "..."}` to test command outputs. The `actionConfigFixture()` provides a complete `Configuration` with injected fake clients, testing the full action pipeline. However, some tests like `TestCmdGetDryRunFlagStrategy` (`pkg/cmd/helpers_test.go:159`) test internal flag parsing logic directly, which leans toward implementation detail testing.

## Architectural Decisions

1. **Two-tier test organization**: `pkg/action/` tests focus on business logic with mocked dependencies; `pkg/cmd/` tests exercise full CLI flows with real storage and HTTP servers.

2. **Shared test infrastructure**: `internal/test/test.go` provides the golden file system used across all command tests. This avoids duplication and ensures consistent fixture handling.

3. **Fixture-based command testing**: Commands are tested by constructing full root commands with `newRootCmdWithConfig()` (`pkg/cmd/helpers_test.go:101`) rather than calling action functions directly.

4. **Storage driver abstraction**: Tests use the `driver.Driver` interface to inject in-memory or SQL mock drivers, allowing isolation of storage concerns.

5. **Test server abstraction**: `repotest.NewTempServer()` encapsulates HTTP server lifecycle, TLS setup, chart copying, and index generation for integration tests.

## Notable Patterns

- **Table-driven command tests**: All command tests use `[]cmdTestCase` slices with subtests via `t.Run()` (`pkg/cmd/install_test.go:48-279`)
- **Golden file normalization**: `internal/test/test.go:93-94` normalizes `\r\n` to `\n` for cross-platform consistency
- **Shared action configuration**: `actionConfigFixture()` (`pkg/action/action_test.go:47`) provides a reusable Configuration for all action tests
- **Repeatable test runs**: `cmdTestCase.repeat` field allows running flaky tests multiple times to verify stability (`pkg/cmd/helpers_test.go:140`)
- **Release fixture helpers**: `releaseStub()` and `makeMeSomeReleases()` create consistent test data (`pkg/storage/driver/mock_test.go:38-49`, `pkg/action/action_test.go:140`)

## Tradeoffs

| Tradeoff | Description |
|----------|-------------|
| Golden files vs. flexible assertions | Golden files ensure consistency but require `go test -update` to update when output legitimately changes |
| In-memory storage vs. real Kubernetes | Tests run fast without k8s cluster but don't catch storage driver quirks against real API server |
| HTTP test server vs. mocking repo layer | Full HTTP stack catches real protocol issues but adds test complexity and potential flakiness |
| cmdTestCase struct vs. more expressive tests | Uniform structure is simple but can obscure complex test scenarios |

## Failure Modes / Edge Cases

- **Stale golden files**: If command output changes legitimately (e.g., new fields added), tests fail but can be regenerated with `-update` flag
- **Port conflicts**: `repotest.NewTempServer` uses random ports (`pkg/repo/v1/repotest/server.go:183`) which could theoretically conflict
- **Test server cleanup**: `defer srv.Stop()` must be called to avoid leaked servers (`pkg/cmd/install_test.go:35`)
- **Test fixture isolation**: `resetEnv()` restores environment variables but uses global `settings` which could leak state between tests (`pkg/cmd/helpers_test.go:147-157`)

## Future Considerations

- Consider adding property-based testing for value schema validation (already has schema support in `chart-with-schema` testcharts)
- The `FailingKubeClient.DummyResources` pattern could be extended to more action tests for failure scenario coverage
- Integration tests could benefit from parallel execution if test server port conflicts are resolved

## Questions / Gaps

1. **No evidence found** for fuzz testing beyond `pkg/strvals/fuzz_test.go`. Broader fuzz coverage for chart rendering and template functions could be valuable.
2. **No evidence found** for contract tests between `pkg/action` and `pkg/kube` interfaces.
3. **No evidence found** for integration tests against real Kubernetes clusters (only fake clients used).
4. Some command tests like `list_test.go` use in-memory storage rather than exercising the full storage driver stack.

---

Generated by `study-areas/11-testing-strategy.md` against `helm`.