# Source Analysis: victoriametrics

## Project Structure & Boundaries

### Source Info

| Field | Value |
|-------|-------|
| Name | victoriametrics |
| Path | `sources/victoriametrics` |
| Language / Stack | Go (module `github.com/VictoriaMetrics/VictoriaMetrics`) |
| Analyzed | 2026-05-19 |

## Summary

VictoriaMetrics is a monomorphic Go module (single `go.mod`) that organizes code into two top-level directories: `lib/` (shared libraries) and `app/` (standalone binaries). It follows a hybrid structure: `lib/` subpackages are organized by functional layer (storage, protoparser, httpserver), while `app/` contains independently deployable binaries (vmagent, vmselect, vminsert, vmalert, etc.). No `internal/` package convention is used; instead, shared code lives in `lib/` and is imported by all apps. The project achieves package boundary enforcement through the single-module constraint, clear import conventions, and Go's build system where each `app/*/main.go` produces a separate binary.

## Rating

**8/10** — Excellent structure with minor issues. The monomorphic module approach with `lib/` as a shared foundation is well-suited for a multi-binary time-series database. However, the lack of Go's `internal/` package convention means boundary enforcement relies on convention rather than compiler enforcement. The `lib/` directory has grown large (~70 subpackages), which could benefit from further grouping.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Module definition | `module github.com/VictoriaMetrics/VictoriaMetrics` | `go.mod:1` |
| Top-level app binaries | `vmagent`, `vmselect`, `vminsert`, `vmalert`, `vmauth`, `vmbackup`, `vmctl`, `vmrestore` as `app/` subdirectories | `app/:ls` |
| Shared lib packages | 70+ subpackages under `lib/` (storage, mergeset, protoparser, httpserver, etc.) | `lib/:ls` |
| App main imports lib | `vmagent/main.go` imports `github.com/VictoriaMetrics/VictoriaMetrics/lib/storage`, `lib/httpserver`, `lib/protoparser/*` | `app/vmagent/main.go:13-50` |
| Storage package size | `lib/storage/` contains 50+ files (storage.go, index_db.go, partition.go, table.go, tag_filters.go, etc.) | `lib/storage/:ls` |
| Protocol parsers subpackages | `lib/protoparser/` contains prometheus/, influx/, opentelemetry/, datadogv1/, datadogv2/, graphite/, opentsdb/, etc. | `lib/protoparser/:ls` |
| Nested lib subpackages | `lib/storage/metricsmetadata/`, `lib/storage/metricnamestats/` as nested domain packages | `lib/storage/metricsmetadata/storage.go:1` |
| Ingest server abstractions | `lib/ingestserver/` with subpackages for graphite, influx, opentsdb protocols | `lib/ingestserver/influx/server.go:13` |
| Test utilities | `apptest/` with client.go, testcase.go, vmagent.go, vmselect.go for integration testing | `apptest/app.go:1` |
| App Makefiles included | Top-level `Makefile:24` includes `app/*/Makefile` for multi-binary builds | `Makefile:24` |
| Web UI separate module | `app/vmui/packages/vmui/web/go.mod` is a separate Go module for the UI | `app/vmui/packages/vmui/web/go.mod:1` |
| No internal/ packages | Search for `^package internal` found no matches in lib/ or app/ directories | `grep -r "package internal" lib/ app/` |

## Answers to Dimension Questions

### 1. How does the project keep package boundaries from eroding as it grows?

VictoriaMetrics uses a **single Go module** constraint (`github.com/VictoriaMetrics/VictoriaMetrics` at `go.mod:1`), which prevents cross-module boundary violations at the package level. Shared code is centralized in `lib/` subpackages (e.g., `lib/storage/`, `lib/protoparser/`), while app-specific code lives in `app/*/` subdirectories. Each `app/*/main.go` compiles to an independent binary. The project does **not** use Go's `internal/` package convention, relying instead on directory naming conventions (`lib/` vs `app/`) and the single-module rule to maintain boundaries. The `Makefile:24` includes `app/*/Makefile` for coordinated builds.

### 2. Is the structure organised by domain, layer, or a hybrid?

**Hybrid**: `lib/` is organized primarily by **layer/function** (storage, mergeset, protoparser, httpserver, netutil, logger, prompb), while `app/` is organized by **binary/product** (vmagent, vmselect, vminsert, vmalert, vmauth, vmbackup, vmctl). Within `lib/storage/`, there are nested subpackages organized by **domain concept** (`lib/storage/metricsmetadata/`, `lib/storage/metricnamestats/`), suggesting domain-driven organization at the subpackage level. Protocol parsers under `lib/protoparser/` are organized by **protocol** (prometheus, influx, datadogv1, datadogv2, opentelemetry).

### 3. Where does internal API surface end and public SDK begin?

The **internal surface** is the `lib/` directory containing all shared packages. The **public SDK/external entry points** are the `app/` binaries that import `lib/` packages. The module itself (`github.com/VictoriaMetrics/VictoriaMetrics`) is the public import path. There's no explicit `internal/` package boundary, so "internal" is defined by convention: code under `lib/` is shared infrastructure, while code under `app/*/` is the product binary. The `apptest/` directory (`apptest/app.go:1`) provides testing utilities for apps, suggesting a semi-public testing interface.

### 4. What conventions prevent circular dependencies?

Go's single-module constraint inherently prevents circular dependencies between modules. Within the module, `lib/storage/storage.go:16-32` shows `storage` imports from other `lib/` packages (`backup`, `bloomfilter`, `decimal`, `encoding`, `fs`, `logger`, `memory`, `querytracer`, `snapshot`, `uint64set`, `workingsetcache`), but these are utility dependencies, not circular. App packages (`app/vmagent/main.go:13-50`) import `lib/` packages, but `lib/` packages do not import app packages. This establishes a clear **acyclic dependency direction**: `app/` → `lib/` → standard library/external dependencies.

### 5. How does the project structure support multiple contributors with isolated work areas?

**Isolation by binary**: Each `app/*/` directory is an independent binary (vmagent, vmalert, vmselect, etc.), allowing teams to work on separate products without stepping on each other. **Isolation by lib/ concern**: Contributors working on storage can focus on `lib/storage/`, those on ingestion on `lib/protoparser/` or `lib/ingestserver/`, and those on UI on `app/vmui/`. **Makefile convention** (`Makefile:24`: `include app/*/Makefile`) enables parallel builds and testing per binary. The separate `go.mod` for the web UI (`app/vmui/packages/vmui/web/go.mod`) allows frontend/backend work to proceed independently. However, since there's only a single `go.mod`, all contributors share the same dependency namespace, which could cause merge conflicts on dependency updates.

## Architectural Decisions

- **Single module monomorphic structure**: All code belongs to one Go module, simplifying dependency management but requiring discipline to avoid boundary erosion. Evidence: `go.mod:1`
- **lib/ as shared foundation**: All reusable code lives in `lib/` with 70+ subpackages. This follows a classic layered architecture where lib is the foundation. Evidence: `lib/:ls`
- **app/ for deployment units**: Each product/binary is a separate `app/*/` directory with its own `main.go`, Makefile, and occasionally static assets. Evidence: `app/vmagent/main.go:1`, `app/vmselect/main.go:1`
- **No internal/ package convention**: Instead of Go's `internal/` package for encapsulation, VictoriaMetrics uses `lib/` for shared code and `app/` for products. This is a deliberate convention choice.
- **Nested subpackages for domain concepts**: `lib/storage/metricsmetadata/` and `lib/storage/metricnamestats/` show domain-driven subpackage organization within the larger storage package.
- **Separate web UI module**: `app/vmui/packages/vmui/web/go.mod` is a separate Go module, decoupling the React UI build from the main Go module.

## Notable Patterns

- **Protocol-based subpackage organization**: `lib/protoparser/` subpackages are named by protocol (prometheus, influx, graphite, opentsdb, datadogv1, datadogv2, opentelemetry). Evidence: `lib/protoparser/:ls`
- **Parallel ingest server abstractions**: `lib/ingestserver/` has subpackages for each protocol server (graphite, influx, opentsdb). Evidence: `lib/ingestserver/influx/server.go:1`
- **Storage as the core package**: `lib/storage/` is the largest and most complex package with 50+ files covering data modeling, indexing, and querying. Evidence: `lib/storage/storage.go:1`
- **Test files co-located**: Tests are in the same directory as implementation (`lib/storage/storage_test.go`, `lib/storage/storage_synctest_test.go`). Evidence: `lib/storage/storage.go:1` and `lib/storage/storage_test.go:1`
- **Embed for static assets**: `app/vmagent/main.go:99-101` uses `//go:embed static` for static file serving.

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| Single module (no `internal/`) | Simpler imports but weaker boundary enforcement; relies on convention rather than compiler |
| Large `lib/` (70+ packages) | High cohesion but potential for `lib/` becoming a dumping ground; may need grouping subdirectories |
| All binaries in `app/` | Clear separation but all share same `go.mod` dependency namespace |
| Nested `lib/storage/` subpackages | Domain organization within storage is good, but raises question of why other lib/ areas don't have nested structure |
| Separate web UI module | Clean build separation but requires coordination across module boundaries |

## Failure Modes / Edge Cases

- **Boundary erosion risk**: Without `internal/` packages, a developer could accidentally import app code into lib/, breaking the foundational layer assumption. No automated enforcement exists.
- **Dependency conflict**: All apps share the same `go.mod`, so adding a dependency for one app affects all apps, potentially causing unnecessary rebuilds or version conflicts.
- **lib/ naming collisions**: If a new subpackage is added to `lib/` with the same name as an existing package elsewhere, import paths become ambiguous (though module prefix prevents true collisions).
- **Circular dependency detection**: While Go will catch import cycles at compile time, the single-module structure means large-scale refactoring could introduce cycles that are harder to untangle than if modules were smaller.

## Future Considerations

- Consider introducing `lib/internal/` subdirectories for packages that should not be imported directly by apps, using Go's `internal/` package convention for stronger boundary enforcement.
- Consider splitting `lib/` into `lib/core/` and `lib/extensions/` or similar grouping directories to reduce the flat structure and improve navigability.
- The `app/vmui/` React UI is a separate module — this pattern could be extended if other front-end or sidecar components are needed.
- The monomorphic module works well for VictoriaMetrics' current scale, but if new products are added, a multi-module approach (using Go workspaces) might reduce dependency coupling.

## Questions / Gaps

- **Why no `internal/` packages?** The choice to use `lib/` instead of Go's `internal/` package convention appears deliberate. The rationale is not documented in the repository. An `internal/` package would provide compiler-enforced boundary.
- **Is there a deprecation policy for lib/ packages?** No evidence found of a policy for removing or deprecating lib/ subpackages. The API surface of lib/ is the union of all apps' needs.
- **How is lib/ stability ensured?** No evidence of API review process or breaking change policy for lib/ packages.
- **Why is vmui a separate module?** The separate `go.mod` for `app/vmui/packages/vmui/web/` is notable. The reason (build isolation? independent versioning?) is not documented.
- **No evidence of module-level dependency graph validation** in CI (e.g., `modgraph` or similar tooling to detect structural issues).

---

Generated by `dimensions/01-project-structure-boundaries.md` against `victoriametrics`.