import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { execSync } from "child_process"
import { join } from "path"
import yaml from "js-yaml"
import { ULTRAPLAN_ROOT, STUDIES_DIR, runOpenCode, loadConfig, OPENCODE_CONFIG_PATH, type Config } from "./index.js"

interface RepoItem {
  name: string
  url: string
  description?: string
}

interface ResearchRepo {
  name: string
  url: string
  description: string
}

interface DimensionItem {
  number: string
  name: string
  title: string
  description?: string
  purpose?: string
  steps?: string[]
  evidence?: string[]
  questions?: string[]
}

interface ResearchDimension {
  number: string
  name: string
  title: string
  purpose: string
  steps: string[]
  evidence: string[]
  questions: string[]
}

interface StudyInitConfig {
  name: string
  description?: string
  repos: {
    count: number
    items: RepoItem[]
  }
  dimensions: {
    count: number
    items: DimensionItem[]
  }
}

function buildRepoResearchPrompt(studyName: string, description: string, needed: number, existing: RepoItem[]): string {
  const existingList = existing.map(r => `  - ${r.name} (${r.url})`).join("\n")
  return `You are a research assistant helping to find open-source projects for an architecture study.

## Study
**${studyName}**: ${description || "An architecture comparison study"}

## Already Selected Repos
${existingList || "  (none yet)"}

## Task
Find ${needed} additional open-source projects relevant to this study.

For each project, output a JSON object with:
- name: short project name
- url: full GitHub URL
- description: 1-2 sentences explaining why this project is relevant

Write the results as a JSON array to \`.init-cache/research-repos.json\`:
[
  {
    "name": "project-name",
    "url": "https://github.com/user/repo",
    "description": "Why it's relevant"
  }
]

Be specific and thorough. Only recommend real, well-known projects.`
}

function buildDimensionResearchPrompt(studyName: string, description: string, needed: number, existing: DimensionItem[]): string {
  const existingList = existing.map(d => `  - ${d.number}-${d.name}: ${d.title}`).join("\n")
  return `You are a research assistant helping to define architecture analysis dimensions for a study.

## Study
**${studyName}**: ${description || "An architecture comparison study"}

## Already Defined Dimensions
${existingList || "  (none yet)"}

## Task
Define ${needed} additional architecture analysis dimensions.

Each dimension should focus on a specific architectural concern (e.g., error handling, testing, configuration, etc.).

For each dimension, output a JSON object with:
- number: two-digit string (e.g., "05", "06")
- name: kebab-case slug (e.g., "error-handling")
- title: human-readable title (e.g., "Error Handling")
- purpose: 2-3 sentences explaining what this dimension analyzes
- steps: array of 3-5 analysis steps
- evidence: array of 3-5 things to look for in the source code
- questions: array of 3-5 specific questions to answer

Write the results as a JSON array to \`.init-cache/research-dimensions.json\`:
[
  {
    "number": "05",
    "name": "dimension-name",
    "title": "Dimension Title",
    "purpose": "...",
    "steps": ["..."],
    "evidence": ["..."],
    "questions": ["..."]
  }
]

Ensure numbering picks up from the existing dimensions above. Be thorough and specific.`
}

function d(template: TemplateStringsArray, ...values: unknown[]): string {
  let result = ""
  for (let i = 0; i < template.length; i++) {
    result += template[i]
    if (i < values.length) result += String(values[i])
  }
  return result
}

function generateDimensionMarkdown(dim: ResearchDimension | (DimensionItem & { purpose?: string; steps?: string[]; evidence?: string[]; questions?: string[] })): string {
  const purpose = "purpose" in dim && dim.purpose ? dim.purpose : `Analysis of ${dim.title.toLowerCase()} across source projects.`
  const steps = "steps" in dim && dim.steps ? dim.steps : [
    `Read prompts/base.md for execution instructions.`,
    `For the target repo: identify how ${dim.name} is approached.`,
    `Answer the questions below and collect evidence.`,
  ]
  const evidence = "evidence" in dim && dim.evidence ? dim.evidence : [
    `Source files implementing ${dim.name} patterns`,
    `Configuration and type definitions`,
    `Tests encoding expected behavior`,
  ]
  const questions = "questions" in dim && dim.questions ? dim.questions : [
    `How does each source implement ${dim.title.toLowerCase()}?`,
    `What are the key differences between approaches?`,
    `What tradeoffs are visible in each implementation?`,
  ]

  return d`# Dimension: ${dim.title}

## Purpose

${purpose}

## Steps

${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## Evidence

${evidence.map(e => `- ${e}`).join("\n")}

## Questions

${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

## Rating

Assign a score from 1-10 based on the analysis findings.

| Score | Meaning |
| ----- | ------- |
| 1-3 | Poor implementation or absent |
| 4-6 | Basic implementation with gaps |
| 7-8 | Good implementation with minor issues |
| 9-10 | Excellent, exemplar implementation |

## Output

Write findings to \`reports/source/{NN}-{dimension-name}/{source-name}.md\` using \`../../templates/repo-analysis.md\`.
`
}

function readJsonFromCache(relativePath: string): unknown | null {
  const fullPath = join(ULTRAPLAN_ROOT, relativePath)
  try {
    if (existsSync(fullPath)) {
      const raw = readFileSync(fullPath, "utf-8").trim()
      return JSON.parse(raw)
    }
  } catch {
    // corrupted or unparseable
  }
  return null
}

export async function cmdInitialiseStudy(yamlPath: string, opts: {
  name?: string
  repos?: number
  dimensions?: number
  model?: string
  variant?: string
  dryRun?: boolean
  force?: boolean
  noClone?: boolean
  timeoutMs?: number
  outputDir?: string
}) {
  if (!existsSync(yamlPath)) {
    console.error(`\nError: File not found: ${yamlPath}`)
    process.exit(1)
  }

  let config: StudyInitConfig
  try {
    const yamlContent = readFileSync(yamlPath, "utf-8")
    config = yaml.load(yamlContent) as StudyInitConfig
  } catch (err) {
    console.error(`\nError reading YAML file: ${err}`)
    process.exit(1)
  }

  if (opts.name) config.name = opts.name
  if (opts.repos !== undefined) config.repos.count = opts.repos
  if (opts.dimensions !== undefined) config.dimensions.count = opts.dimensions

  for (const dim of config.dimensions.items) {
    dim.number = String(dim.number).padStart(2, "0")
  }

  if (!config.name) {
    console.error("\nError: study name is required (in YAML or via --name)")
    process.exit(1)
  }

  if (config.repos.count < 1) {
    console.error("\nError: at least 1 repo required")
    process.exit(1)
  }

  if (config.dimensions.count < 1) {
    console.error("\nError: at least 1 dimension required")
    process.exit(1)
  }

  const studiesRoot = opts.outputDir ? join(ULTRAPLAN_ROOT, opts.outputDir) : STUDIES_DIR
  const studyDir = join(studiesRoot, config.name)

  if (!opts.force && existsSync(studyDir)) {
    console.error(`\nError: Study "${config.name}" already exists at ${studyDir}`)
    console.error("  Use --force to overwrite existing study directory")
    process.exit(1)
  }

  if (opts.dryRun) {
    console.log(`\n=== DRY RUN: initialise-study ===\n`)
    console.log(`YAML file: ${yamlPath}`)
    console.log(`Study name: ${config.name}`)
    console.log(`Description: ${config.description || "(none)"}`)
    console.log(`Output dir: ${studyDir}`)
    console.log(`Repos:  ${config.repos.items.length} defined, targeting ${config.repos.count}`)
    console.log(`Dims:   ${config.dimensions.items.length} defined, targeting ${config.dimensions.count}`)
    const reposShort = config.repos.count - config.repos.items.length
    const dimsShort = config.dimensions.count - config.dimensions.items.length
    if (reposShort > 0) console.log(`\nWould research ${reposShort} additional repos via OpenCode`)
    if (dimsShort > 0) console.log(`\nWould research ${dimsShort} additional dimensions via OpenCode`)
    console.log("\nWould create:\n")
    console.log(`  ${studyDir}/`)
    console.log(`  ${studyDir}/dimensions/  (${config.dimensions.count} .md files)`)
    console.log(`  ${studyDir}/sources/     (${config.repos.count} repos → git clone --depth 1)`)
    console.log(`  ${studyDir}/reports/source/`)
    console.log(`  ${studyDir}/reports/final/`)
    console.log(`  ${studyDir}/study-init.yml`)
    console.log(`  ${studyDir}/README.md`)
    if (opts.noClone) {
      console.log("\n  (skipping clone: --no-clone)")
    }
    console.log("")
    return
  }

  console.log(`\n▶ Initialising study: ${config.name}`)
  if (config.description) console.log(`  Description: ${config.description}`)

  const CONFIG: Config = loadConfig()

  const reposShort = config.repos.count - config.repos.items.length
  const dimsShort = config.dimensions.count - config.dimensions.items.length

  mkdirSync(join(ULTRAPLAN_ROOT, ".init-cache"), { recursive: true })

  if (reposShort > 0) {
    console.log(`\n▶ Researching ${reposShort} additional repos via OpenCode...\n`)
    const prompt = buildRepoResearchPrompt(config.name, config.description || "", reposShort, config.repos.items)
    const { code } = await runOpenCode(prompt, ULTRAPLAN_ROOT, {
      model: opts.model || CONFIG.defaultModel,
      variant: opts.variant || CONFIG.defaultVariant,
      timeoutMs: opts.timeoutMs || CONFIG.defaultTimeoutMs,
      primaryModel: CONFIG.primaryModel,
      backupModel: CONFIG.backupModel,
    })
    if (code !== 0) {
      console.error(`\n⚠ Research for repos completed with issues (exit ${code}). Continuing with defined repos.`)
    } else {
      const research = readJsonFromCache(".init-cache/research-repos.json")
      if (research && Array.isArray(research) && research.length > 0) {
        const resolved = research as ResearchRepo[]
        for (const r of resolved) {
          if (r.name && r.url && !config.repos.items.some(ex => ex.name === r.name || ex.url === r.url)) {
            config.repos.items.push({ name: r.name, url: r.url, description: r.description })
          }
        }
        console.log(`  ✓ Added ${resolved.length} repos from research`)
      } else {
        console.log("  ⚠ No structured results from research. Continuing with defined repos.")
      }
    }
  }

  if (dimsShort > 0) {
    console.log(`\n▶ Researching ${dimsShort} additional dimensions via OpenCode...\n`)
    const prompt = buildDimensionResearchPrompt(config.name, config.description || "", dimsShort, config.dimensions.items)
    const { code } = await runOpenCode(prompt, ULTRAPLAN_ROOT, {
      model: opts.model || CONFIG.defaultModel,
      variant: opts.variant || CONFIG.defaultVariant,
      timeoutMs: opts.timeoutMs || CONFIG.defaultTimeoutMs,
      primaryModel: CONFIG.primaryModel,
      backupModel: CONFIG.backupModel,
    })
    if (code !== 0) {
      console.error(`\n⚠ Research for dimensions completed with issues (exit ${code}). Continuing with defined dimensions.`)
    } else {
      const research = readJsonFromCache(".init-cache/research-dimensions.json")
      if (research && Array.isArray(research) && research.length > 0) {
        const resolved = research as ResearchDimension[]
        for (const d of resolved) {
          if (d.number && d.name && d.title && !config.dimensions.items.some(ex => ex.number === d.number || ex.name === d.name)) {
            config.dimensions.items.push({ number: d.number, name: d.name, title: d.title, description: d.purpose, purpose: d.purpose, steps: d.steps, evidence: d.evidence, questions: d.questions })
          }
        }
        console.log(`  ✓ Added ${resolved.length} dimensions from research`)
      } else {
        console.log("  ⚠ No structured results from research. Continuing with defined dimensions.")
      }
    }
  }

  if (opts.force && existsSync(studyDir)) {
    console.log(`  ⚠ Removing existing study directory (--force)`)
    execSync(`rm -rf "${studyDir}"`)
  }
  mkdirSync(join(studyDir, "dimensions"), { recursive: true })
  mkdirSync(join(studyDir, "sources"), { recursive: true })
  mkdirSync(join(studyDir, "reports", "source"), { recursive: true })
  mkdirSync(join(studyDir, "reports", "final"), { recursive: true })

  const sortedDims = [...config.dimensions.items].sort((a, b) => String(a.number).localeCompare(String(b.number)))

  for (const dim of sortedDims) {
    const content = generateDimensionMarkdown(dim)
    writeFileSync(join(studyDir, "dimensions", `${dim.number}-${dim.name}.md`), content, "utf-8")
    console.log(`  ✓ Dimension: ${dim.number}-${dim.name}.md`)
  }

  const fullYaml = yaml.dump(config, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  })
  writeFileSync(join(studyDir, "study-init.yml"), fullYaml, "utf-8")
  console.log(`  ✓ study-init.yml written`)

  const repoRows = config.repos.items.map(r =>
    `| ${r.name} | \`${r.url}\` | ${r.description || ""} |`
  ).join("\n")

  const dimRows = sortedDims.map(d =>
    `| ${d.number} | ${d.title} | ${d.description || ""} |`
  ).join("\n")

  const studyReadme = d`# ${config.name}

${config.description || "An architecture comparison study."}

## Repositories Studied

| Name | URL | Description |
|------|-----|-------------|
${repoRows}

## Study Dimensions

| # | Dimension | Description |
|---|-----------|-------------|
${dimRows}

## Usage

\`\`\`bash
# List sources and dimensions
study ${config.name} list

# Run all dimension × source analyses
study ${config.name} run-all --parallel 3

# Stateful batch runner with retry/backoff
study ${config.name} run-loop --batch-size 2

# Show run-loop status
study ${config.name} status
\`\`\`
`

  writeFileSync(join(studyDir, "README.md"), studyReadme, "utf-8")
  console.log(`  ✓ README.md written`)

  if (!opts.noClone) {
    console.log(`\n▶ Cloning repos into sources/...\n`)
    const sourcesDir = join(studyDir, "sources")
    let cloned = 0
    let failed = 0
    for (const repo of config.repos.items) {
      const dest = join(sourcesDir, repo.name)
      if (existsSync(dest)) {
        console.log(`  ○ ${repo.name} already exists, skipping`)
        cloned++
        continue
      }
      try {
        console.log(`  ○ Cloning ${repo.name}...`)
        execSync(`git clone --depth 1 "${repo.url}" "${dest}"`, {
          stdio: "pipe",
          timeout: 120_000,
        })
        console.log(`  ✓ ${repo.name} cloned`)
        cloned++
      } catch (err) {
        console.error(`  ✗ ${repo.name} failed: ${err instanceof Error ? err.message : String(err)}`)
        failed++
      }
    }
    console.log(`\n  Cloned: ${cloned}, failed: ${failed}`)
  }

  console.log(`\n✓ Study "${config.name}" initialised at ${studyDir}`)
  console.log(`  Dimensions: ${config.dimensions.items.length}`)
  console.log(`  Repos:      ${config.repos.items.length}`)
  console.log("")

  if (config.dimensions.items.length < config.dimensions.count) {
    console.log(`  ⚠ Dimensions: ${config.dimensions.items.length} found, target was ${config.dimensions.count}`)
    console.log(`     Edit study-init.yml and re-run or add dimension files manually.`)
  }
  if (config.repos.items.length < config.repos.count) {
    console.log(`  ⚠ Repos: ${config.repos.items.length} found, target was ${config.repos.count}`)
    console.log(`     Edit study-init.yml and re-run or populate sources/ manually.`)
  }

  if (opts.noClone) {
    console.log(`\nNext steps:`)
    console.log(`  1. Populate sources/ with git clones:`)
    console.log(`     git clone <url> ${join(studyDir, "sources")}/<name>`)
    console.log(`  2. Review and edit dimension files in ${join(studyDir, "dimensions")}/`)
    console.log(`  3. Run: study ${config.name} run-all`)
    console.log("")
  } else {
    console.log(`\nNext steps:`)
    console.log(`  1. Review and edit dimension files in ${join(studyDir, "dimensions")}/`)
    console.log(`  2. Run: study ${config.name} run-all`)
    console.log("")
  }
}
