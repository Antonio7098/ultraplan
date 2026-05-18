# Repo Analysis: age

## Testing Strategy

### Repo Info

| Field | Value |
|-------|-------|
| Name | age |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/age` |
| Group | `go-cli-study` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

age is a file encryption tool with a well-structured testing approach. It uses Go's standard testing package with table-driven subtests, golden file tests via `testscript`, and test vectors from an external `c2sp.org/CCTV/age` module. The CLI is tested via `testscript` scripts, while the library uses table-driven unit tests. Mock structures are minimal since age uses real cryptographic primitives.

## Rating

8/10 — Strong unit + integration patterns. The use of `testscript` for CLI integration testing and external test vectors for cryptographic primitives is excellent. The main limitation is lack of formal mock structures; test isolation is achieved through real implementations or minimal test types embedded in test files.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Test organization | Table-driven tests with subtests using `t.Run()` | `age_test.go:125-157` |
| Test organization | Example functions for documentation | `age_test.go:23-46` |
| Golden files | `testscript` golden tests for CLI | `cmd/age/age_test.go:69-76` |
| Golden files | `testdata/` directory with `.txt` scripts | `cmd/age/testdata/usage.txt:1-20` |
| Test vectors | External test vectors from `c2sp.org/CCTV/age` | `testkit_test.go:28` |
| Test vectors | Test vectors parsed and executed | `testkit_test.go:31-47` |
| Integration tests | `testscript` runs shell-like test scripts | `cmd/age/age_test.go:19-39` |
| Mock structures | `testPlugin` struct embedded in test file | `cmd/age/age_test.go:41-52` |
| Mock structures | `testRecipient` and `testIdentity` in plugin tests | `plugin/client_test.go:52-68` |
| Behavior vs impl | Tests verify encrypt/decrypt round-trip | `age_test.go:125-157` |
| Error handling tests | Error path testing with `errors.As()` | `age_test.go:407-416` |

## Answers to Protocol Questions

### 1. Are commands integration tested?

Yes. The CLI commands (`age`, `age-keygen`, `age-plugin-*`) are integration tested via `testscript` (`cmd/age/age_test.go:19-39,69-76`). The `testscript` framework runs `.txt` script files in `testdata/` that execute real commands and verify stdout/stderr output. For example, `testdata/usage.txt:1-20` tests help output, and `testdata/keygen.txt:1-25` tests key generation.

### 2. Are golden tests used?

Yes, but not in the traditional sense of comparing output to stored fixture files. Instead, age uses `testscript` which compares actual stdout/stderr against expected values embedded in `.txt` scripts. These are effectively golden tests for CLI output. The `testdata/` files (`cmd/age/testdata/usage.txt`, `cmd/age/testdata/keygen.txt`) serve as golden fixtures.

Additionally, `testkit_test.go:142-150` uses external test vectors from `c2sp.org/CCTV/age` to verify cryptographic correctness — these are golden in the sense of being fixed, known-answer test vectors.

### 3. How are mocks structured?

Mocks are minimal and embedded directly in test files, not in separate mock packages:
- `testRecipient` in `cmd/age/age_test.go:41-52` — implements `age.Recipient` for plugin testing
- `testPlugin{}` in `cmd/age/age_test.go:41` — simple test plugin
- `testIdentity` in `age_test.go:327-334` — non-native identity that records if `Unwrap` is called
- `testRecipient` in `plugin/client_test.go:52-56` — test plugin recipient

No separate mock packages exist; tests use real implementations or minimal test types defined in the test files themselves.

### 4. Is behavior tested or implementation details?

Primarily behavior. Tests verify:
- Encrypt/decrypt round-trips (`age_test.go:125-157`)
- Error conditions with `errors.As()` checks (`age_test.go:407-416`)
- Output format compliance (via `testscript`)
- Cryptographic correctness against known test vectors (`testkit_test.go:142-207`)

Implementation detail testing is minimal. Tests check public APIs (`age.Encrypt`, `age.Decrypt`) rather than internal state. The `testIdentity` in `age_test.go:327` is an exception — it tests identity ordering behavior — but this is more about protocol behavior than implementation.

## Architectural Decisions

1. **testscript for CLI integration** — Uses `github.com/rogpeppe/go-internal/testscript` to write shell-like test scripts in `.txt` files. This provides excellent integration test coverage for the CLI without complex setup (`cmd/age/age_test.go:19-39`).

2. **External test vectors** — Cryptographic primitives are tested against official test vectors from `c2sp.org/CCTV/age` (`testkit_test.go:28`), ensuring compliance with the age specification.

3. **Minimal mocks** — Rather than building elaborate mock infrastructure, age uses real cryptographic primitives in tests. When test doubles are needed, they're defined inline in test files as minimal implementations of interfaces.

4. **Parallel test execution** — `testkit_test.go:43` uses `t.Parallel()` for test vector execution, and `stream_test.go` has extensive parallel tests (`stream_test.go:778-905`).

## Notable Patterns

- **Table-driven subtests** — Tests like `TestParseIdentities` (`age_test.go:230-260`) use structs to define multiple test cases run via `t.Run()`.
- **Example functions** — Go example functions document API usage and serve as regression tests (`age_test.go:23-121`).
- **Build tags for conditional compilation** — `testkit_test.go:5` uses `//go:build go1.18` to guard newer test functionality.
- **Test-only package variables** — `cmd/age/age_test.go:22-26` uses `testOnlyConfigureScryptIdentity` and `testOnlyFixedRandomWord` to control test behavior without exposing test controls in production.

## Tradeoffs

1. **No mock package** — Age doesn't have a dedicated mock infrastructure. Tests requiring isolation use inline test types. This keeps the codebase simple but requires duplicating test types across test files.

2. **testscript complexity** — While powerful, `testscript` tests can be harder to debug than standard Go tests due to their script-based nature. The trade-off is excellent CLI coverage.

3. **External test vector dependency** — The `c2sp.org/CCTV/age` module is an external dependency for test vectors. Changes to that module can break age's tests.

## Failure Modes / Edge Cases

1. **Truncated ciphertext** — `stream_test.go:676-706` tests detection of truncated files.
2. **Corrupted chunks** — `stream_test.go:908-951` tests corrupted first and final chunks.
3. **Wrong keys** — `stream_test.go:595-629` tests decryption failure with wrong keys.
4. **Empty files** — `stream_test.go:414-467` tests empty ciphertext handling.
5. **Concurrent access** — `stream_test.go:746-906` tests parallel reads across chunks.
6. **Invalid file sizes** — `stream_test.go:631-674` tests wrong-size ciphertext detection.

## Future Considerations

- Consider a dedicated `mock/` package if test duplication becomes problematic.
- The `testscript` approach could be expanded to cover more edge cases.
- Property-based testing could complement the existing test vectors.

## Questions / Gaps

1. No clear evidence of fuzz testing — while age has extensive test vectors, no fuzz tests were found in the codebase.
2. Performance testing is not evident — no benchmarks found.
3. The `testIdentity` at `age_test.go:327` is used to verify native identity ordering but the test is fairly narrow in scope.

---

Generated by `study-areas/11-testing-strategy.md` against `age`.