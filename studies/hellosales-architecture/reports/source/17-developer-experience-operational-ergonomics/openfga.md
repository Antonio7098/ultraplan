# Source Analysis: openfga

## Developer Experience & Operational Ergonomics

### Source Info

| Field | Value |
|-------|-------|
| Name | openfga |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/openfga` |
| Language / Stack | Go (v1.22+), PostgreSQL/MySQL/SQLite storage backends, Docker |
| Analyzed | 2026-05-20 |

## Summary

OpenFGA provides a well-structured developer experience with comprehensive Makefile-based tooling, Docker Compose for local development with multiple storage backends, and thorough CI/CD pipelines. The project uses goose for database migrations embedded in the binary, has a VSCode launch configuration for debugging, and maintains detailed contribution guidelines. Hot-reload development is supported via `make dev-run`. The main gaps are the absence of devcontainer configuration and limited documentation for debugging async/graph resolution code.

## Rating

**8/10** — Good implementation with minor issues

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Makefile tooling | `make dev-run` with hot-reload via CompileDaemon | `Makefile:158-192` |
| Makefile tooling | `make test-unit`, `make test-storage`, `make test-matrix` for parallel test execution | `Makefile:106-140` |
| Docker Compose | Full stack with postgres, migrate, and openfga services with health checks | `docker-compose.yaml:1-60` |
| Docker Compose override | Telemetry stack (Jaeger, Prometheus, Grafana, OTEL collector) for local debugging | `docker-compose.override.yaml:1-79` |
| Migration tooling | `goose`-based migrations embedded in binary via `//go:embed` | `pkg/storage/migrate/migrate.go:40-167` |
| Migration CLI | `openfga migrate` command with flags for engine, URI, version targeting | `cmd/migrate/migrate.go:27-55` |
| CI/CD - PR | golangci-lint, unit tests, storage tests, matrix tests, govulncheck, docker tests, benchmarks | `.github/workflows/pull_request.yaml:1-330` |
| CI/CD - Main | Parallel job matrix (unit, storage, matrix) with coverage upload | `.github/workflows/main.yaml:1-179` |
| CI/CD - Release | GoReleaser with SLSA provenance, Cosign signing, SBOM generation | `.github/workflows/release.yaml:1-224` |
| Linting config | golangci-lint v2 with 20+ linters, import alias enforcement | `.golangci.yaml:1-108` |
| GoReleaser config | Multi-platform Docker images, GitHub Packages, Homebrew | `.goreleaser.yaml:1-202` |
| VSCode debugging | Launch configuration for `openfga run` | `.vscode/launch.json:1-18` |
| Contributing guide | Detailed testing guidelines by layer (storage, API, query APIs) | `CONTRIBUTING.md:1-46` |
| Onboarding | README with quickstart, Docker, Homebrew, source build instructions | `README.md:57-146` |
| Dev tooling install | Auto-install of golangci-lint, mockgen, CompileDaemon via Makefile | `Makefile:42-52` |
| Go module caching | GitHub Actions cache for Go build artifacts | `.github/workflows/pull_request.yaml:41-52` |

## Answers to Dimension Questions

### 1. How quickly can a new engineer go from clone to running the full system?

**Very fast.** A new engineer can run `docker compose up` with the default `docker-compose.yaml` and have a full OpenFGA stack with PostgreSQL running in under a minute (`docker-compose.yaml:32-49`). The `openfga migrate` service in docker-compose automatically runs schema migrations before the server starts (`docker-compose.yaml:19-28`). For source-based development, `make dev-run` with in-memory storage requires only `go install` and `make dev-run` to start a hot-reloading server (`Makefile:158-192`). The README provides clear instructions for multiple installation methods including Docker, Homebrew, and source build (`README.md:82-146`).

### 2. How are database schema changes tested and deployed?

**Goose migrations with embedded SQL.** Database migrations are stored as SQL files in `assets/migrations/{mysql,postgres,sqlite}/` and embedded in the binary via `//go:embed` (`assets/assets.go:14-15`). The `openfga migrate` command (`cmd/migrate/migrate.go:27-83`) uses the goose library to apply migrations (`pkg/storage/migrate/migrate.go:40-167`). The command supports version targeting (`--version` flag at `cmd/migrate/migrate.go:43`), verbose logging, and per-engine configuration. Migration testing is covered by `migrate_test.go` (`cmd/migrate/migrate_test.go`), and the storage test suite in `pkg/storage/test/storage.go` runs integration tests against all backends. In docker-compose, a dedicated `migrate` service runs before `openfga` with `condition: service_completed_successfully` (`docker-compose.yaml:19-28`).

### 3. What tooling exists for local debugging of async/workflow code?

**Limited but present.** VSCode `.vscode/launch.json` provides a basic launch configuration for debugging the server (`launch.json:8-17`). The `docker-compose.override.yaml` includes a telemetry stack with Jaeger for distributed tracing, Prometheus for metrics, and Grafana for visualization (`docker-compose.override.yaml:29-46`, `20-28`). OpenFGA supports OTLP tracing configured via `OPENFGA_TRACE_ENABLED` and `OPENFGA_TRACE_OTLP_ENDPOINT` (`docker-compose.override.yaml:13-15`). However, there is no specific tooling for debugging the graph resolution chain or async resolvers. The AGENTS.md mentions the resolver chain is circular and warns about debugging `internal/graph/builder.go`, but no dedicated debug utilities exist (`AGENTS.md`).

### 4. How consistent is the build across different developer machines?

**High consistency via Go modules and Makefile.** The project uses Go modules (`go.mod` with versioned dependencies) and a `Makefile` that pins exact tool versions via `go install` with `@latest` for golangci-lint, mockgen, and CompileDaemon (`Makefile:42-52`). GitHub Actions uses `go-version-file: './go.mod'` to ensure the same Go version in CI (`pull_request.yaml:17`). Go build caching is configured in CI via `actions/cache` (`pull_request.yaml:41-52`). However, the `dev-run` target requires Docker for non-in-memory storage backends (`Makefile:166-180`), meaning Postgres/MySQL dev workflows depend on Docker being available and consistent.

### 5. How does the project balance developer velocity with production safety?

**Strong balance.** The project provides fast local iteration with `make dev-run` and hot-reload (`Makefile:158`), while production builds require passing the full test suite (unit + storage + matrix) in CI (`pull_request.yaml:28-157`). The CI pipeline includes: golangci-lint, unit tests with race detection, storage integration tests, matrix/integration tests, govulncheck for vulnerabilities, and benchmark regression tracking (`pull_request.yaml:10-330`). Release builds use GoReleaser with SLSA provenance, Cosign signing, and SBOM generation (`release.yaml:54-66`). The `test-docker` target ensures Dockerfile changes are validated (`Makefile:142-147`). The project separates fast unit tests (`make test-unit`) from slower integration tests (`make test-storage`, `make test-matrix`) allowing quick iteration during development while maintaining comprehensive CI coverage.

## Architectural Decisions

- **Makefile as single source of truth for build/test commands.** All developers run the same `make` targets, ensuring CI and local environments are aligned (`Makefile`).
- **Embedded migrations via `//go:embed`.** SQL migrations are compiled into the binary, eliminating migration file deployment as a separate step (`assets/assets.go:14-15`).
- **Goose for migration sequencing.** Provides versioned, transactional migration handling with support for up/down migrations (`pkg/storage/migrate/migrate.go:139-163`).
- **Parallel CI job matrix.** Unit tests, storage tests, and matrix tests run as separate jobs in parallel, reducing overall CI time (`pull_request.yaml:28-157`).
- **Performance-sensitive code triggers benchmark CI.** The `go-bench` job only runs when files under `internal/graph/**`, `internal/check/**`, `pkg/storage/**` etc. change (`pull_request.yaml:248-264`).

## Notable Patterns

- **Hot-reload dev server via CompileDaemon.** The `make dev-run` target uses `github.com/githubnemo/CompileDaemon` to rebuild and restart on source changes (`Makefile:158`).
- **Auto-installing dev tools in Makefile.** Tool binaries (golangci-lint, mockgen) are installed on first run via `$(GO_BIN)/<tool>` targets (`Makefile:42-52`).
- **Docker Compose override pattern.** Default `docker-compose.yaml` provides vanilla OpenFGA + Postgres, while `docker-compose.override.yaml` adds telemetry observability stack (`docker-compose.yaml:1`, `docker-compose.override.yaml:1`).
- **YAML-based test definitions.** Query APIs use YAML files embedded via `//go:embed` for easy test case authoring (`assets/assets.go:22-25`).

## Tradeoffs

- **No devcontainer configuration.** While Docker and Docker Compose are well-configured, there is no devcontainer.json for VSCode Remote Containers or GitHub Codespaces, requiring manual environment setup for some developers.
- **MySQL storage has stricter limitations.** The README notes MySQL has stricter length limits on tuple properties compared to PostgreSQL and SQLite (`README.md:216-220`).
- **Hot-reload requires CompileDaemon.** The `make dev-run` flow depends on a third-party tool that may behave differently across operating systems; the `DATASTORE` variants (MySQL/Postgres) launch Docker containers as part of the dev-run flow which may have port conflicts or resource overhead (`Makefile:166-180`).

## Failure Modes / Edge Cases

- **Docker-dependent storage backends.** `make dev-run` with `DATASTORE="mysql"` or `DATASTORE="postgres"` starts Docker containers; if Docker is not running or ports (3306/5432) are occupied, the command fails silently with container start errors.
- **Migration version targeting.** If a developer targets a non-existent migration version via `--version`, goose returns an error but the CLI does not provide a list-versions command to discover available migrations.
- **Go module caching in CI.** The Go cache key uses `**/*.go` and `go.sum`, but changes to build tags (`-tags=docker`) used in some test targets may not invalidate the cache properly (`pull_request.yaml:32`).
- **Import alias enforcement.** The golangci-lint `importas` linter requires specific aliases (`openfgav1`, `parser`); failing to use them causes lint failures that may confuse new contributors.

## Future Considerations

- Add `.devcontainer/` configuration for VSCode Remote Containers/GitHub Codespaces to provide a one-click development environment.
- Add a `make list-migrations` target or `openfga migrate list` command to show available migration versions.
- Consider adding `delve` or VSCode debugger integration documentation for graph resolution debugging.
- The `test-docker` target builds the Docker image on every run; consider caching or parallelizing this in CI.

## Questions / Gaps

1. **No evidence of `devcontainer.json`** — The project has Docker Compose but no devcontainer configuration for container-based development environments.
2. **No migration listing command** — No command exists to list available migration versions; developers must inspect `assets/migrations/` directories.
3. **No explicit async/workflow debugging documentation** — While telemetry (Jaeger/Prometheus/Grafana) is available via override, there is no explicit documentation on debugging the graph resolution chain.
4. **Test isolation for storage backends** — The storage integration tests run against real databases in CI; local development may not have all backends available for testing.

---

Generated by `dimensions/17-developer-experience-operational-ergonomics.md` against `openfga`.