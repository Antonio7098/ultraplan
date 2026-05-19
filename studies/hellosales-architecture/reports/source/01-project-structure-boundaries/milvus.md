# Source Analysis: milvus

## Project Structure & Boundaries

### Source Info

| Field | Value |
|-------|-------|
| Name | milvus |
| Path | `sources/milvus` |
| Language / Stack | Go (primary), C++ (internal/core), Rust (tantivy via internal/core) |
| Analyzed | 2026-05-19 |

## Summary

Milvus is a distributed vector database with a multi-module Go project structure. The codebase uses Go 1.25 and is organized into four distinct modules: the root module (`github.com/milvus-io/milvus`), a `pkg/` shared library module (`github.com/milvus-io/milvus/pkg/v3`), a `client/` public SDK module (`github.com/milvus-io/milvus/client/v2`), and an `internal/core/` C++/Rust subsystem. The project follows a hybrid organization pattern: components are organized by role (coordinator vs. node) but share infrastructure through a clearly delineated `pkg/` boundary that provides utilities, logging, metrics, and proto definitions. The internal packages (under `internal/`) contain the actual coordinator and worker node implementations.

## Rating

**8/10** — Good implementation with minor issues. The project demonstrates strong package boundary discipline with its multi-module strategy and clear separation between `internal/`, `pkg/`, and `client/`. The component interface definitions in `internal/types/types.go` provide clear contracts. However, the sheer size of some packages (e.g., `internal/proxy/` with 100+ files) suggests potential over-aggregation within large modules.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Multi-module structure | Root module `github.com/milvus-io/milvus` with `replace` directive for `client/v2` and `pkg/v3` | `go.mod:96-97` |
| pkg module | Separate `module github.com/milvus-io/milvus/pkg/v3` in `pkg/go.mod:1` | `pkg/go.mod:1` |
| client module | Separate `module github.com/milvus-io/milvus/client/v2` in `client/go.mod:1` | `client/go.mod:1` |
| Component interfaces | All component interfaces defined centrally in `internal/types/types.go:54-59` (`Component` interface with `Init()`, `Start()`, `Stop()`, `Register()`) | `internal/types/types.go:54-59` |
| Coordinator packages | `internal/rootcoord/`, `internal/datacoord/`, `internal/querycoordv2/`, `internal/streamingcoord/` for metadata/scheduling | `internal/rootcoord:1`, `internal/datacoord:1`, `internal/querycoordv2:1` |
| Node packages | `internal/proxy/`, `internal/querynodev2/`, `internal/datanode/`, `internal/streamingnode/` for execution | `internal/proxy:1`, `internal/querynodev2:1`, `internal/datanode:1` |
| pkg/util organization | 48 subdirectories under `pkg/util/` (paramtable, merr, logutil, etcd, retry, etc.) | `pkg/util/:1-40` |
| internal/util organization | 48 subdirectories under `internal/util/` (segcore, queryutil, flowgraph, etc.) | `internal/util/:1-40` |
| C++ core subsystem | `internal/core/` contains CMakeLists.txt and C++ source for segcore and storage engine | `internal/core/CMakeLists.txt:1` |
| Proto definitions | All proto generated code in `pkg/proto/` with separate pb packages per service (datapb, proxypb, querypb, rootcoordpb, indexpb) | `pkg/proto/datapb/data_coord.pb.go:1` |
| golangci configuration | depguard rules forbid direct use of errors pkg, require `github.com/cockroachdb/errors`, `github.com/milvus-io/milvus/pkg/v3/log` | `.golangci.yml:24-49` |
| Module replace directive | `replace github.com/milvus-io/milvus/pkg/v3 => ./pkg` in client go.mod | `client/go.mod:124` |
| CLI entrypoints | `cmd/milvus/main.go` as primary entrypoint, with `cmd/roles/` for component launching | `cmd/milvus/main.go:1` |
| Shared config | `pkg/util/paramtable/` for configuration management across all components | `pkg/util/paramtable/:1` |
| Package naming convention | v3 suffix in module names (`github.com/milvus-io/milvus/pkg/v3`, `github.com/milvus-io/milvus/client/v2`) | `pkg/go.mod:1`, `client/go.mod:1` |

## Answers to Dimension Questions

### 1. How does the project keep package boundaries from eroding as it grows?

Milvus enforces boundaries through several mechanisms:
- **Multi-module enforcement**: The project is split into separate Go modules (`root`, `pkg/v3`, `client/v2`) with explicit `replace` directives. The root module cannot import from `internal/` packages of sibling modules.
- **golangci-lint depguard rules** (`.golangci.yml:24-49`): The `depguard` linter forbids direct imports of deprecated packages (e.g., `errors`, `github.com/pkg/errors`, `github.com/pingcap/log`). The configuration explicitly requires use of `github.com/cockroachdb/errors` and `github.com/milvus-io/milvus/pkg/v3/log`.
- **Component interface boundaries** (`internal/types/types.go:54-339`): All component interfaces are defined in a central `types` package, making cross-component dependencies explicit and checkable.
- **OWNERS files**: Each package has an `OWNERS` file indicating code ownership, discouraging cross-package changes without review.

### 2. Is the structure organised by domain, layer, or a hybrid?

**Hybrid approach**:
- **Domain/Role separation**: Top-level `internal/` packages are divided by system role — coordinators (`rootcoord`, `datacoord`, `querycoordv2`, `streamingcoord`) vs. workers (`proxy`, `querynodev2`, `datanode`, `streamingnode`).
- **Layer separation within pkg/**: `pkg/util/` contains infrastructure utilities (paramtable, merr, logutil, retry, etcd, crypto, etc.) clearly organized by function rather than domain.
- **Proto separation**: `pkg/proto/` organizes generated protobuf code by service (datapb, proxypb, querypb, etc.), not by domain.
- **Client separation**: `client/` is a separately published SDK module (`github.com/milvus-io/milvus/client/v2`) with its own `go.mod`, representing a clear public API boundary from internal implementation.

### 3. Where does internal API surface end and public SDK begin?

The public SDK is clearly delineated in `client/` directory with its own module (`github.com/milvus-io/milvus/client/v2` at `client/go.mod:1`). The client module replaces the pkg dependency with a local path (`client/go.mod:124`): `replace github.com/milvus-io/milvus/pkg/v3 => ../pkg`.

The internal API is exposed through:
- **Component interfaces** in `internal/types/types.go:54-339` — these define what each coordinator and worker node must implement.
- **Proto services** defined in `pkg/proto/` — these define the gRPC communication contract between components.
- **pkg/util/** packages — utilities like `paramtable`, `merr`, `log` are consumed across module boundaries but are considered internal shared libraries.

The boundary is enforced by the multi-module structure: `client/v2` imports `pkg/v3` but not `internal/`. The root module imports `pkg/v3` and `internal/` packages freely (they share the same module).

### 4. What conventions prevent circular dependencies?

- **Acyclic module dependency**: The module hierarchy is: `client/v2` → `pkg/v3` → (nothing below), root module → all three. No cycles possible at module level.
- **Error handling convention**: The project mandates use of `github.com/cockroachdb/errors` via golangci-lint depguard (`.golangci.yml:28-33`), not the standard `errors` package. This discourages error wrapping patterns that can obscure dependency direction.
- **Logging convention**: `pkg/v3/log` is the mandatory logging package (`.golangci.yml:48-49`), preventing scattered logging imports that could create coupling.
- **Component registration**: Components follow a factory pattern with creator functions (e.g., `SetDataNodeCreator` at `internal/types/types.go:126`), allowing dependency injection without circular imports.

### 5. How does the project structure support multiple contributors with isolated work areas?

- **Component-based isolation**: Individual coordinators (rootcoord, datacoord, querycoordv2, streamingcoord) and workers (proxy, querynodev2, datanode, streamingnode) are separate packages under `internal/`. Contributors can work on a coordinator without touching others.
- **OWNERS files**: Each package has an `OWNERS` file (e.g., `internal/proxy/OWNERS`, `internal/datacoord/OWNERS`), enabling code owners to review changes to specific packages.
- **Clear subsystem documentation**: The `AGENTS.md` at the root documents mandatory reading procedures for each subsystem, guiding contributors to read both top-level docs and sub-documents before modifying code.
- **Test isolation**: Tests are co-located with source files (e.g., `internal/proxy/impl_test.go`, `internal/datacoord/services_test.go`), and the project uses build tags (`dynamic`, `test`) to enable test-specific behavior without polluting production builds.
- **pkg/ as shared boundary**: Infrastructure that multiple components share lives in `pkg/`, reducing duplication while maintaining a clear shared-vs-internal boundary.

## Architectural Decisions

1. **Multi-module Go project**: Milvus uses three Go modules (root, pkg/v3, client/v2) with explicit replace directives to enforce boundaries and enable independent version evolution of the public SDK.

2. **Centralized component interface definition**: All component interfaces (DataNode, DataCoord, RootCoord, Proxy, QueryNode, QueryCoord, MixCoord) are defined in `internal/types/types.go:54-339`, providing a single source of truth for component contracts.

3. **Coordinator/Worker separation**: The system is architected around coordinator nodes (metadata management, scheduling) and worker nodes (data storage, query execution), with clear message-passing interfaces between them.

4. **Proto-based inter-component communication**: All component-to-component communication uses protobuf-generated gRPC services defined in `pkg/proto/`, enabling type-safe network communication.

5. **pkg/ as internal shared library**: The `pkg/` module acts as a shared library for logging, metrics, configuration, utilities, and proto definitions, avoiding duplication while maintaining clear boundaries.

## Notable Patterns

- **Component lifecycle interface** (`internal/types/types.go:54-59`): `Init()`, `Start()`, `Stop()`, `Register()` pattern enforced across all components.
- **Dependency injection via setters**: Components accept dependencies through setter methods (e.g., `SetEtcdClient()`, `SetTiKVClient()`, `SetMixCoord()`) rather than constructor injection.
- **Build tag conventions**: Tests use `-tags dynamic,test` to enable mockey-based monkey patching (AGENTS.md:35-39).
- **Module versioning with vN suffix**: Modules use v3, v2 suffixes to allow parallel development of API versions.
- **Error aggregation via merr**: Project uses custom error aggregation in `pkg/util/merr/` rather than standard error wrapping.

## Tradeoffs

- **Large monolithic internal packages**: `internal/proxy/` contains 100+ files including `impl.go` at 255KB and `task_search.go` at 54KB, indicating some packages may have grown too large and could benefit from further decomposition.
- **Proto in pkg but services in internal**: Proto definitions live in `pkg/proto/` but the service implementations are in `internal/*/services.go`, requiring imports like `"github.com/milvus-io/milvus/pkg/v3/proto/internalpb"` in `internal/` packages. This is necessary but creates verbose import chains.
- **C++ core coupling**: The `internal/core/` directory contains C++ code that must be compiled separately via CMake, adding build complexity and creating a hard boundary that Go code can only cross via CGO.

## Failure Modes / Edge Cases

- **Import cycle risk**: While module boundaries prevent cycles, within the root module, `internal/` packages do import from `pkg/`. If `pkg/` ever imported from `internal/`, it would create a cycle at the package level despite module separation.
- **Monolithic proxy package**: The proxy package's massive single-file implementations (e.g., `impl.go` at 255K+ lines) make code review difficult and increase risk of unintended coupling within the package.
- **Version suffix confusion**: Having both `pkg/v3` and `client/v2` suggests versioning intent, but the relationship between these versions and the root module's version is not clearly documented.

## Future Considerations

- The proxy package (`internal/proxy/`) would benefit from decomposition into smaller sub-packages (e.g., `task/`, `pipeline/`, `interceptor/` are already present as subdirectories, but many files remain at the package root).
- The internal streaming coordination subsystem is minimal (`internal/streamingcoord/` at 36 bytes) — appears to be in early development or placeholder status.
- The client SDK (`client/`) could benefit from additional documentation on API stability guarantees and migration paths between v2 and future versions.

## Questions / Gaps

- No evidence found of formal architectural decision records (ADRs) documenting why certain boundaries were chosen.
- The relationship between the root module version and the pkg/client module versions is not explicitly documented — unclear if they are version-locked or independently versioned.
- Limited evidence of cross-package refactoring tools or scripts to maintain boundaries as the codebase grows.
- No evidence of automated dependency graph validation to detect boundary erosion before code review.

---

Generated by `dimensions/01-project-structure-boundaries.md` against `milvus`.