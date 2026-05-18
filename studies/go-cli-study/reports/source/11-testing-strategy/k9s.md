# Repo Analysis: k9s

## Testing Strategy

### Repo Info

| Field | Value |
|-------|-------|
| Name | k9s |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/k9s` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

k9s employs a comprehensive testing strategy with table-driven unit tests, a centralized mock package, and explicit integration test separation via `_int_test.go` naming. The project uses testify for assertions and provides JSON testdata fixtures loaded via a `load()` helper function. No golden tests were found.

## Rating

**7/10** — Strong unit + integration patterns. The mock package is well-organized but not exhaustive; some tests define local mocks. Golden tests are absent, and some tests appear to check implementation details (e.g., hint counts) rather than pure behavior.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Test Organization | 100+ `_test.go` files across internal packages | `internal/render/container_test.go:21` |
| Table-driven tests | Test cases stored in map, iterated with `t.Run()` | `internal/render/container_int_test.go:152-158` |
| Subtest naming | Using `t.Run(k, func(t *testing.T)` pattern | `internal/view/pod_int_test.go:77` |
| Integration tests | `_int_test.go` suffix distinguishes integration tests | `internal/view/table_int_test.go:31`, `internal/view/pod_int_test.go` |
| Mock package | Dedicated `internal/config/mock/test_helpers.go` | `internal/config/mock/test_helpers.go:40` |
| Mock usage | `mock.NewMockConfig(t)` used in tests | `internal/view/pod_test.go:29` |
| Local mocks | Tests define local mock structs (e.g., `mockTableModel`) | `internal/view/table_int_test.go:133` |
| Testdata loading | `load()` helper reads JSON from `testdata/*.json` | `internal/render/render_test.go:18-26` |
| Testdata fixtures | JSON fixtures for K8s resources | `internal/render/testdata/svc.json:1` |
| testify usage | `github.com/stretchr/testify/assert` and `require` | `internal/render/container_test.go:13-14` |
| Benchmarks | `BenchmarkContainerRender`, `BenchmarkPodRender` | `internal/render/container_test.go:58`, `internal/render/pod_test.go:171` |
| Error path testing | Tests for empty, no-match, and edge cases | `internal/render/container_int_test.go:21` |

## Answers to Protocol Questions

### 1. Are commands integration tested?

**Partial.** The codebase has integration tests (e.g., `internal/view/pod_int_test.go`, `internal/view/table_int_test.go`) but these primarily test UI component behavior and filtering/sorting logic, not actual kubectl command execution. The `pod_int_test.go` tests shell argument computation (`TestComputeShellArgs`) which is close to command construction but not execution. No evidence of end-to-end command invocation tests.

### 2. Are golden tests used?

**No.** The search for "golden" returned only a color name reference (`styles.go:300`). No golden/approval tests that compare output against stored fixture files.

### 3. How are mocks structured?

**Dual approach:** A centralized `mock` package at `internal/config/mock/test_helpers.go:40` provides `NewMockConfig()` and `mockConnection` for config/k8s client mocking. However, many tests define local mock implementations inline (e.g., `mockTableModel` at `internal/view/table_int_test.go:133`, `mockTableModel` at `internal/view/table_int_test.go:133`). This leads to duplication across tests.

### 4. Is behavior tested or implementation details?

**Mixed.** Render tests check output fields (`assert.Equal` on `r.Fields`) which is behavior. However, some tests assert on implementation details:
- `internal/view/pod_test.go:23`: `assert.Len(t, po.Hints(), 19)` — checks hint count
- `internal/view/cm_test.go:20`: `assert.Len(t, s.Hints(), 9)` — checks hint count

These tests are fragile because hint counts can change with UI updates without affecting actual functionality.

## Architectural Decisions

1. **Test package separation**: Tests live in same package as code (`view_test`, `render_test`) allowing access to unexported types while remaining outside the main package.

2. **Testdata per package**: Each package has its own `testdata/` directory with JSON fixtures specific to its needs (`internal/render/testdata/`, `internal/xray/testdata/`).

3. **Test helper duplication**: The `load()` helper appears in multiple packages (`render_test.go:18`, `xray/container_test.go:244`, `dao/utils_test.go:71`) rather than a shared utility.

4. **Mock interface verification**: Tests use compile-time interface checks like `var _ ui.Tabular = (*mockTableModel)(nil)` (`internal/view/table_int_test.go:135`).

## Notable Patterns

1. **Table-driven tests with map literals** — Test cases defined in `map[string]struct{ ... }` for clarity
2. **Context injection for app dependencies** — `makeCtx()` creates context with app instance (`internal/view/pod_test.go:28-30`)
3. **Integration test cleanup** — Uses `/tmp/test` directory with setup/teardown (`internal/config/mock/test_helpers.go:40-45`)
4. **Benchmark tests** — Performance tests exist for hot paths (`BenchmarkContainerRender`)
5. **Test time helper** — Shared `testTime()` RFC3339 parsing for deterministic timestamps

## Tradeoffs

| Pattern | Benefit | Risk |
|---------|---------|------|
| Local mocks per test | Tailored to specific test needs | Duplication, maintenance burden |
| JSON testdata fixtures | Realistic K8s resource structures | Fixture drift from actual API schemas |
| Hints testing | Documents expected keyboard shortcuts | Brittle—UI changes break tests |
| Integration test naming | Clear separation from unit tests | No enforcement mechanism |

## Failure Modes / Edge Cases

1. **Hint count brittleness**: Tests at `internal/view/pod_test.go:23` and `internal/view/cm_test.go:20` will fail if UI hint definitions change, even if functionality remains correct.

2. **Timestamp parsing**: The `testTime()` helper in multiple packages uses `fmt.Println` on error (`internal/render/container_test.go:131-133`) rather than failing the test.

3. **Temporary directory pollution**: Tests use `/tmp/test` which could conflict with other test runs or require cleanup.

4. **Missing error path coverage**: Some packages have tests only for happy paths (e.g., `cmd/info_test.go` only tests non-error paths).

## Future Considerations

1. Extract shared `load()` helper into a testutil package to avoid duplication
2. Replace hint count assertions with functional tests that verify hint behavior
3. Consider golden tests for render output to prevent regression
4. Add integration test markers or build tags to control execution environment

## Questions / Gaps

1. **No golden tests**: Could golden tests prevent render output regressions?
2. **Mock duplication**: Would a unified mock interface reduce maintenance burden?
3. **Hint testing strategy**: Are hint count tests documenting intent or impeding refactoring?
4. **Coverage gaps**: What commands/resources lack test coverage?

---

Generated by `study-areas/11-testing-strategy.md` against `k9s`.