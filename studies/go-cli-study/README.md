# go-cli-study

A structured comparative study of elite Go CLI architectures. Each source is studied independently per dimension, then synthesized into a combined report.

## Repository Layout

```
go-cli-study/
├── sources/                        # Cloned reference repos (flat — 16 sources)
│   ├── age/  chezmoi/  dive/  fzf/  gdu/
│   ├── gh-cli/  go-task/  helm/  k9s/  lazygit/
│   ├── mitchellh-cli/  opencode/  rclone/  restic/
│   └── urfave-cli/  yq/
├── dimensions/                     # Study dimensions (formerly study-areas/)
│   ├── 01-project-structure.md
│   ├── 02-command-architecture.md
│   └── ... (15 dimensions total)
├── reports/
│   ├── sources/                    # Per-source analyses, organised by dimension
│   └── final/                      # Generated combined reports
└── summary.csv                     # Score summary across all dimensions × sources
```

Ultraplan shared resources (at `ultraplan/` root):

```
ultraplan/
├── prompts/                        # Shared execution prompts
│   ├── base.md
│   └── synthesize.md
├── templates/                      # Shared output templates
│   ├── repo-analysis.md
│   └── report.md
└── config.json                     # Shared model configuration
```

## Source Categories

Sources are grouped by architectural style to surface patterns within each category:

### Compact & Focused

Small, readable codebases with high engineering discipline. Good starting points.

| Source | What to Study |
|--------|---------------|
| `age` | Minimalism, API design, security engineering |
| `chezmoi` | Config management, filesystem abstraction, cross-platform |
| `fzf` | Performance, terminal interaction, event loops, memory efficiency |
| `gdu` | Filesystem traversal, concurrency, focused architecture |
| `go-task` | Execution graphs, config parsing, task orchestration |
| `mitchellh-cli` | Minimal CLI framework — clean surfaces, great for fundamentals |
| `urfave-cli` | Lightweight CLI framework, inline command definitions |
| `yq` | Parser architecture, command pipelines, cross-format processing |

### Enterprise & Platform

Production-grade, large-scale CLI engineering. Patterns for extensibility and robustness.

| Source | What to Study |
|--------|---------------|
| `gh-cli` (GitHub CLI) | Clean architecture, DI, testability, mature release engineering |
| `helm` | Large-scale command architecture, plugins, API abstraction |
| `rclone` | Plugin/backend architecture, cloud abstraction, interfaces at scale |
| `restic` | Security-sensitive design, repository abstraction, crypto boundaries |

### Interactive & TUI

Terminal-native applications with rich rendering, event-driven architectures.

| Source | What to Study |
|--------|---------------|
| `dive` | TUI architecture, domain modeling, layered rendering |
| `k9s` | Event-driven, state management, terminal rendering, async updates |
| `lazygit` | Interactive UX, state machines, keybinding systems, controller patterns |
| `opencode` | Agentic CLI loop, tool execution, streaming |

## Study Dimensions (15 Areas)

1. **Project Structure & Boundaries**: `cmd/` vs `internal/` vs `pkg/`, dependency direction
2. **Command Architecture**: subcommand registration, composition, lifecycle hooks
3. **Dependency Injection & Wiring**: centralization, explicit initialization
4. **Configuration Management**: flags, env vars, config precedence
5. **Error Handling Philosophy**: wrapping, user-facing vs debug errors
6. **IO Abstraction & Testability**: stream abstraction, mockability
7. **State & Context Management**: `Context` propagation, cancellation, sessions
8. **Concurrency & Async Patterns**: goroutines, coordination, cleanup
9. **Terminal UX & Interaction Design**: rendering, prompts, streaming
10. **Logging & Observability**: structured logging, verbosity, tracing
11. **Testing Strategy**: integration tests, golden tests, fixture organization
12. **Extensibility & Plugin Design**: interfaces, command registration
13. **Security & Trust Boundaries**: sandboxing, input validation
14. **Performance & Resource Management**: startup time, buffering, lazy init
15. **Engineering Philosophy & Tradeoffs**: simplicity vs scalability vs extensibility

## CLI Usage

Run from the ultraplan root.

```bash
# List available studies
bun run cli/src/index.ts list

# List sources and dimensions for a specific study
bun run cli/src/index.ts go-cli-study list

# Study one dimension against one source
bun run cli/src/index.ts go-cli-study run 01 opencode

# Run all dimension × source combinations
bun run cli/src/index.ts go-cli-study run-all --parallel 3

# Stateful batch runner with retry/backoff
bun run cli/src/index.ts go-cli-study run-loop --batch-size 2

# Show run status
bun run cli/src/index.ts go-cli-study status
```

### Options

| Flag | Description |
|------|-------------|
| `--model <model>` | Model (default: `ultraplan/config.json`) |
| `--variant <effort>` | Model variant (`high`, `max`, `minimal`) |
| `--parallel N` | Max parallel invocations (default: `config.json`) |
| `--batch-size N` | Max concurrent tasks for `run-loop` (default: parallel) |
| `--dry-run` | Print generated prompts without executing |
| `--timeout <ms>` | Per-task timeout in ms (default: 1800000) |
| `--dimensions "01,03,05"` | Filter dimensions |
| `--sources "opencode,helm"` | Filter sources |

## How It Works

1. CLI reads `prompts/base.md` and the selected dimension file
2. Discovers all sources across the source directories
3. Each dimension × source pair gets its own `opencode run` invocation — one source, one agent
4. Analyses run in parallel batches via `run-loop` or `run-all`
5. Writes per-source analyses under `reports/source/{NN}-{dimension-name}/{source-name}.md`
6. After all sources finish for a dimension, queues a **synthesis** task that reads all per-source analyses and generates a combined report under `reports/final/{NN}-{dimension-name}.md`

## Output Structure

```
reports/
├── sources/{NN}-{dimension-name}/
│   ├── {source-1}.md
│   ├── {source-2}.md
│   └── ...
└── final/{NN}-{dimension-name}.md
```

## Study Method

For each source, create a matrix:

| Dimension | Score | Notes | Interesting Patterns |
|-----------|-------|-------|---------------------|
| Structure | 9/10 | Very clean layering | Thin cmd/ |
| Testing | 6/10 | Weak integration tests | Good unit isolation |
| UX | 10/10 | Excellent streaming | BubbleTea usage |

Over time you'll see recurring architectural patterns, ecosystem conventions, and tradeoff philosophies — that's when learning compounds.

## CLI Commands

| Command | Description |
|---------|-------------|
| `list` | List available studies (ultraplan root), or sources and dimensions for a study |
| `run <dimension> <source>` | Study one dimension against one source |
| `run-all` | Study all dimension × source combinations, then synthesize |
| `run-loop` | Stateful batch runner with retry/backoff |
| `status` | Show current run-loop state |

Use `--dry-run` to preview prompts without executing.
