# Source Analysis: temporal

## Developer Experience & Operational Ergonomics

### Source Info

| Field | Value |
|-------|-------|
| Name | temporal |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/temporal` |
| Language / Stack | Go (backend), Docker (local dev), Protocol Buffers (API) |
| Analyzed | 2026-05-20 |

## Summary

Temporal is a mature open-source durable execution platform (forked from Uber's Cadence) developed in Go. It provides an exceptionally well-engineered developer experience with comprehensive tooling, clear documentation, and robust CI/CD infrastructure. The project uses a Makefile-based build system with 740+ lines, extensive docker-compose setup for local development, multi-stage GitHub Actions CI with test sharding and caching, and thorough contributing documentation. Database schema migration is handled via dedicated tools (temporal-cassandra-tool, temporal-sql-tool) with versioned schema directories.

## Rating

**8/10** — Good implementation with minor issues. The developer experience is excellent but has some friction points: no devcontainer pre-configured, requires manual Docker setup for full development, and the build system is complex. The project excels at onboarding, testing infrastructure, and operational tooling.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Local dev setup | Docker Compose with MySQL, Cassandra, PostgreSQL, Elasticsearch, Prometheus, Grafana | `develop/docker-compose/docker-compose.yml:1-92` |
| Local dev setup | Platform-specific compose files (linux, darwin, windows) | `develop/docker-compose/docker-compose.linux.yml:1` |
| Makefile targets | `make start-dependencies`, `make stop-dependencies` for container management | `Makefile:643-659` |
| Database migration tools | `temporal-cassandra-tool`, `temporal-sql-tool`, `temporal-elasticsearch-tool` built from cmd/tools | `Makefile:367-377` |
| Schema versioning | Versioned schema directories for Cassandra, MySQL, PostgreSQL | `schema/cassandra/temporal/versioned/`, `schema/postgresql/v12/temporal/versioned/` |
| Schema installation targets | `make install-schema-cass-es`, `make install-schema-postgresql12`, etc. | `Makefile:567-598` |
| CI/CD pipeline | Multi-job GitHub Actions workflow with test sharding, caching, codecov upload | `.github/workflows/run-tests.yml:1-717` |
| CI linting | Separate linter workflow for fmt, golangci, protos, actions | `.github/workflows/linters.yml:1-185` |
| Debug configuration | VSCode launch.json with debug configs for different persistence backends | `.vscode/launch.json:1-98` |
| Contributing guide | 262-line comprehensive CONTRIBUTING.md with prerequisites, build, test, debugging sections | `CONTRIBUTING.md:1-262` |
| Testing documentation | 301-line testing.md with build tags, env vars, best practices, helpers | `docs/development/testing.md:1-301` |
| Architecture documentation | Architecture overview, service descriptions, sequence diagrams | `docs/architecture/README.md:1-82` |
| Build consistency | CGO_ENABLED defaults to 0, reproducible cross-platform builds via goreleaser | `.goreleaser.yml:31`, `Makefile:37` |
| Go module support | No $GOPATH dependency, uses go modules | `CONTRIBUTING.md:47` |
| Code generation | Proto compilation via `make proto`, `go generate` for RPC wrappers | `Makefile:302-338` |
| Tooling versioning | Pinned tool versions (golangci-lint v2.9.0, buf v1.6.0, etc.) in Makefile | `Makefile:174-280` |

## Answers to Dimension Questions

### 1. How quickly can a new engineer go from clone to running the full system?

**Fast path (SQLite/in-memory):** ~5 minutes. Clone → `make` (first build) → `make start` (SQLite in-memory). No Docker required for basic server operation (`CONTRIBUTING.md:124-134`).

**Full path (with dependencies):** ~10-15 minutes. Clone → `make` → `make start-dependencies` (docker compose) → `make start`. Detailed in `CONTRIBUTING.md:53-69,124-177`.

**Onboarding documentation:** Excellent. CONTRIBUTING.md provides step-by-step instructions for prerequisites (Go, Docker, Temporal CLI), build, and running tests.

### 2. How are database schema changes tested and deployed?

**Schema tooling:** Dedicated CLI tools per database: `temporal-cassandra-tool`, `temporal-sql-tool`, `temporal-elasticsearch-tool` (`Makefile:367-377`).

**Versioned schemas:** SQL and Cassandra schemas stored with versioned directories (`schema/postgresql/v12/temporal/versioned/`), applied via `update-schema` commands (`Makefile:591-598`).

**Migration commands:** `make install-schema-cass-es`, `make install-schema-postgresql12`, `make install-schema-mysql8` provide drop → create → setup-schema → update-schema workflows (`Makefile:567-598`).

**No automated migration runner found:** Schema changes appear to require manual application via these tools, not a flyway/liquibase-style automatic migration on startup.

### 3. What tooling exists for local debugging of async/workflow code?

**IDE debugging:** VSCode launch.json configurations for debugging server and functional tests (`.vscode/launch.json:1-98`):
- "Debug Running Server" (attach mode)
- "Debug single functional test method" with `-tags=test_dep`
- "Debug Server" with `--env development-sqlite` and other persistence backends

**Test debugging:** GoLand debugging instructions in CONTRIBUTING.md (`CONTRIBUTING.md:180-201`), with build tag requirements documented.

**OpenTelemetry support:** OTEL tracing setup for test debugging (`docs/development/testing.md:281-294`), with environment variables for trace export.

**Log file capture:** `TEMPORAL_TEST_LOG_FILE` env var routes debug logs to file for CI debugging (`docs/development/testing.md:16-18`).

### 4. How consistent is the build across different developer machines?

**High consistency:**
- `CGO_ENABLED=0` enforced by default in Makefile (`Makefile:37`)
- Go module-based build (no $GOPATH dependency)
- Cross-platform build targets: Linux, Darwin, Windows; amd64, arm64 (goreleaser config)
- Platform-specific docker-compose files handle OS differences (`develop/docker-compose/docker-compose.linux.yml`, `docker-compose.darwin.yml`, `docker-compose.windows.yml`)
- Docker layer caching in CI via ScribeMD/docker-cache action (`.github/workflows/run-tests.yml:491-493`)
- Build cache restoration via actions/cache for Go modules and build outputs

**Potential inconsistencies:**
- Local tool installation (golangci-lint, buf, mockgen) happens at first `make` time, version mismatches possible if .bin directory is corrupted
- Schema install targets reference hardcoded paths

### 5. How does the project balance developer velocity with production safety?

**Safety mechanisms:**
- Comprehensive test suite: unit tests (no deps), integration tests (DB), functional tests (E2E) (`CONTRIBUTING.md:73-78`)
- Three test tiers with separate Makefile targets (`Makefile:482-516`)
- Test sharding (3 shards) in CI to manage timeout bounds (`run-tests.yml:27`)
- Race detector enabled by default in tests (`Makefile:65`)
- Test shuffle enabled by default (`Makefile:67`)
- Retry mechanism for flaky tests: `MAX_TEST_ATTEMPTS=3` (`Makefile:62`)
- Lint gates: fmt, golangci, protos, actions all enforced in CI
- Breaking API changes checked via buf-breaking (`Makefile:454-457`)
- GoReleaser for reproducible releases

**Developer velocity:**
- Fast iteration with SQLite in-memory (no Docker required for basic dev)
- `make start` single command to run server
- Auto-formatting via `make fmt` (gofix loop, goimports, buf format, yamlfmt)
- `make lint-code --fix` for auto-fixable lint issues
- Test parallelization via `make parallelize-tests` (auto-adds t.Parallel())

## Architectural Decisions

1. **Makefile-based build** — The project uses a 740+ line Makefile as the central build orchestration, rather than more modern tools like Task or just cmd scripts. This is conventional for Go projects and provides good tab-completion and familiar interface.

2. **Versioned schema directories** — Schema changes are versioned in directories (e.g., `schema/postgresql/v12/temporal/versioned/`) and applied incrementally, not managed by a migration framework. This gives explicit control but requires manual ordering.

3. **SQLite-first local development** — Default `make start` runs with SQLite in-memory, eliminating Docker dependency for basic development. Users opt into Docker dependencies only when they need specific database features.

4. **Test pyramid with three tiers** — Unit (no deps) → Integration (DBs) → Functional (E2E). This provides fast feedback for most changes while validating full integration only when needed.

5. **Tool pinning in Makefile** — All build tools (golangci-lint, buf, mockgen, etc.) are pinned to specific versions in the Makefile with download-on-demand via go-install-tool pattern. Ensures reproducible builds without a separate tools file.

## Notable Patterns

1. **`go-install-tool` pattern** — Custom Makefile function that downloads tools to `.bin/` only when missing, enabling CI to cache and reuse tools.

2. **Docker compose layering** — Base `docker-compose.yml` combined with platform-specific files (`docker-compose.linux.yml`, `docker-compose.darwin.yml`) for OS-specific service configurations.

3. **Build tag strategy** — `test_dep` tag enables test hooks in production code; `disable_grpc_modules` speeds unit test compilation; `TEMPORAL_DEBUG` extends test timeouts for debugging.

4. **Test output capture** — All test output (logs, coverage, junit XML) written to `.testoutput/` directory, consumed by gotestsum and codecov integrations.

5. **CI matrix with smoke tests** — PRs run smoke tests on all DBs and full tests only on "required" DBs (cassandra+elasticsearch, postgresql). Full tests run on persistence code changes or when `test-all-dbs` label is set.

## Tradeoffs

1. **No devcontainer** — Missing `.devcontainer/` configuration means developers must manually set up prerequisites (Go, Docker) rather than getting a pre-configured container. This adds friction for new contributors.

2. **Complex Makefile** — 740+ lines with many implicit dependencies and targets. Learning curve for contributors unfamiliar with Go build conventions.

3. **No auto-migration** — Database schema changes require manual `make install-schema-*` invocation rather than automatic migration on startup. This separates schema deployment from application deployment.

4. **Multiple docker-compose files** — Developers must remember to compose multiple files (`-f docker-compose.yml -f docker-compose.linux.yml`), easy to forget the platform-specific file.

5. **Dependency on external proto tooling** — Proto code generation requires protoc and various plugins; while documented, this can be a barrier for developers who only want to modify Go code.

## Failure Modes / Edge Cases

1. **Schema drift** — If a developer runs schema installation commands out of order, or if multiple developers have different schema versions, database inconsistencies can occur. No schema version tracking in the database itself.

2. **Tool version skew** — If a developer's local `.bin/` has tools from an older version while CI uses newer pinned versions, local builds may pass but CI fails.

3. **Resource constraints** — Functional tests with fault injection (`functional-with-fault-injection-test`) may behave differently under memory/CPU constraints. The 35m timeout is based on CI environment capabilities.

4. **Docker network issues** — Platform-specific networking (especially on macOS and Windows) can cause Cassandra/Cassandra connection timeouts in docker-compose setup.

5. **SQLite persistence** — Data is lost on server restart when using SQLite in-memory. Developers may lose workflow state if they forget to use a file-based SQLite or switch to Postgres.

## Future Considerations

1. **Devcontainer configuration** — Adding `.devcontainer/` with pre-configured Go, Docker, and Temporal CLI would significantly improve onboarding speed and consistency.

2. **Schema migration automation** — Consider adopting a migration tool (like golang-migrate or flyway) for automatic schema version tracking and application.

3. **Build reproducibility tooling** — Consider tools like `mise` or `asdf` for tool version management to ensure every developer has the same tool versions.

4. **Local observability** — The docker-compose includes Grafana and Prometheus, but documentation for using these for local debugging could be improved.

## Questions / Gaps

1. **No evidence of local workflow debugging UI** — The `temporal web` UI is mentioned in README but no evidence of local debugging tools beyond log output.

2. **Debugging async workflows** — While there are test helpers (`testvars`, `parallelsuite`, `await`), no evidence of specialized tooling for debugging workflow execution replay.

3. **Host-based dependency alternative** — CONTRIBUTING.md mentions a doc for running dependencies on host OS (`docs/development/run-dependencies-host.md`) but this is only for macOS performance reasons.

4. **Contribution CLA requirement** — CONTRIBUTING.md mentions Temporal CLA requirement before merging changes, but this is an external process, not a code tool.

---

Generated by `dimensions/17-developer-experience-operational-ergonomics.md` against `temporal`.