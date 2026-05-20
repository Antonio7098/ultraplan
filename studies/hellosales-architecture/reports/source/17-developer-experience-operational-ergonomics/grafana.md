# Source Analysis: grafana

## Developer Experience & Operational Ergonomics

### Source Info

| Field | Value |
|-------|-------|
| Name | grafana |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/grafana` |
| Language / Stack | Go (backend), TypeScript/React (frontend), Yarn workspaces |
| Analyzed | 2026-05-20 |

## Summary

Grafana demonstrates excellent developer experience infrastructure for a large open-source project. The setup balances developer velocity with production safety through hot-reload capabilities, comprehensive migration tooling, well-organized Makefiles, extensive CI/CD pipelines, and thorough onboarding documentation. The embedded SQLite database allows zero-config local development, while Docker-based devenv supports full-stack scenarios.

## Rating

**8/10** — Good implementation with minor issues. Grafana provides a well-structured development environment with comprehensive tooling, but onboarding complexity is high due to the monorepo structure and dual backend/frontend build system.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Local dev setup | `make run` builds backend with hot-reload via air | `Makefile:139`, `.air.toml:1-25` |
| Local dev setup | `yarn start` for frontend dev server | `package.json:59` |
| Node version pinning | `.nvmrc` specifies `v24.11.0` | `.nvmrc:1` |
| Hot reload config | air.toml watches `["apps", "conf", "pkg", "public/views"]` | `.air.toml:8` |
| Dev environment | Docker blocks for databases (postgres, mysql, influxdb, loki) | `devenv/README.md:36-49` |
| Dev setup script | `./setup.sh` provisions gdev-* datasources and dashboards | `devenv/setup.sh:1-50` |
| Pre-commit hooks | lefthook with ESLint, Prettier, gofmt, CUE fix | `lefthook.yml:1-39` |
| Database migrations | Migration system in `pkg/services/sqlstore/migrations/` | `migrations/migrations.go:1-179` |
| Migration testing | `make test-go-integration-mysql/postgres` | `Makefile:227-241` |
| Build system | 853-line Makefile with extensive targets | `Makefile:1-853` |
| CI/CD pipeline | GitHub Actions for PR checks, builds, tests | `.github/workflows/pr-build-grafana.yml:1-249` |
| Test sharding | `SHARD`/`SHARDS` env vars for parallel test execution | `Makefile:71-72` |
| Code generation | Wire DI (`make gen-go`), CUE schemas (`make gen-cue`) | `Makefile:200-278` |
| CONTRIBUTING guide | 130-line contribution guide | `CONTRIBUTING.md:1-130` |
| Developer guide | 431-line detailed setup/troubleshooting guide | `contribute/developer-guide.md:1-431` |
| Agent guidance | AGENTS.md with commands and architecture | `AGENTS.md:1-178` |
| Yarn workspaces | Monorepo with packages/* and plugins/* workspaces | `package.json:475-481` |
| Yarn install | `--immutable` flag for reproducible installs | `package.json:94` |

## Answers to Dimension Questions

### 1. How quickly can a new engineer go from clone to running the full system?

**Approximately 10-15 minutes** with prerequisites (Go, Node.js 24, GCC) installed.

Steps documented in `contribute/developer-guide.md:28-155`:
1. `git clone https://github.com/grafana/grafana.git`
2. `corepack enable && corepack install` — enables Yarn 4.11.0
3. `yarn install --immutable` — installs frontend dependencies
4. `make run` — builds and starts backend with hot-reload on `localhost:3000`

Default credentials are `admin`/`admin` (`contribute/developer-guide.md:150-154`).

**Limitation**: First build with debug symbols (`-gcflags all=-N -l`) takes ~3 minutes; subsequent hot-reload rebuilds are faster (`AGENTS.md:22`).

### 2. How are database schema changes tested and deployed?

**Migration system**: Go-based migrations in `pkg/services/sqlstore/migrations/` using a migration registrator pattern documented in `migrations/migrations.go:14-21`:

```go
// --- Migration Guide line ---
// 1. Never change a migration that is committed and pushed to main
// 2. Always add new migrations (to change or undo previous migrations)
```

**Testing**: Integration tests require running database containers:
- `make devenv sources=mysql_tests,postgres_tests` starts Docker containers
- `make test-go-integration-mysql` / `make test-go-integration-postgres` runs tests

Evidence: `contribute/developer-guide.md:223-241`

**Deployment**: Migrations run automatically on server startup via the sqlstore migrator, not applied as separate deployment steps.

### 3. What tooling exists for local debugging of async/workflow code?

**Backend debugging**:
- Delve debugger integration documented in `contribute/developer-guide.md:424`: `go install github.com/go-delve/delve/cmd/dlv@master`
- VS Code launch configuration in `.vscode/launch.json` (`devenv/README.md:90`)
- Air hot-reload with profiling enabled: `-profile`, `-profile-addr=127.0.0.1`, `-profile-port=6000` (`.air.toml:3`)

**Frontend debugging**:
- `yarn start` runs webpack dev server with watch mode
- Jest with `--watch` mode for unit tests (`package.json:35`)
- Playwright for e2e: `yarn e2e:playwright:debug` with tracing (`package.json:27`)

**Limitation**: No explicit async/workflow debugging tools; relies on standard Go profiling and React DevTools.

### 4. How consistent is the build across different developer machines?

**High consistency** via:

- **Node version**: `.nvmrc` pins exact version (`v24.11.0`), setup-node action uses `node-version-file` (`.github/actions/setup-node/action.yml:18-19`)
- **Yarn**: Version 4.11.0 via corepack (`package.json:485`), `--immutable` flag prevents lockfile changes
- **Go**: Version specified in `go.mod` and Makefile `GO_VERSION = 1.26.3` (`Makefile:11`)
- **Pre-commit hooks**: lefthook automates formatting/linting (`lefthook.yml`, `contribute/developer-guide.md:50-64`)
- **Build flags**: CGO behavior documented (`contribute/developer-guide.md:158-170`) for consistent static builds

### 5. How does the project balance developer velocity with production safety?

**Developer velocity**:
- Hot reload via air for backend (`make run`)
- Webpack watch mode for frontend (`yarn start`)
- Pre-commit hooks auto-fix linting issues
- `make gen-go` regenerates Wire DI after service changes

**Production safety**:
- CI builds and tests on every PR (`.github/workflows/pr-build-grafana.yml`)
- Test sharding via `SHARD`/`SHARDS` for parallel execution (`Makefile:71-72`)
- Separate frontend/backend test and build pipelines
- Integration tests with multiple database backends
- Immutable yarn installs prevent dependency drift
- Feature toggles in `pkg/services/featuremgmt/` (`AGENTS.md:22-24`)

## Architectural Decisions

1. **Embedded SQLite for development**: Default database requires no external setup, reducing onboarding friction (`contribute/developer-guide.md:158`)

2. **Monorepo with Yarn workspaces**: Frontend packages in `packages/*`, plugins in `public/app/plugins/*`, enabling independent builds (`package.json:475-481`)

3. **Wire dependency injection**: Backend uses Google Wire for compile-time DI verification; regenerates via `make gen-go` (`Makefile:276-278`)

4. **CUE/Thema for schema definitions**: Dashboard/panel schemas generate Go and TypeScript code (`AGENTS.md:22-24`)

5. **Docker-based devenv**: Database blocks via `make devenv sources=...` for consistent dev data sources (`devenv/README.md:41-49`)

## Notable Patterns

1. **Self-documenting Makefile**: Uses `##@` comment headers for `make help` output (`Makefile:1-3`)

2. **Pre-commit hook automation**: lefthook runs ESLint, Prettier, gofmt, and CUE fixes on staged files (`lefthook.yml:10-39`)

3. **Change detection in CI**: `.github/actions/change-detection` gates builds on actual code changes (`pr-build-grafana.yml:31-35`)

4. **Multi-database integration testing**: Tests run against SQLite (default), PostgreSQL, and MySQL via Docker

5. **Frontend/backend separation**: Separate build, test, and lint commands for frontend (`yarn`) and backend (`go`)

## Tradeoffs

1. **Onboarding complexity**: Large monorepo requires understanding Yarn workspaces, Go modules, Wire DI, and CUE schemas — documented but extensive

2. **Build times**: First-time backend build includes debug symbols (~3 min); frontend build requires substantial memory (`contribute/developer-guide.md:399-416`)

3. **Windows support**: Requires WSL or MinGW for backend (SQLite needs GCC); less streamlined than macOS/Linux (`contribute/developer-guide.md:172-195`)

4. **Plugin build complexity**: Built-in plugins (loki, tempo, jaeger, etc.) require separate `yarn plugin:build:dev` watch process (`contribute/developer-guide.md:95-130`)

5. **No native ARM support in CI**: Build matrix doesn't include ARM; requires Rosetta or cross-compilation

## Failure Modes / Edge Cases

1. **File watcher limits**: Linux systems may hit `ENOSPC` limits; documented fix in `contribute/developer-guide.md:366-396`

2. **tsbuildinfo cache corruption**: Pull updates can cause unexpected type errors; `rm tsconfig.tsbuildinfo` resolves (`contribute/developer-guide.md:93`)

3. **Yarn checksum mismatches**: Remote archive mismatches can occur; `YARN_CHECKSUM_BEHAVIOR=update` workaround (`contribute/developer-guide.md:81`)

4. **Open file limits**: `make run` can exhaust file descriptors; `ulimit -S -n 8000` recommended (`contribute/developer-guide.md:321-356`)

5. **CGO detection variability**: Auto-detection of GCC can cause inconsistent builds across machines (`contribute/developer-guide.md:158`)

## Future Considerations

1. **Devcontainer support**: No `.devcontainer/` configuration found; could simplify onboarding further

2. **IDE integration**: Limited VS Code setup (launch.json reference only); could expand with settings recommendations

3. **Watch mode for backend tests**: No hot-reload for Go tests; developers must restart manually

4. **Frontend test isolation**: Default `yarn test` runs in watch mode; CI uses `yarn test:ci` with explicit worker counts

## Questions / Gaps

1. **No devcontainer.json**: Missing VS Code Dev Containers or GitHub Codespaces configuration for one-click setup

2. **No Nix/Flakes support**: Community may expect more declarative language-specific tooling

3. **Migration rollback**: No documented rollback strategy for failed migrations

4. **Local e2e without Docker**: Playwright tests require browser binaries; `yarn playwright install chromium` is an additional step

---

Generated by `dimensions/17-developer-experience-operational-ergonomics.md` against `grafana`.