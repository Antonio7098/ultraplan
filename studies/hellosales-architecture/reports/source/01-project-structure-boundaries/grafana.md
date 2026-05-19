# Source Analysis: grafana

## Project Structure & Boundaries

### Source Info

| Field | Value |
|-------|-------|
| Name | grafana |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/grafana` |
| Language / Stack | Go (backend) / TypeScript/React (frontend) / Yarn workspaces / Go workspaces |
| Analyzed | 2026-05-19 |

## Summary

Grafana is a large-scale monorepo that combines Go backend and TypeScript/React frontend within a single repository. The project uses a hybrid organization strategy: Go code is organized primarily by layer (infra/, api/, services/, tsdb/, plugins/) with domain-oriented subpackages emerging in newer code (apps/); TypeScript frontend uses feature-based organization under `public/app/features/`. The project employs Go workspaces for multi-module Go management and Yarn workspaces for frontend packages, with the Grafana App SDK enabling standalone app development. Dependency direction flows from apps down to pkg/apimachinery and pkg/infra, creating an acyclic layered graph enforced by Wire DI compile-time checks.

## Rating

**8/10** — Good implementation with minor issues. Grafana demonstrates mature monorepo structure with clear package boundaries between API, services, and infrastructure layers. The Apps SDK introduces properly isolated domain modules, but some legacy services in `pkg/services/` still mix concerns, and the dual workspace strategy (Go + Yarn) adds conceptual overhead.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Go workspace definition | `go.work` defines 27 Go modules including root, 19 apps, and 7 pkg/ sub-modules | `go.work:6-43` |
| Module boundary enforcement | Each app (dashboard, alerting, folder, etc.) has its own `go.mod` as a separate module | `apps/dashboard/go.mod:1` |
| Top-level directory layout | `pkg/` (backend core), `apps/` (standalone apps), `packages/` (TS shared), `public/app/` (frontend) | `ls -la pkg/` |
| Services organization | Services organized by domain under `pkg/services/` with 70+ service packages | `pkg/services/` directory listing |
| API layer separation | `pkg/api/` contains HTTP handlers separate from business logic in `pkg/services/` | `pkg/api/api.go:1-30` |
| Infrastructure layer | `pkg/infra/` contains logging, metrics, db, cache, tracing — shared foundations | `pkg/infra/log/log.go:1-60` |
| Frontend package boundary | `packages/` contains 16 published npm packages (@grafana/data, @grafana/ui, etc.) | `packages/` directory listing |
| Feature-based frontend | `public/app/features/` contains 50+ feature directories (dashboard, alerting, explore, etc.) | `public/app/features/` directory listing |
| Apps SDK pattern | Dashboard app uses `grafana-app-sdk` with generated API types and Kind schemas | `apps/dashboard/go.mod:1-20` |
| Kind schema system | CUE-based schema definitions in `kinds/` generate both Go and TypeScript code | `package.json:65` (`themes-generate` script) |
| DI via Wire | Service injection wired via `pkg/server/wire.go:1-100` with compile-time cycle detection | `pkg/server/wire.go:1-607` |
| Package naming convention | Backend: `github.com/grafana/grafana/pkg/services/<domain>` | `pkg/services/dashboards/dashboard.go:1` |
| Go module separation | `pkg/apimachinery`, `pkg/apiserver`, `pkg/aggregator` as separate modules | `pkg/apimachinery/go.mod:1` |

## Answers to Dimension Questions

### 1. How does the project keep package boundaries from eroding as it grows?

**Mechanisms observed:**

- **Wire DI with compile-time cycle detection**: `pkg/server/wire.go:1-607` uses Google Wire for dependency injection. Circular dependencies are caught at compile time, preventing boundary erosion through implicit coupling.
- **Go workspaces with explicit module boundaries**: `go.work:6-43` defines 27 separate Go modules. Each app (dashboard, folder, alerting, etc.) has its own `go.mod` at `apps/*/go.mod:1`, preventing cross-app coupling at the module level.
- **Yarn workspace isolation**: Frontend packages in `packages/` are separate workspace entries with their own `package.json`, preventing cross-package coupling.
- **App SDK code generation**: Apps use `make generate` (`apps/dashboard/Makefile:9-60`) to produce API types from CUE Kind schemas, creating explicit, generated contracts.

**Evidence**: `go.work:1-43`, `pkg/server/wire.go:1-100`, `apps/dashboard/go.mod:1`

### 2. Is the structure organised by domain, layer, or a hybrid?

**Hybrid approach observed:**

- **Backend Go (`pkg/`)**: Primarily layer-based:
  - `pkg/infra/` — cross-cutting concerns (logging `log/`, metrics, db access)
  - `pkg/api/` — HTTP layer (handlers, routing, middleware)
  - `pkg/services/` — business logic by domain (dashboards, alerting, auth, etc.)
  - `pkg/tsdb/` — time-series database query backends
  - `pkg/plugins/` — plugin system

- **New Apps (`apps/`)**: Domain-based:
  - `apps/dashboard/`, `apps/folder/`, `apps/alerting/`, `apps/iam/`, etc.
  - Each app is a standalone module with its own `pkg/apis/` for API definitions

- **Frontend TypeScript**: Feature-based:
  - `public/app/features/` — 50+ directories organized by functionality
  - `packages/` — shared UI components and data types

**Evidence**: `pkg/services/` (layer/domain hybrid), `apps/` (domain-based), `public/app/features/` (feature-based)

### 3. Where does internal API surface end and public SDK begin?

**Clear separation observed:**

- **Internal API surface**: `pkg/api/` — HTTP handlers that compose services; `pkg/services/` — business logic implementations; `pkg/infra/` — infrastructure primitives.

- **Public SDK (Go)**: `pkg/apimachinery/` — exported identity, utils, validation types for app development; `pkg/apiserver/` — REST infrastructure for building API servers.

- **Public SDK (TypeScript)**: `packages/` — published npm packages:
  - `@grafana/data` — data structures and types (`packages/grafana-data/package.json:1-50`)
  - `@grafana/ui` — React component library
  - `@grafana/runtime` — runtime services
  - `@grafana/schema` — CUE-generated TypeScript types

- **App SDK boundary**: Apps import `github.com/grafana/grafana-app-sdk` (external) and `github.com/grafana/grafana/pkg/apimachinery` (internal bridge) per `apps/dashboard/go.mod:8-11`.

**Evidence**: `packages/grafana-data/package.json:48-50` (publishConfig), `apps/dashboard/go.mod:8-11`

### 4. What conventions prevent circular dependencies?

**Conventions observed:**

- **Wire DI ordering**: Services declare dependencies as interfaces; Wire injects implementations. No cycles possible at compile time.
- **Layer rule**: Infrastructure (`pkg/infra/`) cannot depend on services; services cannot depend on API handlers; API handlers depend on services.
- **Go module boundaries**: Each app is a separate module; `go.work` ensures no circular Go imports between modules.
- **Frontend module boundaries**: Yarn workspaces have explicit import boundaries via `exports` field in `package.json` (`packages/grafana-data/package.json:19-46`).

**Evidence**: `pkg/server/wire.go:1-607` (Wire injection graph), `pkg/infra/log/log.go:26-30` (infra imports only from infra)

### 5. How does the project structure support multiple contributors with isolated work areas?

**Mechanisms observed:**

- **Feature-based frontend isolation**: `public/app/features/` contains ~50 independent feature directories (alerting, dashboard, explore, etc.). Contributors work in feature directories without requiring cross-feature coordination.
- **App-based backend isolation**: 19 separate Go apps in `apps/` (dashboard, folder, alerting, iam, etc.) provide isolated work areas. Each app has its own module, Makefile, and generated code pipeline.
- **Service-level backend isolation**: `pkg/services/` contains 70+ service packages (dashboards, datasources, alerting, etc.). Teams own services and work within service boundaries.
- **Plugin workspace isolation**: Built-in plugins (loki, tempo, jaeger, mysql, etc.) have separate build steps via `yarn workspace @grafana-plugins/<name>` per `AGENTS.md`.
- **CODEOWNERS enforcement**: `jest.config.codeowner.js` and `.policy.yml` enable fine-grained ownership.
- **CI sharding**: Backend tests use `SHARD`/`SHARDS` env vars for parallel test execution, enabling fast feedback across large test suites.

**Evidence**: `public/app/features/` (50+ directories), `apps/` (19 apps), `pkg/services/` (70+ services), `package.json:41-42` (test:ci with shards)

## Architectural Decisions

| Decision | Rationale | Evidence |
|----------|-----------|----------|
| Go workspace multi-module | Allows apps to be compiled, versioned, and deployed independently while sharing core platform | `go.work:1-43` |
| Yarn workspaces for TypeScript | Enables shared @grafana/* packages with independent versioning and publishing | `packages/grafana-data/package.json:1-50` |
| Layer-based pkg/ organization | Clear separation between HTTP layer (api/), business logic (services/), and infrastructure (infra/) | `pkg/api/`, `pkg/services/`, `pkg/infra/` |
| App SDK for new development | Standardized pattern for building first-class apps on Grafana platform | `apps/dashboard/Makefile:1-60` |
| CUE-based Kind schemas | Single source of truth for dashboard/panel schemas generating both Go and TypeScript | `package.json:65` |
| Wire DI | Compile-time dependency cycle detection prevents architectural decay | `pkg/server/wire.go:1-607` |
| Feature flags for gradual rollout | `pkg/services/featuremgmt/manager.go` enables incremental feature deployment without code freezes | `pkg/services/featuremgmt/manager.go:1-60` |

## Notable Patterns

1. **Dual workspace strategy**: Go workspaces (via `go.work`) for backend multi-module management, Yarn workspaces for frontend package management. This creates two parallel dependency management systems that must be kept in sync.

2. **Generated contract boundaries**: Apps define API types in CUE (`kinds/`), generate Go and TypeScript code via `make generate`, and consume via App SDK. This creates explicit, versioned contracts.

3. **Legacy+modern coexistence**: `pkg/services/` contains classic services; `apps/` contains new App SDK apps; `pkg/registry/apis/` provides K8s-style API registration for both patterns.

4. **Plugin system isolation**: Plugins live in `pkg/plugins/` (backend) and `public/app/plugins/` (frontend), with separate build pipelines and workspace isolation.

5. **Migration layers**: Apps like dashboard have `pkg/migration/` packages with `conversion/` subdirectories, enabling gradual migration from legacy to modern APIs.

## Tradeoffs

| Tradeoff | Impact |
|----------|--------|
| Two workspace systems (Go + Yarn) | Cognitive overhead; requires two package managers and synchronization points |
| Legacy service mix in `pkg/services/` | Some services (~70) have inconsistent internal structure; not all follow modern patterns |
| App SDK adoption is gradual | Old and new patterns coexist, requiring contributors to understand both |
| Large monorepo size | `yarn.lock` (1.3MB), `go.sum` (363KB) indicate high dependency management cost |
| Generated code in source | `make generate` produces files that must be tracked and sometimes manually patched (per `apps/dashboard/Makefile:17-45`) |

## Failure Modes / Edge Cases

1. **Circular dependency insertion**: While Wire catches cycles at compile time, adding new service dependencies without running `make gen-go` could introduce cycles undetected until build time.

2. **Workspace sync failures**: `make update-workspace` must be run after adding Go modules; forgetting this breaks the workspace.

3. **Generated code drift**: If `make generate` is not run after Kind schema changes, generated Go/TS code falls out of sync with CUE sources. The dashboard app shows manual workarounds (`apps/dashboard/Makefile:17-45`).

4. **Monorepo bloat**: CI pipelines must handle ~70+ services, 16+ TS packages, and 19+ Go apps. Test shard configuration is complex.

5. **Cross-workspace import confusion**: Yarn workspaces allow `@grafana/*` imports, but Go modules have separate import paths, creating potential for import path mismatches.

## Future Considerations

1. **Gradual App SDK migration**: As more apps move to App SDK (`apps/`), `pkg/services/` may become primarily legacy code, requiring maintenance and migration strategies.

2. **Module boundary refinement**: The `pkg/aggregator`, `pkg/apimachinery`, `pkg/apiserver` split suggests further decomposition of the platform core may be coming.

3. **Kind schema expansion**: The pattern of CUE-based schema-to-code generation may expand beyond dashboard/panel types to cover more API surface areas.

4. **Plugin system modernization**: The current plugin system (backend in Go, frontend in TS) may need to align with App SDK patterns as the platform evolves.

## Questions / Gaps

| Question | Status |
|----------|--------|
| How is cross-app dependency managed when apps need shared types? | Partial evidence: apps import `github.com/grafana/grafana/pkg/apimachinery` but explicit cross-app dependencies unclear |
| What prevents services in `pkg/services/` from becoming a monolithic blob? | Wire DI provides loose coupling but no explicit package-level boundary enforcement beyond naming conventions |
| How are App SDK apps tested in isolation? | Not fully investigated — apps have their own `go.mod` but share test infrastructure |
| What's the migration path for legacy services to App SDK pattern? | Evidence of migration packages exists (`pkg/migration/`) but no documented strategy |

---

Generated by `dimensions/01-project-structure-boundaries.md` against `grafana`.