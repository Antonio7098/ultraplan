# Developer Experience & Operational Ergonomics - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Dimension | `17-developer-experience-operational-ergonomics.md` |
| Sources | cli, grafana, kubernetes, milvus, nats-server, openfga, pocketbase, temporal, victoriametrics |
| Date | 2026-05-20 |

## Sources Studied

| # | Source | Path |
|---|--------|------|
| 1 | cli | `sources/cli` |
| 2 | grafana | `sources/grafana` |
| 3 | kubernetes | `sources/kubernetes` |
| 4 | milvus | `sources/milvus` |
| 5 | nats-server | `sources/nats-server` |
| 6 | openfga | `sources/openfga` |
| 7 | pocketbase | `sources/pocketbase` |
| 8 | temporal | `sources/temporal` |
| 9 | victoriametrics | `sources/victoriametrics` |

## Executive Summary

Developer experience infrastructure across the nine studied sources clusters into three tiers: **exemplar projects** (cli, grafana, openfga, temporal at 8/10) providing comprehensive tooling with minor gaps; **solid implementations** (kubernetes, milvus, nats-server, pocketbase, victoriametrics at 7/10) with good tooling but notable friction points. Common strengths include Makefile-based build orchestration, golangci-lint enforcement, multi-platform CI, and Docker Compose for local dependencies. Common gaps include absence of devcontainer configuration (only cli and milvus have it), limited async/workflow debugging tooling (no project has comprehensive support), and divergent approaches to database migration (from nonexistent for stateless projects to fully-automated for pocketbase).

## Core Thesis

Developer experience quality correlates strongly with project maturity and product type rather than engineering investment alone. CLI tools and databases prioritize zero-config local development (single binary, embedded SQLite) at the cost of production-grade operational tooling. Server systems invest in comprehensive Docker-based devenvs and multi-backend testing but struggle with build complexity. The key differentiator is whether the project provides a **containerized, hot-reloadable development loop** — this combination appears in only two of nine sources (openfga's CompileDaemon-based dev-run, grafana's air-based backend reload), suggesting it remains an unsolved pattern for compiled languages like Go.

## Rating Summary

| Source | Score | Approach | Main Strength | Main Concern |
|--------|-------|----------|---------------|--------------|
| cli | 8/10 | Single-binary Go CLI with devcontainer | Comprehensive CI/CD with multi-platform testing, acceptance test framework | No async debugging tooling, no docker-compose |
| grafana | 8/10 | Monorepo with dual Go/TS build | Hot-reload via air, embedded SQLite dev, lefthook pre-commit | Complex onboarding, no devcontainer |
| kubernetes | 7/10 | Docker-based containerized builds | Containerized consistency, 50+ verification scripts, go.work workspace | No hot reload, no devcontainer, complex staging structure |
| milvus | 7/10 | Multi-language (Go+C++ +Rust) with Docker | Per-module test targets, comprehensive dependency pinning, devcontainer | C++ build complexity (Conan), long first build |
| nats-server | 7/10 | Standard Go project with shell scripts | Fast native build, config hot-reload, 20+ parallel CI jobs | No devcontainer, sequential tests (-p=1), no Makefile |
| openfga | 8/10 | Go with Docker Compose, embedded migrations | Hot-reload via CompileDaemon, telemetry stack via override, goose migrations | No devcontainer, limited async debugging |
| pocketbase | 7/10 | Single-binary Go with embedded SQLite | Zero-config dev, automigrate, transaction-wrapped migrations | No PR CI workflow, limited debugging |
| temporal | 8/10 | Makefile-based with Docker Compose | Three-tier testing pyramid, SQLite-first dev, VSCode launch configs | Complex 740+ line Makefile, no devcontainer |
| victoriametrics | 7/10 | Docker-first monorepo | Docker-based dev, pprof with auth, sub-Makefile composition | External CONTRIBUTING, no schema migration (TSDB) |

## Approach Models

### 1. Single-Binary Stateless (cli, nats-server, pocketbase)

These projects ship as single Go binaries with no external runtime dependencies. Development requires only Go toolchain installation.

- **cli** (8/10): Devcontainer available but optional; strong CI/CD with multi-platform testing; acceptance tests via testscript framework
- **nats-server** (7/10): No devcontainer, no Makefile; shell scripts orchestrate tests; config reload without restart
- **pocketbase** (7/10): Embedded SQLite; automigrate generates migration files from API changes; no PR CI

**Shared characteristics:** Fast clone-to-run, no database setup, CGO_ENABLED=0 for cross-platform builds, GoReleaser for releases.

### 2. Database-Backed Services (grafana, openfga, temporal)

These projects require external datastores for full development but provide comprehensive Docker-based devenvs.

- **grafana** (8/10): Embedded SQLite default; Docker devenv for postgres/mysql/influxdb; air hot-reload; 853-line Makefile
- **openfga** (8/10): Docker Compose with postgres + telemetry stack; goose migrations embedded via //go:embed; CompileDaemon hot-reload
- **temporal** (8/10): SQLite-first (no Docker required for basic dev); Docker Compose for MySQL/Cassandra/Postgres/Elasticsearch; three-tier test pyramid

**Shared characteristics:** Migration tooling (goose or custom), docker-compose for local deps, hot-reload for at least one project.

### 3. Infrastructure Platforms (kubernetes, milvus, victoriametrics)

These are production infrastructure projects requiring significant setup but providing comprehensive tooling.

- **kubernetes** (7/10): Docker-based builds (kube-cross image); 33 staging modules via go.work; 50+ verification scripts; vendor committed
- **milvus** (7/10): Go+C+++Rust multi-language; Conan for C++ deps; devcontainer available; per-module test targets
- **victoriametrics** (7/10): Docker-first for builds; TSDB (no schema migrations); pprof with auth; sub-Makefile composition

**Shared characteristics:** High build complexity, comprehensive CI/CD, containerized builds for consistency.

## Pattern Catalog

### Pattern 1: Embedded Migrations via //go:embed

**What it solves:** Eliminates migration file deployment as a separate step; migrations are compiled into the binary and applied automatically.

**Sources:** openfga (`assets/assets.go:14-15`, goose-based), pocketbase (embedded SQL files)

**Why it works:** The binary contains everything needed to initialize its own database schema. No separate migration artifacts to deploy.

**When to copy:** When deploying as a single binary with embedded database.

**When overkill:** When migrations are managed externally (flyway, liquibase) or when database is managed separately.

**Evidence:** `openfga/pkg/storage/migrate/migrate.go:40-167`, `pocketbase/core/migrations_runner.go:42-117`

### Pattern 2: Hot-Reload Development via CompileDaemon/air

**What it solves:** Eliminates stop-edit-rebuild-restart cycle for Go servers during development.

**Sources:** openfga (`make dev-run` using githubnemo/CompileDaemon), grafana (`make run` using air)

**Why it works:** File system watcher triggers rebuild on save; process restarts automatically; developers see changes within seconds.

**When to copy:** For any Go server that lacks native hot reload.

**When overkill:** For CLI tools (fast rebuild), for projects with long compile times (benefits diminish), for projects where stateful restart is expensive.

**Evidence:** `openfga/Makefile:158-192`, `grafana/.air.toml:1-25`, `grafana/Makefile:139`

### Pattern 3: Docker Compose Override for Telemetry Stack

**What it solves:** Provides observability tooling (Jaeger, Prometheus, Grafana) without cluttering the default development environment.

**Sources:** openfga (`docker-compose.override.yaml` adds Jaeger/Prometheus/Grafana/OTEL collector)

**Why it works:** Developers run `docker compose up` for basic dev; `docker compose -f docker-compose.yaml -f docker-compose.override.yaml up` for observability.

**When to copy:** When observability tooling is useful but not always needed.

**When overkill:** For simple projects, or when observability is always required.

**Evidence:** `openfga/docker-compose.override.yaml:1-79`, `openfga/docker-compose.yaml:1-60`

### Pattern 4: Per-Module Test Targets

**What it solves:** Enables focused testing during development; reduces iteration time by running only relevant tests.

**Sources:** milvus (`test-rootcoord`, `test-proxy`, `test-datacoord`, etc.), temporal (unit/integration/functional tiers)

**Why it works:** Microservices architecture maps to independent test targets; developers can iterate on single service without running full suite.

**When to copy:** For microservices or modular monorepos where component boundaries are clear.

**When overkill:** For small single-service projects.

**Evidence:** `milvus/Makefile:330-398`, `temporal/Makefile:482-516`

### Pattern 5: Version-Pinned Toolchain in Makefile

**What it solves:** Ensures all developers use identical tool versions (golangci-lint, mockgen, buf, etc.) without a separate tools file.

**Sources:** temporal (`Makefile:174-280`), milvus (`Makefile:72-98`), kubernetes (`hack/lib/golang.sh`)

**Why it works:** `go install github.com/tool@version` downloads pinned version to `.bin/`; Makefile target ensures tools exist before use.

**When to copy:** For any project using multiple Go-based build tools.

**When overkill:** For simple single-tool projects.

**Evidence:** `temporal/Makefile:174-280`, `milvus/Makefile:72-98`

### Pattern 6: Devcontainer for One-Click Setup

**What it solves:** Provides pre-configured container with all prerequisites for VS Code Remote Containers or GitHub Codespaces.

**Sources:** cli (`.devcontainer/devcontainer.json:2,9-15` with Go 1.25 + VS Code Go extension), milvus (`.devcontainer.json:1-12`)

**Why it works:** New contributor opens repo in VS Code, clicks "Reopen in Container", gets fully configured environment instantly.

**When to copy:** For open-source projects targeting broad contributions; for projects with complex prerequisites.

**When overkill:** For projects with trivial setup (single `go build`), or projects that intentionally require local environment expertise.

**Evidence:** `cli/.devcontainer/devcontainer.json:2,9-15`, `milvus/.devcontainer.json:1-12`

### Pattern 7: Automigrate from API Changes

**What it solves:** Eliminates manual migration authoring for common case — collection/schema changes via API trigger automatic migration file generation.

**Sources:** pocketbase (`plugins/migratecmd/automigrate.go:18-96`)

**Why it works:** Hooks into collection create/update/delete events; generates snapshot-based migration file; developer reviews and commits the file.

**When to copy:** For frameworks where schema is defined via API/CLI rather than hand-written SQL.

**When overkill:** When schema changes are rare and need full control; when migrations must be hand-crafted.

**Evidence:** `pocketbase/plugins/migratecmd/automigrate.go:18-96`, `pocketbase/plugins/migratecmd/automigrate.go:82-86`

### Pattern 8: Pre-Commit Hooks via lefthook

**What it solves:** Catches formatting and lint issues before they reach CI; reduces CI load and improves developer feedback speed.

**Sources:** grafana (`lefthook.yml:1-39`, runs ESLint/Prettier/gofmt/CUE on staged files)

**Why it works:** git hook runs automatically on commit; auto-fixable issues are corrected in place; non-fixable issues abort commit.

**When to copy:** For projects with multiple languages requiring different formatters.

**When overkill:** For single-language projects where CI catches issues fast enough.

**Evidence:** `grafana/lefthook.yml:1-39`, `grafana/contribute/developer-guide.md:50-64`

## Key Differences

### Stateless vs. Stateful Products

CLI tools (cli, nats-server) and some databases (pocketbase with embedded SQLite) eliminate database setup entirely. Products that manage stateful data (grafana, openfga, temporal, milvus) require external dependencies, increasing onboarding friction but enabling production-representative testing.

**Divergence reason:** Product constraints. A CLI tool that talks to a remote API has no local state to manage. A database must handle local persistence.

### Hot Reload Availability

Only 2 of 9 projects (openfga, grafana) have hot reload for Go code. The remaining 7 rely on stop-edit-rebuild-restart cycles. This is a surprising gap given Go's compilation speed and the prevalence of file-watching tools.

**Possible explanation:** Kubernetes, temporal, and milvus run as long-running servers where hot reload may interfere with connection handling. CLI tools (cli, nats-server, pocketbase) have such fast build times that hot reload provides little benefit.

### Migration Strategy Diversity

Four distinct approaches observed:
1. **No migrations** (cli, nats-server, kubernetes, victoriametrics) — stateless or external schema management
2. **Embedded goose** (openfga) — migrations compiled into binary via //go:embed
3. **Transaction-wrapped runner** (pocketbase) — migrations with up/down/history-sync
4. **Versioned schema directories** (temporal) — SQL files applied via dedicated CLI tools

**Divergence reason:** Each approach reflects different operational contexts. Embedded migrations suit single-binary deploys. Versioned directories suit systems where schema is managed separately from application.

### Devcontainer Adoption

Only 2 of 9 projects have devcontainer configuration (cli, milvus). The absence is notable given VS Code's market share and GitHub Codespaces' availability.

**Possible explanation:** Projects with simple `go build` workflows may not perceive value in containerized development. Projects already using Docker Compose may view devcontainer as redundant.

## Tradeoffs

| Decision | Benefit | Cost | Best-Fit Context | Failure Mode | Alternative |
|----------|---------|------|------------------|--------------|-------------|
| Docker-based dev environment | Consistent across machines; production-representative | Resource overhead; slower iteration; Docker required | Server applications with external deps | Docker not available (corporate policy, ARM issues) | Native dev with script-based deps |
| Hot reload via CompileDaemon/air | Faster iteration; state preserved across rebuilds | Additional tool; potential edge cases; not native Go | Long-running server development | Watcher misses files; memory leaks from long-running processes | Manual restart |
| Embedded SQLite for dev | Zero-config; fast startup; single binary | Differs from production (Postgres/MySQL) | Quick iteration; testing; embedded products | SQL dialect differences; limited concurrent write scaling | Docker-based database |
| Makefile-based orchestration | Familiar interface; tab-completion; portable | Implicit dependencies; can become complex | Most Go projects | Complex targets become hard to maintain | Task runner (taskctl), go scripts |
| Pre-commit hooks | Catches issues early; reduces CI load | Initial delay on commit; hook maintenance | Multi-language projects | Hooks slow down commits; may be bypassed | CI-only enforcement |
| Migration automation (automigrate) | Eliminates manual migration authoring | Generated migrations may not be optimal; up-only snapshots | Schema-as-code frameworks | Automigrate creates many files; edit conflicts | Hand-written migrations |
| go.work multi-module workspace | Coordinated edits across modules | Complex structure; tooling confusion | Kubernetes-style staging repos | Import violations; generated file divergence | Single module or semantic import versioning |

## Decision Guide

**For a new Go service project:**

1. **First decision: local database?**
   - Yes → Use Docker Compose with postgres/mysql; use embedded SQLite for quick iteration
   - No → Single binary with CGO_ENABLED=0; no containerized dev needed

2. **Second decision: hot reload?**
   - For long-running servers → CompileDaemon or air
   - For CLI tools or fast builds → Manual restart sufficient

3. **Third decision: migrations?**
   - Embedded (goose via //go:embed) for single-binary deploys
   - Versioned directories for systems with separate schema deployment

4. **Fourth decision: devcontainer?**
   - For broad open-source contributions → Yes
   - For internal/Expert teams → Optional (Docker Compose may suffice)

5. **Fifth decision: pre-commit hooks?**
   - For multi-language projects → lefthook with language-specific formatters
   - For single-language → Optional; golangci-lint in CI may be sufficient

## Practical Tips

### Patterns to Copy

- **Version-pinned toolchain in Makefile**: Use `go install` with `@version` for all dev tools; cache in `.bin/`
- **Test sharding**: Use `SHARD`/`SHARDS` env vars for parallel test execution in CI
- **Docker Compose override pattern**: Separate base devenv from observability tooling
- **Transaction-wrapped migrations**: Always wrap migration batches in transactions for atomicity
- **Incremental builds**: Check source file timestamps before rebuilding (CompileDaemon pattern)

### Patterns to Avoid or Delay

- **go.work until needed**: The go.work multi-module workspace adds complexity; use only when staging repos are necessary
- **Conan for small C++ deps**: The Conan dependency manager adds significant overhead; consider pure Go or simpler alternatives
- **Excessive verification scripts**: 50+ `hack/verify-*.sh` scripts (kubernetes) create maintenance burden; prefer composable single-purpose tools

### Decision Rules

1. **Onboarding time > 15 minutes** → Need better devcontainer or embedded dependencies
2. **First build > 10 minutes** → Consider build caching, ccache, or split compilation
3. **Migration failures require manual cleanup** → Add transaction wrapping or rollback support
4. **Tests run sequentially** → Add `-p=N` flag only after verifying test independence
5. **No async debugging tooling** → Document standard debugging approach (pprof, Delve, logs)

## Anti-Patterns / Caution Signs

1. **No PR CI workflow** (pocketbase): Only release pipeline runs tests; regressions may reach production
2. **Sequential tests with `-p=1`** (nats-server): Fails to leverage parallel cores; extends CI time
3. **Complex Makefile without help target** (temporal at 740+ lines): Hard to discover available targets
4. **No migration rollback** (openfga): Generated migrations are up-only; reverting requires hand-written down
5. **Migration file rename breaks sequence** (pocketbase): Timestamp-based sorting means renames change execution order
6. **Vendor corruption via go mod tidy** (kubernetes): Direct `go mod tidy` breaks vendor setup; must use dedicated scripts
7. **Large page size mismatch** (milvus): Runtime failure on systems with 64KB pages without `MILVUS_JEMALLOC_LG_PAGE=16`
8. **CGO detection variability** (grafana): Auto-detection of GCC causes inconsistent builds across machines

## Notable Absences

### Devcontainer Gap

Only cli and milvus have `.devcontainer/` configuration. This is a significant gap for VS Code users and GitHub Codespaces. The remaining 7 projects require manual environment setup.

### Hot Reload Gap for Go Servers

Only grafana (air) and openfga (CompileDaemon) have hot reload for Go code. Kubernetes, temporal, milvus, and others lack this capability despite being long-running servers.

### Async Debugging Tooling Gap

No project has specialized tooling for debugging async workflows, goroutines, or workqueues beyond standard pprof/Delve. This is particularly notable for temporal (durable execution platform) which would seemingly benefit most.

### Migration Testing Gap

Migration implementations are rarely tested via unit tests. Pocketbase and openfga have some test coverage, but most projects rely on integration testing or manual verification.

### Structured Logging Gap

Only grafana (go-kit/log), kubernetes (klog), and milvus (zap) use established structured logging libraries. Others use fmt.Print or custom implementations, making production log analysis harder.

## Per-Source Notes

### cli (8/10)
Exemplar CI/CD with multi-platform matrix (ubuntu/windows/macos), acceptance test framework via testscript, and devcontainer. Gap: no docker-compose (not needed for CLI) and no async debugging tooling.

### grafana (8/10)
Excellent hot-reload via air, comprehensive pre-commit hooks via lefthook, and embedded SQLite for zero-config dev. Gap: no devcontainer, complex monorepo structure.

### kubernetes (7/10)
Containerized builds ensure CI/local consistency; comprehensive verification pipeline. Gap: no hot reload (long-running servers), no devcontainer, complex go.work workspace.

### milvus (7/10)
Per-module test targets, devcontainer available, OS-aware setenv script. Gap: C++ build complexity (Conan), long first build times.

### nats-server (7/10)
Fast native build, config hot-reload, comprehensive CI with 20+ parallel jobs. Gap: no devcontainer, sequential tests (-p=1), no Makefile.

### openfga (8/10)
Hot-reload via CompileDaemon, telemetry override stack, embedded goose migrations. Gap: no devcontainer, limited async debugging documentation.

### pocketbase (7/10)
Zero-config dev (embedded SQLite), automigrate, transaction-wrapped migrations. Gap: no PR CI workflow, limited debugging tooling.

### temporal (8/10)
Three-tier test pyramid, SQLite-first dev (no Docker required for basic use), VSCode launch configs. Gap: 740+ line Makefile, no devcontainer.

### victoriametrics (7/10)
Docker-first builds, sub-Makefile composition, pprof with auth. Gap: external CONTRIBUTING, no schema migration (TSDB, not applicable).

## Open Questions

1. **Why is devcontainer adoption so low?** Only 2 of 9 projects have it despite clear benefits for onboarding. Is it perceived complexity, CI/CD concerns, or simply not being a priority?

2. **Why do compiled Go projects lack hot reload?** Only 2 of 7 Go servers have CompileDaemon/air. Is this a tooling gap, a deliberate choice, or a perception that it doesn't work well for Go?

3. **Should async debugging tooling be a priority?** No project has specialized tooling for workflow/async debugging. Is this because existing tools (pprof, Delve) are sufficient, or because the need hasn't been addressed?

4. **What is the right migration strategy for Go services?** Approaches range from nonexistent (stateless) to fully-automated (pocketbase). Which approach scales best as complexity grows?

5. **How important is native (non-Docker) development?** Projects like temporal offer SQLite-first dev without Docker, while others require Docker for any development. What factors determine this choice?

## Evidence Index

- `cli/.devcontainer/devcontainer.json:2,9-15`
- `cli/.github/CONTRIBUTING.md:29-37`
- `cli/.github/workflows/go.yml:32`
- `cli/AGENTS.md:7-14`
- `cli/Makefile:21-24`
- `cli/script/build.go:138-143`
- `grafana/.air.toml:1-25`
- `grafana/.nvmrc:1`
- `grafana/Makefile:1-3,139`
- `grafana/contribute/developer-guide.md:28-155`
- `grafana/contribute/developer-guide.md:50-64`
- `grafana/lefthook.yml:1-39`
- `grafana/package.json:59`
- `kubernetes/.go-version:1`
- `kubernetes/Makefile:1-516`
- `kubernetes/build/README.md:20-25`
- `kubernetes/go.work:7-42`
- `kubernetes/hack/lib/golang.sh:22-53`
- `milvus/.devcontainer.json:1-12`
- `milvus/Makefile:72-98,330-398`
- `milvus/deployments/docker/dev/docker-compose.yml:1-113`
- `milvus/scripts/install_deps.sh:1-522`
- `nats-server/.golangci.yml:1-89`
- `nats-server/.github/workflows/tests.yaml:94-117`
- `nats-server/go.mod:1-19`
- `nats-server/main.go:97-131`
- `nats-server/scripts/runTestsOnTravis.sh:1-138`
- `openfga/Makefile:42-52,158-192`
- `openfga/assets/assets.go:14-15`
- `openfga/docker-compose.override.yaml:1-79`
- `openfga/docker-compose.yaml:1-60`
- `openfga/pkg/storage/migrate/migrate.go:40-167`
- `pocketbase/.github/workflows/release.yaml:1-56`
- `pocketbase/core/migrations_runner.go:42-117,122-173`
- `pocketbase/golangci.yml:1-26`
- `pocketbase/plugins/migratecmd/automigrate.go:18-96`
- `pocketbase/README.md:47-100`
- `temporal/.vscode/launch.json:1-98`
- `temporal/Makefile:37,174-280,367-377,482-516,567-598,643-659`
- `temporal/CONTRIBUTING.md:53-69,124-177`
- `temporal/develop/docker-compose/docker-compose.yml:1-92`
- `victoriametrics/Makefile:1-548`
- `victoriametrics/deployment/docker/Makefile:236-247`
- `victoriametrics/deployment/docker/compose-vm-single.yml:1-99`
- `victoriametrics/docs/victoriametrics/CONTRIBUTING.md:1-128`

---

Generated by dimension `17-developer-experience-operational-ergonomics.md`.
