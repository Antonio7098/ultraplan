# Source Analysis: openfga

## Project Structure & Boundaries

### Source Info

| Field | Value |
|-------|-------|
| Name | openfga |
| Path | `sources/openfga` |
| Language / Stack | Go 1.26 |
| Analyzed | 2026-05-19 |

## Summary

OpenFGA is a Go monorepo implementing a Zanzibar-style ReBAC authorization engine. It uses a strict `internal/` vs `pkg/` split where `pkg/` holds the public-facing API surface (server, storage interface, typesystem) and `internal/` holds implementation details (graph resolution, authentication, validation, etc.). Package boundaries are enforced by Go's `internal/` visibility rules, lint conventions (`importas`, `gci`), and a layered architecture that flows HTTP/gRPC → commands → graph resolution → storage. The structure is primarily **layer-based** with domain-oriented subpackaging within layers. Single-module, single-binary delivery with optional embedding.

## Rating

**8/10** — Excellent layered structure with clear `internal`/`pkg` separation. Minor扣分: `internal/test` exists alongside `pkg/testutils`, some `internal/` packages like `checkutil` and `stack` have ambiguous purpose, and the `tests/` directory at root sits outside both `internal` and `pkg` convention. The layered flow (HTTP → command → graph → storage) is clean and well-documented in `AGENTS.md`.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Top-level dirs | `cmd/`, `internal/`, `pkg/`, `tests/`, `docs/`, `assets/`, `telemetry/` | `sources/openfga/` listing |
| go.mod module | `module github.com/openfga/openfga` | `go.mod:1` |
| Internal packages | 24 subpackages: `graph/`, `authn/`, `authz/`, `validation/`, `planner/`, `condition/`, `throttler/`, `concurrency/`, etc. | `internal/` |
| Public packages | `pkg/server/`, `pkg/storage/`, `pkg/typesystem/`, `pkg/encoder/`, `pkg/gateway/`, `pkg/middleware/` | `pkg/` |
| Command layer | `pkg/server/commands/` — 30+ command files per API operation | `pkg/server/commands/` |
| Storage interface | `OpenFGADatastore` interface in `pkg/storage/storage.go` with implementations (memory, postgres, mysql, sqlite) | `pkg/storage/storage.go:150-429` |
| Graph engine | `internal/graph/` — `CheckResolver` interface, `LocalChecker`, `CachedCheckResolver`, resolver chain builder | `internal/graph/interface.go:13-47`, `internal/graph/builder.go:73-106` |
| TypeSystem | `pkg/typesystem/` — authorization model parsing/validation | `pkg/typesystem/typesystem.go` |
| CMD entrypoint | `cmd/openfga/root.go`, `cmd/run/run.go` — server startup with Cobra | `cmd/openfga/root.go:1`, `cmd/run/run.go:1-1266` |
| Lint import rules | `importas` alias enforcement for `openfgav1` and `parser` | `.golangci.yaml:46-52` |
| Import ordering | `gci` sections: standard → default → `github.com/openfga` → localmodule | `.golangci.yaml:96-100` |
| Run command imports | `cmd/run/run.go` imports both `internal/*` and `pkg/*` packages | `cmd/run/run.go:58-85` |
| Server imports | `pkg/server/server.go` imports `internal/graph`, `internal/planner`, `internal/telemetry` | `pkg/server/server.go:25-46` |
| Resolver chain | Circular linked list of `CheckResolver` implementations, built via builder pattern | `internal/graph/builder.go:66-106` |
| Module deps direction | `pkg/` → `internal/` (e.g., `pkg/server/server.go:27` imports `internal/graph`) | `pkg/server/server.go:27` |
| Storage implementations | `pkg/storage/memory/`, `postgres/`, `mysql/`, `sqlite/` — each separate package | `pkg/storage/` |
| Test packages | `tests/` at root (YAML matrix tests), `internal/mocks/` (auto-generated) | `tests/`, `internal/mocks/` |
| Build info | `internal/build/` — build information package | `internal/build/` |

## Answers to Dimension Questions

### 1. How does the project keep package boundaries from eroding as it grows?

**Mechanisms:**

- **Go's `internal/` visibility rule**: Packages under `internal/` can only be imported by their parent and sibling packages within the same module — external consumers cannot import them. This enforces encapsulation without tooling.

- **Lint-enforced import conventions** (`.golangci.yaml:46-108`): The `importas` linter enforces strict aliased imports (`openfgav1` for proto, `parser` for language transformer). The `gci` linter enforces import ordering (standard → default → `github.com/openfga` → localmodule). These make cross-boundary imports obvious in diffs.

- **Layered dependency flow**: The architecture enforces a one-way dependency direction: `cmd/` → `pkg/` (public API) → `internal/` (implementation). The `pkg/` packages do not import each other unnecessarily. Evidence: `pkg/server/server.go:25-46` imports `internal/graph`, `internal/planner`, `internal/telemetry`, but these `internal/` packages do not import `pkg/server/`.

- **Single module**: The entire repo is a single Go module (`github.com/openfga/openfga`), preventing multi-module drift where package boundaries could fragment across versioned artifacts.

### 2. Is the structure organised by domain, layer, or a hybrid?

**Hybrid with layer dominance:**

- **Layer separation** is the primary organizing principle:
  - `cmd/` — entry point (CLI, server startup)
  - `pkg/` — public API surface (transport-agnostic interfaces and server implementation)
  - `internal/` — implementation details (graph engine, auth, validation, storage wrappers)

- **Domain subpackages within `internal/`**: e.g., `internal/graph/`, `internal/condition/`, `internal/planner/` are domain-oriented groupings of related resolution logic.

- **Storage implementations split by backend**: `pkg/storage/memory/`, `pkg/storage/postgres/`, `pkg/storage/mysql/`, `pkg/storage/sqlite/` — each in its own package, consistent with the storage interface in `pkg/storage/storage.go`.

- **Public vs internal split is the most important boundary**: `pkg/` exposes stable, versioned interfaces (`OpenFGADatastore`, `Typesystem`, `Server`). `internal/` contains implementation that can change without API stability concerns.

### 3. Where does internal API surface end and public SDK begin?

**The public SDK surface is `pkg/`**, specifically:

- **`pkg/server/`** — HTTP/gRPC handlers and the `Server` struct (`pkg/server/server.go:48-1219`). External consumers can call `NewServerWithOpts()` to embed OpenFGA as a Go library (documented in README and `pkg/server/server.go`).

- **`pkg/storage/`** — The `OpenFGADatastore` interface (`pkg/storage/storage.go:150`) defines the storage contract. External storage implementers would implement this interface.

- **`pkg/typesystem/`** — The `Typesystem` type (`pkg/typesystem/typesystem.go`) and `weighted_graph.go` for authorization model parsing.

- **`pkg/encoder/`**, **`pkg/gateway/`**, **`pkg/logger/`**, **`pkg/middleware/`** — utility packages that are public.

**The internal surface (`internal/`)** is explicitly for implementation details:

- `internal/graph/` — Core resolution engine (check resolvers, recursive resolution, caching)
- `internal/authn/`, `internal/authz/` — Authentication and authorization middleware
- `internal/validation/` — Tuple and request validation
- `internal/planner/` — Thompson sampling strategy planner
- `internal/throttler/` — Dispatch throttling

**Evidence of clear boundary**: `cmd/run/run.go:58-85` imports from both `internal/` and `pkg/` explicitly, showing the composition point. `AGENTS.md:43-47` explicitly documents which packages are "internal implementation" vs "public API surface."

### 4. What conventions prevent circular dependencies?

- **Go's internal package rule**: Circular imports are structurally impossible across the `internal/` → `pkg/` boundary because `internal/` packages cannot be imported by packages outside their parent module hierarchy. Within `pkg/` itself, the layered architecture (server → commands → storage/typesystem) flows in one direction.

- **Command pattern decouples handlers from business logic**: API handlers in `pkg/server/*.go` delegate to command objects in `pkg/server/commands/*.go`. Commands call `internal/graph/` and `pkg/storage/`. The handler never calls storage directly, preventing server ↔ storage cycles.

- **Interface segregation in storage**: `pkg/storage/storage.go` defines interfaces (`RelationshipTupleReader`, `RelationshipTupleWriter`, `Transactioner`) that are implemented by concrete storage backends. `pkg/server/` depends on the interface, not the implementation, breaking circular deps.

- **No evidence of import cycles**: Grep for `internal/*` imports in `pkg/storage/` returned no results for `internal/mocks` (test-only). Actual implementation files like `pkg/storage/cache.go` and `pkg/storage/storagewrappers/` do import from `internal/build` and `internal/utils` — one-way dependency confirmed.

### 5. How does the project structure support multiple contributors with isolated work areas?

**Well-supported through clear package ownership:**

- **Modular subpackages** allow contributors to work in distinct areas without stepping on each other:
  - `internal/graph/` for resolution algorithm changes
  - `pkg/storage/memory/`, `postgres/`, `mysql/`, `sqlite/` for storage backend changes
  - `pkg/server/commands/` for API operation changes (each command file is isolated)
  - `internal/authn/oidc/`, `internal/authn/presharedkey/` for auth method additions

- **Command-per-operation pattern** (`pkg/server/commands/check_command.go`, `write_command.go`, etc.) means adding a new API operation is a bounded change: add a proto definition in `openfga/api`, add a handler in `pkg/server/`, add a command in `pkg/server/commands/`, add tests in `tests/`.

- **Test package convention** (`tests/check/`, `tests/listobjects/`, `tests/listusers/`) with YAML matrix tests in `assets/tests/*.yaml` allows contributors to add test cases without modifying Go code.

- **Auto-generated mocks** in `internal/mocks/` via `go generate` (`mockgen`) mean contributors don't manually maintain mock files. The `make generate-mocks` command is documented in `AGENTS.md`.

- **golangci-lint v2 with `gci` import ordering** ensures PR diffs show only relevant import changes, reducing merge conflicts from formatting.

## Architectural Decisions

1. **Single Go module for the entire repo** — Despite having multiple logical components (server, storage backends, CLI), all packages live in `github.com/openfga/openfga`. This avoids multi-module version coordination overhead and keeps dependency management simple.

2. **`internal/` as implementation boundary** — Go's language-level internal package restriction is used as the primary enforcement mechanism for encapsulation. This is superior to naming conventions alone because it is compiler-enforced.

3. **`pkg/server/commands/` as mediating layer** — The command pattern decouples transport (HTTP/gRPC handlers in `pkg/server/`) from business logic (commands in `pkg/server/commands/`). This makes the business logic testable without network transport and allows transport swapping (e.g., adding WebSocket support) without touching command logic.

4. **Resolver chain as circular linked list** — The `CheckResolver` interface with `SetDelegate`/`GetDelegate` forms a circular chain. This is an intentional architectural choice that allows optional resolvers (caching, throttling, shadow A/B) to be conditionally wired in via the builder pattern (`internal/graph/builder.go:73-106`). The circular nature means the last resolver delegates back to the first.

5. **Storage backend per package** — Each storage backend (memory, postgres, mysql, sqlite) is a separate subpackage under `pkg/storage/`. This allows adding new backends without modifying existing ones, and the shared `sqlcommon/` package reduces duplication between postgres and mysql.

6. **`tests/` directory outside `pkg` and `internal`** — The YAML matrix test files and their Go runners live in `tests/` at the repo root. This is a pragmatic choice for test assets that are embedded via `go:embed`, keeping test-only content separate from production code. However, this creates a third category outside the `internal`/`pkg` convention.

## Notable Patterns

- **Builder pattern for resolver chain** (`internal/graph/builder.go`): `CheckResolverOrderedBuilder` with functional options (`WithCachedCheckResolverOpts`, `WithShadowResolverEnabled`) constructs the resolver chain. This is a clean way to manage conditional wiring of 4+ resolver types.

- **Interface-based storage abstraction** (`pkg/storage/storage.go`): `OpenFGADatastore`, `RelationshipTupleReader`, `RelationshipTupleWriter`, `Transactioner` interfaces allow multiple storage implementations. The `storagewrappers/` subdirectory adds cross-cutting concerns (caching, request context, combined tuple readers) as decorators.

- **Error sentinel pattern**: Errors are defined as sentinels in `var ()` blocks (e.g., `ErrNotFound`), wrapped with `%w`, and checked with `errors.Is`/`errors.As`. Domain-to-API error mapping is done via `*ErrorToServerError` converter functions in each command package. Documented in `AGENTS.md`.

- **Context propagation for tuple readers** (`pkg/storage/storage.go:31-52`): `ContextWithRelationshipTupleReader` and `RelationshipTupleReaderFromContext` allow the tuple reader to be threaded through context, decoupling it from explicit parameter passing in deep call stacks.

- **`go:generate` for mock generation** (`internal/graph/interface.go:1`): `//go:generate mockgen -source interface.go -destination ./mock_check_resolver.go -package graph CheckResolver` auto-generates mocks. Contributors run `make generate-mocks`.

- **`go:embed` for test assets** (`assets/assets.go`): YAML test matrices are embedded at compile time, allowing the test runners in `tests/check/`, `tests/listobjects/`, `tests/listusers/` to consume them without runtime file loading.

## Tradeoffs

1. **`tests/` directory sits outside `pkg`/`internal` convention** — Test assets and runners live in `tests/` at root, outside both the public (`pkg/`) and internal (`internal/`) packages. This creates a third category and means test-only code isn't subject to the same internal visibility rules. Pragmatic for test data management, but architecturally impure.

2. **`internal/` packages lack sub-internal enforcement** — While external consumers cannot import `internal/` packages, sibling `internal/` packages can import each other freely. This means `internal/graph/` could theoretically import `internal/authz/`, potentially creating coupling. The layered architecture is convention-based, not compiler-enforced within the `internal/` subtree.

3. **Large single `internal/graph/` package** — `internal/graph/` contains 20+ files with no deep subpackage organization (except nested types like `check.go`, `cached_resolver.go`, `recursive_resolver.go`, `resolve_check_request.go`). As the graph engine grows, this could become a maintenance burden. A `internal/graph/resolvers/`, `internal/graph/check/` split might help at scale.

4. **Single module means all `internal/` is accessible** — In a multi-module repo, `internal/` packages would be restricted to the module. As a single module, all internal packages are visible to all code within the same module. Contributors must follow conventions rather than rely on module boundaries.

5. **Protobuf definitions live in a separate repo** (`github.com/openfga/api`) — This is a tradeoff: the API definition is cleanly versioned separately, but changes require coordination across repos (`openfga/api` → `go get` in `openfga/openfga`). Documented in `AGENTS.md`.

## Failure Modes / Edge Cases

1. **Circular resolver chain risk** — The builder pattern in `internal/graph/builder.go:97-103` links resolvers in a circular chain. While guarded by `if delegate == resolver` in `LocalCheckResolver`, a misconfigured builder option could cause infinite delegation loops at runtime. The `CheckResolver` interface contract explicitly warns about this (`internal/graph/interface.go:37`).

2. **Storage interface changes ripple across all backends** — When `OpenFGADatastore` or other storage interfaces in `pkg/storage/storage.go` change, all four backend implementations (memory, postgres, mysql, sqlite) must be updated. The integration test suite in `pkg/storage/test/storage.go` provides coverage, but backend contributors must maintain consistency.

3. **Context key collision** — `relationshipTupleReaderCtxKey` in `pkg/storage/storage.go:31` uses a string constant. If another package also uses `"relationship-tuple-reader-context-key"`, the context values will collide silently. The string key pattern is inherently fragile in a multi-contributor environment.

4. **`internal/mocks/` is auto-generated** — The `internal/mocks/` directory contains `mockgen`-generated files. Contributors must not manually edit them. The generated files are listed in `.gitignore`-equivalent config, but violations won't be caught until `make generate-mocks` is run.

5. **Conditional resolver wiring via builder is implicit** — The resolver chain composition is spread across `cmd/run/run.go` configuration flags and `internal/graph/builder.go` options. A contributor adding a new resolver type must wire it in two places: the builder and the configuration that triggers the builder option.

## Future Considerations

1. **Consider splitting `internal/graph/` by resolver type** — At 20+ files, `internal/graph/` could benefit from `internal/graph/resolvers/`, `internal/graph/check/`, `internal/graph/diff/` subpackages to improve navigability as the engine grows.

2. **Formalize `tests/` into `internal/test/`** — Moving the YAML matrix tests under `internal/test/` would bring them under the same visibility rules as other internal packages. However, this would require `go:embed` path changes and may not be worth the churn.

3. **Add internal package dependency direction linter** — Consider adding a custom golangci-lint rule or using a tool like `modverr` to detect if `internal/` packages begin depending on each other in ways that violate the layered architecture (e.g., `internal/graph` importing `internal/authz`).

4. **Document public API stability guarantees** — The project does not appear to have a documented API stability policy. For an embeddable library (`pkg/server#exampleNewServerWithOpts`), explicit stability guarantees (semver, Changelog policy) would help consumers plan upgrades.

## Questions / Gaps

1. **No evidence found for multi-module strategy** — OpenFGA is a single Go module. If HelloSales needs to scale to multiple services with shared authorization logic, the single-module structure may not directly translate. The embedded server pattern (`pkg/server#exampleNewServerWithOpts`) could be used, but there is no guidance on when to extract to a separate module.

2. **No evidence found for domain-driven subpackage enforcement** — While `internal/` is well-populated with domain-named subpackages, there is no documented rule preventing a contributor from adding a catch-all `internal/utils/` file. `internal/utils/` does exist with helper functions, which is pragmatic but could grow unchecked.

3. **Import cycle detection not automated in CI** — The `.golangci.yaml` does not include a dedicated import cycle detector. Go's `go build` would catch cycles, but a linter-based check in CI would catch them earlier.

4. **Limited documentation on package responsibility boundaries** — The best documentation is in `AGENTS.md` (directed at AI agents) and inline comments. A formal `ARCHITECTURE.md` or `PACKAGES.md` explaining the relationship between `cmd/`, `pkg/`, `internal/`, and `tests/` would help human contributors orient quickly.