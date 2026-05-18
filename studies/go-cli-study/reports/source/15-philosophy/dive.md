# Repo Analysis: dive

## Engineering Philosophy & Tradeoffs

### Repo Info

| Field | Value |
|-------|-------|
| Name | dive |
| Path | `/home/antonioborgerees/coding/go-cli-study/repos/dive` |
| Group | `15-philosophy` |
| Language / Stack | Go |
| Analyzed | 2026-05-15 |

## Summary

dive is a focused tool with a single purpose: analyzing Docker/OCI image layer contents and waste. The philosophy is **narrow scope, deep execution** — the project explicitly rejects generality and doubles down on one well-defined problem with quantitative metrics.

## Rating

**8/10** — Strong coherent engineering style. The codebase is clearly designed, not accumulated. Every decision aligns with the stated purpose: Docker image analysis with efficiency metrics. Tradeoffs are explicit (e.g., beta status, single-engine focus per run).

## Evidence Collected

| Area | Evidence | File:Line |
|------|----------|-----------|
| Stated purpose | README: "A tool for exploring a Docker image, layer contents, and discovering ways to shrink the size of your Docker/OCI image" | `README.md:8` |
| Single-responsibility | Image struct only holds Trees, Layers, Request — nothing else | `dive/image/image.go:7-11` |
| ImageSource enum | Four discrete sources: DockerEngine, PodmanEngine, DockerArchive, Unknown | `dive/get_image_resolver.go:13-17` |
| Resolver pattern | Resolver interface with Name, Fetch, Build, ContentReader | `dive/image/resolver.go:5-10` |
| Efficiency algorithm | Efficiency() computes ratio of minimum discovered size to cumulative size | `dive/filetree/efficiency.go:38-131` |
| Layer diff types | Unmodified, Modified, Added, Removed — four discrete states | `dive/filetree/diff.go:8-12` |
| CI integration | Evaluator checks efficiency, wasted bytes, wasted percent | `cmd/dive/cli/internal/command/ci/rules.go:18-40` |
| Bus pattern | Event bus decouples UI from analysis via partybus | `internal/bus/bus.go:1-19` |
| CLI adapter | Adapter pattern between CLI invocation and domain logic | `cmd/dive/cli/internal/command/adapter/analyzer.go:21-25` |
| Comparer caching | Comparer caches tree computations by TreeIndexKey | `dive/filetree/comparer.go:31-68` |

## Answers to Protocol Questions

### 1. What philosophy does this repo optimize for?

**Single-purpose depth over breadth.** The README is explicit: this is a Docker image efficiency tool (`README.md:8`). Every package has a narrow focus:

- `dive/filetree/` — file tree data structure and comparison
- `dive/image/` — Docker/Podman image and layer model  
- `dive/filetree/efficiency.go:38-131` — single efficiency algorithm
- `cmd/dive/cli/internal/command/ci/` — CI rule evaluation

The project optimizes for **correctness of image layer analysis** and **actionable efficiency metrics**. It does not try to be a general container management tool.

### 2. What complexity is intentionally accepted?

- **Multi-engine support** (Docker, Podman, archive) — adds resolver pattern complexity (`dive/get_image_resolver.go:62-72`) but enables user flexibility
- **Tree comparison caching** — Comparer caches computed trees to avoid redundant stacking (`dive/filetree/comparer.go:53-67`)
- **Whiteout handling** — overlay whiteout files require special case logic in multiple places (`dive/filetree/file_node.go:265-267`, `dive/filetree/file_tree.go:261-263`)
- **CI rule engine** — three configurable rules with disabled state, parsing, and evaluation (`cmd/dive/cli/internal/command/ci/rules.go:18-196`)
- **TUI rendering** — gocui-based interactive UI with layout manager, view models, and key bindings

### 3. What complexity is intentionally avoided?

- **No plugin architecture** — image sources are hardcoded resolver types (`dive/get_image_resolver.go:62-72`)
- **No remote image fetching** — only local Docker daemon, Podman socket, or local archives
- **No multi-image comparison** — compares layers within a single image, not across images
- **No build orchestration** — `dive build` wraps `docker build`, not a general build system
- **No metrics export** — CI output is textual pass/fail, not Prometheus/DataDog

## Architectural Decisions

1. **Resolver interface** (`dive/image/resolver.go:5-10`) — abstracts Docker/Podman/archive behind a common interface. Enables testing via mock implementations and future source additions without changing domain logic.

2. **FileTree as core data structure** (`dive/filetree/file_tree.go:24-32`) — the entire image representation is a tree of FileNodes. Layers are stacked via `Stack()` method (`dive/filetree/file_tree.go:208-225`). This is a clean, well-tested structure.

3. **Comparer with caching** (`dive/filetree/comparer.go:31-68`) — natural and aggregated layer comparison indexes are pre-computed and cached. Avoids O(n²) tree stacking on repeated UI interactions.

4. **Efficiency metric as ratio** (`dive/filetree/efficiency.go:121-126`) — efficiency = minimumPathSizes / discoveredPathSizes. This is a clear, interpretable metric that penalizes file duplication across layers.

5. **Event bus for UI decoupling** (`internal/bus/bus.go:1-19`) — analysis events flow through a partybus publisher. The UI listens without the domain knowing about it.

## Notable Patterns

- **Adapter pattern** for CLI-to-domain bridging (`cmd/dive/cli/internal/command/adapter/analyzer.go:21-25`)
- **Visitor pattern** on FileTree for depth-first traversal with evaluators (`dive/filetree/file_tree.go:196-205`)
- **Strategy pattern** for sort order (ByName, BySize, etc.) (`dive/filetree/order_strategy.go`)
- **Rule engine** for CI evaluation with disabled/enabled states (`cmd/dive/cli/internal/command/ci/rules.go:54-74`)

## Tradeoffs

| Accepted | Rejected |
|----------|----------|
| Multi-engine resolver complexity | General container management |
| Tree comparison caching memory overhead | Real-time image streaming |
| Whiteout file special cases | Cross-image comparison |
| gocui TTY interaction model | Web UI / API |
| OCI/Docker archive format complexity | Live image pull/push |

## Failure Modes / Edge Cases

- **Malformed tar layers** — efficiency calculation gracefully handles whiteout directories by checking `IsDir` flag (`dive/filetree/efficiency.go:80-85`)
- **Empty image** — score defaults to 1.0 when no files discovered (`dive/filetree/efficiency.go:122-123`)
- **Missing Docker daemon** — CLI returns clear error via `isDockerClientBinaryAvailable()` check (`dive/image/docker/cli.go:34-37`)
- **Corrupted cache** — `BuildCache()` collects errors but continues (`dive/filetree/comparer.go:148-171`)
- **Layer reference count edge case** — only flags inefficiency when `len(data.Nodes) == 2` (first duplicate), not every subsequent copy (`dive/filetree/efficiency.go:96-98`)

## Future Considerations

- No evidence of OCIv2 image format support beyond tar archives
- No plans visible for image diffing across tags
- Caching strategy could be enhanced with LRU eviction for very large images

## Questions / Gaps

- No ARCHITECTURE or DESIGN doc found — philosophy is implicit in code structure, not documented
- No evidence of benchmark tests for tree comparison performance at scale
- Release notes (RELEASE.md) exist but no detailed changelog explaining tradeoff decisions

---

Generated by `study-areas/15-philosophy.md` against `dive`.