# Repo Analysis: yq

## Testing Strategy

### Repo Info

| Field | Value |
|-------|-------|
| Name | yq |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/yq` |
| Group | `yq` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

yq employs a highly systematic table-driven testing approach with 100+ test files. The core testing pattern uses a shared `expressionScenario` struct that defines document, expression, and expected output. Tests are organized per-operator with comprehensive coverage of happy paths and error cases. Shell-based acceptance tests provide integration coverage for the CLI.

## Rating

**8/10** — Strong unit + integration patterns with comprehensive operator coverage. Points deducted for limited golden file usage (only for doc generation) and minimal mock infrastructure.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Table-driven tests | expressionScenario struct with document, expression, expected fields | `pkg/yqlib/operators_test.go:20-35` |
| Test runner | testScenario function parses expression and evaluates against document | `pkg/yqlib/operators_test.go:76-153` |
| Test helper assertions | AssertResultComplexWithContext uses github.com/pkg/diff for colored output | `test/utils.go:33-46` |
| Operator test files | 80+ operator-specific _test.go files in pkg/yqlib | `pkg/yqlib/operator_*.go` |
| Command tests | evaluateSequenceCommand tests with temp files | `cmd/evaluate_sequence_command_test.go:144-204` |
| Acceptance tests | Shell-based CLI integration tests | `acceptance_tests/basic.sh:1-373` |
| Error testing | expectedError field in expressionScenario | `pkg/yqlib/operator_add_test.go:522-528` |
| Doc generation | Tests auto-generate documentation via documentScenarios | `pkg/yqlib/operators_test.go:225-255` |
| Mock structs | mockFileInfo for file system testing | `pkg/yqlib/chown_linux_test.go:113-118` |
| Mock flags | mockBoolFlag for flag testing | `cmd/utils_test.go:888-904` |

## Answers to Protocol Questions

### 1. Are commands integration tested?

**Yes.** The `acceptance_tests/` directory contains shell-based integration tests (e.g., `basic.sh`, `flags.sh`, `output-format.sh`). Each test creates temp files and runs the CLI binary, asserting expected output via `assertEquals`. Command-level tests in `cmd/` also test the evaluate sequence flow with temp files (`cmd/evaluate_sequence_command_test.go:144-204`).

### 2. Are golden tests used?

**Partial.** yq does not use golden files for output comparison in the typical sense. However, tests in `acceptance_tests/` compare CLI output against expected strings defined in the shell scripts. Additionally, `documentScenarios` in `operators_test.go:225` generates markdown documentation by running expressions and capturing output as fixtures in `doc/operators/*.md`. This is closer to golden-file behavior but is used for docs, not assertions.

### 3. How are mocks structured?

**Minimal and ad-hoc.** Only two mock implementations exist:
- `mockFileInfo` in `pkg/yqlib/chown_linux_test.go:113-118` — implements `os.FileInfo` for chown tests
- `mockBoolFlag` in `cmd/utils_test.go:888-904` — implements pflag's Value interface

Mocks are not organized in a separate package; they live in the same file as the test. Most tests avoid mocking entirely by using real types or the table-driven scenario approach.

### 4. Is behavior tested or implementation details?

**Primarily behavior, with some implementation coupling.** The `expressionScenario` pattern tests behavior by providing an expression and document, then asserting the output. This is behavior-focused. However, some tests like `chown_linux_test.go` directly test file permission changes (implementation detail), and some command tests access internal state like `writeInplace` (`cmd/evaluate_sequence_command_test.go:224-226`).

## Architectural Decisions

1. **Centralized testScenario runner** — Single function handles parsing, evaluation, and assertion for all operator tests (`pkg/yqlib/operators_test.go:76`)
2. **expressionScenario as test DSL** — Declarative struct allows non-Go users to add tests; scenarios also auto-generate documentation
3. **Test/Production code co-location** — Tests live alongside implementation in same package, not in separate `*_test` package hierarchy
4. **Shell-based acceptance tests** — Chose shell scripts over Go for integration tests, enabling easy manual testing and CI verification

## Notable Patterns

- **Table-driven with scenario struct**: Each operator test file defines a slice of `expressionScenario` with fields for `document`, `expression`, `expected`, `expectedError`, `skipDoc`, `skipForGoccy`
- **Subtests via t.Run**: Command tests like `cmd/evaluate_sequence_command_test.go:89` use subtests for individual cases
- **TestMain for global setup**: `TestMain` in `operators_test.go:41` sets logger level, disables colors, and handles `GOCCY` env var for alternate decoder
- **Doc generation from tests**: `documentOperatorScenarios` appends to markdown files, keeping docs in sync with tests

## Tradeoffs

| Design | Tradeoff |
|--------|----------|
| Table-driven scenarios | Easy to add tests, but mixes test data with test logic; large scenario slices can be hard to navigate |
| Shell acceptance tests | Portable and simple, but slower than Go-based tests and harder to debug |
| No mocks for decoders/encoders | Tests use real implementations, which is more realistic but slower |
| Tests generate docs | Ensures docs stay current, but couples test behavior to documentation pipeline |

## Failure Modes / Edge Cases

- **Expression parsing failures**: `testScenario` reports parse errors with expression and description context (`operators_test.go:84`)
- **Decoder/encoder gaps**: `requiresFormat` field skips tests when format support is missing (`operators_test.go:132-148`)
- **Goccy YAML variant**: `skipForGoccy` field skips scenarios when testing alternate decoder (`operators_test.go:77`)
- **Environment variable side effects**: Tests set/reset env vars in-line (`operators_test.go:117-119`)

## Future Considerations

- Golden file framework could improve output regression testing
- Mocks for decoders/encoders would enable faster unit tests
- Separating acceptance_tests into Go-based tests could improve CI speed and debuggability

## Questions / Gaps

1. No evidence found of benchmark tests (`*_bench_test.go` files)
2. No evidence of test data files (e.g., `testdata/` directories with YAML/JSON fixtures)
3. No evidence of fuzz testing despite handling multiple input formats (YAML, JSON, XML, TOML, etc.)
4. Limited evidence of race condition testing

---

Generated by `study-areas/11-testing-strategy.md` against `yq`.