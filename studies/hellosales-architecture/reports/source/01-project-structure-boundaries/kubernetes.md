# Source Analysis: kubernetes

## Project Structure & Boundaries

### Source Info

| Field | Value |
|-------|-------|
| Name | kubernetes |
| Path | `sources/kubernetes` |
| Language / Stack | Go |
| Analyzed | 2026-05-19 |

## Summary

Kubernetes uses a sophisticated multi-repo/multi-module strategy within a monorepo structure. The project separates concerns across a `staging/` directory (containing independently published packages), a `pkg/` directory (internal implementation), and a `cmd/` directory (executable entry points). Package boundaries are enforced through `import-restrictions.yaml` files and the `import-boss` tool, with explicit `go.work` workspace configuration mapping staging repos to their source locations. The structure is primarily organized by layer (API machinery → API types → clients → controllers → executables), with staging repositories providing independently consumable libraries.

## Rating

**9/10** — Excellent, exemplar implementation with minor issues. The staging/publishing mechanism for separately versioned repos is industry-standard. The import restriction system enforces boundaries effectively. Some minor erosion exists in the `pkg/` layer where some packages violate intended layer boundaries (e.g., `pkg/kubemark` overrides import restrictions per `pkg/.import-restrictions:7`).

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Top-level layout | `staging/src/k8s.io/`, `pkg/`, `cmd/` directories coexist | `sources/kubernetes/` (root listing) |
| Staging repos | 32 independent k8s.io packages in staging | `staging/src/k8s.io/` (directory listing) |
| go.work workspace | Uses Go workspace with `replace` directives | `go.work:7-42` |
| Module replace mapping | `k8s.io/api => ./staging/src/k8s.io/api` | `go.mod:229-263` |
| Import restrictions | YAML-based allow/forbid prefix rules | `staging/publishing/import-restrictions.yaml:1-353` |
| Package-level restrictions | `pkg/.import-restrictions` with cmd/ blocking | `pkg/.import-restrictions:1-14` |
| API types staging | API group subdirectories (core, apps, batch, etc.) | `staging/src/k8s.io/api/` (directory listing) |
| apimachinery pkg | runtime, conversion, watch, labels subpackages | `staging/src/k8s.io/apimachinery/pkg/` (directory listing) |
| client-go structure | discovery, dynamic, informers, listers, rest | `staging/src/k8s.io/client-go/` (directory listing) |
| cmd entry points | kube-apiserver, kube-controller-manager, kubelet | `cmd/` (directory listing) |
| pkg controllers | deployment, daemon, job, statefulset, etc. | `pkg/controller/` (directory listing) |
| pkg kubelet | Subpackage per concern (container, pleg, volume) | `pkg/kubelet/` (directory listing) |

## Answers to Dimension Questions

**1. How does the project keep package boundaries from eroding as it grows?**

Kubernetes enforces boundaries through multiple mechanisms:
- `hack/verify-import-boss.sh` (referenced in `hack/verify-imports.sh`) runs import-boss to validate no forbidden imports
- `staging/publishing/import-restrictions.yaml` defines explicit allowed/forbidden import prefixes per staging repo (`staging/publishing/import-restrictions.yaml:1-353`)
- `pkg/.import-restrictions` blocks `pkg/` from depending on `k8s.io/kubernetes/cmd` (`pkg/.import-restrictions:6-8`)
- The `go.work` replace directives ensure staging packages resolve locally rather than pulling published versions (`go.work:7-42`)

**2. Is the structure organised by domain, layer, or a hybrid?**

Primarily **layer-based** with domain subdivision within layers:
- **Layer 1 (Foundation)**: `staging/src/k8s.io/apimachinery` — encoding, conversion, runtime types
- **Layer 2 (API)**: `staging/src/k8s.io/api` — Kubernetes API types by group (core, apps, batch, etc.)
- **Layer 3 (Clients)**: `staging/src/k8s.io/client-go` — typed and dynamic clients, informers, listers
- **Layer 4 (Implementation)**: `pkg/` — internal implementation (kubelet, controllers, scheduler)
- **Layer 5 (Executables)**: `cmd/` — entry points (kube-apiserver, kubelet, kube-scheduler)

Within layers, domain organization is used (e.g., `pkg/controller/deployment`, `pkg/controller/job`, `pkg/kubelet/container`).

**3. Where does internal API surface end and public SDK begin?**

The public SDK surfaces are the staging repositories, which are independently published:
- `k8s.io/api` — canonical location of Kubernetes API definitions (`staging/src/k8s.io/api/README.md:12-16`)
- `k8s.io/client-go` — Go clients for Kubernetes clusters (`staging/src/k8s.io/client-go/README.md:8`)
- `k8s.io/apimachinery` — scheme, typing, encoding/decoding for API objects (`staging/src/k8s.io/apimachinery/README.md:7-13`)

The `pkg/` directory contains internal implementation not meant for external consumption. The README explicitly states: "Use of the `k8s.io/kubernetes` module or `k8s.io/kubernetes/...` packages as libraries is not supported." (`README.md:33`)

**4. What conventions prevent circular dependencies?**

- The import restrictions system uses regex selectors on import paths (`staging/publishing/import-restrictions.yaml:1`)
- Each staging repo has explicit allowed import prefixes (e.g., apimachinery can only import apimachinery, kube-openapi, streaming, utils — `staging/publishing/import-restrictions.yaml:37-47`)
- API types (`k8s.io/api`) may only import `k8s.io/apimachinery` and `k8s.io/klog` (`staging/publishing/import-restrictions.yaml:49-53`)
- The `hack/verify-no-vendor-cycles.sh` script checks for dependency cycles in vendor directory

**5. How does the project structure support multiple contributors with isolated work areas?**

- **SIG-based ownership**: Each staging repo and pkg subdirectory has OWNERS files for distributed authority
- **Staging repos are independently modifiable**: Code in `staging/src/k8s.io/<repo>` can be directly modified (`staging/README.md:43`)
- **Generation pipelines**: Code generation (`hack/update-codegen.sh`) ensures typed clientsets, listers, informers stay in sync — contributors modify API types and run generators
- **Mono-repo with workspace**: All staging repos coexist in one Kubernetes repo, enabling atomic cross-repo changes
- **Clear entry point separation**: Contributors working on kubelet don't need to navigate apiserver code; `cmd/` subdirectories are isolated

## Architectural Decisions

**Staging/Publishing Split**: The staging directory (`staging/src/k8s.io/`) serves as the authoritative source for independently published repositories. The `staging/publishing/rules.yaml` (73KB+) defines how each staging repo is published to its own GitHub repository. This allows Kubernetes to maintain a monorepo while producing multiple independently versioned libraries — a pattern pioneered by Google to solve the "diamond dependency" problem (`staging/src/k8s.io/api/README.md:14-16`).

**Go Workspace with Local Replace**: The `go.work` file maps `k8s.io/*` imports to local staging paths, enabling development without publishing. This is critical for testing cross-package changes before committing.

**Import Restrictions as Code**: The `staging/publishing/import-restrictions.yaml` encodes architectural constraints in a machine-readable format that `import-boss` can verify. This transforms architecture rules from documentation into enforceable policy.

**Generated Code Integration**: Client-go typed clientsets, listers, and informers are generated (`hack/update-codegen.sh`). This enforces consistency between API types and client code, but requires contributors to run generators after modifying API types.

## Notable Patterns

**Layered Dependency Graph**: Dependencies flow in one direction: apimachinery → api → client-go → internal pkg → cmd. No reverse dependencies exist. Verified by import restrictions (`staging/publishing/import-restrictions.yaml`).

**API Group Versioning**: `staging/src/k8s.io/api/` organizes types by API group and version (core/v1, apps/v1, batch/v1, etc.), following Kubernetes API versioning conventions.

**Controller Pattern with Informers**: client-go provides `tools/cache` package with Reflector → DeltaFIFO → Indexer → EventHandler pattern for controllers (`staging/src/k8s.io/client-go/ARCHITECTURE.md:94-121`).

**Code Generation for Type Safety**: k8s.io/code-generator produces typed clientsets, listers, and informers so controller authors work with compile-time type safety.

**Boilerplate Enforcement**: Every `.go` file requires the Apache 2.0 license header from `hack/boilerplate/boilerplate.go.txt`.

## Tradeoffs

| Tradeoff | Description |
|----------|-------------|
| Complexity of staging mechanism | 32 staging repos with publishing rules requires significant infrastructure investment. The `hack/update-vendor.sh` pipeline must run to update go.mod files. |
| Generated code overhead | Changes to API types require running `hack/update-codegen.sh`. Contributors must understand the generation pipeline. |
| Import restriction maintenance | Adding new staging repos requires updating `staging/publishing/import-restrictions.yaml` with allowed/forbidden prefixes. |
| Monorepo at scale | While Go workspaces help, the sheer size (go.mod has 263 lines of requires) creates coordination overhead. |
| pkg/cmd boundary violations | `pkg/kubemark` explicitly overrides the `pkg/.import-restrictions` rule preventing pkg from importing cmd (`pkg/.import-restrictions:7`), indicating boundary erosion. |

## Failure Modes / Edge Cases

**Circular dependency risk**: If a developer adds an import not in the allowed list, import-boss catches it in CI. However, the import restrictions are only as current as the last update to `staging/publishing/import-restrictions.yaml` — new cross-repo dependencies require adding entries.

**Generated code drift**: If a contributor modifies API types but forgets to run `hack/update-codegen.sh`, the typed clientsets, listers, and informers fall out of sync. CI runs `hack/verify-codegen.sh` to catch this (`hack/verify-codegen.sh`).

**Version skew between staging repos**: Since all staging repos share the same Kubernetes commit, version skew between independently published repos could cause issues if someone consumes an older published version while depending on newer staging code.

**pkg/cmd boundary override abuse**: The `pkg/kubemark` override demonstrates that enforced boundaries can be overridden when needed. This creates a precedent that could be abused to erode other boundaries.

## Future Considerations

The project could improve boundary enforcement by:
1. Adding automated dependency graph visualization to detect layer violations before they become entrenched
2. Exploring stricter module boundaries using Go's upcoming "package tree" visibility RFC
3. Documenting the exception cases for `pkg/kubemark` override more clearly with engineering rationale

## Questions / Gaps

**No evidence found** for:
- Automated detection of circular dependencies beyond `hack/verify-no-vendor-cycles.sh`
- Metric for tracking import restriction violations over time
- Explicit definition of what "internal" vs "public" means for the pkg/ directory beyond README claims

---

Generated by `dimensions/01-project-structure-boundaries.md` against `kubernetes`.