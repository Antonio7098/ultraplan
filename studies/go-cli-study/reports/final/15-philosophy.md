# Engineering Philosophy & Tradeoffs - Combined Study Report

## Study Parameters

| Field | Value |
|-------|-------|
| Protocol | `study-areas/15-philosophy.md` |
| Groups | go-cli-study |
| Date | 2026-05-15 |

## Repositories Studied

| # | Repo | Path | Group |
|---|------|------|-------|
| 1 | age | `/home/antonioborgerees/coding/go-cli-study/repos/age` | go-cli-study |
| 2 | chezmoi | `/home/antonioborgerees/coding/go-cli-study/repos/chezmoi` | go-cli-study |
| 3 | dive | `/home/antonioborgerees/coding/go-cli-study/repos/dive` | go-cli-study |
| 4 | fzf | `/home/antonioborgerees/coding/go-cli-study/repos/fzf` | go-cli-study |
| 5 | gdu | `/home/antonioborgerees/coding/go-cli-study/repos/gdu` | go-cli-study |
| 6 | gh-cli | `/home/antonioborgerees/coding/go-cli-study/repos/gh-cli` | go-cli-study |
| 7 | go-task | `/home/antonioborgerees/coding/go-cli-study/repos/go-task` | go-cli-study |
| 8 | helm | `/home/antonioborgerees/coding/go-cli-study/repos/helm` | go-cli-study |
| 9 | k9s | `/home/antonioborgerees/coding/go-cli-study/repos/k9s` | go-cli-study |
| 10 | lazygit | `/home/antonioborgerees/coding/go-cli-study/repos/lazygit` | go-cli-study |
| 11 | mitchellh-cli | `/home/antonioborgerees/coding/go-cli-study/repos/mitchellh-cli` | go-cli-study |
| 12 | opencode | `/home/antonioborgerees/coding/go-cli-study/repos/opencode` | go-cli-study |
| 13 | rclone | `/home/antonioborgerees/coding/go-cli-study/repos/rclone` | go-cli-study |
| 14 | restic | `/home/antonioborgerees/coding/go-cli-study/repos/restic` | go-cli-study |
| 15 | urfave-cli | `/home/antonioborgerees/coding/go-cli-study/repos/urfave-cli` | go-cli-study |
| 16 | yq | `/home/antonioborgerees/coding/go-cli-study/repos/yq` | go-cli-study |

## Executive Summary

Across 16 Go CLI projects spanning encryption tools, dotfile managers, Kubernetes tools, backup systems, and general-purpose frameworks, **strong coherent engineering philosophy is the differentiator between code that feels designed versus accumulated**. Projects scoring 8+ share common traits: documented tradeoffs, disciplined acceptance of complexity, explicit rejection of features that don't serve core purpose, and architectural patterns that make the "why" behind decisions traceable.

The highest-rated project, **fzf (9/10)**, demonstrates 13+ years of architectural coherence around a filter-focused philosophy. The lowest-scoring non-archived project, **mitchellh-cli (7/10)**, suffers primarily from archived status and missing context support rather than design flaws.

Three distinct schools of thought emerge: **simplicity-first** (age, fzf, dive), **extensibility-first** (helm, k9s, opencode), and **ergonomics-first** (gh-cli, lazygit, urfave-cli). Each approach has legitimate tradeoffs; failures occur when projects are inconsistent or when complexity accumulates without corresponding benefit.

## Core Thesis

**Go CLI projects succeed or fail based on intentionality**: whether complexity is accepted deliberately (like gdu's parallel analyzers, helm's storage backends, rclone's 70+ provider abstractions) or accumulates accidentally (like chezmoi's 1000+ line sourcestate.go, lazygit's acknowledged God Struct). The best projects have a clear "what we optimize for" and "what we explicitly reject" — visible in everything from README philosophy statements to `VISION.md` documents to CONTRIBUTING guidelines that prioritize backward compatibility.

Philosophy without discipline becomes bloat; discipline without philosophy becomes arbitrary rigidity. The elite projects balance both.

## Rating Summary

| Repo | Score | Approach | Main Strength | Main Concern |
|------|-------|----------|---------------|--------------|
| age | 8/10 | Minimalist security-first | Deliberate simplicity with cryptographic rigor | Limited key management for users |
| chezmoi | 8/10 | Single source of truth | Clean System abstraction with debug/dry-run wrappers | 1000+ line sourcestate.go complexity |
| dive | 8/10 | Narrow-purpose depth | Focused single responsibility | No architectural documentation |
| fzf | 9/10 | Performance-first filter | SIMD optimization, 13-year coherence | Single-maintainer sustainability |
| gdu | 8/10 | Parallel SSD scanning | Benchmarking culture with cold/warm testing | Global mutable concurrency state |
| gh-cli | 8/10 | Opinionated GitHub workflows | Factory pattern, comprehensive mocking | GHES feature detection complexity |
| go-task | 8/10 | Backward-compatible evolution | Experiments framework, cross-platform Windows utils | No distributed execution |
| helm | 8/10 | Operational safety + plugin-first | Backward compatibility commitment | Dual chart v2/v3 complexity |
| k9s | 8/10 | Operational UX optimization | Real-time Kubernetes integration via informers | Single maintainer risk |
| lazygit | 8/10 | Enjoyable discoverability | Documented VISION.md with 7 principles | God Struct migration incomplete |
| mitchellh-cli | 7/10 | Simple interface extensibility | Radix tree subcommand dispatch | Archived, no context support |
| opencode | 8/10 | Terminal-native AI pair programming | Pub/sub broker pattern, permission system | No structured error recovery |
| rclone | 8/10 | Provider neutrality | 70+ backends with uniform interface | Backend boilerplate repetition |
| restic | 8/10 | Security + simplicity | Cryptographic rigor, BDFL governance | No plugin extensibility |
| urfave-cli | 8/10 | Ergonomic simplicity | 3-version backward compatibility | No performance benchmarks |
| yq | 8/10 | Lightweight multi-format | Clean operator handler architecture | Single-maintainer risk |

## Approach Models

### Model 1: Simplicity-First (age, fzf, dive, restic, yq)

These projects optimize for minimal complexity with strong constraints:

- **age**: No keyring, no config, no agents. Small explicit keys. "age does not have a global keyring" (`age.go:18`)
- **fzf**: No plugins, no config files, single binary. Filter focus. "fzf is a general-purpose command-line fuzzy finder" (`README.md:28-29`)
- **dive**: Single purpose (Docker image analysis), no multi-image comparison, no build orchestration
- **restic**: No plugin system, internal packages not importable, pure CLI tool (`doc.go:5-10`)
- **yq**: No plugin system, dependency-free, minimal configuration (`cmd/root.go:43`)

### Model 2: Extensibility-First (helm, k9s, opencode)

These projects accept complexity to enable user customization:

- **helm**: Plugin-first extensibility (`AGENTS.md:88`), multiple storage backends, chart v2/v3 dual support
- **k9s**: YAML plugins, skins, custom views, dynamic Kubernetes informers (`internal/watch/factory.go:28-35`)
- **opencode**: MCP integration, LSP client, multi-provider LLM abstraction (`internal/llm/provider/provider.go:1-30`)

### Model 3: Ergonomics-First (gh-cli, lazygit, urfave-cli, go-task)

These projects prioritize developer/user experience with sensible defaults:

- **gh-cli**: TTY detection, `--json` export, lazy initialization to avoid side effects (`pkg/cmd/issue/list/list.go:85`)
- **lazygit**: "Most enjoyable UI for git" (`VISION.md:5`), confirmation dialogs for dangerous ops, safety defaults
- **urfave-cli**: "One line of code in main()" ideal (`docs/v3/getting-started.md:9`), declarative API
- **go-task**: Backward compatibility focus, Experiments framework for controlled breaking changes

### Model 4: Performance-First (gdu, fzf)

Raw optimization as the primary design constraint:

- **gdu**: `concurrencyLimit = 2*runtime.GOMAXPROCS(0)` (`pkg/analyze/parallel.go:13`), benchmark-driven development
- **fzf**: SIMD-accelerated search (`src/algo/indexbyte2_amd64.s:40-53`), runtime CPU feature detection

## Pattern Catalog

### Pattern 1: Factory + Options Pattern

**Repos**: gh-cli, mitchellh-cli, go-task, helm

Every command receives a `Factory` struct providing lazy-initialized dependencies (HTTP clients, repos, IOStreams). Commands define `NewCmdXxx(f *Factory, runF func(*XxxOptions) error)` with a separate `xxxRun(opts *XxxOptions)` function. This enables:
- Lazy initialization avoiding side effects during command construction
- Easy test injection via `runF` parameter
- Clean separation of construction from execution

Evidence: `pkg/cmd/factory/default.go:26-46` in gh-cli, `executor.go:126-450` in go-task with 20+ `With*` options.

### Pattern 2: Interface-Driven Abstraction

**Repos**: rclone, restic, helm, chezmoi

A minimal interface (`Fs`, `Backend`, `System`) defines the contract. Multiple implementations (local, S3, GCS, etc.) satisfy it. This enables:
- Swappable backends without changing operational logic
- Test doubles without network dependencies
- Clear boundaries between concerns

Evidence: `fs/types.go:16-59` in rclone, `internal/backend/backend.go:19-90` in restic, `internal/chezmoi/system.go:25-45` in chezmoi.

### Pattern 3: Wrapper/Decorator Pattern

**Repos**: chezmoi, mitchellh-cli, gdu, opencode

A base implementation (RealSystem, BasicUi) wrapped by decorators adding capabilities:
- DebugSystem, DryRunSystem, ReadOnlySystem for chezmoi
- ConcurrentUi, PrefixedUi, ColoredUi for mitchellh-cli
- Multiple analyzer strategies (Parallel, Sequential, TopDir) for gdu

Evidence: `internal/chezmoi/system.go:25-45` in chezmoi, `ui_concurrent.go:9-12` in mitchellh-cli.

### Pattern 4: Registry/Registration Pattern

**Repos**: rclone, helm, gh-cli

Self-registering components via `init()` functions or explicit registration calls:
- `backend/all/all.go:1-74` imports all backends for registration
- `pkg/cmd/root/root.go:133-177` registers all commands
- `fs/registry.go:407-426` provides `Register()` function

This enables out-of-tree plugins and compile-time flexibility.

### Pattern 5: Event Bus / Pub-Sub

**Repos**: opencode, dive, k9s

Central publisher dispatches events to multiple subscribers:
- opencode: `internal/pubsub/broker.go:10-19` with buffer size 64
- dive: `internal/bus/bus.go:1-19` for UI decoupling
- k9s: Real-time Kubernetes watches via informers

Evidence: `internal/pubsub/broker.go:10-19` in opencode, `internal/bus/bus.go:1-19` in dive.

### Pattern 6: Strategy Pattern for Analyzers/Engines

**Repos**: gdu, dive, yq

Interface with multiple implementations:
- gdu: `ParallelAnalyzer`, `SequentialAnalyzer`, `TopDirAnalyzer`, `StableOrderAnalyzer`
- dive: `DockerEngine`, `PodmanEngine`, `DockerArchive`, `Unknown` for image sources
- yq: `StreamEvaluator` vs `AllAtOnceEvaluator`

Evidence: `pkg/analyze/parallel.go:22` in gdu, `dive/get_image_resolver.go:13-17` in dive.

### Pattern 7: Filename-Encoded Metadata

**Repo**: chezmoi

Prefixes encode file attributes (encrypted_, executable_, private_, etc.) to avoid sidecar config files. Enables self-contained dotfiles where each file carries its own metadata.

Evidence: `internal/chezmoi/chezmoi.go:36-58`.

### Pattern 8: Experiments Framework for Breaking Changes

**Repo**: go-task

Feature flags allow breaking changes in minor versions before committing to major releases. Controls rollout and enables backward-compatibility testing.

Evidence: `website/src/docs/experiments/index.md:17-21`.

## Key Differences

### 1. Plugin Philosophy: Reject vs Embrace

**Reject plugins**: age, fzf, dive, restic, yq — argue plugins add complexity without corresponding benefit. "Some features are not worth the added complexity in the codebase" (`VISION.md:97` in lazygit)

**Embrace plugins**: helm, k9s, opencode — argue extensibility enables user needs without core bloat. "Enabling additional functionality via plugins... is preferred over incorporating into Helm's codebase" (`AGENTS.md:88`)

**Middle ground**: gh-cli has "official extensions" as stub commands (`pkg/cmd/root/root.go:239-248`), go-task uses includes instead of plugins

### 2. Configuration: Files vs Flags vs Code

**No config files**: age, fzf — all configuration via CLI flags and environment variables (`FZF_DEFAULT_OPTS` at `README.md:416-426`)

**Minimal config**: rclone (INI-based, `fs/config/config.go:29-69`), yq (few global flags)

**Rich config with defaults**: lazygit (40+ page Config.md but maintainer regrets additions), gh-cli (YAML with environment fallback)

**Config as code**: chezmoi (templates), go-task (Taskfile.yml), helm (charts)

### 3. State Management: Stateless vs Stateful vs Persistent

**Stateless**: fzf (streaming filter), dive (no persistence), go-task (stateless runs except caching)

**In-memory state**: lazygit (`Gui.State` in memory, git as source of truth), k9s (real-time informers)

**Persistent state**: opencode (SQLite for sessions), rclone (INI config), gdu (optional SQLite/BadgerDB)

### 4. Backend Patterns: Unified Interface vs Direct Implementation

**Unified interface**: rclone (`Fs` interface, all operations through it), restic (`Backend` interface), helm (storage driver abstraction)

**Direct implementation**: gdu (platform-specific code in `pkg/device/dev_*.go`), dive (resolvers as discrete implementations)

### 5. Distribution: Single Binary vs Multi-Component

**Single binary**: age, fzf, dive, chezmoi, restic, yq — no external dependencies, `go:embed` for assets

**Multi-component**: helm (plugin system, registry client), k9s (plugin executables), opencode (MCP servers)

## Tradeoffs

| Tradeoff | Pro Side | Con Side | Best Fit |
|----------|----------|----------|----------|
| **No plugin system** (age, fzf, restic) | Simplicity, predictable behavior, no security vulnerabilities | Can't extend without modifying core | Security-sensitive tools, narrow-scope utilities |
| **Plugin extensibility** (helm, k9s, opencode) | User customization, community innovation | Core bloat, security surface, version compatibility | Tools with diverse use cases, platform-like tools |
| **Single binary** (most projects) | Zero-dependency distribution, portability | Larger binary if many features, no partial updates | Tools distributed to diverse environments |
| **No config files** (age, fzf) | Predictable behavior, no config corruption | Repetitive CLI flags for common operations | Tools invoked frequently with similar args |
| **Rich configuration** (lazygit, gh-cli) | Personalized experience, complex workflows | Configuration complexity, user confusion | Tools used daily with varying contexts |
| **Parallel by default** (gdu) | Maximum SSD utilization | Wasted resources on HDDs, higher memory | Interactive analysis on modern hardware |
| **Sequential by default** (dive) | Predictable resource usage | Slower on parallel-capable hardware | Tools where correctness > speed |
| **Interface abstraction** (rclone, restic) | Backend flexibility, testability | Indirection cost, harder to trace | Tools targeting many providers |
| **Direct implementation** (gdu) | Simpler debugging, fewer abstractions | Less flexibility | Tools optimized for specific backends |
| **BDFL governance** (restic) | Coherent vision, fast decisions | Single point of failure | Smaller projects with strong founder |
| **Committee governance** (helm, gh-cli) | Diverse input, shared ownership | Slower decisions | Large projects with many stakeholders |

## Decision Guide

### When to Reject Plugin Systems

**Use when:**
- Tool has narrow, well-defined scope (dive, fzf, age)
- Security is paramount (restic encrypts everything)
- Simplicity is the value proposition
- Maintenance capacity is limited (single maintainer)

**Don't use when:**
- Tool must serve wildly different use cases (helm needs Kustomize)
- Community contribution is essential (k9s plugins for cloud providers)
- Platform lock-in is acceptable (opencode MCP)

### When to Accept Multiple Backend Support

**Use when:**
- Target domain has many providers (rclone 70+ backends, restic 10+ backends)
- User choice is a feature (helm storage drivers)
- Abstraction is stable (rarely adding operations to `Fs` interface)

**Avoid when:**
- New backends require modifying core logic (dive's hardcoded resolvers)
- Complexity grows superlinearly with backend count

### When to Prioritize Performance

**Use when:**
- Tool is used in hot paths (fzf on every keystroke, gdu for large trees)
- Competitive alternatives exist (gdu vs ncdu)
- User expectation is speed (lazygit "startup must be FAST")

**Don't prioritize when:**
- Correctness is harder than speed (restic backup integrity)
- User is making infrequent decisions (k9s cluster browsing)

### When to Document Philosophy Explicitly

**Do document when:**
- Project has many contributors needing alignment (helm CONTRIBUTING.md:132-151)
- User-facing decisions need explanation (lazygit VISION.md principles)
- Tradeoffs are non-obvious (age's no-keyring design)

**Don't document when:**
- Project is small and stable (fzf has 13 years of implicit coherence)
- Philosophy is obvious from structure (yq operator handlers)

## Practical Tips

1. **Start with explicit non-goals**: age's "no config options" and fzf's "no file-manager features" guide every decision. State what you are NOT building.

2. **Use factory patterns for testability**: Every repo that scales (gh-cli, helm, go-task) uses factory + options patterns. Commands should be constructable without side effects.

3. **Wrapper patterns enable debugging**: chezmoi's DebugSystem/DryRunSystem and lazygit's confirmation dialogs work because all operations go through a testable interface.

4. **Backward compatibility is a feature**: helm's semantic versioning for CLI, urfave-cli's three-version maintenance, go-task's Experiments framework — all prevent user pain.

5. **Simplicity scales**: fzf's single-binary filter with 5 dependencies has survived 13 years without architectural rot. Complex tools (rclone, helm) require more maintenance investment.

6. **Use interface abstractions for backends**: rclone's `Fs` and restic's `Backend` interfaces enable testing and provider addition without modifying operational logic.

7. **Make defaults sensible**: lazygit's safety-first defaults with override capability, gh-cli's TTY detection, urfave-cli's "one line in main" — all reduce user configuration burden.

8. **Accept complexity deliberately**: gdu's 4+ analyzer types, helm's storage drivers, k9s's informer system — all accepted for legitimate reasons, not accumulated.

## Anti-Patterns / Caution Signs

1. **Undocumented complexity**: When sourcestate.go hits 1000+ lines with no explanation (chezmoi), complexity has accumulated without corresponding documentation.

2. **God structs without migration plan**: lazygit acknowledges `gui.go` is a God Struct but migration to contexts/controllers is incomplete. A known problem without active resolution is worse than no problem — it creates false confidence.

3. **Single-maintainer with complex security surface**: opencode executes shell commands with permission system, k9s has Kubernetes access. Single-person projects with high-privilege operations need explicit succession planning.

4. **Feature detection with TODO markers**: gh-cli's `// TODO cleanupIdentifier` comments above version-specific if/else blocks (`pkg/cmd/issue/list/list.go:61-62`) indicate technical debt that accumulates.

5. **Global mutable state in performance paths**: gdu's `concurrencyLimit` channel at package level (`pkg/analyze/parallel.go:13`) is a concurrency hazard that testing may not catch.

6. **Configuration that grows without pruning**: lazygit's 1200-line Config.md and maintainer's explicit regrets about config additions. A config file is a liability — every option is a maintenance burden forever.

7. **Archived projects with modern alternatives**: mitchellh-cli predates context.Context. Using archived libraries means inheriting their limitations without updates.

8. **No error recovery for expected failure modes**: opencode's permission dialog blocks indefinitely (`internal/permission/permission.go:105-107`) with no timeout. Network errors propagate directly to users without structured handling.

9. **Plugin security without sandboxing**: k9s plugins execute with user permissions and external dependencies unverified. "Dangerous flag" (`internal/config/k9s.go:43`) is not a security boundary.

## Notable Absences

1. **No ARCHITECTURE.md in most repos**: Only helm (CONTRIBUTING.md sections), lazygit (VISION.md, Codebase_Guide.md), and restic (design.rst) have explicit architectural documentation. Most projects rely on code structure to communicate philosophy.

2. **No formal ADR process**: Specific decisions (why forked gocui in lazygit, why process-based git in lazygit, why no context in mitchellh-cli) are not recorded as architectural decision records. Future maintainers must infer intent.

3. **No security audit documentation**: age and restic have explicit cryptographic design docs, but most projects lack formal security review processes.

4. **No explicit performance SLAs**: Only gdu has benchmark-driven development culture. Others rely on implicit speed ("startup must be FAST" at lazygit VISION.md:68) without quantified targets.

5. **No telemetry opt-out in AI tools**: opencode's usage tracking appears always-on with no mechanism to disable. Users in privacy-sensitive environments have no control.

6. **No plugin governance in extensibility-first projects**: helm and k9s accept plugins but have no vetting or stability policy. Users rely on community quality control.

## Per-Repo Notes

| Repo | Key Insight |
|------|-------------|
| **age** | Demonstrates that rejecting features (no keyring, no config, no agents) can be a strength when the rejection is deliberate and well-documented. Format over implementation — age-encryption.org/v1 specification enables multiple interoperable implementations. |
| **chezmoi** | Single source of truth via one git repo solves real problems (no ambiguity about which file version wins), but creates complexity in sourcestate.go. The System abstraction is a clean solution to debug/dry-run needs. |
| **dive** | Proves narrow scope enables depth. No ambition to be a container management tool — just the best Docker image analyzer. Resolver pattern enables multi-engine support without polluting domain logic. |
| **fzf** | 13 years of coherent design around a filter. SIMD optimization is impressive but secondary to architectural discipline. Single-maintainer risk is real but hasn't materialized. |
| **gdu** | Benchmark-driven development is a differentiator. The 4+ analyzer types look excessive until you understand HDD users need sequential mode. Global mutable state is the main technical concern. |
| **gh-cli** | Factory pattern + lazy initialization enables testability without sacrificing features. TTY detection and `--json` export show thoughtful API design. GHES feature detection is technical debt worth tracking. |
| **go-task** | Experiments framework is underappreciated — allows breaking changes without breaking users. Cross-platform via compiled-in Unix utils for Windows is pragmatic. No distributed execution is a deliberate non-goal. |
| **helm** | Backward compatibility commitment is the primary philosophy — visible in semantic versioning for CLI, charts, and pkg/ APIs. Plugin-first approach delays core bloat. Dual chart v2/v3 creates accessor complexity. |
| **k9s** | Real-time Kubernetes via informers is operationally elegant but memory-intensive for large clusters. Plugin system and skins show design coherence. Single maintainer risk is concerning for a Kubernetes tool. |
| **lazygit** | VISION.md with seven principles is the most explicit philosophy documentation in this study. God Struct migration shows honest self-awareness. PR rejection policy reflects real maintenance burden from AI-generated PRs. |
| **mitchellh-cli** | Interface-based design with radix tree subcommand dispatch was ahead of its time. Archived status is the main concern — context gap is real in modern Go. |
| **opencode** | Pub/sub broker pattern enables clean separation between TUI and backend. Permission system shows thoughtful UX. No structured error recovery and always-on telemetry are gaps. |
| **rclone** | 70+ backends with uniform interface is a maintenance tour de force. Backend boilerplate is deliberate (CONTRIBUTING.md:600-601) — repetition enables uniformity. No external SDKs in most backends avoids lock-in. |
| **restic** | BDFL governance enables fast decisions with coherent vision. Cryptographic rigor is non-negotiable (AES-256-CTR + Poly1305-AES). Internal-only packages preserve tool focus. |
| **urfave-cli** | Three-version maintenance is a real investment. "One line of code in main()" is an achievable ideal. Multi-version API surface is complexity but also stability guarantee. |
| **yq** | Operator handler pattern cleanly separates format from evaluation. Two evaluator types (stream/all-at-once) solve real tradeoffs. Single-maintainer risk and no plugin extensibility are the main concerns. |

## Open Questions

1. **Sustainability of single-maintainer projects**: fzf, yq, k9s, and opencode all show single-maintainer risk. What happens when the maintainer steps away? Are there succession plans?

2. **Plugin governance at scale**: helm and k9s accept plugins but have no formal vetting. As plugin ecosystems grow, how do they prevent supply-chain attacks?

3. **Context overflow in AI tools**: opencode's auto-compaction is a mitigation but long sessions may lose detail. Is there a threshold where context summarization degrades conversation quality?

4. **Performance vs correctness for encrypted tools**: age prioritizes simplicity (single-use keys, no key rotation) but what happens when keys are compromised? restic's threat model acknowledges this. age's docs should address recovery scenarios.

5. **Configuration as code vs configuration as data**: chezmoi uses templates (code), helm uses charts (code + data), rclone uses INI (data). Which is more maintainable at scale? Evidence suggests chezmoi's approach handles machine-to-machine differences well but requires Go template literacy.

6. **Backwards compatibility vs innovation**: go-task's Experiments framework and helm's strict semantic versioning both solve the same problem differently. Which approach scales better as projects mature?

7. **When to reject simplicity for extensibility**: age rejects plugins to minimize attack surface. k9s accepts plugins for Kubernetes flexibility. opencode accepts MCP complexity for tool extensibility. The tradeoff is legitimate but the decision criteria are rarely explicit.

## Evidence Index

Key evidence supporting this synthesis:

- `age.go:18` — "age does not have a global keyring"
- `VISION.md:5` — lazygit "most enjoyable UI for git"
- `VISION.md:97` — "Some features are not worth the added complexity in the codebase"
- `pkg/cmd/factory/default.go:26-46` — gh-cli factory pattern
- `internal/chezmoi/system.go:25-45` — chezmoi System interface
- `pkg/analyze/parallel.go:13` — gdu concurrency limit
- `src/algo/indexbyte2_amd64.s:40-53` — fzf SIMD
- `fs/types.go:16-59` — rclone Fs interface
- `internal/backend/backend.go:19-90` — restic Backend interface
- `AGENTS.md:88` — helm plugin-first philosophy
- `internal/pubsub/broker.go:10-19` — opencode pub/sub
- `docs/project-layout.md:68-69` — gh-cli no global packages
- `website/src/docs/contributing.md:55-59` — go-task backward compat focus
- `GOVERNANCE.md:6-17` — restic BDFL model
- `docs/v3/getting-started.md:9` — urfave-cli "one line of code"
- `pkg/yqlib/expression_parser.go:25` — yq operator architecture
- `CONTRIBUTING.md:600-601` — rclone backend uniformity rationale
- `website/src/docs/experiments/index.md:17-21` — go-task experiments
- `pkg/cmd/root/root.go:239-248` — gh-cli extension stubs
- `internal/permission/permission.go:74-108` — opencode permission system

---

Generated by protocol `study-areas/15-philosophy.md` against 16 Go CLI repositories.