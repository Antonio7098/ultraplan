# Repo Analysis: dive

## Testing Strategy

### Repo Info

| Field | Value |
|-------|-------|
| Name | dive |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/dive` |
| Group | `11-testing-strategy` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

The dive project demonstrates a well-structured multi-layered testing approach with strong golden snapshot testing, decent unit test coverage for core algorithms, and integration-level CLI command tests. Tests focus on behavior over implementation details, using snapshots to capture output and real Docker image archives as fixtures. The testing infrastructure is automated via Makefile/Taskfile with clear separation between unit and CLI test targets.

## Rating

**7/10** — Strong unit + integration patterns with effective golden tests, though mocking is minimal (relies on real fixtures) and some areas (e.g., UI viewmodel) use snapshot files that could be brittle.

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Test organization | Table-driven subtests in `Test_Build_Dockerfile`, `Test_Build_CI_gate_fail` | `cmd/dive/cli/cli_build_test.go:13,50` |
| Golden tests | Snapshot files in `testdata/snapshots/` using `go-snaps` | `cmd/dive/cli/testdata/snapshots/cli_build_test.snap:1` |
| Test helpers | `TestLoadArchive` and `TestAnalysisFromArchive` helper functions | `dive/image/docker/testing.go:12,23` |
| Integration tests | Full command execution via `getTestCommand()` + `rootCmd.Execute()` | `cmd/dive/cli/cli_build_test.go:15-18` |
| Snapshot testing | `snaps.MatchSnapshot()` and `snaps.MatchJSON()` calls | `cmd/dive/cli/cli_build_test.go:18` |
| Test coverage threshold | 25% coverage threshold enforced via script | `Taskfile.yaml:179` |
| CI test data | Real Docker tar archives in `.data/test-*-image.tar` | `.github/workflows/validations.yaml:64` |
| CLI tests separation | Unit tests exclude CLI package; CLI tests run separately | `Taskfile.yaml:176,185-188` |
| Error path testing | Tests for invalid dockerfile and nonexistent paths | `cmd/dive/cli/cli_build_test.go:64-90` |
| TestMain setup | Global test initialization with color disabling and snapshot config | `cmd/dive/cli/cli_test.go:28-46` |

## Answers to Protocol Questions

### 1. Are commands integration tested?

Yes. CLI commands are integration tested via `getTestCommand()` which creates a full `cobra.Command` and calls `Execute()`. Tests like `Test_Build_Dockerfile` (`cmd/dive/cli/cli_build_test.go:13-27`) run actual build commands with real Dockerfile contexts. The CI configuration runs the actual binary against real Docker images (`Taskfile.yaml:285-301`).

### 2. Are golden tests used?

Yes, extensively. The project uses `github.com/gkampitakis/go-snaps` for snapshot testing. Golden files exist in `cmd/dive/cli/testdata/snapshots/` with names like `cli_build_test.snap`, `cli_ci_test.snap`, `cli_config_test.snap`, `cli_json_test.snap`. The CI acceptance tests also compare against known JSON output (`validations.yaml:63`). Snapshots capture complete command output including analysis results and error messages.

### 3. How are mocks structured?

No traditional mocks found. The project uses real fixtures instead:
- Real Docker image archives in `.data/*.tar` for testing image analysis
- `docker.TestAnalysisFromArchive()` helper loads actual archive files (`dive/image/docker/testing.go:12-34`)
- The `ci/evaluator_test.go` uses `docker.TestAnalysisFromArchive(t, repoPath(t, ".data/test-docker-image.tar"))` to get real analysis data (`cmd/dive/cli/internal/command/ci/evaluator_test.go:18`)

This approach avoids mock maintenance but requires real test data files.

### 4. Is behavior tested or implementation details?

**Behavior is tested**, with some snapshot brittleness:
- Tests verify output strings, exit codes, and JSON structures rather than internal state
- `cli_build_test.go` asserts on error messages like "could not find Containerfile or Dockerfile" and docker output content (`cmd/dive/cli/cli_build_test.go:67,84`)
- File tree tests verify tree string representation and node diff types, which are behavioral (`dive/filetree/file_tree_test.go:58-60`)
- Snapshot tests in `filetree_test.go` compare rendered output strings (`cmd/dive/cli/internal/ui/v1/viewmodel/filetree_test.go:103`), which could be considered implementation detail

## Architectural Decisions

- **Snapshot testing adoption**: The project chose `go-snaps` over custom golden file readers, providing a clean `MatchSnapshot()` API with update flags (`cmd/dive/cli/cli_test.go:37-40`)
- **Real Docker images as fixtures**: Instead of mock Docker APIs, tests use actual `.tar` archives, requiring CI to have Docker available but ensuring realistic testing
- **Test data in repo**: Test images (`.data/` directory) are stored in the repository rather than downloaded at test time
- **Two-layer test organization**: Unit tests exclude the CLI package (`Taskfile.yaml:176`), which has its own test target (`Taskfile.yaml:185-188`)
- **TestMain for global setup**: Colors are disabled via `lipgloss.SetColorProfile(termenv.Ascii)` to ensure consistent snapshot output (`cmd/dive/cli/cli_test.go:34-35`)

## Notable Patterns

- **Subtest naming**: Uses Go subtests with descriptive names (e.g., `"implicit dockerfile"`, `"explicit file flag"`) for clear test output
- **Helper functions**: `repoPath()`, `repoRoot()`, `Capture()`, `getTestCommand()` reduce duplication across test files
- **Environment variable control**: `DIVE_CONFIG` env var controls CI mode per-test (`cmd/dive/cli/cli_test.go:76-81`)
- **Snapshot directory convention**: Snapshots stored in `testdata/snapshots/` alongside relevant test files
- **Repo root caching**: `atomic.String` cache for `repoRoot()` avoids repeated `git rev-parse` calls (`cmd/dive/cli/cli_test.go:25`)
- **Coverage enforcement**: Python script enforces 25% minimum coverage threshold (`Taskfile.yaml:182`)

## Tradeoffs

- **Real fixtures vs mocks**: Using real Docker image archives avoids mock maintenance but bloats repo size and may miss edge cases not present in fixtures
- **Snapshot testing brittleness**: Viewmodel tests use string comparison of rendered output (`cmd/dive/cli/internal/ui/v1/viewmodel/filetree_test.go:103-104`), which can break with unrelated UI changes
- **No interface mocking**: Without mock implementations, some tests may be slow or require external dependencies (Docker)
- **Update flag safety**: The `-update` snapshot flag is guarded by `TestUpdateSnapshotDisabled` checks to prevent accidental commits (`cmd/dive/cli/cli_test.go:49-51`)

## Failure Modes / Edge Cases

- **Missing test data**: `helperLoadBytes()` fails fatally if snapshot file is missing (`cmd/dive/cli/internal/ui/v1/viewmodel/filetree_test.go:47`)
- **Color code sensitivity**: Tests disable colors to avoid snapshot divergence (`cmd/dive/cli/cli_test.go:34-35`), but this must be maintained
- **Docker-dependent CI**: Acceptance tests require Docker runtime (`Taskfile.yaml:285-301`)
- **Absolute path handling**: `getTestCommand()` uses environment variables and relative paths that could behave differently across platforms
- **Archive format compatibility**: Tests use specific Docker archive formats; OCI format tests exist but may miss compatibility issues

## Future Considerations

- Consider adding interface-based mocks for Docker operations to enable faster unit tests without requiring Docker
- Viewmodel snapshot tests could be refactored to test behavior rather than string representation
- Expand golden test coverage for error paths and edge cases
- Consider adding property-based testing for core algorithms (filetree, diffing)

## Questions / Gaps

- No evidence of fuzz testing found
- No benchmarks found for performance-critical paths
- Limited evidence of race condition testing
- No mutation testing observed
- Test coverage is only enforced at 25% threshold, which is relatively low

---

Generated by `study-areas/11-testing-strategy.md` against `dive`.