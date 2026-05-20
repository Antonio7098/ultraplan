# Source Analysis: victoriametrics

## Developer Experience & Operational Ergonomics

### Source Info

| Field | Value |
|-------|-------|
| Name | victoriametrics |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/victoriametrics` |
| Language / Stack | Go (1.26.3), Docker, Kubernetes/Helm |
| Analyzed | 2026-05-20 |

## Summary

VictoriaMetrics provides a well-structured developer experience with comprehensive tooling for local development via Docker Compose, thorough CI/CD pipelines in GitHub Actions, and detailed onboarding documentation. The project uses a centralized Makefile that includes sub-Makefiles from each app component (`app/*/Makefile`), enabling consistent build orchestration across multiple binaries. Local development is streamlined through `make docker-vm-single-up` and `make docker-vm-cluster-up` commands. However, the CONTRIBUTING.md has been moved to an external documentation site, and there is no devcontainer configuration for VS Code users. Debugging support is available through pprof endpoints with auth key protection.

## Rating

**7/10** — Good implementation with minor issues. The project provides excellent Docker-based local development, comprehensive Makefiles, and thorough CI/CD. Gaps include absence of devcontainer configuration, limited documented migration tooling for schema changes, and the CONTRIBUTING guide being externalized.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Local dev setup | Docker Compose files for single and cluster modes | `deployment/docker/compose-vm-single.yml:1-99`, `deployment/docker/compose-vm-cluster.yml` |
| Local dev setup | Make targets for docker environments | `deployment/docker/Makefile:236-247` |
| Makefile | Root Makefile with cross-platform builds | `Makefile:1-548` |
| CI/CD | GitHub Actions build workflow for multiple OS/arch | `.github/workflows/build.yml:1-83` |
| CI/CD | GitHub Actions test workflow | `.github/workflows/test.yml:1-111` |
| CI/CD | License check workflow | `.github/workflows/check-licenses.yml:1-40` |
| Linting | golangci-lint configuration | `.golangci.yml:1-29` |
| Tests | Integration test framework | `apptest/README.md:1-47` |
| Onboarding | Quick start guide | `docs/victoriametrics/Quick-Start.md:1-468` |
| Onboarding | Contributing guide (external) | `docs/victoriametrics/CONTRIBUTING.md:1-128` |
| Build tooling | Multi-arch Docker build support | `deployment/docker/Makefile:80-127` |
| Package/deploy | DEB/RPM packaging targets | `app/victoria-metrics/Makefile:118-152` |
| Debugging | pprof endpoints with auth key | `docs/victoriametrics/vmauth.md:1527-1655` |

## Answers to Dimension Questions

### 1. How quickly can a new engineer go from clone to running the full system?

**Fast via Docker Compose.** A new engineer can clone the repository and run `make docker-vm-single-up` to have a fully functional VictoriaMetrics instance with Grafana, vmagent, vmalert, and Alertmanager running within minutes. The Quick-Start documentation provides multiple paths: Docker (`docker run` single command), Docker Compose (cluster via `make docker-vm-cluster-up`), or binary installation with systemd service. `deployment/docker/README.md:24-28`

### 2. How are database schema changes tested and deployed?

**No evidence of schema migration tooling.** VictoriaMetrics is a time-series database that stores data in custom formats on disk. There is no visible migration system for schema changes — the database schema is implicitly defined by the data ingested rather than explicit DDL. For backup/restore, `vmbackup` and `vmrestore` utilities exist (`app/vmbackup/Makefile`, `app/vmrestore/Makefile`), but these handle data backup, not schema migration. `docs/victoriametrics/vmbackup.md` and `docs/victoriametrics/vmrestore.md` cover these tools.

### 3. What tooling exists for local debugging of async/workflow code?

**pprof support with authentication.** All VictoriaMetrics components expose `/debug/pprof/*` endpoints protected by `-pprofAuthKey`. Memory and CPU profiles can be collected via `curl` and analyzed with `go tool pprof`. Query tracing is available via `-traceAuthKey` flag. The `Makefile:437-438` includes a `pprof-cpu` target. `docs/victoriametrics/vmauth.md:1527-1655` documents the profiling endpoints.

### 4. How consistent is the build across different developer machines?

**High consistency via Docker-based builds.** The project uses Docker for production builds via `app-via-docker` targets in `deployment/docker/Makefile:35-48`, ensuring identical build environments across machines. For local development, the `Makefile` uses standard Go tooling with vendor directory. Cross-compilation is well-supported for 10+ platform/architecture combinations. Go version is pinned to 1.26.3 in `go.mod:3`.

### 5. How does the project balance developer velocity with production safety?

**Good balance through layered CI/CD and KISS principle.** The `check-all` Make target (`Makefile:450`) runs fmt, vet, golangci-lint, and govulncheck. CI runs these checks plus unit tests across multiple scenarios (test, test-386, test-pure). The CONTRIBUTING guide (`docs/victoriametrics/CONTRIBUTING.md:104-128`) explicitly articulates a KISS principle policy rejecting complex distributed computing patterns (gossip protocols, Paxos, automatic reshuffling) to keep the system debuggable. Enterprise LTS releases provide stable branches for production users.

## Architectural Decisions

1. **Monorepo with shared libraries** — All components (vmagent, vmalert, vmstorage, etc.) live in a single repository with shared code in `lib/`. This simplifies cross-component changes but requires careful module management.

2. **Makefile includes for component build rules** — Root `Makefile:24-30` includes `app/*/Makefile`, `codespell/Makefile`, `docs/Makefile`, etc., delegating component-specific build logic while maintaining central coordination.

3. **Docker-first development and deployment** — All production builds run via Docker (`deployment/docker/Makefile`), ensuring build reproducibility. Local development can use Docker Compose or native `go build`.

4. **No schema migrations** — As a TSDB, VictoriaMetrics uses implicit schemas derived from data formats rather than explicit DDL migrations.

5. **pprof with auth key protection** — Profiling endpoints are available but secured with `-pprofAuthKey` to prevent unauthorized access in production (`vmstorage_common_flags.md:144-147`).

## Notable Patterns

- **Sub-Makefile composition** — Each app has its own `Makefile` that gets included by the root `Makefile`, enabling parallel development of components while maintaining consistent targets.
- **Go cache mounting in Docker builds** — `deployment/docker/Makefile:36-42` mounts a host-side Go cache directory into the Docker build container to speed up repeated builds.
- **Cross-compilation matrix** — The `Makefile` defines targets for 10+ OS/architecture combinations (linux/amd64, linux/arm64, darwin/arm64, windows/amd64, etc.) and the CI runs on all of them.
- **Apptest framework for integration testing** — `apptest/` directory contains a purpose-built framework for starting applications in separate processes and testing them via HTTP, documented in `apptest/README.md:1-47`.

## Tradeoffs

- **CONTRIBUTING.md moved to external docs** — The `CONTRIBUTING.md` in the repo is a single line pointing to external documentation (`CONTRIBUTING.md:1`), which may complicate contribution workflows when offline or behind restrictive network policies.

- **No devcontainer configuration** — Unlike many modern projects, there is no `.devcontainer/` or VS Code development container, meaning developers must either use Docker directly or set up Go toolchain manually.

- **No schema migration tooling** — Since VictoriaMetrics doesn't use traditional schemas, there is no migration tooling. However, this is a feature of the data model rather than a gap.

- **Vendor directory committed** — The repo includes a `vendor/` directory, which can lead to large diffs and merge conflicts but ensures build reproducibility without network access.

## Failure Modes / Edge Cases

- **Go version drift** — The project pins to Go 1.26.3 (`go.mod:3`). Developers with different Go versions may encounter subtle incompatibilities, though the Makefile's Docker-based production builds mitigate this.

- **Docker dependency for full development** — While not strictly required (native `go build` works), the full development experience including cross-compilation and integration testing relies on Docker.

- **Cross-build toolchain availability** — Building for platforms like Linux/ppc64le or Linux/s390x requires specific cross-compilation toolchains which may not be available on all developer machines.

## Future Considerations

1. **Add devcontainer configuration** — A `.devcontainer/` folder with VS Code settings would improve onboarding for developers who prefer VS Code's remote container workflow.

2. **External CONTRIBUTING.md integration** — Bringing CONTRIBUTING.md back into the repository (or providing a local mirror) would help developers working offline.

3. **Schema backup/restore documentation** — While not a traditional RDBMS, documenting the data format and backup/recovery procedures in more detail would help operators.

## Questions / Gaps

- **No evidence found for database migration tooling** — VictoriaMetrics is not a relational database, so this may not apply. The storage model uses custom on-disk formats with no explicit schema definition.

- **Limited debugging ergonomics for distributed/cluster code** — While pprof is available on each component, there is no unified distributed tracing or workflow debugging tool documented in the repository.

---

*Generated by `dimensions/17-developer-experience-operational-ergonomics.md` against `victoriametrics`.*