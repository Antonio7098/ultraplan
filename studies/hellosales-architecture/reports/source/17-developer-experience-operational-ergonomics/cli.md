# Source Analysis: cli

## Developer Experience & Operational Ergonomics

### Source Info

| Field | Value |
|-------|-------|
| Name | cli |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/cli` |
| Language / Stack | Go |
| Analyzed | 2026-05-20 |

## Summary

The GitHub CLI (`gh`) is a mature, open-source Go project with well-established developer experience patterns. It provides a devcontainer configuration for containerized development, comprehensive Makefile-based build tooling, extensive linting and testing CI/CD, and thorough onboarding documentation. The project uses standard Go tooling (go mod, go test) with no database migrations (stateless CLI), and maintains cross-platform build scripts. The AGENTS.md file serves as a living agent guide for developers.

## Rating

**8/10** — Good implementation with minor issues. The project excels at local development setup and CI/CD, but lacks explicit async/workflow debugging tooling and has no docker-compose for integrated local development (though this is expected for a CLI tool).

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| DevContainer | Go 1.25 dev container image with SSH and VS Code Go extension | `.devcontainer/devcontainer.json:2,9-15` |
| Build System | Makefile with build, test, lint, install targets | `Makefile:1-124` |
| Build Script | Cross-platform build script in Go | `script/build.go:40-72` |
| Linting | golangci-lint configuration with 21 linters enabled | `.golangci.yml:1-71` |
| CI/CD - Tests | GitHub Actions workflow running tests on ubuntu, windows, macos | `.github/workflows/go.yml:1-61` |
| CI/CD - Lint | Separate lint workflow with go mod tidy check and govulncheck | `.github/workflows/lint.yml:1-84` |
| CI/CD - Deploy | Full deployment workflow with attestations and multi-platform builds | `.github/workflows/deployment.yml:1-427` |
| Onboarding | CONTRIBUTING.md with build instructions, prerequisites, PR process | `.github/CONTRIBUTING.md:24-39` |
| Build Docs | From-source installation guide with cross-compilation | `docs/source.md:1-65` |
| Project Layout | Architecture documentation explaining command structure | `docs/project-layout.md:1-84` |
| Agent Guide | AGENTS.md with build/test/lint commands, architecture, patterns | `AGENTS.md:1-172` |
| Test Structure | Unit tests, integration tests, acceptance tests | `pkg/cmd/issue/list/list_test.go` (example) |
| Acceptance Tests | Blackbox tests using testscript framework with custom commands | `acceptance/acceptance_test.go:1-455` |
| Test Data | 100+ txtar test scripts covering commands | `acceptance/testdata/pr/pr-create-basic.txtar` |

## Answers to Dimension Questions

### 1. How quickly can a new engineer go from clone to running the full system?

A new engineer can run the full system quickly:
- Clone the repository (`git clone https://github.com/cli/cli.git`)
- Run `make` (Unix) or `go run script/build.go` (Windows)
- Binary is ready at `bin/gh`
- Prerequisites: Go 1.26+ (stated in CONTRIBUTING.md:27 and docs/source.md:3)

The `.devcontainer/devcontainer.json:2` provides a pre-configured container with Go 1.25 and VS Code Go extension, enabling one-click setup in Codespaces. The AGENTS.md:7-14 provides concise build/test/lint commands.

**Evidence**: `.github/CONTRIBUTING.md:29-37`, `docs/source.md:18-39`, `.devcontainer/devcontainer.json:1-24`

### 2. How are database schema changes tested and deployed?

Not applicable. GitHub CLI is a stateless command-line tool that interacts with GitHub's API. It has no local database requiring schema migrations. Configuration is stored in user config files (`~/.config/gh/`), not a managed database.

**Evidence**: No database, schema migration, or ORM files found in the repository.

### 3. What tooling exists for local debugging of async/workflow code?

Limited explicit async/workflow debugging tooling exists. The project uses:
- Standard Go debugging (Delve, VS Code Go debugger) — no special tooling
- `pkg/iostreams/` for I/O abstraction with TTY detection (`pkg/iostreams/iostreams.go`)
- `pkg/httpmock/` for HTTP request/response capture in tests (`pkg/httpmock/`)
- Verbose acceptance test mode (`-v` flag) showing command stdio (`acceptance/README.md:159`)

AGENTS.md does not mention async debugging or workflow inspection tools.

**Evidence**: `pkg/httpmock/`, `acceptance/README.md:159`, `pkg/iostreams/iostreams.go`

### 4. How consistent is the build across different developer machines?

High consistency through:
- `go mod` and `go.sum` for reproducible dependency resolution
- Go toolchain version pinned in `go.mod` (read from `go-version-file` in CI)
- `script/build.go` handles platform-specific executable names and cross-compilation via `GOOS`/`GOARCH`/`GOARM` env vars
- `go build -trimpath` in build script for reproducible paths
- `SOURCE_DATE_EPOCH` support for reproducible builds (`script/build.go:138-143`)
- CI runs on ubuntu, windows, macos in parallel matrix

**Evidence**: `script/build.go:58-62`, `script/build.go:138-143`, `.github/workflows/go.yml:15-16`, `Makefile:21-24`

### 5. How does the project balance developer velocity with production safety?

Strong balance achieved through:
- **Velocity**: Fast unit tests (`go test ./...`), lint check (`make lint`), easy local builds (`make`)
- **Safety**: 
  - CI runs tests with `-race` flag on all 3 platforms (`.github/workflows/go.yml:32`)
  - Separate lint workflow with `go mod tidy` enforcement, golangci-lint, govulncheck (`.github/workflows/lint.yml`)
  - GoReleaser for releases with code signing (Azure Code Signing, macOS notarization, GPG for RPMs) (`deployment.yml:97-114,133-141,260-271`)
  - Build provenance attestations using Sigstore (`deployment.yml:342-346`)
  - Acceptance tests requiring live GitHub instance (opt-in with `acceptance` build tag)
  - PRs only accepted for `help wanted` issues (`.github/CONTRIBUTING.md:5`)

**Evidence**: `.github/workflows/go.yml:32`, `.github/workflows/lint.yml:45-63`, `.github/workflows/deployment.yml:342-346`, `.github/CONTRIBUTING.md:5`

## Architectural Decisions

- **Single binary deployment**: No external runtime dependencies beyond Go toolchain, simplifying distribution and debugging.
- **Options + Factory pattern**: Every command uses an `Options` struct with a factory, enabling dependency injection and testability (`AGENTS.md:45-55`).
- **Cobra for CLI structure**: Uses `cobra` for command hierarchy, with commands residing in `pkg/cmd/<command>/<subcommand>/` (`pkg/cmd/root/root.go`).
- **testscript for acceptance tests**: Uses `go-internal/testscript` for blackbox CLI testing via `txtar` files, providing scripting capabilities for integration testing (`acceptance/acceptance_test.go:19`).
- **No database**: Stateless CLI architecture eliminates migration concerns entirely.

## Notable Patterns

- **Cross-platform build script**: `script/build.go` is itself a Go program, allowing consistent builds across Windows and Unix without shell scripts.
- **Incremental builds**: `script/build.go:42-46` checks if the binary is up to date by comparing source file modification times.
- **HTTP mocking in tests**: `pkg/httpmock/` provides registrable matchers (`REST`, `GraphQL`, `JSONResponse`, `FileResponse`) with verification (`defer reg.Verify(t)`) (`AGENTS.md:73-92`).
- **Generated mocks**: Uses `moq` for interface mocking with `//go:generate` directives (`AGENTS.md:111-113`).
- **Custom testscript commands**: Acceptance tests define `defer`, `env2upper`, `replace`, `stdout2env`, `sleep` commands for test isolation and resource cleanup (`acceptance/acceptance_test.go:258-369`).

## Tradeoffs

- **No docker-compose for local development**: The CLI tool does not require containerized services, so none is provided. Devcontainer is available but optional.
- **Acceptance tests require live GitHub instance**: Acceptance tests interact with real GitHub resources, requiring `GH_ACCEPTANCE_TOKEN` and `GH_ACCEPTANCE_ORG`, which may be a barrier for local testing (`acceptance/README.md:11-26`).
- **No explicit async debugging tooling**: While HTTP mocking exists for tests, there is no specialized tooling for inspecting async workflows or debugging background operations beyond standard Go debugging.
- **Build cache only**: The incremental build checks source files but does not leverage Go module caching for parallel task distribution.

## Failure Modes / Edge Cases

- **Go version drift**: If a developer's Go version differs from CI's version (pinned via `go.mod`), subtle behavioral differences may occur. CI uses `go-version-file: "go.mod"` which reads from `go.mod` (`go.yml:26`).
- **OAuth token expiry**: Acceptance tests that require GitHub authentication may fail if the `GH_ACCEPTANCE_TOKEN` expires (`acceptance/README.md:23-25`).
- **Source file timestamp precision**: The incremental build uses file modification times (`sourceFilesLaterThan`), which may not detect changes on filesystems with low timestamp precision (`script/build.go:146-185`).
- **Windows path handling**: While `script/build.go` handles Windows targets, the Makefile is Unix-centric (`.devcontainer/devcontainer.json` for development).

## Future Considerations

- Consider adding structured logging with levels for better debugging of async operations.
- Acceptance test scope validation could automatically verify required token scopes before running tests (`acceptance/README.md:186`).
- Cross-compilation could be simplified with a `make cross` target using GoReleaser.

## Questions / Gaps

1. **No explicit async/workflow debugging tooling found** — Searched for: debugger configs, tracing setup, structured logging configuration, workflow inspection tools. Found: `pkg/httpmock/` for HTTP mocking, standard Go debugging. Gap: No specialized async debugging beyond standard Go tools.
2. **No docker-compose or integrated local environment** — Not expected for a CLI tool, but would aid contributors who want to test GitHub API interactions locally without hitting production.
3. **Acceptance test isolation relies on human discipline** — Tests use `defer` for cleanup but rely on engineers to use it properly. No automated enforcement of cleanup (`acceptance/README.md:181-183`).

---

Generated by `dimensions/17-developer-experience-operational-ergonomics.md` against `cli`.