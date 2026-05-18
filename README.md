# ultraplan

A multi-study architecture analysis toolkit. Each study compares elite Go CLI (and other language) projects across architectural dimensions, producing per-source analyses and synthesized final reports. The global CLI at `cli/` drives studies, extracts code references, and traces evidence packs to source code.

## Repository Layout

```
ultraplan/
├── cli/                            # Global CLI tool (study command)
│   ├── src/index.ts                # Entry point — all commands
│   ├── src/code.ts                 # Code reference extraction
│   └── src/evolve.ts               # Evidence-to-code trace
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
            └── sprint-evidence/    # Generated study evolve bundles for sprint planning
```

## Studies

| Study | Focus | Sources |
|-------|-------|---------|
| `go-cli-study` | Elite Go CLI architectures | age, chezmoi, dive, fzf, gdu, gh-cli, go-task, helm, k9s, lazygit, mitchellh-cli, opencode, rclone, restic, urfave-cli, yq |
| `opencode-wrap-study` | Agent runtimes & SDK integration | go-plugin, opencode, sdk-go, t3code |

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
| `code` | Extract code references from a report |
| `evolve` | Trace evidence packs through reports to source code |
| `sprint-plan <target> <sprint-slug>` | Plan a sprint using `prompts/plan-sprint.md` |

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

# Sprint planning bundle with code included
study evolve --top-sources 1 --output targets/opencode-wrap/reports/sprint-evidence/09-cli-product-surface.txt \
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

Generates an evidence-grounded sprint plan from `prompts/plan-sprint.md`, using the target's PRD, TRD, roadmap, and generated evidence bundle.

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

Sprint planning uses the target roadmap plus a generated evidence bundle.

1. Generate the sprint evidence bundle with the command listed in `targets/<target>/roadmap.md`.
2. Use `prompts/plan-sprint.md` to write `targets/<target>/sprints/<sprint-slug>/reasoning.md`.
3. Use `templates/sprint-reasoning.md` to justify decisions, tradeoffs, alternatives, risks, and expected evidence.
4. Use the reasoning document to write `targets/<target>/sprints/<sprint-slug>/plan.md`.
5. Use `templates/sprint-plan.md` as the required sprint tracker format.
6. Use `prompts/execute-sprint.md` to implement the approved sprint and keep the sprint tracker current.

For implementation planning with code included, use `study evolve --top-sources 1`. Use `--top-sources 2` for a heavier planning bundle only when the sprint needs more source evidence.
