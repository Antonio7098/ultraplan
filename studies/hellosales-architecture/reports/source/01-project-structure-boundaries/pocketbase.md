# Source Analysis: pocketbase

## Project Structure & Boundaries

### Source Info

| Field | Value |
|-------|-------|
| Name | pocketbase |
| Path | `/home/antonioborgerees/coding/ultraplan/studies/hellosales-architecture/sources/pocketbase` |
| Language / Stack | Go |
| Analyzed | 2026-05-19 |

## Summary

PocketBase is a single-module Go project (monolith) with clear internal package boundaries organized by concern. The top-level structure separates core domain types (`core/`), HTTP API handlers (`apis/`), reusable tools (`tools/`), plugin extensions (`plugins/`), and CLI entrypoints (`cmd/`). The module is self-contained with no `internal/` vs `pkg/` split—the public surface is the entire module. Package dependencies flow in one direction: tools → core → apis → cmd, with plugins being optional extensions. Boundary enforcement is implicit (via convention, not enforced tooling) and relies on Go's single-module constraint to prevent circular dependencies.

## Rating

**7/10** — Good implementation with minor issues. The structure is clear and scales well for a single-service backend, but lacks formal boundary enforcement mechanisms (e.g., no `internal/` isolation, no explicit layer rules). As a framework/toolkit dual-purpose project, the internal/public API surface distinction is somewhat blurred.

## Evidence Collected

Every entry MUST include a file path with line numbers. Format: `path/to/file.ts:NN`.

| Area | Evidence | File:Line |
|------|----------|-----------|
| Top-level layout | `apis/`, `core/`, `tools/`, `plugins/`, `cmd/`, `forms/`, `migrations/`, `ui/` | `pocketbase.go:1-22` |
| Module definition | Single `module github.com/pocketbase/pocketbase` | `go.mod:1` |
| Core domain package | `core/app.go` defines `App` interface (1133 lines), `core/base.go` implements `BaseApp` | `core/app.go:20-1133`, `core/base.go:74-232` |
| API handlers package | `apis/` contains 75 files organized by resource (record, collection, auth, etc.) | `apis/base.go:1-179` |
| Tools utilities | `tools/` has 21 subpackages: hook, router, mailer, security, template, etc. | `tools/hook/event.go:1-50` |
| Plugin system | `plugins/` has 3 subpackages: jsvm, migratecmd, ghupdate | `plugins/jsvm/jsvm.go:1-80` |
| CLI commands | `cmd/serve.go` registers HTTP serve command, `cmd/superuser.go` for admin management | `cmd/serve.go:1-100` |
| Forms package | `forms/` contains 8 files for validation/input processing | `forms/record_upsert.go:1-60` |
| Migrations | `migrations/` has 8 timestamped migration files | `migrations/1640988000_init.go:1-50` |
| Public entry point | Root `pocketbase.go` exposes `New()`, `NewWithConfig()`, `Start()` | `pocketbase.go:73-162` |
| App interface | Large `App` interface (60+ methods) defines the public contract | `core/app.go:20-1133` |
| Hook system | `tools/hook/hook.go` provides event hook infrastructure | `tools/hook/hook.go:1-80` |
| No internal/ pkg split | Project does not use Go's `internal/` convention for boundary enforcement | `go.mod:1-49` |

## Answers to Dimension Questions

### 1. How does the project keep package boundaries from eroding as it grows?

**No formal enforcement mechanism.** PocketBase uses Go's single-module constraint to prevent circular imports at the package level, but does not employ `internal/` isolation, build tags, or lint rules to prevent ad-hoc cross-package imports. The naming conventions are consistent (packages named after their function: `apis/`, `core/`, `tools/`, `plugins/`) but the responsibility boundaries are enforced by convention and review, not tooling. As the codebase grows, contributors could introduce cross-package dependencies that blur the lines between layers.

Evidence: `go.mod:1` defines a single module with no `internal/` directories. Import graph shows `pocketbase.go:14-18` imports from `core`, `cmd`, and `tools` directly.

### 2. Is the structure organised by domain, layer, or a hybrid?

**Layer-based with some domain mixing.** The primary decomposition is by technical layer:
- **`core/`** — Domain models, app interface, DB schemas, events (core business logic)
- **`apis/`** — HTTP handlers, routing, middlewares (presentation layer)
- **`tools/`** — Reusable utilities (infrastructure/utility layer)
- **`plugins/`** — Extension points (optional features)
- **`forms/`** — Input validation/dto (application layer)
- **`cmd/`** — CLI orchestration (entrypoint layer)

Within `core/`, subpackages are not used—models like `Collection`, `Record`, `Settings` live directly in `core/` alongside DB builders and hooks. The `apis/` package mirrors this flat structure with files like `record_crud.go`, `record_auth.go`, `collection.go`. The result is a relatively flat hierarchy with clear technical role separation but some domain概念 co-location (e.g., `core/record_model.go` and `core/record_query.go` are separate files but same package).

### 3. Where does internal API surface end and public SDK begin?

**Blurred.** PocketBase serves dual purposes: standalone app and Go framework. The public SDK surface is the entire module (`github.com/pocketbase/pocketbase`), and users are expected to import subpackages directly. The `core.App` interface is the main extension point, documented as the "backbone" (`core/app.go:1-4`). However, there is no `internal/` partition to separate implementation details from public API. Subpackages like `tools/`, `plugins/`, `forms/` are all importable. The only distinction is that some packages (like `ui/` with its TypeScript/Vite build) contain non-Go code that is embedded at runtime.

The root `pocketbase.go` exports `New()`, `NewWithConfig()`, `Start()`, and `Execute()` as the primary API. `core/app.go:20-28` documents that the `App` interface exists "to make testing easier and to allow users to create common and pluggable helpers and methods that doesn't rely on a specific wrapped app struct."

### 4. What conventions prevent circular dependencies?

**Go's single-module import graph + flat package structure.** Since PocketBase is a single Go module with no nested modules, Go's import cycle detection prevents packages within the same module from depending on each other circularly. There is no evidence of `//go:build ignore` tags, build tags, or explicit dependency direction rules. The implicit rule is: imports must not cycle.

Observed dependency direction:
```
tools/* → (utility only, no core imports)
core/* → tools (e.g., core/base.go:19-27 imports tools/*)
apis/* → core (e.g., apis/base.go:11 imports core)
cmd/* → core, apis
pocketbase.go → core, cmd, tools
plugins/* → core (plugin hooks interact with app)
```

No cycles detected in the import structure. However, the lack of formal layer boundaries means a future contributor could inadvertently import `apis/` from `core/` (for example, if someone wanted to use HTTP helpers inside a core model hook), creating a cycle.

### 5. How does the project structure support multiple contributors with isolated work areas?

**Moderately well.** The layer-based package layout allows contributors to work in relative isolation:
- API handlers (`apis/`) can be modified without touching domain logic (`core/`)
- Tools (`tools/`) are self-contained utilities with clear interfaces
- Migrations (`migrations/`) are timestamped and additive-only
- Tests sit next to implementation files (`*_test.go`)

However, the large `App` interface (60+ methods in `core/app.go`) creates a coordination bottleneck—any new app-level feature requires updating the interface and all implementations. The `core/base.go:74-193` shows a massive struct with 40+ hook fields, suggesting that any contributor adding a new hookable event must touch this central file.

The `plugins/jsvm/` directory provides an extension point for JavaScript-based customization, allowing contributors to add functionality without Go recompilation, but this is a runtime plugin (JavaScript VM), not a code organization plugin.

The `ui/` directory is separate (TypeScript/Vite) from the Go codebase, allowing frontend contributors to work independently.

## Architectural Decisions

1. **Single-module architecture.** PocketBase uses one `go.mod` with no multi-module setup. This simplifies dependency management but means the entire project builds as one unit. This is appropriate for a focused backend framework but limits scalability for very large teams or truly independent sub-projects.

2. **Flat package hierarchy in core/ and apis/.** Instead of sub-packages like `core/models/`, `core/services/`, PocketBase keeps models in `core/` directly (`record_model.go`, `collection_model.go`). This reduces directory nesting but puts many files in the same package namespace, increasing cognitive load.

3. **App interface as the central extension point.** The 60+ method `App` interface in `core/app.go` is both the power and the bottleneck. It allows any implementation (test mock, custom wrapper) but requires every new feature to extend this interface.

4. **Tool subpackages for reusable components.** `tools/` contains 21 subpackages providing: hook system, router, mailer, logger, store, security, search, template, subscriptions, etc. These are well-separated and could theoretically be extracted as independent libraries.

5. **Dual-purpose (app + framework).** The root package and `core/` are designed to be imported by external users building custom apps. This requires maintaining public API stability across the entire module.

## Notable Patterns

- **Event hook system** (`tools/hook/hook.go`): Centralized hook mechanism allowing users to bind functions to app lifecycle events (`OnBootstrap`, `OnServe`, etc.). Hooks are tagged by collection ID for targeted triggering.

- **Request event pipeline** (`core/event_request.go`, `apis/base.go`): Every HTTP request creates a `*core.RequestEvent` that flows through middleware chain to the route handler.

- **Model-view separation in core** (`core/db_model.go`, `core/record_model.go`): Active record pattern where models carry both data and query logic (e.g., `Record.FindById()`, `Collection.FindAllRecords()`).

- **DB dual-connection strategy** (`core/base.go:482-578`): Separate concurrent and non-concurrent DB connections to handle SQLite's locking characteristics—reads go to concurrent pool, writes to serialized pool.

- **Migrations as timestamped files** (`migrations/1640988000_init.go`): Each migration is a standalone Go file with an `Up()` function, registered in a central list.

## Tradeoffs

**Positive:**
- Clear technical layer separation enables focused contributions
- Single module avoids complex multi-module coordination
- Extensive hook system provides extension without modification
- Tools subpackages encourage reuse and separation of concerns

**Negative:**
- No `internal/` isolation means implementation details are accessible to users (could lead to reliance on unstable internals)
- Large `App` interface creates coupling and a single point of change for new features
- Flat structure in `core/` and `apis/` can lead to many files in one package
- No formal layer rules means boundary erosion is possible through refactoring
- Dual-purpose app/framework creates tension between API stability and implementation flexibility

**Neutral:**
- Single module is simpler but doesn't scale to truly independent sub-projects
- Timestamp-based migrations are explicit but require manual coordination

## Failure Modes / Edge Cases

1. **Boundary erosion through convenience imports.** A contributor could import `apis/` helpers from within `core/` models, creating a cycle and blurring the layer distinction. No lint rule prevents this.

2. **`App` interface growth.** As features are added, the `App` interface grows. In `core/app.go:20-1133`, there are 60+ methods. This creates a maintenance burden for anyone implementing the interface and indicates the interface may be doing too much (God interface anti-pattern).

3. **Migration conflicts.** Timestamp-based migrations in `migrations/` could conflict if multiple contributors create migrations with the same timestamp. The system relies on human coordination (timestamps chosen by contributor).

4. **Test isolation in large package.** With many files in `core/` package, tests may share more state than intended, leading to test pollution or order dependencies.

5. **Public internal packages.** Since there's no `internal/` partition, users can (and do) import packages like `tools/hook`, `tools/router` directly. This ties the public API to implementation details of utility packages that may need to change.

## Future Considerations

1. Consider introducing `internal/` packages for truly internal implementation details that should not be imported by users (e.g., DB retry logic, internal hook registration).

2. Consider splitting the massive `App` interface into smaller focused interfaces (e.g., `AppDatabase`, `AppAuth`, `AppStorage`) to reduce the coupling surface and allow more targeted implementations.

3. Consider adding dependency direction lint rules (e.g., via `golangci-lint` or custom tooling) to enforce that `core/` does not import `apis/`.

4. Consider formalizing the plugin system beyond just JSVM—plugins in `plugins/` could have a defined interface/manifest to make them first-class extension points.

## Questions / Gaps

- **No evidence found** of a formal package naming or import convention document. Conventions exist in code but are not codified.
- **No evidence found** of automated boundary enforcement (lint rules, build constraints) to prevent layer violation.
- **Unclear** how `ui/` TypeScript code is integrated with Go builds—is it compiled separately and embedded, or is there a cross-language build step?

---

Generated by `dimensions/01-project-structure-boundaries.md` against `pocketbase`.