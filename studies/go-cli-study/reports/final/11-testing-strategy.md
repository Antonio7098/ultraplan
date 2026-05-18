# Testing Strategy - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Protocol | `study-areas/11-testing-strategy.md` |
| Groups | go-cli-study |
| Date | 2026-05-15 |

## Repositories Studied

| # | Repo | Path | Group |
|---|------|------|-------|
| 1 | age | `/home/antonioborgerees/coding/go-cli-study/repos/age` | go-cli-study |
| 2 | chezmoi | `/home/antonioborgerees/coding/go-cli-study/repos/chezmoi` | 11-testing-strategy |
| 3 | dive | `/home/antonioborgerees/coding/go-cli-study/repos/dive` | 11-testing-strategy |
| 4 | fzf | `/home/antonioborgerees/coding/go-cli-study/repos/fzf` | fzf |
| 5 | gdu | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` | 11-testing-strategy |
| 6 | gh-cli | `/home/antonioborgerees/coding/go-cli-study/repos/gh-cli` | gh-cli |
| 7 | go-task | `/home/antonioborgerees/coding/go-cli-study/repos/go-task` | go-task |
| 8 | helm | `/home/antonioborgerees/coding/go-cli-study/repos/helm` | 11-testing-strategy |
| 9 | k9s | `/home/antonioborgerees/coding/go-cli-study/repos/k9s` | go-cli-study |
| 10 | lazygit | `/home/antonioborgerees/coding/go-cli-study/repos/lazygit` | 11-testing-strategy |
| 11 | mitchellh-cli | `/home/antonioborgerees/coding/go-cli-study/repos/mitchellh-cli` | go-cli-study |
| 12 | opencode | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` | 11-testing-strategy |
| 13 | rclone | `/home/antonioborgerees/coding/go-cli-study/repos/rclone` | 11-testing-strategy |
| 14 | restic | `/home/antonioborgerees/coding/go-cli-study/repos/restic` | go-cli-study |
| 15 | urfave-cli | `/home/antonioborgerees/coding/go-cli-study/repos/urfave-cli` | go-cli-study |
| 16 | yq | `/home/antonioborgerees/coding/go-cli-study/repos/yq` | yq |

## Executive Summary

Elite Go CLI projects converge on three testing practices: table-driven subtests as the universal organization pattern, integration tests that execute the actual CLI binary or a full command pipeline, and behavior-focused assertions over implementation detail checking. Divergence appears in mock infrastructure maturity (centralized vs ad-hoc), golden file usage for output regression prevention, and the degree to which tests exercise end-to-end CLI behavior vs narrowly scoped unit tests. Projects with scores 8+ typically exhibit at least two of three: comprehensive golden test coverage, well-organized mock infrastructure, and genuine CLI integration tests.

## Core Thesis

Go CLI testing strategy falls into three tiers. **Tier 1 (scores 8-10)** repos use `testscript`/`txtar` or equivalent frameworks for CLI integration testing, golden files for output regression prevention, and centralized mock packages with compile-time interface verification. **Tier 2 (scores 6-7)** repos have decent unit test coverage but lack golden tests, integration tests are narrower in scope, or mocks are ad-hoc rather than systematically organized. **Tier 3 (scores 1-5)** repos have sparse tests covering only library internals, no CLI integration tests, and no mock infrastructure—typically because testing was deprioritized during initial development.

## Rating Summary

| Repo | Score | Approach | Main Strength | Main Concern |
|------|-------|----------|---------------|--------------|
| age | 8/10 | testscript + real primitives | External test vectors + CLI integration | No dedicated mock package |
| chezmoi | 9/10 | testscript + vfsted golden tests | Exceptional test infrastructure | Complexity may overwhelm small teams |
| dive | 7/10 | Snapshot testing + real Docker fixtures | Golden snapshots + CLI integration | Snapshot brittleness on UI changes |
| fzf | 8/10 | Go unit + Ruby tmux integration | Dual-layer interactive testing | Ruby dependency for CI |
| gdu | 7/10 | Internal test packages + real fs | Compile-time interface verification | No golden tests, TUI screen brittle |
| gh-cli | 8/10 | testscript + moq + httpmock | Dual-layer HTTP mocking + acceptance | Regex output assertions fragile |
| go-task | 8/10 | goldie + functional options + mockery | Golden fixtures + cross-platform normalization | Real executor vs mocks tradeoff |
| helm | 8/10 | Golden files + centralized fake kube | Shared golden infrastructure + action fixture | Some tests leak implementation details |
| k9s | 7/10 | Table-driven + local mocks | Centralized mock package + benchmarks | Hint count brittleness, no golden tests |
| lazygit | 8/10 | FakeCmdObjRunner + PTY integration | Fake git runner + headless GUI testing | No golden files, flakiness retries |
| mitchellh-cli | 5/10 | Table-driven + inline golden constants | Well-organized mocks | No CLI integration, library-only tests |
| opencode | 3/10 | Minimal unit tests | None identified | Sparse coverage, no mocks, no integration |
| rclone | 8/10 | Golden bisync + centralized mocks | Bisync scenario-driven golden tests | Mock simplicity, timing-sensitive tests |
| restic | 8/10 | Tar fixtures + functional field mocks | Backend wrapping + tar fixtures | Golden tests limited to data package |
| urfave-cli | 8/10 | Table-driven + golden fish completion | Full command lifecycle testing | Some implementation detail tests |
| yq | 8/10 | expressionScenario DSL + shell acceptance | Centralized test runner + doc gen | Limited golden files, no mocks |

## Approach Models

### Model A: testscript Integration Layer

Used by: **age**, **chezmoi**, **gh-cli**, **go-task**

These repos use `github.com/rogpeppe/go-internal/testscript` with `.txtar` (chezmoi, gh-cli) or `.txt` (age) script files that execute the actual CLI and verify stdout/stderr against embedded expectations. This provides genuine end-to-end CLI testing without spawning separate processes.

- `chezmoi/internal/cmd/main_test.go:64-174` — txtar script execution with custom commands
- `gh-cli/acceptance/acceptance_test.go:26-29` — testscript with custom `replace`, `stdout2env`, `defer`
- `go-task/task_test.go:25` — goldie integration with `testscript`

### Model B: Centralized Mock Infrastructure

Used by: **chezmoi**, **gh-cli**, **go-task**, **k9s**, **rclone**, **restic**, **helm**

These repos maintain dedicated mock packages or directories with generated or hand-written mocks that implement key interfaces, verified at compile time.

- `chezmoi/internal/chezmoi/mockpersistentstate.go:4-89` — full PersistentState mock
- `gh-cli/internal/prompter/prompter.go:16` — moq-generated mocks via `//go:generate`
- `go-task/internal/fingerprint/checker_mock.go:1-3` — mockery-generated mocks
- `helm/pkg/kube/fake/printer.go:32` — layered fake kube clients
- `rclone/fstest/mockfs/mockfs.go:31` — mock Fs implementation

### Model C: Golden File Regression Prevention

Used by: **chezmoi**, **dive**, **go-task**, **helm**, **rclone**, **urfave-cli**, **restic** (selectively)

These repos store expected output in fixture files (often `testdata/` or `golden/` directories) and compare actual output against them, with update flags for when behavior legitimately changes.

- `dive/cmd/dive/cli/testdata/snapshots/cli_build_test.snap:1` — go-snaps snapshots
- `go-task/task_test.go:166-169` — goldie with `NormalizedEqual`
- `helm/internal/test/test.go:43` — `AssertGoldenString()` with `-update` flag
- `rclone/cmd/bisync/bisync_test.go:1435-1479` — bisync golden comparison engine

### Model D: Minimal Mock / Real Fixture

Used by: **fzf**, **dive**, **gdu**, **mitchellh-cli**, **yq**, **opencode**

These repos use real implementations (Docker archives, temp directories, actual binaries) rather than mocks, or use trivial stub implementations defined inline. Tests are behavior-focused but may be slower or require external dependencies.

- `fzf/test/test_core.rb:6-13` — Ruby tmux integration tests
- `dive/dive/image/docker/testing.go:12-34` — real Docker archive loading
- `gdu/internal/testdir/test_dir.go:9` — real temp directory creation
- `yq/pkg/yqlib/operators_test.go:76-153` — expressionScenario DSL

### Model E: Sparse / Pre-Production

Used by: **opencode** (3/10), **mitchellh-cli** (5/10)

These repos have tests only for core library internals or basic structure. CLI commands, agent loops, and provider interactions are untested. Testing was clearly deprioritized relative to feature development.

- `opencode` has 4 test files covering ~4% of the codebase (`internal/tui/theme/theme_test.go:1-89`)
- `mitchellh-cli` tests CLI routing but never executes real commands (`cli_test.go:85-112`)

## Pattern Catalog

### Pattern 1: testscript CLI Integration

**What**: Script-based integration tests that execute CLI commands and verify output.
**Repos**: chezmoi (txtar), age (txt), gh-cli (txtar), go-task (integrated)
**Why it works**: Combines the reproducibility of unit tests with the coverage of end-to-end testing. Scripts serve as documentation of expected behavior.
**When to copy**: When the CLI has complex workflows, multiple commands, or output that should be regression-tested.
**When overkill**: Simple single-command CLIs with obvious behavior, or when the team lacks familiarity with testscript.

### Pattern 2: Centralized Mock Package

**What**: Dedicated `mock/`, `mocks/`, or `*_mock.go` files with interface implementations.
**Repos**: chezmoi (`MockPersistentState`), gh-cli (`moq` generation), helm (`pkg/kube/fake/`), rclone (`fstest/mockfs/`), restic (`internal/backend/mock/backend.go`)
**Why it works**: Single source of truth for mock implementations; changes to interfaces require regenerating mocks; compile-time verification prevents drift.
**When to copy**: When multiple packages need to mock the same dependency (e.g., Kubernetes client, filesystem).
**When overkill**: Small projects with few dependencies or when mocks are used only once.

### Pattern 3: Golden File Output Comparison

**What**: Stored fixture files compared against actual output during tests.
**Repos**: dive (go-snaps), go-task (goldie), helm (AssertGoldenString), rclone (bisync), chezmoi (txtar inline)
**Why it works**: Catches unintended output changes during refactoring; update flags allow legitimate changes.
**When to copy**: When CLI output is user-facing (help text, formatted data, completion scripts) and should not change unexpectedly.
**When overkill**: When output is highly dynamic or when golden file maintenance burden exceeds the value of regression protection.

### Pattern 4: Fake/Stub Command Runner

**What**: A fake implementation of the command-running interface that records calls without executing the real command.
**Repos**: lazygit (`FakeCmdObjRunner`), mitchellh-cli (`MockCommand`), k9s (local mocks)
**Why it works**: Enables testing command logic in isolation without side effects; records argument sequences for verification.
**When to copy**: When testing git-like operations that modify repository state, or when real command execution is slow.
**When overkill**: When command execution is fast and isolated enough to use real commands.

### Pattern 5: Test Fixture Extraction

**What**: Pre-packaged tar.gz or directory fixtures loaded at test setup.
**Repos**: restic (`testdata/backup-data.tar.gz`), dive (`.data/test-*-image.tar`), rclone (scenario directories)
**Why it works**: Provides reproducible test state without embedding large binary data in source; supports realistic test scenarios.
**When to copy**: When testing operations on complex file hierarchies, repositories, or archives.
**When overkill**: When test fixtures would be large and infrequently changed, or when real-time generation is fast enough.

### Pattern 6: Functional Options for Test Configuration

**What**: Builder pattern using functional options to configure test subjects.
**Repos**: go-task (`WithExecutorOptions`, `WithPostProcessFn`), chezmoi (`newTestConfig`), restic (backend wrapping)
**Why it works**: Allows flexible test composition without proliferating constructor parameters; tests can override specific behaviors.
**When to copy**: When test subjects have many configuration dimensions or optional behaviors.
**When overkill**: Simple test objects with few configuration needs.

### Pattern 7: Virtual Filesystem Isolation

**What**: In-memory or virtual filesystem implementations for test isolation.
**Repos**: chezmoi (`vfst.NewTestFS`), gdu (`testdir.CreateTestDir()`)
**Why it works**: Avoids temp directory cleanup issues, improves test speed, enables reproducible filesystem state.
**When to copy**: When tests operate on filesystems and temp directory management is causing flakiness.
**When overkill**: When real filesystem access is a key test dimension (e.g., testing actual file permissions).

## Key Differences

### CLI Integration Depth

**True CLI integration** (testscript, spawned binary): chezmoi, age, gh-cli, go-task, rclone (cmdtest), dive (getTestCommand), fzf (Ruby tmux), yq (shell acceptance)

**Command-level integration** (running commands in-process via `cmd.Run()`): gdu (runApp helper), helm, restic, urfave-cli, lazygit (TestDriver with PTY)

**Library-only unit tests** (no real command execution): mitchellh-cli, opencode, k9s (partially)

The difference matters for trust in refactoring: integration-tested CLI behavior can be refactored with confidence that user-visible outcomes don't change. Library-only tests cannot detect CLI-level regressions.

### Mock Philosophy

**Interface-based generated mocks** (moq, mockery): gh-cli, go-task
**Interface-based hand-written mocks**: chezmoi, helm, rclone, lazygit
**Functional field mocks**: restic (`Backend` with `SaveFn`, `ListFn`)
**Inline stub implementations**: age, fzf, dive, mitchellh-cli, yq
**No mocks (real resources)**: opencode, gdu (partially)

Functional field mocks (restic pattern) are more explicit about what's implementable vs. returning errors, while interface-based mocks enable standard testify/mock call verification.

### Golden File Strategy

**Used extensively**: helm, go-task, rclone (bisync), dive, chezmoi
**Used selectively** (data algorithms only): restic, yq (doc gen)
**Not used**: fzf, gdu, k9s, lazygit, mitchellh-cli, opencode, age, gh-cli (output)

Repos without golden tests rely on regex/substring output matching (gh-cli `ExpectLines`) or inline string constants (mitchellh-cli). This is more flexible but less protected against unintended output changes.

### Behavior vs. Implementation Testing

**Behavior-focused**: chezmoi, age (round-trip tests), dive (output strings + exit codes), gh-cli, restic

**Mixed with some implementation detail leakage**: k9s (hint counts), urfave-cli (stringifyFlag), fzf (cache key format), yq (chown permission changes)

**Library-only focus**: mitchellh-cli, opencode

The k9s hint count tests (`internal/view/pod_test.go:23` — `assert.Len(t, po.Hints(), 19)`) are the clearest anti-pattern: they test a UI internal that changes when keyboard shortcuts are updated but doesn't affect user-facing functionality.

## Tradeoffs

### testscript vs. go test -run

**Benefit of testscript**: Scripts are self-documenting, executable by non-Go developers, and test the actual CLI binary. Custom commands enable complex setup/teardown.

**Cost**: Additional dependency, learning curve, less familiar to contributors used to standard Go testing. Debugging is harder (scripts vs. Go code).

**Best-fit context**: CLIs with complex workflows, multi-command scenarios, or when non-developers should be able to read/write tests.

**Failure mode**: Custom commands become test infrastructure that must be maintained; testscript failures can be opaque.

### Golden files vs. inline assertions

**Benefit of golden files**: Output changes are immediately visible in diffs; tests are more stable against minor formatting changes; non-developers can review changes.

**Cost**: Must remember to run with `-update` when behavior legitimately changes; stale golden files mask bugs; large golden diffs obscure review.

**Best-fit context**: User-facing output (help text, completion scripts, formatted data) that should not change unexpectedly.

**Failure mode**: Accidental commit of regenerated golden files when behavior legitimately changed; developers ignoring golden diffs.

### Real fixtures vs. mocks

**Benefit of real fixtures**: More realistic, catches bugs that mocks wouldn't; no mock maintenance burden.

**Cost**: Slower tests, larger repo size, fixtures may drift from real-world scenarios, harder to test edge cases.

**Best-fit context**: When real dependencies are fast and reproducible (local files, archives) or when testing against real external systems is a goal.

**Failure mode**: Tests become flaky due to environment differences; CI requires more resources; edge cases not present in fixtures go untested.

### Centralized mocks vs. inline stubs

**Benefit of centralized mocks**: Consistency, single update point, easier to verify interface compliance.

**Cost**: May be over-engineered for simple cases; requires build tooling (go generate).

**Best-fit context**: Projects with multiple packages needing to mock the same interfaces.

**Failure mode**: Mock interface doesn't match real implementation; generated files in VCS cause merge conflicts.

## Decision Guide

**Q: Should I use testscript for CLI integration testing?**
A: Yes, if your CLI has multi-step workflows, your team is comfortable with the framework, and you want executable documentation of CLI behavior. No, if your CLI is simple or your team is unfamiliar with testscript.

**Q: Should I use golden files for output comparison?**
A: Yes, for user-facing output that should not change unexpectedly. No, for highly dynamic output or internal APIs where test readability matters more than regression protection.

**Q: Should I mock external dependencies or use real fixtures?**
A: Mock when isolation matters, external calls are slow, or you need to test edge cases that real systems wouldn't produce. Use real fixtures when realism matters more than isolation, or when real systems are fast and reproducible.

**Q: How should I organize my mocks?**
A: If you have multiple packages mocking the same interfaces, centralize in a `mock/` package. If mocking is ad-hoc and per-package, inline stubs are acceptable if they're simple and few.

**Q: Should tests verify behavior or implementation?**
A: Verify behavior for user-facing outcomes (output, exit codes, API calls). Implementation detail testing is acceptable for critical internal contracts that, if violated, would cause obvious failures—but document why the internal detail matters.

## Practical Tips

1. **Start with table-driven subtests** — `t.Run(tc.name, func(t *testing.T) {...})` is the universal pattern across all elite repos. Use descriptive names for selective execution via `go test -run`.

2. **Use golden files for CLI output** — Store expected output in `testdata/` or `golden/` directories. Implement an `-update` flag to regenerate when behavior legitimately changes.

3. **Invest in a test helper package** — Repos like chezmoi (`internal/chezmoitest/`), restic (`internal/test/`), and helm (`internal/test/`) demonstrate that shared test utilities pay off quickly. Common helpers: temp dir creation, assertion wrappers, fixture loading.

4. **Prefer behavior assertions over state inspection** — Test `stdout.String()` contains expected output rather than inspecting internal maps. Test exit codes rather than internal error variables.

5. **Use compile-time interface checks** — `var _ Interface = &MockStruct{}` in mock files prevents drift between mock and interface as code evolves.

6. **Consider testscript for CLI integration** — The `testscript` framework handles environment setup, file creation, stdout/stderr capture, and timeout management. Custom commands can encapsulate complex test scenarios.

7. **Separate unit and integration test concerns** — Use build tags (`//go:build integration`), `testing.Short()` checks, or naming conventions (`*_int_test.go`) to separate fast unit tests from slower integration tests.

8. **Document test-only configuration** — Use `testOnly*` prefixed variables (age pattern at `cmd/age/age_test.go:22-26`) to expose test controls without polluting production APIs.

## Anti-Patterns / Caution Signs

1. **Hint count assertions** — Tests asserting `assert.Len(t, po.Hints(), 19)` (k9s pattern at `internal/view/pod_test.go:23`) will break whenever UI configuration changes, even if functionality is correct.

2. **Fragile regex output matching** — `test.ExpectLines` using regex patterns like `1[\t]+number won` (gh-cli at `pkg/cmd/issue/list/list_test.go:88-91`) can match unintended text and fail on formatting changes that don't affect data content.

3. **Unprotected golden file updates** — No mechanism to prevent accidental golden file regeneration when behavior legitimately changes. Rely on developer discipline and code review.

4. **Inline string fixtures** — Expected outputs stored as `const` values in test files (mitchellh-cli at `cli_test.go:1586-1614`) make large fixture changes hard to review and are invisible to non-Go contributors.

5. **Sparse test coverage with no plan** — opencode's 4 test files covering ~4% of the codebase with no documented plan to expand suggests testing was abandoned. This accumulates technical debt rapidly.

6. **No test isolation for global state** — Tests that modify global state (exit handlers, environment variables, working directory) without cleanup can cause inter-test dependencies. Always use `t.Setenv()` and `t.Cleanup()`.

7. **Real external dependencies in unit tests** — Tests that require Docker (dive), network access, or specific OS environments without build tag protection will fail unpredictably in some CI environments.

## Notable Absences

### Fuzz Testing

Only `age` and `restic` show any fuzz testing patterns, and those are limited. No repo has comprehensive fuzz coverage for CLI argument parsing, file format handling, or template evaluation. This is a common gap across all 16 repos studied.

### Performance Benchmarking

Only k9s (`BenchmarkContainerRender`), rclone, and restic show benchmark tests. Most repos do not measure or regress test performance for critical paths. This is a missed opportunity for identifying slow tests before they become problematic.

### Mutation Testing

No evidence of mutation testing tools (`mutate`, `gomin`) across any repo. The ecosystem lacks feedback on whether tests actually catch bugs or are just present for coverage metrics.

### Property-Based Testing

Only chezmoi's `requireEvaluateAll` hint suggests property-based testing ideas. No repo uses `testing/quick` or `gopteral` for systematic edge case discovery in algorithms.

## Per-Repo Notes

| Repo | Notable Strength | Notable Gap |
|------|------------------|-------------|
| age | External test vectors for cryptographic correctness | No dedicated mock package |
| chezmoi | Exceptional test infrastructure breadth | High complexity may overwhelm contributors |
| dive | Snapshot testing + real Docker fixtures | Snapshot brittleness on UI changes |
| fzf | Dual-layer Go/Ruby testing | Ruby dependency for CI |
| gdu | Compile-time interface verification | No golden tests, TUI screen brittle |
| gh-cli | Dual-layer HTTP mocking + acceptance | Regex output assertions fragile |
| go-task | Golden fixtures + cross-platform normalization | Real executor vs mocks tradeoff |
| helm | Shared golden infrastructure | Some tests leak implementation details |
| k9s | Centralized mock package | Hint count brittleness, no golden tests |
| lazygit | FakeCmdObjRunner isolation | No golden files, flakiness retries |
| mitchellh-cli | Well-organized mocks | No CLI integration, library-only |
| opencode | None | Sparse coverage, no mocks, no integration |
| rclone | Bisync scenario-driven golden tests | Mock simplicity, timing-sensitive |
| restic | Backend wrapping + tar fixtures | Golden tests limited to data package |
| urfave-cli | Full command lifecycle testing | Some implementation detail tests |
| yq | Centralized test runner + doc gen | Limited golden files, no mocks |

## Open Questions

1. **Is testscript worth the added complexity?** Repos like age and go-task show it enables genuine CLI integration testing, but the learning curve and debugging opacity are real costs. When does the benefit exceed the cost?

2. **Should golden files be commit-reviewed?** Most repos treat golden file regeneration as a developer responsibility. Should there be a review requirement or automated check that golden diffs are intentional?

3. **How should CLIs test TUI/g GUI behavior?** lazygit's PTY-based approach is powerful but Windows-incompatible. dive's snapshot testing captures output but can be brittle. Is there a better pattern for TUI testing?

4. **What is the right mock density?** repos like restic use functional field mocks that are more explicit but verbose. Interface-based mocks (gh-cli, go-task) are more standard but may not capture all behavioral nuances. How do we choose?

5. **Should CLI frameworks provide test utilities?** urfave-cli and mitchellh-cli are CLI frameworks. Should they provide standardized mock infrastructure, golden file helpers, and integration test patterns as part of the framework?

## Evidence Index

- `chezmoi/internal/cmd/main_test.go:64-174` — txtar script execution
- `chezmoi/internal/chezmoitest/chezmoitest.go:86-92` — vfst virtual filesystem
- `chezmoi/internal/chezmoi/mockpersistentstate.go:4-89` — MockPersistentState
- `dive/cmd/dive/cli/cli_build_test.go:13-27` — snapshot testing
- `dive/dive/image/docker/testing.go:12-34` — real Docker archive loading
- `fzf/test/test_core.rb:6-13` — Ruby tmux integration
- `gdu/cmd/gdu/app/app_test.go:682` — runApp integration helper
- `gh-cli/acceptance/acceptance_test.go:26-29` — testscript acceptance
- `gh-cli/internal/prompter/prompter.go:16` — moq mock generation
- `gh-cli/pkg/httpmock/stub.go:35-199` — HTTP mocking
- `go-task/task_test.go:166-169` — goldie with normalization
- `go-task/internal/fingerprint/checker_mock.go:1-3` — mockery mocks
- `helm/internal/test/test.go:43` — AssertGoldenString
- `helm/pkg/kube/fake/printer.go:32` — PrintingKubeClient
- `k9s/internal/view/pod_test.go:23` — hint count assertion (caution example)
- `lazygit/pkg/commands/oscommands/fake_cmd_obj_runner.go:17-26` — FakeCmdObjRunner
- `lazygit/pkg/integration/clients/go_test.go:81` — PTY integration runner
- `mitchellh-cli/cli_test.go:85-112` — MockCommand testing
- `mitchellh-cli/cli_test.go:1586-1614` — inline string fixtures
- `opencode/internal/tui/theme/theme_test.go:1-89` — sparse test coverage
- `rclone/cmd/bisync/bisync_test.go:1435-1479` — bisync golden comparison
- `rclone/fstest/mockfs/mockfs.go:31-62` — mock Fs
- `restic/internal/backend/mock/backend.go:14-26` — functional field mock
- `restic/cmd/restic/integration_helpers_test.go:188-235` — withTestEnvironment
- `urfave-cli/fish_test.go:41` — golden file comparison
- `yq/pkg/yqlib/operators_test.go:76-153` — expressionScenario runner

---

Generated by protocol `study-areas/11-testing-strategy.md`.