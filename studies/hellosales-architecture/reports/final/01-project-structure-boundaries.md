# Project Structure & Boundaries - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Dimension | `01-project-structure-boundaries.md` |
| Sources | cli, grafana, kubernetes, milvus, nats-server, openfga, pocketbase, temporal, victoriametrics |
| Date | 2026-05-19 |

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

Project structure approaches across these nine Go projects range from naive single-module flat files (nats-server at 6/10) to exemplar layered multi-module enforcement (kubernetes at 9/10). The core tension is between **simplicity** (single module, no tooling) and **enforceability** (multi-module, import-boss, Wire DI). All high-scoring projects share one property: they encode architectural constraints as executable policy, not just documentation. The clearest convergence is on a hybrid domain/layer organization, with `internal/` or `lib/` as a shared infrastructure zone and domain modules at the top level. Projects that rely purely on naming conventions (pocketbase, nats-server, victoriametrics) score lower because boundaries can erode without mechanical enforcement.

## Core Thesis

Package boundary health in Go projects depends less on which directory names are chosen and more on **how deliberately the boundary is enforced**. The difference between a 6 and a 9 is not the presence of `internal/` or the choice of domain-vs-layer organization — it is whether architectural constraints are encoded in tooling (import-boss, Wire, depguard, multi-module) or left to convention. HelloSales should invest in mechanical enforcement early, because convention-only boundaries degrade predictably as contributors and time accumulate.

## Rating Summary

| Source | Score | Approach | Main Strength | Main Concern |
|--------|-------|----------|---------------|--------------|
| cli | 7/10 | Hybrid domain/layer (`pkg/cmd/<noun>/`, `internal/`) with single module | Clear zone separation via naming conventions and `/v2` module path | `internal/` technically accessible from `pkg/cmd/`; no linter enforcement |
| grafana | 8/10 | Go workspaces + Yarn workspaces; layer-based `pkg/`, domain-based `apps/` | Wire DI compile-time cycle detection; 27-module isolation | Dual workspace (Go + Yarn) adds conceptual overhead |
| kubernetes | 9/10 | Layer-based (apimachinery → api → client-go → pkg → cmd) with `staging/` publishing | `import-boss` + `import-restrictions.yaml` mechanical enforcement | `pkg/kubemark` override proves boundaries can be bypassed |
| milvus | 8/10 | Multi-module (root, `pkg/v3`, `client/v2`); role-based coordinator/node | golangci-lint depguard rules; centralized component interfaces | Large monolithic `internal/proxy/` (100+ files) |
| nats-server | 6/10 | Single module; flat `server/` package with subpackages as utilities | Simple dependency graph; no cycles possible | 6917-line `client.go`, 366K-line `filestore.go`; no domain boundaries |
| openfga | 8/10 | Layer-based (`cmd/` → `pkg/` → `internal/`) with strict `internal/` vs `pkg/` split | Go `internal/` visibility + `importas`/`gci` lint conventions | `tests/` sits outside both `internal/` and `pkg/` convention |
| pocketbase | 7/10 | Layer-based (`tools/` → `core/` → `apis/` → `cmd/`) without `internal/` | Clear technical layer separation; extensive hook system | No formal boundary enforcement; `App` interface (60+ methods) is a bottleneck |
| temporal | 8/10 | Hybrid: layer-based top-level (`service/`, `common/`, `client/`, `api/`) + domain within | Service isolation; uber/fx DI; `api/` protobuf-generated public surface | Large `common/` (70+ packages) risks becoming catch-all |
| victoriametrics | 8/10 | Single module; `lib/` (shared) + `app/` (binaries); no `internal/` | Clean lib/app separation for multi-binary product | Convention-only boundary enforcement; `lib/` has 70+ flat subpackages |

## Approach Models

### Model 1: Multi-Module with Mechanical Enforcement
**Represented by: kubernetes, milvus, grafana**

These projects split code across multiple Go modules and use tooling to enforce boundaries. Kubernetes uses `import-boss` with `import-restrictions.yaml` to declare allowed/forbidden import prefixes per staging repository. Milvus uses golangci-lint `depguard` rules to forbid deprecated packages and mandate specific error/logging packages. Grafana uses Wire DI with compile-time cycle detection.

**What converges**: The insight that naming conventions alone are insufficient; boundaries must be machine-checkable. All three projects use multi-module for independent versioning and deployment isolation.

**Why they diverge**: Kubernetes publishes 32 independently versioned staging repos from a monorepo; Milvus keeps three modules (root, pkg/v3, client/v2) for separate public SDK; Grafana uses 27 modules (via Go workspaces) to allow independent app versioning.

### Model 2: Single Module with Internal/ Enforcement
**Represented by: openfga, cli**

These projects use Go's `internal/` package visibility as the primary boundary mechanism. The compiler enforces that `internal/` packages cannot be imported from outside the module. Linting conventions (`importas`, `gci` in openfga; code review enforcement in cli) supplement the compiler rule.

**What converges**: `internal/` provides a zero-cost boundary — no tooling setup, compiler-enforced. The `pkg/` subtree serves as the stable public surface.

**Why they diverge**: cli uses a hybrid domain/layer split (`pkg/cmd/` by noun, `internal/` by infrastructure); openfga uses pure layer-based (`pkg/` for API, `internal/` for implementation). openfga adds lint-enforced import ordering; cli relies on review.

### Model 3: Single Module with Convention-Only Boundaries
**Represented by: nats-server, pocketbase, victoriametrics, temporal**

These projects use directory naming conventions to signal boundaries but lack mechanical enforcement. nats-server has a flat `server/` package with 100+ files; pocketbase uses `core/`, `apis/`, `tools/` without `internal/`; victoriametrics uses `lib/` and `app/`; temporal uses `service/`, `common/`, `client/`, `api/`.

**What converges**: All score 6-8 and all acknowledge the tradeoff — simpler structure but no automated protection against boundary erosion.

**Why they diverge**: temporal and victoriametrics score 8 with well-maintained conventions and clear ownership; nats-server scores 6 because large files (6917, 366K lines) make the package boundary meaningless; pocketbase scores 7 because the `App` interface bottleneck and lack of `internal/` isolation create coupling risk.

## Pattern Catalog

### Pattern 1: Internal/ as Compile-Enforced Encapsulation
**Problem solved**: Prevents external consumers from importing implementation details.
**Sources**: openfga (`internal/graph/`, `internal/authn/`), cli (`internal/gh/`, `internal/config/`)
**Why it works**: Go's `internal/` package rule is compiler-enforced with zero tooling investment. Any code outside the module cannot import `internal/` packages.
**When to copy**: When you have a public module (`pkg/`) and want to guarantee users cannot depend on implementation details.
**When overkill**: For single-binary projects where there is no external consumer — `internal/` adds complexity without benefit.
**Risk**: Within a single module, sibling packages can import `internal/` freely. This is convention-only unless supplemented with lint rules.

### Pattern 2: Layered Dependency Flow (cmd → pkg → internal)
**Problem solved**: Establishes a one-way dependency direction that prevents infrastructure from depending on business logic.
**Sources**: openfga (`cmd/` → `pkg/server/` → `internal/graph/`), kubernetes (cmd → pkg → staging repos), milvus (client → pkg → internal)
**Why it works**: Each layer has a clearly defined role: entry point composes public API, public API layer composes implementation, implementation has no upward dependencies.
**When to copy**: When building any service with distinct transport, business logic, and infrastructure layers.
**When overkill**: For simple CLI tools where all logic is in one package, layering adds indirection without value.
**Evidence**: `cmd/run/run.go:58-85` (openfga) imports both `internal/` and `pkg/`; `pkg/server/server.go:25-46` imports only `internal/`; `internal/` packages have no upward imports.

### Pattern 3: Multi-Module for Independent Versioning
**Problem solved**: Allows a public SDK to evolve independently from internal code, and allows consumers to pin to specific API versions.
**Sources**: kubernetes (32 staging repos), milvus (`pkg/v3`, `client/v2`), grafana (19 apps as separate modules)
**Why it works**: Each module has its own `go.mod`, enabling independent `go get` versioning. The root module uses `replace` directives to develop against local sources.
**When to copy**: When you have a publicly consumed library or SDK alongside internal implementation, or when independent teams need to version independently.
**When overkill**: For single-service projects with no external consumers. Multi-module adds coordination overhead.
**Evidence**: `go.work:6-43` (kubernetes); `client/go.mod:124` (milvus: `replace github.com/milvus-io/milvus/pkg/v3 => ../pkg`)

### Pattern 4: Domain/Role Partitioning at Top Level
**Problem solved**: Allows teams to work in isolated areas with minimal coordination.
**Sources**: milvus (coordinator vs. node roles), temporal (frontend, history, matching, worker services), grafana (`apps/` by domain)
**Why it works**: Top-level directories map to organizational boundaries (teams, services, deployment units). Changes within one domain rarely require changes in another.
**When to copy**: When you have distinct services or domain areas owned by different teams, or when you want to enable independent deployment.
**When overkill**: For small codebases where all contributors work on everything. Domain partitioning adds navigation overhead.
**Evidence**: `internal/rootcoord/`, `internal/datacoord/`, `internal/querycoordv2/` (milvus); `service/frontend/`, `service/history/`, `service/matching/` (temporal)

### Pattern 5: Builder Pattern for Conditional Dependency Wiring
**Problem solved**: Allows optional resolvers or features to be wired in without complicating the core dependency graph.
**Sources**: openfga (`CheckResolverOrderedBuilder` with `WithCachedCheckResolverOpts`, `WithShadowResolverEnabled`)
**Why it works**: A builder constructs the dependency chain with functional options, keeping the core struct simple and making conditional wiring explicit in configuration.
**When to copy**: When you have plugin-like or optional components in a dependency chain.
**When overkill**: For simple dependencies with no optional variants. Builder adds indirection.
**Evidence**: `internal/graph/builder.go:73-106`

### Pattern 6: Centralized Component Interface Definition
**Problem solved**: Makes cross-component dependencies explicit and prevents implicit coupling.
**Sources**: milvus (`internal/types/types.go:54-59` defines `Component` interface with `Init()`, `Start()`, `Stop()`, `Register()`)
**Why it works**: All coordinators and workers implement the same `Component` interface, enabling uniform lifecycle management and dependency injection via setters.
**When to copy**: When you have multiple implementations of the same component type (e.g., multiple storage backends, multiple coordinators).
**When overkill**: For single-implementation components. Interface adds indirection without benefit.
**Evidence**: `internal/types/types.go:54-339`

### Pattern 7: Command-Per-Operation Package Structure
**Problem solved**: Makes adding a new operation a bounded, isolated change.
**Sources**: cli (`pkg/cmd/issue/list/`, `pkg/cmd/pr/checkout/`), openfga (`pkg/server/commands/check_command.go`, `write_command.go`)
**Why it works**: Each subcommand or API operation lives in its own package with its own `foo.go`, `foo_test.go`, and optionally `http.go`. Contributors rarely冲突.
**When to copy**: For CLIs or APIs with many operations. Scales well past 20+ operations.
**When overkill**: For small APIs with fewer than 5 operations. Directory-per-operation adds navigation depth.
**Evidence**: `pkg/cmd/issue/list/list.go:25-45` shows `Options` struct and `NewCmdList` factory pattern

## Key Differences

### Mechanical Enforcement vs. Convention
The highest-scoring projects (kubernetes 9, grafana 8, milvus 8, openfga 8) all use some form of mechanical enforcement: import-boss, Wire DI, depguard lint rules, or lint-enforced import ordering. The lower-scoring projects (nats-server 6) rely purely on convention. This is the single strongest predictor of score.

### Single Module vs. Multi-Module
Three projects use multi-module for independent versioning (kubernetes, milvus, grafana). Six use single module. The single-module projects that score well (openfga 8, temporal 8) compensate with strong internal conventions and lint rules. The single-module project that scores lowest (nats-server 6) has neither mechanical enforcement nor internal package boundaries.

### Domain vs. Layer Organization
No project uses pure domain organization at the top level. All use layer-based top-level decomposition (api/infra/service split) with domain subpackages within layers. The "hybrid" label in the ratings reflects this: domain for subpackaging, layer for top-level structure.

### Internal/ Convention Usage
Five projects use `internal/` (cli, openfga, nats-server, temporal, pocketbase). Four projects avoid `internal/` in favor of custom conventions (kubernetes uses `staging/` for published packages; milvus uses multi-module; victoriametrics uses `lib/`; grafana uses `apps/` and `pkg/`). The `internal/` convention is neither necessary nor sufficient for a high score — kubernetes achieves the highest score without it.

## Tradeoffs

| Tradeoff | Benefit | Cost | Best-Fit Context | Failure Mode |
|----------|---------|------|------------------|--------------|
| Multi-module vs single module | Independent versioning; mechanical boundary enforcement | Coordination overhead; `replace` directives required; harder `go get` | Public SDK alongside internal code; multiple teams needing version independence | `go.work` drift; forgetting to run `make update-workspace` (grafana) |
| `internal/` vs naming convention | Compiler-enforced encapsulation for free | Within-module `internal/` is convention-only; adds directory nesting | Projects with public `pkg/` surface | Contributors bypass with cross-imports (cli: `pkg/cmd/` → `internal/`) |
| Domain vs layer top-level | Clear team ownership; isolated work areas | May force domain跨 layer imports | Multiple teams, microservices, or independently deployed units | Cross-domain dependencies defeat isolation |
| Builder pattern for wiring | Clean optional component handling | Indirection; two places to modify (builder + config) | Plugin-like or A/B-tested features | Infinite delegation loops if delegate==resolver (openfga) |
| Large single-file packages | Easy to find all related code; no import cycles | Merge conflicts; no independent compilation; no encapsulation | Early-stage features, simple domains | Contributor conflicts; unmaintainable files (nats-server `client.go` 6917 lines) |
| Centralized interface (e.g., `App` interface) | Easy mocking; clear contract | God interface; every feature touches central file | Framework/toolkit dual-purpose projects | Bottleneck for new features; implementation coupling (pocketbase) |

## Decision Guide

**Are you building a public SDK?**
Yes → Use multi-module (like kubernetes, milvus). Separate `pkg/` or `sdk/` as a versioned module. Use `replace` directives during development.
No → Single module may suffice.

**Do you have multiple independently deployed services?**
Yes → Use domain-based top-level directories (like temporal `service/` or milvus coordinator/node). Each service gets its own package.

**Do you have an internal implementation that external consumers might accidentally depend on?**
Yes → Use `internal/` for implementation. Supplement with lint rules (like openfga's `importas`/`gci`) to prevent within-module boundary crossing.

**Are contributors frequently conflicting on the same files?**
Yes → Your package boundaries are too coarse. Split into smaller packages by operation or domain (like cli command-per-subcommand). Consider multi-module.

**Are you relying on naming conventions alone?**
Yes → Add one mechanical enforcement mechanism: either `internal/` package visibility, lint rules (`depguard`, `importas`), or Wire-style DI with compile-time cycle detection.

## Practical Tips

1. **Use `internal/` even in single-module projects** — it provides compiler-enforced encapsulation against external consumers (if you ever publish subpackages) and signals intent.

2. **Add `golangci-lint` import-order rules** (`gci` sections) — openfga's import ordering (standard → default → `github.com/openfga` → localmodule) makes cross-boundary imports obvious in diffs.

3. **Use depguard to mandate specific packages** — milvus's rule requiring `github.com/milvus-io/milvus/pkg/v3/log` over `github.com/pkg/errors` prevents ad-hoc dependency patterns.

4. **Define stable interfaces in `pkg/`** — openfga's `OpenFGADatastore` in `pkg/storage/storage.go:150` and milvus's `Component` interface in `internal/types/types.go:54` show that interfaces in the public/parent layer enable testing and swapping implementations.

5. **Command-per-subcommand scales past 20 operations** — cli shows this works at ~40 command packages. Each `pkg/cmd/<noun>/<verb>/` is self-contained with its own test files.

6. **Use `go generate` for boilerplate** — cli uses `moq` for mock generation; kubernetes uses `code-generator` for typed clientsets. This keeps generated code in sync with interfaces.

7. **Define a `Factory` or DI module per service** — temporal's `var Module = fx.Options(...)` pattern in each service makes dependency graphs explicit and testable.

## Anti-Patterns / Caution Signs

1. **Files exceeding 100K lines** — nats-server's `filestore.go` (366K) and `jetstream_cluster.go` (339K) indicate boundary failure. Files this large cannot be safely modified by multiple contributors.

2. **Single `server/` package with 100+ files** — nats-server's `server/` contains all core logic. No internal namespace protection exists; any file can import any other.

3. **God interface (>50 methods)** — pocketbase's `App` interface in `core/app.go` (60+ methods) creates a bottleneck. Every new feature must update this interface and all implementations.

4. **No mechanical boundary enforcement** — projects relying purely on naming conventions (pocketbase, nats-server, victoriametrics) show that boundaries degrade over time without tooling.

5. **`internal/` accessible from public packages within same module** — cli allows `pkg/cmd/` to import `internal/` because they share a module. This defeats the purpose of `internal/` as a boundary.

6. **Missing `import-restrictions.yaml` update after adding staging repos** — kubernetes requires manual updates to `staging/publishing/import-restrictions.yaml` when adding new staging repos. Forgetting this creates a gap in enforcement.

7. **Convention-only layer rules without lint enforcement** — grafana's layer rule (infra cannot import services) is convention-based. Without `import-boss`-style enforcement, violations are only caught in code review.

## Notable Absences

1. **No evidence of automated dependency graph validation in CI** — Only kubernetes uses `import-boss` in CI. Most projects rely on compile-time cycle detection or manual code review.

2. **No evidence of ADR (Architecture Decision Record) documentation** — The rationale for structural choices (why milvus uses multi-module, why kubernetes uses `staging/`, why victoriametrics avoids `internal/`) is not documented in any source.

3. **No evidence of formal public API stability policies** — cli uses `/v2` module path suggesting stability intent but has no documented deprecation policy. openfga's embeddable server pattern lacks explicit semver guarantees.

4. **No evidence of cross-module dependency management tooling** — grafana's `make update-workspace` must be run after adding Go modules; milvus requires coordinated `replace` directive updates. These are manual steps with no automated guard.

5. **No evidence of package size limits or file count enforcement** — nats-server's large files are not flagged by any tooling. Only convention and code review stand between current state and worse.

## Per-Source Notes

**cli** — Best-in-class for command-per-subcommand organization. The `Options` struct + `Factory` injection pattern is worth copying for any CLI framework. Main gap is lack of linter enforcement for `internal/` → `pkg/cmd/` imports.

**grafana** — Demonstrates that dual workspace (Go + Yarn) works at scale, but the cognitive overhead is real. Wire DI is the key enforcement mechanism; without it, the 70+ services would be harder to maintain.

**kubernetes** — The gold standard for mechanical boundary enforcement. `import-boss` + `import-restrictions.yaml` should be studied by any project serious about architecture at scale. The `pkg/kubemark` override exception proves that even the best systems can be gamed.

**milvus** — Underrated approach: three focused modules (root, pkg/v3, client/v2) with depguard lint rules. The centralized `Component` interface in `internal/types/types.go` is a clean pattern for multi-service coordination.

**nats-server** — Cautionary tale. The single-module flat `server/` package works because the team is small and the code is mature, but it does not scale. Large files indicate the boundary has already eroded.

**openfga** — Cleanest pure-layer implementation. The `cmd/` → `pkg/` → `internal/` flow is unambiguous and well-linted. The `tests/` directory outside the convention is a minor blemish.

**pocketbase** — Good for single-service backends but lacks the enforcement needed for growing projects. The `App` interface pattern works for frameworks; it would be a bottleneck in a large service.

**temporal** — Service-based isolation at top level is the right model for microservices. The `common/` package is the main risk — at 70+ subpackages it could become a dumping ground without active stewardship.

**victoriametrics** — Elegant `lib/`/`app/` split for multi-binary products. The absence of `internal/` is a deliberate choice that trades mechanical enforcement for simplicity. Works because the team is small and conventions are respected.

## Open Questions

1. **When does a single-module project need to split into multi-module?** The evidence suggests: when you have a public SDK, when teams need independent versioning, or when the codebase exceeds ~500K lines and compile times become problematic.

2. **What is the right granularity for domain packages?** cli uses noun/verb nesting (40+ packages); nats-server uses flat files. Neither extreme is universally correct — the right answer depends on operation count, team size, and expected change frequency.

3. **Can convention-only boundaries work long-term?** The evidence is mixed. victoriametrics (8/10) and temporal (8/10) suggest it can with disciplined teams; nats-server (6/10) suggests it degrades. The difference may be team culture, not structure.

4. **How should generated code be organized?** kubernetes puts generated code in `staging/src/k8s.io/` (published separately); grafana generates into source trees; openfga uses `go:generate` alongside source. No consensus emerges.

5. **What replaces `internal/` for multi-module projects?** kubernetes uses `staging/` as the "publishable" boundary; milvus uses multi-module directly; victoriametrics uses `lib/`. The question is unanswered — `internal/` only helps within a module.

## Evidence Index

| Source | Area | Evidence | Reference |
|--------|------|----------|-----------|
| cli | Module definition | Single Go module `github.com/cli/cli/v2` | `go.mod:1-5` |
| cli | Entry point | `cmd/gh/main.go` delegates to `internal/ghcmd.Main()` | `cmd/gh/main.go:9-10` |
| cli | Factory pattern | `cmdutil.Factory` wires all dependencies | `pkg/cmdutil/factory.go:16-43` |
| cli | Domain interfaces | `internal/gh.Config` interface defines domain contract | `internal/gh/gh.go:29-80` |
| cli | Internal zone | 24 packages under `internal/` | `ls internal/` |
| grafana | Go workspace | `go.work` defines 27 Go modules | `go.work:6-43` |
| grafana | App module boundary | Each app has its own `go.mod` | `apps/dashboard/go.mod:1` |
| grafana | Wire DI | Service injection via `pkg/server/wire.go:1-607` | `pkg/server/wire.go:1-100` |
| grafana | Kind schema system | CUE-based schemas generate Go and TypeScript | `package.json:65` |
| kubernetes | Import restrictions | YAML-based allow/forbid prefix rules | `staging/publishing/import-restrictions.yaml:1-353` |
| kubernetes | Package restrictions | `pkg/.import-restrictions` blocks `pkg/` from `cmd/` | `pkg/.import-restrictions:1-14` |
| kubernetes | Module replace mapping | `k8s.io/api => ./staging/src/k8s.io/api` | `go.mod:229-263` |
| kubernetes | Layer order | apimachinery → api → client-go → pkg → cmd | `staging/src/k8s.io/` dirs |
| milvus | Multi-module structure | `pkg/go.mod:1`, `client/go.mod:1` | `pkg/go.mod:1`, `client/go.mod:1` |
| milvus | Component interfaces | Centralized in `internal/types/types.go:54-59` | `internal/types/types.go:54-59` |
| milvus | golangci depguard | Mandates `pkg/v3/log` over deprecated packages | `.golangci.yml:24-49` |
| milvus | Module replace | `replace github.com/milvus-io/milvus/pkg/v3 => ./pkg` | `client/go.mod:124` |
| nats-server | Large file — client | 6917 lines in single file | `server/client.go:1-6917` |
| nats-server | Large file — filestore | 366K bytes | `server/filestore.go` |
| nats-server | Internal package | `internal/fastrand` uses `go:linkname` | `internal/fastrand/fastrand.go:11-12` |
| openfga | Internal packages | 24 subpackages: `graph/`, `authn/`, `authz/`, `validation/` | `internal/` |
| openfga | Public packages | `pkg/server/`, `pkg/storage/`, `pkg/typesystem/` | `pkg/` |
| openfga | Lint import rules | `importas` alias enforcement, `gci` sections | `.golangci.yaml:46-108` |
| openfga | Resolver builder | `CheckResolverOrderedBuilder` with functional options | `internal/graph/builder.go:73-106` |
| openfga | Storage interface | `OpenFGADatastore` in `pkg/storage/storage.go:150` | `pkg/storage/storage.go:150-429` |
| pocketbase | Top-level layout | `apis/`, `core/`, `tools/`, `plugins/`, `cmd/` | `pocketbase.go:1-22` |
| pocketbase | App interface | 60+ methods in `core/app.go:20-1133` | `core/app.go:20-1133` |
| pocketbase | No internal/ | Single module with no `internal/` directories | `go.mod:1-49` |
| temporal | Service packages | Frontend, history, matching, worker | `service/frontend/`, `service/history/` |
| temporal | Common utilities | 70+ subpackages under `common/` | `common/metrics/`, `common/persistence/` |
| temporal | DI via uber/fx | `var Module = fx.Options(...)` per service | `service/frontend/fx.go:66` |
| temporal | Persistence factory | `Factory` interface abstraction | `common/persistence/client/factory.go:27-48` |
| victoriametrics | lib/app split | `lib/` (shared), `app/` (binaries) | `app/:ls`, `lib/:ls` |
| victoriametrics | App Makefiles | `Makefile:24` includes `app/*/Makefile` | `Makefile:24` |
| victoriametrics | Web UI module | Separate `go.mod` for UI | `app/vmui/packages/vmui/web/go.mod:1` |
| victoriametrics | No internal/ | Search for `^package internal` returned no matches | `grep -r "package internal" lib/ app/` |
| victoriametrics | lib storage size | 50+ files in `lib/storage/` | `lib/storage/:ls` |

---

Generated by dimension `01-project-structure-boundaries.md`.