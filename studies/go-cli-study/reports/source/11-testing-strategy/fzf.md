# Repo Analysis: fzf

## Testing Strategy

### Repo Info

| Field | Value |
|-------|-------|
| Name | fzf |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/fzf` |
| Group | `fzf` |
| Language / Stack | Go (core) + Ruby (integration tests) |
| Analyzed | 2026-05-15 |

## Summary

fzf employs a dual-layer testing strategy: Go unit tests for algorithmic/core components and Ruby-based shell integration tests using tmux for full interactive testing. The project demonstrates strong coverage of behavior through extensive test suites, with good separation between unit tests (which test algorithms, parsing, and core data structures) and integration tests (which test the full CLI behavior including shell integration).

## Rating

**8/10** — Strong testing ecosystem with comprehensive coverage. The dual-layer approach (Go unit + Ruby integration) is well-implemented.扣分点：No golden file tests, limited mock structures, some tests may be coupled to implementation.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Unit test organization | Table-driven tests with helper functions | `src/algo/algo_test.go:16-44` |
| Unit test organization | Subtests using `t.Run()` patterns | `src/options_test.go:519-539` |
| Integration test setup | Ruby test suite using tmux for interactive testing | `test/test_core.rb:6-13` |
| Test helper packages | Common test utilities in `test/lib/common.rb` | `test/lib/common.rb:1-333` |
| Go unit tests | 23 `*_test.go` files in `src/` directory | `src/*_test.go` (23 files) |
| Shell integration tests | 8 Ruby test files for shell/UI testing | `test/test_*.rb` |
| Filter/streaming tests | Non-interactive filter mode tests | `test/test_filter.rb:1-352` |
| Algorithm tests | Fuzzy matching algorithm tests | `src/algo/algo_test.go:46-220` |
| Pattern parsing tests | Query pattern parsing and caching | `src/pattern_test.go:18-202` |
| Terminal output tests | Placeholder replacement and ANSI handling | `src/terminal_test.go:31-250` |
| Options parsing tests | CLI option parsing validation | `src/options_test.go:11-571` |

## Answers to Protocol Questions

### 1. Are commands integration tested?

**Yes.** fzf uses Ruby-based tmux integration tests in `test/` directory. The `TestInteractive` class (`test/lib/common.rb:321-332`) spawns a real tmux window and simulates user interaction. Tests like `test_fzf_default_command` (`test/test_core.rb:7-13`) launch fzf interactively and verify behavior through tmux key sending.

Additional evidence:
- `test/test_shell_integration.rb` — Tests shell key bindings (Ctrl-T, Alt-C, Ctrl-R)
- `test/test_preview.rb` — Tests preview window functionality
- `test/test_layout.rb` — Tests various layout configurations
- `test/test_filter.rb` — Tests non-interactive filter mode

### 2. Are golden tests used?

**No.** No evidence of golden file tests found. The search for "golden" returned no results. Tests verify behavior through:
- Direct output comparison (e.g., `assert_equal 'hello', fzf_output`)
- Pattern matching with regex
- Observable UI state through tmux

See `test/test_filter.rb:7-9` for example:
```ruby
def test_default_extended
  assert_equal '100', `seq 100 | #{FZF} -f "1 00$"`.chomp
end
```

### 3. How are mocks structured?

**Minimal/no explicit mocks.** The codebase does not use mock libraries. Tests are largely behavioral:
- Unit tests create real objects (e.g., `newItem()` in `src/terminal_test.go:555-558`)
- Integration tests use real fzf binary invoked via shell
- Some ad-hoc helpers like `randResult()` in `src/merger_test.go:18-23` for generating test data

The grep for "mock|Mock|stub|Stub" found only one instance in code (`src/tui/tui.go:765` comment about "sparse stub") and no actual mocking infrastructure.

### 4. Is behavior tested or implementation details?

**Primarily behavior, some implementation coupling.** The test strategy leans toward behavior:
- Algorithm tests verify fuzzy matching scores and positions (`src/algo/algo_test.go:46-110`)
- Terminal tests verify placeholder replacement output (`src/terminal_test.go:31-250`)
- Integration tests verify user-facing behavior through tmux

However, some tests couple to implementation:
- `src/pattern_test.go:161-181` tests cache key format (internal representation)
- `src/options_test.go:11-46` tests internal regex parsing logic for delimiters

## Architectural Decisions

1. **Dual-layer testing**: Go unit tests for algorithms/core + Ruby tmux tests for integration. This separation allows testing both algorithmic correctness and user-facing behavior.

2. **Test helper abstraction in `test/lib/common.rb`**: Common utilities (`Tmux`, `TestBase`, `TestInteractive` classes) provide reusable infrastructure for all integration tests (`test/lib/common.rb:84-332`).

3. **Streaming filter mode testing**: The `test/test_filter.rb` tests non-interactive `-f` mode separately, allowing automated verification without tmux overhead.

4. **Ad-hoc test data builders**: Functions like `newItem()` (`src/terminal_test.go:555-558`), `buildChunks()` (`src/pattern_test.go:204-227`), and `randResult()` (`src/merger_test.go:18-23`) construct test fixtures without mock frameworks.

## Notable Patterns

1. **Table-driven algorithm tests**: `assertMatch()` and `assertMatch2()` helper functions in `src/algo/algo_test.go:16-44` provide consistent assertion format for fuzzy matching tests across multiple algorithms (FuzzyMatchV1, FuzzyMatchV2, etc.).

2. **Subtests via `t.Run()`**: Go tests use subtests for grouping related cases (e.g., `TestFuzzyMatch` iterates over multiple algorithm variants at `src/algo/algo_test.go:47`).

3. **Tmux-based interactive testing**: Integration tests spawn tmux windows and send simulated keystrokes, capturing output for verification. The `Tmux` class (`test/lib/common.rb:84-261`) encapsulates tmux interaction.

4. **FIFO-based output capture**: Integration tests use named FIFOs to capture fzf output without blocking (`test/lib/common.rb:265-305`).

5. **Conditional test execution**: Platform-specific tests use `t.SkipNow()` for Windows-incompatible tests (e.g., `src/terminal_test.go:333`).

## Tradeoffs

1. **Ruby dependency for integration tests**: Requires Ruby runtime and tmux for full test suite. This increases CI complexity but enables comprehensive interactive testing.

2. **No mock framework**: While behavior-focused tests are maintainable, inability to mock external dependencies (filesystem, process execution) means some tests have wider blast radius.

3. **Limited golden file tests**: Without golden tests, output format changes require manual test updates. However, the extensive integration test coverage mitigates this risk.

4. **Test execution speed**: tmux-based integration tests are inherently slower than pure unit tests. The `test/test_filter.rb` provides faster non-interactive alternatives for basic functionality.

## Failure Modes / Edge Cases

1. **Unicode handling**: Tests verify Unicode case normalization (`test/test_filter.rb:108-120`) and multi-byte character display (`test/test_core.rb:296-301`).

2. **Long input handling**: `test/test_filter.rb:39-45` tests 256KB line handling.

3. **Shell-specific behavior**: `test/test_shell_integration.rb` tests different shells (bash, zsh, fish) separately with shell-specific assertions.

4. **Terminal size variations**: Layout tests verify behavior across different terminal dimensions.

5. **Concurrent/parallel safety**: `src/merger_test.go` tests merger behavior with concurrent access patterns.

## Future Considerations

1. **Add golden file tests**: Consider adding golden tests for complex output transformations (e.g., ANSI color handling, placeholder expansion) to prevent regressions.

2. **Interface-based mocking**: Introduce interfaces for external dependencies (file system, process execution) to enable unit-level isolation testing.

3. **Expand error path coverage**: Current tests focus on happy paths; error and edge case coverage could be enhanced.

4. **Property-based testing**: The algorithm test suite could benefit from property-based testing (e.g., using `testing/quick`) to discover edge cases in fuzzy matching.

## Questions / Gaps

1. **No explicit mock framework**: How do contributors test components with external dependencies (network, filesystem) in isolation?

2. **Limited documentation on test philosophy**: The codebase lacks explicit documentation on testing approach and contributor guidelines.

3. **Coverage measurement**: No visible code coverage instrumentation to identify untested code paths.

4. **Integration test maintenance burden**: As the project evolves, the Ruby tmux tests may require updates for new features. Is there a strategy to reduce maintenance overhead?

---

Generated by `study-areas/11-testing-strategy.md` against `fzf`.