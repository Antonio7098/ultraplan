# ultraplan

A multi-study architecture analysis toolkit. Each study compares elite Go CLI (and other language) projects across architectural dimensions, producing per-source analyses and synthesized final reports. The global CLI at `cli/` drives studies, extracts code references, and traces evidence packs to source code.

## Repository Layout

```
ultraplan/
├── cli/                            # Global CLI tool (study command)
│   ├── src/index.ts                # Entry point — all commands
│   ├── src/code.ts                 # Code reference extraction
│   ├── src/evolve.ts               # Evidence-to-code trace
│   └── src/initialise.ts           # Study initialisation
├── config.json                     # Shared model configuration
├── prompts/                        # Shared execution prompts
│   ├── base.md
│   ├── synthesize.md
│   ├── plan-sprint.md
│   └── execute-sprint.md
├── templates/                      # Shared output templates
│   ├── repo-analysis.md
│   ├── report.md
│   ├── sprint-reasoning.md
│   └── sprint-plan.md
├── studies/                        # Study definitions
│   └── <study-name>/
│       ├── sources/                # Reference repos or source metadata
│       ├── dimensions/             # Study dimension definitions
│       └── reports/
│           ├── source/<dim>/       # Per-source analyses
│           └── final/<dim>.md      # Combined reports
└── targets/                        # Target definitions (planning docs)
    └── <target-name>/
        ├── sources/                # Target reference documents (PRD, TRD)
        ├── sprints/                # Sprint reasoning and execution trackers
        │   └── <sprint-slug>/
        │       ├── reasoning.md
        │       └── plan.md
        └── reports/
            ├── evidence/           # Evidence packs linking studies → decisions
            └── evidence-reports/   # (optional) Pre-generated evidence bundles for reference
```

## Studies

| Study | Focus | Sources |
|-------|-------|---------|
| `go-cli-study` | Elite Go CLI architectures | age, chezmoi, dive, fzf, gdu, gh-cli, go-task, helm, k9s, lazygit, mitchellh-cli, opencode, rclone, restic, urfave-cli, yq |
| `opencode-wrap-study` | Agent runtimes & SDK integration | go-plugin, opencode, sdk-go, t3code |
| `hellosales-architecture` | Large-scale data ingestion, AI orchestration & multi-tenant workflows | grafana, temporal, openfga, pocketbase, victoriametrics, milvus, nats-server, cli, kubernetes |

## Targets

Targets apply study findings to concrete product decisions. Each target has evidence packs that reference study reports.

| Target | Focus |
|--------|-------|
| `opencode-wrap` | Go CLI wrapping an SDK-based agent runtime |

## CLI Usage

Run from the ultraplan root. Requires [bun](https://bun.sh).

```bash
# List available studies
study list

# List sources and dimensions for a specific study
study go-cli-study list

# Initialise a new study from a YAML definition (with git clone)
study initialise-study ./my-study.yml

# Dry-run initialisation (preview without creating files)
study initialise-study ./my-study.yml --dry-run

# Study one dimension against one source
study go-cli-study run 01 opencode

# Run all dimension × source combinations
study go-cli-study run-all --parallel 3

# Stateful batch runner with retry/backoff
study go-cli-study run-loop --batch-size 2 --model "..."

# Show run-loop status
study go-cli-study status

# Extract code from a final report
study code @studies/go-cli-study/reports/final/01-project-structure.md

# Trace an evidence pack through reports to code
study evolve @targets/opencode-wrap/reports/evidence/cli-design.md

# Plan a sprint for a target
study sprint-plan opencode-wrap 09-cli-product-surface

# Execute a sprint
study execute-sprint opencode-wrap 09-cli-product-surface
```

## Commands

### Study Commands (`study <study-name> <command>`)

| Command | Description |
|---------|-------------|
| `list` | List sources and dimensions for a study |
| `run <dimension> <source>` | Study one dimension against one source |
| `run-all` | Study all dimension × source combinations, then synthesize |
| `run-loop` | Stateful batch runner with retry/backoff |
| `status` | Show current run-loop state |

### Global Commands (`study <command>`)

| Command | Description |
|---------|-------------|
| `list` | List available studies |
| `initialise-study <study-init.yml>` | Initialise a new study from YAML definition |
| `code` | Extract code references from a report |
| `evolve` | Trace evidence packs through reports to source code |
| `sprint-plan <target> <sprint-slug>` | Plan a sprint using `prompts/plan-sprint.md` |
| `execute-sprint <target> <sprint-slug>` | Execute a sprint using `prompts/execute-sprint.md` |

## Study Initialisation (`study initialise-study`)

Creates a new study from a YAML definition file. Generates the directory structure, dimension markdown files, and clones all source repositories.

```yaml
# study-init.yml
name: my-study
description: "What this study investigates"
repos:
  count: 6             # target number of repos (can exceed items — research fills gaps)
  items:
    - name: repo-name
      url: https://github.com/user/repo
      description: "Why this repo matters"
dimensions:
  count: 4             # target number of dimensions
  items:
    - number: 01
      name: dimension-slug
      title: "Dimension Title"
      description: "Brief description"
      purpose: "Full analysis purpose text (optional — used in .md files)"
      steps:            # optional — used in dimension .md files
        - "Step 1 description"
        - "Step 2 description"
      evidence:         # optional
        - "Evidence item 1"
      questions:        # optional
        - "Question 1?"
```

```bash
# Create a study from a YAML definition
study initialise-study ./study-init.yml

# Preview without creating files
study initialise-study ./study-init.yml --dry-run

# Overwrite an existing study
study initialise-study ./study-init.yml --force

# Override study name, repo count, or dimension count
study initialise-study ./study-init.yml --name my-study --repos 8 --dimensions 6

# Skip cloning repos into sources/
study initialise-study ./study-init.yml --no-clone

# Use a custom model for research calls
study initialise-study ./study-init.yml --model openai/gpt-5.5
```

### How It Works

1. Reads the YAML definition and applies CLI overrides (`--name`, `--repos`, `--dimensions`).
2. If `repos.items.length < repos.count`, calls OpenCode to research and suggest additional repositories (writes results to `.init-cache/research-repos.json`).
3. If `dimensions.items.length < dimensions.count`, calls OpenCode to research and suggest additional dimensions (writes results to `.init-cache/research-dimensions.json`).
4. Generates `dimensions/{NN}-{name}.md` files with Purpose, Steps, Evidence, Questions, and Rating sections.
5. Clones all repositories into `sources/` (shallow clone: `git clone --depth 1`).
6. Writes `study-init.yml` with the full config and a `README.md` with usage instructions.

### Options

| Flag | Description |
|------|-------------|
| `--name <name>` | Override study name from YAML |
| `--repos <N>` | Target number of repos (overrides YAML) |
| `--dimensions <N>` | Target number of dimensions (overrides YAML) |
| `--model <model>` | Model for OpenCode research calls |
| `--variant <effort>` | Model variant (`high`, `max`, `minimal`) |
| `--dry-run` | Preview without creating files or cloning |
| `--force` | Overwrite existing study directory |
| `--no-clone` | Skip cloning repos into sources/ |
| `--timeout <ms>` | Research task timeout |
| `--output-dir <dir>` | Custom output directory (default: `studies/`) |

## Code Extraction (`study code`)

Reads a report (final or per-source) and resolves all inline code references (`file.go:NN` or `file.go:NN-NN`) against the repos listed in its Repositories Studied table.

```bash
study code @studies/go-cli-study/reports/final/13-security.md
study code --output code-bundle.txt @studies/go-cli-study/reports/final/01-project-structure.md
study code @studies/go-cli-study/reports/final/13-security.md | less
```

### Options

| Flag | Description |
|------|-------------|
| `--output <file>` | Write to file instead of stdout |

## Evidence Trace (`study evolve`)

Starts from an evidence pack, follows its Source Reports to final study reports, discovers per-source analyses (top N by score), and resolves all code references. Outputs a layered bundle with a resolution summary.

```bash
# Single evidence pack
study evolve @targets/opencode-wrap/reports/evidence/cli-design.md

# Multiple packs (deduplicates shared reports)
study evolve @targets/opencode-wrap/reports/evidence/cli-design.md \
            @targets/opencode-wrap/reports/evidence/runtime-contract.md

# Write to file
study evolve --output bundle.txt @targets/opencode-wrap/reports/evidence/cli-design.md

# Heavy trace with code and top 3 per-source reports
study evolve --top-sources 3 --output trace-output.txt \
            @targets/opencode-wrap/reports/evidence/cli-design.md \
            @targets/opencode-wrap/reports/evidence/runtime-contract.md

# Reports only, skip code extraction
study evolve --no-code @targets/opencode-wrap/reports/evidence/cli-design.md
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--top-sources <N>` | `5` | Include top N per-source reports by score (`0` = all) |
| `--output <file>` | — | Write to file instead of stdout |
| `--no-code` | false | Skip code extraction (reports + per-source content only) |

### Bundle Summary

Every evolve run ends with a summary block:

```
════════════════════════════════════════════════════════
Bundle Summary
════════════════════════════════════════════════════════

Reports included:
  1 evidence pack(s)
  8 final report(s)
  16 per-source report(s)

  Total lines:        34,906
  Total characters:   1,322,562
  Estimated tokens:   330,641  (~4 chars/token)

Code reference resolution:
  Total refs found:   899
  Rendered unique:    812
  Duplicates skipped: 87
  Resolved:           899
  Unresolved (total): 0
    ├─ .md self-refs:  0  (cross-refs to analysis files, not code)
    └─ code refs:      0
  Resolution rate:    100.0%
```

### Study Options

| Flag | Description |
|------|-------------|
| `--model <model>` | Model override (default: `config.json`) |
| `--variant <effort>` | Model variant (`high`, `max`, `minimal`) |
| `--parallel N` | Max parallel invocations (default: `config.json`) |
| `--batch-size N` | Max concurrent tasks for `run-loop` (default: parallel) |
| `--dry-run` | Print generated prompts without executing |
| `--timeout <ms>` | Per-task timeout in ms (default: 1800000) |
| `--dimensions "01,03,05"` | Filter dimensions |
| `--sources "opencode,helm"` | Filter sources |

## How Study Runs Work

1. CLI reads `prompts/base.md` and the selected dimension file
2. Discovers all sources across the source directories
3. Each dimension × source pair gets its own `opencode run` invocation
4. Analyses run in parallel batches via `run-loop` or `run-all`
5. Writes per-source analyses under `reports/source/{NN}-{dimension-name}/{source-name}.md`
6. After all sources finish for a dimension, queues a **synthesis** task that reads all per-source analyses and generates a combined report under `reports/final/{NN}-{dimension-name}.md`

## Evidence Pack Structure

Evidence packs at `targets/<target>/reports/evidence/` are the bridge between study findings and product decisions. Each pack contains:

- **Source Reports**: links to primary and supporting study final reports
- **Compressed Guidance**: distilled recommendations from the studies
- **Decisions This Pack Should Inform**: design decisions the evidence supports
- **Open Questions**: unresolved questions for the team

The `evolve` command traces these links automatically: evidence → final reports → per-source reports → code.

## Sprint Plan (`study sprint-plan`)

Generates an evidence-grounded sprint plan from `prompts/plan-sprint.md`, using the target's PRD, TRD, roadmap, and referenced evidence packs.

```bash
# Plan sprint for a target
study sprint-plan opencode-wrap 09-cli-product-surface

# Dry run — preview the prompt without executing
study sprint-plan opencode-wrap 09-cli-product-surface --dry-run

# Override model and variant
study sprint-plan opencode-wrap 09-cli-product-surface --model openai/gpt-5.5 --variant high
```

Writes the plan to `targets/<target>/sprints/<sprint-slug>/plan.md`. Uses `config.json` fields `sprintPlanningModel` and `sprintPlanningContextWindow` to set the model and context limit.

### Options

| Flag | Description |
|------|-------------|
| `--model <model>` | Model override (default: `sprintPlanningModel` in `config.json`) |
| `--variant <effort>` | Model variant (`high`, `max`, `minimal`) (default: `defaultVariant`) |
| `--dry-run` | Print the composed prompt without executing |
| `--timeout <ms>` | Per-task timeout in ms (default: `defaultTimeoutMs`) |

## Sprint Planning And Execution

Sprint planning uses the target roadmap plus referenced evidence packs.

1. Identify the relevant evidence packs from `targets/<target>/reports/study-index.md`.
2. Use `prompts/plan-sprint.md` to write `targets/<target>/sprints/<sprint-slug>/reasoning.md`.
3. Use `templates/sprint-reasoning.md` to justify decisions, tradeoffs, alternatives, risks, and expected evidence.
4. Use the reasoning document to write `targets/<target>/sprints/<sprint-slug>/plan.md`.
5. Use `templates/sprint-plan.md` as the required sprint tracker format.
6. Use `prompts/execute-sprint.md` to implement the approved sprint and keep the sprint tracker current.

Evidence packs are compressed guidance (~40 lines each). Open linked final reports, per-source reports, and code references only when a concrete decision needs deeper evidence. The `study evolve` CLI command remains available as a standalone utility for ad-hoc evidence trace, but is no longer part of the planning flow.
