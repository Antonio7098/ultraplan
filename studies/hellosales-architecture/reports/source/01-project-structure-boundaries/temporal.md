# Source Analysis: temporal

## Project Structure & Boundaries

### Source Info

| Field | Value |
|-------|-------|
| Name | temporal |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/temporal` |
| Language / Stack | Go |
| Analyzed | 2026-05-19 |

## Summary

Temporal is a distributed durable execution platform organized as a Go monorepo with well-defined package boundaries. The codebase uses a hybrid organization strategy: top-level directories by concern (`service/`, `common/`, `client/`, `api/`) with internal subpackage organization by domain or feature. The project uses `go.uber.org/fx` for dependency injection, `go.mod` for module definition, and enforces layer discipline through import conventions. The structure supports multiple contributors with isolated work areas across distinct services (frontend, history, matching, worker).

## Rating

**8/10** — Good implementation with minor issues. The package boundaries are well-maintained and align with domain concepts (services) and implementation layers (common). The `api/` directory with protobuf-generated code creates a clear public SDK surface. Minor deductions for the large `common/` package which could be further decomposed, and the monorepo approach creating build interdependencies.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Top-level structure | Directory listing shows clear separation: `service/`, `common/`, `client/`, `api/`, `cmd/`, `proto/` | N/A |
| Module definition | `go.mod:1` defines `module go.temporal.io/server` | `go.mod:1` |
| Service packages | Frontend, history, matching, worker as distinct deployable units | `service/frontend/`, `service/history/`, `service/matching/`, `service/worker/` |
| Common utilities | 70+ subpackages under `common/` for shared concerns | `common/metrics/`, `common/persistence/`, `common/dynamicconfig/`, etc. |
| API/proto surface | `api/` directory with protobuf-generated service definitions | `api/adminservice/`, `api/historyservice/`, `api/matchingservice/` |
| Dependency injection | `fx.go` files in each service package using uber/fx | `service/frontend/fx.go:66` |
| Persistence layer | Factory interface abstraction with multiple backend implementations | `common/persistence/client/factory.go:27-48` |
| Internal packages | `chasm/` library with its own internal structure | `chasm/component.go:1` |
| Schema definitions | Database schemas separated by database type | `schema/cassandra/`, `schema/postgresql/`, `schema/mysql/` |

## Answers to Dimension Questions

### 1. How does the project keep package boundaries from eroding as it grow?

Temporal enforces boundaries through:
- **Go module system**: Single `go.mod` with `go.temporal.io/server` module, requiring explicit import paths (`common/persistence/`, `service/history/`)
- **uber/fx dependency injection**: Each service has its own `fx.go` module definition (e.g., `service/frontend/fx.go:66` `var Module = fx.Options(...)`) making dependency graphs explicit and traceable
- **Service separation**: Distinct services are separate packages under `service/` (`frontend`, `history`, `matching`, `worker`) that only communicate via defined interfaces and RPC
- **Public API boundary**: `api/` directory contains protobuf-generated code that forms the public SDK surface (`go.temporal.io/api/*`), clearly separating internal from external

### 2. Is the structure organised by domain, layer, or a hybrid?

**Hybrid approach**:
- **By layer at top-level**: `service/` (application), `common/` (shared infrastructure), `client/` (inter-service clients), `api/` (protocol definitions)
- **By domain within services**: Each service has domain-specific subpackages (e.g., `service/history/events/`, `service/history/replication/`, `service/history/shard/`)
- **By layer within common**: Subpackages often organized by layer type (`common/persistence/`, `common/metrics/`, `common/membership/`)

Example evidence:
- `common/persistence/client/factory.go:27-48` — Persistence abstraction by layer (factory pattern)
- `service/frontend/fx.go:66` — Frontend service module definition
- `chasm/` — Domain library for state machines (`chasm/engine.go`, `chasm/tree.go`)

### 3. Where does internal API surface end and public SDK begin?

**Internal → Public boundary**:
- `go.temporal.io/server/*` — Internal packages (`common/`, `service/`, `temporal/`, `chasm/`)
- `go.temporal.io/api/*` — Public API definitions (generated from protobufs in `api/` directory)

Evidence:
- `go.mod:1` defines `module go.temporal.io/server`
- Import statements show internal code using `go.temporal.io/server/common/...` paths
- External SDKs use `go.temporal.io/api/v1` (seen in `temporal/fx.go:20` as `enumspb "go.temporal.io/api/enums/v1"`)
- `api/` directory contains generated protobuf code (adminservice, historyservice, matchingservice, etc.)

### 4. What conventions prevent circular dependencies?

- **Single module**: No internal `go.mod` files create natural barriers — circular imports would be caught at compile time
- **Layered architecture in `common/`**: Lower-level packages (`common/persistence/`) do not import higher-level packages (`service/`); they only define interfaces
- **Factory pattern**: `common/persistence/client/factory.go:27-48` defines `Factory` interface, implementations live in `common/persistence/cassandra/`, `common/persistence/sql/`
- **Interface segregation**: Persistence layer uses interfaces (`persistence.TaskManager`, `persistence.ExecutionManager`) that service packages depend on without concrete implementations
- **fx groups for service discovery**: `temporal/fx.go:73-81` uses fx groups (`ServicesGroupOut`, `ServicesGroupIn`) to collect services without direct imports

### 5. How does the project structure support multiple contributors with isolated work areas?

- **Service-based ownership**: Contributors typically work within `service/frontend/`, `service/history/`, `service/matching/`, or `service/worker/` with clear ownership boundaries
- **Shared but encapsulated `common/`**: Utilities in `common/` are clearly named and documented; breaking changes would be caught by the monorepo's compile check
- **Feature-based subpackages**: `chasm/` library, `common/nexus/`, `common/worker_versioning/` allow focused contributions
- **Proto-based API contracts**: `api/` and `proto/` define stable interfaces; teams can work on implementation (`service/`) independently from API contracts
- **Config-driven development**: `config/` directory with environment-specific configurations

## Architectural Decisions

1. **Monorepo with single Go module**: All code in one `go.mod` means simple dependency management but requires careful import discipline
2. **uber/fx for dependency injection**: Each service wires its own fx module, promoting explicit dependency declaration (`service/frontend/fx.go:66-1029`)
3. **Persistence abstraction layer**: `Factory` interface (`common/persistence/client/factory.go:27-48`) allows pluggable backends (Cassandra, MySQL, PostgreSQL, SQLite)
4. **Protobuf for API definitions**: `api/` contains generated code from protobufs, creating clear public/private boundary
5. **chasm as state machine library**: Separate library (`chasm/`) for workflow state machines, usable across the codebase

## Notable Patterns

1. **fx.Module pattern**: Each service defines a `var Module = fx.Options(...)` that other services can include
2. **Factory pattern for persistence**: `common/persistence/client/factory.go` creates abstraction over datastore implementations
3. **Client bean pattern**: `client/client_bean.go` aggregates all service clients for a single binary
4. **Dynamic config with file-based and memory clients**: `common/dynamicconfig/` supports runtime configuration changes
5. **Task executor pattern**: History service uses task executors for queue processing (`timer_queue_active_task_executor.go`)

## Tradeoffs

| Decision | Benefit | Cost |
|----------|---------|------|
| Single monorepo | Simple dependency management, atomic cross-cutting changes | Larger codebase, longer build times |
| Single go.mod | No version matrix hell | Any package can import any other (relies on convention) |
| Large `common/` package | Reusable utilities, consistent patterns | Risk of becoming a "catch-all" dumping ground |
| uber/fx | Explicit DI, testable modules | Runtime errors possible from miswired dependencies |

## Failure Modes / Edge Cases

1. **Import cycle risk**: Without internal modules, a careless import in `common/` could create cycles affecting entire codebase
2. **Big `common/` blast radius**: Changes to `common/persistence/` affect all services; comprehensive testing required
3. **Build coupling**: All services rebuild when any shared code changes (mitigated by Go compiler caching)
4. **Circular dependency detection only at compile time**: No automated tooling to prevent cycles before they occur

## Future Considerations

1. **Potential internal modules**: Could split `common/` into multiple internal modules if coupling becomes problematic
2. **Plugin architecture**: The persistence factory pattern could evolve into a true plugin system for custom backends
3. **Workspace mode**: Go workspaces could provide finer-grained dependency control if needed

## Questions / Gaps

1. **No evidence of boundary enforcement tooling**: No golint rules, modcheck, or similar tooling explicitly enforcing package boundaries (though convention and compile-time checks exist)
2. **Testing organization**: `tests/` directory at top level — is this shared test infrastructure or something else? Not fully explored
3. **temporaltest directory**: What is `temporaltest/` for? Could be a test fixture or alternative test setup

---

Generated by `dimensions/01-project-structure-boundaries.md` against `temporal`.